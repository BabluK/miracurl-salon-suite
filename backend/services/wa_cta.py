"""Per-salon 'Call now' WhatsApp templates: clone the platform festival / thank-you templates with a PHONE_NUMBER button
so a tenant's campaigns end with 'Call now → their number' instead of 'Book Now → booking page'."""
import os
import re
import httpx
from services import whatsapp_official as official
from services.whatsapp_cloud import GRAPH_API_VERSION

G = f"https://graph.facebook.com/{GRAPH_API_VERSION}"
CALL_KINDS = ("festival", "thank_you")
_SAMPLE = "/app/frontend/public/brand-model-hero.jpg"


def _env() -> tuple[str, str, str]:
    return os.environ["WHATSAPP_ACCESS_TOKEN"], os.environ["WHATSAPP_BUSINESS_ACCOUNT_ID"], os.environ["META_APP_ID"]


def call_template_name(t: dict, kind: str) -> str:
    slug = re.sub(r"[^a-z0-9]", "", (t.get("slug") or t["id"]).lower())[:18]
    return f"t_{slug}_{kind}_call"


async def _header_handle(client: httpx.AsyncClient, tok: str, app: str) -> str:
    data = open(_SAMPLE, "rb").read()
    s = (await client.post(f"{G}/{app}/uploads", params={"file_length": len(data), "file_type": "image/jpeg", "access_token": tok})).json()
    u = (await client.post(f"{G}/{s['id']}", content=data, headers={"Authorization": f"OAuth {tok}", "file_offset": "0", "Content-Type": "application/octet-stream"})).json()
    return u["h"]


async def _platform_components(client: httpx.AsyncClient, tok: str, waba: str, kind: str) -> list:
    r = await client.get(f"{G}/{waba}/message_templates", params={"name": official.TEMPLATES[kind], "fields": "name,components", "access_token": tok})
    rows = [x for x in (r.json().get("data") or []) if x.get("name") == official.TEMPLATES[kind]]
    if not rows:
        raise RuntimeError(f"platform template {official.TEMPLATES[kind]} not found")
    return rows[0]["components"]


def _with_call_button(components: list, handle: str, phone_e164: str) -> list:
    out = []
    for c in components:
        c = dict(c)
        if c["type"] == "HEADER":
            c = {"type": "HEADER", "format": "IMAGE", "example": {"header_handle": [handle]}}
        elif c["type"] == "BUTTONS":
            c = {"type": "BUTTONS", "buttons": [{"type": "PHONE_NUMBER", "text": "Call now", "phone_number": phone_e164},
                                                {"type": "QUICK_REPLY", "text": "Stop promotions"}]}
        elif c["type"] == "BODY":
            c = {"type": "BODY", "text": c["text"], "example": c.get("example") or {}}
        elif c["type"] == "FOOTER":
            c = {"type": "FOOTER", "text": c["text"]}
        out.append(c)
    return out


async def ensure_call_templates(t: dict, phone_e164: str) -> dict[str, str]:
    """Create (idempotently) the tenant's Call-now variants; returns kind → template name. Existing names are reused."""
    tok, waba, app = _env()
    names: dict[str, str] = {}
    async with httpx.AsyncClient(timeout=60.0) as client:
        handle = None
        for kind in CALL_KINDS:
            name = call_template_name(t, kind)
            names[kind] = name
            if await official.template_status(name):
                continue
            handle = handle or await _header_handle(client, tok, app)
            comps = _with_call_button(await _platform_components(client, tok, waba, kind), handle, phone_e164)
            r = await client.post(f"{G}/{waba}/message_templates", params={"access_token": tok},
                                  json={"name": name, "language": "en", "category": "MARKETING", "components": comps})
            if r.is_error:
                raise RuntimeError(r.json().get("error", {}).get("error_user_msg") or r.text[:200])
    return names


async def cta_status(t: dict) -> dict:
    """What the composer/preview should show: mode, phone, and per-kind template approval."""
    mode = t.get("wa_cta_mode") or ("call" if t.get("wa_template_overrides") else "book")
    ov = t.get("wa_template_overrides") or {}
    statuses = {k: (await official.template_status(v) or "PENDING") for k, v in ov.items()} if ov else {}
    live = mode == "call" and bool(statuses) and all(s == "APPROVED" for s in statuses.values())
    return {"mode": mode, "phone": t.get("wa_cta_phone") or t.get("phone") or "", "templates": statuses, "live": live,
            "pending": mode == "call" and not live}
