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
                  "Elegant premium salon setting, close-up of the treatment being performed, soft warm lighting, "
                  "rose-gold and cream tones, photorealistic, shallow depth of field. "
                  "Absolutely NO text, NO letters, NO watermarks, NO logos.")
    imgs = await asyncio.wait_for(
        gen.generate_images(prompt=prompt, model="gpt-image-1", number_of_images=1), timeout=240)
    if not imgs:
        raise RuntimeError("empty generation")
    return imgs[0]


async def _store_service_image(tenant_id: str, img_bytes: bytes, name: str) -> str:
    file_id = str(uuid.uuid4())
    path = f"{APP_NAME}/tenants/{tenant_id}/service/{file_id}.png"
    result = await asyncio.to_thread(_put_object, path, img_bytes, "image/png")
    await _raw_db.uploads.insert_one({
        "id": file_id, "tenant_id": tenant_id, "kind": "service",
        "storage_path": result.get("path", path), "original_filename": f"mira-{name[:30]}.png",
        "content_type": "image/png", "size": len(img_bytes), "uploaded_by": "mira-ai",
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


@router.post("/services/generate-missing-images")
async def generate_missing_service_images(user=Depends(require_admin)):
    """Mira paints a photo for EVERY service/dish without one — full batch, background."""
    svcs = await db.services.find(
        {"$or": [{"image_url": ""}, {"image_url": None}]}, {"_id": 0}).to_list(200)
    todo = svcs[:60]
    if not todo:
        return {"queued": 0, "remaining": 0}
    tenant_id = _current_tenant_id.get()
    if await _raw_db.mira_image_batches.find_one({"tenant_id": tenant_id, "status": "running"}):
        raise HTTPException(409, "Mira is already painting a batch — check the progress chip")
    batch_id = uuid.uuid4().hex[:8]
    await _raw_db.mira_image_batches.insert_one({
        "id": batch_id, "tenant_id": tenant_id, "total": len(todo), "done": 0, "failed": 0,
        "status": "running", "created_at": datetime.now(timezone.utc).isoformat()})

    async def _runner():
        resto = await _tenant_is_restaurant(tenant_id)
        for s in todo:
            try:
                img = await _generate_service_image_bytes(s["name"], s.get("category") or "Beauty", restaurant=resto)
                url = await _store_service_image(tenant_id, img, s["name"])
                await _raw_db.services.update_one(
                    {"id": s["id"], "tenant_id": tenant_id}, {"$set": {"image_url": url}})
                await _raw_db.mira_image_batches.update_one({"id": batch_id}, {"$inc": {"done": 1}})
            except Exception as e:
                logging.error(f"mira service image failed for {s.get('name')}: {e}")
                await _raw_db.mira_image_batches.update_one({"id": batch_id}, {"$inc": {"failed": 1}})
            await asyncio.sleep(1)
        await _raw_db.mira_image_batches.update_one({"id": batch_id}, {"$set": {"status": "done"}})

    asyncio.get_event_loop().create_task(_runner())
    return {"queued": len(todo), "remaining": max(0, len(svcs) - len(todo)), "batch_id": batch_id}


@router.get("/services/image-batch-status")
async def image_batch_status(user=Depends(require_admin)):
    tenant_id = _current_tenant_id.get()
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
        await _raw_db.mira_image_jobs.update_one(
            {"id": jid}, {"$set": {"status": "failed", "error": str(e)[:200]}})


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


def _render_table_posters(t: dict, tables: int, base: str, logo_bytes: bytes | None) -> bytes:
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
    logo_img = None
    if logo_bytes:
        try:
            logo_img = ImageReader(io.BytesIO(logo_bytes))
        except Exception:
            logo_img = None
    for n in range(1, tables + 1):
        c.setFillColorRGB(*INK)
        c.rect(0, 0, w, h, fill=1, stroke=0)
        c.setStrokeColorRGB(*GOLD)
        c.setLineWidth(1.2)
        c.rect(24, 24, w - 48, h - 48, fill=0, stroke=1)
        y = h - 78
        if logo_img:
            lw, lh = 150, 84
            c.setFillColorRGB(1, 1, 1)
            c.roundRect((w - lw - 16) / 2, y - lh, lw + 16, lh + 12, 10, fill=1, stroke=0)
            c.drawImage(logo_img, (w - lw) / 2, y - lh + 6, lw, lh, preserveAspectRatio=True, mask="auto")
            y -= lh + 40
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


@router.get("/settings/table-qr-posters.pdf")
async def table_qr_posters(tables: int = 8, origin: str = "", user=Depends(require_admin)):
    """Printable table-tent posters (logo + table number + order QR), one A4 page per table."""
    tenant_id = _current_tenant_id.get()
    t = await _raw_db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if (t.get("business_type") or "salon") != "restaurant":
        raise HTTPException(400, "Table QR posters are only available for restaurants")
    tables = max(1, min(int(tables), 60))
    await _raw_db.tenants.update_one({"id": tenant_id}, {"$set": {"table_count": tables}})
    base = (origin or os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")).rstrip("/")
    logo_bytes = None
    logo_url = t.get("logo_url") or ""
    if logo_url:
        try:
            full = logo_url if logo_url.startswith("http") else base + logo_url
            r = await asyncio.to_thread(requests.get, full, timeout=8)
            if r.status_code == 200:
                logo_bytes = r.content
        except Exception:
            pass
    pdf = await asyncio.to_thread(_render_table_posters, t, tables, base, logo_bytes)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="table-qr-posters-{t.get("slug") or "tables"}.pdf"'})
