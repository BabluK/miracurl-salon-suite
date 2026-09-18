"""GST tax invoice PDF for a tenant payment (subscription plan or credit pack)."""
import io
from datetime import datetime

from database import _raw_db
from services.hq_tax import get_profile, tax_breakdown

INV_PREFIX = "MS"


async def _invoice_number(pay: dict, coll) -> str:
    if pay.get("invoice_no"):
        return pay["invoice_no"]
    paid = (pay.get("paid_at") or pay.get("created_at") or datetime.utcnow().isoformat())[:10]
    fy = paid[:4] if paid[5:7] >= "04" else str(int(paid[:4]) - 1)
    seq = await _raw_db.counters.find_one_and_update({"_id": f"tax_invoice_{fy}"}, {"$inc": {"n": 1}}, upsert=True, return_document=True)
    no = f"{INV_PREFIX}/{fy}-{str(int(fy) + 1)[2:]}/{int(seq['n']):05d}"
    await coll.update_one({"id": pay["id"]}, {"$set": {"invoice_no": no}})
    return no


async def find_payment(tenant_id: str, pay_id: str) -> tuple[dict | None, object | None, str]:
    p = await _raw_db.subscription_payments.find_one({"id": pay_id, "tenant_id": tenant_id, "kind": {"$ne": "razorpay_pending"}}, {"_id": 0})
    if p:
        return p, _raw_db.subscription_payments, "plan"
    p = await _raw_db.sms_pack_payments.find_one({"id": pay_id, "tenant_id": tenant_id, "status": "captured"}, {"_id": 0})
    if p:
        return p, _raw_db.sms_pack_payments, "pack"
    return None, None, ""


async def email_invoice(tenant: dict, pay_id: str, label: str = "") -> None:
    """Fire-and-forget after a successful payment: PDF tax invoice to the owner's inbox."""
    import base64
    import logging
    from email_service import _send_email
    try:
        pay, coll, kind = await find_payment(tenant["id"], pay_id)
        if not pay:
            return
        pdf, inv_no = await build_invoice_pdf(tenant, pay, coll, kind, label)
        to = tenant.get("owner_email") or tenant.get("email")
        if not to:
            return
        amt = _money(float(pay.get("amount") or 0))
        html = (f"<div style='font-family:Georgia,serif;max-width:520px;margin:auto;padding:28px;border:1px solid #eee;border-radius:16px'>"
                f"<h2 style='margin:0 0 6px;color:#111'>Payment received — thank you 🙏</h2>"
                f"<p style='color:#555;margin:0 0 14px'>Your GST tax invoice <b>{inv_no}</b> for <b>{amt}</b> is attached as a PDF. "
                f"You can also download any invoice anytime from <b>Settings → Payments &amp; GST invoices</b>.</p>"
                f"<p style='color:#888;font-size:12px'>Miracurl Studio · miracurl-suite.com</p></div>")
        await _send_email([to], f"Tax invoice {inv_no} — {amt} received", html, from_name="Miracurl Billing",
                          attachments=[{"filename": inv_no.replace("/", "-") + ".pdf", "content": base64.b64encode(pdf).decode()}])
    except Exception as e:  # noqa: BLE001 — never let an email problem fail the payment
        logging.getLogger("billing").warning("invoice email failed for %s: %s", pay_id, e)


def _money(v: float) -> str:
    return f"Rs. {v:,.2f}"


async def build_invoice_pdf(t: dict, pay: dict, coll, kind: str, label: str = "") -> tuple[bytes, str]:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    hq = await get_profile()
    tax = pay.get("tax") or tax_breakdown(float(pay.get("amount") or 0) / (1 + float(hq.get("gst_rate_pct") or 0) / 100), hq)
    inv_no = await _invoice_number(pay, coll)
    paid_at = (pay.get("paid_at") or pay.get("created_at") or "")[:10]
    same_state = (t.get("gstin") or "")[:2] == (hq.get("gstin") or hq.get("state_code") or "29")[:2] if t.get("gstin") else True
    desc = (f"Miracurl Suite subscription — {label or pay.get('plan_label') or pay.get('plan') or 'plan'}" if kind == "plan"
            else f"{pay.get('points')} {'WhatsApp' if pay.get('channel') == 'whatsapp' else 'SMS'} message credits ({pay.get('pack')})")
    hsn = "998314"  # IT / SaaS services SAC

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    gold, ink, grey = (0.72, 0.53, 0.04), (0.08, 0.06, 0.04), (0.45, 0.45, 0.45)
    c.setFillColorRGB(*ink); c.rect(0, H - 90, W, 90, fill=1, stroke=0)
    c.setFillColorRGB(*gold); c.setFont("Times-Bold", 22); c.drawString(40, H - 45, "MIRACURL SUITE")
    c.setFillColorRGB(1, 1, 1); c.setFont("Helvetica", 9); c.drawString(40, H - 62, "AI-POWERED BUSINESS MANAGEMENT PLATFORM")
    c.setFont("Helvetica-Bold", 16); c.drawRightString(W - 40, H - 45, "TAX INVOICE")
    c.setFont("Helvetica", 9); c.drawRightString(W - 40, H - 62, f"Invoice No: {inv_no}"); c.drawRightString(W - 40, H - 75, f"Date: {paid_at}")

    y = H - 120
    c.setFillColorRGB(*ink); c.setFont("Helvetica-Bold", 10); c.drawString(40, y, "Supplier"); c.drawString(W / 2 + 10, y, "Billed to")
    c.setFont("Helvetica", 9); c.setFillColorRGB(*grey)
    sup = [hq.get("legal_name") or "Miracurl Studio", hq.get("address") or "Bengaluru, Karnataka, India",
           f"GSTIN: {hq['gstin']}" if hq.get("gstin") else "GSTIN: applied for / pending", f"MSME (Udyam): {hq['msme']}" if hq.get("msme") else ""]
    bill = [t.get("name") or "", t.get("location") or "", f"GSTIN: {t['gstin']}" if t.get("gstin") else "Unregistered recipient (B2C)", t.get("owner_email") or t.get("email") or ""]
    for i, (a, b) in enumerate(zip(sup, bill)):
        c.drawString(40, y - 14 - i * 12, a); c.drawString(W / 2 + 10, y - 14 - i * 12, b)

    y -= 90
    c.setFillColorRGB(0.96, 0.94, 0.90); c.rect(40, y - 6, W - 80, 20, fill=1, stroke=0)
    c.setFillColorRGB(*ink); c.setFont("Helvetica-Bold", 9)
    for x, label in ((46, "#"), (66, "Description"), (350, "SAC"), (420, "Qty"), (W - 46, "Taxable value")):
        (c.drawRightString if x == W - 46 else c.drawString)(x, y, label)
    c.setFont("Helvetica", 9); y -= 22
    c.drawString(46, y, "1"); c.drawString(66, y, desc[:60]); c.drawString(350, y, hsn); c.drawString(420, y, "1"); c.drawRightString(W - 46, y, _money(tax["base"]))
    c.setStrokeColorRGB(0.85, 0.85, 0.85); c.line(40, y - 8, W - 40, y - 8)

    y -= 30
    rate = float(tax.get("gst_rate_pct") or 0)
    rows = [("Taxable value", tax["base"])]
    if rate:
        if same_state:
            rows += [(f"CGST @ {rate / 2:g}%", round(tax["gst"] / 2, 2)), (f"SGST @ {rate / 2:g}%", round(tax["gst"] - round(tax["gst"] / 2, 2), 2))]
        else:
            rows += [(f"IGST @ {rate:g}%", tax["gst"])]
    if pay.get("credits_applied"):
        rows.insert(0, ("Affiliate credits applied", -float(pay["credits_applied"])))
    for label, val in rows:
        c.setFillColorRGB(*grey); c.drawRightString(W - 160, y, label); c.setFillColorRGB(*ink); c.drawRightString(W - 46, y, _money(val)); y -= 14
    c.setFont("Helvetica-Bold", 11); c.drawRightString(W - 160, y - 4, "Total paid"); c.drawRightString(W - 46, y - 4, _money(tax["total"]))
    c.setFont("Helvetica", 8); c.setFillColorRGB(*grey)
    c.drawString(40, y - 4, f"Payment: Razorpay {pay.get('razorpay_payment_id') or pay.get('payment_id') or ''}".strip())
    c.drawString(40, 60, "Place of supply: Karnataka (29)" if same_state else "Place of supply: recipient's state · IGST")
    c.drawString(40, 48, "This is a computer-generated invoice and does not require a signature. Reverse charge: No.")
    c.drawRightString(W - 40, 48, "miracurl-suite.com · billing@miracurl-suite.com")
    c.showPage(); c.save()
    return buf.getvalue(), inv_no
