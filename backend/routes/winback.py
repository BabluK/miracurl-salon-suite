"""Win-back nudges — lapsed customers surfaced on the owner dashboard with one-tap WhatsApp outreach."""
import os
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import _raw_db
from security import require_tenant_admin, current_tenant
from routes.mira_autopilot import _find_winback_leads

router = APIRouter()

WINBACK_DAYS = 45
_CONTACT_CHANNELS = ["email", "whatsapp", "dashboard_contacted"]


async def _winback_wins(tid: str) -> dict:
    """Guests who visited again AFTER being nudged (last 90 days) + revenue recovered."""
    since = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    outreach = await _raw_db.lead_outreach.find(
        {"tenant_id": tid, "channel": {"$in": _CONTACT_CHANNELS}, "created_at": {"$gte": since}},
        {"_id": 0, "customer_id": 1, "created_at": 1}).to_list(2000)
    first_nudge: dict = {}
    for o in outreach:
        cid = o.get("customer_id")
        if cid and (cid not in first_nudge or o["created_at"] < first_nudge[cid]):
            first_nudge[cid] = o["created_at"]
    if not first_nudge:
        return {"wins": [], "wins_count": 0, "wins_revenue": 0}
    invs = await _raw_db.invoices.aggregate([
        {"$match": {"tenant_id": tid, "customer_id": {"$in": list(first_nudge)}}},
        {"$group": {"_id": "$customer_id",
                    "docs": {"$push": {"created_at": "$created_at", "total": "$total"}}}},
    ]).to_list(1000)
    wins, total_rev = [], 0.0
    for r in invs:
        nudged = first_nudge[r["_id"]]
        after = [d for d in r["docs"] if (d.get("created_at") or "") > nudged]
        if not after:
            continue
        spent = sum(d.get("total") or 0 for d in after)
        wins.append({"customer_id": r["_id"], "nudged_at": nudged[:10],
                     "returned_at": min(d["created_at"] for d in after)[:10],
                     "spent": round(spent, 2)})
        total_rev += spent
    wins.sort(key=lambda w: w["returned_at"], reverse=True)
    top = wins[:8]
    names = {c["id"]: c.get("name", "Guest") for c in await _raw_db.customers.find(
        {"tenant_id": tid, "id": {"$in": [w["customer_id"] for w in top]}},
        {"_id": 0, "id": 1, "name": 1}).to_list(10)}
    for w in top:
        w["name"] = names.get(w["customer_id"], "Guest")
    return {"wins": top, "wins_count": len(wins), "wins_revenue": round(total_rev, 2)}


def _nudge_message(t: dict, first: str, days: int, book_url: str) -> str:
    name = t.get("name", "our salon")
    if t.get("business_type") == "restaurant":
        body = (f"Hi {first}! ✨ It's been {days} days since we last served you at *{name}* — "
                "the whole team misses you! 💛\n\n"
                "Come back this week and enjoy *15% OFF* your next meal, on us.")
    else:
        body = (f"Hi {first}! ✨ It's been {days} days since we last pampered you at *{name}* — "
                "we genuinely miss you! 💛\n\n"
                "Treat yourself this week: *15% OFF* any service, as our welcome-back gift.")
    if book_url:
        body += f"\n\n📅 Book in 10 seconds: {book_url}"
    return body + f"\n\nSee you soon! — Team {name} ✨"


@router.get("/winback/nudges")
async def winback_nudges(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    leads = await _find_winback_leads(t["id"], WINBACK_DAYS)
    today = datetime.now(timezone.utc).date()
    base = os.environ.get("APP_PUBLIC_URL", "")
    book_url = f"{base}/book/{t.get('slug', '')}" if base and t.get("slug") else ""
    out = []
    for ld in leads[:6]:
        try:
            days = (today - datetime.fromisoformat(ld["last_visit"]).date()).days
        except ValueError:
            days = WINBACK_DAYS
        first = (ld["name"] or "there").split()[0]
        out.append({**ld, "days_since": days, "message": _nudge_message(t, first, days, book_url)})
    wins = await _winback_wins(t["id"])
    return {"nudges": out, "total_lapsed": len(leads), "winback_days": WINBACK_DAYS, **wins}


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
