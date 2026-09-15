"""Mira AI auto-replies for inbound WhatsApp messages (Meta Cloud API webhook → Mira → send_text)."""
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone

from database import _current_tenant_id, _raw_db

log = logging.getLogger("whatsapp.mira")
_TEXT_TYPES = {"text", "button", "interactive"}
LOW_CREDIT_THRESHOLD = 20
_MD = re.compile(r"\*\*(.+?)\*\*", re.DOTALL)


def _to_whatsapp_text(reply: str) -> str:
    # WhatsApp uses single-star bold; drop leftover markdown bullets/headers.
    out = _MD.sub(r"*\1*", reply or "")
    out = re.sub(r"^\s*[-•]\s+", "• ", out, flags=re.MULTILINE)
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
    if not await _reserve_credit(t, doc):
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
            await _refund_credit(t, doc)
            return None
        try:
            await send_text(wa_id, body, tenant_id=t["id"])
        except Exception:
            await _refund_credit(t, doc)
            raise
        await _raw_db.whatsapp_messages.update_one(
            {"message_id": doc.get("message_id")},
            {"$set": {"status": "replied", "mira_reply": body, "mira_booked": bool(booking), "credits_used": 1}})
        log.info("mira replied on whatsapp to %s (%s)%s", wa_id, t.get("slug"), " [booked]" if booking else "")
        return body
    finally:
        _current_tenant_id.reset(token)


async def _reserve_credit(t: dict, doc: dict) -> bool:
    """Atomically spend 1 WhatsApp credit; on empty balance mark the message and alert the owner once a day."""
    r = await _raw_db.tenants.update_one({"id": t["id"], "wa_points": {"$gte": 1}}, {"$inc": {"wa_points": -1}})
    now = datetime.now(timezone.utc)
    if r.modified_count:
        await _raw_db.sms_credit_log.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": t["id"], "points": -1, "source": "mira_auto_reply", "channel": "whatsapp",
            "message_id": doc.get("message_id"), "wa_id": doc.get("wa_id"), "at": now.isoformat()})
        left = int(t.get("wa_points") or 0) - 1
        if left < LOW_CREDIT_THRESHOLD:
            from services.tenant_notices import notify_tenant
            await notify_tenant(t["id"], "wa_credits_low", f"Only {left} WhatsApp credits left",
                                "Mira stops answering WhatsApp at 0 — top up to keep bookings flowing.", "/settings",
                                f"wa_credits_low:{now.date().isoformat()}")
        return True
    await _raw_db.whatsapp_messages.update_one({"message_id": doc.get("message_id")}, {"$set": {"status": "no_credits"}})
    last = t.get("wa_credits_alert_at") or ""
    if last < (now - timedelta(days=1)).isoformat():
        await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"wa_credits_alert_at": now.isoformat()}})
        await _alert_owner_no_credits(t)
    log.warning("whatsapp auto-reply skipped for %s — no WhatsApp credits", t.get("slug"))
    return False


async def _refund_credit(t: dict, doc: dict) -> None:
    await _raw_db.tenants.update_one({"id": t["id"]}, {"$inc": {"wa_points": 1}})
    await _raw_db.sms_credit_log.delete_one({"message_id": doc.get("message_id"), "source": "mira_auto_reply"})


async def _alert_owner_no_credits(t: dict) -> None:
    """Bell notice (deduped per day) + owner email so the salon tops up quickly."""
    from email_service import _send_email
    from services.tenant_notices import notify_tenant
    day = datetime.now(timezone.utc).date().isoformat()
    await notify_tenant(t["id"], "wa_credits", "WhatsApp credits exhausted — Mira paused auto-replies",
                        "A customer messaged you on WhatsApp. Top up to resume AI replies & bookings.", "/settings", f"wa_credits:{day}")
    try:
        owner = await _raw_db.users.find_one({"tenant_id": t["id"], "role": "admin"}, {"_id": 0, "email": 1})
        if owner and owner.get("email"):
            await _send_email([owner["email"]], f"{t.get('name')}: WhatsApp credits exhausted — Mira has paused auto-replies",
                              "<p>Hi,</p><p>A customer messaged you on WhatsApp but Mira could not reply because your WhatsApp credit "
                              "balance is 0.</p><p>Top up from <b>Settings → SMS &amp; WhatsApp Packs</b> and Mira will resume "
                              "answering and booking automatically.</p><p>— Miracurl</p>")
    except Exception:
        log.exception("owner no-credit alert failed for %s", t.get("slug"))
