"""HQ conversion alerts — leaf service (imports no routers) so auth/lead_gen/hq_documents/lead_wa_auto can hook
into it without circular imports. Emails admin@ once per (lead, kind) when an outreach lead replies / books / signs up."""
import html as _html
import os
import re
import uuid
from datetime import datetime, timezone

from database import _raw_db
from routes.lead_common import log_mira_event


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def country_of(city: str) -> str:
    m = re.search(r",\s*([A-Za-z]{2,3})$", (city or "").strip())
    return m.group(1).upper() if m else "IN"


async def notify_hq_conversion(lead: dict, kind: str, snippet: str = "") -> bool:
    """Email admin@ the moment a lead we reached out to replies / books a demo / signs up (once per kind)."""
    from email_service import _send_email, hq_notify_emails
    if kind in (lead.get("conversion_alerts") or []):
        return False
    try:
        from services.mira_brain import remember_conversion
        await remember_conversion(lead, kind)
    except Exception:  # noqa: BLE001
        log.exception("mira memory (conversion) failed")
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    vert = "Restaurant" if (lead.get("vertical") or "salon") == "restaurant" else "Salon"
    label = {"replied": "replied to Mira's email", "wa_replied": "replied on WhatsApp",
             "demo": "requested a live demo", "signup": "signed up for a free trial"}.get(kind, kind)
    rows = "".join(f'<tr><td style="padding:6px 10px;color:#777;font-size:12px">{k}</td><td style="padding:6px 10px;font-size:13px"><b>{_html.escape(str(v))}</b></td></tr>'
                   for k, v in (("Business", lead.get("name")), ("Type", vert), ("City", lead.get("city")),
                                ("Email", lead.get("email")), ("Phone", lead.get("phone") or "—"),
                                ("Score", f"{lead.get('score') or 0}/100 · {lead.get('reviews') or 0} reviews")) if v)
    html = f"""
      <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #e6ddc8;border-radius:16px;overflow:hidden">
        <div style="background:#1c1c22;padding:22px 26px"><div style="color:#e8c37f;font-size:18px;font-weight:bold">🔥 Hot lead converted — {vert}</div>
          <div style="color:#8a8a92;font-size:11px;letter-spacing:2px;margin-top:4px">MIRA OUTREACH AUTOPILOT</div></div>
        <div style="padding:22px 26px;font-family:Arial,sans-serif;color:#333;font-size:14px;line-height:1.6">
          <p>Boss, <b>{_html.escape(lead.get('name') or 'a lead')}</b> just <b>{label}</b>. Time to send the demo invite ✦</p>
          <table style="border-collapse:collapse;width:100%;background:#fff;border:1px solid #eee;border-radius:10px">{rows}</table>
          {f'<p style="background:#f7f2e7;padding:12px 14px;border-radius:10px;font-size:13px;color:#555;margin-top:14px"><i>“{_html.escape(snippet[:400])}”</i></p>' if snippet else ''}
          <p style="text-align:center;margin:22px 0 4px"><a href="{base}/super-admin?tab=mira-leads" style="background:#1c1c22;color:#e8c37f;text-decoration:none;padding:12px 30px;border-radius:999px;font-weight:bold">Open Lead Agent → send demo invite</a></p>
        </div></div>"""
    res = await _send_email(hq_notify_emails("admin"), f"🔥 {lead.get('name') or 'Lead'} {label} — send the demo invite",
                            html, from_name="Mira at Miracurl", suite_label="HQ alert")
    await _raw_db.mira_leads.update_one({"id": lead["id"]}, {"$addToSet": {"conversion_alerts": kind},
                                                             "$set": {"conversion_alerted_at": _now()}})
    await _raw_db.mira_outreach_log.insert_one({
        "id": str(uuid.uuid4()), "day": _today(), "created_at": _now(), "channel": "conversion", "kind": kind,
        "lead_id": lead["id"], "name": lead.get("name") or "", "vertical": lead.get("vertical") or "salon",
        "city": lead.get("city") or "", "country": country_of(lead.get("city")), "email": lead.get("email") or "",
        "detail": snippet[:160], "hq_emailed": bool(res.get("sent"))})
    await log_mira_event("alert", f"🔥 {lead.get('name') or 'A lead'} {label} — I emailed HQ so you can send the demo invite.")
    return bool(res.get("sent"))


async def notify_hq_conversion_by_email(email: str, kind: str, snippet: str = "") -> bool:
    em = (email or "").strip().lower()
    if not em:
        return False
    lead = await _raw_db.mira_leads.find_one({"$or": [{"email": em}, {"all_emails": em}]}, {"_id": 0})
    return await notify_hq_conversion(lead, kind, snippet) if lead else False
