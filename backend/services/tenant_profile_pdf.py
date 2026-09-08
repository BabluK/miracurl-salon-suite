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


def _block(c, x, y, mm, heading, rows, label_w=38):
    c.setFillColorRGB(*GOLD)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(x, y, heading.upper())
    y -= 6.5 * mm
    for label, val in rows:
        c.setFillColorRGB(*GREY)
        c.setFont("Helvetica", 8.5)
        c.drawString(x, y, label)
        c.setFillColorRGB(*INK)
        c.setFont("Helvetica-Bold", 9.5)
        c.drawString(x + label_w * mm, y, str(val or "—")[:70])
        y -= 6 * mm
    return y - 4 * mm


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
    # tenant identity strip
    c.setFillColorRGB(*LIGHT)
    c.roundRect(18 * mm, y - 14 * mm, W - 36 * mm, 26 * mm, 4 * mm, stroke=0, fill=1)
    lx = 22 * mm
    if draw_logo(c, tenant_logo, lx, y - 12 * mm, 22 * mm, 22 * mm):
        lx += 27 * mm
    c.setFillColorRGB(*INK)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(lx, y + 3 * mm, str(t.get("name") or t["slug"])[:48])
    c.setFillColorRGB(*GREY)
    c.setFont("Helvetica", 9)
    c.drawString(lx, y - 3 * mm, f"{(t.get('business_type') or 'salon').title()}  ·  {t.get('location') or ''}"[:90])
    c.setFillColorRGB(*GOLD)
    c.setFont("Helvetica-Bold", 9)
    c.drawRightString(W - 22 * mm, y + 3 * mm, (t.get("status") or "").upper())
    c.setFillColorRGB(*GREY)
    c.setFont("Helvetica", 8)
    c.drawRightString(W - 22 * mm, y - 3 * mm, f"miracurl-suite.com/book/{t.get('slug')}")
    y -= 26 * mm
    y_l = _block(c, 18 * mm, y, mm, "Business details", data["business"])
    y_r = _block(c, 110 * mm, y, mm, "Owner", data["owner"], label_w=30)
    y = min(y_l, y_r)
    y = _block(c, 18 * mm, y, mm, "Access & subscription", data["access"], label_w=42)
    c.setFillColorRGB(*GOLD)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(18 * mm, y, "MIRACURL HQ — WE'RE HERE FOR YOU")
    y -= 6.5 * mm
    for label, mail in HQ_CONTACTS:
        c.setFillColorRGB(*GREY); c.setFont("Helvetica", 8.5); c.drawString(18 * mm, y, label)
        c.setFillColorRGB(*INK); c.setFont("Helvetica-Bold", 9.5); c.drawString(56 * mm, y, mail)
        y -= 6 * mm
    if site.get("whatsapp"):
        c.setFillColorRGB(*GREY); c.setFont("Helvetica", 8.5); c.drawString(18 * mm, y, "WhatsApp")
        c.setFillColorRGB(*INK); c.setFont("Helvetica-Bold", 9.5); c.drawString(56 * mm, y, f"+{site['whatsapp']}")
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
