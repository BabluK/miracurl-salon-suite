"""Subscription models + plan/Razorpay helpers shared by routes.subscriptions and routes.pay_links."""
import hashlib
import hmac
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import HTTPException
from pydantic import BaseModel, Field

from database import db, _raw_db
from services.billing import RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, _rzp_client
from services.plans import PLAN_CATALOG

__all__ = ["Subscription", "SubscriptionPayment", "PLAN_CATALOG", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "_rzp_client",
           "load_plan_overrides", "_plan_or_400", "_fresh_plan_or_400", "_apply_subscription_to_tenants", "_verify_rzp_signature"]


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
    tax: Optional[dict] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


_CUSTOM_KEYS: set = set()
_OVERRIDE_FIELDS = ("price", "label", "duration_days", "branches", "features", "tier", "hidden", "highlight")


async def load_plan_overrides():
    """Merge DB overrides into the in-memory catalog: price/label edits, HQ-hidden built-ins and HQ-created custom plans."""
    seen_custom = set()
    for k in PLAN_CATALOG:
        PLAN_CATALOG[k].pop("hidden", None)
    async for o in _raw_db.plan_overrides.find({}, {"_id": 0}):
        key = o.get("key")
        if not key:
            continue
        if o.get("custom"):
            seen_custom.add(key)
            PLAN_CATALOG[key] = {"label": o.get("label") or key, "price": float(o.get("price") or 0), "duration_days": int(o.get("duration_days") or 30),
                                 "branches": int(o.get("branches") or 1), "currency": o.get("currency") or "INR", "vertical": o.get("vertical") or "salon",
                                 "tier": o.get("tier"), "features": o.get("features") or [], "custom": True, "hidden": bool(o.get("hidden")),
                                 "highlight": bool(o.get("highlight"))}
            if PLAN_CATALOG[key]["currency"] == "INR":
                PLAN_CATALOG[key].pop("currency")
        elif key in PLAN_CATALOG:
            PLAN_CATALOG[key].update({k: o[k] for k in _OVERRIDE_FIELDS if o.get(k) is not None})
    for stale in _CUSTOM_KEYS - seen_custom:
        PLAN_CATALOG.pop(stale, None)
    _CUSTOM_KEYS.clear()
    _CUSTOM_KEYS.update(seen_custom)


def visible_plans() -> dict:
    return {k: v for k, v in PLAN_CATALOG.items() if not v.get("hidden")}


def _plan_or_400(plan: str) -> dict:
    p = PLAN_CATALOG.get(plan)
    if not p:
        raise HTTPException(400, f"Unknown plan '{plan}'. Valid: {list(visible_plans())}")
    if p.get("hidden"):
        raise HTTPException(400, f"Plan '{p.get('label', plan)}' is no longer offered")
    return p


async def _fresh_plan_or_400(plan: str) -> dict:
    """Same as _plan_or_400 but merges DB price overrides first (multi-worker safe)."""
    await load_plan_overrides()
    return _plan_or_400(plan)


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


def _verify_rzp_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """HMAC SHA256 of '<order_id>|<payment_id>' with key_secret."""
    body = f"{order_id}|{payment_id}".encode()
    expected = hmac.new(RAZORPAY_KEY_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
