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

from routes.uploads import _MAX_UPLOAD_BYTES

# ---------------- Salon photo gallery (public salon page) ----------------
_GALLERY_MAX = 6


@router.get("/salon/gallery")
async def salon_gallery(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    doc = await _raw_db.tenants.find_one({"id": t["id"]}, {"_id": 0, "gallery": 1})
    return {"photos": (doc or {}).get("gallery") or [], "max": _GALLERY_MAX}


@router.post("/salon/gallery")
def _validated_gallery_upload(filename: str, data: bytes) -> str:
    """Validate extension, size and magic bytes for a gallery image. Returns the extension."""
    ext = (filename or "").rsplit(".", 1)[-1].lower() if "." in (filename or "") else "bin"
    if ext not in _MIME:
        raise HTTPException(400, "Only JPG, PNG, GIF or WebP images are allowed")
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Image too large — max {_MAX_UPLOAD_BYTES // (1024*1024)}MB")
    if not data:
        raise HTTPException(400, "Empty file")
    validate_image_bytes(ext, data)
    return ext


async def salon_gallery_upload(file: UploadFile = File(...), user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    doc = await _raw_db.tenants.find_one({"id": t["id"]}, {"_id": 0, "gallery": 1})
    photos = (doc or {}).get("gallery") or []
    if len(photos) >= _GALLERY_MAX:
        raise HTTPException(400, f"Gallery is full — max {_GALLERY_MAX} photos. Remove one first.")
    data = await file.read()
    ext = _validated_gallery_upload(file.filename, data)
    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/tenants/{t['id']}/gallery/{file_id}.{ext}"
    try:
        result = _put_object(storage_path, data, _MIME[ext])
    except requests.HTTPError as e:
        raise HTTPException(400, f"Storage upload failed: {e}") from e
    await _raw_db.uploads.insert_one({
        "id": file_id, "tenant_id": t["id"], "kind": "gallery",
        "storage_path": result.get("path", storage_path),
        "original_filename": file.filename or f"{file_id}.{ext}",
        "content_type": _MIME[ext], "size": len(data),
        "uploaded_by": user["id"], "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    photo = {"id": file_id, "url": f"/api/files/{file_id}"}
    await _raw_db.tenants.update_one({"id": t["id"]}, {"$push": {"gallery": photo}})
    return photo


@router.delete("/salon/gallery/{fid}")
async def salon_gallery_delete(fid: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    res = await _raw_db.tenants.update_one({"id": t["id"]}, {"$pull": {"gallery": {"id": fid}}})
    if res.modified_count == 0:
        raise HTTPException(404, "Photo not found")
    await _raw_db.uploads.update_one({"id": fid, "tenant_id": t["id"]}, {"$set": {"is_deleted": True}})
    return {"ok": True}


# ---------------- Vendors & morning briefing ----------------
# ---------------- Salon Media Gallery + AI Promo Generator ----------------
_GALLERY_IMG = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "gif": "image/gif"}
_GALLERY_VID = {"mp4": "video/mp4", "mov": "video/quicktime", "webm": "video/webm"}
_MAX_GALLERY_IMG = 5 * 1024 * 1024
_MAX_GALLERY_VID = 25 * 1024 * 1024

from dataclasses import dataclass


@dataclass
class GalleryMedia:
    data: bytes
    ext: str
    mime: str
    kind: str          # image | video
    caption: str
    source: str        # upload | ai
    uploaded_by: str
    filename: str = ""


async def _store_gallery_media(t, media: GalleryMedia):
    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/tenants/{t['id']}/gallery/{file_id}.{media.ext}"
    try:
        result = _put_object(storage_path, media.data, media.mime)
    except requests.HTTPError as e:
        raise HTTPException(400, f"Storage upload failed: {e}") from e
    await _raw_db.uploads.insert_one({
        "id": file_id, "tenant_id": t["id"], "kind": "gallery",
        "storage_path": result.get("path", storage_path),
        "original_filename": media.filename or f"{file_id}.{media.ext}",
        "content_type": media.mime, "size": len(media.data), "uploaded_by": media.uploaded_by,
        "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    doc = {"id": file_id, "url": f"/api/files/{file_id}", "kind": media.kind, "caption": media.caption,
           "source": media.source, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.gallery.insert_one(doc)
    return _clean(doc)

@router.post("/gallery/upload")
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
    return await _store_gallery_media(t, GalleryMedia(
        data=data, ext=ext, mime=mime, kind=kind, caption=caption,
        source="upload", uploaded_by=user["id"], filename=file.filename or ""))

class PromoGenIn(BaseModel):
    prompt: str = Field(..., min_length=5, max_length=500)

@router.post("/gallery/generate")
async def gallery_generate(body: PromoGenIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    from routes.offer_flyer import TEMPLATES, FlyerIn, _compose_flyer, _load_logo
    from routes.mira_common import _ask_json, _gen_image_bytes
    tpl_keys = ", ".join(TEMPLATES.keys())
    plan = await _ask_json(
        f"You design salon promo flyers for '{t.get('name', 'the salon')}', a premium Indian salon. "
        "Parse the owner's offer request into flyer fields.",
        f"Offer request: {body.prompt}\nPick the best template from: {tpl_keys} "
        "(bridal→bridal_blush, men→mens_edge, festive→festive_sparkle, otherwise royal_gold/dark_glam/navy_classic).\n"
        'Return JSON: {"template":"<key>","headline":"<2-4 word offer headline>",'
        '"offer_text":"<one punchy line with the discount % or price>",'
        '"services":["<service — price>", "...max 3, ONLY if distinct services beyond the main offer are mentioned, else []"],'
        '"valid_until":"<validity text or empty>",'
        '"post_caption":"<ready-to-post social caption: hook line, offer details, validity, book-now CTA, 5-8 hashtags>"}')
    template = plan.get("template") if plan.get("template") in TEMPLATES else "royal_gold"
    tpl = TEMPLATES[template]
    img_prompt = (f"{tpl['prompt']}. Vertical poster composition with generous empty space on the left half "
                  "for text overlay. Absolutely NO text, NO letters, NO logos, NO watermarks.")
    bg = await _gen_image_bytes(img_prompt)
    if not bg:
        raise HTTPException(400, "Image generation failed — try again")
    flyer = FlyerIn(
        template=template,
        headline=(plan.get("headline") or "Special Offer")[:40],
        offer_text=(plan.get("offer_text") or body.prompt)[:80],
        services=[str(s)[:44] for s in (plan.get("services") or [])[:3]],
        valid_until=str(plan.get("valid_until") or "")[:40])
    logo_bytes = await _load_logo(t)
    final = await asyncio.to_thread(_compose_flyer, bg, flyer, tpl, t, logo_bytes)
    item = await _store_gallery_media(t, GalleryMedia(
        data=final, ext="jpg", mime="image/jpeg", kind="image",
        caption=body.prompt, source="ai", uploaded_by=user["id"]))
    caption = str(plan.get("post_caption") or body.prompt).replace("\\n", "\n")
    await db.gallery.update_one({"id": item["id"]}, {"$set": {"post_caption": caption}})
    item["post_caption"] = caption
    return item

@router.get("/gallery")
async def list_gallery(user=Depends(get_current_user)):
    return await db.gallery.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

@router.delete("/gallery/{gid}")
async def delete_gallery_item(gid: str, user=Depends(require_tenant_admin)):
    await db.gallery.delete_one({"id": gid})
    await _raw_db.uploads.update_one({"id": gid}, {"$set": {"is_deleted": True}})
    return {"ok": True}

