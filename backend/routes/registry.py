"""Cross-Salon Staff History Registry: Aadhaar-verified staff records + public verification."""
import asyncio
import base64
import hashlib
import html as html_lib
import os
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from urllib.parse import quote, urlparse

import requests
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field, field_validator

from database import _raw_db
from security import jwt_secret, require_tenant_admin, require_admin, require_super_admin, current_tenant, public_rate_limit
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
    all_emps = emps
    if current_only:
        emps = [e for e in emps if not e.get("to_date")]
    badge = _registry_badge(total_years, avg_rating)
    verdict, verdict_note = _hire_verdict(all_emps, badge, avg_rating, total_years)
    term_labels = sorted({e.get("reason_for_leaving") for e in all_emps
                          if e.get("reason_for_leaving") in ("Terminated", "Absconded")})
    hq_verified = any(e.get("hq_verified") for e in emps)
    return {
        "history_scope": "current" if current_only else "full",
        "id": emp["id"], "staff_code": emp["staff_code"], "name": emp["name"],
        "photo_url": emp.get("photo_url") or "",
        **_registry_pii_fields(emp, redact, show_aadhaar),
        "city": emp.get("city") or "",
        "total_years": round(total_years, 1), "avg_rating": avg_rating,
        "badge": badge, "hq_verified": hq_verified,
        "terminated": bool(term_labels), "terminated_labels": term_labels,
        "hire_verdict": verdict, "hire_verdict_note": verdict_note,
        "employments": emps, "created_at": emp.get("created_at"),
        "created_by_tenant": emp.get("created_by_tenant", ""),
    }


class HQStaffIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    phone: str = Field(..., min_length=10, max_length=14)
    aadhaar: str = Field("", max_length=12)
    photo_url: str = Field("", max_length=500)
    salon_name: str = Field(..., min_length=2, max_length=120)
    role: str = Field("", max_length=60)
    years_worked: float = Field(1.0, ge=0, le=50)
    owner_comment: str = Field("", max_length=400)
    city: str = Field("", max_length=80)


@router.post("/super/registry/staff")
async def hq_add_verified_staff(body: HQStaffIn, admin=Depends(require_super_admin)):
    """HQ field-verification: super-admin records a salon's trusted long-term staff
    (collected in person from the owner) so they appear on the public portal with an HQ badge."""
    phone = re.sub(r"\D", "", body.phone)
    aadhaar = re.sub(r"\D", "", body.aadhaar)
    if aadhaar and len(aadhaar) != 12:
        raise HTTPException(400, "Aadhaar must be 12 digits (or leave it empty)")
    emp = None
    if aadhaar:
        emp = await _raw_db.registry_employees.find_one({"aadhaar_hash": _aadhaar_fp(aadhaar)}, {"_id": 0})
    if not emp:
        emp = await _raw_db.registry_employees.find_one({"phone": {"$regex": f"{phone[-10:]}$"}}, {"_id": 0})
    if not emp:
        seq = await _raw_db.registry_employees.count_documents({}) + 1
        code = f"STF-{seq:05d}"
        while await _raw_db.registry_employees.find_one({"staff_code": code}):
            seq += 1
            code = f"STF-{seq:05d}"
        emp = {
            "id": str(uuid.uuid4()), "staff_code": code, "name": body.name.strip(),
            "aadhaar_last4": aadhaar[-4:] if aadhaar else "",
            "aadhaar_hash": _aadhaar_fp(aadhaar) if aadhaar else "",
            "permanent_address": "", "current_address": "", "city": body.city.strip(),
            "email": "", "phone": phone, "photo_url": body.photo_url.strip(),
            "created_by_tenant": "hq", "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await _raw_db.registry_employees.insert_one({**emp})
    from_year = datetime.now(timezone.utc).year - max(0, int(body.years_worked))
    rec = {
        "id": str(uuid.uuid4()), "employee_id": emp["id"], "tenant_id": "hq",
        "salon_name": body.salon_name.strip(), "designation": body.role.strip() or "Stylist",
        "skills": [], "from_date": f"{from_year}-01-01", "to_date": None,
        "rating": None, "reason_for_leaving": "Working",
        "comment": body.owner_comment.strip(), "hq_verified": True,
        "created_by": admin["id"], "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _raw_db.registry_employments.insert_one(rec)
    return {"ok": True, "staff_code": emp["staff_code"], "employee_id": emp["id"]}


@router.get("/super/registry/staff")
async def hq_list_verified_staff(admin=Depends(require_super_admin)):
    rows = await _raw_db.registry_employments.find(
        {"hq_verified": True}, {"_id": 0}).sort("created_at", -1).to_list(100)
    out = []
    for r in rows:
        emp = await _raw_db.registry_employees.find_one({"id": r["employee_id"]}, {"_id": 0, "name": 1, "staff_code": 1, "phone": 1, "photo_url": 1})
        out.append({**r, "staff": emp or {}})
    return {"records": out}


@router.delete("/super/registry/staff/{rid}")
async def hq_delete_verified_staff(rid: str, admin=Depends(require_super_admin)):
    res = await _raw_db.registry_employments.delete_one({"id": rid, "hq_verified": True})
    if res.deleted_count == 0:
        raise HTTPException(404, "Record not found")
    return {"ok": True}

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
async def registry_list_employees(q: Optional[str] = None, admin=Depends(require_admin), t=Depends(current_tenant)):
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

class MarkLeftIn(BaseModel):
    reason_for_leaving: str = Field("Resigned", max_length=40)
    to_date: Optional[str] = None
    rating: Optional[float] = Field(None, ge=1, le=5)
    comment: str = Field("", max_length=1000)

    @field_validator("reason_for_leaving")
    @classmethod
    def _v_reason(cls, v):
        if v not in _REG_REASONS or v in ("", "Working"):
            raise ValueError("Invalid reason")
        return v

    @field_validator("to_date")
    @classmethod
    def _v_to(cls, v):
        if v in (None, ""):
            return None
        return _reg_date_ok(v)


@router.put("/registry/employments/{rid}/mark-left")
async def registry_mark_left(rid: str, body: MarkLeftIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Salon owner marks a staff member as having left: closes the open employment record.
    The staff disappears from the active roster but stays on the public portal."""
    rec = await _raw_db.registry_employments.find_one({"id": rid, "tenant_id": t["id"]}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Employment record not found (you can only update your own salon's records)")
    if rec.get("to_date"):
        raise HTTPException(400, "This staff is already marked as left")
    patch = {
        "to_date": body.to_date or datetime.now(timezone.utc).date().isoformat(),
        "reason_for_leaving": body.reason_for_leaving,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if body.rating is not None:
        patch["rating"] = body.rating
    if body.comment.strip():
        patch["comment"] = body.comment.strip()
    await _raw_db.registry_employments.update_one({"id": rid}, {"$set": patch})
    # Block the ex-staff's salon app login: disable any user account in this tenant
    # that matches the registry employee's email (they keep the separate Employee Portal).
    emp = await _raw_db.registry_employees.find_one({"id": rec.get("employee_id")}, {"_id": 0, "email": 1})
    disabled_login = False
    if emp and (emp.get("email") or "").strip():
        res = await _raw_db.users.update_one(
            {"tenant_id": t["id"], "email": emp["email"].strip().lower(), "role": {"$ne": "admin"}},
            {"$set": {"disabled": True}})
        disabled_login = res.modified_count > 0
    return {"ok": True, "to_date": patch["to_date"], "login_disabled": disabled_login}


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


_NAME_REQUIRED_MSG = ("To verify this staff member, also enter their name exactly as printed "
                      "on their badge (first name is enough).")


@router.get("/public/registry/search")
async def registry_public_search(q: str, request: Request, name: str = ""):
    public_rate_limit(request, key_suffix="registry", limit=10, window_sec=600)
    qs = (q or "").strip()
    if not qs:
        raise HTTPException(400, "Enter a Staff ID or phone number")

    def _check_consent(e: dict):
        if e and e.get("consent_withdrawn"):
            raise HTTPException(403, "This staff member has withdrawn consent for public profile lookups.")

    digits = re.sub(r"\D", "", qs)
    # Staff ID lookup -> requires the badge name as a verifier; only the CURRENT organization is shown.
    # Phone lookup -> the FULL employment history (past + present) is shown.
    emp = await _raw_db.registry_employees.find_one({"staff_code": qs.upper()}, {"_id": 0})
    if emp:
        _check_consent(emp)
        if not _name_matches(emp.get("name", ""), name):
            raise HTTPException(400, _NAME_REQUIRED_MSG)
        return await _registry_profile(emp, current_only=True, redact=True, show_aadhaar=False)
    # 12-digit query = Aadhaar (permanent ID) → full cross-salon history
    # 12-digit query: Aadhaar first; "91"-prefixed mobile numbers fall through to phone lookup
    if len(digits) == 12:
        emp = await _raw_db.registry_employees.find_one({"aadhaar_hash": _aadhaar_fp(digits)}, {"_id": 0})
        if not emp and not digits.startswith("91"):
            raise HTTPException(404, "No staff found with that Aadhaar number — check all 12 digits")
        if emp:
            _check_consent(emp)
            return await _registry_profile(emp, redact=True)
    if len(digits) >= 10:
        emp = await _raw_db.registry_employees.find_one({"phone": {"$regex": f"{digits[-10:]}$"}}, {"_id": 0})
        if emp and not _name_matches(emp.get("name", ""), name):
            raise HTTPException(400, _NAME_REQUIRED_MSG)
    if not emp:
        raise HTTPException(404, "No staff found. Use their 12-digit Aadhaar, 10-digit phone, or Staff ID (STF-xxxxx)")
    _check_consent(emp)
    return await _registry_profile(emp, redact=True, show_aadhaar=False)



@router.get("/public/registry/{staff_code}/pdf")
async def registry_public_pdf(staff_code: str, request: Request, name: str = ""):
    public_rate_limit(request, key_suffix="registry-pdf", limit=10, window_sec=600)
    emp = await _raw_db.registry_employees.find_one({"staff_code": staff_code.upper()}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Staff not found")
    if emp.get("consent_withdrawn"):
        raise HTTPException(403, "This staff member has withdrawn consent for public profile lookups.")
    if not _name_matches(emp.get("name", ""), name):
        raise HTTPException(400, _NAME_REQUIRED_MSG)
    profile = await _registry_profile(emp, redact=True, show_aadhaar=False)
    pdf_bytes = await _registry_pdf_bytes(profile)
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{emp["staff_code"]}-badge.pdf"'})


# ═══════════ Get-Verified badge requests (public form → HQ "Staff Verification" section) ═══════════

async def _registry_photo_bytes(photo_url: str):
    m = re.match(r"^/api/public/registry/photo/([\w-]+)$", photo_url or "")
    if not m:
        return None
    doc = await _raw_db.registry_photos.find_one({"id": m.group(1)}, {"_id": 0, "b64": 1})
    return base64.b64decode(doc["b64"]) if doc else None


async def _registry_pdf_bytes(profile: dict) -> bytes:
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    first = (profile.get("name") or "").split()[0] if (profile.get("name") or "").strip() else ""
    profile["verify_url"] = f"{base}/staff-registry?q={profile.get('staff_code', '')}&name={quote(first)}"
    pre = await _registry_photo_bytes(profile.get("photo_url"))
    fetcher = (lambda url: pre) if pre else _safe_fetch_image_bytes
    return await asyncio.to_thread(_build_registry_pdf, profile, fetcher)


def _joining_to_from_date(joining: str) -> str:
    m = re.search(r"(19|20)\d{2}", joining or "")
    return f"{m.group(0)}-01-01" if m else datetime.now(timezone.utc).date().isoformat()


def _badge_email_html(first: str, staff_code: str, base: str) -> str:
    return f"""
    <div style="max-width:560px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;border:1px solid #ece7db;border-radius:18px;overflow:hidden;background:#ffffff">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#1c1c22">
        <tr><td align="center" style="padding:22px">
          <img src="{base}/brand/miracurl-gold.png" width="180" alt="Miracurl" style="display:block" />
        </td></tr>
      </table>
      <div style="padding:30px 28px;text-align:center">
        <div style="display:inline-block;width:74px;height:74px;border-radius:50%;background:linear-gradient(135deg,#f472b6,#f59e0b);line-height:74px;font-size:34px;color:#fff">✔</div>
        <h2 style="margin:16px 0 4px;font-family:Georgia,serif;color:#1c1c22">You're officially verified, {first}! 🎉</h2>
        <p style="color:#8a8477;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin:0 0 14px">Miracurl Verified Professional</p>
        <div style="display:inline-block;background:#fdf6e9;border:1px solid #e9d9b8;border-radius:12px;padding:10px 26px;margin:0 0 18px">
          <span style="color:#8a8477;font-size:11px;letter-spacing:1px;text-transform:uppercase">Your permanent Staff ID</span><br/>
          <span style="font-family:Courier,monospace;font-size:22px;font-weight:bold;color:#b08d3f;letter-spacing:2px">{staff_code}</span>
        </div>
        <p style="color:#444;font-size:14px;line-height:1.7;margin:0 0 14px;text-align:left">
          Congratulations! Your employment details were verified with your salon owner, and your official
          <b>Miracurl Verified Badge</b> is attached to this email as a PDF. It's your career passport —
          verified experience and reputation that travel with you to any salon.</p>
        <p style="color:#444;font-size:14px;line-height:1.7;margin:0 0 18px;text-align:left">
          Anyone can confirm your badge anytime at <a href="{base}/staff-registry" style="color:#b08d3f;font-weight:bold">miracurl-suite.com/staff-registry</a> —
          just share your Staff ID <b>{staff_code}</b> and your name.</p>
        <a href="{base}/staff-registry" style="display:inline-block;background:linear-gradient(90deg,#fb7185,#ec4899,#f59e0b);color:#fff;text-decoration:none;padding:12px 30px;border-radius:999px;font-size:13px;font-weight:bold">View my public profile ✦</a>
      </div>
    </div>"""


@router.get("/public/registry/photo/{pid}")
async def registry_request_photo(pid: str):
    doc = await _raw_db.registry_photos.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Photo not found")
    return Response(content=base64.b64decode(doc["b64"]),
                    media_type=doc.get("content_type") or "image/jpeg",
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})


OWNER_RATINGS = {"excellent": (5, "⭐ Excellent"), "very-good": (4, "Very Good"),
                 "good": (3, "Good"), "average": (2, "Average"), "bad": (1, "Bad")}
_RATING_COLORS = {"excellent": "#0a7d43", "very-good": "#1f7a4d", "good": "#0284c7",
                  "average": "#b45309", "bad": "#b02a2a"}


def _owner_rating_email_html(req: dict, base: str) -> str:
    staff = html_lib.escape(req.get("name") or "your staff member")
    salon = html_lib.escape(req.get("salon_name") or "your salon")
    t = req["rating_token"]
    btns = "".join(
        f'<a href="{base}/api/public/registry/owner-rate/{t}/{k}" '
        f'style="display:inline-block;margin:4px;background:{_RATING_COLORS[k]};color:#fff;text-decoration:none;'
        f'padding:11px 20px;border-radius:999px;font-size:13px;font-weight:bold;font-family:Arial,sans-serif">{lbl}</a>'
        for k, (_, lbl) in OWNER_RATINGS.items())
    return f"""
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #eee;border-radius:16px;overflow:hidden">
      <div style="background:#1c1c22;padding:26px 30px">
        <div style="color:#d4af37;font-size:22px;font-weight:bold">Miracurl ✦ Staff Registry</div>
        <div style="color:#999;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:4px">Staff verification — owner rating</div>
      </div>
      <div style="padding:28px 30px;color:#333">
        <p>Hello,</p>
        <p><b>{staff}</b> has requested a verified career badge on the Miracurl Staff Registry and named
           <b>{salon}</b> as their workplace. As the owner/manager, your rating builds their public track record —
           it takes one click:</p>
        <div style="text-align:center;margin:22px 0">{btns}</div>
        <p style="font-size:12px;color:#888">Clicked the wrong one? Just click again — you can change your rating anytime from this email.</p>
        <div style="border-top:1px solid #eee;margin-top:22px;padding-top:16px">
          <p style="font-size:13px;color:#555"><b>Has {staff} left {salon}?</b> Request an official relieving letter —
             we'll prepare a certificate PDF and email it to both of you.</p>
          <p style="text-align:center;margin:14px 0 4px">
            <a href="{base}/api/public/registry/owner-relieving/{t}"
               style="display:inline-block;background:#1c1c22;color:#e8c37f;text-decoration:none;padding:11px 26px;border-radius:10px;font-size:13px">Request relieving letter →</a>
          </p>
        </div>
      </div>
    </div>"""


async def _send_owner_rating_email(req: dict) -> dict:
    from email_service import _send_email
    if not req.get("rating_token"):
        req["rating_token"] = str(uuid.uuid4())
        await _raw_db.staff_verification_requests.update_one(
            {"id": req["id"]}, {"$set": {"rating_token": req["rating_token"]}})
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    res = await _send_email(
        [req["owner_email"]],
        f"Rate {req.get('name') or 'your staff member'} — one click, Miracurl Staff Registry",
        _owner_rating_email_html(req, base), book_label="Explore Miracurl ✦")
    await _raw_db.staff_verification_requests.update_one(
        {"id": req["id"]}, {"$set": {"owner_rating_email_sent": bool(res.get("sent")),
                                     "owner_rating_email_at": datetime.now(timezone.utc).isoformat()}})
    return res


def _public_html_page(title: str, body: str) -> Response:
    return Response(media_type="text/html", content=f"""<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title>
<style>body{{font-family:Georgia,serif;background:#0a0a0a;color:#eee;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px}}
.card{{max-width:480px;width:100%;background:#17171c;border:1px solid #2a2a32;border-radius:18px;padding:34px;text-align:center}}
h1{{color:#e8c37f;font-size:22px;margin:0 0 12px}}p{{color:#bbb;font-size:14px;line-height:1.7}}
.btn{{display:inline-block;margin:4px;padding:11px 20px;border-radius:999px;font-size:13px;font-weight:bold;color:#fff;text-decoration:none;font-family:Arial}}
input,select,textarea{{width:100%;box-sizing:border-box;background:#0f0f13;border:1px solid #33333c;color:#eee;border-radius:10px;padding:11px 14px;font-size:14px;margin:6px 0;font-family:Arial}}
label{{display:block;text-align:left;font-size:12px;color:#999;margin-top:10px;font-family:Arial}}
button{{background:linear-gradient(90deg,#d4af37,#e8c37f);color:#1c1c22;border:0;border-radius:999px;padding:13px 30px;font-size:14px;font-weight:bold;cursor:pointer;margin-top:16px}}</style>
</head><body><div class="card">{body}</div></body></html>""")


async def _req_by_token(token: str) -> dict:
    req = await _raw_db.staff_verification_requests.find_one({"rating_token": token}, {"_id": 0})
    if not req:
        raise HTTPException(404, "This link is invalid or has expired")
    return req


async def _apply_owner_rating(req: dict, key: str):
    rating, label = OWNER_RATINGS[key]
    now = datetime.now(timezone.utc).isoformat()
    await _raw_db.staff_verification_requests.update_one(
        {"id": req["id"]}, {"$set": {"owner_rating": rating, "owner_rating_key": key,
                                     "owner_rating_label": label, "owner_rated_at": now, "seen_by_hq": False}})
    if req.get("employee_id"):
        salon = (req.get("salon_name") or "").strip() or "Salon (self-reported)"
        await _raw_db.registry_employments.update_one(
            {"employee_id": req["employee_id"], "salon_name": {"$regex": f"^{re.escape(salon)}$", "$options": "i"}},
            {"$set": {"rating": rating, "rated_by_owner_at": now}})


@router.get("/public/registry/owner-rate/{token}/{key}")
async def owner_rate_click(token: str, key: str, request: Request):
    """One-click rating from the owner email. Records instantly; re-click to change."""
    public_rate_limit(request, "owner-rate", limit=30, window_sec=600)
    if key not in OWNER_RATINGS:
        raise HTTPException(400, "Unknown rating")
    req = await _req_by_token(token)
    await _apply_owner_rating(req, key)
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    staff = html_lib.escape(req.get("name") or "the staff member")
    others = "".join(
        f'<a class="btn" style="background:{_RATING_COLORS[k]};opacity:{1 if k == key else 0.45}" '
        f'href="{base}/api/public/registry/owner-rate/{token}/{k}">{lbl}</a>'
        for k, (_, lbl) in OWNER_RATINGS.items())
    return _public_html_page("Rating recorded ✦ Miracurl", f"""
        <h1>Thank you — rating recorded ✦</h1>
        <p>You rated <b style="color:#fff">{staff}</b> as
           <b style="color:{_RATING_COLORS[key]}">{OWNER_RATINGS[key][1]}</b>.
           This now reflects on their public Miracurl Staff Registry profile.</p>
        <p style="font-size:12px;color:#777">Changed your mind? Click a different rating:</p>
        <div>{others}</div>
        <p style="margin-top:18px"><a href="{base}/api/public/registry/owner-relieving/{token}"
           style="color:#e8c37f">Has {staff} left your salon? Request a relieving letter →</a></p>""")


@router.get("/public/registry/owner-relieving/{token}")
async def owner_relieving_form(token: str, request: Request):
    """Owner requests a relieving letter for a departed staff member (public form)."""
    public_rate_limit(request, "owner-relieving", limit=20, window_sec=600)
    req = await _req_by_token(token)
    staff = html_lib.escape(req.get("name") or "the staff member")
    rl = req.get("relieving_request") or {}
    if rl.get("status") == "sent":
        return _public_html_page("Relieving letter sent ✦ Miracurl",
            f"<h1>Already sent ✦</h1><p>The relieving letter for <b style='color:#fff'>{staff}</b> was already "
            f"issued and emailed to both of you on {html_lib.escape(str(rl.get('sent_at', ''))[:10])}.</p>")
    if rl.get("status") == "pending":
        return _public_html_page("Request received ✦ Miracurl",
            f"<h1>Request already received ✦</h1><p>Your relieving letter request for <b style='color:#fff'>{staff}</b> "
            f"is with the Miracurl team — the certificate PDF will be emailed to you and {staff} shortly.</p>")
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    return _public_html_page("Request relieving letter ✦ Miracurl", f"""
        <h1>Relieving letter for {staff}</h1>
        <p>Tell us how {staff} exited — Miracurl will prepare the official certificate PDF and email it to
           both you and {staff}.</p>
        <form method="post" action="{base}/api/public/registry/owner-relieving/{token}">
          <label>How did they leave?</label>
          <select name="letter_type" required>
            <option value="excellent">🌟 Excellent — served notice, highly recommended</option>
            <option value="standard">✅ Standard — resigned normally</option>
            <option value="terminated">🚫 Terminated — misconduct / theft</option>
            <option value="absconded">⚠️ Absconded — left without notice</option>
          </select>
          <label>Last working date</label>
          <input type="date" name="last_date" required />
          <label>Reason / note (optional — appears on terminated letters)</label>
          <textarea name="reason" rows="2" maxlength="300" placeholder="e.g. Repeated unexcused absence"></textarea>
          <button type="submit">Request relieving letter ✦</button>
        </form>""")


@router.post("/public/registry/owner-relieving/{token}")
async def owner_relieving_submit(token: str, request: Request,
                                 letter_type: str = Form(...), last_date: str = Form(""),
                                 reason: str = Form("")):
    public_rate_limit(request, "owner-relieving-post", limit=10, window_sec=600)
    if letter_type not in ("excellent", "standard", "terminated", "absconded"):
        raise HTTPException(400, "Unknown letter type")
    req = await _req_by_token(token)
    if (req.get("relieving_request") or {}).get("status") == "sent":
        raise HTTPException(400, "Letter already sent")
    now = datetime.now(timezone.utc).isoformat()
    await _raw_db.staff_verification_requests.update_one(
        {"id": req["id"]},
        {"$set": {"relieving_request": {"letter_type": letter_type, "last_date": last_date.strip()[:12],
                                        "reason": reason.strip()[:300], "status": "pending",
                                        "requested_at": now},
                  "seen_by_hq_rl": False}})
    staff = html_lib.escape(req.get("name") or "the staff member")
    return _public_html_page("Request received ✦ Miracurl",
        f"<h1>Request received ✦</h1><p>Thank you! The Miracurl team will verify and issue the relieving letter "
        f"for <b style='color:#fff'>{staff}</b> — the certificate PDF will be emailed to both you and {staff}.</p>")


@router.post("/public/registry/dispute")
async def registry_dispute(request: Request, staff_code: str = Form(""), name: str = Form(...),
                           phone: str = Form(""), message: str = Form(...)):
    """Staff appeals a termination mark on their public profile → lands in HQ Inbox."""
    public_rate_limit(request, "registry-dispute", limit=3, window_sec=3600)
    if len(name.strip()) < 2 or len(message.strip()) < 10:
        raise HTTPException(400, "Please share your name and a short explanation (at least 10 characters)")
    await _raw_db.hq_messages.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": "", "inbox": "dispute",
        "tenant_name": "⚖️ Termination dispute",
        "salon_name": "⚖️ Termination dispute",
        "from_email": name.strip()[:80] + (f" · {re.sub(r'[^0-9+ ]', '', phone)[:18]}" if phone.strip() else ""),
        "subject": f"Dispute — {name.strip()[:80]}" + (f" ({staff_code.strip()[:20]})" if staff_code.strip() else ""),
        "message": message.strip()[:2000], "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()})
    return {"ok": True}


@router.post("/public/registry/get-verified")
async def registry_get_verified(request: Request,
                                name: str = Form(...), phone: str = Form(...), email: str = Form(...),
                                salon_name: str = Form(""), city: str = Form(""), owner_phone: str = Form(""),
                                owner_email: str = Form(""),
                                joining: str = Form(""), experience: str = Form(""),
                                photo: Optional[UploadFile] = File(None)):
    """External stylist asks for a verified badge — lands in HQ → Staff Verification."""
    public_rate_limit(request, "get-verified", limit=5, window_sec=600)
    if len(name.strip()) < 2:
        raise HTTPException(400, "Enter your full name")
    digits = re.sub(r"\D", "", phone)
    if len(digits) < 8:
        raise HTTPException(400, "Enter a valid phone number")
    email = email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}", email):
        raise HTTPException(400, "Enter a valid email address")
    owner_email = owner_email.strip().lower()
    if owner_email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}", owner_email):
        raise HTTPException(400, "Enter a valid owner/manager email address")
    dup = await _raw_db.staff_verification_requests.find_one({"phone": digits}, {"_id": 1})
    if dup:
        return {"ok": True, "note": "already_requested"}
    now = datetime.now(timezone.utc).isoformat()
    photo_id = ""
    if photo is not None:
        data = await photo.read()
        if data:
            if len(data) > 3 * 1024 * 1024:
                raise HTTPException(400, "Photo must be under 3 MB")
            ct = (photo.content_type or "").lower()
            if ct not in ("image/jpeg", "image/jpg", "image/png", "image/webp"):
                raise HTTPException(400, "Photo must be a JPG, PNG or WebP image")
            photo_id = str(uuid.uuid4())
            await _raw_db.registry_photos.insert_one({
                "id": photo_id, "b64": base64.b64encode(data).decode(),
                "content_type": ct, "created_at": now})
    req_doc = {
        "id": str(uuid.uuid4()), "name": name.strip(), "phone": digits, "email": email,
        "salon_name": salon_name.strip()[:100], "city": city.strip()[:60],
        "owner_phone": re.sub(r"\D", "", owner_phone)[:15], "owner_email": owner_email[:120],
        "joining": joining.strip()[:30],
        "experience": experience.strip()[:60], "photo_id": photo_id,
        "rating_token": str(uuid.uuid4()), "status": "new", "created_at": now}
    await _raw_db.staff_verification_requests.insert_one({**req_doc})
    if owner_email:
        await _send_owner_rating_email(req_doc)
    return {"ok": True}


async def _migrate_legacy_badge_requests():
    """One-time lazy move: old badge requests stored in tenant_inquiries → dedicated collection."""
    rows = await _raw_db.tenant_inquiries.find({"source": "staff_badge_request"}, {"_id": 0}).to_list(300)
    for r in rows:
        meta = r.get("badge_meta") or {}
        if not await _raw_db.staff_verification_requests.find_one({"id": r["id"]}, {"_id": 1}):
            await _raw_db.staff_verification_requests.insert_one({
                "id": r["id"], "name": r.get("name", ""), "phone": r.get("phone", ""),
                "email": r.get("email", ""), "salon_name": meta.get("salon_name", ""),
                "city": meta.get("city", ""), "owner_phone": meta.get("owner_phone", ""),
                "joining": meta.get("joining", ""), "experience": "", "photo_id": "",
                "status": "badge_issued" if r.get("badge_sent_at") else "new",
                "badge_sent_at": r.get("badge_sent_at"), "created_at": r.get("created_at")})
        await _raw_db.tenant_inquiries.delete_one({"id": r["id"]})


@router.get("/super/registry/verify-requests")
async def list_verify_requests(admin=Depends(require_super_admin)):
    if await _raw_db.tenant_inquiries.count_documents({"source": "staff_badge_request"}):
        await _migrate_legacy_badge_requests()
    rows = await _raw_db.staff_verification_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    await _raw_db.staff_verification_requests.update_many(
        {"$or": [{"seen_by_hq": {"$ne": True}}, {"seen_by_hq_rl": {"$ne": True}}]},
        {"$set": {"seen_by_hq": True, "seen_by_hq_rl": True}})
    return {"items": rows, "new_count": sum(1 for r in rows if r.get("status") == "new")}


@router.post("/super/registry/verify-requests/{rid}/owner-verified")
async def verify_request_owner_verified(rid: str, admin=Depends(require_super_admin)):
    req = await _raw_db.staff_verification_requests.find_one({"id": rid}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Request not found")
    if req.get("status") == "badge_issued":
        raise HTTPException(400, "Badge already issued for this request")
    now = datetime.now(timezone.utc).isoformat()
    await _raw_db.staff_verification_requests.update_one(
        {"id": rid}, {"$set": {"status": "owner_verified", "owner_verified_at": now, "owner_verified_by": admin["id"]}})
    rating_email_sent = False
    if req.get("owner_email") and not req.get("owner_rating"):
        res = await _send_owner_rating_email(req)
        rating_email_sent = bool(res.get("sent"))
    return {"ok": True, "rating_email_sent": rating_email_sent}


@router.post("/super/registry/verify-requests/{rid}/generate-badge")
async def verify_request_generate_badge(rid: str, admin=Depends(require_super_admin)):
    """Creates the registry Staff ID, generates the badge PDF and emails it to the stylist."""
    req = await _raw_db.staff_verification_requests.find_one({"id": rid}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Request not found")
    if req.get("status") == "new":
        raise HTTPException(400, "Call the salon owner/manager first, then click 'Verified by Salon Owner' before generating the badge")
    now = datetime.now(timezone.utc).isoformat()
    phone = re.sub(r"\D", "", req.get("phone") or "")
    photo_url = f"/api/public/registry/photo/{req['photo_id']}" if req.get("photo_id") else ""
    emp = None
    if len(phone) >= 10:
        emp = await _raw_db.registry_employees.find_one({"phone": {"$regex": f"{phone[-10:]}$"}}, {"_id": 0})
    if not emp:
        seq = await _raw_db.registry_employees.count_documents({}) + 1
        code = f"STF-{seq:05d}"
        while await _raw_db.registry_employees.find_one({"staff_code": code}):
            seq += 1
            code = f"STF-{seq:05d}"
        emp = {"id": str(uuid.uuid4()), "staff_code": code, "name": req["name"],
               "aadhaar_last4": "", "aadhaar_hash": "",
               "permanent_address": "", "current_address": "", "city": req.get("city", ""),
               "email": req.get("email", ""), "phone": phone, "photo_url": photo_url,
               "created_by_tenant": "hq", "created_at": now}
        await _raw_db.registry_employees.insert_one({**emp})
    elif photo_url and not emp.get("photo_url"):
        await _raw_db.registry_employees.update_one({"id": emp["id"]}, {"$set": {"photo_url": photo_url}})
        emp["photo_url"] = photo_url
    salon = (req.get("salon_name") or "").strip() or "Salon (self-reported)"
    dup_rec = await _raw_db.registry_employments.find_one(
        {"employee_id": emp["id"], "salon_name": {"$regex": f"^{re.escape(salon)}$", "$options": "i"}}, {"_id": 0, "id": 1})
    if not dup_rec:
        await _raw_db.registry_employments.insert_one({
            "id": str(uuid.uuid4()), "employee_id": emp["id"], "tenant_id": "hq",
            "salon_name": salon, "designation": "Stylist", "skills": [],
            "from_date": _joining_to_from_date(req.get("joining")), "to_date": None,
            "rating": req.get("owner_rating"), "reason_for_leaving": "Working",
            "comment": f"Verified over phone with owner/manager ({req.get('owner_phone') or 'contact on file'})."
                       + (f" Experience: {req['experience']}." if req.get("experience") else ""),
            "hq_verified": True, "created_by": admin["id"], "created_at": now})
    profile = await _registry_profile(emp, redact=True, show_aadhaar=False)
    pdf_bytes = await _registry_pdf_bytes(profile)
    from email_service import _send_email
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    first = html_lib.escape((req.get("name") or "there").split()[0].title())
    res = await _send_email(
        [req["email"]], "🎉 Your Miracurl Verified Badge is here!",
        _badge_email_html(first, emp["staff_code"], base),
        attachments=[{"filename": f"{emp['staff_code']}-miracurl-verified-badge.pdf",
                      "content": base64.b64encode(pdf_bytes).decode()}],
        book_label="Explore Miracurl ✦")
    patch = {"status": "badge_issued", "staff_code": emp["staff_code"], "employee_id": emp["id"],
             "badge_issued_at": now, "email_sent": bool(res.get("sent")), "email_error": res.get("error") or ""}
    if res.get("sent"):
        patch["badge_sent_at"] = now
    await _raw_db.staff_verification_requests.update_one({"id": rid}, {"$set": patch})
    return {"ok": True, "staff_code": emp["staff_code"], "email_sent": bool(res.get("sent")),
            "email_error": res.get("error") or ""}


@router.get("/super/registry/verify-requests/{rid}/badge.pdf")
async def verify_request_badge_pdf(rid: str, admin=Depends(require_super_admin)):
    req = await _raw_db.staff_verification_requests.find_one({"id": rid}, {"_id": 0})
    if not req or not req.get("employee_id"):
        raise HTTPException(404, "Generate the badge first")
    emp = await _raw_db.registry_employees.find_one({"id": req["employee_id"]}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Registry employee not found")
    profile = await _registry_profile(emp, redact=True, show_aadhaar=False)
    pdf_bytes = await _registry_pdf_bytes(profile)
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{emp["staff_code"]}-badge.pdf"'})


@router.delete("/super/registry/verify-requests/{rid}")
async def verify_request_delete(rid: str, admin=Depends(require_super_admin)):
    req = await _raw_db.staff_verification_requests.find_one({"id": rid}, {"_id": 0, "photo_id": 1})
    if not req:
        raise HTTPException(404, "Request not found")
    if req.get("photo_id"):
        emp_using = await _raw_db.registry_employees.find_one(
            {"photo_url": f"/api/public/registry/photo/{req['photo_id']}"}, {"_id": 1})
        if not emp_using:
            await _raw_db.registry_photos.delete_one({"id": req["photo_id"]})
    await _raw_db.staff_verification_requests.delete_one({"id": rid})
    return {"ok": True}


_LETTER_EXIT_REASON = {"excellent": "Resigned", "standard": "Resigned",
                       "terminated": "Terminated", "absconded": "Absconded"}


def _relieving_letter_email_html(staff_name: str, salon: str, letter_type: str) -> str:
    staff_name, salon = html_lib.escape(staff_name), html_lib.escape(salon)
    tone = ("with an <b>EXCELLENT</b> record — congratulations!" if letter_type == "excellent"
            else "— the details are in the attached PDF.")
    return f"""
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #eee;border-radius:16px;overflow:hidden">
      <div style="background:#1c1c22;padding:26px 30px">
        <div style="color:#d4af37;font-size:22px;font-weight:bold">Miracurl ✦ Staff Registry</div>
        <div style="color:#999;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:4px">Official relieving letter</div>
      </div>
      <div style="padding:28px 30px;color:#333">
        <p>Hello,</p>
        <p>The official relieving letter for <b>{staff_name}</b> (formerly at <b>{salon}</b>) is attached,
           issued via the Miracurl Staff Registry {tone}</p>
        <p style="font-size:12px;color:#888">This letter is also reflected on the staff member's public
           registry profile, verifiable by any future employer.</p>
      </div>
    </div>"""


@router.post("/super/registry/verify-requests/{rid}/send-relieving-letter")
async def verify_request_send_relieving(rid: str, admin=Depends(require_super_admin)):
    """HQ issues the relieving certificate PDF → emailed to BOTH the staff member and the owner."""
    req = await _raw_db.staff_verification_requests.find_one({"id": rid}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Request not found")
    rl = req.get("relieving_request") or {}
    if not rl:
        raise HTTPException(400, "The owner hasn't requested a relieving letter for this staff member yet")
    if rl.get("status") == "sent":
        raise HTTPException(400, "Relieving letter already sent")
    letter_type = rl["letter_type"]
    salon = (req.get("salon_name") or "").strip() or "Salon (self-reported)"
    now = datetime.now(timezone.utc).isoformat()
    from services.pdf import _render_relieving_letter_pdf
    pdf = _render_relieving_letter_pdf(
        {"name": salon, "location": req.get("city") or ""},
        {"name": req.get("name"), "role": "Stylist"},
        letter_type, _joining_to_from_date(req.get("joining")),
        rl.get("last_date") or now[:10], rl.get("reason") or "")
    from email_service import _send_email
    to = [req["email"]] + ([req["owner_email"]] if req.get("owner_email") else [])
    res = await _send_email(
        to, f"📄 Relieving letter — {req.get('name')} ({salon})",
        _relieving_letter_email_html(req.get("name") or "", salon, letter_type),
        attachments=[{"filename": f"{(req.get('name') or 'staff').replace(' ', '-')}-relieving-letter.pdf",
                      "content": base64.b64encode(pdf).decode()}],
        book_label="Explore Miracurl ✦")
    if req.get("employee_id"):
        await _raw_db.registry_employments.update_one(
            {"employee_id": req["employee_id"], "salon_name": {"$regex": f"^{re.escape(salon)}$", "$options": "i"}},
            {"$set": {"to_date": rl.get("last_date") or now[:10],
                      "reason_for_leaving": _LETTER_EXIT_REASON[letter_type],
                      **({"comment": f"Relieving letter issued ({letter_type}). {rl.get('reason') or ''}".strip()}
                         if letter_type in ("terminated", "absconded") else {})}})
    await _raw_db.staff_verification_requests.update_one(
        {"id": rid}, {"$set": {"relieving_request": {**rl, "status": "sent", "sent_at": now,
                                                     "email_sent": bool(res.get("sent")),
                                                     "email_error": res.get("error") or ""}}})
    return {"ok": True, "email_sent": bool(res.get("sent")), "email_error": res.get("error") or "",
            "recipients": to}


class ResendRatingIn(BaseModel):
    owner_email: str = ""


@router.post("/super/registry/verify-requests/{rid}/resend-rating-email")
async def verify_request_resend_rating(rid: str, body: ResendRatingIn = None,
                                       admin=Depends(require_super_admin)):
    req = await _raw_db.staff_verification_requests.find_one({"id": rid}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Request not found")
    new_email = (body.owner_email if body else "").strip().lower()
    if new_email:
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}", new_email):
            raise HTTPException(400, "Enter a valid owner email address")
        req["owner_email"] = new_email
        await _raw_db.staff_verification_requests.update_one(
            {"id": rid}, {"$set": {"owner_email": new_email}})
    if not req.get("owner_email"):
        raise HTTPException(400, "No owner email on this request — provide one")
    res = await _send_owner_rating_email(req)
    return {"ok": True, "email_sent": bool(res.get("sent")), "email_error": res.get("error") or ""}
