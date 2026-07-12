"""HQ Documents Center — policy/overview PDFs generated on demand, plus combined platform earnings."""
import asyncio
import calendar
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from database import _raw_db
from security import require_super_admin

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
