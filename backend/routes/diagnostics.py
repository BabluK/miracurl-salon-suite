"""Per-tenant diagnostics + remote cache clearing for Super Admin ("why is my software slow?")."""
import asyncio
import time
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Header

from database import _raw_db
from security import require_super_admin

router = APIRouter()

KEY_COLLECTIONS = [
    "appointments", "customers", "invoices", "staff", "services", "reviews",
    "chat_messages", "chat_threads", "public_ai_messages", "assistant_messages",
    "uploads", "oauth_states", "offer_flyers", "lead_outreach", "sms_credit_log",
    "branch_switch_requests", "registry_employments",
]

_THRESHOLDS = {
    "public_ai_messages": (5000, "Public AI chat history is heavy — old anonymous chats can be cleared"),
    "assistant_messages": (5000, "Mira assistant history is heavy"),
    "chat_messages": (10000, "Customer chat messages are heavy"),
    "oauth_states": (200, "Many stale OAuth login states — safe to clear"),
    "appointments": (25000, "Very large appointment history"),
    "uploads": (2000, "Large number of uploaded files"),
}


@router.get("/super/tenants/{tid}/diagnostics")
async def tenant_diagnostics(tid: str, admin=Depends(require_super_admin)):
    t = await _raw_db.tenants.find_one({"id": tid}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "status": 1, "cache_reset_at": 1})
    if not t:
        raise HTTPException(404, "Tenant not found")

    t0 = time.perf_counter()
    await _raw_db.command("ping")
    ping_ms = round((time.perf_counter() - t0) * 1000, 1)

    async def _count(c):
        return c, await _raw_db[c].count_documents({"tenant_id": tid})
    counts = dict(await asyncio.gather(*[_count(c) for c in KEY_COLLECTIONS]))

    issues = []
    for c, n in counts.items():
        th = _THRESHOLDS.get(c)
        if th and n >= th[0]:
            issues.append({"level": "warn", "text": f"{th[1]} ({n:,} records)", "collection": c})

    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    stuck = await _raw_db.offer_flyers.count_documents(
        {"tenant_id": tid, "status": "generating", "created_at": {"$lt": cutoff}})
    if stuck:
        issues.append({"level": "error", "text": f"{stuck} stuck flyer job(s) — will be cleared by auto-fix", "collection": "offer_flyers"})

    last = {}
    for c in ("appointments", "invoices"):
        doc = await _raw_db[c].find_one({"tenant_id": tid}, {"_id": 0, "created_at": 1}, sort=[("created_at", -1)])
        last[c] = (doc or {}).get("created_at")

    upload_bytes = 0
    async for u in _raw_db.uploads.find({"tenant_id": tid, "is_deleted": False}, {"_id": 0, "size": 1}):
        upload_bytes += u.get("size") or 0

    if not issues:
        issues.append({"level": "ok", "text": "No heavy data or stuck jobs found. If the salon still feels slow, run 'Clear cache & auto-fix' — their app cache will be wiped on next open.", "collection": ""})

    return {
        "tenant": t, "db_ping_ms": ping_ms, "counts": counts, "issues": issues,
        "last_activity": last, "uploads_mb": round(upload_bytes / 1048576, 1),
        "cache_reset_at": t.get("cache_reset_at"),
    }


@router.post("/super/tenants/{tid}/clear-cache")
async def tenant_clear_cache(tid: str, admin=Depends(require_super_admin)):
    t = await _raw_db.tenants.find_one({"id": tid}, {"_id": 0, "id": 1})
    if not t:
        raise HTTPException(404, "Tenant not found")
    now = datetime.now(timezone.utc)
    cleared = {}

    res = await _raw_db.oauth_states.delete_many({"tenant_id": tid})
    cleared["stale_oauth_states"] = res.deleted_count

    cutoff = (now - timedelta(minutes=15)).isoformat()
    res = await _raw_db.offer_flyers.update_many(
        {"tenant_id": tid, "status": "generating", "created_at": {"$lt": cutoff}},
        {"$set": {"status": "failed", "error": "Cleared by super admin diagnostics"}})
    cleared["stuck_flyer_jobs"] = res.modified_count

    old = (now - timedelta(days=90)).isoformat()
    res = await _raw_db.public_ai_messages.delete_many({"tenant_id": tid, "created_at": {"$lt": old}})
    cleared["old_public_ai_chats"] = res.deleted_count

    ts = now.isoformat()
    await _raw_db.tenants.update_one({"id": tid}, {"$set": {"cache_reset_at": ts}})
    return {"ok": True, "cleared": cleared, "cache_reset_at": ts,
            "note": "Device cache purge scheduled — every user of this salon gets a fresh app the next time they open it."}


@router.get("/public/cache-version")
async def public_cache_version(x_tenant_slug: str = Header(default="")):
    if not x_tenant_slug:
        return {"v": ""}
    t = await _raw_db.tenants.find_one({"slug": x_tenant_slug}, {"_id": 0, "cache_reset_at": 1})
    return {"v": (t or {}).get("cache_reset_at") or ""}
