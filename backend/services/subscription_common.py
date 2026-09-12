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
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


async def load_plan_overrides():
    """Merge DB price overrides into the in-memory catalog (called at startup)."""
    async for o in _raw_db.plan_overrides.find({}, {"_id": 0}):
        if o.get("key") in PLAN_CATALOG:
            PLAN_CATALOG[o["key"]].update({k: o[k] for k in ("price", "label", "duration_days", "branches") if o.get(k) is not None})


def _plan_or_400(plan: str) -> dict:
    p = PLAN_CATALOG.get(plan)
    if not p:
        raise HTTPException(400, f"Unknown plan '{plan}'. Valid: {list(PLAN_CATALOG)}")
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
