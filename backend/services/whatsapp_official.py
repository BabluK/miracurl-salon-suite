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
    "thank_you": os.environ.get("WHATSAPP_THANKYOU_TEMPLATE", "miracurl_thank_you_v2"),
    "owner_guide": os.environ.get("WHATSAPP_GUIDE_TEMPLATE", "miracurl_owner_guide"),
    "receipt": os.environ.get("WHATSAPP_RECEIPT_TEMPLATE", "miracurl_receipt"),  # UTILITY, text-only (no header/button)
}
TEXT_ONLY = {"receipt"}
BUTTON_SLUG = {"festival", "winback", "birthday", "review", "thank_you"}  # templates whose URL button takes the tenant slug
# Newer wording awaiting Meta review → fall back to the approved predecessor (same 3 body params) until it clears.
TEMPLATE_FALLBACK = {"miracurl_thank_you_v2": "miracurl_thank_you", "mdm_thank_you_call_v2": "mdm_thank_you_call"}
_tpl_status_cache: dict[str, tuple[float, str]] = {}


async def template_status(kind: str) -> str | None:
    """Meta review status of a platform template (APPROVED / PENDING / REJECTED), cached 5 min. Accepts a kind or a raw template name."""
    import time
    import httpx
    from services.whatsapp_cloud import GRAPH_API_VERSION
    name = TEMPLATES.get(kind, kind)
    hit = _tpl_status_cache.get(name)
    if hit and time.time() - hit[0] < 300 and hit[1] == "APPROVED":
        return hit[1]
    waba, tok = os.environ.get("WHATSAPP_BUSINESS_ACCOUNT_ID", ""), os.environ.get("WHATSAPP_ACCESS_TOKEN", "")
    if not waba or not tok:
        return None
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(f"https://graph.facebook.com/{GRAPH_API_VERSION}/{waba}/message_templates",
                             params={"name": name, "fields": "name,status", "access_token": tok})
    rows = (r.json().get("data") or []) if not r.is_error else []
    st = next((x.get("status") for x in rows if x.get("name") == name), None)
    if st:
        _tpl_status_cache[name] = (time.time(), st)
    return st


async def resolve_template(t: dict, kind: str) -> str:
    """Tenant override (only once Meta approved it) → platform default; v2 wording only once approved."""
    override = (t.get("wa_template_overrides") or {}).get(kind)
    if override and await template_status(override) == "APPROVED":
        return override
    prev = (t.get("wa_template_overrides_prev") or {}).get(kind)  # last approved variant while a re-labelled one awaits review
    if prev and await template_status(prev) == "APPROVED":
        return prev
    name = TEMPLATES[kind]
    if name in TEMPLATE_FALLBACK and await template_status(name) != "APPROVED":
        return TEMPLATE_FALLBACK[name]
    return name


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
    from services.whatsapp_cloud import GRAPH_API_VERSION, _now
    import httpx
    from services.whatsapp_cloud import channel_for
    ch = await channel_for(t["id"])
    cfg = {"access_token": ch["token"], "phone_number_id": ch["phone_number_id"]}
    if not cfg["access_token"] or not cfg["phone_number_id"]:
        raise RuntimeError("Official WhatsApp channel not configured")
    if not ch["own"]:  # own-number tenants are billed by Meta directly — no Miracurl credit
        r = await _raw_db.tenants.update_one({"id": t["id"], "wa_points": {"$gte": 1}}, {"$inc": {"wa_points": -1}})
        if not r.modified_count:
            raise RuntimeError("No WhatsApp credits left — top up in Settings → Credits")
    tpl_name = await resolve_template(t, kind)
    ov = t.get("wa_template_overrides") or {}; pv = t.get("wa_template_overrides_prev") or {}
    overridden = tpl_name in (ov.get(kind), pv.get(kind))  # tenant Call variants carry a phone button, no URL button
    components = [{"type": "body", "parameters": [{"type": "text", "text": str(p)[:1024]} for p in params]}]
    if kind not in TEXT_ONLY:
        components.insert(0, {"type": "header", "parameters": [{"type": "image", "image": {"link": await tenant_header_image(t, image_url)}}]})
    if kind in BUTTON_SLUG and not overridden:
        components.append({"type": "button", "sub_type": "url", "index": "0",
                           "parameters": [{"type": "text", "text": t.get("slug", "")}]})
    digits = "".join(ch for ch in to if ch.isdigit()).lstrip("0")
    if len(digits) == 10:
        digits = "91" + digits
    payload = {"messaging_product": "whatsapp", "to": digits, "type": "template",
               "template": {"name": tpl_name, "language": {"code": lang}, "components": components}}
    async with httpx.AsyncClient(timeout=25.0) as client:
        resp = await client.post(f"https://graph.facebook.com/{GRAPH_API_VERSION}/{cfg['phone_number_id']}/messages",
                                 json=payload, headers={"Authorization": f"Bearer {cfg['access_token']}"})
    if resp.is_error:
        if not ch["own"]:
            await _raw_db.tenants.update_one({"id": t["id"]}, {"$inc": {"wa_points": 1}})  # refund
        log.warning("official send failed %s: %.300s", resp.status_code, resp.text)
        try:
            err = resp.json().get("error") or {}
            detail = f" · #{err.get('code')} {err.get('message', '')}".rstrip() + (f" — {err['error_data']['details']}" if err.get("error_data", {}).get("details") else "")
        except Exception:  # noqa: BLE001
            detail = ""
        raise RuntimeError(f"Meta API {resp.status_code}{detail}"[:220])
    mid = ((resp.json().get("messages") or [{}])[0]).get("id")
    await _raw_db.whatsapp_messages.insert_one({
        "direction": "outbound", "provider": "meta", "message_id": mid, "wa_id": digits, "type": "template", "template": tpl_name,
        "kind": kind, "text": " | ".join(map(str, params)), "phone_number_id": cfg["phone_number_id"], "own_number": ch["own"], "tenant_id": t["id"],
        "status": "accepted", "created_at": _now()})
    if ch["own"]:
        return {"ok": True, "message_id": mid, "channel": "whatsapp", "own_number": True}
    await _raw_db.sms_credit_log.insert_one({"id": mid or datetime.now(timezone.utc).isoformat(), "tenant_id": t["id"], "points": -1,
                                             "source": f"whatsapp_{kind}", "channel": "whatsapp", "created_at": _now()})
    return {"ok": True, "message_id": mid, "channel": "whatsapp"}
