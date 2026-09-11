"""Shared PIL helpers for the colour-studio image cards (poster, share card, reel)."""
import base64
import io
import os

from PIL import Image, ImageDraw, ImageOps

from services.veo_brand import GOLD, _font

PANEL_BG = (12, 9, 14)


def public_url(path: str) -> str:
    return f"{os.environ.get('APP_PUBLIC_URL', '')}{path}"


def decode_b64_image(b64: str) -> Image.Image:
    Image.MAX_IMAGE_PIXELS = 40_000_000  # pixel-bomb guard
    return Image.open(io.BytesIO(base64.b64decode(b64.split(",", 1)[-1]))).convert("RGB")


def qr_card(url: str, qr_px: int, pad: int, box_size: int, gold_frame: bool = False) -> Image.Image:
    import qrcode
    qr = qrcode.QRCode(box_size=box_size, border=1)
    qr.add_data(url)
    qr.make()
    qim = qr.make_image(fill_color="black", back_color="white").convert("RGB").resize((qr_px, qr_px))
    size = qr_px + 2 * pad
    card = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    if gold_frame:
        cd.rounded_rectangle([0, 0, size - 1, size - 1], radius=36, fill=GOLD)
        cd.rounded_rectangle([10, 10, size - 11, size - 11], radius=30, fill=(255, 255, 255, 255))
    else:
        cd.rectangle([0, 0, size - 1, size - 1], fill=(255, 255, 255, 255))
    card.paste(qim, (pad, pad))
    return card


def paste_logo_disc(img: Image.Image, logo: bytes, x: int, y: int, size: int, ring: int) -> None:
    """White disc with the tenant logo inside a gold ring, pasted at (x, y)."""
    lg = ImageOps.contain(Image.open(io.BytesIO(logo)).convert("RGBA"), (size - 40, size - 40))
    disc = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    disc.alpha_composite(lg, ((size - lg.width) // 2, (size - lg.height) // 2))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    img.paste(disc, (x, y), mask)
    ImageDraw.Draw(img).ellipse([x, y, x + size, y + size], outline=GOLD, width=ring)


def paste_photo_tiles(img: Image.Image, tiles: list[tuple[str, Image.Image]], y: int, tw: int, gap: int = 40,
                      radius: int = 28, label_size: int = 22) -> int:
    """Row of rounded, gold-framed portrait tiles with a caption under each. Returns the tile height."""
    W = img.width
    th = int(tw * 1.25)
    x = (W - (tw * len(tiles) + gap * (len(tiles) - 1))) // 2
    lf = _font(label_size)
    for label, im in tiles:
        tile = ImageOps.fit(im, (tw, th))
        mask = Image.new("L", (tw, th), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, tw - 1, th - 1], radius=radius, fill=255)
        img.paste(tile, (x, y), mask)
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([x, y, x + tw - 1, y + th - 1], radius=radius, outline=GOLD, width=3)
        d.text((x + (tw - d.textlength(label, font=lf)) / 2, y + th + 14), label, font=lf, fill=GOLD)
        x += tw + gap
    return th


def framed_panel(W: int, H: int) -> Image.Image:
    img = Image.new("RGB", (W, H), PANEL_BG)
    ImageDraw.Draw(img).rounded_rectangle([24, 24, W - 24, H - 24], radius=28, outline=GOLD, width=4)
    return img


def to_png(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()
