"""Mira WhatsApp Receptionist — routes each inbound chat to the right business, keeps a sticky
session per guest, and lets staff take over (Mira goes quiet) when a human is needed."""
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone

from database import _current_tenant_id, _raw_db

log = logging.getLogger("wa_receptionist")
HUMAN_TAKEOVER_HOURS = 2
_REF_RE = re.compile(r"#([a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?)", re.I)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def platform_number() -> str:
    return re.sub(r"\D", "", os.environ.get("WHATSAPP_PLATFORM_NUMBER", ""))


def invite_link(t: dict) -> str:
    """wa.me deep link with a pre-filled greeting that carries the tenant's #slug so routing is exact."""
    from urllib.parse import quote
    own = (t.get("own_whatsapp") or {})
    if own.get("status") == "connected" and own.get("display_phone_number"):
        num = re.sub(r"\D", "", own["display_phone_number"])
        return f"https://wa.me/{num}?text={quote('Hi ' + (t.get('name') or '') + '!')}"
    text = f"Hi {t.get('name', '')}! #{t.get('slug', '')}".strip()
    return f"https://wa.me/{platform_number()}?text={quote(text)}"


async def get_session(wa_id: str) -> dict | None:
    return await _raw_db.wa_sessions.find_one({"wa_id": wa_id}, {"_id": 0})


async def touch_session(wa_id: str, tenant_id: str, **extra) -> None:
    await _raw_db.wa_sessions.update_one(
        {"wa_id": wa_id},
        {"$set": {"tenant_id": tenant_id, "last_at": _now().isoformat(), **extra},
         "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": _now().isoformat()}}, upsert=True)


async def tenant_owns_thread(tenant_id: str, wa_id: str) -> bool:
    """BOLA guard: a tenant may only act on a guest whose sticky session is theirs (or, with no
    session yet, a guest who has messaged/been messaged by them)."""
    sess = await get_session(wa_id)
    if sess and sess.get("tenant_id"):
        return sess["tenant_id"] == tenant_id
    return await _raw_db.whatsapp_messages.find_one({"tenant_id": tenant_id, "wa_id": wa_id}, {"_id": 1}) is not None


async def set_human_mode(wa_id: str, tenant_id: str, on: bool, by: str = "") -> dict:
    until = (_now() + timedelta(hours=HUMAN_TAKEOVER_HOURS)).isoformat() if on else None
    await touch_session(wa_id, tenant_id, human_until=until, human_by=by if on else None)
    return {"human_until": until}


def human_active(session: dict | None) -> bool:
    until = (session or {}).get("human_until")
    return bool(until) and until > _now().isoformat()


async def _tenant_by_slug(slug: str) -> dict | None:
    return await _raw_db.tenants.find_one({"slug": slug.lower(), "status": {"$ne": "suspended"}}, {"_id": 0})


async def resolve_inbound_tenant(doc: dict, own_tenant: dict | None) -> dict | None:
    """Priority: tenant-owned number → #slug in the message → sticky session → last business that
    messaged this guest (campaign reply) → WHATSAPP_DEFAULT_TENANT_SLUG."""
    if own_tenant and own_tenant.get("id"):
        return await _raw_db.tenants.find_one({"id": own_tenant["id"]}, {"_id": 0})
    if doc.get("phone_number_id") and doc["phone_number_id"] != os.environ.get("WHATSAPP_PHONE_NUMBER_ID", ""):
        return None
    wa_id = doc.get("wa_id") or ""
    m = _REF_RE.search(doc.get("text") or "")
    if m:
        t = await _tenant_by_slug(m.group(1))
        if t:
            await touch_session(wa_id, t["id"], human_until=None)
            return t
    sess = await get_session(wa_id)
    if sess and sess.get("tenant_id"):
        t = await _raw_db.tenants.find_one({"id": sess["tenant_id"]}, {"_id": 0})
        if t:
            return t
    last_out = await _raw_db.whatsapp_messages.find_one(
        {"wa_id": wa_id, "direction": "outbound", "tenant_id": {"$nin": [None, ""]}}, {"_id": 0, "tenant_id": 1}, sort=[("created_at", -1)])
    if last_out:
        t = await _raw_db.tenants.find_one({"id": last_out["tenant_id"]}, {"_id": 0})
        if t:
            await touch_session(wa_id, t["id"])
            return t
    slug = os.environ.get("WHATSAPP_DEFAULT_TENANT_SLUG", "")
    return await _tenant_by_slug(slug) if slug else None


def strip_ref(text: str) -> str:
    out = _REF_RE.sub("", text or "").strip()
    return out or "Hi"


async def notify_handoff(t: dict, wa_id: str, profile_name: str, last_text: str) -> None:
    from services.tenant_notices import notify_tenant
    who = profile_name or f"+{wa_id}"
    await notify_tenant(t["id"], "wa_handoff", f"{who} wants to talk to a person on WhatsApp",
                        f'"{(last_text or "")[:90]}" — Mira has paused; reply from Mira Receptionist.',
                        "/receptionist", f"wa_handoff:{wa_id}:{_now().strftime('%Y%m%d%H')}")


async def mira_reply_text(t: dict, wa_id: str, text: str, request=None) -> tuple[str, dict | None, bool]:
    """Run Mira's pipeline for one guest message. Returns (reply, booking, handoff_requested)."""
    from routes.public_chat import _instant_faq_reply, _public_ai_reply
    from services.whatsapp_mira import _to_whatsapp_text
    token = _current_tenant_id.set(t["id"])
    try:
        reply = await _instant_faq_reply(t, text)
        booking, handoff = None, None
        if not reply:
            reply, booking, _err, handoff = await _public_ai_reply(t, f"wa-{wa_id}", text, request=request)
        return _to_whatsapp_text(reply), booking, bool(handoff)
    finally:
        _current_tenant_id.reset(token)


async def stats(tenant_id: str, days: int = 30) -> dict:
    since = (_now() - timedelta(days=days)).isoformat()
    base = {"tenant_id": tenant_id, "created_at": {"$gte": since}}
    inbound = await _raw_db.whatsapp_messages.count_documents({**base, "direction": "inbound"})
    replied = await _raw_db.whatsapp_messages.count_documents({**base, "direction": "inbound", "status": "replied"})
    booked = await _raw_db.whatsapp_messages.count_documents({**base, "direction": "inbound", "mira_booked": True})
    guests = len(await _raw_db.whatsapp_messages.distinct("wa_id", {**base, "direction": "inbound"}))
    handoffs = await _raw_db.wa_sessions.count_documents({"tenant_id": tenant_id, "human_by": {"$nin": [None, ""]}, "last_at": {"$gte": since}})
    return {"days": days, "messages": inbound, "replied": replied, "booked": booked, "guests": guests, "handoffs": handoffs}


async def threads(tenant_id: str, limit: int = 30) -> list[dict]:
    """Latest conversation per guest with CRM name + human-mode flag."""
    pipeline = [
        {"$match": {"tenant_id": tenant_id, "wa_id": {"$regex": r"^\d{7,15}$"}}},
        {"$sort": {"created_at": -1}},
        {"$group": {"_id": "$wa_id", "last_text": {"$first": "$text"}, "last_at": {"$first": "$created_at"},
                    "last_dir": {"$first": "$direction"}, "profile_name": {"$first": "$profile_name"},
                    "count": {"$sum": 1}, "booked": {"$max": {"$cond": [{"$eq": ["$mira_booked", True]}, 1, 0]}}}},
        {"$sort": {"last_at": -1}}, {"$limit": limit}]
    rows = await _raw_db.whatsapp_messages.aggregate(pipeline).to_list(limit)
    ids = [r["_id"] for r in rows]
    sess = {s["wa_id"]: s for s in await _raw_db.wa_sessions.find({"wa_id": {"$in": ids}}, {"_id": 0}).to_list(len(ids) or 1)}
    tails = [w[-10:] for w in ids]
    custs = await _raw_db.customers.find({"tenant_id": tenant_id, "phone": {"$regex": "(" + "|".join(map(re.escape, tails)) + ")$"}},
                                         {"_id": 0, "id": 1, "name": 1, "phone": 1, "visits": 1}).to_list(500) if tails else []
    by10 = {re.sub(r"\D", "", c.get("phone") or "")[-10:]: c for c in custs}
    out = []
    for r in rows:
        c = by10.get(r["_id"][-10:])
        out.append({"wa_id": r["_id"], "name": (c or {}).get("name") or r.get("profile_name") or f"+{r['_id']}",
                    "customer_id": (c or {}).get("id"), "visits": (c or {}).get("visits", 0),
                    "last_text": (r.get("last_text") or "")[:160], "last_at": r.get("last_at"), "last_dir": r.get("last_dir"),
                    "count": r["count"], "booked": bool(r.get("booked")), "human": human_active(sess.get(r["_id"]))})
    return out


async def thread_messages(tenant_id: str, wa_id: str, limit: int = 60) -> list[dict]:
    rows = await _raw_db.whatsapp_messages.find({"tenant_id": tenant_id, "wa_id": wa_id},
                                                {"_id": 0, "direction": 1, "text": 1, "created_at": 1, "status": 1, "mira_booked": 1, "type": 1, "sent_by": 1}
                                                ).sort("created_at", -1).to_list(limit)
    return [{"dir": r["direction"], "text": r.get("text") or "", "at": r.get("created_at"), "status": r.get("status"),
             "type": r.get("type"), "booked": bool(r.get("mira_booked")), "sent_by": r.get("sent_by") or ("mira" if r["direction"] == "outbound" else None)}
            for r in reversed(rows)]
