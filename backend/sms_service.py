"""SMS delivery — MSG91 (Flow API, DLT) or Twilio, gracefully skips when not configured.

Provider selection: SMS_PROVIDER=msg91 activates MSG91 once MSG91_AUTHKEY,
MSG91_SENDER_ID and MSG91_FLOW_ID are all set (Flow template must contain a
##message## variable approved on DLT). Otherwise falls back to Twilio.
"""
import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone

log = logging.getLogger("sms")
MSG91_FLOW_URL = "https://control.msg91.com/api/v5/flow"


def _msg91_ready() -> bool:
    return all(os.environ.get(k) for k in ("MSG91_AUTHKEY", "MSG91_SENDER_ID", "MSG91_FLOW_ID"))


def _twilio_ready() -> bool:
    return all(os.environ.get(k) for k in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"))


def _provider() -> str:
    if os.environ.get("SMS_PROVIDER", "").lower() == "msg91" and _msg91_ready():
        return "msg91"
    if _twilio_ready():
        return "twilio"
    if _msg91_ready():
        return "msg91"
    return ""


def sms_configured() -> bool:
    return bool(_provider())


def _normalize_in(phone: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if len(digits) == 10:
        return f"+91{digits}"
    if digits.startswith("91") and len(digits) == 12:
        return f"+{digits}"
    if (phone or "").startswith("+"):
        return phone
    return f"+{digits}" if digits else ""


async def _send_msg91(to: str, body: str) -> dict:
    import httpx
    mobile = to.lstrip("+")
    payload = {
        "flow_id": os.environ["MSG91_FLOW_ID"],
        "sender": os.environ["MSG91_SENDER_ID"],
        "mobiles": mobile,
        "message": body,
    }
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            resp = await http.post(MSG91_FLOW_URL, json=payload,
                                   headers={"authkey": os.environ["MSG91_AUTHKEY"]})
        data = resp.json()
        if resp.status_code == 200 and data.get("type") == "success":
            return {"sent": True, "sid": data.get("message", "")}
        log.error("msg91 send failed: %s %s", resp.status_code, str(data)[:300])
        return {"sent": False, "error": str(data.get("message") or data)[:200]}
    except Exception as e:
        log.error("msg91 send failed: %s", e)
        return {"sent": False, "error": str(e)[:200]}


async def _send_twilio(to: str, body: str) -> dict:
    from twilio.rest import Client
    client = Client(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])
    try:
        msg = await asyncio.to_thread(
            client.messages.create, to=to, from_=os.environ["TWILIO_PHONE_NUMBER"], body=body)
        return {"sent": True, "sid": msg.sid}
    except Exception as e:
        log.error(f"twilio send failed: {e}")
        return {"sent": False, "error": str(e)[:200]}


async def send_sms(to_phone: str, body: str) -> dict:
    provider = _provider()
    if not provider:
        return {"sent": False, "error": "not_configured"}
    to = _normalize_in(to_phone)
    if not to:
        return {"sent": False, "error": "invalid_phone"}
    if provider == "msg91":
        return await _send_msg91(to, body)
    return await _send_twilio(to, body)


async def send_tenant_sms(tenant_id: str, to_phone: str, body: str, kind: str = "general") -> dict:
    """Point-metered customer SMS: burns 1 sms_point from the tenant, refunds on failure.
    Every attempt is recorded in sms_log for the HQ delivery log."""
    from database import _raw_db

    async def _log(res: dict) -> None:
        try:
            await _raw_db.sms_log.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": tenant_id, "phone": to_phone,
                "kind": kind, "preview": body[:90], "sent": bool(res.get("sent")), "channel": res.get("channel", "sms"),
                "error": res.get("error"), "sid": res.get("sid"),
                "created_at": datetime.now(timezone.utc).isoformat()})
        except Exception as e:  # noqa: BLE001 — logging must never break sending
            log.warning("sms_log write failed: %s", e)

    # Salon linked its own WhatsApp (OpenWA gateway)? Customer messages go there first — free, no SMS point.
    if kind != "staff_transfer":
        try:
            from services import whatsapp_gateway as gw
            sid = await gw.tenant_connected(tenant_id) if await gw.prefer_whatsapp(tenant_id) else None
            if sid:
                r = await gw.send_text(sid, tenant_id, to_phone, body)
                res = {"sent": True, "channel": "whatsapp", "sid": r.get("messageId")}
                await _log(res)
                return res
        except Exception as e:  # noqa: BLE001 — fall back to SMS
            log.warning("whatsapp gateway send failed, falling back to SMS: %s", e)

    if not sms_configured():
        res = {"sent": False, "error": "not_configured"}
        await _log(res)
        return res
    from services.tenant_features import feature_on
    if not await feature_on(tenant_id, "sms"):
        res = {"sent": False, "error": "sms_disabled"}
        await _log(res)
        return res
    r = await _raw_db.tenants.update_one(
        {"id": tenant_id, "sms_points": {"$gte": 1}}, {"$inc": {"sms_points": -1}})
    if r.modified_count == 0:
        log.info("sms skipped (no sms_points) tenant=%s", tenant_id)
        res = {"sent": False, "error": "no_sms_points"}
        await _log(res)
        return res
    res = await send_sms(to_phone, body)
    if not res.get("sent"):
        await _raw_db.tenants.update_one({"id": tenant_id}, {"$inc": {"sms_points": 1}})
    fresh = await _raw_db.tenants.find_one({"id": tenant_id}, {"_id": 0, "sms_points": 1})
    res["points_left"] = int((fresh or {}).get("sms_points") or 0)
    await _log(res)
    return res
