"""Super-Admin AI Poster Studio — branded promo images with logo + marketing copy."""
import asyncio
import io
import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel

from database import _raw_db
from security import require_super_admin
from services.storage import _put_object
from routes.promo_video import _brand_logo, FONT_PATH, ALL_FEATURES, BROCHURE_DIR

router = APIRouter()
log = logging.getLogger("promo_image")

APP_NAME = os.environ.get("APP_NAME", "miracurl")
SIZES = {"square": "1024x1024", "story": "1024x1536", "wide": "1536x1024"}


class PosterIn(BaseModel):
    topic: str = "The complete Miracurl Salon Suite — everything a salon needs, powered by AI"
    size: str = "square"  # square | story | wide
    contact: str = ""  # e.g. "+91 98765 43210 · hello@miracurl.com"


@router.post("/super/promo-image")
async def create_poster(body: PosterIn, request: Request, admin=Depends(require_super_admin)):
    return await generate_poster_core(body.topic, body.size, body.contact)


@router.delete("/super/promo-image/{pid}")
async def delete_poster(pid: str, admin=Depends(require_super_admin)):
    doc = await _raw_db.promo_images.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Poster not found")
    await _raw_db.uploads.delete_one({"id": pid})
    await _raw_db.promo_images.delete_one({"id": pid})
    return {"deleted": 1}


async def generate_poster_core(topic: str, size: str = "square", contact: str = "") -> dict:
    from routes.mira_studio import _ask_json, _key
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration

    copy_task = _ask_json(
        f"You write punchy Instagram ad copy for 'Miracurl Salon Suite' — an all-in-one AI salon software "
        f"({ALL_FEATURES}). Topic for this poster: {topic}.",
        'Return JSON: {"headline":"<max 5 words, powerful>","subline":"<max 10 words about the software>",'
        '"image_prompt":"<lush cinematic salon/beauty-tech visual for the background, NO text in image>"}')

    copy = await asyncio.wait_for(copy_task, timeout=120)
    gen = OpenAIImageGeneration(api_key=_key())
    prompt = (f"{copy.get('image_prompt', 'premium modern salon interior, golden hour light')}. "
              "Soft-focus ambient background for a software advertisement — dreamy premium salon atmosphere, "
              "bokeh, rich rose-gold and charcoal tones, NOT the main subject (a UI screenshot will be placed on top). "
              "Absolutely NO text, NO letters, NO watermarks, NO devices.")
    imgs = await asyncio.wait_for(
        gen.generate_images(prompt=prompt, model="gpt-image-1", number_of_images=1),
        timeout=240)
    if not imgs:
        raise RuntimeError("Image generation returned nothing — try again")

    tw, th = {"square": (1024, 1024), "story": (1024, 1536), "wide": (1536, 1024)}.get(size, (1024, 1024))
    final = await asyncio.to_thread(_compose_poster, imgs[0], copy.get("headline", ""), copy.get("subline", ""), tw, th, contact)

    fid = str(uuid.uuid4())
    path = f"{APP_NAME}/superadmin/promo-images/{fid}.jpg"
    result = _put_object(path, final, "image/jpeg")
    await _raw_db.uploads.insert_one({
        "id": fid, "tenant_id": "superadmin", "kind": "promo_image",
        "storage_path": result.get("path", path), "original_filename": f"poster-{fid}.jpg",
        "content_type": "image/jpeg", "size": len(final), "uploaded_by": "poster_studio",
        "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat()})
    doc = {"id": fid, "url": f"/api/files/{fid}", "headline": copy.get("headline", ""),
           "subline": copy.get("subline", ""), "topic": topic, "poster_size": size,
           "created_at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.promo_images.insert_one({**doc})
    doc.pop("_id", None)
    return doc


@router.get("/super/promo-images")
async def list_posters(admin=Depends(require_super_admin)):
    return {"posters": await _raw_db.promo_images.find({}, {"_id": 0}).sort("created_at", -1).to_list(12)}


def _compose_poster(img_bytes: bytes, headline: str, subline: str, tw: int, th: int, contact: str = "") -> bytes:
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    scale = max(tw / img.width, th / img.height)
    img = img.resize((round(img.width * scale), round(img.height * scale)))
    left, top = (img.width - tw) // 2, (img.height - th) // 2
    img = img.crop((left, top, left + tw, top + th))
    w, h = img.size

    # dark gradient band over the bottom 45% for the screenshot + text
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    band_top = int(h * 0.30)
    for y in range(band_top, h):
        alpha = int(215 * (y - band_top) / (h - band_top))
        d.line([(0, y), (w, y)], fill=(10, 8, 14, alpha))
    img = Image.alpha_composite(img.convert("RGBA"), overlay)
    d = ImageDraw.Draw(img)

    # real app screenshot card — the software IS the subject
    shot_path = os.path.join(BROCHURE_DIR, "dashboard.png")
    if os.path.exists(shot_path):
        shot = Image.open(shot_path).convert("RGBA")
        sw = int(w * 0.78)
        sh = int(shot.height * sw / shot.width)
        max_sh = int(h * 0.40)
        if sh > max_sh:
            sh = max_sh
            sw = int(shot.width * sh / shot.height)
        shot = shot.resize((sw, sh))
        mask = Image.new("L", (sw, sh), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, sw, sh], radius=int(sw * 0.03), fill=255)
        sx, sy = (w - sw) // 2, int(h * 0.16)
        glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(glow).rounded_rectangle(
            [sx - 8, sy - 8, sx + sw + 8, sy + sh + 8], radius=int(sw * 0.035), fill=(212, 175, 55, 90))
        img = Image.alpha_composite(img, glow)
        img.paste(shot, (sx, sy), mask)
        d = ImageDraw.Draw(img)

    logo = _brand_logo(max(120, int(w * 0.15)))
    if logo:
        img.paste(logo, (w - logo.width - 36, 36), logo)

    def _font(sz):
        try:
            return ImageFont.truetype(FONT_PATH, sz)
        except OSError:
            return ImageFont.load_default()

    def _fit_font(text, start_sz, max_width):
        sz = start_sz
        while sz > 18:
            f = _font(sz)
            if d.textlength(text, font=f) <= max_width:
                return f
            sz -= 4
        return _font(sz)

    margin = int(w * 0.055)
    hl_text = headline.strip()[:40]
    sub_text = subline.strip()[:70]
    feat_text = "Bookings · POS & GST Billing · Verified Staff · AI Marketing"
    hl_font = _fit_font(hl_text, int(w * 0.058), w - 2 * margin)
    sub_font = _fit_font(sub_text, int(w * 0.030), w - 2 * margin)
    feat_font = _fit_font(feat_text, int(w * 0.026), w - 2 * margin)
    url_font = _font(int(w * 0.024))
    y = h - int(h * 0.27)
    if hl_text:
        d.text((margin, y), hl_text, font=hl_font, fill=(232, 195, 127, 255))
        y += int(w * 0.058) + 16
    if sub_text:
        d.text((margin, y), sub_text, font=sub_font, fill=(255, 255, 255, 235))
        y += int(w * 0.030) + 14
    d.text((margin, y), feat_text, font=feat_font, fill=(226, 178, 148, 235))
    y += int(w * 0.026) + 14
    if contact.strip():
        contact_text = f"Inquiry: {contact.strip()[:70]}"
        contact_font = _fit_font(contact_text, int(w * 0.026), w - 2 * margin)
        d.text((margin, y), contact_text, font=contact_font, fill=(255, 255, 255, 220))
    d.text((margin, h - int(w * 0.024) - 30), "miracurl-suite.com/partner",
           font=url_font, fill=(210, 175, 130, 220))

    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=90)
    return buf.getvalue()
