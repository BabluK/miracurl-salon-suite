"""Twilio SMS delivery — gracefully skips when credentials are not configured."""
import asyncio
import logging
import os


def sms_configured() -> bool:
    return all(os.environ.get(k) for k in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"))


def _normalize_in(phone: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if len(digits) == 10:
        return f"+91{digits}"
    if digits.startswith("91") and len(digits) == 12:
        return f"+{digits}"
    if (phone or "").startswith("+"):
        return phone
    return f"+{digits}" if digits else ""


async def send_sms(to_phone: str, body: str) -> dict:
    if not sms_configured():
        return {"sent": False, "error": "not_configured"}
    to = _normalize_in(to_phone)
    if not to:
        return {"sent": False, "error": "invalid_phone"}
    from twilio.rest import Client
    client = Client(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])
    try:
        msg = await asyncio.to_thread(
            client.messages.create, to=to, from_=os.environ["TWILIO_PHONE_NUMBER"], body=body)
        return {"sent": True, "sid": msg.sid}
    except Exception as e:
        logging.getLogger("sms").error(f"twilio send failed: {e}")
        return {"sent": False, "error": str(e)[:200]}
