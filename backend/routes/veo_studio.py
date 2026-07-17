"""Veo 3.1 Cinematic Ad Studio (Super Admin) — true AI-generated video ads.

Mira writes a multi-scene ad script for the Miracurl Suite, Google Veo 3.1
(Gemini API, user's GEMINI_API_KEY) renders each 8-second scene as real video
with native audio, and ffmpeg stitches the scenes into one final MP4.
"""
import os
import uuid
import shutil
import asyncio
import logging
import tempfile
import subprocess
import time as _time
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from database import _raw_db
from security import require_super_admin
from services.storage import _put_object

router = APIRouter()
log = logging.getLogger("veo_studio")

VEO_MODEL = os.environ.get("VEO_MODEL", "veo-3.1-generate-preview")
APP_NAME = os.environ.get("APP_NAME", "miracurl")


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


class VeoAdIn(BaseModel):
    concept: str = Field("Full Miracurl Salon Suite ad — online booking, WhatsApp automation, staff payroll, GST billing and the 12-agent AI team, for Indian salon owners", max_length=600)
    scenes: int = Field(2, ge=1, le=4)
    aspect_ratio: str = Field("9:16", pattern=r"^(9:16|16:9)$")


@router.post("/super/veo-ad")
async def create_veo_ad(body: VeoAdIn, admin=Depends(require_super_admin)):
    _gemini_key()
    active = await _raw_db.veo_ads.find_one({"status": "generating"})
    if active:
        raise HTTPException(409, "A Veo ad is already rendering — wait for it to finish.")
    job_id = str(uuid.uuid4())
    await _raw_db.veo_ads.insert_one({
        "id": job_id, "status": "generating", "progress": "Mira is writing the cinematic script…",
        "concept": body.concept, "scenes": body.scenes, "aspect_ratio": body.aspect_ratio,
        "video_url": "", "error": "", "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    asyncio.create_task(_generate(job_id, body))
    return {"job_id": job_id}


STALE_MINUTES = 20


@router.get("/super/veo-ad/{job_id}")
async def veo_ad_status(job_id: str, admin=Depends(require_super_admin)):
    doc = await _raw_db.veo_ads.find_one({"id": job_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Job not found")
    if doc.get("status") == "generating":
        from datetime import timedelta
        last = datetime.fromisoformat(doc.get("updated_at") or doc["created_at"])
        if datetime.now(timezone.utc) - last > timedelta(minutes=STALE_MINUTES):
            msg = "Generation was interrupted (server restart or timeout). Please try again."
            await _raw_db.veo_ads.update_one({"id": job_id}, {"$set": {"status": "failed", "error": msg}})
            doc.update({"status": "failed", "error": msg})
    return doc


@router.get("/super/veo-ads")
async def veo_ad_list(admin=Depends(require_super_admin)):
    return {"videos": await _raw_db.veo_ads.find(
        {"status": "done"}, {"_id": 0}).sort("created_at", -1).to_list(10),
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
    out = await _ask_json(
        "You are a world-class video ad director writing Veo 3.1 prompts. Each scene prompt must be a rich, "
        "cinematic single-paragraph description: subject, action, camera motion, lighting, mood, and spoken "
        "dialogue/voiceover in quotes (Veo generates real audio). Setting: modern premium INDIAN salons, "
        "Indian owners/staff/clients. The product is 'Miracurl Suite' salon software.",
        f"Ad concept: {body.concept}\n"
        f"Write exactly {body.scenes} scene prompts for consecutive 8-second video clips that flow as one ad. "
        "Rules per scene: 1080p cinematic quality; include one short spoken line (Indian-English accent) in "
        "double quotes that continues the story; final scene must end with a call to action mentioning "
        "'miracurl hyphen suite dot com'. Avoid on-screen text requests except a subtle logo mention in the last scene. "
        'Return JSON: {"scenes": ["<scene 1 prompt>", ...]}')
    scenes = [s for s in (out.get("scenes") or []) if isinstance(s, str) and s.strip()]
    if not scenes:
        raise RuntimeError("Script writing failed — try again")
    return scenes[:body.scenes]


def _render_scene(prompt: str, aspect_ratio: str, out_path: str):
    """Blocking: generate one Veo clip and save to out_path."""
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    op = client.models.generate_videos(
        model=VEO_MODEL, prompt=prompt,
        config=types.GenerateVideosConfig(aspect_ratio=aspect_ratio))
    deadline = _time.time() + 600
    while not op.done:
        if _time.time() > deadline:
            raise RuntimeError("Veo generation timed out (10 min)")
        _time.sleep(10)
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
    try:
        scenes = await _write_script(body)
        await _raw_db.veo_ads.update_one({"id": job_id}, {"$set": {"script": scenes}})
        clip_paths = []
        for i, prompt in enumerate(scenes, 1):
            await _progress(job_id, f"🎬 Veo is filming scene {i} of {len(scenes)} (~1-3 min per scene)…")
            path = os.path.join(tmp, f"scene{i}.mp4")
            await asyncio.to_thread(_render_scene, prompt, body.aspect_ratio, path)
            clip_paths.append(path)
        await _progress(job_id, "🎞️ Stitching scenes into the final ad…")
        final = os.path.join(tmp, "final.mp4")
        await asyncio.to_thread(_concat_clips, clip_paths, final)
        with open(final, "rb") as f:
            video_bytes = f.read()
        fid = str(uuid.uuid4())
        path = f"{APP_NAME}/superadmin/veo-ads/{fid}.mp4"
        result = _put_object(path, video_bytes, "video/mp4")
        await _raw_db.uploads.insert_one({
            "id": fid, "tenant_id": "superadmin", "kind": "veo_ad",
            "storage_path": result.get("path", path), "original_filename": f"veo-ad-{fid}.mp4",
            "content_type": "video/mp4", "size": len(video_bytes), "uploaded_by": "veo_studio",
            "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await _raw_db.veo_ads.update_one({"id": job_id}, {"$set": {
            "status": "done", "progress": "Ready!", "video_url": f"/api/files/{fid}",
            "size_mb": round(len(video_bytes) / 1048576, 1),
            "duration_sec": len(scenes) * 8}})
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
