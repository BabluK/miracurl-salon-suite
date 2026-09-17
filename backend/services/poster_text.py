"""Crisp real-text overlay for Mira posters (AI images garble spelling)."""
import io
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

_FONTS = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "fonts")
GOLD = (232, 197, 106)


def _font(name: str, size: int):
    try:
        return ImageFont.truetype(os.path.join(_FONTS, name), size)
    except OSError:
        return ImageFont.load_default()


def _fit(draw, text, name, max_w, start, floor=28):
    size = start
    while size > floor:
        f = _font(name, size)
        if draw.textlength(text, font=f) <= max_w:
            return f
        size -= 4
    return _font(name, floor)


def overlay_poster_text(data: bytes, headline: str, sub: str = "", badge: str = "", footer: str = "") -> bytes:
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    w, h = im.size
    # soft dark gradient on the lower third so text always reads
    grad = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(int(h * 0.5), h):
        a = int(210 * ((y - h * 0.5) / (h * 0.5)) ** 1.4)
        gd.line([(0, y), (w, y)], fill=(12, 8, 4, a))
    im = Image.alpha_composite(im, grad)
    d = ImageDraw.Draw(im)
    pad = int(w * 0.06)
    y = int(h * 0.62)
    if badge:
        bf = _font("PlayfairDisplay-Bold.ttf", int(w * 0.075))
        bw = d.textlength(badge, font=bf) + pad
        bh = int(w * 0.11)
        bx = w - pad - bw
        d.rounded_rectangle([bx, int(h * 0.05), bx + bw, int(h * 0.05) + bh], radius=bh // 2, fill=(178, 27, 62, 235))
        d.text((bx + pad / 2, int(h * 0.05) + bh * 0.16), badge, font=bf, fill=(255, 255, 255, 255))
    hf = _fit(d, headline, "PlayfairDisplay-Bold.ttf", w - 2 * pad, int(w * 0.11))
    shadow = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).text((pad + 3, y + 3), headline, font=hf, fill=(0, 0, 0, 180))
    im = Image.alpha_composite(im, shadow.filter(ImageFilter.GaussianBlur(4)))
    d = ImageDraw.Draw(im)
    d.text((pad, y), headline, font=hf, fill=GOLD + (255,))
    y += hf.size + int(h * 0.015)
    if sub:
        sf = _fit(d, sub, "FreeSansBold.ttf", w - 2 * pad, int(w * 0.045), 22)
        d.text((pad, y), sub, font=sf, fill=(255, 255, 255, 240))
        y += sf.size + int(h * 0.01)
    if footer:
        ff = _fit(d, footer, "GreatVibes-Regular.ttf", w * 0.7, int(w * 0.06), 24)
        d.text((pad, min(y + int(h * 0.01), h - pad - ff.size)), footer, font=ff, fill=GOLD + (230,))
    out = io.BytesIO()
    im.convert("RGB").save(out, "PNG", optimize=True)
    return out.getvalue()
