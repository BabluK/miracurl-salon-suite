"""Super-Admin platform tools — load metrics + raw collection browser/cleanup."""
import logging
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import _raw_db
from security import require_super_admin

router = APIRouter()
log = logging.getLogger("platform_tools")

# purging these would brick the platform — single-doc delete is still allowed
PURGE_PROTECTED = {"users", "tenants", "meta", "system_flags", "subscriptions"}

AI_MESSAGE_COLLECTIONS = ["chat_messages", "public_ai_messages", "assistant_messages",
                          "super_ai_messages", "engineer_ai_messages"]


def _today_start_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


@router.get("/super/platform-load")
async def platform_load(admin=Depends(require_super_admin)):
    today = _today_start_iso()
    tenants_by_status = {s["_id"] or "unknown": s["n"] async for s in _raw_db.tenants.aggregate(
        [{"$group": {"_id": "$status", "n": {"$sum": 1}}}])}

    ai_calls = 0
    for coll in AI_MESSAGE_COLLECTIONS:
        ai_calls += await _raw_db[coll].count_documents({"created_at": {"$gte": today}})
    autopilot_posts = await _raw_db.content_calendar.count_documents({"date": today, "auto": True})
    promo_today = await _raw_db.promo_videos.count_documents({"created_at": {"$gte": today}})
    ai_calls += autopilot_posts + promo_today

    emails_today = 0
    async for row in _raw_db.autopilot_log.aggregate(
            [{"$match": {"date": today}}, {"$group": {"_id": None, "n": {"$sum": "$emails_sent"}}}]):
        emails_today = row["n"]

    sms_balance = 0
    async for row in _raw_db.tenants.aggregate(
            [{"$group": {"_id": None, "n": {"$sum": {"$ifNull": ["$sms_points", 0]}}}}]):
        sms_balance = row["n"]
    sms_used_today = await _raw_db.sms_credit_log.count_documents({"created_at": {"$gte": today}})

    uploads_count = await _raw_db.uploads.estimated_document_count()
    storage_mb = 0
    async for row in _raw_db.uploads.aggregate(
            [{"$match": {"is_deleted": {"$ne": True}}},
             {"$group": {"_id": None, "n": {"$sum": {"$ifNull": ["$size", 0]}}}}]):
        storage_mb = round(row["n"] / 1048576, 1)

    names = await _raw_db.list_collection_names()
    total_docs = 0
    for n in names:
        total_docs += await _raw_db[n].estimated_document_count()

    return {
        "tenants": {"total": sum(tenants_by_status.values()), **tenants_by_status},
        "today": {
            "ai_calls": ai_calls, "autopilot_posts": autopilot_posts,
            "winback_emails": emails_today, "promo_videos": promo_today,
            "new_invoices": await _raw_db.invoices.count_documents({"created_at": {"$gte": today}}),
            "new_appointments": await _raw_db.appointments.count_documents({"created_at": {"$gte": today}}),
        },
        "sms": {"points_balance_all_tenants": sms_balance, "credit_events_today": sms_used_today},
        "storage": {"uploads": uploads_count, "total_mb": storage_mb},
        "db": {"collections": len(names), "documents": total_docs},
    }


def _jsonable(v, depth: int = 0):
    if isinstance(v, ObjectId):
        return str(v)
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, bytes):
        return f"<{len(v)} bytes>"
    if isinstance(v, str) and len(v) > 400:
        return v[:400] + f"… (+{len(v) - 400} chars)"
    if isinstance(v, dict):
        return {k: _jsonable(x, depth + 1) for k, x in v.items()} if depth < 6 else "…"
    if isinstance(v, list):
        return [_jsonable(x, depth + 1) for x in v[:25]] if depth < 6 else "…"
    return v


@router.get("/super/db/collections")
async def db_collections(admin=Depends(require_super_admin)):
    names = sorted(await _raw_db.list_collection_names())
    return {"collections": [
        {"name": n, "count": await _raw_db[n].estimated_document_count(),
         "purge_protected": n in PURGE_PROTECTED} for n in names]}


async def run_db_health_audit() -> dict:
    """Count docs whose tenant_id references a deleted tenant. Cached in system_flags."""
    tids = [t["id"] async for t in _raw_db.tenants.find({}, {"_id": 0, "id": 1})]
    orphans, per = 0, {}
    for c in await _raw_db.list_collection_names():
        if c in ("tenants", "meta", "system_flags"):
            continue
        n = await _raw_db[c].count_documents(
            {"tenant_id": {"$exists": True, "$nin": tids + [None, "", "superadmin"]}})
        if n:
            per[c] = n
            orphans += n
    result = {"orphans": orphans, "per_collection": per, "tenants": len(tids),
              "checked_at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.system_flags.update_one(
        {"key": "db_health"}, {"$set": {"key": "db_health", **result}}, upsert=True)
    return result


@router.get("/super/db/health")
async def db_health(refresh: bool = False, admin=Depends(require_super_admin)):
    flag = await _raw_db.system_flags.find_one({"key": "db_health"}, {"_id": 0})
    if refresh or not flag:
        flag = await run_db_health_audit()
    return flag


@router.get("/super/db/{coll}/docs")
async def db_docs(coll: str, skip: int = 0, limit: int = 20, q: str = "",
                  admin=Depends(require_super_admin)):
    names = await _raw_db.list_collection_names()
    if coll not in names:
        raise HTTPException(404, "Collection not found")
    limit = max(1, min(limit, 50))
    flt = {}
    q = q.strip()[:60]
    if q:
        import re as _re
        rx = {"$regex": _re.escape(q), "$options": "i"}
        flt = {"$or": [{"id": rx}, {"name": rx}, {"email": rx}, {"phone": rx},
                       {"tenant_id": rx}, {"slug": rx}, {"status": rx}]}
    total = await _raw_db[coll].count_documents(flt, maxTimeMS=4000)
    docs = await _raw_db[coll].find(flt).sort("_id", -1).skip(skip).limit(limit).max_time_ms(4000).to_list(limit)
    sensitive = ("password_hash", "password", "otp_hash", "token_hash", "secret", "api_key", "auth_token")
    def _redact(d):
        return {k: ("•••redacted•••" if k.lower() in sensitive else v) for k, v in d.items()}
    return {"total": total, "docs": [_redact(_jsonable(d)) for d in docs]}


@router.delete("/super/db/{coll}/doc/{doc_id}")
async def db_delete_doc(coll: str, doc_id: str, admin=Depends(require_super_admin)):
    names = await _raw_db.list_collection_names()
    if coll not in names:
        raise HTTPException(404, "Collection not found")
    res = await _raw_db[coll].delete_one({"id": doc_id})
    if res.deleted_count == 0 and ObjectId.is_valid(doc_id):
        res = await _raw_db[coll].delete_one({"_id": ObjectId(doc_id)})
    if res.deleted_count == 0:
        raise HTTPException(404, "Document not found")
    log.warning("super-admin deleted doc %s from %s", doc_id, coll)
    return {"deleted": 1}


class PurgeIn(BaseModel):
    confirm: str


@router.post("/super/db/{coll}/purge")
async def db_purge(coll: str, body: PurgeIn, admin=Depends(require_super_admin)):
    names = await _raw_db.list_collection_names()
    if coll not in names:
        raise HTTPException(404, "Collection not found")
    if coll in PURGE_PROTECTED:
        raise HTTPException(403, f"'{coll}' is protected — purging it would break the platform")
    if body.confirm != coll:
        raise HTTPException(400, "Type the exact collection name to confirm purge")
    res = await _raw_db[coll].delete_many({})
    log.warning("super-admin PURGED collection %s (%s docs)", coll, res.deleted_count)
    return {"deleted": res.deleted_count}
