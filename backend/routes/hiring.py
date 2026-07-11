"""Staff Hiring Marketplace — salon owners post hiring requests, HQ curates as middleman,
HQ-verified registry staff apply from a public jobs board (salon name hidden until shortlisted)."""
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from typing import Optional

from database import db, _raw_db
from security import require_super_admin, require_tenant_admin, current_tenant, public_rate_limit

router = APIRouter()

URGENCY = ("immediate", "two_weeks", "flexible")
APP_STATUSES = ("applied", "shortlisted", "trial_scheduled", "hired", "rejected")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _norm_phone(p: str) -> str:
    digits = re.sub(r"\D", "", p or "")
    return digits[-10:]


# ───────────────────────── Salon owner ─────────────────────────

class HiringRequestIn(BaseModel):
    role: str = Field(..., min_length=2, max_length=60)
    experience_years: int = Field(0, ge=0, le=40)
    salary_min: float = Field(0, ge=0)
    salary_max: float = Field(0, ge=0)
    urgency: str = "flexible"
    notes: str = Field("", max_length=500)


@router.post("/hiring/requests")
async def create_request(body: HiringRequestIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    if body.urgency not in URGENCY:
        raise HTTPException(400, f"urgency must be one of {URGENCY}")
    doc = {
        "id": str(uuid.uuid4()), "tenant_id": t["id"], "salon_name": t.get("name"), "slug": t["slug"],
        "location": t.get("location") or "", "role": body.role.strip(),
        "experience_years": body.experience_years, "salary_min": body.salary_min, "salary_max": body.salary_max,
        "urgency": body.urgency, "notes": body.notes.strip(),
        "status": "open", "created_by": user.get("email", ""), "created_at": _now(),
    }
    await _raw_db.hiring_requests.insert_one({**doc})
    return doc


@router.get("/hiring/requests")
async def my_requests(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Owner sees their requests + only HQ-curated candidates (status beyond 'applied')."""
    reqs = await _raw_db.hiring_requests.find(
        {"tenant_id": t["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for r in reqs:
        apps = await _raw_db.job_applications.find(
            {"request_id": r["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
        r["applicant_count"] = len(apps)
        r["candidates"] = [
            {k: a.get(k) for k in ("id", "candidate_name", "candidate_phone", "candidate_designation",
                                   "candidate_city", "status", "trial_date", "trial_time", "trial_notes")}
            for a in apps if a["status"] != "applied"]
    return {"requests": reqs}


async def _owner_pin_dep(request: Request, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    from server import require_owner_pin  # runtime import (server loads routes at startup)
    await require_owner_pin(request, user, t)
    return True


@router.post("/hiring/requests/{rid}/close")
async def close_request(rid: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    res = await _raw_db.hiring_requests.update_one(
        {"id": rid, "tenant_id": t["id"]}, {"$set": {"status": "closed", "closed_at": _now()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Request not found")
    return {"ok": True}


@router.delete("/hiring/requests/{rid}")
async def delete_request(rid: str, user=Depends(require_tenant_admin), t=Depends(current_tenant),
                         _pin=Depends(_owner_pin_dep)):
    """Owner deletes a CLOSED hiring request (and its applications). Owner PIN protected."""
    req = await _raw_db.hiring_requests.find_one({"id": rid, "tenant_id": t["id"]}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Request not found")
    if req["status"] != "closed":
        raise HTTPException(400, "Close the request first — only closed requests can be deleted")
    await _raw_db.hiring_requests.delete_one({"id": rid})
    await _raw_db.job_applications.delete_many({"request_id": rid})
    return {"ok": True}


# ───────────────────────── Public jobs board ─────────────────────────

@router.get("/public/jobs")
async def public_jobs():
    """Open positions — salon identity hidden (HQ is the middleman)."""
    reqs = await _raw_db.hiring_requests.find(
        {"status": "open"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"jobs": [{
        "id": r["id"], "role": r["role"], "experience_years": r["experience_years"],
        "salary_min": r["salary_min"], "salary_max": r["salary_max"], "urgency": r["urgency"],
        "location": r.get("location") or "Bengaluru", "salon": "Verified partner salon",
        "created_at": r["created_at"],
    } for r in reqs]}


class JobApplyIn(BaseModel):
    phone: str = Field(..., min_length=10, max_length=15)
    name: str = Field(..., min_length=2, max_length=80)


_GENERIC_APPLY_MSG = ("Application received ✦ If your number is in the Miracurl verified registry, "
                      "HQ will call you to schedule a trial.")


def _name_matches(given: str, registered: str) -> bool:
    reg_tokens = {w for w in re.split(r"\s+", (registered or "").lower()) if len(w) >= 3}
    return any(w in reg_tokens for w in re.split(r"\s+", (given or "").lower()) if len(w) >= 3)


@router.post("/public/jobs/{rid}/apply")
async def apply_job(rid: str, body: JobApplyIn, request: Request):
    """Only staff already in the HQ-verified registry can apply — verified by registered
    phone + matching name. SEC-002: rate-limited and always returns a generic response so
    registry membership can't be enumerated."""
    public_rate_limit(request, key_suffix="jobapply", limit=6, window_sec=3600)
    req = await _raw_db.hiring_requests.find_one({"id": rid, "status": "open"}, {"_id": 0})
    if not req:
        raise HTTPException(404, "This position is no longer open")
    phone = _norm_phone(body.phone)
    if len(phone) != 10:
        raise HTTPException(400, "Enter your 10-digit registered mobile number")
    emp = None
    async for e in _raw_db.registry_employees.find({}, {"_id": 0}):
        if _norm_phone(e.get("phone", "")) == phone:
            emp = e
            break
    # Unknown phone, name mismatch, or duplicate → same generic 200 (no enumeration signal)
    if not emp or not _name_matches(body.name, emp.get("name", "")):
        return {"ok": True, "message": _GENERIC_APPLY_MSG}
    if await _raw_db.job_applications.find_one({"request_id": rid, "employee_id": emp["id"]}):
        return {"ok": True, "message": _GENERIC_APPLY_MSG}
    latest_emp = await _raw_db.registry_employments.find_one(
        {"employee_id": emp["id"]}, {"_id": 0, "designation": 1, "skills": 1},
        sort=[("created_at", -1)])
    app_doc = {
        "id": str(uuid.uuid4()), "request_id": rid, "tenant_id": req["tenant_id"],
        "employee_id": emp["id"], "candidate_name": emp.get("name"),
        "candidate_phone": emp.get("phone"), "candidate_city": emp.get("city") or "",
        "candidate_designation": (latest_emp or {}).get("designation") or "",
        "candidate_skills": (latest_emp or {}).get("skills") or "",
        "status": "applied", "source": "applied", "seen_by_hq": False,
        "created_at": _now(), "updated_at": _now(),
    }
    await _raw_db.job_applications.insert_one({**app_doc})
    return {"ok": True, "message": _GENERIC_APPLY_MSG}


# ───────────────────────── Super Admin (HQ middleman) ─────────────────────────

@router.get("/super-admin/hiring")
async def hq_overview(user=Depends(require_super_admin)):
    reqs = await _raw_db.hiring_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    apps = await _raw_db.job_applications.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    by_req: dict = {}
    for a in apps:
        by_req.setdefault(a["request_id"], []).append(a)
    for r in reqs:
        r["applications"] = by_req.get(r["id"], [])
    new_count = sum(1 for a in apps if not a.get("seen_by_hq"))
    return {"requests": reqs, "new_applications": new_count,
            "open_requests": sum(1 for r in reqs if r["status"] == "open")}


@router.post("/super-admin/hiring/mark-seen")
async def mark_seen(user=Depends(require_super_admin)):
    await _raw_db.job_applications.update_many({"seen_by_hq": False}, {"$set": {"seen_by_hq": True}})
    return {"ok": True}


async def _candidate_profiles(emps: list) -> list:
    """Attach latest employment (role, salon, active/left) to each registry employee."""
    ids = [e["id"] for e in emps]
    emp_rows = await _raw_db.registry_employments.find(
        {"employee_id": {"$in": ids}}, {"_id": 0}).sort("from_date", -1).to_list(2000)
    latest: dict = {}
    for r in emp_rows:
        latest.setdefault(r["employee_id"], r)  # first seen = most recent from_date
    out = []
    for e in emps:
        le = latest.get(e["id"]) or {}
        active = bool(le) and not (le.get("to_date") or "").strip()
        out.append({
            "employee_id": e["id"], "name": e.get("name"), "phone": e.get("phone"),
            "city": e.get("city") or "", "designation": le.get("designation") or "",
            "employment_status": "active" if active else "left",
            "salon_name": le.get("salon_name") or "", "salon_tenant_id": le.get("tenant_id") or "",
        })
    return out


@router.get("/super-admin/hiring/candidates")
async def search_candidates(q: str = "", role: str = "", status: str = "all",
                            request_id: str = "", user=Depends(require_super_admin)):
    """Search the verified registry by name/city, filter by role + active/left status.
    When request_id is given, the requesting salon's OWN active staff are excluded."""
    flt = {"$or": [{"name": {"$regex": re.escape(q), "$options": "i"}},
                   {"city": {"$regex": re.escape(q), "$options": "i"}}]} if q.strip() else {}
    emps = await _raw_db.registry_employees.find(flt, {"_id": 0}).sort("created_at", -1).to_list(300)
    cands = await _candidate_profiles(emps)
    exclude_tid = ""
    if request_id:
        req = await _raw_db.hiring_requests.find_one({"id": request_id}, {"_id": 0, "tenant_id": 1})
        exclude_tid = (req or {}).get("tenant_id", "")
    if exclude_tid:
        cands = [c for c in cands if not (c["employment_status"] == "active" and c["salon_tenant_id"] == exclude_tid)]
    if role.strip():
        rq = role.strip().lower()
        cands = [c for c in cands if rq in c["designation"].lower()]
    if status in ("active", "left"):
        cands = [c for c in cands if c["employment_status"] == status]
    roles = sorted({r for r in await _raw_db.registry_employments.distinct("designation") if r})
    return {"candidates": cands[:40], "roles": roles}


class ProposeIn(BaseModel):
    request_id: str
    employee_id: str


@router.post("/super-admin/hiring/propose")
async def propose_candidate(body: ProposeIn, user=Depends(require_super_admin)):
    req = await _raw_db.hiring_requests.find_one({"id": body.request_id}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Hiring request not found")
    emp = await _raw_db.registry_employees.find_one({"id": body.employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(404, "Candidate not found in registry")
    if await _raw_db.job_applications.find_one({"request_id": body.request_id, "employee_id": emp["id"]}):
        raise HTTPException(409, "This candidate is already attached to the request")
    profile = (await _candidate_profiles([emp]))[0]
    if profile["employment_status"] == "active" and profile["salon_tenant_id"] == req["tenant_id"]:
        raise HTTPException(400, "This person is the salon's own ACTIVE staff — pick someone else")
    latest = await _raw_db.registry_employments.find_one(
        {"employee_id": emp["id"]}, {"_id": 0, "designation": 1}, sort=[("created_at", -1)])
    doc = {
        "id": str(uuid.uuid4()), "request_id": body.request_id, "tenant_id": req["tenant_id"],
        "employee_id": emp["id"], "candidate_name": emp.get("name"),
        "candidate_phone": emp.get("phone"), "candidate_city": emp.get("city") or "",
        "candidate_designation": (latest or {}).get("designation") or "",
        "status": "shortlisted", "source": "hq_proposed", "seen_by_hq": True,
        "created_at": _now(), "updated_at": _now(),
    }
    await _raw_db.job_applications.insert_one({**doc})
    return doc


class AppUpdateIn(BaseModel):
    status: Optional[str] = None
    trial_date: Optional[str] = None
    trial_time: Optional[str] = None
    trial_notes: Optional[str] = Field(None, max_length=300)


@router.patch("/super-admin/hiring/applications/{aid}")
async def update_application(aid: str, body: AppUpdateIn, user=Depends(require_super_admin)):
    app_doc = await _raw_db.job_applications.find_one({"id": aid}, {"_id": 0})
    if not app_doc:
        raise HTTPException(404, "Application not found")
    patch = {"updated_at": _now(), "seen_by_hq": True}
    if body.trial_date:
        patch.update({"trial_date": body.trial_date, "trial_time": body.trial_time or "",
                      "trial_notes": (body.trial_notes or "").strip(), "status": "trial_scheduled"})
    if body.status:
        if body.status not in APP_STATUSES:
            raise HTTPException(400, f"status must be one of {APP_STATUSES}")
        patch["status"] = body.status
    await _raw_db.job_applications.update_one({"id": aid}, {"$set": patch})
    if patch.get("status") == "hired":
        await _raw_db.hiring_requests.update_one(
            {"id": app_doc["request_id"]}, {"$set": {"status": "closed", "closed_at": _now(),
                                                     "closed_reason": "hired"}})
    return {**app_doc, **patch}
