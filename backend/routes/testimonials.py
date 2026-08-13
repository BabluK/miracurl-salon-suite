"""Website testimonials: real onboarded partners' comments shown on the public landing page. Super admin editable."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import _raw_db
from security import require_super_admin

router = APIRouter()

_SEED = [
    {"salon_name": "Miracurl Unisex Family Salon", "owner_name": "Owner — Miracurl", "city": "Bengaluru",
     "quote": "Bookings doubled in a month. Mira answers my clients at midnight while I sleep.", "photo_url": ""},
    {"salon_name": "Elegance Beauty Lounge", "owner_name": "Owner — Elegance", "city": "Bengaluru",
     "quote": "GST bills, staff salaries, inventory — I closed three other apps and my notebook.", "photo_url": ""},
]


async def _ensure_seed():
    if await _raw_db.partner_testimonials.count_documents({}) == 0:
        now = datetime.now(timezone.utc).isoformat()
        await _raw_db.partner_testimonials.insert_many([
            {"id": str(uuid.uuid4()), "order": i, "visible": True, **s, "created_at": now}
            for i, s in enumerate(_SEED)
        ])


@router.get("/public/testimonials")
async def public_testimonials():
    await _ensure_seed()
    rows = await _raw_db.partner_testimonials.find(
        {"visible": True}, {"_id": 0, "id": 1, "salon_name": 1, "owner_name": 1, "city": 1, "quote": 1, "photo_url": 1}
    ).sort("order", 1).to_list(20)
    return {"testimonials": rows}


class TestimonialIn(BaseModel):
    salon_name: str = Field(..., min_length=2, max_length=100)
    owner_name: str = Field(..., min_length=2, max_length=80)
    city: str = Field("", max_length=60)
    quote: str = Field(..., min_length=5, max_length=400)
    photo_url: str = Field("", max_length=500)
    visible: bool = True


@router.get("/super/testimonials")
async def list_testimonials(admin=Depends(require_super_admin)):
    await _ensure_seed()
    return {"testimonials": await _raw_db.partner_testimonials.find({}, {"_id": 0}).sort("order", 1).to_list(20)}


@router.post("/super/testimonials")
async def add_testimonial(body: TestimonialIn, admin=Depends(require_super_admin)):
    count = await _raw_db.partner_testimonials.count_documents({})
    doc = {"id": str(uuid.uuid4()), "order": count, **body.model_dump(),
           "created_at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.partner_testimonials.insert_one({**doc})
    return doc


@router.put("/super/testimonials/{tid}")
async def update_testimonial(tid: str, body: TestimonialIn, admin=Depends(require_super_admin)):
    res = await _raw_db.partner_testimonials.update_one({"id": tid}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Testimonial not found")
    return {"ok": True}


@router.delete("/super/testimonials/{tid}")
async def delete_testimonial(tid: str, admin=Depends(require_super_admin)):
    res = await _raw_db.partner_testimonials.delete_one({"id": tid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Testimonial not found")
    return {"ok": True}


_stats_cache = {"at": 0.0, "data": None}


@router.get("/public/platform-stats")
async def public_platform_stats():
    """Real platform numbers for the landing-page trust strip (cached 10 min)."""
    import time
    if _stats_cache["data"] and time.time() - _stats_cache["at"] < 600:
        return _stats_cache["data"]
    salons = await _raw_db.tenants.count_documents({"status": {"$in": ["trial", "active"]}})
    cities = len([c for c in await _raw_db.tenants.distinct("city") if c])
    bookings = await _raw_db.appointments.count_documents({})
    invoices = await _raw_db.invoices.count_documents({})
    data = {"salons": salons, "cities": max(cities, 1), "bookings": bookings, "invoices": invoices}
    _stats_cache.update(at=time.time(), data=data)
    return data
