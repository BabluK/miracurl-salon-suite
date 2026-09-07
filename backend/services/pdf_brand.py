"""Shared Miracurl branding for every PDF: platform logo (HQ upload or default monogram), watermark, footer."""
import asyncio
import base64
import io
import os

from database import _raw_db
from services.storage import _get_object

_BRAND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "public", "assets", "brand")
_DEFAULT_LOGO = os.path.join(_BRAND_DIR, "gold-monogram-transparent.png")
GOLD, INK, GREY, LIGHT = (0.72, 0.6, 0.25), (0.12, 0.12, 0.14), (0.4, 0.4, 0.45), (0.965, 0.955, 0.93)
_cache: dict = {}


def _decode_data_url(v: str) -> bytes | None:
    try:
        return base64.b64decode(v.split(",", 1)[1]) if v.startswith("data:") else None
    except (ValueError, IndexError):
        return None


def default_logo_bytes() -> bytes:
    if "default" not in _cache:
        with open(_DEFAULT_LOGO, "rb") as f:
            _cache["default"] = f.read()
    return _cache["default"]


async def platform_logo_bytes() -> bytes:
    """HQ-uploaded platform logo (Site Info) or the default gold monogram."""
    doc = await _raw_db.platform_settings.find_one({"key": "site_info"}, {"_id": 0, "platform_logo": 1}) or {}
    return _decode_data_url(doc.get("platform_logo") or "") or default_logo_bytes()


async def image_bytes_from_url(url: str | None) -> bytes | None:
    """Resolve a tenant logo / photo URL to bytes: local upload, data URL or safe public URL."""
    if not url:
        return None
    if url.startswith("data:"):
        return _decode_data_url(url)
    if "/api/files/" in url:
        rec = await _raw_db.uploads.find_one({"id": url.split("/api/files/", 1)[1].split("?")[0], "is_deleted": False})
        if not rec:
            return None
        try:
            data, _ = await asyncio.to_thread(_get_object, rec["storage_path"])
            return data
        except Exception:  # noqa: BLE001 — storage backend errors must not break PDF generation
            return None
    if url.startswith("http"):
        from routes.registry import _safe_fetch_image_bytes
        try:
            return await asyncio.to_thread(_safe_fetch_image_bytes, url)
        except Exception:  # noqa: BLE001 — remote logo fetch is best-effort
            return None
    return None


def _reader(raw: bytes | None, alpha: float = 1.0):
    """ImageReader for reportlab; optional alpha fade (for watermarks). Returns None if unreadable."""
    if not raw:
        return None
    try:
        from PIL import Image
        from reportlab.lib.utils import ImageReader
        im = Image.open(io.BytesIO(raw)).convert("RGBA")
        im.thumbnail((520, 520))
        if alpha < 1:
            im.putalpha(im.getchannel("A").point(lambda a: int(a * alpha)))
        return ImageReader(im), im.size
    except (OSError, ValueError):
        return None


def draw_logo(c, raw: bytes | None, x, y, box_w, box_h, alpha: float = 1.0) -> bool:
    """Fit-and-center the logo inside a box (bottom-left x,y). Returns True if drawn."""
    r = _reader(raw, alpha)
    if not r:
        return False
    img, (iw, ih) = r
    sc = min(box_w / iw, box_h / ih)
    dw, dh = iw * sc, ih * sc
    c.drawImage(img, x + (box_w - dw) / 2, y + (box_h - dh) / 2, width=dw, height=dh, mask="auto")
    return True


def draw_watermark(c, raw: bytes | None, W, H, size):
    draw_logo(c, raw, (W - size) / 2, (H - size) / 2 - size * 0.1, size, size, alpha=0.05)


def draw_brand_band(c, W, H, mm, *, logo: bytes | None, title: str, meta: list[str], brand: str = "MIRACURL SUITE",
                    tagline: str = "Salon & Restaurant Management Suite  ·  miracurl-suite.com", band_h: float = 40):
    """Dark header band: logo + brand on the left, document title + meta on the right, gold rule below."""
    c.setFillColorRGB(*INK)
    c.rect(0, H - band_h * mm, W, band_h * mm, stroke=0, fill=1)
    c.setFillColorRGB(*GOLD)
    c.rect(0, H - band_h * mm - 1.2 * mm, W, 1.2 * mm, stroke=0, fill=1)
    x = 16 * mm
    if draw_logo(c, logo, x, H - (band_h - 6) * mm, 26 * mm, (band_h - 12) * mm):
        x += 30 * mm
    c.setFillColorRGB(*GOLD)
    c.setFont("Helvetica-Bold", 19)
    c.drawString(x, H - (band_h / 2 - 1) * mm, brand)
    c.setFillColorRGB(0.82, 0.82, 0.84)
    c.setFont("Helvetica", 8.3)
    c.drawString(x, H - (band_h / 2 + 6) * mm, tagline)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 16)
    c.drawRightString(W - 16 * mm, H - (band_h / 2 - 2) * mm, title)
    yy = H - (band_h / 2 + 5) * mm
    for i, m in enumerate(meta):
        c.setFillColorRGB(*GOLD) if i == 0 else c.setFillColorRGB(0.82, 0.82, 0.84)
        c.setFont("Helvetica-Bold" if i == 0 else "Helvetica", 9 if i == 0 else 8.3)
        c.drawRightString(W - 16 * mm, yy, m)
        yy -= 5 * mm


def draw_powered_footer(c, W, mm, logo: bytes | None, lines: list[str], y_top: float = 30):
    """Gold rule + small monogram + 'Powered by Miracurl' + fine-print lines."""
    c.setStrokeColorRGB(*GOLD)
    c.setLineWidth(0.6)
    c.line(16 * mm, y_top * mm, W - 16 * mm, y_top * mm)
    x = 16 * mm
    if draw_logo(c, logo, x, (y_top - 14) * mm, 11 * mm, 11 * mm):
        x += 14 * mm
    c.setFillColorRGB(*INK)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(x, (y_top - 6) * mm, "Powered by Miracurl Suite")
    c.setFillColorRGB(*GREY)
    c.setFont("Helvetica", 7.6)
    yy = (y_top - 10.5) * mm
    for ln in lines:
        c.drawString(x, yy, ln)
        yy -= 4 * mm
    c.setFont("Helvetica-Oblique", 7.2)
    c.drawCentredString(W / 2, 7 * mm, "This is a computer-generated document and does not require a physical signature.")
