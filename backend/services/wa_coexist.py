"""Bring-your-own WhatsApp (Meta Coexistence): a tenant links the number already running in its
WhatsApp Business app via Embedded Signup; Mira then sends/receives on that number with the
tenant's own business token — no Miracurl credits, Meta bills the tenant directly."""
import base64
import hashlib
import logging
import os
from datetime import datetime, timezone

import httpx
from cryptography.fernet import Fernet, MultiFernet

from database import _raw_db

log = logging.getLogger("wa_coexist")
GRAPH = "https://graph.facebook.com/v22.0"
SYNC_KINDS = ("smb_app_state_sync", "history")
COEXIST_WEBHOOK_FIELDS = "messages,account_update,history,smb_app_state_sync,smb_message_echoes"


def _derive(secret: str) -> bytes:
    return base64.urlsafe_b64encode(hashlib.sha256(f"wa-coexist:{secret}".encode()).digest())


def _fernet() -> MultiFernet:
    """Encrypt with the current JWT_SECRET; decrypt also accepts JWT_SECRET_PREVIOUS so the secret can be rotated
    without losing stored Meta tokens (re-save the channel once after rotation to re-encrypt)."""
    keys = [Fernet(_derive(os.environ["JWT_SECRET"]))]
    prev = os.environ.get("JWT_SECRET_PREVIOUS", "").strip()
    if prev:
        keys.append(Fernet(_derive(prev)))
    return MultiFernet(keys)


def encrypt_token(tok: str) -> str:
    return _fernet().encrypt(tok.encode()).decode()


def decrypt_token(enc: str) -> str:
    return _fernet().decrypt(enc.encode()).decode()


def config() -> dict:
    return {"app_id": os.environ.get("META_APP_ID", ""), "config_id": os.environ.get("META_LOGIN_CONFIG_ID", ""),
            "app_secret": os.environ.get("META_APP_SECRET", "")}


def own_channel(t: dict | None) -> dict | None:
    """Connected own-number channel for a tenant, or None."""
    own = (t or {}).get("own_whatsapp") or {}
    return own if own.get("status") == "connected" and own.get("phone_number_id") and own.get("token_enc") else None


async def own_channel_by_tenant_id(tenant_id: str) -> dict | None:
    t = await _raw_db.tenants.find_one({"id": tenant_id}, {"_id": 0, "own_whatsapp": 1})
    return own_channel(t)


async def _graph(method: str, path: str, token: str, **kw) -> dict:
    async with httpx.AsyncClient(timeout=25.0) as c:
        r = await c.request(method, f"{GRAPH}{path}", headers={"Authorization": f"Bearer {token}"}, **kw)
    if r.is_error:
        log.warning("graph %s %s -> %s %.300s", method, path, r.status_code, r.text)
        raise RuntimeError(f"Meta API {r.status_code}: {(r.json().get('error') or {}).get('message', r.text[:200]) if r.headers.get('content-type', '').startswith('application/json') else r.text[:200]}")
    return r.json()


async def exchange_code(code: str) -> str:
    cfg = config()
    async with httpx.AsyncClient(timeout=20.0) as c:
        r = await c.get(f"{GRAPH}/oauth/access_token", params={"client_id": cfg["app_id"], "client_secret": cfg["app_secret"], "code": code})
    if r.is_error:
        raise RuntimeError("Meta did not accept the signup code — please start the connection again")
    return r.json()["access_token"]


async def connect(t: dict, code: str, waba_id: str, phone_number_id: str) -> dict:
    """Exchange → validate ownership + coexistence state → subscribe webhooks → start syncs → persist (encrypted)."""
    token = await exchange_code(code)
    phones = await _graph("GET", f"/{waba_id}/phone_numbers", token, params={"fields": "id,display_phone_number,verified_name,is_on_biz_app,platform_type,quality_rating,status"})
    phone = next((p for p in phones.get("data") or [] if p.get("id") == phone_number_id), None)
    if not phone:
        raise RuntimeError("That phone number does not belong to the WhatsApp account you authorised")
    other = await _raw_db.tenants.find_one({"own_whatsapp.phone_number_id": phone_number_id, "id": {"$ne": t["id"]}}, {"_id": 0, "slug": 1})
    if other:
        raise RuntimeError("This WhatsApp number is already connected to another business on Miracurl")
    await _graph("POST", f"/{waba_id}/subscribed_apps", token, json={})
    syncs = {}
    for kind in SYNC_KINDS:  # one-time, best-effort — history may be declined by the owner
        try:
            syncs[kind] = (await _graph("POST", f"/{phone_number_id}/smb_app_data", token, json={"messaging_product": "whatsapp", "sync_type": kind})).get("request_id")
        except RuntimeError as e:
            syncs[kind] = f"skipped: {e}"
    own = {"status": "connected", "waba_id": waba_id, "phone_number_id": phone_number_id,
           "display_phone_number": phone.get("display_phone_number"), "verified_name": phone.get("verified_name"),
           "is_on_biz_app": bool(phone.get("is_on_biz_app")), "platform_type": phone.get("platform_type"),
           "quality_rating": phone.get("quality_rating"), "token_enc": encrypt_token(token), "syncs": syncs,
           "connected_at": datetime.now(timezone.utc).isoformat(), "templates": {}}
    await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"own_whatsapp": own, "whatsapp_phone_number_id": phone_number_id, "features.whatsapp": True}})
    return own


async def disconnect(t: dict) -> None:
    own = (t.get("own_whatsapp") or {})
    if own.get("token_enc") and own.get("waba_id"):
        try:
            await _graph("DELETE", f"/{own['waba_id']}/subscribed_apps", decrypt_token(own["token_enc"]))
        except RuntimeError:
            pass
    await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"own_whatsapp": {"status": "disconnected", "disconnected_at": datetime.now(timezone.utc).isoformat()}},
                                                        "$unset": {"whatsapp_phone_number_id": ""}})


async def copy_platform_templates(t: dict) -> dict:
    """Clone Miracurl's approved templates onto the tenant's WABA so confirmations/campaigns can go from their number."""
    own = own_channel(t)
    if not own:
        return {}
    src_waba, src_tok = os.environ.get("WHATSAPP_BUSINESS_ACCOUNT_ID", ""), os.environ.get("WHATSAPP_ACCESS_TOKEN", "")
    tok = decrypt_token(own["token_enc"])
    ours = (await _graph("GET", f"/{src_waba}/message_templates", src_tok, params={"fields": "name,language,category,components,status", "limit": 50})).get("data") or []
    existing = {x["name"] for x in ((await _graph("GET", f"/{own['waba_id']}/message_templates", tok, params={"fields": "name", "limit": 100})).get("data") or [])}
    out = {}
    for tpl in ours:
        if tpl.get("status") != "APPROVED" or not tpl["name"].startswith("miracurl_") or tpl["name"] in existing:
            out[tpl["name"]] = "exists" if tpl["name"] in existing else "skipped"
            continue
        comps = []
        for c in tpl.get("components") or []:
            c = {k: v for k, v in c.items() if k != "example" or v}
            comps.append(c)
        try:
            r = await _graph("POST", f"/{own['waba_id']}/message_templates", tok,
                             json={"name": tpl["name"], "language": tpl["language"], "category": tpl["category"], "components": comps, "allow_category_change": True})
            out[tpl["name"]] = r.get("status") or "PENDING"
        except RuntimeError as e:
            out[tpl["name"]] = f"error: {e}"[:160]
    await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"own_whatsapp.templates": out, "own_whatsapp.templates_synced_at": datetime.now(timezone.utc).isoformat()}})
    return out


async def refresh_health(t: dict) -> dict:
    own = own_channel(t)
    if not own:
        return {}
    tok = decrypt_token(own["token_enc"])
    ph = await _graph("GET", f"/{own['phone_number_id']}", tok, params={"fields": "display_phone_number,verified_name,is_on_biz_app,platform_type,quality_rating,status,messaging_limit_tier"})
    tpls = (await _graph("GET", f"/{own['waba_id']}/message_templates", tok, params={"fields": "name,status", "limit": 100})).get("data") or []
    patch = {"own_whatsapp.quality_rating": ph.get("quality_rating"), "own_whatsapp.is_on_biz_app": bool(ph.get("is_on_biz_app")),
             "own_whatsapp.phone_status": ph.get("status"), "own_whatsapp.messaging_limit_tier": ph.get("messaging_limit_tier"),
             "own_whatsapp.templates": {x["name"]: x["status"] for x in tpls if x["name"].startswith("miracurl_")},
             "own_whatsapp.checked_at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": patch})
    return {k.split(".", 1)[1]: v for k, v in patch.items()}


def public_view(t: dict) -> dict:
    own = (t.get("own_whatsapp") or {})
    return {k: own.get(k) for k in ("status", "display_phone_number", "verified_name", "is_on_biz_app", "quality_rating", "phone_status",
                                     "messaging_limit_tier", "connected_at", "checked_at", "templates", "templates_synced_at", "syncs")}


async def ensure_webhook_fields() -> dict:
    """Make sure the app subscription carries the coexistence fields (idempotent, app-token call)."""
    cfg = config()
    async with httpx.AsyncClient(timeout=20.0) as c:
        r = await c.post(f"{GRAPH}/{cfg['app_id']}/subscriptions", data={
            "object": "whatsapp_business_account", "callback_url": f"{os.environ.get('APP_PUBLIC_URL', '').rstrip('/')}/api/webhooks/whatsapp",
            "verify_token": os.environ.get("WHATSAPP_VERIFY_TOKEN", ""), "fields": COEXIST_WEBHOOK_FIELDS,
            "access_token": f"{cfg['app_id']}|{cfg['app_secret']}"})
    return r.json()
