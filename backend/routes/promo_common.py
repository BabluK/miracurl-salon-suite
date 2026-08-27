"""Shared branding assets/constants for the promo generators (video, poster, flyer)."""
import os

from PIL import Image

_ASSETS = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets")

# Bundled font first — production containers may not ship system fonts, and PIL's
# load_default() fallback is a tiny bitmap font with no ₹ glyph (broken flyers).
_FONT_CANDIDATES = [
    os.path.join(_ASSETS, "fonts", "FreeSansBold.ttf"),
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]
FONT_PATH = next((p for p in _FONT_CANDIDATES if os.path.exists(p)), _FONT_CANDIDATES[0])

BRAND_LOGO = os.path.join(_ASSETS, "brand_ms_emblem.png")
BROCHURE_DIR = os.path.join(_ASSETS, "brochure")

_logo_cache: list = []


def _brand_logo(width: int) -> Image.Image | None:
    """Rose-gold swirl logo resized once per render size (RGBA for alpha paste)."""
    if not os.path.exists(BRAND_LOGO):
        return None
    if not _logo_cache or _logo_cache[0].width != width:
        im = Image.open(BRAND_LOGO).convert("RGBA")
        im.thumbnail((width, width), Image.LANCZOS)
        _logo_cache.clear()
        _logo_cache.append(im)
    return _logo_cache[0]


ALL_FEATURES = ("online bookings, POS billing with GST receipts, customer CRM with loyalty points & birthday offers, "
                "the Staff Verification Portal (hire trusted background-verified staff), Mira the AI marketing agent "
                "(auto-creates daily Instagram posts, win-back emails & WhatsApp offers on autopilot), "
                "SMS & email receipts, business reports, and multi-branch management")

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MONOGRAM = os.path.join(_ROOT, "frontend", "public", "assets", "brand", "gold-monogram-transparent.png")
_wm_cache: dict = {}


def stamp_monogram(img: Image.Image, opacity: float = 0.5) -> Image.Image:
    """Gold MS monogram, bottom-right — brand watermark on every shareable AI poster."""
    if not os.path.exists(MONOGRAM):
        return img
    w = max(64, int(img.width * 0.09))
    key = (w, opacity)
    if key not in _wm_cache:
        m = Image.open(MONOGRAM).convert("RGBA")
        m.thumbnail((w, w), Image.LANCZOS)
        m.putalpha(m.split()[3].point(lambda a: int(a * opacity)))
        _wm_cache.clear()
        _wm_cache[key] = m
    m = _wm_cache[key]
    base = img.convert("RGBA")
    pad = max(16, int(base.width * 0.025))
    base.paste(m, (base.width - m.width - pad, base.height - m.height - pad), m)
    return base


def stamp_monogram_bytes(data: bytes) -> bytes:
    """Stamp raw image bytes; returns original bytes on any failure."""
    import io
    try:
        src = Image.open(io.BytesIO(data))
        fmt = (src.format or "PNG").upper()
        img = stamp_monogram(src)
        buf = io.BytesIO()
        if fmt == "JPEG":
            img.convert("RGB").save(buf, "JPEG", quality=90)
        else:
            img.save(buf, "PNG")
        return buf.getvalue()
    except Exception:
        return data
