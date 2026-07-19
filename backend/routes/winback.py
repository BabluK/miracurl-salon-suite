"""Win-back nudges — lapsed customers surfaced on the owner dashboard with one-tap WhatsApp outreach."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import _raw_db
from security import require_tenant_admin, current_tenant
from routes.mira_autopilot import _find_winback_leads

router = APIRouter()

WINBACK_DAYS = 45


@router.get("/winback/nudges")
async def winback_nudges(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    leads = await _find_winback_leads(t["id"], WINBACK_DAYS)
    today = datetime.now(timezone.utc).date()
    out = []
    for ld in leads[:6]:
        try:
            days = (today - datetime.fromisoformat(ld["last_visit"]).date()).days
        except ValueError:
            days = WINBACK_DAYS
        first = (ld["name"] or "there").split()[0]
        msg = (f"Hi {first}! 👋 We miss you at {t.get('name', 'our salon')} — it's been a while since your last visit. "
               f"Come pamper yourself this week and enjoy 15% off any service. Reply here or book online. ✨")
        out.append({**ld, "days_since": days, "message": msg})
    return {"nudges": out, "total_lapsed": len(leads), "winback_days": WINBACK_DAYS}


class AckIn(BaseModel):
    action: str  # contacted | dismissed


@router.post("/winback/nudges/{customer_id}/ack")
async def winback_ack(customer_id: str, body: AckIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    if body.action not in ("contacted", "dismissed"):
        raise HTTPException(400, "action must be 'contacted' or 'dismissed'")
    cust = await _raw_db.customers.find_one({"id": customer_id, "tenant_id": t["id"]}, {"_id": 0, "id": 1})
    if not cust:
        raise HTTPException(404, "Customer not found")
    await _raw_db.lead_outreach.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": t["id"], "customer_id": customer_id,
        "channel": f"dashboard_{body.action}", "by": admin["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}


class WinbackAutoIn(BaseModel):
    enabled: bool


@router.get("/winback/auto")
async def winback_auto_status(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    cfg = await _raw_db.autopilot_settings.find_one({"tenant_id": t["id"]}, {"_id": 0, "winback_auto": 1}) or {}
    return {"enabled": bool(cfg.get("winback_auto"))}


@router.put("/winback/auto")
async def winback_auto_toggle(body: WinbackAutoIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Standalone daily win-back emails (Mira's comeback offer) — no social autopilot needed."""
    await _raw_db.autopilot_settings.update_one(
        {"tenant_id": t["id"]},
        {"$set": {"winback_auto": body.enabled, "tenant_id": t["id"]}}, upsert=True)
    return {"ok": True, "enabled": body.enabled}
