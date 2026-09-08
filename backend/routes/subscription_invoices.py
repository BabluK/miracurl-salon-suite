"""Subscription invoices: tenant downloads, HQ list/resend/backfill, biller identity."""
import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

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
    """Mail the full tenant register (CSV) to booking@miracurl-suite.com so HQ has a paper trail in the inbox."""
    import base64
    from email_service import _send_email
    from services.tenant_profile_pdf import tenants_csv
    body = await tenants_csv()
    n = max(0, body.count("\n") - 1)
    to = ["booking@miracurl-suite.com"]
    status = await _send_email(
        to, f"📋 Miracurl tenant register — {n} businesses ({datetime.now(timezone.utc).strftime('%d %b %Y')})",
        f"<div style='font-family:Arial,sans-serif;max-width:560px'><h2 style='margin:0 0 8px'>Tenant register</h2>"
        f"<p>{n} salons & restaurants on file as of {datetime.now(timezone.utc).strftime('%d %b %Y, %H:%M UTC')}. "
        f"Full details (owner, contacts, trial & subscription dates, plan) are in the attached CSV — open it in Excel or Google Sheets.</p>"
        f"<p style='color:#888;font-size:12px'>Sent by {user.get('email')} from Miracurl HQ → Tenants.</p></div>",
        attachments=[{"filename": f"miracurl-tenants-{datetime.now(timezone.utc).date()}.csv", "content": base64.b64encode(body.encode()).decode()}])
    if not status.get("sent"):
        raise HTTPException(400, status.get("error") or "Email failed")
    return {"ok": True, "sent_to": to[0], "tenants": n}


@router.get("/super-admin/tenants/{tid}/profile.pdf")
async def hq_tenant_profile_pdf(tid: str, user=Depends(require_super_admin)):
    from services.tenant_profile_pdf import render_tenant_profile
    t = await _raw_db.tenants.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    pdf = await render_tenant_profile(t)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="Miracurl-Account-Profile-{t["slug"]}.pdf"'})
