"""Per-tenant feature switches decided by Super Admin (SMS, WhatsApp) + HQ support-access consent."""
from database import _raw_db

FEATURE_KEYS = ("sms", "whatsapp")


def features_of(t: dict | None) -> dict:
    """Missing key = OFF: HQ switches each feature on per tenant."""
    f = (t or {}).get("features") or {}
    # Strictly opt-in: credits or an own WhatsApp number do NOT switch sending on — Super Admin must enable it.
    return {k: bool(f.get(k)) for k in FEATURE_KEYS}


async def feature_on(tenant_id: str, key: str) -> bool:
    t = await _raw_db.tenants.find_one({"id": tenant_id}, {"_id": 0, "features": 1})
    return features_of(t).get(key, False)


def support_access_on(t: dict | None) -> bool:
    """HQ may open this tenant's workspace only when Super Admin switched it on (default OFF)."""
    return (t or {}).get("support_access") is True
