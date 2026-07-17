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
from schemas import Service, ServiceIn

router = APIRouter()

from pathlib import Path
ROOT_DIR = Path(__file__).parent.parent

# ---------------- Services ----------------
_MANI_IMG = "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/517ab2838ad15ec1f57e6f8972aa70b440e973f00372bedc22928e043bf5e3fa.png"
_PEDI_IMG = "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/82bf0bbcc6388db24726408d8073b9f0797e69bf194297f46c1756bd08813d97.png"
PRESET_SERVICES = [
    {"name": "Party Makeup", "category": "Makeup", "price": 1200, "duration_min": 60,
     "description": "Glam party-ready look with premium products.",
     "image_url": "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/f58649cd3e5dc5433a3e613c71686e0279685cd352a49b7ae3e44389d3f6d831.png"},
    {"name": "Normal Makeup", "category": "Makeup", "price": 700, "duration_min": 45,
     "description": "Natural everyday makeup with a flawless finish.",
     "image_url": "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/731c531b0656c6858ec80c799e1f24b104d9fc58d5abcea8d9189529672bac80.png"},
    {"name": "Bridal Makeup", "category": "Makeup", "price": 2000, "duration_min": 120, "trending": True,
     "description": "Complete bridal transformation for your big day.",
     "image_url": "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/cd336b5a167cbc0d9e7689d19aeff40cf8a0c08dad68032a39bd286c0447d62e.png"},
    {"name": "Saree Draping", "category": "Makeup", "price": 500, "duration_min": 30,
     "description": "Elegant professional saree draping. ₹500 onwards.",
     "image_url": "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/b8b033a0b096d70d21c13e2b85210eaff232161014600c048b086446a4096410.png"},
    {"name": "Hair Styling", "category": "Women Hair", "price": 800, "duration_min": 45,
     "description": "Curls, updos & event styling. ₹800 onwards.",
     "image_url": "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/a53c1f7baadcb7762a987e5123a4e2636e7e01a283fc4d8939950bae1f5e5116.png"},
    {"name": "Henna", "category": "Makeup", "price": 200, "duration_min": 30,
     "description": "Traditional mehndi designs. ₹200 onwards.",
     "image_url": "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/88f99747c197549154e47d7d7c5f06c6b15c0a94cdcdc686ceba2204ceb7a21a.png"},
    {"name": "Gel Polish on Natural Nail", "category": "Nails", "price": 500, "duration_min": 45,
     "description": "Long-lasting glossy gel polish. ₹500 onwards.",
     "image_url": "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/b75966f5d7d208f7db5613bd272e507d4a4b9d2faf0d8d8766c8dd93751e3d49.png"},
    {"name": "Gel Extension", "category": "Nails", "price": 1000, "duration_min": 75,
     "description": "Natural-looking gel nail extensions. ₹1000 onwards.",
     "image_url": "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/bae4dc0a5e96007a3ae85a139efe0464e814c7ff78b63ec825c41fa577f36357.png"},
    {"name": "Acrylic Extension", "category": "Nails", "price": 1500, "duration_min": 90,
     "description": "Durable acrylic extensions with nail art. ₹1500 onwards.",
     "image_url": "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/7105caf95adc9f46495f742e3b4338725e94999fa22d5da431f9b4f49e60d360.png"},
    # -------- Manicure --------
    {"name": "Basic Manicure", "category": "Manicure", "price": 400, "duration_min": 40,
     "description": "Classic nail shaping, cuticle care & polish.", "image_url": _MANI_IMG},
    {"name": "Aroma Magic Manicure", "category": "Manicure", "price": 500, "duration_min": 45,
     "description": "Aromatherapy manicure with nourishing oils.", "image_url": _MANI_IMG},
    {"name": "Rose Bud Manicure", "category": "Manicure", "price": 500, "duration_min": 45,
     "description": "Rose-infused soak for soft, fragrant hands.", "image_url": _MANI_IMG},
    {"name": "Ragga Manicure", "category": "Manicure", "price": 600, "duration_min": 50,
     "description": "Premium Ragga range hand treatment.", "image_url": _MANI_IMG},
    {"name": "Manicure (O3+)", "category": "Manicure", "price": 700, "duration_min": 50,
     "description": "O3+ professional brightening manicure.", "image_url": _MANI_IMG},
    {"name": "Foiling & Polish (Hands)", "category": "Manicure", "price": 100, "duration_min": 15,
     "description": "Quick foil buff & polish for hands.", "image_url": _MANI_IMG},
    {"name": "Cut & File", "category": "Manicure", "price": 100, "duration_min": 15,
     "description": "Nail cutting & shaping.", "image_url": _MANI_IMG},
    {"name": "Ozone Manicure", "category": "Manicure", "price": 600, "duration_min": 50,
     "description": "Ozone therapy manicure for healthy nails.", "image_url": _MANI_IMG},
    # -------- Pedicure --------
    {"name": "Basic Pedicure", "category": "Pedicure", "price": 500, "duration_min": 45,
     "description": "Classic foot soak, scrub, cuticle care & polish.", "image_url": _PEDI_IMG},
    {"name": "Aroma Magic Pedicure", "category": "Pedicure", "price": 800, "duration_min": 60,
     "description": "Aromatherapy pedicure with relaxing massage.", "image_url": _PEDI_IMG},
    {"name": "Rose Bud Pedicure", "category": "Pedicure", "price": 700, "duration_min": 55,
     "description": "Rose-infused soak for tired feet.", "image_url": _PEDI_IMG},
    {"name": "Ragga Pedicure", "category": "Pedicure", "price": 800, "duration_min": 60,
     "description": "Premium Ragga range foot treatment.", "image_url": _PEDI_IMG},
    {"name": "Pediologix (O3+)", "category": "Pedicure", "price": 1000, "duration_min": 60,
     "description": "O3+ Pediologix advanced foot therapy.", "image_url": _PEDI_IMG},
    {"name": "Foiling & Polish (Feet)", "category": "Pedicure", "price": 100, "duration_min": 15,
     "description": "Quick foil buff & polish for feet.", "image_url": _PEDI_IMG},
    {"name": "Cut & Foil", "category": "Pedicure", "price": 100, "duration_min": 15,
     "description": "Toe nail cutting & foil finish.", "image_url": _PEDI_IMG},
    {"name": "Ozone Pedicure", "category": "Pedicure", "price": 900, "duration_min": 60,
     "description": "Ozone therapy pedicure for healthy feet.", "image_url": _PEDI_IMG},
]

# Moves legacy services into the new main-tab category structure
CATEGORY_REMAP = {
    "Hair Cut - Men": "Men Hair",
    "Hair Cut - Women": "Women Hair",
    "Hair Color - Global": "Women Hair",
    "Keratin Treatment": "Women Hair",
    "Threading": "Skin",
    "Manicure": "Manicure",
    "Pedicure Spa": "Pedicure",
}

@router.post("/services/import-preset")
async def import_preset_services(user=Depends(require_admin)):
    added, updated = 0, 0
    for p in PRESET_SERVICES:
        existing = await db.services.find_one({"name": p["name"]})
        if existing:
            await db.services.update_one({"id": existing["id"]}, {"$set": {**p, "active": True}})
            updated += 1
        else:
            await db.services.insert_one(Service(**p).model_dump())
            added += 1
    for name, cat in CATEGORY_REMAP.items():
        sets = {"category": cat}
        if name == "Pedicure Spa":
            sets["image_url"] = _PEDI_IMG
        elif name == "Manicure":
            sets["image_url"] = _MANI_IMG
        r = await db.services.update_many({"name": name}, {"$set": sets})
        updated += r.modified_count
    return {"added": added, "updated": updated}

SERVICE_CSV_COLUMNS = ["name", "category", "price", "duration_min", "description", "image_url", "trending", "active"]

POSTER_DIR = ROOT_DIR / "assets" / "posters"
POSTER_DESIGNS = {
    "blush": {"bg": "blush.png", "name": (94, 52, 66), "accent": (168, 124, 46), "sub": (120, 84, 94), "band": (255, 252, 248, 200)},
    "rosegold": {"bg": "rosegold.png", "name": (128, 66, 74), "accent": (186, 110, 96), "sub": (146, 100, 100), "band": (255, 250, 246, 205)},
    "lavender": {"bg": "lavender.png", "name": (84, 56, 122), "accent": (146, 104, 190), "sub": (110, 88, 140), "band": (252, 250, 255, 200)},
    "ivory": {"bg": "ivory.png", "name": (122, 70, 42), "accent": (192, 100, 62), "sub": (140, 100, 74), "band": (255, 251, 244, 205)},
}


def _mascot_rgba():
    from PIL import Image as PILImage
    im = PILImage.open(POSTER_DIR / "scan_me.png").convert("RGBA")
    px = im.load()
    bg = px[4, 4][:3]
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) < 60:
                px[x, y] = (r, g, b, 0)
    return im


def _circle_avatar(size: int):
    from PIL import Image as PILImage, ImageDraw
    im = PILImage.open(POSTER_DIR / "mira.png").convert("RGB")
    side = min(im.size)
    im = im.crop(((im.width - side) // 2, 0, (im.width - side) // 2 + side, side)).resize((size, size))
    mask = PILImage.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size, size], fill=255)
    out = PILImage.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    d = ImageDraw.Draw(out)
    d.ellipse([2, 2, size - 2, size - 2], outline=(212, 175, 55), width=8)
    return out


def _build_qr_poster(tenant: dict, url: str, design: str = "blush", kind: str = "booking") -> bytes:
    import qrcode
    from PIL import Image as PILImage, ImageDraw, ImageFont

    cfg = POSTER_DESIGNS.get(design) or POSTER_DESIGNS["blush"]

    def _load_font(fname, size):
        for p in (ROOT_DIR / "fonts" / fname, Path("/usr/share/fonts/truetype/freefont") / fname):
            try:
                return ImageFont.truetype(str(p), size)
            except Exception:
                continue
        return ImageFont.load_default()

    W, H = 1600, 2400
    bg = PILImage.open(POSTER_DIR / cfg["bg"]).convert("RGB")
    scale = max(W / bg.width, H / bg.height)
    bg = bg.resize((int(bg.width * scale) + 1, int(bg.height * scale) + 1))
    img = bg.crop(((bg.width - W) // 2, (bg.height - H) // 2, (bg.width - W) // 2 + W, (bg.height - H) // 2 + H)).convert("RGBA")
    d = ImageDraw.Draw(img)

    def fit_font(text, fname, start, max_w):
        size = start
        while size > 34:
            f = _load_font(fname, size)
            bbox = d.textbbox((0, 0), text, font=f)
            if bbox[2] - bbox[0] <= max_w:
                return f
            size -= 6
        return _load_font(fname, 34)

    def center(text, y, font, fill):
        bbox = d.textbbox((0, 0), text, font=font)
        d.text(((W - (bbox[2] - bbox[0])) / 2 - bbox[0], y), text, font=font, fill=fill)

    def band(y0, y1, radius=36):
        overlay = PILImage.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(overlay).rounded_rectangle([110, y0, W - 110, y1], radius=radius, fill=cfg["band"])
        return PILImage.alpha_composite(img, overlay)

    # ---- header band: salon name + location + tagline
    img = band(430, 800)
    d = ImageDraw.Draw(img)
    name = tenant.get("name") or "Your Salon"
    center(name, 470, fit_font(name, "FreeSerifBold.ttf", 110, W - 320), cfg["name"])
    loc = (tenant.get("location") or "").strip()
    if loc:
        center(loc[:60], 620, _load_font("FreeSansBold.ttf", 42), cfg["sub"])
    center("S C A N  ·  R A T E  ·  S H I N E" if kind == "review" else "S C A N  ·  B O O K  ·  G L O W",
           705, _load_font("FreeSansBold.ttf", 40), cfg["accent"])

    # ---- QR panel with white rounded card
    qr = qrcode.QRCode(box_size=14, border=2, error_correction=qrcode.constants.ERROR_CORRECT_H)
    qr.add_data(url)
    qr.make(fit=True)
    qimg = qr.make_image(fill_color="black", back_color="white").convert("RGB").resize((560, 560))
    panel = PILImage.new("RGBA", (W, H), (0, 0, 0, 0))
    px0, py0 = (W - 660) // 2, 1000
    ImageDraw.Draw(panel).rounded_rectangle([px0, py0, px0 + 660, py0 + 660], radius=44, fill=(255, 255, 255, 255))
    img = PILImage.alpha_composite(img, panel)
    img.paste(qimg, (px0 + 50, py0 + 50))
    d = ImageDraw.Draw(img)

    # ---- cute mascot + "Scan me!" above the QR
    try:
        mascot = _mascot_rgba().resize((330, 330))
        img.paste(mascot, (px0 + 660 - 190, py0 - 250), mascot)
        scan_label = "Loved it? Scan!" if kind == "review" else "Scan me!"
        d.text((px0 + 40, py0 - 150), scan_label, font=_load_font("FreeSerifBoldItalic.ttf", 70), fill=cfg["accent"])
    except Exception:
        pass

    # ---- Mira avatar bottom-left of QR panel
    try:
        av = _circle_avatar(230)
        img.paste(av, (px0 - 105, py0 + 660 - 150), av)
        d.text((px0 - 95, py0 + 660 + 88), "Mira AI", font=_load_font("FreeSansBold.ttf", 34), fill=cfg["accent"])
    except Exception:
        pass

    # ---- timings band (from Settings)
    img = band(1830, 2130)
    d = ImageDraw.Draw(img)
    head = "—  LOVED YOUR VISIT? TELL THE WORLD  —" if kind == "review" else "—  OPEN MONDAY – SUNDAY  —"
    center(head, 1870, _load_font("FreeSansBold.ttf", 42), cfg["accent"])
    if kind == "review":
        center("Your review takes 30 seconds and means the world to us", 1940,
               _load_font("FreeSerifBold.ttf", 46), cfg["name"])
    else:
        hours = (tenant.get("hours") or "").strip() or "10:00 AM – 9:00 PM"
        center(hours[:60], 1935, fit_font(hours[:60], "FreeSerifBold.ttf", 66, W - 360), cfg["name"])
    parts = [(tenant.get("phone") or "").strip()]
    if kind == "booking":
        parts.append(url.replace("https://", ""))
    contact = " · ".join(x for x in parts if x)
    center(contact[:80], 2035, _load_font("FreeSansBold.ttf", 36), cfg["sub"])

    center("Powered by Miracurl", 2290, _load_font("FreeSansBold.ttf", 32), cfg["sub"])
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="PNG")
    return buf.getvalue()

def _build_tent_card(tenant: dict, url: str, design: str = "blush", kind: str = "booking") -> bytes:
    """A5 landscape table tent card — QR left, salon details right."""
    import qrcode
    from PIL import Image as PILImage, ImageDraw, ImageFont

    cfg = POSTER_DESIGNS.get(design) or POSTER_DESIGNS["blush"]

    def _load_font(fname, size):
        for p in (ROOT_DIR / "fonts" / fname, Path("/usr/share/fonts/truetype/freefont") / fname):
            try:
                return ImageFont.truetype(str(p), size)
            except Exception:
                continue
        return ImageFont.load_default()

    W, H = 2000, 1400
    bg = PILImage.open(POSTER_DIR / cfg["bg"]).convert("RGB")
    scale = max(W / bg.width, H / bg.height)
    bg = bg.resize((int(bg.width * scale) + 1, int(bg.height * scale) + 1))
    img = bg.crop(((bg.width - W) // 2, (bg.height - H) // 2, (bg.width - W) // 2 + W, (bg.height - H) // 2 + H)).convert("RGBA")
    d = ImageDraw.Draw(img)

    def fit_font(text, fname, start, max_w):
        size = start
        while size > 28:
            f = _load_font(fname, size)
            bbox = d.textbbox((0, 0), text, font=f)
            if bbox[2] - bbox[0] <= max_w:
                return f
            size -= 5
        return _load_font(fname, 28)

    # right info band
    overlay = PILImage.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(overlay).rounded_rectangle([880, 170, W - 90, H - 170], radius=40, fill=cfg["band"])
    img = PILImage.alpha_composite(img, overlay)
    d = ImageDraw.Draw(img)

    # left QR panel + mascot
    panel = PILImage.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(panel).rounded_rectangle([150, 400, 150 + 620, 400 + 620], radius=40, fill=(255, 255, 255, 255))
    img = PILImage.alpha_composite(img, panel)
    qr = qrcode.QRCode(box_size=13, border=2, error_correction=qrcode.constants.ERROR_CORRECT_H)
    qr.add_data(url)
    qr.make(fit=True)
    img.paste(qr.make_image(fill_color="black", back_color="white").convert("RGB").resize((530, 530)), (195, 445))
    d = ImageDraw.Draw(img)
    try:
        mascot = _mascot_rgba().resize((280, 280))
        img.paste(mascot, (150 + 620 - 170, 400 - 220), mascot)
        d.text((175, 400 - 130), "Loved it? Scan!" if kind == "review" else "Scan me!",
               font=_load_font("FreeSerifBoldItalic.ttf", 62), fill=cfg["accent"])
    except Exception:
        pass
    d.text((225, 400 + 620 + 30), "Point your camera at the code",
           font=_load_font("FreeSansBold.ttf", 32), fill=cfg["sub"])

    # right column text
    rx, rw = 940, W - 90 - 940 - 40
    def rtext(text, y, font, fill):
        bbox = d.textbbox((0, 0), text, font=font)
        d.text((rx + (rw - (bbox[2] - bbox[0])) / 2, y), text, font=font, fill=fill)
    name = tenant.get("name") or "Your Salon"
    rtext(name, 240, fit_font(name, "FreeSerifBold.ttf", 82, rw), cfg["name"])
    loc = (tenant.get("location") or "").strip()
    if loc:
        rtext(loc[:50], 360, _load_font("FreeSansBold.ttf", 34), cfg["sub"])
    rtext("S C A N · R A T E · S H I N E" if kind == "review" else "S C A N · B O O K · G L O W",
          445, _load_font("FreeSansBold.ttf", 34), cfg["accent"])
    if kind == "review":
        rtext("Loved your visit?", 590, _load_font("FreeSerifBold.ttf", 66), cfg["name"])
        rtext("Tell the world — it takes 30 seconds", 700, _load_font("FreeSansBold.ttf", 36), cfg["sub"])
    else:
        rtext("—  OPEN MONDAY – SUNDAY  —", 590, _load_font("FreeSansBold.ttf", 36), cfg["accent"])
        hours = (tenant.get("hours") or "").strip() or "10:00 AM – 9:00 PM"
        rtext(hours[:50], 660, fit_font(hours[:50], "FreeSerifBold.ttf", 58, rw), cfg["name"])
    contact = " · ".join(x for x in [(tenant.get("phone") or "").strip()] if x)
    if contact:
        rtext(contact[:50], 820, _load_font("FreeSansBold.ttf", 36), cfg["sub"])
    try:
        av = _circle_avatar(190)
        img.paste(av, (rx + rw // 2 - 95, 900), av)
        d = ImageDraw.Draw(img)
        rtext("Mira AI  ·  Powered by Miracurl", 1110, _load_font("FreeSansBold.ttf", 30), cfg["accent"])
    except Exception:
        pass
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="PNG")
    return buf.getvalue()

@router.get("/settings/qr-poster")
async def download_qr_poster(origin: str = "", design: str = "blush", kind: str = "booking",
                             fmt: str = "poster", user=Depends(get_current_user)):
    if not origin.startswith("http"):
        raise HTTPException(400, "origin query param required")
    if design not in POSTER_DESIGNS:
        raise HTTPException(400, f"design must be one of {sorted(POSTER_DESIGNS)}")
    if kind not in ("booking", "review") or fmt not in ("poster", "tent"):
        raise HTTPException(400, "kind must be booking|review, fmt must be poster|tent")
    tenant = await db.tenants.find_one({"id": user.get("tenant_id")}, {"_id": 0})
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    base = origin.rstrip("/")
    url = f"{base}/book/{tenant['slug']}" if kind == "booking" else f"{base}/api/public/review-go/{tenant['slug']}"
    builder = _build_tent_card if fmt == "tent" else _build_qr_poster
    png = await asyncio.to_thread(builder, tenant, url, design, kind)
    return Response(content=png, media_type="image/png",
                    headers={"Content-Disposition": f"attachment; filename={kind}-{fmt}-{design}.png"})

@router.get("/services/export")
async def export_services_csv(user=Depends(require_admin)):
    rows = await db.services.find({}).sort([("category", 1), ("name", 1)]).to_list(2000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(SERVICE_CSV_COLUMNS)
    for r in rows:
        _csv_row(w, [
            r.get("name", ""), r.get("category", ""), r.get("price", 0),
            r.get("duration_min", 30), r.get("description", ""), r.get("image_url", ""),
            r.get("trending", False), r.get("active", True),
        ])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=services.csv"},
    )

@router.post("/services/import")
async def import_services_csv(file: UploadFile = File(...), user=Depends(require_admin)):
    content = await _read_csv_upload(file)
    reader = csv.DictReader(io.StringIO(content))
    fields = {(f or "").strip().lower() for f in (reader.fieldnames or [])}
    if not {"name", "category", "price"}.issubset(fields):
        raise HTTPException(400, "CSV needs columns: name, category, price (optional: duration_min, description, image_url, trending, active)")
    added = updated = skipped = 0
    for raw in reader:
        row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
        name = row.get("name", "")
        try:
            price = float(row.get("price") or "")
        except ValueError:
            price = None
        if not name or price is None:
            skipped += 1
            continue
        doc = {
            "name": name,
            "category": row.get("category") or "General",
            "price": price,
            "duration_min": int(float(row.get("duration_min") or 30)),
            "description": row.get("description", ""),
            "image_url": row.get("image_url", ""),
            "trending": row.get("trending", "").lower() in ("true", "1", "yes"),
            "active": row.get("active", "true").lower() not in ("false", "0", "no"),
        }
        existing = await db.services.find_one({"name": name})
        if existing:
            await db.services.update_one({"id": existing["id"]}, {"$set": doc})
            updated += 1
        else:
            await db.services.insert_one(Service(**doc).model_dump())
            added += 1
    return {"added": added, "updated": updated, "skipped": skipped}

@router.get("/services")
async def list_services(user=Depends(get_current_user)):
    return await db.services.find({}, {"_id": 0}).sort("category", 1).to_list(500)

@router.post("/services")
async def create_service(body: ServiceIn, user=Depends(require_admin)):
    s = Service(**body.model_dump()).model_dump()
    await db.services.insert_one(s)
    return _clean(s)

@router.put("/services/{sid}")
async def update_service(sid: str, body: ServiceIn, user=Depends(require_admin)):
    await db.services.update_one({"id": sid}, {"$set": body.model_dump()})
    return await db.services.find_one({"id": sid}, {"_id": 0})

@router.delete("/services/{sid}")
async def delete_service(sid: str, user=Depends(require_admin)):
    await db.services.delete_one({"id": sid})
    return {"ok": True}

# ---------------- Owner Security PIN + Branch-switch approval ----------------
class SecurityPinIn(BaseModel):
    new_pin: str = Field(..., pattern=r"^\d{4,6}$")
    current_pin: Optional[str] = None




# ---------------- Category banner images (one image per category, used on the booking page) ----------------
class CategoryImageIn(BaseModel):
    image_url: str = ""


@router.get("/service-categories")
async def list_service_categories(user=Depends(require_admin)):
    cats = await db.service_categories.find({}, {"_id": 0}).to_list(200)
    return {c["name"]: c.get("image_url", "") for c in cats}


@router.put("/service-categories/{name}")
async def set_category_image(name: str, body: CategoryImageIn, user=Depends(require_admin)):
    name = name.strip()[:60]
    if not name:
        raise HTTPException(400, "Category name required")
    await db.service_categories.update_one(
        {"name": name}, {"$set": {"name": name, "image_url": (body.image_url or "").strip()[:500]}}, upsert=True)
    return {"ok": True, "name": name, "image_url": (body.image_url or "").strip()[:500]}
