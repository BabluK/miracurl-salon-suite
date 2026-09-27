"""Inbound WhatsApp processing (webhook payload → store → Mira reply). Depends one-way on whatsapp_cloud + whatsapp_mira."""
import logging

from database import _raw_db
from services.whatsapp_cloud import _message_text, _now, _record_event, tenant_for_phone_number_id
from services.whatsapp_mira import mira_whatsapp_reply

log = logging.getLogger("whatsapp")


async def handle_inbound_message(msg: dict, value: dict) -> None:
    """Customer → business message. Stores it; Mira AI / booking intents hook in here later."""
    if not await _record_event(f"message:{msg.get('id')}", "inbound_message", msg, {"metadata": value.get("metadata")}):
        return
    meta = value.get("metadata") or {}
    contact = next(iter(value.get("contacts") or []), {}) or {}
    tenant = await tenant_for_phone_number_id(meta.get("phone_number_id", ""))
    doc = {
        "direction": "inbound", "message_id": msg.get("id"), "wa_id": msg.get("from"),
        "profile_name": (contact.get("profile") or {}).get("name", ""),
        "type": msg.get("type"), "text": _message_text(msg), "raw": msg,
        "phone_number_id": meta.get("phone_number_id"), "display_phone_number": meta.get("display_phone_number"),
        "tenant_id": (tenant or {}).get("id"), "status": "received",
        "wa_timestamp": msg.get("timestamp"), "created_at": _now(),
    }
    await _raw_db.whatsapp_messages.insert_one(doc)
    log.info("whatsapp inbound %s from %s (%s): %.80s", msg.get("type"), msg.get("from"), (tenant or {}).get("slug") or "platform", doc["text"])
    if not tenant:
        try:
            from routes.lead_wa_auto import note_lead_reply
            await note_lead_reply(doc["wa_id"], doc["text"])
        except Exception:  # noqa: BLE001
            log.exception("lead reply tracking failed for %s", msg.get("id"))
    try:
        await mira_whatsapp_reply(doc, tenant)
    except Exception:  # noqa: BLE001 — a failed AI reply must never fail the webhook
        log.exception("mira whatsapp reply failed for %s", msg.get("id"))


async def _refund_credit(message_id: str | None) -> None:
    """Meta never delivered a tenant's marketing template (131049 cap / 131026 undeliverable) → give the credit back once."""
    if not message_id:
        return
    doc = await _raw_db.whatsapp_messages.find_one_and_update(
        {"message_id": message_id, "tenant_id": {"$ne": None}, "own_number": {"$ne": True}, "type": "template",
         "credit_refunded": {"$ne": True}},
        {"$set": {"credit_refunded": True}}, projection={"_id": 0, "tenant_id": 1, "template": 1})
    if not doc:
        return
    await _raw_db.tenants.update_one({"id": doc["tenant_id"]}, {"$inc": {"wa_points": 1}})
    await _raw_db.sms_credit_log.insert_one({"tenant_id": doc["tenant_id"], "points": 1, "source": "meta_delivery_failed_refund",
                                             "channel": "whatsapp", "template": doc.get("template"), "message_id": message_id, "at": _now()})
    log.info("refunded 1 WhatsApp credit to tenant %s for undelivered %s", doc["tenant_id"], message_id)


async def handle_status_update(st: dict, value: dict) -> None:
    """Business → customer lifecycle: sent / delivered / read / failed."""
    key = f"status:{st.get('id')}:{st.get('status')}"
    if not await _record_event(key, "message_status", st):
        return
    upd = {"status": st.get("status"), "status_at": _now(), "wa_timestamp": st.get("timestamp")}
    if st.get("status") == "failed":
        upd["errors"] = st.get("errors") or []
        log.warning("whatsapp message %s FAILED for %s: %s", st.get("id"), st.get("recipient_id"), upd["errors"])
        await _refund_credit(st.get("id"))
    if st.get("conversation"):
        upd["conversation"] = st.get("conversation")
    if st.get("pricing"):
        upd["pricing"] = st.get("pricing")
    await _raw_db.whatsapp_messages.update_one({"message_id": st.get("id")}, {"$set": upd})
    log.info("whatsapp status %s → %s", st.get("id"), st.get("status"))


async def handle_app_echo(msg: dict, value: dict) -> None:
    """Coexistence: the owner typed a reply in their WhatsApp Business app — mirror it and let Mira stand back for 2h."""
    if not await _record_event(f"echo:{msg.get('id')}", "smb_message_echo", msg, {"metadata": value.get("metadata")}):
        return
    meta = value.get("metadata") or {}
    tenant = await tenant_for_phone_number_id(meta.get("phone_number_id", ""))
    to = msg.get("to") or ""
    await _raw_db.whatsapp_messages.insert_one({
        "direction": "outbound", "message_id": msg.get("id"), "wa_id": to, "type": msg.get("type"), "text": _message_text(msg), "sent_by": "app",
        "phone_number_id": meta.get("phone_number_id"), "own_number": True, "tenant_id": (tenant or {}).get("id"), "status": "sent",
        "wa_timestamp": msg.get("timestamp"), "created_at": _now()})
    if tenant and to:
        from services.wa_receptionist import set_human_mode
        await set_human_mode(to, tenant["id"], True, by="whatsapp_app")


async def process_webhook_payload(payload: dict) -> dict:
    counts = {"messages": 0, "statuses": 0, "errors": 0}
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            if change.get("field") == "smb_message_echoes":
                for msg in value.get("message_echoes") or []:
                    try:
                        await handle_app_echo(msg, value); counts["messages"] += 1
                    except Exception:  # noqa: BLE001
                        counts["errors"] += 1; log.exception("whatsapp echo handler failed")
                continue
            if change.get("field") in ("history", "smb_app_state_sync", "account_update"):
                await _record_event(f"{change['field']}:{entry.get('id')}:{hash(str(value)) & 0xffffffff}", change["field"], value)
                continue
            for msg in value.get("messages") or []:
                try:
                    await handle_inbound_message(msg, value); counts["messages"] += 1
                except Exception:  # noqa: BLE001 — never let one bad message block the batch
                    counts["errors"] += 1; log.exception("whatsapp inbound handler failed")
            for st in value.get("statuses") or []:
                try:
                    await handle_status_update(st, value); counts["statuses"] += 1
                except Exception:  # noqa: BLE001
                    counts["errors"] += 1; log.exception("whatsapp status handler failed")
            for err in value.get("errors") or []:
                log.warning("whatsapp webhook error payload: %s", err)
    return counts


