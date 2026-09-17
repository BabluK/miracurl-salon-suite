"""Meta WhatsApp Business Cloud API — send helpers + inbound/status processing hooks.

Webhook route lives in routes/whatsapp_webhook.py. Mira AI / appointment / CRM hooks plug into
`handle_inbound_message` and `handle_status_update` below.
"""
import hashlib
import hmac
import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from database import _raw_db

log = logging.getLogger("whatsapp")
GRAPH_API_VERSION = "v26.0"


def wa_config() -> dict:
    return {
        "verify_token": os.environ.get("WHATSAPP_VERIFY_TOKEN", ""),
        "access_token": os.environ.get("WHATSAPP_ACCESS_TOKEN", ""),
        "phone_number_id": os.environ.get("WHATSAPP_PHONE_NUMBER_ID", ""),
        "waba_id": os.environ.get("WHATSAPP_BUSINESS_ACCOUNT_ID", ""),
        "app_id": os.environ.get("META_APP_ID", ""),
        "app_secret": os.environ.get("META_APP_SECRET", ""),
    }


def verify_signature(raw_body: bytes, header: Optional[str]) -> bool:
    """Meta signs every POST as sha256=<HMAC-SHA256(raw_body, META_APP_SECRET)>."""
    secret = wa_config()["app_secret"]
    if not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(header[7:], expected)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _record_event(event_key: str, kind: str, payload: dict, extra: dict | None = None) -> bool:
    """Idempotent store — Meta retries deliveries. Returns False when already seen."""
    res = await _raw_db.whatsapp_events.update_one(
        {"event_key": event_key},
        {"$setOnInsert": {"event_key": event_key, "kind": kind, "payload": payload, **(extra or {}), "created_at": _now()}},
        upsert=True)
    return res.upserted_id is not None


async def tenant_for_phone_number_id(phone_number_id: str) -> Optional[dict]:
    """Multi-tenant hook: a salon that connected its own WhatsApp number stores `whatsapp_phone_number_id`."""
    if not phone_number_id:
        return None
    return await _raw_db.tenants.find_one({"whatsapp_phone_number_id": phone_number_id},
                                          {"_id": 0, "id": 1, "name": 1, "slug": 1, "business_type": 1})


def _message_text(msg: dict) -> str:
    t = msg.get("type")
    if t == "text":
        return (msg.get("text") or {}).get("body", "")
    if t == "button":
        return (msg.get("button") or {}).get("text", "")
    if t == "interactive":
        inter = msg.get("interactive") or {}
        return ((inter.get("button_reply") or inter.get("list_reply") or {}).get("title", ""))
    if t in ("image", "video", "audio", "document", "sticker"):
        return (msg.get(t) or {}).get("caption", "") or f"[{t}]"
    if t == "location":
        loc = msg.get("location") or {}
        return f"[location {loc.get('latitude')},{loc.get('longitude')}]"
    return f"[{t}]"


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
    try:
        from services.whatsapp_mira import mira_whatsapp_reply
        await mira_whatsapp_reply(doc, tenant)
    except Exception:  # noqa: BLE001 — a failed AI reply must never fail the webhook
        log.exception("mira whatsapp reply failed for %s", msg.get("id"))


async def handle_status_update(st: dict, value: dict) -> None:
    """Business → customer lifecycle: sent / delivered / read / failed."""
    key = f"status:{st.get('id')}:{st.get('status')}"
    if not await _record_event(key, "message_status", st):
        return
    upd = {"status": st.get("status"), "status_at": _now(), "wa_timestamp": st.get("timestamp")}
    if st.get("status") == "failed":
        upd["errors"] = st.get("errors") or []
        log.warning("whatsapp message %s FAILED for %s: %s", st.get("id"), st.get("recipient_id"), upd["errors"])
    if st.get("conversation"):
        upd["conversation"] = st.get("conversation")
    if st.get("pricing"):
        upd["pricing"] = st.get("pricing")
    await _raw_db.whatsapp_messages.update_one({"message_id": st.get("id")}, {"$set": upd})
    log.info("whatsapp status %s → %s", st.get("id"), st.get("status"))


async def process_webhook_payload(payload: dict) -> dict:
    counts = {"messages": 0, "statuses": 0, "errors": 0}
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
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


async def send_template(to: str, name: str, params: list[str], tenant_id: str | None = None, lang: str = "en") -> dict[str, Any]:
    """Business-initiated message via an approved Meta template (required outside the 24h service window)."""
    cfg = wa_config()
    if not cfg["access_token"] or not cfg["phone_number_id"]:
        raise RuntimeError("WhatsApp Cloud API not configured")
    if tenant_id:
        from services.tenant_features import feature_on
        if not await feature_on(tenant_id, "whatsapp"):
            raise RuntimeError("WhatsApp is not enabled for this tenant")
    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{cfg['phone_number_id']}/messages"
    payload = {"messaging_product": "whatsapp", "to": to, "type": "template",
               "template": {"name": name, "language": {"code": lang},
                            "components": [{"type": "body", "parameters": [{"type": "text", "text": str(p)[:1024]} for p in params]}]}}
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(url, json=payload, headers={"Authorization": f"Bearer {cfg['access_token']}"})
    if r.is_error:
        log.warning("whatsapp template send failed %s: %.300s", r.status_code, r.text)
        raise RuntimeError(f"Meta API {r.status_code}: {r.text[:300]}")
    data = r.json()
    mid = ((data.get("messages") or [{}])[0]).get("id")
    await _raw_db.whatsapp_messages.insert_one({
        "direction": "outbound", "message_id": mid, "wa_id": to, "type": "template", "template": name, "text": " | ".join(map(str, params)),
        "phone_number_id": cfg["phone_number_id"], "tenant_id": tenant_id, "status": "accepted", "created_at": _now()})
    return data


async def send_text(to: str, body: str, tenant_id: str | None = None) -> dict[str, Any]:
    """Send a free-form text. Routes via the salon's own linked WhatsApp (OpenWA gateway) when
    available, otherwise the Meta Cloud API (24h customer-service window applies)."""
    if tenant_id:
        from services import whatsapp_gateway as gw
        sid = await gw.tenant_connected(tenant_id)
        if sid:
            return await gw.send_text(sid, tenant_id, to, body)
    cfg = wa_config()
    if not cfg["access_token"] or not cfg["phone_number_id"]:
        raise RuntimeError("WhatsApp Cloud API not configured (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID)")
    if tenant_id:
        from services.tenant_features import feature_on
        if not await feature_on(tenant_id, "whatsapp"):
            raise RuntimeError("WhatsApp is not enabled for this tenant — Miracurl HQ switches it on per salon")
    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{cfg['phone_number_id']}/messages"
    payload = {"messaging_product": "whatsapp", "recipient_type": "individual", "to": to,
               "type": "text", "text": {"preview_url": False, "body": body[:4096]}}
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(url, json=payload, headers={"Authorization": f"Bearer {cfg['access_token']}"})
    if r.is_error:
        log.warning("whatsapp send failed %s: %.300s", r.status_code, r.text)
        raise RuntimeError(f"Meta API {r.status_code}: {r.text[:300]}")
    data = r.json()
    mid = ((data.get("messages") or [{}])[0]).get("id")
    await _raw_db.whatsapp_messages.insert_one({
        "direction": "outbound", "message_id": mid, "wa_id": to, "type": "text", "text": body,
        "phone_number_id": cfg["phone_number_id"], "tenant_id": tenant_id, "status": "accepted", "created_at": _now()})
    return data
