"""Signature Loyalty Card: gold stamp card — 1 stamp per visit, reward when full. Salons only."""
import re
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from pymongo import ReturnDocument

from database import db, _raw_db
from security import require_tenant_admin, current_tenant, get_current_user, public_rate_limit, durable_rate_limit

router = APIRouter()

DEFAULTS = {"enabled": False, "stamps_needed": 5,
            "reward_label": "20% off your next visit", "reward_discount_pct": 20}


def _cfg(t: dict) -> dict:
    return {**DEFAULTS, **(t.get("loyalty_stamps") or {})}


class StampSettingsIn(BaseModel):
    enabled: bool = False
    stamps_needed: int = Field(5, ge=2, le=12)
    reward_label: str = Field("20% off your next visit", max_length=80)
    reward_discount_pct: int = Field(20, ge=0, le=100)


@router.get("/settings/loyalty-stamps")
async def get_stamp_settings(user=Depends(get_current_user), t=Depends(current_tenant)):
    return _cfg(t)


@router.put("/settings/loyalty-stamps")
async def put_stamp_settings(body: StampSettingsIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    await db.tenants.update_one({"id": t["id"]}, {"$set": {"loyalty_stamps": body.model_dump()}})
    return {"ok": True, **body.model_dump()}


def _card(cust: dict, cfg: dict) -> dict:
    stamps = int(cust.get("stamps") or 0)
    needed = int(cfg["stamps_needed"])
    return {"found": True, "name": cust.get("name"), "stamps": stamps % needed if stamps else 0,
            "raw_stamps": stamps, "needed": needed,
            "rewards_available": max(0, min(stamps // needed - int(cust.get("stamp_rewards_redeemed") or 0), 5)),
            "reward_label": cfg["reward_label"], "reward_discount_pct": cfg["reward_discount_pct"],
            "enabled": cfg["enabled"], "customer_id": cust.get("id")}


async def _find_cust(phone: str):
    digits = re.sub(r"[^0-9]", "", phone)[-10:]
    if len(digits) < 8:
        raise HTTPException(400, "Enter a valid phone number")
    return await db.customers.find_one(
        {"phone": {"$regex": f"{re.escape(digits)}$"}},
        {"_id": 0, "id": 1, "name": 1, "stamps": 1, "stamp_rewards_redeemed": 1})


@router.get("/loyalty/stamps")
async def staff_view_card(phone: str, user=Depends(get_current_user), t=Depends(current_tenant)):
    cfg = _cfg(t)
    cust = await _find_cust(phone)
    if not cust:
        return {"found": False, "enabled": cfg["enabled"]}
    return _card(cust, cfg)


class StampIn(BaseModel):
    phone: str = Field(..., max_length=20)


@router.post("/loyalty/stamps/add")
async def add_stamp_manual(body: StampIn, user=Depends(get_current_user), t=Depends(current_tenant)):
    cfg = _cfg(t)
    if not cfg["enabled"]:
        raise HTTPException(400, "Loyalty stamp card is not enabled in Settings")
    cust = await _find_cust(body.phone)
    if not cust:
        raise HTTPException(404, "No customer found with that phone")
    await db.customers.update_one({"id": cust["id"]}, {"$inc": {"stamps": 1}})
    cust["stamps"] = int(cust.get("stamps") or 0) + 1
    return _card(cust, cfg)


@router.post("/loyalty/stamps/redeem")
async def redeem_reward(body: StampIn, user=Depends(get_current_user), t=Depends(current_tenant)):
    cfg = _cfg(t)
    if not cfg["enabled"]:
        raise HTTPException(400, "Loyalty stamp card is not enabled in Settings")
    cust = await _find_cust(body.phone)
    if not cust:
        raise HTTPException(404, "No customer found with that phone")
    available = int(cust.get("stamps") or 0) // cfg["stamps_needed"] - int(cust.get("stamp_rewards_redeemed") or 0)
    if available < 1:
        raise HTTPException(400, "Card is not full yet — no reward to redeem")
    await db.customers.update_one({"id": cust["id"]}, {"$inc": {"stamp_rewards_redeemed": 1}})
    cust["stamp_rewards_redeemed"] = int(cust.get("stamp_rewards_redeemed") or 0) + 1
    out = _card(cust, cfg)
    out["redeemed"] = True
    return out


@router.get("/public/loyalty/{slug}")
async def public_view_card(slug: str, phone: str, request: Request):
    """Guest checks their own stamp card on the booking page. Rate-limited like wallet lookup."""
    public_rate_limit(request, key_suffix="stamp-lookup", limit=5, window_sec=600)
    await durable_rate_limit(request, "stamp-lookup", limit=5, window_sec=600)
    t = await _raw_db.tenants.find_one({"slug": slug}, {"_id": 0, "id": 1, "business_type": 1, "loyalty_stamps": 1})
    if not t:
        raise HTTPException(404, "Salon not found")
    cfg = _cfg(t)
    if not cfg["enabled"]:
        return {"enabled": False}
    digits = re.sub(r"[^0-9]", "", phone)[-10:]
    if not re.fullmatch(r"[6-9]\d{9}", digits):
        raise HTTPException(400, "Enter your full 10-digit mobile number")
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    phone_doc = await _raw_db.rate_limits.find_one_and_update(
        {"_id": f"phone:{digits}:stamps:{slug}:{day}"},
        {"$inc": {"n": 1}, "$setOnInsert": {"expire_at": datetime.now(timezone.utc) + timedelta(days=1)}},
        upsert=True, return_document=ReturnDocument.AFTER)
    if phone_doc["n"] > 8:
        raise HTTPException(429, "Too many checks for this number today — please ask at the salon desk.")
    cust = await _raw_db.customers.find_one(
        {"tenant_id": t["id"], "phone": {"$regex": f"{digits}$"}},
        {"_id": 0, "id": 1, "stamps": 1, "stamp_rewards_redeemed": 1})
    if not cust:
        return {"enabled": True, "found": False, "needed": cfg["stamps_needed"], "reward_label": cfg["reward_label"]}
    out = _card(cust, cfg)
    out.pop("customer_id", None)
    out.pop("name", None)
    return out
