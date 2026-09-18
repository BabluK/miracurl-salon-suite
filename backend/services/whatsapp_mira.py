"""Mira AI auto-replies for inbound WhatsApp messages (Meta Cloud API webhook → Mira → send_text)."""
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone

from database import _raw_db

log = logging.getLogger("whatsapp.mira")
_TEXT_TYPES = {"text", "button", "interactive"}
LOW_CREDIT_THRESHOLD = 20
_MD = re.compile(r"\*\*(.+?)\*\*", re.DOTALL)


def _to_whatsapp_text(reply: str) -> str:
    # WhatsApp uses single-star bold; drop leftover markdown bullets/headers.
    out = _MD.sub(r"*\1*", reply or "")
    out = re.sub(r"^\s*[-•]\s+", "• ", out, flags=re.MULTILINE)
    return out.strip()[:4000]


_STOP = {"hi", "hello", "hey", "namaste", "salon", "the", "and", "for", "book", "booking", "appointment", "please", "want", "need", "at", "in", "to", "a", "i"}


async def _match_tenant_by_name(text: str) -> dict | None:
    """Best-effort salon lookup from free text ('hi glow studio koramangala') — needs ≥1 distinctive word to match."""
    words = [w for w in re.findall(r"[a-z0-9]{3,}", (text or "").lower()) if w not in _STOP]
    if not words:
        return None
    best, best_score = None, 0
    async for t in _raw_db.tenants.find({"status": {"$ne": "suspended"}}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "location": 1}):
        hay = f"{t.get('name', '')} {t.get('slug', '')} {t.get('location', '')}".lower()
        score = sum(1 for w in words if w in hay)
        if score > best_score:
            best, best_score = t, score
    if best and best_score >= 1 and any(w in (best.get("name") or "").lower() for w in words):
        return await _raw_db.tenants.find_one({"id": best["id"]}, {"_id": 0})
    return None


async def _platform_fallback(doc: dict, tenant: dict | None) -> str | None:
    """Shared Miracurl number, no salon resolved: try matching the salon name, else ask which salon (HQ pays, no credits)."""
    from services import wa_receptionist as rec
    from services.whatsapp_cloud import send_text, wa_config
    pid = wa_config()["phone_number_id"]
    if tenant or (doc.get("phone_number_id") and pid and doc["phone_number_id"] != pid):
        log.warning("whatsapp inbound on unknown phone_number_id %s (platform is …%s) — no reply", doc.get("phone_number_id"), pid[-4:])
        await _raw_db.whatsapp_messages.update_one({"message_id": doc.get("message_id")}, {"$set": {"status": "skipped_unknown_number"}})
        return None
    wa_id = doc["wa_id"]
    t = await _match_tenant_by_name(doc.get("text") or "")
    if t:
        await rec.touch_session(wa_id, t["id"])
        await _raw_db.whatsapp_messages.update_one({"message_id": doc.get("message_id")}, {"$set": {"tenant_id": t["id"]}})
        await send_text(wa_id, f"Connecting you to *{t.get('name')}* ✦")
        return await mira_whatsapp_reply({**doc, "tenant_id": t["id"], "_fb": True}, None)
    body = ("Hi! I'm Mira ✦ the AI receptionist for salons on Miracurl.\n\n"
            "Which salon would you like to reach? Reply with the *salon name* (and area), or tap the salon's own WhatsApp link / QR "
            "and I'll take it from there 💛")
    await send_text(wa_id, body)
    await _raw_db.whatsapp_messages.update_one({"message_id": doc.get("message_id")}, {"$set": {"status": "asked_salon", "mira_reply": body}})
    log.info("mira asked %s which salon (no tenant resolved on platform number)", wa_id)
    return body



async def mira_whatsapp_reply(doc: dict, tenant: dict | None) -> str | None:
    """Generate + send Mira's reply for one stored inbound message. Returns the reply text (or None if skipped)."""
    if doc.get("type") not in _TEXT_TYPES or not (doc.get("text") or "").strip():
        return None
    from services import wa_receptionist as rec
    t = await rec.resolve_inbound_tenant(doc, tenant)
    if t and not doc.get("tenant_id"):
        await _raw_db.whatsapp_messages.update_one({"message_id": doc.get("message_id")}, {"$set": {"tenant_id": t["id"]}})
    if not t:
        return None if doc.get("_fb") else await _platform_fallback(doc, tenant)
    from services.tenant_features import features_of
    if t.get("status") == "suspended" or t.get("wa_auto_reply") is False or not features_of(t)["whatsapp"]:
        reason = "suspended" if t.get("status") == "suspended" else "auto_reply_off" if t.get("wa_auto_reply") is False else "whatsapp_feature_off"
        await _raw_db.whatsapp_messages.update_one({"message_id": doc.get("message_id")}, {"$set": {"status": f"skipped_{reason}"}})
        log.warning("whatsapp auto-reply skipped for %s — %s", t.get("slug"), reason)
        return None
    wa_id = doc["wa_id"]
    session = await rec.get_session(wa_id)
    if rec.human_active(session):
        await _raw_db.whatsapp_messages.update_one({"message_id": doc.get("message_id")}, {"$set": {"status": "human_queue"}})
        from services.tenant_notices import notify_tenant
        await notify_tenant(t["id"], "wa_human_msg", f"New WhatsApp message from {doc.get('profile_name') or '+' + wa_id}",
                            (doc["text"] or "")[:90], "/receptionist", f"wa_human_msg:{wa_id}:{doc.get('message_id')}")
        return None
    from services.wa_coexist import own_channel
    own = own_channel(t) is not None
    if not own and not await _reserve_credit(t, doc):
        return None
    text = rec.strip_ref(doc["text"])
    body, booking, handoff = await rec.mira_reply_text(t, wa_id, text)
    if not body:
        if not own:
            await _refund_credit(t, doc)
        return None
    try:
        body = await rec.deliver_reply(t, wa_id, body)
    except Exception:
        if not own:
            await _refund_credit(t, doc)
        raise
    await rec.touch_session(wa_id, t["id"])
    if handoff:
        await rec.set_human_mode(wa_id, t["id"], True, by="mira")
        await rec.notify_handoff(t, wa_id, doc.get("profile_name") or "", text)
    await _raw_db.whatsapp_messages.update_one(
        {"message_id": doc.get("message_id")},
        {"$set": {"status": "replied", "mira_reply": body, "mira_booked": bool(booking), "handoff": bool(handoff), "credits_used": 0 if own else 1}})
    log.info("mira replied on whatsapp to %s (%s)%s", wa_id, t.get("slug"), " [booked]" if booking else "")
    return body


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
            from services.hq_emails import wa_credits_exhausted_email
            subj, html = wa_credits_exhausted_email(t)
            await _send_email([owner["email"]], subj, html, book_url=f"{os.environ.get('APP_PUBLIC_URL', '').rstrip('/')}/settings", book_label="Top up now ✦")
    except Exception:
        log.exception("owner no-credit alert failed for %s", t.get("slug"))
