"""HQ credit wallet: Miracurl's stock of SMS/WhatsApp credits handed to tenants on purchase or by manual grant."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import _raw_db
from services.pack_pricing import pack_pricing
from security import require_super_admin

router = APIRouter()
WALLET_ID = "hq_credit_wallet"
FIELD = {"sms": "sms_points", "whatsapp": "wa_points"}
LOW_STOCK = 200  # Mira nags the Boss below this many unassigned credits
LABEL = {"sms": "SMS", "whatsapp": "WhatsApp"}


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
    await check_low_stock()


def low_stock_line(w: dict) -> str:
    """Mira's one-liner for the Boss when HQ stock is thin (empty string when all good)."""
    low = [(ch, int(w.get(f"{ch}_stock") or 0)) for ch in FIELD if int(w.get(f"{ch}_stock") or 0) < LOW_STOCK]
    if not low:
        return ""
    parts = " and ".join(f"{n:,} {LABEL[ch]}" for ch, n in low)
    where = " / ".join("MSG91" if ch == "sms" else "Meta" for ch, _ in low)
    return (f"Hey Boss 👋 HQ has only {parts} credits left to assign. Please top up {where} so every tenant "
            f"who purchases a pack gets their credits instantly.")


async def check_low_stock() -> list[str]:
    """Below LOW_STOCK on any channel → one Mira alert per channel per day (HQ feed + email to admin@)."""
    w = await _wallet()
    today = datetime.now(timezone.utc).date().isoformat()
    fired = []
    for ch in FIELD:
        stock = int(w.get(f"{ch}_stock") or 0)
        if stock >= LOW_STOCK or w.get(f"{ch}_low_alert_date") == today:
            continue
        await _raw_db.hq_wallet.update_one({"id": WALLET_ID}, {"$set": {f"{ch}_low_alert_date": today}})
        await _raw_db.hq_wallet_alerts.insert_one({"id": f"wallet-low-{ch}-{today}", "channel": ch, "stock": stock, "at": _now()})
        fired.append(ch)
    if fired:
        from email_service import _send_email, hq_inbox
        line = low_stock_line(w)
        rows = "".join(f"<li><b>{LABEL[ch]}</b>: {int(w.get(f'{ch}_stock') or 0):,} credits left (alert below {LOW_STOCK})</li>" for ch in fired)
        try:
            await _send_email([hq_inbox("admin")], "🔔 Mira: HQ credit stock is running low",
                              f"<div style='font-family:Arial,sans-serif;font-size:14px;color:#33333b;line-height:1.7'><p>{line}</p><ul>{rows}</ul>"
                              f"<p>Top up MSG91 (SMS) or set the Meta budget (WhatsApp), then record it in Super Admin → HQ Credit Wallet.</p></div>")
        except Exception:  # noqa: BLE001 — email is best-effort
            pass
    return fired


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
    if bal == 0:
        raise HTTPException(409, "MSG91 reports 0 on the SMS route — your account uses the ₹ wallet, which MSG91 doesn't expose via API. "
                                 "Use 'Record MSG91 wallet' and enter the ₹ balance + price per SMS.")
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
    low = {ch: int(w.get(f"{ch}_stock") or 0) < LOW_STOCK for ch in FIELD}
    # Margin so far = what tenants paid − (messages sold × HQ unit cost)
    pr = await pack_pricing()
    margin = {}
    for ch in FIELD:
        sold = 0
        async for r in _raw_db.hq_wallet_ledger.find({"channel": ch, "kind": "tenant_purchase"}, {"_id": 0, "delta": 1}):
            sold += abs(int(r.get("delta") or 0))
        margin[ch] = {"sold": sold, "revenue_paise": int(w.get(f"{ch}_revenue_paise") or 0), "cost_paise": sold * pr[f"{ch}_cost_paise"],
                      "margin_paise": int(w.get(f"{ch}_revenue_paise") or 0) - sold * pr[f"{ch}_cost_paise"], "unit_cost_paise": pr[f"{ch}_cost_paise"]}
    return {**w, "ledger": ledger, "low_stock": low, "low_threshold": LOW_STOCK, "mira_note": low_stock_line(w), "margin": margin}


class TopupIn(BaseModel):
    channel: str = Field(..., pattern="^(sms|whatsapp)$")
    points: int = Field(..., ge=0, le=1_000_000)
    cost_paise: int = Field(0, ge=0)
    note: str = Field("", max_length=200)
    mode: str = Field("add", pattern="^(add|set)$")  # set = "this is my current MSG91/Meta stock"


@router.post("/super-admin/credit-wallet/topup")
async def hq_wallet_topup(body: TopupIn, admin=Depends(require_super_admin)):
    """HQ bought stock from Meta / MSG91 (add), or records the current balance (set) — e.g. MSG91 ₹ wallet ÷ price per SMS."""
    w = await _wallet()
    cur = int(w.get(f"{body.channel}_stock") or 0)
    delta = body.points if body.mode == "add" else body.points - cur
    await _raw_db.hq_wallet.update_one({"id": WALLET_ID}, {"$inc": {f"{body.channel}_stock": delta, f"{body.channel}_cost_paise": body.cost_paise},
                                                          "$set": {"updated_at": _now()}})
    if delta:
        await _ledger(body.channel, delta, "hq_topup" if body.mode == "add" else "hq_set_balance", None, body.cost_paise, admin.get("email"), body.note)
    await check_low_stock()
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
    await _raw_db.tenants.update_one({"id": tid}, {"$inc": {FIELD[body.channel]: body.points}})  # feature stays as Super Admin set it
    await _raw_db.hq_wallet.update_one({"id": WALLET_ID}, {"$inc": {f"{body.channel}_stock": -body.points}, "$set": {"updated_at": _now()}})
    await _raw_db.sms_credit_log.insert_one({"id": str(uuid.uuid4()), "tenant_id": tid, "points": body.points, "source": "hq_grant",
                                             "channel": body.channel, "credited_by": admin.get("email"), "at": _now(), "note": body.note})
    await _ledger(body.channel, -body.points, "hq_grant", tid, 0, admin.get("email"), body.note)
    await check_low_stock()
    return {"ok": True, **(await _wallet())}


LEGIT_SOURCES = ("razorpay", "hq_grant", "purchase", "pack_purchase")


async def _legit_credits(tenant_id: str) -> dict:
    """Credits HQ actually sold/granted, per channel. Ledger and credit-log describe the same grants → max, never sum."""
    from_ledger, from_log = {"sms": 0, "whatsapp": 0}, {"sms": 0, "whatsapp": 0}
    async for l in _raw_db.hq_wallet_ledger.find({"tenant_id": tenant_id, "kind": {"$in": ["tenant_purchase", "hq_grant"]}}, {"_id": 0, "channel": 1, "delta": 1}):
        from_ledger[l["channel"]] = from_ledger.get(l["channel"], 0) + abs(int(l.get("delta") or 0))
    async for l in _raw_db.sms_credit_log.find({"tenant_id": tenant_id, "source": {"$in": list(LEGIT_SOURCES)}, "points": {"$gt": 0}}, {"_id": 0, "channel": 1, "points": 1}):
        ch = l.get("channel") or "sms"
        from_log[ch] = from_log.get(ch, 0) + int(l.get("points") or 0)
    return {ch: max(from_ledger.get(ch, 0), from_log.get(ch, 0)) for ch in FIELD}


def _audit_row(t: dict, legit: dict) -> dict:
    sms, wa = int(t.get("sms_points") or 0), int(t.get("wa_points") or 0)
    dummy = {"sms": sms > 0 and legit["sms"] == 0, "whatsapp": wa > 0 and legit["whatsapp"] == 0}
    return {"tenant_id": t["id"], "name": t.get("name"), "slug": t.get("slug"), "sms_points": sms, "wa_points": wa,
            "legit_sms": legit["sms"], "legit_whatsapp": legit["whatsapp"], "dummy": dummy, "has_dummy": dummy["sms"] or dummy["whatsapp"]}


async def _audit_rows() -> list[dict]:
    """Per tenant with any credits: current balance vs. what HQ sold/granted. No legit source + points > 0 ⇒ dummy (dev/test) credits."""
    rows = []
    async for t in _raw_db.tenants.find({"$or": [{"sms_points": {"$gt": 0}}, {"wa_points": {"$gt": 0}}]},
                                        {"_id": 0, "id": 1, "name": 1, "slug": 1, "sms_points": 1, "wa_points": 1}).sort("created_at", 1):
        rows.append(_audit_row(t, await _legit_credits(t["id"])))
    return rows


@router.get("/super-admin/credit-wallet/audit")
async def hq_credit_audit(admin=Depends(require_super_admin)):
    rows = await _audit_rows()
    return {"tenants": rows, "dummy_count": sum(1 for r in rows if r["has_dummy"])}


@router.post("/super-admin/credit-wallet/audit/remove-dummy")
async def hq_credit_remove_dummy(admin=Depends(require_super_admin)):
    """Zero out credits that were never sold or granted from HQ stock (old dev/test seeds). Legit balances are untouched."""
    removed = []
    for r in await _audit_rows():
        unset = {}
        if r["dummy"]["sms"]:
            unset["sms_points"] = 0
        if r["dummy"]["whatsapp"]:
            unset["wa_points"] = 0
        if not unset:
            continue
        await _raw_db.tenants.update_one({"id": r["tenant_id"]}, {"$set": unset})
        for ch, field in FIELD.items():
            if field in unset:
                await _raw_db.sms_credit_log.insert_one({"id": str(uuid.uuid4()), "tenant_id": r["tenant_id"], "channel": ch,
                                                         "points": -(r["sms_points"] if ch == "sms" else r["wa_points"]), "source": "dummy_reset",
                                                         "credited_by": admin.get("email"), "at": _now(), "note": "never sold/granted from HQ stock"})
        removed.append({"name": r["name"], "sms_removed": r["sms_points"] if "sms_points" in unset else 0,
                        "wa_removed": r["wa_points"] if "wa_points" in unset else 0})
    return {"ok": True, "removed": removed}
