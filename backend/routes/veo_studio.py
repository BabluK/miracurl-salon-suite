"""Veo 3.1 Cinematic Ad Studio (Super Admin) — true AI-generated video ads.

Mira writes a multi-scene ad script for the Miracurl Suite, Google Veo 3.1
(Gemini API, user's GEMINI_API_KEY) renders each 8-second scene as real video
with native audio, and ffmpeg stitches the scenes into one final MP4.
"""
import os
import math
import uuid
import shutil
import asyncio
import logging
import tempfile
import subprocess
import time as _time
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel, Field

from database import _raw_db
from security import require_super_admin
from services.storage import _put_object, _get_object, validate_image_bytes
from services.veo_brand import get_brand_contacts, brand_finish, END_CARD_SEC, mix_narration, media_duration

router = APIRouter()
log = logging.getLogger("veo_studio")

VEO_MODEL = os.environ.get("VEO_MODEL", "veo-3.1-generate-preview")
APP_NAME = os.environ.get("APP_NAME", "miracurl")
STALE_MINUTES = 20
STALE_MSG = "Generation was interrupted (server restart or timeout). Please try again."


def _gemini_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        raise HTTPException(400, "GEMINI_API_KEY not configured — paste your Google Gemini API key (with billing) in settings to enable Veo video generation.")
    return key


def _ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


SPOKESPERSON = ("a confident, elegant Indian woman in her early 30s, glowing skin, sleek dark hair, wearing a tailored "
                "champagne-gold blazer with a small gold 'MS' pin — the Miracurl Suite brand ambassador, same face and outfit in every scene")
DURATION_SCENES = {16: 2, 30: 4, 40: 5, 60: 8}  # Veo films 8-second scenes; +4s branded end card


class VeoAdIn(BaseModel):
    concept: str = Field("Full Miracurl Salon Suite ad — online booking, WhatsApp automation, staff payroll, GST billing and the 12-agent AI team, for Indian salon owners", max_length=600)
    scenes: int = Field(2, ge=1, le=8)
    duration: int | None = None  # 30 | 40 | 60 → overrides scenes
    aspect_ratio: str = Field("9:16", pattern=r"^(9:16|16:9)$")
    mode: str = Field("spokesperson", pattern=r"^(cinematic|spokesperson|photo|narrated)$")
    voiceover: str | None = Field(None, max_length=2500)  # narrated: your exact script, one consistent TTS narrator
    narrator: str = Field("nova", pattern=r"^(nova|shimmer|alloy|echo|onyx|fable)$")  # nova = American female
    end_card: dict | None = None  # narrated: override brand/tagline/motto/sub/website/instagram/email/phone
    photo_id: str | None = None  # uploaded reference photo (founder / brand) → image-to-video
    brand_card: bool = True


class BrandContactsIn(BaseModel):
    phone: str = Field("", max_length=40)
    instagram: str = Field("", max_length=60)
    email: str = Field("", max_length=120)
    website: str = Field("", max_length=120)
    tagline: str = Field("", max_length=80)


@router.get("/super/brand-contacts")
async def brand_contacts_get(admin=Depends(require_super_admin)):
    return await get_brand_contacts()


@router.put("/super/brand-contacts")
async def brand_contacts_put(body: BrandContactsIn, admin=Depends(require_super_admin)):
    vals = {k: v.strip() for k, v in body.model_dump().items()}
    if vals.get("instagram") and not vals["instagram"].startswith("@"):
        vals["instagram"] = "@" + vals["instagram"].lstrip("@")
    keep = {k: v for k, v in vals.items() if v}
    drop = {k: "" for k, v in vals.items() if not v}
    update = {"$set": {"key": "brand_contacts", **keep}}
    if drop:
        update["$unset"] = drop
    await _raw_db.hq_settings.update_one({"key": "brand_contacts"}, update, upsert=True)
    return await get_brand_contacts()


@router.post("/super/veo-ad/photo")
async def veo_photo_upload(file: UploadFile = File(...), admin=Depends(require_super_admin)):
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(400, "Photo must be under 8 MB")
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ("png", "jpg", "jpeg", "webp"):
        raise HTTPException(400, "Upload a PNG, JPG or WebP photo")
    validate_image_bytes(ext, data)
    fid = str(uuid.uuid4())
    path = f"{APP_NAME}/superadmin/veo-photos/{fid}.{ext}"
    result = await asyncio.to_thread(_put_object, path, data, f"image/{'jpeg' if ext in ('jpg', 'jpeg') else ext}")
    await _raw_db.uploads.insert_one({
        "id": fid, "tenant_id": "superadmin", "kind": "veo_photo", "storage_path": result.get("path", path),
        "original_filename": file.filename, "content_type": file.content_type, "size": len(data),
        "uploaded_by": "veo_studio", "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat()})
    return {"photo_id": fid, "url": f"/api/files/{fid}"}


AVATAR_PATH = "/app/frontend/public/assets/mira-avatar.png"


def _is_stale(doc: dict) -> bool:
    from datetime import timedelta
    last = datetime.fromisoformat(doc.get("updated_at") or doc["created_at"])
    return datetime.now(timezone.utc) - last > timedelta(minutes=STALE_MINUTES)


async def sweep_stale_veo_jobs():
    """On startup: fail 'generating' jobs whose heartbeat is older than the stale window."""
    from datetime import timedelta
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=STALE_MINUTES)).isoformat()
        await _raw_db.veo_ads.update_many(
            {"status": "generating",
             "$or": [{"updated_at": {"$lt": cutoff}},
                     {"updated_at": {"$exists": False}, "created_at": {"$lt": cutoff}}]},
            {"$set": {"status": "failed", "error": STALE_MSG}})
    except Exception as e:
        log.error("stale veo cleanup failed: %s", e)


@router.post("/super/veo-ad/{job_id}/resume")
async def resume_veo_ad(job_id: str, admin=Depends(require_super_admin)):
    """Continue a failed/interrupted job — already-filmed scenes are kept (saved to storage as they finish)."""
    job = await _raw_db.veo_ads.find_one({"id": job_id}, {"_id": 0})
    if not job or not job.get("params"):
        raise HTTPException(404, "Job not found or too old to resume")
    if job.get("status") == "done":
        return {"ok": True, "status": "done"}
    if await _raw_db.veo_ads.find_one({"status": "generating", "id": {"$ne": job_id}}):
        raise HTTPException(409, "Another ad is still generating")
    await _raw_db.veo_ads.update_one({"id": job_id}, {"$set": {"status": "generating", "error": None,
                                                              "progress": f"Resuming — {len(job.get('clips') or {})} scenes already filmed…",
                                                              "updated_at": datetime.now(timezone.utc).isoformat()}})
    asyncio.create_task(_generate(job_id, VeoAdIn(**job["params"])))
    return {"ok": True, "kept_scenes": len(job.get("clips") or {})}


@router.post("/super/veo-ad")
async def create_veo_ad(body: VeoAdIn, admin=Depends(require_super_admin)):
    _gemini_key()
    active = await _raw_db.veo_ads.find_one({"status": "generating"})
    if active:
        if _is_stale(active):
            await _raw_db.veo_ads.update_one({"id": active["id"]},
                                             {"$set": {"status": "failed", "error": STALE_MSG}})
        else:
            raise HTTPException(409, "A Veo ad is already rendering — wait for it to finish.")
    if body.duration:
        if body.duration not in DURATION_SCENES:
            raise HTTPException(400, "Duration must be 30, 40 or 60 seconds")
        body.scenes = DURATION_SCENES[body.duration]
    if body.photo_id and not await _raw_db.uploads.find_one({"id": body.photo_id, "kind": "veo_photo"}):
        raise HTTPException(404, "Uploaded photo not found — please upload it again")
    job_id = str(uuid.uuid4())
    await _raw_db.veo_ads.insert_one({
        "id": job_id, "status": "generating", "progress": "Mira is writing the cinematic script…",
        "concept": body.concept, "scenes": body.scenes, "aspect_ratio": body.aspect_ratio, "mode": body.mode,
        "duration": body.duration, "photo_id": body.photo_id, "brand_card": body.brand_card, "params": body.model_dump(),
        "video_url": "", "error": "", "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    asyncio.create_task(_generate(job_id, body))
    return {"job_id": job_id}


@router.get("/super/veo-ad/{job_id}")
async def veo_ad_status(job_id: str, admin=Depends(require_super_admin)):
    doc = await _raw_db.veo_ads.find_one({"id": job_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Job not found")
    if doc.get("status") == "generating" and _is_stale(doc):
        await _raw_db.veo_ads.update_one({"id": job_id}, {"$set": {"status": "failed", "error": STALE_MSG}})
        doc.update({"status": "failed", "error": STALE_MSG})
    return doc


@router.get("/super/veo-ads")
async def veo_ad_list(admin=Depends(require_super_admin)):
    active = await _raw_db.veo_ads.find_one({"status": "generating"}, {"_id": 0})
    if active and _is_stale(active):
        await _raw_db.veo_ads.update_one({"id": active["id"]},
                                         {"$set": {"status": "failed", "error": STALE_MSG}})
        active = None
    return {"videos": await _raw_db.veo_ads.find(
        {"status": "done"}, {"_id": 0}).sort("created_at", -1).to_list(10),
        "active": active,
        "configured": bool(os.environ.get("GEMINI_API_KEY"))}


@router.delete("/super/veo-ad/{job_id}")
async def veo_ad_delete(job_id: str, admin=Depends(require_super_admin)):
    doc = await _raw_db.veo_ads.find_one({"id": job_id}, {"_id": 0, "video_url": 1})
    if not doc:
        raise HTTPException(404, "Not found")
    fid = (doc.get("video_url") or "").rstrip("/").split("/")[-1]
    if fid:
        await _raw_db.uploads.delete_one({"id": fid})
    await _raw_db.veo_ads.delete_one({"id": job_id})
    return {"deleted": 1}


async def _progress(job_id: str, msg: str):
    await _raw_db.veo_ads.update_one(
        {"id": job_id},
        {"$set": {"progress": msg, "updated_at": datetime.now(timezone.utc).isoformat()}})


async def _write_script(body: VeoAdIn) -> list:
    from routes.mira_studio import _ask_json
    if body.mode == "spokesperson":
        system = (
            f"You are a world-class ad director writing Veo 3.1 prompts for a SPEAKING spokesperson ad. The presenter is {SPOKESPERSON}. "
            "She appears in EVERY scene, framed medium close-up or medium shot, looking into the lens and speaking with natural lip-sync, "
            "in premium Indian salon / restaurant settings (marble reception, styling chairs, warm golden light, soft bokeh). "
            "Alternate camera moves (slow push-in, gentle orbit, handheld walk-and-talk). Cinematic film look, shallow depth of field.")
        task = (
            f"Ad concept: {body.concept}\n"
            f"Write exactly {body.scenes} scenes for consecutive 8-second clips forming ONE flowing ad. Each scene: the setting + "
            "what she does + camera move, and the exact words she speaks (Indian-English, 16-20 words, natural, confident, continuing the "
            "previous line). Final line ends with a call to action mentioning miracurl hyphen suite dot com. "
            'Return JSON: {"scenes": [{"visual": "<plain text, no quotation marks>", "line": "<exact spoken words, no quotation marks>"}]}')
    elif body.mode == "narrated":
        system = (
            "You are a world-class commercial director writing Veo 3.1 prompts for SILENT cinematic b-roll (no speech, no on-screen "
            "text) that a separate narrator will be laid over. Premium modern Indian salon settings, real people, warm golden light, "
            "shallow depth of field, smooth camera moves, 1080p film look. Every scene ends with 'No text, no captions, no logos, "
            "ambient sound only, nobody speaks.'")
        task = (
            f"Ad concept: {body.concept}\n"
            f"Narration the visuals must follow, in order:\n\"\"\"{body.voiceover}\"\"\"\n"
            f"Split the narration into exactly {body.scenes} consecutive 8-second beats and write one visual per beat that "
            "illustrates those words (opening: overwhelmed owner, ringing phones, waiting customers, paperwork; then calm, "
            "organised salon using tablets/phone; finish on happy owner and clients). "
            'Return JSON: {"scenes": [{"visual": "<plain text, no quotation marks>", "line": ""}]}')
    elif body.mode == "photo":
        system = (
            "You are a video ad director writing Veo 3.1 IMAGE-TO-VIDEO prompts. A reference photo (the founder / "
            "brand of 'Miracurl Suite' salon software) is supplied for EVERY scene — keep that exact person/brand "
            "look consistent, in premium Indian salon settings, warm golden lighting, cinematic camera motion.")
        task = (
            f"Ad concept: {body.concept}\n"
            f"Write exactly {body.scenes} scenes for consecutive 8-second clips forming ONE flowing ad. Each scene: what "
            "the person in the reference photo does + camera move, and one short spoken voiceover line (Indian-English, "
            "~18 words) continuing the story; final line ends with a call to action mentioning miracurl hyphen suite dot com. "
            'Return JSON: {"scenes": [{"visual": "<plain text, no quotation marks>", "line": "<spoken words, no quotation marks>"}]}')
    else:
        system = (
            "You are a world-class video ad director writing Veo 3.1 prompts. Each scene needs a rich cinematic "
            "description: subject, action, camera motion, lighting, mood. Setting: modern premium INDIAN salons, "
            "Indian owners/staff/clients. The product is 'Miracurl Suite' salon software.")
        task = (
            f"Ad concept: {body.concept}\n"
            f"Write exactly {body.scenes} scenes for consecutive 8-second video clips that flow as one ad, "
            "1080p cinematic quality. Each scene has one short spoken voiceover line (Indian-English accent) "
            "continuing the story; final scene's line ends with a call to action mentioning "
            "miracurl hyphen suite dot com. "
            'Return JSON: {"scenes": [{"visual": "<cinematic scene description — plain text, no quotation marks>", '
            '"line": "<the spoken voiceover words — no quotation marks>"}]}')
    for _attempt in range(2):
        out = await _ask_json(system, task)
        scenes = []
        for s in (out.get("scenes") or []):
            if isinstance(s, dict):
                visual = str(s.get("visual") or "").strip()
                line = str(s.get("line") or "").replace('"', "'").strip()
                if visual or line:
                    if body.mode == "spokesperson":
                        scenes.append(f'{SPOKESPERSON}. {visual} She looks into the camera and says, lips in sync: "{line}"' if line
                                      else f"{SPOKESPERSON}. {visual}")
                    elif body.mode == "narrated":
                        scenes.append(visual)
                    elif body.mode == "photo":
                        scenes.append(f'The person from the reference image. {visual} They look into the camera and say, lips in sync: "{line}"' if line else visual)
                    else:
                        scenes.append(f'{visual} Voiceover in warm Indian-English says: "{line}"' if line else visual)
            elif isinstance(s, str) and s.strip():
                scenes.append(s.strip())
        if scenes:
            return scenes[:body.scenes]
    raise RuntimeError("Script writing failed — try again")


def _render_scene(prompt: str, aspect_ratio: str, out_path: str, image_path: str = None, beat=None):
    """Blocking: generate one Veo clip (optionally image-to-video from avatar) and save to out_path."""
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    kwargs = {}
    if image_path and os.path.exists(image_path):
        with open(image_path, "rb") as f:
            kwargs["image"] = types.Image(image_bytes=f.read(), mime_type="image/png")
    op = None
    for attempt in range(6):  # Veo preview has tight per-minute limits — back off instead of failing the whole ad
        try:
            op = client.models.generate_videos(
                model=VEO_MODEL, prompt=prompt, **kwargs,
                config=types.GenerateVideosConfig(aspect_ratio=aspect_ratio))
            break
        except Exception as e:
            msg = str(e)
            if "429" in msg and "exceeded your current quota" in msg and attempt < 5:
                log.warning("Veo rate-limited, retry %d in 70s", attempt + 1)
                for _ in range(7):
                    _time.sleep(10)
                    if beat:
                        beat()
                continue
            raise
    deadline = _time.time() + 600
    while not op.done:
        if _time.time() > deadline:
            raise RuntimeError("Veo generation timed out (10 min)")
        _time.sleep(10)
        if beat:
            beat()
        op = client.operations.get(op)
    if getattr(op, "error", None):
        raise RuntimeError(str(op.error)[:200])
    vids = getattr(op.response, "generated_videos", None) or []
    if not vids:
        raise RuntimeError("Veo returned no video (prompt may have been blocked)")
    client.files.download(file=vids[0].video)
    vids[0].video.save(out_path)


def _concat_clips(paths: list, out_path: str):
    if len(paths) == 1:
        shutil.copy(paths[0], out_path)
        return
    list_file = out_path + ".txt"
    with open(list_file, "w") as f:
        f.writelines(f"file '{p}'\n" for p in paths)
    subprocess.run([_ffmpeg(), "-y", "-f", "concat", "-safe", "0", "-i", list_file,
                    "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac", "-b:a", "160k",
                    out_path], check=True, capture_output=True, timeout=300)
    os.remove(list_file)


async def _generate(job_id: str, body: VeoAdIn):
    tmp = tempfile.mkdtemp(prefix="veo_")
    loop = asyncio.get_running_loop()

    async def _touch():
        await _raw_db.veo_ads.update_one(
            {"id": job_id}, {"$set": {"updated_at": datetime.now(timezone.utc).isoformat()}})

    def _beat():
        asyncio.run_coroutine_threadsafe(_touch(), loop)
    try:
        photo_path = None
        if body.photo_id:
            up = await _raw_db.uploads.find_one({"id": body.photo_id, "kind": "veo_photo"})
            if up:
                data, _ct = await asyncio.to_thread(_get_object, up["storage_path"])
                photo_path = os.path.join(tmp, "ref.png")
                with open(photo_path, "wb") as f:
                    f.write(data)
        narration_path, narr_sec = None, 0.0
        if body.mode == "narrated":
            if not (body.voiceover or "").strip():
                raise RuntimeError("Narrated mode needs a voiceover script")
            await _progress(job_id, "🎙️ Recording the narrator…")
            from emergentintegrations.llm.openai import OpenAITextToSpeech
            import base64
            tts = OpenAITextToSpeech(api_key=os.environ["EMERGENT_LLM_KEY"])
            b64 = await tts.generate_speech_base64(text=body.voiceover.strip(), model="tts-1-hd", voice=body.narrator, speed=1.0)
            narration_path = os.path.join(tmp, "narration.mp3")
            with open(narration_path, "wb") as f:
                f.write(base64.b64decode(b64))
            narr_sec = await asyncio.to_thread(media_duration, narration_path)
            # enough 8-second scenes so the film (plus 4s end card) covers the narration
            body.scenes = max(2, min(8, math.ceil(max(0.0, narr_sec - END_CARD_SEC + 0.5) / 8)))
            await _raw_db.veo_ads.update_one({"id": job_id}, {"$set": {"scenes": body.scenes, "narration_sec": round(narr_sec, 1)}})
        prev = await _raw_db.veo_ads.find_one({"id": job_id}, {"_id": 0, "script": 1, "clips": 1}) or {}
        scenes = prev.get("script") if prev.get("script") and len(prev["script"]) == body.scenes else await _write_script(body)
        await _raw_db.veo_ads.update_one({"id": job_id}, {"$set": {"script": scenes}})
        saved = prev.get("clips") or {}
        clip_paths = []
        for i, prompt in enumerate(scenes, 1):
            path = os.path.join(tmp, f"scene{i}.mp4")
            if str(i) in saved:  # filmed before an interruption — pull from storage, don't pay twice
                data, _ct = await asyncio.to_thread(_get_object, saved[str(i)])
                with open(path, "wb") as f:
                    f.write(data)
                clip_paths.append(path)
                continue
            await _progress(job_id, f"🎬 Veo is filming scene {i} of {len(scenes)} (~1-3 min per scene)…")
            # reference photo drives every scene in photo mode, the opening scene otherwise
            ref = photo_path if (body.mode == "photo" or i == 1) else None
            await asyncio.to_thread(_render_scene, prompt, body.aspect_ratio, path, ref, _beat)
            clip_paths.append(path)
            with open(path, "rb") as f:
                clip_bytes = f.read()
            spath = f"{APP_NAME}/superadmin/veo-clips/{job_id}/scene{i}.mp4"
            res = await asyncio.to_thread(_put_object, spath, clip_bytes, "video/mp4")
            await _raw_db.veo_ads.update_one({"id": job_id}, {"$set": {f"clips.{i}": res.get("path", spath)}})
        await _progress(job_id, "🎞️ Stitching scenes into the final ad…")
        stitched = os.path.join(tmp, "stitched.mp4")
        await asyncio.to_thread(_concat_clips, clip_paths, stitched)
        final, extra = stitched, 0
        if body.brand_card:
            await _progress(job_id, "✨ Adding the Miracurl Suite watermark and brand end card…")
            try:
                contacts = await get_brand_contacts()
                if body.end_card:
                    contacts = {**contacts, **{k: v for k, v in body.end_card.items() if isinstance(v, str)}}
                final = os.path.join(tmp, "final.mp4")
                extra = await asyncio.to_thread(brand_finish, stitched, final, tmp, contacts)
            except Exception as e:  # never lose a paid render because of the overlay pass
                log.error("brand finish failed, shipping unbranded: %s", e)
                final, extra = stitched, 0
        if narration_path:
            await _progress(job_id, "🔊 Mixing the narration over the film…")
            mixed = os.path.join(tmp, "mixed.mp4")
            await asyncio.to_thread(mix_narration, final, narration_path, mixed)
            final = mixed
        await _progress(job_id, "☁️ Uploading the final ad to your gallery…")
        video_bytes = await asyncio.to_thread(lambda: open(final, "rb").read())
        fid = str(uuid.uuid4())
        path = f"{APP_NAME}/superadmin/veo-ads/{fid}.mp4"
        result = await asyncio.to_thread(_put_object, path, video_bytes, "video/mp4")
        await _raw_db.uploads.insert_one({
            "id": fid, "tenant_id": "superadmin", "kind": "veo_ad",
            "storage_path": result.get("path", path), "original_filename": f"veo-ad-{fid}.mp4",
            "content_type": "video/mp4", "size": len(video_bytes), "uploaded_by": "veo_studio",
            "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await _raw_db.veo_ads.update_one({"id": job_id}, {"$set": {
            "status": "done", "progress": "Ready!", "video_url": f"/api/files/{fid}",
            "size_mb": round(len(video_bytes) / 1048576, 1),
            "duration_sec": len(scenes) * 8 + extra, "branded": extra > 0}})
    except Exception as e:
        log.exception("veo ad failed")
        msg = str(e)
        if "API key" in msg or "PERMISSION_DENIED" in msg or "403" in msg:
            msg = "Gemini API rejected the key — ensure the key is valid, billing is enabled, and the Generative Language API is allowed for it. " + msg[:150]
        elif "quota" in msg.lower() or "RESOURCE_EXHAUSTED" in msg:
            msg = "Gemini quota/billing limit hit — check your Google Cloud billing. " + msg[:150]
        await _raw_db.veo_ads.update_one({"id": job_id}, {"$set": {"status": "failed", "error": msg[:400], "progress": ""}})
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
