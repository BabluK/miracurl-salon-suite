from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
import io
import csv
import math
import uuid
import hmac
import hashlib
import asyncio
import base64
import html as html_lib
from email_service import _send_email, _welcome_email_html, _credentials_email_html, _monthly_report_html, _weekly_report_html, _birthday_email_html, _platform_digest_html
from services.pdf import _render_salary_slip_pdf, _render_resume_pdf
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query, UploadFile, File, Form
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse
from pydantic import BaseModel, Field, EmailStr, field_validator
import requests
from urllib.parse import urlparse as urlparse

from database import (  # noqa: F401 — shared DB foundation
    client, _raw_db, db, _current_tenant_id, _clean,
)


# ---------------- App ----------------
app = FastAPI(title="Miracurl Salon Management API")
api = APIRouter(prefix="/api")

from services.storage import _init_storage, _put_object, _get_object, _MIME, APP_NAME, validate_image_bytes  # noqa: F401

@app.on_event("startup")
async def _boot_storage():
    try:
        _init_storage()
    except Exception as e:  # noqa: BLE001 — startup diagnostic
        logging.getLogger("storage").warning("Storage init deferred: %s", e)

from security import (  # noqa: F401 — auth & tenancy guards
    JWT_ALG, jwt_secret, hash_pw, verify_pw, make_access, make_refresh,
    _reject_if_token_predates_password_change, set_auth_cookies,
    get_current_user, require_admin, public_rate_limit,
    require_super_admin, require_tenant_admin, current_tenant,
    revoke_token_jtis, _reject_if_revoked,
)

# ---------------- Models ----------------

# ============================================================
# MULTI-TENANCY
# ============================================================
DEFAULT_TENANT_SLUG = "miracurl-marathahalli"

from models import (  # noqa: E402 — shared models (models.py)
    Tenant, Customer, Appointment,
    REVIEW_REWARD_CREDIT, MAX_CUSTOMER_CREDIT,
    REFERRAL_REWARD_REFERRER, REFERRAL_REWARD_REFERRED,
)
from services.billing import (  # noqa: E402 — shared billing helpers
    _validate_coupon, _consume_coupon, _coupon_discount, _active_membership, _loyalty_rules,
)


class TenantIn(BaseModel):
    slug: str = Field(..., min_length=3, max_length=40)
    name: str = Field(..., min_length=2, max_length=120)
    owner_email: EmailStr
    owner_name: str = Field(..., min_length=2, max_length=80)
    # owner_password is now OPTIONAL — leave blank and the server will generate
    # a secure one-time password that the super-admin shares with the owner.
    owner_password: Optional[str] = Field(None, min_length=8)
    location: Optional[str] = None
    phone: Optional[str] = None
    salon_email: Optional[EmailStr] = None
    owner_phone: Optional[str] = Field(None, max_length=20)
    plan: str = "starter"

    @field_validator("slug")
    @classmethod
    def _slug(cls, v):
        import re as _re
        v = v.strip().lower()
        if not _re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?", v):
            raise ValueError("Slug must be 3-40 chars, lowercase letters/digits/hyphen, no leading/trailing hyphen")
        return v

class TenantUpdateIn(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    phone: Optional[str] = None
    hours: Optional[str] = None
    hero_image: Optional[str] = None
    google_review_url: Optional[str] = None
    plan: Optional[str] = None
    status: Optional[str] = None
    salon_email: Optional[str] = None
    whatsapp_number: Optional[str] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    owner_phone: Optional[str] = None

async def resolve_tenant_from_slug(slug: str) -> dict:
    """For PUBLIC endpoints that take slug in the URL path."""
    t = await db.tenants.find_one({"slug": slug}, {"_id": 0})
    if not t:
        raise HTTPException(404, f"Tenant '{slug}' not found")
    if t.get("status") == "suspended":
        raise HTTPException(403, "Tenant subscription is suspended")
    _current_tenant_id.set(t["id"])
    return t

class CustomerIn(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    gender: Optional[str] = "Other"
    dob: Optional[str] = None
    anniversary: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None

class Service(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: str
    price: float
    duration_min: int
    description: Optional[str] = None
    image_url: Optional[str] = None
    trending: bool = False
    active: bool = True

class ServiceIn(BaseModel):
    name: str
    category: str
    price: float
    duration_min: int
    description: Optional[str] = None
    image_url: Optional[str] = None
    trending: bool = False
    active: bool = True

class Staff(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    role: str
    phone: str
    email: Optional[str] = None
    specialties: List[str] = []
    commission_pct: float = 10.0
    active: bool = True
    image_url: Optional[str] = None
    joining_date: str = Field(default_factory=lambda: datetime.now(timezone.utc).date().isoformat())
    # Salary & payroll
    monthly_base_salary: float = 0.0     # ₹ fixed monthly component
    salary_visible: bool = True          # if False, staff cannot see own salary details
    user_id: Optional[str] = None        # link to users collection (login credential)
    # Shift, penalties & compliance
    shift_start: str = "10:00"           # HH:MM IST — 10 min grace, then late fine
    shift_end: str = "21:00"             # HH:MM IST — work past this earns overtime
    overtime_rate: float = 0.0           # ₹ per hour after shift_end
    max_advance: float = 0.0             # ₹ cap admin allows as monthly advance
    notice_period_days: int = 30
    serving_notice: bool = False
    notice_start_date: Optional[str] = None
    last_working_day: Optional[str] = None
    aadhaar_last4: Optional[str] = None  # only last 4 shown; full number never stored
    aadhaar_hash: Optional[str] = None
    branch: Optional[str] = None         # assigned branch name — drives geo fence + tag

class StaffIn(BaseModel):
    name: str
    role: str
    phone: str
    email: Optional[str] = None
    specialties: List[str] = []
    commission_pct: float = 10.0
    active: bool = True
    image_url: Optional[str] = None
    monthly_base_salary: float = 0.0
    salary_visible: bool = True
    shift_start: str = "10:00"
    shift_end: str = "21:00"
    overtime_rate: float = 0.0
    max_advance: float = 0.0
    notice_period_days: int = 30
    serving_notice: bool = False
    notice_start_date: Optional[str] = None
    last_working_day: Optional[str] = None
    aadhaar: Optional[str] = None        # write-only: hashed server-side
    branch: Optional[str] = None

class Product(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    brand: Optional[str] = None
    category: str
    sku: str
    price: float
    cost: float
    stock: int
    low_stock_threshold: int = 5
    image_url: Optional[str] = None
    vendor_id: Optional[str] = None

class ProductIn(BaseModel):
    name: str
    brand: Optional[str] = None
    category: str
    sku: str
    price: float
    cost: float
    stock: int
    low_stock_threshold: int = 5
    image_url: Optional[str] = None
    vendor_id: Optional[str] = None

class Review(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    appointment_id: str
    customer_id: str
    customer_name: str
    staff_id: Optional[str] = None
    staff_name: Optional[str] = None
    rating: int  # 1-5
    comment: Optional[str] = None
    public: bool = True  # show on public booking page
    reward_code: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ReviewIn(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = Field(None, max_length=600)

class ReviewModerateIn(BaseModel):
    public: bool


from routes.auth import (  # noqa: E402 — auth module (routes/auth.py)
    router as auth_router, AFFILIATE_REWARD_INR,
)
api.include_router(auth_router)


# ---------------- Generic CRUD helpers ----------------

# ---------------- Customers ----------------
@api.get("/customers")
async def list_customers(q: Optional[str] = None, user=Depends(require_admin)):
    # CRM shows only customers who completed a service (or were added manually) —
    # public bookings stay "pending" until their appointment is marked completed.
    flt = {"crm_status": {"$ne": "pending"}}
    if q:
        # SEC-P3 fix: escape user input so `q` cannot inject a $regex DoS pattern.
        safe_q = re.escape(q)
        flt["$or"] = [{"name": {"$regex": safe_q, "$options": "i"}}, {"phone": {"$regex": safe_q}}]
    docs = await db.customers.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs

@api.post("/customers")
async def create_customer(body: CustomerIn, user=Depends(get_current_user)):
    c = Customer(**body.model_dump()).model_dump()
    await db.customers.insert_one(c)
    return _clean(c)

@api.get("/customers/export")
async def export_customers_csv(user=Depends(require_admin)):
    rows = await db.customers.find({}).sort("name", 1).to_list(5000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["name", "phone", "email", "gender", "dob", "address", "notes", "loyalty_points", "total_spent", "visits"])
    for r in rows:
        _csv_row(w, [
            r.get("name", ""), r.get("phone", ""), r.get("email", "") or "", r.get("gender", "") or "",
            r.get("dob", "") or "", r.get("address", "") or "", r.get("notes", "") or "",
            r.get("loyalty_points", 0), r.get("total_spent", 0), r.get("visits", 0),
        ])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=customers.csv"})

@api.post("/customers/import")
async def import_customers_csv(file: UploadFile = File(...), user=Depends(require_admin)):
    content = await _read_csv_upload(file)
    reader = csv.DictReader(io.StringIO(content))
    fields = {(f or "").strip().lower() for f in (reader.fieldnames or [])}
    if not {"name", "phone"}.issubset(fields):
        raise HTTPException(400, "CSV needs columns: name, phone (optional: email, gender, dob, address, notes)")
    added = updated = skipped = 0
    for raw in reader:
        row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
        name, phone = row.get("name", ""), re.sub(r"[^\d+]", "", row.get("phone", ""))
        if not name or not phone:
            skipped += 1
            continue
        doc = {"name": name, "phone": phone}
        for f in ("email", "gender", "dob", "address", "notes"):
            if row.get(f):
                doc[f] = row[f]
        existing = await db.customers.find_one({"phone": phone})
        if existing:
            await db.customers.update_one({"id": existing["id"]}, {"$set": doc})
            updated += 1
        else:
            await db.customers.insert_one(Customer(**doc).model_dump())
            added += 1
    return {"added": added, "updated": updated, "skipped": skipped}

@api.get("/customers/{cid}")
async def get_customer(cid: str, user=Depends(get_current_user)):
    c = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Not found")
    return c

@api.put("/customers/{cid}")
async def update_customer(cid: str, body: CustomerIn, user=Depends(require_admin)):
    await db.customers.update_one({"id": cid}, {"$set": body.model_dump()})
    return await db.customers.find_one({"id": cid}, {"_id": 0})

@api.delete("/customers/{cid}")
async def delete_customer(cid: str, user=Depends(require_admin)):
    await db.customers.delete_one({"id": cid})
    return {"ok": True}

# ---------------- Uploads (staff / service / product images) ----------------
_MAX_UPLOAD_BYTES = 3 * 1024 * 1024  # 3MB — plenty for a Retina thumbnail


@api.post("/uploads/image")
async def upload_image(
    file: UploadFile = File(...),
    kind: str = Query("misc", regex=r"^(staff|service|product|misc|hero|promo)$"),
    user=Depends(get_current_user),
):
    """Accept a laptop/phone image upload. Salon admins store under their tenant
    path (cross-tenant leakage impossible); super admins (no tenant) store under
    the superadmin path (e.g. promo video photos)."""
    if user.get("role") == "super_admin":
        tenant_id = "superadmin"
    elif user.get("role") == "admin":
        from security import _current_tenant_id
        tenant_id = _current_tenant_id.get()
        if not tenant_id:
            raise HTTPException(400, "No tenant context. Pass X-Tenant-Slug header or use a tenant-scoped login.")
    else:
        raise HTTPException(403, "Admin role required")
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    if ext not in _MIME:
        raise HTTPException(400, "Only JPG, PNG, GIF or WebP images are allowed")
    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Image too large — max {_MAX_UPLOAD_BYTES // (1024*1024)}MB")
    if not data:
        raise HTTPException(400, "Empty file")
    validate_image_bytes(ext, data)
    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/tenants/{tenant_id}/{kind}/{file_id}.{ext}"
    try:
        result = _put_object(storage_path, data, _MIME[ext])
    except requests.HTTPError as e:
        raise HTTPException(400, f"Storage upload failed: {e}") from e
    doc = {
        "id": file_id,
        "tenant_id": tenant_id,
        "kind": kind,
        "storage_path": result.get("path", storage_path),
        "original_filename": file.filename or f"{file_id}.{ext}",
        "content_type": _MIME[ext],
        "size": len(data),
        "uploaded_by": user["id"],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _raw_db.uploads.insert_one(doc)
    # Return a same-origin URL so <img src> renders directly.
    public_url = f"/api/files/{file_id}"
    return {"id": file_id, "url": public_url, "size": len(data), "content_type": _MIME[ext]}


@api.get("/files/{file_id}")
async def download_file(file_id: str):
    """Serve an uploaded image. Public by design — anyone with the URL can view
    (same as an Instagram CDN link). The unguessable UUID is the token."""
    rec = await _raw_db.uploads.find_one({"id": file_id, "is_deleted": False})
    if not rec:
        raise HTTPException(404, "File not found")
    try:
        data, ct = _get_object(rec["storage_path"])
    except requests.HTTPError as e:
        raise HTTPException(400, f"Storage fetch failed: {e}") from e
    return Response(content=data, media_type=rec.get("content_type", ct),
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})


# ---------------- Services ----------------
_MANI_IMG = "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/517ab2838ad15ec1f57e6f8972aa70b440e973f00372bedc22928e043bf5e3fa.png"
_PEDI_IMG = "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/82bf0bbcc6388db24726408d8073b9f0797e69bf194297f46c1756bd08813d97.png"
PRESET_SERVICES = [
    {"name": "Party Makeup", "category": "Makeup", "price": 1200, "duration_min": 60,
     "description": "Glam party-ready look with premium products.",
     "image_url": "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/f58649cd3e5dc5433a3e613c71686e0279685cd352a49b7ae3e44389d3f6d831.png"},
    {"name": "Normal Makeup", "category": "Makeup", "price": 700, "duration_min": 45,
     "description": "Natural everyday makeup with a flawless finish.",
     "image_url": "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/731c531b0656c6858ec80c799e1f24b104d9fc58d5abcea8d9189529672bac80.png"},
    {"name": "Bridal Makeup", "category": "Makeup", "price": 2000, "duration_min": 120, "trending": True,
     "description": "Complete bridal transformation for your big day.",
     "image_url": "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/cd336b5a167cbc0d9e7689d19aeff40cf8a0c08dad68032a39bd286c0447d62e.png"},
    {"name": "Saree Draping", "category": "Makeup", "price": 500, "duration_min": 30,
     "description": "Elegant professional saree draping. ₹500 onwards.",
     "image_url": "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/b8b033a0b096d70d21c13e2b85210eaff232161014600c048b086446a4096410.png"},
    {"name": "Hair Styling", "category": "Women Hair", "price": 800, "duration_min": 45,
     "description": "Curls, updos & event styling. ₹800 onwards.",
     "image_url": "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/a53c1f7baadcb7762a987e5123a4e2636e7e01a283fc4d8939950bae1f5e5116.png"},
    {"name": "Henna", "category": "Makeup", "price": 200, "duration_min": 30,
     "description": "Traditional mehndi designs. ₹200 onwards.",
     "image_url": "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/88f99747c197549154e47d7d7c5f06c6b15c0a94cdcdc686ceba2204ceb7a21a.png"},
    {"name": "Gel Polish on Natural Nail", "category": "Nails", "price": 500, "duration_min": 45,
     "description": "Long-lasting glossy gel polish. ₹500 onwards.",
     "image_url": "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/b75966f5d7d208f7db5613bd272e507d4a4b9d2faf0d8d8766c8dd93751e3d49.png"},
    {"name": "Gel Extension", "category": "Nails", "price": 1000, "duration_min": 75,
     "description": "Natural-looking gel nail extensions. ₹1000 onwards.",
     "image_url": "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/bae4dc0a5e96007a3ae85a139efe0464e814c7ff78b63ec825c41fa577f36357.png"},
    {"name": "Acrylic Extension", "category": "Nails", "price": 1500, "duration_min": 90,
     "description": "Durable acrylic extensions with nail art. ₹1500 onwards.",
     "image_url": "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/7105caf95adc9f46495f742e3b4338725e94999fa22d5da431f9b4f49e60d360.png"},
    # -------- Manicure --------
    {"name": "Basic Manicure", "category": "Manicure", "price": 400, "duration_min": 40,
     "description": "Classic nail shaping, cuticle care & polish.", "image_url": _MANI_IMG},
    {"name": "Aroma Magic Manicure", "category": "Manicure", "price": 500, "duration_min": 45,
     "description": "Aromatherapy manicure with nourishing oils.", "image_url": _MANI_IMG},
    {"name": "Rose Bud Manicure", "category": "Manicure", "price": 500, "duration_min": 45,
     "description": "Rose-infused soak for soft, fragrant hands.", "image_url": _MANI_IMG},
    {"name": "Ragga Manicure", "category": "Manicure", "price": 600, "duration_min": 50,
     "description": "Premium Ragga range hand treatment.", "image_url": _MANI_IMG},
    {"name": "Manicure (O3+)", "category": "Manicure", "price": 700, "duration_min": 50,
     "description": "O3+ professional brightening manicure.", "image_url": _MANI_IMG},
    {"name": "Foiling & Polish (Hands)", "category": "Manicure", "price": 100, "duration_min": 15,
     "description": "Quick foil buff & polish for hands.", "image_url": _MANI_IMG},
    {"name": "Cut & File", "category": "Manicure", "price": 100, "duration_min": 15,
     "description": "Nail cutting & shaping.", "image_url": _MANI_IMG},
    {"name": "Ozone Manicure", "category": "Manicure", "price": 600, "duration_min": 50,
     "description": "Ozone therapy manicure for healthy nails.", "image_url": _MANI_IMG},
    # -------- Pedicure --------
    {"name": "Basic Pedicure", "category": "Pedicure", "price": 500, "duration_min": 45,
     "description": "Classic foot soak, scrub, cuticle care & polish.", "image_url": _PEDI_IMG},
    {"name": "Aroma Magic Pedicure", "category": "Pedicure", "price": 800, "duration_min": 60,
     "description": "Aromatherapy pedicure with relaxing massage.", "image_url": _PEDI_IMG},
    {"name": "Rose Bud Pedicure", "category": "Pedicure", "price": 700, "duration_min": 55,
     "description": "Rose-infused soak for tired feet.", "image_url": _PEDI_IMG},
    {"name": "Ragga Pedicure", "category": "Pedicure", "price": 800, "duration_min": 60,
     "description": "Premium Ragga range foot treatment.", "image_url": _PEDI_IMG},
    {"name": "Pediologix (O3+)", "category": "Pedicure", "price": 1000, "duration_min": 60,
     "description": "O3+ Pediologix advanced foot therapy.", "image_url": _PEDI_IMG},
    {"name": "Foiling & Polish (Feet)", "category": "Pedicure", "price": 100, "duration_min": 15,
     "description": "Quick foil buff & polish for feet.", "image_url": _PEDI_IMG},
    {"name": "Cut & Foil", "category": "Pedicure", "price": 100, "duration_min": 15,
     "description": "Toe nail cutting & foil finish.", "image_url": _PEDI_IMG},
    {"name": "Ozone Pedicure", "category": "Pedicure", "price": 900, "duration_min": 60,
     "description": "Ozone therapy pedicure for healthy feet.", "image_url": _PEDI_IMG},
]

# Moves legacy services into the new main-tab category structure
CATEGORY_REMAP = {
    "Hair Cut - Men": "Men Hair",
    "Hair Cut - Women": "Women Hair",
    "Hair Color - Global": "Women Hair",
    "Keratin Treatment": "Women Hair",
    "Threading": "Skin",
    "Manicure": "Manicure",
    "Pedicure Spa": "Pedicure",
}

@api.post("/services/import-preset")
async def import_preset_services(user=Depends(require_admin)):
    added, updated = 0, 0
    for p in PRESET_SERVICES:
        existing = await db.services.find_one({"name": p["name"]})
        if existing:
            await db.services.update_one({"id": existing["id"]}, {"$set": {**p, "active": True}})
            updated += 1
        else:
            await db.services.insert_one(Service(**p).model_dump())
            added += 1
    for name, cat in CATEGORY_REMAP.items():
        sets = {"category": cat}
        if name == "Pedicure Spa":
            sets["image_url"] = _PEDI_IMG
        elif name == "Manicure":
            sets["image_url"] = _MANI_IMG
        r = await db.services.update_many({"name": name}, {"$set": sets})
        updated += r.modified_count
    return {"added": added, "updated": updated}

SERVICE_CSV_COLUMNS = ["name", "category", "price", "duration_min", "description", "image_url", "trending", "active"]

MAX_CSV_BYTES = 5 * 1024 * 1024  # 5MB import cap

def _csv_cell(v):
    """Neutralize CSV/formula injection: prefix risky leading chars with a quote."""
    s = "" if v is None else str(v)
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + s
    return s

def _csv_row(w, values):
    w.writerow([_csv_cell(v) for v in values])

async def _read_csv_upload(file: UploadFile) -> str:
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(400, "Only CSV files are supported. Export first to get the exact template.")
    raw = await file.read()
    if len(raw) > MAX_CSV_BYTES:
        raise HTTPException(413, "CSV too large — please keep imports under 5MB.")
    return raw.decode("utf-8-sig", errors="ignore")

def _build_qr_poster(salon_name: str, location: str, url: str) -> bytes:
    import qrcode
    from PIL import Image as PILImage, ImageDraw, ImageFont

    def _load_font(fname, size):
        # Bundled fonts first (survive production deploys), then system, then default
        for p in (ROOT_DIR / "fonts" / fname, Path("/usr/share/fonts/truetype/freefont") / fname):
            try:
                return ImageFont.truetype(str(p), size)
            except Exception:
                continue
        return ImageFont.load_default()

    W, H = 1240, 1754
    img = PILImage.new("RGB", (W, H), (10, 10, 10))
    d = ImageDraw.Draw(img)

    def fit_font(text, fname, start, max_w):
        size = start
        while size > 30:
            f = _load_font(fname, size)
            bbox = d.textbbox((0, 0), text, font=f)
            if bbox[2] - bbox[0] <= max_w:
                return f
            size -= 6
        return _load_font(fname, 30)

    def center(text, y, font, fill):
        bbox = d.textbbox((0, 0), text, font=font)
        d.text(((W - (bbox[2] - bbox[0])) / 2 - bbox[0], y), text, font=font, fill=fill)

    f_sub = _load_font("FreeSansBold.ttf", 34)
    f_small = _load_font("FreeSansBold.ttf", 28)
    d.rectangle([0, 0, W, 14], fill=(212, 175, 55))
    d.rectangle([0, H - 14, W, H], fill=(212, 175, 55))
    center(salon_name, 130, fit_font(salon_name, "FreeSerifBold.ttf", 84, W - 120), (212, 175, 55))
    if location:
        center(location[:70], 260, f_small, (230, 230, 230))
    center("S C A N  ·  B O O K  ·  G L O W", 350, f_sub, (255, 255, 255))

    qr = qrcode.QRCode(box_size=12, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    qimg = qr.make_image(fill_color="black", back_color="white").convert("RGB").resize((640, 640))
    panel = PILImage.new("RGB", (700, 700), (255, 255, 255))
    panel.paste(qimg, (30, 30))
    img.paste(panel, ((W - 700) // 2, 450))

    y = 450 + 700 + 70
    center("Point your phone camera at the code", y, f_sub, (255, 255, 255))
    center("Book your visit in seconds — no calls, no waiting", y + 62, f_small, (200, 200, 200))
    center("Tap Install to get the Miracurl Book app for offers & reminders", y + 118, f_small, (212, 175, 55))
    center("Powered by Miracurl", H - 90, f_small, (130, 130, 130))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

@api.get("/settings/qr-poster")
async def download_qr_poster(origin: str = "", user=Depends(get_current_user)):
    if not origin.startswith("http"):
        raise HTTPException(400, "origin query param required")
    tenant = await db.tenants.find_one({"id": user.get("tenant_id")}, {"_id": 0})
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    url = f"{origin.rstrip('/')}/book/{tenant['slug']}"
    png = _build_qr_poster(tenant.get("name", "Your Salon"), tenant.get("location", "") or "", url)
    return Response(content=png, media_type="image/png",
                    headers={"Content-Disposition": "attachment; filename=booking-qr-poster.png"})

@api.get("/services/export")
async def export_services_csv(user=Depends(require_admin)):
    rows = await db.services.find({}).sort([("category", 1), ("name", 1)]).to_list(2000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(SERVICE_CSV_COLUMNS)
    for r in rows:
        _csv_row(w, [
            r.get("name", ""), r.get("category", ""), r.get("price", 0),
            r.get("duration_min", 30), r.get("description", ""), r.get("image_url", ""),
            r.get("trending", False), r.get("active", True),
        ])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=services.csv"},
    )

@api.post("/services/import")
async def import_services_csv(file: UploadFile = File(...), user=Depends(require_admin)):
    content = await _read_csv_upload(file)
    reader = csv.DictReader(io.StringIO(content))
    fields = {(f or "").strip().lower() for f in (reader.fieldnames or [])}
    if not {"name", "category", "price"}.issubset(fields):
        raise HTTPException(400, "CSV needs columns: name, category, price (optional: duration_min, description, image_url, trending, active)")
    added = updated = skipped = 0
    for raw in reader:
        row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
        name = row.get("name", "")
        try:
            price = float(row.get("price") or "")
        except ValueError:
            price = None
        if not name or price is None:
            skipped += 1
            continue
        doc = {
            "name": name,
            "category": row.get("category") or "General",
            "price": price,
            "duration_min": int(float(row.get("duration_min") or 30)),
            "description": row.get("description", ""),
            "image_url": row.get("image_url", ""),
            "trending": row.get("trending", "").lower() in ("true", "1", "yes"),
            "active": row.get("active", "true").lower() not in ("false", "0", "no"),
        }
        existing = await db.services.find_one({"name": name})
        if existing:
            await db.services.update_one({"id": existing["id"]}, {"$set": doc})
            updated += 1
        else:
            await db.services.insert_one(Service(**doc).model_dump())
            added += 1
    return {"added": added, "updated": updated, "skipped": skipped}

@api.get("/services")
async def list_services(user=Depends(get_current_user)):
    return await db.services.find({}, {"_id": 0}).sort("category", 1).to_list(500)

@api.post("/services")
async def create_service(body: ServiceIn, user=Depends(require_admin)):
    s = Service(**body.model_dump()).model_dump()
    await db.services.insert_one(s)
    return _clean(s)

@api.put("/services/{sid}")
async def update_service(sid: str, body: ServiceIn, user=Depends(require_admin)):
    await db.services.update_one({"id": sid}, {"$set": body.model_dump()})
    return await db.services.find_one({"id": sid}, {"_id": 0})

@api.delete("/services/{sid}")
async def delete_service(sid: str, user=Depends(require_admin)):
    await db.services.delete_one({"id": sid})
    return {"ok": True}

# ---------------- Owner Security PIN + Branch-switch approval ----------------
class SecurityPinIn(BaseModel):
    new_pin: str = Field(..., pattern=r"^\d{4,6}$")
    current_pin: Optional[str] = None


@api.get("/settings/security-pin")
async def security_pin_status(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return {"set": bool(t.get("security_pin_hash"))}


@api.put("/settings/security-pin")
async def set_security_pin(body: SecurityPinIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    existing = t.get("security_pin_hash")
    if existing:
        await _pin_attempt_guard(t["id"])
        if not (body.current_pin and verify_pw(body.current_pin, existing)):
            await _pin_attempt_fail(t["id"])
            raise HTTPException(403, "Current PIN is incorrect")
        await _pin_attempt_clear(t["id"])
    await db.tenants.update_one({"id": t["id"]}, {"$set": {"security_pin_hash": hash_pw(body.new_pin)}})
    return {"ok": True, "set": True}


async def _pin_attempt_guard(tid: str):
    rec = await _raw_db.pin_attempts.find_one({"tenant_id": tid})
    if rec and rec.get("count", 0) >= 5:
        lu = rec.get("locked_until")
        if lu and datetime.fromisoformat(lu) > datetime.now(timezone.utc):
            raise HTTPException(423, "Too many wrong PIN attempts — locked for 15 minutes.")


async def _pin_attempt_fail(tid: str):
    now = datetime.now(timezone.utc)
    await _raw_db.pin_attempts.update_one(
        {"tenant_id": tid},
        {"$inc": {"count": 1},
         "$set": {"last_attempt": now.isoformat(),
                  "locked_until": (now + timedelta(minutes=15)).isoformat()}},
        upsert=True)


async def _pin_attempt_clear(tid: str):
    await _raw_db.pin_attempts.delete_one({"tenant_id": tid})


async def require_owner_pin(request: Request, user=Depends(get_current_user), t=Depends(current_tenant)):
    """Guards sensitive staff/salary writes on the shared admin login.
    No-op until the owner sets a Security PIN in Settings. 5 wrong tries = 15-min lockout."""
    if user.get("role") == "super_admin":
        return True
    ph = (t or {}).get("security_pin_hash")
    if not ph:
        return True
    pin = request.headers.get("X-Owner-Pin") or ""
    if not pin:
        raise HTTPException(403, "OWNER_PIN_REQUIRED")
    await _pin_attempt_guard(t["id"])
    if not verify_pw(pin, ph):
        await _pin_attempt_fail(t["id"])
        raise HTTPException(403, "OWNER_PIN_REQUIRED")
    await _pin_attempt_clear(t["id"])
    return True


class BranchSwitchRequestIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    phone: str = Field(..., min_length=7, max_length=20)
    position: str = Field(..., min_length=2, max_length=60)
    branch: str = Field("", max_length=120)


class BranchSwitchVerifyIn(BaseModel):
    request_id: str
    otp: str = Field(..., min_length=4, max_length=8)


class OwnerPinIn(BaseModel):
    pin: str = Field(..., min_length=4, max_length=6)


def _mask_email(e: str) -> str:
    if not e or "@" not in e:
        return ""
    u, d = e.split("@", 1)
    return f"{u[:2]}***@{d}"


def _switch_otp_email_html(t: dict, req: dict) -> str:
    esc = html_lib.escape
    return f"""<div style="font-family:Georgia,serif;background:#f4f2ee;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:#191921;border-radius:16px;padding:28px;text-align:center">
      <div style="color:#c9a35c;font-size:11px;letter-spacing:3px;text-transform:uppercase">Branch switch approval</div>
      <div style="color:#fff;font-size:20px;margin-top:8px">{esc(t.get('name') or 'Your salon')}</div>
      <p style="color:#9a9aa6;font-size:13px;margin-top:14px"><b style="color:#fff">{esc(req['requester_name'])}</b> ({esc(req['requester_position'])} &middot; {esc(req['requester_phone'])}) wants to switch the dashboard to <b style="color:#fff">{esc(req.get('branch') or 'All branches')}</b>.</p>
      <div style="background:#26262f;border:1px solid #c9a35c;border-radius:12px;padding:14px;margin:18px 0">
        <div style="color:#9a9aa6;font-size:11px">Share this OTP only if you approve</div>
        <div style="color:#c9a35c;font-size:32px;letter-spacing:8px;font-weight:700;margin-top:4px">{req['otp']}</div>
      </div>
      <div style="color:#6f6f7a;font-size:11px">Valid for 10 minutes. If you don't recognise this person, ignore this email.</div>
    </div></div>"""


@api.post("/branch-switch/request")
async def branch_switch_request(body: BranchSwitchRequestIn, user=Depends(get_current_user), t=Depends(current_tenant)):
    """Anyone on a shared login must identify themselves; a 6-digit OTP goes to the owner."""
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()), "otp": f"{secrets.randbelow(900000) + 100000}",
        "requester_name": body.name.strip(), "requester_phone": body.phone.strip(),
        "requester_position": body.position.strip(), "branch": body.branch.strip(),
        "status": "pending", "attempts": 0, "requested_by_user": user.get("email"),
        "expires_at": (now + timedelta(minutes=10)).isoformat(), "created_at": now.isoformat(),
    }
    await db.branch_switch_requests.insert_one(doc)
    owner_email = (t or {}).get("owner_email")
    sent = False
    if owner_email:
        res = await _send_email(
            [owner_email],
            f"Branch switch OTP — {body.name.strip()} ({body.position.strip()})",
            _switch_otp_email_html(t, doc))
        sent = bool(res.get("sent"))
    return {"request_id": doc["id"], "owner_email": _mask_email(owner_email or ""),
            "email_sent": sent, "expires_in_min": 10}


@api.post("/branch-switch/verify")
async def branch_switch_verify(body: BranchSwitchVerifyIn, user=Depends(get_current_user)):
    req = await db.branch_switch_requests.find_one({"id": body.request_id}, {"_id": 0})
    if not req or req.get("status") != "pending":
        raise HTTPException(400, "Request not found or already used — ask for a new OTP")
    if req["expires_at"] < datetime.now(timezone.utc).isoformat():
        await db.branch_switch_requests.update_one({"id": req["id"]}, {"$set": {"status": "expired"}})
        raise HTTPException(400, "OTP expired — please request approval again")
    if int(req.get("attempts") or 0) >= 5:
        await db.branch_switch_requests.update_one({"id": req["id"]}, {"$set": {"status": "blocked"}})
        raise HTTPException(400, "Too many wrong attempts — request a new OTP")
    if not hmac.compare_digest(str(req["otp"]), body.otp.strip()):
        await db.branch_switch_requests.update_one({"id": req["id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(400, "Incorrect OTP")
    await db.branch_switch_requests.update_one(
        {"id": req["id"]},
        {"$set": {"status": "approved", "approved_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True}


@api.post("/branch-switch/owner-pin")
async def branch_switch_owner_pin(body: OwnerPinIn, user=Depends(get_current_user), t=Depends(current_tenant)):
    """Owner fast-path: knowing the Security PIN proves it's the owner switching."""
    ph = (t or {}).get("security_pin_hash")
    if not ph:
        raise HTTPException(400, "No owner PIN set — use the OTP option")
    await _pin_attempt_guard(t["id"])
    if not verify_pw(body.pin, ph):
        await _pin_attempt_fail(t["id"])
        raise HTTPException(403, "Incorrect PIN")
    await _pin_attempt_clear(t["id"])
    return {"ok": True}


class SalonSwitchIn(BaseModel):
    tenant_id: str
    pin: Optional[str] = None


@api.post("/auth/switch-salon")
async def switch_salon(body: SalonSwitchIn, user=Depends(get_current_user), t=Depends(current_tenant)):
    """Multi-salon owners: switch the active salon on their login.
    Owner PIN of the CURRENT salon confirms the switch (no-op until a PIN is set)."""
    allowed = set(user.get("tenant_ids") or [])
    if user.get("tenant_id"):
        allowed.add(user["tenant_id"])
    if body.tenant_id not in allowed:
        raise HTTPException(403, "This salon is not linked to your login")
    if body.tenant_id == user.get("tenant_id"):
        return {"ok": True, "already_active": True}
    ph = (t or {}).get("security_pin_hash")
    if ph:
        if not body.pin:
            raise HTTPException(403, "OWNER_PIN_REQUIRED")
        await _pin_attempt_guard(t["id"])
        if not verify_pw(body.pin, ph):
            await _pin_attempt_fail(t["id"])
            raise HTTPException(403, "Incorrect PIN")
        await _pin_attempt_clear(t["id"])
    await db.users.update_one({"id": user["id"]}, {"$set": {"tenant_id": body.tenant_id}})
    target = await db.tenants.find_one({"id": body.tenant_id}, {"_id": 0, "id": 1, "name": 1, "slug": 1})
    return {"ok": True, "active_salon": target}


@api.get("/auth/my-salons/overview")
async def my_salons_overview(request: Request, user=Depends(get_current_user), t=Depends(current_tenant)):
    """Group Dashboard (multi-salon owners): today's collections across all salons.
    Locked behind the Owner PIN of the currently active salon (header X-Owner-Pin)."""
    if user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(403, "Only the owner/admin can view the Group Dashboard")
    ids = set(user.get("tenant_ids") or [])
    if user.get("tenant_id"):
        ids.add(user["tenant_id"])
    if len(ids) < 2:
        raise HTTPException(400, "Only one salon is linked to your login")
    ph = (t or {}).get("security_pin_hash")
    if ph:
        pin = request.headers.get("X-Owner-Pin", "")
        if not pin:
            raise HTTPException(403, "OWNER_PIN_REQUIRED")
        await _pin_attempt_guard(t["id"])
        if not verify_pw(pin, ph):
            await _pin_attempt_fail(t["id"])
            raise HTTPException(403, "Incorrect PIN")
        await _pin_attempt_clear(t["id"])
    ist = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(ist)
    day_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).isoformat()
    month_start = now_ist.replace(day=1, hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).isoformat()
    today_ist = now_ist.date().isoformat()
    salons = []
    for tid in ids:
        t = await _raw_db.tenants.find_one(
            {"id": tid}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "location": 1, "logo_url": 1})
        if not t:
            continue
        inv_today = await _raw_db.invoices.find(
            {"tenant_id": tid, "created_at": {"$gte": day_start}}, {"_id": 0, "total": 1}).to_list(5000)
        inv_month = await _raw_db.invoices.find(
            {"tenant_id": tid, "created_at": {"$gte": month_start}}, {"_id": 0, "total": 1}).to_list(50000)
        appts_today = await _raw_db.appointments.count_documents(
            {"tenant_id": tid, "scheduled_at": {"$regex": f"^{today_ist}"}, "status": {"$ne": "cancelled"}})
        salons.append({
            **t,
            "today": round(sum(float(i.get("total") or 0) for i in inv_today), 2),
            "invoices_today": len(inv_today),
            "month": round(sum(float(i.get("total") or 0) for i in inv_month), 2),
            "appointments_today": appts_today,
            "active": tid == user.get("tenant_id"),
        })
    salons.sort(key=lambda x: -x["today"])
    return {
        "date": today_ist,
        "salons": salons,
        "total_today": round(sum(s["today"] for s in salons), 2),
        "total_month": round(sum(s["month"] for s in salons), 2),
    }


@api.get("/branch-switch/pending")
async def branch_switch_pending(user=Depends(require_tenant_admin)):
    now_iso = datetime.now(timezone.utc).isoformat()
    return await db.branch_switch_requests.find(
        {"status": "pending", "expires_at": {"$gt": now_iso}}, {"_id": 0}).sort("created_at", -1).to_list(20)


@api.post("/branch-switch/{rid}/deny")
async def branch_switch_deny(rid: str, user=Depends(require_tenant_admin)):
    await db.branch_switch_requests.update_one({"id": rid}, {"$set": {"status": "denied"}})
    return {"ok": True}


# ---------------- Entertainment: custom tenant playlists ----------------
class PlaylistIn(BaseModel):
    label: str = Field(..., min_length=2, max_length=60)
    url: str = Field(..., min_length=10, max_length=500)


def _parse_media_url(url: str) -> Optional[dict]:
    u = url.strip()
    m = re.search(r"open\.spotify\.com/(playlist|album|track)/([A-Za-z0-9]+)", u)
    if m:
        return {"kind": "spotify", "media_type": m.group(1), "media_id": m.group(2)}
    if "youtube.com" in u or "youtu.be" in u:
        m = re.search(r"[?&]list=([A-Za-z0-9_-]+)", u)
        if m:
            return {"kind": "youtube", "media_type": "playlist", "media_id": m.group(1)}
        m = re.search(r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)([A-Za-z0-9_-]{6,})", u)
        if m:
            return {"kind": "youtube", "media_type": "video", "media_id": m.group(1)}
    return None


@api.get("/entertainment/playlists")
async def list_playlists(user=Depends(require_tenant_admin)):
    return await db.entertainment_playlists.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)


@api.post("/entertainment/playlists")
async def add_playlist(body: PlaylistIn, user=Depends(require_tenant_admin)):
    parsed = _parse_media_url(body.url)
    if not parsed:
        raise HTTPException(400, "Couldn't read that link — paste a YouTube video/playlist URL or a Spotify playlist/album/track URL.")
    doc = {"id": str(uuid.uuid4()), "label": body.label.strip(), "url": body.url.strip(),
           **parsed, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.entertainment_playlists.insert_one(doc)
    return _clean(doc)


@api.delete("/entertainment/playlists/{pid}")
async def delete_playlist(pid: str, user=Depends(require_tenant_admin)):
    await db.entertainment_playlists.delete_one({"id": pid})
    return {"ok": True}


# ---------------- Staff ----------------
_STAFF_SENSITIVE_FIELDS = {
    "monthly_base_salary": 0, "commission_pct": 0, "bank_details": 0, "aadhaar_last4": 0,
    "max_advance": 0, "overtime_rate": 0, "salary_visible": 0, "notice_period_days": 0,
    "serving_notice": 0, "last_working_day": 0,
}


@api.get("/staff")
async def list_staff(user=Depends(get_current_user)):
    proj = {"_id": 0, "aadhaar_hash": 0}
    if user.get("role") not in ("admin", "super_admin"):
        proj.update(_STAFF_SENSITIVE_FIELDS)  # SEC-001: staff/manager get no pay/bank/ID data
    return await db.staff.find({}, proj).to_list(500)


def _staff_write_payload(body: StaffIn) -> dict:
    d = body.model_dump()
    aad = re.sub(r"\D", "", d.pop("aadhaar", None) or "")
    if aad:
        if len(aad) != 12:
            raise HTTPException(400, "Aadhaar must be exactly 12 digits")
        d["aadhaar_last4"] = aad[-4:]
        d["aadhaar_hash"] = _aadhaar_fp(aad)
    return d


@api.post("/staff")
async def create_staff(body: StaffIn, user=Depends(require_tenant_admin), _pin=Depends(require_owner_pin)):
    s = Staff(**_staff_write_payload(body)).model_dump()
    await db.staff.insert_one(s)
    return _clean({k: v for k, v in s.items() if k != "aadhaar_hash"})

@api.put("/staff/{sid}")
async def update_staff(sid: str, body: StaffIn, user=Depends(require_tenant_admin), _pin=Depends(require_owner_pin)):
    await db.staff.update_one({"id": sid}, {"$set": _staff_write_payload(body)})
    return await db.staff.find_one({"id": sid}, {"_id": 0, "aadhaar_hash": 0})

@api.delete("/staff/{sid}")
async def delete_staff(sid: str, user=Depends(require_tenant_admin), _pin=Depends(require_owner_pin)):
    # If the staff has a linked user (login credential), also delete the login
    # so the deleted staff cannot access the salon.
    s = await db.staff.find_one({"id": sid}, {"_id": 0, "user_id": 1})
    if s and s.get("user_id"):
        await db.users.delete_one({"id": s["user_id"]})
    await db.staff.delete_one({"id": sid})
    return {"ok": True}


# ---------------- Salary advances ----------------
class AdvanceIn(BaseModel):
    amount: float = Field(..., gt=0)
    note: str = Field("", max_length=200)


@api.post("/staff/{sid}/advance")
async def give_advance(sid: str, body: AdvanceIn, admin=Depends(require_tenant_admin), _pin=Depends(require_owner_pin)):
    """One advance per staff per month, only after the 15th, capped at staff.max_advance.
    Auto-deducted from that month's salary slip."""
    staff = await db.staff.find_one({"id": sid}, {"_id": 0})
    if not staff:
        raise HTTPException(404, "Staff not found")
    max_adv = float(staff.get("max_advance") or 0)
    if max_adv <= 0:
        raise HTTPException(400, "No advance limit set for this staff. Edit the staff profile and set 'Max advance' first.")
    if body.amount > max_adv:
        raise HTTPException(400, f"Advance cannot exceed the ₹{max_adv:,.0f} limit set for {staff.get('name')}.")
    today_ist = datetime.now(IST_TZ).date()
    if today_ist.day <= 15:
        raise HTTPException(400, "Advance can only be given after the 15th of the month.")
    month = today_ist.strftime("%Y-%m")
    if await db.advances.find_one({"staff_id": sid, "month": month}):
        raise HTTPException(400, f"{staff.get('name')} has already taken an advance this month (one per month).")
    doc = {
        "id": str(uuid.uuid4()), "staff_id": sid, "staff_name": staff.get("name"),
        "amount": round(body.amount, 2), "note": body.note.strip(), "month": month,
        "given_by": admin.get("email"), "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.advances.insert_one(doc)
    return _clean(doc)


@api.get("/staff/{sid}/advances")
async def list_advances(sid: str, admin=Depends(require_tenant_admin)):
    rows = await db.advances.find({"staff_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(24)
    return rows


@api.delete("/staff/{sid}/advance/{aid}")
async def delete_advance(sid: str, aid: str, admin=Depends(require_tenant_admin), _pin=Depends(require_owner_pin)):
    """Undo a mistakenly-recorded advance — allowed only within the same month."""
    month = datetime.now(IST_TZ).strftime("%Y-%m")
    res = await db.advances.delete_one({"id": aid, "staff_id": sid, "month": month})
    if res.deleted_count == 0:
        raise HTTPException(404, "Advance not found (past-month advances can't be removed)")
    return {"ok": True}


# ============== Staff Portal (login, attendance, salary slip) ==============

class StaffLoginCreateIn(BaseModel):
    email: EmailStr


def _generate_temp_password() -> str:
    """Temp password: two friendly words + a strong random token, e.g. Bright-Silk-kTz9Qw2Lp4A.
    The token alone carries ~64 bits of entropy (audit SEC-002)."""
    _words = ["Rose", "Silk", "Gold", "Ivory", "Coral", "Bright", "Velvet",
              "Amber", "Pearl", "Onyx", "Blush", "Willow", "Ember", "Frost"]
    return f"{secrets.choice(_words)}-{secrets.choice(_words)}-{secrets.token_urlsafe(8)}"


class StaffTransferIn(BaseModel):
    target_tenant_id: str


@api.post("/staff/{sid}/transfer")
async def transfer_staff(sid: str, body: StaffTransferIn,
                         admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Move a staff member (profile + portal login) to another salon the SAME owner controls.
    Their booking-portal visibility follows automatically; history stays with the old branch."""
    owned = set(admin.get("tenant_ids") or [])
    if admin.get("tenant_id"):
        owned.add(admin["tenant_id"])
    target_tid = body.target_tenant_id.strip()
    if target_tid == t["id"]:
        raise HTTPException(400, "Staff is already in this salon")
    if admin.get("role") != "super_admin" and target_tid not in owned:
        raise HTTPException(403, "You can only transfer staff between salons linked to your login")
    target = await _raw_db.tenants.find_one({"id": target_tid}, {"_id": 0, "id": 1, "name": 1, "slug": 1})
    if not target:
        raise HTTPException(404, "Target salon not found")
    s = await db.staff.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Staff member not found")
    await _raw_db.staff.update_one(
        {"id": sid, "tenant_id": t["id"]},
        {"$set": {"tenant_id": target_tid, "branch": "",
                  "transferred_from": t["id"],
                  "transferred_at": datetime.now(timezone.utc).isoformat()}})
    if s.get("user_id"):
        await _raw_db.users.update_one({"id": s["user_id"]}, {"$set": {"tenant_id": target_tid}})
    return {"ok": True, "staff": s["name"], "transferred_to": target,
            "login_moved": bool(s.get("user_id"))}


@api.post("/staff/{sid}/create-login")
async def create_staff_login(
    sid: str, body: StaffLoginCreateIn,
    admin=Depends(require_tenant_admin), t=Depends(current_tenant),
):
    """Create a login credential for a staff member. Returns a one-time temp
    password to share with the staff — they'll be forced to change it on first
    login (must_change_password=True)."""
    s = await db.staff.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Staff member not found")
    if s.get("user_id"):
        raise HTTPException(400, "This staff already has a login")
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    temp_pw = _generate_temp_password()
    new_user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": s.get("name") or "Staff",
        "role": "staff",
        "tenant_id": t["id"],
        "status": "active",
        "disabled": False,
        "password_hash": hash_pw(temp_pw),
        "must_change_password": True,
        "staff_id": sid,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(new_user)
    await db.staff.update_one({"id": sid}, {"$set": {"user_id": new_user["id"], "email": email}})
    return {
        "ok": True,
        "email": email,
        "temp_password": temp_pw,
        "must_change_password": True,
    }


@api.post("/staff/{sid}/reset-login")
async def reset_staff_login(sid: str, admin=Depends(require_tenant_admin)):
    """Regenerate a one-time temp password for a staff who ALREADY has a login
    (e.g. the owner lost the original). Forces a password change on next login."""
    s = await db.staff.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Staff member not found")
    if not s.get("user_id"):
        raise HTTPException(400, "This staff has no login yet — use 'Give login' first")
    login_user = await db.users.find_one({"id": s["user_id"]}, {"_id": 0, "email": 1})
    if not login_user:
        raise HTTPException(400, "Linked login account not found — use 'Give login' to recreate it")
    temp_pw = _generate_temp_password()
    await db.users.update_one(
        {"id": s["user_id"]},
        {"$set": {"password_hash": hash_pw(temp_pw), "must_change_password": True, "disabled": False, "status": "active",
                  "password_changed_at": datetime.now(timezone.utc).isoformat()}})
    # Keep the staff record's email in sync with the actual login email so the
    # owner always shares the correct address (root cause of "invalid password").
    await db.staff.update_one({"id": sid}, {"$set": {"email": login_user["email"]}})
    return {"ok": True, "email": login_user["email"], "temp_password": temp_pw, "must_change_password": True}


# ---------------- Manager accounts (restricted-access role) ----------------
class ManagerCreateIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    email: str
    role: str = "Manager"
    phone: str = ""
    specialties: List[str] = []
    commission_pct: float = 10.0
    monthly_base_salary: float = 0.0
    salary_visible: bool = True

    @field_validator("email")
    @classmethod
    def _email(cls, v):
        v = v.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
            raise ValueError("Enter a valid email")
        return v

@api.get("/managers")
async def list_managers(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    rows = await _raw_db.users.find(
        {"tenant_id": t["id"], "role": "manager"},
        {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(100)
    return rows

@api.post("/managers")
async def create_manager(body: ManagerCreateIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    if await _raw_db.users.find_one({"email": body.email}):
        raise HTTPException(400, "Email already registered")
    temp_pw = _generate_temp_password()
    new_user = {
        "id": str(uuid.uuid4()), "email": body.email, "name": body.name.strip(),
        "role": "manager", "tenant_id": t["id"], "status": "active", "disabled": False,
        "password_hash": hash_pw(temp_pw), "must_change_password": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _raw_db.users.insert_one(new_user)
    # A manager is also a team member: create a linked staff profile so they appear
    # in Staff/booking and get salary slips (all details captured up-front, like staff).
    staff_doc = Staff(
        name=new_user["name"], role=body.role or "Manager", phone=body.phone,
        email=body.email, specialties=body.specialties, commission_pct=body.commission_pct,
        monthly_base_salary=body.monthly_base_salary, salary_visible=body.salary_visible,
        user_id=new_user["id"],
    ).model_dump()
    await db.staff.insert_one(staff_doc)
    return {"ok": True, "id": new_user["id"], "email": body.email, "name": new_user["name"],
            "temp_password": temp_pw, "must_change_password": True}

@api.post("/managers/{uid}/reset")
async def reset_manager(uid: str, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    u = await _raw_db.users.find_one({"id": uid, "tenant_id": t["id"], "role": "manager"}, {"_id": 0, "email": 1})
    if not u:
        raise HTTPException(404, "Manager not found")
    temp_pw = _generate_temp_password()
    await _raw_db.users.update_one(
        {"id": uid},
        {"$set": {"password_hash": hash_pw(temp_pw), "must_change_password": True, "disabled": False, "status": "active",
                  "password_changed_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "email": u["email"], "temp_password": temp_pw, "must_change_password": True}

@api.delete("/managers/{uid}")
async def delete_manager(uid: str, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    res = await _raw_db.users.delete_one({"id": uid, "tenant_id": t["id"], "role": "manager"})
    if res.deleted_count == 0:
        raise HTTPException(404, "Manager not found")
    await db.staff.delete_one({"user_id": uid})
    return {"ok": True}


# ---------------- WhatsApp send-approval workflow (manager → admin) ----------------
class WhatsAppRequestIn(BaseModel):
    client_name: str = Field(..., max_length=120)
    client_phone: str = Field("", max_length=20)
    message: str = Field(..., max_length=2000)
    kind: str = Field("confirmation", max_length=40)

@api.post("/whatsapp-requests")
async def create_whatsapp_request(body: WhatsAppRequestIn, user=Depends(get_current_user)):
    """A manager requests to send a WhatsApp message; admin must approve."""
    doc = {
        "id": str(uuid.uuid4()), "requested_by": user["id"],
        "requested_by_name": user.get("name") or user.get("email"),
        "client_name": body.client_name, "client_phone": "".join(c for c in body.client_phone if c.isdigit()),
        "message": body.message, "kind": body.kind, "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.whatsapp_requests.insert_one(doc)
    return {"ok": True, "id": doc["id"], "status": "pending"}

@api.get("/whatsapp-requests")
async def list_whatsapp_requests(status: str = "pending", admin=Depends(require_tenant_admin)):
    q = {} if status == "all" else {"status": status}
    return await db.whatsapp_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)

@api.get("/whatsapp-requests/pending-count")
async def whatsapp_pending_count(admin=Depends(require_tenant_admin)):
    return {"count": await db.whatsapp_requests.count_documents({"status": "pending"})}

@api.post("/whatsapp-requests/{rid}/approve")
async def approve_whatsapp_request(rid: str, admin=Depends(require_tenant_admin)):
    r = await db.whatsapp_requests.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Request not found")
    await db.whatsapp_requests.update_one(
        {"id": rid}, {"$set": {"status": "approved", "approved_by": admin["id"],
                               "approved_at": datetime.now(timezone.utc).isoformat()}})
    phone = r.get("client_phone") or ""
    from urllib.parse import quote as _quote
    wa_url = (f"https://wa.me/{phone}?text=" if phone else "https://wa.me/?text=") + _quote(r["message"])
    return {"ok": True, "wa_url": wa_url}

@api.post("/whatsapp-requests/{rid}/reject")
async def reject_whatsapp_request(rid: str, admin=Depends(require_tenant_admin)):
    res = await db.whatsapp_requests.update_one(
        {"id": rid, "status": "pending"},
        {"$set": {"status": "rejected", "approved_by": admin["id"], "approved_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Request not found or already handled")
    return {"ok": True}



@api.post("/staff/{sid}/toggle-active")
async def toggle_staff_active(sid: str, admin=Depends(require_tenant_admin)):
    """Enable/disable a staff record + their login (if any). Disabled staff
    cannot log in; the record is preserved for historical reports."""
    s = await db.staff.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Staff member not found")
    new_active = not bool(s.get("active", True))
    await db.staff.update_one({"id": sid}, {"$set": {"active": new_active}})
    if s.get("user_id"):
        await db.users.update_one({"id": s["user_id"]}, {"$set": {"disabled": not new_active}})
    return {"active": new_active}


# ---- Staff self-service (role=staff) ----

async def _current_staff(user=Depends(get_current_user)) -> dict:
    """Resolve the staff record for the logged-in user. Only staff (or admin
    viewing their own linked record) can access self-service endpoints."""
    staff_id = user.get("staff_id")
    if not staff_id:
        raise HTTPException(403, "This account is not linked to any staff profile.")
    s = await db.staff.find_one({"id": staff_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Staff profile not found")
    return s


@api.get("/staff/me/profile")
async def staff_me_profile(s=Depends(_current_staff)):
    return s


# ---------------- Staff planned leave requests ----------------
LONG_LEAVE_DAYS = 5          # leaves LONGER than this need advance notice
LONG_LEAVE_NOTICE_DAYS = 30  # ...of at least 1 month


class LeaveRequestIn(BaseModel):
    from_date: str = Field(..., max_length=10)
    to_date: str = Field(..., max_length=10)
    reason: str = Field("", max_length=500)


def _parse_leave_dates(from_date: str, to_date: str) -> tuple:
    try:
        f = datetime.strptime(from_date, "%Y-%m-%d").date()
        t = datetime.strptime(to_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Dates must be YYYY-MM-DD")
    if t < f:
        raise HTTPException(400, "End date cannot be before start date")
    return f, t


@api.post("/staff/me/leave-requests")
async def create_leave_request(body: LeaveRequestIn, s=Depends(_current_staff)):
    f, t = _parse_leave_dates(body.from_date, body.to_date)
    today_ist = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date()
    if f < today_ist:
        raise HTTPException(400, "Leave cannot start in the past")
    days = (t - f).days + 1
    if days > LONG_LEAVE_DAYS and f < today_ist + timedelta(days=LONG_LEAVE_NOTICE_DAYS):
        raise HTTPException(
            400,
            f"Leaves longer than {LONG_LEAVE_DAYS} days must be requested at least 1 month in advance "
            f"(earliest allowed start: {(today_ist + timedelta(days=LONG_LEAVE_NOTICE_DAYS)).isoformat()})",
        )
    overlap = await db.leave_requests.find_one({
        "staff_id": s["id"], "status": {"$in": ["pending", "approved"]},
        "from_date": {"$lte": t.isoformat()}, "to_date": {"$gte": f.isoformat()},
    }, {"_id": 0, "id": 1, "status": 1})
    if overlap:
        raise HTTPException(400, f"You already have a {overlap['status']} leave request overlapping these dates")
    doc = {
        "id": str(uuid.uuid4()), "staff_id": s["id"], "staff_name": s.get("name"),
        "from_date": f.isoformat(), "to_date": t.isoformat(), "days": days,
        "reason": body.reason.strip(), "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.leave_requests.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.get("/staff/me/leave-requests")
async def my_leave_requests(s=Depends(_current_staff)):
    return await db.leave_requests.find({"staff_id": s["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)


@api.delete("/staff/me/leave-requests/{rid}")
async def cancel_leave_request(rid: str, s=Depends(_current_staff)):
    res = await db.leave_requests.update_one(
        {"id": rid, "staff_id": s["id"], "status": "pending"},
        {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Request not found or already handled")
    return {"ok": True}


@api.get("/leave-requests")
async def list_leave_requests(status: str = "pending", admin=Depends(require_tenant_admin)):
    q = {} if status == "all" else {"status": status}
    return await db.leave_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)


@api.get("/leave-requests/pending-count")
async def leave_requests_pending_count(admin=Depends(require_tenant_admin)):
    return {"count": await db.leave_requests.count_documents({"status": "pending"})}


class LeaveDecisionIn(BaseModel):
    note: str = Field("", max_length=300)


@api.post("/leave-requests/{rid}/approve")
async def approve_leave_request(rid: str, body: LeaveDecisionIn = LeaveDecisionIn(), admin=Depends(require_tenant_admin)):
    res = await db.leave_requests.update_one(
        {"id": rid, "status": "pending"},
        {"$set": {"status": "approved", "admin_note": body.note.strip(), "decided_by": admin.get("name") or admin.get("email"),
                  "decided_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Request not found or already handled")
    return {"ok": True, "status": "approved"}


@api.post("/leave-requests/{rid}/reject")
async def reject_leave_request(rid: str, body: LeaveDecisionIn = LeaveDecisionIn(), admin=Depends(require_tenant_admin)):
    res = await db.leave_requests.update_one(
        {"id": rid, "status": "pending"},
        {"$set": {"status": "rejected", "admin_note": body.note.strip(), "decided_by": admin.get("name") or admin.get("email"),
                  "decided_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Request not found or already handled")
    return {"ok": True, "status": "rejected"}


# ---- Attendance rules: geo-fence, late fines, overtime, auto-checkout ----
IST_TZ = timezone(timedelta(hours=5, minutes=30))
GRACE_MINUTES = 10          # default grace — admin can override per tenant
LATE_FINE_TIERS_DEFAULT = {"grace_minutes": GRACE_MINUTES, "fine_5": 50.0, "fine_10": 100.0, "fine_15": 150.0, "fine_30": 300.0}
GEO_FENCE_M = 200           # check-in blocked beyond this distance from salon
AUTO_CHECKOUT_HOURS = 12    # forgot to check out — shift auto-closes at 12h


class GeoIn(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None


def _parse_hhmm(val, fallback: str) -> tuple:
    try:
        h, m = str(val).strip().split(":")
        h, m = int(h), int(m)
        if 0 <= h <= 23 and 0 <= m <= 59:
            return h, m
    except (ValueError, AttributeError):
        pass
    h, m = fallback.split(":")
    return int(h), int(m)


def _late_fine_rules(tenant: Optional[dict]) -> dict:
    saved = (tenant or {}).get("late_fines") or {}
    return {**LATE_FINE_TIERS_DEFAULT, **{k: saved[k] for k in LATE_FINE_TIERS_DEFAULT if k in saved}}


def _late_penalty_for(staff: dict, checkin_ist: datetime, tenant: Optional[dict] = None) -> tuple:
    """(minutes_late, fine ₹). Admin-configurable tiered fines after the grace window."""
    rules = _late_fine_rules(tenant)
    h, m = _parse_hhmm(staff.get("shift_start"), "10:00")
    start = checkin_ist.replace(hour=h, minute=m, second=0, microsecond=0)
    late_min = int((checkin_ist - start).total_seconds() // 60)
    grace = int(rules["grace_minutes"])
    if late_min <= grace:
        return max(late_min, 0), 0.0
    past = late_min - grace
    if past <= 5:
        fine = rules["fine_5"]
    elif past <= 10:
        fine = rules["fine_10"]
    elif past <= 15:
        fine = rules["fine_15"]
    else:
        fine = rules["fine_30"]
    return late_min, round(float(fine), 2)


class LateFineSettingsIn(BaseModel):
    grace_minutes: int = Field(10, ge=0, le=120)
    fine_5: float = Field(50, ge=0, le=100000)
    fine_10: float = Field(100, ge=0, le=100000)
    fine_15: float = Field(150, ge=0, le=100000)
    fine_30: float = Field(300, ge=0, le=100000)


@api.get("/settings/late-fines")
async def get_late_fine_settings(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return _late_fine_rules(t)


@api.put("/settings/late-fines")
async def save_late_fine_settings(body: LateFineSettingsIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    await db.tenants.update_one({"id": t["id"]}, {"$set": {"late_fines": body.model_dump()}})
    return body.model_dump()


# OT policy: every completed 30-min block past shift end earns ₹50 by default.
OT_BLOCK_MINUTES = 30
OT_BLOCK_PAY = 50.0
PRODUCT_COMMISSION_PCT = 2.0  # % of product price credited to the selling staff's salary


def _overtime_for(staff: dict, checkout_ist: datetime) -> tuple:
    """(overtime_hours, overtime_pay ₹) for time worked past shift_end.
    Paid per completed 30-min block: ₹50 default, or staff's hourly overtime_rate/2 if set."""
    h, m = _parse_hhmm(staff.get("shift_end"), "21:00")
    end = checkout_ist.replace(hour=h, minute=m, second=0, microsecond=0)
    if checkout_ist <= end:
        return 0.0, 0.0
    secs = (checkout_ist - end).total_seconds()
    hours = round(secs / 3600, 2)
    blocks = int(secs // (OT_BLOCK_MINUTES * 60))
    rate = float(staff.get("overtime_rate") or 0)
    per_block = rate / 2 if rate > 0 else OT_BLOCK_PAY
    return hours, round(blocks * per_block, 2)


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * 6371000.0 * math.asin(math.sqrt(a))


async def _auto_close_stale_attendance():
    """Close any shift still open after 12h (staff forgot to check out)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=AUTO_CHECKOUT_HOURS)).isoformat()
    stale = await db.attendance.find(
        {"check_out_at": None, "check_in_at": {"$ne": None, "$lt": cutoff}},
        {"_id": 0}).to_list(200)
    for rec in stale:
        try:
            ci = datetime.fromisoformat(rec["check_in_at"])
        except (ValueError, TypeError):
            continue
        co = ci + timedelta(hours=AUTO_CHECKOUT_HOURS)
        staff = await db.staff.find_one({"id": rec["staff_id"]}, {"_id": 0}) or {}
        ot_h, ot_pay = _overtime_for(staff, co.astimezone(IST_TZ))
        await db.attendance.update_one(
            {"id": rec["id"]},
            {"$set": {"check_out_at": co.isoformat(), "hours_worked": float(AUTO_CHECKOUT_HOURS),
                      "auto_checked_out": True, "overtime_hours": ot_h, "overtime_pay": ot_pay}})


class WaiveFineIn(BaseModel):
    note: str = Field("", max_length=200)


@api.post("/attendance/{rec_id}/waive-fine")
async def waive_late_fine(rec_id: str, body: WaiveFineIn, admin=Depends(require_tenant_admin), _pin=Depends(require_owner_pin)):
    """Correct a wrongly-applied late fine — zeroes the deduction, keeps an audit trail."""
    rec = await db.attendance.find_one({"id": rec_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Attendance record not found")
    fine = float(rec.get("late_penalty") or 0)
    if fine <= 0:
        raise HTTPException(400, "No fine on this record")
    await db.attendance.update_one({"id": rec_id}, {"$set": {
        "late_penalty": 0.0, "late_penalty_waived": fine,
        "waived_by": admin.get("email"), "waived_note": body.note.strip(),
        "waived_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "waived_amount": fine}


def _fence_for(staff: dict, tenant: dict):
    """(lat, lng, label) the staff must check in near — their branch first, else main salon."""
    if staff.get("branch"):
        for b in tenant.get("branches") or []:
            if b.get("name") == staff["branch"] and b.get("latitude") is not None and b.get("longitude") is not None:
                return b["latitude"], b["longitude"], b["name"]
    if tenant.get("latitude") is not None and tenant.get("longitude") is not None:
        return tenant["latitude"], tenant["longitude"], "the salon"
    return None, None, None


@api.post("/staff/me/check-in")
async def staff_check_in(body: Optional[GeoIn] = None, s=Depends(_current_staff), t=Depends(current_tenant)):
    """Geo-fenced check-in with automatic late-fine calculation. Idempotent."""
    await _auto_close_stale_attendance()
    geo = body or GeoIn()
    today = datetime.now(timezone.utc).date().isoformat()
    existing = await db.attendance.find_one({"staff_id": s["id"], "date": today}, {"_id": 0})
    if existing and existing.get("check_in_at"):
        return existing
    distance_m = None
    f_lat, f_lng, f_label = _fence_for(s, t)
    if f_lat is not None:
        if geo.lat is None or geo.lng is None:
            raise HTTPException(400, "Location required — please allow GPS access in your browser to check in.")
        distance_m = round(_haversine_m(geo.lat, geo.lng, f_lat, f_lng), 1)
        if distance_m > GEO_FENCE_M:
            raise HTTPException(403, f"You appear to be {int(distance_m)}m from {f_label}. Check-in is allowed only within {GEO_FENCE_M}m.")
    now = datetime.now(timezone.utc)
    late_min, penalty = _late_penalty_for(s, now.astimezone(IST_TZ), t)
    # Fines only for geo-verified, on-site check-ins. If the salon hasn't pinned
    # its GPS location yet, we record the time but never auto-fine.
    if distance_m is None:
        penalty = 0.0
    fields = {
        "check_in_at": now.isoformat(),
        "late_minutes": late_min, "late_penalty": penalty,
        "check_in_lat": geo.lat, "check_in_lng": geo.lng, "check_in_distance_m": distance_m,
    }
    if existing:
        await db.attendance.update_one(
            {"staff_id": s["id"], "date": today},
            {"$set": fields},
        )
    else:
        await db.attendance.insert_one({
            "id": str(uuid.uuid4()),
            "staff_id": s["id"],
            "staff_name": s.get("name"),
            "date": today,
            **fields,
            "check_out_at": None,
            "created_at": now.isoformat(),
        })
    return await db.attendance.find_one({"staff_id": s["id"], "date": today}, {"_id": 0})


@api.post("/staff/me/check-out")
async def staff_check_out(body: Optional[GeoIn] = None, s=Depends(_current_staff)):
    geo = body or GeoIn()
    today = datetime.now(timezone.utc).date().isoformat()
    rec = await db.attendance.find_one({"staff_id": s["id"], "date": today}, {"_id": 0})
    if not rec or not rec.get("check_in_at"):
        raise HTTPException(400, "You haven't checked in yet today.")
    if rec.get("check_out_at"):
        return rec  # idempotent
    now = datetime.now(timezone.utc)
    check_in = datetime.fromisoformat(rec["check_in_at"])
    hours = round((now - check_in).total_seconds() / 3600, 2)
    ot_h, ot_pay = _overtime_for(s, now.astimezone(IST_TZ))
    await db.attendance.update_one(
        {"staff_id": s["id"], "date": today},
        {"$set": {"check_out_at": now.isoformat(), "hours_worked": hours,
                  "overtime_hours": ot_h, "overtime_pay": ot_pay,
                  "check_out_lat": geo.lat, "check_out_lng": geo.lng}},
    )
    return await db.attendance.find_one({"staff_id": s["id"], "date": today}, {"_id": 0})


@api.get("/staff/me/attendance")
async def staff_my_attendance(month: Optional[str] = None, s=Depends(_current_staff)):
    """List attendance for `month=YYYY-MM` (defaults to current month)."""
    from calendar import monthrange
    await _auto_close_stale_attendance()
    now = datetime.now(timezone.utc)
    if month:
        try:
            y, m = map(int, month.split("-"))
            start = f"{y:04d}-{m:02d}-01"
            end_day = monthrange(y, m)[1]
            end = f"{y:04d}-{m:02d}-{end_day:02d}"
        except Exception:
            raise HTTPException(400, "month must be YYYY-MM")
    else:
        y, m = now.year, now.month
        start = f"{y:04d}-{m:02d}-01"
        end_day = monthrange(y, m)[1]
        end = f"{y:04d}-{m:02d}-{end_day:02d}"
    recs = await db.attendance.find(
        {"staff_id": s["id"], "date": {"$gte": start, "$lte": end}},
        {"_id": 0},
    ).sort("date", -1).to_list(200)
    today = now.date().isoformat()
    today_rec = next((r for r in recs if r.get("date") == today), None)
    total_hours = round(sum(float(r.get("hours_worked") or 0) for r in recs), 2)
    total_days = sum(1 for r in recs if r.get("check_in_at"))
    return {
        "month": f"{y:04d}-{m:02d}",
        "records": recs,
        "today": today_rec,
        "total_hours": total_hours,
        "total_days": total_days,
    }


# ---- Admin attendance oversight ----

def _roster_row(s: dict, rec: Optional[dict], now: datetime) -> dict:
    """One attendance-roster row: derive status/hours from the day's record."""
    status, hours = "absent", 0.0
    if rec and rec.get("check_in_at"):
        if rec.get("check_out_at"):
            status = "completed"
            hours = float(rec.get("hours_worked") or 0)
        else:
            status = "on_shift"
            try:
                hours = round((now - datetime.fromisoformat(rec["check_in_at"])).total_seconds() / 3600, 2)
            except Exception:
                hours = 0.0
    r = rec or {}
    return {
        "staff_id": s["id"],
        "name": s.get("name"),
        "role": s.get("role"),
        "image_url": s.get("image_url"),
        "phone": s.get("phone"),
        "has_login": bool(s.get("user_id")),
        "status": status,
        "check_in_at": r.get("check_in_at"),
        "check_out_at": r.get("check_out_at"),
        "hours": hours,
        "late_minutes": r.get("late_minutes") or 0,
        "late_penalty": r.get("late_penalty") or 0,
        "late_penalty_waived": r.get("late_penalty_waived") or 0,
        "record_id": r.get("id"),
        "branch": s.get("branch") or "",
        "overtime_hours": r.get("overtime_hours") or 0,
        "overtime_pay": r.get("overtime_pay") or 0,
        "auto_checked_out": bool(r.get("auto_checked_out")),
    }


@api.get("/attendance/today")
async def attendance_today(date: Optional[str] = None,
                           branch: Optional[str] = None,
                           _=Depends(require_tenant_admin)):
    """
    Roster for a given day (defaults to today).
    Returns EVERY active staff member with their current check-in/out state,
    so admin can see at a glance who is on-shift, who's finished, and who
    hasn't checked in yet.
    """
    day = (date or datetime.now(timezone.utc).date().isoformat()).strip()
    try:
        datetime.strptime(day, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "date must be YYYY-MM-DD")
    await _auto_close_stale_attendance()

    staff_q = {"active": True}
    if branch:
        staff_q["branch"] = branch
    staff_list = await db.staff.find(
        staff_q,
        {"_id": 0, "id": 1, "name": 1, "role": 1, "image_url": 1, "user_id": 1, "phone": 1, "branch": 1},
    ).sort("name", 1).to_list(500)
    att = await db.attendance.find({"date": day}, {"_id": 0}).to_list(500)
    att_by_sid = {a["staff_id"]: a for a in att}
    leaves = await db.leave_requests.find(
        {"status": "approved", "from_date": {"$lte": day}, "to_date": {"$gte": day}},
        {"_id": 0, "staff_id": 1}).to_list(300)
    on_leave_ids = {lv["staff_id"] for lv in leaves}

    roster = []
    now = datetime.now(timezone.utc)
    for s in staff_list:
        row = _roster_row(s, att_by_sid.get(s["id"]), now)
        if row["status"] == "absent" and s["id"] in on_leave_ids:
            row["status"] = "on_leave"
        roster.append(row)

    return {
        "date": day,
        "total_staff": len(staff_list),
        "on_shift": sum(1 for r in roster if r["status"] == "on_shift"),
        "completed": sum(1 for r in roster if r["status"] == "completed"),
        "absent": sum(1 for r in roster if r["status"] == "absent"),
        "on_leave": sum(1 for r in roster if r["status"] == "on_leave"),
        "roster": roster,
    }


@api.get("/attendance/staff/{sid}")
async def attendance_by_staff(sid: str, month: Optional[str] = None,
                              _=Depends(require_tenant_admin)):
    """Admin view: attendance history for a single staff member for a month."""
    from calendar import monthrange
    now = datetime.now(timezone.utc)
    if month:
        try:
            y, m = map(int, month.split("-"))
        except Exception:
            raise HTTPException(400, "month must be YYYY-MM")
    else:
        y, m = now.year, now.month
    start = f"{y:04d}-{m:02d}-01"
    end = f"{y:04d}-{m:02d}-{monthrange(y, m)[1]:02d}"
    staff = await db.staff.find_one({"id": sid}, {"_id": 0})
    if not staff:
        raise HTTPException(404, "Staff not found")
    recs = await db.attendance.find(
        {"staff_id": sid, "date": {"$gte": start, "$lte": end}},
        {"_id": 0},
    ).sort("date", -1).to_list(200)
    return {
        "staff": {"id": staff["id"], "name": staff.get("name"), "role": staff.get("role"),
                  "image_url": staff.get("image_url"), "phone": staff.get("phone")},
        "month": f"{y:04d}-{m:02d}",
        "records": recs,
        "days_present": sum(1 for r in recs if r.get("check_in_at")),
        "total_hours": round(sum(float(r.get("hours_worked") or 0) for r in recs), 2),
    }


def _staff_invoice_earnings(invs: list, staff_id: str) -> dict:
    """Earnings attributable to one staff member, split by item type."""
    out = {"gross": 0.0, "service_gross": 0.0, "service_count": 0, "product_gross": 0.0, "product_count": 0}
    for inv in invs:
        inv_staff = inv.get("staff_id")
        for it in inv.get("items", []):
            sid = it.get("staff_id") or inv_staff
            if sid != staff_id:
                continue
            qty = int(it.get("qty") or 1)
            line_total = qty * float(it.get("price") or 0)
            out["gross"] += line_total
            if it.get("type") == "service":
                out["service_gross"] += line_total
                out["service_count"] += qty
            elif it.get("type") == "product":
                out["product_gross"] += line_total
                out["product_count"] += qty
    return out


def _attendance_month_totals(recs: list) -> dict:
    return {
        "days_present": sum(1 for r in recs if r.get("check_in_at")),
        "total_hours": round(sum(float(r.get("hours_worked") or 0) for r in recs), 2),
        "overtime_hours_total": round(sum(float(r.get("overtime_hours") or 0) for r in recs), 2),
        "overtime_total": round(sum(float(r.get("overtime_pay") or 0) for r in recs), 2),
        "late_penalty_total": round(sum(float(r.get("late_penalty") or 0) for r in recs), 2),
        "late_days": sum(1 for r in recs if (r.get("late_penalty") or 0) > 0),
    }


async def _compute_salary_for_month(staff: dict, year: int, month: int, tenant: dict) -> dict:
    """Base + commission from services performed in this calendar month."""
    from calendar import monthrange
    end_day = monthrange(year, month)[1]
    start = f"{year:04d}-{month:02d}-01T00:00:00Z"
    end = f"{year:04d}-{month:02d}-{end_day:02d}T23:59:59Z"
    invs = await db.invoices.find(
        {"created_at": {"$gte": start, "$lte": end}},
        {"_id": 0},
    ).to_list(5000)
    pct = float(staff.get("commission_pct") or 0)
    earn = _staff_invoice_earnings(invs, staff["id"])
    gross, service_gross, service_count = earn["gross"], earn["service_gross"], earn["service_count"]
    commission = round(service_gross * pct / 100, 2)
    # Product sales commission (default 2% of product price; tenant can override)
    product_pct = float(tenant.get("product_commission_pct") or PRODUCT_COMMISSION_PCT)
    product_commission = round(earn["product_gross"] * product_pct / 100, 2)
    # Attendance
    att_start = f"{year:04d}-{month:02d}-01"
    att_end = f"{year:04d}-{month:02d}-{end_day:02d}"
    recs = await db.attendance.find(
        {"staff_id": staff["id"], "date": {"$gte": att_start, "$lte": att_end}},
        {"_id": 0},
    ).to_list(200)
    att = _attendance_month_totals(recs)
    adv_rows = await db.advances.find(
        {"staff_id": staff["id"], "month": f"{year:04d}-{month:02d}"}, {"_id": 0}).to_list(5)
    advance_total = round(sum(float(a.get("amount") or 0) for a in adv_rows), 2)
    base = float(staff.get("monthly_base_salary") or 0)
    deductions_total = round(att["late_penalty_total"] + advance_total, 2)
    total = round(base + commission + product_commission + att["overtime_total"] - deductions_total, 2)
    return {
        "period": f"{year:04d}-{month:02d}",
        "period_label": datetime(year, month, 1).strftime("%B %Y"),
        "staff": {
            "id": staff["id"], "name": staff.get("name"), "role": staff.get("role"),
            "email": staff.get("email"), "phone": staff.get("phone"),
            "joining_date": staff.get("joining_date"),
        },
        "salon": {
            "name": tenant.get("name"), "location": tenant.get("location"),
            "phone": tenant.get("phone"),
        },
        "monthly_base_salary": round(base, 2),
        "commission_pct": round(pct, 2),
        "service_gross": round(service_gross, 2),
        "service_count": service_count,
        "commission_amount": commission,
        "product_gross": round(earn["product_gross"], 2),
        "product_count": earn["product_count"],
        "product_commission_pct": round(product_pct, 2),
        "product_commission_amount": product_commission,
        **att,
        "advance_total": advance_total,
        "deductions_total": deductions_total,
        "gross_earnings": round(gross, 2),
        "net_payable": total,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _parse_month(month: Optional[str]) -> tuple:
    now = datetime.now(timezone.utc)
    if month:
        try:
            y, m = map(int, month.split("-"))
            if not (1 <= m <= 12) or y < 2000 or y > 2100:
                raise ValueError
        except Exception:
            raise HTTPException(400, "month must be YYYY-MM")
        return y, m
    return now.year, now.month


@api.get("/staff/me/salary-slip")
async def staff_my_salary_slip(month: Optional[str] = None,
                               s=Depends(_current_staff),
                               t=Depends(current_tenant)):
    """JSON salary summary for staff to preview before download."""
    if not s.get("salary_visible", True):
        raise HTTPException(403, "Salary details are not visible on your account. Please contact your salon admin.")
    y, m = _parse_month(month)
    return await _compute_salary_for_month(s, y, m, t)


@api.get("/staff/me/salary-slip.pdf")
async def staff_my_salary_slip_pdf(month: Optional[str] = None,
                                   s=Depends(_current_staff),
                                   t=Depends(current_tenant)):
    if not s.get("salary_visible", True):
        raise HTTPException(403, "Salary details are not visible on your account.")
    y, m = _parse_month(month)
    slip = await _compute_salary_for_month(s, y, m, t)
    pdf_bytes = _render_salary_slip_pdf(slip)
    fname = f"salary-slip-{slip['staff']['name'].replace(' ', '-').lower()}-{slip['period']}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )




# ---------------- Staff resume builder ----------------
RESUME_ROLE_PROMPTS = {
    "Beauty Expert": "As a Beauty Expert, I take complete care of every client — analysing their skin tone and skin type to recommend the best-suited facials and skincare products. I specialise in facials, clean-ups, de-tan treatments, hair spa and relaxing head massages, and I always guide clients on the right home-care routine so the results last longer.",
    "Nail Expert": "As a Nail Expert, I provide professional manicure, pedicure, nail-extension and nail-art services. I maintain strict hygiene and sterilisation standards, advise clients on nail health and after-care, and keep myself updated with the latest nail trends, shapes and techniques.",
    "Hair Expert": "As a Hair Expert, I handle haircuts, styling, blow-dry, colouring and hair treatments for both men and women. I study each client's face shape and hair texture to suggest the most flattering style, and I recommend the right products and routines to keep their hair healthy after every service.",
    "Manager": "As a Salon Manager, I oversee the complete daily operations — appointments, staff coordination, billing, inventory and client relationships. I focus on customer satisfaction, resolve escalations quickly, train and mentor junior staff, and consistently drive the salon's sales and service targets.",
    "Chemical Expert": "As a Chemical Expert, I specialise in advanced chemical services such as smoothening, keratin, botox, rebonding and global colouring. I carefully assess hair condition before every treatment, follow exact product ratios and safety protocols, and deliver zero-damage results with proper after-care guidance.",
}


class ResumePastJob(BaseModel):
    salon_name: str = Field("", max_length=120)
    from_date: str = Field("", max_length=30)
    to_date: str = Field("", max_length=30)
    phone: str = Field("", max_length=20)
    address: str = Field("", max_length=300)


class ResumeIn(BaseModel):
    total_experience_years: str = Field("", max_length=10)
    name: str = Field("", max_length=100)
    email: str = Field("", max_length=120)
    phone: str = Field("", max_length=20)
    current_address: str = Field("", max_length=300)
    permanent_address: str = Field("", max_length=300)
    photo_url: str = Field("", max_length=500)
    current_salon: str = Field("", max_length=150)
    currently_working: bool = True
    salon_phone: str = Field("", max_length=20)
    salon_address: str = Field("", max_length=300)
    designations: List[str] = Field(default_factory=list, max_length=5)
    responsibilities: Dict[str, str] = Field(default_factory=dict)
    past_jobs: List[ResumePastJob] = Field(default_factory=list, max_length=10)
    achievements: str = Field("", max_length=1500)
    hobbies: str = Field("", max_length=300)
    awards: str = Field("", max_length=1500)

    @field_validator("responsibilities")
    @classmethod
    def _cap_responsibilities(cls, v):
        if len(v) > 5:
            raise ValueError("too many responsibility entries")
        return {k[:50]: (val or "")[:1500] for k, val in v.items()}


def _resume_defaults(s: dict, t: dict) -> dict:
    years = ""
    if s.get("joining_date"):
        try:
            jd = datetime.fromisoformat(str(s["joining_date"])[:10])
            years = str(max(0, round((datetime.now() - jd).days / 365, 1)))
        except Exception:
            years = ""
    return {
        "total_experience_years": years,
        "name": s.get("name") or "",
        "email": s.get("email") or "",
        "phone": s.get("phone") or "",
        "current_address": "",
        "permanent_address": "",
        "photo_url": s.get("image_url") or "",
        "current_salon": t.get("name") or "",
        "currently_working": bool(s.get("active", True)),
        "salon_phone": t.get("phone") or "",
        "salon_address": t.get("location") or "",
        "designations": [],
        "responsibilities": {},
        "past_jobs": [],
        "achievements": "",
        "hobbies": "",
        "awards": "",
    }


@api.get("/staff/me/resume")
async def staff_my_resume(s=Depends(_current_staff), t=Depends(current_tenant)):
    saved = await db.staff_resumes.find_one({"staff_id": s["id"]}, {"_id": 0})
    data = saved or _resume_defaults(s, t)
    return {**data, "role_prompts": RESUME_ROLE_PROMPTS, "saved": bool(saved)}


@api.put("/staff/me/resume")
async def staff_save_resume(body: ResumeIn, s=Depends(_current_staff)):
    doc = body.model_dump()
    doc["designations"] = [d for d in doc["designations"] if d in RESUME_ROLE_PROMPTS]
    doc.update({"staff_id": s["id"], "updated_at": datetime.now(timezone.utc).isoformat()})
    await db.staff_resumes.update_one({"staff_id": s["id"]}, {"$set": doc}, upsert=True)
    return {"ok": True}


@api.get("/staff/me/resume.pdf")
async def staff_my_resume_pdf(s=Depends(_current_staff), t=Depends(current_tenant)):
    saved = await db.staff_resumes.find_one({"staff_id": s["id"]}, {"_id": 0})
    data = saved or _resume_defaults(s, t)
    if not (data.get("photo_url") or "").strip():
        data["photo_url"] = s.get("image_url") or ""
    # Internal upload URLs (/api/files/{id}) are read straight from object storage.
    purl = (data.get("photo_url") or "").strip()
    photo_bytes = None
    if purl.startswith("/api/files/"):
        rec = await _raw_db.uploads.find_one({"id": purl.rsplit("/", 1)[-1], "is_deleted": False})
        if rec and rec.get("tenant_id") == t["id"]:
            try:
                photo_bytes, _ = _get_object(rec["storage_path"])
            except Exception:
                photo_bytes = None
    fetcher = (lambda _u: photo_bytes) if photo_bytes else _safe_fetch_image_bytes
    pdf_bytes = await asyncio.to_thread(_render_resume_pdf, data, fetcher)
    fname = f"resume-{(data.get('name') or 'staff').replace(' ', '-').lower()}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


class BankDetailsIn(BaseModel):
    bank_name: str = Field("", max_length=100)
    ifsc: str = Field("", max_length=20)
    account_holder: str = Field("", max_length=100)


@api.put("/staff/me/bank-details")
async def staff_save_bank_details(body: BankDetailsIn, s=Depends(_current_staff)):
    """Staff self-service: save bank details (visible to salon admin for payouts)."""
    await db.staff.update_one({"id": s["id"]}, {"$set": {
        "bank_details": body.model_dump(),
        "bank_details_updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    return {"ok": True}


@api.post("/staff/me/photo")
async def staff_upload_photo(file: UploadFile = File(...), s=Depends(_current_staff), t=Depends(current_tenant)):
    """Staff self-service photo upload — updates their profile picture, which is
    shown on the admin Staff page and the public booking page."""
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    if ext not in _MIME:
        raise HTTPException(400, "Only JPG, PNG, GIF or WebP images are allowed")
    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Image too large — max {_MAX_UPLOAD_BYTES // (1024*1024)}MB")
    if not data:
        raise HTTPException(400, "Empty file")
    validate_image_bytes(ext, data)
    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/tenants/{t['id']}/staff/{file_id}.{ext}"
    try:
        result = _put_object(storage_path, data, _MIME[ext])
    except requests.HTTPError as e:
        raise HTTPException(400, f"Storage upload failed: {e}") from e
    await _raw_db.uploads.insert_one({
        "id": file_id, "tenant_id": t["id"], "kind": "staff",
        "storage_path": result.get("path", storage_path),
        "original_filename": file.filename or f"{file_id}.{ext}",
        "content_type": _MIME[ext], "size": len(data),
        "uploaded_by": s["id"], "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    public_url = f"/api/files/{file_id}"
    await db.staff.update_one({"id": s["id"]}, {"$set": {"image_url": public_url}})
    return {"url": public_url}


# ---------------- Vendors & morning briefing ----------------
class VendorIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field("", max_length=20)
    contact_person: str = Field("", max_length=100)
    gst_number: str = Field("", max_length=15)
    address: str = Field("", max_length=300)
    notes: str = Field("", max_length=300)

    @field_validator("gst_number")
    @classmethod
    def _gst_format(cls, v: str) -> str:
        v = v.strip().upper()
        if v and not re.fullmatch(r"[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]", v):
            raise ValueError("GST number must be 15 characters, e.g. 29ABCDE1234F1Z5")
        return v


@api.get("/vendors")
async def list_vendors(user=Depends(get_current_user)):
    return await db.vendors.find({}, {"_id": 0}).sort("name", 1).to_list(100)


@api.post("/vendors")
async def create_vendor(body: VendorIn, user=Depends(require_tenant_admin)):
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.vendors.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.put("/vendors/{vid}")
async def update_vendor(vid: str, body: VendorIn, user=Depends(require_tenant_admin)):
    res = await db.vendors.update_one({"id": vid}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Vendor not found")
    return await db.vendors.find_one({"id": vid}, {"_id": 0})


@api.delete("/vendors/{vid}")
async def delete_vendor(vid: str, user=Depends(require_tenant_admin)):
    await db.vendors.delete_one({"id": vid})
    return {"ok": True}


class VoiceGreetingIn(BaseModel):
    enabled: bool


@api.put("/settings/voice-greeting")
async def set_voice_greeting(body: VoiceGreetingIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    await db.tenants.update_one({"id": t["id"]}, {"$set": {"voice_greeting_enabled": body.enabled}})
    return {"enabled": body.enabled}


class BirthdayOfferIn(BaseModel):
    enabled: bool = True
    offer_text: str = Field("", max_length=200)


@api.get("/settings/birthday-offer")
async def get_birthday_offer(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return {"enabled": t.get("birthday_emails_enabled", True), "offer_text": t.get("birthday_offer_text") or ""}


@api.put("/settings/birthday-offer")
async def set_birthday_offer(body: BirthdayOfferIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    await db.tenants.update_one(
        {"id": t["id"]},
        {"$set": {"birthday_emails_enabled": body.enabled, "birthday_offer_text": body.offer_text.strip()}})
    return {"enabled": body.enabled, "offer_text": body.offer_text.strip()}


async def _run_birthday_emails(tenant_id: Optional[str] = None) -> dict:
    """Email birthday wishes to every guest whose dob is today (IST). Used by the
    daily scheduler AND the admin 'send now' button."""
    ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    mmdd = ist.strftime("%m-%d")
    flt = {"id": tenant_id} if tenant_id else {"status": {"$in": ["active", "trial"]}}
    tenants = await _raw_db.tenants.find(flt, {"_id": 0}).to_list(500)
    app_url = os.environ.get("APP_PUBLIC_URL", "https://miracurlunisexsaloon.com")
    results = []
    for t in tenants:
        if not tenant_id and t.get("birthday_emails_enabled") is False:
            continue
        custs = await _raw_db.customers.find(
            {"tenant_id": t["id"], "dob": {"$regex": f"-{mmdd}$"},
             "email": {"$exists": True, "$nin": [None, ""]}},
            {"_id": 0, "name": 1, "email": 1}).to_list(200)
        for c in custs:
            status = await _send_email(
                [c["email"]],
                f"🎂 Happy Birthday {c['name']} — from {t.get('name', 'your salon')} ✦",
                _birthday_email_html(t, c["name"], t.get("birthday_offer_text") or "",
                                     f"{app_url}/book/{t.get('slug', '')}"))
            results.append({"tenant": t["name"], "customer": c["name"], "email": c["email"],
                            "sent": status.get("sent", False), "error": status.get("error")})
    sent = sum(1 for r in results if r["sent"])
    return {"date": ist.strftime("%Y-%m-%d"), "sent": sent, "failed": len(results) - sent, "results": results}


@api.post("/crm/send-birthday-wishes")
async def send_birthday_wishes(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Admin manually triggers today's birthday emails for their salon."""
    out = await _run_birthday_emails(t["id"])
    if not out["results"]:
        return {**out, "message": "No guests with a birthday today (or missing email on their profile)."}
    return out


_TTS_CACHE: dict = {}  # (tenant_id, user_id) -> (date_str, payload) — 1 OpenAI call/user/day (SEC-003)


def _revenue_sentence(yesterday: float, last_week: float) -> str:
    if yesterday <= 0:
        return "Yesterday was quiet on the billing front — today is a fresh chance to shine. "
    s = f"Yesterday you brought in {_speak_amount(yesterday)} in revenue — great work! "
    if last_week > 0:
        pct = round((yesterday - last_week) / last_week * 100)
        if pct >= 5:
            s += f"That's {pct} percent up from the same day last week — you're on a roll! "
        elif pct <= -5:
            s += f"That's {abs(pct)} percent below the same day last week — let's bounce back today! "
    return s


async def _staff_today_status(day: str) -> dict:
    staff_list = await db.staff.find({"active": {"$ne": False}}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
    att = await db.attendance.find({"date": day}, {"_id": 0, "staff_id": 1}).to_list(300)
    checked = {a["staff_id"] for a in att}
    leaves = await db.leave_requests.find(
        {"status": "approved", "from_date": {"$lte": day}, "to_date": {"$gte": day}},
        {"_id": 0, "staff_id": 1}).to_list(100)
    on_leave = {lv["staff_id"] for lv in leaves}
    return {
        "checked_in": [s["name"] for s in staff_list if s["id"] in checked],
        "on_leave": [s["name"] for s in staff_list if s["id"] in on_leave and s["id"] not in checked],
        "not_checked_in": [s["name"] for s in staff_list if s["id"] not in checked and s["id"] not in on_leave],
    }


async def _briefing_notifications(today_str: str) -> dict:
    pend = await db.leave_requests.find(
        {"status": "pending"}, {"_id": 0, "staff_name": 1, "from_date": 1, "to_date": 1, "days": 1},
    ).sort("created_at", -1).to_list(20)
    new_bookings = await db.appointments.count_documents({"created_at": {"$regex": f"^{today_str}"}})
    new_reviews = await db.reviews.count_documents({"created_at": {"$regex": f"^{today_str}"}})
    return {"pending_leaves": pend, "new_bookings_today": new_bookings, "new_reviews_today": new_reviews}


def _joined(names: list, lang: str) -> str:
    if len(names) == 1:
        return names[0]
    sep = " और " if lang == "hi" else " and "
    return f"{', '.join(names[:-1])}{sep}{names[-1]}"


def _staff_sentence(staff_st: dict, lang: str) -> str:
    ci, ni, ol = len(staff_st["checked_in"]), len(staff_st["not_checked_in"]), staff_st["on_leave"]
    s = ""
    if lang == "hi":
        if ci:
            s += f"{ci} स्टाफ चेक-इन कर चुके हैं" + (f", {ni} अभी बाकी हैं। " if ni else "। ")
        elif ni:
            s += "टीम ने अभी चेक-इन नहीं किया है। "
        if ol:
            s += f"{_joined(ol, 'hi')} आज छुट्टी पर हैं। "
        return s
    if ci:
        s += f"{ci} of your team {'have' if ci != 1 else 'has'} checked in"
        s += f", {ni} {'are' if ni != 1 else 'is'} yet to arrive. " if ni else ". "
    elif ni:
        s += "None of your team has checked in yet. "
    if ol:
        s += f"{_joined(ol, 'en')} {'are' if len(ol) > 1 else 'is'} on approved leave today — plan the roster accordingly. "
    return s


def _notif_sentence(notif: dict, lang: str) -> str:
    s = ""
    pend = notif["pending_leaves"]
    names = [p["staff_name"] for p in pend if p.get("staff_name")]
    if lang == "hi":
        if pend:
            s += f"{len(pend)} छुट्टी की अर्ज़ी आपकी मंज़ूरी का इंतज़ार कर रही है — {_joined(names[:3], 'hi')} की तरफ़ से। "
        if notif["new_bookings_today"]:
            s += f"आज {notif['new_bookings_today']} नई बुकिंग आई हैं। "
        if notif["new_reviews_today"]:
            s += f"और {notif['new_reviews_today']} नया रिव्यू भी मिला है। "
        return s
    if pend:
        s += f"You have {len(pend)} leave request{'s' if len(pend) != 1 else ''} waiting for your approval — from {_joined(names[:3], 'en')}. "
    if notif["new_bookings_today"]:
        s += f"{notif['new_bookings_today']} new booking{'s' if notif['new_bookings_today'] != 1 else ''} came in today. "
    if notif["new_reviews_today"]:
        s += f"And you received {notif['new_reviews_today']} new review{'s' if notif['new_reviews_today'] != 1 else ''}. "
    return s


def _lowstock_sentence(low_count: int, has_vendor: bool, lang: str) -> str:
    if not low_count:
        return ""
    if lang == "hi":
        s = f"ध्यान दें — {low_count} प्रोडक्ट का स्टॉक कम हो रहा है। "
        if has_vendor:
            s += "क्या मैं रीस्टॉक लिस्ट वेंडर को मेल करूं या व्हाट्सएप पर भेजूं? बस बोलिए — मेल या व्हाट्सएप। "
        return s
    s = f"Heads up — {low_count} product{'s are' if low_count != 1 else ' is'} running low on stock. "
    if has_vendor:
        s += "Should I send the restock list to your vendor by mail, or on WhatsApp? Just say mail or WhatsApp. "
    return s


def _revenue_sentence_hi(rev: float, lastweek: float) -> str:
    if rev <= 0:
        return "कल बिलिंग शांत रही — आज एक नया मौका है। "
    s = f"कल आपने {int(round(rev))} रुपये की कमाई की — बहुत बढ़िया! "
    if lastweek > 0:
        pct = round((rev - lastweek) / lastweek * 100)
        if pct >= 5:
            s += f"यह पिछले हफ्ते के इसी दिन से {pct} प्रतिशत ज़्यादा है — शानदार! "
        elif pct <= -5:
            s += f"यह पिछले हफ्ते से {abs(pct)} प्रतिशत कम है — आज वापसी करते हैं! "
    return s


def _greeting_hi(ctx: dict) -> str:
    ist = ctx["ist"]
    hello = "सुप्रभात" if ist.hour < 12 else ("नमस्ते" if ist.hour < 17 else "शुभ संध्या")
    text = f"{hello} {ctx['name']} जी! {ctx['salon']} में आपका स्वागत है। "
    text += _revenue_sentence_hi(ctx["rev"], ctx["lastweek"])
    text += f"आज आपके पास {ctx['appts']} अपॉइंटमेंट हैं। " if ctx["appts"] else "आज कैलेंडर खाली है — वॉक-इन के लिए अच्छा दिन है। "
    text += _staff_sentence(ctx["staff_st"], "hi")
    text += _notif_sentence(ctx["notif"], "hi")
    text += _lowstock_sentence(ctx["low_count"], ctx["has_vendor"], "hi")
    if ist.hour < 12:
        text += "क्या मैं दिन की शुभ शुरुआत के लिए 30 मिनट भक्ति संगीत चला दूं? बस एंटरटेनमेंट टैब खोलिए। "
    return text + "आपका दिन शुभ हो!"


def _greeting_en(ctx: dict) -> str:
    ist = ctx["ist"]
    salutation = "Good morning" if ist.hour < 12 else ("Good afternoon" if ist.hour < 17 else "Good evening")
    text = f"Hey, {salutation} {ctx['name']}! Welcome back to {ctx['salon']}. "
    text += _revenue_sentence(ctx["rev"], ctx["lastweek"])
    appts = ctx["appts"]
    text += f"You have {appts} appointment{'s' if appts != 1 else ''} today. " if appts else "Your calendar is open today — a great day to bring in walk-ins. "
    text += _staff_sentence(ctx["staff_st"], "en")
    text += _notif_sentence(ctx["notif"], "en")
    text += _lowstock_sentence(ctx["low_count"], ctx["has_vendor"], "en")
    if ist.hour < 12:
        text += "Shall I play soothing Bhakti songs for 30 minutes to start the day on a divine note? Just open the Entertainment tab. "
    return text + "Have a wonderful day ahead!"


async def _build_greeting_text(user: dict, t: dict, ist: datetime, today_str: str, lang: str = "en") -> tuple:
    low_count = await db.products.count_documents({"stock": {"$lt": LOW_STOCK_LIMIT}})
    appts = await db.appointments.count_documents({"date": today_str})
    has_vendor = await db.vendors.count_documents({}) > 0
    staff_st = await _staff_today_status(today_str)
    notif = await _briefing_notifications(today_str)
    yesterday = await _revenue_for_day((ist - timedelta(days=1)).strftime("%Y-%m-%d"))
    last_week = await _revenue_for_day((ist - timedelta(days=8)).strftime("%Y-%m-%d"))
    ctx = {"ist": ist, "name": user.get("name") or "there", "salon": t.get("name") or "your salon",
           "rev": yesterday, "lastweek": last_week, "appts": appts, "staff_st": staff_st,
           "notif": notif, "low_count": low_count, "has_vendor": has_vendor}
    builder = _greeting_hi if lang == "hi" else _greeting_en
    return builder(ctx), bool(low_count and has_vendor)


async def _tts_cache_get(cache_key: tuple, today_str: str):
    """Two-tier TTS cache: in-memory, then Mongo (survives restarts)."""
    cached = _TTS_CACHE.get(cache_key)
    if cached and cached[0] == today_str:
        return cached[1]
    doc = await _raw_db.tts_cache.find_one(
        {"key": ":".join(cache_key), "date": today_str}, {"_id": 0, "payload": 1})
    if doc:
        _TTS_CACHE[cache_key] = (today_str, doc["payload"])
        return doc["payload"]
    return None


async def _tts_cache_put(cache_key: tuple, today_str: str, payload: dict):
    if len(_TTS_CACHE) > 2000:
        _TTS_CACHE.clear()
    _TTS_CACHE[cache_key] = (today_str, payload)
    await _raw_db.tts_cache.update_one(
        {"key": ":".join(cache_key)},
        {"$set": {"date": today_str, "payload": payload, "created_at": datetime.now(timezone.utc)}},
        upsert=True)


async def _tts_cached_speech(speech_text: str, *, voice: str = "shimmer", speed: float = 1.0) -> str:
    """Content-hash TTS cache in Mongo: identical spoken text is generated ONCE,
    then replayed free. TTL refresh on hit keeps popular clips alive."""
    from emergentintegrations.llm.openai import OpenAITextToSpeech
    h = hashlib.sha256(f"{voice}|{speed}|{speech_text}".encode()).hexdigest()
    key = f"speech:{h}"
    now = datetime.now(timezone.utc)
    doc = await _raw_db.tts_cache.find_one({"key": key}, {"_id": 0, "payload": 1})
    if doc:
        await _raw_db.tts_cache.update_one({"key": key}, {"$set": {"created_at": now}})
        return doc["payload"]["audio_b64"]
    tts = OpenAITextToSpeech(api_key=os.environ["EMERGENT_LLM_KEY"])
    audio_b64 = await tts.generate_speech_base64(text=speech_text, model="tts-1", voice=voice, speed=speed)
    await _raw_db.tts_cache.update_one(
        {"key": key},
        {"$set": {"payload": {"audio_b64": audio_b64}, "created_at": now}}, upsert=True)
    return audio_b64


@api.get("/reports/morning-briefing/audio")
async def morning_briefing_audio(lang: str = "en", user=Depends(get_current_user), t=Depends(current_tenant)):
    """Mira speaks the greeting aloud (OpenAI TTS, shimmer voice). lang: en | hi."""
    from emergentintegrations.llm.openai import OpenAITextToSpeech
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    lang = "hi" if lang == "hi" else "en"
    ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    today_str = ist.strftime("%Y-%m-%d")
    cache_key = (t["id"], user["id"], lang)
    hit = await _tts_cache_get(cache_key, today_str)
    if hit:
        return hit
    text, ask_restock = await _build_greeting_text(user, t, ist, today_str, lang)
    try:
        tts = OpenAITextToSpeech(api_key=key)
        audio_b64 = await tts.generate_speech_base64(text=text, model="tts-1", voice="shimmer", speed=0.97)
    except Exception as e:
        raise HTTPException(400, f"Voice generation failed: {e}")
    payload = {"audio_b64": audio_b64, "text": text, "ask_restock": ask_restock, "lang": lang}
    await _tts_cache_put(cache_key, today_str, payload)
    return payload


LOW_STOCK_LIMIT = 3


def _evening_en(ctx: dict) -> str:
    text = f"Good evening {ctx['name']}! The day at {ctx['salon']} is winding down. "
    if ctx["rev_today"] > 0:
        text += f"Today you served {ctx['bills']} bill{'s' if ctx['bills'] != 1 else ''} and brought in {_speak_amount(ctx['rev_today'])}. "
        if ctx["rev_yest"] > 0:
            text += ("That's ahead of yesterday — wonderful momentum! " if ctx["rev_today"] >= ctx["rev_yest"]
                     else f"Yesterday was {_speak_amount(ctx['rev_yest'])}, so tomorrow is a fresh chance to top it. ")
    else:
        text += "It was a quiet day on billing — tomorrow is a brand new canvas. "
    if ctx["top_staff"]:
        text += f"Today's star performer was {ctx['top_staff']} — do pass on a word of appreciation. "
    if ctx["tomorrow_appts"]:
        text += f"You already have {ctx['tomorrow_appts']} appointment{'s' if ctx['tomorrow_appts'] != 1 else ''} booked for tomorrow. "
    return text + "Great work today. Rest well — Mira will see you in the morning!"


def _evening_hi(ctx: dict) -> str:
    text = f"शुभ संध्या {ctx['name']} जी! {ctx['salon']} में आज का दिन पूरा होने वाला है। "
    if ctx["rev_today"] > 0:
        text += f"आज आपने {ctx['bills']} बिल बनाए और {_speak_amount(ctx['rev_today'])} की कमाई की। "
        if ctx["rev_yest"] > 0:
            text += ("यह कल से बेहतर है — शानदार! " if ctx["rev_today"] >= ctx["rev_yest"]
                     else "कल थोड़ा ज़्यादा था — कल फिर से मौका है। ")
    else:
        text += "आज बिलिंग शांत रही — कल एक नई शुरुआत है। "
    if ctx["top_staff"]:
        text += f"आज के स्टार परफ़ॉर्मर रहे {ctx['top_staff']} — उन्हें शाबाशी ज़रूर दें। "
    if ctx["tomorrow_appts"]:
        text += f"कल के लिए {ctx['tomorrow_appts']} अपॉइंटमेंट पहले से बुक हैं। "
    return text + "आज बहुत अच्छा काम किया। आराम कीजिए — मीरा सुबह फिर मिलेगी!"


async def _build_evening_text(user: dict, t: dict, ist: datetime, lang: str) -> str:
    today_str = ist.strftime("%Y-%m-%d")
    invs = await db.invoices.find({"created_at": {"$regex": f"^{today_str}"}}, {"_id": 0, "total": 1, "staff_name": 1}).to_list(2000)
    by_staff = {}
    for i in invs:
        if i.get("staff_name"):
            by_staff[i["staff_name"]] = by_staff.get(i["staff_name"], 0) + float(i.get("total") or 0)
    ctx = {
        "name": user.get("name") or "there",
        "salon": t.get("name") or "your salon",
        "rev_today": round(sum(float(i.get("total") or 0) for i in invs), 2),
        "rev_yest": await _revenue_for_day((ist - timedelta(days=1)).strftime("%Y-%m-%d")),
        "bills": len(invs),
        "top_staff": max(by_staff, key=by_staff.get) if by_staff else "",
        "tomorrow_appts": await db.appointments.count_documents({"date": (ist + timedelta(days=1)).strftime("%Y-%m-%d")}),
    }
    return _evening_hi(ctx) if lang == "hi" else _evening_en(ctx)


@api.get("/reports/evening-briefing/audio")
async def evening_briefing_audio(lang: str = "en", user=Depends(get_current_user), t=Depends(current_tenant)):
    """Evening Mira — closing-time reflection spoken aloud. lang: en | hi."""
    from emergentintegrations.llm.openai import OpenAITextToSpeech
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    lang = "hi" if lang == "hi" else "en"
    ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    today_str = ist.strftime("%Y-%m-%d")
    cache_key = (t["id"], user["id"], lang, "eve")
    hit = await _tts_cache_get(cache_key, today_str)
    if hit:
        return hit
    text = await _build_evening_text(user, t, ist, lang)
    try:
        tts = OpenAITextToSpeech(api_key=key)
        audio_b64 = await tts.generate_speech_base64(text=text, model="tts-1", voice="shimmer", speed=0.97)
    except Exception as e:
        raise HTTPException(400, f"Voice generation failed: {e}")
    payload = {"audio_b64": audio_b64, "text": text, "ask_restock": False, "lang": lang}
    await _tts_cache_put(cache_key, today_str, payload)
    return payload


async def _revenue_for_day(day_str: str) -> float:
    rows = await db.invoices.find({"created_at": {"$regex": f"^{day_str}"}}, {"_id": 0, "total": 1}).to_list(2000)
    return round(sum(float(r.get("total") or 0) for r in rows), 2)


def _speak_amount(amount: float) -> str:
    n = int(round(amount))
    if n >= 100000:
        lakhs = n / 100000
        return f"{lakhs:.1f}".rstrip("0").rstrip(".") + " lakh rupees"
    if n >= 1000:
        thousands = n / 1000
        return f"{thousands:.1f}".rstrip("0").rstrip(".") + " thousand rupees"
    return f"{n} rupees"


@api.get("/reports/morning-briefing")
async def morning_briefing(user=Depends(get_current_user), t=Depends(current_tenant)):
    """Mira's login greeting: time-of-day salutation + low-stock products (< 3)."""
    ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    salutation = "Good Morning" if ist.hour < 12 else ("Good Afternoon" if ist.hour < 17 else "Good Evening")
    low = await db.products.find(
        {"stock": {"$lt": LOW_STOCK_LIMIT}}, {"_id": 0, "id": 1, "name": 1, "brand": 1, "stock": 1, "sku": 1},
    ).sort("stock", 1).to_list(100)
    vendors = await db.vendors.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    today_appts = await db.appointments.count_documents({"date": ist.strftime("%Y-%m-%d")})
    yesterday_revenue = await _revenue_for_day((ist - timedelta(days=1)).strftime("%Y-%m-%d"))
    today_str = ist.strftime("%Y-%m-%d")
    staff_today = await _staff_today_status(today_str)
    notifications = await _briefing_notifications(today_str)
    return {
        "salutation": salutation,
        "yesterday_revenue": yesterday_revenue,
        "staff_today": staff_today,
        "notifications": notifications,
        "name": user.get("name") or t.get("name") or "there",
        "date_label": ist.strftime("%A, %d %B %Y"),
        "low_stock": low,
        "low_stock_limit": LOW_STOCK_LIMIT,
        "vendors": vendors,
        "today_appointments": today_appts,
        "voice_greeting_enabled": bool(t.get("voice_greeting_enabled")),
    }


class LowStockMailIn(BaseModel):
    vendor_id: str = Field(..., max_length=64)


def _restock_email(vendor: dict, items: list, t: dict) -> tuple:
    img = os.environ.get("RESTOCK_IMAGE_URL", "")
    img_row = (f'<tr><td style="padding:0"><img src="{img}" alt="Restock Alert" width="600" '
               f'style="display:block;width:100%;border-radius:16px 16px 0 0"/></td></tr>') if img else ""
    rows = "".join(
        f"<tr>"
        f"<td style='padding:12px 16px;border-bottom:1px solid #f1e8d8;color:#2b2b33;font-size:14px'>{p['name']}</td>"
        f"<td style='padding:12px 16px;border-bottom:1px solid #f1e8d8;color:#6b6b75;font-size:13px'>{p.get('brand') or '—'}</td>"
        f"<td style='padding:12px 16px;border-bottom:1px solid #f1e8d8;color:#6b6b75;font-size:13px;font-family:monospace'>{p.get('sku') or '—'}</td>"
        f"<td style='padding:12px 16px;border-bottom:1px solid #f1e8d8;text-align:center'>"
        f"<span style='display:inline-block;background:#fdecec;color:#dc2626;font-weight:bold;font-size:13px;padding:3px 12px;border-radius:999px'>{p['stock']} left</span></td></tr>"
        for p in items)
    html = f"""
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f14;padding:28px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;font-family:Georgia,'Times New Roman',serif;box-shadow:0 8px 40px rgba(212,175,55,.25)">
{img_row}
<tr><td style="background:linear-gradient(135deg,#17171f,#26202b);padding:26px 36px;text-align:center">
  <div style="color:#e6c66e;font-size:12px;letter-spacing:4px;text-transform:uppercase">✦ &nbsp;Inventory Alert&nbsp; ✦</div>
  <div style="color:#ffffff;font-size:26px;margin-top:8px">{t.get('name')}</div>
  <div style="color:#b9b0c4;font-size:13px;margin-top:6px;font-family:Arial,sans-serif">{len(items)} product{'s' if len(items) != 1 else ''} need restocking</div>
</td></tr>
<tr><td style="padding:30px 36px 8px">
  <p style="margin:0;color:#2b2b33;font-size:15px;font-family:Arial,sans-serif">Dear <b>{vendor.get('contact_person') or vendor['name']}</b>,</p>
  <p style="margin:12px 0 0;color:#55555f;font-size:14px;line-height:1.6;font-family:Arial,sans-serif">
    The following products are running low at our salon (below {LOW_STOCK_LIMIT} units).
    Kindly arrange a fresh supply at the earliest — details below:</p>
</td></tr>
<tr><td style="padding:18px 36px">
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f1e8d8;border-radius:12px;overflow:hidden">
    <tr style="background:#faf6ec">
      <th style="padding:12px 16px;text-align:left;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#a08a4b;font-family:Arial,sans-serif">Product</th>
      <th style="padding:12px 16px;text-align:left;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#a08a4b;font-family:Arial,sans-serif">Brand</th>
      <th style="padding:12px 16px;text-align:left;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#a08a4b;font-family:Arial,sans-serif">SKU</th>
      <th style="padding:12px 16px;text-align:center;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#a08a4b;font-family:Arial,sans-serif">Stock</th>
    </tr>
    {rows}
  </table>
</td></tr>
<tr><td style="padding:8px 36px 26px">
  <p style="margin:0;color:#55555f;font-size:14px;line-height:1.6;font-family:Arial,sans-serif">
    Please confirm availability and expected delivery timeline by replying to this email
    {f"or calling us at <b>{t.get('phone')}</b>" if t.get('phone') else ""}.</p>
</td></tr>
<tr><td style="background:#17171f;padding:22px 36px;text-align:center">
  <div style="color:#e6c66e;font-size:16px">✦ {t.get('name')} ✦</div>
  <div style="color:#8f8798;font-size:12px;margin-top:6px;font-family:Arial,sans-serif">{t.get('location') or ''}{(' · ' + t.get('phone')) if t.get('phone') else ''}</div>
  <div style="color:#5d5766;font-size:11px;margin-top:10px;font-family:Arial,sans-serif">Sent with ♥ by Mira — your salon's AI assistant</div>
</td></tr>
</table>
</td></tr></table>"""
    subject = f"✦ Restock request — {len(items)} products low at {t.get('name')}"
    return subject, html


def _vendor_items(low: list, vendor_id: str) -> list:
    """Vendor's tagged low items; if none are tagged to them, fall back to untagged items."""
    tagged = [p for p in low if p.get("vendor_id") == vendor_id]
    if tagged:
        return tagged
    return [p for p in low if not p.get("vendor_id")]


@api.post("/vendors/send-low-stock")
async def send_low_stock_email(body: LowStockMailIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    vendor = await db.vendors.find_one({"id": body.vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    low = await db.products.find(
        {"stock": {"$lt": LOW_STOCK_LIMIT}}, {"_id": 0, "name": 1, "brand": 1, "stock": 1, "sku": 1, "vendor_id": 1},
    ).sort("stock", 1).to_list(100)
    if not low:
        raise HTTPException(400, "No products are low on stock right now")
    items = _vendor_items(low, body.vendor_id)
    if not items:
        raise HTTPException(400, f"No low-stock products are assigned to {vendor['name']} (all are tagged to other vendors)")
    subject, html = _restock_email(vendor, items, t)
    result = await _send_email([vendor["email"]], subject, html)
    if not result.get("sent"):
        raise HTTPException(400, result.get("error") or "Email failed")
    return {"ok": True, "sent_to": vendor["email"], "products": len(items)}


@api.post("/vendors/send-low-stock-all")
async def send_low_stock_all(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Email every vendor only THEIR tagged low-stock products in one click."""
    low = await db.products.find(
        {"stock": {"$lt": LOW_STOCK_LIMIT}}, {"_id": 0, "name": 1, "brand": 1, "stock": 1, "sku": 1, "vendor_id": 1},
    ).sort("stock", 1).to_list(100)
    if not low:
        raise HTTPException(400, "No products are low on stock right now")
    vendors = await db.vendors.find({}, {"_id": 0}).to_list(100)
    if not vendors:
        raise HTTPException(400, "Add a vendor first")
    by_vendor = {v["id"]: v for v in vendors}
    sent, failed = [], []
    unassigned = sum(1 for p in low if not p.get("vendor_id") or p.get("vendor_id") not in by_vendor)
    for vid, vendor in by_vendor.items():
        items = [p for p in low if p.get("vendor_id") == vid]
        if not items:
            continue
        subject, html = _restock_email(vendor, items, t)
        result = await _send_email([vendor["email"]], subject, html)
        (sent if result.get("sent") else failed).append({"vendor": vendor["name"], "email": vendor["email"], "products": len(items)})
    if not sent and not failed:
        raise HTTPException(400, "No low-stock products are tagged to a vendor yet — set the Vendor field on products in Inventory")
    return {"ok": True, "sent": sent, "failed": failed, "unassigned_products": unassigned}


# ---------------- Products / Inventory ----------------

@api.get("/products")
async def list_products(user=Depends(get_current_user)):
    return await db.products.find({}, {"_id": 0}).to_list(500)

@api.post("/products")
async def create_product(body: ProductIn, user=Depends(get_current_user)):
    p = Product(**body.model_dump()).model_dump()
    await db.products.insert_one(p)
    return _clean(p)

@api.get("/products/export")
async def export_products_csv(user=Depends(require_tenant_admin)):
    rows = await db.products.find({}).sort("name", 1).to_list(2000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["name", "brand", "category", "sku", "price", "cost", "stock", "low_stock_threshold", "image_url"])
    for r in rows:
        _csv_row(w, [
            r.get("name", ""), r.get("brand", "") or "", r.get("category", ""), r.get("sku", ""),
            r.get("price", 0), r.get("cost", 0), r.get("stock", 0), r.get("low_stock_threshold", 5),
            r.get("image_url", "") or "",
        ])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=products.csv"})

def _product_doc_from_csv_row(raw: dict) -> Optional[dict]:
    """Parse one CSV row into a product doc. Returns None if the row is invalid."""
    row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
    name = row.get("name", "")
    if not name:
        return None
    try:
        price = float(row.get("price") or "")
        stock = int(float(row.get("stock") or 0))
        cost = float(row.get("cost") or 0)
        threshold = int(float(row.get("low_stock_threshold") or 5))
    except ValueError:
        return None
    sku = row.get("sku") or f"SKU-{re.sub(r'[^A-Za-z0-9]', '', name)[:12].upper()}"
    return {
        "name": name, "brand": row.get("brand", ""), "category": row.get("category") or "General",
        "sku": sku, "price": price, "cost": cost, "stock": stock,
        "low_stock_threshold": threshold, "image_url": row.get("image_url", ""),
    }


@api.post("/products/import")
async def import_products_csv(file: UploadFile = File(...), user=Depends(require_tenant_admin)):
    content = await _read_csv_upload(file)
    reader = csv.DictReader(io.StringIO(content))
    fields = {(f or "").strip().lower() for f in (reader.fieldnames or [])}
    if not {"name", "category", "price", "stock"}.issubset(fields):
        raise HTTPException(400, "CSV needs columns: name, category, price, stock (optional: brand, sku, cost, low_stock_threshold, image_url)")
    added = updated = skipped = 0
    for raw in reader:
        doc = _product_doc_from_csv_row(raw)
        if doc is None:
            skipped += 1
            continue
        existing = await db.products.find_one({"$or": [{"sku": doc["sku"]}, {"name": doc["name"]}]})
        if existing:
            await db.products.update_one({"id": existing["id"]}, {"$set": doc})
            updated += 1
        else:
            await db.products.insert_one(Product(**doc).model_dump())
            added += 1
    return {"added": added, "updated": updated, "skipped": skipped}

@api.put("/products/{pid}")
async def update_product(pid: str, body: ProductIn, user=Depends(get_current_user)):
    await db.products.update_one({"id": pid}, {"$set": body.model_dump()})
    return await db.products.find_one({"id": pid}, {"_id": 0})

@api.delete("/products/{pid}")
async def delete_product(pid: str, user=Depends(require_tenant_admin)):
    await db.products.delete_one({"id": pid})
    return {"ok": True}

# ---------------- Reviews ----------------
@api.get("/reviews")
async def list_reviews(user=Depends(get_current_user)):
    return await db.reviews.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)

class ReviewReplyIn(BaseModel):
    reply: str = Field(..., max_length=1000)


@api.post("/reviews/{rid}/suggest-reply")
async def suggest_review_reply(rid: str, user=Depends(require_admin), t=Depends(current_tenant)):
    """AI-drafted polite owner reply for a customer review."""
    rev = await db.reviews.find_one({"id": rid}, {"_id": 0})
    if not rev:
        raise HTTPException(404, "Review not found")
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    chat = LlmChat(
        api_key=key, session_id=f"review-reply-{rid}-{uuid.uuid4().hex[:8]}",
        system_message=(
            f"You write short, warm, professional owner replies to customer reviews for '{t.get('name')}', an Indian salon. "
            "Rules: 2-4 sentences max. Thank them by name if given. For 4-5 stars: express joy, invite them back. "
            "For 3 stars: thank + acknowledge there's room to improve. For 1-2 stars: apologise sincerely, promise to fix it, "
            "invite them to call the salon so you can make it right. No hashtags. At most one emoji. "
            "Reply with ONLY the reply text, nothing else."),
    ).with_model("openai", "gpt-4o-mini")
    prompt = f"Rating: {rev.get('rating')}/5\nCustomer: {rev.get('customer_name') or 'Guest'}\nReview: {rev.get('comment') or '(no comment, rating only)'}"
    try:
        resp = await chat.send_message(UserMessage(text=prompt))
        reply = (resp or "").strip()[:1000]
    except Exception as e:
        raise HTTPException(400, f"AI reply failed: {e}")
    return {"reply": reply}


@api.put("/reviews/{rid}/reply")
async def save_review_reply(rid: str, body: ReviewReplyIn, user=Depends(require_admin)):
    await db.reviews.update_one({"id": rid}, {"$set": {
        "owner_reply": body.reply.strip(),
        "owner_reply_at": datetime.now(timezone.utc).isoformat(),
    }})
    return await db.reviews.find_one({"id": rid}, {"_id": 0})


@api.put("/reviews/{rid}/moderate")
async def moderate_review(rid: str, body: ReviewModerateIn, user=Depends(require_admin)):
    await db.reviews.update_one({"id": rid}, {"$set": {"public": body.public}})
    return await db.reviews.find_one({"id": rid}, {"_id": 0})

@api.delete("/reviews/{rid}")
async def delete_review(rid: str, user=Depends(require_admin)):
    await db.reviews.delete_one({"id": rid})
    return {"ok": True}

@api.get("/public/review-info/{token}")
async def public_review_info(token: str):
    """Token = appointment_id. Returns appointment summary so the customer can confirm."""
    # No tenant context — find any appointment globally, then set tenant for follow-up ops
    appt = await _raw_db.appointments.find_one({"id": token}, {"_id": 0})
    if not appt:
        raise HTTPException(404, "Invalid review link")
    if appt.get("tenant_id"):
        _current_tenant_id.set(appt["tenant_id"])
    if appt.get("status") not in ("completed", "scheduled"):
        # Allow rating even if appointment isn't marked complete (some salons forget to mark)
        pass
    existing = await db.reviews.find_one({"appointment_id": token}, {"_id": 0})
    # Enrich with tenant branding so the public review page can white-label
    # correctly for each salon (Miracurl vs Elegance vs any future tenant).
    salon_name = None
    salon_location = None
    if appt.get("tenant_id"):
        t = await _raw_db.tenants.find_one({"id": appt["tenant_id"]}, {"_id": 0, "name": 1, "location": 1})
        if t:
            salon_name = t.get("name")
            salon_location = t.get("location")
    return {
        "customer_name": appt["customer_name"],
        "staff_name": appt.get("staff_name"),
        "service_names": appt.get("service_names", []),
        "scheduled_at": appt["scheduled_at"],
        "already_submitted": existing is not None,
        "existing_rating": existing.get("rating") if existing else None,
        "salon_name": salon_name,
        "salon_location": salon_location,
    }

@api.post("/public/review/{token}")
async def public_review(token: str, body: ReviewIn, request: Request):
    public_rate_limit(request, key_suffix="review", limit=10, window_sec=600)
    appt = await _raw_db.appointments.find_one({"id": token}, {"_id": 0})
    if not appt:
        raise HTTPException(404, "Invalid review link")
    if appt.get("tenant_id"):
        _current_tenant_id.set(appt["tenant_id"])
    if await db.reviews.find_one({"appointment_id": token}):
        raise HTTPException(400, "Review already submitted for this visit")

    # SEC-002: only reward if the guest has actually paid — an invoice linked to
    # this appointment OR any paid invoice for this customer. Prevents
    # "book fake → review fake → mint ₹50" farming loops.
    invoiced = await db.invoices.find_one(
        {"$or": [{"appointment_id": token}, {"customer_id": appt["customer_id"]}]},
        {"_id": 0, "id": 1})

    reward_code = None
    if body.rating >= 4 and invoiced:
        cust_now = await db.customers.find_one({"id": appt["customer_id"]}, {"_id": 0, "referral_credit": 1})
        current_credit = float((cust_now or {}).get("referral_credit") or 0)
        if current_credit < MAX_CUSTOMER_CREDIT:
            reward_code = f"THANKS-{secrets.token_urlsafe(3).upper().replace('_', 'X').replace('-', 'Y')[:5]}"
            await db.customers.update_one(
                {"id": appt["customer_id"]},
                {"$inc": {"referral_credit": REVIEW_REWARD_CREDIT}},
            )

    review = Review(
        appointment_id=token,
        customer_id=appt["customer_id"],
        customer_name=appt["customer_name"],
        staff_id=appt.get("staff_id"),
        staff_name=appt.get("staff_name"),
        rating=body.rating,
        comment=(body.comment or "").strip() or None,
        public=body.rating >= 4,  # auto-public for 4★+, admin can change
        reward_code=reward_code,
    ).model_dump()
    await db.reviews.insert_one(review)
    return {
        "ok": True,
        "review": _clean(review),
        "reward": {
            "code": reward_code,
            "credit": REVIEW_REWARD_CREDIT if reward_code else 0,
        } if reward_code else None,
    }

@api.get("/public/reviews/featured/{slug}")
async def public_featured_reviews(slug: str, limit: int = 6):
    await resolve_tenant_from_slug(slug)
    docs = await db.reviews.find(
        {"public": True, "rating": {"$gte": 4}},
        {"_id": 0, "customer_id": 0, "appointment_id": 0, "staff_id": 0, "reward_code": 0}
    ).sort("created_at", -1).to_list(limit)
    return docs

@api.get("/public/reviews/featured")
async def public_featured_reviews_default(limit: int = 6):
    return await public_featured_reviews(DEFAULT_TENANT_SLUG, limit)

from routes.reports import router as reports_router  # noqa: E402 — reports module (routes/reports.py)
api.include_router(reports_router)

# ---------------- Public (no auth) - Customer-facing booking ----------------


class PublicBookingIn(BaseModel):
    customer_name: str = Field(..., min_length=2, max_length=80)
    customer_phone: str
    customer_email: Optional[EmailStr] = None
    gender: Optional[str] = None
    service_ids: List[str] = Field(..., min_length=1)
    staff_id: Optional[str] = None
    scheduled_at: str
    notes: Optional[str] = Field(None, max_length=500)
    referral_code: Optional[str] = None
    coupon_code: Optional[str] = None

    @field_validator("customer_phone")
    @classmethod
    def _phone(cls, v):
        cleaned = "".join(c for c in v if c.isdigit())
        if not re.fullmatch(r"\d{7,15}", cleaned):
            raise ValueError("Enter a valid phone number (7-15 digits)")
        return cleaned

    @field_validator("scheduled_at")
    @classmethod
    def _when(cls, v):
        try:
            dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
        except Exception as e:
            raise ValueError("Invalid scheduled_at, must be ISO 8601") from e
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if dt < datetime.now(timezone.utc) - timedelta(minutes=5):
            raise ValueError("Pick a future time")
        # Business hours guard (local 10:00 – 21:00 — approximate; UTC-store assumed IST)
        ist = dt.astimezone(timezone(timedelta(hours=5, minutes=30)))
        if ist.hour < 10 or ist.hour >= 21:
            raise ValueError("Pick a slot between 10:00 AM and 9:00 PM")
        return dt.isoformat()

@api.get("/public/salons")
async def public_salons_search(q: str = "", limit: int = 20):
    limit = max(1, min(limit, 30))
    filt = {"status": {"$nin": ["suspended", "cancelled"]}}
    term = q.strip()
    if term:
        rx = {"$regex": re.escape(term), "$options": "i"}
        filt["$or"] = [{"name": rx}, {"location": rx}, {"slug": rx}]
    return await db.tenants.find(
        filt, {"_id": 0, "name": 1, "slug": 1, "location": 1, "hero_image": 1}
    ).sort("name", 1).to_list(limit)


@api.get("/public/salon/{slug}")
async def public_salon(slug: str):
    t = await resolve_tenant_from_slug(slug)
    return {
        "slug": t["slug"],
        "name": t.get("name"),
        "tagline": "Where elegance meets every strand",
        "location": t.get("location") or "Marathahalli, Bangalore",
        "phone": t.get("phone") or "+91 98765 00000",
        "hours": t.get("hours") or "Mon–Sun · 10:00 AM – 9:00 PM",
        "hero_image": t.get("hero_image") or "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1600",
        "referral_reward": REFERRAL_REWARD_REFERRER,
        "google_review_url": t.get("google_review_url") or "",
        "instagram_url": t.get("instagram_url") or "",
        "whatsapp_number": t.get("whatsapp_number") or "",
        "logo_url": t.get("logo_url") or "",
        "maps_url": t.get("maps_url") or "",
        "branches": t.get("branches", []),
    }

# Legacy /public/salon — falls back to default tenant for backward compatibility
@api.get("/public/salon")
async def public_salon_default():
    return await public_salon(DEFAULT_TENANT_SLUG)

@api.get("/public/services/{slug}")
async def public_services(slug: str):
    await resolve_tenant_from_slug(slug)
    return await db.services.find({"active": True}, {"_id": 0}).sort("category", 1).to_list(500)

@api.get("/public/services")
async def public_services_default():
    return await public_services(DEFAULT_TENANT_SLUG)

@api.get("/public/staff/{slug}")
async def public_staff(slug: str):
    await resolve_tenant_from_slug(slug)
    return await db.staff.find({"active": True}, {"_id": 0, "email": 0, "phone": 0, "commission_pct": 0}).to_list(500)

@api.get("/public/staff")
async def public_staff_default():
    return await public_staff(DEFAULT_TENANT_SLUG)

@api.get("/public/gallery/{slug}")
async def public_gallery(slug: str):
    await resolve_tenant_from_slug(slug)
    return await db.gallery.find({}, {"_id": 0}).sort("created_at", -1).to_list(24)

@api.get("/public/referral/{slug}/{code}")
async def public_referral(slug: str, code: str):
    await resolve_tenant_from_slug(slug)
    code = code.strip().upper()
    referrer = await db.customers.find_one({"referral_code": code}, {"_id": 0, "name": 1, "referral_code": 1})
    if not referrer:
        raise HTTPException(404, "Invalid referral code")
    return {
        "valid": True,
        "referrer_name": referrer["name"],
        "reward_referred": REFERRAL_REWARD_REFERRED,
        "reward_referrer": REFERRAL_REWARD_REFERRER,
    }

@api.get("/public/referral/{code}")
async def public_referral_default(code: str):
    return await public_referral(DEFAULT_TENANT_SLUG, code)

async def _staff_busy(staff_id: str, scheduled_at: str, duration_min: int) -> bool:
    """True if this stylist has an overlapping appointment."""
    try:
        start = datetime.fromisoformat(scheduled_at)
    except ValueError:
        return False
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    end = start + timedelta(minutes=duration_min or 30)
    date_prefix = start.astimezone(timezone(timedelta(hours=5, minutes=30))).date().isoformat()
    appts = await db.appointments.find(
        {"staff_id": staff_id, "scheduled_at": {"$regex": f"^{date_prefix}"}, "status": {"$nin": ["cancelled", "no_show"]}},
        {"_id": 0, "scheduled_at": 1, "duration_min": 1}).to_list(200)
    for a in appts:
        try:
            ast = datetime.fromisoformat(a["scheduled_at"])
        except ValueError:
            continue
        if ast.tzinfo is None:
            ast = ast.replace(tzinfo=timezone.utc)
        if ast < end and ast + timedelta(minutes=int(a.get("duration_min") or 30)) > start:
            return True
    return False


async def _resolve_staff(staff_id: Optional[str], scheduled_at: Optional[str] = None, duration_min: int = 30) -> dict:
    """Stylist-level slots: a chosen stylist must be free at the requested time;
    'Any stylist' is auto-assigned to a stylist who is actually free."""
    if staff_id:
        s = await db.staff.find_one({"id": staff_id, "active": True}, {"_id": 0})
        if s:
            if scheduled_at and await _staff_busy(s["id"], scheduled_at, duration_min):
                raise HTTPException(409, f"{s['name']} is already booked at that time — please pick another time or choose a different stylist.")
            return s
    candidates = await db.staff.find({"active": True}, {"_id": 0}).to_list(50)
    if not candidates:
        raise HTTPException(400, "No stylist available")
    if not scheduled_at:
        return candidates[0]
    for s in candidates:
        if not await _staff_busy(s["id"], scheduled_at, duration_min):
            return s
    raise HTTPException(409, "That time slot is fully booked — please pick another time.")


async def _resolve_or_create_customer(body: PublicBookingIn) -> tuple[dict, bool]:
    """Return (customer_doc, is_new). Back-fills referral_code if missing."""
    cust = await db.customers.find_one({"phone": body.customer_phone}, {"_id": 0})
    if cust is None:
        cust_doc = Customer(
            name=body.customer_name, phone=body.customer_phone, email=body.customer_email,
            gender=body.gender or "Other", crm_status="pending",
        ).model_dump()
        await db.customers.insert_one(cust_doc)
        return cust_doc, True
    # SEC-003: never overwrite a returning customer's saved name/email from an
    # unauthenticated public booking — a stranger could tamper with their record.
    if not cust.get("referral_code"):
        new_code = secrets.token_urlsafe(4).upper().replace("_", "X").replace("-", "Y")[:6]
        await db.customers.update_one({"id": cust["id"]}, {"$set": {"referral_code": new_code}})
        cust["referral_code"] = new_code
    cust.pop("_id", None)
    return cust, False


async def _apply_referral_credit(cust: dict, code: Optional[str]) -> Optional[dict]:
    """Welcome credit for the new customer is immediate; the REFERRER's reward is
    only released after the referred guest's first PAID invoice (SEC-001: prevents
    scripted fake bookings from farming wallet credit). Caps at MAX_CUSTOMER_CREDIT."""
    if not code:
        return None
    code = code.strip().upper()
    if code == cust.get("referral_code"):
        return None  # self-referral guard
    referrer = await db.customers.find_one({"referral_code": code}, {"_id": 0})
    if not referrer:
        return None
    ref_credit = float(referrer.get("referral_credit") or 0)
    cust_credit = float(cust.get("referral_credit") or 0)
    if ref_credit >= MAX_CUSTOMER_CREDIT or cust_credit >= MAX_CUSTOMER_CREDIT:
        return None  # cap reached — silently skip so the booking still succeeds
    await db.customers.update_one(
        {"id": cust["id"]},
        {"$set": {"referred_by": referrer["id"], "referral_pending": True},
         "$inc": {"referral_credit": REFERRAL_REWARD_REFERRED}},
    )
    cust["referral_credit"] = cust_credit + REFERRAL_REWARD_REFERRED
    return {"referrer_name": referrer["name"], "credit_added": REFERRAL_REWARD_REFERRED}


_SLOT_TIMES = ["10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
               "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
               "18:00", "18:30", "19:00", "19:30", "20:00", "20:30"]

async def _count_overlapping(start: datetime, end: datetime) -> int:
    date_prefix = start.astimezone(timezone(timedelta(hours=5, minutes=30))).date().isoformat()
    appts = await db.appointments.find(
        {"scheduled_at": {"$regex": f"^{date_prefix}"}, "status": {"$nin": ["cancelled", "no_show"]}},
        {"_id": 0, "scheduled_at": 1, "duration_min": 1}).to_list(500)
    busy = 0
    for a in appts:
        try:
            ast = datetime.fromisoformat(a["scheduled_at"])
        except ValueError:
            continue
        if ast.tzinfo is None:
            ast = ast.replace(tzinfo=timezone.utc)
        aen = ast + timedelta(minutes=int(a.get("duration_min") or 30))
        if ast < end and aen > start:
            busy += 1
    return busy

async def _ensure_slot_capacity(scheduled_at: str, duration_min: int):
    staff_count = await db.staff.count_documents({"active": True}) or 1
    start = datetime.fromisoformat(scheduled_at)
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    busy = await _count_overlapping(start, start + timedelta(minutes=duration_min or 30))
    if busy >= staff_count:
        raise HTTPException(409, "That time slot is fully booked — please pick another time.")


async def _create_public_appointment(cust: dict, staff: dict, services: list, body: PublicBookingIn) -> tuple[dict, float, int]:
    total = sum(s["price"] for s in services)
    duration = sum(s["duration_min"] for s in services) or 30
    await _ensure_slot_capacity(body.scheduled_at, duration)
    appt = Appointment(
        customer_id=cust["id"], customer_name=cust["name"],
        staff_id=staff["id"], staff_name=staff["name"],
        service_ids=[s["id"] for s in services],
        service_names=[s["name"] for s in services],
        scheduled_at=body.scheduled_at, duration_min=duration,
        notes=body.notes, total=total,
    ).model_dump()
    await db.appointments.insert_one(appt)
    appt.pop("_id", None)
    return appt, total, duration


@api.post("/public/book/{slug}")
async def public_book(slug: str, body: PublicBookingIn, request: Request):
    await resolve_tenant_from_slug(slug)
    public_rate_limit(request, key_suffix=f"book:{slug}", limit=8, window_sec=600)

    services = await db.services.find({"id": {"$in": body.service_ids}, "active": True}, {"_id": 0}).to_list(50)
    if not services:
        raise HTTPException(400, "Invalid services")

    staff = await _resolve_staff(body.staff_id, body.scheduled_at, sum(s["duration_min"] for s in services) or 30)
    coupon = await _validate_coupon(body.coupon_code)
    cust, is_new_customer = await _resolve_or_create_customer(body)
    referral_applied = await _apply_referral_credit(cust, body.referral_code) if is_new_customer else None
    appt, total, duration = await _create_public_appointment(cust, staff, services, body)

    coupon_discount = 0.0
    if coupon and await _consume_coupon(coupon):
        coupon_discount = _coupon_discount(coupon, total)
        await db.appointments.update_one(
            {"id": appt["id"]},
            {"$set": {"coupon_code": coupon["code"], "coupon_discount": coupon_discount, "total": total - coupon_discount}})
        appt.update({"coupon_code": coupon["code"], "coupon_discount": coupon_discount, "total": total - coupon_discount})
        total = total - coupon_discount

    return {
        "appointment": appt,
        "summary": {
            "customer_name": cust["name"],
            "customer_referral_code": cust.get("referral_code") if is_new_customer else None,
            "referral_credit": cust.get("referral_credit", 0) if is_new_customer else None,
            "staff_name": staff["name"],
            "service_names": [s["name"] for s in services],
            "total": total,
            "coupon_code": coupon["code"] if coupon else None,
            "coupon_discount": coupon_discount,
            "duration_min": duration,
            "scheduled_at": body.scheduled_at,
        },
        "referral_applied": referral_applied,
        "is_new_customer": is_new_customer,
    }

@api.post("/public/book")
async def public_book_default(body: PublicBookingIn, request: Request):
    return await public_book(DEFAULT_TENANT_SLUG, body, request)

# ---------------- Health ----------------
@api.get("/")
async def root():
    return {"app": "Miracurl Salon Management API", "status": "ok"}

# ---------------- Seed ----------------
SEED_SERVICES = [
    {"name": "Hair Cut - Women", "category": "Hair", "price": 600, "duration_min": 45, "trending": True,
     "image_url": "https://images.unsplash.com/photo-1634449571010-02389ed0f9b0?w=400"},
    {"name": "Hair Cut - Men", "category": "Hair", "price": 350, "duration_min": 30, "trending": True,
     "image_url": "https://images.unsplash.com/photo-1773863745081-582b4a9ec628?w=400"},
    {"name": "Hair Color - Global", "category": "Hair", "price": 2500, "duration_min": 120, "trending": False,
     "image_url": "https://images.unsplash.com/photo-1562322140-8baeececf3df?w=400"},
    {"name": "Keratin Treatment", "category": "Hair", "price": 4500, "duration_min": 180, "trending": True,
     "image_url": "https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=400"},
    {"name": "Classic Facial", "category": "Skin", "price": 1200, "duration_min": 60, "trending": False,
     "image_url": "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=400"},
    {"name": "Gold Facial", "category": "Skin", "price": 2200, "duration_min": 75, "trending": True,
     "image_url": "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=400"},
    {"name": "Manicure", "category": "Nails", "price": 500, "duration_min": 30, "trending": False,
     "image_url": "https://images.unsplash.com/photo-1632345031435-8727f6897d53?w=400"},
    {"name": "Pedicure Spa", "category": "Nails", "price": 900, "duration_min": 45, "trending": False,
     "image_url": "https://images.unsplash.com/photo-1610992015734-2ea4eea18cf6?w=400"},
    {"name": "Bridal Makeup", "category": "Makeup", "price": 8000, "duration_min": 120, "trending": True,
     "image_url": "https://images.unsplash.com/photo-1457972729786-0411a3b2b626?w=400"},
    {"name": "Threading", "category": "Threading", "price": 80, "duration_min": 10, "trending": False,
     "image_url": "https://images.unsplash.com/photo-1522337094846-8a818192de1f?w=400"},
]
SEED_STAFF = [
    {"name": "Priya Sharma", "role": "Senior Stylist", "phone": "9876500001", "email": "priya@miracurl.com",
     "specialties": ["Hair", "Color"], "commission_pct": 15,
     "image_url": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300"},
    {"name": "Rahul Verma", "role": "Barber", "phone": "9876500002", "email": "rahul@miracurl.com",
     "specialties": ["Hair", "Beard"], "commission_pct": 12,
     "image_url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300"},
    {"name": "Anjali Mehta", "role": "Beauty Therapist", "phone": "9876500003", "email": "anjali@miracurl.com",
     "specialties": ["Skin", "Makeup"], "commission_pct": 14,
     "image_url": "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=300"},
    {"name": "Karan Singh", "role": "Nail Artist", "phone": "9876500004", "email": "karan@miracurl.com",
     "specialties": ["Nails"], "commission_pct": 10,
     "image_url": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=300"},
]
SEED_PRODUCTS = [
    {"name": "Hydra Shampoo 500ml", "brand": "LOreal", "category": "Hair Care", "sku": "SH-001",
     "price": 850, "cost": 500, "stock": 24,
     "image_url": "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=300"},
    {"name": "Argan Oil Conditioner", "brand": "Moroccan", "category": "Hair Care", "sku": "CO-001",
     "price": 1100, "cost": 650, "stock": 18,
     "image_url": "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=300"},
    {"name": "Vitamin C Serum", "brand": "The Ordinary", "category": "Skin Care", "sku": "SR-001",
     "price": 1500, "cost": 800, "stock": 4,
     "image_url": "https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=300"},
    {"name": "Hair Spray Strong Hold", "brand": "Schwarzkopf", "category": "Styling", "sku": "ST-001",
     "price": 700, "cost": 400, "stock": 12,
     "image_url": "https://images.unsplash.com/photo-1631730486572-226d1f595b68?w=300"},
    {"name": "Nail Polish - Crimson", "brand": "OPI", "category": "Nails", "sku": "NP-001",
     "price": 450, "cost": 220, "stock": 30,
     "image_url": "https://images.unsplash.com/photo-1599948128020-9a44505b696d?w=300"},
    {"name": "Face Mask Sheet (10pk)", "brand": "Innisfree", "category": "Skin Care", "sku": "FM-001",
     "price": 600, "cost": 300, "stock": 3,
     "image_url": "https://images.unsplash.com/photo-1570554886111-e80fcca6a029?w=300"},
]
SEED_CUSTOMERS = [
    {"name": "Neha Kapoor", "phone": "9876123001", "email": "neha@example.com", "gender": "Female"},
    {"name": "Arjun Reddy", "phone": "9876123002", "email": "arjun@example.com", "gender": "Male"},
    {"name": "Meera Iyer", "phone": "9876123003", "email": "meera@example.com", "gender": "Female"},
    {"name": "Vikram Patel", "phone": "9876123004", "email": "vikram@example.com", "gender": "Male"},
    {"name": "Sneha Joshi", "phone": "9876123005", "email": "sneha@example.com", "gender": "Female"},
]

# ---------------- Tenant / Super-Admin endpoints ----------------
@api.get("/tenants/current")
async def get_current_tenant(t=Depends(current_tenant)):
    """The tenant the current authenticated user belongs to (or has switched into)."""
    return t


class TenantGeoIn(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    branch: Optional[str] = None   # pin a specific branch instead of the main salon


@api.put("/tenants/current/geo")
async def set_tenant_geo(body: TenantGeoIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Pin GPS for the main salon or a specific branch — staff check-in is geo-fenced to 200m."""
    if body.branch:
        res = await db.tenants.update_one(
            {"id": t["id"], "branches.name": body.branch},
            {"$set": {"branches.$.latitude": body.latitude, "branches.$.longitude": body.longitude}})
        if res.matched_count == 0:
            raise HTTPException(404, f"Branch '{body.branch}' not found")
    else:
        await db.tenants.update_one({"id": t["id"]}, {"$set": {
            "latitude": body.latitude, "longitude": body.longitude,
            "geo_set_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "latitude": body.latitude, "longitude": body.longitude, "branch": body.branch}


@api.delete("/tenants/current/geo")
async def clear_tenant_geo(branch: Optional[str] = None, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    if branch:
        await db.tenants.update_one(
            {"id": t["id"], "branches.name": branch},
            {"$unset": {"branches.$.latitude": "", "branches.$.longitude": ""}})
    else:
        await db.tenants.update_one({"id": t["id"]}, {"$unset": {"latitude": "", "longitude": ""}})
    return {"ok": True}


# ---------------- Branches (multi-location) ----------------
class BranchIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    address: str = Field(..., min_length=5, max_length=300)
    phone: str = Field("", max_length=20)
    maps_url: str = Field("", max_length=500)

    @field_validator("maps_url")
    @classmethod
    def _v_maps(cls, v):
        from urllib.parse import urlparse
        v = (v or "").strip()
        if v and urlparse(v).scheme not in ("http", "https"):
            raise ValueError("Maps link must be a valid http(s) URL")
        return v

@api.get("/branches")
async def list_branches(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return t.get("branches", [])

@api.post("/branches")
async def add_branch(body: BranchIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    branch = {"id": str(uuid.uuid4()), **body.model_dump()}
    await db.tenants.update_one({"id": t["id"]}, {"$push": {"branches": branch}})
    return branch

@api.put("/branches/{bid}")
async def update_branch(bid: str, body: BranchIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    res = await db.tenants.update_one(
        {"id": t["id"], "branches.id": bid},
        {"$set": {f"branches.$.{k}": v for k, v in body.model_dump().items()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Branch not found")
    return {"ok": True}

@api.delete("/branches/{bid}")
async def delete_branch(bid: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    await db.tenants.update_one({"id": t["id"]}, {"$pull": {"branches": {"id": bid}}})
    return {"ok": True}

# ---------------- Brand Studio (AI logo) ----------------
class LogoGenIn(BaseModel):
    style: str = Field("luxury gold minimal", max_length=200)

@api.post("/branding/logo/generate")
async def generate_logo(body: LogoGenIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    gen = OpenAIImageGeneration(api_key=key)
    prompt = (f"A premium circular logo emblem for a beauty salon named '{t.get('name', 'the salon')}'. "
              f"Style: {body.style}. Flat vector emblem, centered composition, elegant typography featuring the salon name, "
              f"scissors or beauty motif, solid deep charcoal background, gold accent palette, "
              f"high contrast, crisp edges, logo design only — no photo, no watermark, no mockup.")
    try:
        images = await gen.generate_images(prompt=prompt, model="gpt-image-1", number_of_images=1)
    except Exception as e:
        raise HTTPException(400, f"Logo generation failed: {e}")
    if not images:
        raise HTTPException(400, "No image was generated")
    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/tenants/{t['id']}/logo/{file_id}.png"
    try:
        result = _put_object(storage_path, images[0], "image/png")
    except requests.HTTPError as e:
        raise HTTPException(400, f"Storage upload failed: {e}") from e
    await _raw_db.uploads.insert_one({
        "id": file_id, "tenant_id": t["id"], "kind": "logo",
        "storage_path": result.get("path", storage_path),
        "original_filename": f"{file_id}.png", "content_type": "image/png",
        "size": len(images[0]), "uploaded_by": user["id"], "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True, "url": f"/api/files/{file_id}"}

class LogoApplyIn(BaseModel):
    url: str = Field("", max_length=500)

@api.post("/branding/logo/apply")
async def apply_logo(body: LogoApplyIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    url = body.url.strip()
    if url and not (url.startswith("/api/files/") or url.startswith("http")):
        raise HTTPException(400, "Invalid logo URL")
    await db.tenants.update_one({"id": t["id"]}, {"$set": {"logo_url": url}})
    return {"ok": True, "logo_url": url}


class TaxSettingsIn(BaseModel):
    tax_enabled: bool = False
    gst_number: Optional[str] = Field(None, max_length=20)
    gst_legal_name: Optional[str] = Field(None, max_length=120)
    tax_pct: float = Field(0.0, ge=0, le=100)

    @field_validator("gst_number")
    @classmethod
    def _gstin(cls, v):
        if v is None or v == "":
            return None
        import re as _re
        v = v.strip().upper()
        # GSTIN: 2-digit state code + 10-char PAN + entity code + Z + checksum
        if not _re.fullmatch(r"[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]", v):
            raise ValueError("Invalid GSTIN format (15 chars, e.g. 29ABCDE1234F1Z5)")
        return v


@api.get("/settings/tax")
async def get_tax_settings(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return {
        "tax_enabled": bool(t.get("tax_enabled", False)),
        "gst_number": t.get("gst_number") or "",
        "gst_legal_name": t.get("gst_legal_name") or "",
        "tax_pct": float(t.get("tax_pct") or 0.0),
    }


@api.put("/settings/tax")
async def update_tax_settings(body: TaxSettingsIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    # If owner wants to charge tax, they MUST provide GSTIN + rate > 0
    if body.tax_enabled:
        if not body.gst_number:
            raise HTTPException(400, "GST number is required to enable tax on invoices.")
        if body.tax_pct <= 0:
            raise HTTPException(400, "Tax % must be greater than 0 when tax is enabled.")
    update = {
        "tax_enabled": bool(body.tax_enabled),
        "gst_number": body.gst_number,
        "gst_legal_name": (body.gst_legal_name or "").strip() or None,
        "tax_pct": float(body.tax_pct or 0),
    }
    await db.tenants.update_one({"id": t["id"]}, {"$set": update})
    return {"ok": True, **update}


@api.get("/settings/affiliate")
async def get_affiliate_summary(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Returns the salon's referral link, earned credits, and list of referred salons."""
    cursor = db.affiliate_referrals.find(
        {"referrer_tenant_id": t["id"]}, {"_id": 0}
    ).sort("created_at", -1)
    referrals = await cursor.to_list(200)
    return {
        "slug": t["slug"],
        "credits": float(t.get("affiliate_credits") or 0),
        "reward_per_signup": AFFILIATE_REWARD_INR,
        "referrals": referrals,
        "count": len(referrals),
    }


class BrandingIn(BaseModel):
    google_review_url: Optional[str] = Field(None, max_length=2000)
    maps_url: Optional[str] = Field(None, max_length=500)
    hours: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=40)
    location: Optional[str] = Field(None, max_length=500)
    hero_image: Optional[str] = Field(None, max_length=2000)
    instagram_url: Optional[str] = Field(None, max_length=500)
    whatsapp_number: Optional[str] = Field(None, max_length=20)

    @field_validator("maps_url")
    @classmethod
    def _v_maps_url(cls, v):
        if v is None or v == "":
            return ""
        v = v.strip()
        if urlparse(v).scheme not in ("http", "https"):
            raise ValueError("Maps link must be a valid http(s) URL")
        return v

    @field_validator("google_review_url", "instagram_url")
    @classmethod
    def _https_url(cls, v):
        if v is None or v == "":
            return ""
        v = v.strip()
        # Users routinely type "instagram.com/foo" or "www.instagram.com/foo" —
        # be lenient and auto-prepend https:// so a save never fails on a link.
        if v.startswith("http://"):
            v = "https://" + v[len("http://"):]
        elif not v.startswith("https://"):
            v = "https://" + v.lstrip("/")
        return v

    @field_validator("whatsapp_number")
    @classmethod
    def _wa_number(cls, v):
        if v is None or v == "":
            return ""
        import re as _re
        digits = _re.sub(r"\D", "", v)
        # Auto-prepend India country code if user typed a bare 10-digit mobile
        # (the far most common salon-owner input). Anything else gets validated
        # against the E.164 10–15 digit range.
        if len(digits) == 10:
            digits = "91" + digits
        if not (10 <= len(digits) <= 15):
            raise ValueError("WhatsApp number must have 10–15 digits (with country code, e.g. 91XXXXXXXXXX)")
        return digits


@api.get("/settings/branding")
async def get_branding(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return {
        "name": t.get("name", ""),
        "slug": t.get("slug", ""),
        "google_review_url": t.get("google_review_url") or "",
        "hours": t.get("hours") or "",
        "phone": t.get("phone") or "",
        "location": t.get("location") or "",
        "hero_image": t.get("hero_image") or "",
        "instagram_url": t.get("instagram_url") or "",
        "whatsapp_number": t.get("whatsapp_number") or "",
    }


@api.put("/settings/branding")
async def update_branding(body: BrandingIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    update = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not update:
        return {"ok": True}
    await db.tenants.update_one({"id": t["id"]}, {"$set": update})
    return {"ok": True, **update}


@api.get("/dashboard/reminders")
async def upcoming_reminders(user=Depends(require_tenant_admin)):
    """Appointments in the next 24 hours that the salon admin can WhatsApp a reminder for."""
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(hours=26)  # small buffer so 'tomorrow same time' still appears
    cursor = db.appointments.find(
        {
            "status": {"$in": ["scheduled", "booked", "confirmed"]},
            "scheduled_at": {
                "$gte": now.isoformat(),
                "$lte": horizon.isoformat(),
            },
        },
        {"_id": 0},
    ).sort("scheduled_at", 1)
    appts = await cursor.to_list(50)
    # Hydrate customer phone numbers
    cust_ids = list({a["customer_id"] for a in appts})
    custs = await db.customers.find({"id": {"$in": cust_ids}}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(len(cust_ids) or 1)
    by_id = {c["id"]: c for c in custs}
    out = []
    for a in appts:
        c = by_id.get(a["customer_id"], {})
        if not c.get("phone"):
            continue
        out.append({
            "appointment_id": a["id"],
            "customer_id": a["customer_id"],
            "customer_name": c.get("name", a.get("customer_name", "")),
            "customer_phone": c["phone"],
            "scheduled_at": a["scheduled_at"],
            "staff_name": a.get("staff_name") or "",
            "service_names": a.get("service_names", []),
            "reminded": bool(a.get("reminder_sent_at")),
        })
    return {"count": len(out), "items": out}


@api.post("/dashboard/reminders/{aid}/mark-sent")
async def mark_reminder_sent(aid: str, user=Depends(require_tenant_admin)):
    """Owner clicked the WhatsApp button — flag the appointment so it stops showing in the list."""
    res = await db.appointments.update_one(
        {"id": aid},
        {"$set": {"reminder_sent_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Appointment not found")
    return {"ok": True}


@api.get("/super-admin/affiliates/leaderboard")
async def affiliate_leaderboard(user=Depends(require_super_admin), limit: int = 25):
    """Top tenants by total affiliate credits earned through referrals."""
    cursor = db.tenants.find(
        {"affiliate_credits": {"$gt": 0}},
        {"_id": 0, "id": 1, "slug": 1, "name": 1, "owner_email": 1, "affiliate_credits": 1},
    ).sort("affiliate_credits", -1).limit(int(limit))
    rows = await cursor.to_list(limit)
    # Attach signup counts in a single query
    ids = [r["id"] for r in rows]
    pipeline = [
        {"$match": {"referrer_tenant_id": {"$in": ids}}},
        {"$group": {"_id": "$referrer_tenant_id", "count": {"$sum": 1}}},
    ]
    counts = {x["_id"]: x["count"] async for x in db.affiliate_referrals.aggregate(pipeline)}
    for r in rows:
        r["referral_count"] = counts.get(r["id"], 0)
        r["affiliate_credits"] = float(r.get("affiliate_credits") or 0)
    return {"items": rows, "reward_per_signup": AFFILIATE_REWARD_INR}


@api.get("/super-admin/hq-messages")
async def hq_messages(user=Depends(require_super_admin)):
    items = await _raw_db.hq_messages.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    unread = await _raw_db.hq_messages.count_documents({"read": {"$ne": True}})
    return {"items": items, "unread": unread}


@api.patch("/super-admin/hq-messages/{mid}/read")
async def hq_message_read(mid: str, user=Depends(require_super_admin)):
    await _raw_db.hq_messages.update_one({"id": mid}, {"$set": {"read": True}})
    return {"ok": True}


async def _tenant_month_stats(tid: str, start: str, end: str) -> dict:
    invs = await _raw_db.invoices.find(
        {"tenant_id": tid, "paid": True, "created_at": {"$gte": start, "$lt": end}}, {"_id": 0}).to_list(3000)
    revenue = sum(i["total"] for i in invs)
    by_svc, by_staff = {}, {}
    weekly = [0.0, 0.0, 0.0, 0.0, 0.0]  # days 1-7, 8-14, 15-21, 22-28, 29+
    for i in invs:
        for it in i.get("items", []):
            by_svc[it["name"]] = by_svc.get(it["name"], 0) + it["price"] * it.get("qty", 1)
        if i.get("staff_name"):
            by_staff[i["staff_name"]] = by_staff.get(i["staff_name"], 0) + i["total"]
        try:
            day = int(str(i.get("created_at", ""))[8:10])
            weekly[min((day - 1) // 7, 4)] += float(i.get("total") or 0)
        except (ValueError, IndexError):
            pass
    prev_start_dt = (datetime.strptime(start, "%Y-%m-%d") - timedelta(days=1)).replace(day=1)
    prev_invs = await _raw_db.invoices.find(
        {"tenant_id": tid, "paid": True,
         "created_at": {"$gte": prev_start_dt.strftime("%Y-%m-%d"), "$lt": start}},
        {"_id": 0, "total": 1}).to_list(3000)
    prev_revenue = sum(float(i.get("total") or 0) for i in prev_invs)
    return {
        "revenue": revenue,
        "prev_revenue": prev_revenue,
        "weekly": weekly,
        "invoices": len(invs),
        "avg_bill": revenue / len(invs) if invs else 0,
        "new_customers": await _raw_db.customers.count_documents(
            {"tenant_id": tid, "created_at": {"$gte": start, "$lt": end}}),
        "appointments": await _raw_db.appointments.count_documents(
            {"tenant_id": tid, "scheduled_at": {"$gte": start, "$lt": end}}),
        "top_services": sorted(by_svc.items(), key=lambda x: -x[1])[:3],
        "top_staff": sorted(by_staff.items(), key=lambda x: -x[1])[:3],
    }


class MonthlyReportIn(BaseModel):
    tenant_id: Optional[str] = None   # None = all active/trial tenants


async def _run_monthly_reports(tenant_id: Optional[str] = None) -> dict:
    """Email last month's business report. Used by the super-admin button AND the 1st-of-month auto-scheduler."""
    now = datetime.now(timezone.utc)
    first_this = now.replace(day=1)
    last_month_end = first_this.strftime("%Y-%m-%d")
    last_month_start = (first_this - timedelta(days=1)).replace(day=1)
    start = last_month_start.strftime("%Y-%m-%d")
    month_label = last_month_start.strftime("%B %Y")
    flt = {"id": tenant_id} if tenant_id else {"status": {"$in": ["active", "trial"]}}
    tenants = await db.tenants.find(flt, {"_id": 0}).to_list(500)
    if not tenants:
        return {"month": month_label, "sent": 0, "failed": 0, "results": []}
    results = []
    for t in tenants:
        recipients = [e for e in {t.get("owner_email"), t.get("salon_email")} if e]
        if not recipients:
            results.append({"tenant": t["name"], "sent": False, "error": "no email on file"})
            continue
        stats = await _tenant_month_stats(t["id"], start, last_month_end)
        status = await _send_email(
            recipients,
            f"✦ Your Miracurl monthly report — {month_label}",
            _monthly_report_html(t, month_label, stats))
        results.append({"tenant": t["name"], "recipients": recipients,
                        "sent": status.get("sent", False), "error": status.get("error")})
    sent = sum(1 for r in results if r["sent"])
    return {"month": month_label, "sent": sent, "failed": len(results) - sent, "results": results}


async def _tenant_week_stats(tid: str, start: str, end: str) -> dict:
    """Stats for one Mon–Sun week [start, end). daily[7] indexed Mon..Sun."""
    invs = await _raw_db.invoices.find(
        {"tenant_id": tid, "paid": True, "created_at": {"$gte": start, "$lt": end}}, {"_id": 0}).to_list(3000)
    revenue = sum(float(i.get("total") or 0) for i in invs)
    start_dt = datetime.strptime(start, "%Y-%m-%d")
    daily = [0.0] * 7
    by_svc, by_staff = {}, {}
    for i in invs:
        for it in i.get("items", []):
            by_svc[it["name"]] = by_svc.get(it["name"], 0) + it["price"] * it.get("qty", 1)
        if i.get("staff_name"):
            by_staff[i["staff_name"]] = by_staff.get(i["staff_name"], 0) + float(i.get("total") or 0)
        try:
            idx = (datetime.strptime(str(i.get("created_at", ""))[:10], "%Y-%m-%d") - start_dt).days
            if 0 <= idx <= 6:
                daily[idx] += float(i.get("total") or 0)
        except ValueError:
            pass
    prev_start = (start_dt - timedelta(days=7)).strftime("%Y-%m-%d")
    prev_invs = await _raw_db.invoices.find(
        {"tenant_id": tid, "paid": True, "created_at": {"$gte": prev_start, "$lt": start}},
        {"_id": 0, "total": 1}).to_list(3000)
    return {
        "revenue": revenue,
        "prev_revenue": sum(float(i.get("total") or 0) for i in prev_invs),
        "daily": daily,
        "invoices": len(invs),
        "avg_bill": revenue / len(invs) if invs else 0,
        "new_customers": await _raw_db.customers.count_documents(
            {"tenant_id": tid, "created_at": {"$gte": start, "$lt": end}}),
        "top_services": sorted(by_svc.items(), key=lambda x: -x[1])[:3],
        "top_staff": sorted(by_staff.items(), key=lambda x: -x[1])[:3],
    }


_WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _rule_based_tip(stats: dict) -> str:
    daily = stats.get("daily") or []
    if not daily or max(daily) <= 0:
        return "A quiet week — try sharing your online booking link on WhatsApp status to fill next week's slots."
    best = _WEEK_DAYS[daily.index(max(daily))]
    positive = [d for d in daily if d > 0]
    worst_val = min(positive) if positive else 0
    worst = _WEEK_DAYS[daily.index(worst_val)] if positive else ""
    tip = f"{best} was your strongest day"
    if worst and worst != best:
        tip += f" — consider a {worst} happy-hour offer to fill the quieter slot."
    else:
        tip += " — keep that momentum going with a repeat-visit offer."
    return tip


async def _weekly_tip(t: dict, stats: dict) -> str:
    """One AI-written actionable tip for the weekly email; rule-based fallback."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        return _rule_based_tip(stats)
    daily = stats.get("daily") or []
    day_summary = ", ".join(f"{_WEEK_DAYS[i]} ₹{v:,.0f}" for i, v in enumerate(daily[:7]))
    top_svc = stats["top_services"][0][0] if stats.get("top_services") else "n/a"
    try:
        chat = LlmChat(
            api_key=key, session_id=f"weekly-tip-{t['id']}-{uuid.uuid4().hex[:6]}",
            system_message=("You write ONE actionable business tip (max 30 words, no emojis, no preamble) "
                            "for an Indian salon owner based on their weekly numbers. Be specific and practical."),
        ).with_model("openai", "gpt-5.4-mini")
        resp = await chat.send_message(UserMessage(text=(
            f"Week revenue ₹{stats['revenue']:,.0f} (previous week ₹{stats.get('prev_revenue', 0):,.0f}), "
            f"{stats['invoices']} bills, {stats['new_customers']} new guests, top service: {top_svc}. "
            f"Day-wise: {day_summary}. Give one tip.")))
        tip = (resp or "").strip().strip('"')
        return tip if 10 < len(tip) < 260 else _rule_based_tip(stats)
    except Exception as e:
        logging.warning(f"weekly tip LLM failed, using fallback: {e}")
        return _rule_based_tip(stats)


async def _run_weekly_reports(tenant_id: Optional[str] = None) -> dict:
    """Email last completed Mon–Sun week's snapshot. Used by the super-admin button AND the Monday auto-scheduler."""
    ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    this_monday = (ist - timedelta(days=ist.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    start_dt = this_monday - timedelta(days=7)
    start = start_dt.strftime("%Y-%m-%d")
    end = this_monday.strftime("%Y-%m-%d")
    week_label = f"{start_dt.strftime('%d %b')} – {(this_monday - timedelta(days=1)).strftime('%d %b %Y')}"
    flt = {"id": tenant_id} if tenant_id else {"status": {"$in": ["active", "trial"]}}
    tenants = await db.tenants.find(flt, {"_id": 0}).to_list(500)
    results = []
    for t in tenants:
        recipients = [e for e in {t.get("owner_email"), t.get("salon_email")} if e]
        if not recipients:
            results.append({"tenant": t["name"], "sent": False, "error": "no email on file"})
            continue
        stats = await _tenant_week_stats(t["id"], start, end)
        tip = await _weekly_tip(t, stats)
        status = await _send_email(
            recipients,
            f"✦ Your Miracurl weekly snapshot — {week_label}",
            _weekly_report_html(t, week_label, stats, tip))
        results.append({"tenant": t["name"], "recipients": recipients,
                        "sent": status.get("sent", False), "error": status.get("error")})
    sent = sum(1 for r in results if r["sent"])
    return {"week": week_label, "sent": sent, "failed": len(results) - sent, "results": results}


@api.post("/super-admin/send-weekly-report")
async def send_weekly_report(body: MonthlyReportIn, user=Depends(require_super_admin)):
    out = await _run_weekly_reports(body.tenant_id)
    if not out["results"]:
        raise HTTPException(404, "No matching salons")
    return out


@api.post("/super-admin/send-monthly-report")
async def send_monthly_report(body: MonthlyReportIn, user=Depends(require_super_admin)):
    out = await _run_monthly_reports(body.tenant_id)
    if not out["results"]:
        raise HTTPException(404, "No matching salons")
    return out


@api.get("/super-admin/tenants")
async def list_tenants(user=Depends(require_super_admin)):
    tenants = await db.tenants.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Salons-per-owner-email count (multi-salon owners)
    owners = await db.users.find(
        {"role": "admin", "email": {"$in": list({t.get("owner_email") for t in tenants if t.get("owner_email")})}},
        {"_id": 0, "email": 1, "tenant_ids": 1, "tenant_id": 1}).to_list(1000)
    counts = {}
    for o in owners:
        ids = o.get("tenant_ids") or ([o["tenant_id"]] if o.get("tenant_id") else [])
        counts[o["email"]] = max(counts.get(o["email"], 0), len(set(ids)))
    for t in tenants:
        t["owner_salon_count"] = counts.get(t.get("owner_email"), 1)
    return tenants


class OnboardImgIn(BaseModel):
    tenant_id: str = Field(..., max_length=64)
    vibe: str = Field("luxury", max_length=40)


@api.post("/super-admin/onboarding-image")
async def superadmin_onboarding_bg(body: OnboardImgIn, user=Depends(require_super_admin)):
    """AI background for the 'Welcome Onboard' WhatsApp-status poster."""
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
    t = await db.tenants.find_one({"id": body.tenant_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Salon not found")
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    vibes = {
        "luxury": "opulent dark luxury salon interior, warm golden bokeh lights, marble and brass details",
        "festive": "celebratory salon scene with soft golden confetti, ribbons and sparkling bokeh",
        "minimal": "elegant minimal beauty studio, soft neutral tones, diffused daylight, subtle gold accents",
        "floral": "dreamy salon backdrop with soft blush florals, silk drapes and golden light leaks",
    }
    prompt = (f"Vertical 9:16 background image for a premium salon welcome poster: "
              f"{vibes.get(body.vibe, vibes['luxury'])}. Cinematic soft-focus photography, dark vignette edges, "
              f"generous empty space in the center for overlay text. Absolutely NO text, NO letters, NO logos, NO people's faces.")
    gen = OpenAIImageGeneration(api_key=key)
    try:
        images = await gen.generate_images(prompt=prompt, model="gpt-image-1", number_of_images=1)
    except Exception as e:
        raise HTTPException(400, f"Background generation failed: {e}")
    if not images:
        raise HTTPException(400, "No image was generated")
    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/superadmin/onboarding/{file_id}.png"
    try:
        result = _put_object(storage_path, images[0], "image/png")
    except requests.HTTPError as e:
        raise HTTPException(400, f"Storage upload failed: {e}") from e
    await _raw_db.uploads.insert_one({
        "id": file_id, "tenant_id": t["id"], "kind": "onboarding",
        "storage_path": result.get("path", storage_path),
        "original_filename": f"{file_id}.png", "content_type": "image/png",
        "size": len(images[0]), "uploaded_by": user["id"], "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"url": f"/api/files/{file_id}"}

async def _generate_onboarding_poster(t: dict) -> str:
    """Unique AI welcome poster per tenant. Returns absolute URL or '' (never blocks onboarding)."""
    try:
        from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
        key = os.environ.get("EMERGENT_LLM_KEY")
        if not key:
            return ""
        vibe = secrets.choice([
            "opulent dark luxury salon interior with warm golden bokeh lights, marble and brass details",
            "celebratory salon scene with soft golden confetti, ribbons and sparkling champagne bokeh",
            "dreamy salon backdrop with soft blush florals, silk drapes and golden light leaks",
            "modern chic salon with emerald velvet chairs, gold-rimmed mirrors and glowing pendant lights",
            "royal Indian-inspired salon decor with marigold accents, warm diyas glow and gold filigree",
        ])
        prompt = (f"Wide 3:2 luxury welcome banner for a beauty salon: {vibe}. "
                  f"Elegant gold serif text centered reading exactly: 'Welcome {t['name']}'. "
                  f"Sparkling light particles, cinematic lighting, premium beauty-brand aesthetic. No people's faces.")
        gen = OpenAIImageGeneration(api_key=key)
        images = await gen.generate_images(prompt=prompt, model="gpt-image-1", number_of_images=1)
        if not images:
            return ""
        file_id = str(uuid.uuid4())
        storage_path = f"{APP_NAME}/superadmin/welcome-posters/{file_id}.png"
        result = _put_object(storage_path, images[0], "image/png")
        await _raw_db.uploads.insert_one({
            "id": file_id, "tenant_id": t["id"], "kind": "welcome_poster",
            "storage_path": result.get("path", storage_path),
            "original_filename": f"{file_id}.png", "content_type": "image/png",
            "size": len(images[0]), "uploaded_by": "system", "is_deleted": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        url = f"{os.environ.get('APP_PUBLIC_URL', 'https://miracurlunisexsaloon.com')}/api/files/{file_id}"
        await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"welcome_poster_url": url}})
        return url
    except Exception as e:
        logging.warning(f"welcome poster generation failed: {e}")
        return ""


@api.post("/super-admin/tenants")
async def create_tenant(body: TenantIn, user=Depends(require_super_admin)):
    if await db.tenants.find_one({"slug": body.slug}):
        raise HTTPException(400, "Slug already in use")
    existing_owner = await db.users.find_one({"email": body.owner_email.lower()})
    if existing_owner and existing_owner.get("role") != "admin":
        raise HTTPException(
            400, "This email belongs to a staff/manager login — a salon can only be tagged to an OWNER (admin) email.")
    t = Tenant(
        slug=body.slug, name=body.name, owner_email=body.owner_email.lower(),
        location=body.location, phone=body.phone, plan=body.plan, status="trial",
        salon_email=(body.salon_email or "").lower() or None, owner_phone=body.owner_phone,
    ).model_dump()
    await db.tenants.insert_one(t)
    t.pop("_id", None)

    if existing_owner:
        # MULTI-SALON: tag the new salon to the existing owner login (same email & password).
        prev_ids = existing_owner.get("tenant_ids") or ([existing_owner["tenant_id"]] if existing_owner.get("tenant_id") else [])
        await db.users.update_one(
            {"id": existing_owner["id"]},
            {"$set": {"tenant_ids": sorted(set(prev_ids) | {t["id"]})}})
        salon_count = len(set(prev_ids) | {t["id"]})
        email_status = await _send_email(
            [body.owner_email.lower()],
            f"New salon added to your Miracurl account ✦ {t['name']}",
            f"<div style='font-family:Georgia,serif;padding:24px'><h2>Namaste {existing_owner.get('name') or 'Owner'} ✦</h2>"
            f"<p><b>{t['name']}</b> has been added to your Miracurl account.</p>"
            f"<p>You now manage <b>{salon_count} salons</b> with the same login ({body.owner_email.lower()}). "
            f"Use the salon switcher in the top bar (your Owner PIN confirms each switch).</p></div>")
        return {
            "tenant": t,
            "owner_email": body.owner_email,
            "linked_existing_owner": True,
            "owner_salon_count": salon_count,
            "email_status": email_status,
        }

    # Generate a one-time password if the super-admin didn't supply one. The
    # owner must change it on first login (see `must_change_password`).
    if body.owner_password:
        temp_pw = body.owner_password
    else:
        # Friendly prefix + high-entropy token (~64 bits) — see _generate_temp_password.
        temp_pw = _generate_temp_password()
    owner = {
        "id": str(uuid.uuid4()),
        "email": body.owner_email.lower(),
        "name": body.owner_name,
        "role": "admin",
        "tenant_id": t["id"],
        "status": "active",
        "password_hash": hash_pw(temp_pw),
        "must_change_password": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(owner)
    # Email the one-time credentials to the owner's personal email AND the salon email.
    recipients = [body.owner_email.lower()]
    if t.get("salon_email") and t["salon_email"] not in recipients:
        recipients.append(t["salon_email"])
    # Every onboarded salon gets its own unique AI-generated welcome poster.
    poster_url = await _generate_onboarding_poster(t)
    email_status = await _send_email(
        recipients,
        "Welcome to Miracurl — your salon account is ready ✦",
        _welcome_email_html(t["name"], body.owner_email.lower(), temp_pw, poster_url))
    # Return the temp password ONCE so super-admin can copy/share it. Never
    # stored in cleartext or retrievable again — a lost password requires a
    # /forgot flow just like any user.
    return {
        "tenant": t,
        "owner_email": body.owner_email,
        "temp_password": temp_pw,
        "must_change_password": True,
        "email_recipients": recipients,
        "email_status": email_status,
    }


# ---------------- Contact Miracurl HQ (admin → platform team, with attachments) ----------------
_HQ_MAX_FILES = 3
_HQ_MAX_TOTAL_BYTES = 10 * 1024 * 1024


@api.post("/contact-hq")
async def contact_hq(
    request: Request,
    subject: str = Form(..., min_length=2, max_length=150),
    message: str = Form(..., min_length=2, max_length=5000),
    files: List[UploadFile] = File(default=[]),
    admin=Depends(require_tenant_admin), t=Depends(current_tenant),
):
    # Throttle per tenant: 5 messages / hour (audit P3 — email quota/storage abuse)
    public_rate_limit(request, key_suffix=f"hq-{t['id']}", limit=5, window_sec=3600)
    if len(files) > _HQ_MAX_FILES:
        raise HTTPException(400, f"Maximum {_HQ_MAX_FILES} attachments allowed")
    attachments, names, total = [], [], 0
    for f in files:
        data = await f.read()
        total += len(data)
        if total > _HQ_MAX_TOTAL_BYTES:
            raise HTTPException(413, "Attachments too large — max 10MB total")
        if data:
            fname = re.sub(r"[\r\n]", "", (f.filename or "attachment"))[:120]
            attachments.append({"filename": fname, "content": base64.b64encode(data).decode()})
            names.append(fname)
    safe_msg = html_lib.escape(message).replace("\n", "<br/>")
    html = f"""
<div style="font-family:Arial,sans-serif;max-width:600px">
<h2 style="color:#1a1a2e">📨 Message from a salon owner</h2>
<p><b>Salon:</b> {html_lib.escape(t['name'])} ({t['slug']})<br/>
<b>From:</b> {html_lib.escape(admin['email'])}<br/>
<b>Subject:</b> {html_lib.escape(subject)}</p>
<div style="background:#f8f7fc;border:1px solid #e6e3f2;border-radius:10px;padding:16px;font-size:14px;color:#333">{safe_msg}</div>
<p style="font-size:12px;color:#888;margin-top:14px">Attachments: {html_lib.escape(', '.join(names)) or 'none'} · Sent via Miracurl Contact HQ</p>
</div>"""
    status = await _send_email(
        [os.environ.get("HQ_EMAIL", "admin@miracurl.com")],
        f"[Miracurl HQ] {subject} — {t['name']}", html, attachments or None)
    await _raw_db.hq_messages.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": t["id"], "tenant_name": t["name"],
        "from_email": admin["email"], "subject": subject, "message": message,
        "attachments": names, "email_status": status, "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    if not status.get("sent"):
        raise HTTPException(400, f"Message saved but email delivery failed: {status.get('error')}")
    return {"ok": True}


class ChangePasswordIn(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


@api.post("/auth/change-password")
async def change_password(body: ChangePasswordIn, user=Depends(get_current_user)):
    """Authenticated password change. Clears the must_change_password flag so
    the forced-change modal disappears on subsequent logins."""
    fresh = await db.users.find_one({"id": user["id"]})
    if not fresh or not verify_pw(body.current_password, fresh["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    if body.current_password == body.new_password:
        raise HTTPException(400, "New password must be different from current")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "password_hash": hash_pw(body.new_password),
            "must_change_password": False,
            "password_changed_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True}



@api.get("/super-admin/tenants/{tid}")
async def get_tenant(tid: str, user=Depends(require_super_admin)):
    t = await db.tenants.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    # add some stats
    _current_tenant_id.set(t["id"])
    t["stats"] = {
        "customers": await db.customers.count_documents({}),
        "appointments": await db.appointments.count_documents({}),
        "invoices": await db.invoices.count_documents({}),
        "users": await _raw_db.users.count_documents({"tenant_id": t["id"]}),
    }
    _current_tenant_id.set(None)
    return t

@api.put("/super-admin/tenants/{tid}")
async def update_tenant(tid: str, body: TenantUpdateIn, user=Depends(require_super_admin)):
    t = await db.tenants.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(400, "No fields to update")
    for f in ("owner_email", "salon_email"):
        if f in upd:
            upd[f] = upd[f].strip().lower()

    old_email = (t.get("owner_email") or "").lower()
    if upd.get("owner_email") and upd["owner_email"] != old_email:
        new_email = upd["owner_email"]
        if await db.users.find_one({"email": new_email}):
            raise HTTPException(400, "That email is already used by another login — pick a different one.")
        owner = await db.users.find_one({"email": old_email, "role": "admin"})
        if owner:
            await db.users.update_one({"id": owner["id"]}, {"$set": {"email": new_email}})
            # Keep every salon of this owner consistent (multi-salon logins share one email)
            await db.tenants.update_many({"owner_email": old_email}, {"$set": {"owner_email": new_email}})

    await db.tenants.update_one({"id": tid}, {"$set": upd})
    return await db.tenants.find_one({"id": tid}, {"_id": 0})


@api.post("/super-admin/tenants/{tid}/resend-credentials")
async def resend_owner_credentials(tid: str, user=Depends(require_super_admin)):
    """Reset the owner's password to a fresh temp one and email the new credentials.
    Owner must change it on first login. Affects ALL salons sharing this login."""
    t = await db.tenants.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    owner_email = (t.get("owner_email") or "").lower()
    owner = await db.users.find_one({"email": owner_email, "role": "admin"})
    if not owner:
        raise HTTPException(404, "No owner (admin) login found for this salon's owner email")
    temp_pw = _generate_temp_password()
    await db.users.update_one({"id": owner["id"]}, {"$set": {
        "password_hash": hash_pw(temp_pw), "must_change_password": True, "disabled": False,
        "password_changed_at": datetime.now(timezone.utc).isoformat()}})
    recipients = [owner_email]
    if t.get("salon_email") and t["salon_email"].lower() not in recipients:
        recipients.append(t["salon_email"].lower())
    email_status = await _send_email(
        recipients, f"🔑 Your new Miracurl login credentials — {t['name']}",
        _credentials_email_html(t["name"], owner_email, temp_pw))
    owned = set(owner.get("tenant_ids") or [])
    if owner.get("tenant_id"):
        owned.add(owner["tenant_id"])
    return {"ok": True, "temp_password": temp_pw, "owner_email": owner_email,
            "email_recipients": recipients, "email_status": email_status,
            "affects_salons": max(len(owned), 1)}


class BranchLinkIn(BaseModel):
    branch_tenant_id: str


@api.post("/super-admin/tenants/{tid}/link-branch")
async def link_branch(tid: str, body: BranchLinkIn, user=Depends(require_super_admin)):
    """Link ANOTHER salon (by its unique Tenant ID) to THIS salon's owner login.
    Works even when the two salons were created with different owner emails."""
    t = await db.tenants.find_one({"id": tid}, {"_id": 0, "id": 1, "name": 1, "owner_email": 1})
    if not t:
        raise HTTPException(404, "Tenant not found")
    bid = body.branch_tenant_id.strip()
    if bid == tid:
        raise HTTPException(400, "A salon can't be linked to itself")
    branch = await db.tenants.find_one({"id": bid}, {"_id": 0, "id": 1, "name": 1, "slug": 1})
    if not branch:
        raise HTTPException(404, f"No salon found with Tenant ID '{bid}' — double-check the ID")
    owner = await db.users.find_one({"email": (t.get("owner_email") or "").lower(), "role": "admin"})
    if not owner:
        raise HTTPException(404, "No owner (admin) login found for this salon")
    owned = set(owner.get("tenant_ids") or [])
    if owner.get("tenant_id"):
        owned.add(owner["tenant_id"])
    if bid in owned:
        raise HTTPException(400, f"'{branch['name']}' is already linked to this owner")
    await db.users.update_one({"id": owner["id"]}, {"$addToSet": {"tenant_ids": bid}})
    if not owner.get("tenant_ids"):  # ensure primary is also in the array for consistency
        await db.users.update_one({"id": owner["id"]}, {"$addToSet": {"tenant_ids": owner.get("tenant_id")}})
    return {"ok": True, "linked": {"id": branch["id"], "name": branch["name"], "slug": branch["slug"]},
            "owner_email": owner["email"], "total_salons": len(owned) + 1}


@api.post("/super-admin/tenants/{tid}/unlink-branch")
async def unlink_branch(tid: str, body: BranchLinkIn, user=Depends(require_super_admin)):
    """Remove a linked branch from this salon's owner login (cannot remove the active salon)."""
    t = await db.tenants.find_one({"id": tid}, {"_id": 0, "id": 1, "owner_email": 1})
    if not t:
        raise HTTPException(404, "Tenant not found")
    owner = await db.users.find_one({"email": (t.get("owner_email") or "").lower(), "role": "admin"})
    if not owner:
        raise HTTPException(404, "No owner (admin) login found for this salon")
    bid = body.branch_tenant_id.strip()
    if bid == owner.get("tenant_id"):
        raise HTTPException(400, "Can't unlink the owner's currently active salon — switch their active salon first")
    await db.users.update_one({"id": owner["id"]}, {"$pull": {"tenant_ids": bid}})
    return {"ok": True, "unlinked": bid}


@api.get("/super-admin/tenants/{tid}/linked-branches")
async def linked_branches(tid: str, user=Depends(require_super_admin)):
    """All salons linked to this salon's owner login (for the edit modal)."""
    t = await db.tenants.find_one({"id": tid}, {"_id": 0, "id": 1, "owner_email": 1})
    if not t:
        raise HTTPException(404, "Tenant not found")
    owner = await db.users.find_one({"email": (t.get("owner_email") or "").lower(), "role": "admin"})
    if not owner:
        return {"owner_found": False, "salons": []}
    owned = set(owner.get("tenant_ids") or [])
    if owner.get("tenant_id"):
        owned.add(owner["tenant_id"])
    salons = await db.tenants.find(
        {"id": {"$in": list(owned)}},
        {"_id": 0, "id": 1, "name": 1, "slug": 1, "location": 1, "status": 1}).sort("name", 1).to_list(20)
    for s in salons:
        s["active_for_owner"] = s["id"] == owner.get("tenant_id")
    return {"owner_found": True, "owner_email": owner["email"], "salons": salons}


# ---------------- Trusted Partners (public profile of the platform) ----------------
async def _reviews_by_tenant() -> dict:
    aggs = await _raw_db.reviews.aggregate([
        {"$match": {"public": True}},
        {"$group": {"_id": "$tenant_id", "avg": {"$avg": "$rating"}, "n": {"$sum": 1}}},
    ]).to_list(2000)
    return {a["_id"]: a for a in aggs}


def _tenant_partner_card(t: dict, agg: Optional[dict]) -> dict:
    return {
        "id": t["id"], "source": "tenant", "name": t.get("name") or "",
        "logo_url": t.get("logo_url") or "", "city": t.get("location") or "",
        "rating": round(float(agg["avg"]), 1) if agg else None,
        "reviews_count": int(agg["n"]) if agg else 0,
        "blurb": t.get("partner_blurb") or "",
        "owner_review": t.get("partner_review") or None,
        "featured": bool(t.get("partner_featured")),
        "slug": t.get("slug") or "", "since": (t.get("created_at") or "")[:10],
    }


class PartnerReviewIn(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    text: str = Field("", max_length=500)


@api.get("/partner-review")
async def get_partner_review(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """The salon owner's own rating/review of the Miracurl platform."""
    rev = t.get("partner_review") or {}
    locked = bool(rev) and not t.get("partner_review_editable")
    return {**rev, "locked": locked}


@api.put("/partner-review")
async def save_partner_review(body: PartnerReviewIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    # One-time review: once submitted it locks. Only Miracurl HQ can re-enable editing.
    if t.get("partner_review") and not t.get("partner_review_editable"):
        raise HTTPException(403, "Your review is already published and locked. Contact Miracurl HQ to enable editing.")
    doc = {"rating": int(body.rating), "text": body.text.strip(),
           "author": user.get("name") or t.get("owner_name") or t.get("name") or "Owner",
           "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.tenants.update_one(
        {"id": t["id"]},
        {"$set": {"partner_review": doc}, "$unset": {"partner_review_editable": ""}})
    return {**doc, "locked": True}


@api.get("/public/partners")
async def public_partners(request: Request):
    """Landing-page 'Trusted Partners': onboarded salons (auto) + manual partners."""
    public_rate_limit(request, key_suffix="partners", limit=30, window_sec=600)
    by_tid = await _reviews_by_tenant()
    tenants = await _raw_db.tenants.find(
        {"status": {"$in": ["active", "trial"]}},
        {"_id": 0, "id": 1, "name": 1, "logo_url": 1, "location": 1, "slug": 1,
         "created_at": 1, "partner_visible": 1, "partner_featured": 1, "partner_blurb": 1, "partner_review": 1},
    ).to_list(300)
    out = [_tenant_partner_card(t, by_tid.get(t["id"]))
           for t in tenants if t.get("partner_visible") is not False]
    manual = await _raw_db.partners.find({}, {"_id": 0}).to_list(100)
    out += [{**p, "source": "manual", "reviews_count": p.get("reviews_count", 0)} for p in manual]
    out.sort(key=lambda p: (not p.get("featured"), -(p.get("rating") or 0)))
    return out


class PartnerTenantIn(BaseModel):
    visible: Optional[bool] = None
    featured: Optional[bool] = None
    blurb: Optional[str] = Field(None, max_length=400)
    allow_review_edit: Optional[bool] = None


class ManualPartnerIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    logo_url: str = Field("", max_length=500)
    city: str = Field("", max_length=100)
    blurb: str = Field("", max_length=400)
    rating: Optional[float] = Field(None, ge=0, le=5)
    featured: bool = False


@api.get("/super-admin/partners")
async def super_partners(user=Depends(require_super_admin)):
    by_tid = await _reviews_by_tenant()
    tenants = await _raw_db.tenants.find(
        {"status": {"$in": ["active", "trial"]}},
        {"_id": 0, "id": 1, "name": 1, "logo_url": 1, "location": 1, "slug": 1,
         "created_at": 1, "partner_visible": 1, "partner_featured": 1, "partner_blurb": 1,
         "partner_review": 1, "partner_review_editable": 1},
    ).to_list(300)
    cards = []
    for t in tenants:
        c = _tenant_partner_card(t, by_tid.get(t["id"]))
        c["visible"] = t.get("partner_visible") is not False
        c["review_editable"] = bool(t.get("partner_review_editable"))
        cards.append(c)
    manual = await _raw_db.partners.find({}, {"_id": 0}).to_list(100)
    return {"tenants": cards, "manual": manual}


@api.put("/super-admin/partners/tenant/{tid}")
async def update_partner_tenant(tid: str, body: PartnerTenantIn, user=Depends(require_super_admin)):
    sets = {}
    if body.visible is not None:
        sets["partner_visible"] = body.visible
    if body.featured is not None:
        sets["partner_featured"] = body.featured
    if body.blurb is not None:
        sets["partner_blurb"] = body.blurb.strip()
    if body.allow_review_edit is not None:
        sets["partner_review_editable"] = body.allow_review_edit
    if not sets:
        raise HTTPException(400, "Nothing to update")
    r = await db.tenants.update_one({"id": tid}, {"$set": sets})
    if r.matched_count == 0:
        raise HTTPException(404, "Tenant not found")
    return {"ok": True, **sets}


@api.post("/super-admin/partners/manual")
async def add_manual_partner(body: ManualPartnerIn, user=Depends(require_super_admin)):
    doc = {"id": str(uuid.uuid4()), **body.model_dump(),
           "created_at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.partners.insert_one(doc)
    return _clean(doc)


@api.delete("/super-admin/partners/manual/{pid}")
async def delete_manual_partner(pid: str, user=Depends(require_super_admin)):
    await _raw_db.partners.delete_one({"id": pid})
    return {"ok": True}


@api.delete("/super-admin/tenants/{tid}")
async def delete_tenant(tid: str, user=Depends(require_super_admin)):
    # Soft delete: mark cancelled. Hard delete leaves orphan data we may want.
    await db.tenants.update_one({"id": tid}, {"$set": {"status": "cancelled"}})
    return {"ok": True}


# Every tenant-scoped collection — kept in sync with TenantCollection usage in database.py
_TENANT_SCOPED_COLLECTIONS = [
    "advances", "appointments", "attendance", "branch_switch_requests", "chat_messages",
    "chat_threads", "coupons", "customer_memberships", "customer_packages", "customers",
    "entertainment_playlists", "feedback", "gallery", "invoices", "leave_requests",
    "memberships", "packages", "products", "reviews", "services", "sms_pack_payments",
    "staff", "staff_resumes", "vendors", "whatsapp_requests",
    # non-TenantCollection but tenant-keyed
    "subscriptions", "subscription_payments", "pin_attempts", "partner_overrides",
]


@api.delete("/super-admin/tenants/{tid}/permanent")
async def permanent_delete_tenant(tid: str, request: Request, user=Depends(require_super_admin)):
    """HARD delete: wipes the salon and ALL its data (customers, invoices, staff, bookings,
    subscriptions, logins…). Irreversible. Requires ?confirm=<exact slug> to prevent mistakes.
    Intended for removing test/demo salons."""
    t = await db.tenants.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    confirm = request.query_params.get("confirm", "")
    if confirm != t.get("slug"):
        raise HTTPException(400, f"Type the salon's exact slug '{t.get('slug')}' to confirm permanent deletion.")

    deleted: dict = {}
    for coll in _TENANT_SCOPED_COLLECTIONS:
        res = await _raw_db[coll].delete_many({"tenant_id": tid})
        if res.deleted_count:
            deleted[coll] = res.deleted_count

    # Users: remove logins whose ONLY salon is this one; unlink it from multi-salon owners.
    async for u in _raw_db.users.find({"$or": [{"tenant_id": tid}, {"tenant_ids": tid}]}, {"_id": 0, "id": 1, "tenant_id": 1, "tenant_ids": 1, "role": 1}):
        others = [x for x in (u.get("tenant_ids") or []) if x != tid]
        if u.get("role") == "super_admin" or (u.get("tenant_id") and u["tenant_id"] != tid) or others:
            # Multi-salon owner / super-admin: just unlink this branch, keep the login.
            new_active = u["tenant_id"] if (u.get("tenant_id") and u["tenant_id"] != tid) else (others[0] if others else None)
            await _raw_db.users.update_one({"id": u["id"]},
                {"$pull": {"tenant_ids": tid}, "$set": {"tenant_id": new_active}})
        else:
            await _raw_db.users.delete_one({"id": u["id"]})
            deleted["users"] = deleted.get("users", 0) + 1

    await _raw_db.tenants.delete_one({"id": tid})
    deleted["tenants"] = 1
    logging.getLogger("super_admin").warning(
        "PERMANENT DELETE tenant %s (%s) by %s — %s", tid, t.get("slug"), user["email"], deleted)
    return {"ok": True, "deleted_salon": t.get("name"), "records_removed": deleted}


@api.post("/super-admin/tenants/{tid}/reactivate")
async def reactivate_tenant(tid: str, user=Depends(require_super_admin)):
    """Re-onboard a cancelled salon: restore access (7-day grace trial), issue a
    fresh one-time owner password and re-send the welcome email. All historical
    data (customers, invoices, staff) is preserved."""
    t = await db.tenants.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    if t.get("status") not in ("cancelled", "suspended"):
        raise HTTPException(400, f"Tenant is already {t.get('status')} — nothing to reactivate")
    owner = await db.users.find_one(
        {"tenant_id": tid, "email": (t.get("owner_email") or "").lower()}, {"_id": 0})
    if not owner:
        owner = await db.users.find_one({"tenant_id": tid, "role": "admin"}, {"_id": 0})
    if not owner:
        raise HTTPException(404, "No owner login found for this tenant")
    trial_end = (datetime.now(timezone.utc) + timedelta(days=7)).date().isoformat()
    await db.tenants.update_one({"id": tid}, {"$set": {
        "status": "trial", "trial_end_date": trial_end, "trial_ends_at": trial_end,
        "subscription_end_date": None,
        "reactivated_at": datetime.now(timezone.utc).isoformat(),
    }})
    temp_pw = _generate_temp_password()
    await db.users.update_one({"id": owner["id"]}, {"$set": {
        "password_hash": hash_pw(temp_pw), "must_change_password": True, "status": "active"}})
    recipients = [owner["email"]]
    if t.get("salon_email") and t["salon_email"] not in recipients:
        recipients.append(t["salon_email"])
    email_status = await _send_email(
        recipients,
        "Welcome back to Miracurl — your salon is live again ✦",
        _welcome_email_html(t["name"], owner["email"], temp_pw, t.get("welcome_poster_url") or ""))
    return {
        "ok": True, "owner_email": owner["email"], "temp_password": temp_pw,
        "trial_end_date": trial_end, "email_recipients": recipients,
        "email_status": email_status,
    }


# ---------------- Super-Admin: Bulk customer import ----------------
VCARD_FN_RE = re.compile(r"^FN(?:;[^:]*)?:(.+)$", re.MULTILINE)
VCARD_N_RE = re.compile(r"^N(?:;[^:]*)?:(.+)$", re.MULTILINE)
VCARD_TEL_RE = re.compile(r"^TEL(?:;[^:]*)?:(.+)$", re.MULTILINE)
PHONE_DIGITS_RE = re.compile(r"\d{7,15}")


def _normalize_phone(raw: str) -> Optional[str]:
    """Strip non-digits; keep last 10–15 digits. Return None if unusable."""
    digits = "".join(c for c in (raw or "") if c.isdigit())
    if len(digits) < 7:
        return None
    # Strip India country code prefix (91) when phone is 12 digits starting with 91
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    return digits[-15:]


def _parse_vcard(text: str) -> list:
    """Return list of {name, phone} from a vCard (.vcf) blob."""
    rows = []
    blocks = re.split(r"BEGIN:VCARD", text, flags=re.IGNORECASE)
    for block in blocks:
        if "END:VCARD" not in block.upper():
            continue
        fn = VCARD_FN_RE.search(block)
        n = VCARD_N_RE.search(block)
        name = (fn.group(1) if fn else (n.group(1).replace(";", " ").strip() if n else "")).strip()
        for tel in VCARD_TEL_RE.findall(block):
            phone = _normalize_phone(tel)
            if phone:
                rows.append({"name": name or "Imported Customer", "phone": phone})
    return rows


def _parse_plain_text(text: str) -> list:
    """Parse pasted lines: 'Name, +91 98765 43210' OR 'Name\\t+91 98765 43210' OR 'Name +91...' OR just digits."""
    rows = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        # Find the longest digit run that looks like a phone
        m = PHONE_DIGITS_RE.search(line.replace(" ", "").replace("-", ""))
        if not m:
            continue
        phone = _normalize_phone(m.group(0))
        if not phone:
            continue
        # Name = everything except the phone token(s)
        name_part = re.sub(r"[+\d][\d\s\-()]{6,}", "", line).strip(" ,;-\t")
        rows.append({"name": name_part or "Imported Customer", "phone": phone})
    return rows


def parse_customer_import(text: str, fmt: str) -> list:
    """fmt: 'vcard' | 'text' | 'auto'. Returns list of {name, phone}."""
    if not text or not text.strip():
        return []
    fmt = (fmt or "auto").lower()
    if fmt == "vcard" or (fmt == "auto" and "BEGIN:VCARD" in text.upper()):
        return _parse_vcard(text)
    return _parse_plain_text(text)


class CustomerImportIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=2_000_000)
    format: str = Field("auto", pattern="^(auto|vcard|text)$")


class CustomerImportRowOut(BaseModel):
    name: str
    phone: str
    status: str  # 'added' | 'skipped' | 'invalid'
    reason: Optional[str] = None
    referral_code: Optional[str] = None


@api.post("/super-admin/tenants/{tid}/customers/import")
async def super_admin_import_customers(tid: str, body: CustomerImportIn, user=Depends(require_super_admin)):
    tenant = await db.tenants.find_one({"id": tid}, {"_id": 0})
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    parsed = parse_customer_import(body.text, body.format)
    if not parsed:
        raise HTTPException(400, "No valid contacts found. Make sure each line has a phone number.")

    # Scope all DB operations to this tenant
    _current_tenant_id.set(tenant["id"])
    try:
        rows: list = []
        added = 0
        skipped = 0
        seen_in_batch: set = set()  # dedupe within the same upload
        for r in parsed:
            phone = r["phone"]
            name = (r.get("name") or "Imported Customer").strip()[:80]
            if phone in seen_in_batch:
                rows.append({"name": name, "phone": phone, "status": "skipped", "reason": "duplicate in upload"})
                skipped += 1
                continue
            seen_in_batch.add(phone)
            existing = await db.customers.find_one({"phone": phone}, {"_id": 0, "id": 1, "referral_code": 1})
            if existing:
                rows.append({"name": name, "phone": phone, "status": "skipped", "reason": "already in salon",
                             "referral_code": existing.get("referral_code")})
                skipped += 1
                continue
            cust = Customer(name=name, phone=phone, notes="Imported from contacts").model_dump()
            await db.customers.insert_one(cust)
            rows.append({"name": name, "phone": phone, "status": "added", "referral_code": cust["referral_code"]})
            added += 1
        return {
            "tenant": {"id": tenant["id"], "slug": tenant["slug"], "name": tenant["name"]},
            "summary": {"total_parsed": len(parsed), "added": added, "skipped": skipped},
            "rows": rows,
        }
    finally:
        _current_tenant_id.set(None)


@api.get("/super-admin/overview")
async def super_admin_overview(user=Depends(require_super_admin)):
    tenants = await db.tenants.find({}, {"_id": 0}).to_list(500)
    by_status = {}
    by_plan = {}
    for t in tenants:
        by_status[t["status"]] = by_status.get(t["status"], 0) + 1
        by_plan[t["plan"]] = by_plan.get(t["plan"], 0) + 1
    return {
        "total_tenants": len(tenants),
        "by_status": by_status,
        "by_plan": by_plan,
        "recent": tenants[:5],
    }


from routes.super_admin import router as super_admin_router  # noqa: E402 — HQ tools (routes/super_admin.py)
api.include_router(super_admin_router)

async def backfill_tenant_ids(tenant_id: str):
    """Assign tenant_id to legacy records that don't have one."""
    for coll_name in ("customers", "services", "staff", "products", "appointments", "invoices", "reviews"):
        coll = getattr(_raw_db, coll_name)
        r = await coll.update_many({"tenant_id": {"$exists": False}}, {"$set": {"tenant_id": tenant_id}})
        if r.modified_count:
            logging.info(f"Backfilled {r.modified_count} {coll_name} with tenant_id")
    # backfill users that have no tenant_id (legacy admin) — assign to default tenant
    await _raw_db.users.update_many(
        {"tenant_id": {"$exists": False}, "role": {"$ne": "super_admin"}},
        {"$set": {"tenant_id": tenant_id}},
    )

async def seed_super_admin():
    """Seed the super-admin ONCE from env. Never re-writes an existing hash so operators can rotate it."""
    email = os.environ.get("SUPER_ADMIN_EMAIL", "super@miracurl.com").lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        # Never touch an existing super-admin — the operator may have rotated the password.
        # Only auto-heal if the role got downgraded somehow.
        if existing.get("role") != "super_admin":
            await db.users.update_one({"email": email}, {"$set": {"role": "super_admin"}})
        return
    seed_pw = os.environ.get("SUPER_ADMIN_SEED_PASSWORD")
    if not seed_pw:
        # No seed configured — skip. Operator must create the super-admin manually or set the env var once.
        logging.warning("SUPER_ADMIN_SEED_PASSWORD is not set — skipping super-admin seed. Set it in .env for first-boot only.")
        return
    await db.users.insert_one({
        "id": str(uuid.uuid4()),
        "email": email,
        "name": "Super Admin",
        "role": "super_admin",
        "tenant_id": None,
        "password_hash": hash_pw(seed_pw),
        "must_change_password": True,   # force rotation on first login
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    logging.info("Seeded super-admin user (email=%s) — MUST rotate password on first login", email)

async def seed_default_tenant():
    """Ensure the default tenant exists. Returns the tenant dict."""
    t = await db.tenants.find_one({"slug": DEFAULT_TENANT_SLUG}, {"_id": 0})
    if not t:
        t = Tenant(
            slug=DEFAULT_TENANT_SLUG,
            name="Miracurl Unisex Family Salon",
            owner_email=os.environ["ADMIN_EMAIL"].lower(),
            location="Marathahalli, Bangalore",
            phone="+91 98765 00000",
            google_review_url=os.environ.get("GOOGLE_REVIEW_URL", ""),
            plan="enterprise",
            status="active",
        ).model_dump()
        await db.tenants.insert_one(t)
        logging.info("Seeded default tenant")
    return t

async def seed_admin():
    """Seed default salon admin ONCE. Never re-writes an existing hash so the owner can rotate it."""
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    default_tenant = await db.tenants.find_one({"slug": DEFAULT_TENANT_SLUG}, {"_id": 0})
    tenant_id = default_tenant["id"] if default_tenant else None
    existing = await db.users.find_one({"email": admin_email})
    if existing:
        # Only auto-heal missing tenant link. Do NOT overwrite the password.
        if not existing.get("tenant_id") and tenant_id:
            await db.users.update_one({"email": admin_email}, {"$set": {"tenant_id": tenant_id}})
        return
    seed_pw = os.environ.get("ADMIN_PASSWORD")
    if not seed_pw:
        logging.warning("ADMIN_PASSWORD is not set — skipping admin seed.")
        return
    await db.users.insert_one({
        "id": str(uuid.uuid4()),
        "email": admin_email,
        "name": "Salon Admin",
        "role": "admin",
        "tenant_id": tenant_id,
        "password_hash": hash_pw(seed_pw),
        "must_change_password": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    logging.info("Seeded admin user — MUST rotate password on first login")

async def seed_data():
    # All seed inserts run with the default tenant context so tenant_id auto-injects
    if await db.services.count_documents({}) == 0:
        await db.services.insert_many([Service(**s).model_dump() for s in SEED_SERVICES])
    if await db.staff.count_documents({}) == 0:
        await db.staff.insert_many([Staff(**s).model_dump() for s in SEED_STAFF])
    if await db.products.count_documents({}) == 0:
        await db.products.insert_many([Product(**p).model_dump() for p in SEED_PRODUCTS])
    if await db.customers.count_documents({}) == 0:
        await db.customers.insert_many([Customer(**c).model_dump() for c in SEED_CUSTOMERS])

async def _monthly_report_scheduler():
    """On the 1st of each month (after 09:00 IST) auto-email every active salon
    owner their previous month's business report. Idempotent via system_flags."""
    while True:
        try:
            ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
            if ist_now.day == 1 and ist_now.hour >= 9:
                period = ist_now.strftime("%Y-%m")
                flag = await _raw_db.system_flags.find_one({"key": "monthly_report_auto"})
                if not flag or flag.get("value") != period:
                    out = await _run_monthly_reports(None)
                    await _raw_db.system_flags.update_one(
                        {"key": "monthly_report_auto"},
                        {"$set": {"value": period, "ran_at": datetime.now(timezone.utc).isoformat(),
                                  "sent": out.get("sent", 0), "failed": out.get("failed", 0)}},
                        upsert=True)
                    logging.info(f"Auto monthly reports for {period}: sent={out.get('sent')} failed={out.get('failed')}")
        except Exception as e:
            logging.error(f"monthly report scheduler error: {e}")
        await asyncio.sleep(3600)


async def _run_platform_digest() -> dict:
    """Monday HQ email: platform pulse — salons, leads, expiring trials, open tickets, revenue."""
    hq = os.environ.get("HQ_EMAIL")
    if not hq:
        return {"sent": 0, "error": "HQ_EMAIL not set"}
    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).isoformat()
    week_ahead = (now + timedelta(days=7)).isoformat()
    tenants = await _raw_db.tenants.find({}, {"_id": 0, "name": 1, "status": 1, "trial_ends_at": 1}).to_list(500)
    expiring = [{"name": t["name"], "ends": str(t.get("trial_ends_at", ""))[:10]}
                for t in tenants if t.get("status") == "trial" and week_ago < str(t.get("trial_ends_at", "")) < week_ahead]
    leads = await _raw_db.tenant_inquiries.find(
        {"created_at": {"$gte": week_ago}}, {"_id": 0, "name": 1, "phone": 1}).to_list(50)
    invs = await _raw_db.invoices.find(
        {"paid": True, "created_at": {"$gte": week_ago[:10]}}, {"_id": 0, "total": 1}).to_list(5000)
    ist = now + timedelta(hours=5, minutes=30)
    stats = {
        "week_label": f"Week of {ist.strftime('%d %b %Y')}",
        "active_tenants": sum(1 for t in tenants if t.get("status") == "active"),
        "trial_tenants": sum(1 for t in tenants if t.get("status") == "trial"),
        "new_leads": len(leads),
        "recent_leads": leads,
        "open_tickets": await _raw_db.dev_tickets.count_documents({"status": {"$nin": ["done", "closed"]}}),
        "platform_revenue": round(sum(float(i.get("total") or 0) for i in invs), 2),
        "expiring_trials": expiring,
    }
    status = await _send_email([hq], f"✦ Platform Health Digest — {stats['week_label']}", _platform_digest_html(stats))
    return {"sent": 1 if status.get("sent") else 0, "error": status.get("error"), "stats_summary": {k: v for k, v in stats.items() if k not in ("recent_leads", "expiring_trials")}}


@api.post("/super-admin/send-platform-digest")
async def send_platform_digest(user=Depends(require_super_admin)):
    return await _run_platform_digest()


async def _weekly_report_scheduler():
    """Every Monday (after 09:00 IST) auto-email each active salon owner last
    week's business snapshot. Idempotent via system_flags."""
    while True:
        try:
            ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
            if ist_now.weekday() == 0 and ist_now.hour >= 9:
                period = (ist_now - timedelta(days=7)).strftime("%Y-%m-%d")  # last week's Monday
                flag = await _raw_db.system_flags.find_one({"key": "weekly_report_auto"})
                if not flag or flag.get("value") != period:
                    out = await _run_weekly_reports(None)
                    digest = await _run_platform_digest()
                    await _raw_db.system_flags.update_one(
                        {"key": "weekly_report_auto"},
                        {"$set": {"value": period, "ran_at": datetime.now(timezone.utc).isoformat(),
                                  "sent": out.get("sent", 0), "failed": out.get("failed", 0),
                                  "digest_sent": digest.get("sent", 0)}},
                        upsert=True)
                    logging.info(f"Auto weekly reports for week of {period}: sent={out.get('sent')} failed={out.get('failed')}")
        except Exception as e:
            logging.error(f"weekly report scheduler error: {e}")
        await asyncio.sleep(3600)


async def _birthday_scheduler():
    """Daily (after 09:00 IST) auto-email birthday wishes to guests. Idempotent via system_flags."""
    while True:
        try:
            ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
            if ist_now.hour >= 9:
                period = ist_now.strftime("%Y-%m-%d")
                flag = await _raw_db.system_flags.find_one({"key": "birthday_email_auto"})
                if not flag or flag.get("value") != period:
                    out = await _run_birthday_emails(None)
                    await _raw_db.system_flags.update_one(
                        {"key": "birthday_email_auto"},
                        {"$set": {"value": period, "ran_at": datetime.now(timezone.utc).isoformat(),
                                  "sent": out.get("sent", 0), "failed": out.get("failed", 0)}},
                        upsert=True)
                    if out.get("sent") or out.get("failed"):
                        logging.info(f"Auto birthday emails {period}: sent={out.get('sent')} failed={out.get('failed')}")
        except Exception as e:
            logging.error(f"birthday scheduler error: {e}")
        await asyncio.sleep(1800)


@app.on_event("startup")
async def on_startup():
    asyncio.get_event_loop().create_task(_monthly_report_scheduler())
    asyncio.get_event_loop().create_task(_weekly_report_scheduler())
    asyncio.get_event_loop().create_task(_birthday_scheduler())
    asyncio.get_event_loop().create_task(autopilot_scheduler())
    asyncio.get_event_loop().create_task(weekly_promo_scheduler())

    async def _ensure_indexes():
        await db.users.create_index("email", unique=True)
        await db.tenants.create_index("slug", unique=True)
        # Drop legacy single-field unique sku index if present (multi-tenancy needs composite)
        try:
            existing_indexes = await _raw_db.products.index_information()
            if "sku_1" in existing_indexes:
                await _raw_db.products.drop_index("sku_1")
                logging.info("Dropped legacy products.sku_1 unique index")
        except Exception as e:
            logging.warning(f"Could not drop legacy index: {e}")
        await _raw_db.customers.create_index([("tenant_id", 1), ("phone", 1)])
        await _raw_db.services.create_index([("tenant_id", 1), ("category", 1)])
        await _raw_db.products.create_index([("tenant_id", 1), ("sku", 1)], unique=True)
        await _raw_db.appointments.create_index([("tenant_id", 1), ("scheduled_at", 1)])
        await _raw_db.invoices.create_index([("tenant_id", 1), ("created_at", -1)])
        await db.login_attempts.create_index("identifier")
        await _raw_db.revoked_tokens.create_index("jti", unique=True)
        await _raw_db.revoked_tokens.create_index("expires_at", expireAfterSeconds=0)
        await _raw_db.tts_cache.create_index("key", unique=True)
        await _raw_db.tts_cache.create_index("created_at", expireAfterSeconds=172800)
        await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=3600)

    async def _run_migrations():
        # One-time migration: booking-created leads (0 visits, never completed a service)
        # move out of CRM until their appointment is marked completed.
        if not await _raw_db.meta.find_one({"key": "crm_pending_migration_v1"}):
            res = await _raw_db.customers.update_many(
                {"visits": {"$in": [0, None]}, "total_spent": {"$in": [0, 0.0, None]},
                 "crm_status": {"$exists": False},
                 "id": {"$in": await _raw_db.appointments.distinct(
                     "customer_id", {"status": {"$nin": ["completed"]}})}},
                {"$set": {"crm_status": "pending"}},
            )
            await _raw_db.meta.insert_one({"key": "crm_pending_migration_v1", "modified": res.modified_count,
                                           "at": datetime.now(timezone.utc).isoformat()})
            logging.info(f"CRM pending migration: {res.modified_count} lead customers hidden until service completion")

    async def _run_seeds():
        default_tenant = await seed_default_tenant()
        await backfill_tenant_ids(default_tenant["id"])
        await seed_super_admin()
        await seed_admin()
        # Set context to default tenant for seed_data inserts
        _current_tenant_id.set(default_tenant["id"])
        await seed_data()
        _current_tenant_id.set(None)

    async def _db_prep():
        # Runs in the BACKGROUND so the pod passes its readiness probe immediately.
        # Any single failure (e.g. index option conflicts / duplicate keys on the
        # production Atlas data) is logged and skipped instead of crash-looping the pod.
        for name, step in (("indexes", _ensure_indexes), ("migrations", _run_migrations), ("seeds", _run_seeds)):
            try:
                await step()
                logging.info("startup db-prep step '%s' done", name)
            except Exception as e:  # noqa: BLE001 — deployment resilience
                logging.getLogger("startup").error("db-prep step '%s' failed (non-fatal): %s", name, e)

    asyncio.create_task(_db_prep())

    # Auto monthly business reports — emailed to every owner on the 1st (9 AM IST onwards).
    async def _monthly_report_loop():
        while True:
            try:
                now_ist = datetime.now(IST_TZ)
                if now_ist.day == 1 and now_ist.hour >= 9:
                    key = now_ist.strftime("%Y-%m")
                    if not await _raw_db.monthly_report_runs.find_one({"month": key}):
                        await _raw_db.monthly_report_runs.insert_one(
                            {"month": key, "started_at": datetime.now(timezone.utc).isoformat()})
                        out = await _run_monthly_reports(None)
                        await _raw_db.monthly_report_runs.update_one(
                            {"month": key},
                            {"$set": {"sent": out["sent"], "failed": out["failed"],
                                      "finished_at": datetime.now(timezone.utc).isoformat()}})
                        logging.info(f"Auto monthly reports for {out['month']}: {out['sent']} sent, {out['failed']} failed")
            except Exception as e:
                logging.getLogger("monthly_report").error(f"auto report loop error: {e}")
            await asyncio.sleep(3600)
    asyncio.create_task(_monthly_report_loop())

@app.on_event("shutdown")
async def on_shutdown():
    client.close()

# include router
# ---------------- AI Assistant (Mira) & Feedback Board ----------------
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

_assistant_sessions: dict = {}

class AssistantChatIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    session_id: str = Field(..., min_length=8, max_length=64)

async def _salon_context(user) -> str:
    today = datetime.now(timezone.utc).date().isoformat()
    month = today[:7]
    appts_today = await db.appointments.count_documents({"scheduled_at": {"$regex": f"^{today}"}})
    pending = await db.appointments.count_documents({"status": "scheduled"})
    customers = await db.customers.count_documents({"crm_status": {"$ne": "pending"}})
    invoices = await db.invoices.find({"created_at": {"$regex": f"^{month}"}}, {"_id": 0, "total": 1}).to_list(2000)
    revenue = sum(float(i.get("total") or 0) for i in invoices)
    low_stock = await db.products.count_documents({"$expr": {"$lte": ["$stock", "$low_stock_threshold"]}})
    services_count = await db.services.count_documents({"active": True})
    tenant = await db.tenants.find_one({"id": user.get("tenant_id")}, {"_id": 0})
    return (f"Salon: {(tenant or {}).get('name', 'the salon')}. Today: {today}. "
            f"Live stats — appointments today: {appts_today}, bookings awaiting approval: {pending}, "
            f"CRM customers: {customers}, revenue this month: ₹{revenue:.0f}, "
            f"low-stock products: {low_stock}, active services: {services_count}.")

@api.post("/assistant/chat")
async def assistant_chat(body: AssistantChatIn, user=Depends(require_tenant_admin)):
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    sid = f"{user.get('tenant_id', 't')}-{body.session_id}"
    chat = _assistant_sessions.get(sid)
    if chat is None:
        ctx = await _salon_context(user)
        chat = LlmChat(
            api_key=key, session_id=sid,
            system_message=(
                "You are Mira, the friendly AI assistant inside 'Miracurl Partner', a salon management app. "
                "Help salon owners/admins with their live stats, how to use features (Appointments has Day/Upcoming/Week views; "
                "confirming a booking opens WhatsApp to notify the client; CRM lists only customers who completed a service; "
                "Services/Customers/Inventory support CSV import-export; staff check-in/out & PDF salary slips; "
                "QR booking poster in Settings; Refer & Earn rewards), and practical salon business advice. "
                "You CANNOT change the app's code — tell users to log feature requests in the Feedback Board tab. "
                "Be concise and warm. Use ₹ for money. Salon context: " + ctx
            ),
        ).with_model("openai", "gpt-5.4")
        _assistant_sessions[sid] = chat
        if len(_assistant_sessions) > 200:
            _assistant_sessions.pop(next(iter(_assistant_sessions)))

    tid = user.get("tenant_id")
    now = datetime.now(timezone.utc).isoformat()
    await _raw_db.assistant_messages.insert_one(
        {"id": str(uuid.uuid4()), "tenant_id": tid, "session_id": body.session_id,
         "role": "user", "content": body.message, "created_at": now})

    async def gen():
        parts = []
        try:
            async for ev in chat.stream_message(UserMessage(text=body.message)):
                if isinstance(ev, TextDelta):
                    parts.append(ev.content)
                    yield ev.content
                elif isinstance(ev, StreamDone):
                    break
        except Exception as e:
            logging.getLogger("assistant").error(f"assistant stream error: {e}")
            yield "\n\n(Sorry, I hit a snag — please try again.)"
        if parts:
            await _raw_db.assistant_messages.insert_one(
                {"id": str(uuid.uuid4()), "tenant_id": tid, "session_id": body.session_id,
                 "role": "assistant", "content": "".join(parts),
                 "created_at": datetime.now(timezone.utc).isoformat()})

    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@api.get("/assistant/history")
async def assistant_history(session_id: str, user=Depends(require_tenant_admin)):
    rows = await _raw_db.assistant_messages.find(
        {"tenant_id": user.get("tenant_id"), "session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    return rows

class FeedbackIn(BaseModel):
    type: str = "enhancement"  # bug | enhancement
    title: str = Field(..., min_length=3, max_length=200)
    details: str = Field("", max_length=3000)
    priority: str = "medium"  # low | medium | high

@api.post("/feedback")
async def create_feedback(body: FeedbackIn, user=Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "status": "open",
           "by": user.get("email", ""), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.feedback.insert_one(doc)
    return _clean(doc)

@api.get("/feedback")
async def list_feedback(user=Depends(get_current_user)):
    return await db.feedback.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api.put("/feedback/{fid}")
async def update_feedback(fid: str, body: dict, user=Depends(require_admin)):
    allowed = {k: v for k, v in body.items() if k in ("status", "priority")}
    if allowed:
        await db.feedback.update_one({"id": fid}, {"$set": allowed})
    return await db.feedback.find_one({"id": fid}, {"_id": 0})

@api.delete("/feedback/{fid}")
async def delete_feedback(fid: str, user=Depends(require_admin)):
    await db.feedback.delete_one({"id": fid})
    return {"ok": True}

# ---------------- Salon Media Gallery + AI Promo Generator ----------------
_GALLERY_IMG = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "gif": "image/gif"}
_GALLERY_VID = {"mp4": "video/mp4", "mov": "video/quicktime", "webm": "video/webm"}
_MAX_GALLERY_IMG = 5 * 1024 * 1024
_MAX_GALLERY_VID = 25 * 1024 * 1024

async def _store_gallery_media(t, data: bytes, ext: str, mime: str, kind: str, caption: str, source: str, uploaded_by: str, filename: str = ""):
    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/tenants/{t['id']}/gallery/{file_id}.{ext}"
    try:
        result = _put_object(storage_path, data, mime)
    except requests.HTTPError as e:
        raise HTTPException(400, f"Storage upload failed: {e}") from e
    await _raw_db.uploads.insert_one({
        "id": file_id, "tenant_id": t["id"], "kind": "gallery",
        "storage_path": result.get("path", storage_path),
        "original_filename": filename or f"{file_id}.{ext}",
        "content_type": mime, "size": len(data), "uploaded_by": uploaded_by,
        "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    doc = {"id": file_id, "url": f"/api/files/{file_id}", "kind": kind, "caption": caption,
           "source": source, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.gallery.insert_one(doc)
    return _clean(doc)

@api.post("/gallery/upload")
async def gallery_upload(file: UploadFile = File(...), caption: str = Query("", max_length=200),
                         user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    if ext in _GALLERY_IMG:
        kind, mime, cap = "image", _GALLERY_IMG[ext], _MAX_GALLERY_IMG
    elif ext in _GALLERY_VID:
        kind, mime, cap = "video", _GALLERY_VID[ext], _MAX_GALLERY_VID
    else:
        raise HTTPException(400, "Allowed: JPG, PNG, WebP, GIF images or MP4, MOV, WebM videos")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    if kind == "image":
        validate_image_bytes(ext, data)
    if len(data) > cap:
        raise HTTPException(413, f"Too large — max {cap // (1024 * 1024)}MB for {kind}s")
    return await _store_gallery_media(t, data, ext, mime, kind, caption, "upload", user["id"], file.filename or "")

class PromoGenIn(BaseModel):
    prompt: str = Field(..., min_length=5, max_length=500)

@api.post("/gallery/generate")
async def gallery_generate(body: PromoGenIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    gen = OpenAIImageGeneration(api_key=key)
    full_prompt = (f"Professional social-media promotional image for an Indian beauty salon named '{t.get('name', 'the salon')}'. "
                   f"{body.prompt}. Elegant premium salon aesthetic, warm lighting, clean composition; "
                   f"if text is included keep it minimal and legible.")
    try:
        images = await gen.generate_images(prompt=full_prompt, model="gpt-image-1", number_of_images=1)
    except Exception as e:
        raise HTTPException(400, f"Image generation failed: {e}")
    if not images:
        raise HTTPException(400, "No image was generated")
    return await _store_gallery_media(t, images[0], "png", "image/png", "image", body.prompt, "ai", user["id"])

@api.get("/gallery")
async def list_gallery(user=Depends(get_current_user)):
    return await db.gallery.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api.delete("/gallery/{gid}")
async def delete_gallery_item(gid: str, user=Depends(require_tenant_admin)):
    await db.gallery.delete_one({"id": gid})
    await _raw_db.uploads.update_one({"id": gid}, {"$set": {"is_deleted": True}})
    return {"ok": True}

# ---------------- Packages, Memberships & Coupons ----------------
class PackageIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    price: float = Field(..., gt=0)
    service_id: str
    sessions: int = Field(..., ge=1, le=100)
    validity_days: int = Field(365, ge=1, le=1825)
    active: bool = True

class MembershipIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    price: float = Field(..., gt=0)
    discount_pct: float = Field(..., gt=0, le=90)
    validity_days: int = Field(180, ge=1, le=1825)
    active: bool = True

class CouponIn(BaseModel):
    code: str = Field(..., min_length=3, max_length=20)
    type: str = "percent"  # percent | flat
    value: float = Field(..., gt=0)
    expires_at: Optional[str] = None  # YYYY-MM-DD
    max_uses: Optional[int] = Field(None, ge=1)
    active: bool = True

    @field_validator("value")
    @classmethod
    def _value(cls, v, info):
        if info.data.get("type") == "percent" and v > 100:
            raise ValueError("Percent discount cannot exceed 100")
        return v

    @field_validator("code")
    @classmethod
    def _code(cls, v):
        v = v.strip().upper()
        if not re.fullmatch(r"[A-Z0-9]{3,20}", v):
            raise ValueError("Code must be 3-20 letters/digits")
        return v

    @field_validator("type")
    @classmethod
    def _type(cls, v):
        if v not in ("percent", "flat"):
            raise ValueError("type must be percent or flat")
        return v

@api.get("/packages")
async def list_packages(user=Depends(get_current_user)):
    return await db.packages.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)

@api.post("/packages")
async def create_package(body: PackageIn, user=Depends(require_tenant_admin)):
    svc = await db.services.find_one({"id": body.service_id}, {"_id": 0, "name": 1})
    if not svc:
        raise HTTPException(400, "Service not found")
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "service_name": svc["name"],
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.packages.insert_one(doc)
    return _clean(doc)

@api.put("/packages/{pid}")
async def update_package(pid: str, body: PackageIn, user=Depends(require_tenant_admin)):
    svc = await db.services.find_one({"id": body.service_id}, {"_id": 0, "name": 1})
    if not svc:
        raise HTTPException(400, "Service not found")
    await db.packages.update_one({"id": pid}, {"$set": {**body.model_dump(), "service_name": svc["name"]}})
    return await db.packages.find_one({"id": pid}, {"_id": 0})

@api.delete("/packages/{pid}")
async def delete_package(pid: str, user=Depends(require_tenant_admin)):
    await db.packages.delete_one({"id": pid})
    return {"ok": True}

@api.get("/memberships")
async def list_memberships(user=Depends(get_current_user)):
    return await db.memberships.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)

@api.post("/memberships")
async def create_membership(body: MembershipIn, user=Depends(require_tenant_admin)):
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.memberships.insert_one(doc)
    return _clean(doc)

@api.put("/memberships/{mid}")
async def update_membership(mid: str, body: MembershipIn, user=Depends(require_tenant_admin)):
    await db.memberships.update_one({"id": mid}, {"$set": body.model_dump()})
    return await db.memberships.find_one({"id": mid}, {"_id": 0})

@api.delete("/memberships/{mid}")
async def delete_membership(mid: str, user=Depends(require_tenant_admin)):
    await db.memberships.delete_one({"id": mid})
    return {"ok": True}

@api.get("/coupons")
async def list_coupons(user=Depends(get_current_user)):
    return await db.coupons.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api.post("/coupons")
async def create_coupon(body: CouponIn, user=Depends(require_tenant_admin)):
    if await db.coupons.find_one({"code": body.code}, {"_id": 0, "id": 1}):
        raise HTTPException(400, f"Coupon '{body.code}' already exists")
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "used_count": 0,
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.coupons.insert_one(doc)
    return _clean(doc)

@api.put("/coupons/{cid}")
async def update_coupon(cid: str, body: CouponIn, user=Depends(require_tenant_admin)):
    dup = await db.coupons.find_one({"code": body.code, "id": {"$ne": cid}}, {"_id": 0, "id": 1})
    if dup:
        raise HTTPException(400, f"Coupon '{body.code}' already exists")
    await db.coupons.update_one({"id": cid}, {"$set": body.model_dump()})
    return await db.coupons.find_one({"id": cid}, {"_id": 0})

@api.delete("/coupons/{cid}")
async def delete_coupon(cid: str, user=Depends(require_tenant_admin)):
    await db.coupons.delete_one({"id": cid})
    return {"ok": True}

@api.get("/customers/{cid}/benefits")
async def customer_benefits(cid: str, user=Depends(get_current_user), t=Depends(current_tenant)):
    cust = await db.customers.find_one({"id": cid}, {"_id": 0, "loyalty_points": 1, "referral_credit": 1, "dob": 1, "anniversary": 1})
    if cust is None:
        raise HTTPException(404, "Customer not found")
    now = datetime.now(timezone.utc).isoformat()
    pkgs = await db.customer_packages.find(
        {"customer_id": cid, "sessions_left": {"$gt": 0}, "expires_at": {"$gt": now}}, {"_id": 0}).to_list(50)
    membership = await _active_membership(cid)

    def _within_week(datestr):
        if not datestr:
            return False
        try:
            m, d = int(str(datestr)[5:7]), int(str(datestr)[8:10])
            today = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
            this_year = today.replace(month=m, day=d, hour=0, minute=0, second=0, microsecond=0)
            return abs((this_year - today).days) <= 7
        except Exception:
            return False

    return {"loyalty_points": int(cust.get("loyalty_points") or 0),
            "referral_credit": float(cust.get("referral_credit") or 0),
            "packages": pkgs, "membership": membership,
            "loyalty_rules": _loyalty_rules(t),
            "birthday_week": _within_week(cust.get("dob")),
            "anniversary_week": _within_week(cust.get("anniversary"))}

@api.get("/public/coupon-check/{slug}/{code}")
async def public_coupon_check(slug: str, code: str, request: Request):
    await resolve_tenant_from_slug(slug)
    public_rate_limit(request, key_suffix=f"coupon:{slug}", limit=20, window_sec=600)
    c = await _validate_coupon(code)
    return {"valid": True, "code": c["code"], "type": c["type"], "value": c["value"]}

@api.get("/public/availability/{slug}")
async def public_availability(slug: str, date: str, staff_id: Optional[str] = None):
    await resolve_tenant_from_slug(slug)
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        raise HTTPException(400, "date must be YYYY-MM-DD")
    # Stylist-level: a specific stylist has capacity 1; "Any" uses full staff count.
    appt_q = {"scheduled_at": {"$regex": f"^{date}"}, "status": {"$nin": ["cancelled", "no_show"]}}
    if staff_id:
        appt_q["staff_id"] = staff_id
        capacity = 1
    else:
        capacity = await db.staff.count_documents({"active": True}) or 1
    appts = await db.appointments.find(appt_q, {"_id": 0, "scheduled_at": 1, "duration_min": 1}).to_list(500)
    parsed = []
    for a in appts:
        try:
            ast = datetime.fromisoformat(a["scheduled_at"])
            if ast.tzinfo is None:
                ast = ast.replace(tzinfo=timezone.utc)
            parsed.append((ast, ast + timedelta(minutes=int(a.get("duration_min") or 30))))
        except ValueError:
            continue
    slots = {}
    for hhmm in _SLOT_TIMES:
        s = datetime.fromisoformat(f"{date}T{hhmm}:00+05:30")
        e = s + timedelta(minutes=30)
        busy = sum(1 for ast, aen in parsed if ast < e and aen > s)
        slots[hhmm] = busy < capacity
    return {"date": date, "staff_count": capacity, "slots": slots}

# ---------------- Public AI Beauty Advisor (recommends + books) ----------------
_BOOK_MARKER = "[[BOOK]]"

class PublicAIChatIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    session_id: str = Field(..., min_length=8, max_length=64)

async def _booking_catalog(t) -> str:
    today_iso = datetime.now(timezone(timedelta(hours=5, minutes=30))).date().isoformat()
    services, staff, coupons, pkgs, mems, products, leaves = await asyncio.gather(
        db.services.find({"active": True}, {"_id": 0}).to_list(200),
        db.staff.find({"active": True}, {"_id": 0, "id": 1, "name": 1, "role": 1, "tags": 1}).to_list(50),
        db.coupons.find({"active": True}, {"_id": 0}).to_list(50),
        db.packages.find({"active": True}, {"_id": 0}).to_list(50),
        db.memberships.find({"active": True}, {"_id": 0}).to_list(50),
        db.products.find({}, {"_id": 0, "name": 1, "category": 1, "price": 1, "stock": 1}).to_list(100),
        db.leave_requests.find(
            {"status": "approved", "from_date": {"$lte": today_iso}, "to_date": {"$gte": today_iso}},
            {"_id": 0, "staff_name": 1, "to_date": 1}).to_list(50),
    )
    svc_lines = "\n".join(
        f"- id={s['id']} | {s['name']} | {s.get('category', '')} | ₹{s['price']} | {s['duration_min']}min"
        for s in services) or "(no services listed)"
    staff_lines = "\n".join(
        f"- {s['name']} (id={s['id']}) — {s.get('role') or 'Stylist'}"
        + (f" | specialties: {', '.join(s['tags'])}" if s.get("tags") else "")
        for s in staff) or "- any available stylist"
    on_leave = {(lv.get("staff_name") or "").strip() for lv in leaves if lv.get("staff_name")}
    leave_line = (
        "STAFF ON LEAVE TODAY (do NOT offer them for today's bookings; they're back after their leave): "
        + ", ".join(f"{lv['staff_name']} (till {lv['to_date']})" for lv in leaves)
        if on_leave else "STAFF ON LEAVE TODAY: none — full team available.")
    today = datetime.now(timezone.utc).date().isoformat()
    live_coupons = [c for c in coupons
                    if (not c.get("expires_at") or c["expires_at"] >= today)
                    and (not c.get("max_uses") or int(c.get("used_count") or 0) < int(c["max_uses"]))]
    offer_lines = "\n".join(
        f"- Code {c['code']}: {int(c['value'])}% off" if c["type"] == "percent" else f"- Code {c['code']}: ₹{int(c['value'])} off"
        for c in live_coupons) or "(none currently)"
    pkg_lines = "\n".join(
        f"- {p['name']}: {p['sessions']}× {p.get('service_name', '')} for ₹{int(p['price'])} (valid {p.get('validity_days', 365)} days)"
        for p in pkgs) or "(none currently)"
    mem_lines = "\n".join(
        f"- {m['name']}: {int(m['discount_pct'])}% off all services for ₹{int(m['price'])} ({m.get('validity_days', 180)} days)"
        for m in mems) or "(none currently)"
    prod_lines = "\n".join(
        f"- {p['name']}{' (' + p['category'] + ')' if p.get('category') else ''} — ₹{int(p.get('price') or 0)}"
        + (" | in stock" if int(p.get("stock") or 0) > 0 else " | currently out of stock")
        for p in products) or "(no retail products listed)"
    ist_now = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    # Slot availability for the next 3 days so Mira never offers a full time.
    days = [(ist_now + timedelta(days=d)).date().isoformat() for d in range(3)]
    free_lists = await asyncio.gather(*[_free_slots_for(d) for d in days])
    avail_lines = "\n".join(
        f"- {d}: {', '.join(fl) if fl else 'FULLY BOOKED — do not offer this day'}"
        for d, fl in zip(days, free_lists))
    return (f"Salon: {t.get('name')}{', ' + t['location'] if t.get('location') else ''}. Hours: {t.get('hours')}. "
            f"Phone: {t.get('phone') or 'ask at the salon'}. "
            f"Current date & time (IST): {ist_now.strftime('%A %Y-%m-%d %H:%M')}.\n"
            f"SERVICE MENU:\n{svc_lines}\nOUR TEAM OF EXPERTS:\n{staff_lines}\n{leave_line}\n"
            f"OPEN TIME SLOTS (only ever offer/confirm a time from this list — others are full):\n{avail_lines}\n"
            f"CURRENT OFFERS (coupon codes customers can apply):\n{offer_lines}\n"
            f"PACKAGES (bought at the salon):\n{pkg_lines}\nMEMBERSHIPS (bought at the salon):\n{mem_lines}\n"
            f"RETAIL PRODUCTS (guests can buy these at the salon — recommend when relevant to their concern):\n{prod_lines}")

async def _ai_execute_booking(payload: str):
    """Parse the AI's booking JSON and create a real appointment.
    Returns (booking, error, requested_date)."""
    import json as _json
    req_date = None
    try:
        data = _json.loads(payload.strip().strip("`").strip())
        req_date = data.get("date")
        scheduled_at = f"{data['date']}T{data['time']}:00+05:30"
        bk = PublicBookingIn(
            customer_name=data["customer_name"], customer_phone=data["customer_phone"],
            gender=data.get("gender"), service_ids=data["service_ids"],
            staff_id=data.get("staff_id") or None, scheduled_at=scheduled_at,
            notes="Booked via AI advisor chat")
    except Exception as e:
        msg = str(e)
        if hasattr(e, "errors"):
            try:
                msg = "; ".join(err.get("msg", "") for err in e.errors())
            except Exception:
                pass
        return None, msg, req_date
    services = await db.services.find({"id": {"$in": bk.service_ids}, "active": True}, {"_id": 0}).to_list(50)
    if not services:
        return None, "Selected services were not found on the menu", req_date
    try:
        staff = await _resolve_staff(bk.staff_id, bk.scheduled_at, sum(s["duration_min"] for s in services) or 30)
        cust, _ = await _resolve_or_create_customer(bk)
        appt, total, duration = await _create_public_appointment(cust, staff, services, bk)
    except HTTPException as e:
        return None, str(e.detail), req_date
    return {"customer_name": cust["name"], "staff_name": staff["name"],
            "service_names": [s["name"] for s in services], "total": total,
            "duration_min": duration, "scheduled_at": bk.scheduled_at}, None, req_date

async def _free_slots_for(date: str) -> list[str]:
    """Return the list of 'HH:MM' slots still open on a given YYYY-MM-DD (IST)."""
    if not date or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        return []
    staff_count = await db.staff.count_documents({"active": True}) or 1
    appts = await db.appointments.find(
        {"scheduled_at": {"$regex": f"^{date}"}, "status": {"$nin": ["cancelled", "no_show"]}},
        {"_id": 0, "scheduled_at": 1, "duration_min": 1}).to_list(500)
    parsed = []
    for a in appts:
        try:
            ast = datetime.fromisoformat(a["scheduled_at"])
            if ast.tzinfo is None:
                ast = ast.replace(tzinfo=timezone.utc)
            parsed.append((ast, ast + timedelta(minutes=int(a.get("duration_min") or 30))))
        except ValueError:
            continue
    free = []
    for hhmm in _SLOT_TIMES:
        s = datetime.fromisoformat(f"{date}T{hhmm}:00+05:30")
        e = s + timedelta(minutes=30)
        if sum(1 for ast, aen in parsed if ast < e and aen > s) < staff_count:
            free.append(hhmm)
    return free

async def _public_ai_reply(t, session_id: str, message: str):
    """Shared Mira pipeline for text + voice. Returns (reply, booking, booking_error)."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    sid = f"pub-{t['id']}-{session_id}"
    hist = await _raw_db.public_ai_messages.find({"sid": sid}, {"_id": 0}).sort("created_at", 1).to_list(40)
    catalog = await _booking_catalog(t)
    chat = LlmChat(
        api_key=key, session_id=f"{sid}-{uuid.uuid4().hex[:8]}",
        system_message=(
            f"You are Mira, the expert AI beauty consultant on the online booking page of '{t.get('name', 'the salon')}'. "
            "You are warm, gracious and extremely polite — like the most caring senior beautician who treats every guest like a VIP.\n\n"
            "LANGUAGE RULE (VERY IMPORTANT): detect the language of each customer message and ALWAYS reply in that SAME language and script — "
            "English, Hindi (देवनागरी), Kannada (ಕನ್ನಡ), Tamil, Telugu, Malayalam, Marathi, Bengali, Urdu (اردو), or Hinglish/Kanglish in Latin script. "
            "If they switch languages mid-chat, switch with them instantly. Keep service names from the menu as-is but explain around them in their language.\n"
            "GREETING FLOW: at the very start of a conversation, warmly ask (in the customer's language): 'May I know your name, please?'. "
            f"When the customer tells you their name, reply: 'Welcome to Mira chat bot, [Name]! 💖 Thank you for choosing {t.get('name', 'our salon')}. How may I help you today?' and then assist them. "
            "Use their name naturally afterwards. Never repeat the welcome once given. "
            "ASK FOR THE NAME AT MOST ONCE — if their reply contains anything that could plausibly be a name (any language/script), accept it warmly and move on; NEVER ask for the name a second time.\n"
            "1) EXPERT BEAUTY ADVICE — give specific, detailed, professional recommendations for ANY beauty question: "
            "skin tone (fair, wheatish, dusky, deep), skin type (oily/dry/combination/sensitive), hair type (straight/wavy/curly, thin/thick), "
            "concerns (acne, tanning, pigmentation, dandruff, hair fall, frizz, dullness, aging), ingredients (vitamin C, niacinamide, hyaluronic acid, keratin, argan oil), "
            "aftercare routines, and product guidance. Explain WHY a treatment suits them in 1-2 lines. Ask 1-2 short questions if you need more info.\n"
            "2) MENU MATCHING — when recommending treatments, first check the SERVICE MENU below and quote exact ₹ prices. "
            "NEVER say 'we don't have that' bluntly. If something isn't listed yet, still give full expert advice about it, "
            "then gracefully suggest the CLOSEST service we do offer, and politely add they can tap the 'Message Salon' tab to ask the owner directly.\n"
            "3) OFFERS & PACKAGES — if the customer asks about offers, discounts, packages or memberships: share the CURRENT OFFERS / PACKAGES / MEMBERSHIPS listed below if any exist. "
            "If none exist, say warmly: 'I'm so sorry, currently we are not running any offers — but we will make sure to create a special package for you once you visit our salon 😊'. "
            "If a coupon code exists, tell them the code and that they can apply it while booking.\n"
            "4) SALON QUESTIONS — answer anything about the salon (timings, location, phone, stylists, prices) using the details below, always politely. "
            "If you genuinely don't know something, warmly direct them to the 'Message Salon' tab or the salon phone — never guess facts about the salon.\n"
            "5) BOOK APPOINTMENTS — you can book directly. Collect: full name, phone number (7-15 digits), chosen service(s) from the menu, "
            "preferred date and time (salon is open 10:00–21:00 IST; suggest tomorrow if they're unsure). "
            "When you have ALL details, show a one-line summary (services, total ₹, date, time) and ask them to confirm.\n"
            "6) SMART UPSELL — when the customer has chosen their service(s) and BEFORE asking for final confirmation, suggest exactly ONE complementary add-on from the menu "
            "(e.g. 'Would you like to add a Pedicure for just ₹500 more? ✨'). Suggest it only ONCE — if they decline or ignore it, proceed graciously without repeating.\n"
            "7) EXPERT SELECTION — OUR TEAM OF EXPERTS (with their specialties) is listed below. While booking, ask warmly: "
            "'Which of our experts would you like for your service?' and mention the experts by name whose specialty matches "
            "(e.g. nails → the nail expert, hair → the hair expert). If the guest is new or unsure, say something like "
            "'Since it's your first time, I'd suggest [Name] — our [specialty] expert, you'll be in great hands! ✨'. "
            "Put the chosen expert's id in staff_id in the booking JSON; if they truly have no preference, use null. Never invent staff names.\n"
            "CRITICAL MEMORY RULE: carefully re-read the conversation history before replying and NEVER re-ask for anything the customer already told you "
            "(chosen services, name, phone, date, time, skin/hair details). If earlier they picked services and now send name+phone+time, go straight to the summary + confirmation.\n"
            f"ONLY after the customer explicitly confirms, end your reply with one line in EXACTLY this format (double quotes, valid JSON):\n"
            f'{_BOOK_MARKER}{{"customer_name":"...","customer_phone":"...","gender":"Female","service_ids":["<id from menu>"],"staff_id":null,"date":"YYYY-MM-DD","time":"HH:MM"}}\n'
            "Rules: never mention the marker or JSON (it is machine-read); never invent service ids; time is 24h format; "
            "keep replies short, warm and mobile-friendly (short paragraphs or dash lists; you may use **bold** for service names and prices, no other markdown); use ₹ for prices; sprinkle a tasteful emoji occasionally (✨💆‍♀️); "
            "never be dismissive — every reply should leave the guest feeling cared for.\n\n" + catalog
        ),
    ).with_model("openai", "gpt-5.4-mini")
    if hist:
        transcript = "\n".join(f"{'Customer' if h['role'] == 'user' else 'Mira'}: {h['content']}" for h in hist[-24:])
        prompt_text = (f"CONVERSATION SO FAR (remember every detail the customer already shared — do NOT re-ask):\n{transcript}\n\n"
                       f"Customer's new message: {message}")
    else:
        prompt_text = message
    try:
        resp = await chat.send_message(UserMessage(text=prompt_text))
        reply = resp if isinstance(resp, str) else str(resp)
    except Exception as e:
        logging.getLogger("public_ai").error(f"public ai chat error: {e}")
        raise HTTPException(400, "Mira is unavailable right now — please try again in a moment.")

    booking, booking_error = None, None
    if _BOOK_MARKER in reply:
        text, _, payload = reply.partition(_BOOK_MARKER)
        booking, booking_error, req_date = await _ai_execute_booking(payload)
        text = text.strip()
        if booking:
            reply = (text + "\n\n✅ Done — your appointment is booked! The salon will confirm shortly.").strip()
        else:
            # Booking FAILED — never keep the model's premature "confirmed" text.
            # Apologise and, if the slot was full, offer the times that are actually free.
            free = await _free_slots_for(req_date) if req_date else []
            if free:
                shown = ", ".join(free[:8])
                reply = (f"I'm so sorry — that time slot just got fully booked 🙏\n\n"
                         f"Here are the open times for {req_date}: {shown}.\n"
                         f"Which one shall I book for you? ✨")
            else:
                reply = (f"I'm so sorry — I couldn't complete that booking ({booking_error}). "
                         f"Could we try a different date or time? I'll get you in as soon as possible 💖")
    now = datetime.now(timezone.utc).isoformat()
    await _raw_db.public_ai_messages.insert_many([
        {"id": str(uuid.uuid4()), "sid": sid, "tenant_id": t["id"], "role": "user", "content": message, "created_at": now},
        {"id": str(uuid.uuid4()), "sid": sid, "tenant_id": t["id"], "role": "assistant",
         "content": reply + (" [Appointment booked]" if booking else ""), "created_at": datetime.now(timezone.utc).isoformat()},
    ])
    return reply, booking, booking_error

@api.post("/public/ai-chat/{slug}")
async def public_ai_chat(slug: str, body: PublicAIChatIn, request: Request):
    t = await resolve_tenant_from_slug(slug)
    public_rate_limit(request, key_suffix=f"aichat:{slug}", limit=40, window_sec=600)
    reply, booking, booking_error = await _public_ai_reply(t, body.session_id, body.message)
    return {"reply": reply, "booking": booking, "booking_error": booking_error}

@api.post("/public/ai-voice/{slug}")
async def public_ai_voice(slug: str, request: Request, audio: UploadFile = File(...), session_id: str = Form(..., min_length=8, max_length=64)):
    from emergentintegrations.llm.openai import OpenAISpeechToText
    t = await resolve_tenant_from_slug(slug)
    public_rate_limit(request, key_suffix=f"aivoice:{slug}", limit=30, window_sec=600)
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    data = await audio.read()
    if not data:
        raise HTTPException(400, "Empty audio")
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(413, "Audio too large — keep it under a minute")
    buf = io.BytesIO(data)
    ext = (audio.filename or "voice.webm").rsplit(".", 1)[-1].lower()
    buf.name = f"voice.{ext if ext in ('webm', 'mp3', 'mp4', 'wav', 'm4a', 'mpeg', 'mpga') else 'webm'}"
    stt = OpenAISpeechToText(api_key=key)
    try:
        # Bias prompt helps Whisper with Indian multilingual salon vocabulary (auto language detect).
        tr = await stt.transcribe(
            file=buf, model="whisper-1", response_format="json",
            prompt="Indian salon booking call. ग्राहक हिंदी या English में बोलते हैं: हेयरकट, फेशियल, कीमत, बुकिंग. Beauty terms: haircut, facial, keratin, mehendi, pedicure.")
        transcript = (tr.text or "").strip()
    except Exception as e:
        logging.getLogger("public_ai").error(f"stt error: {e}")
        raise HTTPException(400, "Sorry, I couldn't hear that — please try again.")
    if not transcript:
        raise HTTPException(400, "I couldn't hear anything — please speak again.")
    reply, booking, booking_error = await _public_ai_reply(t, session_id, transcript)
    audio_b64 = None
    try:
        speech_text = re.sub(r"\*\*|✨|💖|💆‍♀️|✅|⚠️|📞|🙏", "", reply)[:4000]
        audio_b64 = await _tts_cached_speech(speech_text, voice="shimmer", speed=1.0)
    except Exception as e:
        logging.getLogger("public_ai").error(f"tts error: {e}")
    return {"transcript": transcript, "reply": reply, "booking": booking,
            "booking_error": booking_error, "audio_b64": audio_b64}

# ---------------- Customer ↔ Salon Owner Chat ----------------
class ChatStartIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    phone: str
    # SEC-001: a client-owned secret binds a chat thread to the device that created it,
    # so history is NOT retrievable by merely knowing a victim's phone number.
    session_key: str = Field(..., min_length=16, max_length=64)

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        cleaned = "".join(c for c in v if c.isdigit())
        if not re.fullmatch(r"\d{7,15}", cleaned):
            raise ValueError("Enter a valid phone number (7-15 digits)")
        return cleaned

    @field_validator("session_key")
    @classmethod
    def _skey(cls, v):
        if not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", v):
            raise ValueError("Invalid session key")
        return v

class ChatSendIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)

async def _append_chat_message(thread_id: str, sender: str, text: str) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    msg = {"id": str(uuid.uuid4()), "thread_id": thread_id, "sender": sender, "text": text, "created_at": now}
    await db.chat_messages.insert_one(msg)
    unread_field = "unread_admin" if sender == "customer" else "unread_customer"
    await db.chat_threads.update_one(
        {"id": thread_id},
        {"$set": {"last_message": text[:120], "last_at": now}, "$inc": {unread_field: 1}})
    return _clean(msg)

@api.post("/public/chat/{slug}/start")
async def public_chat_start(slug: str, body: ChatStartIn, request: Request):
    await resolve_tenant_from_slug(slug)
    public_rate_limit(request, key_suffix=f"chatstart:{slug}", limit=10, window_sec=600)
    # SEC-001: look up the thread by the caller's secret session_key, NOT by phone.
    # An attacker entering a victim's phone gets a fresh empty thread (their own key),
    # never the victim's history. The owner still sees every thread in the admin panel.
    th = await db.chat_threads.find_one({"session_key": body.session_key}, {"_id": 0})
    if not th:
        now = datetime.now(timezone.utc).isoformat()
        th = {"id": str(uuid.uuid4()), "session_key": body.session_key,
              "customer_name": body.name.strip(), "customer_phone": body.phone,
              "last_message": "", "last_at": now, "unread_admin": 0, "unread_customer": 0, "created_at": now}
        await db.chat_threads.insert_one(th)
        th.pop("_id", None)
    else:
        upd = {}
        if body.name.strip() and body.name.strip() != th.get("customer_name"):
            upd["customer_name"] = body.name.strip()
        if body.phone != th.get("customer_phone"):
            upd["customer_phone"] = body.phone
        if upd:
            await db.chat_threads.update_one({"id": th["id"]}, {"$set": upd})
            th.update(upd)
    msgs = await db.chat_messages.find({"thread_id": th["id"]}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return {"thread_id": th["id"], "customer_name": th["customer_name"], "messages": msgs}

@api.get("/public/chat/{slug}/{thread_id}")
async def public_chat_poll(slug: str, thread_id: str):
    await resolve_tenant_from_slug(slug)
    th = await db.chat_threads.find_one({"id": thread_id}, {"_id": 0})
    if not th:
        raise HTTPException(404, "Chat not found")
    await db.chat_threads.update_one({"id": thread_id}, {"$set": {"unread_customer": 0}})
    msgs = await db.chat_messages.find({"thread_id": thread_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return {"messages": msgs}

@api.post("/public/chat/{slug}/{thread_id}/send")
async def public_chat_send(slug: str, thread_id: str, body: ChatSendIn, request: Request):
    await resolve_tenant_from_slug(slug)
    public_rate_limit(request, key_suffix=f"chatsend:{slug}", limit=30, window_sec=600)
    th = await db.chat_threads.find_one({"id": thread_id}, {"_id": 0})
    if not th:
        raise HTTPException(404, "Chat not found")
    return await _append_chat_message(thread_id, "customer", body.message.strip())

@api.get("/owner-chats")
async def owner_chats(user=Depends(require_tenant_admin)):
    return await db.chat_threads.find({}, {"_id": 0, "session_key": 0}).sort("last_at", -1).to_list(200)

@api.get("/owner-chats/unread-count")
async def owner_chats_unread(user=Depends(require_tenant_admin)):
    rows = await db.chat_threads.find({"unread_admin": {"$gt": 0}}, {"_id": 0, "unread_admin": 1}).to_list(500)
    return {"unread": sum(int(r.get("unread_admin") or 0) for r in rows)}

@api.get("/owner-chats/{thread_id}/messages")
async def owner_chat_messages(thread_id: str, user=Depends(require_tenant_admin)):
    th = await db.chat_threads.find_one({"id": thread_id}, {"_id": 0, "session_key": 0})
    if not th:
        raise HTTPException(404, "Chat not found")
    await db.chat_threads.update_one({"id": thread_id}, {"$set": {"unread_admin": 0}})
    msgs = await db.chat_messages.find({"thread_id": thread_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return {"thread": th, "messages": msgs}

@api.post("/owner-chats/{thread_id}/reply")
async def owner_chat_reply(thread_id: str, body: ChatSendIn, user=Depends(require_tenant_admin)):
    th = await db.chat_threads.find_one({"id": thread_id}, {"_id": 0})
    if not th:
        raise HTTPException(404, "Chat not found")
    return await _append_chat_message(thread_id, "owner", body.message.strip())


from routes.sales import router as sales_router  # Sales Mira chat + tenant inquiries
api.include_router(sales_router)


from routes.registry import (  # noqa: E402 — registry module (routes/registry.py)
    router as registry_router, _aadhaar_fp, _safe_fetch_image_bytes,
)
api.include_router(registry_router)

from routes.appointments_pos import router as appointments_pos_router  # noqa: E402
api.include_router(appointments_pos_router)

from routes.mira_studio import router as mira_studio_router  # noqa: E402 — multi-agent marketing suite
api.include_router(mira_studio_router)

from routes.social_connect import router as social_connect_router  # noqa: E402 — Meta/Google OAuth + publishing
api.include_router(social_connect_router)

from routes.mira_calendar import router as mira_calendar_router  # noqa: E402 — AI content calendar
api.include_router(mira_calendar_router)

from routes.mira_autopilot import router as mira_autopilot_router, autopilot_scheduler  # noqa: E402 — autonomous daily marketing
api.include_router(mira_autopilot_router)

from routes.promo_video import router as promo_video_router, weekly_promo_scheduler  # noqa: E402 — super-admin promo reel generator
api.include_router(promo_video_router)
from routes.platform_tools import router as platform_tools_router  # noqa: E402 — super-admin load metrics + DB browser
api.include_router(platform_tools_router)
from routes.promo_image import router as promo_image_router  # noqa: E402 — super-admin AI poster studio
api.include_router(promo_image_router)

from routes.subscriptions import router as subscriptions_router  # noqa: E402
api.include_router(subscriptions_router)



app.include_router(api)

_cors_env = os.environ.get(
    "CORS_ORIGINS",
    "https://miracurlunisexsaloon.com,https://miracurl.com,https://hair-hub-system.preview.emergentagent.com",
).strip()
_cors_origins = (["*"] if _cors_env == "*" or not _cors_env
                 else [o.strip() for o in _cors_env.split(",") if o.strip()])
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gzip large JSON responses — 8-10x smaller payloads = much faster on mobile networks
from starlette.middleware.gzip import GZipMiddleware  # noqa: E402
app.add_middleware(GZipMiddleware, minimum_size=1500)


# ---------------- Security Headers (SEC-P3) ----------------
# Adds the standard defensive HTTP headers on every API response so a browser
# refuses to iframe, MIME-sniff, or downgrade the connection. CSP is scoped
# to the API side only — the frontend is a separate build.
@app.middleware("http")
async def _security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
    return resp

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')