"""QR poster + tent-card rendering (PIL) — shared by services_catalog and receipt_email.

Extracted from routes/services_catalog.py to break the
receipt_email -> services_catalog -> services.billing -> receipt_email import cycle."""
import io
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent

POSTER_DIR = ROOT_DIR / "assets" / "posters"
POSTER_DESIGNS = {
    "blush": {"bg": "blush.png", "name": (94, 52, 66), "accent": (168, 124, 46), "sub": (120, 84, 94), "band": (255, 252, 248, 200)},
    "rosegold": {"bg": "rosegold.png", "name": (128, 66, 74), "accent": (186, 110, 96), "sub": (146, 100, 100), "band": (255, 250, 246, 205)},
    "lavender": {"bg": "lavender.png", "name": (84, 56, 122), "accent": (146, 104, 190), "sub": (110, 88, 140), "band": (252, 250, 255, 200)},
    "ivory": {"bg": "ivory.png", "name": (122, 70, 42), "accent": (192, 100, 62), "sub": (140, 100, 74), "band": (255, 251, 244, 205)},
    "bistro": {"bg": "bistro.png", "name": (92, 58, 36), "accent": (176, 92, 52), "sub": (122, 96, 72), "band": (255, 252, 245, 205)},
}


def _mascot_rgba():
    from PIL import Image as PILImage
    im = PILImage.open(POSTER_DIR / "scan_me.png").convert("RGBA")
    px = im.load()
    bg = px[4, 4][:3]
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) < 60:
                px[x, y] = (r, g, b, 0)
    return im


def _circle_avatar(size: int):
    from PIL import Image as PILImage, ImageDraw
    im = PILImage.open(POSTER_DIR / "mira.png").convert("RGB")
    side = min(im.size)
    im = im.crop(((im.width - side) // 2, 0, (im.width - side) // 2 + side, side)).resize((size, size))
    mask = PILImage.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size, size], fill=255)
    out = PILImage.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    d = ImageDraw.Draw(out)
    d.ellipse([2, 2, size - 2, size - 2], outline=(212, 175, 55), width=8)
    return out


def _build_qr_poster(tenant: dict, url: str, design: str = "blush", kind: str = "booking") -> bytes:
    import qrcode
    from PIL import Image as PILImage, ImageDraw, ImageFont

    cfg = POSTER_DESIGNS.get(design) or POSTER_DESIGNS["blush"]

    def _load_font(fname, size):
        for p in (ROOT_DIR / "fonts" / fname, Path("/usr/share/fonts/truetype/freefont") / fname):
            try:
                return ImageFont.truetype(str(p), size)
            except Exception:
                continue
        return ImageFont.load_default()

    W, H = 1600, 2400
    bg = PILImage.open(POSTER_DIR / cfg["bg"]).convert("RGB")
    scale = max(W / bg.width, H / bg.height)
    bg = bg.resize((int(bg.width * scale) + 1, int(bg.height * scale) + 1))
    img = bg.crop(((bg.width - W) // 2, (bg.height - H) // 2, (bg.width - W) // 2 + W, (bg.height - H) // 2 + H)).convert("RGBA")
    d = ImageDraw.Draw(img)

    def fit_font(text, fname, start, max_w):
        size = start
        while size > 34:
            f = _load_font(fname, size)
            bbox = d.textbbox((0, 0), text, font=f)
            if bbox[2] - bbox[0] <= max_w:
                return f
            size -= 6
        return _load_font(fname, 34)

    def center(text, y, font, fill):
        bbox = d.textbbox((0, 0), text, font=font)
        d.text(((W - (bbox[2] - bbox[0])) / 2 - bbox[0], y), text, font=font, fill=fill)

    def band(y0, y1, radius=36):
        overlay = PILImage.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(overlay).rounded_rectangle([110, y0, W - 110, y1], radius=radius, fill=cfg["band"])
        return PILImage.alpha_composite(img, overlay)

    # ---- header band: salon name + location + tagline
    img = band(430, 800)
    d = ImageDraw.Draw(img)
    resto = tenant.get("business_type") == "restaurant"
    name = tenant.get("name") or ("Your Restaurant" if resto else "Your Salon")
    center(name, 470, fit_font(name, "FreeSerifBold.ttf", 110, W - 320), cfg["name"])
    loc = (tenant.get("location") or "").strip()
    if loc:
        center(loc[:60], 620, _load_font("FreeSansBold.ttf", 42), cfg["sub"])
    center("S C A N  ·  R A T E  ·  S H I N E" if kind == "review"
           else ("S C A N  ·  B O O K  ·  F E A S T" if resto else "S C A N  ·  B O O K  ·  G L O W"),
           705, _load_font("FreeSansBold.ttf", 40), cfg["accent"])

    # ---- QR panel with white rounded card
    qr = qrcode.QRCode(box_size=14, border=2, error_correction=qrcode.constants.ERROR_CORRECT_H)
    qr.add_data(url)
    qr.make(fit=True)
    qimg = qr.make_image(fill_color="black", back_color="white").convert("RGB").resize((560, 560))
    panel = PILImage.new("RGBA", (W, H), (0, 0, 0, 0))
    px0, py0 = (W - 660) // 2, 1000
    ImageDraw.Draw(panel).rounded_rectangle([px0, py0, px0 + 660, py0 + 660], radius=44, fill=(255, 255, 255, 255))
    img = PILImage.alpha_composite(img, panel)
    img.paste(qimg, (px0 + 50, py0 + 50))
    d = ImageDraw.Draw(img)

    # ---- cute mascot + "Scan me!" above the QR
    try:
        mascot = _mascot_rgba().resize((330, 330))
        img.paste(mascot, (px0 + 660 - 190, py0 - 250), mascot)
        scan_label = "Loved it? Scan!" if kind == "review" else "Scan me!"
        d.text((px0 + 40, py0 - 150), scan_label, font=_load_font("FreeSerifBoldItalic.ttf", 70), fill=cfg["accent"])
    except Exception:
        pass

    # ---- Mira avatar bottom-left of QR panel
    try:
        av = _circle_avatar(230)
        img.paste(av, (px0 - 105, py0 + 660 - 150), av)
        d.text((px0 - 95, py0 + 660 + 88), "Mira AI", font=_load_font("FreeSansBold.ttf", 34), fill=cfg["accent"])
    except Exception:
        pass

    # ---- timings band (from Settings)
    img = band(1830, 2130)
    d = ImageDraw.Draw(img)
    head = "—  LOVED YOUR VISIT? TELL THE WORLD  —" if kind == "review" else "—  OPEN MONDAY – SUNDAY  —"
    center(head, 1870, _load_font("FreeSansBold.ttf", 42), cfg["accent"])
    if kind == "review":
        center("Your review takes 30 seconds and means the world to us", 1940,
               _load_font("FreeSerifBold.ttf", 46), cfg["name"])
    else:
        hours = (tenant.get("hours") or "").strip() or "10:00 AM – 9:00 PM"
        center(hours[:60], 1935, fit_font(hours[:60], "FreeSerifBold.ttf", 66, W - 360), cfg["name"])
    parts = [(tenant.get("phone") or "").strip()]
    if kind == "booking":
        parts.append(url.replace("https://", ""))
    contact = " · ".join(x for x in parts if x)
    center(contact[:80], 2035, _load_font("FreeSansBold.ttf", 36), cfg["sub"])

    center("Powered by Miracurl", 2290, _load_font("FreeSansBold.ttf", 32), cfg["sub"])
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="PNG")
    return buf.getvalue()

def _build_tent_card(tenant: dict, url: str, design: str = "blush", kind: str = "booking") -> bytes:
    """A5 landscape table tent card — QR left, salon details right."""
    import qrcode
    from PIL import Image as PILImage, ImageDraw, ImageFont

    cfg = POSTER_DESIGNS.get(design) or POSTER_DESIGNS["blush"]

    def _load_font(fname, size):
        for p in (ROOT_DIR / "fonts" / fname, Path("/usr/share/fonts/truetype/freefont") / fname):
            try:
                return ImageFont.truetype(str(p), size)
            except Exception:
                continue
        return ImageFont.load_default()

    W, H = 2000, 1400
    bg = PILImage.open(POSTER_DIR / cfg["bg"]).convert("RGB")
    scale = max(W / bg.width, H / bg.height)
    bg = bg.resize((int(bg.width * scale) + 1, int(bg.height * scale) + 1))
    img = bg.crop(((bg.width - W) // 2, (bg.height - H) // 2, (bg.width - W) // 2 + W, (bg.height - H) // 2 + H)).convert("RGBA")
    d = ImageDraw.Draw(img)

    def fit_font(text, fname, start, max_w):
        size = start
        while size > 28:
            f = _load_font(fname, size)
            bbox = d.textbbox((0, 0), text, font=f)
            if bbox[2] - bbox[0] <= max_w:
                return f
            size -= 5
        return _load_font(fname, 28)

    # right info band
    overlay = PILImage.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(overlay).rounded_rectangle([880, 170, W - 90, H - 170], radius=40, fill=cfg["band"])
    img = PILImage.alpha_composite(img, overlay)
    d = ImageDraw.Draw(img)

    # left QR panel + mascot
    panel = PILImage.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(panel).rounded_rectangle([150, 400, 150 + 620, 400 + 620], radius=40, fill=(255, 255, 255, 255))
    img = PILImage.alpha_composite(img, panel)
    qr = qrcode.QRCode(box_size=13, border=2, error_correction=qrcode.constants.ERROR_CORRECT_H)
    qr.add_data(url)
    qr.make(fit=True)
    img.paste(qr.make_image(fill_color="black", back_color="white").convert("RGB").resize((530, 530)), (195, 445))
    d = ImageDraw.Draw(img)
    try:
        mascot = _mascot_rgba().resize((280, 280))
        img.paste(mascot, (150 + 620 - 170, 400 - 220), mascot)
        d.text((175, 400 - 130), "Loved it? Scan!" if kind == "review" else "Scan me!",
               font=_load_font("FreeSerifBoldItalic.ttf", 62), fill=cfg["accent"])
    except Exception:
        pass
    d.text((225, 400 + 620 + 30), "Point your camera at the code",
           font=_load_font("FreeSansBold.ttf", 32), fill=cfg["sub"])

    # right column text
    rx, rw = 940, W - 90 - 940 - 40
    def rtext(text, y, font, fill):
        bbox = d.textbbox((0, 0), text, font=font)
        d.text((rx + (rw - (bbox[2] - bbox[0])) / 2, y), text, font=font, fill=fill)
    name = tenant.get("name") or ("Your Restaurant" if tenant.get("business_type") == "restaurant" else "Your Salon")
    rtext(name, 240, fit_font(name, "FreeSerifBold.ttf", 82, rw), cfg["name"])
    loc = (tenant.get("location") or "").strip()
    if loc:
        rtext(loc[:50], 360, _load_font("FreeSansBold.ttf", 34), cfg["sub"])
    rtext("S C A N · R A T E · S H I N E" if kind == "review"
          else ("S C A N · B O O K · F E A S T" if tenant.get("business_type") == "restaurant" else "S C A N · B O O K · G L O W"),
          445, _load_font("FreeSansBold.ttf", 34), cfg["accent"])
    if kind == "review":
        rtext("Loved your visit?", 590, _load_font("FreeSerifBold.ttf", 66), cfg["name"])
        rtext("Tell the world — it takes 30 seconds", 700, _load_font("FreeSansBold.ttf", 36), cfg["sub"])
    else:
        rtext("—  OPEN MONDAY – SUNDAY  —", 590, _load_font("FreeSansBold.ttf", 36), cfg["accent"])
        hours = (tenant.get("hours") or "").strip() or "10:00 AM – 9:00 PM"
        rtext(hours[:50], 660, fit_font(hours[:50], "FreeSerifBold.ttf", 58, rw), cfg["name"])
    contact = " · ".join(x for x in [(tenant.get("phone") or "").strip()] if x)
    if contact:
        rtext(contact[:50], 820, _load_font("FreeSansBold.ttf", 36), cfg["sub"])
    try:
        av = _circle_avatar(190)
        img.paste(av, (rx + rw // 2 - 95, 900), av)
        d = ImageDraw.Draw(img)
        rtext("Mira AI  ·  Powered by Miracurl", 1110, _load_font("FreeSansBold.ttf", 30), cfg["accent"])
    except Exception:
        pass
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="PNG")
    return buf.getvalue()

