"""Luxe HTML invoice receipt emailed to the guest right after POS billing."""
import asyncio
import base64
import html as html_lib
import io
import logging
import os

from email_service import _send_email

GOLD = "#c9a35c"
INK = "#191921"

_PAY_LABELS = {"cash": "Cash", "card": "Card", "upi": "GPay", "wallet": "Phone Pay"}


def _pay_label(mode) -> str:
    return _PAY_LABELS.get(str(mode or "").lower(), str(mode or "").upper())


def _money_row(label: str, amount: float, sign: str = "", color: str = "#55555f", bold: bool = False) -> str:
    w, size = ("700", "17px") if bold else ("500", "13px")
    return (f'<tr><td style="padding:5px 0;color:{color};font-size:{size};font-weight:{w}">{label}</td>'
            f'<td style="padding:5px 0;text-align:right;color:{color};font-size:{size};font-weight:{w}">'
            f'{sign}&#8377;{amount:,.2f}</td></tr>')


def _items_rows(inv: dict) -> str:
    esc = html_lib.escape
    rows = ""
    for it in inv.get("items", []):
        qty = int(it.get("qty") or 1)
        line = qty * float(it.get("price") or 0)
        staff = (f'<div style="font-size:11px;color:#8a8a93;margin-top:2px">by {esc(it.get("staff_name"))}</div>'
                 if it.get("staff_name") else "")
        rows += (
            f'<tr><td style="padding:10px 0;border-bottom:1px solid #ececf0;color:{INK};font-size:14px">'
            f'{esc(it.get("name") or "")} × {qty}{staff}</td>'
            f'<td style="padding:10px 0;border-bottom:1px solid #ececf0;text-align:right;color:{INK};font-size:14px">'
            f'&#8377;{line:,.0f}</td></tr>')
    return rows


def _deduction_rows(inv: dict) -> str:
    """Green minus-rows: discounts, membership, coupon, loyalty points."""
    green = "#0a8f5b"
    rows = ""
    if float(inv.get("discount") or 0) > 0:
        rows += _money_row("Discount", float(inv["discount"]), sign="&minus; ", color=green)
    if float(inv.get("membership_discount") or 0) > 0:
        rows += _money_row("Membership benefit", float(inv["membership_discount"]), sign="&minus; ", color=green)
    if float(inv.get("coupon_discount") or 0) > 0:
        code = html_lib.escape(inv.get("coupon_code") or "")
        rows += _money_row(f"Coupon {code}", float(inv["coupon_discount"]), sign="&minus; ", color=green)
    if int(inv.get("points_used") or 0) > 0:
        rows += _money_row(f"Loyalty points redeemed ({int(inv['points_used'])} pts)",
                           float(inv["points_used"]), sign="&minus; ", color=green)
    return rows


def _totals_rows(inv: dict) -> str:
    totals = _money_row("Subtotal", float(inv.get("subtotal") or 0))
    totals += _deduction_rows(inv)
    if float(inv.get("tax") or 0) > 0:
        totals += _money_row("GST", float(inv["tax"]))
    totals += _money_row("Total Paid", float(inv.get("total") or 0), color=INK, bold=True)
    return totals


def _points_banner(points_earned: int) -> str:
    if not points_earned:
        return ""
    return (
        f'<p style="margin:14px 0 0;font-size:13px;color:#7a5c1e;background:#fdf6e7;border:1px solid #efdcae;'
        f'border-radius:10px;padding:10px 14px">&#10024; You earned <b>{points_earned} loyalty points</b> '
        f'on this visit — redeem them on your next bill!</p>')


def _review_nudge(t: dict) -> str:
    url = (t or {}).get("google_review_url") or ""
    if not url:
        return ""
    return (
        f'<p style="margin:14px 0 0;text-align:center">'
        f'<a href="{url}" style="display:inline-block;background:{GOLD};color:{INK};font-size:13px;font-weight:bold;'
        f'text-decoration:none;padding:11px 26px;border-radius:999px">&#11088; Loved your visit? Leave us a Google review</a>'
        f'<br/><span style="font-size:11px;color:#9a9aa6">It takes 30 seconds and makes our day!</span></p>')


def _receipt_email_html(t: dict, inv: dict, points_earned: int = 0) -> str:
    esc = html_lib.escape
    salon = esc(t.get("name") or "Your Salon")
    logo = t.get("logo_url") or ""
    logo_block = (
        f'<img src="{logo}" alt="{salon}" height="52" style="display:block;margin:0 auto 10px;border-radius:12px"/>'
        if logo else "")
    created = (inv.get("created_at") or "")[:10]
    footer_contact = esc(t.get("location") or "") + (" &middot; " + esc(t.get("phone")) if t.get("phone") else "")

    return f"""<!doctype html><html><body style="margin:0;padding:0;background:#f4f2ee;font-family:Georgia,'Times New Roman',serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td style="background:{INK};border-radius:18px 18px 0 0;padding:30px 34px;text-align:center">
  {logo_block}
  <div style="color:{GOLD};font-size:11px;letter-spacing:4px;text-transform:uppercase">Thank you for visiting</div>
  <div style="color:#fff;font-size:26px;margin-top:6px">{salon}</div>
</td></tr>
<tr><td style="background:#ffffff;padding:30px 34px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="font-size:13px;color:#55555f">Receipt for<br/><b style="color:{INK};font-size:15px">{esc(inv.get('customer_name') or 'Guest')}</b></td>
      <td style="text-align:right;font-size:13px;color:#55555f">Invoice <b style="color:{INK}">{esc(inv.get('invoice_no') or '')}</b><br/>{esc(created)} &middot; Paid via {esc(_pay_label(inv.get('payment_mode')))}</td>
    </tr>
  </table>
  <div style="height:1px;background:linear-gradient(90deg,{GOLD},transparent);margin:18px 0"></div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">{_items_rows(inv)}</table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px">{_totals_rows(inv)}</table>
  {_points_banner(points_earned)}
  {_review_nudge(t)}
</td></tr>
<tr><td style="background:{INK};border-radius:0 0 18px 18px;padding:20px 34px;text-align:center">
  <div style="color:#9a9aa6;font-size:12px">{footer_contact}</div>
  <div style="color:{GOLD};font-size:12px;margin-top:6px;letter-spacing:2px">&#10022; We look forward to pampering you again &#10022;</div>
</td></tr>
</table></td></tr></table></body></html>"""


async def _review_tent_card_attachment(t: dict) -> dict | None:
    """Auto-generated review QR tent card attached to every e-receipt (never blocks the email)."""
    if not (t or {}).get("slug"):
        return None
    try:
        from PIL import Image
        from routes.services_catalog import _build_tent_card
        base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com").rstrip("/")
        url = f"{base}/api/public/review-go/{t['slug']}"
        png = await asyncio.to_thread(_build_tent_card, t, url, "rosegold", "review")
        img = Image.open(io.BytesIO(png))
        img.thumbnail((1200, 1200))
        buf = io.BytesIO()
        img.convert("RGB").save(buf, "JPEG", quality=82)
        return {"filename": "rate-us-scan-me.jpg", "content": base64.b64encode(buf.getvalue()).decode()}
    except Exception as e:  # noqa: BLE001
        logging.getLogger("email").warning(f"tent card attach skipped: {e}")
        return None


async def send_invoice_receipt_email(t: dict, inv: dict, to_email: str, points_earned: int = 0) -> dict:
    subject = f"Your receipt from {t.get('name') or 'your salon'} — {inv.get('invoice_no')}"
    card = await _review_tent_card_attachment(t)
    html = _receipt_email_html(t, inv, points_earned)
    if card:
        note = ('<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">'
                '<tr><td style="padding:12px 34px 0;text-align:center;font-size:12px;color:#8a8a93">'
                '&#128206; We\'ve attached a scannable <b>rate-us card</b> to this email &mdash; '
                'scan it anytime to share your experience!</td></tr></table>')
        html = html.replace("</td></tr></table></body></html>", "</td></tr></table>" + note + "</body></html>")
    return await _send_email([to_email], subject, html, attachments=[card] if card else None)
