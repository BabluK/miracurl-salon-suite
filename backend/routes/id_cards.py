"""Employee ID card PDFs: salon staff cards (tenant branding) + HQ-verified registry staff cards (Miracurl branding)."""
import asyncio
import os
import re

from fastapi import APIRouter, Depends, HTTPException, Response

from database import _raw_db, db
from security import require_tenant_admin, require_super_admin, current_tenant
from services.pdf import _render_id_card_pdf
from services.storage import _get_object
from routes.registry import _safe_fetch_image_bytes

router = APIRouter()

_MIRACURL_LOGO = os.path.join(os.path.dirname(__file__), "..", "assets", "miracurl-logo.png")


def _site_host() -> str:
    url = os.environ.get("APP_PUBLIC_URL", "https://miracurlunisexsaloon.com")
    return re.sub(r"^https?://", "", url).rstrip("/")


def _verify_qr_url(phone: str, staff_code: str = "", name: str = "") -> str:
    """Public registry deep-link: phone lookup needs no verifier; staff-code fallback carries the badge name."""
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurlunisexsaloon.com").rstrip("/")
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) >= 10:
        return f"{base}/staff-registry?q={digits[-10:]}"
    if staff_code:
        first = (name or "").split()[0] if name else ""
        return f"{base}/staff-registry?q={staff_code}&name={first}"
    return f"{base}/staff-registry"


async def _img_bytes(url: str, tenant_id=None):
    url = (url or "").strip()
    if not url:
        return None
    if url.startswith("/api/files/"):
        rec = await _raw_db.uploads.find_one({"id": url.rsplit("/", 1)[-1], "is_deleted": False})
        if not rec or (tenant_id is not None and rec.get("tenant_id") != tenant_id):
            return None
        try:
            return _get_object(rec["storage_path"])[0]
        except Exception:
            return None
    try:
        return await asyncio.to_thread(_safe_fetch_image_bytes, url)
    except Exception:
        return None


def _card_response(pdf_bytes: bytes, name: str) -> Response:
    fname = f"id-card-{re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-') or 'staff'}.pdf"
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{fname}"'})


@router.get("/id-cards/staff/{sid}/pdf")
async def staff_id_card(sid: str, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    s = await db.staff.find_one({"id": sid}, {"_id": 0, "aadhaar_hash": 0})
    if not s:
        raise HTTPException(404, "Staff not found")
    if s.get("active") is False:
        raise HTTPException(400, "ID cards are only generated for currently working staff")
    photo = await _img_bytes(s.get("image_url"), tenant_id=t["id"])
    logo = await _img_bytes(t.get("logo_url"), tenant_id=t["id"])
    data = {
        "name": s["name"], "role": s.get("role") or "Staff",
        "id_number": f"EMP-{s['id'][:8].upper()}",
        "email": (s.get("email") or "").strip() or None,
        "phone": None if (s.get("email") or "").strip() else (s.get("phone") or None),
        "blood_group": s.get("blood_group") or None,
        "photo_bytes": photo, "logo_bytes": logo,
        "brand_name": t.get("name") or "Salon",
        "website": f"{_site_host()}/book/{t.get('slug', '')}",
        "qr_url": _verify_qr_url(s.get("phone") or ""),
    }
    pdf_bytes = await asyncio.to_thread(_render_id_card_pdf, data)
    return _card_response(pdf_bytes, s["name"])


@router.get("/super/id-cards/{eid}/pdf")
async def hq_id_card(eid: str, admin=Depends(require_super_admin)):
    emp = await _raw_db.registry_employees.find_one({"id": eid}, {"_id": 0, "aadhaar_hash": 0})
    if not emp:
        raise HTTPException(404, "Staff not found in the registry")
    rec = await _raw_db.registry_employments.find_one(
        {"employee_id": eid, "hq_verified": True}, {"_id": 0}, sort=[("created_at", -1)])
    if not rec:
        raise HTTPException(404, "No HQ-verified record for this staff")
    photo = await _img_bytes(emp.get("photo_url"))
    logo = None
    try:
        with open(_MIRACURL_LOGO, "rb") as f:
            logo = f.read()
    except Exception:
        logo = None
    data = {
        "name": emp["name"], "role": rec.get("designation") or "Stylist",
        "id_number": emp["staff_code"],
        "email": (emp.get("email") or "").strip() or None,
        "phone": None if (emp.get("email") or "").strip() else (emp.get("phone") or None),
        "blood_group": None,
        "photo_bytes": photo, "logo_bytes": logo,
        "brand_name": "Miracurl",
        "website": f"{_site_host()}/staff-registry",
        "qr_url": _verify_qr_url(emp.get("phone") or "", emp.get("staff_code") or "", emp.get("name") or ""),
    }
    pdf_bytes = await asyncio.to_thread(_render_id_card_pdf, data)
    return _card_response(pdf_bytes, emp["name"])
