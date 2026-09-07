"""Guest (POS) invoice PDF helpers: resolve logos/customer, render, and email one-tap."""
import asyncio
import base64

from database import _raw_db
from services.pdf import _render_invoice_pdf
from services.pdf_brand import image_bytes_from_url, platform_logo_bytes


async def guest_invoice_pdf(inv: dict, tenant: dict) -> bytes:
    cust = await _raw_db.customers.find_one({"id": inv.get("customer_id")}, {"_id": 0, "phone": 1, "email": 1, "gstin": 1}) or {}
    brand, salon = await asyncio.gather(platform_logo_bytes(), image_bytes_from_url(tenant.get("logo_url")))
    return await asyncio.to_thread(_render_invoice_pdf, inv, tenant, {"brand_logo": brand, "salon_logo": salon, "customer": cust})


async def guest_invoice_attachment(inv: dict, tenant: dict) -> dict:
    pdf = await guest_invoice_pdf(inv, tenant)
    return {"filename": f"{inv.get('invoice_no') or 'invoice'}.pdf", "content": base64.b64encode(pdf).decode()}


async def email_guest_invoice(inv: dict, tenant: dict, to_email: str) -> dict:
    from receipt_email import send_invoice_receipt_email
    att = await guest_invoice_attachment(inv, tenant)
    return await send_invoice_receipt_email(tenant, inv, to_email, int(inv.get("points_earned") or 0), extra_attachments=[att])
