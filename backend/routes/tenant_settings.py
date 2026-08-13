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

router = APIRouter()

from routes.auth import AFFILIATE_REWARD_INR

class VoiceGreetingIn(BaseModel):
    enabled: bool


@router.put("/settings/voice-greeting")
async def set_voice_greeting(body: VoiceGreetingIn, user=Depends(require_admin), t=Depends(current_tenant)):
    await db.tenants.update_one({"id": t["id"]}, {"$set": {"voice_greeting_enabled": body.enabled}})
    return {"enabled": body.enabled}


class BirthdayOfferIn(BaseModel):
    enabled: bool = True
    offer_text: str = Field("", max_length=200)


@router.get("/settings/birthday-offer")
async def get_birthday_offer(user=Depends(require_admin), t=Depends(current_tenant)):
    return {"enabled": t.get("birthday_emails_enabled", True), "offer_text": t.get("birthday_offer_text") or ""}


@router.put("/settings/birthday-offer")
async def set_birthday_offer(body: BirthdayOfferIn, user=Depends(require_admin), t=Depends(current_tenant)):
    await db.tenants.update_one(
        {"id": t["id"]},
        {"$set": {"birthday_emails_enabled": body.enabled, "birthday_offer_text": body.offer_text.strip()}})
    return {"enabled": body.enabled, "offer_text": body.offer_text.strip()}

# ---------------- Tenant / Super-Admin endpoints ----------------
@router.get("/tenants/current")
async def get_current_tenant(t=Depends(current_tenant)):
    """The tenant the current authenticated user belongs to (or has switched into)."""
    return t


class TenantGeoIn(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    branch: Optional[str] = None   # pin a specific branch instead of the main salon


@router.put("/tenants/current/geo")
async def set_tenant_geo(body: TenantGeoIn, admin=Depends(require_admin), t=Depends(current_tenant)):
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


_GEO_LINK_PATTERNS = [
    re.compile(r"!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)"),          # place pin (most precise)
    re.compile(r"[?&]q=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)"),      # ?q=lat,lng
    re.compile(r"[?&]ll=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)"),     # ?ll=lat,lng
    re.compile(r"@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)"),              # /@lat,lng,zoom (viewport)
    re.compile(r"loc:(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)"),
]


def _parse_maps_coords(url: str):
    for pat in _GEO_LINK_PATTERNS:
        m = pat.search(url)
        if m:
            lat, lng = float(m.group(1)), float(m.group(2))
            if -90 <= lat <= 90 and -180 <= lng <= 180:
                return lat, lng
    return None


def _expand_short_link(url: str) -> str:
    try:
        r = requests.get(url, allow_redirects=True, timeout=10,
                         headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        return r.url or url
    except requests.RequestException:
        return url


class TenantGeoLinkIn(BaseModel):
    url: str = Field(..., min_length=3, max_length=2000)
    branch: Optional[str] = None


async def _places_text_search(text: str):
    """(lat, lng, name, address) via Google Places API (New) — or None."""
    key = os.environ.get("GOOGLE_MAPS_API_KEY")
    text = (text or "").strip()
    if not key or not text:
        return None
    def _call():
        return requests.post(
            "https://places.googleapis.com/v1/places:searchText",
            headers={"X-Goog-Api-Key": key,
                     "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location"},
            json={"textQuery": text}, timeout=12).json()
    try:
        data = await asyncio.to_thread(_call)
    except requests.RequestException:
        return None
    places = data.get("places") or []
    if not places:
        return None
    p = places[0]
    loc = p.get("location") or {}
    if loc.get("latitude") is None:
        return None
    return (loc["latitude"], loc["longitude"],
            (p.get("displayName") or {}).get("text", ""), p.get("formattedAddress", ""))


def _place_query_from_url(url: str) -> str:
    from urllib.parse import unquote_plus
    m = re.search(r"/maps/place/([^/@?&]+)", url)
    if m:
        return unquote_plus(m.group(1)).replace("+", " ")
    m = re.search(r"[?&]q=([^&]+)", url)
    if m:
        q = unquote_plus(m.group(1))
        if not re.match(r"^-?\d", q):
            return q
    return ""


async def _resolve_maps_input(text: str):
    """Resolve a Google Maps URL, short link, or plain place-name text to
    (lat, lng, resolved_label). Returns None when nothing can be located."""
    from urllib.parse import unquote
    raw = (text or "").strip()
    if not raw:
        return None
    parsed = urlparse(raw)
    if parsed.scheme in ("http", "https"):
        host = (parsed.netloc or "").lower()
        if not any(h in host for h in ("google.", "goo.gl", "maps.app")):
            raise HTTPException(400, "That doesn't look like a Google Maps link")
        coords = _parse_maps_coords(raw)
        work_url = raw
        if not coords:
            work_url = await asyncio.to_thread(_expand_short_link, raw)
            coords = _parse_maps_coords(unquote(work_url))
        if coords:
            return coords[0], coords[1], ""
        q = _place_query_from_url(unquote(work_url)) or _place_query_from_url(unquote(raw))
        if q:
            hit = await _places_text_search(q)
            if hit:
                return hit[0], hit[1], f"{hit[2]}, {hit[3]}".strip(", ")
        return None
    hit = await _places_text_search(raw)
    if hit:
        return hit[0], hit[1], f"{hit[2]}, {hit[3]}".strip(", ")
    return None


@router.post("/tenants/current/geo/from-link")
async def set_tenant_geo_from_link(body: TenantGeoLinkIn, admin=Depends(require_admin), t=Depends(current_tenant)):
    """Pin salon/branch GPS from a Google Maps link (full or short URL) or a typed place name."""
    found = await _resolve_maps_input(body.url)
    if not found:
        raise HTTPException(400, "Couldn't locate that. Paste the full Google Maps URL from your browser's "
                                 "address bar, or simply type your salon name + area "
                                 "(e.g. 'Miracurl Salon Marathahalli').")
    lat, lng, resolved = found
    if body.branch:
        res = await db.tenants.update_one(
            {"id": t["id"], "branches.name": body.branch},
            {"$set": {"branches.$.latitude": lat, "branches.$.longitude": lng}})
        if res.matched_count == 0:
            raise HTTPException(404, f"Branch '{body.branch}' not found")
    else:
        await db.tenants.update_one({"id": t["id"]}, {"$set": {
            "latitude": lat, "longitude": lng,
            "geo_set_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "latitude": lat, "longitude": lng, "branch": body.branch, "resolved": resolved}


@router.delete("/tenants/current/geo")
async def clear_tenant_geo(branch: Optional[str] = None, admin=Depends(require_admin), t=Depends(current_tenant)):
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

def _branch_limit(t: dict) -> int:
    """Paid branch allowance — set by Super Admin. Defaults to what the salon already has (min 1)."""
    lim = t.get("branch_limit")
    return int(lim) if lim else max(len(t.get("branches") or []), 1)

@router.get("/branches")
async def list_branches(user=Depends(require_admin), t=Depends(current_tenant)):
    return t.get("branches", [])

@router.get("/branches/limit")
async def branch_limit_info(user=Depends(require_admin), t=Depends(current_tenant)):
    return {"limit": _branch_limit(t), "used": len(t.get("branches") or [])}

class BranchRequestIn(BaseModel):
    additional: int = Field(1, ge=1, le=50)
    note: str = Field("", max_length=300)


@router.post("/branches/request-more")
async def request_more_branches(body: BranchRequestIn, user=Depends(require_admin), t=Depends(current_tenant)):
    """Salon at its branch limit asks HQ to add N more branches — lands in HQ Inbox + email.
    HQ replies with a payment link; once paid, HQ raises branch_limit and the salon can add them."""
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    dup = await _raw_db.hq_messages.find_one({
        "tenant_id": t["id"], "subject": {"$regex": "^Branch limit increase"},
        "created_at": {"$gte": since}}, {"_id": 1})
    if dup:
        return {"ok": True, "already": True}
    limit, used = _branch_limit(t), len(t.get("branches") or [])
    owner = t.get("owner_email") or user.get("email") or "—"
    new_total = limit + body.additional
    subject = f"Branch limit increase request — {t['name']}"
    message = (f"{t['name']} ({t['slug']}) wants to add {body.additional} more "
               f"branch{'es' if body.additional != 1 else ''} (currently {used}/{limit} used, "
               f"new total requested: {new_total}). "
               + (f"Note from salon: \"{body.note.strip()}\". " if body.note.strip() else "")
               + f"Requested by {owner}. Next step: send a payment link for the {body.additional} extra "
               f"branch{'es' if body.additional != 1 else ''}; after payment, set Edit Tenant → Branch limit to {new_total}.")
    await _raw_db.hq_messages.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": t["id"], "tenant_name": t["name"],
        "from_email": owner, "subject": subject, "message": message,
        "branch_request": {"additional": body.additional, "current_limit": limit,
                           "used": used, "new_total": new_total},
        "attachments": [], "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()})
    try:
        await _send_email(
            [os.environ.get("HQ_EMAIL", "admin@miracurl.com")],
            f"[Miracurl HQ] {subject}",
            f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#333">
            <h2 style="color:#1a1a2e">🏢 New branch request</h2>
            <table style="font-size:14px;border-collapse:collapse">
              <tr><td style="padding:4px 12px 4px 0;color:#888">Salon</td><td><b>{html_lib.escape(t['name'])}</b> ({html_lib.escape(t['slug'])})</td></tr>
              <tr><td style="padding:4px 12px 4px 0;color:#888">Requested by</td><td>{html_lib.escape(owner)}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;color:#888">Current</td><td>{used}/{limit} branches used</td></tr>
              <tr><td style="padding:4px 12px 4px 0;color:#888">Wants to add</td><td><b>{body.additional}</b> more → new total <b>{new_total}</b></td></tr>
            </table>
            {f'<p style="font-size:13px;color:#555;margin-top:10px">Note: "{html_lib.escape(body.note.strip())}"</p>' if body.note.strip() else ''}
            <p style="font-size:13px;color:#555;margin-top:14px">➡️ Send a payment link for the extra branches. Once paid,
            open <b>Edit Tenant → Branch limit</b> and set it to <b>{new_total}</b>.</p></div>""")
    except Exception as e:
        logging.warning(f"branch upsell email failed: {e}")
    return {"ok": True, "additional": body.additional, "new_total": new_total}

async def _coords_from_maps_url(url: str):
    url = (url or "").strip()
    if not url:
        return None
    try:
        found = await _resolve_maps_input(url)
    except HTTPException:
        return None
    return (found[0], found[1]) if found else None


@router.post("/branches")
async def add_branch(body: BranchIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    branches = t.get("branches") or []
    limit = _branch_limit(t)
    if len(branches) >= limit:
        raise HTTPException(
            403, f"Your subscription covers {limit} branch{'es' if limit != 1 else ''}. "
                 "Contact Miracurl HQ to add more branches once the payment is done.")
    branch = {"id": str(uuid.uuid4()), **body.model_dump()}
    coords = await _coords_from_maps_url(body.maps_url)
    if coords:
        branch["latitude"], branch["longitude"] = coords
    await db.tenants.update_one({"id": t["id"]}, {"$push": {"branches": branch}})
    return branch

@router.put("/branches/{bid}")
async def update_branch(bid: str, body: BranchIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    old = next((b for b in (t.get("branches") or []) if b.get("id") == bid), None)
    fields = {f"branches.$.{k}": v for k, v in body.model_dump().items()}
    coords = await _coords_from_maps_url(body.maps_url)
    if coords:
        fields["branches.$.latitude"], fields["branches.$.longitude"] = coords
    res = await db.tenants.update_one(
        {"id": t["id"], "branches.id": bid},
        {"$set": fields})
    # Renamed? Cascade to everything joined by the old branch name so staff,
    # manager locks, attendance boards and revenue reports don't go blank.
    new_name = body.name.strip()
    old_name = (old or {}).get("name") or ""
    if old_name and new_name and old_name != new_name:
        await db.staff.update_many({"branch": old_name}, {"$set": {"branch": new_name}})
        await _raw_db.users.update_many(
            {"tenant_id": t["id"], "branch": old_name}, {"$set": {"branch": new_name}})
        await db.invoices.update_many(
            {"$or": [{"branch_id": bid}, {"branch_name": old_name}]},
            {"$set": {"branch_name": new_name}})
    if res.matched_count == 0:
        raise HTTPException(404, "Branch not found")
    return {"ok": True}

@router.delete("/branches/{bid}")
async def delete_branch(bid: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    await db.tenants.update_one({"id": t["id"]}, {"$pull": {"branches": {"id": bid}}})
    return {"ok": True}

# ---------------- Brand Studio (AI logo) ----------------
class LogoGenIn(BaseModel):
    style: str = Field("luxury gold minimal", max_length=200)

@router.post("/branding/logo/generate")
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

@router.post("/branding/logo/apply")
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


@router.get("/settings/tax")
async def get_tax_settings(user=Depends(require_admin), t=Depends(current_tenant)):
    return {
        "tax_enabled": bool(t.get("tax_enabled", False)),
        "gst_number": t.get("gst_number") or "",
        "gst_legal_name": t.get("gst_legal_name") or "",
        "tax_pct": float(t.get("tax_pct") or 0.0),
    }


@router.put("/settings/tax")
async def update_tax_settings(body: TaxSettingsIn, user=Depends(require_admin), t=Depends(current_tenant)):
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


@router.get("/settings/affiliate")
async def get_affiliate_summary(user=Depends(require_admin), t=Depends(current_tenant),
                                _pin=Depends(require_owner_pin)):
    """Returns the salon's referral link, earned credits, and list of referred salons."""
    cursor = db.affiliate_referrals.find(
        {"referrer_tenant_id": t["id"]}, {"_id": 0}
    ).sort("created_at", -1)
    referrals = await cursor.to_list(200)
    months_earned = sum(1 for r in referrals if r.get("status") == "credited")
    return {
        "slug": t["slug"],
        "credits": float(t.get("affiliate_credits") or 0),
        "reward_per_signup": AFFILIATE_REWARD_INR,
        "reward": "1 free month per paying salon",
        "months_earned": months_earned,
        "free_months_banked": int(t.get("referral_free_months") or 0),
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


@router.get("/settings/branding")
async def get_branding(user=Depends(require_admin), t=Depends(current_tenant)):
    return {
        "name": t.get("name", ""),
        "slug": t.get("slug", ""),
        "google_review_url": t.get("google_review_url") or "",
        "maps_url": t.get("maps_url") or "",
        "hours": t.get("hours") or "",
        "phone": t.get("phone") or "",
        "location": t.get("location") or "",
        "hero_image": t.get("hero_image") or "",
        "instagram_url": t.get("instagram_url") or "",
        "whatsapp_number": t.get("whatsapp_number") or "",
    }


@router.put("/settings/branding")
async def update_branding(body: BrandingIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    update = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not update:
        return {"ok": True}
    if update.get("maps_url"):
        try:
            found = await _resolve_maps_input(update["maps_url"])
        except HTTPException:
            found = None
        if found:
            update["latitude"], update["longitude"] = found[0], found[1]
            update["geo_set_at"] = datetime.now(timezone.utc).isoformat()
    await db.tenants.update_one({"id": t["id"]}, {"$set": update})
    return {"ok": True, **update}


@router.get("/dashboard/reminders")
async def upcoming_reminders(user=Depends(require_admin)):
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


@router.post("/dashboard/reminders/{aid}/mark-sent")
async def mark_reminder_sent(aid: str, user=Depends(require_admin)):
    """Owner clicked the WhatsApp button — flag the appointment so it stops showing in the list."""
    res = await db.appointments.update_one(
        {"id": aid},
        {"$set": {"reminder_sent_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Appointment not found")
    return {"ok": True}




@router.get("/settings/audit-log")
async def get_audit_log(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Owner's trail of sensitive actions: PIN uses, erases, exports, deletes."""
    rows = await _raw_db.audit_log.find(
        {"tenant_id": t["id"]}, {"_id": 0}).sort("at", -1).to_list(100)
    return {"items": rows}


@router.get("/settings/referral-nudge")
async def referral_nudge(user=Depends(require_admin), t=Depends(current_tenant)):
    """Lightweight, non-sensitive: pending referrals for the dashboard nudge banner (no PIN needed)."""
    pending = await db.affiliate_referrals.find(
        {"referrer_tenant_id": t["id"], "status": "pending"},
        {"_id": 0, "referred_salon_name": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(10)
    return {"pending": pending, "count": len(pending)}
