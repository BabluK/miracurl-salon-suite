"""Super-admin per-salon dummy/test data cleanup."""
import re

from fastapi import APIRouter, Depends

from database import _raw_db
from security import require_super_admin

router = APIRouter()

_DUMMY_NAME = re.compile(r"test|dummy|demo|sample|asdf|qwerty", re.I)


def _is_dummy(name: str | None, phone: str | None) -> bool:
    if _DUMMY_NAME.search(name or ""):
        return True
    p = "".join(c for c in (phone or "") if c.isdigit())
    if len(p) == 12 and p.startswith("91"):
        p = p[2:]
    if p and not re.fullmatch(r"[6-9]\d{9}", p):
        return True
    return False


async def _scan(tenant_id: str) -> dict:
    custs = await _raw_db.customers.find(
        {"tenant_id": tenant_id}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(10000)
    dummy_custs = [c for c in custs if _is_dummy(c.get("name"), c.get("phone"))]
    dummy_cust_ids = {c["id"] for c in dummy_custs}
    appts = await _raw_db.appointments.find(
        {"tenant_id": tenant_id},
        {"_id": 0, "id": 1, "customer_id": 1, "customer_name": 1, "customer_phone": 1, "phone": 1, "scheduled_at": 1},
    ).to_list(20000)
    dummy_appts = [a for a in appts
                   if a.get("customer_id") in dummy_cust_ids
                   or _is_dummy(a.get("customer_name"), a.get("customer_phone") or a.get("phone"))]
    return {"customers": dummy_custs, "appointments": dummy_appts}


@router.get("/super-admin/dummy-data/{tenant_id}")
async def preview_dummy_data(tenant_id: str, user=Depends(require_super_admin)):
    found = await _scan(tenant_id)
    return {
        "customers": len(found["customers"]),
        "appointments": len(found["appointments"]),
        "customer_samples": [{"name": c.get("name"), "phone": c.get("phone")} for c in found["customers"][:15]],
        "appointment_samples": [{"name": a.get("customer_name"), "when": a.get("scheduled_at")}
                                for a in found["appointments"][:15]],
    }


@router.post("/super-admin/dummy-data/{tenant_id}/purge")
async def purge_dummy_data(tenant_id: str, user=Depends(require_super_admin)):
    found = await _scan(tenant_id)
    appt_ids = [a["id"] for a in found["appointments"]]
    cust_ids = [c["id"] for c in found["customers"]]
    r1 = await _raw_db.appointments.delete_many({"tenant_id": tenant_id, "id": {"$in": appt_ids}})
    r2 = await _raw_db.customers.delete_many({"tenant_id": tenant_id, "id": {"$in": cust_ids}})
    r3 = await _raw_db.reviews.delete_many({"tenant_id": tenant_id, "appointment_id": {"$in": appt_ids}})
    return {"removed": {"appointments": r1.deleted_count, "customers": r2.deleted_count, "reviews": r3.deleted_count}}
