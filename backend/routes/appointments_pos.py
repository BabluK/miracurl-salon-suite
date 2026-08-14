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
from security import get_current_user, require_tenant_admin, current_tenant, branch_lock
from models import (
    Appointment, AppointmentIn, AppointmentStatusIn, Customer,
    Invoice, InvoiceIn, MAX_CUSTOMER_CREDIT, REFERRAL_REWARD_REFERRER,
)
from services.billing import (
    _gen_invoice_no, _check_stock_or_400, _validate_coupon, _consume_coupon,
    _active_membership, _compute_invoice_totals, _loyalty_rules,
    _process_benefit_items, _validate_package_redeem_items, _send_billing_receipts,
    _apply_membership_cashback,
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
    rows = await db.appointments.find(flt, {"_id": 0}).sort("scheduled_at", 1).to_list(500)
    # Attach the guest's phone so WhatsApp confirmations open the right chat directly.
    need = list({r["customer_id"] for r in rows if r.get("customer_id") and not r.get("customer_phone")})
    if need:
        custs = await db.customers.find({"id": {"$in": need}}, {"_id": 0, "id": 1, "phone": 1}).to_list(len(need))
        pmap = {c["id"]: c.get("phone") for c in custs}
        for r in rows:
            if not r.get("customer_phone"):
                r["customer_phone"] = pmap.get(r.get("customer_id"))
    return rows


@router.get("/notifications/new-bookings")
async def new_bookings(since: str, user=Depends(get_current_user), t=Depends(current_tenant)):
    """Lightweight polling endpoint — returns bookings created after `since`
    (ISO 8601 datetime). Used by the admin/manager UI to play a chime + list
    notifications when a customer self-books via the public link."""
    if user.get("role") not in ("admin", "super_admin", "manager"):
        raise HTTPException(403, "Not allowed")
    try:
        datetime.fromisoformat(since.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(400, "`since` must be an ISO datetime")
    rows = await db.appointments.find(
        {"created_at": {"$gt": since}},
        {"_id": 0, "id": 1, "customer_name": 1, "staff_name": 1,
         "service_names": 1, "scheduled_at": 1, "total": 1, "created_at": 1},
    ).sort("created_at", -1).limit(20).to_list(20)
    from database import _raw_db
    gcs = await _raw_db.gift_cards.find(
        {"tenant_id": t["id"], "issued_at": {"$gt": since}, "status": {"$in": ["active", "scheduled"]}},
        {"_id": 0, "id": 1, "amount": 1, "buyer_name": 1, "recipient_name": 1,
         "occasion": 1, "issued_at": 1},
    ).sort("issued_at", -1).limit(10).to_list(10)
    cms = await _raw_db.customer_memberships.find(
        {"tenant_id": t["id"], "purchased_at": {"$gt": since}},
        {"_id": 0, "id": 1, "member_id": 1, "name": 1, "tier": 1, "amount": 1,
         "purchased_at": 1, "customer_id": 1},
    ).sort("purchased_at", -1).limit(10).to_list(10)
    for cm in cms:
        c = await db.customers.find_one({"id": cm.get("customer_id")}, {"_id": 0, "name": 1})
        cm["customer_name"] = (c or {}).get("name") or "New member"
    return {
        "server_time": datetime.now(timezone.utc).isoformat(),
        "count": len(rows) + len(gcs) + len(cms),
        "gift_cards": gcs,
        "memberships": cms,
        "bookings": rows,
    }


def _ist_when(raw) -> str:
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        return dt.astimezone(timezone(timedelta(hours=5, minutes=30))).strftime("%d %b %Y, %I:%M %p")
    except ValueError:
        return str(raw or "")


async def _tenant_for_sms(user: dict):
    from sms_service import sms_configured
    if not sms_configured():
        return None
    return await db.tenants.find_one({"id": user.get("tenant_id")}, {"_id": 0, "id": 1, "name": 1})


def _queue_sms(t: dict, phone: str, text: str, kind: str) -> None:
    from sms_service import send_tenant_sms
    asyncio.create_task(send_tenant_sms(t["id"], phone, text, kind=kind))


async def _send_booking_sms(user: dict, cust: dict, staff: dict, services: list, scheduled_at) -> None:
    if not cust.get("phone"):
        return
    t = await _tenant_for_sms(user)
    if not t:
        return
    _queue_sms(t, cust["phone"],
               f"{t.get('name') or 'Your salon'}: Hi {cust['name']}, your booking is CONFIRMED! "
               f"{', '.join(s['name'] for s in services)} on {_ist_when(scheduled_at)} with {staff['name']}. See you soon!",
               "booking")


async def _send_cancellation_sms(user: dict, appt: dict, phone: str) -> None:
    t = await _tenant_for_sms(user)
    if not t:
        return
    _queue_sms(t, phone,
               f"{t.get('name') or 'Your salon'}: Hi {appt.get('customer_name', '')}, your booking "
               f"({', '.join(appt.get('service_names') or ['appointment'])}) on {_ist_when(appt.get('scheduled_at'))} "
               "has been CANCELLED. Reply or call us to rebook anytime.",
               "cancellation")


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
    await _send_booking_sms(user, cust, staff, services, body.scheduled_at)
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


async def _appt_customer_phone(appt: dict) -> str | None:
    phone = appt.get("customer_phone")
    if phone or not appt.get("customer_id"):
        return phone
    c = await db.customers.find_one({"id": appt["customer_id"]}, {"_id": 0})
    return c.get("phone") if c else None


@router.put("/appointments/{aid}/status")
async def update_appt_status(aid: str, body: AppointmentStatusIn, user=Depends(get_current_user)):
    await db.appointments.update_one({"id": aid}, {"$set": {"status": body.status}})
    appt = await db.appointments.find_one({"id": aid}, {"_id": 0})
    if not appt:
        raise HTTPException(404, "Appointment not found")

    phone = await _appt_customer_phone(appt)

    whatsapp_url = None
    crm_updated = False
    wa_request_created = False

    if body.status == "confirmed" and phone:
        whatsapp_url, wa_request_created = await _appt_confirmation_whatsapp(appt, phone, aid, user)

    if body.status == "cancelled" and phone:
        await _send_cancellation_sms(user, appt, phone)

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
async def list_invoices(status: Optional[str] = None, user=Depends(get_current_user)):
    flt = {"status": status} if status else {}
    return await db.invoices.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)


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


def _tenant_tax_pct(tenant_doc: Optional[dict]) -> float:
    """Tax is ONLY applied when the tenant has opted-in by configuring GST settings."""
    if tenant_doc and tenant_doc.get("tax_enabled"):
        return float(tenant_doc.get("tax_pct") or 0)
    return 0.0


def _find_branch(tenant_doc: Optional[dict], branch_id: Optional[str]) -> Optional[dict]:
    if not branch_id:
        return None
    return next((b for b in (tenant_doc or {}).get("branches", []) if b.get("id") == branch_id), None)


async def _resolve_billing_context(body: InvoiceIn, cust: dict) -> dict:
    """Gather tenant/tax/branch/membership/coupon/stock/loyalty inputs for billing."""
    tid = _current_tenant_id.get()
    tenant_doc = await db.tenants.find_one({"id": tid}, {"_id": 0}) if tid else None
    membership = await _active_membership(cust["id"])
    coupon = await _validate_coupon(body.coupon_code)
    if coupon and not await _consume_coupon(coupon):
        raise HTTPException(400, "This coupon has reached its usage limit")
    needed = await _check_stock_or_400(body.items)
    loyalty_rules = _loyalty_rules(tenant_doc)
    totals = _compute_invoice_totals(
        body.items, cust, body.discount, _tenant_tax_pct(tenant_doc),
        membership_pct=float(membership["discount_pct"]) if membership else 0.0,
        coupon=coupon, redeem_points=body.redeem_points, loyalty_rules=loyalty_rules)
    return {"tenant_doc": tenant_doc, "branch": _find_branch(tenant_doc, body.branch_id), "coupon": coupon,
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


async def _resolve_tip(body: InvoiceIn, staff: dict | None) -> dict | None:
    """Who receives the tip: explicit pick at POS, else the invoice stylist."""
    tsid = body.tip_staff_id or (staff["id"] if staff else None)
    if not tsid:
        return None
    return await db.staff.find_one({"id": tsid}, {"_id": 0, "id": 1, "name": 1})


def _build_invoice_doc(body: InvoiceIn, cust: dict, staff: dict | None, ctx: dict,
                       tip: float, tip_staff: dict | None, invoice_no: str) -> dict:
    totals, coupon, branch = ctx["totals"], ctx["coupon"], ctx["branch"]
    inv = Invoice(
        invoice_no=invoice_no,
        customer_id=cust["id"], customer_name=cust["name"],
        staff_id=staff["id"] if staff else None,
        staff_name=staff["name"] if staff else None,
        items=body.items, subtotal=totals["subtotal"], discount=totals["discount"],
        tax=totals["tax"], total=totals["total"], payment_mode=body.payment_mode,
        tip=tip,
        tip_staff_id=tip_staff["id"] if tip_staff else None,
        tip_staff_name=tip_staff["name"] if tip_staff else None,
        appointment_id=body.appointment_id,
        branch_id=branch["id"] if branch else None,
        branch_name=branch["name"] if branch else None,
    ).model_dump()
    inv["membership_discount"] = totals["membership_discount"]
    inv["coupon_code"] = coupon["code"] if coupon else None
    inv["coupon_discount"] = totals["coupon_discount"]
    inv["points_used"] = totals["points_used"]
    return inv


async def _apply_gift_card(inv: dict, code: str, tenant_id: str, total: float) -> None:
    from routes.gift_cards import redeem_gift_card
    gc = await redeem_gift_card(code, tenant_id, total, inv["id"])
    inv["gift_card_code"] = gc["code"]
    inv["gift_card_applied"] = gc["applied"]
    inv["gift_card_balance_left"] = gc["balance_left"]


def _apply_locked_branch(ctx: dict, user: dict) -> None:
    """Branch-locked managers always bill under their own branch."""
    locked_branch = branch_lock(user, None)
    if not locked_branch:
        return
    if locked_branch == "__main__":
        ctx["branch"] = None
        return
    lb = locked_branch.strip().casefold()
    b = next((x for x in (ctx["tenant_doc"].get("branches") or [])
              if (x.get("name") or "").strip().casefold() == lb), None)
    if b:
        ctx["branch"] = b


async def _handle_wallet_payment(body: InvoiceIn, cust: dict, inv: dict, total: float, phase: str) -> None:
    if body.payment_mode != "salon_wallet":
        return
    if phase == "check":
        _check_wallet_balance(cust, total)
    else:
        await _record_wallet_redeem(cust, inv)


class InvoiceCompleteIn(BaseModel):
    payment_mode: str = "cash"


@router.post("/invoices/{iid}/complete")
async def complete_open_invoice(iid: str, body: InvoiceCompleteIn,
                                user=Depends(get_current_user), t=Depends(current_tenant)):
    """Settle an OPEN bill: mark completed + apply points, stock, stats and member cashback."""
    inv = await db.invoices.find_one({"id": iid}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.get("status") != "open":
        raise HTTPException(400, "This bill is already completed")
    cust = await db.customers.find_one({"id": inv["customer_id"]}, {"_id": 0})
    if not cust:
        raise HTTPException(400, "Guest not found")
    await db.invoices.update_one(
        {"id": iid}, {"$set": {"status": "completed", "payment_mode": body.payment_mode,
                               "completed_at": datetime.now(timezone.utc).isoformat(),
                               "completed_by": user.get("email")}})
    inv["status"], inv["payment_mode"] = "completed", body.payment_mode
    totals = {"total": float(inv.get("total") or 0), "points_used": 0, "referral_credit_used": 0}
    needed = {i["ref_id"]: int(i.get("qty") or 1) for i in inv.get("items", []) if i.get("type") == "product"}
    inv["points_earned"] = await _apply_post_invoice_effects(cust, totals, _loyalty_rules(t), needed)
    inv["membership_cashback"] = await _apply_membership_cashback(inv, cust)
    inv["gift_cards_issued"] = await _issue_pos_gift_cards(inv, cust, t)
    return _clean(inv)


@router.delete("/invoices/{iid}")
async def delete_open_invoice(iid: str, user=Depends(require_tenant_admin)):
    """Owners can delete a wrongly-created OPEN bill (no payments/stock/points were applied yet)."""
    inv = await db.invoices.find_one({"id": iid}, {"_id": 0, "status": 1, "invoice_no": 1})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.get("status") != "open":
        raise HTTPException(400, "Only OPEN (unpaid) bills can be deleted")
    await db.invoices.delete_one({"id": iid})
    return {"ok": True, "invoice_no": inv.get("invoice_no")}


def _gc_contact_fields(meta: dict, cust: dict) -> dict:
    import re as _re

    def digits(v):
        return _re.sub(r"\D", "", str(v or ""))[:15]
    return {"buyer_name": (meta.get("buyer_name") or cust.get("name") or "")[:80],
            "buyer_email": (meta.get("buyer_email") or cust.get("email") or "").lower(),
            "buyer_phone": digits(meta.get("buyer_phone") or cust.get("phone")),
            "recipient_name": (meta.get("recipient_name") or "")[:80],
            "recipient_email": (meta.get("recipient_email") or "").strip().lower(),
            "recipient_whatsapp": digits(meta.get("recipient_whatsapp"))}


def _gift_card_doc_from_item(it: dict, cust: dict, tenant_doc: dict, inv: dict) -> dict:
    from services.gift_card_service import _gc_settings
    meta = it.get("gift_meta") or {}
    amt = round(float(it.get("price") or 0) * int(it.get("qty") or 1), 2)
    now = datetime.now(timezone.utc).isoformat()
    return {"id": str(uuid.uuid4()), "tenant_id": tenant_doc["id"],
            "tenant_slug": tenant_doc.get("slug") or "",
            "code": "", "occasion": meta.get("occasion") or "just-because",
            "amount": amt, "balance": amt, "currency": tenant_doc.get("currency") or "INR",
            **_gc_contact_fields(meta, cust),
            "message": (meta.get("message") or "")[:400], "send_on": meta.get("send_on") or "",
            "pay_method": "pos", "status": "pending_payment",
            "validity_days": _gc_settings(tenant_doc)["validity_days"],
            "created_at": now, "paid_at": now, "pos_invoice_id": inv["id"]}


async def _issue_pos_gift_cards(inv: dict, cust: dict, tenant_doc: dict) -> list:
    """Gift cards sold as POS line items are issued only once the bill is PAID."""
    from database import _raw_db
    from routes.gift_cards import _issue_gift_card
    issued = []
    for it in inv.get("items", []):
        if it.get("type") != "gift_card":
            continue
        gc = _gift_card_doc_from_item(it, cust, tenant_doc, inv)
        await _raw_db.gift_cards.insert_one({**gc})
        out = await _issue_gift_card(gc["id"])
        issued.append({"code": out.get("code") or "", "status": out.get("status"),
                       "recipient_name": gc["recipient_name"],
                       "whatsapp_url": out.get("whatsapp_url") or "", "amount": gc["amount"]})
    if issued:
        await db.invoices.update_one({"id": inv["id"]}, {"$set": {"gift_cards_issued": issued}})
    return issued


async def _reserve_wallet_credit(body, cust: dict, inv: dict, total: float) -> float:
    """Validate & mark partial wallet credit on the invoice (deducted after insert)."""
    if body.payment_mode == "salon_wallet" or float(body.wallet_apply or 0) <= 0:
        return 0.0
    wallet_apply = round(min(float(body.wallet_apply), total), 2)
    bal = float(cust.get("wallet_balance") or 0)
    if bal < wallet_apply:
        raise HTTPException(400, f"Wallet has only ₹{bal:.0f} — can't apply ₹{wallet_apply:.0f}")
    inv["wallet_applied"] = wallet_apply
    return wallet_apply


async def _deduct_wallet_credit(cust: dict, inv: dict, wallet_apply: float, payment_mode: str):
    await db.customers.update_one({"id": cust["id"]}, {"$inc": {"wallet_balance": -wallet_apply}})
    await db.wallet_txns.insert_one({
        "id": str(uuid.uuid4()), "customer_id": cust["id"], "customer_name": cust["name"],
        "type": "redeem", "credit": -wallet_apply,
        "label": f"Applied on bill {inv['invoice_no']} (rest via {payment_mode})",
        "invoice_id": inv["id"], "created_at": datetime.now(timezone.utc).isoformat()})


async def _duplicate_bill_guard(body: InvoiceIn):
    """Warn if an identical bill (same guest + same items signature) was punched in the last 3 minutes."""
    if body.force_duplicate:
        return
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()
    recent = await db.invoices.find(
        {"customer_id": body.customer_id, "created_at": {"$gte": cutoff}, "status": {"$ne": "voided"}},
        {"_id": 0, "invoice_no": 1, "total": 1, "items": 1, "created_at": 1}).to_list(10)
    sig = sorted((it.name, int(it.qty or 1), float(it.price or 0)) for it in body.items)
    for r in recent:
        rsig = sorted((it.get("name"), int(it.get("qty") or 1), float(it.get("price") or 0)) for it in r.get("items", []))
        if rsig == sig:
            mins = 0
            try:
                mins = max(0, int((datetime.now(timezone.utc) - datetime.fromisoformat(r["created_at"])).total_seconds() // 60))
            except ValueError:
                pass
            raise HTTPException(
                409,
                f"DUPLICATE_BILL — An identical bill for this guest ({r['invoice_no']}, ₹{round(float(r.get('total') or 0))}) "
                f"was created {mins} minute{'s' if mins != 1 else ''} ago.")


@router.post("/invoices")
async def create_invoice(body: InvoiceIn, user=Depends(get_current_user)):
    cust = await db.customers.find_one({"id": body.customer_id}, {"_id": 0})
    if not cust:
        raise HTTPException(400, "Invalid customer")
    await _duplicate_bill_guard(body)
    staff = await db.staff.find_one({"id": body.staff_id}, {"_id": 0}) if body.staff_id else None

    await _validate_package_redeem_items(body.items, cust)
    ctx = await _resolve_billing_context(body, cust)
    _apply_locked_branch(ctx, user)
    totals = ctx["totals"]

    await _handle_wallet_payment(body, cust, {}, totals["total"], "check")

    tip = round(float(body.tip_amount or 0), 2)
    tip_staff = await _resolve_tip(body, staff) if tip > 0 else None

    inv = _build_invoice_doc(body, cust, staff, ctx, tip, tip_staff, await _gen_invoice_no())
    if body.status == "open":
        # "Create" = save the bill only. No payments, stock, points, cashback or
        # receipts until it's completed from Reports → recent bills.
        inv["status"] = "open"
        await db.invoices.insert_one(inv)
        return _clean(inv)
    wallet_apply = await _reserve_wallet_credit(body, cust, inv, totals["total"])
    if body.gift_card_code:
        await _apply_gift_card(inv, body.gift_card_code, ctx["tenant_doc"]["id"], totals["total"])
    await db.invoices.insert_one(inv)

    await _handle_wallet_payment(body, cust, inv, totals["total"], "redeem")
    if wallet_apply:
        await _deduct_wallet_credit(cust, inv, wallet_apply, body.payment_mode)

    points_earned = await _apply_post_invoice_effects(cust, totals, ctx["loyalty_rules"], ctx["needed"])
    await _process_benefit_items(inv, cust)

    inv["points_earned"] = points_earned
    inv["membership_cashback"] = await _apply_membership_cashback(inv, cust)
    inv["gift_cards_issued"] = await _issue_pos_gift_cards(inv, cust, ctx["tenant_doc"])
    inv["receipts"] = await _send_billing_receipts(inv, cust, ctx["tenant_doc"], points_earned)
    return _clean(inv)


@router.get("/appointments/{aid}/confirmation-card.png")
async def confirmation_card(aid: str, user=Depends(get_current_user), t=Depends(current_tenant)):
    """Branded confirmation card staff attach in WhatsApp. Managers/staff need the admin's wa_direct_send toggle."""
    if user.get("role") not in ("admin", "super_admin") and not t.get("wa_direct_send"):
        raise HTTPException(403, "The owner hasn't enabled direct WhatsApp sending for staff yet")
    a = await db.appointments.find_one({"id": aid}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Appointment not found")
    from PIL import Image, ImageDraw, ImageFont
    from fastapi.responses import Response as _Resp
    from routes.promo_common import FONT_PATH
    W, H = 1080, 1080
    img = Image.new("RGB", (W, H), "#0D0D0D")
    d = ImageDraw.Draw(img)
    gold, cream, grey = "#D4AF37", "#F5EFE0", "#9C9484"
    d.rectangle([28, 28, W - 28, H - 28], outline=gold, width=3)
    d.rectangle([40, 40, W - 40, H - 40], outline="#6d5416", width=1)
    f = lambda s: ImageFont.truetype(FONT_PATH, s)
    def center(y, text, font, fill):
        w = d.textlength(text, font=font)
        d.text(((W - w) / 2, y), text, font=font, fill=fill)
    center(96, (t.get("name") or "MIRACURL").upper(), f(44), gold)
    center(165, (t.get("location") or "").upper()[:60], f(24), grey)
    d.line([200, 230, W - 200, 230], fill="#6d5416", width=1)
    center(280, "APPOINTMENT CONFIRMED", f(58), cream)
    cx, cy = W / 2, 395
    d.ellipse([cx - 42, cy - 42, cx + 42, cy + 42], outline="#3ddc84", width=5)
    d.line([cx - 20, cy + 2, cx - 6, cy + 17], fill="#3ddc84", width=7)
    d.line([cx - 6, cy + 17, cx + 22, cy - 15], fill="#3ddc84", width=7)
    dt = datetime.fromisoformat(str(a["scheduled_at"]).replace("Z", "+00:00"))
    rows = [("GUEST", a.get("customer_name") or "-"),
            ("SERVICE", ", ".join(s.get("name") for s in (a.get("services") or [])) or "Your visit"),
            ("DATE", dt.strftime("%A, %d %B %Y")),
            ("TIME", dt.strftime("%I:%M %p").lstrip("0"))]
    if a.get("staff_name"):
        rows.append(("STYLIST", a["staff_name"]))
    if a.get("total"):
        rows.append(("AMOUNT", f"₹{a['total']:g}"))
    y = 480
    for label, val in rows:
        center(y, label, f(22), grey)
        center(y + 32, str(val)[:48], f(38), cream)
        y += 96
    d.line([200, y + 6, W - 200, y + 6], fill="#6d5416", width=1)
    center(y + 34, "We look forward to pampering you", f(28), gold)
    if t.get("phone"):
        center(y + 82, f"Call us: {t['phone']}", f(24), grey)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return _Resp(content=buf.getvalue(), media_type="image/png",
                 headers={"Content-Disposition": f'inline; filename="confirmation-{aid[:8]}.png"'})
