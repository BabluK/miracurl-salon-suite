"""PDF generation (reportlab): salary slips + staff-registry verification reports.
Pure functions (dict in -> bytes out). The registry PDF takes a `fetch_image`
callable so it stays decoupled from server-side SSRF-safe image fetching."""
import io
from datetime import datetime, timezone, timedelta

from receipt_email import _pay_label


def _render_invoice_pdf(inv: dict, tenant: dict) -> bytes:
    """A5 receipt PDF for printing / sharing."""
    from reportlab.lib.pagesizes import A5
    from reportlab.lib.utils import simpleSplit
    from reportlab.pdfgen import canvas as _canvas

    buf = io.BytesIO()
    W, H = A5
    c = _canvas.Canvas(buf, pagesize=A5)
    INK = (0.09, 0.1, 0.13)
    MUTED = (0.45, 0.47, 0.52)
    LEFT, RIGHT = 30, W - 30
    y = H - 40

    c.setFillColorRGB(*INK)
    c.setFont("Helvetica-Bold", 15)
    c.drawCentredString(W / 2, y, tenant.get("name") or "Salon")
    y -= 14
    c.setFillColorRGB(*MUTED)
    c.setFont("Helvetica", 8)
    for ln in simpleSplit(tenant.get("location") or "", "Helvetica", 8, RIGHT - LEFT):
        c.drawCentredString(W / 2, y, ln)
        y -= 10
    if tenant.get("phone"):
        c.drawCentredString(W / 2, y, f"Ph: {tenant['phone']}")
        y -= 10
    if tenant.get("tax_enabled") and tenant.get("gst_number"):
        c.drawCentredString(W / 2, y, f"GSTIN: {tenant['gst_number']}")
        y -= 10
    y -= 4
    c.setStrokeColorRGB(0.8, 0.8, 0.85)
    c.setDash(2, 2)
    c.line(LEFT, y, RIGHT, y)
    c.setDash()
    y -= 16

    c.setFont("Helvetica", 9)
    created = str(inv.get("created_at") or "")[:16].replace("T", " ")
    for label, val in (("Invoice", inv.get("invoice_no")), ("Date", created),
                       ("Customer", inv.get("customer_name")), ("Payment", _pay_label(inv.get("payment_mode")))):
        if val:
            c.setFillColorRGB(*MUTED)
            c.drawString(LEFT, y, label)
            c.setFillColorRGB(*INK)
            c.drawRightString(RIGHT, y, str(val))
            y -= 13
    y -= 6
    c.line(LEFT, y, RIGHT, y)
    y -= 15

    for it in inv.get("items", []):
        name = f"{it.get('name')} x {it.get('qty', 1)}"
        amt = f"Rs {(it.get('qty', 1) * it.get('price', 0)):,.2f}"
        c.setFont("Helvetica", 9)
        c.setFillColorRGB(*INK)
        lines = simpleSplit(name, "Helvetica", 9, RIGHT - LEFT - 70)
        c.drawString(LEFT, y, lines[0])
        c.drawRightString(RIGHT, y, amt)
        y -= 12
        for extra in lines[1:]:
            c.drawString(LEFT, y, extra)
            y -= 12
        if it.get("staff_name"):
            c.setFillColorRGB(*MUTED)
            c.setFont("Helvetica-Oblique", 7.5)
            c.drawString(LEFT + 6, y, f"by {it['staff_name']}")
            y -= 11
        if y < 130:
            c.showPage()
            y = H - 50
    y -= 4
    c.setStrokeColorRGB(0.8, 0.8, 0.85)
    c.line(LEFT, y, RIGHT, y)
    y -= 15

    rows = [("Subtotal", inv.get("subtotal")),
            ("Discount", -(inv.get("discount") or 0) if inv.get("discount") else None),
            ("GST", inv.get("tax") if inv.get("tax") else None)]
    c.setFont("Helvetica", 9)
    for label, val in rows:
        if val is None:
            continue
        c.setFillColorRGB(*MUTED)
        c.drawString(LEFT, y, label)
        c.setFillColorRGB(*INK)
        c.drawRightString(RIGHT, y, f"Rs {val:,.2f}")
        y -= 13
    y -= 4
    c.setFont("Helvetica-Bold", 13)
    c.setFillColorRGB(*INK)
    c.drawString(LEFT, y, "Total")
    c.drawRightString(RIGHT, y, f"Rs {(inv.get('total') or 0):,.2f}")
    y -= 20
    if inv.get("points_earned"):
        c.setFont("Helvetica", 8)
        c.setFillColorRGB(0.1, 0.5, 0.3)
        c.drawCentredString(W / 2, y, f"You earned {inv['points_earned']} loyalty points on this visit!")
        y -= 14
    c.setFillColorRGB(*MUTED)
    c.setFont("Helvetica-Oblique", 8)
    c.drawCentredString(W / 2, y, "Thank you for visiting - see you again soon")
    c.showPage()
    c.save()
    return buf.getvalue()


def _render_resume_pdf(r: dict, fetch_image) -> bytes:
    """Professional staff resume: circular photo top-right, role paragraphs,
    employment history with verification phones, achievements & regards footer."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import ImageReader, simpleSplit
    from reportlab.pdfgen import canvas as _canvas

    buf = io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    INK = (0.09, 0.1, 0.13)
    MUTED = (0.42, 0.44, 0.5)
    GOLD = (0.72, 0.55, 0.14)
    LEFT, RIGHT = 46, W - 46
    y = H - 56

    def ensure(space):
        nonlocal y
        if y < 56 + space:
            c.showPage()
            y = H - 56

    def heading(txt):
        nonlocal y
        ensure(34)
        y -= 10
        c.setFillColorRGB(*GOLD)
        c.rect(LEFT, y - 3, 3, 13, fill=1, stroke=0)
        c.setFillColorRGB(*INK)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(LEFT + 10, y, txt.upper())
        y -= 8
        c.setStrokeColorRGB(0.88, 0.89, 0.92)
        c.setLineWidth(0.8)
        c.line(LEFT, y, RIGHT, y)
        y -= 16

    def para(txt, size=10, leading=14, color=INK, font="Helvetica", indent=0, max_w=None):
        nonlocal y
        if not txt:
            return
        c.setFont(font, size)
        c.setFillColorRGB(*color)
        for ln in simpleSplit(str(txt), font, size, (max_w or (RIGHT - LEFT)) - indent):
            ensure(leading)
            c.setFont(font, size)
            c.setFillColorRGB(*color)
            c.drawString(LEFT + indent, y, ln)
            y -= leading

    def labeled(label, value):
        nonlocal y
        if not value:
            return
        ensure(15)
        c.setFont("Helvetica", 9.5)
        c.setFillColorRGB(*MUTED)
        c.drawString(LEFT, y, label)
        c.setFillColorRGB(*INK)
        c.setFont("Helvetica", 10)
        for i, ln in enumerate(simpleSplit(str(value), "Helvetica", 10, RIGHT - LEFT - 130)):
            if i:
                ensure(13)
            c.drawString(LEFT + 130, y, ln)
            y -= 13
        y -= 2

    # ---- Header: name/contact left, circular photo right ----
    pr = 44
    pcx, pcy = W - 46 - pr, H - 56 - pr
    drew = False
    if r.get("photo_url"):
        try:
            raw = fetch_image(r["photo_url"])
            img = ImageReader(io.BytesIO(raw))
            iw, ih = img.getSize()
            scale = (2 * pr) / min(iw, ih)
            c.saveState()
            clip = c.beginPath()
            clip.circle(pcx, pcy, pr)
            c.clipPath(clip, stroke=0, fill=0)
            c.drawImage(img, pcx - iw * scale / 2, pcy - ih * scale / 2, width=iw * scale, height=ih * scale, mask="auto")
            c.restoreState()
            drew = True
        except Exception:
            drew = False
    if not drew:
        c.setFillColorRGB(0.95, 0.93, 0.88)
        c.circle(pcx, pcy, pr, stroke=0, fill=1)
        initials = "".join(w[0] for w in (r.get("name") or "S").split()[:2]).upper()
        c.setFillColorRGB(*GOLD)
        c.setFont("Helvetica-Bold", 28)
        c.drawCentredString(pcx, pcy - 10, initials)
    c.setStrokeColorRGB(*GOLD)
    c.setLineWidth(2.2)
    c.circle(pcx, pcy, pr + 2.5, stroke=1, fill=0)

    text_w = W - 46 - (2 * pr) - 70 - LEFT  # keep clear of the photo
    c.setFillColorRGB(*INK)
    c.setFont("Helvetica-Bold", 24)
    c.drawString(LEFT, y, r.get("name") or "Your Name")
    y -= 18
    desigs = " · ".join(r.get("designations") or [])
    if desigs:
        c.setFillColorRGB(*GOLD)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(LEFT, y, desigs)
        y -= 15
    exp = str(r.get("total_experience_years") or "").strip()
    if exp:
        c.setFillColorRGB(*MUTED)
        c.setFont("Helvetica", 10)
        c.drawString(LEFT, y, f"Total experience: {exp} year(s)")
        y -= 14
    contact = "   ·   ".join(x for x in [r.get("phone"), r.get("email")] if x)
    if contact:
        c.setFillColorRGB(*MUTED)
        c.setFont("Helvetica", 9.5)
        for ln in simpleSplit(contact, "Helvetica", 9.5, text_w):
            c.drawString(LEFT, y, ln)
            y -= 12
    for label, addr in (("Current address:  ", r.get("current_address")), ("Permanent address:  ", r.get("permanent_address"))):
        if addr:
            c.setFont("Helvetica", 9)
            c.setFillColorRGB(*MUTED)
            for ln in simpleSplit(label + addr, "Helvetica", 9, text_w):
                c.drawString(LEFT, y, ln)
                y -= 11.5
    y = min(y, pcy - pr - 18)
    c.setStrokeColorRGB(*GOLD)
    c.setLineWidth(1.4)
    c.line(LEFT, y, RIGHT, y)
    y -= 8

    # ---- Roles & responsibilities ----
    resp = r.get("responsibilities") or {}
    active = [d for d in (r.get("designations") or []) if (resp.get(d) or "").strip()]
    if active:
        heading("Roles & Responsibilities")
        for d in active:
            ensure(30)
            c.setFillColorRGB(*INK)
            c.setFont("Helvetica-Bold", 10.5)
            c.drawString(LEFT, y, d)
            y -= 14
            para(resp[d], size=9.8, leading=13, color=(0.25, 0.27, 0.32), indent=0)
            y -= 8

    # ---- Current employment ----
    if r.get("current_salon"):
        heading("Current Employment")
        labeled("Salon / Company", r.get("current_salon"))
        labeled("Currently working", "Yes" if r.get("currently_working", True) else "No")
        labeled("Salon phone (verify)", r.get("salon_phone"))
        labeled("Address", r.get("salon_address"))
        y -= 4

    # ---- Previous experience ----
    past = [p for p in (r.get("past_jobs") or []) if (p.get("salon_name") or "").strip()]
    if past:
        heading("Previous Experience")
        for p in past:
            ensure(40)
            c.setFillColorRGB(*INK)
            c.setFont("Helvetica-Bold", 10.5)
            c.drawString(LEFT, y, p["salon_name"])
            period = " – ".join(x for x in [p.get("from_date"), p.get("to_date")] if x)
            if period:
                c.setFillColorRGB(*MUTED)
                c.setFont("Helvetica", 9.5)
                c.drawRightString(RIGHT, y, period)
            y -= 13
            sub = "   ·   ".join(x for x in [p.get("phone") and f"Phone (verify): {p['phone']}", p.get("address")] if x)
            if sub:
                para(sub, size=9, leading=12, color=MUTED)
            y -= 6

    # ---- Achievements / hobbies / awards ----
    for title, key in (("Achievements", "achievements"), ("Hobbies", "hobbies"), ("Awards & Appreciation", "awards")):
        val = (r.get(key) or "").strip()
        if val:
            heading(title)
            para(val, size=9.8, leading=13, color=(0.25, 0.27, 0.32))
            y -= 4

    # ---- Regards footer ----
    ensure(56)
    y -= 14
    c.setStrokeColorRGB(0.88, 0.89, 0.92)
    c.setLineWidth(0.8)
    c.line(LEFT, y, RIGHT, y)
    y -= 18
    c.setFillColorRGB(*MUTED)
    c.setFont("Helvetica-Oblique", 10)
    c.drawString(LEFT, y, "Regards,")
    y -= 14
    c.setFillColorRGB(*INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(LEFT, y, r.get("name") or "")
    if r.get("phone"):
        c.setFillColorRGB(*MUTED)
        c.setFont("Helvetica", 10)
        c.drawString(LEFT + 4 + c.stringWidth(r.get("name") or "", "Helvetica-Bold", 11) + 6, y, f"·  {r['phone']}")

    c.showPage()
    c.save()
    return buf.getvalue()



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
    if slip.get("product_commission_amount"):
        line(f"Product sales commission ({slip.get('product_commission_pct', 2)}% of Rs. {slip.get('product_gross', 0):.0f})",
             f"Rs. {slip['product_commission_amount']:.2f}")
    if slip.get("overtime_total"):
        line(f"Overtime ({slip.get('overtime_hours_total', 0)}h past shift end)", f"Rs. {slip['overtime_total']:.2f}")
    if slip.get("late_penalty_total") or slip.get("advance_total"):
        y -= 2 * mm
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(colors.HexColor("#0A0A0A"))
        c.drawString(left, y, "Deductions")
        y -= 8 * mm
        if slip.get("late_penalty_total"):
            line(f"Late-arrival fines ({slip.get('late_days', 0)} day(s))", f"- Rs. {slip['late_penalty_total']:.2f}")
        if slip.get("advance_total"):
            line("Salary advance taken", f"- Rs. {slip['advance_total']:.2f}")
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


def _render_id_card_pdf(d: dict) -> bytes:
    """Portrait employee ID card (navy + orange badge design). Expects resolved
    photo_bytes / logo_bytes so it stays free of network concerns."""
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas as _canvas
    from reportlab.graphics.barcode import code128

    W, H = 180, 288
    buf = io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=(W, H))
    NAVY = (0.08, 0.12, 0.30)
    ORANGE = (0.96, 0.62, 0.10)
    INK = (0.15, 0.17, 0.22)

    c.setFillColorRGB(1, 1, 1)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    # Navy header with a diagonal bottom edge
    p = c.beginPath()
    p.moveTo(0, H); p.lineTo(W, H); p.lineTo(W, H - 100); p.lineTo(0, H - 62); p.close()
    c.setFillColorRGB(*NAVY)
    c.drawPath(p, fill=1, stroke=0)
    # Orange stripes parallel to the diagonal
    p = c.beginPath()
    p.moveTo(0, H - 66); p.lineTo(84, H - 84); p.lineTo(84, H - 90); p.lineTo(0, H - 72); p.close()
    c.setFillColorRGB(*ORANGE)
    c.drawPath(p, fill=1, stroke=0)
    p = c.beginPath()
    p.moveTo(W, H - 104); p.lineTo(W - 60, H - 88); p.lineTo(W - 60, H - 82); p.lineTo(W, H - 98); p.close()
    c.drawPath(p, fill=1, stroke=0)
    # White slashes top-left + hole punch
    c.setStrokeColorRGB(1, 1, 1)
    c.setLineWidth(1.4)
    c.line(6, H - 4, 40, H - 20)
    c.line(2, H - 12, 26, H - 23)
    c.setFillColorRGB(0.25, 0.28, 0.36)
    c.circle(W / 2, H - 10, 3.6, fill=1, stroke=0)

    # Logo + brand name centered in the navy band
    brand = (d.get("brand_name") or "").upper()
    bsize = 9.0
    while brand and c.stringWidth(brand, "Helvetica-Bold", bsize) > W - 60 and bsize > 5.5:
        bsize -= 0.5
    bw = c.stringWidth(brand, "Helvetica-Bold", bsize) if brand else 0
    logo_img = None
    if d.get("logo_bytes"):
        try:
            logo_img = ImageReader(io.BytesIO(d["logo_bytes"]))
        except Exception:
            logo_img = None
    lw = 18 if logo_img else 0
    x0 = (W - (lw + (5 if logo_img and brand else 0) + bw)) / 2
    ly = H - 46
    if logo_img:
        iw, ih = logo_img.getSize()
        sc = 18.0 / max(iw, ih)
        c.drawImage(logo_img, x0, ly - 5, width=iw * sc, height=ih * sc, mask="auto")
        x0 += lw + 5
    if brand:
        c.setFillColorRGB(1, 1, 1)
        c.setFont("Helvetica-Bold", bsize)
        c.drawString(x0, ly, brand)

    # Circular photo with orange ring (overlapping the diagonal)
    pr = 30
    pcx, pcy = W / 2, H - 118.0
    c.setFillColorRGB(1, 1, 1)
    c.circle(pcx, pcy, pr + 4, fill=1, stroke=0)
    c.setStrokeColorRGB(*ORANGE)
    c.setLineWidth(3)
    c.circle(pcx, pcy, pr + 2, fill=0, stroke=1)
    drew = False
    if d.get("photo_bytes"):
        try:
            img = ImageReader(io.BytesIO(d["photo_bytes"]))
            iw, ih = img.getSize()
            sc = (2.0 * pr) / min(iw, ih)
            c.saveState()
            clip = c.beginPath()
            clip.circle(pcx, pcy, pr)
            c.clipPath(clip, stroke=0, fill=0)
            c.drawImage(img, pcx - iw * sc / 2, pcy - ih * sc / 2, width=iw * sc, height=ih * sc, mask="auto")
            c.restoreState()
            drew = True
        except Exception:
            drew = False
    if not drew:
        c.setFillColorRGB(0.90, 0.92, 0.97)
        c.circle(pcx, pcy, pr, fill=1, stroke=0)
        initials = "".join(w[0] for w in (d.get("name") or "?").split()[:2]).upper()
        c.setFillColorRGB(*NAVY)
        c.setFont("Helvetica-Bold", 20)
        c.drawCentredString(pcx, pcy - 7, initials)

    # Name
    y = pcy - pr - 18
    name = (d.get("name") or "").upper()
    size = 14.0
    while c.stringWidth(name, "Helvetica-Bold", size) > W - 20 and size > 8:
        size -= 0.5
    c.setFillColorRGB(*NAVY)
    c.setFont("Helvetica-Bold", size)
    c.drawCentredString(W / 2, y, name)

    # Role pill
    y -= 15
    role = d.get("role") or ""
    if role:
        rw = min(c.stringWidth(role, "Helvetica-Bold", 7.5) + 18, W - 24)
        c.setFillColorRGB(*NAVY)
        c.roundRect((W - rw) / 2, y - 4, rw, 13, 6.5, fill=1, stroke=0)
        c.setFillColorRGB(0.99, 0.78, 0.18)
        c.setFont("Helvetica-Bold", 7.5)
        c.drawCentredString(W / 2, y, role)

    # Detail lines
    y -= 15
    c.setFont("Helvetica", 7.5)
    for label, val in (("ID No", d.get("id_number")), ("Email", d.get("email")),
                       ("Phone", d.get("phone")), ("Blood", d.get("blood_group"))):
        if not val:
            continue
        c.setFillColorRGB(*INK)
        c.drawCentredString(W / 2, y, f"{label} : {val}")
        y -= 10.5

    # Barcode of the ID number (+ optional verification QR on the right)
    qr_url = d.get("qr_url") or ""
    bcv = (d.get("id_number") or "ID").replace(" ", "")
    max_bw = (W - 72) if qr_url else (W - 44)
    bc = code128.Code128(bcv, barHeight=14, barWidth=0.55, humanReadable=False)
    if bc.width > max_bw:
        bc = code128.Code128(bcv, barHeight=14, barWidth=0.55 * max_bw / bc.width, humanReadable=False)
    if qr_url:
        from reportlab.graphics.barcode.qr import QrCodeWidget
        from reportlab.graphics.shapes import Drawing
        from reportlab.graphics import renderPDF
        bc.drawOn(c, 16 + (max_bw - bc.width) / 2, 40)
        qsize = 36
        qw = QrCodeWidget(qr_url, barLevel="M")
        b = qw.getBounds()
        dr = Drawing(qsize, qsize, transform=[qsize / (b[2] - b[0]), 0, 0, qsize / (b[3] - b[1]), 0, 0])
        dr.add(qw)
        renderPDF.draw(dr, c, W - 52, 32)
        c.setFillColorRGB(*INK)
        c.setFont("Helvetica", 4.2)
        c.drawCentredString(W - 34, 29.5, "SCAN TO VERIFY")
    else:
        bc.drawOn(c, (W - bc.width) / 2, 34)

    # Website strip
    site = d.get("website") or ""
    if site:
        sw = W - 44
        c.setFillColorRGB(*ORANGE)
        c.roundRect(22, 14, sw, 14, 3, fill=1, stroke=0)
        s = 7.0
        while c.stringWidth(site, "Helvetica-Bold", s) > sw - 10 and s > 4.5:
            s -= 0.5
        c.setFillColorRGB(*NAVY)
        c.setFont("Helvetica-Bold", s)
        c.drawCentredString(W / 2, 18.5, site)

    # Bottom corner accents
    for pts, col in ((((0, 0), (24, 0), (0, 20)), NAVY),
                     (((12, 0), (34, 0), (30, 12)), ORANGE),
                     (((W, 0), (W - 22, 0), (W, 16)), ORANGE)):
        p = c.beginPath()
        p.moveTo(*pts[0]); p.lineTo(*pts[1]); p.lineTo(*pts[2]); p.close()
        c.setFillColorRGB(*col)
        c.drawPath(p, fill=1, stroke=0)

    c.showPage()
    c.save()
    return buf.getvalue()
