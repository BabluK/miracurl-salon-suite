"""Luxe Miracurl HQ ID card — navy waves, gold trim, circular photo, QR + barcode (reference: CEO card)."""
import io
import os

NAVY = (0.09, 0.13, 0.30)
GOLD = (0.78, 0.60, 0.22)
GOLD_LT = (0.93, 0.80, 0.45)
CREAM = (0.98, 0.95, 0.89)
ROSE = (0.72, 0.43, 0.40)
INK = (0.13, 0.15, 0.22)
_SCRIPT_FONT = "/usr/share/fonts/truetype/freefont/FreeSerifBoldItalic.ttf"


def _script_font():
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        if "MiraScript" not in pdfmetrics.getRegisteredFontNames() and os.path.exists(_SCRIPT_FONT):
            pdfmetrics.registerFont(TTFont("MiraScript", _SCRIPT_FONT))
        return "MiraScript" if "MiraScript" in pdfmetrics.getRegisteredFontNames() else "Times-BoldItalic"
    except Exception:  # noqa: BLE001
        return "Times-BoldItalic"


def _wave(c, W, y_left, y_right, bulge, top=True, color=NAVY, gold_edge=True):
    """Filled wave band across the card (top or bottom) with a thin gold edge."""
    p = c.beginPath()
    if top:
        p.moveTo(0, 288); p.lineTo(W, 288); p.lineTo(W, y_right)
        p.curveTo(W * 0.7, y_right - bulge, W * 0.35, y_left + bulge, 0, y_left); p.close()
    else:
        p.moveTo(0, 0); p.lineTo(W, 0); p.lineTo(W, y_right)
        p.curveTo(W * 0.65, y_right + bulge, W * 0.3, y_left - bulge, 0, y_left); p.close()
    c.setFillColorRGB(*color)
    c.drawPath(p, fill=1, stroke=0)
    if gold_edge:
        e = c.beginPath()
        e.moveTo(0, y_left)
        if top:
            e.curveTo(W * 0.35, y_left + bulge, W * 0.7, y_right - bulge, W, y_right)
        else:
            e.curveTo(W * 0.3, y_left - bulge, W * 0.65, y_right + bulge, W, y_right)
        c.setStrokeColorRGB(*GOLD_LT); c.setLineWidth(2.2)
        c.drawPath(e, fill=0, stroke=1)


def _tracked(c, x, y, text, size, color, font="Helvetica", spacing=1.6, center=False, right=False):
    c.setFont(font, size); c.setFillColorRGB(*color)
    total = sum(c.stringWidth(ch, font, size) + spacing for ch in text) - spacing
    if center:
        x = x - total / 2
    elif right:
        x = x - total
    for ch in text:
        c.drawString(x, y, ch); x += c.stringWidth(ch, font, size) + spacing


def _icon(c, kind, cx, cy):
    c.setFillColorRGB(*CREAM); c.circle(cx, cy, 6.2, fill=1, stroke=0)
    c.setStrokeColorRGB(*GOLD); c.setLineWidth(0.9); c.setFillColorRGB(*GOLD)
    if kind == "user":
        c.circle(cx, cy + 1.6, 1.7, fill=0, stroke=1)
        c.arc(cx - 3.2, cy - 4.2, cx + 3.2, cy + 0.6, 0, 180)
    elif kind == "mail":
        c.rect(cx - 3.2, cy - 2.2, 6.4, 4.4, fill=0, stroke=1)
        c.line(cx - 3.2, cy + 2.2, cx, cy - 0.4); c.line(cx + 3.2, cy + 2.2, cx, cy - 0.4)
    elif kind == "phone":
        c.roundRect(cx - 1.8, cy - 3.2, 3.6, 6.4, 1, fill=0, stroke=1); c.circle(cx, cy - 2.2, 0.35, fill=1, stroke=0)
    elif kind == "drop":
        p = c.beginPath(); p.moveTo(cx, cy + 3.4); p.curveTo(cx + 3.2, cy - 0.5, cx + 2.4, cy - 3.2, cx, cy - 3.2)
        p.curveTo(cx - 2.4, cy - 3.2, cx - 3.2, cy - 0.5, cx, cy + 3.4); c.drawPath(p, fill=0, stroke=1)


def render_luxe_id_card(d: dict) -> bytes:
    from reportlab.graphics import renderPDF
    from reportlab.graphics.barcode import code128
    from reportlab.graphics.barcode.qr import QrCodeWidget
    from reportlab.graphics.shapes import Drawing
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas as _canvas

    W, H = 180, 288
    buf = io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=(W, H))
    script = _script_font()

    c.setFillColorRGB(1, 1, 1); c.rect(0, 0, W, H, fill=1, stroke=0)
    # cream lower wash
    c.setFillColorRGB(0.99, 0.975, 0.95); c.rect(0, 0, W, 110, fill=1, stroke=0)
    _wave(c, W, 232, 246, 22, top=True)
    _wave(c, W, 18, 8, 12, top=False)
    # hole-punch slot
    c.setFillColorRGB(1, 1, 1); c.roundRect(W / 2 - 14, H - 12, 28, 5, 2.5, fill=1, stroke=0)
    c.setFillColorRGB(0.85, 0.87, 0.92); c.roundRect(W / 2 - 13, H - 11.3, 26, 3.6, 1.8, fill=1, stroke=0)

    # top-left eyebrow + tiny emblem
    for i, line in enumerate(("PEOPLE", "BEHIND", "BEAUTIFUL", "STORIES")):
        _tracked(c, 12, H - 22 - i * 6.6, line, 3.4, (1, 1, 1), spacing=1.4)
    # right script tagline
    c.setFillColorRGB(*GOLD_LT); c.setFont(script, 10.5)
    for i, line in enumerate(("Beauty", "Empowers", "You ♡" if script != "Times-BoldItalic" else "You")):
        c.drawRightString(W - 12, H - 28 - i * 10.5, line)

    # photo circle with double gold ring (overlaps the wave)
    pr = 33; pcx, pcy = W / 2, H - 92
    c.setFillColorRGB(1, 1, 1); c.circle(pcx, pcy, pr + 7, fill=1, stroke=0)
    c.setStrokeColorRGB(*GOLD_LT); c.setLineWidth(2.6); c.circle(pcx, pcy, pr + 5, fill=0, stroke=1)
    c.setStrokeColorRGB(*GOLD); c.setLineWidth(1); c.circle(pcx, pcy, pr + 1.6, fill=0, stroke=1)
    img = ImageReader(io.BytesIO(d["photo_bytes"])); iw, ih = img.getSize(); sc = (2.0 * pr) / min(iw, ih)
    c.saveState(); clip = c.beginPath(); clip.circle(pcx, pcy, pr); c.clipPath(clip, stroke=0, fill=0)
    c.drawImage(img, pcx - iw * sc / 2, pcy - ih * sc / 2, width=iw * sc, height=ih * sc, mask="auto"); c.restoreState()
    # Super Admin "MS" emblem badge on the photo ring
    if d.get("emblem_bytes"):
        try:
            em = ImageReader(io.BytesIO(d["emblem_bytes"])); bw = 26
            bx, by = pcx + pr * 0.62, pcy - pr * 0.78
            c.setFillColorRGB(1, 1, 1); c.circle(bx, by, bw / 2 + 2, fill=1, stroke=0)
            c.setStrokeColorRGB(*GOLD_LT); c.setLineWidth(1.2); c.circle(bx, by, bw / 2 + 1, fill=0, stroke=1)
            c.saveState(); cp = c.beginPath(); cp.circle(bx, by, bw / 2); c.clipPath(cp, stroke=0, fill=0)
            c.drawImage(em, bx - bw / 2, by - bw / 2, width=bw, height=bw, mask="auto"); c.restoreState()
        except Exception:  # noqa: BLE001
            pass

    # name + role pill
    y = pcy - pr - 20
    name = (d.get("name") or "").upper(); size = 15.0
    while c.stringWidth(name, "Helvetica-Bold", size) > W - 22 and size > 8:
        size -= 0.5
    c.setFillColorRGB(*NAVY); c.setFont("Helvetica-Bold", size); c.drawCentredString(W / 2, y, name)
    y -= 16
    role = d.get("role") or ""
    if role:
        rw = min(c.stringWidth(role, "Helvetica-Bold", 7.5) + 22, W - 30)
        c.setFillColorRGB(*NAVY); c.setStrokeColorRGB(*GOLD_LT); c.setLineWidth(1)
        c.roundRect((W - rw) / 2, y - 4.5, rw, 14, 7, fill=1, stroke=1)
        c.setFillColorRGB(*GOLD_LT); c.setFont("Helvetica-Bold", 7.5); c.drawCentredString(W / 2, y, role)
    # values line
    y -= 13
    c.setStrokeColorRGB(*GOLD_LT); c.setLineWidth(0.5); c.line(14, y + 6, W - 14, y + 6)
    _tracked(c, W / 2, y, "PEOPLE  |  SALON  |  TECHNOLOGY  |  BETTER TOMORROW", 3.3, (0.35, 0.38, 0.45), spacing=0.9, center=True)

    # details with icons (left) + QR (right)
    y -= 14
    rows = [("user", "ID No", d.get("id_number")), ("mail", "Email", d.get("email")),
            ("phone", "Phone", d.get("phone")), ("drop", "Blood", d.get("blood_group"))]
    ry = y
    for kind, label, val in rows:
        if not val:
            continue
        _icon(c, kind, 18, ry)
        c.setStrokeColorRGB(0.85, 0.85, 0.88); c.setLineWidth(0.5); c.line(29, ry - 5, 29, ry + 5)
        c.setFillColorRGB(0.4, 0.42, 0.5); c.setFont("Helvetica", 5.6); c.drawString(33, ry - 1.8, f"{label} :")
        v = str(val); mx = (W - 14 - 38 - 10) - 58; fs = 6.4
        while c.stringWidth(v, "Helvetica-Bold", fs) > mx and fs > 4.6:
            fs -= 0.3
        c.setFillColorRGB(*INK); c.setFont("Helvetica-Bold", fs)
        c.drawString(58, ry - 1.8, v)
        ry -= 12
    if d.get("qr_url"):
        qs = 38; qx, qy = W - 14 - qs, y - 40
        c.setFillColorRGB(1, 1, 1); c.setStrokeColorRGB(*GOLD_LT); c.setLineWidth(1)
        c.roundRect(qx - 4, qy - 4, qs + 8, qs + 8, 3, fill=1, stroke=1)
        qw = QrCodeWidget(d["qr_url"], barLevel="M"); b = qw.getBounds()
        dr = Drawing(qs, qs, transform=[qs / (b[2] - b[0]), 0, 0, qs / (b[3] - b[1]), 0, 0]); dr.add(qw)
        renderPDF.draw(dr, c, qx, qy)
        _tracked(c, qx + qs / 2, qy - 11, d.get("qr_label") or "SCAN • CONNECT", 3.6, (0.35, 0.38, 0.45), spacing=1.1, center=True)

    # barcode + right-side stacked words
    bcv = (d.get("id_number") or "ID").replace(" ", "")
    bc = code128.Code128(bcv, barHeight=13, barWidth=0.5, humanReadable=False)
    bc.drawOn(c, 22, 36)
    for i, wd in enumerate(("STYLE", "CARE", "CONFIDENCE")):
        _tracked(c, W - 14, 37 - i * 5.8, wd, 3.2, (0.35, 0.38, 0.45), spacing=1.1, right=True)
    c.setStrokeColorRGB(*GOLD); c.setLineWidth(0.8); c.line(W - 26, 21, W - 14, 21)
    # website pill
    site = d.get("website") or ""
    if site:
        c.setFillColorRGB(*ROSE); c.roundRect(22, 20, W - 86, 12, 3, fill=1, stroke=0)
        s = 6.2
        while c.stringWidth(site, "Helvetica-Bold", s) > W - 106 and s > 4:
            s -= 0.4
        c.setFillColorRGB(1, 1, 1); c.setFont("Helvetica-Bold", s); c.drawCentredString(22 + (W - 86) / 2, 24, site)

    c.showPage(); c.save()
    return buf.getvalue()
