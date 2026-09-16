"""Subscription invoices: tenant downloads, HQ list/resend/backfill, biller identity."""
import asyncio
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from typing import Optional

from database import _raw_db
from security import current_tenant, require_super_admin, require_tenant_admin
from services.pdf_brand import image_bytes_from_url, platform_logo_bytes
from services.subscription_invoice import (
    build_invoice_pdf, build_receipt_pdf, build_terms_pdf, email_invoice_kit,
    get_biller, issue_subscription_kit, save_biller,
)

router = APIRouter()
_BUILDERS = {"invoice": build_invoice_pdf, "receipt": build_receipt_pdf}
_PUBLIC_FIELDS = {"_id": 0, "biller": 0}


def _pdf_response(inv: dict, kind: str) -> Response:
    if kind == "terms":
        pdf, name = build_terms_pdf(inv.get("_logo")), "Miracurl-Terms-and-Conditions.pdf"
    elif kind in _BUILDERS:
        pdf, name = _BUILDERS[kind](inv), f"Miracurl-{kind.title()}-{inv['number']}.pdf"
    else:
        raise HTTPException(404, "Unknown document")
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/billing/invoices")
async def my_invoices(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    rows = await _raw_db.subscription_invoices.find({"tenant_id": t["id"]}, _PUBLIC_FIELDS).sort("created_at", -1).to_list(100)
    return {"invoices": rows}


@router.get("/billing/invoices/{iid}/{kind}.pdf")
async def my_invoice_pdf(iid: str, kind: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    inv = await _raw_db.subscription_invoices.find_one({"id": iid, "tenant_id": t["id"]}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    inv["_logo"] = await platform_logo_bytes()
    inv["_tenant_logo"] = await image_bytes_from_url(inv.get("tenant_logo_url"))
    return await asyncio.to_thread(_pdf_response, inv, kind)


@router.get("/super-admin/invoices")
async def hq_invoices(tenant_id: str | None = None, user=Depends(require_super_admin)):
    flt = {"tenant_id": tenant_id} if tenant_id else {}
    rows = await _raw_db.subscription_invoices.find(flt, _PUBLIC_FIELDS).sort("created_at", -1).to_list(500)
    return {"invoices": rows}


@router.get("/super-admin/invoices/{iid}/{kind}.pdf")
async def hq_invoice_pdf(iid: str, kind: str, user=Depends(require_super_admin)):
    inv = await _raw_db.subscription_invoices.find_one({"id": iid}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    inv["_logo"] = await platform_logo_bytes()
    inv["_tenant_logo"] = await image_bytes_from_url(inv.get("tenant_logo_url"))
    return await asyncio.to_thread(_pdf_response, inv, kind)


@router.post("/super-admin/invoices/{iid}/resend")
async def hq_invoice_resend(iid: str, user=Depends(require_super_admin)):
    inv = await _raw_db.subscription_invoices.find_one({"id": iid}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    inv["biller"] = await get_biller()
    rec = await email_invoice_kit(inv, resend=True)
    if not rec["sent"]:
        raise HTTPException(400, rec.get("error") or "Email failed")
    return {"ok": True, "sent_to": rec["to"], "hq_to": rec.get("hq_to")}


@router.post("/super-admin/invoices/backfill")
async def hq_invoice_backfill(user=Depends(require_super_admin)):
    """Create invoice records (no emails) for older payments that pre-date the invoice kit."""
    pays = await _raw_db.subscription_payments.find(
        {"$or": [{"kind": {"$exists": False}}, {"kind": {"$ne": "razorpay_pending"}}], "subscription_id": {"$exists": True}},
        {"_id": 0}).sort("paid_at", 1).to_list(2000)
    done = {r["payment_id"] for r in await _raw_db.subscription_invoices.find({}, {"_id": 0, "payment_id": 1}).to_list(5000)}
    created = 0
    for p in pays:
        if p["id"] in done:
            continue
        sub = await _raw_db.subscriptions.find_one({"id": p["subscription_id"]}, {"_id": 0})
        if not sub:
            continue
        if await issue_subscription_kit(p, sub, send=False):
            created += 1
    return {"ok": True, "created": created}


class BillerIn(BaseModel):
    legal_name: str = Field(..., min_length=2, max_length=120)
    address: str = Field("", max_length=300)
    gstin: str = Field("", max_length=15)
    pan: str = Field("", max_length=10)
    gst_rate: float = Field(18, ge=0, le=28)
    state_code: str = Field("29", min_length=2, max_length=2)
    email: str = Field("", max_length=120)
    phone: str = Field("", max_length=20)
    signatory: str = Field("", max_length=80)


@router.get("/super-admin/billing-identity")
async def hq_biller_get(user=Depends(require_super_admin)):
    return await get_biller()


@router.put("/super-admin/billing-identity")
async def hq_biller_put(body: BillerIn, user=Depends(require_super_admin)):
    d = body.model_dump()
    d["gstin"] = d["gstin"].upper()
    d["pan"] = d["pan"].upper()
    if d["gstin"] and len(d["gstin"]) != 15:
        raise HTTPException(400, "GSTIN must be 15 characters")
    if d["gstin"]:
        d["state_code"] = d["gstin"][:2]
    return await save_biller(d)


@router.get("/super-admin/tenants-export.csv")
async def hq_tenants_csv(user=Depends(require_super_admin)):
    from services.tenant_profile_pdf import tenants_csv
    body = await tenants_csv()
    return Response(body, media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="miracurl-tenants-{datetime.now(timezone.utc).date()}.csv"'})


@router.post("/super-admin/tenants-export/email")
async def hq_tenants_csv_email(user=Depends(require_super_admin)):
    """Mail the full tenant register (CSV) to booking@miracurl-suite.com (also runs automatically every Monday 9 AM IST)."""
    from services.tenant_profile_pdf import send_tenant_register_email
    res = await send_tenant_register_email(user.get("email") or "super-admin")
    if not res["sent"]:
        raise HTTPException(400, res.get("error") or "Email failed")
    return {"ok": True, "sent_to": "booking@miracurl-suite.com", "tenants": res["tenants"]}


@router.get("/super-admin/tenants-export/status")
async def hq_tenants_register_status(user=Depends(require_super_admin)):
    doc = await _raw_db.platform_settings.find_one({"key": "tenant_register_email"}, {"_id": 0}) or {}
    return {"schedule": "Every Monday · 9:00 AM IST → booking@miracurl-suite.com", **doc}


@router.get("/super-admin/tenants/{tid}/overview")
async def hq_tenant_overview(tid: str, user=Depends(require_super_admin)):
    from services.tenant_profile_pdf import tenant_overview
    t = await _raw_db.tenants.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    return await tenant_overview(t)


@router.get("/super-admin/tenants/{tid}/profile.pdf")
async def hq_tenant_profile_pdf(tid: str, user=Depends(require_super_admin)):
    from services.tenant_profile_pdf import render_tenant_profile
    t = await _raw_db.tenants.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    pdf = await render_tenant_profile(t)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="Miracurl-Account-Profile-{t["slug"]}.pdf"'})


@router.get("/billing/account-profile.pdf")
async def my_account_profile_pdf(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Owner's own Account Profile — same branded sheet HQ attaches to the welcome email."""
    from services.tenant_profile_pdf import render_tenant_profile
    full = await _raw_db.tenants.find_one({"id": t["id"]}, {"_id": 0}) or t
    pdf = await render_tenant_profile(full)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="Miracurl-Account-Profile-{full["slug"]}.pdf"'})


class TrialSetIn(BaseModel):
    months: Optional[int] = Field(None, description="3 | 6 | 9 | 12 — counted from today")
    days: Optional[int] = Field(None, ge=1, le=400, description="N days from today")
    end_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    notify: bool = True  # email the owner the new end date + thank-you note


@router.post("/super-admin/tenants/{tid}/trial")
async def hq_set_trial(tid: str, body: TrialSetIn, user=Depends(require_super_admin)):
    """Set / extend a tenant's free trial (months from today, days from today, or an exact end date)."""
    from dateutil.relativedelta import relativedelta
    t = await _raw_db.tenants.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    if body.months is not None and body.months not in (3, 6, 9, 12):
        raise HTTPException(422, "months must be 3, 6, 9 or 12")
    now = datetime.now(timezone.utc)
    if body.months:
        end = now + relativedelta(months=body.months)
    elif body.days:
        end = now + timedelta(days=body.days)
    elif body.end_date:
        end = datetime.fromisoformat(body.end_date).replace(hour=23, minute=59, tzinfo=timezone.utc)
        if end < now:
            raise HTTPException(400, "End date must be in the future")
    else:
        raise HTTPException(400, "Provide months, days or end_date")
    upd = {"trial_end_date": end.isoformat(), "trial_ends_at": end.isoformat(), "trial_months": body.months,
           "trial_set_by": user.get("email"), "trial_set_at": now.isoformat()}
    if not t.get("subscription_end_date") and t.get("status") in (None, "trial", "cancelled", "suspended"):
        upd["status"] = "trial"
    await _raw_db.tenants.update_one({"id": tid}, {"$set": upd})
    label = ("1 year" if body.months == 12 else f"{body.months} months") if body.months else (f"{body.days} days" if body.days else f"until {body.end_date}")
    days_left = (end.date() - now.date()).days
    email_status = {"sent": False, "error": "no owner email"}
    if body.notify and t.get("owner_email"):
        from email_service import _send_email, trial_extended_email_html
        prev = t.get("trial_end_date") or t.get("trial_ends_at")
        info = {"label": label, "end_date": end.strftime("%d %b %Y"), "days_left": days_left,
                "previous_end": datetime.fromisoformat(str(prev).replace("Z", "+00:00")).strftime("%d %b %Y") if prev else None}
        email_status = await _send_email(
            [t["owner_email"]], f"🎁 {t.get('name') or t['slug']} — your Miracurl free trial now runs until {info['end_date']}",
            trial_extended_email_html({**t, **upd}, info))
    from services.tenant_notices import notify_tenant
    await notify_tenant(tid, "trial", f"🎁 Free trial extended — {label}", f"Your complimentary access now runs until {end.strftime('%d %b %Y')} ({days_left} days left)", "/settings")
    await _raw_db.hq_audit.insert_one({"id": str(uuid.uuid4()), "kind": "trial_set", "tenant_id": tid, "slug": t["slug"],
                                       "by": user.get("email"), "label": label, "end": end.isoformat(), "at": now.isoformat(),
                                       "email_sent": bool(email_status.get("sent")), "email_error": email_status.get("error")})
    return {"ok": True, "trial_end_date": end.isoformat(), "days_left": days_left, "label": label,
            "status": upd.get("status", t.get("status")), "email": {"sent": bool(email_status.get("sent")), "to": t.get("owner_email"), "error": email_status.get("error")}}


class TenantNoteIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


@router.get("/super-admin/tenants/{tid}/notes")
async def hq_tenant_notes(tid: str, user=Depends(require_super_admin)):
    rows = await _raw_db.hq_tenant_notes.find({"tenant_id": tid}, {"_id": 0}).sort("at", -1).to_list(200)
    return {"notes": rows}


@router.post("/super-admin/tenants/{tid}/notes")
async def hq_add_tenant_note(tid: str, body: TenantNoteIn, user=Depends(require_super_admin)):
    if not await _raw_db.tenants.find_one({"id": tid}, {"_id": 1}):
        raise HTTPException(404, "Tenant not found")
    import uuid
    note = {"id": str(uuid.uuid4()), "tenant_id": tid, "text": body.text.strip(), "by": user.get("email"),
            "by_name": user.get("name") or (user.get("email") or "").split("@")[0], "at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.hq_tenant_notes.insert_one(dict(note))
    return note


@router.delete("/super-admin/tenants/{tid}/notes/{nid}")
async def hq_delete_tenant_note(tid: str, nid: str, user=Depends(require_super_admin)):
    r = await _raw_db.hq_tenant_notes.delete_one({"id": nid, "tenant_id": tid})
    if not r.deleted_count:
        raise HTTPException(404, "Note not found")
    return {"ok": True}


@router.get("/super-admin/email-log")
async def hq_email_log(limit: int = 100, q: str = "", status: str = "all", user=Depends(require_super_admin)):
    """HQ: every email the platform tried to send — recipient, subject, delivered / failed / skipped and why."""
    flt: dict = {}
    if status == "failed":
        flt["sent"] = False
        flt["skipped"] = {"$ne": True}
    elif status == "skipped":
        flt["skipped"] = True
    elif status == "sent":
        flt["sent"] = True
    if q:
        rx = {"$regex": q.strip(), "$options": "i"}
        flt["$or"] = [{"to": rx}, {"subject": rx}, {"error": rx}]
    rows = await _raw_db.email_log.find(flt, {"_id": 0, "html": 0, "attachments_payload": 0, "resend_opts": 0}).sort("at", -1).to_list(max(1, min(limit, 500)))
    for r in rows:
        r["can_resend"] = True
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    agg = await _raw_db.email_log.aggregate([{"$match": {"at": {"$gte": since}}}, {"$group": {
        "_id": None, "total": {"$sum": 1}, "sent": {"$sum": {"$cond": ["$sent", 1, 0]}},
        "skipped": {"$sum": {"$cond": [{"$eq": ["$skipped", True]}, 1, 0]}}}}]).to_list(1)
    a = agg[0] if agg else {"total": 0, "sent": 0, "skipped": 0}
    from email_service import _resend_config_error
    cfg = _resend_config_error()
    return {"rows": rows, "week": {"total": a["total"], "sent": a["sent"], "skipped": a["skipped"], "failed": a["total"] - a["sent"] - a["skipped"]},
            "provider_ok": not cfg, "provider_error": (cfg or {}).get("error"), "sender": os.environ.get("SENDER_EMAIL", "")}


class EmailResendIn(BaseModel):
    to: Optional[list[str]] = None  # corrected recipient(s); defaults to the original


@router.delete("/super-admin/email-log")
async def hq_clear_email_log(user=Depends(require_super_admin)):
    """HQ: wipe the email delivery log history."""
    res = await _raw_db.email_log.delete_many({})
    logging.getLogger("email").info("email_log cleared by %s (%d rows)", user.get("email"), res.deleted_count)
    return {"ok": True, "deleted": res.deleted_count}


@router.post("/super-admin/email-log/{eid}/resend")
async def hq_email_resend(eid: str, body: EmailResendIn, user=Depends(require_super_admin)):
    """One-tap resend of a logged email (optionally to a corrected address). Logs a fresh row."""
    from email_service import _send_email
    row = await _raw_db.email_log.find_one({"id": eid}, {"_id": 0})
    if not row:
        raise HTTPException(404, "Log entry not found")
    if not row.get("html"):
        raise HTTPException(400, "This email was sent before resend support — body not stored")
    to = [x.strip().lower() for x in (body.to or row.get("to") or []) if x and "@" in x]
    if not to:
        raise HTTPException(400, "Provide at least one valid recipient")
    opts = dict(row.get("resend_opts") or {})
    if row.get("attachments_payload"):
        opts["attachments"] = row["attachments_payload"]
    res = await _send_email(to, row["subject"], row["html"], _resent_from=eid, **opts)
    await _raw_db.email_log.update_one({"id": eid}, {"$set": {"resent_at": datetime.now(timezone.utc).isoformat(), "resent_by": user.get("email"),
                                                             "resent_ok": bool(res.get("sent")), "resent_to": to}})
    if not res.get("sent"):
        raise HTTPException(400, res.get("error") or "Resend failed")
    return {"ok": True, "sent_to": to, "attachments": len(opts.get("attachments") or []), "provider_id": res.get("id")}
