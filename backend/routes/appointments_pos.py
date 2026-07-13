"""Appointments + Invoices/POS + loyalty settings (extracted from server.py)."""
import asyncio
import io
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from starlette.responses import StreamingResponse

from database import db, _current_tenant_id, _clean
from security import get_current_user, require_tenant_admin, current_tenant
from models import (
    Appointment, AppointmentIn, AppointmentStatusIn, Customer,
    Invoice, InvoiceIn, MAX_CUSTOMER_CREDIT, REFERRAL_REWARD_REFERRER,
)
from services.billing import (
    _gen_invoice_no, _check_stock_or_400, _validate_coupon, _consume_coupon,
    _active_membership, _compute_invoice_totals, _loyalty_rules,
    _process_benefit_items, _validate_package_redeem_items, _send_billing_receipts,
)
from services.pdf import _render_invoice_pdf

router = APIRouter()


# ---------------- Appointments ----------------
@router.get("/appointments")
async def list_appointments(date: Optional[str] = None, upcoming: bool = False, user=Depends(get_current_user)):
    flt = {}
    if upcoming:
        today = datetime.now(timezone.utc).date().isoformat()
        flt = {"scheduled_at": {"$gte": today}, "status": {"$ne": "cancelled"}}
    elif date:
        if not re.fullmatch(r"\d{4}-\d{2}(-\d{2})?", date):
            raise HTTPException(400, "date must be YYYY-MM-DD or YYYY-MM")
        flt = {"scheduled_at": {"$regex": f"^{date}"}}
    return await db.appointments.find(flt, {"_id": 0}).sort("scheduled_at", 1).to_list(500)


@router.get("/notifications/new-bookings")
async def new_bookings(since: str, _=Depends(require_tenant_admin)):
    """Lightweight polling endpoint — returns bookings created after `since`
    (ISO 8601 datetime). Used by the admin UI to play a chime + toast when a
    customer self-books via the public link."""
    try:
        datetime.fromisoformat(since.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(400, "`since` must be an ISO datetime")
    rows = await db.appointments.find(
        {"created_at": {"$gt": since}},
        {"_id": 0, "id": 1, "customer_name": 1, "staff_name": 1,
         "service_names": 1, "scheduled_at": 1, "total": 1, "created_at": 1},
    ).sort("created_at", -1).limit(20).to_list(20)
    return {
        "server_time": datetime.now(timezone.utc).isoformat(),
        "count": len(rows),
        "bookings": rows,
    }


@router.post("/appointments")
async def create_appointment(body: AppointmentIn, user=Depends(get_current_user)):
    cust = await db.customers.find_one({"id": body.customer_id}, {"_id": 0})
    staff = await db.staff.find_one({"id": body.staff_id}, {"_id": 0})
    if not cust or not staff:
        raise HTTPException(400, "Invalid customer or staff")
    services = await db.services.find({"id": {"$in": body.service_ids}}, {"_id": 0}).to_list(50)
    total = sum(s["price"] for s in services)
    duration = sum(s["duration_min"] for s in services) or 30
    a = Appointment(
        customer_id=cust["id"], customer_name=cust["name"],
        staff_id=staff["id"], staff_name=staff["name"],
        service_ids=[s["id"] for s in services],
        service_names=[s["name"] for s in services],
        scheduled_at=body.scheduled_at, duration_min=duration,
        notes=body.notes, total=total,
    ).model_dump()
    await db.appointments.insert_one(a)
    return _clean(a)


async def _appt_confirmation_whatsapp(appt: dict, phone: str, aid: str, user: dict):
    """Build the confirmation WhatsApp for an appointment. Managers get a pending
    approval request instead of a direct link. Returns (whatsapp_url, wa_request_created)."""
    from urllib.parse import quote
    tenant = await db.tenants.find_one({"id": user.get("tenant_id")}, {"_id": 0})
    salon = (tenant or {}).get("name", "our salon")
    try:
        dt = datetime.fromisoformat(str(appt["scheduled_at"]).replace("Z", "+00:00"))
        when = dt.astimezone(timezone(timedelta(hours=5, minutes=30))).strftime("%d %b %Y, %I:%M %p")
    except Exception:
        when = str(appt.get("scheduled_at", ""))
    services = ", ".join(appt.get("service_names") or [])
    msg = (f"Hi {appt.get('customer_name', '')} ✨ Your booking at {salon} is CONFIRMED!\n\n"
           f"🗓 {when}\n💇 {services}\n💰 ₹{appt.get('total', 0):g}\n\nSee you soon!")
    wa_phone = phone if len(phone) > 10 else f"91{phone}"
    if user.get("role") == "manager":
        # Managers can't message customers directly — queue for admin approval.
        await db.whatsapp_requests.insert_one({
            "id": str(uuid.uuid4()), "requested_by": user["id"],
            "requested_by_name": user.get("name") or user.get("email"),
            "client_name": appt.get("customer_name", ""), "client_phone": wa_phone,
            "message": msg, "kind": "confirmation", "status": "pending",
            "appointment_id": aid,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return None, True
    return f"https://wa.me/{wa_phone}?text={quote(msg)}", False


async def _crm_count_completed_appt(appt: dict, phone: Optional[str], aid: str):
    """Service done — NOW the client enters the CRM with visit + spend recorded."""
    cust = await db.customers.find_one({"phone": phone}, {"_id": 0}) if phone else None
    if not cust and appt.get("customer_id"):
        cust = await db.customers.find_one({"id": appt["customer_id"]}, {"_id": 0})
    sets = {"crm_status": "active", "last_visited": appt.get("scheduled_at")}
    if appt.get("gender"):
        sets["gender"] = appt["gender"]
    inc = {"visits": 1, "total_spent": float(appt.get("total") or 0)}
    if cust:
        await db.customers.update_one({"id": cust["id"]}, {"$set": sets, "$inc": inc})
    else:
        new_cust = Customer(
            name=appt.get("customer_name", "Walk-in"), phone=phone or "",
            visits=1, total_spent=float(appt.get("total") or 0),
        ).model_dump()
        new_cust.update(sets)
        await db.customers.insert_one(new_cust)
    await db.appointments.update_one({"id": aid}, {"$set": {"crm_counted": True}})


@router.put("/appointments/{aid}/status")
async def update_appt_status(aid: str, body: AppointmentStatusIn, user=Depends(get_current_user)):
    await db.appointments.update_one({"id": aid}, {"$set": {"status": body.status}})
    appt = await db.appointments.find_one({"id": aid}, {"_id": 0})
    if not appt:
        raise HTTPException(404, "Appointment not found")

    phone = appt.get("customer_phone")
    if not phone and appt.get("customer_id"):
        c = await db.customers.find_one({"id": appt["customer_id"]}, {"_id": 0})
        phone = c.get("phone") if c else None

    whatsapp_url = None
    crm_updated = False
    wa_request_created = False

    if body.status == "confirmed" and phone:
        whatsapp_url, wa_request_created = await _appt_confirmation_whatsapp(appt, phone, aid, user)

    if body.status == "completed" and not appt.get("crm_counted"):
        await _crm_count_completed_appt(appt, phone, aid)
        crm_updated = True

    return {"appointment": appt, "whatsapp_url": whatsapp_url, "crm_updated": crm_updated, "wa_request_created": wa_request_created}


@router.delete("/appointments/{aid}")
async def del_appointment(aid: str, user=Depends(get_current_user)):
    await db.appointments.delete_one({"id": aid})
    return {"ok": True}


# ---------------- Invoices / POS ----------------
@router.get("/invoices")
async def list_invoices(user=Depends(get_current_user)):
    return await db.invoices.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


class LoyaltySettingsIn(BaseModel):
    earn_per_100: float = Field(5, ge=0, le=100)
    max_redeem_per_visit: int = Field(200, ge=0, le=100000)
    min_bill_to_redeem: float = Field(1000, ge=0, le=1000000)


@router.get("/settings/loyalty")
async def get_loyalty_settings(user=Depends(get_current_user), t=Depends(current_tenant)):
    return _loyalty_rules(t)


@router.put("/settings/loyalty")
async def save_loyalty_settings(body: LoyaltySettingsIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    await db.tenants.update_one({"id": t["id"]}, {"$set": {"loyalty": body.model_dump()}})
    return _loyalty_rules({"loyalty": body.model_dump()})


@router.get("/invoices/{inv_id}/pdf")
async def invoice_pdf(inv_id: str, user=Depends(get_current_user), t=Depends(current_tenant)):
    inv = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    pdf_bytes = await asyncio.to_thread(_render_invoice_pdf, inv, t)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{inv.get("invoice_no") or inv_id}.pdf"'},
    )


def _check_wallet_balance(cust: dict, total: float):
    bal = float(cust.get("wallet_balance") or 0)
    if bal < total:
        raise HTTPException(400, f"Insufficient wallet balance — ₹{bal:.0f} available, bill is ₹{total:.0f}")


async def _record_wallet_redeem(cust: dict, inv: dict):
    await db.customers.update_one({"id": cust["id"]}, {"$inc": {"wallet_balance": -inv["total"]}})
    await db.wallet_txns.insert_one({
        "id": str(uuid.uuid4()), "customer_id": cust["id"], "customer_name": cust["name"],
        "type": "redeem", "credit": -inv["total"], "label": f"Bill {inv['invoice_no']}",
        "invoice_id": inv["id"], "created_at": datetime.now(timezone.utc).isoformat()})


async def _resolve_billing_context(body: InvoiceIn, cust: dict) -> dict:
    """Gather tenant/tax/branch/membership/coupon/stock/loyalty inputs for billing."""
    tid = _current_tenant_id.get()
    tenant_doc = await db.tenants.find_one({"id": tid}, {"_id": 0}) if tid else None
    # Tax is ONLY applied when the tenant has opted-in by configuring GST settings.
    tax_pct = float(tenant_doc.get("tax_pct") or 0) if (tenant_doc and tenant_doc.get("tax_enabled")) else 0.0
    branch = None
    if body.branch_id:
        branch = next((b for b in (tenant_doc or {}).get("branches", []) if b.get("id") == body.branch_id), None)
    membership = await _active_membership(cust["id"])
    coupon = await _validate_coupon(body.coupon_code)
    if coupon and not await _consume_coupon(coupon):
        raise HTTPException(400, "This coupon has reached its usage limit")
    needed = await _check_stock_or_400(body.items)
    loyalty_rules = _loyalty_rules(tenant_doc)
    totals = _compute_invoice_totals(
        body.items, cust, body.discount, tax_pct,
        membership_pct=float(membership["discount_pct"]) if membership else 0.0,
        coupon=coupon, redeem_points=body.redeem_points, loyalty_rules=loyalty_rules)
    return {"tenant_doc": tenant_doc, "branch": branch, "coupon": coupon,
            "needed": needed, "loyalty_rules": loyalty_rules, "totals": totals}


async def _apply_post_invoice_effects(cust: dict, totals: dict, loyalty_rules: dict, needed: dict) -> int:
    """Customer stats + loyalty points + deferred referral reward + stock decrement. Returns points earned."""
    points_earned = int(int(totals["total"] // 100) * float(loyalty_rules.get("earn_per_100") or 0))
    cust_inc = {"total_spent": totals["total"], "visits": 1,
                "loyalty_points": points_earned - totals["points_used"]}
    if totals["referral_credit_used"] > 0:
        cust_inc["referral_credit"] = -totals["referral_credit_used"]
    await db.customers.update_one({"id": cust["id"]}, {"$inc": cust_inc})

    # SEC-001: release the referrer's reward only after the referred guest actually pays.
    if cust.get("referral_pending") and cust.get("referred_by"):
        await db.customers.update_one({"id": cust["id"]}, {"$unset": {"referral_pending": ""}})
        referrer = await db.customers.find_one(
            {"id": cust["referred_by"]}, {"_id": 0, "id": 1, "referral_credit": 1})
        if referrer and float(referrer.get("referral_credit") or 0) < MAX_CUSTOMER_CREDIT:
            await db.customers.update_one(
                {"id": referrer["id"]}, {"$inc": {"referral_credit": REFERRAL_REWARD_REFERRER}})

    for pid, qty in needed.items():
        await db.products.update_one({"id": pid}, {"$inc": {"stock": -qty}})
    return points_earned


@router.post("/invoices")
async def create_invoice(body: InvoiceIn, user=Depends(get_current_user)):
    cust = await db.customers.find_one({"id": body.customer_id}, {"_id": 0})
    if not cust:
        raise HTTPException(400, "Invalid customer")
    staff = await db.staff.find_one({"id": body.staff_id}, {"_id": 0}) if body.staff_id else None

    await _validate_package_redeem_items(body.items, cust)
    ctx = await _resolve_billing_context(body, cust)
    totals, coupon, branch = ctx["totals"], ctx["coupon"], ctx["branch"]

    if body.payment_mode == "salon_wallet":
        _check_wallet_balance(cust, totals["total"])

    inv = Invoice(
        invoice_no=await _gen_invoice_no(),
        customer_id=cust["id"], customer_name=cust["name"],
        staff_id=staff["id"] if staff else None,
        staff_name=staff["name"] if staff else None,
        items=body.items, subtotal=totals["subtotal"], discount=totals["discount"],
        tax=totals["tax"], total=totals["total"], payment_mode=body.payment_mode,
        appointment_id=body.appointment_id,
        branch_id=branch["id"] if branch else None,
        branch_name=branch["name"] if branch else None,
    ).model_dump()
    inv["membership_discount"] = totals["membership_discount"]
    inv["coupon_code"] = coupon["code"] if coupon else None
    inv["coupon_discount"] = totals["coupon_discount"]
    inv["points_used"] = totals["points_used"]
    await db.invoices.insert_one(inv)

    if body.payment_mode == "salon_wallet":
        await _record_wallet_redeem(cust, inv)

    points_earned = await _apply_post_invoice_effects(cust, totals, ctx["loyalty_rules"], ctx["needed"])
    await _process_benefit_items(inv, cust)

    inv["points_earned"] = points_earned
    inv["receipts"] = await _send_billing_receipts(inv, cust, ctx["tenant_doc"], points_earned)
    return _clean(inv)
