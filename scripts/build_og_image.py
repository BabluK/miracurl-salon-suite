"""Generate Miracurl OG share image (1200x630) — composites a salon hero photo,
brand gradient overlay, the logo and tagline. Run: python build_og_image.py
"""
from io import BytesIO
import os
import urllib.request

from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = "/app/frontend/public/og-image.png"
W, H = 1200, 630

HERO_URL = "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1600&q=85"


def load_hero() -> Image.Image:
    with urllib.request.urlopen(HERO_URL, timeout=20) as r:
        data = r.read()
    img = Image.open(BytesIO(data)).convert("RGB")
    # cover-fit into 1200x630
    src_w, src_h = img.size
    scale = max(W / src_w, H / src_h)
    new_w, new_h = int(src_w * scale), int(src_h * scale)
    img = img.resize((new_w, new_h), Image.LANCZOS)
    left = (new_w - W) // 2
    top = (new_h - H) // 2
    return img.crop((left, top, left + W, top + H))


def gradient_overlay() -> Image.Image:
    """Pink → fuchsia → indigo gradient with ~78% opacity on left half fading right."""
    grad = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = grad.load()
    # left side: solid brand colour, right side: transparent
    for x in range(W):
        t = x / W
        # ease-out fade: stronger on left
        alpha = int(255 * (1 - t) ** 1.4)
        # diagonal blend between three brand colours
        for y in range(H):
            v = y / H
            r = int(236 * (1 - v) + 168 * v)   # #ec4899 → #a855f7 R-channel
            g = int(72 * (1 - v) + 85 * v)
            b = int(153 * (1 - v) + 247 * v)
            px[x, y] = (r, g, b, alpha)
    return grad


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def draw_brand(img: Image.Image) -> None:
    d = ImageDraw.Draw(img, "RGBA")

    # ─── Brand pill (scissors icon) ───
    pill_x, pill_y, pill_s = 80, 80, 78
    pill_pad = pill_s
    # gradient pill: draw rounded rect, then radial sheen
    d.rounded_rectangle(
        (pill_x, pill_y, pill_x + pill_pad, pill_y + pill_pad),
        radius=22,
        fill=(236, 72, 153, 255),
    )
    # second pass for gradient effect — overlay purple at bottom-right
    sheen = Image.new("RGBA", (pill_pad, pill_pad), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    for i in range(pill_pad):
        a = int(180 * (i / pill_pad))
        sd.line((0, i, pill_pad, i), fill=(168, 85, 247, a))
    img.paste(
        Image.composite(
            sheen,
            Image.new("RGBA", (pill_pad, pill_pad), (0, 0, 0, 0)),
            sheen,
        ),
        (pill_x, pill_y),
        sheen,
    )
    # white scissors glyph (simplified: two circles + an "X" stroke)
    cx1, cy = pill_x + 24, pill_y + pill_pad - 22
    cx2 = pill_x + 54
    r = 8
    d.ellipse((cx1 - r, cy - r, cx1 + r, cy + r), outline="white", width=4)
    d.ellipse((cx2 - r, cy - r, cx2 + r, cy + r), outline="white", width=4)
    d.line((cx1 + 4, cy - 4, pill_x + pill_pad - 14, pill_y + 14), fill="white", width=4)
    d.line((cx2 - 4, cy - 4, pill_x + 14, pill_y + 14), fill="white", width=4)

    # ─── Wordmark ───
    font_word = load_font(64, bold=True)
    d.text(
        (pill_x + pill_pad + 24, pill_y - 4),
        "MIRACURL",
        font=font_word,
        fill="white",
    )
    font_sub = load_font(18, bold=True)
    d.text(
        (pill_x + pill_pad + 26, pill_y + 60),
        "S A L O N   S U I T E",
        font=font_sub,
        fill=(255, 255, 255, 230),
    )

    # ─── Tagline (big serif) ───
    font_h1 = load_font(72, bold=True)
    lines = ["The salon software", "that pays for itself."]
    ty = 250
    for line in lines:
        d.text((80, ty), line, font=font_h1, fill="white")
        ty += 86

    # ─── Sub-tagline ───
    font_h2 = load_font(26, bold=False)
    d.text(
        (80, 442),
        "Bookings · Billing · Loyalty · Stylist commissions",
        font=font_h2,
        fill=(255, 255, 255, 235),
    )

    # ─── Trial pill ───
    pill_x2, pill_y2 = 80, 510
    text = "7-day free trial  ·  ₹0 setup  ·  90 sec go-live"
    pad_x, pad_y = 22, 12
    fp = load_font(20, bold=True)
    tw = d.textlength(text, font=fp)
    d.rounded_rectangle(
        (pill_x2, pill_y2, pill_x2 + tw + pad_x * 2, pill_y2 + pad_y * 2 + 24),
        radius=999,
        fill=(255, 255, 255, 255),
    )
    d.text(
        (pill_x2 + pad_x, pill_y2 + pad_y),
        text,
        font=fp,
        fill=(190, 24, 93),
    )

    # ─── Domain (bottom-right corner) ───
    font_url = load_font(22, bold=True)
    domain = "miracurl-suite.com"
    dw = d.textlength(domain, font=font_url)
    d.text((W - dw - 60, H - 50), domain, font=font_url, fill=(255, 255, 255, 235))


def main() -> None:
    print("→ Downloading hero photo…")
    hero = load_hero()
    print("→ Applying brand gradient overlay…")
    overlay = gradient_overlay()
    canvas = Image.alpha_composite(hero.convert("RGBA"), overlay)
    # subtle dark gradient at bottom for legibility
    bottom = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bottom)
    for y in range(H):
        a = int(140 * (y / H) ** 2)
        bd.line((0, y, W, y), fill=(15, 15, 20, a))
    canvas = Image.alpha_composite(canvas, bottom)
    print("→ Rendering text & brand…")
    draw_brand(canvas)
    print(f"→ Saving to {OUT}")
    canvas.convert("RGB").save(OUT, "PNG", optimize=True)
    print(f"✓ Done — {os.path.getsize(OUT) // 1024} KB")


if __name__ == "__main__":
    main()
