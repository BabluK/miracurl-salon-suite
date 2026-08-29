"""Super-admin per-salon dummy/test data cleanup + ghost-guest deep clean."""
import re

from fastapi import APIRouter, Depends

from database import _raw_db
from security import require_super_admin

router = APIRouter()

_DUMMY_NAME = re.compile(r"test|dummy|demo|sample|asdf|qwerty", re.I)
_ACTIVE_APPT_STATUSES = {"scheduled", "booked", "confirmed"}


def _has_dummy_name(name: str | None) -> bool:
    return bool(_DUMMY_NAME.search(name or ""))


async def _is_protected(tenant_id: str, c: dict) -> bool:
    """Customers with wallet money or invoices are never cleanup candidates."""
    if float(c.get("wallet_balance") or 0) > 0:
        return True
    return bool(await _raw_db.invoices.count_documents(
        {"tenant_id": tenant_id, "customer_id": c["id"]}, limit=1))


async def _dummy_customers(tenant_id: str, custs: list) -> list:
    out = []
    for c in custs:
        if _has_dummy_name(c.get("name")) and not await _is_protected(tenant_id, c):
            out.append(c)
    return out


async def _ghost_customers(tenant_id: str, custs: list, dummy_ids: set, active_cust_ids: set) -> list:
    """'pending' guests who never completed a visit and have no upcoming booking."""
    out = []
    for c in custs:
        if c.get("crm_status") != "pending" or c["id"] in dummy_ids or c["id"] in active_cust_ids:
            continue
        if not await _is_protected(tenant_id, c):
            out.append(c)
    return out


_TEST_STAFF_NAME = re.compile(r"^\s*(test|dummy)[\s_-]", re.I)


async def _test_staff(tenant_id: str) -> list:
    """Staff whose name starts with TEST/DUMMY — leftovers from automated test runs."""
    rows = await _raw_db.staff.find(
        {"tenant_id": tenant_id}, {"_id": 0, "id": 1, "name": 1, "role": 1}).to_list(2000)
    return [s for s in rows if _TEST_STAFF_NAME.search(s.get("name") or "")]


async def _scan(tenant_id: str) -> dict:
    """Dummy = test-pattern NAME. Ghost = incomplete pending guest.
    Orphan bookings = appointments whose customer record no longer exists."""
    custs = await _raw_db.customers.find(
        {"tenant_id": tenant_id},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "wallet_balance": 1, "crm_status": 1}).to_list(10000)
    appts = await _raw_db.appointments.find(
        {"tenant_id": tenant_id},
        {"_id": 0, "id": 1, "customer_id": 1, "customer_name": 1, "scheduled_at": 1, "status": 1},
    ).to_list(20000)

    dummy_custs = await _dummy_customers(tenant_id, custs)
    dummy_cust_ids = {c["id"] for c in dummy_custs}
    active_cust_ids = {a.get("customer_id") for a in appts if a.get("status") in _ACTIVE_APPT_STATUSES}
    ghost_custs = await _ghost_customers(tenant_id, custs, dummy_cust_ids, active_cust_ids)

    all_cust_ids = {c["id"] for c in custs}
    removable_ids = dummy_cust_ids | {c["id"] for c in ghost_custs}
    dummy_appts = [a for a in appts
                   if a.get("customer_id") in removable_ids or _has_dummy_name(a.get("customer_name"))]
    orphan_appts = [a for a in appts if a.get("customer_id") and a["customer_id"] not in all_cust_ids]
    return {"customers": dummy_custs, "ghosts": ghost_custs,
            "appointments": dummy_appts, "orphans": orphan_appts,
            "staff": await _test_staff(tenant_id)}


@router.get("/super-admin/dummy-data/{tenant_id}")
async def preview_dummy_data(tenant_id: str, user=Depends(require_super_admin)):
    found = await _scan(tenant_id)
    return {
        "customers": len(found["customers"]),
        "appointments": len(found["appointments"]),
        "ghost_customers": len(found["ghosts"]),
        "orphan_appointments": len(found["orphans"]),
        "staff": len(found["staff"]),
        "staff_samples": [{"name": s.get("name"), "role": s.get("role")} for s in found["staff"][:15]],
        "customer_samples": [{"name": c.get("name"), "phone": c.get("phone")} for c in found["customers"][:15]],
        "ghost_samples": [{"name": c.get("name"), "phone": c.get("phone")} for c in found["ghosts"][:15]],
        "appointment_samples": [{"name": a.get("customer_name"), "when": a.get("scheduled_at")}
                                for a in (found["appointments"] + found["orphans"])[:15]],
    }


@router.post("/super-admin/dummy-data/{tenant_id}/purge")
async def purge_dummy_data(tenant_id: str, user=Depends(require_super_admin)):
    found = await _scan(tenant_id)
    appt_ids = [a["id"] for a in found["appointments"] + found["orphans"]]
    cust_ids = [c["id"] for c in found["customers"] + found["ghosts"]]
    r1 = await _raw_db.appointments.delete_many({"tenant_id": tenant_id, "id": {"$in": appt_ids}})
    r2 = await _raw_db.customers.delete_many({"tenant_id": tenant_id, "id": {"$in": cust_ids}})
    r3 = await _raw_db.reviews.delete_many({"tenant_id": tenant_id, "appointment_id": {"$in": appt_ids}})
    staff_ids = [s["id"] for s in found["staff"]]
    r4 = await _raw_db.staff.delete_many({"tenant_id": tenant_id, "id": {"$in": staff_ids}})
    r5 = await _raw_db.attendance.delete_many({"staff_id": {"$in": staff_ids}})
    r6 = await _raw_db.late_alerts.delete_many({"staff_id": {"$in": staff_ids}})
    return {"removed": {"appointments": r1.deleted_count, "customers": r2.deleted_count,
                        "reviews": r3.deleted_count, "staff": r4.deleted_count,
                        "attendance": r5.deleted_count, "late_alerts": r6.deleted_count}}
