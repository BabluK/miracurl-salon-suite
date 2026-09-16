"""Shared campaign onboarding + agreement gate helpers (no route imports → no import cycles)."""
import uuid
from datetime import datetime, timezone

from database import _raw_db
from services.campaign_docs import agreement_version, get_acceptance

_now = lambda: datetime.now(timezone.utc).isoformat()  # noqa: E731
ONBOARDING_STEPS = ("invited", "agreed", "call_scheduled", "call_done", "live")
CHECKLIST = (("poster_printed", "QR poster printed"), ("qr_placed", "QR placed at billing counter"), ("staff_briefed", "Staff briefed on entries & rules"))


async def get_onboarding(tenant_id: str, campaign_id: str) -> dict:
    doc = await _raw_db.rewards_onboarding.find_one({"tenant_id": tenant_id, "campaign_id": campaign_id}, {"_id": 0})
    doc = doc or {"tenant_id": tenant_id, "campaign_id": campaign_id, "status": "none", "call_at": None, "notes": "", "live": False}
    doc["entries"] = await _raw_db.rewards_participants.count_documents({"tenant_id": tenant_id})
    doc["checklist_items"] = [{"key": k, "label": lbl} for k, lbl in CHECKLIST]
    return doc


async def set_onboarding(tenant_id: str, campaign_id: str, patch: dict) -> dict:
    await _raw_db.rewards_onboarding.update_one(
        {"tenant_id": tenant_id, "campaign_id": campaign_id},
        {"$set": {**patch, "updated_at": _now()}, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": _now()}}, upsert=True)
    return await get_onboarding(tenant_id, campaign_id)


async def backfill_onboarding() -> None:
    """One-time: salons that signed before the go-live gate existed stay live (no disruption)."""
    async for a in _raw_db.rewards_agreements.find({}, {"_id": 0, "tenant_id": 1, "campaign_id": 1}):
        if not await _raw_db.rewards_onboarding.find_one({"tenant_id": a["tenant_id"], "campaign_id": a["campaign_id"]}, {"_id": 1}):
            await set_onboarding(a["tenant_id"], a["campaign_id"], {"status": "live", "live": True, "live_at": _now(), "live_by": "backfill"})


async def agreement_ok(tenant_id: str, c: dict) -> bool:
    """True when the salon has accepted the CURRENT agreement version."""
    acc = await get_acceptance(tenant_id, c["id"])
    return bool(acc) and acc.get("version") == agreement_version(c)


async def agreement_state(tenant: dict, c: dict) -> dict:
    acc = await get_acceptance(tenant["id"], c["id"])
    ver = agreement_version(c)
    return {"version": ver, "share_pct": float(c.get("salon_share_pct") or 10), "campaign": c["name"],
            "onboarding": await get_onboarding(tenant["id"], c["id"]),
            "accepted": acc is not None and acc.get("version") == ver,
            "needs_reaccept": acc is not None and acc.get("version") != ver,
            "acceptance": {k: acc.get(k) for k in ("id", "full_name", "designation", "accepted_at", "user_email", "version")} if acc else None}


async def campaign_live_ok(tenant_id: str, c: dict) -> bool:
    """Casting page / joins / QR poster open only after the signed agreement AND HQ go-live."""
    if not await agreement_ok(tenant_id, c):
        return False
    return bool((await get_onboarding(tenant_id, c["id"])).get("live"))
