"""HQ: price-drop alerts for international subscribers + Mira's monthly competitor price watch."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from security import require_super_admin
from database import _raw_db

router = APIRouter()


@router.get("/super-admin/price-alerts/preview")
async def price_alerts_preview(user=Depends(require_super_admin)):
    from services.price_alerts import price_alert_audience, CAMPAIGN
    rows = await price_alert_audience()
    return {"campaign": CAMPAIGN, "rows": rows, "pending": sum(1 for r in rows if not r["already_sent"]),
            "already_sent": sum(1 for r in rows if r["already_sent"])}


class SendIn(BaseModel):
    tenant_ids: list[str] | None = None


@router.post("/super-admin/price-alerts/send")
async def price_alerts_send(body: SendIn, user=Depends(require_super_admin)):
    from services.price_alerts import send_price_alerts
    from routes.lead_common import log_mira_event
    res = await send_price_alerts(body.tenant_ids)
    if res["sent"]:
        await log_mira_event("result", f"💌 Price-drop e-mail sent to {res['sent']} international subscriber{'s' if res['sent'] != 1 else ''} with a one-click switch to annual.")
    return res


@router.get("/super-admin/price-alerts/sample")
async def price_alerts_sample(user=Depends(require_super_admin)):
    from services.price_alerts import price_alert_audience, price_alert_html
    rows = await price_alert_audience()
    if not rows:
        raise HTTPException(404, "No international subscribers yet")
    return {"html": price_alert_html(rows[0], "#"), "to": rows[0]["owner_email"]}


@router.get("/super-admin/competitor-watch")
async def competitor_watch_latest(user=Depends(require_super_admin)):
    from services.competitor_watch import COMPETITORS, OUR_KEYS
    doc = await _raw_db.platform_settings.find_one({"key": "competitor_watch"}, {"_id": 0})
    return doc or {"key": "competitor_watch", "ran_at": None, "rows": [{"name": n, "url": u, "segment": sg, "benchmark": b} for n, u, sg, b in COMPETITORS],
                   "verdicts": {}, "our_keys": OUR_KEYS}


@router.get("/super-admin/competitor-watch/history")
async def competitor_watch_history(user=Depends(require_super_admin)):
    from services.competitor_watch import competitor_history
    return await competitor_history()


@router.post("/super-admin/competitor-watch/run")
async def competitor_watch_run(user=Depends(require_super_admin)):
    from services.competitor_watch import run_competitor_watch
    return await run_competitor_watch(trigger=f"manual:{user.get('email', '')}")
