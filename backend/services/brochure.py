"""Sales brochure PDF — cover with Mira, real app screenshots, features & contact page."""
import os
from functools import lru_cache

ASSETS = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets")
DARK, GOLD, INK = (0.11, 0.11, 0.13), (0.91, 0.76, 0.50), (0.2, 0.2, 0.25)

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
    ("dashboard.png", "Your daily command centre — revenue, alerts & Mira's briefing"),
    ("pos.png", "Point of Sale — bill a customer in under 30 seconds"),
    ("staff.png", "Staff management with geo-fenced attendance & verification"),
    ("mira.png", "Mira Social Studio — your AI marketing team"),
]

RESTO_SHOTS = [
    ("dashboard.png", "Your daily command centre — revenue, orders & Mira's briefing"),
    ("pos.png", "Table billing — close a table's whole bill in under 30 seconds"),
    ("mira.png", "Mira Social Studio — your AI marketing team"),
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


@lru_cache(maxsize=2)
def build_brochure_pdf(vertical: str = "salon") -> bytes:
    import io
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas as _canvas

    copy = _COPY.get(vertical) or _COPY["salon"]
    shots = RESTO_SHOTS if vertical == "restaurant" else SHOTS
    features = RESTO_FEATURES if vertical == "restaurant" else FEATURES
    buf = io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    hq_email = os.environ.get("HQ_EMAIL", "")
    hq_phone = os.environ.get("HQ_PHONE", "")
    site = os.environ.get("APP_PUBLIC_URL", "")

    logo_path = os.path.join(ASSETS, "brand_logo.png")
    logo = ImageReader(logo_path) if os.path.exists(logo_path) else None

    def _logo_header(size=30, x=40, y=None):
        if logo:
            c.drawImage(logo, x, (y if y is not None else h - 46), size, size, mask="auto")

    # ── Cover ──
    c.setFillColorRGB(*DARK)
    c.rect(0, 0, w, h, fill=1, stroke=0)
    if logo:
        c.drawImage(logo, w / 2 - 34, h - 52, 68, 68, mask="auto")
    mira = os.path.join(ASSETS, "mira_intro.png")
    if os.path.exists(mira):
        img = ImageReader(mira)
        iw, ih = img.getSize()
        dw = w * 0.52
        dh = dw * ih / iw
        c.drawImage(img, (w - dw) / 2, h - dh - 150, dw, dh, mask="auto")
    c.setFillColorRGB(*GOLD)
    c.setFont("Helvetica-Bold", 30)
    c.drawCentredString(w / 2, h - 90, copy["title"])
    c.setFont("Helvetica", 13)
    c.setFillColorRGB(0.85, 0.85, 0.88)
    c.drawCentredString(w / 2, h - 113, copy["tag"])
    c.setFont("Helvetica-Bold", 15)
    c.setFillColorRGB(*GOLD)
    c.drawCentredString(w / 2, 105, "Thank you for reaching out!")
    c.setFont("Helvetica", 11)
    c.setFillColorRGB(0.8, 0.8, 0.85)
    c.drawCentredString(w / 2, 84, copy["tour"])
    c.showPage()

    # ── Screenshot pages (2 per page) ──
    for page_start in range(0, len(shots), 2):
        c.setFillColorRGB(1, 1, 1)
        c.rect(0, 0, w, h, fill=1, stroke=0)
        c.setFillColorRGB(*DARK)
        c.rect(0, h - 56, w, 56, fill=1, stroke=0)
        _logo_header()
        c.setFillColorRGB(*GOLD)
        c.setFont("Helvetica-Bold", 15)
        c.drawString(80, h - 36, "Inside the app")
        y = h - 90
        for fname, caption in shots[page_start:page_start + 2]:
            path = os.path.join(ASSETS, "brochure", fname)
            if not os.path.exists(path):
                continue
            img = ImageReader(path)
            iw, ih = img.getSize()
            dw = w - 80
            dh = dw * ih / iw
            c.drawImage(img, 40, y - dh, dw, dh)
            c.setFillColorRGB(*INK)
            c.setFont("Helvetica-Bold", 11)
            c.drawString(40, y - dh - 18, caption)
            y = y - dh - 48
        c.showPage()

    # ── Features + contact ──
    c.setFillColorRGB(1, 1, 1)
    c.rect(0, 0, w, h, fill=1, stroke=0)
    c.setFillColorRGB(*DARK)
    c.rect(0, h - 56, w, 56, fill=1, stroke=0)
    _logo_header()
    c.setFillColorRGB(*GOLD)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(80, h - 36, copy["feat_head"])
    y = h - 100
    for title, desc in features:
        c.setFillColorRGB(*GOLD)
        c.circle(48, y + 4, 3, fill=1, stroke=0)
        c.setFillColorRGB(*INK)
        c.setFont("Helvetica-Bold", 12.5)
        c.drawString(62, y, title)
        c.setFont("Helvetica", 10.5)
        c.setFillColorRGB(0.35, 0.35, 0.4)
        c.drawString(62, y - 16, desc)
        y -= 52
    c.setFillColorRGB(*DARK)
    c.roundRect(40, 60, w - 80, 110, 14, fill=1, stroke=0)
    if logo:
        c.drawImage(logo, w - 130, 92, 56, 56, mask="auto")
    c.setFillColorRGB(*GOLD)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(60, 138, copy["contact"])
    c.setFont("Helvetica", 11)
    c.setFillColorRGB(0.85, 0.85, 0.88)
    lines = [x for x in (f"Email: {hq_email}" if hq_email else "",
                         f"Phone / WhatsApp: {hq_phone}" if hq_phone else "",
                         f"Website: {site}" if site else "") if x]
    ty = 114
    for ln in lines:
        c.drawString(60, ty, ln)
        ty -= 18
    c.showPage()
    c.save()
    return buf.getvalue()
