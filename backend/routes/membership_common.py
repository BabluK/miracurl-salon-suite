"""Shared membership constants/helpers used by premium_membership and wallet_pass (breaks circular import)."""
from fastapi import HTTPException

from database import _raw_db

TIER_COLORS = {"silver": "#94a3b8", "gold": "#d4af37", "platinum": "#8b5cf6",
               "diamond": "#22d3ee", "custom": "#f59e0b"}


async def _member_bundle(member_id: str) -> tuple:
    cm = await _raw_db.customer_memberships.find_one(
        {"member_id": member_id.strip().upper()}, {"_id": 0})
    if not cm:
        raise HTTPException(404, "Membership not found")
    cust = await _raw_db.customers.find_one({"id": cm["customer_id"]}, {"_id": 0}) or {}
    t = await _raw_db.tenants.find_one({"id": cm["tenant_id"]}, {"_id": 0}) or {}
    return cm, cust, t
