"""SaaS subscription billing, Razorpay self-serve, SMS packs & renewal ops (extracted from server.py)."""
import csv
import hashlib
import hmac
import io
import json
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import razorpay as _razorpay
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from database import db, _raw_db
from security import require_super_admin, require_tenant_admin, current_tenant

router = APIRouter()

# ============== SaaS Subscription Billing (tenant → super-admin) ==============
# Plans: 6-month at ₹12,000 OR 1-year at ₹20,000. Payments recorded manually
# (e.g., from a Paytm UPI transfer) by the super-admin. Each payment generates a
# bill record; daily / monthly revenue can be aggregated by GET /revenue.
PLAN_CATALOG = {
    "half_year": {"label": "6-Month Plan (1 branch)", "price": 12000.0, "duration_days": 183, "branches": 1},
    "annual":    {"label": "Annual Plan (1 branch)",  "price": 20000.0, "duration_days": 365, "branches": 1},
    "two_branch_half":     {"label": "2-Branch 6-Month", "price": 24000.0, "duration_days": 183, "branches": 2},
    "two_branch_annual":   {"label": "2-Branch Annual",  "price": 40000.0, "duration_days": 365, "branches": 2},
    "three_branch_half":   {"label": "3-Branch 6-Month", "price": 36000.0, "duration_days": 183, "branches": 3},
    "three_branch_annual": {"label": "3-Branch Annual",  "price": 60000.0, "duration_days": 365, "branches": 3},
    "multi_branch_half":   {"label": "Multi-Branch 6-Month (5+ branches)", "price": 45000.0, "duration_days": 183, "branches": 5},
    "multi_branch_annual": {"label": "Multi-Branch Annual (5+ branches)",  "price": 70000.0, "duration_days": 365, "branches": 5},
}


class Subscription(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    plan: str  # 'half_year' | 'annual'
    price: float
    start_date: str  # ISO date
    end_date: str    # ISO date
    status: str = "active"  # active | cancelled | expired
    payment_method: Optional[str] = "paytm"
    payment_ref: Optional[str] = None
    notes: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    cancelled_at: Optional[str] = None
    cancelled_reason: Optional[str] = None


class SubscriptionPayment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    subscription_id: str
    tenant_id: str
    amount: float
    paid_at: str  # ISO date
    method: str = "paytm"
    txn_ref: Optional[str] = None
    recorded_by: Optional[str] = None  # super-admin user id
    notes: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class SubscriptionIn(BaseModel):
    tenant_id: str
    plan: str
    branch_tenant_ids: Optional[list] = None  # multi-branch plans: all covered branches
    start_date: Optional[str] = None  # default = today
    payment_method: str = "paytm"
    payment_ref: Optional[str] = None
    amount_paid: Optional[float] = None  # default = plan price
    paid_at: Optional[str] = None  # default = today
    notes: Optional[str] = None


class SubscriptionCancelIn(BaseModel):
    reason: Optional[str] = None


def _plan_or_400(plan: str) -> dict:
    p = PLAN_CATALOG.get(plan)
    if not p:
        raise HTTPException(400, f"Unknown plan '{plan}'. Valid: {list(PLAN_CATALOG)}")
    return p


def _owned_tenant_ids(user: dict) -> set:
    ids = set(user.get("tenant_ids") or [])
    if user.get("tenant_id"):
        ids.add(user["tenant_id"])
    return ids


def _validate_branch_selection(plan_info: dict, branch_ids: list, owned: set) -> list:
    """For multi-branch plans the owner picks WHICH branches the plan covers.
    Returns the validated list of tenant ids the subscription applies to."""
    n = int(plan_info.get("branches") or 1)
    if n <= 1:
        return []
    if not branch_ids:
        raise HTTPException(400, f"'{plan_info['label']}' covers {n} branches — select which branches it applies to.")
    branch_ids = list(dict.fromkeys(branch_ids))
    if n < 5 and len(branch_ids) != n:
        raise HTTPException(400, f"'{plan_info['label']}' requires exactly {n} branches — you selected {len(branch_ids)}.")
    if n >= 5 and len(branch_ids) < n:
        raise HTTPException(400, f"'{plan_info['label']}' requires at least {n} branches — you selected {len(branch_ids)}.")
    not_owned = [b for b in branch_ids if b not in owned]
    if not_owned:
        raise HTTPException(403, "One or more selected branches are not linked to your login.")
    return branch_ids


async def _apply_subscription_to_tenants(tenant_ids: list, plan_key: str, plan_info: dict,
                                         payment_method: str, payment_ref: Optional[str],
                                         notes: Optional[str], start: Optional[datetime] = None) -> list:
    """Create/replace an active subscription on every tenant in the group.
    Per-branch sub price = plan price / branch count (keeps MRR stats correct)."""
    now = start or datetime.now(timezone.utc)
    end_dt = now + timedelta(days=plan_info["duration_days"])
    per_branch_price = round(float(plan_info["price"]) / len(tenant_ids), 2)
    group_id = str(uuid.uuid4()) if len(tenant_ids) > 1 else None
    subs = []
    for tid in tenant_ids:
        await db.subscriptions.update_many(
            {"tenant_id": tid, "status": "active"},
            {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc).isoformat(),
                      "cancelled_reason": "superseded by new subscription"}})
        sub = Subscription(
            tenant_id=tid, plan=plan_key, price=per_branch_price,
            start_date=now.date().isoformat(), end_date=end_dt.date().isoformat(),
            status="active", payment_method=payment_method, payment_ref=payment_ref,
            notes=notes).model_dump()
        if group_id:
            sub["branch_group_id"] = group_id
            sub["branch_group_tenants"] = tenant_ids
        await db.subscriptions.insert_one(sub)
        await db.tenants.update_one(
            {"id": tid},
            {"$set": {"plan": plan_key, "status": "active",
                      "subscription_end_date": sub["end_date"],
                      "current_subscription_id": sub["id"]}})
        sub.pop("_id", None)
        subs.append(sub)
    return subs


@router.get("/public/plans")
async def public_plans():
    """Live plan catalog for the public pricing page — reflects super-admin price edits."""
    return {k: {"label": v["label"], "price": v["price"], "duration_days": v["duration_days"],
                "branches": v["branches"]} for k, v in PLAN_CATALOG.items()}


@router.get("/super-admin/plans")
async def list_plans(user=Depends(require_super_admin)):
    return [{"key": k, **v} for k, v in PLAN_CATALOG.items()]


class PlanUpdateIn(BaseModel):
    price: float
    label: Optional[str] = None
    duration_days: Optional[int] = None
    branches: Optional[int] = None


async def load_plan_overrides():
    """Merge DB price overrides into the in-memory catalog (called at startup)."""
    async for o in _raw_db.plan_overrides.find({}, {"_id": 0}):
        if o.get("key") in PLAN_CATALOG:
            PLAN_CATALOG[o["key"]].update({k: o[k] for k in ("price", "label", "duration_days", "branches") if o.get(k) is not None})


@router.put("/super-admin/plans/{key}")
async def update_plan(key: str, body: PlanUpdateIn, user=Depends(require_super_admin)):
    if key not in PLAN_CATALOG:
        raise HTTPException(404, f"Unknown plan '{key}'")
    if body.price <= 0:
        raise HTTPException(400, "Price must be positive")
    patch = {"price": float(body.price)}
    if body.label:
        patch["label"] = body.label.strip()[:80]
    if body.duration_days:
        patch["duration_days"] = max(1, int(body.duration_days))
    if body.branches:
        patch["branches"] = max(1, int(body.branches))
    PLAN_CATALOG[key].update(patch)
    await _raw_db.plan_overrides.update_one(
        {"key": key}, {"$set": {"key": key, **patch,
                                "updated_by": user.get("email", ""),
                                "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return {"key": key, **PLAN_CATALOG[key]}


@router.get("/super-admin/subscriptions")
async def list_subscriptions(user=Depends(require_super_admin)):
    """List all subscriptions across tenants, latest first, joined with tenant name."""
    subs = await db.subscriptions.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    tids = list({s["tenant_id"] for s in subs})
    tmap = {
        t["id"]: t for t in
        await db.tenants.find({"id": {"$in": tids}}, {"_id": 0, "id": 1, "slug": 1, "name": 1}).to_list(500)
    }
    out = []
    for s in subs:
        s["tenant"] = tmap.get(s["tenant_id"], {"name": "(deleted tenant)", "slug": "—"})
        s["plan_label"] = PLAN_CATALOG.get(s["plan"], {}).get("label", s["plan"])
        out.append(s)
    return out


@router.post("/super-admin/subscriptions")
async def create_subscription(body: SubscriptionIn, user=Depends(require_super_admin)):
    """Create a subscription for a tenant + record the corresponding payment in one shot.
    Multi-branch plans accept branch_tenant_ids and apply the plan to every branch."""
    tenant = await db.tenants.find_one({"id": body.tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    plan_info = _plan_or_400(body.plan)
    today_iso = datetime.now(timezone.utc).date().isoformat()
    start = body.start_date or today_iso
    try:
        start_dt = datetime.fromisoformat(start)
    except Exception as e:
        raise HTTPException(400, "Invalid start_date — use YYYY-MM-DD") from e
    if start_dt.tzinfo is None:
        start_dt = start_dt.replace(tzinfo=timezone.utc)

    target_tids = [body.tenant_id]
    if int(plan_info.get("branches") or 1) > 1:
        picked = list(dict.fromkeys(body.branch_tenant_ids or [body.tenant_id]))
        if body.tenant_id not in picked:
            picked.insert(0, body.tenant_id)
        found = await db.tenants.count_documents({"id": {"$in": picked}})
        if found != len(picked):
            raise HTTPException(404, "One or more selected branch tenants do not exist")
        # Super-admin can group any tenants — skip ownership check, keep count check.
        target_tids = _validate_branch_selection(plan_info, picked, set(picked))

    subs = await _apply_subscription_to_tenants(
        target_tids, body.plan, plan_info,
        payment_method=body.payment_method or "paytm",
        payment_ref=body.payment_ref, notes=body.notes, start=start_dt)
    sub = subs[0]

    pay = SubscriptionPayment(
        subscription_id=sub["id"],
        tenant_id=body.tenant_id,
        amount=body.amount_paid if body.amount_paid is not None else plan_info["price"],
        paid_at=body.paid_at or today_iso,
        method=body.payment_method or "paytm",
        txn_ref=body.payment_ref,
        recorded_by=user["id"],
        notes=body.notes,
    ).model_dump()
    await db.subscription_payments.insert_one(pay)

    pay.pop("_id", None)
    return {"subscription": sub, "subscriptions": subs, "payment": pay, "branches": len(target_tids)}


class SubscriptionExtendIn(BaseModel):
    reason: Optional[str] = None


@router.post("/super-admin/subscriptions/{sid}/extend")
async def extend_subscription(sid: str, body: SubscriptionExtendIn, user=Depends(require_super_admin)):
    """Goodwill extension: add 1 month (30 days) to an active subscription's end date.
    Used when a client is facing financial issues and needs extra time to renew."""
    sub = await db.subscriptions.find_one({"id": sid}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "Subscription not found")
    if sub["status"] != "active":
        raise HTTPException(400, "Only active subscriptions can be extended")
    try:
        new_end = (datetime.fromisoformat(sub["end_date"]) + timedelta(days=30)).date().isoformat()
    except Exception as e:
        raise HTTPException(400, "Subscription has an invalid end date") from e
    ext = {
        "extended_at": datetime.now(timezone.utc).isoformat(),
        "extended_by": user["id"],
        "days": 30,
        "reason": (body.reason or "Goodwill extension — financial hardship").strip(),
        "previous_end_date": sub["end_date"],
        "new_end_date": new_end,
    }
    await db.subscriptions.update_one(
        {"id": sid},
        {"$set": {"end_date": new_end}, "$push": {"extensions": ext}})
    await db.tenants.update_one(
        {"id": sub["tenant_id"], "current_subscription_id": sid},
        {"$set": {"subscription_end_date": new_end}})
    return {"ok": True, "end_date": new_end, "extension": ext}


# ---------------- Razorpay (Tenant self-serve subscription) ----------------
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")


def _rzp_client() -> Optional[_razorpay.Client]:
    if not (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET):
        return None
    return _razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


class RzpOrderIn(BaseModel):
    plan: str  # key from PLAN_CATALOG (e.g. "6_months", "1_year")
    branch_tenant_ids: Optional[list] = None  # multi-branch plans: which branches the plan covers


class RzpVerifyIn(BaseModel):
    plan: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.get("/billing/razorpay/config")
async def rzp_config(user=Depends(require_tenant_admin)):
    """Public-ish config for the frontend checkout — only the key_id is safe to expose."""
    return {
        "enabled": bool(RAZORPAY_KEY_ID),
        "key_id": RAZORPAY_KEY_ID,
        "test_mode": RAZORPAY_KEY_ID.startswith("rzp_test_"),
        "plans": [{"key": k, **v} for k, v in PLAN_CATALOG.items()],
    }


@router.post("/billing/razorpay/order")
async def rzp_create_order(body: RzpOrderIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Create a Razorpay Order for the current tenant's chosen plan.

    Applies any accumulated affiliate_credits as a discount on this renewal.
    """
    rzp = _rzp_client()
    if not rzp:
        raise HTTPException(503, "Razorpay is not configured. Contact support.")
    plan = _plan_or_400(body.plan)

    branch_ids = _validate_branch_selection(plan, body.branch_tenant_ids or [], _owned_tenant_ids(user))
    if branch_ids and t["id"] not in branch_ids:
        raise HTTPException(400, "The salon you're paying from must be one of the selected branches.")

    credits = float(t.get("affiliate_credits") or 0)
    price = float(plan["price"])
    payable = max(price - credits, 1)  # Razorpay min amount is ₹1 (100 paise)
    credits_used = round(price - payable, 2) if credits > 0 else 0.0

    receipt = f"tnt_{t['slug'][:20]}_{int(datetime.now(timezone.utc).timestamp())}"[:40]
    order = rzp.order.create({
        "amount": int(round(payable * 100)),  # paise
        "currency": "INR",
        "receipt": receipt,
        "notes": {
            "tenant_id": t["id"],
            "tenant_slug": t["slug"],
            "plan": body.plan,
            "credits_applied_inr": str(credits_used),
        },
    })
    # Track pending order server-side so we can reconcile on verify
    await db.subscription_payments.insert_one({
        "id": str(uuid.uuid4()),
        "kind": "razorpay_pending",
        "razorpay_order_id": order["id"],
        "tenant_id": t["id"],
        "plan": body.plan,
        "branch_tenant_ids": branch_ids or None,
        "amount": payable,
        "credits_applied": credits_used,
        "status": "created",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {
        "order_id": order["id"],
        "amount": order["amount"],
        "currency": order["currency"],
        "key_id": RAZORPAY_KEY_ID,
        "plan_label": plan["label"],
        "credits_applied": credits_used,
        "payable_inr": payable,
        "full_price_inr": price,
    }


def _verify_rzp_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """HMAC SHA256 of '<order_id>|<payment_id>' with key_secret."""
    body = f"{order_id}|{payment_id}".encode()
    expected = hmac.new(RAZORPAY_KEY_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


# ---------------- SMS Point Packs (self-serve Razorpay top-up) ----------------
SMS_PACKS = {
    "pack_199": {"price": 199, "points": 250, "label": "Starter"},
    "pack_499": {"price": 499, "points": 700, "label": "Growth"},
    "pack_999": {"price": 999, "points": 1500, "label": "Pro"},
}


class SmsPackOrderIn(BaseModel):
    pack: str


class SmsPackVerifyIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.get("/sms-packs")
async def sms_packs(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return {"enabled": bool(RAZORPAY_KEY_ID), "test_mode": RAZORPAY_KEY_ID.startswith("rzp_test_"),
            "packs": [{"key": k, **v} for k, v in SMS_PACKS.items()],
            "balance": int(t.get("sms_points") or 0)}


@router.post("/sms-packs/order")
async def sms_pack_order(body: SmsPackOrderIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    rzp = _rzp_client()
    if not rzp:
        raise HTTPException(503, "Razorpay is not configured. Ask HQ to credit SMS points manually.")
    pack = SMS_PACKS.get(body.pack)
    if not pack:
        raise HTTPException(400, "Unknown pack")
    receipt = f"sms_{t['slug'][:18]}_{int(datetime.now(timezone.utc).timestamp())}"[:40]
    order = rzp.order.create({
        "amount": int(pack["price"]) * 100, "currency": "INR", "receipt": receipt,
        "notes": {"kind": "sms_pack", "tenant_id": t["id"], "pack": body.pack}})
    await db.sms_pack_payments.insert_one({
        "id": str(uuid.uuid4()), "kind": "sms_pack_pending", "razorpay_order_id": order["id"],
        "tenant_id": t["id"], "pack": body.pack, "points": pack["points"], "amount": pack["price"],
        "status": "created", "created_at": datetime.now(timezone.utc).isoformat()})
    return {"order_id": order["id"], "amount": order["amount"], "currency": order["currency"],
            "key_id": RAZORPAY_KEY_ID, "pack_label": f"{pack['points']} SMS points",
            "points": pack["points"]}


@router.post("/sms-packs/verify")
async def sms_pack_verify(body: SmsPackVerifyIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Signature-verified; points/price always come from the server-recorded pending order."""
    if not (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET):
        raise HTTPException(503, "Razorpay is not configured.")
    if not _verify_rzp_signature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature):
        raise HTTPException(400, "Payment signature verification failed — possible tampering.")
    now = datetime.now(timezone.utc)
    pending = await db.sms_pack_payments.find_one_and_update(
        {"razorpay_order_id": body.razorpay_order_id, "kind": "sms_pack_pending",
         "status": "created", "tenant_id": t["id"]},
        {"$set": {"status": "captured", "razorpay_payment_id": body.razorpay_payment_id,
                  "captured_at": now.isoformat()}},
        return_document=True)
    if not pending:
        raise HTTPException(400, "Unknown, already-consumed, or foreign order — please retry.")
    pts = int(pending["points"])
    await db.tenants.update_one({"id": t["id"]}, {"$inc": {"sms_points": pts}})
    await _raw_db.sms_credit_log.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": t["id"], "points": pts, "source": "razorpay",
        "payment_ref": body.razorpay_payment_id, "amount": pending["amount"],
        "credited_by": user.get("email"), "at": now.isoformat()})
    fresh = await db.tenants.find_one({"id": t["id"]}, {"_id": 0, "sms_points": 1})
    return {"ok": True, "points_added": pts,
            "sms_points": int((fresh or {}).get("sms_points") or 0)}


@router.post("/billing/razorpay/verify")
async def rzp_verify(body: RzpVerifyIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Verify the checkout signature and create/extend the tenant's subscription.

    SECURITY: the plan/price/duration are ALWAYS read from the server-recorded pending order,
    never from the client body — otherwise an attacker could pay for the cheap plan and
    claim the premium plan by tampering with the payload.
    """
    if not (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET):
        raise HTTPException(503, "Razorpay is not configured.")
    if not _verify_rzp_signature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature):
        raise HTTPException(400, "Payment signature verification failed — possible tampering.")

    # Atomically claim the pending record — prevents replay/re-use of the same order.
    now = datetime.now(timezone.utc)
    pending_doc = await db.subscription_payments.find_one_and_update(
        {
            "razorpay_order_id": body.razorpay_order_id,
            "kind": "razorpay_pending",
            "status": "created",  # only claim if not yet captured
            "tenant_id": t["id"],  # must belong to the same tenant
        },
        {"$set": {
            "status": "captured",
            "razorpay_payment_id": body.razorpay_payment_id,
            "captured_at": now.isoformat(),
        }},
        return_document=True,
    )
    if not pending_doc:
        raise HTTPException(400, "Unknown, already-consumed, or foreign order — please retry from scratch.")

    # Use the SERVER-recorded plan, never the client's — SEC-002 fix.
    server_plan = pending_doc["plan"]
    plan_info = _plan_or_400(server_plan)
    today_iso = now.date().isoformat()

    # Multi-branch plans: apply to every branch the owner picked at checkout.
    target_tids = pending_doc.get("branch_tenant_ids") or [t["id"]]
    subs = await _apply_subscription_to_tenants(
        target_tids, server_plan, plan_info,
        payment_method="razorpay", payment_ref=body.razorpay_payment_id,
        notes=f"Razorpay order {body.razorpay_order_id}; credits applied ₹{pending_doc.get('credits_applied',0)}",
        start=now)
    sub = next((s for s in subs if s["tenant_id"] == t["id"]), subs[0])

    pay = SubscriptionPayment(
        subscription_id=sub["id"],
        tenant_id=t["id"],
        amount=float(pending_doc["amount"]),
        paid_at=today_iso,
        method="razorpay",
        txn_ref=body.razorpay_payment_id,
        recorded_by=user["id"],
        notes=f"Order {body.razorpay_order_id}",
    ).model_dump()
    await db.subscription_payments.insert_one(pay)

    if pending_doc.get("credits_applied", 0) > 0:
        await db.tenants.update_one(
            {"id": t["id"]},
            {"$inc": {"affiliate_credits": -float(pending_doc["credits_applied"])}},
        )

    # Anti-farming: release any PENDING affiliate reward now that this salon paid.
    pending_ref = await db.affiliate_referrals.find_one({"referred_tenant_id": t["id"], "status": "pending"})
    if pending_ref:
        await db.tenants.update_one(
            {"id": pending_ref["referrer_tenant_id"]},
            {"$inc": {"affiliate_credits": float(pending_ref["credit_amount"])}},
        )
        await db.affiliate_referrals.update_one(
            {"id": pending_ref["id"]},
            {"$set": {"status": "credited", "credited_at": today_iso}},
        )

    return {"ok": True, "subscription_id": sub["id"], "end_date": sub["end_date"],
            "plan": server_plan, "branches": len(target_tids)}


async def _wh_payment_failed(order_id: str, payment: dict, logger) -> None:
    await db.subscription_payments.update_one(
        {"razorpay_order_id": order_id},
        {"$set": {"status": "failed", "failed_at": datetime.now(timezone.utc).isoformat(),
                  "failure_reason": payment.get("error_description", "")}},
    )
    logger.warning("Payment failed for order %s: %s", order_id, payment.get("error_description"))


async def _wh_refund(order_id: str, refund: dict, logger) -> None:
    pay = await db.subscription_payments.find_one({"razorpay_order_id": order_id})
    if not pay:
        return
    await db.subscription_payments.update_one(
        {"razorpay_order_id": order_id},
        {"$set": {"status": "refunded", "refunded_at": datetime.now(timezone.utc).isoformat(),
                  "refund_amount_inr": (refund.get("amount") or 0) / 100.0}},
    )
    # Revoke the tenant's active plan so they can't keep using paid features on a refunded sub.
    tenant_id = pay.get("tenant_id")
    if tenant_id:
        await _raw_db.tenants.update_one(
            {"id": tenant_id},
            {"$set": {"status": "trial", "subscription_end_date": None}},
        )
        logger.warning("Refunded subscription for tenant %s (order %s)", tenant_id, order_id)


def _wh_parse_verified_event(payload: bytes, sig: str) -> dict:
    expected = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(400, "Invalid webhook signature")
    try:
        return json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON payload") from None


@router.post("/billing/razorpay/webhook")
async def rzp_webhook(request: Request):
    """Razorpay-initiated status callbacks. Verifies the HMAC-SHA256 signature
    against RAZORPAY_WEBHOOK_SECRET, then reacts to key events.

    Events handled:
      - payment.failed  → mark matching subscription_payment as `failed`
      - refund.created / refund.processed → mark subscription as `refunded`
                          and revoke the tenant's active plan
      - order.paid, payment.captured → info-only (main verify endpoint already
                          records these when the user completes the checkout flow)

    All events are archived to the `razorpay_webhook_events` collection so
    finance/audit can replay them later.
    """
    if not RAZORPAY_WEBHOOK_SECRET:
        # SEC-003: refunds/failed payments will NOT auto-reconcile until the secret is set.
        logging.getLogger("razorpay").warning(
            "Webhook received but RAZORPAY_WEBHOOK_SECRET is not configured — event skipped. "
            "Set the secret (see test_credentials.md guide) so refunds revoke plans automatically.")
        return {"skipped": True}
    event = _wh_parse_verified_event(await request.body(), request.headers.get("x-razorpay-signature", ""))

    event_type = event.get("event", "unknown")
    logger = logging.getLogger("razorpay")
    logger.info("Razorpay webhook: %s", event_type)

    # Archive every event — handy for finance reconciliation and dispute defence.
    await _raw_db.razorpay_webhook_events.insert_one({
        "id": str(uuid.uuid4()),
        "event_type": event_type,
        "payload": event,
        "received_at": datetime.now(timezone.utc).isoformat(),
    })

    payment = (event.get("payload") or {}).get("payment", {}).get("entity", {})
    refund = (event.get("payload") or {}).get("refund", {}).get("entity", {})
    order_id = payment.get("order_id") or refund.get("order_id")

    if event_type == "payment.failed" and order_id:
        await _wh_payment_failed(order_id, payment, logger)
    elif event_type in ("refund.created", "refund.processed") and order_id:
        await _wh_refund(order_id, refund, logger)

    return {"ok": True, "event": event_type}


# ---------------- Renewal reminders ----------------

def _days_until(end_date_str: Optional[str]) -> Optional[int]:
    """Positive if end_date is in the future, 0 = today, negative if past. None if unknown."""
    if not end_date_str:
        return None
    try:
        # Accept both YYYY-MM-DD and ISO 8601
        end = datetime.fromisoformat(end_date_str.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            end = datetime.strptime(end_date_str, "%Y-%m-%d").date()
        except ValueError:
            return None
    return (end - datetime.now(timezone.utc).date()).days


@router.get("/billing/subscription-status")
async def subscription_status(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Tenant-facing: 'how many days do I have left?' — powers the in-app renewal banner."""
    sub_end = t.get("subscription_end_date")
    trial_end = t.get("trial_end_date") or t.get("trial_ends_at")
    if sub_end:
        days = _days_until(sub_end)
        source = "subscription"
        end_date = sub_end
    else:
        days = _days_until(trial_end)
        source = "trial"
        end_date = trial_end
    needs_prompt = days is not None and days <= 7  # window that shows the banner (incl. expired)
    return {
        "source": source,
        "end_date": end_date,
        "days_remaining": days,
        "status": t.get("status", "trial"),
        "current_plan": t.get("plan"),
        "affiliate_credits": float(t.get("affiliate_credits") or 0),
        "needs_renewal_prompt": needs_prompt,
    }


@router.get("/super-admin/renewals/queue")
async def renewal_queue(user=Depends(require_super_admin), window_days: int = 10):
    """Tenants whose subscription (or trial) ends within `window_days`. Sorted by soonest first."""
    tenants = await db.tenants.find({}, {"_id": 0}).to_list(5000)
    out = []
    for t in tenants:
        end = t.get("subscription_end_date") or t.get("trial_end_date") or t.get("trial_ends_at")
        days = _days_until(end)
        if days is None or days > window_days:
            continue
        # Skip tenants already cancelled long ago
        if t.get("status") == "cancelled" and (days < -30):
            continue
        out.append({
            "id": t["id"],
            "slug": t["slug"],
            "name": t.get("name"),
            "owner_email": t.get("owner_email"),
            "phone": t.get("phone") or "",
            "whatsapp_number": t.get("whatsapp_number") or "",
            "plan": t.get("plan"),
            "status": t.get("status"),
            "end_date": end,
            "days_remaining": days,
            "source": "subscription" if t.get("subscription_end_date") else "trial",
            "affiliate_credits": float(t.get("affiliate_credits") or 0),
            "last_reminder_at": t.get("last_renewal_reminder_at"),
            "reminder_count": int(t.get("renewal_reminder_count") or 0),
        })
    out.sort(key=lambda x: (x["days_remaining"] if x["days_remaining"] is not None else 9999))
    return {"count": len(out), "items": out, "window_days": window_days}


@router.post("/super-admin/renewals/{tid}/mark-reminded")
async def mark_renewal_reminded(tid: str, user=Depends(require_super_admin)):
    """Flag that you tapped WhatsApp for this tenant — increments counter + timestamp."""
    now = datetime.now(timezone.utc).isoformat()
    res = await db.tenants.update_one(
        {"id": tid},
        {"$set": {"last_renewal_reminder_at": now},
         "$inc": {"renewal_reminder_count": 1}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Tenant not found")
    return {"ok": True, "reminded_at": now}


# ---------------- Automated renewal reminders (15 / 7 / 1 days before expiry) ----------------
RENEWAL_REMINDER_DAYS = (15, 7, 1)


def _renewal_wa_link(t: dict, days: int, end_date: str, source: str) -> Optional[str]:
    num = "".join(ch for ch in (t.get("whatsapp_number") or t.get("phone") or "") if ch.isdigit())
    if not num:
        return None
    line = "*ends tomorrow*" if days == 1 else f"ends in *{days} days*"
    from urllib.parse import quote
    text = (f"Hi {t.get('name', '')} ✦ A friendly reminder from Miracurl — your {source} {line} ({end_date}). "
            f"Renew directly inside your dashboard → Settings → Subscription → Pay via Razorpay (UPI/card). "
            f"Reply here if you need any help. — Team Miracurl")
    return f"https://wa.me/{num}?text={quote(text)}"


async def run_renewal_reminders() -> dict:
    """Auto-email every tenant whose subscription/trial ends in exactly 15, 7 or 1 days.
    Idempotent per (tenant, end_date, days_mark). Also prepares a WhatsApp deep link
    per reminder for the Super Admin queue. Used by the daily scheduler AND 'Run now'."""
    from email_service import _send_email, renewal_reminder_email_html
    now_iso = datetime.now(timezone.utc).isoformat()
    tenants = await db.tenants.find({"status": {"$ne": "cancelled"}}, {"_id": 0}).to_list(5000)
    checked, sent, skipped, failed = 0, 0, 0, 0
    items = []
    for t in tenants:
        end = t.get("subscription_end_date") or t.get("trial_end_date") or t.get("trial_ends_at")
        days = _days_until(end)
        if days not in RENEWAL_REMINDER_DAYS:
            continue
        checked += 1
        end_str = str(end)[:10]
        already = await _raw_db.renewal_reminder_log.find_one(
            {"tenant_id": t["id"], "end_date": end_str, "days_mark": days})
        if already:
            skipped += 1
            continue
        source = "subscription" if t.get("subscription_end_date") else "trial"
        plan_info = PLAN_CATALOG.get(t.get("plan") or "", {})
        email_status = {"sent": False, "error": "no owner_email on tenant"}
        if t.get("owner_email"):
            email_status = await _send_email(
                [t["owner_email"]],
                f"⏳ Your Miracurl {source} ends in {days} day{'s' if days != 1 else ''} — renew in 2 minutes",
                renewal_reminder_email_html(
                    t.get("name") or t["slug"], days, end_str,
                    plan_info.get("label") or (t.get("plan") or "Trial"),
                    float(plan_info.get("price") or 0),
                    float(t.get("affiliate_credits") or 0)))
        log = {
            "id": str(uuid.uuid4()), "tenant_id": t["id"], "slug": t["slug"],
            "tenant_name": t.get("name"), "days_mark": days, "end_date": end_str,
            "source": source, "email_to": t.get("owner_email"),
            "email_sent": bool(email_status.get("sent")),
            "email_error": email_status.get("error"),
            "wa_link": _renewal_wa_link(t, days, end_str, source),
            "at": now_iso,
        }
        await _raw_db.renewal_reminder_log.insert_one(log)
        log.pop("_id", None)
        items.append(log)
        sent += 1 if log["email_sent"] else 0
        failed += 0 if log["email_sent"] else 1
    return {"checked": checked, "sent": sent, "skipped": skipped, "failed": failed, "items": items}


@router.post("/super-admin/renewals/run-auto-reminders")
async def run_auto_reminders_now(user=Depends(require_super_admin)):
    """Manually trigger the 15/7/1-day reminder sweep (same logic as the daily scheduler)."""
    return await run_renewal_reminders()


@router.get("/super-admin/renewals/reminder-log")
async def renewal_reminder_log(user=Depends(require_super_admin)):
    rows = await _raw_db.renewal_reminder_log.find({}, {"_id": 0}).sort("at", -1).to_list(100)
    return {"items": rows}


@router.post("/super-admin/subscriptions/{sid}/cancel")
async def cancel_subscription(sid: str, body: SubscriptionCancelIn, user=Depends(require_super_admin)):
    sub = await db.subscriptions.find_one({"id": sid}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "Subscription not found")
    if sub["status"] != "active":
        raise HTTPException(400, f"Subscription is already {sub['status']}")
    await db.subscriptions.update_one(
        {"id": sid},
        {"$set": {"status": "cancelled",
                  "cancelled_at": datetime.now(timezone.utc).isoformat(),
                  "cancelled_reason": body.reason}},
    )
    # Mark the tenant as cancelled too (matches the existing soft-delete flow)
    await db.tenants.update_one(
        {"id": sub["tenant_id"]},
        {"$set": {"status": "cancelled"}},
    )
    return {"ok": True}


def _revenue_totals(pays: list, now: datetime) -> dict:
    today_iso = now.date().isoformat()
    month_prefix = now.strftime("%Y-%m")
    return {
        "today": round(sum(p["amount"] for p in pays if (p.get("paid_at") or "").startswith(today_iso)), 2),
        "this_month": round(sum(p["amount"] for p in pays if (p.get("paid_at") or "").startswith(month_prefix)), 2),
        "all_time": round(sum(p["amount"] for p in pays), 2),
    }


def _revenue_trend_30d(pays: list, now: datetime) -> list:
    by_day = {(now - timedelta(days=offset)).date().isoformat(): 0.0 for offset in range(29, -1, -1)}
    for p in pays:
        d = (p.get("paid_at") or "")[:10]
        if d in by_day:
            by_day[d] += p["amount"]
    return [{"date": d, "amount": round(v, 2)} for d, v in by_day.items()]


def _mrr_and_plan_distribution(subs: list) -> tuple[float, list]:
    plan_counts: dict = {}
    mrr = 0.0
    for s in subs:
        plan_counts[s["plan"]] = plan_counts.get(s["plan"], 0) + 1
        # Normalise each active plan into a monthly-recurring number
        plan_days = PLAN_CATALOG.get(s["plan"], {}).get("duration_days", 30) or 30
        plan_price = float(s.get("price") or PLAN_CATALOG.get(s["plan"], {}).get("price") or 0)
        mrr += plan_price * (30.0 / plan_days)
    plan_dist = [{"plan": k, "label": PLAN_CATALOG.get(k, {}).get("label", k), "count": v}
                 for k, v in plan_counts.items()]
    return mrr, plan_dist


async def _churn_30d(now: datetime, active_count: int) -> tuple[int, float]:
    win_start = (now - timedelta(days=30)).isoformat()
    cancelled = await db.subscriptions.count_documents(
        {"status": "cancelled", "cancelled_at": {"$gte": win_start}})
    denom = active_count + cancelled
    return cancelled, (round(100.0 * cancelled / denom, 2) if denom else 0.0)


async def _avg_subscription_lifetime() -> Optional[float]:
    cancelled_all = await db.subscriptions.find(
        {"status": "cancelled", "cancelled_at": {"$exists": True}, "start_date": {"$exists": True}},
        {"_id": 0, "start_date": 1, "cancelled_at": 1},
    ).to_list(2000)
    lifetimes: list = []
    for c in cancelled_all:
        try:
            sd = datetime.fromisoformat(c["start_date"]).date()
            cd = datetime.fromisoformat(c["cancelled_at"].replace("Z", "+00:00")).date()
            lifetimes.append((cd - sd).days)
        except (ValueError, TypeError, KeyError):
            continue
    return round(sum(lifetimes) / len(lifetimes), 1) if lifetimes else None


async def _top_revenue_tenants(pays: list, limit: int = 5) -> list:
    tenant_totals: dict = {}
    for p in pays:
        tid = p.get("tenant_id")
        if tid:
            tenant_totals[tid] = tenant_totals.get(tid, 0.0) + float(p["amount"])
    top_ids = sorted(tenant_totals, key=tenant_totals.get, reverse=True)[:limit]
    lookup = {t["id"]: t for t in await db.tenants.find(
        {"id": {"$in": top_ids}}, {"_id": 0, "id": 1, "slug": 1, "name": 1}
    ).to_list(len(top_ids) or 1)}
    return [{
        "tenant_id": tid,
        "slug": lookup.get(tid, {}).get("slug", "—"),
        "name": lookup.get(tid, {}).get("name", "—"),
        "total_paid": round(tenant_totals[tid], 2),
    } for tid in top_ids]


@router.get("/super-admin/subscriptions/revenue")
async def subscription_revenue(user=Depends(require_super_admin)):
    """Returns SaaS revenue stats: today, this month, last 30 days trend, plan distribution,
    MRR / ARR, churn, average subscription length, top 5 revenue tenants.
    """
    now = datetime.now(timezone.utc)
    pays = await db.subscription_payments.find(
        {"$or": [{"kind": {"$exists": False}}, {"kind": {"$ne": "razorpay_pending"}}]},
        {"_id": 0},
    ).to_list(5000)
    subs = await db.subscriptions.find({"status": "active"}, {"_id": 0}).to_list(2000)
    mrr, plan_dist = _mrr_and_plan_distribution(subs)
    cancelled_30d, churn_rate = await _churn_30d(now, len(subs))
    return {
        **_revenue_totals(pays, now),
        "active_subscriptions": len(subs),
        "cancelled_30d": cancelled_30d,
        "churn_pct": churn_rate,
        "mrr": round(mrr, 2),
        "arr": round(mrr * 12.0, 2),
        "avg_lifetime_days": await _avg_subscription_lifetime(),
        "trend_30d": _revenue_trend_30d(pays, now),
        "plan_distribution": plan_dist,
        "top_tenants": await _top_revenue_tenants(pays),
    }


@router.get("/super-admin/subscriptions/export.csv")
async def export_subscription_payments_csv(user=Depends(require_super_admin)):
    """Download every payment as CSV — useful for accounting/investor sharing."""
    pays = await db.subscription_payments.find(
        {"$or": [{"kind": {"$exists": False}}, {"kind": {"$ne": "razorpay_pending"}}]},
        {"_id": 0},
    ).sort("paid_at", -1).to_list(20000)
    tids = list({p.get("tenant_id") for p in pays if p.get("tenant_id")})
    t_map = {t["id"]: t for t in await db.tenants.find(
        {"id": {"$in": tids}}, {"_id": 0, "id": 1, "slug": 1, "name": 1, "owner_email": 1}
    ).to_list(len(tids) or 1)}
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["paid_at", "tenant_slug", "tenant_name", "owner_email",
                "amount_inr", "method", "txn_ref", "subscription_id", "notes"])
    for p in pays:
        t = t_map.get(p.get("tenant_id"), {})
        w.writerow([
            p.get("paid_at", ""),
            t.get("slug", ""),
            t.get("name", ""),
            t.get("owner_email", ""),
            f"{float(p.get('amount') or 0):.2f}",
            p.get("method", ""),
            p.get("txn_ref", ""),
            p.get("subscription_id", ""),
            (p.get("notes") or "").replace("\n", " "),
        ])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="miracurl-revenue-{datetime.now(timezone.utc).date().isoformat()}.csv"'},
    )


@router.get("/super-admin/tenants/{tid}/billing")
async def tenant_billing_history(tid: str, user=Depends(require_super_admin)):
    """Subscription history + payment log for a single tenant."""
    subs = await db.subscriptions.find({"tenant_id": tid}, {"_id": 0}).sort("created_at", -1).to_list(50)
    pays = await db.subscription_payments.find({"tenant_id": tid}, {"_id": 0}).sort("paid_at", -1).to_list(200)
    for s in subs:
        s["plan_label"] = PLAN_CATALOG.get(s["plan"], {}).get("label", s["plan"])
    return {"subscriptions": subs, "payments": pays}


class SmsPointsIn(BaseModel):
    points: int = Field(..., ge=1, le=100000)


@router.post("/super-admin/tenants/{tid}/sms-points")
async def credit_sms_points(tid: str, body: SmsPointsIn, user=Depends(require_super_admin)):
    """Super-admin credits SMS points to a tenant (1 point = 1 billing SMS)."""
    t = await db.tenants.find_one({"id": tid}, {"_id": 0, "id": 1})
    if not t:
        raise HTTPException(404, "Tenant not found")
    await db.tenants.update_one({"id": tid}, {"$inc": {"sms_points": int(body.points)}})
    await _raw_db.sms_credit_log.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": tid, "points": int(body.points), "source": "manual",
        "credited_by": user.get("email"), "at": datetime.now(timezone.utc).isoformat()})
    fresh = await db.tenants.find_one({"id": tid}, {"_id": 0, "sms_points": 1})
    return {"ok": True, "sms_points": int((fresh or {}).get("sms_points") or 0)}


@router.get("/super-admin/sms-credits")
async def sms_credit_history(user=Depends(require_super_admin)):
    """Every SMS point credit — manual (HQ) and razorpay (tenant self-purchase)."""
    rows = await _raw_db.sms_credit_log.find({}, {"_id": 0}).sort("at", -1).to_list(100)
    tids = list({r.get("tenant_id") for r in rows if r.get("tenant_id")})
    ts = await db.tenants.find({"id": {"$in": tids}}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    names = {t["id"]: t["name"] for t in ts}
    for r in rows:
        r["tenant_name"] = names.get(r.get("tenant_id"), "—")
    return rows
