"""Shared Pydantic schemas + tenant slug resolver (extracted from server.py)."""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException
from pydantic import BaseModel, Field, EmailStr, field_validator

from database import db, _current_tenant_id

# ---------------- Models ----------------

# ============================================================
# MULTI-TENANCY
# ============================================================
DEFAULT_TENANT_SLUG = "miracurl-marathahalli"



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
    business_type: str = Field("salon", pattern="^(salon|restaurant)$")
    trial_months: Optional[int] = None  # 3 | 6 | 9 | 12 — None keeps the platform default trial (days)
    logo_url: Optional[str] = Field(None, max_length=600)
    module_locks: Optional[List[str]] = None  # HQ-unticked modules at onboarding (see services.entitlements.MODULES)

    @field_validator("trial_months")
    @classmethod
    def _trial_months(cls, v):
        if v is not None and v not in (3, 6, 9, 12):
            raise ValueError("Free trial must be 3, 6, 9 or 12 months")
        return v

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
    owner_email_scope: Optional[str] = Field(None, pattern="^(all|this)$")  # shared login: rename for all branches, or own login for this one
    owner_email_takeover: Optional[bool] = None  # convert a manager/staff login using that email into the owner login
    owner_phone: Optional[str] = None
    branch_limit: Optional[int] = None

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
    country_code: Optional[str] = "+91"
    email: Optional[str] = None
    gender: Optional[str] = "Other"
    dob: Optional[str] = None
    anniversary: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    instagram: Optional[str] = None
    facebook: Optional[str] = None
    telegram: Optional[str] = None

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
    bookable_online: bool = True
    gender: str = "unisex"  # male | female | unisex
    veg: Optional[str] = None    # veg | non-veg | egg (restaurant dish tag)
    spice: Optional[int] = None  # 0-3 chilis (restaurant dish tag)
    sold_out_date: Optional[str] = None  # ISO date — dish sold out for that day

class ServiceIn(BaseModel):
    name: str
    category: str
    price: float
    duration_min: int
    description: Optional[str] = None
    image_url: Optional[str] = None
    trending: bool = False
    active: bool = True
    bookable_online: bool = True
    gender: str = "unisex"
    veg: Optional[str] = None
    spice: Optional[int] = None
    sold_out_date: Optional[str] = None

class Staff(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    role: str
    phone: str
    email: Optional[str] = None
    personal_email: Optional[str] = None
    blood_group: Optional[str] = None
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
    week_off_day: Optional[str] = None   # monday..friday — weekly off assigned by admin
    overtime_rate: float = 0.0           # ₹ per hour after shift_end
    max_advance: float = 0.0             # ₹ cap admin allows as monthly advance
    notice_period_days: int = 30
    serving_notice: bool = False
    notice_start_date: Optional[str] = None
    monthly_target: float = 0.0
    target_commission_pct: float = 0.0
    last_working_day: Optional[str] = None
    aadhaar_last4: Optional[str] = None  # only last 4 shown; full number never stored
    aadhaar_hash: Optional[str] = None
    branch: Optional[str] = None         # assigned branch name — drives geo fence + tag

class StaffIn(BaseModel):
    name: str
    role: str
    phone: str
    email: Optional[str] = None
    personal_email: Optional[str] = None
    blood_group: Optional[str] = None
    specialties: List[str] = []
    commission_pct: float = 10.0
    active: bool = True
    image_url: Optional[str] = None
    monthly_base_salary: float = 0.0
    salary_visible: bool = True
    shift_start: str = "10:00"
    shift_end: str = "21:00"
    week_off_day: Optional[str] = None
    overtime_rate: float = 0.0
    max_advance: float = 0.0
    notice_period_days: int = 30
    serving_notice: bool = False
    notice_start_date: Optional[str] = None
    monthly_target: float = 0.0
    target_commission_pct: float = 0.0
    last_working_day: Optional[str] = None
    joining_date: Optional[str] = None
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
    product_type: str = "retail"

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
    product_type: str = "retail"

    @field_validator("product_type")
    @classmethod
    def _ptype(cls, v: str) -> str:
        v = (v or "retail").strip().lower()
        if v not in ("retail", "in_house"):
            raise ValueError("product_type must be 'retail' or 'in_house'")
        return v

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
    disappointed_service: Optional[str] = Field(None, max_length=120)

class ReviewModerateIn(BaseModel):
    public: bool

