"""HQ legal/policy documents (DOCS) and their branded PDF renderer — service layer, importable without routes."""
import io
from datetime import datetime, timezone

DOCS = {
    "onboarding_policy": {
        "title": "Tenant & Employee Onboarding Policy",
        "subtitle": "Step-by-step onboarding for new salons and their staff",
        "description": "The complete step-by-step guide to onboard a new salon (tenant) and its employees onto the Miracurl Suite.",
        "sections": [
            ("Salon (Tenant) Onboarding — Steps", [
                "Step 1 — Signup: the owner creates the salon at miracurl-suite.com/signup-salon (2 minutes, free trial as published on the pricing page, no card needed).",
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
                "Plans: free trial (length as published on the pricing page), then half-yearly or annual subscription as published on the pricing page.",
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


def _pdf_doc_header(c, doc: dict, W, H, mm, logo: bytes | None = None):
    from services.pdf_brand import draw_logo
    c.setFillColorRGB(*_PDF_INK)
    c.rect(0, H - 40 * mm, W, 40 * mm, stroke=0, fill=1)
    x = 20 * mm
    if logo and draw_logo(c, logo, x, H - 36 * mm, 28 * mm, 32 * mm):
        x += 32 * mm
    c.setFillColorRGB(*_PDF_GOLD)
    c.setFont("Helvetica-Bold", 19)
    c.drawString(x, H - 20 * mm, doc["title"])
    c.setFillColorRGB(0.92, 0.92, 0.92)
    c.setFont("Helvetica", 10)
    c.drawString(x, H - 27 * mm, doc["subtitle"])
    c.setFont("Helvetica-Oblique", 8.5)
    c.drawString(x, H - 34 * mm,
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


def _doc_pdf(doc: dict, logo: bytes | None = None) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as rl_canvas

    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    _pdf_doc_header(c, doc, W, H, mm, logo)
    _pdf_doc_sections(c, doc, W, H, mm)
    c.setFillColorRGB(*_PDF_GREY)
    c.setFont("Helvetica-Oblique", 8)
    c.drawCentredString(W / 2, 12 * mm, "© Miracurl Suite — this document is part of the tenant onboarding pack")
    c.save()
    return buf.getvalue()


