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

BRAND_LOGO = os.path.join(_ASSETS, "brand_logo.png")
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
