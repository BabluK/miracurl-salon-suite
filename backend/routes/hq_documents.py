"""HQ Documents Center — policy/overview PDFs generated on demand, plus combined platform earnings."""
import asyncio
import base64
import calendar
import html as html_lib
import logging
import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta

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


_PDF_GOLD, _PDF_INK, _PDF_GREY = (0.72, 0.6, 0.25), (0.12, 0.12, 0.14), (0.4, 0.4, 0.45)


def _pdf_doc_header(c, doc: dict, W, H, mm):
    c.setFillColorRGB(*_PDF_INK)
    c.rect(0, H - 40 * mm, W, 40 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*_PDF_GOLD)
    c.setFont("Helvetica-Bold", 19)
    c.drawString(20 * mm, H - 20 * mm, doc["title"])
    c.setFillColorRGB(0.92, 0.92, 0.92)
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, H - 27 * mm, doc["subtitle"])
    c.setFont("Helvetica-Oblique", 8.5)
    c.drawString(20 * mm, H - 34 * mm,
                 f"Miracurl Suite · miracurl-suite.com · issued {datetime.now(timezone.utc).strftime('%d %b %Y')}")


def _pdf_doc_sections(c, doc: dict, W, H, mm):
    import textwrap
    y = H - 50 * mm
    for heading, points in doc["sections"]:
        if y < 45 * mm:
            c.showPage()
            y = H - 25 * mm
        c.setFillColorRGB(*_PDF_GOLD)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(20 * mm, y, heading.upper())
        c.setStrokeColorRGB(*_PDF_GOLD)
        c.setLineWidth(0.7)
        c.line(20 * mm, y - 2 * mm, W - 20 * mm, y - 2 * mm)
        y -= 9 * mm
        for pt in points:
            for j, line in enumerate(textwrap.wrap(pt, 92)):
                if y < 22 * mm:
                    c.showPage()
                    y = H - 25 * mm
                c.setFillColorRGB(*_PDF_INK)
                c.setFont("Helvetica", 10)
                prefix = "•  " if j == 0 else "    "
                c.drawString(22 * mm, y, prefix + line)
                y -= 5.4 * mm
            y -= 1.5 * mm
        y -= 4 * mm


def _doc_pdf(doc: dict) -> bytes:
    import io
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as rl_canvas

    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    _pdf_doc_header(c, doc, W, H, mm)
    _pdf_doc_sections(c, doc, W, H, mm)
    c.setFillColorRGB(*_PDF_GREY)
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


def _last_n_months(n: int) -> list:
    now = datetime.now(timezone.utc)
    months, y, m = [], now.year, now.month
    for _ in range(n):
        months.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    months.reverse()
    return months


async def _monthly_sums(coll, flt: dict, months: list) -> dict:
    """Sum `amount` per YYYY-MM (keyed on paid_at, falling back to created_at)."""
    sums = {mo: 0.0 for mo in months}
    async for rec in coll.find(flt, {"_id": 0, "amount": 1, "paid_at": 1, "created_at": 1}):
        mo = (rec.get("paid_at") or rec.get("created_at") or "")[:7]
        if mo in sums:
            sums[mo] += float(rec.get("amount") or 0)
    return sums


@router.get("/super-admin/earnings")
async def platform_earnings(user=Depends(require_super_admin)):
    """Combined platform income — subscriptions + placement fees, last 6 months."""
    months = _last_n_months(6)
    subs = await _monthly_sums(_raw_db.subscription_payments, {"status": {"$nin": ["created", "failed"]}}, months)
    fees = await _monthly_sums(_raw_db.placement_fees, {"status": "paid"}, months)
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


@router.get("/public/brochure.pdf")
async def public_brochure_pdf(request: Request):
    """Public Suite Overview brochure — linked from outreach emails instead of attaching PDFs."""
    from security import public_rate_limit
    public_rate_limit(request, "public-brochure", limit=30, window_sec=600)
    pdf = await asyncio.to_thread(_doc_pdf, DOCS["suite_overview"])
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": 'inline; filename="miracurl-suite-overview.pdf"'})


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
    try:
        from services.pdf import screens_tour_attachment
        tour = screens_tour_attachment()
        if tour:
            items.append(tour)
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


def _demo_note_block(note: str) -> str:
    if not note.strip():
        return ""
    return f"""
        <tr><td style="padding:0 36px 22px">
          <div style="background:#fdf8ec;border:1px solid #ecdcae;border-radius:12px;padding:16px 20px;font-size:14px;color:#5d5340;line-height:1.6">
            {html_lib.escape(note.strip())}
          </div>
        </td></tr>"""


def _demo_module(icon, title, desc):
    return f"""
        <td width="50%" valign="top" style="padding:10px 12px">
          <div style="font-size:22px;line-height:1">{icon}</div>
          <div style="font-family:Georgia,serif;font-size:15px;color:#1d1d24;margin-top:6px;font-weight:bold">{title}</div>
          <div style="font-size:12.5px;color:#6c6c78;line-height:1.55;margin-top:4px">{desc}</div>
        </td>"""


_DEMO_AGENTS = [
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


def _demo_agents_block() -> str:
    agent_rows = ""
    for i in range(0, len(_DEMO_AGENTS), 2):
        cells = ""
        for icon, title, desc in _DEMO_AGENTS[i:i + 2]:
            cells += f"""
            <td width="50%" valign="top" style="padding:7px 12px">
              <div style="font-size:13px;color:#f4f1e8"><span style="font-size:15px">{icon}</span>
                <b style="font-family:Georgia,serif;letter-spacing:.3px">&nbsp;{title}</b></div>
              <div style="font-size:11.5px;color:#a49d8e;line-height:1.5;margin-top:2px;padding-left:24px">{desc}</div>
            </td>"""
        agent_rows += f"<tr>{cells}</tr>"
    return f"""
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


def _demo_pricing_row(p: dict) -> str:
    months = max(1, round((p.get("duration_days") or 30) / 30))
    per_mo = (p.get("price") or 0) / months
    return f"""
        <tr>
          <td style="padding:10px 16px;border-top:1px solid #eee9dc;font-size:13.5px;color:#33333b"><b>{html_lib.escape(str(p.get('label', '')))}</b>
            <div style="font-size:11px;color:#9a948a">{months} month{'s' if months > 1 else ''} · up to {p.get('branches', 1)} branch{'es' if (p.get('branches') or 1) > 1 else ''}</div></td>
          <td align="right" style="padding:10px 16px;border-top:1px solid #eee9dc;font-size:15px;color:#1d1d24"><b>₹{round(p.get('price') or 0):,}</b>
            <div style="font-size:11px;color:#9a948a">≈ ₹{round(per_mo):,}/month</div></td>
        </tr>"""


_INTL_TLDS = {"uk", "ae", "us", "ca", "au", "nz", "sg", "ie", "de", "fr", "eu", "qa",
              "sa", "om", "bh", "kw", "hk", "my", "za", "ch", "nl", "it", "es"}


def _is_intl_email(email: str) -> bool:
    tld = (email or "").rsplit(".", 1)[-1].lower().strip()
    return tld in _INTL_TLDS


_INTL_TIER_FEATURES = {
    "starter": "Booking, CRM, POS, WhatsApp reminders",
    "professional": "+ Inventory, Payroll, Analytics, Multi-staff",
    "premium": "+ Mira AI, AI Marketing, Review Automation",
}


def _usd_tier_row(tier: str, key: str, usd: dict) -> str:
    mo = (usd.get(f"{key}_monthly") or {}).get("price")
    if not mo:
        return ""
    half = (usd.get(f"{key}_half") or {}).get("price")
    yr = (usd.get(f"{key}_annual") or {}).get("price")
    tier_key = "premium" if "Premium" in tier else tier.lower()
    return f"""
        <tr>
          <td style="padding:10px 16px;border-top:1px solid #eee9dc;font-size:13.5px;color:#33333b"><b>{tier}</b>
            <div style="font-size:11px;color:#9a948a">{_INTL_TIER_FEATURES.get(tier_key, '')}</div></td>
          <td align="right" style="padding:10px 16px;border-top:1px solid #eee9dc;font-size:15px;color:#1d1d24"><b>${round(mo):,}/mo</b>
            <div style="font-size:11px;color:#9a948a">6&nbsp;months ${round(half or mo * 6):,} · 1&nbsp;year ${round(yr or mo * 12):,}</div></td>
        </tr>"""


def _usd_pricing_rows(plans: list) -> str:
    usd = {p["key"]: p for p in plans if p.get("currency") == "USD"}
    rows = "".join(_usd_tier_row(tier, key, usd)
                   for tier, key in (("Starter", "intl_starter"), ("Professional", "intl_pro"), ("Premium AI", "intl_premium")))
    ent = (usd.get("intl_enterprise_monthly") or {}).get("price") or 499
    rows += f"""
        <tr>
          <td style="padding:10px 16px;border-top:1px solid #eee9dc;font-size:13.5px;color:#33333b"><b>Enterprise</b>
            <div style="font-size:11px;color:#9a948a">Multi-branch chains · custom contracts</div></td>
          <td align="right" style="padding:10px 16px;border-top:1px solid #eee9dc;font-size:15px;color:#1d1d24"><b>from ${round(ent):,}/mo</b></td>
        </tr>"""
    return rows


def _demo_pricing_block(plans: list | None, currency: str = "INR", vertical: str = "salon") -> str:
    plans = [p for p in (plans or []) if (p.get("vertical") or "salon") == vertical]
    if not plans:
        return ""
    if currency == "USD":
        rows = _usd_pricing_rows(plans)
        tail = "All features included. Prices in USD for international salons — billed via secure payment link."
    else:
        show = [p for p in plans if (p.get("branches") or 1) == 1 and p.get("currency", "INR") == "INR"] or plans[:2]
        rows = "".join(_demo_pricing_row(p) for p in show)
        tail = ("All features included in every plan — POS, bookings, CRM and the full 12-agent AI team. "
                "Multi-branch plans also available — ask us in the demo.")
    return f"""
  <tr><td style="padding:14px 36px 4px">
    <div style="font-size:11px;letter-spacing:2px;color:#9a8f6d;font-weight:bold">SIMPLE, HONEST PRICING</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;background:#fdfcf8;border:1px solid #eee9dc;border-radius:12px;overflow:hidden">
      <tr><td colspan="2" style="padding:12px 16px;font-size:12.5px;color:#55555f;line-height:1.6">
        Start with a <b>7-day free trial</b> — no card, no commitment. Then choose the plan that fits:</td></tr>
      {rows}
      <tr><td colspan="2" style="padding:10px 16px;border-top:1px solid #eee9dc;font-size:11px;color:#9a948a">{tail}</td></tr>
    </table>
  </td></tr>"""


def _demo_modules_block() -> str:
    m = _demo_module
    return f"""
  <tr><td style="padding:8px 24px 4px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>{m("📅", "Appointments &amp; 24/7 Online Booking", "Your own public booking page with Mira, the AI receptionist — customers book even while you sleep.")}
          {m("🧾", "Smart POS &amp; GST Billing", "Fast counter billing, e-receipts by email &amp; SMS, coupons, memberships and loyalty points.")}</tr>
      <tr>{m("✨", "Mira AI Marketing Studio", "Daily social posts, promo videos, flash offers and win-back campaigns — created for you, automatically.")}
          {m("👥", "Verified Staff &amp; Hiring", "Aadhaar-verified staff registry, QR ID cards and a curated hiring marketplace when you need talent.")}</tr>
      <tr>{m("📊", "Reports &amp; Weekly Digests", "Revenue analytics, staff leaderboards and business summaries delivered to your inbox.")}
          {m("🔐", "Secure &amp; Multi-branch", "Bank-grade security, per-salon data isolation, and every branch under one account.")}</tr>
    </table>
  </td></tr>"""


def _demo_footer_blocks(hq_email: str) -> str:
    return f"""
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
  </td></tr>"""


def _demo_email_links(hq_email: str, tracking: tuple) -> tuple:
    """(cta_href, signup_href, open-pixel) for a demo invite email."""
    track_base, invite_id = tracking
    mailto = (f"mailto:{hq_email}?subject=Demo%20request%20—%20Miracurl%20Suite"
              f"&body=Hi%20Miracurl%20team%2C%0A%0AI%27d%20love%20a%20demo%20of%20the%20Miracurl%20Salon%20Suite."
              f"%0AMy%20preferred%20time%3A%20%0AMy%20salon%3A%20%0APhone%3A%20%0A%0AThank%20you!")
    cta_href = f"{track_base}/api/public/demo-track/{invite_id}/click" if (track_base and invite_id) else mailto
    pixel = (f'<img src="{track_base}/api/public/demo-track/{invite_id}/open.png" width="1" height="1" '
             f'style="display:block;width:1px;height:1px;border:0" alt="">') if (track_base and invite_id) else ""
    return cta_href, "https://miracurl-suite.com/signup-salon", pixel


def _demo_email_html(recipient_name: str, salon_name: str, note: str, hq_email: str, *,
                     plans: list | None = None, tracking: tuple[str, str] = ("", ""),
                     currency: str = "INR", vertical: str = "salon") -> str:
    resto = vertical == "restaurant"
    name = html_lib.escape(recipient_name or "").strip()
    salon = html_lib.escape(salon_name or "").strip()
    greeting = f"Dear {name}," if name else ("Dear Restaurant Owner," if resto else "Dear Salon Owner,")
    salon_line = f" at <b>{salon}</b>" if salon else ""
    cta_href, signup_href, pixel = _demo_email_links(hq_email, tracking)
    if resto:
        signup_href = signup_href.replace("signup-salon", "signup-restaurant")
    sub_brand = "THE ALL-IN-ONE RESTAURANT SUITE" if resto else "THE ALL-IN-ONE SALON SUITE"
    hero = ('Your restaurant&rsquo;s <span style="color:#d4af37">FREE first month</span><br>of Miracurl Suite.'
            if resto else 'Your salon&rsquo;s <span style="color:#d4af37">7-day free trial</span><br>of Miracurl Suite.')
    intro = ("We'd love for you to experience the <b>Miracurl Restaurant Suite</b> — QR table ordering straight "
             "to the kitchen, live kitchen tickets, one-tap table-wise billing, reservations and Mira, your AI "
             "teammate that paints dish photos and runs your marketing."
             if resto else
             "We'd love for you to experience the <b>Miracurl Salon Suite</b> — the all-in-one platform trusted by "
             "growing salons to manage bookings, billing, staff and marketing from a single elegant dashboard.")
    trial_line = ("<b>Start your FREE first month today</b> — set up your restaurant yourself in under 5 minutes, "
                  "no credit card needed, and take table orders tonight."
                  if resto else
                  "<b>Start your own 7-day free trial today</b> — set up your salon yourself in under 5 minutes, "
                  "no credit card needed, and explore everything at your own pace.")
    cta_label = "Start my FREE first month ✦" if resto else "Start my 7-day free trial ✦"

    return f"""<!doctype html><html><body style="margin:0;padding:0;background:#f2f0eb">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0eb;padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,.08)">
  <tr><td style="background:#15151b;padding:34px 36px 30px">
    <div style="font-family:Georgia,serif;font-size:26px;letter-spacing:4px;color:#d4af37">MIRACURL</div>
    <div style="color:#b9b2a3;font-size:12px;letter-spacing:2.5px;margin-top:5px">{sub_brand}</div>
    <div style="height:2px;width:64px;background:#d4af37;margin-top:16px"></div>
    <div style="font-family:Georgia,serif;color:#f4f1e8;font-size:21px;margin-top:18px;line-height:1.4">
      {hero}</div>
  </td></tr>
  <tr><td style="padding:30px 36px 8px">
    <p style="font-size:15px;color:#33333b;line-height:1.7;margin:0 0 14px">{greeting}</p>
    <p style="font-size:14px;color:#55555f;line-height:1.75;margin:0 0 14px">
      We hope this message finds you and your team{salon_line} doing wonderfully.
      {intro}</p>
    <p style="font-size:14px;color:#55555f;line-height:1.75;margin:0">
      {trial_line}</p>
  </td></tr>
  {_demo_note_block(note)}
  {"" if resto else _demo_modules_block()}
  {"" if resto else _demo_agents_block()}
  {_demo_pricing_block(plans, currency, vertical)}
  <tr><td align="center" style="padding:26px 36px 8px">
    <a href="{signup_href}" style="display:inline-block;background:#d4af37;color:#15151b;font-size:15px;font-weight:bold;
       text-decoration:none;padding:15px 42px;border-radius:999px;letter-spacing:.4px">{cta_label}</a>
    <div style="margin-top:16px">
      <a href="{cta_href}" style="display:inline-block;border:1.5px solid #d4af37;color:#8a6d1a;font-size:13px;font-weight:bold;
         text-decoration:none;padding:11px 30px;border-radius:999px;letter-spacing:.3px">Prefer a guided tour? Request a demo →</a>
    </div>
    <div style="font-size:12px;color:#8f8798;margin-top:12px">Or simply reply to this email with a day &amp; time that suits you — we'll fit around your schedule.</div>
  </td></tr>
  {_demo_footer_blocks(hq_email)}
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
    currency: str = Field(default="auto")  # auto | INR | USD
    vertical: str = Field(default="salon", pattern="^(salon|restaurant)$")


@router.get("/super-admin/demo-campaign/recipients")
async def demo_campaign_recipients(user=Depends(require_super_admin)):
    """Prospect pool only — existing tenants (already partners) are excluded."""
    tenant_emails = set(await _raw_db.tenants.distinct("owner_email"))
    leads = await _raw_db.tenant_inquiries.find(
        {"email": {"$exists": True, "$ne": ""}},
        {"_id": 0, "name": 1, "email": 1, "salon_name": 1, "status": 1}).sort("created_at", -1).to_list(500)
    return {
        "leads": [{"name": ld.get("name", ""), "email": ld["email"],
                   "salon_name": ld.get("salon_name", ""), "status": ld.get("status", "")}
                  for ld in leads if ld["email"].lower() not in tenant_emails],
    }


def _dedupe_recipients(recipients: list) -> list:
    seen, targets = set(), []
    for r in recipients:
        em = r.email.strip().lower()
        if not _EMAIL_RE.match(em):
            raise HTTPException(400, f"Invalid email address: {r.email}")
        if em not in seen:
            seen.add(em)
            targets.append((em, r.name.strip(), r.salon_name.strip()))
    return targets


@dataclass
class _DemoSendCtx:
    body: object
    hq_email: str
    subject: str
    attachments: list
    plans: dict
    track_base: str


async def _send_demo_invite(em: str, name: str, salon: str, ctx: _DemoSendCtx) -> dict:
    existing = await _raw_db.demo_invites.find_one({"email": em}, {"_id": 0, "id": 1})
    iid = existing["id"] if existing else str(uuid.uuid4())
    mode = getattr(ctx.body, "currency", "auto") or "auto"
    currency = mode if mode in ("INR", "USD") else ("USD" if _is_intl_email(em) else "INR")
    html = _demo_email_html(name, salon, ctx.body.note, ctx.hq_email, plans=ctx.plans,
                            tracking=(ctx.track_base, iid), currency=currency,
                            vertical=getattr(ctx.body, "vertical", "salon"))
    status = await _send_email([em], ctx.subject, html, attachments=ctx.attachments, reply_to=ctx.hq_email)
    if status.get("sent"):
        now_iso = datetime.now(timezone.utc).isoformat()
        await _raw_db.demo_invites.update_one(
            {"email": em},
            {"$set": {"id": iid, "name": name, "salon_name": salon, "first_sent_at": now_iso,
                      "vertical": getattr(ctx.body, "vertical", "salon"),
                      "reminder_sent_at": None, "responded": False, "track_base": ctx.track_base,
                      "opened_at": None, "demo_requested_at": None,
                      "seen_by_hq_open": True, "seen_by_hq_req": True}},
            upsert=True)
    return {"email": em, "sent": status.get("sent", False), "error": status.get("error")}


@router.post("/super-admin/demo-campaign/send")
async def demo_campaign_send(body: DemoCampaignIn, request: Request, user=Depends(require_super_admin)):
    targets = _dedupe_recipients(body.recipients)
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    resto = body.vertical == "restaurant"
    subject = body.subject.strip() or (
        "Your Restaurant's FREE First Month of Miracurl Suite 🍽️" if resto
        else "Your Salon's 7-Day Free Trial of Miracurl Suite ✦")
    if resto:
        from services.brochure import build_brochure_pdf
        import base64 as _b64
        pdf = await asyncio.to_thread(build_brochure_pdf, "restaurant")
        attachments = [{"filename": "miracurl-restaurant-suite.pdf", "content": _b64.b64encode(pdf).decode()}]
    else:
        attachments = await asyncio.to_thread(_all_doc_attachments)
    tenant_emails = set(await _raw_db.tenants.distinct("owner_email"))
    plans = await _live_plans()
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    track_base = f"https://{host}" if host else os.environ.get("APP_PUBLIC_URL", "").rstrip("/")
    ctx = _DemoSendCtx(body=body, hq_email=hq_email, subject=subject,
                       attachments=attachments, plans=plans, track_base=track_base)

    results = []
    for em, name, salon in targets:
        if em in tenant_emails:
            results.append({"email": em, "sent": False, "error": "Already a Miracurl partner — skipped"})
            continue
        results.append(await _send_demo_invite(em, name, salon, ctx))

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


async def _send_slot_picker_email(inv: dict, base: str) -> dict:
    link = f"{base}/demo-slot/{inv['id']}"
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    name = html_lib.escape(inv.get("name") or "there")
    salon = html_lib.escape(inv.get("salon_name") or "your salon")
    html = f"""
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fffdf8;border:1px solid #eee9dc;border-radius:14px;padding:34px">
      <div style="font-size:11px;letter-spacing:3px;color:#9a8f6d;font-weight:bold">MIRACURL SUITE ✦ DEMO</div>
      <h2 style="color:#1d1d24;margin:14px 0 8px">Pick a time that suits you, {name} ✦</h2>
      <p style="font-size:14px;color:#3a3a40;line-height:1.8">We'd love to show you how Miracurl runs bookings, billing and AI marketing for {salon} — a quick 20-minute walkthrough, no commitment.</p>
      <p style="text-align:center;margin:26px 0">
        <a href="{link}" style="display:inline-block;background:#c9a35c;color:#191921;font-size:14px;font-weight:bold;text-decoration:none;padding:14px 38px;border-radius:999px">Choose my demo time ✦</a>
      </p>
      <p style="font-size:12px;color:#9a948a">Times are shown in your local timezone on the booking page. Prefer email? Just reply with a day &amp; time — {hq_email}</p>
      <img src="{base}/api/public/demo-track/{inv['id']}/open.png" width="1" height="1" style="display:block" alt="" />
    </div>"""
    status = await _send_email([inv["email"]], f"Pick your Miracurl demo time, {inv.get('name') or 'friend'} ✦",
                               html, reply_to=hq_email)
    if status.get("sent"):
        await _raw_db.demo_invites.update_one(
            {"id": inv["id"]}, {"$set": {"slot_picker_sent_at": datetime.now(timezone.utc).isoformat()}})
    return {"sent": status.get("sent", False), "error": status.get("error"), "link": link}


@router.post("/super-admin/demo-campaign/{iid}/send-slot-picker")
async def send_slot_picker(iid: str, request: Request, user=Depends(require_super_admin)):
    """Short 'pick your demo time' email with the personalized slot-picker link."""
    inv = await _raw_db.demo_invites.find_one({"id": iid}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invite not found")
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    base = inv.get("track_base") or (f"https://{host}" if host else os.environ.get("APP_PUBLIC_URL", "").rstrip("/"))
    return await _send_slot_picker_email(inv, base)


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
    # NOTE: link fetches are often email security scanners, not humans —
    # "demo requested" is only set when the slot form is actually submitted.
    await _raw_db.demo_invites.update_one(
        {"id": iid, "clicked_at": None}, {"$set": {"clicked_at": now_iso}})
    inv = await _raw_db.demo_invites.find_one({"id": iid}, {"_id": 0, "track_base": 1})
    base = (inv or {}).get("track_base") or os.environ.get("APP_PUBLIC_URL", "").rstrip("/")
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    if not base and host:
        base = f"https://{host}"
    return RedirectResponse(f"{base}/demo-slot/{iid}", status_code=302)


@router.post("/super-admin/demo-campaign/mark-seen")
async def demo_campaign_mark_seen(user=Depends(require_super_admin)):
    await _raw_db.demo_invites.update_many(
        {"$or": [{"seen_by_hq_open": False}, {"seen_by_hq_req": False}]},
        {"$set": {"seen_by_hq_open": True, "seen_by_hq_req": True}})
    return {"ok": True}


@router.get("/super-admin/demo-calendar")
async def demo_calendar(user=Depends(require_super_admin)):
    """All booked demo slots — upcoming first, plus the last 30 days of past demos."""
    from datetime import timedelta
    now_ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    cutoff_past = (now_ist.date() - timedelta(days=30)).isoformat()
    upcoming, past = [], []
    async for inv in _raw_db.demo_invites.find({"preferred_slot": {"$ne": None}}, {"_id": 0}):
        slot = inv.get("preferred_slot") or {}
        if not slot.get("date"):
            continue
        item = {"id": inv["id"], "name": inv.get("name", ""), "salon_name": inv.get("salon_name", ""),
                "city": inv.get("city", ""), "email": inv.get("email", ""),
                "phone": slot.get("phone") or inv.get("phone", ""),
                "date": slot["date"], "time": slot.get("time", ""),
                "source": inv.get("source", "invite"), "booked_at": slot.get("booked_at", ""),
                "gcal": _gcal_link(slot["date"], slot.get("time") or "11:00"),
                "done": bool(inv.get("demo_done"))}
        slot_dt = f"{slot['date']}T{slot.get('time') or '00:00'}"
        if slot_dt >= now_ist.strftime("%Y-%m-%dT%H:%M"):
            upcoming.append(item)
        elif slot["date"] >= cutoff_past:
            past.append(item)
    upcoming.sort(key=lambda i: (i["date"], i["time"]))
    past.sort(key=lambda i: (i["date"], i["time"]), reverse=True)
    today = now_ist.date().isoformat()
    return {"upcoming": upcoming, "past": past, "today": today,
            "today_count": sum(1 for i in upcoming if i["date"] == today)}


@router.post("/super-admin/demo-calendar/{iid}/done")
async def demo_mark_done(iid: str, user=Depends(require_super_admin)):
    res = await _raw_db.demo_invites.update_one({"id": iid}, {"$set": {"demo_done": True}})
    if not res.matched_count:
        raise HTTPException(404, "Demo not found")
    return {"ok": True}


def _invite_status(i: dict, tenant_emails: set) -> str:
    if i["email"] in tenant_emails:
        return "converted"
    # Genuine demo request = they actually submitted the slot form
    # (bare link clicks are often email security scanners).
    if i.get("preferred_slot") or i.get("demo_requested_at"):
        return "demo_requested"
    if i.get("responded"):
        return "replied"
    if i.get("reminder_sent_at"):
        return "reminded"
    return "awaiting"


async def _signup_map() -> dict:
    """owner_email(lower) → tenant signup details, for trial-tracking on invites."""
    out = {}
    async for t in _raw_db.tenants.find(
            {"owner_email": {"$exists": True, "$ne": ""}},
            {"_id": 0, "owner_email": 1, "name": 1, "slug": 1, "status": 1, "plan": 1,
             "created_at": 1, "trial_end_date": 1}):
        out[str(t["owner_email"]).lower()] = t
    return out


@router.get("/super-admin/demo-campaign/invites")
async def demo_invites(user=Depends(require_super_admin)):
    from datetime import timedelta
    signups = await _signup_map()
    tenant_emails = set(signups.keys())
    items = await _raw_db.demo_invites.find({}, {"_id": 0}).sort("first_sent_at", -1).to_list(200)
    stale_cutoff = (datetime.now(timezone.utc) - timedelta(days=FOLLOWUP_AFTER_DAYS)).isoformat()
    for i in items:
        i["status"] = _invite_status(i, tenant_emails)
        su = signups.get(i["email"])
        if su:
            i["signup"] = {"salon": su.get("name"), "slug": su.get("slug"), "tenant_status": su.get("status"),
                           "plan": su.get("plan"), "signed_up_at": su.get("created_at"),
                           "trial_end_date": su.get("trial_end_date")}
            if su.get("status") == "trial":
                i["status"] = "trial_started"
        i["opened"] = bool(i.get("opened_at"))
        i["clicked"] = bool(i.get("clicked_at"))
        stale = (i.get("first_sent_at") or "") <= stale_cutoff
        i["resend_suggested"] = (i["status"] in ("awaiting", "reminded") and not i["opened"] and stale)
        i["stale_no_reply"] = (i["status"] in ("awaiting", "reminded") and i["opened"] and stale)
    return {"invites": items, "followup_after_days": FOLLOWUP_AFTER_DAYS}


@router.delete("/super-admin/demo-campaign/invites/{iid}")
async def demo_invite_delete(iid: str, user=Depends(require_super_admin)):
    res = await _raw_db.demo_invites.delete_one({"id": iid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Invite not found")
    return {"ok": True}


@router.post("/super-admin/demo-campaign/invites/{iid}/resend")
async def demo_invite_resend(iid: str, request: Request, user=Depends(require_super_admin)):
    inv = await _raw_db.demo_invites.find_one({"id": iid}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invite not found")
    if inv["email"] in set(await _raw_db.tenants.distinct("owner_email")):
        raise HTTPException(400, "Already a Miracurl partner")
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    plans = await _live_plans()
    inv_vert = inv.get("vertical") or "salon"
    if inv_vert == "restaurant":
        from services.brochure import build_brochure_pdf
        import base64 as _b64
        pdf = await asyncio.to_thread(build_brochure_pdf, "restaurant")
        attachments = [{"filename": "miracurl-restaurant-suite.pdf", "content": _b64.b64encode(pdf).decode()}]
    else:
        attachments = await asyncio.to_thread(_all_doc_attachments)
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    track_base = f"https://{host}" if host else (inv.get("track_base") or "")
    html = _demo_email_html(inv.get("name", ""), inv.get("salon_name", ""), "", hq_email,
                            plans=plans, tracking=(track_base, iid),
                            currency="USD" if _is_intl_email(inv["email"]) else "INR",
                            vertical=inv_vert)
    status = await _send_email([inv["email"]],
                               ("Your Restaurant's FREE First Month of Miracurl Suite 🍽️"
                                if inv_vert == "restaurant"
                                else "Your Salon's 7-Day Free Trial of Miracurl Suite ✦"),
                               html, attachments=attachments, reply_to=hq_email)
    if not status.get("sent"):
        raise HTTPException(500, status.get("error") or "Send failed")
    now_iso = datetime.now(timezone.utc).isoformat()
    await _raw_db.demo_invites.update_one(
        {"id": iid},
        {"$set": {"first_sent_at": now_iso, "reminder_sent_at": None, "responded": False,
                  "opened_at": None, "demo_requested_at": None, "track_base": track_base,
                  "seen_by_hq_open": True, "seen_by_hq_req": True,
                  "resent_at": now_iso, "resend_count": (inv.get("resend_count") or 0) + 1}})
    return {"ok": True}


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


# ── Demo slot scheduling ─────────────────────────────────────────────────────

DEMO_SLOT_TIMES = ["11:00", "12:00", "13:00", "15:00", "16:00", "17:00", "18:00", "19:00"]


def _slot_utc(date_str: str, time_str: str):
    from datetime import timedelta
    ist_start = datetime.fromisoformat(f"{date_str}T{time_str}:00")
    return ist_start - timedelta(hours=5, minutes=30)


def _gcal_link(date_str: str, time_str: str) -> str:
    from datetime import timedelta
    from urllib.parse import urlencode
    start = _slot_utc(date_str, time_str)
    end = start + timedelta(minutes=30)
    fmt = "%Y%m%dT%H%M%SZ"
    return "https://calendar.google.com/calendar/render?" + urlencode({
        "action": "TEMPLATE",
        "text": "Miracurl Suite — Live Demo (20 min)",
        "dates": f"{start.strftime(fmt)}/{end.strftime(fmt)}",
        "details": "Your personalised walkthrough of the Miracurl Salon Suite — bookings, POS, staff and the 12-agent AI team. The Miracurl team will call/connect at this time.",
        "location": "Online / phone call",
    })


def _slot_ics(date_str: str, time_str: str, attendee_email: str) -> str:
    from datetime import timedelta
    start = _slot_utc(date_str, time_str)
    end = start + timedelta(minutes=30)
    fmt = "%Y%m%dT%H%M%SZ"
    hq = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    return ("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Miracurl Suite//Demo//EN\r\nMETHOD:REQUEST\r\n"
            "BEGIN:VEVENT\r\n"
            f"UID:{uuid.uuid4()}@miracurl-suite.com\r\n"
            f"DTSTAMP:{datetime.now(timezone.utc).strftime(fmt)}\r\n"
            f"DTSTART:{start.strftime(fmt)}\r\nDTEND:{end.strftime(fmt)}\r\n"
            "SUMMARY:Miracurl Suite — Live Demo (20 min)\r\n"
            "DESCRIPTION:Your personalised walkthrough of the Miracurl Salon Suite.\r\n"
            f"ORGANIZER;CN=Miracurl Team:mailto:{hq}\r\n"
            f"ATTENDEE;CN=Prospect;RSVP=TRUE:mailto:{attendee_email}\r\n"
            "STATUS:CONFIRMED\r\nBEGIN:VALARM\r\nTRIGGER:-PT30M\r\nACTION:DISPLAY\r\n"
            "DESCRIPTION:Miracurl demo in 30 minutes\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n")


def _slot_confirm_email_html(name: str, date_str: str, time_str: str, gcal: str, hq_email: str) -> str:
    nm = html_lib.escape(name or "").strip()
    greeting = f"Dear {nm}," if nm else "Dear Salon Owner,"
    pretty = datetime.fromisoformat(date_str).strftime("%A, %d %B %Y")
    return f"""<!doctype html><html><body style="margin:0;padding:0;background:#f2f0eb">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0eb;padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,.08)">
  <tr><td style="background:#15151b;padding:30px 36px 26px">
    <div style="font-family:Georgia,serif;font-size:24px;letter-spacing:4px;color:#d4af37">MIRACURL</div>
    <div style="height:2px;width:56px;background:#d4af37;margin-top:12px"></div>
    <div style="font-family:Georgia,serif;color:#f4f1e8;font-size:20px;margin-top:14px;line-height:1.45">
      Your demo is booked — we can't wait to meet you ✦</div>
  </td></tr>
  <tr><td style="padding:28px 36px 8px">
    <p style="font-size:15px;color:#33333b;line-height:1.7;margin:0 0 14px">{greeting}</p>
    <p style="font-size:14px;color:#55555f;line-height:1.75;margin:0">
      Thank you for choosing a time — it's in our diary. Here are your demo details:</p>
  </td></tr>
  <tr><td style="padding:14px 36px 6px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8ec;border:1px solid #ecdcae;border-radius:14px">
      <tr><td style="padding:20px 24px">
        <div style="font-size:11px;letter-spacing:2px;color:#9a8f6d;font-weight:bold">YOUR DEMO SLOT</div>
        <div style="font-family:Georgia,serif;font-size:22px;color:#1d1d24;margin-top:8px">{pretty}</div>
        <div style="font-size:16px;color:#55555f;margin-top:4px"><b>{time_str} IST</b> · 20 minutes · online / phone</div>
      </td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding:22px 36px 6px">
    <a href="{gcal}" style="display:inline-block;background:#d4af37;color:#15151b;font-size:15px;font-weight:bold;
       text-decoration:none;padding:14px 38px;border-radius:999px;letter-spacing:.4px">📅 Add to Google Calendar</a>
    <div style="font-size:12px;color:#8f8798;margin-top:10px">A calendar invite (.ics) is also attached — open it to add the demo to any calendar app.</div>
  </td></tr>
  <tr><td style="padding:18px 36px 28px">
    <p style="font-size:13.5px;color:#55555f;line-height:1.7;margin:0 0 12px">
      Our team will reach out at your chosen time. Need to change the slot? Simply reply to this email — no trouble at all.</p>
    <p style="font-size:14px;color:#33333b;line-height:1.7;margin:0">Warm regards,<br>
      <b style="font-family:Georgia,serif">The Miracurl Team</b><br>
      <span style="font-size:12px;color:#8f8798">miracurl-suite.com · {html_lib.escape(hq_email)}</span></p>
  </td></tr>
  <tr><td style="background:#15151b;padding:14px 36px;text-align:center">
    <div style="color:#6d675c;font-size:11px">© Miracurl Suite — see you at the demo ✦</div>
  </td></tr>
</table>
</td></tr></table></body></html>"""


class DemoSlotIn(BaseModel):
    date: str = Field(..., max_length=10)
    time: str = Field(..., max_length=5)
    phone: str = Field(default="", max_length=20)
    tz: str = Field(default="", max_length=50)


def _slot_local_label(date_str: str, time_str: str, tz_name: str) -> str:
    """The IST slot expressed in the guest's own timezone, e.g. '9:30 AM EDT'."""
    try:
        from zoneinfo import ZoneInfo
        ist = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M").replace(tzinfo=ZoneInfo("Asia/Kolkata"))
        loc = ist.astimezone(ZoneInfo(tz_name))
        day = " (+1 day)" if loc.date() > ist.date() else (" (-1 day)" if loc.date() < ist.date() else "")
        return loc.strftime("%I:%M %p %Z").lstrip("0") + day
    except Exception:
        return ""


@router.get("/public/demo-slot/{iid}")
async def demo_slot_info(iid: str, request: Request):
    public_rate_limit(request, "demo-slot-info", limit=30, window_sec=600)
    inv = await _raw_db.demo_invites.find_one(
        {"id": iid}, {"_id": 0, "name": 1, "salon_name": 1, "preferred_slot": 1})
    if not inv:
        raise HTTPException(404, "Invite not found")
    from datetime import timedelta
    today = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date()
    days = [(today + timedelta(days=d)).isoformat() for d in range(1, 8)]
    return {"name": inv.get("name", ""), "salon_name": inv.get("salon_name", ""),
            "scheduled": inv.get("preferred_slot"), "dates": days, "times": DEMO_SLOT_TIMES}


def _validate_slot(date_s: str, time_s: str):
    from datetime import timedelta
    try:
        d = datetime.fromisoformat(date_s).date()
    except ValueError:
        raise HTTPException(400, "Invalid date")
    today = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date()
    if not (today <= d <= today + timedelta(days=30)):
        raise HTTPException(400, "Pick a date within the next 30 days")
    if time_s not in DEMO_SLOT_TIMES:
        raise HTTPException(400, "Invalid time slot")


async def _send_slot_confirmations(email: str, name: str, salon_name: str,
                                   date_s: str, time_s: str, phone: str, city: str = "") -> str:
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    gcal = _gcal_link(date_s, time_s)
    ics = _slot_ics(date_s, time_s, email)
    ics_att = [{"filename": "miracurl-demo.ics", "content": base64.b64encode(ics.encode()).decode()}]
    await _send_email([email],
                      f"Your Miracurl demo is booked — {date_s} at {time_s} IST ✦",
                      _slot_confirm_email_html(name, date_s, time_s, gcal, hq_email),
                      attachments=ics_att, reply_to=hq_email)
    pretty = datetime.fromisoformat(date_s).strftime("%a, %d %b %Y")
    await _send_email([hq_email],
                      f"🔥 Demo booked: {name or email} — {pretty} {time_s} IST",
                      f"""<div style="font-family:Arial,sans-serif;font-size:14px;color:#33333b;line-height:1.7">
<p><b>{html_lib.escape(name or '')}</b> ({html_lib.escape(email)}) just booked a demo slot.</p>
<p>📅 <b>{pretty} at {time_s} IST</b> · 20 min<br>
📞 Phone: {html_lib.escape(phone.strip() or '—')}<br>
🏠 Salon: {html_lib.escape(salon_name or '—')}{f" · {html_lib.escape(city)}" if city else ""}</p>
<p><a href="{gcal}">Add to your Google Calendar</a> — the prospect received a confirmation with the same invite.</p></div>""",
                      attachments=ics_att)
    return gcal


@router.post("/public/demo-slot/{iid}")
async def demo_slot_book(iid: str, body: DemoSlotIn, request: Request):
    public_rate_limit(request, "demo-slot-book", limit=10, window_sec=600)
    inv = await _raw_db.demo_invites.find_one({"id": iid}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invite not found")
    _validate_slot(body.date, body.time)

    now_iso = datetime.now(timezone.utc).isoformat()
    slot = {"date": body.date, "time": body.time, "phone": body.phone.strip(), "booked_at": now_iso}
    if body.tz and body.tz != "Asia/Kolkata":
        local = _slot_local_label(body.date, body.time, body.tz)
        if local:
            slot["tz"] = body.tz
            slot["local_time"] = local
    await _raw_db.demo_invites.update_one(
        {"id": iid},
        {"$set": {"preferred_slot": slot, "demo_requested_at": inv.get("demo_requested_at") or now_iso,
                  "opened_at": inv.get("opened_at") or now_iso,
                  "seen_by_hq_req": False, "responded": True}})
    gcal = await _send_slot_confirmations(inv["email"], inv.get("name", ""), inv.get("salon_name", ""),
                                          body.date, body.time, body.phone)
    return {"ok": True, "gcal": gcal, "slot": slot}


_DEMO_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


class PublicDemoIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    salon_name: str = Field("", max_length=100)
    city: str = Field("", max_length=60)
    email: str = Field(..., max_length=120)
    phone: str = Field("", max_length=20)
    date: str = Field(..., max_length=10)
    time: str = Field(..., max_length=5)
    tz: str = Field(default="", max_length=50)


@router.get("/public/demo/slots")
async def public_demo_slots(request: Request):
    public_rate_limit(request, "demo-open-slots", limit=30, window_sec=600)
    from datetime import timedelta
    today = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date()
    return {"dates": [(today + timedelta(days=d)).isoformat() for d in range(1, 8)],
            "times": DEMO_SLOT_TIMES}


def _demo_slot_dict(date_s: str, time_s: str, phone: str, tz: str, now_iso: str) -> dict:
    slot = {"date": date_s, "time": time_s, "phone": (phone or "").strip(), "booked_at": now_iso}
    if tz and tz != "Asia/Kolkata":
        local = _slot_local_label(date_s, time_s, tz)
        if local:
            slot["tz"] = tz
            slot["local_time"] = local
    return slot


async def _upsert_demo_invite(email: str, name: str, salon_name: str, city: str, slot: dict, now_iso: str):
    existing = await _raw_db.demo_invites.find_one({"email": email}, {"_id": 0, "id": 1})
    if existing:
        await _raw_db.demo_invites.update_one(
            {"id": existing["id"]},
            {"$set": {"preferred_slot": slot, "demo_requested_at": now_iso, "responded": True,
                      "seen_by_hq_req": False, "name": name, "salon_name": salon_name, "city": city}})
    else:
        await _raw_db.demo_invites.insert_one({
            "id": str(uuid.uuid4()), "email": email, "name": name,
            "salon_name": salon_name, "city": city,
            "source": "public_demo_page", "first_sent_at": now_iso, "opened_at": now_iso,
            "responded": True, "reminder_sent_at": None, "converted": False,
            "demo_requested_at": now_iso, "preferred_slot": slot, "seen_by_hq_req": False})


def _parse_demo_form(d: dict) -> tuple:
    """Validated (name, email) from the open-demo payload."""
    name = str(d.get("name") or "").strip()
    email = str(d.get("email") or "").strip().lower()
    if len(name) < 2:
        raise HTTPException(400, "Please share your name")
    if not _DEMO_EMAIL_RE.fullmatch(email):
        raise HTTPException(400, "Enter a valid email address")
    return name, email


async def _mark_lead_demo(email: str, slot: dict, now_iso: str) -> None:
    await _raw_db.mira_leads.update_many(
        {"email": email}, {"$set": {"demo_slot": slot, "demo_requested_at": now_iso}})
    await _raw_db.mira_leads.update_many(
        {"email": email, "status": {"$in": ["sent", "drafted", "no_email", "researched", "replied"]}},
        {"$set": {"status": "demo"}})


async def _book_open_demo(d: dict) -> dict:
    """Shared open-demo booking used by the /demo form AND Mira's demo chat.
    Expects keys: name, salon_name, city, email, phone, date, time, tz."""
    name, email = _parse_demo_form(d)
    salon_name, city = str(d.get("salon_name") or "").strip(), str(d.get("city") or "").strip()
    phone, date_s, time_s, tz = (str(d.get("phone") or ""), str(d.get("date") or ""),
                                 str(d.get("time") or ""), str(d.get("tz") or ""))
    _validate_slot(date_s, time_s)
    now_iso = datetime.now(timezone.utc).isoformat()
    slot = _demo_slot_dict(date_s, time_s, phone, tz, now_iso)
    await _upsert_demo_invite(email, name, salon_name, city, slot, now_iso)
    await _mark_lead_demo(email, slot, now_iso)
    gcal = await _send_slot_confirmations(email, name, salon_name, date_s, time_s, phone, city)
    return {"ok": True, "gcal": gcal, "slot": slot}


@router.post("/public/demo/book")
async def public_demo_book(body: PublicDemoIn, request: Request):
    public_rate_limit(request, "demo-open-book", limit=5, window_sec=600)
    return await _book_open_demo(body.model_dump())


_DEMO_BOOK_MARKER = "[[DEMO_BOOK]]"


class DemoChatIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=800)
    session_id: str = Field(..., min_length=8, max_length=64)
    tz: str = Field(default="", max_length=50)


def _demo_chat_system(tz: str) -> str:
    today = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date()
    dates = [(today + timedelta(days=d)).isoformat() for d in range(1, 8)]
    date_lines = ", ".join(f"{d} ({datetime.fromisoformat(d).strftime('%A')})" for d in dates)
    tz_note = (f"The visitor's timezone is {tz}. Slot times are IST — when suggesting times, also mention their local time."
               if tz and tz != "Asia/Kolkata" else "The visitor appears to be in India (IST).")
    return (
        "You are Mira, the friendly AI demo concierge for Miracurl Salon Suite (all-in-one salon management with a 12-agent AI team). "
        "Your ONLY job: book the visitor a free 20-minute live demo. Be warm, human and brief (2-3 short sentences per reply). Speak English or Hindi/Hinglish matching them.\n"
        f"AVAILABLE DAYS (next 7): {date_lines}. AVAILABLE TIMES (IST): {', '.join(DEMO_SLOT_TIMES)}. {tz_note}\n"
        "Understand natural phrases: 'tomorrow' = first available date, 'day after' = second, weekday names map to the matching date above. Morning→11:00, afternoon→13:00/15:00, evening→17:00/18:00.\n"
        "COLLECT (conversationally, not like a form): name, email (required — confirmation goes there), salon name & city (nice to have), phone (optional), preferred day + time from the lists.\n"
        "Once you have AT LEAST name + valid email + day + time, DO NOT ask any more questions or re-confirm — book IMMEDIATELY: state the details in one line and end your reply with EXACTLY this machine line (valid JSON, double quotes):\n"
        f'{_DEMO_BOOK_MARKER}{{"name":"...","salon_name":"...","city":"...","email":"...","phone":"...","date":"YYYY-MM-DD","time":"HH:MM"}}\n'
        "Rules: never mention the marker/JSON; only emit it once, only with a real email the visitor gave; date must be one of the available days, time one of the available times. "
        "If they ask about Miracurl, answer briefly (bookings, POS billing, staff & attendance, inventory, AI marketing, WhatsApp receipts, from a 7-day free trial) and steer back to booking the demo.")


def _demo_booked_reply(reply: str, res: dict) -> str:
    """Append the human confirmation line to Mira's reply after a successful demo booking."""
    when = datetime.fromisoformat(res["slot"]["date"]).strftime("%A, %d %B")
    local = res["slot"].get("local_time")
    return (reply + f"\n\n✅ Done! Your demo is booked for {when} at {res['slot']['time']} IST"
            + (f" ({local} your time)" if local else "")
            + " — the confirmation and calendar invite are on their way to your inbox. See you there! ✦").strip()


async def _run_demo_chat_booking(reply: str, request: Request, tz: str) -> tuple:
    """Parse Mira's [[DEMO_BOOK]] marker and execute the booking. Returns (reply, booking, error)."""
    import json as _json
    text, _, payload = reply.partition(_DEMO_BOOK_MARKER)
    reply = text.strip()
    try:
        data = _json.loads(payload.strip().strip("`").strip())
        # Same strict cap as the manual form — Mira gets no special treatment (anti-flood).
        public_rate_limit(request, "demo-open-book", limit=5, window_sec=600)
        res = await _book_open_demo({**data, "tz": tz})
        booking = {**res["slot"], "gcal": res["gcal"], "email": str(data.get("email") or "").lower()}
        return _demo_booked_reply(reply, res), booking, None
    except HTTPException as he:
        return (reply + f"\n\n⚠️ {he.detail}").strip(), None, he.detail
    except Exception as e:  # noqa: BLE001 — bad LLM JSON must not 500 the chat
        logging.error(f"demo chat booking parse error: {e}")
        err = "Couldn't complete the booking — please use the quick form below."
        return (reply + f"\n\n⚠️ {err}").strip(), None, err


@router.post("/public/demo-chat")
async def public_demo_chat(body: DemoChatIn, request: Request):
    """Mira books the live demo on the visitor's behalf, conversationally."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    public_rate_limit(request, "demo-chat", limit=25, window_sec=600)
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    sid = f"demochat-{body.session_id}"
    hist = await _raw_db.demo_chat_messages.find({"sid": sid}, {"_id": 0}).sort("created_at", 1).to_list(24)
    transcript = "".join(f"{'Visitor' if h['role'] == 'user' else 'Mira'}: {h['content']}\n" for h in hist)
    chat = LlmChat(api_key=key, session_id=f"{sid}-{uuid.uuid4().hex[:6]}",
                   system_message=_demo_chat_system(body.tz)).with_model("openai", "gpt-5.4-mini")
    try:
        reply = (await chat.send_message(UserMessage(
            text=f"{transcript}Visitor: {body.message}\nMira:"))).strip()
    except Exception as e:
        logging.error(f"demo chat LLM error: {e}")
        raise HTTPException(502, "Mira is momentarily unavailable — please use the quick form below.")

    booking, booking_error = None, None
    if _DEMO_BOOK_MARKER in reply:
        reply, booking, booking_error = await _run_demo_chat_booking(reply, request, body.tz)

    now = datetime.now(timezone.utc).isoformat()
    await _raw_db.demo_chat_messages.insert_many([
        {"sid": sid, "role": "user", "content": body.message, "created_at": now},
        {"sid": sid, "role": "assistant", "content": reply, "created_at": now}])
    return {"reply": reply, "booking": booking, "booking_error": booking_error}
