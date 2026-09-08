"""Tenant Account Profile — branded A4 PDF (HQ logo + tenant logo + every detail on file) and the HQ tenants CSV."""
import csv
import io
from datetime import datetime, timezone

from database import _raw_db
from services.pdf_brand import GOLD, GREY, INK, LIGHT, draw_brand_band, draw_logo, draw_powered_footer, draw_watermark, image_bytes_from_url, platform_logo_bytes

HQ_CONTACTS = [("General", "contact@miracurl-suite.com"), ("Support", "support@miracurl-suite.com"), ("Admin / Billing", "admin@miracurl-suite.com")]
CSV_COLS = ["Business", "Type", "Slug", "Status", "Plan", "Location", "Business phone", "Business email", "Owner name", "Owner phone",
            "Owner email", "Trial start", "Trial end", "Subscription start", "Subscription end", "Created", "Booking URL"]


def _d(v) -> str:
    return str(v)[:10] if v else "—"


async def tenant_profile_data(t: dict) -> dict:
    sub = await _raw_db.subscriptions.find_one({"tenant_id": t["id"], "status": "active"}, {"_id": 0}, sort=[("end_date", -1)])
    owner = await _raw_db.users.find_one({"email": (t.get("owner_email") or "").lower(), "role": "admin"}, {"_id": 0, "name": 1, "phone": 1}) or {}
    from routes.subscriptions import PLAN_CATALOG
    plan_key = (sub or {}).get("plan") or t.get("plan") or ""
    trial_start = t.get("created_at")
    trial_end = t.get("trial_end_date") or t.get("trial_ends_at")
    return {
        "business": [("Business name", t.get("name")), ("Type", (t.get("business_type") or "salon").title()), ("Location", t.get("location")),
                     ("Business phone", t.get("phone")), ("Business email", t.get("salon_email") or t.get("notify_email")),
                     ("Booking slug", t.get("slug")), ("Public page", f"https://miracurl-suite.com/book/{t.get('slug')}")],
        "owner": [("Owner name", t.get("owner_name") or owner.get("name")), ("Owner phone", t.get("owner_phone") or owner.get("phone")),
                  ("Owner email", t.get("owner_email")), ("WhatsApp", t.get("whatsapp_number"))],
        "access": [("Account status", (t.get("status") or "").upper()),
                   ("Free trial", f"{_d(trial_start)}  →  {_d(trial_end)}" + (f"  ({t['trial_months']} months)" if t.get("trial_months") else "")),
                   ("Active plan", (PLAN_CATALOG.get(plan_key, {}) or {}).get("label") or plan_key or "— (trial)"),
                   ("Subscription period", f"{_d((sub or {}).get('start_date'))}  →  {_d((sub or {}).get('end_date') or t.get('subscription_end_date'))}" if sub or t.get("subscription_end_date") else "— not subscribed yet"),
                   ("Member since", _d(t.get("created_at"))), ("GSTIN", t.get("gst_number"))],
        "sub": sub,
    }


def _section(c, x, y, mm, width, heading, rows):
    """Heading + two-column key/value table; values wrap, rows are zebra-striped. Returns new y."""
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import Paragraph, Table, TableStyle
    lab = ParagraphStyle("lab", fontName="Helvetica", fontSize=8.5, textColor=colors.Color(*GREY), leading=11)
    val = ParagraphStyle("val", fontName="Helvetica-Bold", fontSize=9.5, textColor=colors.Color(*INK), leading=12)
    c.setFillColorRGB(*GOLD)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(x, y, heading.upper())
    c.setStrokeColorRGB(*GOLD)
    c.setLineWidth(0.6)
    c.line(x, y - 2 * mm, x + width, y - 2 * mm)
    data = [[Paragraph(str(k), lab), Paragraph(str(v or "—").replace("&", "&amp;").replace("<", "&lt;"), val)] for k, v in rows]
    tbl = Table(data, colWidths=[42 * mm, width - 42 * mm])
    tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 3.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.Color(*LIGHT), colors.white]),
    ]))
    _, h = tbl.wrapOn(c, width, 400 * mm)
    tbl.drawOn(c, x, y - 4 * mm - h)
    return y - 4 * mm - h - 9 * mm


def build_tenant_profile_pdf(t: dict, data: dict, hq_logo: bytes | None, tenant_logo: bytes | None, site: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as rl_canvas
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    draw_watermark(c, hq_logo, W, H, 110 * mm)
    draw_brand_band(c, W, H, mm, logo=hq_logo, title="ACCOUNT PROFILE",
                    meta=[f"Issued {datetime.now(timezone.utc).strftime('%d %b %Y')}", f"Ref: {t['id'][:8].upper()}"])
    y = H - 56 * mm
    c.setFillColorRGB(*LIGHT)
    c.roundRect(18 * mm, y - 14 * mm, W - 36 * mm, 26 * mm, 4 * mm, stroke=0, fill=1)
    lx = 22 * mm
    if draw_logo(c, tenant_logo, lx, y - 12 * mm, 22 * mm, 22 * mm):
        lx += 27 * mm
    name = str(t.get("name") or t["slug"])
    c.setFillColorRGB(*INK)
    c.setFont("Helvetica-Bold", 15 if len(name) < 34 else 12)
    c.drawString(lx, y + 3 * mm, name[:60])
    c.setFillColorRGB(*GREY)
    c.setFont("Helvetica", 9)
    c.drawString(lx, y - 3 * mm, f"{(t.get('business_type') or 'salon').title()}  ·  {t.get('location') or ''}"[:80])
    c.setFillColorRGB(*GOLD)
    c.setFont("Helvetica-Bold", 9)
    c.drawRightString(W - 22 * mm, y + 3 * mm, (t.get("status") or "").upper())
    c.setFillColorRGB(*GREY)
    c.setFont("Helvetica", 8)
    c.drawRightString(W - 22 * mm, y - 3 * mm, f"miracurl-suite.com/book/{t.get('slug')}")
    y -= 26 * mm
    width = W - 36 * mm
    y = _section(c, 18 * mm, y, mm, width, "Business details", data["business"])
    y = _section(c, 18 * mm, y, mm, width, "Owner", data["owner"])
    y = _section(c, 18 * mm, y, mm, width, "Access & subscription", data["access"])
    contacts = list(HQ_CONTACTS) + ([("WhatsApp", f"+{site['whatsapp']}")] if site.get("whatsapp") else [])
    _section(c, 18 * mm, y, mm, width, "Miracurl HQ — we're here for you", contacts)
    draw_powered_footer(c, W, mm, hq_logo, [
        "This profile lists the details on file for your account. Update them anytime from Settings → Salon / Restaurant profile.",
        "Terms: miracurl-suite.com/terms   ·   Privacy: miracurl-suite.com/privacy", "Miracurl Suite · Salon & Restaurant Management"])
    c.save()
    return buf.getvalue()


async def render_tenant_profile(t: dict) -> bytes:
    import asyncio
    data = await tenant_profile_data(t)
    site = await _raw_db.platform_settings.find_one({"key": "site_info"}, {"_id": 0}) or {}
    hq_logo = await platform_logo_bytes()
    tenant_logo = await image_bytes_from_url(t.get("logo_url"))
    return await asyncio.to_thread(build_tenant_profile_pdf, t, data, hq_logo, tenant_logo, site)


async def tenants_csv() -> str:
    rows = await _raw_db.tenants.find({"status": {"$ne": "deleted"}}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    subs = {s["tenant_id"]: s async for s in _raw_db.subscriptions.find({"status": "active"}, {"_id": 0, "tenant_id": 1, "plan": 1, "start_date": 1, "end_date": 1})}
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(CSV_COLS)
    for t in rows:
        s = subs.get(t["id"], {})
        w.writerow([t.get("name"), t.get("business_type") or "salon", t.get("slug"), t.get("status"), s.get("plan") or t.get("plan"), t.get("location"),
                    t.get("phone"), t.get("salon_email") or t.get("notify_email"), t.get("owner_name"), t.get("owner_phone"), t.get("owner_email"),
                    _d(t.get("created_at")), _d(t.get("trial_end_date") or t.get("trial_ends_at")), _d(s.get("start_date")),
                    _d(s.get("end_date") or t.get("subscription_end_date")), _d(t.get("created_at")), f"https://miracurl-suite.com/book/{t.get('slug')}"])
    return out.getvalue()
