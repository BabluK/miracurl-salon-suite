"""WhatsApp campaign queue with ban-safety guardrails: one message every 30–45s per salon,
daily cap per salon (default 200), auto-pause when the cap is hit, resumes next day."""
import asyncio
import os
import base64
import logging
import random
import re
import uuid
from datetime import datetime, timedelta, timezone


from database import _raw_db

log = logging.getLogger("wa_campaign")
DEFAULT_DAILY_CAP = 1000
MIN_GAP_S, MAX_GAP_S = 2, 4
_last_sent: dict[str, float] = {}


def _tz(t: dict):
    from services.day_window import _tenant_tz
    return _tenant_tz(t)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def usage_today(tenant: dict) -> dict:
    tz = _tz(tenant)
    start_local = datetime.now(tz).replace(hour=0, minute=0, second=0, microsecond=0)
    start_utc = start_local.astimezone(timezone.utc).isoformat()
    sent = await _raw_db.whatsapp_messages.count_documents(
        {"tenant_id": tenant["id"], "provider": {"$in": ["openwa", "meta"]}, "direction": "outbound", "created_at": {"$gte": start_utc}})
    cap = int(tenant.get("wa_daily_cap") or DEFAULT_DAILY_CAP)
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
        {"id": cid, "tenant_id": tenant_id, "status": {"$in": ["queued", "running", "paused", "capped", "draft"]}},
        {"$set": {"status": status, "updated_at": _now()}})
    return bool(r.modified_count)


_ASSETS_ROOT = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "public"))


async def _load_image_bytes(url: str) -> bytes | None:
    """Our own files are read from storage (no HTTP); anything else goes through the SSRF-safe fetcher."""
    from urllib.parse import urlparse
    path = urlparse(url).path if url.startswith("http") else url
    m = re.match(r"^/api/files/([A-Za-z0-9-]{8,64})$", path)
    if m:
        from services.storage import _get_object
        rec = await _raw_db.uploads.find_one({"id": m.group(1), "is_deleted": False}, {"_id": 0, "storage_path": 1})
        if not rec:
            return None
        data, _ = await asyncio.to_thread(_get_object, rec["storage_path"])
        return data
    if path.startswith("/assets/"):
        full = os.path.realpath(os.path.join(_ASSETS_ROOT, path.lstrip("/")))
        if full.startswith(_ASSETS_ROOT + os.sep) and os.path.isfile(full):
            return await asyncio.to_thread(lambda: open(full, "rb").read())
        return None
    if url.startswith("https://"):
        from services.safe_fetch import _safe_fetch_image_bytes, is_safe_public_url
        if is_safe_public_url(url):
            return await asyncio.to_thread(_safe_fetch_image_bytes, url)
    return None


async def _image_payload(url: str) -> dict | None:
    try:
        raw = await _load_image_bytes(url)
        if not raw:
            return None
        # WhatsApp-friendly: ≤1280px JPEG (~100 KB) — large PNG flyers make the gateway choke
        import io
        from PIL import Image
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        im.thumbnail((1280, 1280))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=82, optimize=True)
        return {"base64": base64.b64encode(buf.getvalue()).decode(), "mimetype": "image/jpeg", "filename": "offer.jpg"}
    except Exception as e:  # noqa: BLE001
        log.warning("campaign image fetch failed %s: %s", url, e)
        return None


def _campaign_params(camp: dict, t: dict, first: str) -> tuple[str, list[str]]:
    """Map a campaign onto an approved Miracurl template: festival (5 vars) or winback (3 vars)."""
    salon = t.get("name", "our salon")
    offer = camp.get("offer") or camp.get("headline") or camp.get("text", "")[:120]
    if camp.get("source") == "winback" or camp.get("offer_type") == "winback":
        return "winback", [first, salon, offer]
    if camp.get("offer_type") == "thankyou":
        city = (t.get("city") or t.get("location") or "").split(",")[0].strip()
        return "thank_you", [first, salon, offer or (f"{salon}, {city}" if city else salon)]
    fest = camp.get("festival") or "festive season"
    valid = camp.get("valid_till") or (datetime.now(timezone.utc) + timedelta(days=7)).strftime("%d %b")
    return "festival", [first, salon, fest, offer, valid]


async def _send_one(t: dict, camp: dict, rcp: dict) -> dict:
    from services import whatsapp_official as official
    first = (rcp.get("name") or "there").split()[0]
    kind, params = _campaign_params(camp, t, first)
    r = await official.send(kind, t, rcp["phone"], params, image_url=camp.get("image_url"))
    return {"messageId": r.get("message_id"), "channel": "whatsapp"}


def _sms_campaign_vars(camp: dict, first: str) -> tuple[str, list[str]]:
    """DLT SMS twin of the WhatsApp campaign: festival → (name, festival, offer); anything else → special (name, offer, valid_till)."""
    offer = camp.get("offer") or camp.get("headline") or camp.get("text", "")[:60]
    if camp.get("festival"):
        return "festival", [first, camp["festival"], offer]
    valid = camp.get("valid_till") or (datetime.now(timezone.utc) + timedelta(days=7)).strftime("%d %b")
    return "special", [first, offer, valid]


async def _sms_fallback_ready(t: dict) -> bool:
    from sms_service import _provider, sms_configured
    from services.tenant_features import feature_on
    return sms_configured() and _provider() == "msg91" and int(t.get("sms_points") or 0) >= 1 and await feature_on(t["id"], "sms")


async def _send_one_sms(t: dict, camp: dict, rcp: dict) -> dict:
    from sms_service import send_tenant_sms
    first = (rcp.get("name") or "there").split()[0]
    kind, values = _sms_campaign_vars(camp, first)
    r = await send_tenant_sms(t["id"], rcp["phone"], camp.get("text") or "", kind=kind, sms_vars=values)
    if not r.get("sent"):
        raise RuntimeError(f"sms: {r.get('error') or 'failed'}")
    return {"messageId": r.get("sid"), "channel": "sms"}


async def _tick_tenant(camp: dict) -> None:
    t = await _raw_db.tenants.find_one({"id": camp["tenant_id"]}, {"_id": 0})
    if not t:
        await _raw_db.wa_campaigns.update_one({"id": camp["id"]}, {"$set": {"status": "failed", "error": "tenant missing"}})
        return
    if asyncio.get_event_loop().time() - _last_sent.get(t["id"], 0) < random.uniform(MIN_GAP_S, MAX_GAP_S):
        return
    use = await usage_today(t)
    if use["remaining"] <= 0:
        await _raw_db.wa_campaigns.update_one({"id": camp["id"]}, {"$set": {"status": "capped", "updated_at": _now()}})
        return
    via_sms = False
    if int(t.get("wa_points") or 0) < 1:
        via_sms = await _sms_fallback_ready(t)  # out of WhatsApp credits → DLT SMS keeps the campaign moving
        if not via_sms:
            await _raw_db.wa_campaigns.update_one({"id": camp["id"]}, {"$set": {"status": "paused", "error": "No WhatsApp or SMS credits — top up in Settings", "updated_at": _now()}})
            return
    idx = next((i for i, r in enumerate(camp["recipients"]) if r["status"] == "pending"), None)
    if idx is None:
        await _raw_db.wa_campaigns.update_one({"id": camp["id"]}, {"$set": {"status": "done", "finished_at": _now()}})
        return
    rcp = camp["recipients"][idx]
    _last_sent[t["id"]] = asyncio.get_event_loop().time()
    try:
        data = await (_send_one_sms if via_sms else _send_one)(t, camp, rcp)
        upd = {f"recipients.{idx}.status": "sent", f"recipients.{idx}.message_id": data.get("messageId"), f"recipients.{idx}.sent_at": _now(),
               f"recipients.{idx}.channel": data["channel"]}
        inc = {"sent": 1, **({"sent_sms": 1} if via_sms else {})}
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
            if True:  # official channel is always on
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
    asyncio.get_event_loop().create_task(festival_draft_loop())


async def refresh_results(tenant: dict, camps: list[dict]) -> list[dict]:
    """Attach read receipts (from the gateway's outgoing log) + bookings made by recipients after the send."""
    status_by_id: dict[str, str] = {}
    async for m in _raw_db.whatsapp_messages.find({"tenant_id": tenant["id"], "direction": "outbound"}, {"_id": 0, "message_id": 1, "status": 1}).limit(3000):
        if m.get("message_id"):
            status_by_id[m["message_id"]] = m.get("status") or ""
    out = []
    for c in camps:
        full = await _raw_db.wa_campaigns.find_one({"id": c["id"]}, {"_id": 0, "recipients": 1, "created_at": 1})
        rcps = (full or {}).get("recipients") or []
        delivered = read = 0
        for r in rcps:
            st = status_by_id.get(r.get("message_id") or "", "")
            if st in ("delivered", "read"):
                delivered += 1
            if st == "read":
                read += 1
        phones = [str(r.get("phone") or "")[-10:] for r in rcps if r.get("status") == "sent" and r.get("phone")]
        replied = await _raw_db.whatsapp_messages.count_documents(
            {"tenant_id": tenant["id"], "direction": "inbound", "created_at": {"$gte": (full or {}).get("created_at", "")},
             "wa_id": {"$regex": f"({'|'.join(phones)})$"}}) if phones else 0
        ids = [r["customer_id"] for r in rcps if r.get("status") == "sent"]
        booked = await _raw_db.appointments.count_documents(
            {"tenant_id": tenant["id"], "customer_id": {"$in": ids}, "created_at": {"$gte": (full or {}).get("created_at", "")},
             "status": {"$ne": "cancelled"}}) if ids else 0
        out.append({**c, "delivered": delivered, "read": read, "replied": replied, "booked": booked})
    return out


async def draft_festival_campaigns() -> int:
    """Mira pre-drafts a WhatsApp campaign 5 days before each upcoming festival for every WA-linked salon (one-tap approve)."""
    from datetime import date as _date
    from festivals import FESTIVALS
    from routes.mira_common import _ask_json
    from services.day_window import _tenant_tz
    made = 0
    async for t in _raw_db.tenants.find({"$or": [{"wa_points": {"$gt": 0}}, {"sms_points": {"$gt": 0}}]}, {"_id": 0}):
        today = datetime.now(_tenant_tz(t)).date()
        for iso, (name, emoji, span) in FESTIVALS.items():
            if (_date.fromisoformat(iso) - today).days != 5:
                continue
            if await _raw_db.wa_campaigns.find_one({"tenant_id": t["id"], "source": "festival_auto", "festival": name, "festival_date": iso}, {"_id": 1}):
                continue
            base = os.environ.get("APP_PUBLIC_URL", "")
            book = f"{base}/book/{t.get('slug', '')}" if base and t.get("slug") else ""
            resto = t.get("business_type") == "restaurant"
            try:
                out = await _ask_json(
                    "You are Mira, the marketing assistant for a salon/restaurant SaaS.",
                    f"Business: {t.get('name')} ({'restaurant' if resto else 'salon'}). Festival in 5 days: {emoji} {name} ({iso}). "
                    f"Write a warm WhatsApp festive offer under 380 characters with {{name}} as greeting placeholder, a flat 15-20% festive "
                    f"discount, 1-2 emojis, booking link once: {book}. Return {{\"text\": str, \"headline\": str}}.", model="gpt-5.4")
            except Exception as e:  # noqa: BLE001
                log.warning("festival draft LLM failed for %s: %s", t.get("slug"), e)
                continue
            rcps = [{"customer_id": c["id"], "name": c.get("name") or "", "phone": c["phone"]} async for c in
                    _raw_db.customers.find({"tenant_id": t["id"], "phone": {"$nin": [None, ""]}}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).limit(500)]
            if not rcps:
                continue
            doc = await create_campaign(t, name=f"{emoji} {name} festive campaign", text=out.get("text", ""), image_url=None,
                                        recipients=rcps, created_by="mira", source="festival_auto")
            await _raw_db.wa_campaigns.update_one({"id": doc["id"]}, {"$set": {"status": "draft", "festival": name, "festival_date": iso,
                                                                               "headline": out.get("headline", f"Happy {name}")}})
            made += 1
    return made


async def festival_draft_loop() -> None:
    await asyncio.sleep(90)
    while True:
        try:
            flag = await _raw_db.system_flags.find_one({"key": "wa_festival_drafts"})
            today = datetime.now(timezone.utc).date().isoformat()
            if not flag or flag.get("value") != today:
                n = await draft_festival_campaigns()
                await _raw_db.system_flags.update_one({"key": "wa_festival_drafts"}, {"$set": {"value": today, "made": n, "ran_at": _now()}}, upsert=True)
        except Exception as e:  # noqa: BLE001
            log.warning("festival draft loop error: %s", e)
        await asyncio.sleep(3600)
