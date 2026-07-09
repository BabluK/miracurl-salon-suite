"""Super-Admin Promo Video Studio.

Auto-generates an HD Instagram-reel style promo video (1080x1920 MP4) for
marketing the software: LLM writes the script (spotlight on the Staff
Verification Portal), OpenAI TTS narrates it, gpt-image-1 creates the visuals
(optionally the owner's own photo as the opening scene), PIL burns captions,
and ffmpeg assembles a Ken-Burns slideshow with the voiceover.
"""
import io
import os
import re
import uuid
import base64
import shutil
import asyncio
import logging
import subprocess
import textwrap
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from PIL import Image, ImageDraw, ImageFont

from database import _raw_db
from security import require_super_admin
from services.storage import _put_object, _get_object
from routes.mira_studio import _ask_json

router = APIRouter()
log = logging.getLogger("promo_video")

APP_NAME = os.environ.get("APP_NAME", "miracurl")
W, H, FPS = 1080, 1920, 25
SIZES = {"reel": (1080, 1920), "square": (1080, 1080), "landscape": (1920, 1080)}
FONT_PATH = "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"


def _ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


class PromoIn(BaseModel):
    photo_url: str | None = None
    mode: str = "feature_tour"  # feature_tour | custom
    focus: str = "staff verification portal"
    language: str = "en"
    size: str = "reel"  # reel (9:16) | square (1:1) | landscape (16:9)
    express: bool = False  # True = real app screenshots (fast), False = AI-generated scenes


@router.post("/super/promo-video")
async def create_promo_video(body: PromoIn, admin=Depends(require_super_admin)):
    job_id = str(uuid.uuid4())
    await _raw_db.promo_videos.insert_one({
        "id": job_id, "status": "generating", "progress": "Mira is writing the script…",
        "focus": body.focus, "video_url": "", "error": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    asyncio.create_task(_generate(job_id, body))
    return {"job_id": job_id}


STALE_MINUTES = 12


@router.get("/super/promo-video/{job_id}")
async def promo_video_status(job_id: str, admin=Depends(require_super_admin)):
    doc = await _raw_db.promo_videos.find_one({"id": job_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Job not found")
    if doc.get("status") == "generating":
        from datetime import timedelta
        last_beat = datetime.fromisoformat(doc.get("updated_at") or doc["created_at"])
        if datetime.now(timezone.utc) - last_beat > timedelta(minutes=STALE_MINUTES):
            await _raw_db.promo_videos.update_one({"id": job_id}, {"$set": {
                "status": "failed",
                "error": "Generation was interrupted (server restart or timeout). Please click Generate again."}})
            doc["status"] = "failed"
            doc["error"] = "Generation was interrupted (server restart or timeout). Please click Generate again."
    return doc


@router.get("/super/promo-videos")
async def promo_video_list(admin=Depends(require_super_admin)):
    return {"videos": await _raw_db.promo_videos.find(
        {"status": "done"}, {"_id": 0}).sort("created_at", -1).to_list(10)}


async def _progress(job_id: str, msg: str):
    await _raw_db.promo_videos.update_one(
        {"id": job_id},
        {"$set": {"progress": msg, "updated_at": datetime.now(timezone.utc).isoformat()}})


async def _generate(job_id: str, body: PromoIn):
    try:
        await _run_pipeline(job_id, body)
    except Exception as e:
        log.exception("promo video failed")
        await _raw_db.promo_videos.update_one(
            {"id": job_id}, {"$set": {"status": "failed", "error": str(e)[:300]}})
        await _notify_email(
            "Promo reel generation failed ⚠️",
            f"<p>Mira couldn't finish your promo reel.</p><p><b>Error:</b> {str(e)[:300]}</p>"
            "<p>Open Super Admin → Promo Video and click Generate again.</p>")


async def _notify_email(subject: str, html: str):
    hq = os.environ.get("HQ_EMAIL", "")
    if not hq:
        return
    try:
        from email_service import _send_email
        await _send_email([hq], subject, html)
    except Exception as e:
        log.error("promo email notify failed: %s", e)


MIRA_INTRO = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "mira_intro.png")
MIRA_OUTRO = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "mira_outro.png")
BRAND_LOGO = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "brand_logo.png")

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


async def _run_pipeline(job_id: str, body: PromoIn):
    lang_note = "Write in Hindi (Devanagari)." if body.language == "hi" else "Write in simple, energetic English."
    if body.mode == "feature_tour":
        sys = ("You ARE Mira — the golden AI assistant of 'Miracurl Salon Suite'. Write a 45-second Instagram reel "
               f"voiceover in FIRST PERSON where you introduce yourself ('Hi, I'm Mira!') and tour ALL the software's "
               f"features: {ALL_FEATURES}. Spotlight the Staff Verification Portal. {lang_note}")
        user = ('Return JSON: {"voiceover":"<~110 words, spoken style, warm confident female AI host, hook first, '
                'end with a call to action to get Miracurl Salon Suite>",'
                '"scenes":[{"caption":"<max 6 words>","image_prompt":"<visual, salon/software themed>"} x4]}')
    else:
        sys = ("You are writing a 35-second Instagram reel voiceover promoting 'Miracurl Salon Suite' — an all-in-one "
               f"salon management software ({ALL_FEATURES}). Main focus: {body.focus}. {lang_note}")
        user = ('Return JSON: {"voiceover":"<~85 words, spoken style, hook first, end with call to action>",'
                '"scenes":[{"caption":"<max 6 words>","image_prompt":"<visual for this scene, salon/software themed>"} x4]}')
    script = await _ask_json(sys, user)
    voiceover = (script.get("voiceover") or "").strip()
    scenes = (script.get("scenes") or [])[:4]
    if not voiceover or len(scenes) < 2:
        raise RuntimeError("Script generation failed — try again")

    await _progress(job_id, "Recording voiceover + creating scenes in parallel…")

    async def _tts() -> bytes:
        from emergentintegrations.llm.openai import OpenAITextToSpeech
        tts = OpenAITextToSpeech(api_key=os.environ["EMERGENT_LLM_KEY"])
        b64 = await tts.generate_speech_base64(text=voiceover, model="tts-1", voice="shimmer", speed=1.0)
        return base64.b64decode(b64)

    audio_bytes, (images, captions, fits) = await asyncio.gather(_tts(), _build_scenes(body, scenes))

    vw, vh = SIZES.get(body.size, SIZES["reel"])
    await _progress(job_id, "Rendering the HD video (ffmpeg)…")
    video_bytes = await asyncio.to_thread(_render_video, images, captions, fits, audio_bytes, vw, vh)

    fid = str(uuid.uuid4())
    path = f"{APP_NAME}/superadmin/promo-videos/{fid}.mp4"
    result = _put_object(path, video_bytes, "video/mp4")
    await _raw_db.uploads.insert_one({
        "id": fid, "tenant_id": "superadmin", "kind": "promo_video",
        "storage_path": result.get("path", path), "original_filename": f"promo-{fid}.mp4",
        "content_type": "video/mp4", "size": len(video_bytes), "uploaded_by": "promo_studio",
        "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await _raw_db.promo_videos.update_one({"id": job_id}, {"$set": {
        "status": "done", "progress": "Ready!", "video_url": f"/api/files/{fid}",
        "voiceover": voiceover, "size_mb": round(len(video_bytes) / 1048576, 1)}})
    site = os.environ.get("APP_PUBLIC_URL", "")
    await _notify_email(
        "Your promo reel is ready 🎬",
        f"<p>Mira finished your promo video ({body.size}, {round(len(video_bytes)/1048576,1)} MB).</p>"
        f"<p><a href='{site}/api/files/{fid}'>Download the MP4</a> or open Super Admin → Promo Video.</p>"
        "<p>Post it on Instagram to attract new salon leads! ✦</p>")


BROCHURE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "brochure")
EXPRESS_SHOTS = ["dashboard.png", "pos.png", "staff.png", "mira.png"]


async def _owner_photo_scene(body: PromoIn, scenes: list) -> tuple[bytes, str] | None:
    fid = body.photo_url.rstrip("/").split("/")[-1]
    up = await _raw_db.uploads.find_one({"id": fid}, {"_id": 0})
    if not up:
        return None
    data, _ = _get_object(up["storage_path"])
    return data, (scenes[0].get("caption", "") if scenes else "")


def _express_scenes(scenes: list) -> list[tuple[bytes, str]]:
    """Real app screenshots — no AI generation, renders in seconds."""
    out = []
    for i, fname in enumerate(EXPRESS_SHOTS):
        path = os.path.join(BROCHURE_DIR, fname)
        if not os.path.exists(path):
            continue
        with open(path, "rb") as f:
            out.append((f.read(), scenes[i].get("caption", "") if i < len(scenes) else ""))
    return out


async def _ai_scenes(body: PromoIn, scenes: list) -> list[tuple[bytes, str]]:
    """HD AI visuals, generated in parallel."""
    from routes.mira_studio import _key
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
    gen = OpenAIImageGeneration(api_key=_key())
    ai_budget = 3 if body.mode == "feature_tour" else 2

    async def _one_scene(s: dict):
        prompt = (f"{s.get('image_prompt', 'modern premium salon interior')}. Vertical 9:16 cinematic promo shot, "
                  "premium beauty-tech aesthetic, rich lighting. NO text, NO letters, NO logos, no distorted faces.")
        try:
            out = await gen.generate_images(prompt=prompt, model="gpt-image-1", number_of_images=1)
            return (out[0] if out else None, s.get("caption", ""))
        except Exception as e:
            log.error("scene image failed: %s", e)
            return (None, "")

    results = await asyncio.gather(*[_one_scene(s) for s in scenes[:ai_budget]])
    return [(img, cap) for img, cap in results if img]


async def _build_scenes(body: PromoIn, scenes: list) -> tuple[list[bytes], list[str], list[bool]]:
    """Mira opens and closes every reel; owner photo (if any) is scene 2; middle is express or AI."""
    images: list[bytes] = []
    captions: list[str] = []
    fits: list[bool] = []

    with open(MIRA_INTRO, "rb") as f:
        images.append(f.read())
    captions.append("Meet Mira - Your Salon AI")
    fits.append(False)

    if body.photo_url:
        photo = await _owner_photo_scene(body, scenes)
        if photo:
            images.append(photo[0])
            captions.append(photo[1])
            fits.append(False)

    middle = _express_scenes(scenes) if body.express else await _ai_scenes(body, scenes)
    for img, cap in middle:
        images.append(img)
        captions.append(cap)
        fits.append(body.express)

    with open(MIRA_OUTRO, "rb") as f:
        outro = f.read()
    images.append(_add_partner_qr(outro))
    captions.append("Get Miracurl Salon Suite")
    fits.append(False)
    captions = [c.replace("✦", "").replace("—", "-").strip() for c in captions]
    return images, captions, fits


def _add_partner_qr(img_bytes: bytes) -> bytes:
    """Bottom-left QR to the /partner demo page on the closing frame."""
    import io
    import qrcode
    url = f"{os.environ.get('APP_PUBLIC_URL', '')}/partner"
    qr = qrcode.QRCode(box_size=10, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="#1c1c22", back_color="white").convert("RGB").resize((300, 300))
    base = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    scale = base.width / 1024
    size = int(300 * scale)
    qr_img = qr_img.resize((size, size))
    pad = int(36 * scale)
    card = Image.new("RGB", (size + pad, size + pad + int(54 * scale)), "white")
    card.paste(qr_img, (pad // 2, pad // 2))
    d = ImageDraw.Draw(card)
    try:
        font = ImageFont.truetype(FONT_PATH, int(30 * scale))
    except OSError:
        font = ImageFont.load_default()
    label = "Scan for FREE demo"
    tw = d.textlength(label, font=font)
    d.text(((card.width - tw) / 2, size + pad // 2 + int(8 * scale)), label, font=font, fill=(28, 28, 34))
    x, y = int(40 * scale), base.height - card.height - int(140 * scale)
    base.paste(card, (x, y))
    buf = io.BytesIO()
    base.save(buf, format="JPEG", quality=92)
    return buf.getvalue()


def _caption_frame(img_bytes: bytes, caption: str, w: int = W, h: int = H, fit: bool = False) -> bytes:
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    if fit:
        # letterbox app screenshots on a dark canvas instead of cropping them
        canvas = Image.new("RGB", (w, h), (16, 13, 22))
        maxw, maxh = w - 90, int(h * 0.62)
        r = min(maxw / img.width, maxh / img.height)
        img = img.resize((round(img.width * r), round(img.height * r)))
        canvas.paste(img, ((w - img.width) // 2, (h - img.height) // 2 - int(h * 0.05)))
        img = canvas
    else:
        scale = max(w / img.width, h / img.height)
        img = img.resize((round(img.width * scale), round(img.height * scale)))
        left, top = (img.width - w) // 2, (img.height - h) // 2
        img = img.crop((left, top, left + w, top + h))
    logo = _brand_logo(max(110, int(w * 0.14)))
    if logo:
        img = img.convert("RGBA")
        img.paste(logo, (w - logo.width - 44, 48), logo)
        img = img.convert("RGB")
    if caption.strip():
        overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(overlay)
        fsize = max(42, int(w * 0.0685))
        try:
            font = ImageFont.truetype(FONT_PATH, fsize)
        except OSError:
            font = ImageFont.load_default()
        lines = textwrap.wrap(caption.strip(), width=max(14, int(w / 60)))[:3]
        line_h = fsize + 18
        block_h = line_h * len(lines) + 70
        y0 = h - block_h - int(h * 0.115)
        d.rectangle([(0, y0), (w, y0 + block_h)], fill=(12, 12, 18, 175))
        y = y0 + 36
        for ln in lines:
            tw = d.textlength(ln, font=font)
            d.text(((w - tw) / 2, y), ln, font=font, fill=(232, 195, 127, 255))
            y += line_h
        img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def _audio_duration(ff: str, audio_path: str) -> float:
    p = subprocess.run([ff, "-i", audio_path, "-f", "null", "-"], capture_output=True, text=True)
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.?\d*)", p.stderr)
    if not m:
        return 35.0
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))


def _render_video(images: list[bytes], captions: list[str], fits: list[bool], audio_bytes: bytes,
                  w: int = W, h: int = H) -> bytes:
    ff = _ffmpeg()
    workdir = f"/tmp/promo_{uuid.uuid4().hex}"
    os.makedirs(workdir, exist_ok=True)
    try:
        audio_path = os.path.join(workdir, "voice.mp3")
        with open(audio_path, "wb") as f:
            f.write(audio_bytes)
        total = _audio_duration(ff, audio_path) + 0.8
        per = total / len(images)
        frames = int(per * FPS)

        seg_paths = []
        for i, img in enumerate(images):
            framed = _caption_frame(img, captions[i] if i < len(captions) else "", w, h,
                                    fit=fits[i] if i < len(fits) else False)
            img_path = os.path.join(workdir, f"s{i}.jpg")
            with open(img_path, "wb") as f:
                f.write(framed)
            seg = os.path.join(workdir, f"seg{i}.mp4")
            vf = (f"zoompan=z='min(zoom+0.0009,1.12)':d={frames}:"
                  f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={w}x{h}:fps={FPS}")
            subprocess.run([ff, "-y", "-i", img_path, "-vf", vf, "-t", f"{per:.2f}",
                            "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", seg],
                           capture_output=True, check=True)
            seg_paths.append(seg)

        concat_list = os.path.join(workdir, "list.txt")
        with open(concat_list, "w") as f:
            f.writelines(f"file '{p}'\n" for p in seg_paths)
        final = os.path.join(workdir, "final.mp4")
        subprocess.run([ff, "-y", "-f", "concat", "-safe", "0", "-i", concat_list,
                        "-i", audio_path, "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
                        "-shortest", "-movflags", "+faststart", final],
                       capture_output=True, check=True)
        with open(final, "rb") as f:
            return f.read()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


async def weekly_promo_scheduler():
    """Every Monday (>=09:00 IST) auto-generate a fresh feature-tour reel and notify HQ inbox."""
    from datetime import timedelta
    # A restart (deploy/reload) kills in-flight jobs — but in multi-worker production a
    # NEW worker starting must not kill healthy jobs on other workers, so only fail
    # jobs whose last heartbeat is older than the stale window.
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=STALE_MINUTES)).isoformat()
        await _raw_db.promo_videos.update_many(
            {"status": "generating",
             "$or": [{"updated_at": {"$lt": cutoff}},
                     {"updated_at": {"$exists": False}, "created_at": {"$lt": cutoff}}]},
            {"$set": {"status": "failed",
                      "error": "Generation was interrupted by a server restart. Please click Generate again."}})
    except Exception as e:
        log.error("stale promo cleanup failed: %s", e)
    while True:
        try:
            ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
            week_key = f"{ist_now.isocalendar().year}-W{ist_now.isocalendar().week}"
            if ist_now.weekday() == 0 and ist_now.hour >= 9:
                exists = await _raw_db.promo_videos.find_one({"week_key": week_key})
                if not exists:
                    job_id = str(uuid.uuid4())
                    await _raw_db.promo_videos.insert_one({
                        "id": job_id, "status": "generating", "progress": "Weekly auto-reel…",
                        "focus": "Weekly feature tour (auto)", "week_key": week_key,
                        "video_url": "", "error": "",
                        "created_at": datetime.now(timezone.utc).isoformat()})
                    await _run_pipeline(job_id, PromoIn(mode="feature_tour"))
                    done = await _raw_db.promo_videos.find_one({"id": job_id}, {"_id": 0})
                    if done and done.get("status") == "done":
                        await _raw_db.hq_messages.insert_one({
                            "id": str(uuid.uuid4()), "tenant_id": "superadmin",
                            "tenant_name": "Mira Auto-Pilot", "from_email": "mira@miracurl",
                            "subject": "Your fresh weekly promo reel is ready 🎬",
                            "message": "Mira generated this week's feature-tour reel. Download it from "
                                       "Super Admin → Promo Video and post it on Instagram to attract new salon leads!",
                            "attachments": [], "read": False,
                            "created_at": datetime.now(timezone.utc).isoformat()})
        except Exception as e:
            log.error("weekly promo scheduler error: %s", e)
        await asyncio.sleep(3600)
