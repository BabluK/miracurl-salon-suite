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

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from pymongo import ReturnDocument

from database import db, _raw_db
from security import require_super_admin, require_tenant_admin, current_tenant
from services.subscription_invoice import issue_subscription_kit
from services.billing import (
    RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, _rzp_client)
from services.orders import send_order_status_email

router = APIRouter()

# ============== SaaS Subscription Billing (tenant → super-admin) ==============
# Plans: 6-month at ₹12,000 OR 1-year at ₹20,000. Payments recorded manually
# (e.g., from a Paytm UPI transfer) by the super-admin. Each payment generates a
# bill record; daily / monthly revenue can be aggregated by GET /revenue.
from services.plans import PLAN_CATALOG  # noqa: E402,F401 — canonical home is services/plans.py


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


async def _fresh_plan_or_400(plan: str) -> dict:
    """Same as _plan_or_400 but merges DB price overrides first (multi-worker safe)."""
    await load_plan_overrides()
    return _plan_or_400(plan)


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


DEFAULT_TRIAL_DAYS = 30


async def get_trial_days() -> int:
    """Free-trial length (days) — super-admin configurable in Plan Catalog, default 30."""
    doc = await _raw_db.platform_settings.find_one({"key": "trial_days"}, {"_id": 0, "value": 1})
    try:
        return max(1, min(120, int(doc["value"]))) if doc else DEFAULT_TRIAL_DAYS
    except (KeyError, ValueError, TypeError):
        return DEFAULT_TRIAL_DAYS


class TrialDaysIn(BaseModel):
    days: int = Field(..., ge=1, le=120)


@router.put("/super-admin/trial-days")
async def set_trial_days(body: TrialDaysIn, user=Depends(require_super_admin)):
    await _raw_db.platform_settings.update_one(
        {"key": "trial_days"}, {"$set": {"value": int(body.days)}}, upsert=True)
    return {"ok": True, "trial_days": int(body.days)}


@router.get("/public/plans")
async def public_plans():
    """Live plan catalog for the public pricing page — reflects super-admin price edits.
    Overrides re-read from DB on every call so edits show instantly on ALL workers."""
    await load_plan_overrides()
    out = {k: {"label": v["label"], "price": v["price"], "duration_days": v["duration_days"],
               "branches": v["branches"], "currency": v.get("currency", "INR"),
               "tier": v.get("tier"), "vertical": v.get("vertical", "salon")} for k, v in PLAN_CATALOG.items()}
    out["trial_days"] = await get_trial_days()
    return out


@router.get("/super-admin/plans")
async def list_plans(user=Depends(require_super_admin)):
    await load_plan_overrides()
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
        s["plan_label"] = PLAN_CATALOG.get(s.get("plan"), {}).get("label", s.get("plan") or "—")
        out.append(s)
    return out


@router.post("/super-admin/subscriptions")
async def create_subscription(body: SubscriptionIn, user=Depends(require_super_admin)):
    """Create a subscription for a tenant + record the corresponding payment in one shot.
    Multi-branch plans accept branch_tenant_ids and apply the plan to every branch."""
    tenant = await db.tenants.find_one({"id": body.tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    plan_info = await _fresh_plan_or_400(body.plan)
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
    await _record_partner_commission(tenant, pay)
    pay.pop("_id", None)
    inv = await issue_subscription_kit(pay, sub, branches=len(target_tids))

    return {"subscription": sub, "subscriptions": subs, "payment": pay, "branches": len(target_tids),
            "invoice": {"number": inv["number"], "email": inv.get("email")} if inv else None}


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
# Keys + client live in services.billing (shared module — breaks the route-level import cycle).


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
    await load_plan_overrides()  # always reflect super-admin Plan Catalog edits (same as /public/plans)
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
    plan = await _fresh_plan_or_400(body.plan)

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


async def _grant_referral_free_month(referrer_tid: str) -> str:
    """Referral reward = 1 FREE MONTH: extend the referrer's active subscription by 30 days,
    or bank it to auto-apply on their next subscription purchase."""
    active = await db.subscriptions.find_one(
        {"tenant_id": referrer_tid, "status": "active"}, {"_id": 0, "id": 1, "end_date": 1})
    if active:
        new_end = (datetime.fromisoformat(active["end_date"]) + timedelta(days=30)).date().isoformat()
        await db.subscriptions.update_one({"id": active["id"]}, {"$set": {"end_date": new_end}})
        await db.tenants.update_one({"id": referrer_tid}, {"$set": {"subscription_end_date": new_end}})
        return f"subscription extended by 30 days to {new_end}"
    await db.tenants.update_one({"id": referrer_tid}, {"$inc": {"referral_free_months": 1}})
    return "free month banked — auto-applies on the next subscription purchase"


async def _activate_pending_order(pending_doc: dict, payment_id: str, t: dict, recorded_by: str, now: datetime):
    """Activate the plan for an atomically-claimed `razorpay_pending` order (shared by /verify and the webhook)."""
    # Use the SERVER-recorded plan, never the client's — SEC-002 fix.
    server_plan = pending_doc["plan"]
    plan_info = await _fresh_plan_or_400(server_plan)
    today_iso = now.date().isoformat()

    # Multi-branch plans: apply to every branch the owner picked at checkout.
    target_tids = pending_doc.get("branch_tenant_ids") or [t["id"]]
    subs = await _apply_subscription_to_tenants(
        target_tids, server_plan, plan_info,
        payment_method="razorpay", payment_ref=payment_id,
        notes=f"Razorpay order {pending_doc['razorpay_order_id']}; credits applied ₹{pending_doc.get('credits_applied',0)}",
        start=now)
    sub = next((s for s in subs if s["tenant_id"] == t["id"]), subs[0])

    # Apply any banked referral free months the buyer earned earlier.
    banked = int(t.get("referral_free_months") or 0)
    if banked > 0:
        bonus = timedelta(days=30 * banked)
        for s2 in subs:
            new_end2 = (datetime.fromisoformat(s2["end_date"]) + bonus).date().isoformat()
            await db.subscriptions.update_one(
                {"id": s2["id"]}, {"$set": {"end_date": new_end2, "referral_bonus_days": 30 * banked}})
            await db.tenants.update_one({"id": s2["tenant_id"]}, {"$set": {"subscription_end_date": new_end2}})
            s2["end_date"] = new_end2
        await db.tenants.update_one({"id": t["id"]}, {"$set": {"referral_free_months": 0}})

    pay = SubscriptionPayment(
        subscription_id=sub["id"],
        tenant_id=t["id"],
        amount=float(pending_doc["amount"]),
        paid_at=today_iso,
        method="razorpay",
        txn_ref=payment_id,
        recorded_by=recorded_by,
        notes=f"Order {pending_doc['razorpay_order_id']}",
    ).model_dump()
    await db.subscription_payments.insert_one(pay)
    await _record_partner_commission(t, pay)
    pay.pop("_id", None)
    await issue_subscription_kit(pay, sub, credits_applied=float(pending_doc.get("credits_applied") or 0),
                                 branches=len(target_tids))

    if pending_doc.get("credits_applied", 0) > 0:
        await db.tenants.update_one(
            {"id": t["id"]},
            {"$inc": {"affiliate_credits": -float(pending_doc["credits_applied"])}},
        )

    # Anti-farming: release the referral reward (1 FREE MONTH) now that this salon paid.
    pending_ref = await db.affiliate_referrals.find_one({"referred_tenant_id": t["id"], "status": "pending"})
    if pending_ref:
        reward_note = await _grant_referral_free_month(pending_ref["referrer_tenant_id"])
        await db.affiliate_referrals.update_one(
            {"id": pending_ref["id"]},
            {"$set": {"status": "credited", "credited_at": today_iso,
                      "reward": "free_month", "reward_note": reward_note}},
        )

    from services.tenant_notices import notify_tenant
    await notify_tenant(t["id"], "payment", f"✅ Plan activated — {PLAN_CATALOG.get(server_plan, {}).get('label', server_plan)}",
                        f"Access until {sub['end_date']} · invoice & receipt emailed to you", "/settings")
    return sub, server_plan, target_tids


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

    sub, server_plan, target_tids = await _activate_pending_order(pending_doc, body.razorpay_payment_id, t, user["id"], now)
    return {"ok": True, "subscription_id": sub["id"], "end_date": sub["end_date"],
            "plan": server_plan, "branches": len(target_tids)}


async def _wh_payment_failed(order_id: str, payment: dict, logger) -> None:
    now = datetime.now(timezone.utc).isoformat()
    upd = {"$set": {"status": "failed", "failed_at": now, "failure_reason": payment.get("error_description", "")}}
    await _raw_db.subscription_payments.update_one({"razorpay_order_id": order_id, "kind": "razorpay_pending", "status": "created"}, upd)
    await _raw_db.sms_pack_payments.update_one({"razorpay_order_id": order_id, "status": "created"}, upd)
    await _raw_db.subscription_pay_links.update_one(
        {"razorpay_order_id": order_id, "status": "pending"},
        {"$set": {"last_payment_failed_at": now, "last_failure_reason": payment.get("error_description", "")}})
    logger.warning("Payment failed for order %s: %s", order_id, payment.get("error_description"))
    pend = await _raw_db.subscription_payments.find_one({"razorpay_order_id": order_id}, {"_id": 0, "tenant_id": 1})
    if pend:
        from services.tenant_notices import notify_tenant
        await notify_tenant(pend["tenant_id"], "payment", "⚠️ Payment didn't go through", payment.get("error_description") or "Your bank declined the payment — please try again", "/settings")


async def _recompute_tenant_access(tenant_id: str) -> None:
    """After a refund: access = latest end date of the remaining active subscriptions, else back to trial."""
    active = await _raw_db.subscriptions.find({"tenant_id": tenant_id, "status": "active"}, {"_id": 0, "end_date": 1}).to_list(50)
    if active:
        end = max(str(a.get("end_date") or "")[:10] for a in active)
        await _raw_db.tenants.update_one({"id": tenant_id}, {"$set": {"subscription_end_date": end, "status": "active"}})
    else:
        await _raw_db.tenants.update_one({"id": tenant_id}, {"$set": {"status": "trial", "subscription_end_date": None}})


async def _wh_refund(order_id: str, refund: dict, logger) -> None:
    payment_id = refund.get("payment_id") or ""
    now = datetime.now(timezone.utc).isoformat()
    amt = (refund.get("amount") or 0) / 100.0
    pay = await _raw_db.subscription_payments.find_one(
        {"$or": [{"txn_ref": payment_id, "kind": {"$ne": "razorpay_pending"}}, {"razorpay_payment_id": payment_id}, {"razorpay_order_id": order_id}]},
        sort=[("created_at", -1)])
    if not pay:
        logger.warning("Refund for unknown order %s / payment %s", order_id, payment_id)
        return
    await _raw_db.subscription_payments.update_many(
        {"$or": [{"txn_ref": payment_id}, {"razorpay_payment_id": payment_id}, {"razorpay_order_id": order_id}]},
        {"$set": {"status": "refunded", "refunded_at": now, "refund_amount_inr": amt, "refund_id": refund.get("id", "")}})
    if pay.get("subscription_id"):
        await _raw_db.subscriptions.update_one(
            {"id": pay["subscription_id"]},
            {"$set": {"status": "refunded", "refunded_at": now, "cancelled_at": now, "cancel_reason": f"Razorpay refund {refund.get('id', '')}"}})
    await _raw_db.subscription_pay_links.update_one(
        {"razorpay_payment_id": payment_id}, {"$set": {"status": "refunded", "refunded_at": now}})
    tenant_id = pay.get("tenant_id")
    if tenant_id:
        await _recompute_tenant_access(tenant_id)
        logger.warning("Refunded subscription for tenant %s (order %s, ₹%.0f)", tenant_id, order_id, amt)
        from services.tenant_notices import notify_tenant
        await notify_tenant(tenant_id, "payment", f"↩️ Refund of ₹{amt:,.0f} processed", "Check your email for what changed and how to reactivate", "/settings")
        try:
            await _send_refund_notice(tenant_id, pay, refund, amt)
        except Exception as e:  # noqa: BLE001 — notice is best-effort, reconciliation already done
            logger.warning("refund notice email failed for %s: %s", tenant_id, e)


async def _send_refund_notice(tenant_id: str, pay: dict, refund: dict, amt: float) -> None:
    """Tell the owner exactly what changed after a refund + give a one-tap reactivation link; copy HQ billing."""
    from email_service import _send_email, refund_notice_email_html, hq_notify_emails
    from routes.pay_links import create_trial_pay_link, _fmt_amt
    t = await _raw_db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not t or not t.get("owner_email"):
        return
    sub = await _raw_db.subscriptions.find_one({"id": pay.get("subscription_id")}, {"_id": 0}) if pay.get("subscription_id") else None
    plan_label = (PLAN_CATALOG.get((sub or {}).get("plan") or "", {}) or {}).get("label") or (sub or {}).get("plan") or "subscription"
    link = None
    if (t.get("currency") or "INR") == "INR":
        link = await create_trial_pay_link(t, f"Reactivation after refund {refund.get('id', '')}")
        link["created_by"] = "refund-reactivation"
        await _raw_db.subscription_pay_links.update_one({"id": link["id"]}, {"$set": {"created_by": "refund-reactivation"}})
    info = {"amount": amt, "refund_id": refund.get("id", ""), "payment_id": refund.get("payment_id", ""),
            "plan_label": plan_label, "access_until": t.get("subscription_end_date"), "status": t.get("status"),
            "pay_url": link["url"] if link else "", "pay_label": link["plan_label"] if link else "",
            "pay_amount": _fmt_amt(link) if link else ""}
    html = refund_notice_email_html(t, info)
    cta = {"book_url": info["pay_url"], "book_label": "Reactivate in one tap ✦"} if link else {}
    res = await _send_email([t["owner_email"]], f"Refund of ₹{amt:,.0f} processed — what changes for {t.get('name') or t['slug']}", html, **cta)
    await _send_email(hq_notify_emails("billing"), f"↩️ Refund ₹{amt:,.0f} — {t.get('name') or t['slug']} ({plan_label})", html)
    await _raw_db.tenants.update_one({"id": tenant_id}, {"$set": {"last_refund_notice": {
        "at": datetime.now(timezone.utc).isoformat(), "amount": amt, "refund_id": refund.get("id", ""),
        "sent": bool(res.get("sent")), "pay_link_token": link["token"] if link else None}}})


async def _wh_order_paid(order_id: str, payment: dict, logger) -> str:
    """Reconcile a captured payment the browser never confirmed (owner closed the tab before /verify)."""
    payment_id = payment.get("id") or ""
    now = datetime.now(timezone.utc)
    pending = await _raw_db.subscription_payments.find_one_and_update(
        {"razorpay_order_id": order_id, "kind": "razorpay_pending", "status": "created"},
        {"$set": {"status": "captured", "razorpay_payment_id": payment_id, "captured_at": now.isoformat(), "captured_via": "webhook"}},
        return_document=ReturnDocument.AFTER)
    if pending:
        t = await _raw_db.tenants.find_one({"id": pending["tenant_id"]}, {"_id": 0})
        if t:
            from database import _super_admin_ok, _current_tenant_id
            tok1, tok2 = _current_tenant_id.set(t["id"]), _super_admin_ok.set(True)
            try:
                sub, plan, tids = await _activate_pending_order(pending, payment_id, t, "razorpay_webhook", now)
            finally:
                _current_tenant_id.reset(tok1)
                _super_admin_ok.reset(tok2)
            logger.info("webhook activated %s for tenant %s (order %s)", plan, t["slug"], order_id)
            return "subscription_activated"
    link = await _raw_db.subscription_pay_links.find_one_and_update(
        {"razorpay_order_id": order_id, "status": "pending"},
        {"$set": {"status": "paid", "paid_at": now.isoformat(), "razorpay_payment_id": payment_id, "paid_via": "webhook"}},
        return_document=ReturnDocument.AFTER)
    if link:
        from routes.pay_links import _finalize_paid_link
        await _finalize_paid_link(link, "razorpay", payment_id, now)
        logger.info("webhook settled pay link %s (order %s)", link.get("token"), order_id)
        return "pay_link_settled"
    sms = await _raw_db.sms_pack_payments.find_one_and_update(
        {"razorpay_order_id": order_id, "kind": "sms_pack_pending", "status": "created"},
        {"$set": {"status": "captured", "razorpay_payment_id": payment_id, "captured_at": now.isoformat(), "captured_via": "webhook"}},
        return_document=ReturnDocument.AFTER)
    if sms:
        pts = int(sms["points"])
        await _raw_db.tenants.update_one({"id": sms["tenant_id"]}, {"$inc": {"sms_points": pts}})
        await _raw_db.sms_credit_log.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": sms["tenant_id"], "points": pts, "source": "razorpay",
            "payment_ref": payment_id, "amount": sms["amount"], "credited_by": "razorpay_webhook", "at": now.isoformat()})
        return "sms_pack_credited"
    return "already_reconciled"


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
    event_id = request.headers.get("x-razorpay-event-id") or ""
    if not event_id:  # fallback fingerprint so replays without the header are still de-duplicated
        _p = (event.get("payload") or {})
        _ent = (_p.get("payment") or _p.get("refund") or _p.get("payment_link") or {}).get("entity", {})
        event_id = "fp_" + hashlib.sha256(f"{event_type}|{_ent.get('id')}|{_ent.get('order_id')}|{_ent.get('status')}|{event.get('created_at')}".encode()).hexdigest()[:32]
    if await _raw_db.razorpay_webhook_events.find_one({"event_id": event_id}, {"_id": 1}):
        return {"ok": True, "event": event_type, "duplicate": True}

    payment = (event.get("payload") or {}).get("payment", {}).get("entity", {})
    refund = (event.get("payload") or {}).get("refund", {}).get("entity", {})
    order_id = payment.get("order_id") or refund.get("order_id")
    result = "archived"
    try:
        if event_type == "payment.failed" and order_id:
            await _wh_payment_failed(order_id, payment, logger)
            result = "payment_failed_recorded"
        elif event_type in ("refund.created", "refund.processed") and order_id:
            await _wh_refund(order_id, refund, logger)
            result = "refund_applied"
        elif event_type in ("payment.captured", "order.paid") and order_id:
            result = await _wh_order_paid(order_id, payment, logger)
        elif event_type == "payment_link.paid":
            await _wh_placement_fee_paid(event, logger)
            await _wh_product_order_paid(event, logger)
            await _wh_settlement_paid(event, logger)
            result = "payment_link_processed"
    except Exception as e:  # noqa: BLE001 — archive the failure; Razorpay retries on non-2xx
        logger.exception("webhook %s failed: %s", event_type, e)
        result = f"error: {str(e)[:200]}"
    await _raw_db.razorpay_webhook_events.insert_one({
        "id": str(uuid.uuid4()), "event_id": event_id, "event_type": event_type, "order_id": order_id or "",
        "payment_id": payment.get("id") or refund.get("payment_id") or "", "amount": ((payment.get("amount") or refund.get("amount") or 0) / 100.0),
        "result": result, "payload": event, "received_at": datetime.now(timezone.utc).isoformat(),
    })
    if result.startswith("error"):
        raise HTTPException(500, "Webhook processing failed — event archived for retry")
    return {"ok": True, "event": event_type, "result": result}


@router.get("/super-admin/razorpay/webhook-status")
async def rzp_webhook_status(user=Depends(require_super_admin)):
    recent = await _raw_db.razorpay_webhook_events.find(
        {}, {"_id": 0, "payload": 0}).sort("received_at", -1).to_list(25)
    counts = await _raw_db.razorpay_webhook_events.aggregate(
        [{"$group": {"_id": "$event_type", "n": {"$sum": 1}}}]).to_list(50)
    return {"configured": bool(RAZORPAY_WEBHOOK_SECRET), "live_mode": RAZORPAY_KEY_ID.startswith("rzp_live_"),
            "url": f"{os.environ.get('APP_PUBLIC_URL', 'https://miracurl-suite.com')}/api/billing/razorpay/webhook",
            "events": ["payment.captured", "payment.failed", "order.paid", "refund.created", "refund.processed", "payment_link.paid"],
            "last_event_at": recent[0]["received_at"] if recent else None,
            "counts": {c["_id"]: c["n"] for c in counts}, "recent": recent}


async def _wh_placement_fee_paid(event: dict, logger) -> None:
    """Placement fee payment link paid → auto-mark the fee as paid (no manual step)."""
    pl = (event.get("payload") or {}).get("payment_link", {}).get("entity", {})
    fee_id = (pl.get("notes") or {}).get("fee_id") or pl.get("reference_id") or ""
    if not fee_id:
        return
    res = await _raw_db.placement_fees.update_one(
        {"id": fee_id, "status": {"$ne": "paid"}},
        {"$set": {"status": "paid", "paid_at": datetime.now(timezone.utc).isoformat(),
                  "paid_via": "razorpay_payment_link",
                  "razorpay_payment_link_id": pl.get("id", "")}})
    if res.modified_count:
        logger.info("placement fee %s auto-marked paid via payment link", fee_id)


async def _wh_settlement_paid(event: dict, logger) -> None:
    """Brand Model settlement payment link paid → flip the salon's settlement to PAID."""
    pl = (event.get("payload") or {}).get("payment_link", {}).get("entity", {})
    notes = pl.get("notes") or {}
    if notes.get("type") != "rewards_settlement" or not notes.get("tenant_id"):
        return
    from routes.rewards_settlements import mark_settlement_paid
    pay = (event.get("payload") or {}).get("payment", {}).get("entity", {})
    if await mark_settlement_paid(notes.get("campaign_id") or "main", notes["tenant_id"], "razorpay", pay.get("id") or pl.get("id", "")):
        logger.info("settlement for tenant %s auto-marked paid via payment link", notes["tenant_id"])


async def _wh_product_order_paid(event: dict, logger) -> None:
    """Miracurl products payment link paid → auto-mark the order as paid in the Order Inbox."""
    pl = (event.get("payload") or {}).get("payment_link", {}).get("entity", {})
    order_id = (pl.get("notes") or {}).get("order_id") or ""
    if not order_id or (pl.get("notes") or {}).get("type") != "product_order":
        return
    res = await _raw_db.product_orders.update_one(
        {"id": order_id, "status": "pending_payment"},
        {"$set": {"status": "paid", "paid_at": datetime.now(timezone.utc).isoformat(),
                  "paid_via": "razorpay_payment_link"}})
    if res.modified_count:
        logger.info("product order %s auto-marked paid via payment link", order_id)
        order = await _raw_db.product_orders.find_one({"id": order_id}, {"_id": 0})
        if order:
            send_order_status_email(order, "paid")


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
    pending = await db.grace_requests.find_one({"tenant_id": t["id"], "status": "pending"}, {"_id": 0, "id": 1})
    return {
        "source": source,
        "end_date": end_date,
        "days_remaining": days,
        "status": t.get("status", "trial"),
        "current_plan": t.get("plan"),
        "affiliate_credits": float(t.get("affiliate_credits") or 0),
        "needs_renewal_prompt": needs_prompt,
        "grace_until": t.get("grace_until"),
        "grace_request_pending": bool(pending),
    }


@router.post("/billing/grace-request")
async def request_grace(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Tenant asks HQ for a grace extension after their subscription expires."""
    existing = await db.grace_requests.find_one({"tenant_id": t["id"], "status": "pending"}, {"_id": 0, "id": 1})
    if existing:
        return {"ok": True, "already_requested": True}
    end = t.get("subscription_end_date") or t.get("trial_end_date") or t.get("trial_ends_at")
    await db.grace_requests.insert_one({
        "id": str(uuid.uuid4()),
        "tenant_id": t["id"],
        "tenant_name": t.get("name"),
        "slug": t.get("slug"),
        "owner_email": t.get("owner_email"),
        "phone": t.get("phone") or t.get("whatsapp_number") or "",
        "plan": t.get("plan"),
        "end_date": end,
        "requested_by": user.get("email"),
        "requested_at": datetime.now(timezone.utc).isoformat(),
        "status": "pending",
    })
    return {"ok": True, "already_requested": False}


@router.get("/super-admin/grace-requests")
async def list_grace_requests(user=Depends(require_super_admin)):
    items = await db.grace_requests.find({}, {"_id": 0}).sort("requested_at", -1).to_list(50)
    return {"items": items, "pending": sum(1 for i in items if i.get("status") == "pending")}


class GraceDecisionIn(BaseModel):
    approve: bool
    days: int = Field(7, ge=1, le=90)


@router.post("/super-admin/grace-requests/{rid}/decide")
async def decide_grace_request(rid: str, body: GraceDecisionIn, user=Depends(require_super_admin)):
    req = await db.grace_requests.find_one({"id": rid, "status": "pending"}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Pending grace request not found")
    now = datetime.now(timezone.utc)
    update = {"status": "approved" if body.approve else "rejected",
              "decided_at": now.isoformat(), "decided_by": user.get("email"), "days": body.days if body.approve else 0}
    await db.grace_requests.update_one({"id": rid}, {"$set": update})
    grace_until = None
    if body.approve:
        grace_until = (now.date() + timedelta(days=body.days)).isoformat()
        await db.tenants.update_one({"id": req["tenant_id"]}, {"$set": {"grace_until": grace_until}})
    return {"ok": True, **update, "grace_until": grace_until}


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
INTL_RENEWAL_REMINDER_DAYS = (15, 7, 5, 1)  # USD salons: extra 5-day nudge with one-click Stripe link
RESTO_REMINDER_DAYS = (7, 3, 1)  # restaurants: friendly 3-day nudge before the free month ends


def _renewal_wa_link(t: dict, days: int, end_date: str, source: str) -> Optional[str]:
    num = "".join(ch for ch in (t.get("whatsapp_number") or t.get("phone") or "") if ch.isdigit())
    if not num:
        return None
    line = "*ends tomorrow*" if days == 1 else f"ends in *{days} days*"
    intl = (t.get("currency") or "INR") != "INR"
    how = ("Renew in one click via the secure Stripe link in your reminder email (billed in USD). "
           if intl else
           "Renew directly inside your dashboard → Settings → Subscription → Pay via Razorpay (UPI/card). ")
    from urllib.parse import quote
    text = (f"Hi {t.get('name', '')} ✦ A friendly reminder from Miracurl — your {source} {line} ({end_date}). "
            f"{how}"
            f"Reply here if you need any help. — Team Miracurl")
    return f"https://wa.me/{num}?text={quote(text)}"


async def _trial_usage_stats(tenant_id: str) -> list[str]:
    bookings = await _raw_db.appointments.count_documents({"tenant_id": tenant_id})
    custs = await _raw_db.customers.count_documents({"tenant_id": tenant_id})
    agg = await _raw_db.invoices.aggregate([
        {"$match": {"tenant_id": tenant_id, "status": {"$ne": "voided"}}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}}]).to_list(1)
    billed = round((agg[0]["total"] if agg else 0) or 0)
    bills = (agg[0]["count"] if agg else 0) or 0
    return [f"📅 {bookings} booking{'s' if bookings != 1 else ''} taken",
            f"👥 {custs} guest{'s' if custs != 1 else ''} in your CRM",
            f"🧾 ₹{billed:,} billed across {bills} bill{'s' if bills != 1 else ''}"]


DEFAULT_TRIAL_OFFER = {"enabled": True, "kind": "percent", "percent": 10, "flat": 1000, "valid_hours": 48, "max_days": 1}


async def get_trial_offer() -> dict:
    doc = await _raw_db.platform_settings.find_one({"key": "trial_offer"}, {"_id": 0, "value": 1})
    return {**DEFAULT_TRIAL_OFFER, **((doc or {}).get("value") or {})}


class TrialOfferIn(BaseModel):
    enabled: bool = True
    kind: str = Field("percent", pattern="^(percent|flat)$")
    percent: int = Field(10, ge=1, le=50)
    flat: int = Field(1000, ge=100, le=20000)
    valid_hours: int = Field(48, ge=6, le=720)
    max_days: int = Field(1, ge=0, le=15)  # offer rides on nudges sent when days_left <= max_days


@router.get("/super-admin/trial-offer")
async def hq_get_trial_offer(user=Depends(require_super_admin)):
    return await get_trial_offer()


@router.get("/super-admin/trial-offer/stats")
async def hq_trial_offer_stats(days: int = 90, user=Depends(require_super_admin)):
    """Conversion funnel of trial-nudge pay links: sent → opened → paid, split by offer vs plain."""
    since = (datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 365)))).isoformat()
    rows = await _raw_db.subscription_pay_links.find(
        {"created_by": "trial-nudge", "created_at": {"$gte": since}},
        {"_id": 0, "amount": 1, "discount": 1, "original_amount": 1, "opened_at": 1, "status": 1, "paid_at": 1,
         "salon_name": 1, "tenant_slug": 1, "offer_label": 1, "created_at": 1, "note": 1}).to_list(5000)

    def bucket(items):
        paid = [r for r in items if r.get("status") == "paid"]
        opened = [r for r in items if r.get("opened_at")]
        return {"sent": len(items), "opened": len(opened), "paid": len(paid),
                "revenue": round(sum(float(r.get("amount") or 0) for r in paid)),
                "discount_given": round(sum(float(r.get("discount") or 0) for r in paid)),
                "open_pct": round(100 * len(opened) / len(items)) if items else 0,
                "conv_pct": round(100 * len(paid) / len(items)) if items else 0}

    offer_rows = [r for r in rows if r.get("discount")]
    plain_rows = [r for r in rows if not r.get("discount")]
    recent_paid = sorted([r for r in rows if r.get("status") == "paid"], key=lambda r: r.get("paid_at") or "", reverse=True)[:10]
    return {"days": days, "offer": bucket(offer_rows), "plain": bucket(plain_rows), "all": bucket(rows),
            "recent_paid": [{"salon_name": r.get("salon_name"), "slug": r.get("tenant_slug"), "amount": r.get("amount"),
                             "discount": r.get("discount"), "offer_label": r.get("offer_label"), "paid_at": r.get("paid_at")} for r in recent_paid]}


@router.put("/super-admin/trial-offer")
async def hq_put_trial_offer(body: TrialOfferIn, user=Depends(require_super_admin)):
    await _raw_db.platform_settings.update_one(
        {"key": "trial_offer"}, {"$set": {"value": body.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat(),
                                          "updated_by": user.get("email")}}, upsert=True)
    return await get_trial_offer()


async def send_trial_ending_email(t: dict, days: int, end_str: str) -> dict:
    """Friendly trial-ending nudge with a one-tap upgrade pay link (INR tenants, both verticals).
    On the final nudge (days <= offer.max_days) a limited-time discount is baked into the pay link."""
    from email_service import _send_email, trial_ending_email_html
    from routes.pay_links import create_trial_pay_link, _fmt_amt
    offer = await get_trial_offer()
    use_offer = bool(offer.get("enabled")) and days <= int(offer.get("max_days") or 1)
    link = await create_trial_pay_link(
        t, f"Trial ends in {days} day(s) — upgrade nudge" + (" + limited-time offer" if use_offer else ""),
        offer=offer if use_offer else None)
    stats = await _trial_usage_stats(t["id"])
    when = "tomorrow" if days == 1 else ("today" if days == 0 else f"in {days} days")
    from services.tenant_notices import notify_tenant
    await notify_tenant(t["id"], "offer", f"⏳ Free trial ends {when}" + (f" — {link['offer_label']}" if link.get("discount") else ""),
                        f"Upgrade in one tap: {link['url']}", link["url"], dedupe_key=f"trial-nudge-{days}-{end_str}")
    subject = (f"🎁 {t.get('name') or t['slug']} — last chance: {link['offer_label']} before your trial ends {when}"
               if link.get("discount") else
               f"⏳ {t.get('name') or t['slug']} — your free trial ends {when}. Upgrade in one tap 💛")
    return await _send_email(
        [t["owner_email"]], subject,
        trial_ending_email_html(t, {
            "days_left": days, "end_date": end_str, "plan_label": link["plan_label"], "price_str": _fmt_amt(link),
            "pay_url": link["url"], "stats": stats,
            "offer": ({"original": _fmt_amt({**link, "amount": link["original_amount"]}), "label": link["offer_label"],
                       "expires_at": link["expires_at"]} if link.get("discount") else None)}))


async def _send_renewal_email(t: dict, days: int, end_str: str, source: str) -> dict:
    """Currency-aware reminder email: INR → Razorpay in-app CTA; USD → one-click Stripe pay link."""
    from email_service import (_send_email, renewal_reminder_email_html,
                               renewal_reminder_email_intl_html, restaurant_trial_reminder_email_html)
    name = t.get("name") or t["slug"]
    if source == "trial" and (t.get("currency") or "INR") == "INR":
        return await send_trial_ending_email(t, days, end_str)
    if t.get("business_type") == "restaurant" and (t.get("currency") or "INR") == "INR":
        what = "free month" if source == "trial" else "subscription"
        return await _send_email(
            [t["owner_email"]],
            f"🍽️ Your Miracurl {what} ends in {days} day{'s' if days != 1 else ''} — renew in 2 minutes",
            restaurant_trial_reminder_email_html(
                name, days, end_str, source, float(t.get("affiliate_credits") or 0)),
            book_label="Renew now ✦",
            book_url=f"{os.environ.get('APP_PUBLIC_URL', 'https://miracurl-suite.com')}/settings")
    if (t.get("currency") or "INR") != "INR":
        token = t.get("renewal_pay_token")
        if not token:
            token = str(uuid.uuid4())
            await db.tenants.update_one({"id": t["id"]}, {"$set": {"renewal_pay_token": token}})
        plan_key = t.get("plan") or ""
        if not (plan_key.startswith("intl_") and plan_key in PLAN_CATALOG):
            plan_key = "intl_pro_annual"
        plan_info = PLAN_CATALOG.get(plan_key, {})
        app_url = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
        return await _send_email(
            [t["owner_email"]],
            f"⏳ Your Miracurl {source} ends in {days} day{'s' if days != 1 else ''} — renew in one click",
            renewal_reminder_email_intl_html(
                name, days, end_str,
                plan_info.get("label") or "Professional Annual (USD)",
                float(plan_info.get("price") or 0),
                f"{app_url}/api/public/renew/{token}"))
    plan_info = PLAN_CATALOG.get(t.get("plan") or "", {})
    return await _send_email(
        [t["owner_email"]],
        f"⏳ Your Miracurl {source} ends in {days} day{'s' if days != 1 else ''} — renew in 2 minutes",
        renewal_reminder_email_html(
            name, days, end_str,
            plan_info.get("label") or (t.get("plan") or "Trial"),
            float(plan_info.get("price") or 0),
            float(t.get("affiliate_credits") or 0)))


async def run_renewal_reminders() -> dict:
    """Auto-email every tenant whose subscription/trial ends in exactly 15, 7 or 1 days
    (USD salons also get a 5-day nudge). Idempotent per (tenant, end_date, days_mark).
    Also prepares a WhatsApp deep link per reminder for the Super Admin queue."""
    now_iso = datetime.now(timezone.utc).isoformat()
    tenants = await db.tenants.find({"status": {"$ne": "cancelled"}}, {"_id": 0}).to_list(5000)
    checked, sent, skipped, failed = 0, 0, 0, 0
    items = []
    for t in tenants:
        end = t.get("subscription_end_date") or t.get("trial_end_date") or t.get("trial_ends_at")
        days = _days_until(end)
        is_intl = (t.get("currency") or "INR") != "INR"
        source = "subscription" if t.get("subscription_end_date") else "trial"
        if t.get("business_type") == "restaurant" and not is_intl and source != "trial":
            marks = RESTO_REMINDER_DAYS
        else:
            marks = INTL_RENEWAL_REMINDER_DAYS if is_intl else RENEWAL_REMINDER_DAYS  # trials: 15 / 7 / 1
        if days not in marks:
            continue
        checked += 1
        end_str = str(end)[:10]
        already = await _raw_db.renewal_reminder_log.find_one(
            {"tenant_id": t["id"], "end_date": end_str, "days_mark": days})
        if already:
            skipped += 1
            continue
        if not t.get("owner_email"):
            skipped += 1  # no log row → retried automatically once an owner email is added
            continue
        email_status = await _send_renewal_email(t, days, end_str, source)
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


class TrialNudgeIn(BaseModel):
    days: int = Field(7, ge=0, le=120)


@router.post("/super-admin/renewals/{tid}/send-trial-nudge")
async def send_trial_nudge_now(tid: str, body: TrialNudgeIn, user=Depends(require_super_admin)):
    """HQ: send the trial-ending nudge to one tenant right now (bypasses the 15/7/1 schedule)."""
    t = await db.tenants.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    if not t.get("owner_email"):
        raise HTTPException(400, "Tenant has no owner email")
    end = t.get("trial_end_date") or t.get("trial_ends_at") or ""
    end_str = str(end)[:10]
    days = body.days if body.days else max(0, _days_until(end) or 0)
    if (t.get("currency") or "INR") != "INR":
        raise HTTPException(400, "Trial nudge with Razorpay pay link is for INR tenants only")
    status = await send_trial_ending_email(t, days, end_str)
    if not status.get("sent"):
        raise HTTPException(400, status.get("error") or "Email failed")
    await _raw_db.renewal_reminder_log.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": t["id"], "slug": t["slug"], "tenant_name": t.get("name"),
        "days_mark": days, "end_date": end_str, "source": "trial", "manual": True, "sent_by": user.get("email"),
        "email_to": t["owner_email"], "email_sent": True, "email_error": None,
        "wa_link": _renewal_wa_link(t, days, end_str, "trial"), "at": datetime.now(timezone.utc).isoformat()})
    return {"ok": True, "sent_to": t["owner_email"], "days": days}


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


@router.delete("/super-admin/subscriptions/{sid}")
async def delete_subscription(sid: str, user=Depends(require_super_admin)):
    """Permanently delete a cancelled/expired (test) subscription and its payment records."""
    sub = await db.subscriptions.find_one({"id": sid}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "Subscription not found")
    if sub["status"] == "active":
        raise HTTPException(400, "Cancel the subscription first — active subscriptions can't be deleted.")
    pays = await db.subscription_payments.delete_many({"subscription_id": sid})
    await db.subscriptions.delete_one({"id": sid})
    return {"ok": True, "payments_deleted": pays.deleted_count}


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
        plan_key = s.get("plan") or "custom"
        plan_counts[plan_key] = plan_counts.get(plan_key, 0) + 1
        # Normalise each active plan into a monthly-recurring number
        plan_days = PLAN_CATALOG.get(plan_key, {}).get("duration_days", 30) or 30
        plan_price = float(s.get("price") or PLAN_CATALOG.get(plan_key, {}).get("price") or 0)
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

    def _safe(v):
        s = str(v or "")
        return f"'{s}" if s[:1] in ("=", "+", "-", "@") else s

    w.writerow(["paid_at", "tenant_slug", "tenant_name", "owner_email",
                "amount_inr", "method", "txn_ref", "subscription_id", "notes"])
    for p in pays:
        t = t_map.get(p.get("tenant_id"), {})
        w.writerow([
            p.get("paid_at", ""),
            _safe(t.get("slug", "")),
            _safe(t.get("name", "")),
            _safe(t.get("owner_email", "")),
            f"{float(p.get('amount') or 0):.2f}",
            _safe(p.get("method", "")),
            _safe(p.get("txn_ref", "")),
            p.get("subscription_id", ""),
            _safe((p.get("notes") or "").replace("\n", " ")),
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
        s["plan_label"] = PLAN_CATALOG.get(s.get("plan"), {}).get("label", s.get("plan") or "—")
    return {"subscriptions": subs, "payments": pays}


class SmsPointsIn(BaseModel):
    points: int = Field(..., ge=1, le=100000)


class GraceIn(BaseModel):
    days: int = 30


@router.post("/super-admin/tenants/{tid}/grace")
async def extend_grace(tid: str, body: GraceIn, user=Depends(require_super_admin)):
    """HQ courtesy: extend a tenant's post-expiry grace window (login stays open till then)."""
    if not 1 <= body.days <= 365:
        raise HTTPException(400, "Days must be 1-365")
    until = (datetime.now(timezone.utc).date() + timedelta(days=body.days)).isoformat()
    r = await db.tenants.update_one({"id": tid}, {"$set": {"grace_until": until}})
    if not r.matched_count:
        raise HTTPException(404, "Tenant not found")
    return {"ok": True, "grace_until": until}


@router.get("/super-admin/sms-log")
async def sms_delivery_log(tenant_id: str = "", user=Depends(require_super_admin)):
    """Per-salon SMS delivery log — every attempt (sent/failed) with reason."""
    q = {"tenant_id": tenant_id} if tenant_id else {}
    rows = await _raw_db.sms_log.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)
    sent = sum(1 for r in rows if r.get("sent"))
    return {"items": rows, "sent": sent, "failed": len(rows) - sent}


@router.post("/super-admin/tenants/{tid}/sms-points")
async def credit_sms_points(tid: str, body: SmsPointsIn, user=Depends(require_super_admin)):
    """Super-admin credits SMS points to a tenant (1 point = 1 customer SMS)."""
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


async def _record_partner_commission(t: dict, pay: dict) -> None:
    """Partner Program: 20% recurring commission to the referrer for the tenant's first 12 months."""
    from database import _raw_db as _rdb
    ref_edge = await _rdb.affiliate_referrals.find_one({"referred_tenant_id": t["id"]})
    if not (ref_edge and ref_edge.get("referrer_tenant_id")):
        return
    # SEC hardening: no self-referral or same-owner commission farming
    if ref_edge["referrer_tenant_id"] == t["id"]:
        return
    ref_t = await _rdb.tenants.find_one({"id": ref_edge["referrer_tenant_id"]}, {"_id": 0, "owner_email": 1})
    if ref_t and (ref_t.get("owner_email") or "").lower() == (t.get("owner_email") or "").lower() and ref_t.get("owner_email"):
        return
    try:
        ref_start = datetime.fromisoformat(str(ref_edge.get("created_at", "")).replace("Z", "+00:00"))
        within = (datetime.now(timezone.utc) - ref_start).days <= 365
    except ValueError:
        within = False
    amt = float(pay.get("amount") or 0)
    if within and amt > 0:
        await _rdb.partner_commissions.insert_one({
            "id": str(uuid.uuid4()), "referrer_tenant_id": ref_edge["referrer_tenant_id"],
            "referred_tenant_id": t["id"], "referred_name": t.get("name", ""),
            "payment_id": pay.get("id"), "payment_amount": amt,
            "commission": round(amt * 0.20, 2), "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()})
