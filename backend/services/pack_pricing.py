"""Pack catalogue + HQ unit costs shared by tenant checkout (routes.subscriptions) and the HQ wallet (routes.hq_credit_wallet)."""
import time

from database import _raw_db

SMS_PACKS = {
    "pack_199": {"price": 199, "points": 250, "label": "Starter"},
    "pack_499": {"price": 499, "points": 700, "label": "Growth"},
    "pack_999": {"price": 999, "points": 1500, "label": "Pro"},
}
WA_PACKS = {  # Meta marketing ≈ ₹0.88/msg + platform margin
    "wa_100": {"price": 149, "points": 100, "label": "Starter"},
    "wa_500": {"price": 649, "points": 500, "label": "Growth"},
    "wa_1000": {"price": 1199, "points": 1000, "label": "Pro"},
}
CHANNELS = {"sms": {"packs": SMS_PACKS, "field": "sms_points", "label": "SMS"},
            "whatsapp": {"packs": WA_PACKS, "field": "wa_points", "label": "WhatsApp"}}


# HQ cost per message (paise) — what MSG91 / Meta charge us. Margin floor the Boss wants on top: SMS +10p, WA +15p.
DEFAULT_PRICING = {"sms_cost_paise": 25, "whatsapp_cost_paise": 93, "min_margin_paise": {"sms": 10, "whatsapp": 15}}
_pricing_cache: dict = {"at": 0.0, "doc": None}


async def pack_pricing() -> dict:
    """Editable pack catalogue + HQ unit costs (platform_settings.pack_pricing), defaults from code. Cached 30s."""
    if _pricing_cache["doc"] and time.time() - _pricing_cache["at"] < 30:
        return _pricing_cache["doc"]
    doc = await _raw_db.platform_settings.find_one({"key": "pack_pricing"}, {"_id": 0}) or {}
    merged = {**DEFAULT_PRICING, **{k: v for k, v in doc.items() if k in ("sms_cost_paise", "whatsapp_cost_paise")},
              "packs": {"sms": doc.get("packs", {}).get("sms") or SMS_PACKS, "whatsapp": doc.get("packs", {}).get("whatsapp") or WA_PACKS}}
    _pricing_cache.update(at=time.time(), doc=merged)
    return merged




def channel_cfg(name: str | None, pricing: dict | None = None) -> dict | None:
    key = (name or "sms").lower()
    ch = CHANNELS.get(key)
    if not ch:
        return None
    packs = (pricing or {}).get("packs", {}).get(key) or ch["packs"]
    return {"key": key, **ch, "packs": packs}


def invalidate_pricing_cache() -> None:
    _pricing_cache["doc"] = None
