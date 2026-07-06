"""Email delivery (Resend) + HTML templates for Miracurl transactional mail."""
import asyncio
import html as html_lib
import logging
import os

import resend


async def _send_email(to: list, subject: str, html: str, attachments: list | None = None) -> dict:
    key = os.environ.get("RESEND_API_KEY")
    if not key:
        return {"sent": False, "error": "Email not configured (RESEND_API_KEY missing)"}
    sender = os.environ.get("SENDER_EMAIL")
    if not sender:
        return {"sent": False, "error": "Email not configured (SENDER_EMAIL missing — set it to an address on your verified Resend domain, e.g. noreply@miracurlunisexsaloon.com)"}
    resend.api_key = key
    params = {
        "from": f"Miracurl <{sender}>",
        "to": to, "subject": subject, "html": html,
    }
    if attachments:
        params["attachments"] = attachments
    try:
        r = await asyncio.to_thread(resend.Emails.send, params)
        return {"sent": True, "id": (r or {}).get("id")}
    except Exception as e:
        logging.getLogger("email").error(f"resend send failed: {e}")
        return {"sent": False, "error": str(e)[:300]}


def _welcome_email_html(salon_name: str, owner_email: str, temp_pw: str, poster_url: str = "") -> str:
    login_url = f"{os.environ.get('APP_PUBLIC_URL', 'https://miracurlunisexsaloon.com')}/login"
    img = poster_url or os.environ.get("WELCOME_IMAGE_URL", "")
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    img_row = (f'<tr><td style="padding:0"><img src="{img}" alt="Welcome to Miracurl" width="600" '
               f'style="display:block;width:100%;border-radius:16px 16px 0 0"/></td></tr>') if img else ""
    return f"""
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f14;padding:28px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;font-family:Georgia,'Times New Roman',serif;box-shadow:0 8px 40px rgba(212,175,55,.25)">
{img_row}
<tr><td style="background:linear-gradient(135deg,#17171f,#26202b);padding:26px 36px;text-align:center">
  <div style="color:#e6c66e;font-size:12px;letter-spacing:4px;text-transform:uppercase">✦ &nbsp;Welcome Onboard&nbsp; ✦</div>
  <div style="color:#ffffff;font-size:26px;margin-top:8px">{html_lib.escape(salon_name)}</div>
  <div style="color:#b9b0c4;font-size:13px;margin-top:6px;font-family:Arial,sans-serif">Your salon's digital journey begins today 🎉</div>
</td></tr>
<tr><td style="padding:30px 36px 10px">
  <p style="margin:0;color:#2b2b33;font-size:15px;font-family:Arial,sans-serif">Namaste! We're delighted to have <b>{html_lib.escape(salon_name)}</b> on Miracurl.</p>
  <p style="margin:12px 0 0;color:#55555f;font-size:14px;line-height:1.6;font-family:Arial,sans-serif">
    Your complete salon management suite is ready — billing, appointments, staff, inventory,
    AI marketing and your own online booking page. Here are your one-time login details:</p>
</td></tr>
<tr><td style="padding:18px 36px">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ec;border:1px solid #ecdfc0;border-radius:12px">
    <tr><td style="padding:18px 22px;font-size:14px;color:#2b2b33;line-height:2.1;font-family:Arial,sans-serif">
      🔗 <b>Login:</b> <a href="{login_url}" style="color:#a08a4b;font-weight:bold">{login_url}</a><br/>
      📧 <b>Email:</b> {owner_email}<br/>
      🔑 <b>Temp password:</b> <span style="font-family:monospace;background:#fff;border:1px dashed #d4af37;padding:3px 12px;border-radius:8px;font-weight:bold;color:#8a6d1f">{temp_pw}</span>
    </td></tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:22px 0 4px">
    <a href="{login_url}" style="background:linear-gradient(135deg,#d4af37,#e6c66e);color:#17171f;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:14px;padding:13px 42px;border-radius:999px;display:inline-block">✦ &nbsp;Login &amp; Set Your Password&nbsp; ✦</a>
  </td></tr></table>
  <p style="margin:14px 0 0;font-size:12px;color:#8a8a94;text-align:center;font-family:Arial,sans-serif">You'll be asked to set your own password right after your first login.</p>
</td></tr>
<tr><td style="background:#17171f;padding:22px 36px;text-align:center">
  <div style="color:#e6c66e;font-size:16px">✦ Miracurl ✦</div>
  <div style="color:#8f8798;font-size:12px;margin-top:6px;font-family:Arial,sans-serif">Questions? Just reply to this email · +91-7206869271 · {hq_email}</div>
  <div style="color:#5d5766;font-size:11px;margin-top:10px;font-family:Arial,sans-serif">Sent with ♥ by Mira — your salon's AI assistant</div>
</td></tr>
</table>
</td></tr></table>"""


def _monthly_report_html(t: dict, month_label: str, stats: dict) -> str:
    rows = "".join(
        f'<tr><td style="padding:6px 10px;font-size:13px;color:#444">{html_lib.escape(name)}</td>'
        f'<td style="padding:6px 10px;font-size:13px;color:#333;text-align:right"><b>Rs {rev:,.0f}</b></td></tr>'
        for name, rev in stats["top_services"])
    staff_rows = "".join(
        f'<tr><td style="padding:6px 10px;font-size:13px;color:#444">{html_lib.escape(name)}</td>'
        f'<td style="padding:6px 10px;font-size:13px;color:#333;text-align:right"><b>Rs {rev:,.0f}</b></td></tr>'
        for name, rev in stats["top_staff"])
    return f"""
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;font-family:Arial,sans-serif">
<tr><td style="background:#12121e;padding:26px 36px">
<h1 style="margin:0;font-size:20px;color:#f5d67b">✦ Miracurl Monthly Report</h1>
<p style="margin:6px 0 0;font-size:13px;color:#bbb">{html_lib.escape(t['name'])} · {month_label}</p>
</td></tr>
<tr><td style="padding:28px 36px">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;text-align:center">
<div style="font-size:11px;color:#15803d;text-transform:uppercase">Collection</div>
<div style="font-size:22px;color:#166534;font-weight:bold">Rs {stats['revenue']:,.0f}</div></td>
<td style="width:10px"></td>
<td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px;text-align:center">
<div style="font-size:11px;color:#1d4ed8;text-transform:uppercase">Bills</div>
<div style="font-size:22px;color:#1e40af;font-weight:bold">{stats['invoices']}</div></td>
<td style="width:10px"></td>
<td style="background:#fdf4ff;border:1px solid #f5d0fe;border-radius:10px;padding:14px;text-align:center">
<div style="font-size:11px;color:#a21caf;text-transform:uppercase">New Guests</div>
<div style="font-size:22px;color:#86198f;font-weight:bold">{stats['new_customers']}</div></td>
</tr></table>
<p style="font-size:13px;color:#666;margin:16px 0 4px">Average bill: <b>Rs {stats['avg_bill']:,.0f}</b> · Appointments: <b>{stats['appointments']}</b></p>
{f'<h3 style="font-size:14px;color:#333;margin:18px 0 6px">🏆 Top services</h3><table width="100%" style="background:#fafafa;border-radius:8px">{rows}</table>' if rows else ''}
{f'<h3 style="font-size:14px;color:#333;margin:18px 0 6px">⭐ Star team members</h3><table width="100%" style="background:#fafafa;border-radius:8px">{staff_rows}</table>' if staff_rows else ''}
<p style="font-size:12px;color:#999;margin-top:24px">Keep shining! — Miracurl team · reply to this email anytime.</p>
</td></tr></table></td></tr></table>"""
