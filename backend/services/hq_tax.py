"""HQ tax profile — GST is added on top of every tenant payment (plans, credit packs). Super Admin sets
GSTIN / MSME once; invoices and orders pick them up automatically."""
from database import _raw_db

KEY = "hq_tax_profile"
DEFAULT = {"gst_rate_pct": 18.0, "gstin": "", "msme": "", "legal_name": "Miracurl Studio", "address": "", "state_code": "29", "apply_gst": True}


async def get_profile() -> dict:
    doc = await _raw_db.hq_settings.find_one({"key": KEY}, {"_id": 0, "key": 0}) or {}
    return {**DEFAULT, **doc}


async def save_profile(patch: dict) -> dict:
    await _raw_db.hq_settings.update_one({"key": KEY}, {"$set": {"key": KEY, **patch}}, upsert=True)
    return await get_profile()


def tax_breakdown(base_inr: float, profile: dict) -> dict:
    """Base (ex-GST) → GST → total; all rounded to paise. GST is split CGST/SGST for same-state, shown as IGST otherwise (label only)."""
    rate = float(profile.get("gst_rate_pct") or 0) if profile.get("apply_gst", True) else 0.0
    base = round(float(base_inr), 2)
    gst = round(base * rate / 100, 2)
    return {"base": base, "gst_rate_pct": rate, "gst": gst, "total": round(base + gst, 2),
            "gstin": profile.get("gstin") or "", "msme": profile.get("msme") or "", "legal_name": profile.get("legal_name") or "",
            "gst_note": (f"GST {rate:g}% (GSTIN {profile['gstin']})" if profile.get("gstin") else f"GST {rate:g}% — GSTIN pending") if rate else "No GST"}
