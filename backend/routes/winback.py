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


BLAST_DAYS = 30
BLAST_LIMIT = 100


class BlastIn(BaseModel):
    days: int = BLAST_DAYS
    limit: int = BLAST_LIMIT
    dry_run: bool = False


def _wa_number(phone: str) -> str:
    d = "".join(ch for ch in (phone or "") if ch.isdigit())
    return d if len(d) > 10 else (f"91{d}" if len(d) == 10 else "")


@router.get("/winback/blast/preview")
async def winback_blast_preview(days: int = BLAST_DAYS, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """What one tap would do: eligible guests, credits available, channel readiness."""
    from services.tenant_features import features_of
    leads = [ld for ld in await _find_winback_leads(t["id"], max(7, min(days, 365))) if _wa_number(ld.get("phone"))]
    base = os.environ.get("APP_PUBLIC_URL", "")
    book_url = f"{base}/book/{t.get('slug', '')}" if base and t.get("slug") else ""
    sample = leads[0] if leads else {"name": "Priya", "last_visit": ""}
    fresh = await _raw_db.tenants.find_one({"id": t["id"]}, {"_id": 0, "wa_points": 1})
    own_number = int((fresh or {}).get("wa_points") or 0) > 0  # official channel: queue when the salon has credits
    return {"eligible": len(leads), "days": days, "credits": int((fresh or {}).get("wa_points") or 0), "own_number": own_number,
            "whatsapp_enabled": features_of(t)["whatsapp"], "template": bool(os.environ.get("WHATSAPP_WINBACK_TEMPLATE")),
            "sample_message": _nudge_message(t, (sample.get("name") or "there").split()[0], days, book_url),
            "guests": [{"id": ld["id"], "name": ld["name"], "last_visit": ld["last_visit"]} for ld in leads[:8]]}


@router.post("/winback/blast")
async def winback_blast(body: BlastIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """One tap: WhatsApp win-back to every guest inactive for `days` (1 credit each, 30-day cooldown via lead_outreach)."""
    from services.tenant_features import features_of
    from services.whatsapp_cloud import send_template, send_text
    if not features_of(t)["whatsapp"]:
        raise HTTPException(403, "WhatsApp isn't enabled for your salon yet — ask Miracurl HQ to switch it on")
    days = max(7, min(body.days, 365))
    leads = [ld for ld in await _find_winback_leads(t["id"], days) if _wa_number(ld.get("phone"))][:max(1, min(body.limit, BLAST_LIMIT))]
    if body.dry_run:
        return {"eligible": len(leads), "sent": 0, "failed": 0, "skipped_no_credits": 0, "dry_run": True}
    if int(t.get("wa_points") or 0) > 0:
        # Official channel → throttled queue (credits deducted per send) instead of a burst
        from services import wa_campaigns as camp
        base_q = os.environ.get("APP_PUBLIC_URL", "")
        book_q = f"{base_q}/book/{t.get('slug', '')}" if base_q and t.get("slug") else ""
        doc = await camp.create_campaign(
            t, name=f"Win-back · {days}+ days", text=_nudge_message(t, "{name}", days, book_q), image_url=None,
            recipients=[{"customer_id": ld["id"], "name": ld["name"], "phone": ld["phone"]} for ld in leads],
            created_by=admin["id"], source="winback")
        now_iso = datetime.now(timezone.utc).isoformat()
        if leads:
            await _raw_db.lead_outreach.insert_many([{"id": str(uuid.uuid4()), "tenant_id": t["id"], "customer_id": ld["id"], "name": ld["name"],
                                                      "channel": "whatsapp", "to": _wa_number(ld["phone"]), "last_visit": ld.get("last_visit"),
                                                      "by": admin["id"], "source": "mira_blast", "created_at": now_iso} for ld in leads])
        return {"eligible": len(leads), "queued": len(leads), "sent": 0, "failed": 0, "skipped_no_credits": 0,
                "campaign_id": doc["id"], "own_number": True}
    base = os.environ.get("APP_PUBLIC_URL", "")
    book_url = f"{base}/book/{t.get('slug', '')}" if base and t.get("slug") else ""
    own_number = False
    template = os.environ.get("WHATSAPP_WINBACK_TEMPLATE", "")
    today = datetime.now(timezone.utc).date()
    sent, failed, no_credits, errors = 0, 0, 0, []
    for ld in leads:
        if not own_number:
            r = await _raw_db.tenants.update_one({"id": t["id"], "wa_points": {"$gte": 1}}, {"$inc": {"wa_points": -1}})
            if not r.modified_count:
                no_credits += 1
                continue
        first = (ld["name"] or "there").split()[0]
        try:
            d = (today - datetime.fromisoformat(ld["last_visit"]).date()).days
        except ValueError:
            d = days
        to = _wa_number(ld["phone"])
        try:
            if template:
                await send_template(to, template, [first, t.get("name", "our salon"), str(d), book_url or "—"], tenant_id=t["id"])
            else:
                await send_text(to, _nudge_message(t, first, d, book_url), tenant_id=t["id"])
            sent += 1
            await _raw_db.sms_credit_log.insert_one({"id": str(uuid.uuid4()), "tenant_id": t["id"], "points": 0 if own_number else -1, "source": "winback_blast",
                                                     "channel": "whatsapp", "customer_id": ld["id"], "at": datetime.now(timezone.utc).isoformat()})
            await _raw_db.lead_outreach.insert_one({"id": str(uuid.uuid4()), "tenant_id": t["id"], "customer_id": ld["id"], "name": ld["name"],
                                                    "channel": "whatsapp", "to": to, "last_visit": ld.get("last_visit"), "by": admin["id"],
                                                    "source": "mira_blast", "created_at": datetime.now(timezone.utc).isoformat()})
        except Exception as e:  # noqa: BLE001 — refund and keep going
            failed += 1
            errors.append(str(e)[:160])
            if not own_number:
                await _raw_db.tenants.update_one({"id": t["id"]}, {"$inc": {"wa_points": 1}})
    return {"eligible": len(leads), "sent": sent, "failed": failed, "skipped_no_credits": no_credits, "errors": errors[:3],
            "hint": None if template else "Tip: set WHATSAPP_WINBACK_TEMPLATE (approved Meta template) so messages reach guests outside the 24h window."}
