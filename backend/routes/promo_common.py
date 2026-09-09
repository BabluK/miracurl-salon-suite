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


def stamp_tenant_logo(img: Image.Image, logo_bytes: bytes) -> Image.Image:
    """Salon's own logo as a circular gold-ring medallion, bottom-right."""
    import io
    from PIL import ImageDraw, ImageOps
    size = max(80, int(img.width * 0.14))
    logo = Image.open(io.BytesIO(logo_bytes)).convert("RGBA")
    inner = int(size * 0.8)
    logo = ImageOps.contain(logo, (inner, inner), Image.LANCZOS)
    medal = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(medal).ellipse([0, 0, size - 1, size - 1], fill=(18, 14, 20, 200))
    medal.alpha_composite(logo, ((size - logo.width) // 2, (size - logo.height) // 2))
    ImageDraw.Draw(medal).ellipse([1, 1, size - 2, size - 2], outline=(212, 175, 55, 255), width=max(3, size // 40))
    base = img.convert("RGBA")
    pad = max(16, int(base.width * 0.025))
    base.paste(medal, (base.width - size - pad, base.height - size - pad), medal)
    return base


def stamp_monogram_bytes(data: bytes, logo_bytes: bytes | None = None) -> bytes:
    """Stamp raw image bytes with the salon logo (falls back to MS monogram); returns original bytes on any failure."""
    import io
    try:
        src = Image.open(io.BytesIO(data))
        fmt = (src.format or "PNG").upper()
        img = None
        if logo_bytes:
            try:
                img = stamp_tenant_logo(src, logo_bytes)
            except Exception:
                img = None
        if img is None:
            img = stamp_monogram(src)
        buf = io.BytesIO()
        if fmt == "JPEG":
            img.convert("RGB").save(buf, "JPEG", quality=90)
        else:
            img.save(buf, "PNG")
        return buf.getvalue()
    except Exception:
        return data
