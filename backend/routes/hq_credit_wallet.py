"""HQ credit wallet: Miracurl's stock of SMS/WhatsApp credits handed to tenants on purchase or by manual grant."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import _raw_db
from security import require_super_admin

router = APIRouter()
WALLET_ID = "hq_credit_wallet"
FIELD = {"sms": "sms_points", "whatsapp": "wa_points"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _wallet() -> dict:
    w = await _raw_db.hq_wallet.find_one({"id": WALLET_ID}, {"_id": 0})
    if not w:
        w = {"id": WALLET_ID, "sms_stock": 0, "whatsapp_stock": 0, "sms_revenue_paise": 0, "whatsapp_revenue_paise": 0,
             "sms_cost_paise": 0, "whatsapp_cost_paise": 0, "updated_at": _now()}
        await _raw_db.hq_wallet.insert_one({**w})
    return w


async def _ledger(channel: str, delta: int, kind: str, tenant_id: str | None, amount_paise: int, by: str, note: str = "") -> None:
    await _raw_db.hq_wallet_ledger.insert_one({
        "id": str(uuid.uuid4()), "channel": channel, "delta": delta, "kind": kind, "tenant_id": tenant_id,
        "amount_paise": amount_paise, "by": by, "note": note, "at": _now()})


async def record_tenant_purchase(channel: str, points: int, tenant_id: str, amount_paise: int, payment_ref: str) -> None:
    """Tenant paid Razorpay → credits already added to tenant; take them out of HQ stock and book the revenue."""
    await _wallet()
    await _raw_db.hq_wallet.update_one({"id": WALLET_ID}, {"$inc": {f"{channel}_stock": -points, f"{channel}_revenue_paise": amount_paise},
                                                          "$set": {"updated_at": _now()}})
    await _ledger(channel, -points, "tenant_purchase", tenant_id, amount_paise, "razorpay", payment_ref)


async def _msg91_balance() -> int | None:
    """Live prepaid SMS balance from MSG91 (route type 4 = transactional). None when not configured/unreachable."""
    import os
    import httpx
    key = os.environ.get("MSG91_AUTHKEY", "")
    if not key:
        return None
    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            r = await c.get("https://control.msg91.com/api/balance.php", params={"authkey": key, "type": 4})
        return int(r.text.strip())
    except Exception:  # noqa: BLE001
        return None


@router.post("/super-admin/credit-wallet/sync")
async def hq_wallet_sync(admin=Depends(require_super_admin)):
    """Pull HQ's real SMS stock from MSG91 (what you paid MSG91 for). WhatsApp is postpaid — Meta bills per message,
    so its stock is treated as unlimited and tracked as revenue vs. Meta cost."""
    bal = await _msg91_balance()
    if bal is None:
        raise HTTPException(502, "MSG91 not reachable — check MSG91_AUTHKEY")
    w = await _wallet()
    delta = bal - int(w.get("sms_stock") or 0)
    await _raw_db.hq_wallet.update_one({"id": WALLET_ID}, {"$set": {"sms_stock": bal, "sms_synced_at": _now(), "updated_at": _now()}})
    if delta:
        await _ledger("sms", delta, "msg91_sync", None, 0, admin.get("email"), f"MSG91 balance {bal}")
    return {"ok": True, "sms_stock": bal, "delta": delta}


@router.get("/super-admin/credit-wallet")
async def hq_wallet_view(admin=Depends(require_super_admin)):
    w = await _wallet()
    w["whatsapp_postpaid"] = True  # Meta bills per message to the card on WABA 1627056435755219
    w["msg91_balance"] = await _msg91_balance()
    ledger = await _raw_db.hq_wallet_ledger.find({}, {"_id": 0}).sort("at", -1).to_list(40)
    tids = list({r["tenant_id"] for r in ledger if r.get("tenant_id")})
    names = {t["id"]: t["name"] async for t in _raw_db.tenants.find({"id": {"$in": tids}}, {"_id": 0, "id": 1, "name": 1})} if tids else {}
    for r in ledger:
        r["tenant_name"] = names.get(r.get("tenant_id"), "")
    low = {ch: w.get(f"{ch}_stock", 0) < 500 for ch in FIELD}
    return {**w, "ledger": ledger, "low_stock": low}


class TopupIn(BaseModel):
    channel: str = Field(..., pattern="^(sms|whatsapp)$")
    points: int = Field(..., ge=1, le=1_000_000)
    cost_paise: int = Field(0, ge=0)
    note: str = Field("", max_length=200)


@router.post("/super-admin/credit-wallet/topup")
async def hq_wallet_topup(body: TopupIn, admin=Depends(require_super_admin)):
    """HQ bought stock from Meta / MSG91 (or sets an opening balance)."""
    await _wallet()
    await _raw_db.hq_wallet.update_one({"id": WALLET_ID}, {"$inc": {f"{body.channel}_stock": body.points, f"{body.channel}_cost_paise": body.cost_paise},
                                                          "$set": {"updated_at": _now()}})
    await _ledger(body.channel, body.points, "hq_topup", None, body.cost_paise, admin.get("email"), body.note)
    return {"ok": True, **(await _wallet())}


class GrantIn(BaseModel):
    channel: str = Field(..., pattern="^(sms|whatsapp)$")
    points: int = Field(..., ge=1, le=100_000)
    note: str = Field("", max_length=200)


@router.post("/super-admin/tenants/{tid}/grant-credits")
async def hq_grant_credits(tid: str, body: GrantIn, admin=Depends(require_super_admin)):
    """Manually hand credits from HQ stock to a tenant (free grant / offline payment)."""
    t = await _raw_db.tenants.find_one({"id": tid}, {"_id": 0, "id": 1, "name": 1})
    if not t:
        raise HTTPException(404, "Tenant not found")
    w = await _wallet()
    if w.get(f"{body.channel}_stock", 0) < body.points:
        raise HTTPException(409, f"HQ has only {w.get(f'{body.channel}_stock', 0)} {body.channel} credits in stock — top up first")
    await _raw_db.tenants.update_one({"id": tid}, {"$inc": {FIELD[body.channel]: body.points}, "$set": {f"features.{body.channel}": True}})
    await _raw_db.hq_wallet.update_one({"id": WALLET_ID}, {"$inc": {f"{body.channel}_stock": -body.points}, "$set": {"updated_at": _now()}})
    await _raw_db.sms_credit_log.insert_one({"id": str(uuid.uuid4()), "tenant_id": tid, "points": body.points, "source": "hq_grant",
                                             "channel": body.channel, "credited_by": admin.get("email"), "at": _now(), "note": body.note})
    await _ledger(body.channel, -body.points, "hq_grant", tid, 0, admin.get("email"), body.note)
    return {"ok": True, **(await _wallet())}
