"""Settings → Link WhatsApp: the salon pairs its own WhatsApp number with the self-hosted gateway by QR."""
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from security import current_tenant, require_tenant_admin
from services import whatsapp_gateway as gw

router = APIRouter(prefix="/whatsapp-link")


@router.get("/status")
async def link_status(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    if not gw.gateway_available():
        return {"available": False, "linked": False, "status": "unavailable", "connected": False}
    return {"available": True, **await gw.status(t)}


@router.post("/start")
async def link_start(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    if not gw.gateway_available():
        raise HTTPException(503, "WhatsApp gateway is not configured on this server")
    try:
        await gw.start_session(t)
    except RuntimeError as e:
        raise HTTPException(502, f"Couldn't start WhatsApp pairing — {e}")
    fresh = {**t, "wa_gateway": await gw.tenant_session(t["id"])}
    return {"available": True, **await gw.status(fresh)}


@router.post("/unlink")
async def link_unlink(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return await gw.unlink(t)


class PairIn(BaseModel):
    phone: str = Field(..., min_length=10, max_length=16)


@router.post("/pairing-code")
async def link_pairing_code(body: PairIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    if len(re.sub(r"\D", "", body.phone)) < 10:
        raise HTTPException(400, "Enter the WhatsApp number with country code, e.g. 918217072523")
    try:
        return await gw.pairing_code(t, body.phone)
    except RuntimeError as e:
        msg = str(e)
        if "409" in msg or "400" in msg:
            raise HTTPException(409, "WhatsApp is still starting up — wait a few seconds and try again")
        raise HTTPException(502, f"Couldn't get a pairing code — {msg[:200]}")


class TestSendIn(BaseModel):
    phone: str = Field(..., min_length=10, max_length=16)
    text: str = Field("", max_length=1000)


@router.post("/test-send")
async def link_test_send(body: TestSendIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    digits = re.sub(r"\D", "", body.phone)
    if len(digits) < 10:
        raise HTTPException(400, "Enter a valid mobile number with country code")
    sid = await gw.tenant_connected(t["id"])
    if not sid:
        raise HTTPException(409, "Your WhatsApp isn't linked yet — scan the QR first")
    text = body.text.strip() or f"Hello from {t.get('name', 'our salon')} ✦ This is a test message from Miracurl — your WhatsApp is linked and working."
    try:
        r = await gw.send_text(sid, t["id"], digits, text)
    except RuntimeError as e:
        raise HTTPException(502, f"Send failed — {e}")
    return {"ok": True, "message_id": r.get("messageId"), "to": digits}
