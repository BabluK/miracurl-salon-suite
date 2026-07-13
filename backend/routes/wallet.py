"""Prepaid wallet / membership: pay X get Y credit, redeem at POS."""
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from database import db, _raw_db
from security import require_tenant_admin, current_tenant, get_current_user, durable_rate_limit, public_rate_limit

router = APIRouter()


class PlanIn(BaseModel):
    label: str = Field(..., max_length=60)
    pay_amount: float = Field(..., gt=0)
    credit_amount: float = Field(..., gt=0)


class TopupIn(BaseModel):
    customer_id: str
    plan_id: str | None = None
    pay_amount: float | None = None
    credit_amount: float | None = None
    method: str = "cash"


@router.get("/wallet/plans")
async def wallet_plans(user=Depends(get_current_user)):
    return await db.wallet_plans.find({}, {"_id": 0}).sort("pay_amount", 1).to_list(20)


@router.post("/wallet/plans")
async def create_wallet_plan(body: PlanIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    if body.credit_amount < body.pay_amount:
        raise HTTPException(400, "Credit should be equal or more than the amount paid")
    doc = {"id": str(uuid.uuid4()), "label": body.label.strip(),
           "pay_amount": round(body.pay_amount, 2), "credit_amount": round(body.credit_amount, 2),
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.wallet_plans.insert_one({**doc})
    return doc


@router.delete("/wallet/plans/{pid}")
async def delete_wallet_plan(pid: str, user=Depends(require_tenant_admin)):
    res = await db.wallet_plans.delete_one({"id": pid})
    if not res.deleted_count:
        raise HTTPException(404, "Plan not found")
    return {"ok": True}


@router.post("/wallet/topup")
async def wallet_topup(body: TopupIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    cust = await db.customers.find_one({"id": body.customer_id}, {"_id": 0})
    if not cust:
        raise HTTPException(404, "Customer not found")
    if body.plan_id:
        plan = await db.wallet_plans.find_one({"id": body.plan_id}, {"_id": 0})
        if not plan:
            raise HTTPException(404, "Wallet plan not found")
        pay, credit, label = plan["pay_amount"], plan["credit_amount"], plan["label"]
    else:
        if not body.pay_amount or not body.credit_amount:
            raise HTTPException(400, "Provide a plan or custom pay & credit amounts")
        if body.credit_amount < body.pay_amount:
            raise HTTPException(400, "Credit should be equal or more than the amount paid")
        pay, credit, label = round(body.pay_amount, 2), round(body.credit_amount, 2), "Custom top-up"
    txn = {"id": str(uuid.uuid4()), "customer_id": cust["id"], "customer_name": cust["name"],
           "type": "topup", "pay_amount": pay, "credit": credit, "method": body.method,
           "label": label, "by": user.get("email"), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.wallet_txns.insert_one({**txn})
    await db.customers.update_one({"id": cust["id"]}, {"$inc": {"wallet_balance": credit}})
    balance = float(cust.get("wallet_balance") or 0) + credit
    return {"ok": True, "txn": txn, "wallet_balance": round(balance, 2)}


@router.get("/wallet/customer/{cid}")
async def wallet_of_customer(cid: str, user=Depends(get_current_user)):
    cust = await db.customers.find_one({"id": cid}, {"_id": 0, "name": 1, "wallet_balance": 1})
    if not cust:
        raise HTTPException(404, "Customer not found")
    txns = await db.wallet_txns.find({"customer_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(25)
    return {"name": cust["name"], "balance": round(float(cust.get("wallet_balance") or 0), 2), "txns": txns}


class BalanceLookupIn(BaseModel):
    phone: str = Field(..., min_length=8, max_length=16)


def _mask_name(name: str) -> str:
    first = (name or "").split()[0] if name else ""
    return f"{first[0]}{'*' * max(1, len(first) - 2)}{first[-1]}" if len(first) > 2 else first


@router.post("/public/wallet-balance/{slug}")
async def public_wallet_balance(slug: str, body: BalanceLookupIn, request: Request):
    """Guest checks their own wallet credit on the booking page. Heavily rate-limited
    and returns a masked name — no other personal data."""
    public_rate_limit(request, key_suffix="wallet-lookup", limit=5, window_sec=600)
    await durable_rate_limit(request, "wallet-lookup", limit=5, window_sec=600)
    t = await _raw_db.tenants.find_one({"slug": slug}, {"_id": 0, "id": 1})
    if not t:
        raise HTTPException(404, "Salon not found")
    digits = re.sub(r"[^0-9]", "", body.phone)[-10:]
    if len(digits) < 8:
        raise HTTPException(400, "Enter a valid phone number")
    cust = await _raw_db.customers.find_one(
        {"tenant_id": t["id"], "phone": {"$regex": f"{digits}$"}},
        {"_id": 0, "name": 1, "wallet_balance": 1})
    if not cust:
        return {"found": False}
    return {"found": True, "name": _mask_name(cust.get("name", "")),
            "balance": round(float(cust.get("wallet_balance") or 0), 2)}
