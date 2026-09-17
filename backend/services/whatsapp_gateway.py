"""Self-hosted OpenWA gateway — each salon links its own WhatsApp number by QR (no Meta approval).
Tenant doc field `wa_gateway`: {session_id, session_name, status, phone, linked_at}."""
import os
import re
import logging
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from database import _raw_db

log = logging.getLogger("wa_gateway")
CONNECTED = {"connected", "ready", "authenticated"}


def _cfg() -> dict:
    return {"base": os.environ.get("OPENWA_BASE_URL", "").rstrip("/"), "key": os.environ.get("OPENWA_API_KEY", "")}


def gateway_available() -> bool:
    c = _cfg()
    return bool(c["base"] and c["key"])


def wa_chat_id(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) == 10:
        digits = "91" + digits
    return f"{digits}@c.us"


async def _call(method: str, path: str, **kw) -> dict:
    c = _cfg()
    if not gateway_available():
        raise RuntimeError("WhatsApp gateway not configured (OPENWA_BASE_URL / OPENWA_API_KEY)")
    async with httpx.AsyncClient(timeout=kw.pop("timeout", 25.0)) as client:
        r = await client.request(method, f"{c['base']}/api{path}", headers={"X-API-Key": c["key"]}, **kw)
    if r.is_error:
        raise RuntimeError(f"Gateway {r.status_code}: {r.text[:300]}")
    return r.json() if r.content else {}


def _norm(sess: dict) -> dict:
    st = str(sess.get("status") or "").lower()
    return {"session_id": sess.get("id"), "status": st, "phone": sess.get("phone"), "push_name": sess.get("pushName"),
            "connected": st in CONNECTED, "last_error": sess.get("lastError")}


async def tenant_session(tenant_id: str) -> Optional[dict]:
    t = await _raw_db.tenants.find_one({"id": tenant_id}, {"_id": 0, "wa_gateway": 1, "slug": 1})
    return (t or {}).get("wa_gateway")


async def ensure_session(tenant: dict) -> dict:
    """Create (once) the tenant's gateway session and return its live status."""
    g = tenant.get("wa_gateway") or {}
    if g.get("session_id"):
        try:
            return _norm(await _call("GET", f"/sessions/{g['session_id']}"))
        except RuntimeError as e:
            if "404" not in str(e):
                raise
    name = f"t-{tenant.get('slug') or tenant['id'][:8]}"
    try:
        sess = await _call("POST", "/sessions", json={"name": name})
    except RuntimeError as e:
        if "409" not in str(e):
            raise
        rows = await _call("GET", "/sessions")
        sess = next(s for s in (rows if isinstance(rows, list) else rows.get("data", [])) if s.get("name") == name)
    await _raw_db.tenants.update_one({"id": tenant["id"]}, {"$set": {"wa_gateway": {
        "session_id": sess["id"], "session_name": name, "status": sess.get("status"), "phone": None,
        "created_at": datetime.now(timezone.utc).isoformat()}}})
    return _norm(sess)


async def start_session(tenant: dict) -> dict:
    s = await ensure_session(tenant)
    if s["connected"]:
        return s
    try:
        return _norm(await _call("POST", f"/sessions/{s['session_id']}/start", timeout=60.0))
    except RuntimeError as e:
        if "already" in str(e).lower() or "409" in str(e):
            return s
        raise


async def status(tenant: dict) -> dict:
    g = tenant.get("wa_gateway") or {}
    if not g.get("session_id"):
        return {"linked": False, "status": "not_created", "connected": False}
    try:
        s = _norm(await _call("GET", f"/sessions/{g['session_id']}"))
    except RuntimeError as e:
        return {"linked": False, "status": "error", "connected": False, "error": str(e)[:200]}
    qr = None
    if s["status"] in {"qr_ready", "qr", "initializing", "connecting", "pairing"} and not s["connected"]:
        try:
            q = await _call("GET", f"/sessions/{g['session_id']}/qr")
            qr = q.get("qrCode")
        except RuntimeError:
            pass
    upd = {"wa_gateway.status": s["status"]}
    if s["connected"] and s.get("phone"):
        upd["wa_gateway.phone"] = s["phone"]
        upd["wa_gateway.linked_at"] = g.get("linked_at") or datetime.now(timezone.utc).isoformat()
    await _raw_db.tenants.update_one({"id": tenant["id"]}, {"$set": upd})
    return {**s, "linked": s["connected"], "qr": qr, "linked_at": g.get("linked_at"),
            "prefer_over_sms": g.get("prefer_over_sms", True) is not False}


async def pairing_code(tenant: dict, phone: str) -> dict:
    """8-character code the owner types under WhatsApp → Linked devices → Link with phone number."""
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 10:
        digits = "91" + digits
    s = await start_session(tenant)
    data = await _call("POST", f"/sessions/{s['session_id']}/pairing-code", json={"phoneNumber": digits}, timeout=60.0)
    return {"code": data.get("pairingCode"), "status": data.get("status"), "phone": digits}


async def unlink(tenant: dict) -> dict:
    g = tenant.get("wa_gateway") or {}
    sid = g.get("session_id")
    if sid:
        for path in (f"/sessions/{sid}/logout", f"/sessions/{sid}/stop"):
            try:
                await _call("POST", path, timeout=40.0)
            except RuntimeError as e:
                log.info("unlink %s: %s", path, e)
        try:
            await _call("DELETE", f"/sessions/{sid}")
        except RuntimeError as e:
            log.info("unlink delete: %s", e)
    await _raw_db.tenants.update_one({"id": tenant["id"]}, {"$unset": {"wa_gateway": ""}})
    return {"ok": True}


async def prefer_whatsapp(tenant_id: str) -> bool:
    """Owner toggle: route customer SMS (confirmations, reminders, review asks) via the linked WhatsApp. Default ON."""
    g = await tenant_session(tenant_id)
    return bool(g) and g.get("prefer_over_sms", True) is not False


async def tenant_connected(tenant_id: str) -> Optional[str]:
    """Session id if this tenant's own WhatsApp is linked and live, else None."""
    if not gateway_available():
        return None
    g = await tenant_session(tenant_id)
    if not g or not g.get("session_id"):
        return None
    try:
        s = _norm(await _call("GET", f"/sessions/{g['session_id']}", timeout=8.0))
    except RuntimeError:
        return None
    return g["session_id"] if s["connected"] else None


async def _log_msg(tenant_id: str, to: str, kind: str, text: str, mid: Any, session_id: str) -> None:
    await _raw_db.whatsapp_messages.insert_one({
        "direction": "outbound", "provider": "openwa", "session_id": session_id, "message_id": mid, "wa_id": to,
        "type": kind, "text": text, "tenant_id": tenant_id, "status": "accepted",
        "created_at": datetime.now(timezone.utc).isoformat()})


async def send_text(session_id: str, tenant_id: str, to: str, body: str) -> dict:
    to = wa_chat_id(to)
    data = await _call("POST", f"/sessions/{session_id}/messages/send-text",
                       json={"chatId": to, "text": body[:4096], "linkPreview": False}, timeout=40.0)
    await _log_msg(tenant_id, to, "text", body, data.get("messageId"), session_id)
    return data


async def send_image(session_id: str, tenant_id: str, to: str, url: str, caption: str = "") -> dict:
    to = wa_chat_id(to)
    data = await _call("POST", f"/sessions/{session_id}/messages/send-image",
                       json={"chatId": to, "url": url, "caption": caption[:1024]}, timeout=60.0)
    await _log_msg(tenant_id, to, "image", caption or url, data.get("messageId"), session_id)
    return data
