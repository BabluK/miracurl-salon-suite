# Extracted from server.py — domain route module (auto-split refactor)
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import (
    APIRouter, HTTPException, Depends,
)
from pydantic import BaseModel, Field, field_validator

from database import _raw_db, db, _clean
from security import (
    get_current_user, require_tenant_admin, current_tenant,
)
from services.billing import (
    _active_membership, _loyalty_rules,
)

router = APIRouter()

# ---------------- Packages, Memberships & Coupons ----------------
class PackageIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    price: float = Field(..., gt=0)
    service_id: str
    sessions: int = Field(..., ge=1, le=100)
    validity_days: int = Field(365, ge=1, le=1825)
    active: bool = True

class MembershipIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    price: float = Field(..., gt=0)
    discount_pct: float = Field(..., gt=0, le=90)
    validity_days: int = Field(180, ge=1, le=1825)
    active: bool = True
    cashback_pct: float = Field(0, ge=0, le=50)
    benefits: list = []
    tier: str = ""
    custom: bool = False
    min_price: float = Field(0, ge=0)
    public_purchase: bool = False

class CouponIn(BaseModel):
    code: str = Field(..., min_length=3, max_length=20)
    type: str = "percent"  # percent | flat
    value: float = Field(..., gt=0)
    expires_at: Optional[str] = None  # YYYY-MM-DD
    max_uses: Optional[int] = Field(None, ge=1)
    active: bool = True

    @field_validator("value")
    @classmethod
    def _value(cls, v, info):
        if info.data.get("type") == "percent" and v > 100:
            raise ValueError("Percent discount cannot exceed 100")
        return v

    @field_validator("code")
    @classmethod
    def _code(cls, v):
        v = v.strip().upper()
        if not re.fullmatch(r"[A-Z0-9]{3,20}", v):
            raise ValueError("Code must be 3-20 letters/digits")
        return v

    @field_validator("type")
    @classmethod
    def _type(cls, v):
        if v not in ("percent", "flat"):
            raise ValueError("type must be percent or flat")
        return v

@router.get("/packages")
async def list_packages(user=Depends(get_current_user)):
    return await db.packages.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)

@router.post("/packages")
async def create_package(body: PackageIn, user=Depends(require_tenant_admin)):
    svc = await db.services.find_one({"id": body.service_id}, {"_id": 0, "name": 1})
    if not svc:
        raise HTTPException(400, "Service not found")
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "service_name": svc["name"],
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.packages.insert_one(doc)
    return _clean(doc)

@router.put("/packages/{pid}")
async def update_package(pid: str, body: PackageIn, user=Depends(require_tenant_admin)):
    svc = await db.services.find_one({"id": body.service_id}, {"_id": 0, "name": 1})
    if not svc:
        raise HTTPException(400, "Service not found")
    await db.packages.update_one({"id": pid}, {"$set": {**body.model_dump(), "service_name": svc["name"]}})
    return await db.packages.find_one({"id": pid}, {"_id": 0})

@router.delete("/packages/{pid}")
async def delete_package(pid: str, user=Depends(require_tenant_admin)):
    await db.packages.delete_one({"id": pid})
    return {"ok": True}

@router.get("/memberships")
async def list_memberships(user=Depends(get_current_user)):
    return await db.memberships.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)

@router.post("/memberships")
async def create_membership(body: MembershipIn, user=Depends(require_tenant_admin)):
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.memberships.insert_one(doc)
    return _clean(doc)

@router.put("/memberships/{mid}")
async def update_membership(mid: str, body: MembershipIn, user=Depends(require_tenant_admin)):
    await db.memberships.update_one({"id": mid}, {"$set": body.model_dump()})
    return await db.memberships.find_one({"id": mid}, {"_id": 0})

@router.delete("/memberships/{mid}")
async def delete_membership(mid: str, user=Depends(require_tenant_admin)):
    await db.memberships.delete_one({"id": mid})
    return {"ok": True}

@router.get("/coupons")
async def list_coupons(user=Depends(get_current_user)):
    return await db.coupons.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

@router.post("/coupons")
async def create_coupon(body: CouponIn, user=Depends(require_tenant_admin)):
    if await db.coupons.find_one({"code": body.code}, {"_id": 0, "id": 1}):
        raise HTTPException(400, f"Coupon '{body.code}' already exists")
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "used_count": 0,
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.coupons.insert_one(doc)
    return _clean(doc)

@router.put("/coupons/{cid}")
async def update_coupon(cid: str, body: CouponIn, user=Depends(require_tenant_admin)):
    dup = await db.coupons.find_one({"code": body.code, "id": {"$ne": cid}}, {"_id": 0, "id": 1})
    if dup:
        raise HTTPException(400, f"Coupon '{body.code}' already exists")
    await db.coupons.update_one({"id": cid}, {"$set": body.model_dump()})
    return await db.coupons.find_one({"id": cid}, {"_id": 0})

@router.delete("/coupons/{cid}")
async def delete_coupon(cid: str, user=Depends(require_tenant_admin)):
    await db.coupons.delete_one({"id": cid})
    return {"ok": True}

@router.get("/pos/offers")
async def pos_offers(user=Depends(get_current_user), t=Depends(current_tenant)):
    """POS billing: live Mira packages + today's accepted offers (daily & flash) in one call."""
    from routes.packages import _live_filter
    from routes.day_offers import _today_ist
    mira = await _raw_db.mira_packages.find(
        _live_filter(t["id"]), {"_id": 0}).sort("published_at", -1).to_list(20)
    today = _today_ist().date().isoformat()
    offers = await _raw_db.day_offers.find(
        {"tenant_id": t["id"], "date": today, "status": "accepted"},
        {"_id": 0, "id": 1, "title": 1, "offer_text": 1, "discount_pct": 1,
         "services": 1, "kind": 1}).to_list(10)
    return {"mira_packages": mira, "day_offers": offers}


@router.get("/customers/{cid}/benefits")
async def customer_benefits(cid: str, user=Depends(get_current_user), t=Depends(current_tenant)):
    cust = await db.customers.find_one({"id": cid}, {"_id": 0, "loyalty_points": 1, "referral_credit": 1, "dob": 1, "anniversary": 1})
    if cust is None:
        raise HTTPException(404, "Customer not found")
    now = datetime.now(timezone.utc).isoformat()
    pkgs = await db.customer_packages.find(
        {"customer_id": cid, "sessions_left": {"$gt": 0}, "expires_at": {"$gt": now}}, {"_id": 0}).to_list(50)
    membership = await _active_membership(cid)

    def _within_week(datestr):
        if not datestr:
            return False
        try:
            m, d = int(str(datestr)[5:7]), int(str(datestr)[8:10])
            today = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
            this_year = today.replace(month=m, day=d, hour=0, minute=0, second=0, microsecond=0)
            return abs((this_year - today).days) <= 7
        except Exception:
            return False

    return {"loyalty_points": int(cust.get("loyalty_points") or 0),
            "referral_credit": float(cust.get("referral_credit") or 0),
            "packages": pkgs, "membership": membership,
            "loyalty_rules": _loyalty_rules(t),
            "birthday_week": _within_week(cust.get("dob")),
            "anniversary_week": _within_week(cust.get("anniversary"))}

