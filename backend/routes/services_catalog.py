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
import json  # noqa: F401
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

RESTO_PRESET = [
    ("Chicken Starters", [("Chicken 65", 249, 3), ("Chicken Manchurian", 259, 2), ("Chilli Chicken", 249, 3),
        ("Chicken Lollipop", 269, 2), ("Chicken Wings", 259, 2), ("Chicken Pepper Fry", 279, 3),
        ("Chicken Tikka", 289, 2), ("Chicken Malai Tikka", 299, 1), ("Chicken Seekh Kebab", 289, 2),
        ("Tandoori Chicken", 299, 2), ("Chicken Reshmi Kebab", 289, 1), ("Chicken Tangdi Kebab", 299, 2),
        ("Crispy Chicken", 259, 2), ("Chicken Pakoda", 229, 2), ("Chicken Majestic", 279, 2)]),
    ("Mutton Starters", [("Mutton Seekh Kebab", 349, 2), ("Mutton Shami Kebab", 339, 2), ("Mutton Pepper Fry", 369, 3),
        ("Mutton Chilli", 349, 3), ("Mutton Sukka", 359, 3), ("Mutton Kebab", 339, 2), ("Mutton Tawa Fry", 359, 2)]),
    ("Fish Starters", [("Fish Finger", 289, 1), ("Chilli Fish", 299, 3), ("Fish 65", 289, 3), ("Fish Fry", 279, 2),
        ("Amritsari Fish", 319, 2), ("Fish Tawa Fry", 299, 2), ("Pepper Fish", 309, 3), ("Fish Manchurian", 299, 2)]),
    ("Prawns Starters", [("Chilli Prawns", 329, 3), ("Prawn 65", 319, 3), ("Prawn Fry", 309, 2), ("Crispy Prawns", 329, 2),
        ("Pepper Prawns", 339, 3), ("Garlic Prawns", 339, 1), ("Prawn Manchurian", 329, 2)]),
    ("BBQ & Grill", [("Chicken Tandoori", 299, 2), ("Chicken Tikka", 289, 2), ("Malai Chicken Tikka", 299, 1),
        ("Tangdi Kebab", 299, 2), ("Chicken Seekh Kebab", 289, 2), ("BBQ Chicken Wings", 289, 2),
        ("Grilled Chicken", 329, 2), ("Peri Peri Chicken", 319, 3)]),
    ("Main Course", [("Butter Chicken", 349, 1), ("Chicken Curry", 329, 2), ("Kadai Chicken", 339, 2),
        ("Chicken Tikka Masala", 349, 2), ("Mutton Rogan Josh", 399, 2), ("Mutton Curry", 389, 2),
        ("Fish Curry", 349, 2), ("Prawn Masala", 369, 2), ("Paneer Butter Masala", 299, 1),
        ("Dal Makhani", 279, 1), ("Veg Kolhapuri", 289, 3), ("Chicken Biryani", 299, 2),
        ("Mutton Biryani", 369, 2), ("Veg Biryani", 249, 1)]),
]


@router.post("/services/import-preset")
async def import_preset_services(user=Depends(require_admin)):
    added, updated = 0, 0
    if await _tenant_is_restaurant(_current_tenant_id.get()):
        existing = {(s.get("name") or "").strip().lower() for s in await db.services.find({}, {"name": 1}).to_list(500)}
        for cat, items in RESTO_PRESET:
            for name, price, spice in items:
                if name.lower() in existing:
                    updated += 1
                    continue
                veg_flag = "veg" if any(k in name.lower() for k in ("paneer", "dal", "veg")) else "non-veg"
                await db.services.insert_one({
                    "id": str(uuid.uuid4()), "name": name, "category": cat, "price": float(price),
                    "duration_min": 20, "description": "", "image_url": None, "trending": False,
                    "active": True, "bookable_online": True, "gender": "unisex",
                    "veg": veg_flag, "spice": spice})
                existing.add(name.lower())
                added += 1
        return {"added": added, "updated": 0, "skipped": updated}
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

from services.posters import (  # noqa: F401
    POSTER_DIR, POSTER_DESIGNS, _mascot_rgba, _circle_avatar,
    _build_qr_poster, _build_tent_card,
)

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
    if tenant.get("business_type") == "restaurant":
        design = "bistro"
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


class CategoryOrderIn(BaseModel):
    order: list = []


@router.get("/service-categories/order")
async def get_category_order(user=Depends(require_admin)):
    doc = await db.service_category_order.find_one({}, {"_id": 0}) or {}
    return {"order": doc.get("order") or []}


@router.put("/service-categories/order")
async def set_category_order(body: CategoryOrderIn, user=Depends(require_admin)):
    """Salon's preferred category order — drives chips here and tabs on the public booking page."""
    order = [str(c).strip()[:60] for c in body.order[:100] if str(c).strip()]
    await db.service_category_order.update_one({}, {"$set": {"order": order}}, upsert=True)
    return {"ok": True, "order": order}


@router.put("/service-categories/{name}")
async def set_category_image(name: str, body: CategoryImageIn, user=Depends(require_admin)):
    name = name.strip()[:60]
    if not name:
        raise HTTPException(400, "Category name required")
    await db.service_categories.update_one(
        {"name": name}, {"$set": {"name": name, "image_url": (body.image_url or "").strip()[:500]}}, upsert=True)
    return {"ok": True, "name": name, "image_url": (body.image_url or "").strip()[:500]}


# ---------------- Mira Service Photo Studio (AI-generated service images) ----------------

async def _generate_service_image_bytes(name: str, category: str, restaurant: bool = False) -> bytes:
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    gen = OpenAIImageGeneration(api_key=key)
    if restaurant:
        prompt = (f"Premium gourmet food photograph of the dish '{name}' ({category} cuisine). "
                  "Michelin-star restaurant plating on elegant dark ceramic, dramatic warm side lighting, "
                  "artful garnish, glistening textures, gentle steam rising, luxury fine-dining ambience, "
                  "85mm lens, shallow depth of field, high-end food magazine editorial quality, photorealistic. "
                  "Absolutely NO text, NO letters, NO watermarks, NO logos, NO people.")
    else:
        prompt = (f"Professional beauty-salon photograph for the service '{name}' in the category '{category}'. "
                  "Elegant premium salon or spa setting, tasteful and modest — client fully draped in a spa robe or towel, "
                  "focus on hands of the therapist, premium products, tools and textures. Soft warm lighting, "
                  "rose-gold and cream tones, photorealistic, shallow depth of field, editorial quality. "
                  "Absolutely NO text, NO letters, NO watermarks, NO logos, NO nudity.")
    try:
        imgs = await asyncio.wait_for(
            gen.generate_images(prompt=prompt, model="gpt-image-1", number_of_images=1), timeout=240)
    except Exception as e:
        if "safety" not in str(e).lower() and "rejected" not in str(e).lower():
            raise
        logging.warning(f"mira image safety fallback for '{name}': retrying product-only prompt")
        safe_prompt = (
            f"Premium gourmet food styling flat-lay inspired by '{name}' — ingredients, spices and plated dish on dark ceramic, "
            "warm side lighting, editorial quality, photorealistic. Absolutely NO text, NO letters, NO watermarks, NO people."
            if restaurant else
            f"Luxury spa product flat-lay themed for the salon treatment '{name}' ({category}): premium jars, creams, scrubs, "
            "oils, fresh botanicals, rolled cream towels and rose petals on a marble surface. Soft warm lighting, rose-gold "
            "and cream tones, photorealistic editorial still-life. Absolutely NO text, NO letters, NO watermarks, NO logos, NO people.")
        imgs = await asyncio.wait_for(
            gen.generate_images(prompt=safe_prompt, model="gpt-image-1", number_of_images=1), timeout=240)
    if not imgs:
        raise RuntimeError("empty generation")
    return imgs[0]


def _compress_for_web(img_bytes: bytes, max_px: int = 1024, quality: int = 82) -> tuple[bytes, str, str]:
    """gpt-image PNGs are ~2 MB — shrink to a web-friendly JPEG so menus/booking pages load fast."""
    try:
        from PIL import Image
        import io
        im = Image.open(io.BytesIO(img_bytes))
        im = im.convert("RGB")
        im.thumbnail((max_px, max_px))
        out = io.BytesIO()
        im.save(out, format="JPEG", quality=quality, optimize=True, progressive=True)
        return out.getvalue(), "image/jpeg", "jpg"
    except Exception:
        return img_bytes, "image/png", "png"


async def _store_service_image(tenant_id: str, img_bytes: bytes, name: str) -> str:
    file_id = str(uuid.uuid4())
    img_bytes, ctype, ext = await asyncio.to_thread(_compress_for_web, img_bytes)
    path = f"{APP_NAME}/tenants/{tenant_id}/service/{file_id}.{ext}"
    result = await asyncio.to_thread(_put_object, path, img_bytes, ctype)
    await _raw_db.uploads.insert_one({
        "id": file_id, "tenant_id": tenant_id, "kind": "service",
        "storage_path": result.get("path", path), "original_filename": f"mira-{name[:30]}.{ext}",
        "content_type": ctype, "size": len(img_bytes), "uploaded_by": "mira-ai",
        "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat()})
    return f"/api/files/{file_id}"


@router.post("/services/generate-descriptions")
async def generate_dish_descriptions(user=Depends(require_admin)):
    """Mira writes a tasty one-line description for every dish without one (restaurants)."""
    tenant_id = _current_tenant_id.get()
    if not await _tenant_is_restaurant(tenant_id):
        raise HTTPException(400, "Dish descriptions are only available for restaurants")
    svcs = await db.services.find(
        {"$or": [{"description": ""}, {"description": None}]},
        {"_id": 0, "id": 1, "name": 1, "category": 1}).to_list(200)
    todo = svcs[:60]
    if not todo:
        return {"updated": 0, "remaining": 0}
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    listing = "\n".join(f"{s['id']}|{s['name']} ({s.get('category') or 'Menu'})" for s in todo)
    chat = LlmChat(
        api_key=key, session_id=f"dishdesc-{uuid.uuid4().hex[:8]}",
        system_message=(
            "You are Mira, a food copywriter for an Indian family restaurant. "
            "For each dish write ONE short, mouth-watering description line (max 12 words). "
            "Vivid, appetizing, specific to the dish. No emojis, no quotes, don't repeat the dish name. "
            "Reply ONLY with a JSON object mapping each id to its description line — no markdown, no extra text."),
    ).with_model("openai", "gpt-5.4-mini")
    resp = await chat.send_message(UserMessage(text=f"Dishes (id|name (category)):\n{listing}"))
    txt = re.sub(r"^```(?:json)?\s*|\s*```$", "", str(resp).strip())
    try:
        data = json.loads(txt)
    except Exception as e:
        logging.error(f"dish descriptions parse failed: {e} :: {txt[:200]}")
        raise HTTPException(502, "Mira's reply couldn't be read — please try again")
    n = 0
    for s in todo:
        d = str(data.get(s["id"]) or "").strip().strip('"')[:120]
        if d:
            await db.services.update_one({"id": s["id"]}, {"$set": {"description": d}})
            n += 1
    return {"updated": n, "remaining": max(0, len(svcs) - len(todo))}


@router.get("/services/image-weight")
async def service_image_weight(user=Depends(require_admin)):
    """How many heavy (≥400 KB) Mira/uploaded service images this salon still has."""
    tenant_id = _current_tenant_id.get()
    rows = await _raw_db.uploads.find(
        {"tenant_id": tenant_id, "kind": "service", "is_deleted": False, "size": {"$gte": 400_000}},
        {"_id": 0, "size": 1}).to_list(2000)
    job = await _raw_db.mira_image_batches.find_one({"tenant_id": tenant_id, "kind": "shrink", "status": "running"}, {"_id": 0})
    return {"heavy": len(rows), "mb": round(sum(r["size"] for r in rows) / 1_048_576, 1), "running": job}


async def _shrink_upload(rec: dict) -> int:
    """Re-encode one stored image as a web JPEG in place (same /api/files/{id} URL). Returns bytes saved."""
    from routes.uploads import _resize_webp, _THUMB_WIDTHS
    original, _ = await asyncio.to_thread(_get_object, rec["storage_path"])
    data, ctype, ext = await asyncio.to_thread(_compress_for_web, original)
    if len(data) >= len(original) * 0.9:
        return 0
    new_path = re.sub(r"\.\w+$", "", rec["storage_path"]) + f".{ext}"
    if new_path == rec["storage_path"]:
        new_path = re.sub(r"\.\w+$", "", rec["storage_path"]) + f"-web.{ext}"
    result = await asyncio.to_thread(_put_object, new_path, data, ctype)
    await _raw_db.uploads.update_one({"id": rec["id"]}, {"$set": {
        "storage_path": result.get("path", new_path), "content_type": ctype, "size": len(data),
        "original_size": rec.get("size"), "shrunk_at": datetime.now(timezone.utc).isoformat()}})
    # pre-warm the two thumbnail sizes the app uses so first paint is instant
    for w in (160, 640):
        if w in _THUMB_WIDTHS:
            try:
                thumb = await asyncio.to_thread(_resize_webp, data, w)
                await asyncio.to_thread(_put_object, f"{result.get('path', new_path)}.w{w}.webp", thumb, "image/webp")
            except Exception:
                pass
    return len(original) - len(data)


async def _run_shrink_batch(batch_id: str, tenant_ids: list[str] | None) -> None:
    q = {"kind": "service", "is_deleted": False, "size": {"$gte": 400_000}}
    if tenant_ids:
        q["tenant_id"] = {"$in": tenant_ids}
    recs = await _raw_db.uploads.find(q, {"_id": 0}).to_list(5000)
    await _raw_db.mira_image_batches.update_one({"id": batch_id}, {"$set": {"total": len(recs)}})
    sem = asyncio.Semaphore(4)
    saved = 0

    async def _one(rec):
        nonlocal saved
        async with sem:
            try:
                gained = await _shrink_upload(rec)
                saved += gained
                await _batch_tick(batch_id, {"done": 1}, {"saved_bytes": saved})
            except Exception as e:
                logging.error(f"shrink failed for {rec.get('id')}: {e}")
                await _batch_tick(batch_id, {"failed": 1}, {"last_error": str(e)[:160]})

    await asyncio.gather(*(_one(r) for r in recs))
    await _raw_db.mira_image_batches.update_one({"id": batch_id}, {"$set": {"status": "done", "saved_bytes": saved}})


@router.post("/services/shrink-images")
async def shrink_service_images(user=Depends(require_admin)):
    """Compress this salon's heavy (old 2 MB PNG) service photos & banners in place — URLs unchanged."""
    tenant_id = _current_tenant_id.get()
    if await _batch_running(tenant_id):
        raise HTTPException(409, "Mira is already working on images for this salon — wait for it to finish")
    heavy = await _raw_db.uploads.count_documents({"tenant_id": tenant_id, "kind": "service", "is_deleted": False, "size": {"$gte": 400_000}})
    if not heavy:
        return {"queued": 0}
    batch_id = str(uuid.uuid4())[:8]
    await _raw_db.mira_image_batches.insert_one({
        "id": batch_id, "tenant_id": tenant_id, "kind": "shrink", "total": heavy, "done": 0, "failed": 0,
        "status": "running", "created_at": datetime.now(timezone.utc).isoformat()})
    asyncio.get_event_loop().create_task(_run_shrink_batch(batch_id, [tenant_id]))
    return {"queued": heavy, "batch_id": batch_id}


@router.post("/super-admin/shrink-images")
async def shrink_all_images(user=Depends(require_super_admin)):
    """HQ: compress heavy service images across every tenant (one-off migration, background)."""
    heavy = await _raw_db.uploads.count_documents({"kind": "service", "is_deleted": False, "size": {"$gte": 400_000}})
    if not heavy:
        return {"queued": 0}
    batch_id = str(uuid.uuid4())[:8]
    await _raw_db.mira_image_batches.insert_one({
        "id": batch_id, "tenant_id": "__all__", "kind": "shrink", "total": heavy, "done": 0, "failed": 0,
        "status": "running", "created_at": datetime.now(timezone.utc).isoformat()})
    asyncio.get_event_loop().create_task(_run_shrink_batch(batch_id, None))
    return {"queued": heavy, "batch_id": batch_id}


@router.post("/services/generate-missing-images")
async def generate_missing_service_images(category: str | None = None, user=Depends(require_admin)):
    """Mira paints a photo for every service/dish without one — optionally only one category (faster)."""
    q: dict = {"$or": [{"image_url": ""}, {"image_url": None}]}
    if category and category.strip():
        q["category"] = category.strip()
    svcs = await db.services.find(q, {"_id": 0}).to_list(200)
    todo = svcs[:60]
    if not todo:
        return {"queued": 0, "remaining": 0}
    tenant_id = _current_tenant_id.get()
    if await _batch_running(tenant_id):
        raise HTTPException(409, "Mira is already painting a batch — check the progress chip")
    batch_id = uuid.uuid4().hex[:8]
    await _raw_db.mira_image_batches.insert_one({
        "id": batch_id, "tenant_id": tenant_id, "kind": "photos", "total": len(todo), "done": 0, "failed": 0,
        "status": "running", "created_at": datetime.now(timezone.utc).isoformat()})

    async def _runner():
        resto = await _tenant_is_restaurant(tenant_id)
        sem = asyncio.Semaphore(8)  # 8 paintings in flight → ~8x faster than one-by-one

        async def _one(s):
            async with sem:
                try:
                    img = await _generate_service_image_bytes(s["name"], s.get("category") or "Beauty", restaurant=resto)
                    url = await _store_service_image(tenant_id, img, s["name"])
                    await _raw_db.services.update_one(
                        {"id": s["id"], "tenant_id": tenant_id}, {"$set": {"image_url": url}})
                    await _batch_tick(batch_id, {"done": 1})
                except Exception as e:
                    logging.error(f"mira service image failed for {s.get('name')}: {e}")
                    await _batch_tick(batch_id, {"failed": 1}, {"last_error": str(e)[:160]})

        await asyncio.gather(*(_one(s) for s in todo))
        await _raw_db.mira_image_batches.update_one({"id": batch_id}, {"$set": {"status": "done"}})

    asyncio.get_event_loop().create_task(_runner())
    return {"queued": len(todo), "remaining": max(0, len(svcs) - len(todo)), "batch_id": batch_id}



_BATCH_STALE_SEC = 240  # no progress for 4 min → the server was restarted mid-batch; let the owner resume


async def _batch_running(tenant_id: str) -> bool:
    """True if a batch is genuinely running. A batch with no heartbeat for 4 min (server redeploy
    killed the background task) is marked 'interrupted' so a fresh run can pick up the leftovers."""
    b = await _raw_db.mira_image_batches.find_one({"tenant_id": tenant_id, "status": "running"}, {"_id": 0})
    if not b:
        return False
    last = b.get("updated_at") or b.get("created_at") or ""
    try:
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(last)).total_seconds()
    except ValueError:
        age = _BATCH_STALE_SEC + 1
    if age > _BATCH_STALE_SEC:
        await _raw_db.mira_image_batches.update_one({"id": b["id"]}, {"$set": {"status": "interrupted"}})
        return False
    return True


async def _batch_tick(batch_id: str, inc: dict, extra: dict | None = None) -> None:
    await _raw_db.mira_image_batches.update_one(
        {"id": batch_id}, {"$inc": inc, "$set": {"updated_at": datetime.now(timezone.utc).isoformat(), **(extra or {})}})


@router.get("/services/image-batch-status")
async def image_batch_status(user=Depends(require_admin)):
    tenant_id = _current_tenant_id.get()
    await _batch_running(tenant_id)  # flips a stalled batch to 'interrupted'
    b = await _raw_db.mira_image_batches.find_one(
        {"tenant_id": tenant_id}, {"_id": 0}, sort=[("created_at", -1)])
    return b or {"status": "none"}


@router.post("/services/{sid}/generate-image")
async def generate_service_image(sid: str, user=Depends(require_admin)):
    """Start a background paint job (long requests time out behind Cloudflare) — poll /services/image-jobs/{id}."""
    svc = await db.services.find_one({"id": sid}, {"_id": 0})
    if not svc:
        raise HTTPException(404, "Service not found")
    tenant_id = _current_tenant_id.get()
    jid = await _new_image_job(tenant_id)
    asyncio.get_event_loop().create_task(
        _run_image_job(jid, tenant_id, svc["name"], svc.get("category") or "Beauty", sid=sid))
    return {"ok": True, "job_id": jid}


class ImagePreviewIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    category: str = ""


@router.post("/services/generate-image-preview")
async def generate_service_image_preview(body: ImagePreviewIn, user=Depends(require_admin)):
    """Background paint for a NOT-yet-saved service (New Service modal) — poll /services/image-jobs/{id}."""
    tenant_id = _current_tenant_id.get()
    jid = await _new_image_job(tenant_id)
    asyncio.get_event_loop().create_task(
        _run_image_job(jid, tenant_id, body.name.strip(), body.category.strip() or "Beauty"))
    return {"ok": True, "job_id": jid}


async def _new_image_job(tenant_id: str) -> str:
    jid = str(uuid.uuid4())
    await _raw_db.mira_image_jobs.insert_one({
        "id": jid, "tenant_id": tenant_id, "status": "running", "image_url": "", "error": "",
        "created_at": datetime.now(timezone.utc).isoformat()})
    return jid


async def _tenant_is_restaurant(tenant_id: str) -> bool:
    t = await _raw_db.tenants.find_one({"id": tenant_id}, {"_id": 0, "business_type": 1})
    return (t or {}).get("business_type") == "restaurant"


async def _run_image_job(jid: str, tenant_id: str, name: str, category: str, sid: str = ""):
    try:
        resto = await _tenant_is_restaurant(tenant_id)
        img = await _generate_service_image_bytes(name, category, restaurant=resto)
        url = await _store_service_image(tenant_id, img, name)
        if sid:
            await _raw_db.services.update_one({"id": sid, "tenant_id": tenant_id}, {"$set": {"image_url": url}})
        await _raw_db.mira_image_jobs.update_one({"id": jid}, {"$set": {"status": "done", "image_url": url}})
    except Exception as e:
        logging.error(f"mira image job {jid} failed: {e}")
        msg = str(e)
        low = msg.lower()
        if "safety" in low or "rejected" in low:
            msg = f"Mira couldn't paint “{name}” — the AI safety filter blocked this wording. Try a simpler name (e.g. add “treatment” or “spa”) or upload your own photo."
        elif isinstance(e, asyncio.TimeoutError):
            msg = "Mira took too long to paint — please try again in a moment."
        elif "billing" in low or "budget" in low or "quota" in low:
            msg = "AI image budget exhausted — please top up the AI key."
        else:
            msg = "Mira couldn't paint this one right now — please try again."
        await _raw_db.mira_image_jobs.update_one(
            {"id": jid}, {"$set": {"status": "failed", "error": msg[:220]}})


async def _generate_category_banner_bytes(category: str, restaurant: bool) -> bytes:
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    gen = OpenAIImageGeneration(api_key=key)
    if restaurant:
        prompt = (f"Wide premium banner photograph of a lavish spread of {category} dishes from an Indian restaurant. "
                  "Multiple gourmet plates artfully arranged on a dark rustic wood table, dramatic warm lighting, "
                  "fresh garnishes, subtle smoke wisps, luxury fine-dining editorial style, photorealistic. "
                  "Absolutely NO text, NO letters, NO watermarks, NO logos, NO people.")
    else:
        prompt = (f"Wide premium banner photograph for the beauty-salon category '{category}'. "
                  "Elegant luxury salon scene, soft warm lighting, rose-gold and cream tones, marble textures, "
                  "photorealistic editorial quality. Absolutely NO text, NO letters, NO watermarks, NO logos.")
    imgs = await asyncio.wait_for(
        gen.generate_images(prompt=prompt, model="gpt-image-1", number_of_images=1), timeout=240)
    if not imgs:
        raise RuntimeError("empty generation")
    return imgs[0]


async def _run_banner_job(jid: str, tenant_id: str, category: str):
    try:
        resto = await _tenant_is_restaurant(tenant_id)
        img = await _generate_category_banner_bytes(category, resto)
        url = await _store_service_image(tenant_id, img, f"banner-{category[:24]}")
        await _raw_db.mira_image_jobs.update_one({"id": jid}, {"$set": {"status": "done", "image_url": url}})
    except Exception as e:
        logging.error(f"mira banner job {jid} failed: {e}")
        await _raw_db.mira_image_jobs.update_one(
            {"id": jid}, {"$set": {"status": "failed", "error": str(e)[:200]}})


class BannerPreviewIn(BaseModel):
    category: str = Field(..., min_length=1, max_length=60)


@router.post("/services/generate-banner-preview")
async def generate_category_banner(body: BannerPreviewIn, user=Depends(require_admin)):
    """Mira paints a category banner in the background — poll /services/image-jobs/{id}."""
    tenant_id = _current_tenant_id.get()
    jid = await _new_image_job(tenant_id)
    asyncio.get_event_loop().create_task(_run_banner_job(jid, tenant_id, body.category.strip()))
    return {"ok": True, "job_id": jid}


@router.post("/services/generate-all-banners")
async def generate_all_category_banners(category: str | None = None, user=Depends(require_admin)):
    """Mira paints a banner for every category that has none — or just the one category picked."""
    cats_raw = await db.services.find({}, {"_id": 0, "category": 1}).to_list(500)
    cats = sorted({(c.get("category") or "").strip() for c in cats_raw} - {""})
    existing = await db.service_categories.find({}, {"_id": 0}).to_list(200)
    have = {c["name"] for c in existing if (c.get("image_url") or "").strip()}
    if category and category.strip():
        cats = [c for c in cats if c == category.strip()]
        have = set()  # explicit pick → repaint even if a banner exists
    todo = [c for c in cats if c not in have][:40]
    if not todo:
        return {"queued": 0}
    tenant_id = _current_tenant_id.get()
    if await _batch_running(tenant_id):
        raise HTTPException(409, "Mira is already painting a batch — check the progress chip")
    batch_id = uuid.uuid4().hex[:8]
    await _raw_db.mira_image_batches.insert_one({
        "id": batch_id, "tenant_id": tenant_id, "kind": "banners", "total": len(todo), "done": 0,
        "failed": 0, "status": "running", "created_at": datetime.now(timezone.utc).isoformat()})

    async def _runner():
        resto = await _tenant_is_restaurant(tenant_id)
        sem = asyncio.Semaphore(8)

        async def _one(cat):
            async with sem:
                try:
                    img = await _generate_category_banner_bytes(cat, resto)
                    url = await _store_service_image(tenant_id, img, f"banner-{cat[:24]}")
                    await _raw_db.service_categories.update_one(
                        {"tenant_id": tenant_id, "name": cat},
                        {"$set": {"tenant_id": tenant_id, "name": cat, "image_url": url}}, upsert=True)
                    await _batch_tick(batch_id, {"done": 1})
                except Exception as e:
                    logging.error(f"mira banner batch failed for {cat}: {e}")
                    await _batch_tick(batch_id, {"failed": 1}, {"last_error": str(e)[:160]})

        await asyncio.gather(*(_one(c) for c in todo))
        await _raw_db.mira_image_batches.update_one({"id": batch_id}, {"$set": {"status": "done"}})

    asyncio.get_event_loop().create_task(_runner())
    return {"queued": len(todo), "batch_id": batch_id}


@router.get("/services/image-jobs/{jid}")
async def image_job_status(jid: str, user=Depends(require_admin)):
    job = await _raw_db.mira_image_jobs.find_one(
        {"id": jid, "tenant_id": _current_tenant_id.get()}, {"_id": 0})
    if not job:
        raise HTTPException(404, "Job not found")
    return {"status": job["status"], "image_url": job.get("image_url") or "", "error": job.get("error") or ""}


class CategoryRenameIn(BaseModel):
    old: str = Field(..., min_length=1, max_length=60)
    new: str = Field(..., min_length=1, max_length=60)


@router.post("/service-categories/rename")
async def rename_service_category(body: CategoryRenameIn, user=Depends(require_admin)):
    """Rename a category everywhere — all its services and the banner move with it."""
    old, new = body.old.strip(), body.new.strip()
    if not new or old == new:
        raise HTTPException(400, "Enter a different category name")
    r = await db.services.update_many({"category": old}, {"$set": {"category": new}})
    await db.service_categories.update_many({"name": old}, {"$set": {"name": new}})
    return {"ok": True, "services_moved": r.modified_count}


def _circle_logo_pil(logo_bytes: bytes, size: int = 420):
    """Circular-crop a logo with a gold ring; returns RGBA PIL image or None."""
    try:
        from PIL import Image as _PILImage, ImageDraw as _PILDraw, ImageOps as _PILOps
        im = _PILImage.open(io.BytesIO(logo_bytes)).convert("RGBA")
        side = min(im.size)
        im = _PILOps.fit(im, (side, side), centering=(0.5, 0.5)).resize((size, size))
        mask = _PILImage.new("L", (size, size), 0)
        _PILDraw.Draw(mask).ellipse([size * 0.014, size * 0.014, size * 0.986, size * 0.986], fill=255)
        circ = _PILImage.new("RGBA", (size, size), (0, 0, 0, 0))
        circ.paste(im, (0, 0), mask)
        _PILDraw.Draw(circ).ellipse([size * 0.007, size * 0.007, size * 0.993, size * 0.993],
                                    outline=(184, 140, 64, 255), width=max(4, size // 60))
        return circ
    except Exception:
        return None


def _render_table_posters(t: dict, tables: int, base: str, logo_bytes: bytes | None, only_table: int = 0) -> bytes:
    """A4 table-tent poster per table: logo, restaurant name, TABLE N, order QR."""
    import qrcode
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas as _canvas

    GOLD = (0.72, 0.55, 0.25)
    INK = (0.078, 0.071, 0.063)
    buf = io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    name = t.get("name") or "Our Restaurant"
    slug = t.get("slug") or ""
    bg_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "posters", "table_qr_bg.jpg")
    bg_img = ImageReader(bg_path) if os.path.exists(bg_path) else None
    logo_img = None
    if logo_bytes:
        circ = _circle_logo_pil(logo_bytes, 420)
        if circ is not None:
            lb = io.BytesIO()
            circ.save(lb, format="PNG")
            lb.seek(0)
            logo_img = ImageReader(lb)
        else:
            try:
                logo_img = ImageReader(io.BytesIO(logo_bytes))
            except Exception:
                logo_img = None
    for n in ([only_table] if only_table else range(1, tables + 1)):
        c.setFillColorRGB(*INK)
        c.rect(0, 0, w, h, fill=1, stroke=0)
        if bg_img:
            bw_, bh_ = bg_img.getSize()
            scale = max(w / bw_, h / bh_)
            c.drawImage(bg_img, (w - bw_ * scale) / 2, (h - bh_ * scale) / 2, bw_ * scale, bh_ * scale)
        else:
            c.setStrokeColorRGB(*GOLD)
            c.setLineWidth(1.2)
            c.rect(24, 24, w - 48, h - 48, fill=0, stroke=1)
        y = h - 92
        if logo_img:
            ls = 96
            c.drawImage(logo_img, (w - ls) / 2, y - ls, ls, ls, preserveAspectRatio=True, mask="auto")
            y -= ls + 34
        c.setFillColorRGB(*GOLD)
        c.setFont("Helvetica-Bold", 26)
        c.drawCentredString(w / 2, y, name)
        y -= 26
        c.setFillColorRGB(0.85, 0.85, 0.88)
        c.setFont("Helvetica", 12)
        c.drawCentredString(w / 2, y, "Scan · Browse the menu · Order to your table")
        y -= 78
        c.setFillColorRGB(*GOLD)
        c.setFont("Helvetica-Bold", 64)
        c.drawCentredString(w / 2, y, f"TABLE {n}")
        qr_img = qrcode.make(f"{base}/order/{slug}?table={n}", box_size=10, border=2)
        qb = io.BytesIO()
        qr_img.save(qb, format="PNG")
        qb.seek(0)
        qs = 300
        c.setFillColorRGB(1, 1, 1)
        c.roundRect((w - qs - 28) / 2, y - qs - 90, qs + 28, qs + 28, 16, fill=1, stroke=0)
        c.drawImage(ImageReader(qb), (w - qs) / 2, y - qs - 76, qs, qs)
        c.setFillColorRGB(0.85, 0.85, 0.88)
        c.setFont("Helvetica-Bold", 14)
        c.drawCentredString(w / 2, y - qs - 130, "📱  Point your camera at the QR")
        c.setFont("Helvetica", 10)
        c.setFillColorRGB(0.55, 0.53, 0.5)
        c.drawCentredString(w / 2, y - qs - 150, f"{base.replace('https://', '')}/order/{slug}")
        c.setFillColorRGB(*GOLD)
        c.setFont("Helvetica", 9)
        c.drawCentredString(w / 2, 40, "Powered by Miracurl Suite ✦")
        c.showPage()
    c.save()
    return buf.getvalue()


async def _tenant_logo_bytes(t: dict, base: str) -> bytes | None:
    logo_bytes = None
    logo_url = t.get("logo_url") or ""
    if logo_url.startswith("/api/files/"):
        fid = logo_url.rsplit("/", 1)[-1].split("?")[0]
        up = await _raw_db.uploads.find_one({"id": fid, "is_deleted": {"$ne": True}})
        if up and up.get("storage_path"):
            try:
                logo_bytes, _ct = await asyncio.to_thread(_get_object, up["storage_path"])
            except Exception:
                logo_bytes = None
    if logo_bytes is None and logo_url:
        try:
            full = logo_url if logo_url.startswith("http") else base + logo_url
            r = await asyncio.to_thread(requests.get, full, timeout=8)
            if r.status_code == 200:
                logo_bytes = r.content
        except Exception:
            pass
    return logo_bytes


def _render_table_card_png(t: dict, table: int, base: str, logo_bytes: bytes | None) -> bytes:
    """Polished on-screen table QR card (JPEG) — same design language as the printable poster."""
    import qrcode
    from PIL import Image, ImageDraw, ImageFont
    W, H = 720, 1080
    assets_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets")
    bg_path = os.path.join(assets_dir, "posters", "table_qr_bg.jpg")
    if os.path.exists(bg_path):
        bg = Image.open(bg_path).convert("RGB")
        scale = max(W / bg.width, H / bg.height)
        bg = bg.resize((round(bg.width * scale), round(bg.height * scale)))
        lx, ty = (bg.width - W) // 2, (bg.height - H) // 2
        bg = bg.crop((lx, ty, lx + W, ty + H))
    else:
        bg = Image.new("RGB", (W, H), (18, 16, 13))
    d = ImageDraw.Draw(bg)
    GOLD = (206, 165, 94)
    LIGHT = (232, 224, 210)

    def _font(name, size):
        try:
            return ImageFont.truetype(os.path.join(assets_dir, "fonts", name), size)
        except Exception:
            return ImageFont.load_default()

    def center(text, y, f, fill):
        d.text(((W - d.textlength(text, font=f)) / 2, y), text, font=f, fill=fill)

    y = 58
    if logo_bytes:
        circ = _circle_logo_pil(logo_bytes, 190)
        if circ is not None:
            bg.paste(circ, ((W - 190) // 2, y), circ)
            y += 204
    name = t.get("name") or "Our Restaurant"
    size = 52
    f = _font("PlayfairDisplay-Bold.ttf", size)
    while d.textlength(name, font=f) > W - 140 and size > 26:
        size -= 3
        f = _font("PlayfairDisplay-Bold.ttf", size)
    center(name, y, f, GOLD)
    y += size + 18
    center("Scan · Browse the menu · Order to your table", y, _font("FreeSansBold.ttf", 22), LIGHT)
    y += 54
    center(f"TABLE {table}", y, _font("FreeSansBold.ttf", 90), GOLD)
    y += 120
    qr = qrcode.make(f"{base}/order/{t.get('slug') or ''}?table={table}", box_size=10, border=1).convert("RGB")
    qs = 380
    qr = qr.resize((qs, qs))
    pad = 20
    box = Image.new("RGB", (qs + pad * 2, qs + pad * 2), (255, 255, 255))
    box.paste(qr, (pad, pad))
    m = Image.new("L", box.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, box.width - 1, box.height - 1], radius=28, fill=255)
    bg.paste(box, ((W - box.width) // 2, y), m)
    y += box.height + 30
    center("Point your camera at the QR", y, _font("FreeSansBold.ttf", 24), (255, 255, 255))
    y += 38
    center(f"{base.replace('https://', '')}/order/{t.get('slug') or ''}", y, _font("FreeSansBold.ttf", 18), (160, 148, 128))
    out = io.BytesIO()
    bg.save(out, format="JPEG", quality=82)
    return out.getvalue()


@router.get("/settings/table-qr-card.png")
async def table_qr_card(table: int = 1, origin: str = "", user=Depends(require_admin)):
    """Polished single-table QR card image for the Kitchen screen grid."""
    tenant_id = _current_tenant_id.get()
    t = await _raw_db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if (t.get("business_type") or "salon") != "restaurant":
        raise HTTPException(400, "Table QR cards are only available for restaurants")
    table = max(1, min(int(table), 60))
    base = (origin or os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")).rstrip("/")
    logo_bytes = await _tenant_logo_bytes(t, base)
    img = await asyncio.to_thread(_render_table_card_png, t, table, base, logo_bytes)
    return Response(content=img, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=300"})


def _vc_flower(layer, cx, cy, R, color):
    """Faint 12-petal flower watermark on an RGBA layer."""
    from PIL import Image, ImageDraw
    petal = Image.new("RGBA", (R * 2, R * 2), (0, 0, 0, 0))
    pd = ImageDraw.Draw(petal)
    pd.ellipse([R - R * 0.17, R * 0.04, R + R * 0.17, R], fill=color)
    for ang in range(0, 360, 30):
        rp = petal.rotate(ang, resample=Image.BICUBIC, center=(R, R))
        layer.alpha_composite(rp, (int(cx - R), int(cy - R)))


def _vc_icon(kind, size, acc):
    """Tiny supersampled contact icon: accent circle + white glyph."""
    from PIL import Image, ImageDraw
    S = size * 4
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    dd = ImageDraw.Draw(im)
    dd.ellipse([0, 0, S - 1, S - 1], fill=acc)
    w = max(6, S // 14)
    WHT = (255, 255, 255, 255)
    if kind == "phone":
        dd.arc([S * 0.24, S * 0.24, S * 0.76, S * 0.76], 115, 335, fill=WHT, width=w)
        dd.ellipse([S * 0.20, S * 0.42, S * 0.34, S * 0.56], fill=WHT)
        dd.ellipse([S * 0.52, S * 0.68, S * 0.66, S * 0.82], fill=WHT)
    elif kind == "pin":
        dd.ellipse([S * 0.30, S * 0.18, S * 0.70, S * 0.58], fill=WHT)
        dd.polygon([(S * 0.33, S * 0.48), (S * 0.67, S * 0.48), (S * 0.50, S * 0.84)], fill=WHT)
        dd.ellipse([S * 0.42, S * 0.30, S * 0.58, S * 0.46], fill=acc)
    elif kind == "insta":
        dd.rounded_rectangle([S * 0.22, S * 0.22, S * 0.78, S * 0.78], radius=int(S * 0.16), outline=WHT, width=w)
        dd.ellipse([S * 0.36, S * 0.36, S * 0.64, S * 0.64], outline=WHT, width=w)
        dd.ellipse([S * 0.63, S * 0.27, S * 0.71, S * 0.35], fill=WHT)
    elif kind == "mail":
        dd.rectangle([S * 0.20, S * 0.30, S * 0.80, S * 0.70], outline=WHT, width=w)
        dd.line([S * 0.20, S * 0.31, S * 0.50, S * 0.54], fill=WHT, width=w)
        dd.line([S * 0.80, S * 0.31, S * 0.50, S * 0.54], fill=WHT, width=w)
    else:  # globe
        dd.ellipse([S * 0.20, S * 0.20, S * 0.80, S * 0.80], outline=WHT, width=w)
        dd.ellipse([S * 0.38, S * 0.20, S * 0.62, S * 0.80], outline=WHT, width=w)
        dd.line([S * 0.20, S * 0.50, S * 0.80, S * 0.50], fill=WHT, width=w)
    return im.resize((size, size), Image.LANCZOS)


def _render_visiting_card(t: dict, base: str, logo_bytes: bytes | None, side: str = "front", highlights: list | None = None) -> bytes:
    """Print-ready 3.5x2in designer visiting card (JPEG @300dpi) — cream base with curvy accent swoosh."""
    import qrcode
    from PIL import Image, ImageDraw, ImageFont
    W, H = 1050, 600
    assets_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets")
    resto = t.get("business_type") == "restaurant"
    if resto:
        ACC, ACCD, SOFT, INK = (186, 70, 26), (126, 44, 14), (243, 210, 190), (52, 42, 38)
        CREAM = (253, 249, 243)
    else:
        ACC, ACCD, SOFT, INK = (206, 32, 115), (146, 16, 80), (248, 208, 227), (54, 42, 50)
        CREAM = (253, 248, 246)
    bg = Image.new("RGB", (W, H), CREAM)

    def _font(name, size):
        try:
            return ImageFont.truetype(os.path.join(assets_dir, "fonts", name), size)
        except Exception:
            return ImageFont.load_default()

    # ---- curvy swoosh shapes on a 2x supersampled layer ----
    S = Image.new("RGBA", (W * 2, H * 2), (0, 0, 0, 0))
    sd = ImageDraw.Draw(S)
    if side == "front":
        _vc_flower(S, 620, 260, 480, ACC + (16,))
        # top ribbon: accent band curving across, thicker on the left
        sd.ellipse([-900, -1520, 2960, 470], fill=ACC + (255,))
        sd.ellipse([-960, -1660, 3040, 330], fill=CREAM + (255,))
        sd.ellipse([-900, -1490, 2960, 560], outline=SOFT + (255,), width=10)
        # solid top-left corner blob above the ribbon
        sd.ellipse([-560, -760, 760, 240], fill=ACCD + (255,))
        # bottom-right wave
        sd.ellipse([1480, 1010, 3400, 2600], fill=ACC + (255,))
        sd.ellipse([1400, 940, 3320, 2530], outline=SOFT + (255,), width=10)
    else:
        _vc_flower(S, 330, 640, 460, ACC + (14,))
        # right-side vertical band with curved edge
        sd.ellipse([1560, -560, 3560, 1780], fill=ACC + (255,))
        sd.ellipse([1470, -640, 3470, 1860], outline=SOFT + (255,), width=10)
        # small top-left corner wave
        sd.ellipse([-760, -820, 560, 250], fill=ACCD + (255,))
        sd.ellipse([-700, -760, 640, 330], outline=SOFT + (255,), width=10)
    bg.paste(Image.alpha_composite(Image.new("RGBA", S.size, CREAM + (255,)), S)
             .convert("RGB").resize((W, H), Image.LANCZOS), (0, 0))
    d = ImageDraw.Draw(bg)
    kind = "order" if resto else "book"
    url_txt = f"{base.replace('https://', '')}/{kind}/{t.get('slug') or ''}"
    name = t.get("name") or ("Our Restaurant" if resto else "Our Salon")
    vc = t.get("visiting_card") or {}
    phone = (vc.get("phone") or t.get("phone") or "").strip()
    email = (vc.get("email") or "").strip()
    loc = (vc.get("location") or t.get("location") or "").strip()
    insta = (vc.get("instagram") or "").strip().lstrip("@")
    if not insta and (t.get("instagram_url") or "").strip():
        insta = t["instagram_url"].rstrip("/").split("/")[-1]

    def _logo_circle(size):
        if logo_bytes:
            circ = _circle_logo_pil(logo_bytes, size)
            if circ is not None:
                ring = Image.new("RGBA", (size + 28, size + 28), (0, 0, 0, 0))
                rd = ImageDraw.Draw(ring)
                rd.ellipse([0, 0, size + 27, size + 27], fill=(255, 255, 255, 255))
                rd.ellipse([4, 4, size + 23, size + 23], outline=ACC + (255,), width=5)
                ring.paste(circ, (14, 14), circ)
                rd.ellipse([13, 13, size + 14, size + 14], outline=(255, 255, 255, 255), width=max(5, size // 55))
                return ring
        size += 28
        ring = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        rd = ImageDraw.Draw(ring)
        rd.ellipse([0, 0, size - 1, size - 1], fill=(255, 255, 255, 255))
        rd.ellipse([5, 5, size - 6, size - 6], outline=ACC + (255,), width=6)
        lf = _font("PlayfairDisplay-Bold.ttf", int(size * 0.42))
        ini = (name.strip()[:1] or "M").upper()
        rd.text(((size - rd.textlength(ini, font=lf)) / 2, size * 0.26), ini, font=lf, fill=ACC + (255,))
        return ring

    if side == "back":
        # big logo circle riding the right band
        lc = _logo_circle(216)
        bg.paste(lc, (W - 175 - lc.width // 2, 116), lc)
        nf, ns = _font("PlayfairDisplay-Bold.ttf", 26), 26
        while d.textlength(name, font=nf) > 190 and ns > 13:
            ns -= 2
            nf = _font("PlayfairDisplay-Bold.ttf", ns)
        d.text((W - 158 - d.textlength(name, font=nf) / 2, 116 + lc.height + 16), name, font=nf, fill=(255, 255, 255))
        # header
        hdr = "ORDER & RESERVE" if resto else "BOOK YOUR SLOT"
        hx, hy = 84, 64
        hf = _font("PlayfairDisplay-Bold.ttf", 46)
        d.text((hx, hy), hdr, font=hf, fill=ACC)
        d.text((hx + d.textlength(hdr, font=hf) + 8, hy + 8), "...", font=hf, fill=SOFT)
        d.line([hx + 2, hy + 62, hx + 172, hy + 62], fill=ACC, width=4)
        # big scan-to-book QR
        qr = qrcode.make(f"{base}/{kind}/{t.get('slug') or ''}", box_size=8, border=1).convert("RGB").resize((210, 210))
        pad = 15
        box = Image.new("RGB", (210 + pad * 2, 210 + pad * 2), (255, 255, 255))
        box.paste(qr, (pad, pad))
        m = Image.new("L", box.size, 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, box.width - 1, box.height - 1], radius=22, fill=255)
        qx, qy = hx, 178
        fr = Image.new("RGBA", bg.size, (0, 0, 0, 0))
        ImageDraw.Draw(fr).rounded_rectangle([qx - 5, qy - 5, qx + box.width + 5, qy + box.height + 5],
                                             radius=24, outline=ACC + (255,), width=3)
        bg.paste(fr, (0, 0), fr)
        bg.paste(box, (qx, qy), m)
        cap = "SCAN TO ORDER YOUR TABLE" if resto else "SCAN TO BOOK YOUR SLOT"
        cf = _font("FreeSansBold.ttf", 20)
        cw = d.textlength(cap, font=cf)
        d.text((qx + (box.width - cw) / 2 if cw <= box.width else qx, qy + box.height + 18), cap, font=cf, fill=ACCD)
        # contact rows beside the QR
        rows = []
        if phone:
            rows.append(("phone", phone[:30]))
        if email:
            rows.append(("mail", email[:34]))
        if insta:
            rows.append(("insta", f"@{insta}"[:32]))
        if loc:
            rows.append(("pin", loc[:34]))
        rf = _font("FreeSansBold.ttf", 24)
        ry = 190 if len(rows) >= 4 else 214
        for kind_i, txt in rows:
            ic = _vc_icon(kind_i, 40, ACC + (255,))
            bg.paste(ic, (qx + box.width + 56, ry), ic)
            d.text((qx + box.width + 112, ry + 7), txt, font=rf, fill=INK)
            ry += 58
        d.text((hx, H - 56), url_txt[:60], font=_font("FreeSansBold.ttf", 20), fill=(150, 130, 140))
        out = io.BytesIO()
        bg.save(out, format="JPEG", quality=92, dpi=(300, 300))
        return out.getvalue()

    # ---- front ----
    lc = _logo_circle(196)
    bg.paste(lc, (66, 52), lc)
    tx = 66 + lc.width + 44
    ns = 46
    nf = _font("PlayfairDisplay-Bold.ttf", ns)
    while d.textlength(name, font=nf) > W - tx - 210 and ns > 22:
        ns -= 2
        nf = _font("PlayfairDisplay-Bold.ttf", ns)
    nw = d.textlength(name, font=nf)
    # name pill
    px0, py0 = tx, 92
    d.rounded_rectangle([px0, py0, px0 + nw + 56, py0 + ns + 30], radius=(ns + 30) // 2,
                        fill=(255, 255, 255), outline=ACC, width=3)
    d.text((px0 + 28, py0 + 13), name, font=nf, fill=INK)
    tagline = (vc.get("tagline") or "").strip() or ("Great Food · Good Vibes" if resto else "Beauty & Care Experts")
    d.text((px0 + 30, py0 + ns + 46), tagline, font=_font("GreatVibes-Regular.ttf", 46), fill=(255, 255, 255))
    # contact rows
    rows = []
    if phone:
        rows.append(("phone", phone[:30]))
    if loc:
        rows.append(("pin", loc[:38]))
    if insta:
        rows.append(("insta", f"@{insta}"[:34]))
    rows.append(("globe", url_txt[:46]))
    y = 348 - len(rows) * 9
    rf = _font("FreeSansBold.ttf", 25)
    for kind_i, txt in rows:
        ic = _vc_icon(kind_i, 40, ACC + (255,))
        bg.paste(ic, (88, y), ic)
        d.text((146, y + 6), txt, font=rf, fill=INK)
        y += 60
    # QR bottom-right on white rounded box
    qr = qrcode.make(f"{base}/{kind}/{t.get('slug') or ''}", box_size=8, border=1).convert("RGB").resize((160, 160))
    pad = 13
    box = Image.new("RGB", (160 + pad * 2, 160 + pad * 2), (255, 255, 255))
    box.paste(qr, (pad, pad))
    m = Image.new("L", box.size, 0)
    mdd = ImageDraw.Draw(m)
    mdd.rounded_rectangle([0, 0, box.width - 1, box.height - 1], radius=20, fill=255)
    qx, qy = W - box.width - 70, 300
    sh = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([qx - 4, qy - 4, qx + box.width + 4, qy + box.height + 4],
                                         radius=22, outline=ACC + (255,), width=3)
    bg.paste(sh, (0, 0), sh)
    bg.paste(box, (qx, qy), m)
    cap = "SCAN TO ORDER" if resto else "SCAN TO BOOK"
    cf = _font("FreeSansBold.ttf", 19)
    d.text((qx + (box.width - d.textlength(cap, font=cf)) / 2, qy + box.height + 14), cap, font=cf, fill=ACCD)
    out = io.BytesIO()
    bg.save(out, format="JPEG", quality=92, dpi=(300, 300))
    return out.getvalue()


class VisitingCardDetails(BaseModel):
    tagline: str = Field("", max_length=60)
    phone: str = Field("", max_length=30)
    email: str = Field("", max_length=60)
    instagram: str = Field("", max_length=40)
    location: str = Field("", max_length=60)


@router.get("/settings/visiting-card-details")
async def get_visiting_card_details(user=Depends(require_admin)):
    t = await _raw_db.tenants.find_one({"id": _current_tenant_id.get()}, {"_id": 0})
    vc = t.get("visiting_card") or {}
    insta = (vc.get("instagram") or "").strip()
    if not insta and (t.get("instagram_url") or "").strip():
        insta = t["instagram_url"].rstrip("/").split("/")[-1]
    return {
        "tagline": vc.get("tagline") or "",
        "phone": vc.get("phone") or t.get("phone") or "",
        "email": vc.get("email") or "",
        "instagram": insta.lstrip("@"),
        "location": vc.get("location") or t.get("location") or "",
    }


@router.put("/settings/visiting-card-details")
async def save_visiting_card_details(body: VisitingCardDetails, user=Depends(require_admin)):
    await _raw_db.tenants.update_one(
        {"id": _current_tenant_id.get()},
        {"$set": {"visiting_card": {k: v.strip() for k, v in body.dict().items()}}})
    return {"ok": True}


@router.get("/settings/visiting-card.png")
async def visiting_card(origin: str = "", side: str = "front", user=Depends(require_admin)):
    tenant_id = _current_tenant_id.get()
    t = await _raw_db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    base = (origin or os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")).rstrip("/")
    logo_bytes = await _tenant_logo_bytes(t, base)
    side = "back" if side == "back" else "front"
    img = await asyncio.to_thread(_render_visiting_card, t, base, logo_bytes, side)
    return Response(content=img, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=60"})


@router.get("/settings/table-qr-posters.pdf")
async def table_qr_posters(tables: int = 8, table: int = 0, origin: str = "", user=Depends(require_admin)):
    """Printable table-tent posters (logo + table number + order QR). `table` > 0 → single-table PDF."""
    tenant_id = _current_tenant_id.get()
    t = await _raw_db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if (t.get("business_type") or "salon") != "restaurant":
        raise HTTPException(400, "Table QR posters are only available for restaurants")
    tables = max(1, min(int(tables), 60))
    table = max(0, min(int(table), 60))
    if not table:
        await _raw_db.tenants.update_one({"id": tenant_id}, {"$set": {"table_count": tables}})
    base = (origin or os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")).rstrip("/")
    logo_bytes = await _tenant_logo_bytes(t, base)
    pdf = await asyncio.to_thread(_render_table_posters, t, tables, base, logo_bytes, table)
    fname = f"table-{table}-qr.pdf" if table else f'table-qr-posters-{t.get("slug") or "tables"}.pdf'
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{fname}"'})
