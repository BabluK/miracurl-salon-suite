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

_MAX_UPLOAD_BYTES = 3 * 1024 * 1024  # 3MB — plenty for a Retina thumbnail


@router.post("/uploads/image")
async def upload_image(
    file: UploadFile = File(...),
    kind: str = Query("misc", regex=r"^(staff|service|product|misc|hero|promo|logo)$"),
    user=Depends(get_current_user),
):
    """Accept a laptop/phone image upload. Salon admins store under their tenant
    path (cross-tenant leakage impossible); super admins (no tenant) store under
    the superadmin path (e.g. promo video photos)."""
    if user.get("role") == "super_admin":
        tenant_id = "superadmin"
    elif user.get("role") == "admin":
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
    if kind == "logo":
        try:
            data = await asyncio.to_thread(_fit_logo, data)
            ext = "png"
        except Exception:
            pass  # keep original if processing fails
    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/tenants/{tenant_id}/{kind}/{file_id}.{ext}"
    try:
        result = await asyncio.to_thread(_put_object, storage_path, data, _MIME[ext])
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


def _fit_logo(data: bytes) -> bytes:
    """Auto-fit uploaded logos: if the background is a light uniform box (common
    with exported logos), unblend it to transparency, then tight-crop so the
    logo fills its display plaque edge-to-edge."""
    from PIL import Image as PILImage
    import numpy as np
    PILImage.MAX_IMAGE_PIXELS = 40_000_000
    from PIL import ImageOps as _IO
    im = _IO.exif_transpose(PILImage.open(io.BytesIO(data))).convert("RGBA")
    a = np.asarray(im).astype(np.float64) / 255.0
    rgb, orig_alpha = a[..., :3], a[..., 3]
    c = 12
    corners = np.concatenate([rgb[:c, :c].reshape(-1, 3), rgb[:c, -c:].reshape(-1, 3),
                              rgb[-c:, :c].reshape(-1, 3), rgb[-c:, -c:].reshape(-1, 3)])
    if corners.mean() > 0.86 and corners.std() < 0.08:
        alpha = np.clip((1.0 - rgb.min(axis=2)) * 2.6, 0, 1) * orig_alpha
        fg = np.zeros_like(rgb)
        m = alpha > 0.02
        for ch in range(3):
            fg[..., ch][m] = np.clip((rgb[..., ch][m] - (1 - alpha[m])) / alpha[m], 0, 1)
        im = PILImage.fromarray(
            np.dstack([(fg * 255).astype(np.uint8), (alpha * 255).astype(np.uint8)]), "RGBA")
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    if im.width > 1200:
        im = im.resize((1200, int(im.height * 1200 / im.width)), PILImage.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


_THUMB_WIDTHS = (160, 320, 480, 640, 960)


def _resize_webp(data: bytes, w: int) -> bytes:
    from PIL import Image as _PILImage
    _PILImage.MAX_IMAGE_PIXELS = 40_000_000  # pixel-bomb guard
    from PIL import ImageOps as _ImageOps
    im = _ImageOps.exif_transpose(_PILImage.open(io.BytesIO(data)))  # honour phone EXIF rotation (portrait shots no longer turn sideways)
    if im.width > w:
        im = im.resize((w, int(im.height * w / im.width)), _PILImage.LANCZOS)
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA" if "A" in im.mode or im.mode == "P" else "RGB")
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=78)
    return buf.getvalue()


_SAFE_TYPES = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "gif": "image/gif",
               "svg": "image/svg+xml", "mp4": "video/mp4", "webm": "video/webm", "pdf": "application/pdf"}


def _safe_media_type(rec: dict, fallback: str) -> str:
    """Never trust the stored/client content-type: derive from the storage extension (SEC-002)."""
    ext = (rec.get("storage_path") or "").rsplit(".", 1)[-1].lower()
    return _SAFE_TYPES.get(ext) or ("application/octet-stream" if not (fallback or "").startswith(("image/", "video/")) else fallback)


@router.get("/files/{file_id}")
async def download_file(file_id: str, w: Optional[int] = Query(None, ge=16, le=2000)):
    """Serve an uploaded image. Public by design — anyone with the URL can view
    (same as an Instagram CDN link). The unguessable UUID is the token.
    Optional ?w= serves a cached, resized WEBP variant (perf: original service
    photos are ~2MB; thumbnails cut page weight ~95%)."""
    rec = await _raw_db.uploads.find_one({"id": file_id, "is_deleted": False})
    if not rec:
        raise HTTPException(404, "File not found")
    _headers = {"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"}
    if w:
        w = min(_THUMB_WIDTHS, key=lambda x: abs(x - w))
        variant_path = f"{rec['storage_path']}.w{w}.webp"
        try:
            data, _ = await asyncio.to_thread(_get_object, variant_path)
            return Response(content=data, media_type="image/webp", headers=_headers)
        except Exception:
            pass
        try:
            original, _ = await asyncio.to_thread(_get_object, rec["storage_path"])
            data = await asyncio.to_thread(_resize_webp, original, w)
            asyncio.ensure_future(asyncio.to_thread(_put_object, variant_path, data, "image/webp"))
            return Response(content=data, media_type="image/webp", headers=_headers)
        except requests.HTTPError as e:
            raise HTTPException(400, f"Storage fetch failed: {e}") from e
        except Exception:
            pass  # not an image / resize failed — fall through to original
    try:
        data, ct = await asyncio.to_thread(_get_object, rec["storage_path"])
    except requests.HTTPError as e:
        raise HTTPException(400, f"Storage fetch failed: {e}") from e
    mt = _safe_media_type(rec, ct)
    if mt in ("image/svg+xml", "application/octet-stream"):
        _headers["Content-Disposition"] = "attachment"
    return Response(content=data, media_type=mt, headers=_headers)


_PROXY_HOSTS = ("static.prod-images.emergentagent.com", "customer-assets.emergentagent.com",
                "customer-assets-4nw71qhi.emergentagent.net")


@router.get("/img")
async def img_thumb_proxy(src: str = Query(..., max_length=1000), w: int = Query(480, ge=16, le=2000),
                          _rl=Depends(public_rate_limit)):
    """Resize-cache proxy for our own CDN-hosted AI images (SSRF-safe: host allowlist)."""
    host = urlparse(src).netloc.lower()
    if urlparse(src).scheme != "https" or host not in _PROXY_HOSTS:
        raise HTTPException(400, "Host not allowed")
    w = min(_THUMB_WIDTHS, key=lambda x: abs(x - w))
    key = hashlib.sha256(f"{src}|{w}".encode()).hexdigest()
    cache_path = f"{APP_NAME}/imgcache/{key}.webp"
    _headers = {"Cache-Control": "public, max-age=31536000, immutable"}
    try:
        data, _ = await asyncio.to_thread(_get_object, cache_path)
        return Response(content=data, media_type="image/webp", headers=_headers)
    except Exception:
        pass
    def _fetch():
        r = requests.get(src, timeout=12, stream=True, allow_redirects=False)
        if r.status_code in (301, 302, 303, 307, 308):
            raise ValueError("Redirects not allowed from image CDN")
        r.raise_for_status()
        chunks, total = [], 0
        for chunk in r.iter_content(65536):
            total += len(chunk)
            if total > 15 * 1024 * 1024:
                raise ValueError("Image too large")
            chunks.append(chunk)
        return b"".join(chunks)
    try:
        original = await asyncio.to_thread(_fetch)
        data = await asyncio.to_thread(_resize_webp, original, w)
    except Exception as e:
        raise HTTPException(400, f"Image fetch failed: {e}") from e
    asyncio.ensure_future(asyncio.to_thread(_put_object, cache_path, data, "image/webp"))
    return Response(content=data, media_type="image/webp", headers=_headers)


