"""Branding pass for HQ promo videos: gold MS watermark on every frame + a 4-second
brand end card (logo · MIRACURL SUITE · email / call · Instagram · website)."""
import os
import subprocess

from PIL import Image, ImageDraw, ImageFont

from database import _raw_db
from routes.promo_common import FONT_PATH, MONOGRAM, stamp_monogram

GOLD = (212, 175, 55)
END_CARD_SEC = 4
DEFAULTS = {
    "brand": "MIRACURL SUITE",
    "tagline": "Smart Salon Management Software",
    "motto": "Manage. Automate. Grow.",
    "email": os.environ.get("HQ_SUPPORT_EMAIL", "support@miracurl-suite.com"),
    "phone": os.environ.get("HQ_PHONE", ""),
    "instagram": os.environ.get("HQ_INSTAGRAM", ""),
    "website": "miracurl-suite.com",
    "footer": "FOR SALONS THAT DREAM BIGGER",
}


async def get_brand_contacts() -> dict:
    doc = await _raw_db.hq_settings.find_one({"key": "brand_contacts"}, {"_id": 0, "key": 0}) or {}
    return {**DEFAULTS, **{k: v for k, v in doc.items() if v is not None}}


def _font(sz: int, serif: bool = False):
    cands = ["/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"] if serif else []
    cands.append(FONT_PATH)
    for p in cands:
        try:
            return ImageFont.truetype(p, sz)
        except OSError:
            continue
    return ImageFont.load_default()


def _icon(kind: str, size: int) -> Image.Image:
    """Gold-ring black disc with a simple gold glyph — envelope / phone / instagram / globe."""
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    lw = max(3, size // 22)
    d.ellipse([0, 0, size - 1, size - 1], fill=(12, 10, 12, 255), outline=GOLD, width=lw)
    a, b = size * 0.3, size * 0.7  # glyph box
    if kind == "EMAIL":
        d.rectangle([a, size * 0.36, b, size * 0.64], outline=GOLD, width=lw)
        d.line([a, size * 0.36, size / 2, size * 0.52, b, size * 0.36], fill=GOLD, width=lw)
    elif kind == "CALL / WHATSAPP":
        d.arc([a, a, b, b], 200, 290, fill=GOLD, width=lw * 2)
        d.line([a + lw, size * 0.42, size * 0.42, size * 0.62, size * 0.62, size * 0.62], fill=GOLD, width=lw * 2)
    elif kind == "INSTAGRAM":
        r = lw * 2
        d.rounded_rectangle([a, a, b, b], radius=r * 2, outline=GOLD, width=lw)
        d.ellipse([size * 0.41, size * 0.41, size * 0.59, size * 0.59], outline=GOLD, width=lw)
        d.ellipse([b - r * 2.2, a + r * 0.8, b - r * 1.2, a + r * 1.8], fill=GOLD)
    else:  # WEBSITE globe
        d.ellipse([a, a, b, b], outline=GOLD, width=lw)
        d.ellipse([size * 0.42, a, size * 0.58, b], outline=GOLD, width=lw)
        d.line([a, size / 2, b, size / 2], fill=GOLD, width=lw)
    return im


def _center(d: ImageDraw.ImageDraw, y: int, text: str, font, fill, W: int):
    w = d.textlength(text, font=font)
    d.text(((W - w) / 2, y), text, font=font, fill=fill)


def render_end_card(W: int, H: int, c: dict) -> Image.Image:
    img = Image.new("RGB", (W, H), (8, 8, 10))
    d = ImageDraw.Draw(img)
    s = min(W, H) / 1080  # scale unit
    # subtle vignette rings
    for i in range(6):
        r = int(min(W, H) * (0.55 + i * 0.12))
        d.ellipse([W / 2 - r, H * 0.42 - r, W / 2 + r, H * 0.42 + r], outline=(20 + i * 3, 18 + i * 2, 12), width=2)
    y = int(H * (0.16 if H > W else 0.08))
    if os.path.exists(MONOGRAM):
        logo = Image.open(MONOGRAM).convert("RGBA")
        lw = int(300 * s)
        logo.thumbnail((lw, lw), Image.LANCZOS)
        img.paste(logo, (int((W - logo.width) / 2), y), logo)
        y += logo.height + int(40 * s)
    _center(d, y, c["brand"], _font(int(96 * s), serif=True), GOLD, W); y += int(120 * s)
    _center(d, y, c["tagline"].upper(), _font(int(34 * s)), (235, 230, 220), W); y += int(58 * s)
    line_w = int(W * 0.55)
    d.line([(W - line_w) / 2, y, (W + line_w) / 2, y], fill=GOLD, width=max(2, int(2 * s)))
    d.polygon([(W / 2, y - 8 * s), (W / 2 + 8 * s, y), (W / 2, y + 8 * s), (W / 2 - 8 * s, y)], fill=GOLD)
    y += int(40 * s)
    _center(d, y, "  ".join(c["motto"].split(" ")), _font(int(40 * s)), (255, 255, 255), W); y += int(60 * s)
    if c.get("sub"):
        _center(d, y, c["sub"], _font(int(30 * s)), (200, 195, 185), W)
    y += int(50 * s if H > W else 140 * s)
    rows = [("EMAIL", c.get("email")), ("CALL / WHATSAPP", c.get("phone")), ("INSTAGRAM", c.get("instagram")), ("WEBSITE", c.get("website"))]
    rows = [(k, v) for k, v in rows if v]
    if H > W:  # portrait: 2x2 icon grid, like the brand card
        ic = int(120 * s); colw = W / 2
        for i, (k, v) in enumerate(rows):
            cx = colw * (i % 2) + colw / 2; cy = y + (i // 2) * int(300 * s)
            img.paste(_icon(k, ic), (int(cx - ic / 2), cy), _icon(k, ic))
            kf, vf = _font(int(24 * s)), _font(int(34 * s))
            while d.textlength(v, font=vf) > colw * 0.9 and vf.size > 14:
                vf = _font(vf.size - 2)
            d.text((cx - d.textlength(k, font=kf) / 2, cy + ic + int(18 * s)), k, font=kf, fill=GOLD)
            d.text((cx - d.textlength(v, font=vf) / 2, cy + ic + int(54 * s)), v, font=vf, fill=(255, 255, 255))
        y += ((len(rows) + 1) // 2) * int(300 * s)
    else:  # landscape: columns
        colw = W / max(1, len(rows)); ic = int(96 * s)
        for i, (k, v) in enumerate(rows):
            cx = colw * i + colw / 2
            img.paste(_icon(k, ic), (int(cx - ic / 2), y - ic - int(20 * s)), _icon(k, ic))
            vf = _font(int(36 * s))
            while d.textlength(v, font=vf) > colw * 0.9 and vf.size > 16:
                vf = _font(vf.size - 2)
            for txt, f, col, dy in ((k, _font(int(24 * s)), GOLD, 0), (v, vf, (255, 255, 255), int(36 * s))):
                w = d.textlength(txt, font=f)
                d.text((cx - w / 2, y + dy), txt, font=f, fill=col)
            if i:
                d.line([colw * i, y - 10 * s, colw * i, y + 80 * s], fill=(70, 60, 40), width=2)
        y += int(130 * s)
    _center(d, H - int(120 * s), "  ".join(c["footer"]), _font(int(24 * s)), GOLD, W)
    return img


def _ffmpeg() -> str:
    import shutil
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def _probe_size(path: str) -> tuple[int, int]:
    import re
    out = subprocess.run([_ffmpeg(), "-i", path], capture_output=True, text=True, timeout=60)
    m = re.search(r"Video:.*?\s(\d{3,4})x(\d{3,4})", out.stderr)
    if not m:
        raise RuntimeError("could not read video size")
    return int(m.group(1)), int(m.group(2))


def brand_finish(src: str, dst: str, tmp: str, contacts: dict) -> int:
    """Blocking: watermark every frame + append the end card. Returns appended seconds."""
    W, H = _probe_size(src)
    ff = _ffmpeg()
    # 1) watermark (gold monogram, bottom-right) — reuse the poster stamp for identical placement
    frame = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    wm = stamp_monogram(frame, opacity=0.55)
    wm_path = os.path.join(tmp, "wm.png"); wm.save(wm_path)
    marked = os.path.join(tmp, "marked.mp4")
    subprocess.run([ff, "-y", "-i", src, "-i", wm_path, "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-r", "24",
                    "-pix_fmt", "yuv420p", marked], check=True, capture_output=True, timeout=600)
    # 2) end card clip with fade-in and silent audio track (so concat keeps audio stream)
    card_path = os.path.join(tmp, "card.png"); render_end_card(W, H, contacts).save(card_path)
    card_mp4 = os.path.join(tmp, "card.mp4")
    subprocess.run([ff, "-y", "-loop", "1", "-t", str(END_CARD_SEC), "-i", card_path,
                    "-f", "lavfi", "-t", str(END_CARD_SEC), "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
                    "-vf", "fade=t=in:st=0:d=0.8,format=yuv420p", "-c:v", "libx264", "-preset", "fast", "-crf", "20",
                    "-c:a", "aac", "-b:a", "160k", "-r", "24", "-shortest", card_mp4],
                   check=True, capture_output=True, timeout=300)
    # 3) concat (re-encode for safety: Veo clips may differ in audio params)
    lst = os.path.join(tmp, "final_list.txt")
    with open(lst, "w") as f:
        f.writelines(f"file '{p}'\n" for p in (marked, card_mp4))
    subprocess.run([ff, "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c:v", "libx264", "-preset", "fast", "-crf", "20",
                    "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-pix_fmt", "yuv420p", dst],
                   check=True, capture_output=True, timeout=600)
    return END_CARD_SEC


def mix_narration(video: str, narration_mp3: str, dst: str, ambient_db: float = -14.0) -> None:
    """Blocking: lay a narration track over the video, ducking the clip's own ambient audio."""
    ff = _ffmpeg()
    subprocess.run([ff, "-y", "-i", video, "-i", narration_mp3, "-filter_complex",
                    f"[0:a]volume={ambient_db}dB[amb];[amb][1:a]amix=inputs=2:duration=first:dropout_transition=2[a]",
                    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", dst],
                   check=True, capture_output=True, timeout=600)


def media_duration(path: str) -> float:
    import re
    out = subprocess.run([_ffmpeg(), "-i", path], capture_output=True, text=True, timeout=60).stderr
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out)
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0.0
