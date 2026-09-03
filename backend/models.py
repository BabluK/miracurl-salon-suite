"""Shared Pydantic models used across server.py and routes/ modules."""
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


class Tenant(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    slug: str
    name: str
    owner_email: EmailStr
    location: Optional[str] = None
    phone: Optional[str] = None
    hours: Optional[str] = "Mon–Sun · 10:00 AM – 9:00 PM"
    hero_image: Optional[str] = "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1600"
    google_review_url: Optional[str] = ""
    plan: str = "starter"          # starter | pro | enterprise
    salon_email: Optional[str] = None
    owner_phone: Optional[str] = None   # owner's PERSONAL phone — WhatsApp renewal reminders go here
    status: str = "trial"          # trial | active | suspended | cancelled
    razorpay_subscription_id: Optional[str] = None
    # Tax / GST (off by default — owner must opt-in by filling GST details)
    tax_enabled: bool = False
    gst_number: Optional[str] = None
    gst_legal_name: Optional[str] = None
    tax_pct: float = 0.0
    # Affiliate / Refer-a-salon program (iter 20)
    affiliate_credits: float = 0.0  # ₹ credit pool — applied against next renewal
    referred_by_tenant_id: Optional[str] = None
    trial_ends_at: str = Field(default_factory=lambda: (datetime.now(timezone.utc) + timedelta(days=14)).isoformat())
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ---------------- Credits / rewards constants ----------------
REVIEW_REWARD_CREDITS = {4: 20.0, 5: 30.0}  # ₹ credit by rating
# SEC-002: hard cap on referral/review credits a single customer can accumulate.
# Prevents automated "sign up as new customer, book, refer myself" farming loops.
MAX_CUSTOMER_CREDIT = 2000.0
REFERRAL_REWARD_REFERRER = 100.0  # ₹ credit to referrer
REFERRAL_REWARD_REFERRED = 100.0  # ₹ credit to new customer


class Customer(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: str
    country_code: Optional[str] = "+91"
    email: Optional[str] = None
    gender: Optional[str] = "Other"
    dob: Optional[str] = None
    address: Optional[str] = None
    loyalty_points: int = 0
    total_spent: float = 0.0
    visits: int = 0
    notes: Optional[str] = None
    instagram: Optional[str] = None
    facebook: Optional[str] = None
    telegram: Optional[str] = None
    referral_code: str = Field(default_factory=lambda: secrets.token_urlsafe(4).upper().replace("_", "X").replace("-", "Y")[:6])
    referred_by: Optional[str] = None
    referral_credit: float = 0.0
    crm_status: str = "active"  # "pending" until first completed service (public bookings)
    last_visited: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Appointment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str
    customer_name: str
    staff_id: str
    staff_name: str
    service_ids: List[str]
    service_names: List[str]
    scheduled_at: str  # ISO datetime
    duration_min: int
    status: str = "scheduled"  # scheduled | completed | cancelled | no_show
    notes: Optional[str] = None
    total: float = 0.0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class AppointmentIn(BaseModel):
    customer_id: str
    staff_id: str
    service_ids: List[str]
    scheduled_at: str
    notes: Optional[str] = None


class AppointmentStatusIn(BaseModel):
    status: str


class InvoiceItem(BaseModel):
    type: str  # service | product | package | membership | package_redeem | gift_card
    ref_id: str
    name: str
    qty: int = Field(1, ge=1, le=100)
    price: float = Field(..., ge=0)
    staff_id: Optional[str] = None
    staff_name: Optional[str] = None
    gift_meta: Optional[dict] = None  # gift card sold at POS: occasion/recipient/message


class Invoice(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_no: str
    customer_id: str
    customer_name: str
    staff_id: Optional[str] = None
    staff_name: Optional[str] = None
    items: List[InvoiceItem]
    subtotal: float
    discount: float = 0
    tax: float = 0
    total: float
    payment_mode: str  # cash | card | upi | wallet
    paid: bool = True
    tip: float = 0
    tip_staff_id: Optional[str] = None
    tip_staff_name: Optional[str] = None
    appointment_id: Optional[str] = None
    branch_id: Optional[str] = None
    branch_name: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class InvoiceIn(BaseModel):
    customer_id: str
    staff_id: Optional[str] = None
    items: List[InvoiceItem]
    discount: float = 0
    tax_pct: float = 18.0
    payment_mode: str = "cash"
    redeem_points: int = 0
    coupon_code: Optional[str] = None
    tip_amount: float = Field(0, ge=0, le=100000)
    tip_staff_id: Optional[str] = None
    gift_card_code: Optional[str] = None
    wallet_apply: float = Field(0, ge=0, le=1000000)
    status: str = Field("completed", pattern="^(completed|open)$")
    appointment_id: Optional[str] = None
    branch_id: Optional[str] = None
    force_duplicate: bool = False  # staff confirmed the duplicate-bill warning

