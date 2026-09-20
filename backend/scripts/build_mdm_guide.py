"""Build the 5-step 'Send a WhatsApp campaign' owner guide (PDF) from captured screenshots."""
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
import os

OUT = "/app/frontend/public/guides/mdm-whatsapp-campaign-guide.pdf"
GOLD, INK, MUTED = HexColor("#b8863b"), HexColor("#111111"), HexColor("#666666")
FONT_DIR = "/app/backend/assets/fonts"
STEPS = [
    ("Log in to Miracurl Partner", "/tmp/g1_login.jpg",
     ["Open miracurl-suite.com/partner/login on your phone or laptop.",
      "Enter your owner email + password and tap Login.",
      "Tip: tap 'Keep me signed in' so you don't need to log in every day."]),
    ("Open CRM → WhatsApp Campaign", "/tmp/g2_crm.jpg",
     ["In the left menu tap CRM — all 2,104 guests are already imported here.",
      "Top-right, switch to the green 'WhatsApp Campaign' tab.",
      "The 'Total Customers' box shows your full client list."]),
    ("Pick recipients + Auto-batch", "/tmp/g3_audience.jpg",
     ["Choose 'Ready to send — next 500 not yet messaged'. Guests who already got a message in the last 30 days are skipped automatically, so nobody is messaged twice.",
      "Keep 'Auto-batch the rest' ticked: 500 go now, the rest follow in batches of 500.",
      "Release the next batches: every hour, daily at a time (Mira suggests the best hour), or manually.",
      "Watch the yellow credits alert — top up before a batch pauses."]),
    ("Choose the message + poster", "/tmp/g4_template.jpg",
     ["Pick a type: Festival Offer, General Promo, Rebooking, Loyalty, Thank You or Custom.",
      "Tap 'Let Mira write it' — Mira drafts the WhatsApp text and picks an image, or upload your own poster.",
      "Use 'Test on my number' to receive it on your own WhatsApp first."]),
    ("Send & track", "/tmp/g5_history.jpg",
     ["Tap Send. 'View Campaign History' shows one gold summary card: guests · batches done · next send time.",
      "Every batch shows sent / delivered / read / replied / booked.",
      "Manual batches wait with a 'Send this batch now' button — mark them released whenever you like."]),
]


def _font(name: str, size: int) -> str | None:
    for cand in (f"{FONT_DIR}/{name}", f"{FONT_DIR}/PlayfairDisplay-Bold.ttf"):
        if os.path.exists(cand):
            return cand
    return None


def main() -> None:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    c = canvas.Canvas(OUT, pagesize=A4)
    W, H = A4
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    serif = "Helvetica-Bold"
    pf = _font("PlayfairDisplay-Bold.ttf", 0)
    if pf:
        pdfmetrics.registerFont(TTFont("Playfair", pf)); serif = "Playfair"
    # cover
    c.setFillColor(HexColor("#0b0b0b")); c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(GOLD); c.setFont(serif, 34); c.drawCentredString(W / 2, H - 120 * mm, "MDM Luxury Salon")
    c.setFillColor(HexColor("#ffffff")); c.setFont(serif, 22); c.drawCentredString(W / 2, H - 135 * mm, "Send a WhatsApp campaign to all your guests")
    c.setFillColor(GOLD); c.setFont("Helvetica", 12); c.drawCentredString(W / 2, H - 150 * mm, "5 simple steps  ·  500 guests per batch  ·  nobody messaged twice")
    c.setFillColor(HexColor("#bbbbbb")); c.setFont("Helvetica", 10); c.drawCentredString(W / 2, 20 * mm, "Miracurl Suite · miracurl-suite.com · WhatsApp support +91 91803 79552")
    c.showPage()
    for i, (title, img, bullets) in enumerate(STEPS, start=1):
        c.setFillColor(HexColor("#ffffff")); c.rect(0, 0, W, H, fill=1, stroke=0)
        c.setFillColor(GOLD); c.circle(22 * mm, H - 22 * mm, 8 * mm, fill=1, stroke=0)
        c.setFillColor(HexColor("#ffffff")); c.setFont("Helvetica-Bold", 16); c.drawCentredString(22 * mm, H - 24.5 * mm, str(i))
        c.setFillColor(INK); c.setFont(serif, 22); c.drawString(36 * mm, H - 25 * mm, title)
        if os.path.exists(img):
            im = Image.open(img); ratio = (W - 30 * mm) / im.width; h = im.height * ratio
            c.drawImage(img, 15 * mm, H - 36 * mm - h, W - 30 * mm, h)
            y = H - 44 * mm - h
        else:
            y = H - 45 * mm
        c.setFont("Helvetica", 11); c.setFillColor(INK)
        for b in bullets:
            c.setFillColor(GOLD); c.drawString(18 * mm, y, "✦" if serif == "Playfair" else "•"); c.setFillColor(INK)
            words, line, lines = b.split(), "", []
            for w in words:
                if c.stringWidth(line + " " + w, "Helvetica", 11) > W - 48 * mm:
                    lines.append(line); line = w
                else:
                    line = (line + " " + w).strip()
            lines.append(line)
            for ln in lines:
                c.drawString(25 * mm, y, ln); y -= 5.5 * mm
            y -= 1.5 * mm
        c.setFillColor(MUTED); c.setFont("Helvetica", 9); c.drawRightString(W - 15 * mm, 12 * mm, f"Step {i} of 5 · Miracurl Suite")
        c.showPage()
    c.save()
    print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    main()
