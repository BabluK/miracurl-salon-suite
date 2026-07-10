"""Tenant AI Flyer Studio — premium offer flyers from pro templates (admin + owner)."""
import asyncio
import io
import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel

from database import _raw_db
from security import require_tenant_admin, current_tenant
from services.storage import _put_object
from routes.promo_video import FONT_PATH

router = APIRouter()
log = logging.getLogger("offer_flyer")

APP_NAME = os.environ.get("APP_NAME", "miracurl")

TEMPLATES = {
    "navy_classic": {
        "label": "Navy Classic", "accent": (212, 175, 55), "text": (255, 255, 255),
        "prompt": "elegant female model with flowing styled hair, deep navy blue studio background, "
                  "golden circle frame behind her, premium beauty salon advertisement photography",
    },
    "dark_glam": {
        "label": "Dark Glam", "accent": (232, 195, 127), "text": (255, 255, 255),
        "prompt": "glamorous model with luxurious wavy hair, dark charcoal background with golden bokeh "
                  "lights, high-end salon advertisement, cinematic beauty photography",
    },
    "purple_pop": {
        "label": "Purple Pop", "accent": (255, 214, 90), "text": (255, 255, 255),
        "prompt": "confident model with curly hair smiling, vibrant violet-purple background with abstract "
                  "circles, modern trendy salon promo advertisement, energetic beauty photography",
    },
    "rose_wave": {
        "label": "Rose Wave", "accent": (255, 255, 255), "text": (60, 35, 45),
        "prompt": "serene model receiving a spa hair treatment, soft rose-pink and cream background with "
                  "gentle wave shapes, calming premium salon advertisement, airy beauty photography",
    },
}


class FlyerIn(BaseModel):
    template: str = "navy_classic"
    headline: str = "Special Offer"
    offer_text: str = "Get 30% OFF on all services"
    services: list[str] = []  # e.g. ["Haircut ₹299", "Facial ₹499"]
    valid_until: str = ""


@router.post("/offers/flyer")
async def create_flyer(body: FlyerIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    if body.template not in TEMPLATES:
        raise HTTPException(400, "Unknown template")
    from routes.mira_studio import _key
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
    tpl = TEMPLATES[body.template]
    gen = OpenAIImageGeneration(api_key=_key())
    prompt = (f"{tpl['prompt']}. Vertical poster composition with generous empty space on the left half "
              "for text overlay. Absolutely NO text, NO letters, NO logos, NO watermarks.")
    imgs = await asyncio.wait_for(gen.generate_images(prompt=prompt, model="gpt-image-1", number_of_images=1), timeout=240)
    if not imgs:
        raise HTTPException(502, "Image generation failed — try again")

    final = await asyncio.to_thread(_compose_flyer, imgs[0], body, tpl, t)
    fid = str(uuid.uuid4())
    path = f"{APP_NAME}/tenants/{t['id']}/flyers/{fid}.jpg"
    result = _put_object(path, final, "image/jpeg")
    await _raw_db.uploads.insert_one({
        "id": fid, "tenant_id": t["id"], "kind": "offer_flyer",
        "storage_path": result.get("path", path), "original_filename": f"flyer-{fid}.jpg",
        "content_type": "image/jpeg", "size": len(final), "uploaded_by": user.get("email", ""),
        "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat()})
    doc = {"id": fid, "tenant_id": t["id"], "url": f"/api/files/{fid}", "template": body.template,
           "headline": body.headline, "offer_text": body.offer_text, "size_kb": round(len(final) / 1024),
           "created_at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.offer_flyers.insert_one({**doc})
    doc.pop("_id", None)
    return doc


@router.get("/offers/flyers")
async def list_flyers(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return {"flyers": await _raw_db.offer_flyers.find(
        {"tenant_id": t["id"]}, {"_id": 0}).sort("created_at", -1).to_list(12)}


@router.delete("/offers/flyers/{fid}")
async def delete_flyer(fid: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    doc = await _raw_db.offer_flyers.find_one({"id": fid, "tenant_id": t["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Flyer not found")
    await _raw_db.uploads.delete_one({"id": fid, "tenant_id": t["id"]})
    await _raw_db.offer_flyers.delete_one({"id": fid, "tenant_id": t["id"]})
    return {"deleted": 1}


def _compose_flyer(img_bytes: bytes, body: FlyerIn, tpl: dict, t: dict) -> bytes:
    W, H = 1024, 1280
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    scale = max(W / img.width, H / img.height)
    img = img.resize((round(img.width * scale), round(img.height * scale)))
    left, top = (img.width - W) // 2, (img.height - H) // 2
    img = img.crop((left, top, left + W, top + H)).convert("RGBA")
    d = ImageDraw.Draw(img)
    accent, text_col = tpl["accent"], tpl["text"]

    # left scrim so text is always readable regardless of the AI background
    scrim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(scrim)
    dark = tpl["text"] == (255, 255, 255)
    base = (12, 12, 20) if dark else (255, 246, 244)
    for x in range(int(W * 0.62)):
        alpha = int(215 * (1 - x / (W * 0.62)))
        sd.line([(x, 0), (x, H)], fill=(*base, alpha))
    img = Image.alpha_composite(img, scrim)
    d = ImageDraw.Draw(img)

    def _font(sz):
        try:
            return ImageFont.truetype(FONT_PATH, sz)
        except OSError:
            return ImageFont.load_default()

    def _fit(text, start, maxw):
        sz = start
        while sz > 16 and d.textlength(text, font=_font(sz)) > maxw:
            sz -= 3
        return _font(sz)

    m, maxw = 56, int(W * 0.56)
    y = 72
    salon = (t.get("name") or "Your Salon").upper()
    d.text((m, y), salon, font=_fit(salon, 40, maxw), fill=(*accent, 255))
    y += 62
    d.rectangle([m, y, m + 90, y + 4], fill=(*accent, 255))
    y += 40

    hl = body.headline.strip()[:36] or "Special Offer"
    d.text((m, y), hl, font=_fit(hl, 78, maxw), fill=(*text_col, 255))
    y += 110

    offer = body.offer_text.strip()[:60]
    if offer:
        d.text((m, y), offer, font=_fit(offer, 44, maxw), fill=(*accent, 255))
        y += 84

    for s in body.services[:5]:
        line = f"•  {s.strip()[:42]}"
        d.text((m, y), line, font=_fit(line, 34, maxw), fill=(*text_col, 235))
        y += 52

    if body.valid_until.strip():
        y += 16
        vu = f"Valid until {body.valid_until.strip()[:24]}"
        d.text((m, y), vu, font=_fit(vu, 26, maxw), fill=(*text_col, 190))

    # contact bar
    bar_h = 92
    d.rectangle([0, H - bar_h, W, H], fill=(*accent, 255))
    dark_txt = (25, 20, 15)
    phone = t.get("phone") or t.get("contact_phone") or ""
    addr = (t.get("address") or "")[:52]
    contact = "   ·   ".join(x for x in [phone, addr] if x) or "Book your appointment today"
    d.text((m, H - bar_h + 16), contact, font=_fit(contact, 28, W - 2 * m), fill=(*dark_txt, 255))
    slug = t.get("slug", "")
    site = os.environ.get("APP_PUBLIC_URL", "").replace("https://", "")
    if slug and site:
        book = f"Book online: {site}/book/{slug}"
        d.text((m, H - bar_h + 54), book, font=_fit(book, 24, W - 2 * m), fill=(*dark_txt, 220))

    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=90)
    return buf.getvalue()
