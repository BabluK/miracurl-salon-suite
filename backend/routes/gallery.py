# Extracted from server.py — domain route module (auto-split refactor)
import uuid
import asyncio
from datetime import datetime, timezone

import requests
from fastapi import (
    APIRouter, HTTPException, Depends, Query, UploadFile, File,
)
from pydantic import BaseModel, Field

from database import _raw_db, db, _clean
from security import (
    get_current_user, require_tenant_admin, current_tenant,
)
from services.storage import _put_object, _MIME, APP_NAME, validate_image_bytes

router = APIRouter()

from routes.uploads import _MAX_UPLOAD_BYTES

# ---------------- Salon photo gallery (public salon page) ----------------
_GALLERY_MAX = 6


@router.get("/salon/gallery")
async def salon_gallery(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    doc = await _raw_db.tenants.find_one({"id": t["id"]}, {"_id": 0, "gallery": 1})
    return {"photos": (doc or {}).get("gallery") or [], "max": _GALLERY_MAX}


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


@router.post("/salon/gallery")
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

_PROMO_JSON_SHAPE = ('Return JSON: {"template":"<key>","headline":"<2-4 word offer headline>",'
                     '"offer_text":"<one punchy line with the discount % or price>",'
                     '"services":["<{item} — price>", "...max 3, ONLY if distinct {items} beyond the main offer are mentioned, else []"],'
                     '"valid_until":"<validity text or empty>",'
                     '"post_caption":"<ready-to-post social caption: hook line, offer details, validity, {cta} CTA, 5-8 hashtags>"}')
_PROMO_IMG_SUFFIX = (". Vertical poster composition with generous empty space on the left half "
                     "for text overlay. Absolutely NO text, NO letters, NO logos, NO watermarks.")
_RESTO_BG_PROMPT = ("Appetizing spread of gourmet restaurant dishes with rich garnishes on a dark elegant table, "
                    "warm candlelight and golden bokeh, premium editorial food photography")


async def _promo_plan(prompt: str, t: dict, resto: bool, tpl_keys: str) -> dict:
    from routes.mira_common import _ask_json
    if resto:
        system = (f"You design restaurant promo flyers for '{t.get('name', 'the restaurant')}', a premium Indian restaurant. "
                  "Parse the owner's offer request into flyer fields.")
        pick = "Pick the best template from: dark_glam, royal_gold, emerald_luxe, festive_sparkle, navy_classic."
        shape = _PROMO_JSON_SHAPE.format(item="dish", items="dishes", cta="order-now")
    else:
        system = (f"You design salon promo flyers for '{t.get('name', 'the salon')}', a premium Indian salon. "
                  "Parse the owner's offer request into flyer fields.")
        pick = (f"Pick the best template from: {tpl_keys} "
                "(bridal→bridal_blush, men→mens_edge, festive→festive_sparkle, otherwise royal_gold/dark_glam/navy_classic).")
        shape = _PROMO_JSON_SHAPE.format(item="service", items="services", cta="book-now")
    return await _ask_json(system, f"Offer request: {prompt}\n{pick}\n{shape}")


def _promo_flyer_in(plan: dict, prompt: str, template: str):
    from routes.offer_flyer import FlyerIn
    return FlyerIn(
        template=template,
        headline=(plan.get("headline") or "Special Offer")[:40],
        offer_text=(plan.get("offer_text") or prompt)[:80],
        services=[str(s)[:44] for s in (plan.get("services") or [])[:3]],
        valid_until=str(plan.get("valid_until") or "")[:40])


@router.post("/gallery/generate")
async def gallery_generate(body: PromoGenIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    from routes.offer_flyer import TEMPLATES, _compose_flyer, _load_logo
    from routes.mira_common import _gen_image_bytes
    resto = t.get("business_type") == "restaurant"
    plan = await _promo_plan(body.prompt, t, resto, ", ".join(TEMPLATES.keys()))
    template = plan.get("template") if plan.get("template") in TEMPLATES else "royal_gold"
    tpl = TEMPLATES[template]
    bg = await _gen_image_bytes((_RESTO_BG_PROMPT if resto else tpl["prompt"]) + _PROMO_IMG_SUFFIX)
    if not bg:
        raise HTTPException(400, "Image generation failed — try again")
    logo_bytes = await _load_logo(t)
    final = await asyncio.to_thread(_compose_flyer, bg, _promo_flyer_in(plan, body.prompt, template), tpl, t, logo_bytes)
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
    up_q = {"id": gid}
    if user.get("tenant_id"):
        up_q["tenant_id"] = user["tenant_id"]
    await _raw_db.uploads.update_one(up_q, {"$set": {"is_deleted": True}})
    return {"ok": True}

