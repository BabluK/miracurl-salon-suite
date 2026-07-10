"""Employee ID card PDFs: salon staff cards (tenant branding) + HQ-verified registry staff cards (Miracurl branding)."""
import asyncio
import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

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


# ---------------- Miracurl HQ team (super-admin's own staff + CEO) ----------------
ROSE_GOLD = (0.72, 0.43, 0.40)


class TeamMemberIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    designation: str = Field(..., min_length=2, max_length=80)
    phone: str = Field("", max_length=16)
    email: str = Field("", max_length=120)
    blood_group: str = Field("", max_length=4)
    photo_url: str = Field("", max_length=500)


@router.get("/super/team")
async def team_list(admin=Depends(require_super_admin)):
    return {"members": await _raw_db.hq_team.find({}, {"_id": 0}).sort("created_at", 1).to_list(100)}


@router.post("/super/team")
async def team_add(body: TeamMemberIn, admin=Depends(require_super_admin)):
    seq = await _raw_db.hq_team.count_documents({}) + 1
    code = f"MC-{seq:04d}"
    while await _raw_db.hq_team.find_one({"member_code": code}):
        seq += 1
        code = f"MC-{seq:04d}"
    doc = {"id": str(uuid.uuid4()), "member_code": code, **body.model_dump(),
           "created_at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.hq_team.insert_one({**doc})
    return doc


@router.put("/super/team/{tid}")
async def team_update(tid: str, body: TeamMemberIn, admin=Depends(require_super_admin)):
    res = await _raw_db.hq_team.update_one({"id": tid}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Team member not found")
    return {"ok": True}


@router.delete("/super/team/{tid}")
async def team_delete(tid: str, admin=Depends(require_super_admin)):
    res = await _raw_db.hq_team.delete_one({"id": tid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Team member not found")
    return {"ok": True}


@router.get("/super/team/{tid}/id-card.pdf")
async def team_id_card(tid: str, admin=Depends(require_super_admin)):
    m = await _raw_db.hq_team.find_one({"id": tid}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Team member not found")
    photo = await _img_bytes(m.get("photo_url"))
    try:
        with open(_MIRACURL_LOGO, "rb") as f:
            logo = f.read()
    except Exception:
        logo = None
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurlunisexsaloon.com").rstrip("/")
    data = {
        "name": m["name"], "role": m.get("designation") or "Team",
        "id_number": m["member_code"],
        "email": (m.get("email") or "").strip() or None,
        "phone": (m.get("phone") or "").strip() or None,
        "blood_group": (m.get("blood_group") or "").strip() or None,
        "photo_bytes": photo, "logo_bytes": logo,
        "brand_name": "Miracurl", "website": _site_host(),
        "qr_url": base, "qr_label": "SCAN - MIRACURL",
        "accent": ROSE_GOLD,
    }
    pdf_bytes = await asyncio.to_thread(_render_id_card_pdf, data)
    return _card_response(pdf_bytes, m["name"])
