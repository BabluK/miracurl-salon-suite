"""Hair Colour Try-On — professional colour catalogue, salon-branded QR poster, public face-fit picker.

Customers (or staff) scan the salon's QR → /color/{slug} opens the front camera, reads the guest's
skin undertone on-device, and highlights the professional colours (balayage, mocha, copper…) that suit
them. The pick is saved so the stylist can start straight away.
"""
import io
import uuid
import base64
import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, Response
from pydantic import BaseModel, Field
from PIL import Image, ImageDraw

from database import _raw_db
from security import require_tenant_admin, current_tenant, require_super_admin
from schemas import resolve_tenant_from_slug
from services.tenant_notices import notify_tenant

log = logging.getLogger("hair_colors")
router = APIRouter()

# Curated professional catalogue — undertone/depth rules are the classic colourist guidance.
CATALOG = [
    {"id": "natural-black", "name": "Natural Black", "tag": "Classic · Shiny · Timeless",
     "swatch": ["#0b0a0c", "#1c1a1f", "#33303a"], "suits": ["warm", "cool", "neutral"], "depth": ["medium", "deep"]},
    {"id": "dark-brown", "name": "Dark Brown", "tag": "Rich · Natural · Elegant",
     "swatch": ["#22150f", "#3d261a", "#5c3d2b"], "suits": ["warm", "cool", "neutral"], "depth": ["medium", "deep"]},
    {"id": "chocolate-brown", "name": "Chocolate Brown", "tag": "Warm · Glossy · Versatile",
     "swatch": ["#3a2115", "#5e3a25", "#86583a"], "suits": ["warm", "neutral"], "depth": ["medium", "deep"]},
    {"id": "caramel-brown", "name": "Caramel Brown", "tag": "Warm · Radiant · Modern",
     "swatch": ["#4e2f1c", "#a5683a", "#e0b97f"], "suits": ["warm", "neutral"], "depth": ["medium", "deep"]},
    {"id": "honey-blonde", "name": "Honey Blonde", "tag": "Bright · Sun-kissed · Vibrant",
     "swatch": ["#7a5a2e", "#c9a25a", "#efd9a3"], "suits": ["warm", "neutral"], "depth": ["light", "medium"]},
    {"id": "ash-blonde", "name": "Ash Blonde", "tag": "Cool · Sophisticated · Chic",
     "swatch": ["#6e6a66", "#a9a39c", "#d9d4cc"], "suits": ["cool"], "depth": ["light"]},
    {"id": "platinum-blonde", "name": "Platinum Blonde", "tag": "Bold · Striking · Luxe",
     "swatch": ["#b9b3a8", "#e4dfd6", "#f5f2ec"], "suits": ["cool", "neutral"], "depth": ["light"]},
    {"id": "beige-blonde", "name": "Beige Blonde", "tag": "Soft · Refined · Modern",
     "swatch": ["#8a7a66", "#bfae97", "#e3d6c3"], "suits": ["neutral", "cool"], "depth": ["light", "medium"]},
    {"id": "mushroom-mocha-balayage", "name": "Mushroom Mocha Balayage", "tag": "Natural · Dimensional · Timeless",
     "swatch": ["#4a3728", "#8b6f56", "#c9ad8f"], "suits": ["neutral", "cool"], "depth": ["light", "medium", "deep"]},
    {"id": "rose-brown", "name": "Rose Brown", "tag": "Trendy · Soft · Feminine",
     "swatch": ["#4a2f33", "#8c5a62", "#c48f97"], "suits": ["cool", "neutral"], "depth": ["light", "medium"]},
    {"id": "copper-brown", "name": "Copper Brown", "tag": "Warm · Vibrant · Radiant",
     "swatch": ["#5a2a16", "#9c4a24", "#d4783f"], "suits": ["warm"], "depth": ["light", "medium", "deep"]},
    {"id": "auburn-red", "name": "Auburn Red", "tag": "Bold · Rich · Eye-catching",
     "swatch": ["#4a1610", "#7e2a1c", "#a8442a"], "suits": ["warm", "neutral"], "depth": ["medium", "deep"]},
    {"id": "burgundy", "name": "Burgundy", "tag": "Luxe · Bold · Modern",
     "swatch": ["#3a0f1e", "#6a1b34", "#93304d"], "suits": ["cool", "neutral"], "depth": ["medium", "deep"]},
    {"id": "mahogany-brown", "name": "Mahogany Brown", "tag": "Rich · Warm · Sophisticated",
     "swatch": ["#3f1a14", "#6b2e22", "#94483a"], "suits": ["warm", "neutral"], "depth": ["medium", "deep"]},
    {"id": "ash-brown", "name": "Ash Brown", "tag": "Cool · Natural · Effortless",
     "swatch": ["#3d3733", "#736a63", "#b3a99e"], "suits": ["cool"], "depth": ["light", "medium"]},
    {"id": "smoky-grey", "name": "Smoky Grey", "tag": "Trendy · Bold · Unique",
     "swatch": ["#2b2b30", "#5c5c66", "#9a9aa6"], "suits": ["cool"], "depth": ["light", "medium"]},
    {"id": "pastel-pink", "name": "Pastel Pink", "tag": "Playful · Trendy · Creative",
     "swatch": ["#b76e86", "#e39ab2", "#f6cfdc"], "suits": ["cool", "neutral"], "depth": ["light"]},
    {"id": "pastel-blue", "name": "Pastel Blue", "tag": "Unique · Modern · Expressive",
     "swatch": ["#3e5a86", "#6f8fbf", "#a9c3e6"], "suits": ["cool"], "depth": ["light", "medium"]},
]
_BY_ID = {c["id"]: c for c in CATALOG}


async def _catalog_with_images(tenant_id: str | None = None) -> list[dict]:
    imgs = {d["id"]: d.get("image_url") async for d in _raw_db.hair_color_images.find({}, {"_id": 0})}
    out = [{**c, "image_url": imgs.get(c["id"])} for c in CATALOG]
    if tenant_id:  # the salon's own shades come first — they are the house specialities
        customs = await _raw_db.tenant_hair_colors.find({"tenant_id": tenant_id, "active": {"$ne": False}}, {"_id": 0}).sort("created_at", -1).to_list(60)
        out = [{**c, "custom": True} for c in customs] + out
    return out


async def _lookup(tenant_id: str, color_id: str) -> dict | None:
    c = _BY_ID.get(color_id)
    if c:
        return c
    return await _raw_db.tenant_hair_colors.find_one({"tenant_id": tenant_id, "id": color_id, "active": {"$ne": False}}, {"_id": 0})


async def _paint_custom(tenant: dict, c: dict):
    from routes.mira_common import _gen_image
    prompt = (f"Professional salon back-of-head hair colour photo: long softly waved hair in '{c['name']}' "
              f"({c.get('tag') or 'signature shade'}; exact tones {', '.join(c['swatch'])}), realistic dimensional colour, "
              "bright modern salon interior, editorial lighting, 8k detail, the model faces away from camera. NO text, NO letters, NO logos.")
    try:
        url = await _gen_image(prompt, tenant, "hair_color_custom")
        await _raw_db.tenant_hair_colors.update_one({"id": c["id"]}, {"$set": {"image_url": url}})
    except Exception as e:
        log.error("custom shade image failed %s: %s", c["id"], e)
        await _raw_db.tenant_hair_colors.update_one({"id": c["id"]}, {"$set": {"image_error": str(e)[:200]}})


async def _paint_one(c: dict) -> str | None:
    from routes.mira_common import _gen_image
    prompt = (f"Professional salon back-of-head hair colour photo: long softly waved hair in '{c['name']}' "
              f"({c['tag']}), realistic dimensional colour, bright modern salon interior, editorial lighting, "
              "8k detail, the model faces away from camera. NO text, NO letters, NO logos.")
    try:
        url = await _gen_image(prompt, {"id": "superadmin", "slug": "hq"}, "hair_color_catalog")
        await _raw_db.hair_color_images.update_one({"id": c["id"]}, {"$set": {"id": c["id"], "image_url": url,
                                                    "at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
        return url
    except Exception as e:
        log.error("hair colour image failed for %s: %s", c["id"], e)
        return None


_painting = {"running": False}


async def _paint_missing():
    if _painting["running"]:
        return
    _painting["running"] = True
    try:
        have = {d["id"] async for d in _raw_db.hair_color_images.find({}, {"_id": 0, "id": 1})}
        for c in CATALOG:
            if c["id"] not in have:
                await _paint_one(c)
    finally:
        _painting["running"] = False


@router.post("/super/hair-colors/generate")
async def hq_generate_catalog(force: bool = False, admin=Depends(require_super_admin)):
    if force:
        await _raw_db.hair_color_images.delete_many({})
    asyncio.create_task(_paint_missing())
    return {"ok": True, "total": len(CATALOG)}


@router.get("/hair-colors")
async def hair_colors(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return {"colors": await _catalog_with_images(t["id"])}


class CustomShadeIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=40)
    tag: str = Field("", max_length=60)
    swatch: list[str] = Field(..., min_length=1, max_length=3)
    suits: list[str] = Field(default_factory=lambda: ["warm", "cool", "neutral"])
    depth: list[str] = Field(default_factory=lambda: ["light", "medium", "deep"])


@router.post("/hair-colors/custom")
async def add_custom_shade(body: CustomShadeIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    import re
    sw = [x for x in body.swatch if re.fullmatch(r"#[0-9a-fA-F]{6}", x or "")]
    if not sw:
        raise HTTPException(400, "Pick at least one colour swatch")
    while len(sw) < 3:
        sw.append(sw[-1])
    if await _raw_db.tenant_hair_colors.count_documents({"tenant_id": t["id"], "active": {"$ne": False}}) >= 24:
        raise HTTPException(400, "You can keep up to 24 custom shades — remove one first")
    doc = {"id": f"custom-{uuid.uuid4().hex[:8]}", "tenant_id": t["id"], "name": body.name.strip(), "tag": body.tag.strip(),
           "swatch": sw, "suits": [x for x in body.suits if x in ("warm", "cool", "neutral")] or ["warm", "cool", "neutral"],
           "depth": [x for x in body.depth if x in ("light", "medium", "deep")] or ["light", "medium", "deep"],
           "image_url": None, "active": True, "created_at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.tenant_hair_colors.insert_one({**doc})
    asyncio.create_task(_paint_custom(t, doc))
    return {"ok": True, "color": doc}


@router.delete("/hair-colors/custom/{color_id}")
async def delete_custom_shade(color_id: str, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    r = await _raw_db.tenant_hair_colors.update_one({"tenant_id": t["id"], "id": color_id, "active": {"$ne": False}}, {"$set": {"active": False}})
    if not r.matched_count:
        raise HTTPException(404, "Shade not found")
    return {"ok": True}


# ── Public picker ──────────────────────────────────────────────────────────────

@router.get("/public/color/{slug}")
async def public_color_catalog(slug: str):
    t = await resolve_tenant_from_slug(slug)
    colors = await _catalog_with_images(t["id"])
    if any(not c.get("image_url") and not c.get("custom") for c in colors):
        asyncio.create_task(_paint_missing())
    return {"slug": t["slug"], "name": t.get("name"), "logo_url": t.get("logo_url"),
            "location": t.get("location") or "", "colors": colors}


class ColorPickIn(BaseModel):
    color_id: str
    name: str = Field("", max_length=80)
    phone: str = Field("", max_length=20)
    undertone: str = Field("", pattern=r"^(warm|cool|neutral|)$")
    depth: str = Field("", pattern=r"^(light|medium|deep|)$")
    by_staff: bool = False


@router.post("/public/color/{slug}/pick")
async def public_color_pick(slug: str, body: ColorPickIn):
    t = await resolve_tenant_from_slug(slug)
    c = await _lookup(t["id"], body.color_id)
    if not c:
        raise HTTPException(404, "Unknown colour")
    code = uuid.uuid4().hex[:6].upper()
    doc = {"id": str(uuid.uuid4()), "tenant_id": t["id"], "code": code, "color_id": c["id"], "color_name": c["name"],
           "name": body.name.strip(), "phone": body.phone.strip(), "undertone": body.undertone, "depth": body.depth,
           "by_staff": body.by_staff, "status": "picked", "created_at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.color_picks.insert_one(doc)
    who = body.name.strip() or "A guest"
    await notify_tenant(t["id"], "color_pick", f"🎨 {who} picked {c['name']}",
                        f"Colour try-on code {code}" + (f" · {body.phone.strip()}" if body.phone.strip() else "") +
                        f" · {body.undertone or 'undertone n/a'} undertone",
                        link="/pos", dedupe_key=f"color_pick:{doc['id']}")
    img = await _raw_db.hair_color_images.find_one({"id": c["id"]}, {"_id": 0, "image_url": 1})
    return {"ok": True, "code": code, "color": {**c, "image_url": c.get("image_url") or (img or {}).get("image_url")}}


@router.get("/color-picks")
async def list_color_picks(limit: int = 50, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    picks = await _raw_db.color_picks.find({"tenant_id": t["id"]}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"picks": picks}


# ── Salon-branded QR poster ────────────────────────────────────────────────────

@router.get("/color/poster")
async def color_poster(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    import os
    import qrcode
    from services.veo_brand import _font, GOLD, _center
    from routes.mira_common import _tenant_logo
    W, H = 1080, 1620
    from PIL import ImageFilter, ImageEnhance, ImageOps
    # Backdrop: a real shade photo from the collection, blurred + deepened, with a warm vignette
    img = None
    shot = await _raw_db.hair_color_images.find_one({"id": {"$in": ["mushroom-mocha-balayage", "caramel-brown", "copper-brown"]}}, {"_id": 0, "image_url": 1})
    up = await _raw_db.uploads.find_one({"id": (shot or {}).get("image_url", "").rsplit("/", 1)[-1]}, {"_id": 0, "storage_path": 1}) if shot else None
    if up:
        try:
            from services.storage import _get_object
            data, _ = await asyncio.to_thread(_get_object, up["storage_path"])
            img = ImageOps.fit(Image.open(io.BytesIO(data)).convert("RGB"), (W, H)).filter(ImageFilter.GaussianBlur(9))
            img = ImageEnhance.Brightness(img).enhance(0.42)
            img = ImageEnhance.Color(img).enhance(1.15)
        except Exception:
            img = None
    if img is None:
        img = Image.new("RGB", (W, H), (24, 14, 20))
    vign = Image.new("L", (W, H), 0)
    ImageDraw.Draw(vign).ellipse([-W * 0.25, -H * 0.05, W * 1.25, H * 1.05], fill=255)
    vign = vign.filter(ImageFilter.GaussianBlur(160))
    img = Image.composite(img, Image.new("RGB", (W, H), (10, 6, 9)), vign)
    d = ImageDraw.Draw(img)
    # Ornate double gold frame with corner flourishes
    d.rounded_rectangle([30, 30, W - 30, H - 30], radius=30, outline=GOLD, width=5)
    d.rounded_rectangle([52, 52, W - 52, H - 52], radius=22, outline=(196, 160, 70), width=2)
    for cx, cy, sx, sy in ((52, 52, 1, 1), (W - 52, 52, -1, 1), (52, H - 52, 1, -1), (W - 52, H - 52, -1, -1)):
        d.line([cx + sx * 12, cy + sy * 90, cx + sx * 12, cy + sy * 12, cx + sx * 90, cy + sy * 12], fill=GOLD, width=4)
        d.ellipse([cx + sx * 12 - 9, cy + sy * 12 - 9, cx + sx * 12 + 9, cy + sy * 12 + 9], fill=GOLD)
    y = 80
    logo = await _tenant_logo(t)
    if logo:
        from PIL import ImageOps
        lg = ImageOps.contain(Image.open(io.BytesIO(logo)).convert("RGBA"), (150, 150))
        disc = Image.new("RGBA", (190, 190), (255, 255, 255, 255))
        mask = Image.new("L", (190, 190), 0); ImageDraw.Draw(mask).ellipse([0, 0, 189, 189], fill=255)
        disc.alpha_composite(lg, ((190 - lg.width) // 2, (190 - lg.height) // 2))
        img.paste(disc, (W // 2 - 95, y), mask)
        ImageDraw.Draw(img).ellipse([W // 2 - 95, y, W // 2 + 95, y + 190], outline=GOLD, width=4)
        y += 220
    d = ImageDraw.Draw(img)
    _center(d, y, t.get("name", ""), _font(50, serif=True), GOLD, W); y += 64
    _center(d, y, (t.get("location") or "").upper(), _font(24), (220, 220, 230), W); y += 60
    _center(d, y, "H A I R   C O L O U R   S T U D I O", _font(26), GOLD, W); y += 60
    _center(d, y, "Find Your Perfect Colour", _font(64, serif=True), (255, 255, 255), W); y += 100
    base = os.environ.get("APP_PUBLIC_URL", "")
    url = f"{base}/color/{t['slug']}"
    qr = qrcode.QRCode(box_size=10, border=1); qr.add_data(url); qr.make()
    qim = qr.make_image(fill_color="black", back_color="white").convert("RGB").resize((520, 520))
    card = Image.new("RGBA", (600, 600), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle([0, 0, 599, 599], radius=36, fill=GOLD)
    cd.rounded_rectangle([10, 10, 589, 589], radius=30, fill=(255, 255, 255, 255))
    card.paste(qim, (40, 40))
    img.paste(card, (W // 2 - 300, y), card); y += 620
    # shade swatch ribbon under the QR — the whole collection at a glance
    sw = (W - 160) // len(CATALOG)
    for i, c in enumerate(CATALOG):
        x0 = 80 + i * sw
        col = tuple(int(c["swatch"][1].lstrip("#")[j:j + 2], 16) for j in (0, 2, 4))
        ImageDraw.Draw(img).rounded_rectangle([x0 + 3, y, x0 + sw - 3, y + 26], radius=8, fill=col, outline=(255, 255, 255), width=1)
    y += 50
    d = ImageDraw.Draw(img)
    _center(d, y, "Scan  ·  fit your face  ·  see the colour ON YOU, front & back", _font(30), (255, 255, 255), W); y += 46
    _center(d, y, "We read your skin undertone & show the shades that suit YOU", _font(27), (215, 205, 210), W); y += 62
    _center(d, y, "18 SHADES · BLACK TO PLATINUM · BALAYAGE · COPPER · PASTELS", _font(26), GOLD, W); y += 54
    _center(d, y, "Pick your shade, book your stylist — all from your phone", _font(28), (255, 255, 255), W)
    _center(d, H - 120, url.replace("https://", ""), _font(26), (170, 170, 190), W)
    buf = io.BytesIO(); img.save(buf, "PNG")
    return Response(buf.getvalue(), media_type="image/png",
                    headers={"Content-Disposition": f'inline; filename="colour-tryon-{t["slug"]}.png"'})


class PreviewIn(BaseModel):
    color_id: str
    selfie_b64: str = Field(..., max_length=3_000_000)  # JPEG data URL or raw base64, ≤ ~2 MB


async def _recolor(selfie_b64: str, prompt: str) -> str | None:
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    from routes.mira_common import _key
    chat = LlmChat(api_key=_key(), session_id=f"hair-{uuid.uuid4().hex[:8]}",
                   system_message="You are a master salon colourist and photo retoucher.").with_model(
        "gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    _, images = await chat.send_message_multimodal_response(
        UserMessage(text=prompt, file_contents=[ImageContent(image_base64=selfie_b64)]))
    return images[0]["data"] if images else None


@router.post("/public/color/{slug}/preview")
async def public_color_preview(slug: str, body: PreviewIn):
    """AI try-on: the guest's selfie with the chosen shade — front view + back view. Nothing is stored."""
    t = await resolve_tenant_from_slug(slug)
    c = await _lookup(t["id"], body.color_id)
    if not c:
        raise HTTPException(404, "Unknown colour")
    b64 = body.selfie_b64.split(",", 1)[-1]
    if len(b64) < 2000:
        raise HTTPException(400, "Selfie too small")
    shade = f"{c['name']} hair colour ({(c.get('tag') or 'signature shade').lower()}; tones {', '.join(c['swatch'])})"
    front = (f"Edit this photo: keep the SAME person, same face, same skin, same expression, same background and framing. "
             f"Only change the hair colour to a professional salon {shade}, realistic glossy salon finish with natural highlights "
             f"and dimension. Photorealistic, no text, no watermark.")
    back = (f"Using this person as reference, create a photorealistic salon photo of the SAME person seen from BEHIND "
            f"(back of the head and shoulders, same hair length and texture, same clothing), showing their hair freshly coloured "
            f"in professional {shade}, soft salon lighting, plain background. No text, no watermark.")
    try:
        f_img, b_img = await asyncio.wait_for(asyncio.gather(_recolor(b64, front), _recolor(b64, back)), timeout=150)
    except Exception as e:
        log.error("hair preview failed: %s", e)
        raise HTTPException(502, "Preview is busy right now — please try again in a moment")
    if not f_img:
        raise HTTPException(502, "Couldn't render the preview — try a brighter, front-facing selfie")
    return {"color": c, "front": f_img, "back": b_img}


# ── Stylist colour card: formula notes ─────────────────────────────────────────

class FormulaIn(BaseModel):
    formula: str = Field("", max_length=600)


@router.patch("/appointments/{appt_id}/color-formula")
async def save_color_formula(appt_id: str, body: FormulaIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    appt = await _raw_db.appointments.find_one({"tenant_id": t["id"], "id": appt_id}, {"_id": 0, "color_pick": 1})
    if not appt or not appt.get("color_pick"):
        raise HTTPException(404, "No colour pick on this appointment")
    f = body.formula.strip()
    await _raw_db.appointments.update_one({"tenant_id": t["id"], "id": appt_id}, {"$set": {"color_pick.formula": f}})
    await _raw_db.color_picks.update_one({"tenant_id": t["id"], "code": appt["color_pick"]["code"]}, {"$set": {"formula": f}})
    return {"ok": True, "formula": f}


# ── Share card: front + back preview with salon logo & booking link ───────────

class ShareIn(BaseModel):
    color_id: str
    front_b64: str = Field(..., max_length=4_000_000)
    back_b64: str | None = Field(None, max_length=4_000_000)


@router.post("/public/color/{slug}/share-card")
async def public_share_card(slug: str, body: ShareIn):
    """Compose a 1080x1350 share image (nothing stored): both views, shade name, salon logo, booking QR."""
    import os
    import qrcode
    from PIL import ImageOps
    from services.veo_brand import _font, GOLD, _center
    from routes.mira_common import _tenant_logo
    t = await resolve_tenant_from_slug(slug)
    c = await _lookup(t["id"], body.color_id)
    if not c:
        raise HTTPException(404, "Unknown colour")
    try:
        front = Image.open(io.BytesIO(base64.b64decode(body.front_b64.split(",", 1)[-1]))).convert("RGB")
        back = Image.open(io.BytesIO(base64.b64decode(body.back_b64.split(",", 1)[-1]))).convert("RGB") if body.back_b64 else None
    except Exception:
        raise HTTPException(400, "Bad image data")
    W, H = 1080, 1220
    img = Image.new("RGB", (W, H), (12, 9, 14))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([24, 24, W - 24, H - 24], radius=28, outline=GOLD, width=4)
    y = 60
    _center(d, y, t.get("name", ""), _font(44, serif=True), GOLD, W); y += 58
    _center(d, y, f"MY NEW LOOK  ·  {c['name'].upper()}", _font(26), (235, 225, 230), W); y += 60
    tiles = [("FRONT", front)] + ([("BACK", back)] if back else [])
    tw = 470 if back else 700
    th = int(tw * 1.25)
    x = (W - (tw * len(tiles) + 40 * (len(tiles) - 1))) // 2
    for label, im in tiles:
        tile = ImageOps.fit(im, (tw, th))
        mask = Image.new("L", (tw, th), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, tw - 1, th - 1], radius=28, fill=255)
        img.paste(tile, (x, y), mask)
        ImageDraw.Draw(img).rounded_rectangle([x, y, x + tw - 1, y + th - 1], radius=28, outline=GOLD, width=3)
        lf = _font(22); ld = ImageDraw.Draw(img)
        ld.text((x + (tw - ld.textlength(label, font=lf)) / 2, y + th + 14), label, font=lf, fill=GOLD)
        x += tw + 40
    y += th + 70
    d = ImageDraw.Draw(img)
    base = os.environ.get("APP_PUBLIC_URL", "")
    url = f"{base}/book/{t['slug']}?color={c['id']}"
    qr = qrcode.QRCode(box_size=6, border=1); qr.add_data(url); qr.make()
    qim = qr.make_image(fill_color="black", back_color="white").convert("RGB").resize((190, 190))
    card = Image.new("RGB", (210, 210), (255, 255, 255)); card.paste(qim, (10, 10))
    img.paste(card, (W - 24 - 40 - 210, H - 24 - 40 - 210))
    logo = await _tenant_logo(t)
    lx = 64
    if logo:
        lg = ImageOps.contain(Image.open(io.BytesIO(logo)).convert("RGBA"), (120, 120))
        disc = Image.new("RGBA", (150, 150), (255, 255, 255, 255)); disc.alpha_composite(lg, ((150 - lg.width) // 2, (150 - lg.height) // 2))
        m = Image.new("L", (150, 150), 0); ImageDraw.Draw(m).ellipse([0, 0, 149, 149], fill=255)
        img.paste(disc, (lx, H - 24 - 40 - 150 - 30), m)
        ImageDraw.Draw(img).ellipse([lx, H - 24 - 40 - 150 - 30, lx + 150, H - 24 - 40 - 30], outline=GOLD, width=3)
        lx += 180
    d = ImageDraw.Draw(img)
    ty = H - 24 - 40 - 150 - 20
    d.text((lx, ty), "Book this colour", font=_font(40, serif=True), fill=(255, 255, 255)); ty += 54
    d.text((lx, ty), c.get("tag") or "Professional salon colour", font=_font(24), fill=(200, 190, 200)); ty += 40
    d.text((lx, ty), url.split("?")[0].replace("https://", "") + "  ·  scan →", font=_font(22), fill=GOLD)
    buf = io.BytesIO(); img.save(buf, "PNG")
    return Response(buf.getvalue(), media_type="image/png")
