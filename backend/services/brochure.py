"""Miracurl Suite PDFs — per vertical:
- build_tour_pdf():     visual App Tour (cover + latest screenshots incl. booking page + features)
- build_policies_pdf(): Onboarding & Policies handbook (onboarding, hiring, T&C, refund, contacts)
- build_brochure_pdf(): full combined brochure (served at the public /api/public/brochure*.pdf links)
"""
import os
from functools import lru_cache

ASSETS = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets")
DARK, GOLD, INK = (0.11, 0.11, 0.13), (0.91, 0.76, 0.50), (0.2, 0.2, 0.25)
GOLD_D, GREY = (0.72, 0.6, 0.25), (0.38, 0.38, 0.44)

FEATURES = [
    ("Online Bookings", "24x7 booking page for your salon — customers book themselves, you get notified."),
    ("POS & GST Billing", "Fast billing with GST receipts, SMS/email receipts and thermal-printer support."),
    ("Customer CRM & Loyalty", "Loyalty points, birthday offers and full visit history for every guest."),
    ("Staff Verification Portal", "Hire trusted staff — verified registry with resumes, documents & work history."),
    ("Mira — AI Marketing Agent", "Auto-creates daily Instagram posts, win-back emails & WhatsApp offers on autopilot."),
    ("Reports & Multi-branch", "Daily business reports, staff commissions and one dashboard for all branches."),
]

RESTO_FEATURES = [
    ("QR Table Ordering", "Diners scan the QR on their table, browse your menu with photos and order in seconds."),
    ("Live Kitchen Tickets", "Every order lands in the kitchen instantly — with a chime, dish list and table number."),
    ("Table-wise Billing & GST", "All of a table's orders merge into ONE bill — one tap closes it with a GST receipt."),
    ("Table Reservations", "Guests reserve online with party size & seating choice — and can pre-pick dishes."),
    ("Mira — AI Menu & Marketing", "AI paints appetizing dish photos, writes descriptions and runs your social marketing."),
    ("Insights & Sold-out Control", "Best-selling dishes, busiest tables, waiter-call alerts and one-tap sold-out toggles."),
]

SHOTS = [
    (["salon_dashboard.jpeg", "dashboard.png"], "Your daily command centre — revenue, alerts & Mira's briefing"),
    (["salon_pos.jpeg", "pos.png"], "Point of Sale — bill a guest in under 30 seconds"),
    (["salon_appointments.jpeg"], "Appointments — stylist calendar with WhatsApp confirmations"),
    (["salon_mira.jpeg", "mira.png"], "Mira Offers Studio — your AI marketing team"),
    (["salon_booking.jpeg"], "Booking Tour — your guests' 24x7 online booking page"),
]

RESTO_SHOTS = [
    (["resto_dashboard.jpeg", "dashboard.png"], "Your daily command centre — revenue, orders & Mira's briefing"),
    (["resto_kitchen.jpeg"], "Live Kitchen — order tickets, live tables & waiter calls"),
    (["resto_menu.jpeg"], "Menu manager — AI dish photos, veg/spice tags & sold-out control"),
    (["resto_pos.jpeg", "pos.png"], "Table billing — close a table's whole bill in under 30 seconds"),
    (["resto_order.jpeg"], "QR Table Ordering — diners scan, browse & order from their phone"),
    (["resto_booking.jpeg"], "Booking Tour — online table reservations for your guests"),
]

_COPY = {
    "salon": {"title": "Miracurl Salon Suite",
              "tag": "The all-in-one software that runs your salon — with Mira, your AI teammate",
              "tour": "This quick tour shows what Miracurl can do for your salon.",
              "feat_head": "Everything your salon needs",
              "contact": "Let's grow your salon together — Miracurl Family"},
    "restaurant": {"title": "Miracurl Restaurant Suite",
                   "tag": "QR table ordering, live kitchen tickets & one-tap table billing — with Mira, your AI teammate",
                   "tour": "This quick tour shows what Miracurl can do for your restaurant.",
                   "feat_head": "Everything your restaurant needs",
                   "contact": "Let's grow your restaurant together — Miracurl Family"},
}

CONTACT_EMAILS = [
    ("Support & help desk", "support@miracurl-suite.com"),
    ("General information", "info@miracurl-suite.com"),
    ("HQ & administration", "admin@miracurl-suite.com"),
    ("Partnerships & enquiries", "contact@miracurl-suite.com"),
    ("Demos & booking assistance", "booking@miracurl-suite.com"),
]


def _onboarding_sections(vertical: str):
    biz = "restaurant" if vertical == "restaurant" else "salon"
    signup = f"miracurl-suite.com/signup-{biz}"
    trial = "first month FREE" if biz == "restaurant" else "7-day free trial"
    catalog = "full menu with categories, dish photos and prices" if biz == "restaurant" \
        else "full service catalogue with categories and prices (Excel import supported)"
    live = ("the restaurant receives its public reservations page, QR table-ordering menu and live Kitchen screen"
            if biz == "restaurant" else
            "the salon receives its public booking page and SEO salon page (miracurl-suite.com/salon/<name>)")
    train = ("30-minute walkthrough of QR ordering, kitchen tickets, table billing and the dashboard with the Miracurl team"
             if biz == "restaurant" else
             "30-minute walkthrough of POS billing, appointments and the dashboard with the Miracurl team")
    return [
        (f"{biz.title()} (Tenant) Onboarding — Steps", [
            f"Step 1 — Signup: the owner creates the {biz} at {signup} (2 minutes, {trial}, no card needed).",
            f"Step 2 — Catalogue: add your {catalog}.",
            "Step 3 — Staff onboarding: add every staff member with name, mobile and Aadhaar for registry verification.",
            "Step 4 — Setup: configure branches, working hours and the Owner PIN for protected actions.",
            f"Step 5 — Go live: {live}.",
            f"Step 6 — Training: {train}.",
            "Step 7 — Handover: owner credentials issued by email from noreply@miracurl-suite.com; trial-to-paid plan explained.",
        ]),
        ("Employee Onboarding — Steps", [
            "Step 1 — Registry entry: HQ or the owner records the employee with name, mobile and Aadhaar (stored as a secure hash).",
            "Step 2 — Verification: HQ verifies the record; the employee receives a unique Miracurl staff code.",
            "Step 3 — ID card: a QR-verified Miracurl ID card is generated for the employee.",
            "Step 4 — Portal access: the employee self-registers on the Employee Portal (miracurl-suite.com/employee) using mobile + Aadhaar.",
            "Step 5 — Profile & resume: the employee completes their profile and builds their Miracurl-verified PDF resume.",
            f"Step 6 — Login: if the employee works at a {biz}, the owner creates their app credentials in one tap.",
        ]),
        ("Data & Compliance", [
            "Aadhaar numbers are never stored in plain text — only salted cryptographic hashes are kept.",
            "Employees marked as 'Left' lose business-app access immediately but retain Employee Portal access.",
            "All onboarding actions are logged with the acting admin's identity.",
        ]),
    ]


HIRING_SECTIONS = [
    ("Eligibility & Verification", [
        "Only staff verified in the Miracurl HQ Registry (mobile + Aadhaar on file) may apply to openings.",
        "Business identity is hidden from candidates until they are shortlisted by HQ.",
        "Employment history shown to owners is registry-verified; HQ-verified records carry a badge.",
    ]),
    ("Hiring Process", [
        "1. The owner posts a hiring request from their dashboard — it goes directly to Miracurl HQ.",
        "2. HQ curates and proposes matching verified candidates to the business.",
        "3. Trials are scheduled through HQ; both sides receive updates at every step.",
        "4. When the owner creates login credentials for the candidate, the hire is confirmed automatically.",
    ]),
    ("Placement Fee", [
        "A one-time placement fee (amount set by Miracurl HQ, default Rs.1,000) is due per successful hire.",
        "On hire confirmation, the owner automatically receives an email with a Razorpay payment link.",
        "The fee is marked paid automatically when the link is paid, or manually by HQ for offline payments.",
    ]),
    ("Conduct, Anti-Poaching & Exits", [
        "Businesses must not contact candidates outside the platform before a confirmed hire.",
        "Candidate ratings and reviews must be honest and relate to actual employment.",
        "Misuse of candidate personal data leads to removal from the marketplace.",
        "When a staff member leaves, mark them 'Left' in the registry within 7 days — they then reappear as available candidates.",
    ]),
]

TERMS_SECTIONS = [
    ("Subscription & Payments", [
        "Plans: a free trial period, then a 3-month, 6-month or annual subscription as published on the pricing page.",
        "Payments are collected via Razorpay (India) or card (international); prices exclude applicable taxes unless stated.",
        "Renewal reminders are sent before expiry; access is suspended if the subscription lapses beyond the grace period.",
    ]),
    ("Data & Privacy", [
        "Each business's data (customers, billing, staff) is isolated and never shared with other tenants.",
        "Aadhaar numbers are stored only as irreversible salted hashes for verification.",
        "The business owns its data and may request an export at any time.",
    ]),
    ("Acceptable Use", [
        "The platform must not be used for unlawful communication or spam campaigns.",
        "Marketplace conduct rules (see the Hiring Policy) apply to all hiring activity.",
    ]),
    ("Liability & Termination", [
        "Miracurl provides the software 'as is' with commercially reasonable uptime targets.",
        "Miracurl may suspend accounts that breach these terms after notice.",
        "Disputes are subject to the jurisdiction of Bengaluru, Karnataka, India.",
    ]),
]

REFUND_SECTIONS = [
    ("Eligible Refunds", [
        "Duplicate payment has been made.",
        "An incorrect amount was charged due to a technical issue.",
        "The service could not be activated due to an issue caused solely by Miracurl Suite.",
    ]),
    ("Non-refundable Situations", [
        "Change of mind after subscription activation, or partial usage of the subscription period.",
        "Failure to use the software, or user configuration errors.",
        "Violation of the Terms of Service.",
        "Placement fees once a hire is confirmed.",
    ]),
    ("Processing & Cancellation", [
        "Approved refunds (India) are processed within 7-10 business days; international refunds within 10-15 business days.",
        "Foreign-exchange, intermediary bank and payment-processing charges are non-refundable.",
        "You may cancel anytime — future renewals stop and access continues until the end of the current billing cycle.",
        "Please contact us before initiating a chargeback; abusive chargebacks may lead to account suspension.",
    ]),
]


def _first_existing(names):
    for n in names:
        p = os.path.join(ASSETS, "brochure", n)
        if os.path.exists(p):
            return p
    return None


def _build_pdf(vertical: str = "salon", part: str = "full") -> bytes:
    import io
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import ImageReader, simpleSplit
    from reportlab.pdfgen import canvas as _canvas

    copy = _COPY.get(vertical) or _COPY["salon"]
    resto = vertical == "restaurant"
    shots = RESTO_SHOTS if resto else SHOTS
    features = RESTO_FEATURES if resto else FEATURES
    buf = io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    hq_phone = os.environ.get("HQ_PHONE", "")
    site = os.environ.get("APP_PUBLIC_URL", "")

    logo_path = os.path.join(ASSETS, "brand_ms_emblem.png")
    logo = ImageReader(logo_path) if os.path.exists(logo_path) else None
    wm_path = os.path.join(ASSETS, "brand_wordmark_gold.png")
    wordmark = ImageReader(wm_path) if os.path.exists(wm_path) else None
    page_no = [0]

    def _page_head(section: str):
        page_no[0] += 1
        c.setFillColorRGB(1, 1, 1)
        c.rect(0, 0, w, h, fill=1, stroke=0)
        c.setFillColorRGB(*DARK)
        c.rect(0, h - 56, w, 56, fill=1, stroke=0)
        if logo:
            c.drawImage(logo, 40, h - 46, 30, 30, preserveAspectRatio=True, anchor="c", mask="auto")
        c.setFillColorRGB(*GOLD)
        c.setFont("Helvetica-Bold", 15)
        c.drawString(80, h - 36, section)
        c.setFillColorRGB(0.6, 0.58, 0.52)
        c.setFont("Helvetica", 8.5)
        c.drawRightString(w - 40, h - 34, copy["title"].upper())
        c.setFillColorRGB(0.62, 0.6, 0.55)
        c.setFont("Helvetica", 8)
        c.drawString(40, 28, "miracurl-suite.com")
        c.drawRightString(w - 40, 28, f"Page {page_no[0] + 1}")
        c.setStrokeColorRGB(0.88, 0.85, 0.78)
        c.setLineWidth(0.6)
        c.line(40, 40, w - 40, 40)

    def _policy_pages(section_title: str, intro: str, sections):
        _page_head(section_title)
        y = h - 84
        if intro:
            c.setFillColorRGB(*GREY)
            c.setFont("Helvetica-Oblique", 10.5)
            for ln in simpleSplit(intro, "Helvetica-Oblique", 10.5, w - 100):
                c.drawString(50, y, ln)
                y -= 14
            y -= 10
        for heading, points in sections:
            need = 30 + len(points) * 26
            if y - min(need, 90) < 60:
                c.showPage()
                _page_head(section_title + " (contd.)")
                y = h - 84
            c.setFillColorRGB(*GOLD_D)
            c.setFont("Helvetica-Bold", 12.5)
            c.drawString(50, y, heading)
            c.setStrokeColorRGB(*GOLD_D)
            c.setLineWidth(1.2)
            c.line(50, y - 5, 50 + c.stringWidth(heading, "Helvetica-Bold", 12.5), y - 5)
            y -= 24
            for pt in points:
                lines = simpleSplit(pt, "Helvetica", 10, w - 130)
                if y - len(lines) * 13 < 56:
                    c.showPage()
                    _page_head(section_title + " (contd.)")
                    y = h - 84
                c.setFillColorRGB(*GOLD_D)
                c.circle(56, y + 3, 2.2, fill=1, stroke=0)
                c.setFillColorRGB(*INK)
                c.setFont("Helvetica", 10)
                for ln in lines:
                    c.drawString(68, y, ln)
                    y -= 13
                y -= 6
            y -= 12
        c.showPage()

    def _cover(edition: str, tag_text: str, foot_head: str, foot_sub: str):
        c.setFillColorRGB(*DARK)
        c.rect(0, 0, w, h, fill=1, stroke=0)
        cover_bg = os.path.join(ASSETS, "brochure", f"cover_{'restaurant' if resto else 'salon'}.jpg")
        if os.path.exists(cover_bg):
            bg = ImageReader(cover_bg)
            bw_, bh_ = bg.getSize()
            scale = max(w / bw_, h / bh_)
            c.drawImage(bg, (w - bw_ * scale) / 2, (h - bh_ * scale) / 2, bw_ * scale, bh_ * scale)
        y0 = h - 118
        if logo:
            c.drawImage(logo, w / 2 - 41, y0, 82, 84, preserveAspectRatio=True, anchor="c", mask="auto")
        if wordmark:
            ww, wh = wordmark.getSize()
            dw = 300.0
            dh = dw * wh / ww
            c.drawImage(wordmark, (w - dw) / 2, y0 - dh - 18, dw, dh, mask="auto")
            y0 = y0 - dh - 18
        c.setFillColorRGB(*GOLD)
        c.setFont("Helvetica-Bold", 12)
        ew = c.stringWidth(edition, "Helvetica-Bold", 12)
        c.setStrokeColorRGB(*GOLD)
        c.setLineWidth(0.8)
        ey = y0 - 26
        c.line(w / 2 - ew / 2 - 44, ey + 4, w / 2 - ew / 2 - 12, ey + 4)
        c.line(w / 2 + ew / 2 + 12, ey + 4, w / 2 + ew / 2 + 44, ey + 4)
        c.drawCentredString(w / 2, ey, edition)
        c.setFont("Helvetica", 12)
        c.setFillColorRGB(0.92, 0.9, 0.85)
        c.drawCentredString(w / 2, ey - 24, tag_text)
        c.setFont("Helvetica-Bold", 15)
        c.setFillColorRGB(*GOLD)
        c.drawCentredString(w / 2, 105, foot_head)
        c.setFont("Helvetica", 11)
        c.setFillColorRGB(0.88, 0.87, 0.84)
        c.drawCentredString(w / 2, 84, foot_sub)
        c.showPage()

    vert_name = "RESTAURANT" if resto else "SALON"
    if part in ("tour", "full"):
        _cover(f"{vert_name} EDITION — APP TOUR" if part == "tour" else f"{vert_name} EDITION",
               copy["tag"], "Thank you for reaching out!", copy["tour"])
        # app tour — 2 framed screenshots per page (booking page always included)
        existing = [(p, cap) for names, cap in shots if (p := _first_existing(names))]
        for page_start in range(0, len(existing), 2):
            _page_head("Inside the app — a quick tour")
            y = h - 82
            for path, caption in existing[page_start:page_start + 2]:
                img = ImageReader(path)
                iw, ih = img.getSize()
                dw = w - 110
                dh = dw * ih / iw
                if dh > 300:
                    dh = 300
                    dw = dh * iw / ih
                x0 = (w - dw) / 2
                c.setFillColorRGB(0.93, 0.91, 0.86)
                c.roundRect(x0 - 8, y - dh - 8, dw + 16, dh + 16, 10, fill=1, stroke=0)
                c.drawImage(img, x0, y - dh, dw, dh)
                c.setFillColorRGB(*GOLD_D)
                c.circle(x0 + 4, y - dh - 24, 2.4, fill=1, stroke=0)
                c.setFillColorRGB(*INK)
                c.setFont("Helvetica-Bold", 11)
                c.drawString(x0 + 14, y - dh - 28, caption)
                y = y - dh - 58
            c.showPage()
        # features
        _page_head(copy["feat_head"])
        y = h - 100
        for title, desc in features:
            c.setFillColorRGB(0.985, 0.975, 0.955)
            c.roundRect(42, y - 26, w - 84, 52, 9, fill=1, stroke=0)
            c.setFillColorRGB(*GOLD_D)
            c.circle(60, y, 3.2, fill=1, stroke=0)
            c.setFillColorRGB(*INK)
            c.setFont("Helvetica-Bold", 12.5)
            c.drawString(76, y + 3, title)
            c.setFont("Helvetica", 10.5)
            c.setFillColorRGB(0.35, 0.35, 0.4)
            c.drawString(76, y - 14, desc)
            y -= 66
        c.setFillColorRGB(*GREY)
        c.setFont("Helvetica-Oblique", 10)
        c.drawCentredString(w / 2, y - 4, "…plus loyalty clubs, gift cards, memberships, attendance & payroll, and much more.")
        if part == "tour":
            c.setFillColorRGB(*GOLD_D)
            c.setFont("Helvetica-Bold", 11)
            c.drawCentredString(w / 2, y - 34, "Book a free live demo — booking@miracurl-suite.com · miracurl-suite.com/demo")
        c.showPage()

    if part in ("policies", "full"):
        if part == "policies":
            _cover(f"{vert_name} EDITION — HANDBOOK",
                   "Onboarding · Hiring Policy · Terms & Conditions · Refund Policy · Contacts",
                   "The fine print, made simple",
                   "Everything about joining, hiring, billing and support — in one place.")
        _policy_pages("Tenant & Employee Onboarding",
                      "How a new business and its team come onboard Miracurl Suite — simple, guided and verified.",
                      _onboarding_sections(vertical))
        _policy_pages("Employee Hiring Policy",
                      "Rules of the Miracurl Staff Hiring Marketplace — eligibility, verification, trials, fees and conduct.",
                      HIRING_SECTIONS)
        _policy_pages("Terms & Conditions",
                      "The terms every tenant accepts when subscribing to Miracurl Suite. Full text: miracurl-suite.com/terms-of-service",
                      TERMS_SECTIONS)
        _policy_pages("Refund Policy",
                      "Refunds, cancellations and billing disputes. Full text: miracurl-suite.com/refund-policy",
                      REFUND_SECTIONS)
        # contact directory
        _page_head("Miracurl Contact Details")
        c.setFillColorRGB(*DARK)
        c.roundRect(40, h - 420, w - 80, 330, 16, fill=1, stroke=0)
        if logo:
            c.drawImage(logo, w / 2 - 26, h - 158, 52, 52, preserveAspectRatio=True, anchor="c", mask="auto")
        c.setFillColorRGB(*GOLD)
        c.setFont("Helvetica-Bold", 16)
        c.drawCentredString(w / 2, h - 186, copy["contact"])
        c.setStrokeColorRGB(*GOLD)
        c.setLineWidth(0.7)
        c.line(w / 2 - 90, h - 196, w / 2 + 90, h - 196)
        ty = h - 226
        for label, email in CONTACT_EMAILS:
            c.setFillColorRGB(0.8, 0.78, 0.72)
            c.setFont("Helvetica", 10.5)
            c.drawRightString(w / 2 - 12, ty, label)
            c.setFillColorRGB(*GOLD)
            c.setFont("Helvetica-Bold", 11)
            c.drawString(w / 2 + 12, ty, email)
            ty -= 26
        extra = [x for x in (f"Phone / WhatsApp: {hq_phone}" if hq_phone else "",
                             f"Website: {site or 'https://miracurl-suite.com'}") if x]
        ty -= 6
        c.setFillColorRGB(0.88, 0.87, 0.84)
        c.setFont("Helvetica", 10.5)
        for ln in extra:
            c.drawCentredString(w / 2, ty, ln)
            ty -= 20
        c.setFillColorRGB(*GREY)
        c.setFont("Helvetica-Oblique", 10)
        c.drawCentredString(w / 2, h - 470, "Bengaluru, Karnataka, India · We reply within one business day.")
        c.showPage()

    c.save()
    return buf.getvalue()


@lru_cache(maxsize=2)
def build_tour_pdf(vertical: str = "salon") -> bytes:
    return _build_pdf(vertical, "tour")


@lru_cache(maxsize=2)
def build_policies_pdf(vertical: str = "salon") -> bytes:
    return _build_pdf(vertical, "policies")


@lru_cache(maxsize=2)
def build_brochure_pdf(vertical: str = "salon") -> bytes:
    return _build_pdf(vertical, "full")
