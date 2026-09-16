# Extracted from server.py — domain route module (auto-split refactor)
import os
import re
import uuid
import asyncio
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

from fastapi import (
    APIRouter, HTTPException, Depends, Request,
)
from starlette.responses import RedirectResponse
from pydantic import BaseModel, Field, EmailStr, field_validator

from database import _raw_db, db, _current_tenant_id
from security import (
    public_rate_limit, require_super_admin,
)
from models import (
    Customer, Appointment, MAX_CUSTOMER_CREDIT, REFERRAL_REWARD_REFERRER, REFERRAL_REWARD_REFERRED,
)
from email_service import (
    _send_email,
)
from services.billing import (
    _validate_coupon, _consume_coupon, _coupon_discount,
)
from schemas import resolve_tenant_from_slug, DEFAULT_TENANT_SLUG
from services.billing import _rzp_client
from services.orders import send_order_status_email

router = APIRouter()


# ---------------- Public (no auth) - Customer-facing booking ----------------


class PublicBookingIn(BaseModel):
    customer_name: str = Field(..., min_length=2, max_length=80)
    customer_phone: str
    customer_email: Optional[EmailStr] = None
    gender: Optional[str] = None
    service_ids: List[str] = Field(default_factory=list)
    staff_id: Optional[str] = None
    scheduled_at: str
    notes: Optional[str] = Field(None, max_length=500)
    referral_code: Optional[str] = None
    coupon_code: Optional[str] = None
    color_code: Optional[str] = Field(None, max_length=8)  # hair colour try-on pick code
    party_size: Optional[int] = Field(None, ge=1, le=30)
    seating: Optional[str] = Field(None, pattern="^(any|indoor|outdoor)$")
    branch_id: Optional[str] = Field(None, max_length=64)  # which location the guest picked ("main" = head salon)

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
        # Per-salon business hours are enforced in the booking endpoint (tenant context needed there).
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
        filt, {"_id": 0, "name": 1, "slug": 1, "location": 1, "hero_image": 1,
               "logo_url": 1, "business_type": 1, "google_rating_cache": 1, "trusted_badge": 1}
    ).sort("name", 1).to_list(limit)


async def _google_live_rating(t: dict) -> dict | None:
    """LIVE Google rating for the badge (Places API) — cached on the tenant doc for 24h."""
    key = os.environ.get("GOOGLE_MAPS_API_KEY", "")
    if not key:
        return None
    cache = t.get("google_rating_cache") or {}
    fresh_after = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    if cache.get("fetched_at", "") > fresh_after:
        return {"avg": cache["avg"], "count": cache["count"], "source": "google"} if cache.get("avg") else None
    query = f"{(t.get('name') or '').replace('-', ' ')} {t.get('location') or ''}".strip()
    try:
        import httpx
        async with httpx.AsyncClient(timeout=8) as hc:
            r = await hc.post(
                "https://places.googleapis.com/v1/places:searchText",
                headers={"Content-Type": "application/json", "X-Goog-Api-Key": key,
                         "X-Goog-FieldMask": "places.displayName,places.rating,places.userRatingCount"},
                json={"textQuery": query, "pageSize": 3})
        places = (r.json() or {}).get("places") or []
        hit = next((p for p in places if p.get("rating")), None)
        data = {"avg": round(float(hit["rating"]), 1) if hit else None,
                "count": int(hit.get("userRatingCount") or 0) if hit else 0,
                "fetched_at": datetime.now(timezone.utc).isoformat()}
        await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"google_rating_cache": data}})
        return {"avg": data["avg"], "count": data["count"], "source": "google"} if data["avg"] else None
    except Exception:
        return None


async def _salon_rating(tenant_id: str) -> dict | None:
    """Combined Google-archive + in-app average for the booking page badge."""
    g = await _raw_db.google_reviews_archive.find(
        {"tenant_id": tenant_id, "rating": {"$gte": 1}}, {"_id": 0, "rating": 1}).to_list(3000)
    a = await _raw_db.reviews.find(
        {"tenant_id": tenant_id, "rating": {"$gte": 1}}, {"_id": 0, "rating": 1}).to_list(3000)
    vals = [x["rating"] for x in g + a if x.get("rating")]
    if not vals:
        return None
    return {"avg": round(sum(vals) / len(vals), 1), "count": len(vals)}


@router.get("/public/salon/{slug}")
async def public_salon(slug: str):
    t = await resolve_tenant_from_slug(slug)
    _is_resto = t.get("business_type") == "restaurant"
    _salon_default_hero = "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1600"
    _hero = t.get("hero_image") or ""
    if _is_resto and (not _hero or _hero == _salon_default_hero):
        _hero = "/resto-hero.jpg"
    return {
        "slug": t["slug"],
        "name": t.get("name"),
        "tagline": t.get("tagline") or ("Great food, warm company, memorable evenings" if _is_resto
                                        else "Where elegance meets every strand"),
        "location": t.get("location") or "Marathahalli, Bangalore",
        "phone": t.get("phone") or "+91 98765 00000",
        "hours": t.get("hours") or "Mon–Sun · 10:00 AM – 9:00 PM",
        "open_time": t.get("open_time") or "10:00",
        "close_time": t.get("close_time") or "21:00",
        "hero_image": _hero or _salon_default_hero,
        "book_bg": t.get("book_bg") or "",
        "logo_shape": t.get("logo_shape") or "",
        "header_bg": t.get("header_bg") or "",
        "referral_reward": REFERRAL_REWARD_REFERRER,
        "google_review_url": t.get("google_review_url") or "",
        "instagram_url": t.get("instagram_url") or "",
        "whatsapp_number": t.get("whatsapp_number") or "",
        "logo_url": t.get("logo_url") or "",
        "maps_url": t.get("maps_url") or "",
        "gallery": [g.get("url", "") for g in (t.get("gallery") or []) if g.get("url")],
        "branches": t.get("branches", []),
        "show_products": t.get("business_type") != "restaurant" and t.get("show_miracurl_products", True) is not False,
        "rating": (await _google_live_rating(t)) or (await _salon_rating(t["id"])),
        "business_type": t.get("business_type", "salon"),
        "trusted_badge": t.get("trusted_badge") or None,
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
    today_ist = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date().isoformat()
    for s in rows:
        s["gender"] = _service_gender(s)
        s["sold_out"] = s.get("sold_out_date") == today_ist
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
    staff = await db.staff.find({"active": True}, {"_id": 0, "email": 0, "phone": 0, "commission_pct": 0}).to_list(500)
    today = datetime.now(timezone.utc).date().isoformat()
    leaves = await db.leave_requests.find(
        {"status": "approved", "to_date": {"$gte": today}},
        {"_id": 0, "staff_id": 1, "from_date": 1, "to_date": 1}).to_list(500)
    by_sid = {}
    for lv in leaves:
        by_sid.setdefault(lv["staff_id"], []).append({"from": lv["from_date"], "to": lv["to_date"]})
    for s in staff:
        s["leaves"] = by_sid.get(s["id"], [])
    return staff

@router.get("/public/staff")
async def public_staff_default():
    return await public_staff(DEFAULT_TENANT_SLUG)

def _enforce_salon_hours(t: dict, scheduled_at: str):
    """Booking must fall inside this salon's own opening hours (IST)."""
    def _mins(s, default):
        try:
            h, m = str(s or default).split(":")
            return int(h) * 60 + int(m)
        except ValueError:
            h, m = default.split(":")
            return int(h) * 60 + int(m)
    open_m = _mins(t.get("open_time"), "10:00")
    close_m = _mins(t.get("close_time"), "21:00")
    ist = datetime.fromisoformat(scheduled_at.replace("Z", "+00:00")).astimezone(timezone(timedelta(hours=5, minutes=30)))
    slot_m = ist.hour * 60 + ist.minute
    if slot_m < open_m or slot_m >= close_m:
        def fmt(m):
            h, mm = divmod(m, 60)
            ap = "AM" if h < 12 else "PM"
            return f"{(h % 12) or 12}:{mm:02d} {ap}"
        raise HTTPException(400, f"Please pick a slot within salon hours: {fmt(open_m)} – {fmt(close_m)}")


@router.get("/public/gallery/{slug}")
async def public_gallery(slug: str):
    await resolve_tenant_from_slug(slug)
    today = datetime.now(timezone.utc).date().isoformat()
    items = await db.gallery.find({}, {"_id": 0}).sort("created_at", -1).to_list(48)
    # Expired offers drop off the booking page automatically (shown until end of their expiry day).
    return [g for g in items
            if not (g.get("source") == "offer" and g.get("expires_on") and g["expires_on"] < today)][:24]

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
    duration = sum(s["duration_min"] for s in services) or (90 if not services else 30)
    await _ensure_slot_capacity(body.scheduled_at, duration)
    appt = Appointment(
        customer_id=cust["id"], customer_name=cust["name"],
        staff_id=staff["id"], staff_name=staff["name"],
        service_ids=[s["id"] for s in services],
        service_names=[s["name"] for s in services] or (["Table reservation"] if body.party_size or not body.color_code else []),
        scheduled_at=body.scheduled_at, duration_min=duration,
        notes=body.notes, total=total,
    ).model_dump()
    t_doc = await _raw_db.tenants.find_one({"id": _current_tenant_id.get()}, {"_id": 0, "slug": 1, "name": 1, "branches": 1})
    appt["booked_via"] = f"/book/{(t_doc or {}).get('slug', '')}"  # trace: which salon URL/QR the guest used
    if body.branch_id:
        br = next((b for b in (t_doc or {}).get("branches") or [] if b.get("id") == body.branch_id), None)
        appt["branch_id"] = br["id"] if br else None
        appt["branch_name"] = br["name"] if br else "__main__"
    if body.party_size:
        appt["party_size"] = body.party_size
        appt["seating"] = body.seating or "any"
    if body.color_code:
        tid = _current_tenant_id.get()
        pick = await _raw_db.color_picks.find_one({"tenant_id": tid, "code": body.color_code.strip().upper()}, {"_id": 0})
        if pick:
            from routes.hair_colors import _lookup
            c = await _lookup(tid, pick["color_id"]) or {}
            img = c.get("image_url") or ((await _raw_db.hair_color_images.find_one({"id": pick["color_id"]}, {"_id": 0, "image_url": 1}) or {}).get("image_url"))
            appt["color_pick"] = {"code": pick["code"], "color_id": pick["color_id"], "color_name": pick.get("color_name") or c.get("name"),
                                  "image_url": img, "swatch": c.get("swatch") or [], "undertone": pick.get("undertone"), "depth": pick.get("depth"),
                                  "formula": pick.get("formula") or ""}
            await _raw_db.color_picks.update_one({"id": pick["id"]}, {"$set": {"appointment_id": appt["id"], "booked_at": datetime.now(timezone.utc).isoformat()}})
            # the booking is named after the colour: linked colour service if the salon set one, else "<Shade> Colour"
            from routes.hair_colors import _service_links
            link = (await _service_links(tid)).get(pick["color_id"])
            if link and link["service_id"] not in appt["service_ids"]:
                svc = await _raw_db.services.find_one({"tenant_id": tid, "id": link["service_id"]}, {"_id": 0})
                if svc:
                    appt["service_ids"].append(svc["id"]); appt["service_names"].append(svc["name"])
                    appt["duration_min"] = ((appt.get("duration_min") or 0) if services else 0) + (svc.get("duration_min") or 90)
                    appt["total"] = round((appt.get("total") or 0) + (link.get("price") if link.get("price") is not None else svc.get("price") or 0), 2)
                    total = appt["total"]
            elif link and link.get("price_override") is not None and link.get("service_price") is not None:
                # guest already picked the linked service — swap the service price for the shade's own quote
                appt["total"] = round((appt.get("total") or 0) - float(link["service_price"]) + float(link["price_override"]), 2)
                total = appt["total"]
            if link:
                appt["color_pick"]["quoted_price"] = link.get("price")
                appt["color_pick"]["service_id"] = link["service_id"]
            elif not link:
                label = f"{appt['color_pick']['color_name']} Colour"
                if label not in appt["service_names"]:
                    appt["service_names"] = [n for n in appt["service_names"] if n != "Table reservation"] + [label]
                if appt["service_names"] == [label]:
                    appt["duration_min"] = max(appt.get("duration_min") or 0, 90)
    await db.appointments.insert_one(appt)
    appt.pop("_id", None)
    return appt, total, appt.get("duration_min") or duration


@router.post("/public/book/{slug}")
async def public_book(slug: str, body: PublicBookingIn, request: Request):
    t = await resolve_tenant_from_slug(slug)
    await public_rate_limit(request, key_suffix=f"book:{slug}", limit=8, window_sec=600)
    _enforce_salon_hours(t, body.scheduled_at)

    services = (await db.services.find({"id": {"$in": body.service_ids}, "active": True}, {"_id": 0}).to_list(50)
                if body.service_ids else [])
    if not services and (t.get("business_type") or "salon") != "restaurant" and not body.color_code:
        raise HTTPException(400, "Invalid services")  # a colour try-on code alone is a valid booking ("<Shade> Colour", priced at the salon)

    staff = await _resolve_staff(body.staff_id, body.scheduled_at, sum(s["duration_min"] for s in services) or 30)
    coupon = await _validate_coupon(body.coupon_code)
    cust, is_new_customer = await _resolve_or_create_customer(body)
    booking_total_est = sum(float(s.get("price") or 0) for s in services)
    # Referral perk applies only on bookings worth ₹1000+ (same rule both verticals)
    referral_applied = (await _apply_referral_credit(cust, body.referral_code)
                        if is_new_customer and booking_total_est >= 1000 else None)
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
    t_doc = await _raw_db.tenants.find_one({"slug": slug}, {"_id": 0, "id": 1, "name": 1, "currency": 1, "gift_cards": 1})
    if t_doc:
        from sms_service import send_tenant_sms, sms_configured
        if sms_configured():
            when = appt["scheduled_at"][:16].replace("T", " at ")
            asyncio.create_task(send_tenant_sms(
                t_doc["id"], body.customer_phone,
                f"{t_doc.get('name') or 'Your salon'}: booking confirmed! {', '.join(s['name'] for s in services)} on {when} with {staff['name']}. See you there!",
                kind="booking"))
            # UPI prepay link when the diner chose "Pay by UPI" at reservation
            upi_vpa = ((t_doc.get("gift_cards") or {}).get("upi_id") or "").strip()
            if upi_vpa and "Pay by UPI" in (appt.get("notes") or "") and total and total > 0:
                from urllib.parse import quote as _q
                upi_link = (f"upi://pay?pa={_q(upi_vpa)}&pn={_q((t_doc.get('name') or 'Restaurant')[:38])}"
                            f"&am={round(float(total), 2)}&cu=INR&tn={_q('Table reservation')}")
                asyncio.create_task(send_tenant_sms(
                    t_doc["id"], body.customer_phone,
                    f"{t_doc.get('name') or 'Restaurant'}: pay Rs.{round(float(total))} for your reservation via UPI — tap {upi_link} or pay to {upi_vpa}. Show the receipt on arrival.",
                    kind="booking"))

    return {
        "appointment": appt,
        "summary": {
            "customer_name": cust["name"],
            "customer_referral_code": cust.get("referral_code"),
            "referral_credit": cust.get("referral_credit", 0) if is_new_customer else None,
            "staff_name": staff["name"],
            "service_names": appt.get("service_names") or [s["name"] for s in services],
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
    await public_rate_limit(request, key_suffix=f"coupon:{slug}", limit=20, window_sec=600)
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



# ---- Miracurl Products page (platform-level, not tenant-scoped) ----

@router.get("/public/products-qr")
async def products_qr(url: str = ""):
    import io as _io
    import qrcode
    from fastapi.responses import Response as _Resp
    target = (url or "").strip()
    if not target.startswith("http") or len(target) > 300:
        raise HTTPException(400, "valid url query param required")
    qr = qrcode.QRCode(box_size=8, border=2)
    qr.add_data(target)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#3d2b1f", back_color="#FFFDF7")
    buf = _io.BytesIO()
    img.save(buf, format="PNG")
    return _Resp(content=buf.getvalue(), media_type="image/png",
                 headers={"Cache-Control": "public, max-age=86400"})


@router.get("/public/products-config")
async def products_config():
    doc = await _raw_db.platform_settings.find_one({"key": "products"}, {"_id": 0}) or {}
    return {"available": bool(doc.get("available")), "razorpay_link": doc.get("razorpay_link") or ""}


class ProductsConfigIn(BaseModel):
    available: bool
    razorpay_link: Optional[str] = Field(None, max_length=300)


@router.put("/super-admin/products-config")
async def set_products_config(body: ProductsConfigIn, user=Depends(require_super_admin)):
    await _raw_db.platform_settings.update_one(
        {"key": "products"},
        {"$set": {"available": body.available, "razorpay_link": (body.razorpay_link or "").strip()}},
        upsert=True)
    return {"ok": True, "available": body.available}


class ProductOrderIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    phone: str = Field(..., min_length=7, max_length=20)
    email: str = Field(..., min_length=5, max_length=120, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    address: str = Field(..., min_length=8, max_length=400)
    pincode: str = Field(..., pattern=r"^\d{6}$")
    items: List[Dict] = Field(..., min_length=1, max_length=10)
    total: Optional[float] = None  # SEC-001: ignored — totals are always computed server-side


# SEC-001: trusted server-side price list — client-sent prices/totals are never used
_PRODUCT_CATALOG = {
    "shampoo": {"name": "Long & Healthy Shampoo (250ml)", "price": 400},
    "conditioner": {"name": "Nourish & Shine Conditioner (250ml)", "price": 380},
    "botox-500": {"name": "Hair Botox Treatment — 500ml", "price": 4500},
    "botox-1000": {"name": "Hair Botox Treatment — 1000ml", "price": 8000},
    "botox-shampoo": {"name": "Keratin Botox Shampoo (250ml)", "price": 2500},
}


def _order_receipt_html(order: dict, pay_link: str = "") -> str:
    rows = "".join(
        f"<tr><td style='padding:6px 12px;border-bottom:1px solid #f3e2e2'>{i.get('id')}</td>"
        f"<td style='padding:6px 12px;border-bottom:1px solid #f3e2e2;text-align:center'>{i.get('qty')}</td>"
        f"<td style='padding:6px 12px;border-bottom:1px solid #f3e2e2;text-align:right'>₹{i.get('price'):,.0f}</td></tr>"
        for i in order["items"])
    return f"""
<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
  <h2 style="color:#A61C3C">Miracurl Hair Science — Order Received ✦</h2>
  <p>Hi {order['name']}, thank you for your order! Here's your receipt:</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr style="background:#FDEDF0"><th style="padding:8px 12px;text-align:left">Product</th><th style="padding:8px 12px">Qty</th><th style="padding:8px 12px;text-align:right">Price</th></tr>
    {rows}
    <tr><td colspan="2" style="padding:10px 12px;font-weight:bold">Total</td><td style="padding:10px 12px;text-align:right;font-weight:bold">₹{order['total']:,.0f}</td></tr>
  </table>
  <p style="font-size:13px"><b>Order ID:</b> {order['id']}<br/><b>Delivery to:</b> {order['address']} — PIN {order['pincode']}<br/><b>Phone:</b> +{order['phone']}</p>
  {f'<p style="text-align:center;margin:18px 0"><a href="{pay_link}" style="background:#A61C3C;color:#fff;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:bold">Pay Now — ₹{order["total"]:,.0f} →</a></p>' if pay_link else ''}
  <p style="font-size:13px">Please complete the payment via the Razorpay link. We'll confirm your payment and dispatch your order to the address above.</p>
  <p style="font-size:12px;color:#888">Questions? payments@miracurl-suite.com</p>
</div>"""


@router.post("/public/product-orders")
async def create_product_order(body: ProductOrderIn, request: Request):
    await public_rate_limit(request, key_suffix="product-order", limit=10, window_sec=600)
    cfg = await _raw_db.platform_settings.find_one({"key": "products"}, {"_id": 0}) or {}
    if not cfg.get("available"):
        raise HTTPException(400, "Products are not available for ordering yet")
    # SEC-001: recompute every line from the trusted catalog; reject unknown SKUs
    items, total = [], 0
    for it in body.items[:10]:
        pid = str(it.get("id") or "")
        cat = _PRODUCT_CATALOG.get(pid)
        if not cat:
            raise HTTPException(400, f"Unknown product: {pid[:40]}")
        q = it.get("qty")
        if not isinstance(q, int) or isinstance(q, bool) or not (1 <= q <= 20):
            raise HTTPException(400, "Quantity must be a whole number between 1 and 20")
        items.append({"id": pid, "name": cat["name"], "qty": q, "price": cat["price"]})
        total += cat["price"] * q
    if total < 1:
        raise HTTPException(400, "Order is empty")
    order = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(), "phone": re.sub(r"\D", "", body.phone)[-12:],
        "email": body.email.strip().lower(),
        "address": body.address.strip(), "pincode": body.pincode,
        "items": items, "total": round(float(total), 2),
        "status": "pending_payment", "created_at": datetime.now(timezone.utc).isoformat(),
    }
    razorpay_link = (cfg.get("razorpay_link") or "").strip()
    if not razorpay_link:
        # Auto-generate an exact-amount Razorpay payment link with the connected account
        try:
            rzp = _rzp_client()
            if rzp:
                pl = await asyncio.to_thread(rzp.payment_link.create, {
                    "amount": int(round(order["total"] * 100)), "currency": "INR",
                    "description": f"Miracurl Hair Science products — order {order['id'][:8]}",
                    "customer": {"name": order["name"], "contact": f"+{order['phone']}", "email": order["email"]},
                    "notify": {"sms": False, "email": False},
                    "notes": {"order_id": order["id"], "type": "product_order"},
                })
                razorpay_link = pl.get("short_url") or ""
                order["razorpay_payment_link_id"] = pl.get("id", "")
                order["razorpay_link"] = razorpay_link
        except Exception as e:
            logging.error("product order payment link failed: %s", e)
    await _raw_db.product_orders.insert_one({**order})
    asyncio.create_task(_send_email(
        [order["email"]], "Your Miracurl order receipt ✦",
        _order_receipt_html(order, razorpay_link), from_name="Miracurl Hair Science"))
    return {"ok": True, "order_id": order["id"],
            "razorpay_link": razorpay_link,
            "contact_email": "payments@miracurl-suite.com"}


_QR_PID_RE = re.compile(r"^[a-z0-9-]{2,40}$")


@router.get("/public/qr-scan/{product_id}")
async def qr_scan_redirect(product_id: str, request: Request):
    """Bottle-label QR target: count the scan, then send the buyer to the shop page."""
    valid = bool(_QR_PID_RE.fullmatch(product_id))
    if valid:
        await _raw_db.qr_scans.insert_one({
            "id": str(uuid.uuid4()), "product_id": product_id,
            "scanned_at": datetime.now(timezone.utc).isoformat(),
            "ua": (request.headers.get("user-agent") or "")[:180]})
    dest = f"/products?src=qr&p={product_id}" if valid else "/products"
    return RedirectResponse(url=dest, status_code=302)


@router.get("/super-admin/qr-scans")
async def qr_scan_stats(user=Depends(require_super_admin)):
    """Per-product bottle QR scan counts — shows which product drives reorders."""
    rows = await _raw_db.qr_scans.aggregate([
        {"$group": {"_id": "$product_id", "total": {"$sum": 1}, "last_scan": {"$max": "$scanned_at"}}}
    ]).to_list(100)
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    out = []
    for r in rows:
        last7 = await _raw_db.qr_scans.count_documents(
            {"product_id": r["_id"], "scanned_at": {"$gte": week_ago}})
        out.append({"product_id": r["_id"], "total": r["total"],
                    "last_7_days": last7, "last_scan": r["last_scan"]})
    out.sort(key=lambda x: -x["total"])
    return {"products": out, "total_scans": sum(x["total"] for x in out)}


class TableOrderIn(BaseModel):
    table_no: int = Field(..., ge=1, le=200)
    customer_name: Optional[str] = Field(None, max_length=80)
    customer_phone: Optional[str] = Field(None, max_length=20)
    items: List[dict] = Field(..., min_length=1, max_length=40)


def _norm_in_phone(v: str) -> str:
    """Normalize an Indian mobile number to 10 digits; '' when invalid."""
    cleaned = "".join(c for c in (v or "") if c.isdigit())
    if len(cleaned) == 12 and cleaned.startswith("91"):
        cleaned = cleaned[2:]
    elif len(cleaned) == 11 and cleaned.startswith("0"):
        cleaned = cleaned[1:]
    return cleaned if re.fullmatch(r"[6-9]\d{9}", cleaned) else ""


@router.get("/public/guest-lookup/{slug}")
async def public_guest_lookup(slug: str, request: Request, phone: str = ""):
    """Returning-guest greeting on the QR menu — first name + visit count only."""
    await resolve_tenant_from_slug(slug)  # 404s unknown slugs + sets tenant scope
    await public_rate_limit(request, key_suffix=f"guestlookup:{slug}", limit=30, window_sec=600)
    digits = _norm_in_phone(phone)
    if not digits:
        return {"found": False}
    c = await db.customers.find_one({"phone": digits}, {"_id": 0, "name": 1, "visits": 1})
    if not c:
        return {"found": False}
    first = (c.get("name") or "").strip().split(" ")[0][:30]
    if not first or first.lower() in ("dine-in", "guest"):
        return {"found": False}
    return {"found": True, "name": first, "visits": int(c.get("visits") or 0)}


@router.post("/public/table-order/{slug}")
async def create_table_order(slug: str, body: TableOrderIn, request: Request):
    """QR-at-table food ordering — diners scan a table QR and order into the kitchen."""
    t = await resolve_tenant_from_slug(slug)
    if (t.get("business_type") or "salon") != "restaurant":
        raise HTTPException(400, "Table ordering is only available for restaurants")
    await public_rate_limit(request, key_suffix=f"tableorder:{slug}", limit=15, window_sec=600)
    ids = [str(i.get("id")) for i in body.items if i.get("id")]
    menu = {m["id"]: m for m in await db.services.find(
        {"id": {"$in": ids}, "active": True}, {"_id": 0}).to_list(60)}
    # Discounts: global Offer of the Day + per-category weekday specials (item takes the better one)
    now_ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    off = await _raw_db.day_offers.find_one(
        {"tenant_id": t["id"], "date": now_ist.date().isoformat(), "status": "accepted", "discount_pct": {"$gt": 0}},
        {"_id": 0, "discount_pct": 1, "title": 1}, sort=[("accepted_at", -1)])
    disc_pct = float(off["discount_pct"]) if off else 0.0
    cat_specials = {s["category"]: float(s["discount_pct"]) for s in await _raw_db.category_specials.find(
        {"tenant_id": t["id"], "active": True, "days": now_ist.weekday()}, {"_id": 0}).to_list(50)}
    items = []
    today_ist = now_ist.date().isoformat()
    for i in body.items:
        m = menu.get(str(i.get("id")))
        if not m:
            continue
        if m.get("sold_out_date") == today_ist:
            continue
        qty = max(1, min(20, int(i.get("qty") or 1)))
        spice = i.get("spice") if i.get("spice") in ("not_spicy", "normal", "spicy") else "normal"
        cat = m.get("category") or ""
        items.append({"id": m["id"], "name": m["name"], "price": m["price"], "qty": qty, "spice": spice,
                      "category": cat, "disc_pct": max(cat_specials.get(cat, 0.0), disc_pct)})
    if not items:
        raise HTTPException(400, "No valid menu items in the order")
    subtotal = round(sum(i["price"] * i["qty"] for i in items), 2)
    disc_amt = round(sum(i["price"] * i["qty"] * i["disc_pct"] / 100 for i in items), 2)
    # Phone given → find or create the CRM customer so repeat visits are tracked
    phone_digits = _norm_in_phone(body.customer_phone or "")
    customer_id = ""
    if phone_digits:
        cust = await db.customers.find_one({"phone": phone_digits}, {"_id": 0, "id": 1})
        if not cust:
            cust = Customer(name=(body.customer_name or "").strip()[:80] or "Dine-in Guest",
                            phone=phone_digits, crm_status="pending").model_dump()
            await db.customers.insert_one(cust)
        customer_id = cust["id"]
    order = {"id": uuid.uuid4().hex[:8], "tenant_id": t["id"], "table_no": body.table_no,
             "customer_name": (body.customer_name or "").strip()[:80],
             "customer_phone": phone_digits, "customer_id": customer_id,
             "items": items, "subtotal": subtotal,
             "discount_pct": disc_pct, "discount_amt": disc_amt,
             "offer_title": (off or {}).get("title") or "",
             "total": round(subtotal - disc_amt, 2), "status": "new",
             "created_at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.table_orders.insert_one(order)
    order.pop("_id", None)
    return {"ok": True, "order": order}


@router.get("/public/table-order-status/{slug}/{order_id}")
async def public_table_order_status(slug: str, order_id: str, request: Request):
    """Diner-facing live status of their table order (new → preparing → served → billed)."""
    t = await resolve_tenant_from_slug(slug)
    await public_rate_limit(request, key_suffix=f"orderstatus:{slug}", limit=200, window_sec=600)
    o = await _raw_db.table_orders.find_one(
        {"tenant_id": t["id"], "id": order_id},
        {"_id": 0, "id": 1, "status": 1, "table_no": 1, "total": 1, "created_at": 1})
    if not o:
        raise HTTPException(404, "Order not found")
    return o


class TableCallIn(BaseModel):
    table_no: int = Field(..., ge=1, le=200)
    kind: str = "waiter"


@router.post("/public/table-call/{slug}")
async def create_table_call(slug: str, body: TableCallIn, request: Request):
    """Diner taps 'call waiter' / 'water' on the QR menu — pings the Kitchen page."""
    t = await resolve_tenant_from_slug(slug)
    if (t.get("business_type") or "salon") != "restaurant":
        raise HTTPException(400, "Table calls are only available for restaurants")
    await public_rate_limit(request, key_suffix=f"tablecall:{slug}", limit=20, window_sec=600)
    kind = body.kind if body.kind in ("waiter", "water", "bill") else "waiter"
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()
    dup = await _raw_db.table_calls.find_one(
        {"tenant_id": t["id"], "table_no": body.table_no, "kind": kind,
         "status": "open", "created_at": {"$gte": cutoff}})
    if dup:
        return {"ok": True, "queued": False}
    await _raw_db.table_calls.insert_one(
        {"id": uuid.uuid4().hex[:8], "tenant_id": t["id"], "table_no": body.table_no,
         "kind": kind, "status": "open", "created_at": datetime.now(timezone.utc).isoformat()})
    return {"ok": True, "queued": True}


@router.get("/public/category-specials/{slug}")
async def public_category_specials(slug: str):
    """Today's per-category weekday specials for the QR menu (no auth)."""
    t = await _raw_db.tenants.find_one({"slug": slug}, {"_id": 0, "id": 1})
    if not t:
        raise HTTPException(404, "Restaurant not found")
    weekday = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).weekday()
    rows = await _raw_db.category_specials.find(
        {"tenant_id": t["id"], "active": True, "days": weekday},
        {"_id": 0, "category": 1, "discount_pct": 1}).to_list(50)
    return {"specials": {r["category"]: r["discount_pct"] for r in rows}}


@router.get("/public/menu-stats/{slug}")
async def public_menu_stats(slug: str):
    """Order counts per dish + auto best-sellers for the QR menu."""
    t = await _raw_db.tenants.find_one({"slug": slug}, {"_id": 0, "id": 1})
    if not t:
        raise HTTPException(404, "Restaurant not found")
    rows = await _raw_db.table_orders.aggregate([
        {"$match": {"tenant_id": t["id"], "status": {"$ne": "cancelled"}}},
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.id", "count": {"$sum": "$items.qty"}}},
    ]).to_list(300)
    counts = {r["_id"]: r["count"] for r in rows}
    best = [k for k, _ in sorted(counts.items(), key=lambda x: -x[1])[:3] if counts[k] >= 2]
    return {"counts": counts, "best_sellers": best}


@router.get("/super-admin/product-orders")
async def list_product_orders(user=Depends(require_super_admin)):
    return await _raw_db.product_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)


class OrderStatusIn(BaseModel):
    status: str = Field(..., pattern="^(pending_payment|paid|dispatched)$")


@router.put("/super-admin/product-orders/{oid}")
async def set_product_order_status(oid: str, body: OrderStatusIn, user=Depends(require_super_admin)):
    existing = await _raw_db.product_orders.find_one({"id": oid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Order not found")
    await _raw_db.product_orders.update_one({"id": oid}, {"$set": {"status": body.status}})
    if body.status != existing.get("status"):
        send_order_status_email(existing, body.status)
    return {"ok": True, "status": body.status}
