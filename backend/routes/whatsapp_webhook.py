"""Meta WhatsApp Cloud API webhook — public, unauthenticated by design (Meta calls it).

  GET  /api/webhooks/whatsapp         verification handshake (hub.mode / hub.verify_token / hub.challenge)
  POST /api/webhooks/whatsapp         message + status notifications (HMAC-SHA256 checked, 200 returned fast)
  GET  /api/webhooks/whatsapp/health  {"status":"ok"}
"""
import hmac
import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field

from services.whatsapp_cloud import GRAPH_API_VERSION, process_webhook_payload, verify_signature, wa_config

router = APIRouter()
log = logging.getLogger("whatsapp")


class WebhookChange(BaseModel):
    field: str = ""
    value: dict[str, Any] = Field(default_factory=dict)


class WebhookEntry(BaseModel):
    id: str = ""
    changes: list[WebhookChange] = Field(default_factory=list)


class WhatsAppWebhookPayload(BaseModel):
    object: str
    entry: list[WebhookEntry] = Field(default_factory=list)


@router.get("/webhooks/whatsapp/health")
async def whatsapp_health():
    cfg = wa_config()
    return {"status": "ok", "graph_api": GRAPH_API_VERSION,
            "configured": {k: bool(v) for k, v in cfg.items() if k != "app_id"}}


@router.get("/webhooks/whatsapp", response_class=PlainTextResponse)
async def whatsapp_verify(hub_mode: Optional[str] = Query(None, alias="hub.mode"),
                          hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
                          hub_challenge: Optional[str] = Query(None, alias="hub.challenge")):
    expected = wa_config()["verify_token"]
    if hub_mode == "subscribe" and expected and hub_challenge is not None \
            and hmac.compare_digest(hub_verify_token or "", expected):
        log.info("whatsapp webhook verified by Meta")
        return PlainTextResponse(hub_challenge, status_code=200)
    log.warning("whatsapp webhook verification refused (mode=%s, token_ok=%s)", hub_mode, hub_verify_token == expected)
    return PlainTextResponse("Forbidden", status_code=403)


@router.post("/webhooks/whatsapp")
async def whatsapp_receive(request: Request, background: BackgroundTasks):
    raw = await request.body()
    cfg = wa_config()
    if cfg["app_secret"]:
        if not verify_signature(raw, request.headers.get("x-hub-signature-256")):
            log.warning("whatsapp webhook: invalid X-Hub-Signature-256")
            return JSONResponse({"detail": "Invalid signature"}, status_code=401)
    else:
        log.warning("whatsapp webhook: META_APP_SECRET not set — signature NOT verified")
    try:
        payload = WhatsAppWebhookPayload.model_validate(json.loads(raw or b"{}"))
    except Exception as e:  # noqa: BLE001 — malformed body: acknowledge so Meta doesn't retry forever
        log.warning("whatsapp webhook: unparseable payload (%s)", str(e)[:120])
        return JSONResponse({"received": True, "ignored": "invalid_payload"}, status_code=200)
    if payload.object != "whatsapp_business_account":
        return {"received": True, "ignored": payload.object}
    # Return 200 immediately; persistence + Mira hooks run after the response is sent.
    background.add_task(process_webhook_payload, payload.model_dump())
    return {"received": True}
