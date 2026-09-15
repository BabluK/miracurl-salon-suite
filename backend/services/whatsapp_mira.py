"""Mira AI auto-replies for inbound WhatsApp messages (Meta Cloud API webhook → Mira → send_text)."""
import logging
import os
import re

from database import _raw_db, _current_tenant_id

log = logging.getLogger("whatsapp.mira")
_TEXT_TYPES = {"text", "button", "interactive"}
_MD = re.compile(r"\*\*(.+?)\*\*", re.S)


def _to_whatsapp_text(reply: str) -> str:
    # WhatsApp uses single-star bold; drop leftover markdown bullets/headers.
    out = _MD.sub(r"*\1*", reply or "")
    out = re.sub(r"^\s*[-•]\s+", "• ", out, flags=re.M)
    return out.strip()[:4000]


async def resolve_reply_tenant(tenant: dict | None, phone_number_id: str) -> dict | None:
    """Tenant-owned number → that tenant. Platform number → WHATSAPP_DEFAULT_TENANT_SLUG (optional)."""
    tid = (tenant or {}).get("id")
    if not tid and phone_number_id and phone_number_id == os.environ.get("WHATSAPP_PHONE_NUMBER_ID", ""):
        slug = os.environ.get("WHATSAPP_DEFAULT_TENANT_SLUG", "")
        if slug:
            t = await _raw_db.tenants.find_one({"slug": slug}, {"_id": 0})
            return t
        return None
    if not tid:
        return None
    return await _raw_db.tenants.find_one({"id": tid}, {"_id": 0})


async def mira_whatsapp_reply(doc: dict, tenant: dict | None) -> str | None:
    """Generate + send Mira's reply for one stored inbound message. Returns the reply text (or None if skipped)."""
    if doc.get("type") not in _TEXT_TYPES or not (doc.get("text") or "").strip():
        return None
    t = await resolve_reply_tenant(tenant, doc.get("phone_number_id") or "")
    if not t or t.get("status") == "suspended" or t.get("wa_auto_reply") is False:
        return None
    from routes.public_chat import _instant_faq_reply, _public_ai_reply
    from services.whatsapp_cloud import send_text

    token = _current_tenant_id.set(t["id"])
    try:
        text = doc["text"].strip()
        wa_id = doc["wa_id"]
        reply = await _instant_faq_reply(t, text)
        booking = None
        if not reply:
            reply, booking, _err, _handoff = await _public_ai_reply(t, f"wa-{wa_id}", text)
        body = _to_whatsapp_text(reply)
        if not body:
            return None
        await send_text(wa_id, body, tenant_id=t["id"])
        await _raw_db.whatsapp_messages.update_one(
            {"message_id": doc.get("message_id")},
            {"$set": {"status": "replied", "mira_reply": body, "mira_booked": bool(booking)}})
        log.info("mira replied on whatsapp to %s (%s)%s", wa_id, t.get("slug"), " [booked]" if booking else "")
        return body
    finally:
        _current_tenant_id.reset(token)
