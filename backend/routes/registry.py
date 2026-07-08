"""Cross-Salon Staff History Registry: Aadhaar-verified staff records + public verification."""
import asyncio
import hashlib
import os
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from urllib.parse import urlparse

import requests
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator

from database import _raw_db
from security import jwt_secret, require_tenant_admin, current_tenant, public_rate_limit
from services.pdf import _build_registry_pdf

router = APIRouter()

_REG_BADGE_ORDER = ["NEW", "GOOD", "EXCELLENT", "EXTRAORDINARY"]
_REG_REASONS = {"", "Working", "Resigned", "Terminated", "Absconded", "Contract Ended", "Transferred", "Other"}

def _aadhaar_fp(num: str) -> str:
    pepper = os.environ.get("REGISTRY_PEPPER") or jwt_secret()
    return hashlib.sha256(f"aadhaar:{num}:{pepper}".encode()).hexdigest()

def _aadhaar_fps(num: str) -> list:
    """Current fp + legacy fps (pre-migration peppers) for backwards-compatible lookups."""
    fps = [_aadhaar_fp(num)]
    for legacy in (os.environ.get("REGISTRY_PEPPER_LEGACY"), jwt_secret()):
        if not legacy:
            continue
        fp = hashlib.sha256(f"aadhaar:{num}:{legacy}".encode()).hexdigest()
        if fp not in fps:
            fps.append(fp)
    return fps

async def _registry_find_by_aadhaar(num: str, projection: dict, limit: int = 5) -> list:
    """Lookup by Aadhaar fingerprint; lazily re-peppers legacy hashes on match."""
    fps = _aadhaar_fps(num)
    rows = await _raw_db.registry_employees.find({"aadhaar_hash": {"$in": fps}}, projection).to_list(limit)
    if rows and len(fps) > 1:
        await _raw_db.registry_employees.update_many(
            {"aadhaar_hash": {"$in": fps[1:]}}, {"$set": {"aadhaar_hash": fps[0]}})
    return rows

def is_safe_public_url(url: str) -> bool:
    """Allow only http(s) URLs that do not resolve to private/loopback/link-local hosts (SSRF guard)."""
    import ipaddress
    import socket
    from urllib.parse import urlparse
    try:
        p = urlparse((url or "").strip())
    except Exception:
        return False
    if p.scheme not in ("http", "https") or not p.hostname:
        return False
    try:
        infos = socket.getaddrinfo(p.hostname, None)
    except Exception:
        return False
    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            return False
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            return False
    return True

def is_safe_link(url: str) -> bool:
    """http(s)-only scheme check for links rendered as href on public pages (XSS guard). Empty allowed."""
    u = (url or "").strip()
    if not u:
        return True
    from urllib.parse import urlparse
    try:
        return urlparse(u).scheme in ("http", "https")
    except Exception:
        return False

def _safe_fetch_image_bytes(url: str, limit: int = 4 * 1024 * 1024) -> bytes:
    import ipaddress
    if not is_safe_public_url(url):
        raise ValueError("blocked url")
    resp = requests.get(url, timeout=6, stream=True, allow_redirects=False)
    try:
        # SEC: re-validate the ACTUAL connected peer IP (defeats DNS-rebinding TOCTOU).
        try:
            sock = resp.raw._connection.sock  # noqa: SLF001
            peer = ipaddress.ip_address(sock.getpeername()[0])
        except Exception:
            raise ValueError("blocked url")  # fail closed if peer can't be verified
        if (peer.is_private or peer.is_loopback or peer.is_link_local
                or peer.is_reserved or peer.is_multicast or peer.is_unspecified):
            raise ValueError("blocked url")
        resp.raise_for_status()
        return resp.raw.read(limit, decode_content=True)
    finally:
        resp.close()

def _reg_date_ok(v: str) -> str:
    datetime.strptime(v, "%Y-%m-%d")
    return v

class RegistryEmployeeIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    aadhaar: str
    permanent_address: str = Field(..., min_length=5, max_length=300)
    current_address: str = Field("", max_length=300)
    city: str = Field("", max_length=80)
    email: str = Field("", max_length=120)
    phone: str
    photo_url: str = Field("", max_length=500)

    @field_validator("aadhaar")
    @classmethod
    def _v_aadhaar(cls, v):
        v = re.sub(r"\D", "", v)
        if len(v) != 12:
            raise ValueError("Aadhaar must be exactly 12 digits")
        return v

    @field_validator("phone")
    @classmethod
    def _v_phone(cls, v):
        v = re.sub(r"\D", "", v)
        if len(v) < 10:
            raise ValueError("Enter a valid phone number")
        return v

    @field_validator("photo_url")
    @classmethod
    def _v_photo(cls, v):
        v = (v or "").strip()
        if v and not v.startswith("/api/files/") and urlparse(v).scheme not in ("http", "https"):
            raise ValueError("Invalid photo URL")
        return v

class RegistryEmploymentIn(BaseModel):
    designation: str = Field(..., min_length=2, max_length=80)
    skills: List[str] = []
    from_date: str
    to_date: Optional[str] = None
    reason_for_leaving: str = Field("", max_length=40)
    rating: Optional[float] = Field(None, ge=1, le=5)
    comment: str = Field("", max_length=1000)

    @field_validator("from_date")
    @classmethod
    def _v_from(cls, v):
        return _reg_date_ok(v)

    @field_validator("to_date")
    @classmethod
    def _v_to(cls, v):
        if v in (None, ""):
            return None
        return _reg_date_ok(v)

    @field_validator("reason_for_leaving")
    @classmethod
    def _v_reason(cls, v):
        if v not in _REG_REASONS:
            raise ValueError("Invalid reason")
        return v

def _employment_years(e: dict) -> float:
    try:
        start = datetime.strptime(e["from_date"], "%Y-%m-%d")
        end = datetime.strptime(e["to_date"], "%Y-%m-%d") if e.get("to_date") else datetime.now()
        return max((end - start).days, 0) / 365.25
    except Exception:
        return 0.0

def _registry_badge(total_years: float, avg_rating) -> str:
    if avg_rating is not None and avg_rating < 2:
        return "BAD"
    if total_years < 1:
        idx = 0
    elif total_years < 3:
        idx = 1
    elif total_years < 5:
        idx = 2
    else:
        idx = 3
    if avg_rating is not None and avg_rating < 3 and idx > 0:
        idx -= 1
    return _REG_BADGE_ORDER[idx]

def _hire_verdict(emps: list, badge: str, avg_rating, total_years: float) -> tuple:
    """(verdict, note) for the public verify page — red / green / amber."""
    red_reasons = [e.get("reason_for_leaving") for e in emps
                   if e.get("reason_for_leaving") in ("Terminated", "Absconded")]
    if red_reasons or badge == "BAD" or (avg_rating is not None and avg_rating < 2.5):
        cause = "/".join(sorted(set(red_reasons))) if red_reasons else "very low ratings"
        return "red", f"Caution — past record shows {cause}. Verify carefully before hiring."
    if (avg_rating is not None and avg_rating >= 4) or badge in ("Excellent", "Extraordinary"):
        return "green", "Strong record — well-rated with clean employment history. Recommended."
    if avg_rating is None and total_years < 1:
        return "amber", "Limited history — new to the registry, no ratings yet. Take references."
    return "amber", "Average record — acceptable history, review ratings and reasons before hiring."


def _registry_pii_fields(emp: dict, redact: bool, show_aadhaar: bool) -> dict:
    """`redact` hides direct-contact PII on public / low-trust paths (SEC-001):
    employment history + verdict stay visible; home addresses & contacts do not."""
    phone = emp.get("phone") or ""
    return {
        "email": "" if redact else (emp.get("email") or ""),
        "phone": (f"XXXXXX{phone[-4:]}" if phone else "") if redact else phone,
        "aadhaar_masked": f"XXXX-XXXX-{emp.get('aadhaar_last4', '')}" if show_aadhaar else "XXXX-XXXX-XXXX",
        "permanent_address": "" if redact else (emp.get("permanent_address") or ""),
        "current_address": "" if redact else (emp.get("current_address") or ""),
    }


async def _registry_profile(emp: dict, current_only: bool = False, redact: bool = False, show_aadhaar: bool = True) -> dict:
    emps = await _raw_db.registry_employments.find(
        {"employee_id": emp["id"]}, {"_id": 0}).sort("from_date", -1).to_list(100)
    for e in emps:
        e["years"] = round(_employment_years(e), 1)
    total_years = sum(_employment_years(e) for e in emps)
    ratings = [float(e["rating"]) for e in emps if e.get("rating")]
    avg_rating = round(sum(ratings) / len(ratings), 1) if ratings else None
    if current_only:
        emps = [e for e in emps if not e.get("to_date")]
    badge = _registry_badge(total_years, avg_rating)
    verdict, verdict_note = _hire_verdict(emps, badge, avg_rating, total_years)
    return {
        "history_scope": "current" if current_only else "full",
        "id": emp["id"], "staff_code": emp["staff_code"], "name": emp["name"],
        "photo_url": emp.get("photo_url") or "",
        **_registry_pii_fields(emp, redact, show_aadhaar),
        "city": emp.get("city") or "",
        "total_years": round(total_years, 1), "avg_rating": avg_rating,
        "badge": badge,
        "hire_verdict": verdict, "hire_verdict_note": verdict_note,
        "employments": emps, "created_at": emp.get("created_at"),
        "created_by_tenant": emp.get("created_by_tenant", ""),
    }

@router.post("/registry/employees")
async def registry_create_employee(body: RegistryEmployeeIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    fp = _aadhaar_fp(body.aadhaar)
    dup = await _registry_find_by_aadhaar(body.aadhaar, {"_id": 0, "staff_code": 1}, limit=1)
    if dup:
        raise HTTPException(409, f"This Aadhaar is already registered with Staff ID {dup[0]['staff_code']}. Search that ID to add your salon's employment record.")
    seq = await _raw_db.registry_employees.count_documents({}) + 1
    code = f"STF-{seq:05d}"
    while await _raw_db.registry_employees.find_one({"staff_code": code}):
        seq += 1
        code = f"STF-{seq:05d}"
    doc = {
        "id": str(uuid.uuid4()), "staff_code": code, "name": body.name.strip(),
        "aadhaar_last4": body.aadhaar[-4:], "aadhaar_hash": fp,
        "permanent_address": body.permanent_address.strip(), "current_address": body.current_address.strip(),
        "city": body.city.strip(),
        "email": body.email.strip().lower(), "phone": body.phone,
        "photo_url": body.photo_url.strip(), "created_by_tenant": t["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _raw_db.registry_employees.insert_one(doc)
    return {"ok": True, "id": doc["id"], "staff_code": code}

class RegistryEmployeeUpdateIn(BaseModel):
    phone: str
    email: str = Field("", max_length=120)
    photo_url: str = Field("", max_length=500)
    current_address: str = Field("", max_length=300)
    city: str = Field("", max_length=80)

    @field_validator("phone")
    @classmethod
    def _v_phone(cls, v):
        v = re.sub(r"\D", "", v)
        if len(v) < 10:
            raise ValueError("Enter a valid phone number")
        return v

    @field_validator("photo_url")
    @classmethod
    def _v_photo(cls, v):
        v = (v or "").strip()
        if v and not v.startswith("/api/files/") and urlparse(v).scheme not in ("http", "https"):
            raise ValueError("Invalid photo URL")
        return v

@router.put("/registry/employees/{eid}")
async def registry_update_employee(eid: str, body: RegistryEmployeeUpdateIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    res = await _raw_db.registry_employees.update_one(
        {"id": eid, "created_by_tenant": t["id"]},
        {"$set": {"phone": body.phone, "email": body.email.strip().lower(),
                  "photo_url": body.photo_url.strip(), "current_address": body.current_address.strip(),
                  "city": body.city.strip(), "updated_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Employee not found (only the salon that registered them can edit their details)")
    return {"ok": True}

@router.get("/registry/employees")
async def registry_list_employees(q: Optional[str] = None, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    # Contact & address details only for PAID salons (or HQ). Instant free-trial
    # signups get the redacted view — blocks bulk PII harvesting (SEC-001).
    redact = admin.get("role") != "super_admin" and t.get("status") != "active"
    if q and q.strip():
        qs = q.strip()
        digits = re.sub(r"\D", "", qs)
        # Searching by Staff ID -> current organization only; phone/name -> full history
        if re.fullmatch(r"STF-\d+", qs.upper()):
            rows = await _raw_db.registry_employees.find(
                {"staff_code": qs.upper()}, {"_id": 0, "aadhaar_hash": 0}).to_list(5)
            return [await _registry_profile(r, current_only=True, redact=redact) for r in rows]
        # 12-digit query = Aadhaar — the permanent identifier: full history across salons
        if len(digits) == 12:
            rows = await _registry_find_by_aadhaar(digits, {"_id": 0, "aadhaar_hash": 0})
            return [await _registry_profile(r, redact=redact) for r in rows]
        ors = [{"name": {"$regex": re.escape(qs), "$options": "i"}}]
        if len(digits) >= 6:
            ors.append({"phone": {"$regex": f"{digits}$"}})
        rows = await _raw_db.registry_employees.find({"$or": ors}, {"_id": 0, "aadhaar_hash": 0}).to_list(20)
        return [await _registry_profile(r, redact=redact) for r in rows]
    # No query: this salon's own roster (created here or employed here) — unredacted.
    emp_ids = await _raw_db.registry_employments.distinct("employee_id", {"tenant_id": t["id"]})
    rows = await _raw_db.registry_employees.find(
        {"$or": [{"created_by_tenant": t["id"]}, {"id": {"$in": emp_ids}}]},
        {"_id": 0, "aadhaar_hash": 0}).sort("created_at", -1).to_list(100)
    return [await _registry_profile(r) for r in rows]

@router.post("/registry/employees/{eid}/employments")
async def registry_add_employment(eid: str, body: RegistryEmploymentIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    emp = await _raw_db.registry_employees.find_one({"id": eid}, {"_id": 0, "id": 1})
    if not emp:
        raise HTTPException(404, "Employee not found")
    # One record per staff per salon. Re-hires are controlled by HQ: the
    # super-admin (via Act As Salon) can always add the returning-employee record.
    if admin.get("role") != "super_admin":
        existing = await _raw_db.registry_employments.find_one(
            {"employee_id": eid, "tenant_id": t["id"]}, {"_id": 0, "id": 1})
        if existing:
            raise HTTPException(
                403, "A record for this staff already exists under your salon. "
                     "If they re-joined, contact HQ (super-admin) to add the re-hire record.")
    doc = {
        "id": str(uuid.uuid4()), "employee_id": eid, "tenant_id": t["id"],
        "salon_name": t.get("name", "Salon"),
        **body.model_dump(),
        "created_by": admin["id"], "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _raw_db.registry_employments.insert_one(doc)
    return {"ok": True, "id": doc["id"]}

@router.post("/registry/employees/{eid}/transfer")
async def registry_transfer_employee(eid: str, body: RegistryEmploymentIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """One-tap transfer: close open employments at other salons, start a record here."""
    emp = await _raw_db.registry_employees.find_one({"id": eid}, {"_id": 0, "id": 1})
    if not emp:
        raise HTTPException(404, "Employee not found")
    res = await _raw_db.registry_employments.update_many(
        {"employee_id": eid, "to_date": None, "tenant_id": {"$ne": t["id"]}},
        {"$set": {"to_date": body.from_date, "reason_for_leaving": "Transferred",
                  "closed_by_transfer": True, "closed_by_tenant": t["id"],
                  "closed_by_name": t.get("name", "Salon"), "closed_by_user": admin["id"],
                  "updated_at": datetime.now(timezone.utc).isoformat()}})
    payload = body.model_dump()
    payload["to_date"] = None
    payload["reason_for_leaving"] = "Working"
    doc = {
        "id": str(uuid.uuid4()), "employee_id": eid, "tenant_id": t["id"],
        "salon_name": t.get("name", "Salon"),
        **payload,
        "created_by": admin["id"], "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _raw_db.registry_employments.insert_one(doc)
    return {"ok": True, "id": doc["id"], "closed": res.modified_count}

@router.put("/registry/employments/{rid}")
async def registry_update_employment(rid: str, body: RegistryEmploymentIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    res = await _raw_db.registry_employments.update_one(
        {"id": rid, "tenant_id": t["id"]},
        {"$set": {**body.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Employment record not found (you can only edit your own salon's records)")
    return {"ok": True}

@router.delete("/registry/employments/{rid}")
async def registry_delete_employment(rid: str, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    res = await _raw_db.registry_employments.delete_one({"id": rid, "tenant_id": t["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Employment record not found (you can only delete your own salon's records)")
    return {"ok": True}

def _name_matches(emp_name: str, given: str) -> bool:
    """SEC-002: staff-code lookups need the name printed on the badge — blocks blind
    enumeration of sequential STF-xxxxx IDs."""
    g = re.sub(r"\s+", " ", (given or "").strip().lower())
    n = re.sub(r"\s+", " ", (emp_name or "").strip().lower())
    if len(g) < 2:
        return False
    return g == n or g in n.split() or n.startswith(g)


_NAME_REQUIRED_MSG = ("To verify a Staff ID, also enter the staff member's name exactly as printed "
                      "on their badge (first name is enough).")


@router.get("/public/registry/search")
async def registry_public_search(q: str, request: Request, name: str = ""):
    public_rate_limit(request, key_suffix="registry", limit=10, window_sec=600)
    qs = (q or "").strip()
    if not qs:
        raise HTTPException(400, "Enter a Staff ID or phone number")
    digits = re.sub(r"\D", "", qs)
    # Staff ID lookup -> requires the badge name as a verifier; only the CURRENT organization is shown.
    # Phone lookup -> the FULL employment history (past + present) is shown.
    emp = await _raw_db.registry_employees.find_one({"staff_code": qs.upper()}, {"_id": 0})
    if emp:
        if not _name_matches(emp.get("name", ""), name):
            raise HTTPException(400, _NAME_REQUIRED_MSG)
        return await _registry_profile(emp, current_only=True, redact=True, show_aadhaar=False)
    # 12-digit query = Aadhaar (permanent ID) → full cross-salon history
    if len(digits) == 12:
        emp = await _raw_db.registry_employees.find_one({"aadhaar_hash": _aadhaar_fp(digits)}, {"_id": 0})
        if not emp:
            raise HTTPException(404, "No staff found with that Aadhaar number — check all 12 digits")
        return await _registry_profile(emp, redact=True)
    if len(digits) >= 10:
        emp = await _raw_db.registry_employees.find_one({"phone": {"$regex": f"{digits[-10:]}$"}}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "No staff found. Use their 12-digit Aadhaar, 10-digit phone, or Staff ID (STF-xxxxx)")
    return await _registry_profile(emp, redact=True, show_aadhaar=False)



@router.get("/public/registry/{staff_code}/pdf")
async def registry_public_pdf(staff_code: str, request: Request, name: str = ""):
    public_rate_limit(request, key_suffix="registry-pdf", limit=10, window_sec=600)
    emp = await _raw_db.registry_employees.find_one({"staff_code": staff_code.upper()}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Staff not found")
    if not _name_matches(emp.get("name", ""), name):
        raise HTTPException(400, _NAME_REQUIRED_MSG)
    profile = await _registry_profile(emp, redact=True, show_aadhaar=False)
    pdf_bytes = await asyncio.to_thread(_build_registry_pdf, profile, _safe_fetch_image_bytes)
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{emp["staff_code"]}-badge.pdf"'})
