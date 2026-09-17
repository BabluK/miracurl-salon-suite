"""Official Meta Cloud API channel — Miracurl's approved templates, branded per tenant, 1 WhatsApp credit per send."""
import logging
import os
from datetime import datetime, timezone

from database import _raw_db

log = logging.getLogger("wa_official")

TEMPLATES = {
    "festival": os.environ.get("WHATSAPP_FESTIVAL_TEMPLATE", "miracurl_festival_offer"),
    "winback": os.environ.get("WHATSAPP_WINBACK_TEMPLATE", "miracurl_winback"),
    "birthday": os.environ.get("WHATSAPP_BIRTHDAY_TEMPLATE", "miracurl_birthday_wish"),
    "booking": os.environ.get("WHATSAPP_BOOKING_TEMPLATE", "miracurl_booking_confirmed"),
    "reminder": os.environ.get("WHATSAPP_REMINDER_TEMPLATE", "miracurl_reminder_1h"),
    "review": os.environ.get("WHATSAPP_REVIEW_TEMPLATE", "miracurl_review_request"),
}
BUTTON_SLUG = {"festival", "winback", "birthday", "review"}  # templates whose URL button takes the tenant slug


def _abs(url: str) -> str:
    base = os.environ.get("APP_PUBLIC_URL", "").rstrip("/")
    return url if url.startswith("http") else f"{base}{url}"


async def tenant_header_image(t: dict, image_url: str | None = None) -> str:
    """Campaign poster if given, else the tenant's logo, else Miracurl's monogram."""
    if image_url:
        return _abs(image_url)
    if t.get("logo_url"):
        return _abs(t["logo_url"])
    return _abs("/assets/brand/ms-logo-gold.png")


async def credits(tenant_id: str) -> int:
    t = await _raw_db.tenants.find_one({"id": tenant_id}, {"_id": 0, "wa_points": 1})
    return int((t or {}).get("wa_points") or 0)


async def send(kind: str, t: dict, to: str, params: list[str], image_url: str | None = None, lang: str = "en") -> dict:
    """Send Miracurl template <kind> to <to> on behalf of tenant t. Deducts 1 wa_point; raises RuntimeError on failure/no credits."""
    from services.whatsapp_cloud import wa_config, GRAPH_API_VERSION, _now
    import httpx
    cfg = wa_config()
    if not cfg["access_token"] or not cfg["phone_number_id"]:
        raise RuntimeError("Official WhatsApp channel not configured")
    r = await _raw_db.tenants.update_one({"id": t["id"], "wa_points": {"$gte": 1}}, {"$inc": {"wa_points": -1}})
    if not r.modified_count:
        raise RuntimeError("No WhatsApp credits left — top up in Settings → Credits")
    components = [
        {"type": "header", "parameters": [{"type": "image", "image": {"link": await tenant_header_image(t, image_url)}}]},
        {"type": "body", "parameters": [{"type": "text", "text": str(p)[:1024]} for p in params]},
    ]
    if kind in BUTTON_SLUG:
        components.append({"type": "button", "sub_type": "url", "index": "0",
                           "parameters": [{"type": "text", "text": t.get("slug", "")}]})
    digits = "".join(ch for ch in to if ch.isdigit()).lstrip("0")
    if len(digits) == 10:
        digits = "91" + digits
    payload = {"messaging_product": "whatsapp", "to": digits, "type": "template",
               "template": {"name": TEMPLATES[kind], "language": {"code": lang}, "components": components}}
    async with httpx.AsyncClient(timeout=25.0) as client:
        resp = await client.post(f"https://graph.facebook.com/{GRAPH_API_VERSION}/{cfg['phone_number_id']}/messages",
                                 json=payload, headers={"Authorization": f"Bearer {cfg['access_token']}"})
    if resp.is_error:
        await _raw_db.tenants.update_one({"id": t["id"]}, {"$inc": {"wa_points": 1}})  # refund
        log.warning("official send failed %s: %.300s", resp.status_code, resp.text)
        raise RuntimeError(f"Meta API {resp.status_code}")
    mid = ((resp.json().get("messages") or [{}])[0]).get("id")
    await _raw_db.whatsapp_messages.insert_one({
        "direction": "outbound", "provider": "meta", "message_id": mid, "wa_id": digits, "type": "template", "template": TEMPLATES[kind],
        "kind": kind, "text": " | ".join(map(str, params)), "phone_number_id": cfg["phone_number_id"], "tenant_id": t["id"],
        "status": "accepted", "created_at": _now()})
    await _raw_db.sms_credit_log.insert_one({"id": mid or datetime.now(timezone.utc).isoformat(), "tenant_id": t["id"], "points": -1,
                                             "source": f"whatsapp_{kind}", "channel": "whatsapp", "created_at": _now()})
    return {"ok": True, "message_id": mid, "channel": "whatsapp"}
