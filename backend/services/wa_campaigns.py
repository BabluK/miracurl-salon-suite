"""WhatsApp campaign queue with ban-safety guardrails: one message every 30–45s per salon,
daily cap per salon (default 200), auto-pause when the cap is hit, resumes next day."""
import asyncio
import base64
import logging
import random
import uuid
from datetime import datetime, timezone, timedelta

import httpx

from database import _raw_db
from services import whatsapp_gateway as gw

log = logging.getLogger("wa_campaign")
DEFAULT_DAILY_CAP = 200
MIN_GAP_S, MAX_GAP_S = 30, 45
_last_sent: dict[str, float] = {}


def _tz(t: dict):
    from routes.reports import _tenant_tz
    return _tenant_tz(t)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def usage_today(tenant: dict) -> dict:
    tz = _tz(tenant)
    start_local = datetime.now(tz).replace(hour=0, minute=0, second=0, microsecond=0)
    start_utc = start_local.astimezone(timezone.utc).isoformat()
    sent = await _raw_db.whatsapp_messages.count_documents(
        {"tenant_id": tenant["id"], "provider": "openwa", "direction": "outbound", "created_at": {"$gte": start_utc}})
    cap = int(((tenant.get("wa_gateway") or {}).get("daily_cap")) or DEFAULT_DAILY_CAP)
    return {"sent": sent, "cap": cap, "remaining": max(0, cap - sent), "gap_seconds": [MIN_GAP_S, MAX_GAP_S],
            "resets_at": (start_local + timedelta(days=1)).isoformat()}


async def create_campaign(tenant: dict, *, name: str, text: str, image_url: str | None, recipients: list[dict],
                          created_by: str, source: str = "crm", scheduled_at: str | None = None) -> dict:
    doc = {"id": str(uuid.uuid4()), "tenant_id": tenant["id"], "name": name[:80], "text": text, "image_url": image_url,
           "source": source, "status": "queued", "created_by": created_by, "created_at": _now(), "scheduled_at": scheduled_at,
           "recipients": [{**r, "status": "pending"} for r in recipients],
           "total": len(recipients), "sent": 0, "failed": 0}
    await _raw_db.wa_campaigns.insert_one({**doc})
    return doc


async def list_campaigns(tenant_id: str, limit: int = 20) -> list[dict]:
    rows = await _raw_db.wa_campaigns.find({"tenant_id": tenant_id}, {"_id": 0, "recipients": 0}) \
        .sort("created_at", -1).to_list(limit)
    return rows


async def set_status(tenant_id: str, cid: str, status: str) -> bool:
    r = await _raw_db.wa_campaigns.update_one(
        {"id": cid, "tenant_id": tenant_id, "status": {"$in": ["queued", "running", "paused", "capped"]}},
        {"$set": {"status": status, "updated_at": _now()}})
    return bool(r.modified_count)


async def _image_payload(url: str) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as c:
            r = await c.get(url)
        if r.is_error or not r.content:
            return None
        # WhatsApp-friendly: ≤1280px JPEG (~100 KB) — large PNG flyers make the gateway choke
        import io
        from PIL import Image
        im = Image.open(io.BytesIO(r.content)).convert("RGB")
        im.thumbnail((1280, 1280))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=82, optimize=True)
        return {"base64": base64.b64encode(buf.getvalue()).decode(), "mimetype": "image/jpeg", "filename": "offer.jpg"}
    except Exception as e:  # noqa: BLE001
        log.warning("campaign image fetch failed %s: %s", url, e)
        return None


async def _send_one(sid: str, tenant_id: str, camp: dict, rcp: dict, img: dict | None) -> dict:
    text = camp["text"].replace("{name}", (rcp.get("name") or "there").split()[0])
    to = gw.wa_chat_id(rcp["phone"])
    if img:
        data = await gw._call("POST", f"/sessions/{sid}/messages/send-image",
                              json={"chatId": to, **img, "caption": text[:1024]}, timeout=90.0)
        await gw._log_msg(tenant_id, to, "image", text, data.get("messageId"), sid)
        return data
    return await gw.send_text(sid, tenant_id, rcp["phone"], text)


async def _tick_tenant(camp: dict) -> None:
    t = await _raw_db.tenants.find_one({"id": camp["tenant_id"]}, {"_id": 0, "id": 1, "wa_gateway": 1, "timezone": 1, "name": 1})
    if not t:
        await _raw_db.wa_campaigns.update_one({"id": camp["id"]}, {"$set": {"status": "failed", "error": "tenant missing"}})
        return
    gap = random.uniform(MIN_GAP_S, MAX_GAP_S)
    if asyncio.get_event_loop().time() - _last_sent.get(t["id"], 0) < gap:
        return
    use = await usage_today(t)
    if use["remaining"] <= 0:
        await _raw_db.wa_campaigns.update_one({"id": camp["id"]}, {"$set": {"status": "capped", "updated_at": _now()}})
        return
    sid = await gw.tenant_connected(t["id"])
    if not sid:
        await _raw_db.wa_campaigns.update_one({"id": camp["id"]}, {"$set": {"status": "paused", "error": "WhatsApp disconnected — relink in Settings", "updated_at": _now()}})
        return
    idx = next((i for i, r in enumerate(camp["recipients"]) if r["status"] == "pending"), None)
    if idx is None:
        await _raw_db.wa_campaigns.update_one({"id": camp["id"]}, {"$set": {"status": "done", "finished_at": _now()}})
        return
    rcp = camp["recipients"][idx]
    img = await _image_payload(camp["image_url"]) if camp.get("image_url") else None
    _last_sent[t["id"]] = asyncio.get_event_loop().time()
    try:
        data = await _send_one(sid, t["id"], camp, rcp, img)
        upd = {f"recipients.{idx}.status": "sent", f"recipients.{idx}.message_id": data.get("messageId"), f"recipients.{idx}.sent_at": _now()}
        inc = {"sent": 1}
    except Exception as e:  # noqa: BLE001
        upd = {f"recipients.{idx}.status": "failed", f"recipients.{idx}.error": str(e)[:200]}
        inc = {"failed": 1}
    remaining = sum(1 for i, r in enumerate(camp["recipients"]) if r["status"] == "pending" and i != idx)
    final = {"status": "done", "finished_at": _now()} if remaining == 0 else {"status": "running"}
    await _raw_db.wa_campaigns.update_one({"id": camp["id"]}, {"$set": {**upd, **final, "updated_at": _now()}, "$inc": inc})


async def worker_loop() -> None:
    """One pass every 5s: at most one message per tenant per pass (spacing enforced per tenant)."""
    while True:
        try:
            if gw.gateway_available():
                camps = await _raw_db.wa_campaigns.find({"status": {"$in": ["queued", "running", "capped"]},
                                                         "$or": [{"scheduled_at": None}, {"scheduled_at": {"$lte": _now()}}]}, {"_id": 0}).to_list(200)
                seen: set[str] = set()
                for c in camps:
                    if c["tenant_id"] in seen:
                        continue
                    seen.add(c["tenant_id"])
                    await _tick_tenant(c)
        except Exception as e:  # noqa: BLE001
            log.warning("campaign worker: %s", e)
        await asyncio.sleep(5)


def start_worker() -> None:
    asyncio.get_event_loop().create_task(worker_loop())
