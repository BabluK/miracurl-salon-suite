"""Subscription Invoice Kit — tax invoice + payment receipt + Terms PDFs, emailed on every paid subscription."""
import asyncio
import base64
import html as html_lib
import io
import logging
import os
import textwrap
import uuid
from datetime import datetime, timezone

from pymongo import ReturnDocument

from database import _raw_db
from email_service import _send_email, hq_notify_emails
from services.pdf_brand import draw_brand_band, draw_logo, draw_powered_footer, draw_watermark, platform_logo_bytes

log = logging.getLogger("sub_invoice")

CUR_SYM = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£", "AED": "AED ", "SGD": "S$"}
PDF_CUR = {"INR": "Rs. ", "USD": "$", "EUR": "EUR ", "GBP": "GBP ", "AED": "AED ", "SGD": "S$"}
DEFAULT_BILLER = {
    "legal_name": "Miracurl AI Salon Suite", "address": "Bengaluru, Karnataka, India",
    "gstin": "", "pan": "", "gst_rate": 18, "state_code": "29",
    "email": "billing@miracurl-suite.com", "phone": "", "website": "https://miracurl-suite.com",
    "signatory": "Authorised Signatory",
}
GOLD, INK, GREY, LIGHT = (0.72, 0.6, 0.25), (0.12, 0.12, 0.14), (0.4, 0.4, 0.45), (0.965, 0.955, 0.93)
_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
         "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _app_url() -> str:
    return os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")


def _two(n: int) -> str:
    return _ONES[n] if n < 20 else (_TENS[n // 10] + (" " + _ONES[n % 10] if n % 10 else ""))


def amount_in_words(amount: float, currency: str = "INR") -> str:
    n = int(round(amount))
    if n == 0:
        return f"{'Rupees' if currency == 'INR' else currency} Zero Only"
    parts = []
    for div, name in ((10_000_000, "Crore"), (100_000, "Lakh"), (1000, "Thousand"), (100, "Hundred")):
        q, n = divmod(n, div)
        if q:
            parts.append(f"{_two(q) if div != 100 else _ONES[q]} {name}")
    if n:
        parts.append(_two(n))
    unit = "Rupees" if currency == "INR" else currency
    return f"{unit} {' '.join(parts)} Only"


async def get_biller() -> dict:
    doc = await _raw_db.platform_settings.find_one({"key": "biller"}, {"_id": 0, "value": 1})
    return {**DEFAULT_BILLER, **((doc or {}).get("value") or {})}


async def save_biller(patch: dict) -> dict:
    cur = await get_biller()
    cur.update({k: (v.strip() if isinstance(v, str) else v) for k, v in patch.items() if k in DEFAULT_BILLER})
    await _raw_db.platform_settings.update_one({"key": "biller"}, {"$set": {"value": cur}}, upsert=True)
    return cur


async def next_invoice_number(year: int) -> str:
    row = await _raw_db.counters.find_one_and_update(
        {"_id": f"sub_invoice_{year}"}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER)
    return f"MC-{year}-{int(row['seq']):04d}"


def _tax_split(inv: dict) -> dict:
    """Back out GST from the paid amount when the biller is GST-registered (prices are tax-inclusive at checkout)."""
    b = inv["biller"]
    total = float(inv["amount"])
    rate = float(b.get("gst_rate") or 0) if b.get("gstin") else 0
    if rate <= 0 or inv.get("currency", "INR") != "INR":
        return {"taxable": total, "rate": 0, "cgst": 0, "sgst": 0, "igst": 0, "total": total}
    taxable = round(total / (1 + rate / 100), 2)
    tax = round(total - taxable, 2)
    same_state = (inv.get("buyer_gstin") or b.get("state_code", "29"))[:2] == b.get("state_code", "29")
    if same_state:
        return {"taxable": taxable, "rate": rate, "cgst": round(tax / 2, 2), "sgst": round(tax - tax / 2, 2), "igst": 0, "total": total}
    return {"taxable": taxable, "rate": rate, "cgst": 0, "sgst": 0, "igst": tax, "total": total}


def _method(inv: dict) -> str:
    m = inv.get("method") or "manual"
    return m.upper() if len(m) <= 4 else m.title()


def _fmt(inv: dict, v: float) -> str:
    sym = PDF_CUR.get(inv.get("currency", "INR"), inv.get("currency", "") + " ")
    return f"{sym}{v:,.2f}"


def _pdf_header(c, W, H, mm, title: str, inv: dict):
    draw_watermark(c, inv.get("_logo"), W, H, 110 * mm)
    draw_brand_band(c, W, H, mm, logo=inv.get("_logo"), title=title, meta=[f"No. {inv['number']}", f"Date: {inv['issued_on']}"])


def _pdf_block(c, x, y, mm, heading: str, lines: list, width_chars=44):
    c.setFillColorRGB(*GOLD)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(x, y, heading.upper())
    y -= 5.5 * mm
    c.setFillColorRGB(*INK)
    first = True
    for ln in lines:
        if not ln:
            continue
        for w in textwrap.wrap(str(ln), width_chars) or [""]:
            c.setFont("Helvetica-Bold" if first else "Helvetica", 10 if first else 9)
            c.drawString(x, y, w)
            y -= 4.8 * mm
            first = False
    return y


def _pdf_footer(c, W, mm, inv: dict, note: str):
    b = inv["biller"]
    contact = f"Questions? {b.get('email') or 'billing@miracurl-suite.com'}" + (f"  ·  {b['phone']}" if b.get("phone") else "")
    draw_powered_footer(c, W, mm, inv.get("_logo"), [
        note, f"Terms: {_app_url()}/terms   ·   Refund policy: {_app_url()}/refund-policy   ·   Privacy: {_app_url()}/privacy", contact])


def _buyer_lines(inv: dict) -> list:
    return [inv["tenant_name"], inv.get("tenant_location") or "", inv.get("owner_email") or "",
            inv.get("tenant_phone") or "", f"GSTIN: {inv['buyer_gstin']}" if inv.get("buyer_gstin") else ""]


def _biller_lines(b: dict) -> list:
    return [b.get("legal_name"), b.get("address"),
            f"GSTIN: {b['gstin']}" if b.get("gstin") else "GST: not applicable (unregistered)",
            f"PAN: {b['pan']}" if b.get("pan") else "", b.get("email"), b.get("phone")]


def build_invoice_pdf(inv: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as rl_canvas

    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    b = inv["biller"]
    trial = inv.get("kind") == "trial"
    _pdf_header(c, W, H, mm, "FREE TRIAL INVOICE" if trial else ("TAX INVOICE" if b.get("gstin") else "INVOICE"), inv)
    y = H - 50 * mm
    _pdf_block(c, 18 * mm, y, mm, "From", _biller_lines(b))
    y2 = _pdf_block(c, 110 * mm, y, mm, "Billed to", _buyer_lines(inv), width_chars=30 if inv.get("_tenant_logo") else 44)
    if inv.get("_tenant_logo"):
        draw_logo(c, inv["_tenant_logo"], W - 42 * mm, y - 22 * mm, 24 * mm, 24 * mm)
    y = min(y2, H - 92 * mm)
    c.setFillColorRGB(*INK)
    c.setFont("Helvetica", 9)
    c.drawString(18 * mm, y, f"Payment method: {_method(inv)}    Reference: {inv.get('txn_ref') or '-'}    Status: "
                 + ("COMPLIMENTARY" if trial else "PAID"))
    y -= 10 * mm
    # table
    c.setFillColorRGB(*INK)
    c.rect(18 * mm, y - 2 * mm, W - 36 * mm, 8 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*GOLD)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(20 * mm, y, "DESCRIPTION")
    c.drawString(112 * mm, y, "PERIOD")
    c.drawRightString(W - 20 * mm, y, "AMOUNT")
    y -= 9 * mm
    tax = _tax_split(inv)
    gross = tax["total"] + float(inv.get("credits_applied") or 0)
    c.setFillColorRGB(*INK)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(20 * mm, y, f"Miracurl Suite subscription — {inv['plan_label']}")
    c.setFont("Helvetica", 9)
    c.drawString(112 * mm, y, f"{inv['period_start']}  to  {inv['period_end']}")
    c.drawRightString(W - 20 * mm, y, _fmt(inv, gross))
    y -= 5 * mm
    c.setFillColorRGB(*GREY)
    c.setFont("Helvetica", 8)
    c.drawString(20 * mm, y, f"SAC 998314 · Cloud software (SaaS) · {inv.get('branches') or 1} branch(es) · valid {inv['duration_days']} days"
                 + (" · price incl. GST" if tax["rate"] else ""))
    y -= 4 * mm
    if inv.get("referral_bonus_days"):
        c.drawString(20 * mm, y, f"Includes +{inv['referral_bonus_days']} bonus days from Refer & Earn (free of charge)")
        y -= 4 * mm
    c.setStrokeColorRGB(0.85, 0.85, 0.85)
    c.line(18 * mm, y - 1 * mm, W - 18 * mm, y - 1 * mm)
    y -= 8 * mm

    def total_row(label, val, bold=False):
        nonlocal y
        c.setFillColorRGB(*INK)
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 10.5 if bold else 9)
        c.drawRightString(W - 62 * mm, y, label)
        c.drawRightString(W - 20 * mm, y, val)
        y -= 6 * mm

    if inv.get("credits_applied"):
        total_row("Subtotal", _fmt(inv, gross))
        total_row("Referral credits applied", "- " + _fmt(inv, float(inv["credits_applied"])))
        total_row("Net payable", _fmt(inv, tax["total"]))
    if tax["rate"]:
        total_row("Taxable value", _fmt(inv, tax["taxable"]))
        if tax["igst"]:
            total_row(f"IGST @ {tax['rate']:g}%", _fmt(inv, tax["igst"]))
        else:
            total_row(f"CGST @ {tax['rate'] / 2:g}%", _fmt(inv, tax["cgst"]))
            total_row(f"SGST @ {tax['rate'] / 2:g}%", _fmt(inv, tax["sgst"]))
    else:
        total_row("GST", "Not applicable")
    c.setFillColorRGB(*LIGHT)
    c.rect(W - 110 * mm, y - 2.5 * mm, 92 * mm, 7 * mm, stroke=0, fill=1)
    total_row("TOTAL DUE" if trial else "TOTAL PAID", _fmt(inv, tax["total"]), bold=True)
    y -= 2 * mm
    c.setFillColorRGB(*GREY)
    c.setFont("Helvetica-Oblique", 8.5)
    c.drawRightString(W - 20 * mm, y, f"In words: {amount_in_words(tax['total'], inv.get('currency', 'INR'))}")
    y -= 16 * mm
    c.setFillColorRGB(*INK)
    c.setFont("Helvetica", 9)
    c.drawString(18 * mm, y, "What's included: online bookings & QR posters, POS billing, staff & attendance, inventory, CRM, Mira AI studio,")
    y -= 4.8 * mm
    c.drawString(18 * mm, y, "marketing auto-pilot, reports, multi-device access and priority support for the whole subscription period.")
    y -= 14 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawRightString(W - 20 * mm, y, f"For {b.get('legal_name')}")
    c.setFont("Helvetica", 8.5)
    c.drawRightString(W - 20 * mm, y - 5 * mm, b.get("signatory") or "Authorised Signatory")
    _pdf_footer(c, W, mm, inv, "Complimentary free-trial access — no payment due. Access continues until the trial end date shown above."
                if trial else "Prices at checkout are inclusive of applicable taxes. Access continues until the period end date shown above.")
    c.save()
    return buf.getvalue()


def build_receipt_pdf(inv: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as rl_canvas

    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    _pdf_header(c, W, H, mm, "PAYMENT RECEIPT", inv)
    y = H - 50 * mm
    _pdf_block(c, 18 * mm, y, mm, "Received by", _biller_lines(inv["biller"]))
    y2 = _pdf_block(c, 110 * mm, y, mm, "Received from", _buyer_lines(inv))
    y = min(y2, H - 95 * mm)
    c.setFillColorRGB(*LIGHT)
    c.roundRect(18 * mm, y - 62 * mm, W - 36 * mm, 66 * mm, 4 * mm, stroke=0, fill=1)
    rows = [
        ("Amount received", _fmt(inv, float(inv["amount"]))),
        ("In words", amount_in_words(float(inv["amount"]), inv.get("currency", "INR"))),
        ("Payment method", _method(inv)),
        ("Transaction reference", inv.get("txn_ref") or "-"),
        ("Payment date", inv["paid_at"]),
        ("Towards", f"Miracurl Suite — {inv['plan_label']}"),
        ("Subscription period", f"{inv['period_start']}  to  {inv['period_end']}"),
        ("Invoice number", inv["number"]),
    ]
    yy = y - 4 * mm
    for k, v in rows:
        c.setFillColorRGB(*GREY)
        c.setFont("Helvetica", 8.5)
        c.drawString(24 * mm, yy, k.upper())
        c.setFillColorRGB(*INK)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(78 * mm, yy, str(v))
        yy -= 7.4 * mm
    # PAID stamp
    c.saveState()
    c.translate(W - 38 * mm, y - 14 * mm)
    c.rotate(18)
    c.setStrokeColorRGB(0.13, 0.6, 0.35)
    c.setFillColorRGB(0.13, 0.6, 0.35)
    c.setLineWidth(2)
    c.roundRect(-18 * mm, -6.5 * mm, 36 * mm, 13 * mm, 3 * mm, stroke=1, fill=0)
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(0, -3 * mm, "PAID")
    c.restoreState()
    y -= 76 * mm
    c.setFillColorRGB(*INK)
    c.setFont("Helvetica", 9.5)
    for ln in textwrap.wrap(
            f"Thank you for choosing Miracurl. Your subscription for {inv['tenant_name']} is active until "
            f"{inv['period_end']}. We will send renewal reminders 15, 7 and 1 day(s) before expiry so your access never lapses.", 100):
        c.drawString(18 * mm, y, ln)
        y -= 5 * mm
    _pdf_footer(c, W, mm, inv, "Keep this receipt for your records. Refunds within 7 days of first payment as per the Refund Policy.")
    c.save()
    return buf.getvalue()


def build_terms_pdf(logo: bytes | None = None) -> bytes:
    from services.hq_docs import DOCS, _doc_pdf
    return _doc_pdf(DOCS["terms_conditions"], logo=logo)


def _kit_email_html(inv: dict) -> str:
    e = html_lib.escape
    sym = CUR_SYM.get(inv.get("currency", "INR"), inv.get("currency", "") + " ")
    amt = f"{sym}{float(inv['amount']):,.2f}"
    row = lambda k, v: f"<tr><td style='padding:6px 0;color:#777;font-size:13px'>{k}</td><td style='padding:6px 0;text-align:right;font-weight:bold;font-size:13px'>{v}</td></tr>"
    return f"""
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #eee;border-radius:16px;overflow:hidden">
      <div style="background:#1c1c22;padding:26px 30px">
        <div style="color:#d4af37;font-size:22px;font-weight:bold">Miracurl ✦ Suite</div>
        <div style="color:#999;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:4px">Subscription confirmed · Invoice {e(inv['number'])}</div>
      </div>
      <div style="padding:28px 30px;color:#333">
        <p>Namaste <b>{e(inv['tenant_name'])}</b> 🎉</p>
        <p style="line-height:1.7">Thank you — your payment of <b>{amt}</b> has been received and your <b>{e(inv['plan_label'])}</b> subscription is now active.
        Your billing documents are attached to this email.</p>
        <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #eadfc0;border-radius:12px;padding:6px 16px;margin:18px 0">
          {row("Invoice number", e(inv['number']))}
          {row("Plan", e(inv['plan_label']))}
          {row("Valid from", e(inv['period_start']))}
          {row("Valid until", e(inv['period_end']))}
          {row("Amount paid", amt)}
          {row("Payment method", e(_method(inv)) + (f" · {e(inv['txn_ref'])}" if inv.get('txn_ref') else ""))}
          {row("Referral credits applied", f"- {sym}{float(inv['credits_applied']):,.2f}") if inv.get('credits_applied') else ""}
        </table>
        <div style="background:#faf6ec;border:1px solid #eadfc0;border-radius:12px;padding:14px 18px;font-size:13px;font-family:Arial,sans-serif;line-height:1.9">
          <b>📎 Attached documents</b><br/>
          1. <b>{'Tax Invoice' if inv['biller'].get('gstin') else 'Invoice'}</b> — {e(inv['number'])}.pdf (billing details)<br/>
          2. <b>Payment Receipt</b> — proof of payment with transaction reference<br/>
          3. <b>Terms &amp; Conditions</b> — subscription, refund and data-privacy terms you've accepted
        </div>
        <div style="background:#f4f8f4;border:1px solid #d4e6d4;border-radius:12px;padding:14px 18px;font-size:13px;font-family:Arial,sans-serif;line-height:1.9;margin-top:14px">
          <b>✅ What's included in your plan</b><br/>
          Online bookings &amp; QR posters · POS/GST billing · Staff, attendance &amp; salary slips · Inventory · Customer CRM &amp; loyalty ·
          Mira AI Studio (posts, flyers, offers) · Marketing auto-pilot · Reports · Priority support
        </div>
        <p style="font-size:13px;line-height:1.7;margin-top:18px">You can download these documents anytime from <b>Settings → Subscription → Invoices</b>.
        We'll remind you 15, 7 and 1 day before renewal so your access never lapses.</p>
        <p style="font-size:12px;color:#888;margin-top:18px">
          <a href="{_app_url()}/terms" style="color:#b08d3f">Terms</a> · <a href="{_app_url()}/refund-policy" style="color:#b08d3f">Refund policy</a> · <a href="{_app_url()}/privacy" style="color:#b08d3f">Privacy</a><br/>
          Need help? Reply to this email or write to {e(inv['biller'].get('email') or 'billing@miracurl-suite.com')}.
        </p>
      </div>
    </div>"""


def _attachments(inv: dict) -> list:
    safe = inv["number"].replace("/", "-")
    if inv.get("kind") == "trial":
        return [
            {"filename": f"Miracurl-Free-Trial-Invoice-{safe}.pdf", "content": base64.b64encode(build_invoice_pdf(inv)).decode()},
            {"filename": "Miracurl-Terms-and-Conditions.pdf", "content": base64.b64encode(build_terms_pdf(inv.get("_logo"))).decode()},
        ]
    return [
        {"filename": f"Miracurl-Invoice-{safe}.pdf", "content": base64.b64encode(build_invoice_pdf(inv)).decode()},
        {"filename": f"Miracurl-Payment-Receipt-{safe}.pdf", "content": base64.b64encode(build_receipt_pdf(inv)).decode()},
        {"filename": "Miracurl-Terms-and-Conditions.pdf", "content": base64.b64encode(build_terms_pdf(inv.get("_logo"))).decode()},
    ]


async def email_invoice_kit(inv: dict, resend: bool = False) -> dict:
    if inv.get("kind") == "trial":
        from services.trial_onboarding import send_trial_congrats
        return await send_trial_congrats(inv, resend=resend)
    to = [inv.get("notify_email") or inv.get("owner_email") or ""]
    inv["_logo"] = await platform_logo_bytes()
    attachments = await asyncio.to_thread(_attachments, inv)
    subject = f"{'[Resent] ' if resend else ''}✅ Your Miracurl subscription is active — Invoice {inv['number']} ({inv['plan_label']})"
    status = await _send_email(to, subject, _kit_email_html(inv), attachments=attachments,
                               book_url=f"{_app_url()}/settings#subscription", book_label="Open your dashboard ✦")
    hq_to = list(dict.fromkeys(hq_notify_emails("billing") + hq_notify_emails("booking") + hq_notify_emails("payments")))
    hq_status = await _send_email(
        hq_to,
        f"💰 Subscription sale — {inv['tenant_name']} · {inv['plan_label']} · Invoice {inv['number']}",
        _kit_email_html(inv), attachments=attachments, book_url=f"{_app_url()}/super-admin", book_label="Open HQ ✦")
    rec = {"sent": bool(status.get("sent")), "to": to[0], "id": status.get("id"), "error": status.get("error"),
           "hq_sent": bool(hq_status.get("sent")), "hq_to": hq_to, "at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.subscription_invoices.update_one({"id": inv["id"]}, {"$set": {"email": rec}})
    return rec


async def issue_subscription_kit(pay: dict, sub: dict, *, plan_label: str | None = None, currency: str = "INR",
                                 credits_applied: float = 0.0, branches: int = 1, send: bool = True) -> dict | None:
    """Create the invoice record for a paid subscription and (optionally) email the documents. Never raises."""
    try:
        from services.plans import PLAN_CATALOG
        t = await _raw_db.tenants.find_one({"id": pay["tenant_id"]}, {"_id": 0})
        if not t:
            return None
        existing = await _raw_db.subscription_invoices.find_one({"payment_id": pay["id"]}, {"_id": 0})
        if existing:
            return existing
        now = datetime.now(timezone.utc)
        plan = PLAN_CATALOG.get(sub.get("plan") or "", {})
        inv = {
            "id": str(uuid.uuid4()), "number": await next_invoice_number(now.year),
            "issued_on": now.strftime("%d %b %Y"), "created_at": now.isoformat(),
            "tenant_id": t["id"], "tenant_name": t.get("name") or t["slug"], "tenant_slug": t["slug"],
            "tenant_location": t.get("location") or "", "tenant_phone": t.get("phone") or "",
            "owner_email": t.get("owner_email") or "", "notify_email": t.get("notify_email") or "",
            "buyer_gstin": (t.get("gst_number") or "").upper(),
            "subscription_id": sub["id"], "payment_id": pay["id"],
            "plan": sub.get("plan"), "plan_label": plan_label or plan.get("label") or sub.get("plan") or "Subscription",
            "duration_days": plan.get("duration_days") or max(1, (datetime.fromisoformat(sub["end_date"]) - datetime.fromisoformat(sub["start_date"])).days),
            "branches": branches, "period_start": sub["start_date"], "period_end": sub["end_date"],
            "referral_bonus_days": sub.get("referral_bonus_days") or 0,
            "amount": float(pay["amount"]), "currency": currency or "INR", "credits_applied": float(credits_applied or 0),
            "method": pay.get("method") or "manual", "txn_ref": pay.get("txn_ref") or "", "paid_at": pay.get("paid_at") or now.date().isoformat(),
            "biller": await get_biller(), "email": None,
        }
        await _raw_db.subscription_invoices.insert_one(dict(inv))
        if send:
            inv["email"] = await email_invoice_kit(inv)
        inv.pop("_logo", None)
        return inv
    except Exception as e:  # billing docs must never break payment activation
        log.exception("invoice kit failed for payment %s: %s", pay.get("id"), e)
        return None
