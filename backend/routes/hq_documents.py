"""HQ Documents Center — policy/overview PDFs generated on demand, plus combined platform earnings."""
import asyncio
import base64
import calendar
import html as html_lib
import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel, Field

from database import _raw_db
from email_service import _send_email
from security import public_rate_limit, require_super_admin

router = APIRouter()

DOCS = {
    "onboarding_policy": {
        "title": "Tenant & Employee Onboarding Policy",
        "subtitle": "Step-by-step onboarding for new salons and their staff",
        "description": "The complete step-by-step guide to onboard a new salon (tenant) and its employees onto the Miracurl Suite.",
        "sections": [
            ("Salon (Tenant) Onboarding — Steps", [
                "Step 1 — Signup: the owner creates the salon at miracurl-suite.com/signup-salon (2 minutes, 7-day free trial, no card needed).",
                "Step 2 — Services & pricing: add the full service catalogue with categories and prices (Excel import supported).",
                "Step 3 — Staff onboarding: add every staff member with name, mobile and Aadhaar for registry verification.",
                "Step 4 — Branch setup: configure branches, working hours and owner PIN for protected actions.",
                "Step 5 — Go live: the salon receives its public booking page and SEO salon page (miracurl-suite.com/salon/<name>).",
                "Step 6 — Training: 30-minute walkthrough of POS billing, appointments and the dashboard with the Miracurl team.",
                "Step 7 — Handover: owner credentials issued by email from noreply@miracurl-suite.com; trial-to-paid plan explained.",
            ]),
            ("Employee Onboarding — Steps", [
                "Step 1 — Registry entry: HQ or the salon owner records the employee with name, mobile and Aadhaar (stored as a secure hash).",
                "Step 2 — Verification: HQ verifies the record; the employee receives a unique Miracurl staff code.",
                "Step 3 — ID card: a QR-verified Miracurl ID card is generated for the employee.",
                "Step 4 — Portal access: the employee self-registers on the Employee Portal (miracurl-suite.com/employee) using mobile + Aadhaar.",
                "Step 5 — Profile & resume: the employee completes their profile and builds their Miracurl-verified PDF resume.",
                "Step 6 — Salon login: if the employee works at a salon, the owner creates their salon-app credentials (attach flow).",
            ]),
            ("Data & Compliance", [
                "Aadhaar numbers are never stored in plain text — only salted cryptographic hashes are kept.",
                "Employees marked as 'Left' lose salon-app access immediately but retain Employee Portal access.",
                "All onboarding actions are logged with the acting admin's identity.",
            ]),
        ],
    },
    "hiring_policy": {
        "title": "Employee Hiring Policy",
        "subtitle": "Rules of the Miracurl Staff Hiring Marketplace",
        "description": "Eligibility, verification, trials, placement fees and conduct rules for hiring through Miracurl.",
        "sections": [
            ("Eligibility & Verification", [
                "Only staff verified in the Miracurl HQ Registry (mobile + Aadhaar on file) may apply to openings.",
                "Salon identity is hidden from candidates until they are shortlisted by HQ.",
                "Employment history shown to salons is registry-verified; HQ-verified records carry a badge.",
            ]),
            ("Hiring Process", [
                "1. The salon owner posts a hiring request from their dashboard — it goes directly to Miracurl HQ.",
                "2. HQ curates and proposes matching verified candidates to the salon.",
                "3. Trials are scheduled through HQ; both sides receive updates at every step.",
                "4. When the salon creates login credentials for the candidate, the hire is confirmed automatically.",
            ]),
            ("Placement Fee", [
                "A one-time placement fee (amount set by Miracurl HQ, default Rs.1,000) is due per successful hire.",
                "On hire confirmation, the owner automatically receives an email with a Razorpay payment link.",
                "The fee is marked paid automatically when the link is paid, or manually by HQ for offline payments.",
            ]),
            ("Conduct & Anti-Poaching", [
                "Salons must not contact candidates outside the platform before a confirmed hire.",
                "Candidate ratings and reviews must be honest and relate to actual employment.",
                "Misuse of candidate personal data leads to removal from the marketplace.",
            ]),
            ("Exits", [
                "When a staff member leaves, the salon must mark them 'Left' in the registry within 7 days.",
                "Marked-left staff keep their Employee Portal access and appear as available candidates again.",
            ]),
        ],
    },
    "suite_overview": {
        "title": "Miracurl Salon Suite — Complete Overview",
        "subtitle": "Every module of the all-in-one salon platform",
        "description": "A share-ready overview of the entire Miracurl Suite for prospective salons and partners.",
        "sections": [
            ("Your 12-Agent AI Team", [
                "AI Orchestrator — the central brain coordinating every agent below.",
                "Social Media, Video Creator & Content Writer Agents — daily posts, promo videos, captions and offers, generated automatically.",
                "WhatsApp & Email Marketing Agents — booking confirmations, birthday offers, win-back campaigns and business digests.",
                "Lead Finder & Sales Agents — capture enquiries from your public page and answer prospects 24/7.",
                "SEO & Google Business Agents — Google-indexed salon page plus automatic review replies.",
                "Staff Verification & Analytics Agents — Aadhaar-verified registry, QR ID cards, weekly and monthly reports.",
            ]),
            ("Run the Salon", [
                "Appointments & Online Bookings — 24/7 public booking page per salon, with Mira the AI receptionist.",
                "Smart POS & GST Billing — fast counter billing, e-receipts by email/SMS, coupons, memberships and loyalty points.",
                "Customer CRM — visit history, birthday offers, win-back nudges for lapsed customers.",
                "Inventory & Multi-branch — stock tracking and branch-level management under one account.",
            ]),
            ("Grow the Salon", [
                "Mira Social Studio — AI-generated daily posts, flyers, promo videos and flash offers.",
                "Marketing Auto-Pilot — win-back emails, review auto-replies and WhatsApp campaigns on autopilot.",
                "Public SEO Pages — every salon gets a Google-indexed page with services, ratings and Book Now.",
                "Reports & Digests — revenue analytics, staff leaderboards and business summaries.",
            ]),
            ("Trusted Staffing", [
                "HQ-Verified Staff Registry — Aadhaar-verified staff records with QR ID cards.",
                "Hiring Marketplace — post openings, receive curated verified candidates, transparent placement fee.",
                "Employee Portal — staff manage profiles, build verified PDF resumes and apply to openings.",
            ]),
            ("Platform & Security", [
                "Multi-tenant SaaS with per-salon data isolation and role-based access (owner / manager / staff).",
                "Razorpay-powered subscription billing with automated renewal reminders.",
                "Two independent security audits passed; HTTPS everywhere; Aadhaar stored as salted hashes only.",
            ]),
        ],
    },
    "terms_conditions": {
        "title": "Terms & Conditions Policy",
        "subtitle": "Miracurl Suite subscription and usage terms",
        "description": "The terms every tenant accepts when subscribing to the Miracurl Suite.",
        "sections": [
            ("Subscription & Payments", [
                "Plans: 7-day free trial, then half-yearly or annual subscription as published on the pricing page.",
                "Payments are collected via Razorpay; prices are exclusive of applicable taxes unless stated.",
                "Renewal reminders are sent before expiry; access is suspended if the subscription lapses.",
            ]),
            ("Refunds & Cancellation", [
                "The free trial can be cancelled anytime at no cost.",
                "Paid subscriptions are refundable within 7 days of first payment; refunds revoke plan access.",
                "Placement fees are non-refundable once a hire is confirmed.",
            ]),
            ("Data & Privacy", [
                "Each salon's data (customers, billing, staff) is isolated and never shared with other tenants.",
                "Aadhaar numbers are stored only as irreversible salted hashes for verification.",
                "The salon owns its business data and may request an export at any time.",
            ]),
            ("Acceptable Use", [
                "The platform must not be used for unlawful communication or spam campaigns.",
                "Marketplace conduct rules (see Employee Hiring Policy) apply to all hiring activity.",
            ]),
            ("Liability & Termination", [
                "Miracurl provides the software 'as is' with commercially reasonable uptime targets.",
                "Miracurl may suspend accounts that breach these terms after notice.",
                "Disputes are subject to the jurisdiction of Bengaluru, Karnataka, India.",
            ]),
        ],
    },
}


def _doc_pdf(doc: dict) -> bytes:
    import io
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as rl_canvas
    import textwrap

    gold, ink, grey = (0.72, 0.6, 0.25), (0.12, 0.12, 0.14), (0.4, 0.4, 0.45)
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=A4)
    W, H = A4

    c.setFillColorRGB(*ink)
    c.rect(0, H - 40 * mm, W, 40 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*gold)
    c.setFont("Helvetica-Bold", 19)
    c.drawString(20 * mm, H - 20 * mm, doc["title"])
    c.setFillColorRGB(0.92, 0.92, 0.92)
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, H - 27 * mm, doc["subtitle"])
    c.setFont("Helvetica-Oblique", 8.5)
    c.drawString(20 * mm, H - 34 * mm,
                 f"Miracurl Suite · miracurl-suite.com · issued {datetime.now(timezone.utc).strftime('%d %b %Y')}")

    y = H - 50 * mm
    for heading, points in doc["sections"]:
        if y < 45 * mm:
            c.showPage(); y = H - 25 * mm
        c.setFillColorRGB(*gold)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(20 * mm, y, heading.upper())
        c.setStrokeColorRGB(*gold)
        c.setLineWidth(0.7)
        c.line(20 * mm, y - 2 * mm, W - 20 * mm, y - 2 * mm)
        y -= 9 * mm
        for pt in points:
            for j, line in enumerate(textwrap.wrap(pt, 92)):
                if y < 22 * mm:
                    c.showPage(); y = H - 25 * mm
                c.setFillColorRGB(*ink)
                c.setFont("Helvetica", 10)
                prefix = "•  " if j == 0 else "    "
                c.drawString(22 * mm, y, prefix + line)
                y -= 5.4 * mm
            y -= 1.5 * mm
        y -= 4 * mm

    c.setFillColorRGB(*grey)
    c.setFont("Helvetica-Oblique", 8)
    c.drawCentredString(W / 2, 12 * mm, "© Miracurl Suite — this document is part of the tenant onboarding pack")
    c.save()
    return buf.getvalue()


@router.get("/super-admin/documents")
async def list_documents(user=Depends(require_super_admin)):
    return {"documents": [
        {"key": k, "title": d["title"], "subtitle": d["subtitle"], "description": d["description"]}
        for k, d in DOCS.items()]}


@router.get("/super-admin/documents/{key}/pdf")
async def document_pdf(key: str, user=Depends(require_super_admin)):
    doc = DOCS.get(key)
    if not doc:
        raise HTTPException(404, "Document not found")
    pdf = await asyncio.to_thread(_doc_pdf, doc)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="miracurl-{key.replace("_", "-")}.pdf"'})


@router.get("/super-admin/earnings")
async def platform_earnings(user=Depends(require_super_admin)):
    """Combined platform income — subscriptions + placement fees, last 6 months."""
    now = datetime.now(timezone.utc)
    months = []
    y, m = now.year, now.month
    for _ in range(6):
        months.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    months.reverse()

    subs = {mo: 0.0 for mo in months}
    fees = {mo: 0.0 for mo in months}
    async for p in _raw_db.subscription_payments.find(
            {"status": {"$nin": ["created", "failed"]}},
            {"_id": 0, "amount": 1, "paid_at": 1, "created_at": 1}):
        mo = (p.get("paid_at") or p.get("created_at") or "")[:7]
        if mo in subs:
            subs[mo] += float(p.get("amount") or 0)
    async for f in _raw_db.placement_fees.find({"status": "paid"}, {"_id": 0, "amount": 1, "paid_at": 1, "created_at": 1}):
        mo = (f.get("paid_at") or f.get("created_at") or "")[:7]
        if mo in fees:
            fees[mo] += float(f.get("amount") or 0)

    series = [{"month": mo, "label": calendar.month_abbr[int(mo[5:7])],
               "subscriptions": round(subs[mo], 2), "placement_fees": round(fees[mo], 2)}
              for mo in months]
    due_fees = 0.0
    async for f in _raw_db.placement_fees.find({"status": "due"}, {"_id": 0, "amount": 1}):
        due_fees += float(f.get("amount") or 0)
    return {"series": series,
            "totals": {"subscriptions": round(sum(subs.values()), 2),
                       "placement_fees": round(sum(fees.values()), 2),
                       "combined": round(sum(subs.values()) + sum(fees.values()), 2),
                       "placement_fees_due": round(due_fees, 2)}}


def suite_overview_attachment() -> dict:
    """Resend attachment dict for the Suite Overview PDF (welcome-email brochure)."""
    pdf = _doc_pdf(DOCS["suite_overview"])
    return {"filename": "miracurl-suite-overview.pdf",
            "content": base64.b64encode(pdf).decode()}


def _all_doc_attachments() -> list:
    from services.brochure import build_brochure_pdf
    items = [{"filename": f"miracurl-{k.replace('_', '-')}.pdf",
              "content": base64.b64encode(_doc_pdf(d)).decode()}
             for k, d in DOCS.items()]
    try:
        items.append({"filename": "miracurl-salon-brochure.pdf",
                      "content": base64.b64encode(build_brochure_pdf()).decode()})
    except Exception:
        pass
    return items


async def _live_plans() -> list:
    from routes.subscriptions import load_plan_overrides, PLAN_CATALOG
    try:
        await load_plan_overrides()
        return [{"key": k, **v} for k, v in PLAN_CATALOG.items()]
    except Exception:
        return []


def _demo_email_html(recipient_name: str, salon_name: str, note: str, hq_email: str,
                     plans: list | None = None, track_base: str = "", invite_id: str = "") -> str:
    name = html_lib.escape(recipient_name or "").strip()
    salon = html_lib.escape(salon_name or "").strip()
    greeting = f"Dear {name}," if name else "Dear Salon Owner,"
    salon_line = f" at <b>{salon}</b>" if salon else ""
    note_block = ""
    if note.strip():
        note_block = f"""
        <tr><td style="padding:0 36px 22px">
          <div style="background:#fdf8ec;border:1px solid #ecdcae;border-radius:12px;padding:16px 20px;font-size:14px;color:#5d5340;line-height:1.6">
            {html_lib.escape(note.strip())}
          </div>
        </td></tr>"""
    mailto = (f"mailto:{hq_email}?subject=Demo%20request%20—%20Miracurl%20Suite"
              f"&body=Hi%20Miracurl%20team%2C%0A%0AI%27d%20love%20a%20demo%20of%20the%20Miracurl%20Salon%20Suite."
              f"%0AMy%20preferred%20time%3A%20%0AMy%20salon%3A%20%0APhone%3A%20%0A%0AThank%20you!")
    cta_href = f"{track_base}/api/public/demo-track/{invite_id}/click" if (track_base and invite_id) else mailto
    pixel = (f'<img src="{track_base}/api/public/demo-track/{invite_id}/open.png" width="1" height="1" '
             f'style="display:block;width:1px;height:1px;border:0" alt="">') if (track_base and invite_id) else ""

    def _module(icon, title, desc):
        return f"""
        <td width="50%" valign="top" style="padding:10px 12px">
          <div style="font-size:22px;line-height:1">{icon}</div>
          <div style="font-family:Georgia,serif;font-size:15px;color:#1d1d24;margin-top:6px;font-weight:bold">{title}</div>
          <div style="font-size:12.5px;color:#6c6c78;line-height:1.55;margin-top:4px">{desc}</div>
        </td>"""

    agents = [
        ("🧠", "AI Orchestrator", "the central brain coordinating every agent"),
        ("📱", "Social Media Agent", "daily posts &amp; flyers, on autopilot"),
        ("🎥", "Video Creator Agent", "promo videos generated for you"),
        ("💬", "WhatsApp Agent", "confirmations, win-backs &amp; campaigns"),
        ("📧", "Email Marketing Agent", "birthday offers &amp; lapsed-client nudges"),
        ("🔍", "Lead Finder Agent", "captures &amp; qualifies new enquiries"),
        ("🌐", "SEO Agent", "your Google-indexed public salon page"),
        ("⭐", "Google Business Agent", "review replies, automatically"),
        ("👥", "Staff Verification Agent", "Aadhaar-verified registry &amp; ID cards"),
        ("📊", "Analytics Agent", "weekly &amp; monthly business digests"),
        ("💼", "Sales Agent", "answers your customers 24/7"),
        ("📝", "Content Writer Agent", "offers, captions &amp; descriptions"),
    ]
    agent_rows = ""
    for i in range(0, len(agents), 2):
        cells = ""
        for icon, title, desc in agents[i:i + 2]:
            cells += f"""
            <td width="50%" valign="top" style="padding:7px 12px">
              <div style="font-size:13px;color:#f4f1e8"><span style="font-size:15px">{icon}</span>
                <b style="font-family:Georgia,serif;letter-spacing:.3px">&nbsp;{title}</b></div>
              <div style="font-size:11.5px;color:#a49d8e;line-height:1.5;margin-top:2px;padding-left:24px">{desc}</div>
            </td>"""
        agent_rows += f"<tr>{cells}</tr>"
    agents_block = f"""
  <tr><td style="padding:10px 24px 6px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#15151b;border-radius:14px">
      <tr><td style="padding:20px 14px 6px 24px">
        <div style="font-size:11px;letter-spacing:2px;color:#d4af37;font-weight:bold">MEET YOUR AI TEAM</div>
        <div style="font-family:Georgia,serif;font-size:17px;color:#f4f1e8;margin-top:5px">
          12 specialist AI agents, working for your salon around the clock</div>
      </td></tr>
      {agent_rows}
      <tr><td colspan="2" style="padding:8px 24px 18px">
        <div style="font-size:11.5px;color:#8f8798;line-height:1.5">Each agent quietly handles its own job — you simply run your salon, and Mira runs the rest.</div>
      </td></tr>
    </table>
  </td></tr>"""

    pricing_block = ""
    if plans:
        show = [p for p in plans if (p.get("branches") or 1) == 1] or plans[:2]
        rows = ""
        for p in show:
            months = max(1, round((p.get("duration_days") or 30) / 30))
            per_mo = (p.get("price") or 0) / months
            rows += f"""
        <tr>
          <td style="padding:10px 16px;border-top:1px solid #eee9dc;font-size:13.5px;color:#33333b"><b>{html_lib.escape(str(p.get('label', '')))}</b>
            <div style="font-size:11px;color:#9a948a">{months} month{'s' if months > 1 else ''} · up to {p.get('branches', 1)} branch{'es' if (p.get('branches') or 1) > 1 else ''}</div></td>
          <td align="right" style="padding:10px 16px;border-top:1px solid #eee9dc;font-size:15px;color:#1d1d24"><b>₹{round(p.get('price') or 0):,}</b>
            <div style="font-size:11px;color:#9a948a">≈ ₹{round(per_mo):,}/month</div></td>
        </tr>"""
        pricing_block = f"""
  <tr><td style="padding:14px 36px 4px">
    <div style="font-size:11px;letter-spacing:2px;color:#9a8f6d;font-weight:bold">SIMPLE, HONEST PRICING</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;background:#fdfcf8;border:1px solid #eee9dc;border-radius:12px;overflow:hidden">
      <tr><td colspan="2" style="padding:12px 16px;font-size:12.5px;color:#55555f;line-height:1.6">
        Start with a <b>7-day free trial</b> — no card, no commitment. Then choose the plan that fits:</td></tr>
      {rows}
      <tr><td colspan="2" style="padding:10px 16px;border-top:1px solid #eee9dc;font-size:11px;color:#9a948a">All features included in every plan — POS, bookings, CRM and the full 12-agent AI team. Multi-branch plans also available — ask us in the demo.</td></tr>
    </table>
  </td></tr>"""

    return f"""<!doctype html><html><body style="margin:0;padding:0;background:#f2f0eb">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0eb;padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,.08)">
  <tr><td style="background:#15151b;padding:34px 36px 30px">
    <div style="font-family:Georgia,serif;font-size:26px;letter-spacing:4px;color:#d4af37">MIRACURL</div>
    <div style="color:#b9b2a3;font-size:12px;letter-spacing:2.5px;margin-top:5px">THE ALL-IN-ONE SALON SUITE</div>
    <div style="height:2px;width:64px;background:#d4af37;margin-top:16px"></div>
    <div style="font-family:Georgia,serif;color:#f4f1e8;font-size:21px;margin-top:18px;line-height:1.4">
      An invitation to see your salon,<br>run beautifully.</div>
  </td></tr>
  <tr><td style="padding:30px 36px 8px">
    <p style="font-size:15px;color:#33333b;line-height:1.7;margin:0 0 14px">{greeting}</p>
    <p style="font-size:14px;color:#55555f;line-height:1.75;margin:0 0 14px">
      We hope this message finds you and your team{salon_line} doing wonderfully.
      We're writing with a warm invitation — no obligation at all — to see a short, personalised demo of the
      <b>Miracurl Salon Suite</b>, the all-in-one platform trusted by growing salons to manage bookings,
      billing, staff and marketing from a single elegant dashboard.</p>
    <p style="font-size:14px;color:#55555f;line-height:1.75;margin:0">
      We know your day is busy, so the demo takes just <b>20 minutes</b>, at a time of your choosing —
      and you're free to simply watch, ask questions, or explore at your own pace.</p>
  </td></tr>
  {note_block}
  <tr><td style="padding:8px 24px 4px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>{_module("📅", "Appointments &amp; 24/7 Online Booking", "Your own public booking page with Mira, the AI receptionist — customers book even while you sleep.")}
          {_module("🧾", "Smart POS &amp; GST Billing", "Fast counter billing, e-receipts by email &amp; SMS, coupons, memberships and loyalty points.")}</tr>
      <tr>{_module("✨", "Mira AI Marketing Studio", "Daily social posts, promo videos, flash offers and win-back campaigns — created for you, automatically.")}
          {_module("👥", "Verified Staff &amp; Hiring", "Aadhaar-verified staff registry, QR ID cards and a curated hiring marketplace when you need talent.")}</tr>
      <tr>{_module("📊", "Reports &amp; Weekly Digests", "Revenue analytics, staff leaderboards and business summaries delivered to your inbox.")}
          {_module("🔐", "Secure &amp; Multi-branch", "Bank-grade security, per-salon data isolation, and every branch under one account.")}</tr>
    </table>
  </td></tr>
  {agents_block}
  {pricing_block}
  <tr><td align="center" style="padding:26px 36px 8px">
    <a href="{cta_href}" style="display:inline-block;background:#d4af37;color:#15151b;font-size:15px;font-weight:bold;
       text-decoration:none;padding:15px 42px;border-radius:999px;letter-spacing:.4px">Request my demo time ✦</a>
    <div style="font-size:12px;color:#8f8798;margin-top:12px">Or simply reply to this email with a day &amp; time that suits you — we'll fit around your schedule.</div>
  </td></tr>
  <tr><td style="padding:22px 36px 6px">
    <div style="background:#f7f6f2;border-radius:12px;padding:16px 20px">
      <div style="font-size:12px;letter-spacing:1.5px;color:#9a8f6d;font-weight:bold">📎 ATTACHED FOR YOU</div>
      <div style="font-size:13px;color:#55555f;line-height:1.7;margin-top:6px">
        Complete Suite Overview &nbsp;·&nbsp; Sales Brochure with real app screenshots &nbsp;·&nbsp; Onboarding Policy &nbsp;·&nbsp; Hiring Policy &nbsp;·&nbsp; Terms &amp; Conditions —
        everything you need to review at leisure, before we ever speak.</div>
    </div>
  </td></tr>
  <tr><td style="padding:20px 36px 30px">
    <p style="font-size:14px;color:#55555f;line-height:1.7;margin:0">
      Thank you so much for your time — we'd be honoured to show you what Miracurl can do for your salon.</p>
    <p style="font-size:14px;color:#33333b;line-height:1.7;margin:12px 0 0">Warm regards,<br>
      <b style="font-family:Georgia,serif">The Miracurl Team</b><br>
      <span style="font-size:12px;color:#8f8798">miracurl-suite.com · {html_lib.escape(hq_email)}</span></p>
  </td></tr>
  <tr><td style="background:#15151b;padding:16px 36px;text-align:center">
    <div style="color:#6d675c;font-size:11px">© Miracurl Suite — sent with care from Miracurl HQ. If this isn't relevant, simply ignore this email.</div>
  </td></tr>
</table>
</td></tr></table>{pixel}</body></html>"""


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class DemoRecipient(BaseModel):
    email: str = Field(..., max_length=120)
    name: str = Field(default="", max_length=80)
    salon_name: str = Field(default="", max_length=100)


class DemoCampaignIn(BaseModel):
    recipients: list[DemoRecipient] = Field(..., min_length=1, max_length=100)
    note: str = Field(default="", max_length=600)
    subject: str = Field(default="", max_length=140)


@router.get("/super-admin/demo-campaign/recipients")
async def demo_campaign_recipients(user=Depends(require_super_admin)):
    """Prospect pool only — existing tenants (already partners) are excluded."""
    tenant_emails = set(await _raw_db.tenants.distinct("owner_email"))
    leads = await _raw_db.tenant_inquiries.find(
        {"email": {"$exists": True, "$ne": ""}},
        {"_id": 0, "name": 1, "email": 1, "salon_name": 1, "status": 1}).sort("created_at", -1).to_list(500)
    return {
        "leads": [{"name": l.get("name", ""), "email": l["email"],
                   "salon_name": l.get("salon_name", ""), "status": l.get("status", "")}
                  for l in leads if l["email"].lower() not in tenant_emails],
    }


@router.post("/super-admin/demo-campaign/send")
async def demo_campaign_send(body: DemoCampaignIn, request: Request, user=Depends(require_super_admin)):
    seen, targets = set(), []
    for r in body.recipients:
        em = r.email.strip().lower()
        if not _EMAIL_RE.match(em):
            raise HTTPException(400, f"Invalid email address: {r.email}")
        if em not in seen:
            seen.add(em)
            targets.append((em, r.name.strip(), r.salon_name.strip()))

    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    subject = body.subject.strip() or "A warm invitation — see your salon run beautifully with Miracurl ✦"
    attachments = await asyncio.to_thread(_all_doc_attachments)
    tenant_emails = set(await _raw_db.tenants.distinct("owner_email"))
    plans = await _live_plans()
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    track_base = f"https://{host}" if host else os.environ.get("APP_PUBLIC_URL", "").rstrip("/")

    results = []
    for em, name, salon in targets:
        if em in tenant_emails:
            results.append({"email": em, "sent": False, "error": "Already a Miracurl partner — skipped"})
            continue
        existing = await _raw_db.demo_invites.find_one({"email": em}, {"_id": 0, "id": 1})
        iid = existing["id"] if existing else str(uuid.uuid4())
        html = _demo_email_html(name, salon, body.note, hq_email, plans=plans,
                                track_base=track_base, invite_id=iid)
        status = await _send_email([em], subject, html, attachments=attachments, reply_to=hq_email)
        results.append({"email": em, "sent": status.get("sent", False), "error": status.get("error")})
        if status.get("sent"):
            now_iso = datetime.now(timezone.utc).isoformat()
            await _raw_db.demo_invites.update_one(
                {"email": em},
                {"$set": {"id": iid, "name": name, "salon_name": salon, "first_sent_at": now_iso,
                          "reminder_sent_at": None, "responded": False, "track_base": track_base,
                          "opened_at": None, "demo_requested_at": None,
                          "seen_by_hq_open": True, "seen_by_hq_req": True}},
                upsert=True)

    sent_count = sum(1 for r in results if r["sent"])
    await _raw_db.demo_campaigns.insert_one({
        "id": str(uuid.uuid4()), "sent_by": user.get("email", ""),
        "subject": subject, "note": body.note,
        "recipient_count": len(results), "sent_count": sent_count,
        "results": results, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"sent": sent_count, "failed": len(results) - sent_count, "results": results}


@router.get("/super-admin/demo-campaign/history")
async def demo_campaign_history(user=Depends(require_super_admin)):
    items = await _raw_db.demo_campaigns.find({}, {"_id": 0, "results": 0}).sort("created_at", -1).to_list(20)
    return {"campaigns": items}


def _reminder_email_html(recipient_name: str, salon_name: str, hq_email: str,
                         track_base: str = "", invite_id: str = "") -> str:
    name = html_lib.escape(recipient_name or "").strip()
    salon = html_lib.escape(salon_name or "").strip()
    greeting = f"Dear {name}," if name else "Dear Salon Owner,"
    salon_ref = f" at {salon}" if salon else ""
    mailto = (f"mailto:{hq_email}?subject=Demo%20request%20—%20Miracurl%20Suite"
              f"&body=Hi%20Miracurl%20team%2C%0A%0AYes%2C%20I%27d%20like%20a%20demo."
              f"%0AMy%20preferred%20time%3A%20%0APhone%3A%20%0A%0AThank%20you!")
    cta_href = f"{track_base}/api/public/demo-track/{invite_id}/click" if (track_base and invite_id) else mailto
    pixel = (f'<img src="{track_base}/api/public/demo-track/{invite_id}/open.png" width="1" height="1" '
             f'style="display:block;width:1px;height:1px;border:0" alt="">') if (track_base and invite_id) else ""
    return f"""<!doctype html><html><body style="margin:0;padding:0;background:#f2f0eb">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0eb;padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,.08)">
  <tr><td style="background:#15151b;padding:28px 36px 24px">
    <div style="font-family:Georgia,serif;font-size:24px;letter-spacing:4px;color:#d4af37">MIRACURL</div>
    <div style="height:2px;width:56px;background:#d4af37;margin-top:12px"></div>
    <div style="font-family:Georgia,serif;color:#f4f1e8;font-size:19px;margin-top:14px;line-height:1.45">
      Just a gentle note — your demo seat is still open ✦</div>
  </td></tr>
  <tr><td style="padding:28px 36px 10px">
    <p style="font-size:15px;color:#33333b;line-height:1.7;margin:0 0 14px">{greeting}</p>
    <p style="font-size:14px;color:#55555f;line-height:1.75;margin:0 0 14px">
      A few days ago we sent you an invitation to see the <b>Miracurl Salon Suite</b> — and we completely
      understand how busy things get{salon_ref}. This is just one friendly nudge, and we promise it's the only one.</p>
    <p style="font-size:14px;color:#55555f;line-height:1.75;margin:0 0 14px">
      The demo is <b>20 minutes</b>, at any time you choose — bookings, billing, staff and a team of
      <b>12 specialist AI agents</b> (social posts, promo videos, WhatsApp, review replies and more)
      all in one calm dashboard. Salons like yours typically save <b>2 hours a day</b> after switching.</p>
    <p style="font-size:14px;color:#55555f;line-height:1.75;margin:0">
      If now isn't the right moment, no reply is needed at all — we'll leave you in peace.
      But if you're curious, we'd love to show you around.</p>
  </td></tr>
  <tr><td align="center" style="padding:24px 36px 10px">
    <a href="{cta_href}" style="display:inline-block;background:#d4af37;color:#15151b;font-size:15px;font-weight:bold;
       text-decoration:none;padding:14px 40px;border-radius:999px;letter-spacing:.4px">Yes, book my 20-minute demo ✦</a>
    <div style="font-size:12px;color:#8f8798;margin-top:12px">Or simply reply to this email with a day &amp; time that suits you.</div>
  </td></tr>
  <tr><td style="padding:18px 36px 28px">
    <p style="font-size:14px;color:#33333b;line-height:1.7;margin:0">Warm regards,<br>
      <b style="font-family:Georgia,serif">The Miracurl Team</b><br>
      <span style="font-size:12px;color:#8f8798">miracurl-suite.com · {html_lib.escape(hq_email)}</span></p>
  </td></tr>
  <tr><td style="background:#15151b;padding:14px 36px;text-align:center">
    <div style="color:#6d675c;font-size:11px">© Miracurl Suite — this is our one and only reminder. Ignore to opt out.</div>
  </td></tr>
</table>
</td></tr></table>{pixel}</body></html>"""


FOLLOWUP_AFTER_DAYS = 5


async def run_demo_followups() -> dict:
    """One gentle reminder per invitee, 5+ days after the invite, unless replied/converted."""
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=FOLLOWUP_AFTER_DAYS)).isoformat()
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    tenant_emails = set(await _raw_db.tenants.distinct("owner_email"))
    attachment = await asyncio.to_thread(suite_overview_attachment)
    sent = failed = skipped = 0
    async for inv in _raw_db.demo_invites.find(
            {"responded": False, "reminder_sent_at": None, "first_sent_at": {"$lte": cutoff}}, {"_id": 0}):
        if inv["email"] in tenant_emails:
            await _raw_db.demo_invites.update_one(
                {"id": inv["id"]}, {"$set": {"responded": True, "converted": True}})
            skipped += 1
            continue
        html = _reminder_email_html(inv.get("name", ""), inv.get("salon_name", ""), hq_email,
                                    track_base=inv.get("track_base") or os.environ.get("APP_PUBLIC_URL", "").rstrip("/"),
                                    invite_id=inv["id"])
        status = await _send_email([inv["email"]],
                                   "A gentle reminder — your Miracurl demo seat is still open ✦",
                                   html, attachments=[attachment], reply_to=hq_email)
        if status.get("sent"):
            sent += 1
            await _raw_db.demo_invites.update_one(
                {"id": inv["id"]}, {"$set": {"reminder_sent_at": datetime.now(timezone.utc).isoformat()}})
        else:
            failed += 1
    return {"sent": sent, "failed": failed, "converted_skipped": skipped}


_PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")


@router.get("/public/demo-track/{iid}/open.png")
async def demo_track_open(iid: str, request: Request):
    public_rate_limit(request, "demo-open", limit=60, window_sec=600)
    await _raw_db.demo_invites.update_one(
        {"id": iid, "opened_at": None},
        {"$set": {"opened_at": datetime.now(timezone.utc).isoformat(), "seen_by_hq_open": False}})
    return Response(content=_PIXEL_PNG, media_type="image/png",
                    headers={"Cache-Control": "no-store, no-cache, must-revalidate"})


@router.get("/public/demo-track/{iid}/click")
async def demo_track_click(iid: str, request: Request):
    public_rate_limit(request, "demo-click", limit=30, window_sec=600)
    now_iso = datetime.now(timezone.utc).isoformat()
    await _raw_db.demo_invites.update_one(
        {"id": iid, "opened_at": None}, {"$set": {"opened_at": now_iso, "seen_by_hq_open": False}})
    await _raw_db.demo_invites.update_one(
        {"id": iid, "demo_requested_at": None},
        {"$set": {"demo_requested_at": now_iso, "seen_by_hq_req": False}})
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    mailto = (f"mailto:{hq_email}?subject=Demo%20request%20—%20Miracurl%20Suite"
              f"&body=Hi%20Miracurl%20team%2C%0A%0AI%27d%20love%20a%20demo%20of%20the%20Miracurl%20Salon%20Suite."
              f"%0AMy%20preferred%20time%3A%20%0AMy%20salon%3A%20%0APhone%3A%20%0A%0AThank%20you!")
    return RedirectResponse(mailto, status_code=302)


@router.post("/super-admin/demo-campaign/mark-seen")
async def demo_campaign_mark_seen(user=Depends(require_super_admin)):
    await _raw_db.demo_invites.update_many(
        {"$or": [{"seen_by_hq_open": False}, {"seen_by_hq_req": False}]},
        {"$set": {"seen_by_hq_open": True, "seen_by_hq_req": True}})
    return {"ok": True}


@router.get("/super-admin/demo-campaign/invites")
async def demo_invites(user=Depends(require_super_admin)):
    tenant_emails = set(await _raw_db.tenants.distinct("owner_email"))
    items = await _raw_db.demo_invites.find({}, {"_id": 0}).sort("first_sent_at", -1).to_list(200)
    for i in items:
        if i["email"] in tenant_emails:
            i["status"] = "converted"
        elif i.get("responded"):
            i["status"] = "replied"
        elif i.get("demo_requested_at"):
            i["status"] = "demo_requested"
        elif i.get("reminder_sent_at"):
            i["status"] = "reminded"
        else:
            i["status"] = "awaiting"
        i["opened"] = bool(i.get("opened_at"))
    return {"invites": items, "followup_after_days": FOLLOWUP_AFTER_DAYS}


@router.post("/super-admin/demo-campaign/invites/{iid}/mark-replied")
async def demo_invite_mark_replied(iid: str, user=Depends(require_super_admin)):
    inv = await _raw_db.demo_invites.find_one({"id": iid}, {"_id": 0, "responded": 1})
    if not inv:
        raise HTTPException(404, "Invite not found")
    new_val = not inv.get("responded", False)
    await _raw_db.demo_invites.update_one({"id": iid}, {"$set": {"responded": new_val}})
    return {"responded": new_val}


@router.post("/super-admin/demo-campaign/followups/run")
async def demo_followups_run(user=Depends(require_super_admin)):
    return await run_demo_followups()
