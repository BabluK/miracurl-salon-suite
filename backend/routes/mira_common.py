"""Shared AI helpers for the Mira modules (studio, autopilot, social) — breaks the old circular import."""
import os
import json
import uuid
import base64
import asyncio
import logging
from datetime import datetime, timezone

from fastapi import HTTPException
from emergentintegrations.llm.chat import LlmChat, UserMessage

from database import _raw_db
from services.storage import _put_object, APP_NAME

log = logging.getLogger("mira_common")


def _key() -> str:
    k = os.environ.get("EMERGENT_LLM_KEY")
    if not k:
        raise HTTPException(500, "AI key not configured")
    return k


async def _ask(system: str, prompt: str, *, model: str = "gpt-4o-mini", session: str = "") -> str:
    chat = LlmChat(
        api_key=_key(),
        session_id=session or f"mira-studio-{uuid.uuid4().hex[:10]}",
        system_message=system,
    ).with_model("openai", model)
    resp = await chat.send_message(UserMessage(text=prompt))
    return (resp or "").strip()


async def _ask_json(system: str, prompt: str) -> dict:
    sys = system + " Reply with ONLY valid minified JSON, no markdown, no prose."
    for attempt in range(2):
        raw = await _ask(sys, prompt)
        raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            start, end = raw.find("{"), raw.rfind("}")
            if start >= 0 and end > start:
                try:
                    return json.loads(raw[start:end + 1])
                except json.JSONDecodeError:
                    pass
            if attempt == 0:
                log.warning("AI returned malformed JSON — retrying once")
    raise HTTPException(400, "AI returned an unexpected format — please try again")


async def _gen_image_gemini(prompt: str) -> bytes | None:
    """Nano Banana (Gemini) image generation via the universal key."""
    chat = LlmChat(api_key=_key(), session_id=f"imggen-{uuid.uuid4().hex[:8]}",
                   system_message="You are an expert promotional image generator.").with_model(
        "gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    _, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if images:
        return base64.b64decode(images[0]["data"])
    return None


async def _gen_image_bytes(prompt: str) -> bytes | None:
    """Dual-engine image generation: GPT-Image-1 first, Gemini Nano Banana fallback."""
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
    try:
        gen = OpenAIImageGeneration(api_key=_key())
        images = await asyncio.wait_for(
            gen.generate_images(prompt=prompt, model="gpt-image-1", number_of_images=1), timeout=240)
        if images:
            return images[0]
    except Exception as e:
        log.warning("gpt-image-1 failed, trying Gemini Nano Banana: %s", e)
    try:
        return await asyncio.wait_for(_gen_image_gemini(prompt), timeout=240)
    except Exception as e:
        log.error("gemini image gen failed too: %s", e)
        return None


async def _gen_image(prompt: str, t: dict, kind: str) -> str:
    data = await _gen_image_bytes(prompt)
    if not data:
        return ""
    fid = str(uuid.uuid4())
    path = f"{APP_NAME}/{t['id']}/mira-studio/{kind}/{fid}.png"
    try:
        result = _put_object(path, data, "image/png")
    except Exception as e:
        log.error("storage failed: %s", e)
        return ""
    await _raw_db.uploads.insert_one({
        "id": fid, "tenant_id": t["id"], "kind": f"mira_studio_{kind}",
        "storage_path": result.get("path", path), "original_filename": f"{fid}.png",
        "content_type": "image/png", "size": len(data), "uploaded_by": "mira_studio",
        "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return f"/api/files/{fid}"
