"""Bring-your-own WhatsApp number (Meta Coexistence) — tenant admin endpoints."""
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from database import _raw_db
from security import current_tenant, durable_rate_limit, require_super_admin, require_tenant_admin
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
