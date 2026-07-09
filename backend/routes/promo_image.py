"""Super-Admin AI Poster Studio — branded promo images with logo + marketing copy."""
import asyncio
import io
import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel

from database import _raw_db
from security import require_super_admin
from services.storage import _put_object
from routes.promo_video import _brand_logo, FONT_PATH, ALL_FEATURES

router = APIRouter()
log = logging.getLogger("promo_image")

APP_NAME = os.environ.get("APP_NAME", "miracurl")
SIZES = {"square": "1024x1024", "story": "1024x1536", "wide": "1536x1024"}


class PosterIn(BaseModel):
    topic: str = "The complete Miracurl Salon Suite — everything a salon needs, powered by AI"
    size: str = "square"  # square | story | wide


@router.post("/super/promo-image")
async def create_poster(body: PosterIn, request: Request, admin=Depends(require_super_admin)):
    from routes.mira_studio import _ask_json, _key
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration

    copy_task = _ask_json(
        f"You write punchy Instagram ad copy for 'Miracurl Salon Suite' — an all-in-one AI salon software "
        f"({ALL_FEATURES}). Topic for this poster: {body.topic}.",
        'Return JSON: {"headline":"<max 5 words, powerful>","subline":"<max 10 words about the software>",'
        '"image_prompt":"<lush cinematic salon/beauty-tech visual for the background, NO text in image>"}')

    copy = await asyncio.wait_for(copy_task, timeout=120)
    gen = OpenAIImageGeneration(api_key=_key())
    prompt = (f"{copy.get('image_prompt', 'premium modern salon interior, golden hour light')}. "
              "Cinematic, luxury beauty-tech aesthetic, rich rose-gold accents, space at the bottom third "
              "for text overlay. Absolutely NO text, NO letters, NO watermarks.")
    imgs = await asyncio.wait_for(
        gen.generate_images(prompt=prompt, model="gpt-image-1", number_of_images=1),
        timeout=240)
    if not imgs:
        raise RuntimeError("Image generation returned nothing — try again")

    tw, th = {"square": (1024, 1024), "story": (1024, 1536), "wide": (1536, 1024)}.get(body.size, (1024, 1024))
    final = await asyncio.to_thread(_compose_poster, imgs[0], copy.get("headline", ""), copy.get("subline", ""), tw, th)

    fid = str(uuid.uuid4())
    path = f"{APP_NAME}/superadmin/promo-images/{fid}.jpg"
    result = _put_object(path, final, "image/jpeg")
    await _raw_db.uploads.insert_one({
        "id": fid, "tenant_id": "superadmin", "kind": "promo_image",
        "storage_path": result.get("path", path), "original_filename": f"poster-{fid}.jpg",
        "content_type": "image/jpeg", "size": len(final), "uploaded_by": "poster_studio",
        "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat()})
    doc = {"id": fid, "url": f"/api/files/{fid}", "headline": copy.get("headline", ""),
           "subline": copy.get("subline", ""), "topic": body.topic, "poster_size": body.size,
           "created_at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.promo_images.insert_one({**doc})
    doc.pop("_id", None)
    return doc


@router.get("/super/promo-images")
async def list_posters(admin=Depends(require_super_admin)):
    return {"posters": await _raw_db.promo_images.find({}, {"_id": 0}).sort("created_at", -1).to_list(12)}


def _compose_poster(img_bytes: bytes, headline: str, subline: str, tw: int, th: int) -> bytes:
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    scale = max(tw / img.width, th / img.height)
    img = img.resize((round(img.width * scale), round(img.height * scale)))
    left, top = (img.width - tw) // 2, (img.height - th) // 2
    img = img.crop((left, top, left + tw, top + th))
    w, h = img.size

    # dark gradient band over the bottom third for text legibility
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    band_top = int(h * 0.62)
    for y in range(band_top, h):
        alpha = int(200 * (y - band_top) / (h - band_top))
        d.line([(0, y), (w, y)], fill=(10, 8, 14, alpha))
    img = Image.alpha_composite(img.convert("RGBA"), overlay)
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
    hl_font = _fit_font(hl_text, int(w * 0.062), w - 2 * margin)
    sub_font = _fit_font(sub_text, int(w * 0.032), w - 2 * margin)
    url_font = _font(int(w * 0.026))
    y = h - int(h * 0.24)
    if hl_text:
        d.text((margin, y), hl_text, font=hl_font, fill=(232, 195, 127, 255))
        y += int(w * 0.062) + 18
    if sub_text:
        d.text((margin, y), sub_text, font=sub_font, fill=(255, 255, 255, 235))
    d.text((margin, h - int(w * 0.026) - 34), "miracurlunisexsaloon.com/partner",
           font=url_font, fill=(210, 175, 130, 220))

    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=90)
    return buf.getvalue()
