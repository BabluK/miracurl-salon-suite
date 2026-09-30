"""Bring-your-own WhatsApp number (Meta Coexistence) — tenant admin endpoints."""
import base64
import io
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from database import _raw_db
from security import current_tenant, durable_rate_limit, require_super_admin, require_tenant_admin, public_base_url
from services import wa_coexist as cx

router = APIRouter(prefix="/whatsapp-own")
log = logging.getLogger("wa_coexist")


def _view(t: dict) -> dict:
    cfg = cx.config()
    own = cx.public_view(t)
    return {"available": bool(cfg["app_id"] and cfg["config_id"]), "app_id": cfg["app_id"], "config_id": cfg["config_id"],
            "connected": cx.own_channel(t) is not None, "own": own}


@router.get("/status")
async def own_status(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return _view(t)


class ConnectIn(BaseModel):
    code: str = Field(min_length=10, max_length=2000)
    waba_id: str = Field(min_length=5, max_length=40, pattern=r"^\d+$")
    phone_number_id: str = Field(min_length=5, max_length=40, pattern=r"^\d+$")


async def _after_connect(tenant_id: str) -> None:
    t = await _raw_db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    try:
        await cx.copy_platform_templates(t)
    except Exception:  # noqa: BLE001 — template cloning is best-effort; owner can retry from the card
        log.exception("template copy failed for %s", tenant_id)


@router.post("/connect")
async def own_connect(body: ConnectIn, request: Request, background: BackgroundTasks, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    await durable_rate_limit(request, f"wa-own:{t['id']}", limit=6, window_sec=600)
    if not cx.config()["config_id"]:
        raise HTTPException(503, "Connecting your own WhatsApp is not enabled yet")
    try:
        await cx.connect(t, body.code, body.waba_id, body.phone_number_id)
    except RuntimeError as e:
        raise HTTPException(400, str(e))
    background.add_task(_after_connect, t["id"])
    t2 = await _raw_db.tenants.find_one({"id": t["id"]}, {"_id": 0})
    return _view(t2)


@router.delete("/disconnect")
async def own_disconnect(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    await cx.disconnect(t)
    return _view(await _raw_db.tenants.find_one({"id": t["id"]}, {"_id": 0}))


@router.post("/refresh")
async def own_refresh(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    if not cx.own_channel(t):
        raise HTTPException(404, "No WhatsApp number connected")
    try:
        await cx.refresh_health(t)
        await cx.copy_platform_templates(await _raw_db.tenants.find_one({"id": t["id"]}, {"_id": 0}))
    except RuntimeError as e:
        raise HTTPException(502, str(e))
    return _view(await _raw_db.tenants.find_one({"id": t["id"]}, {"_id": 0}))


@router.post("/hq/webhook-fields")
async def hq_webhook_fields(user=Depends(require_super_admin)):
    """HQ: (re)subscribe the Meta app webhook with the coexistence fields."""
    return await cx.ensure_webhook_fields()


# ---- Phone hand-off: owner scans a QR and finishes Meta signup on the phone that holds THEIR Facebook Business login ----

@router.post("/handoff")
async def own_handoff(request: Request, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """15-minute one-time link + QR. Bypasses the desktop's (possibly HQ) Facebook session."""
    import qrcode
    await durable_rate_limit(request, f"wa-own-handoff:{t['id']}", limit=10, window_sec=600)
    if not cx.config()["config_id"]:
        raise HTTPException(503, "Connecting your own WhatsApp is not enabled yet")
    token = secrets.token_urlsafe(24)
    exp = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
    await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"wa_own_handoff": {"token": token, "exp": exp}}})
    # Same host the owner is looking at (preview QR → preview page, prod → prod) — a fixed APP_PUBLIC_URL made preview QRs "invalid".
    url = f"{public_base_url(request)}/connect-whatsapp/{token}"
    qr = qrcode.QRCode(box_size=8, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    buf = io.BytesIO()
    qr.make_image(fill_color="#0b3d2e", back_color="#ffffff").save(buf, format="PNG")
    return {"url": url, "expires_at": exp, "qr": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()}


async def _tenant_by_handoff(token: str) -> dict:
    t = await _raw_db.tenants.find_one({"wa_own_handoff.token": token}, {"_id": 0})
    h = (t or {}).get("wa_own_handoff") or {}
    if not t or not secrets.compare_digest(h.get("token", ""), token) or h.get("exp", "") < datetime.now(timezone.utc).isoformat():
        raise HTTPException(404, "This connect link has expired — open Settings on your computer and scan a fresh QR")
    return t


@router.get("/public/handoff/{token}")
async def own_handoff_info(token: str, request: Request):
    await durable_rate_limit(request, "wa-own-handoff-public", limit=60, window_sec=600)
    t = await _tenant_by_handoff(token)
    cfg = cx.config()
    return {"tenant_name": t.get("name"), "app_id": cfg["app_id"], "config_id": cfg["config_id"],
            "connected": cx.own_channel(t) is not None}


@router.post("/public/handoff/{token}/connect")
async def own_handoff_connect(token: str, body: ConnectIn, request: Request, background: BackgroundTasks):
    await durable_rate_limit(request, "wa-own-handoff-connect", limit=20, window_sec=600)
    t = await _tenant_by_handoff(token)
    try:
        await cx.connect(t, body.code, body.waba_id, body.phone_number_id)
    except RuntimeError as e:
        raise HTTPException(400, str(e))
    await _raw_db.tenants.update_one({"id": t["id"]}, {"$unset": {"wa_own_handoff": ""}})
    background.add_task(_after_connect, t["id"])
    return {"ok": True, "tenant_name": t.get("name")}
