"""HQ WhatsApp outreach: pre-flight number check, one-click send via the Meta (platform) number, and a unified history."""
import logging
import os
import re
from datetime import datetime, timezone

import phonenumbers
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import _raw_db
from security import require_super_admin

router = APIRouter()
log = logging.getLogger("lead_wa_outreach")

_TYPE_LABEL = {
    phonenumbers.PhoneNumberType.MOBILE: ("mobile", True, "Mobile — WhatsApp likely"),
    phonenumbers.PhoneNumberType.FIXED_LINE_OR_MOBILE: ("mobile_or_landline", True, "Mobile/landline — WhatsApp possible"),
    phonenumbers.PhoneNumberType.FIXED_LINE: ("landline", False, "Landline — no WhatsApp on this number"),
    phonenumbers.PhoneNumberType.VOIP: ("voip", False, "VoIP number — WhatsApp unlikely"),
    phonenumbers.PhoneNumberType.TOLL_FREE: ("toll_free", False, "Toll-free line — no WhatsApp"),
    phonenumbers.PhoneNumberType.PREMIUM_RATE: ("premium", False, "Premium-rate line — no WhatsApp"),
}
NOT_ON_WA_CODES = {131026}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _digits(raw: str) -> str:
    num = re.sub(r"\D", "", raw or "")
    if num.startswith("0"):
        num = num[1:]
    return f"91{num}" if len(num) == 10 else num


async def check_phone(raw: str) -> dict:
    """Landline/mobile classification + what we already learned from Meta delivery receipts for this number."""
    digits = _digits(raw)
    out = {"phone": digits, "valid": False, "type": "unknown", "wa_likely": True, "label": "Unknown number type",
           "country": "", "known": None}
    try:
        n = phonenumbers.parse("+" + digits)
        out["valid"] = phonenumbers.is_valid_number(n)
        out["country"] = phonenumbers.region_code_for_number(n) or ""
        t, likely, label = _TYPE_LABEL.get(phonenumbers.number_type(n), ("unknown", True, "Unknown number type"))
        out.update(type=t, wa_likely=likely if out["valid"] else False, label=label if out["valid"] else "Invalid phone number")
    except phonenumbers.NumberParseException:
        out["label"] = "Invalid phone number"
    msgs = await _raw_db.whatsapp_messages.find({"wa_id": digits, "direction": "outbound"}, {"_id": 0, "status": 1, "errors": 1}).sort("created_at", -1).to_list(5)
    for m in msgs:
        if m.get("status") in ("delivered", "read"):
            out.update(known="on_whatsapp", wa_likely=True, label="Delivered before — on WhatsApp ✓")
            break
        if m.get("status") == "failed" and any((e.get("code") in NOT_ON_WA_CODES) for e in (m.get("errors") or [])):
            out.update(known="not_on_whatsapp", wa_likely=False, label="Meta confirmed: not on WhatsApp")
            break
    if await _raw_db.whatsapp_messages.find_one({"wa_id": digits, "direction": "inbound"}, {"_id": 1}):
        out.update(known="on_whatsapp", wa_likely=True, label="They've messaged us — on WhatsApp ✓")
    return out


def _template_preview(body: str, params: list[str]) -> str:
    for i, p in enumerate(params, 1):
        body = body.replace("{{%d}}" % i, str(p))
    return body


async def _template_body() -> str:
    doc = await _raw_db.platform_settings.find_one({"key": "wa_lead_intro_body"}, {"_id": 0}) or {}
    if doc.get("body") and doc.get("fetched_at", "") > (datetime.now(timezone.utc).replace(hour=0, minute=0)).isoformat():
        return doc["body"]
    import httpx
    from routes.lead_wa_auto import TEMPLATE
    tok, waba = os.environ.get("WHATSAPP_ACCESS_TOKEN", ""), os.environ.get("WHATSAPP_BUSINESS_ACCOUNT_ID", "")
    body = doc.get("body") or ""
    if tok and waba:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(f"https://graph.facebook.com/v22.0/{waba}/message_templates",
                                     params={"name": TEMPLATE, "fields": "name,components"}, headers={"Authorization": f"Bearer {tok}"})
            for t in r.json().get("data") or []:
                if t.get("name") == TEMPLATE:
                    body = next((c.get("text", "") for c in t.get("components", []) if c.get("type") == "BODY"), body)
            await _raw_db.platform_settings.update_one({"key": "wa_lead_intro_body"}, {"$set": {"body": body, "fetched_at": _now()}}, upsert=True)
        except Exception as e:  # noqa: BLE001
            log.warning("template body fetch failed: %s", e)
    return body


@router.get("/super-admin/wa-outreach/channel")
async def wa_outreach_channel(user=Depends(require_super_admin)):
    """Is one-click sending via the Meta platform number available right now?"""
    from routes.lead_wa_auto import TEMPLATE, template_status
    status = await template_status()
    configured = bool(os.environ.get("WHATSAPP_ACCESS_TOKEN") and os.environ.get("WHATSAPP_PHONE_NUMBER_ID"))
    return {"meta_ready": configured and status == "APPROVED", "configured": configured, "template": TEMPLATE,
            "template_status": status, "template_body": await _template_body() if configured else "",
            "platform_number": os.environ.get("WHATSAPP_PLATFORM_NUMBER", "")}


@router.get("/super-admin/wa-outreach/check/{lid}")
async def wa_outreach_check(lid: str, user=Depends(require_super_admin)):
    lead = await _raw_db.mira_leads.find_one({"id": lid}, {"_id": 0, "phone": 1})
    if not lead:
        raise HTTPException(404, "Lead not found")
    return await check_phone(lead.get("phone") or "")


async def record_outreach(lead: dict, channel: str, by: str, message_id: str | None = None, text: str = "", status: str = "accepted") -> dict:
    row = {"id": f"{lead['id']}:{_now()}", "lead_id": lead["id"], "lead_name": lead.get("name"), "city": lead.get("city", ""),
           "vertical": lead.get("vertical") or "salon", "phone": _digits(lead.get("phone") or ""), "channel": channel,
           "message_id": message_id, "text": (text or "")[:600], "status": status, "by": by, "created_at": _now()}
    await _raw_db.mira_wa_outreach.insert_one(dict(row))
    return row


class SendMetaIn(BaseModel):
    force: bool = Field(False, description="send even when the pre-flight check says the number is unlikely on WhatsApp")


@router.post("/super-admin/wa-outreach/{lid}/send-meta")
async def wa_outreach_send_meta(lid: str, body: SendMetaIn, user=Depends(require_super_admin)):
    """One click: send the approved `miracurl_lead_intro` template from the Meta platform number and log it."""
    from routes.lead_wa_auto import _intro_params, send_intro, template_status
    lead = await _raw_db.mira_leads.find_one({"id": lid}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    if lead.get("wa_opt_out") or lead.get("do_not_call"):
        raise HTTPException(409, "This lead opted out of WhatsApp — not sending")
    if await template_status() != "APPROVED":
        raise HTTPException(409, "Meta template miracurl_lead_intro is not approved yet — use manual WhatsApp for now")
    check = await check_phone(lead.get("phone") or "")
    if not check["valid"]:
        raise HTTPException(400, f"+{check['phone']} is not a valid phone number")
    if not check["wa_likely"] and not body.force:
        raise HTTPException(409, f"{check['label']} — skip, or send anyway with force")
    res = await send_intro(lead, auto=False)
    if not res.get("ok"):
        await record_outreach(lead, "meta", user.get("email", ""), None, "", "failed")
        raise HTTPException(502, f"Meta send failed — {res.get('error')}")
    preview = _template_preview(await _template_body(), _intro_params(lead))
    row = await record_outreach(lead, "meta", user.get("email", ""), res.get("message_id"), preview)
    await _raw_db.mira_leads.update_one({"id": lid}, {"$set": {"status": "sent", "sent_via": "whatsapp_meta", "sent_at": _now(),
                                                             "approved_by": user.get("email"), "wa_check": check}})
    return {"ok": True, "message_id": res.get("message_id"), "outreach": row, "check": check}


@router.post("/super-admin/wa-outreach/{lid}/manual-sent")
async def wa_outreach_manual_sent(lid: str, user=Depends(require_super_admin)):
    """HQ opened wa.me from their own phone/WhatsApp Web and sent Mira's custom text — log it for the history."""
    lead = await _raw_db.mira_leads.find_one({"id": lid}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    row = await record_outreach(lead, "manual", user.get("email", ""), None, lead.get("wa_draft") or "", "sent_manually")
    await _raw_db.mira_leads.update_one({"id": lid}, {"$set": {"status": "sent", "sent_via": "whatsapp", "sent_at": _now(),
                                                             "whatsapp_sent_at": _now(), "approved_by": user.get("email")}})
    return {"ok": True, "outreach": row}


_ERR_HINT = {131026: "Not on WhatsApp (or hasn't accepted the new terms)", 131049: "Meta frequency cap — marketing message skipped for this number",
             131047: "Outside 24h window — template required", 131030: "Test number — recipient not allow-listed"}


@router.get("/super-admin/wa-outreach/history")
async def wa_outreach_history(limit: int = 150, channel: str = "", user=Depends(require_super_admin)):
    """Every HQ WhatsApp outreach (Meta one-click + manual) with live delivery status from Meta receipts."""
    q = {"channel": channel} if channel in ("meta", "manual") else {}
    rows = await _raw_db.mira_wa_outreach.find(q, {"_id": 0}).sort("created_at", -1).to_list(max(1, min(limit, 500)))
    mids = [r["message_id"] for r in rows if r.get("message_id")]
    status_by = {}
    if mids:
        async for m in _raw_db.whatsapp_messages.find({"message_id": {"$in": mids}}, {"_id": 0, "message_id": 1, "status": 1, "errors": 1, "status_at": 1}):
            status_by[m["message_id"]] = m
    lead_ids = list({r["lead_id"] for r in rows})
    leads = {l["id"]: l async for l in _raw_db.mira_leads.find({"id": {"$in": lead_ids}}, {"_id": 0, "id": 1, "status": 1, "wa_intro_replied_at": 1, "replied_at": 1, "wa_intro_reply": 1})}
    out = []
    for r in rows:
        m = status_by.get(r.get("message_id") or "")
        if m:
            r["status"] = m.get("status") or r["status"]
            errs = m.get("errors") or []
            code = errs[0].get("code") if errs else None
            r["error"] = _ERR_HINT.get(code, errs[0].get("title") if errs else None)
            r["error_code"] = code
            r["status_at"] = m.get("status_at")
        ld = leads.get(r["lead_id"]) or {}
        r["lead_status"] = ld.get("status")
        r["replied_at"] = ld.get("wa_intro_replied_at") or ld.get("replied_at")
        r["reply"] = ld.get("wa_intro_reply")
        out.append(r)
    counts = {"meta": await _raw_db.mira_wa_outreach.count_documents({"channel": "meta"}),
              "manual": await _raw_db.mira_wa_outreach.count_documents({"channel": "manual"}),
              "not_on_wa": sum(1 for r in out if r.get("error_code") in NOT_ON_WA_CODES),
              "replied": sum(1 for r in out if r.get("replied_at"))}
    return {"items": out, "counts": counts}


@router.delete("/super-admin/wa-outreach/history/{oid}")
async def wa_outreach_delete(oid: str, user=Depends(require_super_admin)):
    r = await _raw_db.mira_wa_outreach.delete_one({"id": oid})
    if not r.deleted_count:
        raise HTTPException(404, "Entry not found")
    return {"ok": True}
