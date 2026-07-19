"""International settings (currency/timezone) + Stripe booking deposits (Flow B)."""
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from database import db, _raw_db
from security import require_tenant_admin, current_tenant, public_rate_limit

router = APIRouter()

CURRENCIES = {"INR": "₹", "USD": "$", "GBP": "£", "EUR": "€", "AED": "AED "}
TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Europe/London", "Europe/Paris",
             "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney"]


def _checkout(request: Request):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    host_url = str(request.base_url)
    return StripeCheckout(api_key=os.environ["STRIPE_API_KEY"],
                          webhook_url=f"{host_url}api/webhook/stripe")


class IntlSettingsIn(BaseModel):
    currency: str = Field("INR", pattern="^(INR|USD|GBP|EUR|AED)$")
    timezone: str = "Asia/Kolkata"
    deposit_amount: float = Field(0, ge=0, le=500)


@router.get("/settings/international")
async def get_intl_settings(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return {"currency": t.get("currency") or "INR", "timezone": t.get("timezone") or "Asia/Kolkata",
            "deposit_amount": t.get("deposit_amount") or 0,
            "currencies": list(CURRENCIES.keys()), "timezones": TIMEZONES,
            "stripe_ready": bool(os.environ.get("STRIPE_API_KEY"))}


@router.put("/settings/international")
async def put_intl_settings(body: IntlSettingsIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    if body.timezone not in TIMEZONES:
        raise HTTPException(400, "Unsupported timezone")
    await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {
        "currency": body.currency, "timezone": body.timezone, "deposit_amount": body.deposit_amount}})
    return {"ok": True}


class DepositCheckoutIn(BaseModel):
    appointment_id: str
    origin_url: str = Field(..., max_length=200)


@router.post("/public/{slug}/deposit/checkout")
async def deposit_checkout(slug: str, body: DepositCheckoutIn, request: Request):
    """Stripe Checkout for the salon's booking deposit (amount set server-side)."""
    public_rate_limit(request, "deposit-checkout", limit=10, window_sec=600)
    t = await _raw_db.tenants.find_one({"slug": slug}, {"_id": 0, "id": 1, "name": 1, "currency": 1, "deposit_amount": 1})
    if not t:
        raise HTTPException(404, "Salon not found")
    amount = float(t.get("deposit_amount") or 0)
    cur = (t.get("currency") or "INR").lower()
    if amount <= 0 or cur == "inr":
        raise HTTPException(400, "Deposits are not enabled for this salon")
    appt = await _raw_db.appointments.find_one({"id": body.appointment_id, "tenant_id": t["id"]}, {"_id": 0, "id": 1, "deposit_paid": 1})
    if not appt:
        raise HTTPException(404, "Booking not found")
    if appt.get("deposit_paid"):
        raise HTTPException(400, "Deposit already paid")
    from emergentintegrations.payments.stripe.checkout import CheckoutSessionRequest
    sc = _checkout(request)
    session = await sc.create_checkout_session(CheckoutSessionRequest(
        amount=amount, currency=cur,
        success_url=f"{body.origin_url}/deposit/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{body.origin_url}/deposit/cancel",
        metadata={"appointment_id": body.appointment_id, "tenant_id": t["id"], "kind": "booking_deposit"}))
    await _raw_db.payment_transactions.insert_one({
        "session_id": session.session_id, "tenant_id": t["id"], "appointment_id": body.appointment_id,
        "kind": "booking_deposit", "amount": amount, "currency": cur,
        "status": "initiated", "payment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()})
    return {"checkout_url": session.url, "session_id": session.session_id}


async def _mark_deposit_paid(session_id: str) -> None:
    rec = await _raw_db.payment_transactions.find_one({"session_id": session_id, "payment_status": {"$ne": "paid"}}, {"_id": 0})
    if not rec:
        return
    now = datetime.now(timezone.utc).isoformat()
    await _raw_db.payment_transactions.update_one(
        {"session_id": session_id, "payment_status": {"$ne": "paid"}},
        {"$set": {"status": "completed", "payment_status": "paid", "updated_at": now}})
    if rec.get("appointment_id"):
        await _raw_db.appointments.update_one(
            {"id": rec["appointment_id"]},
            {"$set": {"deposit_paid": True, "deposit_amount": rec["amount"],
                      "deposit_currency": rec["currency"], "deposit_paid_at": now}})


@router.get("/payments/deposit/status/{session_id}")
async def deposit_status(session_id: str, request: Request):
    rec = await _raw_db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Transaction not found")
    if rec.get("payment_status") != "paid":
        try:
            status = await _checkout(request).get_checkout_status(session_id)
            if status.payment_status == "paid":
                await _mark_deposit_paid(session_id)
                rec = await _raw_db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        except Exception:
            pass
    return {"session_id": session_id, "status": rec["status"], "payment_status": rec["payment_status"]}


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body_bytes = await request.body()
    try:
        wr = await _checkout(request).handle_webhook(body_bytes, request.headers.get("Stripe-Signature"))
    except Exception:
        raise HTTPException(400, "Invalid webhook")
    if wr.payment_status == "paid" and wr.session_id:
        await _mark_deposit_paid(wr.session_id)
    return {"status": "ok"}
