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
from schemas import Review, ReviewIn, ReviewModerateIn, resolve_tenant_from_slug, DEFAULT_TENANT_SLUG

router = APIRouter()

from emergentintegrations.llm.chat import LlmChat, UserMessage

# ---------------- Reviews ----------------
async def _resolve_visit(token: str) -> dict | None:
    """Review token = appointment id OR invoice id (walk-in bills). Returns a visit dict."""
    appt = await _raw_db.appointments.find_one({"id": token}, {"_id": 0})
    if appt:
        return appt
    inv = await _raw_db.invoices.find_one({"id": token}, {"_id": 0})
    if not inv:
        return None
    services = [i.get("name", "") for i in (inv.get("items") or [])
                if i.get("type", "service") != "product" and i.get("name")]
    return {"id": inv["id"], "tenant_id": inv.get("tenant_id"),
            "customer_id": inv.get("customer_id"), "customer_name": inv.get("customer_name", "Guest"),
            "customer_phone": inv.get("customer_phone"),
            "staff_id": inv.get("staff_id"), "staff_name": inv.get("staff_name"),
            "service_names": services, "scheduled_at": inv.get("created_at"),
            "status": "completed", "_from_invoice": True}


@router.get("/reviews")
async def list_reviews(user=Depends(get_current_user)):
    return await db.reviews.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)

class ReviewReplyIn(BaseModel):
    reply: str = Field(..., max_length=1000)


@router.post("/reviews/{rid}/suggest-reply")
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


@router.put("/reviews/{rid}/reply")
async def save_review_reply(rid: str, body: ReviewReplyIn, user=Depends(require_admin)):
    await db.reviews.update_one({"id": rid}, {"$set": {
        "owner_reply": body.reply.strip(),
        "owner_reply_at": datetime.now(timezone.utc).isoformat(),
    }})
    return await db.reviews.find_one({"id": rid}, {"_id": 0})


@router.put("/reviews/{rid}/moderate")
async def moderate_review(rid: str, body: ReviewModerateIn, user=Depends(require_admin)):
    await db.reviews.update_one({"id": rid}, {"$set": {"public": body.public}})
    return await db.reviews.find_one({"id": rid}, {"_id": 0})

@router.delete("/reviews/{rid}")
async def delete_review(rid: str, user=Depends(require_admin)):
    await db.reviews.delete_one({"id": rid})
    return {"ok": True}

@router.get("/public/review-info/{token}")
async def public_review_info(token: str, request: Request):
    """Token = appointment_id. Returns appointment summary so the customer can confirm."""
    public_rate_limit(request, key_suffix="review-info", limit=30, window_sec=600)
    # No tenant context — resolve appointment or invoice globally, then set tenant
    appt = await _resolve_visit(token)
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
    g_url = ""
    if appt.get("tenant_id"):
        t = await _raw_db.tenants.find_one({"id": appt["tenant_id"]}, {"_id": 0, "name": 1, "location": 1, "google_review_url": 1})
        if t:
            salon_name = t.get("name")
            salon_location = t.get("location")
            g_url = (t.get("google_review_url") or "").strip()
    return {
        "customer_name": appt["customer_name"],
        "staff_name": appt.get("staff_name"),
        "service_names": appt.get("service_names", []),
        "scheduled_at": appt["scheduled_at"],
        "already_submitted": existing is not None,
        "existing_rating": existing.get("rating") if existing else None,
        "salon_name": salon_name,
        "salon_location": salon_location,
        "google_review_url": g_url if g_url.startswith("http") else "",
    }

@router.post("/public/review/{token}")
async def public_review(token: str, body: ReviewIn, request: Request):
    public_rate_limit(request, key_suffix="review", limit=10, window_sec=600)
    appt = await _resolve_visit(token)
    if not appt:
        raise HTTPException(404, "Invalid review link")
    if appt.get("tenant_id"):
        _current_tenant_id.set(appt["tenant_id"])
    if await db.reviews.find_one({"appointment_id": token}):
        raise HTTPException(400, "Review already submitted for this visit")

    # SEC-002: only reward if the guest has actually paid — an invoice linked to
    # this appointment OR any paid invoice for this customer. Prevents
    # "book fake → review fake → mint ₹50" farming loops.
    if appt.get("_from_invoice"):
        invoiced = True  # token IS a paid invoice
    else:
        invoiced = await db.invoices.find_one(
            {"$or": [{"appointment_id": token}, {"customer_id": appt["customer_id"]}]},
            {"_id": 0, "id": 1})

    reward_code = None
    reward_amt = REVIEW_REWARD_CREDITS.get(body.rating, 0)
    if reward_amt and invoiced:
        cust_now = await db.customers.find_one({"id": appt["customer_id"]}, {"_id": 0, "referral_credit": 1})
        current_credit = float((cust_now or {}).get("referral_credit") or 0)
        if current_credit < MAX_CUSTOMER_CREDIT:
            reward_code = f"THANKS-{secrets.token_urlsafe(3).upper().replace('_', 'X').replace('-', 'Y')[:5]}"
            await db.customers.update_one(
                {"id": appt["customer_id"]},
                {"$inc": {"referral_credit": reward_amt}},
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

    if body.rating == 5 and appt.get("staff_id"):
        try:
            await _award_review_bonus(appt, review)
        except Exception as e:  # noqa: BLE001 — bonus must never block the review
            logging.error(f"review bonus award failed: {e}")

    if body.rating <= 3:
        # Low ratings become a PRIVATE complaint for the owner — never published.
        await db.complaints.insert_one({
            "id": str(uuid.uuid4()), "appointment_id": token,
            "customer_id": appt["customer_id"], "customer_name": appt["customer_name"],
            "customer_phone": appt.get("customer_phone"),
            "rating": body.rating, "service_names": appt.get("service_names", []),
            "staff_name": appt.get("staff_name"),
            "disappointed_service": (body.disappointed_service or "").strip() or None,
            "message": (body.comment or "").strip() or None,
            "status": "open", "created_at": datetime.now(timezone.utc).isoformat()})
    return {
        "ok": True,
        "review": _clean(review),
        "reward": {
            "code": reward_code,
            "credit": reward_amt if reward_code else 0,
        } if reward_code else None,
    }

class ReviewDraftIn(BaseModel):
    rating: int = Field(..., ge=4, le=5)


@router.post("/public/review-draft/{token}")
async def public_review_draft(token: str, body: ReviewDraftIn, request: Request):
    """Mira writes a ready-to-paste Google review from the guest's actual visit (4-5★ only)."""
    public_rate_limit(request, key_suffix="review-draft", limit=6, window_sec=600)
    await durable_rate_limit(request, "review-draft", limit=6, window_sec=600)
    appt = await _resolve_visit(token)
    if not appt:
        raise HTTPException(404, "Invalid review link")
    tid = appt.get("tenant_id")
    if tid:
        _current_tenant_id.set(tid)
        await ai_daily_quota(tid, "review_draft", 100)
    t = await _raw_db.tenants.find_one({"id": tid}, {"_id": 0, "name": 1, "location": 1, "google_review_url": 1}) or {}
    from routes.mira_common import _ask
    services = ", ".join(appt.get("service_names") or []) or "salon services"
    stylist = appt.get("staff_name") or ""
    text = await _ask(
        "You write short, authentic-sounding Google reviews for happy salon customers. "
        "Sound like a real person, not marketing. No hashtags. 2-4 sentences. At most one emoji.",
        f"Customer {appt.get('customer_name', '')} just had {services}"
        f"{' with stylist ' + stylist if stylist else ''} at {t.get('name', 'the salon')}"
        f"{' (' + t.get('location', '') + ')' if t.get('location') else ''} and rated it {body.rating} stars. "
        f"Write the review in first person. Mention the actual service(s) naturally.")
    return {"text": text.strip().strip('"')[:600], "google_review_url": t.get("google_review_url") or ""}


@router.get("/complaints")
async def list_complaints(user=Depends(require_tenant_admin), t=Depends(current_tenant), _pin=Depends(require_owner_pin)):
    """PIN-locked: private low-rating complaints for the owner's eyes only."""
    return await db.complaints.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


@router.post("/complaints/{cid}/resolve")
async def resolve_complaint(cid: str, user=Depends(require_tenant_admin), t=Depends(current_tenant), _pin=Depends(require_owner_pin)):
    res = await db.complaints.update_one(
        {"id": cid}, {"$set": {"status": "resolved", "resolved_at": datetime.now(timezone.utc).isoformat(),
                               "resolved_by": user.get("email")}})
    if not res.matched_count:
        raise HTTPException(404, "Complaint not found")
    return {"ok": True}


_TEST_REVIEW_FILTER = {"$nor": [{"customer_name": {"$regex": "^TEST", "$options": "i"}},
                                {"comment": {"$regex": "^TEST", "$options": "i"}}]}


@router.get("/public/reviews/featured/{slug}")
async def public_featured_reviews(slug: str, limit: int = 6):
    await resolve_tenant_from_slug(slug)
    docs = await db.reviews.find(
        {"public": True, "rating": {"$gte": 4}, **_TEST_REVIEW_FILTER},
        {"_id": 0, "customer_id": 0, "appointment_id": 0, "staff_id": 0, "reward_code": 0}
    ).sort("created_at", -1).to_list(limit)
    return docs

@router.get("/public/reviews/featured")
async def public_featured_reviews_default(limit: int = 6):
    return await public_featured_reviews(DEFAULT_TENANT_SLUG, limit)


@router.get("/public/review-go/{slug}")
async def public_review_redirect(slug: str):
    """QR target on printed posters/tent cards — routes through Mira's rate page."""
    from fastapi.responses import RedirectResponse
    t = await _raw_db.tenants.find_one({"slug": slug}, {"_id": 0, "id": 1})
    if not t:
        raise HTTPException(404, "Salon not found")
    return RedirectResponse(f"/rate/{slug}", status_code=302)


# ---------------- Walk-up QR rating (no visit token) ----------------
class RateDraftIn(BaseModel):
    rating: int = Field(..., ge=4, le=5)
    service: str = Field("", max_length=80)


class RateSubmitIn(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: str = Field("", max_length=800)
    name: str = Field("", max_length=60)
    service: str = Field("", max_length=80)


async def _qr_event(tenant_id: str, event: str, rating: int | None = None):
    await _raw_db.qr_funnel.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": tenant_id, "event": event,
        "rating": rating, "created_at": datetime.now(timezone.utc).isoformat()})


@router.get("/public/rate-info/{slug}")
async def public_rate_info(slug: str, request: Request):
    public_rate_limit(request, key_suffix="rate-info", limit=30, window_sec=600)
    t = await _raw_db.tenants.find_one({"slug": slug}, {"_id": 0, "id": 1, "name": 1, "location": 1, "google_review_url": 1})
    if not t:
        raise HTTPException(404, "Salon not found")
    await _qr_event(t["id"], "scan")
    g_url = (t.get("google_review_url") or "").strip()
    svcs = await _raw_db.services.find({"tenant_id": t["id"], "active": {"$ne": False}},
                                       {"_id": 0, "name": 1}).sort("popularity", -1).to_list(8)
    return {"salon_name": t.get("name"), "salon_location": t.get("location"),
            "google_review_url": g_url if g_url.startswith("http") else "",
            "services": [s["name"] for s in svcs]}


@router.post("/public/rate-draft/{slug}")
async def public_rate_draft(slug: str, body: RateDraftIn, request: Request):
    """Mira writes a Google review for a walk-up QR scan (4-5★ only)."""
    public_rate_limit(request, key_suffix="rate-draft", limit=6, window_sec=600)
    await durable_rate_limit(request, "rate-draft", limit=6, window_sec=600)
    t = await _raw_db.tenants.find_one({"slug": slug}, {"_id": 0, "id": 1, "name": 1, "location": 1, "google_review_url": 1})
    if not t:
        raise HTTPException(404, "Salon not found")
    await ai_daily_quota(t["id"], "review_draft", 100)
    from routes.mira_common import _ask
    svc = body.service.strip() or "a salon service"
    text = await _ask(
        "You write short, authentic-sounding Google reviews for happy salon customers. "
        "Sound like a real person, not marketing. No hashtags. 2-4 sentences. At most one emoji.",
        f"A happy customer just had {svc} at {t.get('name', 'the salon')}"
        f"{' (' + t.get('location', '') + ')' if t.get('location') else ''} and rated it {body.rating} stars. "
        f"Write the review in first person. Mention the service naturally.")
    g_url = (t.get("google_review_url") or "").strip()
    return {"text": text.strip().strip('"')[:600], "google_review_url": g_url if g_url.startswith("http") else ""}


@router.post("/public/rate-submit/{slug}")
async def public_rate_submit(slug: str, body: RateSubmitIn, request: Request):
    public_rate_limit(request, key_suffix="rate-submit", limit=6, window_sec=600)
    t = await _raw_db.tenants.find_one({"slug": slug}, {"_id": 0, "id": 1})
    if not t:
        raise HTTPException(404, "Salon not found")
    _current_tenant_id.set(t["id"])
    await _qr_event(t["id"], "rated", body.rating)
    name = body.name.strip() or "Guest"
    review = Review(
        appointment_id=f"qr-{uuid.uuid4()}", customer_id="qr-guest", customer_name=name,
        rating=body.rating, comment=body.comment.strip() or None,
        public=body.rating >= 4, reward_code=None).model_dump()
    await db.reviews.insert_one(review)
    if body.rating <= 3:
        await db.complaints.insert_one({
            "id": str(uuid.uuid4()), "appointment_id": None,
            "customer_id": None, "customer_name": name, "customer_phone": None,
            "rating": body.rating, "service_names": [body.service.strip()] if body.service.strip() else [],
            "staff_name": None, "disappointed_service": body.service.strip() or None,
            "message": body.comment.strip() or None,
            "status": "open", "created_at": datetime.now(timezone.utc).isoformat()})
    return {"ok": True}


@router.post("/public/rate-track/{slug}")
async def public_rate_track(slug: str, request: Request):
    """Beacon: guest was sent to the Google review box (review copied)."""
    public_rate_limit(request, key_suffix="rate-track", limit=10, window_sec=600)
    t = await _raw_db.tenants.find_one({"slug": slug}, {"_id": 0, "id": 1})
    if not t:
        raise HTTPException(404, "Salon not found")
    await _qr_event(t["id"], "google_redirect")
    return {"ok": True}


# ---------------- Google reviews (live, via Places API) ----------------
_GPLACES_FIELDS = ("rating,userRatingCount,googleMapsUri,displayName,"
                   "reviews.rating,reviews.text,reviews.originalText,"
                   "reviews.authorAttribution,reviews.relativePublishTimeDescription,reviews.publishTime")


async def _resolve_google_place_id(t: dict, key: str) -> str | None:
    import httpx
    query = " ".join(x for x in [t.get("name"), t.get("location")] if x)
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(
            "https://places.googleapis.com/v1/places:searchText",
            headers={"X-Goog-Api-Key": key,
                     "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress"},
            json={"textQuery": query, "maxResultCount": 1})
        places = (r.json() or {}).get("places") or []
    return places[0]["id"] if places else None


async def _google_fetch_and_cache(t: dict, key: str, re_resolve: bool = False) -> dict:
    """Fetch + cache live Google reviews for a tenant. Raises ValueError with a user-facing message."""
    import httpx
    place_id = None if re_resolve else (t.get("google_place_id") or "").strip() or None
    if not place_id:
        place_id = await _resolve_google_place_id(t, key)
        if not place_id:
            raise ValueError("Couldn't find your salon on Google Maps — check the salon name & location in Settings match your Google Business listing")
        await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"google_place_id": place_id}})
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(
            f"https://places.googleapis.com/v1/places/{place_id}",
            headers={"X-Goog-Api-Key": key, "X-Goog-FieldMask": _GPLACES_FIELDS})
    if r.status_code != 200:
        logging.warning(f"google reviews fetch failed: {r.status_code} {r.text[:200]}")
        raise ValueError("Google didn't return reviews — try Refresh in a minute")
    p = r.json() or {}
    payload = {
        "place_name": (p.get("displayName") or {}).get("text"),
        "rating": p.get("rating"),
        "total_ratings": p.get("userRatingCount") or 0,
        "maps_url": p.get("googleMapsUri") or "",
        "reviews": [{
            "author": (rv.get("authorAttribution") or {}).get("displayName") or "Google user",
            "photo": (rv.get("authorAttribution") or {}).get("photoUri") or "",
            "rating": rv.get("rating"),
            "text": ((rv.get("text") or rv.get("originalText") or {}).get("text") or "")[:800],
            "when": rv.get("relativePublishTimeDescription") or "",
            "publish_time": rv.get("publishTime") or "",
        } for rv in (p.get("reviews") or [])],
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
    await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"google_reviews_cache": payload}})
    return payload


@router.get("/reviews/google")
async def google_reviews(refresh: int = 0, user=Depends(get_current_user), t=Depends(current_tenant)):
    """Live Google rating + the (up to 5) most-relevant Google reviews for this salon.
    Cached 6h on the tenant doc; ?refresh=1 forces a refetch (and re-resolves the place)."""
    key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not key:
        raise HTTPException(400, "Google Maps API key not configured")
    cache = t.get("google_reviews_cache") or {}
    if cache.get("fetched_at") and not refresh:
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(cache["fetched_at"])).total_seconds()
        if age < 6 * 3600:
            return cache
    try:
        return await _google_fetch_and_cache(t, key, re_resolve=bool(refresh))
    except ValueError as e:
        raise HTTPException(400, str(e))


async def run_google_review_alerts() -> dict:
    """Poll Google for every salon with a resolved place — alert owners about NEW low-star (≤3) reviews.
    First run per tenant just records a baseline (no alert spam for old reviews)."""
    key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not key:
        return {"skipped": "no key"}
    tenants = await _raw_db.tenants.find(
        {"google_place_id": {"$exists": True, "$nin": [None, ""]}, "status": {"$in": ["active", "trial"]}},
        {"_id": 0, "id": 1, "name": 1, "owner_email": 1, "google_place_id": 1,
         "google_seen_reviews": 1, "google_reviews_cache": 1}).to_list(500)
    alerted = 0
    for t in tenants:
        try:
            payload = await _google_fetch_and_cache(t, key)
        except Exception as e:  # noqa: BLE001 — one bad tenant must not stop the sweep
            logging.warning(f"google alert fetch failed for {t.get('name')}: {e}")
            continue
        times = [rv["publish_time"] for rv in payload.get("reviews", []) if rv.get("publish_time")]
        seen = t.get("google_seen_reviews")
        if seen is None:  # baseline on first sweep
            await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"google_seen_reviews": times}})
            continue
        new_low = [rv for rv in payload.get("reviews", [])
                   if rv.get("publish_time") and rv["publish_time"] not in seen and (rv.get("rating") or 5) <= 3]
        if set(times) - set(seen):
            await _raw_db.tenants.update_one(
                {"id": t["id"]}, {"$set": {"google_seen_reviews": list(dict.fromkeys(seen + times))[-100:]}})
        for rv in new_low:
            await _alert_low_google_review(t, rv, payload)
            alerted += 1
    return {"tenants": len(tenants), "alerted": alerted}


async def _alert_low_google_review(t: dict, rv: dict, payload: dict) -> None:
    now = datetime.now(timezone.utc).isoformat()
    excerpt = (rv.get("text") or "").strip()[:180]
    quoted = f': "{excerpt}"' if excerpt else ""
    msg = (f"{rv.get('author')} left a {rv.get('rating')}★ review on Google{quoted}. "
           "Reply quickly to protect your rating — open Reviews → View all on Google.")
    admins = await _raw_db.users.find(
        {"tenant_id": t["id"], "role": "admin", "disabled": {"$ne": True}},
        {"_id": 0, "id": 1}).to_list(20)
    if admins:
        await _raw_db.user_notices.insert_many([
            {"id": str(uuid.uuid4()), "user_id": a["id"], "title": "New low-star Google review ⚠️",
             "message": msg, "kind": "google_review_alert", "seen": False, "created_at": now}
            for a in admins])
    if t.get("owner_email"):
        stars = "★" * int(rv.get("rating") or 0) + "☆" * (5 - int(rv.get("rating") or 0))
        html = (f"<div style='font-family:Georgia,serif;max-width:560px;margin:0 auto'>"
                f"<h2 style='margin:0 0 6px'>⚠️ New {rv.get('rating')}★ Google review — {html_lib.escape(t.get('name') or '')}</h2>"
                f"<p style='color:#b45309;font-size:18px;margin:4px 0'>{stars}</p>"
                f"<p style='color:#333'><b>{html_lib.escape(rv.get('author') or '')}</b> ({html_lib.escape(rv.get('when') or 'just now')}):</p>"
                f"<div style='background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:14px;font-size:14px;color:#444'>"
                f"{html_lib.escape(rv.get('text') or '(rating only, no comment)')}</div>"
                f"<p style='color:#666;font-size:13px;margin-top:14px'>Replying fast shows future customers you care. "
                f"Open the review on Google and respond — Mira can draft a reply from your Reviews page.</p></div>")
        try:
            await _send_email([t["owner_email"]],
                              f"⚠️ New {rv.get('rating')}★ Google review needs your reply — {t.get('name')}",
                              html, book_url=payload.get("maps_url") or None, book_label="Reply on Google →")
        except Exception as e:  # noqa: BLE001
            logging.warning(f"google alert email failed: {e}")


# ---------------- 5★ review bonus (owner-set commission per 5★ review) ----------------
class ReviewBonusIn(BaseModel):
    enabled: bool
    amount: float = Field(..., ge=0, le=5000)


@router.get("/settings/review-bonus")
async def get_review_bonus(user=Depends(require_admin), t=Depends(current_tenant)):
    rb = t.get("review_bonus") or {}
    return {"enabled": bool(rb.get("enabled")), "amount": float(rb.get("amount") or 0)}


@router.put("/settings/review-bonus")
async def save_review_bonus(body: ReviewBonusIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    await _raw_db.tenants.update_one(
        {"id": t["id"]}, {"$set": {"review_bonus": {"enabled": body.enabled, "amount": round(body.amount, 2)}}})
    return {"ok": True, "enabled": body.enabled, "amount": round(body.amount, 2)}


@router.get("/reviews/bonuses")
async def list_review_bonuses(month: Optional[str] = None, user=Depends(require_admin), t=Depends(current_tenant)):
    m = month or datetime.now(timezone.utc).strftime("%Y-%m")
    rows = await _raw_db.review_bonuses.find(
        {"tenant_id": t["id"], "month": m}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"month": m, "rows": rows, "total": round(sum(float(r.get("amount") or 0) for r in rows), 2)}


async def _award_review_bonus(appt: dict, review: dict) -> None:
    """5★ + staff attached → log bonus (if owner enabled it) + congratulation popup notice from Mira."""
    t = await _raw_db.tenants.find_one({"id": appt.get("tenant_id")}, {"_id": 0, "id": 1, "review_bonus": 1})
    if not t:
        return
    rb = t.get("review_bonus") or {}
    amount = float(rb.get("amount") or 0) if rb.get("enabled") else 0.0
    now = datetime.now(timezone.utc)
    if amount > 0:
        await _raw_db.review_bonuses.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": t["id"],
            "staff_id": appt["staff_id"], "staff_name": appt.get("staff_name"),
            "review_id": review["id"], "customer_name": appt.get("customer_name") or "A guest",
            "amount": round(amount, 2), "month": now.strftime("%Y-%m"),
            "created_at": now.isoformat()})
    s = await _raw_db.staff.find_one({"id": appt["staff_id"]}, {"_id": 0, "user_id": 1, "name": 1})
    if not s or not s.get("user_id"):
        return
    first = (s.get("name") or "there").split()[0].title()
    customer = appt.get("customer_name") or "A guest"
    excerpt = (review.get("comment") or "").strip()[:140]
    msg = f"Hey {first}! {customer} just gave you a glowing 5-star review"
    if excerpt:
        msg += f' — "{excerpt}"'
    msg += "."
    if amount > 0:
        msg += f" Our owner adds ₹{amount:.0f} for every 5-star review — it will reflect in your upcoming salary."
    msg += " I'm so proud of you, keep shining! — Mira ✦"
    await _raw_db.user_notices.insert_one({
        "id": str(uuid.uuid4()), "user_id": s["user_id"],
        "title": "⭐ You earned a 5-star review!",
        "message": msg, "kind": "review_bonus", "seen": False, "created_at": now.isoformat()})


@router.get("/reviews/qr-funnel")
async def qr_funnel_stats(days: int = 30, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    since = (datetime.now(timezone.utc) - timedelta(days=min(days, 365))).isoformat()
    rows = await _raw_db.qr_funnel.find(
        {"tenant_id": t["id"], "created_at": {"$gte": since}},
        {"_id": 0, "event": 1, "rating": 1}).to_list(20000)
    scans = sum(1 for r in rows if r["event"] == "scan")
    rated = [r for r in rows if r["event"] == "rated"]
    redirects = sum(1 for r in rows if r["event"] == "google_redirect")
    happy = sum(1 for r in rated if (r.get("rating") or 0) >= 4)
    avg = round(sum(r.get("rating") or 0 for r in rated) / len(rated), 1) if rated else 0
    return {"days": days, "scans": scans, "rated": len(rated), "happy": happy,
            "avg_rating": avg, "google_redirects": redirects}
