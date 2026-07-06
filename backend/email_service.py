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
    img = os.environ.get("MONTHLY_REPORT_IMAGE_URL", "")
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    img_row = (f'<tr><td style="padding:0"><img src="{img}" alt="Monthly Business Report" width="600" '
               f'style="display:block;width:100%;border-radius:16px 16px 0 0"/></td></tr>') if img else ""

    prev = float(stats.get("prev_revenue") or 0)
    growth_chip = ""
    if prev > 0:
        pct = (stats["revenue"] - prev) / prev * 100
        up = pct >= 0
        growth_chip = (f'<span style="display:inline-block;margin-top:10px;background:{"#0d3321" if up else "#3a1520"};'
                       f'color:{"#4ade80" if up else "#fb7185"};font-family:Arial,sans-serif;font-size:12px;font-weight:bold;'
                       f'padding:5px 16px;border-radius:999px">{"▲" if up else "▼"} {abs(pct):.0f}% vs previous month</span>')

    weekly = stats.get("weekly") or []
    max_w = max(weekly) if weekly and max(weekly) > 0 else 0
    week_labels = ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5"]
    bars = ""
    for idx, val in enumerate(weekly):
        if idx == 4 and val == 0:
            continue
        pct_w = int(val / max_w * 100) if max_w else 0
        bars += (
            f'<tr><td style="padding:4px 0;width:64px;font-size:11px;color:#8a8a94;font-family:Arial,sans-serif">{week_labels[idx]}</td>'
            f'<td style="padding:4px 0"><table cellpadding="0" cellspacing="0" width="100%"><tr>'
            f'<td style="width:{max(pct_w, 2)}%;background:linear-gradient(90deg,#d4af37,#e6c66e);border-radius:4px;height:16px;font-size:1px">&nbsp;</td>'
            f'<td style="padding-left:8px;font-size:12px;color:#2b2b33;font-family:Arial,sans-serif;white-space:nowrap"><b>&#8377;{val:,.0f}</b></td>'
            f'<td width="100%"></td></tr></table></td></tr>')
    chart_block = (f'<tr><td style="padding:6px 36px 4px">'
                   f'<h3 style="font-size:13px;color:#a08a4b;margin:14px 0 10px;font-family:Arial,sans-serif;letter-spacing:2px;text-transform:uppercase">📊 Weekly collection</h3>'
                   f'<table width="100%" cellpadding="0" cellspacing="0">{bars}</table></td></tr>') if max_w else ""

    def _stat_card(label, value):
        return (f'<td style="background:#faf6ec;border:1px solid #ecdfc0;border-radius:12px;padding:16px 10px;text-align:center">'
                f'<div style="font-size:10px;color:#a08a4b;text-transform:uppercase;letter-spacing:2px;font-family:Arial,sans-serif">{label}</div>'
                f'<div style="font-size:21px;color:#2b2b33;font-weight:bold;margin-top:5px;font-family:Georgia,serif">{value}</div></td>')

    def _rank_rows(pairs):
        medals = ["🥇", "🥈", "🥉"]
        return "".join(
            f'<tr><td style="padding:9px 16px;border-bottom:1px solid #f1e8d8;color:#2b2b33;font-size:13px;font-family:Arial,sans-serif">{medals[i] if i < 3 else ""} {html_lib.escape(str(name))}</td>'
            f'<td style="padding:9px 16px;border-bottom:1px solid #f1e8d8;color:#2b2b33;font-size:13px;text-align:right;font-family:Arial,sans-serif"><b>&#8377;{rev:,.0f}</b></td></tr>'
            for i, (name, rev) in enumerate(pairs))

    svc_rows = _rank_rows(stats["top_services"])
    staff_rows = _rank_rows(stats["top_staff"])
    svc_block = (f'<h3 style="font-size:13px;color:#a08a4b;margin:18px 0 8px;font-family:Arial,sans-serif;letter-spacing:2px;text-transform:uppercase">🏆 Top services</h3>'
                 f'<table width="100%" cellpadding="0" cellspacing="0" style="background:#fdfbf5;border:1px solid #f1e8d8;border-radius:12px">{svc_rows}</table>') if svc_rows else ""
    staff_block = (f'<h3 style="font-size:13px;color:#a08a4b;margin:18px 0 8px;font-family:Arial,sans-serif;letter-spacing:2px;text-transform:uppercase">⭐ Star team members</h3>'
                   f'<table width="100%" cellpadding="0" cellspacing="0" style="background:#fdfbf5;border:1px solid #f1e8d8;border-radius:12px">{staff_rows}</table>') if staff_rows else ""

    return f"""
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f14;padding:28px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;font-family:Georgia,'Times New Roman',serif;box-shadow:0 8px 40px rgba(212,175,55,.25)">
{img_row}
<tr><td style="background:linear-gradient(135deg,#17171f,#26202b);padding:26px 36px;text-align:center">
  <div style="color:#e6c66e;font-size:12px;letter-spacing:4px;text-transform:uppercase">✦ &nbsp;Monthly Business Report&nbsp; ✦</div>
  <div style="color:#ffffff;font-size:26px;margin-top:8px">{html_lib.escape(t['name'])}</div>
  <div style="color:#b9b0c4;font-size:13px;margin-top:6px;font-family:Arial,sans-serif">{month_label}</div>
</td></tr>
<tr><td style="padding:28px 36px 4px;text-align:center">
  <div style="font-size:11px;color:#a08a4b;text-transform:uppercase;letter-spacing:3px;font-family:Arial,sans-serif">Total Collection</div>
  <div style="font-size:40px;color:#1c1c24;font-weight:bold;margin-top:6px">&#8377;{stats['revenue']:,.0f}</div>
  {growth_chip}
</td></tr>
<tr><td style="padding:20px 36px 4px">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    {_stat_card("Bills", stats['invoices'])}
    <td style="width:10px"></td>
    {_stat_card("Avg Bill", f"&#8377;{stats['avg_bill']:,.0f}")}
    <td style="width:10px"></td>
    {_stat_card("New Guests", stats['new_customers'])}
    <td style="width:10px"></td>
    {_stat_card("Appointments", stats['appointments'])}
  </tr></table>
</td></tr>
{chart_block}
<tr><td style="padding:4px 36px 8px">
  {svc_block}
  {staff_block}
</td></tr>
<tr><td style="padding:18px 36px 26px;text-align:center">
  <p style="margin:0;font-size:13px;color:#55555f;font-family:Arial,sans-serif;line-height:1.6">Keep shining! Mira crunched these numbers so you can plan next month with confidence ✦</p>
</td></tr>
<tr><td style="background:#17171f;padding:22px 36px;text-align:center">
  <div style="color:#e6c66e;font-size:16px">✦ Miracurl ✦</div>
  <div style="color:#8f8798;font-size:12px;margin-top:6px;font-family:Arial,sans-serif">Questions? Just reply to this email · {hq_email}</div>
  <div style="color:#5d5766;font-size:11px;margin-top:10px;font-family:Arial,sans-serif">Sent with ♥ by Mira — your salon's AI assistant</div>
</td></tr>
</table>
</td></tr></table>"""


def _weekly_report_html(t: dict, week_label: str, stats: dict) -> str:
    img = os.environ.get("WEEKLY_REPORT_IMAGE_URL", "")
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    img_row = (f'<tr><td style="padding:0"><img src="{img}" alt="Weekly Business Snapshot" width="600" '
               f'style="display:block;width:100%;border-radius:16px 16px 0 0"/></td></tr>') if img else ""

    prev = float(stats.get("prev_revenue") or 0)
    growth_chip = ""
    if prev > 0:
        pct = (stats["revenue"] - prev) / prev * 100
        up = pct >= 0
        growth_chip = (f'<span style="display:inline-block;margin-top:10px;background:{"#0d3321" if up else "#3a1520"};'
                       f'color:{"#4ade80" if up else "#fb7185"};font-family:Arial,sans-serif;font-size:12px;font-weight:bold;'
                       f'padding:5px 16px;border-radius:999px">{"▲" if up else "▼"} {abs(pct):.0f}% vs last week</span>')

    daily = stats.get("daily") or []
    max_d = max(daily) if daily and max(daily) > 0 else 0
    day_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    bars = ""
    for idx, val in enumerate(daily[:7]):
        pct_w = int(val / max_d * 100) if max_d else 0
        bars += (
            f'<tr><td style="padding:3px 0;width:44px;font-size:11px;color:#8a8a94;font-family:Arial,sans-serif">{day_labels[idx]}</td>'
            f'<td style="padding:3px 0"><table cellpadding="0" cellspacing="0" width="100%"><tr>'
            f'<td style="width:{max(pct_w, 2)}%;background:linear-gradient(90deg,#d4af37,#e6c66e);border-radius:4px;height:14px;font-size:1px">&nbsp;</td>'
            f'<td style="padding-left:8px;font-size:12px;color:#2b2b33;font-family:Arial,sans-serif;white-space:nowrap"><b>&#8377;{val:,.0f}</b></td>'
            f'<td width="100%"></td></tr></table></td></tr>')
    chart_block = (f'<tr><td style="padding:6px 36px 4px">'
                   f'<h3 style="font-size:13px;color:#a08a4b;margin:14px 0 10px;font-family:Arial,sans-serif;letter-spacing:2px;text-transform:uppercase">📊 Day by day</h3>'
                   f'<table width="100%" cellpadding="0" cellspacing="0">{bars}</table></td></tr>') if max_d else ""

    def _stat_card(label, value):
        return (f'<td style="background:#faf6ec;border:1px solid #ecdfc0;border-radius:12px;padding:14px 8px;text-align:center">'
                f'<div style="font-size:10px;color:#a08a4b;text-transform:uppercase;letter-spacing:2px;font-family:Arial,sans-serif">{label}</div>'
                f'<div style="font-size:19px;color:#2b2b33;font-weight:bold;margin-top:5px;font-family:Georgia,serif">{value}</div></td>')

    top_svc = stats["top_services"][0] if stats.get("top_services") else None
    top_stf = stats["top_staff"][0] if stats.get("top_staff") else None
    highlights = ""
    if top_svc or top_stf:
        rows = ""
        if top_svc:
            rows += (f'<tr><td style="padding:9px 16px;border-bottom:1px solid #f1e8d8;color:#2b2b33;font-size:13px;font-family:Arial,sans-serif">🏆 Top service: <b>{html_lib.escape(str(top_svc[0]))}</b></td>'
                     f'<td style="padding:9px 16px;border-bottom:1px solid #f1e8d8;color:#2b2b33;font-size:13px;text-align:right;font-family:Arial,sans-serif"><b>&#8377;{top_svc[1]:,.0f}</b></td></tr>')
        if top_stf:
            rows += (f'<tr><td style="padding:9px 16px;color:#2b2b33;font-size:13px;font-family:Arial,sans-serif">⭐ Star of the week: <b>{html_lib.escape(str(top_stf[0]))}</b></td>'
                     f'<td style="padding:9px 16px;color:#2b2b33;font-size:13px;text-align:right;font-family:Arial,sans-serif"><b>&#8377;{top_stf[1]:,.0f}</b></td></tr>')
        highlights = (f'<tr><td style="padding:4px 36px 8px">'
                      f'<h3 style="font-size:13px;color:#a08a4b;margin:14px 0 8px;font-family:Arial,sans-serif;letter-spacing:2px;text-transform:uppercase">✨ Highlights</h3>'
                      f'<table width="100%" cellpadding="0" cellspacing="0" style="background:#fdfbf5;border:1px solid #f1e8d8;border-radius:12px">{rows}</table></td></tr>')

    return f"""
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f14;padding:28px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;font-family:Georgia,'Times New Roman',serif;box-shadow:0 8px 40px rgba(212,175,55,.25)">
{img_row}
<tr><td style="background:linear-gradient(135deg,#17171f,#26202b);padding:24px 36px;text-align:center">
  <div style="color:#e6c66e;font-size:12px;letter-spacing:4px;text-transform:uppercase">✦ &nbsp;Weekly Business Snapshot&nbsp; ✦</div>
  <div style="color:#ffffff;font-size:24px;margin-top:8px">{html_lib.escape(t['name'])}</div>
  <div style="color:#b9b0c4;font-size:13px;margin-top:6px;font-family:Arial,sans-serif">{week_label}</div>
</td></tr>
<tr><td style="padding:26px 36px 4px;text-align:center">
  <div style="font-size:11px;color:#a08a4b;text-transform:uppercase;letter-spacing:3px;font-family:Arial,sans-serif">Week's Collection</div>
  <div style="font-size:36px;color:#1c1c24;font-weight:bold;margin-top:6px">&#8377;{stats['revenue']:,.0f}</div>
  {growth_chip}
</td></tr>
<tr><td style="padding:18px 36px 4px">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    {_stat_card("Bills", stats['invoices'])}
    <td style="width:10px"></td>
    {_stat_card("Avg Bill", f"&#8377;{stats['avg_bill']:,.0f}")}
    <td style="width:10px"></td>
    {_stat_card("New Guests", stats['new_customers'])}
  </tr></table>
</td></tr>
{chart_block}
{highlights}
<tr><td style="padding:14px 36px 24px;text-align:center">
  <p style="margin:0;font-size:13px;color:#55555f;font-family:Arial,sans-serif;line-height:1.6">A fresh week begins today — Mira wishes you a full appointment book ✦</p>
</td></tr>
<tr><td style="background:#17171f;padding:20px 36px;text-align:center">
  <div style="color:#e6c66e;font-size:16px">✦ Miracurl ✦</div>
  <div style="color:#8f8798;font-size:12px;margin-top:6px;font-family:Arial,sans-serif">Questions? Just reply to this email · {hq_email}</div>
  <div style="color:#5d5766;font-size:11px;margin-top:10px;font-family:Arial,sans-serif">Sent with ♥ by Mira — your salon's AI assistant</div>
</td></tr>
</table>
</td></tr></table>"""
