"""Mira auto WhatsApp intro: greets freshly discovered hot leads on WhatsApp during their local business hours
(replaces the retired Twilio auto-dialer). Business-initiated → approved Meta template `miracurl_lead_intro`."""
import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from database import _raw_db
from security import require_super_admin

router = APIRouter()
log = logging.getLogger("lead_wa_auto")

SETTINGS_KEY = "mira_auto_wa"
TEMPLATE = "miracurl_lead_intro"
HOT_QUERY = {"reviews": {"$gte": 500}, "$or": [{"website": ""}, {"website": None}, {"website": {"$exists": False}}]}
_CC_OFFSETS = (("971", 4), ("974", 3), ("973", 3), ("968", 4), ("966", 3), ("965", 3), ("91", 5.5), ("65", 8),
               ("60", 8), ("61", 10), ("44", 0), ("49", 1), ("33", 1), ("1", -5))
_template_cache: dict = {"status": None, "checked_at": None}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _wa_phone(raw: str) -> str:
    num = "".join(ch for ch in (raw or "") if ch.isdigit())
    if num.startswith("0"):
        num = num[1:]
    return f"91{num}" if len(num) == 10 else num


def _local_hour(phone: str) -> float:
    off = next((o for cc, o in _CC_OFFSETS if phone.startswith(cc)), 5.5)
    t = datetime.now(timezone.utc) + timedelta(hours=off)
    return t.hour + t.minute / 60


async def _settings() -> dict:
    doc = await _raw_db.platform_settings.find_one({"key": SETTINGS_KEY}, {"_id": 0}) or {}
    return {"enabled": bool(doc.get("enabled", False)), "daily_limit": int(doc.get("daily_limit", 25)),
            "start_hour": int(doc.get("start_hour", 10)), "end_hour": int(doc.get("end_hour", 19))}


async def template_status(force: bool = False) -> str:
    """APPROVED / PENDING / REJECTED / MISSING / UNKNOWN — cached 10 min (Meta review can take hours)."""
    if not force and _template_cache["checked_at"] and (datetime.now(timezone.utc) - _template_cache["checked_at"]) < timedelta(minutes=10):
        return _template_cache["status"]
    tok, waba = os.environ.get("WHATSAPP_ACCESS_TOKEN", ""), os.environ.get("WHATSAPP_BUSINESS_ACCOUNT_ID", "")
    status = "UNKNOWN"
    if tok and waba:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(f"https://graph.facebook.com/v22.0/{waba}/message_templates",
                                     params={"name": TEMPLATE, "fields": "name,status"}, headers={"Authorization": f"Bearer {tok}"})
            rows = [t for t in (r.json().get("data") or []) if t.get("name") == TEMPLATE]
            status = rows[0]["status"] if rows else "MISSING"
        except Exception as e:  # noqa: BLE001
            log.warning("template status check failed: %s", e)
    _template_cache.update(status=status, checked_at=datetime.now(timezone.utc))
    return status


def _intro_params(lead: dict) -> list[str]:
    noun = "restaurant" if (lead.get("vertical") or "salon") == "restaurant" else "salon"
    proof = f"{lead['rating']}⭐" if lead.get("rating") else "your reputation"
    if lead.get("reviews"):
        proof += f" with {lead['reviews']} reviews"
    return [(lead.get("owner_name") or "there").split()[0], lead.get("name") or f"your {noun}",
            lead.get("city") or "your city", proof, noun]


async def send_intro(lead: dict, auto: bool = True) -> dict:
    from services.whatsapp_cloud import send_template
    phone = _wa_phone(lead.get("phone") or "")
    if len(phone) < 10:
        return {"ok": False, "error": "No valid phone number"}
    try:
        res = await send_template(phone, TEMPLATE, _intro_params(lead))
    except Exception as e:  # noqa: BLE001
        await _raw_db.mira_leads.update_one({"id": lead["id"]}, {"$set": {"wa_intro_error": str(e)[:200], "wa_intro_attempted_at": _now()}})
        return {"ok": False, "error": str(e)[:200]}
    mid = ((res.get("messages") or [{}])[0]).get("id")
    await _raw_db.mira_leads.update_one({"id": lead["id"]}, {"$set": {
        "wa_intro_sent_at": _now(), "wa_intro_message_id": mid, "wa_intro_auto": auto, "wa_intro_error": None,
        "whatsapp_sent_at": _now()}})
    await _raw_db.mira_wa_intros.insert_one({"lead_id": lead["id"], "lead_name": lead.get("name"), "phone": phone,
                                             "message_id": mid, "auto": auto, "created_at": _now()})
    return {"ok": True, "message_id": mid}


async def auto_wa_hot_leads() -> int:
    """Scheduler: WhatsApp-intro hot leads discovered in the last 48h — in each lead's LOCAL business hours."""
    s = await _settings()
    if not s["enabled"] or await template_status() != "APPROVED":
        return 0
    today = datetime.now(timezone.utc).date().isoformat()
    sent_today = await _raw_db.mira_wa_intros.count_documents({"created_at": {"$gte": today}, "auto": True})
    budget = s["daily_limit"] - sent_today
    if budget <= 0:
        return 0
    since = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
    leads = await _raw_db.mira_leads.find(
        {**HOT_QUERY, "phone": {"$nin": ["", None]}, "do_not_call": {"$ne": True}, "wa_opt_out": {"$ne": True},
         "wa_intro_sent_at": {"$exists": False}, "wa_intro_attempted_at": {"$exists": False},
         "whatsapp_sent_at": {"$exists": False},
         "status": {"$nin": ["customer", "rejected", "sent", "replied", "demo"]},
         "created_at": {"$gte": since}},
        {"_id": 0}).sort("reviews", -1).to_list(40)
    leads = [ld for ld in leads if s["start_hour"] <= _local_hour(_wa_phone(ld.get("phone") or "")) < s["end_hour"]][:min(budget, 10)]
    n = 0
    for ld in leads:
        res = await send_intro(ld, auto=True)
        if res.get("ok"):
            n += 1
        await asyncio.sleep(1.5)
    if n:
        from routes.lead_common import log_mira_event
        await log_mira_event("wa_intro", f"Sent {n} WhatsApp intro{'s' if n != 1 else ''} to fresh hot leads")
        log.info("auto WA intro: %s hot leads greeted", n)
    return n


async def note_lead_reply(wa_id: str, text: str) -> None:
    """Inbound on the platform number: if it's a lead we introduced ourselves to, record the reply / opt-out."""
    tail = "".join(ch for ch in (wa_id or "") if ch.isdigit())[-10:]
    if len(tail) < 10:
        return
    lead = await _raw_db.mira_leads.find_one({"phone": {"$regex": f"{tail}$"}, "wa_intro_sent_at": {"$exists": True}}, {"_id": 0})
    if not lead:
        return
    upd = {"wa_intro_replied_at": _now(), "wa_intro_reply": (text or "")[:300]}
    low = (text or "").strip().lower()
    if low in ("stop", "stop promotions", "unsubscribe"):
        upd.update({"wa_opt_out": True, "do_not_call": True})
    elif lead.get("status") not in ("customer", "demo"):
        upd["status"] = "replied"
    await _raw_db.mira_leads.update_one({"id": lead["id"]}, {"$set": upd})
    from routes.lead_common import log_mira_event
    await log_mira_event("wa_reply", f"{lead.get('name') or 'A lead'} replied on WhatsApp: \"{(text or '')[:80]}\"")
    if not upd.get("wa_opt_out"):
        try:
            from routes.mira_outreach import notify_hq_conversion
            await notify_hq_conversion({**lead, **upd}, "wa_replied", text or "")
        except Exception:  # noqa: BLE001
            log.exception("conversion alert failed")


class AutoWaSettingsIn(BaseModel):
    enabled: bool
    daily_limit: int = Field(25, ge=1, le=100)


@router.get("/super-admin/mira-leads/auto-wa")
async def get_auto_wa(user=Depends(require_super_admin)):
    today = datetime.now(timezone.utc).date().isoformat()
    return {**await _settings(), "template": TEMPLATE, "template_status": await template_status(),
            "sent_today": await _raw_db.mira_wa_intros.count_documents({"created_at": {"$gte": today}}),
            "replied_total": await _raw_db.mira_leads.count_documents({"wa_intro_replied_at": {"$exists": True}})}


@router.put("/super-admin/mira-leads/auto-wa")
async def set_auto_wa(body: AutoWaSettingsIn, user=Depends(require_super_admin)):
    await _raw_db.platform_settings.update_one(
        {"key": SETTINGS_KEY}, {"$set": {"enabled": body.enabled, "daily_limit": body.daily_limit, "updated_at": _now()}}, upsert=True)
    return {"ok": True, **await _settings(), "template_status": await template_status(force=True)}


@router.post("/super-admin/mira-leads/{lid}/wa-intro")
async def send_intro_now(lid: str, user=Depends(require_super_admin)):
    """One lead, right now (still requires the approved template)."""
    from fastapi import HTTPException
    lead = await _raw_db.mira_leads.find_one({"id": lid}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    if await template_status() != "APPROVED":
        raise HTTPException(409, f"Template '{TEMPLATE}' is not approved by Meta yet")
    res = await send_intro(lead, auto=False)
    if not res.get("ok"):
        raise HTTPException(502, res.get("error") or "Send failed")
    return res
