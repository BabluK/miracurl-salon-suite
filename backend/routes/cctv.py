"""AI CCTV Analytics — snapshot-based salon floor analysis via vision LLM (Gemini Flash).
Two connection modes:
  device       — a salon tablet/phone runs the capture page and uploads a frame every few minutes
  snapshot_url — we poll an internet-reachable DVR/camera snapshot URL (e.g. Hikvision ISAPI)
Frames are analyzed one-at-a-time (no video streaming — keeps the weak production CPU safe)."""
import asyncio
import base64
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import db, _raw_db
from security import require_tenant_admin, current_tenant

router = APIRouter()
log = logging.getLogger("cctv")

IST = timedelta(hours=5, minutes=30)
MAX_FRAME_B64 = 4 * 1024 * 1024  # ~3MB image
PREVIEW_B64_CAP = 400_000

VISION_SYSTEM = (
    "You are an expert salon floor analyst looking at a single CCTV frame from an Indian unisex salon. "
    "Count carefully. A 'waiting customer' sits/stands in a waiting area, NOT in a styling chair. "
    "A 'customer in service' is in a styling chair being attended. Staff wear aprons/uniforms or are "
    "actively working. 'Idle staff' are staff visibly not attending any customer. "
    "Styling chairs are the salon chairs in front of mirrors.")

VISION_PROMPT = (
    "Analyze this salon CCTV frame. Return ONLY minified JSON, no markdown:\n"
    '{"people_total":<int>,"waiting_customers":<int>,"customers_in_service":<int>,'
    '"queue_length":<int, people visibly queuing/waiting for their turn>,'
    '"chairs_total":<int styling chairs visible>,"chairs_empty":<int>,'
    '"staff_visible":<int>,"staff_idle":<int>,'
    '"scene_notes":"<one short sentence about what is happening>"}\n'
    "If the frame is too dark/blurry to analyze, set all counts to 0 and explain in scene_notes.")


def _cfg_defaults(tenant_id: str) -> dict:
    return {"tenant_id": tenant_id, "enabled": False, "mode": "device",
            "snapshot_url": "", "username": "", "password": "",
            "interval_min": 5, "business_start": 9, "business_end": 21}


async def _get_cfg(tenant_id: str) -> dict:
    return await _raw_db.cctv_config.find_one({"tenant_id": tenant_id}, {"_id": 0}) or _cfg_defaults(tenant_id)


@router.get("/cctv/config")
async def get_config(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    cfg = await _get_cfg(t["id"])
    cfg.pop("last_frame_b64", None)
    cfg["password"] = "••••••" if cfg.get("password") else ""
    return cfg


class CctvConfigIn(BaseModel):
    enabled: bool = False
    mode: str = "device"  # device | snapshot_url
    snapshot_url: str = ""
    username: str = ""
    password: str = ""
    interval_min: int = Field(5, ge=2, le=60)
    business_start: int = Field(9, ge=0, le=23)
    business_end: int = Field(21, ge=1, le=24)


@router.put("/cctv/config")
async def put_config(body: CctvConfigIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    if body.mode not in ("device", "snapshot_url"):
        raise HTTPException(400, "mode must be 'device' or 'snapshot_url'")
    if body.mode == "snapshot_url" and body.enabled and not body.snapshot_url.startswith(("http://", "https://")):
        raise HTTPException(400, "Enter a valid http(s) snapshot URL for your DVR/camera")
    patch = body.model_dump()
    if patch["password"] == "••••••":  # unchanged
        patch.pop("password")
    await _raw_db.cctv_config.update_one(
        {"tenant_id": t["id"]},
        {"$set": {**patch, "tenant_id": t["id"], "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True)
    return {"ok": True}


async def _analyze_b64(image_b64: str) -> dict:
    """Send one frame to Gemini Flash (vision) and parse the JSON analysis."""
    import json
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    from routes.mira_studio import _key
    chat = LlmChat(
        api_key=_key(), session_id=f"cctv-{uuid.uuid4().hex[:10]}",
        system_message=VISION_SYSTEM,
    ).with_model("gemini", "gemini-3-flash-preview")
    resp = await chat.send_message(UserMessage(text=VISION_PROMPT, file_contents=[ImageContent(image_base64=image_b64)]))
    raw = (resp or "").strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start < 0 or end <= start:
            raise HTTPException(502, "Vision AI returned an unexpected format — try again")
        data = json.loads(raw[start:end + 1])
    out = {k: max(0, int(data.get(k) or 0)) for k in (
        "people_total", "waiting_customers", "customers_in_service", "queue_length",
        "chairs_total", "chairs_empty", "staff_visible", "staff_idle")}
    out["scene_notes"] = str(data.get("scene_notes") or "")[:300]
    return out


async def _record_observation(tenant_id: str, image_b64: str, source: str) -> dict:
    analysis = await _analyze_b64(image_b64)
    obs = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "source": source,
           "at": datetime.now(timezone.utc).isoformat(), **analysis}
    await _raw_db.cctv_observations.insert_one({**obs})
    frame_patch = {"last_observed_at": obs["at"]}
    if len(image_b64) <= PREVIEW_B64_CAP:
        frame_patch["last_frame_b64"] = image_b64
    await _raw_db.cctv_config.update_one(
        {"tenant_id": tenant_id}, {"$set": frame_patch}, upsert=True)
    try:
        await _maybe_flash_alert(tenant_id, obs)
    except Exception as e:
        log.warning(f"flash alert check failed: {e}")
    return obs


FLASH_MIN_EMPTY = 3


async def _maybe_flash_alert(tenant_id: str, obs: dict) -> None:
    """If chairs sit empty across 2+ frames within 90 min (business hours), raise ONE
    flash-offer alert per day — Mira turns it into a limited-time offer on the Dashboard."""
    if obs.get("chairs_empty", 0) < FLASH_MIN_EMPTY:
        return
    ist_now = datetime.now(timezone.utc) + IST
    today = ist_now.date().isoformat()
    if await _raw_db.flash_alerts.find_one({"tenant_id": tenant_id, "date": today}):
        return
    cfg = await _get_cfg(tenant_id)
    if not (int(cfg.get("business_start", 9)) <= ist_now.hour < int(cfg.get("business_end", 21))):
        return
    since = (datetime.now(timezone.utc) - timedelta(minutes=90)).isoformat()
    prev = await _raw_db.cctv_observations.find_one(
        {"tenant_id": tenant_id, "at": {"$gte": since}, "id": {"$ne": obs["id"]},
         "chairs_empty": {"$gte": FLASH_MIN_EMPTY}}, {"_id": 0, "id": 1})
    if not prev:
        return
    await _raw_db.flash_alerts.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": tenant_id, "date": today,
        "empty_chairs": obs["chairs_empty"], "status": "pending",
        "triggered_at": datetime.now(timezone.utc).isoformat()})


class FrameIn(BaseModel):
    image_base64: str


@router.post("/cctv/analyze-frame")
async def analyze_frame(body: FrameIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Capture-mode upload: one JPEG frame (base64) from the salon tablet/phone."""
    b64 = body.image_base64.split(",", 1)[-1].strip()
    if not b64 or len(b64) > MAX_FRAME_B64:
        raise HTTPException(400, "Frame missing or too large — capture at ≤1280px width")
    return {"observation": await _record_observation(t["id"], b64, "device")}


async def _fetch_snapshot(cfg: dict) -> str:
    """GET the DVR/camera snapshot URL (Hikvision ISAPI uses HTTP Digest auth). Returns base64 JPEG."""
    auth = httpx.DigestAuth(cfg.get("username") or "", cfg.get("password") or "") \
        if cfg.get("username") else None
    async with httpx.AsyncClient(timeout=20, verify=False) as client:
        r = await client.get(cfg["snapshot_url"], auth=auth)
        if r.status_code == 401 and auth:  # some DVRs use Basic
            r = await client.get(cfg["snapshot_url"], auth=(cfg["username"], cfg["password"]))
        r.raise_for_status()
        if not r.headers.get("content-type", "").startswith("image"):
            raise HTTPException(400, f"URL did not return an image (got {r.headers.get('content-type')})")
        return base64.b64encode(r.content).decode()


@router.post("/cctv/test-snapshot")
async def test_snapshot(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Fetch one frame from the configured snapshot URL and analyze it immediately."""
    cfg = await _get_cfg(t["id"])
    if not cfg.get("snapshot_url"):
        raise HTTPException(400, "Save a snapshot URL first")
    try:
        b64 = await _fetch_snapshot(cfg)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Couldn't reach your camera: {str(e)[:200]}") from e
    return {"observation": await _record_observation(t["id"], b64, "snapshot_url")}


@router.get("/cctv/latest")
async def latest(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    cfg = await _raw_db.cctv_config.find_one({"tenant_id": t["id"]}, {"_id": 0}) or {}
    obs = await _raw_db.cctv_observations.find_one(
        {"tenant_id": t["id"]}, {"_id": 0}, sort=[("at", -1)])
    # Today's hourly aggregates (IST)
    ist_now = datetime.now(timezone.utc) + IST
    day_start_utc = (datetime(ist_now.year, ist_now.month, ist_now.day, tzinfo=timezone.utc) - IST).isoformat()
    rows = await _raw_db.cctv_observations.find(
        {"tenant_id": t["id"], "at": {"$gte": day_start_utc}}, {"_id": 0}).to_list(600)
    hourly: dict = {}
    for r in rows:
        h = (datetime.fromisoformat(r["at"]) + IST).hour
        b = hourly.setdefault(h, {"n": 0, "waiting": 0, "empty": 0, "queue": 0, "idle": 0})
        b["n"] += 1
        b["waiting"] += r.get("waiting_customers", 0)
        b["empty"] += r.get("chairs_empty", 0)
        b["queue"] = max(b["queue"], r.get("queue_length", 0))
        b["idle"] += r.get("staff_idle", 0)
    trend = [{"hour": h, "waiting": round(b["waiting"] / b["n"], 1), "empty_chairs": round(b["empty"] / b["n"], 1),
              "max_queue": b["queue"], "idle_staff": round(b["idle"] / b["n"], 1)}
             for h, b in sorted(hourly.items())]
    return {"observation": obs, "trend": trend, "observations_today": len(rows),
            "last_frame_b64": cfg.get("last_frame_b64"), "enabled": bool(cfg.get("enabled")),
            "mode": cfg.get("mode", "device"), "last_error": cfg.get("last_error")}


async def poll_cctv_once() -> dict:
    """Scheduler tick: poll every enabled snapshot_url tenant whose interval elapsed (business hours only)."""
    now = datetime.now(timezone.utc)
    ist_hour = (now + IST).hour
    polled = failed = 0
    async for cfg in _raw_db.cctv_config.find({"enabled": True, "mode": "snapshot_url"}):
        if not (int(cfg.get("business_start", 9)) <= ist_hour < int(cfg.get("business_end", 21))):
            continue
        last = cfg.get("last_polled_at")
        if last and (now - datetime.fromisoformat(last)).total_seconds() < int(cfg.get("interval_min", 5)) * 60:
            continue
        await _raw_db.cctv_config.update_one(
            {"tenant_id": cfg["tenant_id"]}, {"$set": {"last_polled_at": now.isoformat()}})
        try:
            b64 = await _fetch_snapshot(cfg)
            await _record_observation(cfg["tenant_id"], b64, "snapshot_url")
            await _raw_db.cctv_config.update_one({"tenant_id": cfg["tenant_id"]}, {"$unset": {"last_error": ""}})
            polled += 1
        except Exception as e:
            failed += 1
            await _raw_db.cctv_config.update_one(
                {"tenant_id": cfg["tenant_id"]}, {"$set": {"last_error": str(e)[:200]}})
            log.warning(f"cctv poll failed for {cfg['tenant_id']}: {e}")
    return {"polled": polled, "failed": failed}
