"""Meta WhatsApp Business Cloud API — config, signature check, send helpers and shared store helpers.

Webhook route: routes/whatsapp_webhook.py. Inbound/status processing: services/whatsapp_inbound.py.
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


async def channel_for(tenant_id: str | None) -> dict:
    """(phone_number_id, token, own) — the tenant's own coexistence number when connected, else Miracurl's platform number."""
    if tenant_id:
        from services.wa_coexist import decrypt_token, own_channel_by_tenant_id
        own = await own_channel_by_tenant_id(tenant_id)
        if own:
            return {"phone_number_id": own["phone_number_id"], "token": decrypt_token(own["token_enc"]), "own": True}
    cfg = wa_config()
    return {"phone_number_id": cfg["phone_number_id"], "token": cfg["access_token"], "own": False}


async def send_template(to: str, name: str, params: list[str], tenant_id: str | None = None, lang: str = "en") -> dict[str, Any]:
    """Business-initiated message via an approved Meta template (required outside the 24h service window)."""
    ch = await channel_for(tenant_id)
    if not ch["token"] or not ch["phone_number_id"]:
        raise RuntimeError("WhatsApp Cloud API not configured")
    if tenant_id:
        from services.tenant_features import feature_on
        if not await feature_on(tenant_id, "whatsapp"):
            raise RuntimeError("WhatsApp is not enabled for this tenant")
    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{ch['phone_number_id']}/messages"
    payload = {"messaging_product": "whatsapp", "to": to, "type": "template",
               "template": {"name": name, "language": {"code": lang},
                            "components": [{"type": "body", "parameters": [{"type": "text", "text": str(p)[:1024]} for p in params]}]}}
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(url, json=payload, headers={"Authorization": f"Bearer {ch['token']}"})
    if r.is_error:
        log.warning("whatsapp template send failed %s: %.300s", r.status_code, r.text)
        raise RuntimeError(f"Meta API {r.status_code}: {r.text[:300]}")
    data = r.json()
    mid = ((data.get("messages") or [{}])[0]).get("id")
    await _raw_db.whatsapp_messages.insert_one({
        "direction": "outbound", "message_id": mid, "wa_id": to, "type": "template", "template": name, "text": " | ".join(map(str, params)),
        "phone_number_id": ch["phone_number_id"], "own_number": ch["own"], "tenant_id": tenant_id, "status": "accepted", "created_at": _now()})
    return data


async def send_text(to: str, body: str, tenant_id: str | None = None) -> dict[str, Any]:
    """Send a free-form text. Routes via the salon's own linked WhatsApp (OpenWA gateway) when
    available, otherwise the Meta Cloud API (24h customer-service window applies)."""
    ch = await channel_for(tenant_id)
    if not ch["token"] or not ch["phone_number_id"]:
        raise RuntimeError("WhatsApp Cloud API not configured (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID)")
    if tenant_id:
        from services.tenant_features import feature_on
        if not await feature_on(tenant_id, "whatsapp"):
            raise RuntimeError("WhatsApp is not enabled for this tenant — Miracurl HQ switches it on per salon")
    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{ch['phone_number_id']}/messages"
    payload = {"messaging_product": "whatsapp", "recipient_type": "individual", "to": to,
               "type": "text", "text": {"preview_url": False, "body": body[:4096]}}
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(url, json=payload, headers={"Authorization": f"Bearer {ch['token']}"})
    if r.is_error:
        log.warning("whatsapp send failed %s: %.300s", r.status_code, r.text)
        raise RuntimeError(f"Meta API {r.status_code}: {r.text[:300]}")
    data = r.json()
    mid = ((data.get("messages") or [{}])[0]).get("id")
    await _raw_db.whatsapp_messages.insert_one({
        "direction": "outbound", "message_id": mid, "wa_id": to, "type": "text", "text": body,
        "phone_number_id": ch["phone_number_id"], "own_number": ch["own"], "tenant_id": tenant_id, "status": "accepted", "created_at": _now()})
    return data
