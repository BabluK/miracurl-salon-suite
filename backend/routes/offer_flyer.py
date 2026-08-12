"""Tenant AI Flyer Studio — premium offer flyers from pro templates (admin + owner)."""
import asyncio
import io
import logging
import math
import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel

from database import _raw_db, db
from security import require_tenant_admin, current_tenant
from services.storage import _put_object, _get_object
from routes.promo_common import FONT_PATH, stamp_monogram

router = APIRouter()
log = logging.getLogger("offer_flyer")

APP_NAME = os.environ.get("APP_NAME", "miracurl")

TEMPLATES = {
    "pink_glam": {
        "label": "Pink Glam", "accent": (255, 220, 120), "text": (255, 255, 255),
        "prompt": "stunning glamorous female model with bold red lips, dramatic smokey eye makeup and long "
                  "jeweled nails touching her face, hot pink and magenta gradient studio background, "
                  "high-fashion beauty salon advertisement photography, luxurious and vibrant",
    },
    "royal_gold": {
        "label": "Royal Gold", "accent": (240, 205, 110), "text": (255, 255, 255),
        "prompt": "regal female model with elegant updo hairstyle and gold jewelry, opulent black and gold "
                  "background with baroque ornaments and soft candlelight glow, royal luxury salon "
                  "advertisement, majestic beauty photography",
    },
    "bridal_blush": {
        "label": "Bridal Blush", "accent": (192, 120, 90), "text": (70, 40, 45),
        "prompt": "beautiful Indian bride with elegant bridal makeup, soft curls and delicate jewelry, "
                  "dreamy blush pink and ivory background with soft rose petals and bokeh, romantic bridal "
                  "salon advertisement, soft glowing beauty photography",
    },
    "emerald_luxe": {
        "label": "Emerald Luxe", "accent": (240, 205, 110), "text": (255, 255, 255),
        "prompt": "sophisticated model with sleek glossy hair, deep emerald green velvet background with "
                  "golden art-deco accents, premium luxury salon advertisement, rich cinematic beauty photography",
    },
    "mens_edge": {
        "label": "Men's Edge", "accent": (232, 195, 127), "text": (255, 255, 255),
        "prompt": "handsome well-groomed man with sharp fade haircut and styled beard, moody dark barbershop "
                  "background with warm rim lighting, premium men's grooming salon advertisement, masculine "
                  "editorial photography",
    },
    "festive_sparkle": {
        "label": "Festive Sparkle", "accent": (255, 214, 90), "text": (255, 255, 255),
        "prompt": "joyful model with glamorous party makeup and shimmering hair, festive deep red and gold "
                  "background with sparkling fireworks bokeh and confetti lights, celebration salon "
                  "advertisement, festive beauty photography",
    },
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
    from routes.mira_common import _gen_image_bytes
    tpl = TEMPLATES[body.template]
    prompt = (f"{tpl['prompt']}. Vertical poster composition with generous empty space on the left half "
              "for text overlay. Absolutely NO text, NO letters, NO logos, NO watermarks.")
    bg = await _gen_image_bytes(prompt)
    if not bg:
        raise HTTPException(502, "Image generation failed — try again")

    logo_bytes = await _load_logo(t)
    final = await asyncio.to_thread(_compose_flyer, bg, body, tpl, t, logo_bytes)
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
    if doc.get("gallery_id"):
        await db.gallery.delete_one({"id": doc["gallery_id"]})
    await _raw_db.uploads.delete_one({"id": fid, "tenant_id": t["id"]})
    await _raw_db.offer_flyers.delete_one({"id": fid, "tenant_id": t["id"]})
    return {"deleted": 1}


@router.post("/offers/flyers/{fid}/publish")
async def publish_flyer(fid: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Show this offer flyer on the public booking page (Current Offers section)."""
    doc = await _raw_db.offer_flyers.find_one({"id": fid, "tenant_id": t["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Flyer not found")
    if doc.get("gallery_id"):
        return {"published": True, "gallery_id": doc["gallery_id"]}
    gid = str(uuid.uuid4())
    await db.gallery.insert_one({
        "id": gid, "url": doc["url"], "kind": "image",
        "caption": doc.get("headline") or doc.get("offer_text") or "Special offer",
        "source": "offer", "created_at": datetime.now(timezone.utc).isoformat()})
    await _raw_db.offer_flyers.update_one({"id": fid, "tenant_id": t["id"]}, {"$set": {"gallery_id": gid}})
    return {"published": True, "gallery_id": gid}


@router.post("/offers/flyers/{fid}/unpublish")
async def unpublish_flyer(fid: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Remove this offer flyer from the public booking page immediately."""
    doc = await _raw_db.offer_flyers.find_one({"id": fid, "tenant_id": t["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Flyer not found")
    if doc.get("gallery_id"):
        await db.gallery.delete_one({"id": doc["gallery_id"]})
        await _raw_db.offer_flyers.update_one({"id": fid, "tenant_id": t["id"]}, {"$unset": {"gallery_id": ""}})
    return {"published": False}


FONT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "fonts")
SERIF = os.path.join(FONT_DIR, "PlayfairDisplay-Bold.ttf")
SCRIPT = os.path.join(FONT_DIR, "GreatVibes-Regular.ttf")


def _font(path: str, sz: int, variation: str | None = None) -> ImageFont.FreeTypeFont:
    try:
        f = ImageFont.truetype(path, sz)
        if variation:
            try:
                f.set_variation_by_name(variation)
            except Exception:  # noqa: BLE001 — static fonts have no variations
                pass
        return f
    except OSError:
        return ImageFont.truetype(FONT_PATH, sz)


async def _load_logo(t: dict) -> bytes | None:
    return await _load_upload(t.get("logo_url") or "")


async def _load_upload(url: str) -> bytes | None:
    if not url.startswith("/api/files/"):
        return None
    up = await _raw_db.uploads.find_one({"id": url.rsplit("/", 1)[-1]}, {"_id": 0, "storage_path": 1})
    if not up:
        return None
    try:
        data, _ = _get_object(up["storage_path"])
        return data
    except Exception as e:  # noqa: BLE001 — poster works without the image
        log.warning(f"upload load failed: {e}")
        return None


def _flyer_canvas(img_bytes: bytes, tpl: dict) -> Image.Image:
    """Cover-crop the AI background to 1024x1280 and lay a left scrim for text legibility."""
    W, H = 1024, 1280
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    scale = max(W / img.width, H / img.height)
    img = img.resize((round(img.width * scale), round(img.height * scale)))
    left, top = (img.width - W) // 2, (img.height - H) // 2
    img = img.crop((left, top, left + W, top + H)).convert("RGBA")

    scrim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(scrim)
    dark = tpl["text"] == (255, 255, 255)
    base = (12, 12, 20) if dark else (255, 246, 244)
    for x in range(int(W * 0.62)):
        alpha = int(215 * (1 - x / (W * 0.62)))
        sd.line([(x, 0), (x, H)], fill=(*base, alpha))
    return Image.alpha_composite(img, scrim)


def _make_fitter(d: ImageDraw.ImageDraw):
    """Returns fit(text, start_size, max_width, path, variation) -> font that fits within max_width."""
    def _fit(text, start, maxw, path=FONT_PATH, variation=None):
        sz = start
        while sz > 16 and d.textlength(text, font=_font(path, sz, variation)) > maxw:
            sz -= 3
        return _font(path, sz, variation)
    return _fit


def _draw_logo_badge(img: Image.Image, d: ImageDraw.ImageDraw, tpl: dict, t: dict, logo_bytes: bytes | None, W: int = 1024) -> None:
    """Round logo medallion top-right — salon logo if uploaded, else an elegant monogram."""
    cx, cy, r = W - 122, 122, 74
    d.ellipse([cx - r - 5, cy - r - 5, cx + r + 5, cy + r + 5], fill=(*tpl["accent"], 255))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(252, 250, 246, 255))
    if logo_bytes:
        try:
            logo = Image.open(io.BytesIO(logo_bytes)).convert("RGBA")
            side = min(logo.size)
            logo = logo.crop(((logo.width - side) // 2, (logo.height - side) // 2,
                              (logo.width + side) // 2, (logo.height + side) // 2))
            logo = logo.resize((2 * r - 16, 2 * r - 16))
            mask = Image.new("L", logo.size, 0)
            ImageDraw.Draw(mask).ellipse([0, 0, logo.width, logo.height], fill=255)
            img.paste(logo, (cx - logo.width // 2, cy - logo.height // 2), mask)
            return
        except Exception as e:  # noqa: BLE001 — fall back to monogram
            log.warning(f"logo composite failed: {e}")
    initial = ((t.get("name") or "S").strip() or "S")[0].upper()
    f = _font(SERIF, 92, "Bold")
    bb = d.textbbox((0, 0), initial, font=f)
    d.text((cx - (bb[2] - bb[0]) / 2 - bb[0], cy - (bb[3] - bb[1]) / 2 - bb[1]),
           initial, font=f, fill=(35, 28, 20, 255))


def _draw_pct_badge(img: Image.Image, tpl: dict, offer_text: str) -> None:
    """Rotated starburst '% OFF' badge, bottom-right above the contact bar."""
    m = re.search(r"(\d{1,2})\s*%", offer_text or "")
    if not m:
        return
    pct = m.group(1)
    S = 380
    badge = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(badge)
    cx = cy = S // 2
    R, r_in = 168, 138
    pts = []
    for i in range(36):
        rad = R if i % 2 == 0 else r_in
        ang = math.pi * i / 18
        pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
    bd.polygon(pts, fill=(*tpl["accent"], 255))
    bd.ellipse([cx - r_in + 8, cy - r_in + 8, cx + r_in - 8, cy + r_in - 8],
               outline=(35, 28, 20, 160), width=3)
    f_big = _font(FONT_PATH, 96)
    f_small = _font(FONT_PATH, 44)
    txt = f"{pct}%"
    bb = bd.textbbox((0, 0), txt, font=f_big)
    bd.text((cx - (bb[2] - bb[0]) / 2 - bb[0], cy - 62), txt, font=f_big, fill=(35, 28, 20, 255))
    bb2 = bd.textbbox((0, 0), "OFF", font=f_small)
    bd.text((cx - (bb2[2] - bb2[0]) / 2 - bb2[0], cy + 42), "OFF", font=f_small, fill=(35, 28, 20, 255))
    badge = badge.rotate(12, resample=Image.BICUBIC)
    img.alpha_composite(badge, (1024 - S + 40, 1280 - 116 - S + 30))


def _draw_ribbons(d: ImageDraw.ImageDraw, tpl: dict) -> None:
    """Sweeping decorative ribbon curves above the contact bar (reference-poster style)."""
    W, H, bar_h = 1024, 1280, 116
    y0 = H - bar_h
    d.arc([-360, y0 - 170, W + 360, y0 + 230], start=193, end=347, fill=(*tpl["accent"], 235), width=12)
    d.arc([-360, y0 - 138, W + 360, y0 + 262], start=193, end=347, fill=(255, 255, 255, 110), width=5)


def _draw_flyer_copy(d: ImageDraw.ImageDraw, body: FlyerIn, tpl: dict, t: dict) -> None:
    _fit = _make_fitter(d)
    accent, text_col = tpl["accent"], tpl["text"]
    m, maxw = 56, int(1024 * 0.56)
    y = 66
    salon = (t.get("name") or "Your Salon").upper()
    d.text((m, y), salon, font=_fit(salon, 42, maxw, SERIF, "Bold"), fill=(*accent, 255))
    y += 64
    d.rectangle([m, y, m + 110, y + 4], fill=(*accent, 255))
    d.polygon([(m + 124, y - 4), (m + 134, y + 2), (m + 124, y + 8), (m + 114, y + 2)], fill=(*accent, 255))
    y += 34

    script = _font(SCRIPT, 58)
    d.text((m, y), "Exclusive Offer", font=script, fill=(*text_col, 225))
    y += 82

    hl = body.headline.strip()[:36] or "Special Offer"
    shadow = (20, 12, 10) if text_col == (255, 255, 255) else (255, 250, 245)
    d.text((m, y), hl, font=_fit(hl, 82, maxw, SERIF, "Bold"), fill=(*text_col, 255),
           stroke_width=3, stroke_fill=(*shadow, 160))
    y += 116

    offer = body.offer_text.strip()[:60]
    if offer:
        d.text((m, y), offer, font=_fit(offer, 44, maxw), fill=(*accent, 255),
               stroke_width=2, stroke_fill=(*shadow, 140))
        y += 84

    for s in body.services[:5]:
        line = s.strip()[:42]
        d.ellipse([m, y + 15, m + 10, y + 25], fill=(*accent, 255))
        d.text((m + 26, y), line, font=_fit(line, 34, maxw - 26), fill=(*text_col, 235))
        y += 54

    if body.valid_until.strip():
        y += 18
        vu = f"Valid until {body.valid_until.strip()[:24]}"
        f = _fit(vu, 27, maxw)
        bb = d.textbbox((m, y), vu, font=f)
        d.rounded_rectangle([bb[0] - 14, bb[1] - 9, bb[2] + 14, bb[3] + 9], radius=22,
                            outline=(*accent, 220), width=2)
        d.text((m, y), vu, font=f, fill=(*text_col, 220))


def _draw_contact_bar(d: ImageDraw.ImageDraw, tpl: dict, t: dict, W: int = 1024, H: int = 1280, bar_h: int = 116) -> None:
    m = 56
    _fit = _make_fitter(d)
    d.rectangle([0, H - bar_h, W, H], fill=(*tpl["accent"], 255))
    d.rectangle([0, H - bar_h, W, H - bar_h + 5], fill=(255, 255, 255, 190))
    dark_txt = (25, 20, 15)
    phone = t.get("phone") or t.get("contact_phone") or ""
    addr = (t.get("address") or t.get("location") or "")[:52]
    contact = "   ·   ".join(x for x in [phone, addr] if x) or "Book your appointment today"
    d.text((m, H - bar_h + 22), contact, font=_fit(contact, 32, W - 2 * m, FONT_PATH), fill=(*dark_txt, 255))
    slug = t.get("slug", "")
    site = os.environ.get("APP_PUBLIC_URL", "").replace("https://", "")
    if slug and site:
        book = f"Book online: {site}/book/{slug}"
        d.text((m, H - bar_h + 68), book, font=_fit(book, 26, W - 2 * m, FONT_PATH), fill=(*dark_txt, 225))


def _compose_flyer(img_bytes: bytes, body: FlyerIn, tpl: dict, t: dict, logo_bytes: bytes | None = None) -> bytes:
    img = _flyer_canvas(img_bytes, tpl)
    d = ImageDraw.Draw(img)
    _draw_ribbons(d, tpl)
    _draw_pct_badge(img, tpl, f"{body.headline} {body.offer_text}")
    d = ImageDraw.Draw(img)
    _draw_flyer_copy(d, body, tpl, t)
    _draw_contact_bar(d, tpl, t)
    _draw_logo_badge(img, d, tpl, t, logo_bytes)
    buf = io.BytesIO()
    stamp_monogram(img).convert("RGB").save(buf, format="JPEG", quality=90)
    return buf.getvalue()


# ───────── About-Us shop-front poster (A4 print) ─────────

class AboutPosterIn(BaseModel):
    template: str = "pink_glam"
    about_text: str = ""
    offer_line: str = "Book now and get 20% OFF any service!"


async def _gen_gallery_insets(gen, t: dict) -> list[bytes]:
    """Up to 3 circular inset photos — salon gallery first, AI triptych as filler."""
    insets = []
    for g in (t.get("gallery") or [])[:3]:
        data = await _load_upload(g.get("url", ""))
        if data:
            insets.append(data)
    if len(insets) < 3:
        trip_prompt = ("Three separate premium salon scenes side by side in one image, equal thirds: "
                       "1) relaxing facial spa treatment, 2) hairstylist styling glossy hair, 3) elegant manicured hands. "
                       "Consistent warm luxury lighting. Absolutely NO text, NO letters, NO logos.")
        try:
            trips = await asyncio.wait_for(gen.generate_images(prompt=trip_prompt, model="gpt-image-1", number_of_images=1), timeout=240)
            if trips:
                trip = Image.open(io.BytesIO(trips[0])).convert("RGB")
                w3 = trip.width // 3
                for i in range(3 - len(insets)):
                    part = trip.crop((i * w3, 0, (i + 1) * w3, trip.height))
                    b = io.BytesIO()
                    part.save(b, "JPEG", quality=90)
                    insets.append(b.getvalue())
        except Exception as e:  # noqa: BLE001 — poster still renders without insets
            log.warning(f"triptych generation failed: {e}")
    return insets


async def _persist_about_poster(final: bytes, body: AboutPosterIn, t: dict, user: dict) -> dict:
    fid = str(uuid.uuid4())
    path = f"{APP_NAME}/tenants/{t['id']}/flyers/{fid}.jpg"
    result = _put_object(path, final, "image/jpeg")
    await _raw_db.uploads.insert_one({
        "id": fid, "tenant_id": t["id"], "kind": "about_poster",
        "storage_path": result.get("path", path), "original_filename": f"about-poster-{fid}.jpg",
        "content_type": "image/jpeg", "size": len(final), "uploaded_by": user.get("email", ""),
        "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat()})
    doc = {"id": fid, "tenant_id": t["id"], "url": f"/api/files/{fid}", "template": body.template,
           "headline": "About Us — shop poster", "offer_text": body.offer_line, "kind": "about_poster",
           "size_kb": round(len(final) / 1024), "created_at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.offer_flyers.insert_one({**doc})
    doc.pop("_id", None)
    return doc


@router.post("/offers/about-poster")
async def create_about_poster(body: AboutPosterIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """A4 shop-front poster: hero model + salon logo + About Us + 3 circular photo insets + contact bar."""
    if body.template not in TEMPLATES:
        raise HTTPException(400, "Unknown template")
    from routes.mira_common import _key
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
    tpl = TEMPLATES[body.template]
    gen = OpenAIImageGeneration(api_key=_key())

    hero_prompt = (f"{tpl['prompt']}. Vertical poster composition with generous empty space on the left half "
                   "for text overlay. Absolutely NO text, NO letters, NO logos, NO watermarks.")
    imgs = await asyncio.wait_for(gen.generate_images(prompt=hero_prompt, model="gpt-image-1", number_of_images=1), timeout=240)
    if not imgs:
        raise HTTPException(502, "Image generation failed — try again")

    insets = await _gen_gallery_insets(gen, t)
    logo_bytes = await _load_logo(t)
    final = await asyncio.to_thread(_compose_about_poster, imgs[0], insets, body, tpl, t, logo_bytes)
    return await _persist_about_poster(final, body, t, user)


def _wrap_lines(d: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, maxw: int) -> list[str]:
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if d.textlength(trial, font=font) > maxw and line:
            lines.append(line)
            line = word
        else:
            line = trial
    if line:
        lines.append(line)
    return lines


def _circle_inset(img: Image.Image, data: bytes, cx: int, cy: int, r: int, accent: tuple) -> None:
    try:
        photo = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception:  # noqa: BLE001 — skip broken image
        return
    side = min(photo.size)
    photo = photo.crop(((photo.width - side) // 2, (photo.height - side) // 2,
                        (photo.width + side) // 2, (photo.height + side) // 2)).resize((2 * r, 2 * r))
    mask = Image.new("L", (2 * r, 2 * r), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, 2 * r, 2 * r], fill=255)
    d = ImageDraw.Draw(img)
    d.ellipse([cx - r - 7, cy - r - 7, cx + r + 7, cy + r + 7], fill=(*accent, 255))
    img.paste(photo, (cx - r, cy - r), mask)


def _hero_canvas(hero_bytes: bytes, panel: tuple, W: int, H: int, hero_h: int) -> Image.Image:
    """Panel-coloured canvas with the hero image pasted, left scrim + bottom fade."""
    img = Image.new("RGBA", (W, H), (*panel, 255))
    hero = Image.open(io.BytesIO(hero_bytes)).convert("RGB")
    scale = max(W / hero.width, hero_h / hero.height)
    hero = hero.resize((round(hero.width * scale), round(hero.height * scale)))
    hero = hero.crop(((hero.width - W) // 2, (hero.height - hero_h) // 2,
                      (hero.width + W) // 2, (hero.height + hero_h) // 2)).convert("RGBA")
    img.paste(hero, (0, 0))
    d = ImageDraw.Draw(img)
    for x in range(int(W * 0.58)):  # left scrim on hero for text
        alpha = int(200 * (1 - x / (W * 0.58)))
        d.line([(x, 0), (x, hero_h)], fill=(12, 10, 16, alpha))
    for i in range(140):  # fade hero into panel
        a = int(255 * i / 140)
        d.line([(0, hero_h - 140 + i), (W, hero_h - 140 + i)], fill=(*panel, a))
    return img


def _draw_hero_text(d: ImageDraw.ImageDraw, body: AboutPosterIn, t: dict, accent: tuple,
                    W: int, hero_h: int, m: int) -> None:
    _fit = _make_fitter(d)
    salon = t.get("name") or "Your Salon"
    d.text((m, 96), salon, font=_fit(salon, 76, int(W * 0.47), SCRIPT), fill=(*accent, 255))
    loc = (t.get("location") or "").upper()
    if loc:
        d.text((m, 196), loc, font=_font(FONT_PATH, 30), fill=(255, 255, 255, 220))
    offer = body.offer_line.strip()[:120]
    if offer:
        f_off = _font(FONT_PATH, 40)
        y = hero_h - 420
        for ln in _wrap_lines(d, offer, f_off, int(W * 0.5))[:3]:
            d.text((m, y), ln, font=f_off, fill=(255, 255, 255, 245))
            y += 56
    d.arc([-400, hero_h - 190, W + 400, hero_h + 60], start=193, end=347, fill=(*accent, 240), width=14)
    d.arc([-400, hero_h - 158, W + 400, hero_h + 92], start=193, end=347, fill=(255, 255, 255, 110), width=6)


def _draw_about_section(img: Image.Image, d: ImageDraw.ImageDraw, body: AboutPosterIn, t: dict, *,
                        insets: list, accent: tuple, panel_txt: tuple,
                        frame: tuple[int, int, int]) -> int:
    """About Us heading, wrapped copy and circular photo insets. Returns final y.
    frame = (W, hero_h, m)."""
    W, hero_h, m = frame
    salon = t.get("name") or "Your Salon"
    y = hero_h + 10
    d.text((m, y), "About Us!", font=_font(SCRIPT, 84), fill=(*accent, 255))
    y += 122
    about = (body.about_text.strip() or
             f"At {salon}, beauty is an experience. Our seasoned stylists blend premium products "
             "with warm, personal care — so every visit leaves you glowing.")[:400]
    f_about = _font(FONT_PATH, 31)
    for ln in _wrap_lines(d, about, f_about, W - 2 * m)[:5]:
        d.text((m, y), ln, font=f_about, fill=(*panel_txt, 245))
        y += 46
    if insets:
        r = 150
        y_c = y + r + 46
        n = min(3, len(insets))
        gap = (W - 2 * m - n * 2 * r) // (n + 1)
        for i in range(n):
            cx = m + gap * (i + 1) + r * (2 * i + 1)
            _circle_inset(img, insets[i], cx, y_c, r, accent)
        y = y_c + r + 40
    return y


def _compose_about_poster(hero_bytes: bytes, insets: list[bytes], body: AboutPosterIn,
                          tpl: dict, t: dict, logo_bytes: bytes | None) -> bytes:
    W, H, hero_h, bar_h, m = 1240, 1754, 820, 130, 72
    dark_theme = tpl["text"] == (255, 255, 255)
    panel = (22, 18, 26) if dark_theme else (252, 244, 242)
    panel_txt = (245, 242, 238) if dark_theme else (55, 40, 45)
    accent = tpl["accent"]

    img = _hero_canvas(hero_bytes, panel, W, H, hero_h)
    d = ImageDraw.Draw(img)
    _draw_hero_text(d, body, t, accent, W, hero_h, m)
    y = _draw_about_section(img, d, body, t, insets=insets, accent=accent, panel_txt=panel_txt, frame=(W, hero_h, m))

    mm = re.search(r"(\d{1,2})\s*%", body.offer_line or "")
    if mm and y < H - bar_h - 130:
        d = ImageDraw.Draw(img)
        big = _font(SERIF, 72, "Bold")
        d.text((m, H - bar_h - 120), f"GET UPTO {mm.group(1)}% OFF", font=big, fill=(*accent, 255))

    d = ImageDraw.Draw(img)
    _draw_contact_bar(d, tpl, t, W=W, H=H, bar_h=bar_h)
    _draw_logo_badge(img, d, tpl, t, logo_bytes, W=W)
    buf = io.BytesIO()
    stamp_monogram(img).convert("RGB").save(buf, format="JPEG", quality=90)
    return buf.getvalue()
