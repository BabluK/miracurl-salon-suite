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
    resend.api_key = key
    params = {
        "from": f"Miracurl <{os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')}>",
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


def _welcome_email_html(salon_name: str, owner_email: str, temp_pw: str) -> str:
    login_url = f"{os.environ.get('APP_PUBLIC_URL', 'https://miracurlunisexsaloon.com')}/login"
    img = os.environ.get("WELCOME_IMAGE_URL", "")
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    img_row = (f'<tr><td style="padding:0"><img src="{img}" alt="Welcome to Miracurl" width="600" '
               f'style="display:block;width:100%;border-radius:14px 14px 0 0"/></td></tr>') if img else ""
    return f"""
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
{img_row}
<tr><td style="padding:32px 36px">
<h1 style="margin:0 0 6px;font-size:22px;color:#1a1a2e">We're happy to onboard you! 🎉</h1>
<p style="margin:0 0 18px;font-size:15px;color:#444">Hi <b>{html_lib.escape(salon_name)}</b> ✦ Welcome to Miracurl!</p>
<p style="margin:0 0 14px;font-size:14px;color:#444">Your salon account is ready. Here are your one-time login details:</p>
<table cellpadding="0" cellspacing="0" style="background:#f8f7fc;border:1px solid #e6e3f2;border-radius:10px;width:100%">
<tr><td style="padding:16px 20px;font-size:14px;color:#333;line-height:2">
🔗 <b>Login URL:</b> <a href="{login_url}" style="color:#7c3aed">{login_url}</a><br/>
📧 <b>Email:</b> {owner_email}<br/>
🔑 <b>Temp password:</b> <span style="font-family:monospace;background:#fef3c7;padding:2px 8px;border-radius:6px;font-weight:bold">{temp_pw}</span>
</td></tr></table>
<p style="margin:18px 0 6px;font-size:13px;color:#666">You'll be asked to set your own password right after your first login.</p>
<p style="margin:0 0 22px;font-size:13px;color:#666">Any questions? Just reply to this message.</p>
<p style="margin:0;font-size:13px;color:#888">— Miracurl team<br/>Number: +91-7206869271<br/>Email: {hq_email}</p>
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
