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
FONT_PATH = "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"


def _ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


class PromoIn(BaseModel):
    photo_url: str | None = None
    focus: str = "staff verification portal"
    language: str = "en"


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


@router.get("/super/promo-video/{job_id}")
async def promo_video_status(job_id: str, admin=Depends(require_super_admin)):
    doc = await _raw_db.promo_videos.find_one({"id": job_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Job not found")
    return doc


@router.get("/super/promo-videos")
async def promo_video_list(admin=Depends(require_super_admin)):
    return {"videos": await _raw_db.promo_videos.find(
        {"status": "done"}, {"_id": 0}).sort("created_at", -1).to_list(10)}


async def _progress(job_id: str, msg: str):
    await _raw_db.promo_videos.update_one({"id": job_id}, {"$set": {"progress": msg}})


async def _generate(job_id: str, body: PromoIn):
    try:
        await _run_pipeline(job_id, body)
    except Exception as e:
        log.exception("promo video failed")
        await _raw_db.promo_videos.update_one(
            {"id": job_id}, {"$set": {"status": "failed", "error": str(e)[:300]}})


async def _run_pipeline(job_id: str, body: PromoIn):
    lang_note = "Write in Hindi (Devanagari)." if body.language == "hi" else "Write in simple, energetic English."
    script = await _ask_json(
        "You are writing a 35-second Instagram reel voiceover promoting 'Miracurl Salon Suite' — an all-in-one "
        "salon management software (bookings, POS billing, AI marketing agent, WhatsApp/SMS, and its STAR feature: "
        f"the Staff Verification Portal, a trusted registry that helps every salon owner hire verified, "
        f"background-checked staff with one search). Main focus: {body.focus}. {lang_note}",
        'Return JSON: {"voiceover":"<~85 words, spoken style, hook first, end with call to action>",'
        '"scenes":[{"caption":"<max 6 words>","image_prompt":"<visual for this scene, salon/software themed>"} x4]}')
    voiceover = (script.get("voiceover") or "").strip()
    scenes = (script.get("scenes") or [])[:4]
    if not voiceover or len(scenes) < 2:
        raise RuntimeError("Script generation failed — try again")

    await _progress(job_id, "Mira is recording the voiceover…")
    from emergentintegrations.llm.openai import OpenAITextToSpeech
    tts = OpenAITextToSpeech(api_key=os.environ["EMERGENT_LLM_KEY"])
    audio_b64 = await tts.generate_speech_base64(text=voiceover, model="tts-1", voice="shimmer", speed=1.0)
    audio_bytes = base64.b64decode(audio_b64)

    await _progress(job_id, f"Creating {len(scenes)} HD scenes with AI…")
    images = await _collect_scene_images(body.photo_url, scenes)

    await _progress(job_id, "Rendering the HD video (ffmpeg)…")
    video_bytes = await asyncio.to_thread(_render_video, images, [s.get("caption", "") for s in scenes], audio_bytes)

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


async def _collect_scene_images(photo_url: str | None, scenes: list) -> list[bytes]:
    from routes.mira_studio import _key
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
    gen = OpenAIImageGeneration(api_key=_key())
    images: list[bytes] = []
    if photo_url:
        fid = photo_url.rstrip("/").split("/")[-1]
        up = await _raw_db.uploads.find_one({"id": fid}, {"_id": 0})
        if up:
            data, _ = _get_object(up["storage_path"])
            images.append(data)
    need = len(scenes) - len(images)
    for s in scenes[len(images):len(images) + need]:
        prompt = (f"{s.get('image_prompt', 'modern premium salon interior')}. Vertical 9:16 cinematic promo shot, "
                  "premium beauty-tech aesthetic, rich lighting. NO text, NO letters, NO logos, no distorted faces.")
        try:
            out = await gen.generate_images(prompt=prompt, model="gpt-image-1", number_of_images=1)
            if out:
                images.append(out[0])
        except Exception as e:
            log.error("scene image failed: %s", e)
    if not images:
        raise RuntimeError("No scene images could be generated")
    return images


def _caption_frame(img_bytes: bytes, caption: str) -> bytes:
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    scale = max(W / img.width, H / img.height)
    img = img.resize((round(img.width * scale), round(img.height * scale)))
    left, top = (img.width - W) // 2, (img.height - H) // 2
    img = img.crop((left, top, left + W, top + H))
    if caption.strip():
        overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(overlay)
        try:
            font = ImageFont.truetype(FONT_PATH, 74)
        except OSError:
            font = ImageFont.load_default()
        lines = textwrap.wrap(caption.strip(), width=18)[:3]
        line_h = 92
        block_h = line_h * len(lines) + 70
        y0 = H - block_h - 220
        d.rectangle([(0, y0), (W, y0 + block_h)], fill=(12, 12, 18, 175))
        y = y0 + 36
        for ln in lines:
            tw = d.textlength(ln, font=font)
            d.text(((W - tw) / 2, y), ln, font=font, fill=(232, 195, 127, 255))
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


def _render_video(images: list[bytes], captions: list[str], audio_bytes: bytes) -> bytes:
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
            framed = _caption_frame(img, captions[i] if i < len(captions) else "")
            img_path = os.path.join(workdir, f"s{i}.jpg")
            with open(img_path, "wb") as f:
                f.write(framed)
            seg = os.path.join(workdir, f"seg{i}.mp4")
            vf = (f"zoompan=z='min(zoom+0.0009,1.12)':d={frames}:"
                  f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H}:fps={FPS}")
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
