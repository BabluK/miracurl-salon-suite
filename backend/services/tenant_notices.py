"""Tenant notices — in-app bell notifications for salon/restaurant owners & admins (HQ changes, payments, staff asks)."""
import uuid
from datetime import datetime, timezone

from database import _raw_db

MANDATORY_STAFF = (("monthly_base_salary", "monthly salary"), ("joining_date", "joining date"), ("week_off_day", "week-off day"))


async def notify_tenant(tenant_id: str, kind: str, title: str, sub: str = "", link: str = "/dashboard", dedupe_key: str | None = None) -> None:
    """Push one notice to a tenant's bell. `dedupe_key` collapses repeats (e.g. one per staff gap per day). Never raises."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        doc = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "kind": kind, "title": title[:140], "sub": (sub or "")[:220],
               "link": link, "created_at": now, "dedupe_key": dedupe_key}
        if dedupe_key:
            if await _raw_db.tenant_notices.find_one({"tenant_id": tenant_id, "dedupe_key": dedupe_key}, {"_id": 1}):
                return
        await _raw_db.tenant_notices.insert_one(doc)
    except Exception:  # noqa: BLE001 — notices are best-effort
        pass


async def notices_open(tenant_id: str, user_id: str, limit: int = 20) -> list[dict]:
    """Last 7 days of notices this user hasn't dismissed (they stay in the bell across reloads until dismissed)."""
    from datetime import timedelta
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    return await _raw_db.tenant_notices.find({"tenant_id": tenant_id, "created_at": {"$gt": since}, "dismissed_by": {"$ne": user_id}},
                                             {"_id": 0, "dedupe_key": 0, "dismissed_by": 0}).sort("created_at", -1).to_list(limit)


async def dismiss_notice(tenant_id: str, notice_id: str, user_id: str) -> None:
    await _raw_db.tenant_notices.update_one({"id": notice_id, "tenant_id": tenant_id}, {"$addToSet": {"dismissed_by": user_id}})


async def staff_profile_gaps(tenant: dict) -> list[dict]:
    """Active staff missing salary-slip mandatory fields, plus the tenant-level late-fine rule. Returned as bell items."""
    out = []
    staff = await _raw_db.staff.find({"tenant_id": tenant["id"], "former": {"$ne": True}, "active": {"$ne": False}},
                                     {"_id": 0, "id": 1, "name": 1, "monthly_base_salary": 1, "joining_date": 1, "week_off_day": 1}).to_list(200)
    for s in staff:
        missing = [label for key, label in MANDATORY_STAFF if not s.get(key)]
        if missing:
            out.append({"id": f"staffgap-{s['id']}", "kind": "notice", "notice_kind": "staff_gap",
                        "title": f"Complete {s.get('name') or 'staff'}'s profile before payroll",
                        "sub": "Missing: " + ", ".join(missing) + " — needed for the salary slip",
                        "link": "/staff", "created_at": datetime.now(timezone.utc).isoformat()})
    if not (tenant.get("late_fines") or {}):
        out.append({"id": f"latefine-{tenant['id']}", "kind": "notice", "notice_kind": "staff_gap",
                    "title": "Set the late-fine rule for staff", "sub": "Late fines are mandatory for accurate salary slips — set them once in Staff → Attendance rules",
                    "link": "/staff", "created_at": datetime.now(timezone.utc).isoformat()})
    return out
