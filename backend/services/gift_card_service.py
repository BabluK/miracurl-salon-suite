"""Shared gift-card / payment helpers used by gift_cards, premium_membership and wallet_pass.
Lives outside the route layer to avoid cross-route import cycles."""
import base64
import io
import os

from fastapi import HTTPException

from database import _raw_db

MAIN_TENANT_SLUG = "miracurl-marathahalli"
DEFAULT_AMOUNTS = [500, 1000, 2000, 5000]
DEFAULT_VALIDITY = 180  # days (~6 months)


def _gc_settings(t: dict) -> dict:
    s = t.get("gift_card_settings") or {}
    return {"enabled": bool(s.get("enabled", True)),
            "razorpay_key_id": s.get("razorpay_key_id") or "",
            "razorpay_key_secret": s.get("razorpay_key_secret") or "",
            "upi_id": s.get("upi_id") or "",
            "validity_days": int(s.get("validity_days") or DEFAULT_VALIDITY),
            "occasion_campaigns": bool(s.get("occasion_campaigns", True)),
            "amounts": s.get("amounts") or DEFAULT_AMOUNTS}


def _pay_keys(t: dict) -> tuple[str, str]:
    """Salon's own Razorpay keys; the main Miracurl salon falls back to platform keys."""
    s = _gc_settings(t)
    if s["razorpay_key_id"] and s["razorpay_key_secret"]:
        return s["razorpay_key_id"], s["razorpay_key_secret"]
    if t.get("slug") == MAIN_TENANT_SLUG:
        return os.environ.get("RAZORPAY_KEY_ID", ""), os.environ.get("RAZORPAY_KEY_SECRET", "")
    return "", ""


async def _tenant_by_slug(slug: str) -> dict:
    t = await _raw_db.tenants.find_one(
        {"slug": slug, "status": {"$in": ["active", "trial"]}}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Salon not found")
    return t


def _upi_qr_b64(data: str) -> str:
    """PNG QR of the upi:// URI so desktop buyers can scan with any UPI app."""
    import qrcode
    img = qrcode.make(data, box_size=7, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()
