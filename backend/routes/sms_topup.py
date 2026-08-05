"""Owner-facing SMS points top-up (Razorpay) + automatic trial→paid nudge emails."""
import logging
import secrets
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from database import db, _raw_db
from security import require_admin, public_rate_limit
from routes.pay_links import _rzp_client, _verify_rzp_signature, RAZORPAY_KEY_ID, LINK_VALID_DAYS
from routes.tenancy import current_tenant

router = APIRouter()
log = logging.getLogger("sms_topup")

SMS_PACKS = {
    "pack_500": {"points": 500, "price": 499, "label": "500 SMS points"},
    "pack_1000": {"points": 1000, "price": 899, "label": "1,000 SMS points", "tag": "Most popular"},
    "pack_2500": {"points": 2500, "price": 1999, "label": "2,500 SMS points", "tag": "Best value"},
}


def _now():
    return datetime.now(timezone.utc)


@router.get("/sms/topup/packs")
async def sms_topup_packs(user=Depends(require_admin), t=Depends(current_tenant)):
    return {"packs": [{"key": k, **v} for k, v in SMS_PACKS.items()],
            "balance": int(t.get("sms_points") or 0),
            "enabled": bool(RAZORPAY_KEY_ID), "key_id": RAZORPAY_KEY_ID}


class TopupOrderIn(BaseModel):
    pack: str = Field(..., max_length=20)


@router.post("/sms/topup/order")
async def sms_topup_order(body: TopupOrderIn, user=Depends(require_admin), t=Depends(current_tenant)):
    pack = SMS_PACKS.get(body.pack)
    if not pack:
        raise HTTPException(400, "Unknown pack")
    if not RAZORPAY_KEY_ID:
        raise HTTPException(503, "Payments not configured — contact Miracurl HQ")
    rzp = _rzp_client()
    order = rzp.order.create({"amount": int(pack["price"] * 100), "currency": "INR",
                              "receipt": f"sms-{t['id'][:12]}-{secrets.token_hex(3)}"})
    await _raw_db.sms_topup_orders.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": t["id"], "order_id": order["id"],
        "pack": body.pack, "points": pack["points"], "price": pack["price"],
        "status": "pending", "created_by": user.get("email"), "created_at": _now().isoformat()})
    return {"order_id": order["id"], "amount": pack["price"], "key_id": RAZORPAY_KEY_ID,
            "points": pack["points"], "salon_name": t.get("name") or ""}


class TopupVerifyIn(BaseModel):
    razorpay_order_id: str = Field(..., max_length=100)
    razorpay_payment_id: str = Field(..., max_length=100)
    razorpay_signature: str = Field(..., max_length=200)


@router.post("/sms/topup/verify")
async def sms_topup_verify(body: TopupVerifyIn, request: Request, user=Depends(require_admin), t=Depends(current_tenant)):
    public_rate_limit(request, "sms-topup-verify", limit=15, window_sec=600)
    if not _verify_rzp_signature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature):
        raise HTTPException(400, "Payment signature verification failed")
    rec = await _raw_db.sms_topup_orders.find_one_and_update(
        {"order_id": body.razorpay_order_id, "tenant_id": t["id"], "status": "pending"},
        {"$set": {"status": "paid", "paid_at": _now().isoformat(),
                  "payment_id": body.razorpay_payment_id}}, return_document=True)
    if not rec:
        raise HTTPException(400, "Order not found or already credited")
    await _raw_db.tenants.update_one({"id": t["id"]}, {"$inc": {"sms_points": rec["points"]}})
    fresh = await _raw_db.tenants.find_one({"id": t["id"]}, {"_id": 0, "sms_points": 1})
    await _raw_db.hq_messages.insert_one({
        "id": str(uuid.uuid4()), "salon_name": t.get("name"), "from_email": user.get("email"),
        "message": f"💰 Bought {rec['points']} SMS points (₹{rec['price']}) — self-serve top-up 🎉",
        "created_at": _now().isoformat(), "read": False})
    return {"ok": True, "points_added": rec["points"], "balance": int(fresh.get("sms_points") or 0)}


# ---------- Trial → paid nudges (day 5 / 10 / 13) ----------
_NUDGE_DAYS = (5, 10, 13)


async def run_trial_nudges() -> int:
    from email_service import _send_email
    import os
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    sent = 0
    async for t in _raw_db.tenants.find({"status": "trial"}, {"_id": 0}):
        try:
            created = datetime.fromisoformat(str(t.get("created_at")).replace("Z", "+00:00"))
        except Exception:
            continue
        day = (_now().date() - created.date()).days
        if day not in _NUDGE_DAYS or not t.get("owner_email"):
            continue
        if await _raw_db.trial_nudges.find_one({"tenant_id": t["id"], "day": day}):
            continue
        month = _now().strftime("%Y-%m")
        pipe = [{"$match": {"tenant_id": t["id"], "created_at": {"$regex": f"^{month}"},
                            "status": {"$ne": "voided"}}},
                {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}}]
        agg = await _raw_db.invoices.aggregate(pipe).to_list(1)
        billed = round((agg[0]["total"] if agg else 0) or 0)
        bills = (agg[0]["count"] if agg else 0) or 0
        custs = await _raw_db.customers.count_documents({"tenant_id": t["id"]})
        # one-tap pay link (6-month plan) reusing the public /pay flow
        link_tok = secrets.token_urlsafe(8)
        await _raw_db.subscription_pay_links.insert_one({
            "id": str(uuid.uuid4()), "token": link_tok, "tenant_id": t["id"],
            "tenant_slug": t["slug"], "salon_name": t.get("name") or t["slug"],
            "owner_email": t["owner_email"], "plan": "half_year",
            "plan_label": "6-Month Plan (1 branch)", "amount": 5999.0, "currency": "INR",
            "duration_days": 183, "note": f"Trial day-{day} offer", "status": "pending",
            "expires_at": (_now() + timedelta(days=LINK_VALID_DAYS)).isoformat(),
            "created_at": _now().isoformat(), "created_by": "trial_nudge"})
        days_left = max(0, 14 - day)
        stats = (f"₹{billed:,} billed across {bills} bills this month" if billed
                 else f"{custs} customers already in your CRM")
        html = f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#333">
          <h2 style="color:#1a1a2e">Your salon is growing on Miracurl 🚀</h2>
          <p>Hi {t.get('owner_name') or 'there'}, quick snapshot from <b>{t.get('name')}</b>:</p>
          <div style="background:#fdf6ee;border:1px solid #eadfc8;border-radius:12px;padding:16px 20px;font-size:15px">
            📈 <b>{stats}</b><br>👥 {custs} customers on file · 🗓 day {day} of your free trial ({days_left} days left)
          </div>
          <p>Keep everything running without interruption — activate your plan in one tap:</p>
          <p style="text-align:center;margin:22px 0">
            <a href="{base}/pay/{link_tok}" style="background:#1c1c22;color:#e8c37f;text-decoration:none;padding:14px 34px;border-radius:999px;font-size:15px">Activate 6-Month Plan · ₹5,999 ✦</a>
          </p>
          <p style="font-size:12px;color:#999">UPI, card or netbanking · Prefer another plan? Just reply to this email.</p>
        </div>"""
        res = await _send_email([t["owner_email"]],
                                f"Day {day} of your Miracurl trial — {stats} 💛", html)
        await _raw_db.trial_nudges.insert_one({
            "tenant_id": t["id"], "day": day, "sent": bool(res.get("sent")),
            "billed": billed, "pay_link": link_tok, "at": _now().isoformat()})
        sent += 1 if res.get("sent") else 0
    return sent
