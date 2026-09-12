"""PDF generation (reportlab): salary slips + staff-registry verification reports.
Pure functions (dict in -> bytes out). The registry PDF takes a `fetch_image`
callable so it stays decoupled from server-side SSRF-safe image fetching."""
import io
import os
import base64
from datetime import datetime, timezone, timedelta

from utils import _pay_label

_SCREENS_TOUR_PDF = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "miracurl-screens-tour.pdf")


def screens_tour_attachment() -> dict | None:
    """The miracurl-screens-tour.pdf brochure as a Resend email attachment payload."""
    try:
        with open(_SCREENS_TOUR_PDF, "rb") as f:
            return {"filename": "miracurl-screens-tour.pdf",
                    "content": base64.b64encode(f.read()).decode()}
    except Exception:
        return None


def _render_invoice_pdf(inv: dict, tenant: dict, assets: dict | None = None) -> bytes:
    """Polished A4 GST-ready guest invoice: salon logo + GSTIN, itemised table, CGST/SGST split, Miracurl footer."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.utils import simpleSplit
    from reportlab.pdfgen import canvas as _canvas
    from services.pdf_brand import GOLD, GREY, INK, LIGHT, draw_logo, draw_powered_footer, draw_watermark
    from services.subscription_invoice import amount_in_words

    assets = assets or {}
    buf = io.BytesIO()
    W, H = A4
    c = _canvas.Canvas(buf, pagesize=A4)
    L, R = 16 * mm, W - 16 * mm
    cur = tenant.get("currency") or "INR"
    sym = {"INR": "Rs. ", "USD": "$", "EUR": "EUR ", "GBP": "GBP ", "AED": "AED "}.get(cur, cur + " ")
    money = lambda v: f"{sym}{float(v or 0):,.2f}"
    gst_on = bool(tenant.get("tax_enabled") and tenant.get("gst_number"))
    tax = float(inv.get("tax") or 0)
    created = str(inv.get("created_at") or "")
    try:
        from datetime import timedelta as _td
        dt = datetime.fromisoformat(created.replace("Z", "+00:00")).astimezone(timezone(_td(hours=5, minutes=30)))
        date_txt = dt.strftime("%d %b %Y, %I:%M %p")
    except Exception:
        date_txt = created[:16].replace("T", " ")

    draw_watermark(c, assets.get("brand_logo"), W, H, 110 * mm)
    # ---- Salon header (white, salon-branded) ----
    y = H - 18 * mm
    x = L
    if draw_logo(c, assets.get("salon_logo"), L, y - 22 * mm, 26 * mm, 24 * mm):
        x = L + 30 * mm
    c.setFillColorRGB(*INK)
    name_sz, name_txt, name_w = 20, tenant.get("name") or "Salon", (W / 2 + 30 * mm) - x
    while c.stringWidth(name_txt, "Helvetica-Bold", name_sz) > name_w and name_sz > 11:
        name_sz -= 1
    c.setFont("Helvetica-Bold", name_sz)
    c.drawString(x, y - 6 * mm, name_txt)
    c.setFillColorRGB(*GREY)
    c.setFont("Helvetica", 9)
    yy = y - 11.5 * mm
    for ln in simpleSplit(tenant.get("location") or "", "Helvetica", 9, 95 * mm)[:2]:
        c.drawString(x, yy, ln)
        yy -= 4.5 * mm
    contact = "  ·  ".join(v for v in (tenant.get("phone") and f"Ph: {tenant['phone']}", tenant.get("owner_email") or tenant.get("notify_email")) if v)
    if contact:
        c.drawString(x, yy, contact)
        yy -= 4.5 * mm
    if gst_on:
        c.setFillColorRGB(*INK)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(x, yy, f"GSTIN: {tenant['gst_number']}")
    # title block right
    c.setFillColorRGB(*INK)
    c.setFont("Helvetica-Bold", 22)
    c.drawRightString(R, y - 6 * mm, "TAX INVOICE" if gst_on else "INVOICE")
    c.setFillColorRGB(*GOLD)
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(R, y - 12.5 * mm, f"No. {inv.get('invoice_no') or inv.get('id', '')[:8]}")
    c.setFillColorRGB(*GREY)
    c.setFont("Helvetica", 9)
    c.drawRightString(R, y - 17.5 * mm, date_txt)
    if inv.get("branch_name"):
        c.drawRightString(R, y - 22.5 * mm, f"Branch: {inv['branch_name']}")
    c.setFillColorRGB(0.13, 0.6, 0.35) if inv.get("paid", True) else c.setFillColorRGB(0.8, 0.3, 0.2)
    c.setFont("Helvetica-Bold", 9)
    c.drawRightString(R, y - 28 * mm, "PAID" if inv.get("paid", True) else "UNPAID")
    y -= 34 * mm
    c.setStrokeColorRGB(*GOLD)
    c.setLineWidth(1)
    c.line(L, y, R, y)
    y -= 9 * mm

    # ---- Billed to + payment ----
    c.setFillColorRGB(*GOLD)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(L, y, "BILLED TO")
    c.drawString(W / 2 + 6 * mm, y, "PAYMENT")
    y -= 5.5 * mm
    c.setFillColorRGB(*INK)
    c.setFont("Helvetica-Bold", 10.5)
    c.drawString(L, y, inv.get("customer_name") or "Guest")
    c.setFont("Helvetica", 9.5)
    c.drawString(W / 2 + 6 * mm, y, f"{_pay_label(inv.get('payment_mode'))}" + (f"  ·  {inv['payment_ref']}" if inv.get("payment_ref") else ""))
    y -= 5 * mm
    c.setFillColorRGB(*GREY)
    c.setFont("Helvetica", 9)
    cust = assets.get("customer") or {}
    for ln in [v for v in (cust.get("phone"), cust.get("email"), cust.get("gstin") and f"GSTIN: {cust['gstin']}") if v][:3]:
        c.drawString(L, y, str(ln))
        y -= 4.5 * mm
    if inv.get("staff_name"):
        c.drawString(W / 2 + 6 * mm, y + 4.5 * mm * min(3, len([v for v in (cust.get("phone"), cust.get("email")) if v])), f"Served by {inv['staff_name']}")
    y -= 6 * mm

    # ---- Items table ----
    cols = {"desc": L + 2 * mm, "sac": L + 90 * mm, "qty": L + 104 * mm, "rate": L + 126 * mm, "amt": R - 2 * mm}
    def table_head():
        nonlocal y
        c.setFillColorRGB(*INK)
        c.rect(L, y - 2.5 * mm, R - L, 8 * mm, stroke=0, fill=1)
        c.setFillColorRGB(*GOLD)
        c.setFont("Helvetica-Bold", 8.3)
        c.drawString(cols["desc"], y, "DESCRIPTION")
        c.drawString(cols["sac"], y, "HSN/SAC")
        c.drawRightString(cols["qty"] + 8 * mm, y, "QTY")
        c.drawRightString(cols["rate"] + 14 * mm, y, "RATE")
        c.drawRightString(cols["amt"], y, "AMOUNT")
        y -= 9.5 * mm
    table_head()
    for i, it in enumerate(inv.get("items", [])):
        if y < 75 * mm:
            c.showPage()
            draw_watermark(c, assets.get("brand_logo"), W, H, 110 * mm)
            y = H - 25 * mm
            table_head()
        if i % 2 == 1:
            c.setFillColorRGB(*LIGHT)
            c.rect(L, y - 3 * mm, R - L, 9.5 * mm, stroke=0, fill=1)
        qty = int(it.get("qty") or 1)
        price = float(it.get("price") or 0)
        c.setFillColorRGB(*INK)
        c.setFont("Helvetica", 9.5)
        lines = simpleSplit(str(it.get("name") or ""), "Helvetica", 9.5, 84 * mm)
        c.drawString(cols["desc"], y, lines[0])
        c.setFillColorRGB(*GREY)
        c.setFont("Helvetica", 8.5)
        c.drawString(cols["sac"], y, "999721" if it.get("type") in ("service", "package", "membership", "package_redeem") else "—" if it.get("type") == "gift_card" else "3305")
        c.setFillColorRGB(*INK)
        c.setFont("Helvetica", 9.5)
        c.drawRightString(cols["qty"] + 8 * mm, y, str(qty))
        c.drawRightString(cols["rate"] + 14 * mm, y, money(price))
        c.drawRightString(cols["amt"], y, money(qty * price))
        y -= 4.5 * mm
        sub = " · ".join(v for v in (lines[1] if len(lines) > 1 else "", it.get("staff_name") and f"by {it['staff_name']}") if v)
        if sub:
            c.setFillColorRGB(*GREY)
            c.setFont("Helvetica-Oblique", 7.8)
            c.drawString(cols["desc"], y, sub)
        y -= 5.5 * mm
    c.setStrokeColorRGB(0.85, 0.85, 0.85)
    c.setLineWidth(0.5)
    c.line(L, y + 1 * mm, R, y + 1 * mm)
    y -= 6 * mm

    # ---- Totals ----
    def row(label, val, bold=False, color=INK):
        nonlocal y
        c.setFillColorRGB(*color)
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 11 if bold else 9.2)
        c.drawRightString(R - 48 * mm, y, label)
        c.drawRightString(R - 2 * mm, y, val)
        y -= 5.8 * mm
    row("Subtotal", money(inv.get("subtotal")))
    if float(inv.get("discount") or 0):
        row("Discount", "- " + money(inv.get("discount")))
    if tax > 0:
        pct = float(tenant.get("tax_pct") or 0)
        if gst_on:
            half = round(tax / 2, 2)
            row(f"CGST @ {pct / 2:g}%", money(half))
            row(f"SGST @ {pct / 2:g}%", money(tax - half))
        else:
            row(f"Tax @ {pct:g}%" if pct else "Tax", money(tax))
    elif gst_on:
        row("GST", "Nil")
    if float(inv.get("wallet_applied") or 0):
        row("Paid from wallet", "- " + money(inv.get("wallet_applied")), color=(0.13, 0.6, 0.35))
    c.setFillColorRGB(*LIGHT)
    c.rect(R - 96 * mm, y - 2.5 * mm, 96 * mm, 7.5 * mm, stroke=0, fill=1)
    row("TOTAL", money(inv.get("total")), bold=True)
    if float(inv.get("tip") or 0):
        tip_for = f" for {inv['tip_staff_name']}" if inv.get("tip_staff_name") else ""
        row(f"Tip{tip_for}", money(inv.get("tip")), color=GREY)
        row("Total incl. tip", money(float(inv.get("total") or 0) + float(inv.get("tip") or 0)), bold=True)
    y -= 1 * mm
    c.setFillColorRGB(*GREY)
    c.setFont("Helvetica-Oblique", 8.3)
    c.drawRightString(R - 2 * mm, y, f"In words: {amount_in_words(float(inv.get('total') or 0), cur)}")
    y -= 12 * mm
    if inv.get("points_earned"):
        c.setFillColorRGB(0.13, 0.6, 0.35)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(L, y, f"You earned {inv['points_earned']} loyalty points on this visit!")
        y -= 6 * mm
    c.setFillColorRGB(*INK)
    c.setFont("Helvetica", 9.5)
    c.drawString(L, y, tenant.get("invoice_footer") or "Thank you for visiting - we look forward to seeing you again soon.")
    y -= 14 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawRightString(R, max(y, 50 * mm), f"For {tenant.get('name') or 'Salon'}")
    c.setFont("Helvetica", 8.5)
    c.drawRightString(R, max(y, 50 * mm) - 5 * mm, "Authorised Signatory")
    notes = ["Goods once sold are not returnable. Services are non-refundable once rendered."]
    if gst_on:
        notes.append("SAC 999721 - Beauty & physical well-being services  ·  HSN 3305 - Hair-care products  ·  GST charged as per applicable rates.")
    draw_powered_footer(c, W, mm, assets.get("brand_logo"), notes + ["Book online, view bills and rewards at miracurl-suite.com"])
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



def _fetch_logo_image(url: str = None, raw: bytes = None):
    """Logo as PIL images: (header version on dark, faded watermark on white). Best-effort."""
    try:
        from PIL import Image
        if raw is None:
            import requests
            if not (url or "").startswith("http"):
                return None, None
            r = requests.get(url, timeout=8)
            r.raise_for_status()
            raw = r.content
        img = Image.open(io.BytesIO(raw)).convert("RGBA")
        dark = Image.new("RGBA", img.size, (10, 10, 10, 255))
        header = Image.alpha_composite(dark, img).convert("RGB")
        wm = img.copy()
        wm.putalpha(wm.getchannel("A").point(lambda a: int(a * 0.06)))
        white = Image.new("RGBA", img.size, (255, 255, 255, 255))
        watermark = Image.alpha_composite(white, wm).convert("RGB")
        return header, watermark
    except Exception:  # noqa: BLE001 — slip must render without a logo too
        return None, None


def _render_salary_slip_pdf(slip: dict) -> bytes:
    """Simple, clean single-page PDF salary slip using reportlab."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas
    from reportlab.lib import colors
    from reportlab.lib.utils import ImageReader

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    left = 20 * mm
    right = w - 20 * mm
    y = h - 22 * mm

    logo_img, wm_img = (None, None)
    if slip["salon"].get("logo_raw") or slip["salon"].get("logo_url"):
        logo_img, wm_img = _fetch_logo_image(slip["salon"].get("logo_url"), slip["salon"].get("logo_raw"))

    # Watermark (drawn first, content goes on top)
    if wm_img is not None:
        wm_size = 110 * mm
        c.drawImage(ImageReader(wm_img), (w - wm_size) / 2, (h - wm_size) / 2 - 10 * mm,
                    width=wm_size, height=wm_size, preserveAspectRatio=True, anchor="c")

    # Header
    c.setFillColor(colors.HexColor("#0A0A0A"))
    c.rect(0, h - 32 * mm, w, 32 * mm, fill=1, stroke=0)
    text_x = left
    if logo_img is not None:
        logo_size = 20 * mm
        c.drawImage(ImageReader(logo_img), left, h - 26 * mm,
                    width=logo_size, height=logo_size, preserveAspectRatio=True, anchor="c")
        text_x = left + logo_size + 6 * mm
    c.setFillColor(colors.HexColor("#D4AF37"))
    c.setFont("Helvetica-Bold", 20)
    c.drawString(text_x, h - 15 * mm, slip["salon"].get("name") or "Salon")
    c.setFillColor(colors.white)
    c.setFont("Helvetica", 9)
    c.drawString(text_x, h - 21 * mm, slip["salon"].get("location") or "")
    if slip["salon"].get("phone"):
        c.drawString(text_x, h - 26 * mm, f"Phone: {slip['salon']['phone']}")
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
    if slip.get("commission_withheld"):
        why = f"target Rs. {slip.get('monthly_target', 0):.0f} not reached" if float(slip.get("monthly_target") or 0) > 0 else "no monthly target set"
        line(f"Service commission{pct_txt} — withheld ({why})", "Rs. 0.00")
    else:
        line(f"Service commission{pct_txt}", f"Rs. {slip['commission_amount']:.2f}")
    if slip.get("product_commission_amount"):
        line(f"Product sales commission ({slip.get('product_commission_pct', 2)}% of Rs. {slip.get('product_gross', 0):.0f})",
             f"Rs. {slip['product_commission_amount']:.2f}")
    if slip.get("overtime_total"):
        line(f"Overtime ({slip.get('overtime_hours_total', 0)}h past shift end)", f"Rs. {slip['overtime_total']:.2f}")
    if slip.get("review_bonus_total"):
        line(f"5-star review bonus ({slip.get('review_bonus_count', 0)} review(s))", f"Rs. {slip['review_bonus_total']:.2f}")
    if slip.get("target_bonus"):
        line(f"Monthly target bonus ({slip.get('target_commission_pct', 0)}% — target Rs. {slip.get('monthly_target', 0):.0f} achieved)", f"Rs. {slip['target_bonus']:.2f}")
    gross_pay = round(float(slip.get("net_payable") or 0) + float(slip.get("deductions_total") or 0), 2)
    line("Gross earnings", f"Rs. {gross_pay:.2f}", bold=True)
    if slip.get("deductions_total"):
        y -= 2 * mm
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(colors.HexColor("#0A0A0A"))
        c.drawString(left, y, "Deductions")
        y -= 8 * mm
        if slip.get("late_penalty_total"):
            line(f"Late-arrival fines ({slip.get('late_days', 0)} day(s))", f"- Rs. {slip['late_penalty_total']:.2f}")
        if slip.get("half_day_deduction_total"):
            line(f"Half-day deductions ({slip.get('half_days', 0)} half day(s))", f"- Rs. {slip['half_day_deduction_total']:.2f}")
        if slip.get("advance_total"):
            line("Salary advance taken", f"- Rs. {slip['advance_total']:.2f}")
        line("Total deductions", f"- Rs. {slip['deductions_total']:.2f}", bold=True)
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
        c.drawRightString(W - (120 if p.get("verify_url") else 44), H - 70,
                          datetime.now(timezone(timedelta(hours=5, minutes=30))).strftime("%d %b %Y"))
        if p.get("verify_url"):
            from reportlab.graphics.barcode.qr import QrCodeWidget
            from reportlab.graphics.shapes import Drawing
            from reportlab.graphics import renderPDF
            box, qs = 62, 54
            bx0, by0 = W - 44 - box, H - 88
            c.setFillColorRGB(1, 1, 1)
            c.roundRect(bx0, by0, box, box, 6, fill=1, stroke=0)
            qw = QrCodeWidget(p["verify_url"], barLevel="M")
            b = qw.getBounds()
            dr = Drawing(qs, qs, transform=[qs / (b[2] - b[0]), 0, 0, qs / (b[3] - b[1]), 0, 0])
            dr.add(qw)
            renderPDF.draw(dr, c, bx0 + (box - qs) / 2, by0 + (box - qs) / 2)
            c.setFillColorRGB(*GOLD)
            c.setFont("Helvetica-Bold", 5.2)
            c.drawCentredString(bx0 + box / 2, by0 - 7, "SCAN TO VERIFY LIVE")

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
    ORANGE = tuple(d.get("accent") or (0.96, 0.62, 0.10))
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
        c.drawCentredString(W - 34, 29.5, d.get("qr_label") or "SCAN TO VERIFY")
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


RELIEVING_TEMPLATES = {
    "excellent": ("Relieving & Experience Letter",
                  "served the full notice period and is relieved with an EXCELLENT record. "
                  "Their professionalism, skill and conduct were exemplary throughout, and we "
                  "wholeheartedly recommend them to any future employer."),
    "standard": ("Relieving Letter",
                 "has resigned and is hereby relieved from their duties. We thank them for "
                 "their service and wish them success in their future endeavours."),
    "terminated": ("Termination Letter",
                   "has been TERMINATED from employment. This decision was taken by the management "
                   "following a review of their conduct."),
    "absconded": ("Termination Letter",
                  "has been marked ABSCONDED — they left employment without serving notice or "
                  "informing the management, and stand terminated with effect from the date below."),
}


_LETTER_THEMES = {
    # bg, border, accent(seal), pill_bg, pill_text, pill_label, star
    "excellent":  {"bg": (1.0, 0.976, 0.965), "border": (0.80, 0.62, 0.28), "accent": (0.83, 0.66, 0.22),
                   "pill": (0.05, 0.55, 0.36), "pill_label": "\u2605 EXCELLENT", "wm": (0.96, 0.88, 0.85)},
    "standard":   {"bg": (1.0, 1.0, 1.0), "border": (0.75, 0.76, 0.80), "accent": (0.55, 0.57, 0.62),
                   "pill": None, "pill_label": "", "wm": (0.92, 0.93, 0.95)},
    "terminated": {"bg": (0.995, 0.99, 0.99), "border": (0.72, 0.40, 0.40), "accent": (0.72, 0.16, 0.16),
                   "pill": (0.72, 0.16, 0.16), "pill_label": "\u2716 TERMINATED", "wm": (0.94, 0.90, 0.90)},
    "absconded":  {"bg": (0.995, 0.99, 0.99), "border": (0.72, 0.40, 0.40), "accent": (0.72, 0.16, 0.16),
                   "pill": (0.72, 0.16, 0.16), "pill_label": "\u2716 TERMINATED", "wm": (0.94, 0.90, 0.90)},
}


def _draw_seal(c, cx, cy, r, accent, ring_txt):
    """Medal seal with ribbon tails + star, in the given accent colour."""
    from math import sin, cos, pi
    dark = tuple(max(0, v - 0.14) for v in accent)
    # ribbon tails
    for sign in (-1, 1):
        p = c.beginPath()
        x0 = cx + sign * r * 0.42
        p.moveTo(x0 - 7, cy - r * 0.5)
        p.lineTo(x0 + sign * 4 - 7, cy - r - 16)
        p.lineTo(x0 + sign * 4, cy - r - 10)
        p.lineTo(x0 + sign * 4 + 7, cy - r - 16)
        p.lineTo(x0 + 7, cy - r * 0.5)
        p.close()
        c.setFillColorRGB(*dark)
        c.drawPath(p, fill=1, stroke=0)
    # scalloped edge
    c.setFillColorRGB(*dark)
    for i in range(24):
        ang = i * pi / 12
        c.circle(cx + (r - 1) * cos(ang), cy + (r - 1) * sin(ang), 3.2, fill=1, stroke=0)
    c.setFillColorRGB(*accent)
    c.circle(cx, cy, r, fill=1, stroke=0)
    c.setStrokeColorRGB(1, 1, 1)
    c.setLineWidth(1.1)
    c.circle(cx, cy, r - 4.5, fill=0, stroke=1)
    # star
    pts = []
    for i in range(10):
        rr = (r * 0.5) if i % 2 == 0 else (r * 0.22)
        ang = -pi / 2 + i * pi / 5
        pts.append((cx + rr * cos(ang), cy - 2 + rr * sin(ang)))
    path = c.beginPath()
    path.moveTo(*pts[0])
    for pt in pts[1:]:
        path.lineTo(*pt)
    path.close()
    c.setFillColorRGB(1, 1, 1)
    c.drawPath(path, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 5.6)
    c.drawCentredString(cx, cy - r * 0.68, ring_txt)


def _render_relieving_letter_pdf(tenant: dict, staff: dict, letter_type: str,
                                 from_date: str, to_date: str, reason: str = "") -> bytes:
    """Certificate-style relieving/termination letter: soft themed background, employer
    logo letterhead, medal seal + status pill above the staff name."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import ImageReader, simpleSplit
    from reportlab.pdfgen import canvas

    title, body_line = RELIEVING_TEMPLATES[letter_type]
    th = _LETTER_THEMES.get(letter_type, _LETTER_THEMES["standard"])
    INK = (0.13, 0.12, 0.14)
    MUTED = (0.45, 0.44, 0.47)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4

    # ---- background + watermark rings ----
    c.setFillColorRGB(*th["bg"])
    c.rect(0, 0, w, h, fill=1, stroke=0)
    c.saveState()
    c.setStrokeColorRGB(*th["wm"])
    for (cx, cy, r0) in ((0, h, 70), (w, h, 110), (0, 0, 110), (w, 0, 70), (w / 2, h / 2, 190)):
        for k in range(3):
            c.setLineWidth(0.9)
            c.circle(cx, cy, r0 + k * 22, fill=0, stroke=1)
    c.restoreState()
    # faint diagonal salon-name watermark
    c.saveState()
    c.translate(w / 2, h / 2)
    c.rotate(30)
    c.setFillColorRGB(*th["wm"])
    c.setFont("Helvetica-Bold", 44)
    c.drawCentredString(0, -10, (tenant.get("name") or "SALON").upper())
    c.restoreState()

    # ---- double border frame + corner accents ----
    m1, m2 = 24, 31
    c.setStrokeColorRGB(*th["border"])
    c.setLineWidth(2.4)
    c.rect(m1, m1, w - 2 * m1, h - 2 * m1, fill=0, stroke=1)
    c.setLineWidth(0.8)
    c.rect(m2, m2, w - 2 * m2, h - 2 * m2, fill=0, stroke=1)
    c.setFillColorRGB(*th["border"])
    for (x, y0) in ((m1, m1), (m1, h - m1), (w - m1, m1), (w - m1, h - m1)):
        c.rect(x - 5, y0 - 5, 10, 10, fill=1, stroke=0)

    y = h - 62

    # ---- employer logo (tenant's own) or monogram ----
    drew_logo = False
    if tenant.get("logo_url"):
        try:
            import requests as _rq
            img = ImageReader(io.BytesIO(_rq.get(tenant["logo_url"], timeout=6).content))
            iw, ih = img.getSize()
            lh = 52.0
            lw = iw * lh / ih
            if lw > 170:
                lw, lh = 170, ih * 170.0 / iw
            c.drawImage(img, (w - lw) / 2, y - lh + 8, width=lw, height=lh,
                        preserveAspectRatio=True, mask="auto")
            drew_logo = True
            y -= lh + 4
        except Exception:
            drew_logo = False
    if not drew_logo:
        mono_r = 22
        c.setFillColorRGB(*th["border"])
        c.circle(w / 2, y - mono_r + 8, mono_r, fill=1, stroke=0)
        c.setFillColorRGB(1, 1, 1)
        c.setFont("Times-Bold", 24)
        c.drawCentredString(w / 2, y - mono_r, (tenant.get("name") or "S")[0].upper())
        y -= 2 * mono_r + 4

    c.setFillColorRGB(*INK)
    c.setFont("Times-Bold", 22)
    c.drawCentredString(w / 2, y, tenant.get("name") or "Salon")
    y -= 15
    sub = "  ·  ".join(x for x in [tenant.get("location"), tenant.get("phone")] if x)
    if sub:
        c.setFillColorRGB(*MUTED)
        c.setFont("Helvetica", 9)
        c.drawCentredString(w / 2, y, sub)
        y -= 13

    # divider with diamond
    y -= 8
    c.setStrokeColorRGB(*th["border"])
    c.setLineWidth(1)
    c.line(w / 2 - 130, y, w / 2 - 10, y)
    c.line(w / 2 + 10, y, w / 2 + 130, y)
    c.setFillColorRGB(*th["border"])
    p = c.beginPath()
    p.moveTo(w / 2, y + 5); p.lineTo(w / 2 + 5, y); p.lineTo(w / 2, y - 5); p.lineTo(w / 2 - 5, y); p.close()
    c.drawPath(p, fill=1, stroke=0)
    y -= 30

    c.setFillColorRGB(*INK)
    c.setFont("Times-Bold", 17)
    c.drawCentredString(w / 2, y, title.upper())
    y -= 14
    c.setFillColorRGB(*MUTED)
    c.setFont("Helvetica", 9)
    c.drawCentredString(w / 2, y, "Date of issue: " + datetime.now(timezone.utc).date().isoformat())
    y -= 34

    # ---- medal seal + status pill above the staff name ----
    if th["pill"]:
        seal_r = 26
        _draw_seal(c, w / 2, y - seal_r + 14, seal_r, th["accent"],
                   "VERIFIED" if letter_type == "excellent" else "ON RECORD")
        y -= 2 * seal_r + 26
        label = th["pill_label"]
        pw = c.stringWidth(label, "Helvetica-Bold", 11) + 34
        c.setFillColorRGB(*th["pill"])
        c.roundRect((w - pw) / 2, y - 6, pw, 22, 11, fill=1, stroke=0)
        c.setFillColorRGB(1, 1, 1)
        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(w / 2, y, label)
        y -= 34
    else:
        y -= 8

    c.setFillColorRGB(*MUTED)
    c.setFont("Helvetica-Oblique", 10)
    c.drawCentredString(w / 2, y, "This letter is issued to")
    y -= 26
    c.setFillColorRGB(*INK)
    c.setFont("Times-BoldItalic", 26)
    c.drawCentredString(w / 2, y, staff.get("name") or "Staff Member")
    y -= 15
    c.setFillColorRGB(*MUTED)
    c.setFont("Helvetica", 10)
    c.drawCentredString(w / 2, y, staff.get("role") or "Staff")
    y -= 12
    c.setStrokeColorRGB(*th["border"])
    c.setLineWidth(0.8)
    c.line(w / 2 - 90, y, w / 2 + 90, y)
    y -= 26

    # ---- body ----
    para = (f"This is to certify that {staff.get('name')} ({staff.get('role') or 'Staff'}) was employed with "
            f"{tenant.get('name')} from {from_date or 'N/A'} to {to_date or 'N/A'}. "
            f"{staff.get('name')} {body_line}")
    if reason and letter_type in ("terminated", "absconded"):
        para += f" Reason on record: {reason}."
    c.setFillColorRGB(0.25, 0.24, 0.28)
    c.setFont("Helvetica", 10.5)
    for line in simpleSplit(para, "Helvetica", 10.5, w - 200):
        c.drawCentredString(w / 2, y, line)
        y -= 16
    y -= 14

    if letter_type == "excellent":
        note, ncol = "Overall conduct: EXCELLENT  ·  Eligible for rehire  ·  Notice period fully served", (0.05, 0.55, 0.36)
    elif letter_type in ("terminated", "absconded"):
        note, ncol = "Status: TERMINATED  ·  Not eligible for rehire at this establishment", (0.72, 0.16, 0.16)
    else:
        note, ncol = "", INK
    if note:
        c.setFillColorRGB(*ncol)
        c.setFont("Helvetica-Bold", 10.5)
        c.drawCentredString(w / 2, y, note)
        y -= 20

    # ---- signature block ----
    sig_y = max(y - 46, 96)
    c.setStrokeColorRGB(*MUTED)
    c.setLineWidth(0.8)
    c.line(70, sig_y, 210, sig_y)
    c.line(w - 210, sig_y, w - 70, sig_y)
    c.setFillColorRGB(*INK)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawCentredString(140, sig_y - 13, "Authorized Signatory")
    c.drawCentredString(w - 140, sig_y - 13, tenant.get("name") or "Salon")
    c.setFillColorRGB(*MUTED)
    c.setFont("Helvetica", 8)
    c.drawCentredString(140, sig_y - 24, "Management")
    c.drawCentredString(w - 140, sig_y - 24, "Establishment seal")

    c.setFont("Helvetica-Oblique", 8)
    c.setFillColorRGB(0.6, 0.6, 0.63)
    c.drawCentredString(w / 2, 44, "Generated by Miracurl Salon Suite  ·  verifiable via the Miracurl Staff Registry")
    c.showPage()
    c.save()
    return buf.getvalue()
