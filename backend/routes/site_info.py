"""Public website (landing page) info — contact, social links & CEO profile.
Editable by the Super Admin, rendered on the public landing page."""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from database import _raw_db
from security import require_super_admin

router = APIRouter()

_DEFAULTS = {
    "contact_email": "admin@miracurl-suite.com",
    "instagram": "",
    "facebook": "",
    "youtube": "",
    "whatsapp": "",
    "ceo_name": "Founder & CEO",
    "ceo_title": "Founder & CEO, Miracurl Suite",
    "ceo_about": ("10+ years of IT industry experience with strong system design and data structures — "
                  "building Miracurl Suite to bring enterprise-grade technology to every salon, spa and beauty business."),
    "ceo_photo": "",
    "ceo_facebook": "",
    "ceo_instagram": "",
    "ceo_linkedin": "",
}


class SiteInfoIn(BaseModel):
    contact_email: Optional[str] = Field(None, max_length=120)
    instagram: Optional[str] = Field(None, max_length=300)
    facebook: Optional[str] = Field(None, max_length=300)
    youtube: Optional[str] = Field(None, max_length=300)
    whatsapp: Optional[str] = Field(None, max_length=30)
    ceo_name: Optional[str] = Field(None, max_length=80)
    ceo_title: Optional[str] = Field(None, max_length=120)
    ceo_about: Optional[str] = Field(None, max_length=1200)
    ceo_photo: Optional[str] = Field(None, max_length=800_000)
    ceo_facebook: Optional[str] = Field(None, max_length=300)
    ceo_instagram: Optional[str] = Field(None, max_length=300)
    ceo_linkedin: Optional[str] = Field(None, max_length=300)


async def _get_info() -> dict:
    doc = await _raw_db.platform_settings.find_one({"key": "site_info"}, {"_id": 0}) or {}
    return {**_DEFAULTS, **{k: v for k, v in doc.items() if k in _DEFAULTS and v is not None}}


@router.get("/public/site-info")
async def public_site_info():
    return await _get_info()


@router.put("/super/site-info")
async def update_site_info(body: SiteInfoIn, admin=Depends(require_super_admin)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        await _raw_db.platform_settings.update_one(
            {"key": "site_info"}, {"$set": updates}, upsert=True)
    return await _get_info()
