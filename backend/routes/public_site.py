# Extracted from server.py — domain route module (auto-split refactor)
import os  # noqa: F401
import re  # noqa: F401
import io  # noqa: F401
import csv  # noqa: F401
import math  # noqa: F401
import uuid  # noqa: F401
import hmac  # noqa: F401
import hashlib  # noqa: F401
import asyncio  # noqa: F401
import base64  # noqa: F401
import secrets  # noqa: F401
import logging  # noqa: F401
import html as html_lib  # noqa: F401
from datetime import datetime, timezone, timedelta  # noqa: F401
from typing import Dict, List, Optional  # noqa: F401
from urllib.parse import quote, urlparse  # noqa: F401

import requests  # noqa: F401
from fastapi import (  # noqa: F401
    APIRouter, HTTPException, Depends, Request, Response, Query, UploadFile, File, Form,
)
from starlette.responses import StreamingResponse  # noqa: F401
from pydantic import BaseModel, Field, EmailStr, field_validator  # noqa: F401

from database import client, _raw_db, db, _current_tenant_id, _clean  # noqa: F401
from security import (  # noqa: F401
    hash_pw, verify_pw, get_current_user, require_admin, public_rate_limit,
    durable_rate_limit, ai_daily_quota, require_super_admin, require_tenant_admin,
    current_tenant, require_owner_pin, _pin_attempt_guard, _pin_attempt_fail, _pin_attempt_clear,
)
from models import (  # noqa: F401
    Tenant, Customer, Appointment, REVIEW_REWARD_CREDITS, MAX_CUSTOMER_CREDIT,
    REFERRAL_REWARD_REFERRER, REFERRAL_REWARD_REFERRED,
)
from email_service import (  # noqa: F401
    _send_email, _welcome_email_html, _credentials_email_html, _monthly_report_html,
    _weekly_report_html, _birthday_email_html, _platform_digest_html,
)
from services.storage import _put_object, _get_object, _MIME, APP_NAME, validate_image_bytes  # noqa: F401
from services.pdf import _render_salary_slip_pdf, _render_resume_pdf  # noqa: F401
from services.billing import (  # noqa: F401
    _validate_coupon, _consume_coupon, _coupon_discount, _active_membership, _loyalty_rules,
)
from utils import _csv_cell, _csv_row, _read_csv_upload, MAX_CSV_BYTES  # noqa: F401
from schemas import resolve_tenant_from_slug, DEFAULT_TENANT_SLUG

router = APIRouter()


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

    @field_validator("customer_name")
    @classmethod
    def _name(cls, v):
        import unicodedata
        cleaned = v.strip()
        if not (2 <= len(cleaned) <= 80) or not cleaned[0].isalpha():
            raise ValueError("Please enter a valid name (start with a letter)")
        for ch in cleaned:
            if not (ch.isalnum() or ch in " .'-_" or unicodedata.category(ch).startswith("M")):
                raise ValueError("Please enter a valid name (letters, spaces, . ' - only)")
        return cleaned

    @field_validator("customer_phone")
    @classmethod
    def _phone(cls, v):
        cleaned = "".join(c for c in v if c.isdigit())
        if len(cleaned) == 12 and cleaned.startswith("91"):
            cleaned = cleaned[2:]
        elif len(cleaned) == 11 and cleaned.startswith("0"):
            cleaned = cleaned[1:]
        if not re.fullmatch(r"[6-9]\d{9}", cleaned):
            raise ValueError("Enter a valid 10-digit mobile number")
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

@router.get("/public/salons")
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


@router.get("/public/salon/{slug}")
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
        "gallery": [g.get("url", "") for g in (t.get("gallery") or []) if g.get("url")],
        "branches": t.get("branches", []),
    }

# Legacy /public/salon — falls back to default tenant for backward compatibility
@router.get("/public/salon")
async def public_salon_default():
    return await public_salon(DEFAULT_TENANT_SLUG)

@router.get("/public/services/{slug}")
async def public_services(slug: str):
    await resolve_tenant_from_slug(slug)
    from routes.packages import _service_gender
    rows = await db.services.find(
        {"active": {"$ne": False}, "bookable_online": {"$ne": False}}, {"_id": 0}).sort("category", 1).to_list(500)
    for s in rows:
        s["gender"] = _service_gender(s)
    return rows

@router.get("/public/services")
async def public_services_default():
    return await public_services(DEFAULT_TENANT_SLUG)

@router.get("/public/service-categories/{slug}")
async def public_service_categories(slug: str):
    """Category → banner image url map (owner-set overrides; frontend has curated defaults)."""
    await resolve_tenant_from_slug(slug)
    cats = await db.service_categories.find({}, {"_id": 0}).to_list(200)
    return {c["name"]: c.get("image_url", "") for c in cats if c.get("image_url")}

@router.get("/public/service-category-order/{slug}")
async def public_service_category_order(slug: str):
    """Salon's preferred category order for the booking page tabs."""
    await resolve_tenant_from_slug(slug)
    doc = await db.service_category_order.find_one({}, {"_id": 0}) or {}
    return {"order": doc.get("order") or []}

@router.get("/public/staff/{slug}")
async def public_staff(slug: str):
    await resolve_tenant_from_slug(slug)
    return await db.staff.find({"active": True}, {"_id": 0, "email": 0, "phone": 0, "commission_pct": 0}).to_list(500)

@router.get("/public/staff")
async def public_staff_default():
    return await public_staff(DEFAULT_TENANT_SLUG)

@router.get("/public/gallery/{slug}")
async def public_gallery(slug: str):
    await resolve_tenant_from_slug(slug)
    return await db.gallery.find({}, {"_id": 0}).sort("created_at", -1).to_list(24)

@router.get("/public/referral/{slug}/{code}")
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

@router.get("/public/referral/{code}")
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
            if scheduled_at and (s.get("week_off_day") or "").lower() == _weekday_of(scheduled_at):
                raise HTTPException(409, f"{s['name']} is on weekly off that day — please pick another day or choose a different stylist.")
            if scheduled_at and await _staff_busy(s["id"], scheduled_at, duration_min):
                raise HTTPException(409, f"{s['name']} is already booked at that time — please pick another time or choose a different stylist.")
            return s
    candidates = await db.staff.find({"active": True}, {"_id": 0}).to_list(50)
    if scheduled_at:
        wd = _weekday_of(scheduled_at)
        candidates = [c for c in candidates if (c.get("week_off_day") or "").lower() != wd] or candidates
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


@router.post("/public/book/{slug}")
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

    # SMS confirmation for every salon (fire-and-forget, burns 1 sms_point)
    t_doc = await _raw_db.tenants.find_one({"slug": slug}, {"_id": 0, "id": 1, "name": 1, "currency": 1})
    if t_doc:
        from sms_service import send_tenant_sms, sms_configured
        if sms_configured():
            when = appt["scheduled_at"][:16].replace("T", " at ")
            asyncio.create_task(send_tenant_sms(
                t_doc["id"], body.customer_phone,
                f"{t_doc.get('name') or 'Your salon'}: booking confirmed! {', '.join(s['name'] for s in services)} on {when} with {staff['name']}. See you there!",
                kind="booking"))

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

@router.post("/public/book")
async def public_book_default(body: PublicBookingIn, request: Request):
    return await public_book(DEFAULT_TENANT_SLUG, body, request)

@router.get("/public/coupon-check/{slug}/{code}")
async def public_coupon_check(slug: str, code: str, request: Request):
    await resolve_tenant_from_slug(slug)
    public_rate_limit(request, key_suffix=f"coupon:{slug}", limit=20, window_sec=600)
    c = await _validate_coupon(code)
    return {"valid": True, "code": c["code"], "type": c["type"], "value": c["value"]}

_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def _weekday_of(date_str: str) -> str:
    return _WEEKDAYS[datetime.fromisoformat(date_str[:10]).weekday()]


@router.get("/public/availability/{slug}")
async def public_availability(slug: str, date: str, staff_id: Optional[str] = None):
    await resolve_tenant_from_slug(slug)
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        raise HTTPException(400, "date must be YYYY-MM-DD")
    weekday = _weekday_of(date)
    # Stylist-level: a specific stylist has capacity 1; "Any" uses full staff count.
    appt_q = {"scheduled_at": {"$regex": f"^{date}"}, "status": {"$nin": ["cancelled", "no_show"]}}
    if staff_id:
        s = await db.staff.find_one({"id": staff_id}, {"_id": 0, "week_off_day": 1, "name": 1})
        if s and (s.get("week_off_day") or "").lower() == weekday:
            return {"date": date, "staff_count": 0, "week_off": True,
                    "message": f"{s.get('name', 'This stylist')} is on weekly off on {weekday.capitalize()}s — pick another day or stylist.",
                    "slots": {hhmm: False for hhmm in _SLOT_TIMES}}
        appt_q["staff_id"] = staff_id
        capacity = 1
    else:
        capacity = await db.staff.count_documents(
            {"active": True, "week_off_day": {"$ne": weekday}}) or 1
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

