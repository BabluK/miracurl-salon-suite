"""PDF generation (reportlab): salary slips + staff-registry verification reports.
Pure functions (dict in -> bytes out). The registry PDF takes a `fetch_image`
callable so it stays decoupled from server-side SSRF-safe image fetching."""
import io
from datetime import datetime, timezone, timedelta


def _render_salary_slip_pdf(slip: dict) -> bytes:
    """Simple, clean single-page PDF salary slip using reportlab."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas
    from reportlab.lib import colors

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    left = 20 * mm
    right = w - 20 * mm
    y = h - 22 * mm

    # Header
    c.setFillColor(colors.HexColor("#0A0A0A"))
    c.rect(0, h - 32 * mm, w, 32 * mm, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#D4AF37"))
    c.setFont("Helvetica-Bold", 20)
    c.drawString(left, h - 15 * mm, slip["salon"].get("name") or "Salon")
    c.setFillColor(colors.white)
    c.setFont("Helvetica", 9)
    c.drawString(left, h - 21 * mm, slip["salon"].get("location") or "")
    if slip["salon"].get("phone"):
        c.drawString(left, h - 26 * mm, f"Phone: {slip['salon']['phone']}")
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(right, h - 15 * mm, "SALARY SLIP")
    c.setFont("Helvetica", 9)
    c.drawRightString(right, h - 21 * mm, slip["period_label"])

    # Body
    y = h - 42 * mm
    c.setFillColor(colors.HexColor("#0A0A0A"))
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left, y, "Employee details")
    y -= 8 * mm
    c.setFont("Helvetica", 10)
    rows = [
        ("Name", slip["staff"].get("name") or "-"),
        ("Role", slip["staff"].get("role") or "-"),
        ("Email", slip["staff"].get("email") or "-"),
        ("Phone", slip["staff"].get("phone") or "-"),
        ("Joining date", slip["staff"].get("joining_date") or "-"),
    ]
    for label, value in rows:
        c.setFillColor(colors.HexColor("#6b7280"))
        c.drawString(left, y, label)
        c.setFillColor(colors.HexColor("#0A0A0A"))
        c.drawString(left + 45 * mm, y, str(value))
        y -= 6 * mm

    # Attendance
    y -= 4 * mm
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left, y, "Attendance")
    y -= 8 * mm
    c.setFont("Helvetica", 10)
    att_rows = [
        ("Days present", str(slip.get("days_present") or 0)),
        ("Total hours worked", f"{slip.get('total_hours') or 0} hrs"),
    ]
    for label, value in att_rows:
        c.setFillColor(colors.HexColor("#6b7280"))
        c.drawString(left, y, label)
        c.setFillColor(colors.HexColor("#0A0A0A"))
        c.drawString(left + 45 * mm, y, value)
        y -= 6 * mm

    # Earnings table
    y -= 4 * mm
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(colors.HexColor("#0A0A0A"))
    c.drawString(left, y, "Earnings")
    y -= 8 * mm

    def line(label, amount, bold=False):
        nonlocal y
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 11 if bold else 10)
        c.setFillColor(colors.HexColor("#0A0A0A") if bold else colors.HexColor("#374151"))
        c.drawString(left, y, label)
        c.drawRightString(right, y, amount)
        y -= 7 * mm

    line("Monthly base salary", f"Rs. {slip['monthly_base_salary']:.2f}")
    pct_txt = f" ({slip['commission_pct']}%)" if slip['commission_pct'] else ""
    line(f"Service commission{pct_txt}", f"Rs. {slip['commission_amount']:.2f}")
    c.setStrokeColor(colors.HexColor("#e5e7eb"))
    c.line(left, y + 3 * mm, right, y + 3 * mm)
    line("Net payable", f"Rs. {slip['net_payable']:.2f}", bold=True)

    # Footer note
    y -= 8 * mm
    c.setFont("Helvetica-Oblique", 8)
    c.setFillColor(colors.HexColor("#6b7280"))
    c.drawString(left, y, f"Service gross for the month: Rs. {slip['service_gross']:.2f} across {slip['service_count']} service line(s).")
    y -= 5 * mm
    c.drawString(left, y, "This is a computer-generated salary slip and does not require a signature.")
    y -= 5 * mm
    c.drawString(left, y, f"Generated: {slip['generated_at'][:19].replace('T', ' ')} UTC")

    c.showPage()
    c.save()
    return buf.getvalue()


_REG_BADGE_COLORS = {
    "EXTRAORDINARY": (0.55, 0.35, 0.85), "EXCELLENT": (0.06, 0.62, 0.45),
    "GOOD": (0.02, 0.52, 0.84), "NEW": (0.45, 0.5, 0.55), "BAD": (0.86, 0.15, 0.15),
}


def _build_registry_pdf(p: dict, fetch_image) -> bytes:
    from math import sin, cos, pi
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import ImageReader, simpleSplit
    from reportlab.pdfgen import canvas as _canvas

    buf = io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    GOLD = (0.83, 0.69, 0.22)
    INK = (0.09, 0.1, 0.13)
    MUTED = (0.45, 0.47, 0.53)
    CARD = (0.965, 0.968, 0.975)
    badge_color = _REG_BADGE_COLORS.get(p["badge"], (0.4, 0.4, 0.4))

    def _star(cx, cy, r, filled):
        pts = []
        for i in range(10):
            rr = r if i % 2 == 0 else r * 0.45
            ang = -pi / 2 + i * pi / 5
            pts.append((cx + rr * cos(ang), cy + rr * sin(ang)))
        path = c.beginPath()
        path.moveTo(*pts[0])
        for pt in pts[1:]:
            path.lineTo(*pt)
        path.close()
        if filled:
            c.setFillColorRGB(0.96, 0.72, 0.15)
            c.drawPath(path, fill=1, stroke=0)
        else:
            c.setStrokeColorRGB(0.78, 0.8, 0.84)
            c.setLineWidth(0.8)
            c.drawPath(path, fill=0, stroke=1)

    def header(contd=False):
        c.setFillColorRGB(*INK)
        c.rect(0, H - 96, W, 96, fill=1, stroke=0)
        c.setFillColorRGB(*GOLD)
        c.rect(0, H - 99, W, 3, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 21)
        c.drawString(44, H - 50, "STAFF VERIFICATION REPORT" + (" (contd.)" if contd else ""))
        c.setFillColorRGB(0.72, 0.73, 0.78)
        c.setFont("Helvetica", 9)
        c.drawString(44, H - 70, "Miracurl Staff Registry  ·  cross-salon employment history & reputation")
        c.setFont("Helvetica", 8)
        c.drawRightString(W - 44, H - 70, datetime.now(timezone(timedelta(hours=5, minutes=30))).strftime("%d %b %Y"))

    header()

    # ---- Identity card ----
    top = H - 120
    nx = 44 + 28 + 84 + 22  # left pad + photo block + gap
    addr_wrap_w = W - 445  # text starts at nx + label indent; right limit = badge left edge - margin
    perm = p["permanent_address"] + (f", {p['city']}" if p["city"] else "")
    addr_lines = [("Permanent:  ", ln) for ln in simpleSplit(perm, "Helvetica", 9, addr_wrap_w)]
    if p.get("current_address"):
        addr_lines += [("Current:  ", ln) for ln in simpleSplit(p["current_address"], "Helvetica", 9, addr_wrap_w)]
    contact = f"+{p['phone']}" if p["phone"] else ""
    if p["email"]:
        contact += ("   ·   " if contact else "") + p["email"]
    contact += ("   ·   " if contact else "") + f"Aadhaar {p['aadhaar_masked']}"
    contact_lines = simpleSplit(contact, "Helvetica", 9, W - 390)
    card_h = max(150, 84 + (len(contact_lines) + len(addr_lines)) * 12 + 20)
    c.setFillColorRGB(1, 1, 1)
    c.setStrokeColorRGB(0.88, 0.89, 0.92)
    c.setLineWidth(1)
    c.roundRect(44, top - card_h, W - 88, card_h, 14, fill=1, stroke=1)

    # Circular photo (cover-cropped) or initials avatar
    pr = 42
    pcx, pcy = 44 + 28 + pr, top - card_h / 2
    drew_photo = False
    if p.get("photo_url"):
        try:
            raw = fetch_image(p["photo_url"])
            img = ImageReader(io.BytesIO(raw))
            iw, ih = img.getSize()
            scale = (2 * pr) / min(iw, ih)
            dw, dh = iw * scale, ih * scale
            c.saveState()
            clip = c.beginPath()
            clip.circle(pcx, pcy, pr)
            c.clipPath(clip, stroke=0, fill=0)
            c.drawImage(img, pcx - dw / 2, pcy - dh / 2, width=dw, height=dh, mask="auto")
            c.restoreState()
            drew_photo = True
        except Exception:
            drew_photo = False
    if not drew_photo:
        c.setFillColorRGB(0.93, 0.91, 0.99)
        c.circle(pcx, pcy, pr, stroke=0, fill=1)
        initials = "".join(w[0] for w in p["name"].split()[:2]).upper()
        c.setFillColorRGB(0.42, 0.27, 0.75)
        c.setFont("Helvetica-Bold", 26)
        c.drawCentredString(pcx, pcy - 9, initials)
    c.setStrokeColorRGB(*badge_color)
    c.setLineWidth(2.5)
    c.circle(pcx, pcy, pr + 2, stroke=1, fill=0)

    # Name + ID chip
    c.setFillColorRGB(*INK)
    c.setFont("Helvetica-Bold", 19)
    c.drawString(nx, top - 38, p["name"])
    c.setFont("Helvetica-Bold", 9)
    chip_w = c.stringWidth(p["staff_code"], "Helvetica-Bold", 9) + 16
    c.setFillColorRGB(0.94, 0.95, 0.97)
    c.roundRect(nx, top - 60, chip_w, 15, 7, fill=1, stroke=0)
    c.setFillColorRGB(0.3, 0.32, 0.38)
    c.drawString(nx + 8, top - 56, p["staff_code"])
    c.setFillColorRGB(*MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(nx + chip_w + 10, top - 56, f"Total experience: {p['total_years']} yrs")

    # Contact + address lines inside card
    c.setFont("Helvetica", 9)
    c.setFillColorRGB(*MUTED)
    yy = top - 80
    for ln in contact_lines:
        c.drawString(nx, yy, ln)
        yy -= 12
    yy -= 3
    label_prev = None
    for lbl, ln in addr_lines:
        c.setFillColorRGB(0.58, 0.6, 0.65)
        shown = lbl if lbl != label_prev else ""
        if shown:
            c.drawString(nx, yy, shown)
        label_prev = lbl
        c.setFillColorRGB(*MUTED)
        c.drawString(nx + c.stringWidth("Permanent:  ", "Helvetica", 9), yy, ln)
        yy -= 12

    # Badge pill (right side of card)
    bw, bh = 132, 62
    bx, by = W - 44 - 24 - bw, top - card_h / 2 - bh / 2
    c.setFillColorRGB(*badge_color)
    c.roundRect(bx, by, bw, bh, 12, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(bx + bw / 2, by + bh - 22, p["badge"])
    stars_cx = bx + bw / 2 - 30
    if p["avg_rating"] is not None:
        for i in range(5):
            _star(stars_cx + i * 15, by + 24, 5.6, filled=(i < round(p["avg_rating"])))
        c.setFillColorRGB(1, 1, 1)
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(bx + bw / 2, by + 8, f"{p['avg_rating']} / 5")
    else:
        c.setFont("Helvetica", 8)
        c.drawCentredString(bx + bw / 2, by + 16, "Not yet rated")

    y = top - card_h - 34

    # ---- Employment history ----
    c.setFillColorRGB(*INK)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(44, y, "Employment History")
    c.setFillColorRGB(*GOLD)
    c.rect(44, y - 7, 34, 2.5, fill=1, stroke=0)
    y -= 26

    if not p["employments"]:
        c.setFont("Helvetica", 10)
        c.setFillColorRGB(*MUTED)
        c.drawString(44, y, "No employment records yet.")
        y -= 20

    for e in p["employments"]:
        comment_lines = simpleSplit(f"\u201C{e['comment']}\u201D", "Helvetica-Oblique", 9, W - 160) if e.get("comment") else []
        extras = []
        if e.get("reason_for_leaving"):
            extras.append(e["reason_for_leaving"])
        if e.get("skills"):
            extras.append("Skills: " + ", ".join(e["skills"]))
        eh = 58 + (12 if extras else 0) + len(comment_lines) * 12
        if y - eh < 80:
            c.showPage()
            header(contd=True)
            y = H - 130
        # card
        c.setFillColorRGB(*CARD)
        c.setStrokeColorRGB(0.9, 0.9, 0.93)
        c.roundRect(44, y - eh, W - 88, eh, 10, fill=1, stroke=1)
        c.setFillColorRGB(*badge_color)
        c.roundRect(44, y - eh, 4, eh, 2, fill=1, stroke=0)
        tx, ty = 62, y - 20
        c.setFillColorRGB(*INK)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(tx, ty, f"{e.get('salon_name', 'Salon')}  —  {e.get('designation', '')}")
        if e.get("rating"):
            for i in range(5):
                _star(W - 150 + i * 14, ty + 3, 5, filled=(i < round(float(e["rating"]))))
            c.setFillColorRGB(*MUTED)
            c.setFont("Helvetica", 8)
            c.drawString(W - 150 + 5 * 14 + 6, ty, f"{e['rating']}/5")
        c.setFillColorRGB(*MUTED)
        c.setFont("Helvetica", 9)
        c.drawString(tx, ty - 15, f"{e['from_date']}  \u2192  {e['to_date'] or 'Present'}    ·    {e.get('years', 0)} yrs")
        yy = ty - 27
        if extras:
            c.drawString(tx, yy, "   ·   ".join(extras))
            yy -= 12
        c.setFillColorRGB(0.3, 0.32, 0.38)
        c.setFont("Helvetica-Oblique", 9)
        for line in comment_lines:
            c.drawString(tx, yy, line)
            yy -= 12
        y -= eh + 12

    # Footer
    c.setStrokeColorRGB(0.88, 0.89, 0.92)
    c.setLineWidth(0.8)
    c.line(44, 52, W - 44, 52)
    c.setFont("Helvetica", 7.5)
    c.setFillColorRGB(0.55, 0.56, 0.61)
    c.drawString(44, 40, f"Generated on {datetime.now(timezone(timedelta(hours=5, minutes=30))).strftime('%d %b %Y, %I:%M %p')} IST  ·  Miracurl Staff Registry")
    c.drawString(44, 30, "Badge is auto-computed from verified service duration and salon-owner ratings. Aadhaar is never stored or shown in full. For reference only.")
    c.save()
    return buf.getvalue()
