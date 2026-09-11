"""Hair Colour Try-On — professional colour catalogue, salon-branded QR poster, public face-fit picker.

Customers (or staff) scan the salon's QR → /color/{slug} opens the front camera, reads the guest's
skin undertone on-device, and highlights the professional colours (balayage, mocha, copper…) that suit
them. The pick is saved so the stylist can start straight away.
"""
import io
import uuid
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


async def _catalog_with_images() -> list[dict]:
    imgs = {d["id"]: d.get("image_url") async for d in _raw_db.hair_color_images.find({}, {"_id": 0})}
    return [{**c, "image_url": imgs.get(c["id"])} for c in CATALOG]


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
async def hair_colors(admin=Depends(require_tenant_admin)):
    return {"colors": await _catalog_with_images()}


# ── Public picker ──────────────────────────────────────────────────────────────

@router.get("/public/color/{slug}")
async def public_color_catalog(slug: str):
    t = await resolve_tenant_from_slug(slug)
    colors = await _catalog_with_images()
    if any(not c.get("image_url") for c in colors):
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
    c = _BY_ID.get(body.color_id)
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
    return {"ok": True, "code": code, "color": {**c, "image_url": (img or {}).get("image_url")}}


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
    img = Image.new("RGB", (W, H), (7, 16, 38))
    d = ImageDraw.Draw(img)
    for i in range(5):  # celestial rings like the casting poster
        r = int(W * (0.62 + i * 0.16))
        d.ellipse([W / 2 - r, H * 0.36 - r, W / 2 + r, H * 0.36 + r], outline=(22 + i * 6, 34 + i * 6, 70), width=2)
    d.rounded_rectangle([28, 28, W - 28, H - 28], radius=26, outline=GOLD, width=3)
    d.rounded_rectangle([44, 44, W - 44, H - 44], radius=20, outline=(120, 100, 40), width=1)
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
    card = Image.new("RGB", (560, 560), (255, 255, 255))
    card.paste(qim, (20, 20))
    img.paste(card, (W // 2 - 280, y)); y += 600
    d = ImageDraw.Draw(img)
    _center(d, y, "Scan  -  front camera opens  -  fit your face in the oval", _font(30), (255, 255, 255), W); y += 46
    _center(d, y, "We read your skin undertone & show the shades that suit YOU", _font(28), (200, 200, 215), W); y += 70
    _center(d, y, "18 SHADES · BLACK TO PLATINUM · BALAYAGE · COPPER · PASTELS", _font(28), GOLD, W); y += 60
    _center(d, y, "Pick your shade — your stylist starts right away", _font(28), (255, 255, 255), W)
    _center(d, H - 120, url.replace("https://", ""), _font(26), (170, 170, 190), W)
    buf = io.BytesIO(); img.save(buf, "PNG")
    return Response(buf.getvalue(), media_type="image/png",
                    headers={"Content-Disposition": f'inline; filename="colour-tryon-{t["slug"]}.png"'})
