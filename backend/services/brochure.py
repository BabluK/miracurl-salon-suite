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

SHOTS = [
    ("dashboard.png", "Your daily command centre — revenue, alerts & Mira's briefing"),
    ("pos.png", "Point of Sale — bill a customer in under 30 seconds"),
    ("staff.png", "Staff management with geo-fenced attendance & verification"),
    ("mira.png", "Mira Social Studio — your AI marketing team"),
]


@lru_cache(maxsize=1)
def build_brochure_pdf() -> bytes:
    import io
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas as _canvas

    buf = io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    hq_email = os.environ.get("HQ_EMAIL", "")
    hq_phone = os.environ.get("HQ_PHONE", "")
    site = os.environ.get("APP_PUBLIC_URL", "")

    # ── Cover ──
    c.setFillColorRGB(*DARK)
    c.rect(0, 0, w, h, fill=1, stroke=0)
    mira = os.path.join(ASSETS, "mira_intro.png")
    if os.path.exists(mira):
        img = ImageReader(mira)
        iw, ih = img.getSize()
        dw = w * 0.52
        dh = dw * ih / iw
        c.drawImage(img, (w - dw) / 2, h - dh - 150, dw, dh, mask="auto")
    c.setFillColorRGB(*GOLD)
    c.setFont("Helvetica-Bold", 30)
    c.drawCentredString(w / 2, h - 70, "Miracurl Salon Suite")
    c.setFont("Helvetica", 13)
    c.setFillColorRGB(0.85, 0.85, 0.88)
    c.drawCentredString(w / 2, h - 95, "The all-in-one software that runs your salon — with Mira, your AI teammate")
    c.setFont("Helvetica-Bold", 15)
    c.setFillColorRGB(*GOLD)
    c.drawCentredString(w / 2, 105, "Thank you for reaching out!")
    c.setFont("Helvetica", 11)
    c.setFillColorRGB(0.8, 0.8, 0.85)
    c.drawCentredString(w / 2, 84, "This quick tour shows what Miracurl can do for your salon.")
    c.showPage()

    # ── Screenshot pages (2 per page) ──
    for page_start in range(0, len(SHOTS), 2):
        c.setFillColorRGB(1, 1, 1)
        c.rect(0, 0, w, h, fill=1, stroke=0)
        c.setFillColorRGB(*DARK)
        c.rect(0, h - 56, w, 56, fill=1, stroke=0)
        c.setFillColorRGB(*GOLD)
        c.setFont("Helvetica-Bold", 15)
        c.drawString(40, h - 36, "Inside the app")
        y = h - 90
        for fname, caption in SHOTS[page_start:page_start + 2]:
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
    c.setFillColorRGB(*GOLD)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(40, h - 36, "Everything your salon needs")
    y = h - 100
    for title, desc in FEATURES:
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
    c.setFillColorRGB(*GOLD)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(60, 138, "Let's grow your salon together — Miracurl Family")
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
