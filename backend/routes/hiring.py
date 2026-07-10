"""Staff Hiring Marketplace — salon owners post hiring requests, HQ curates as middleman,
HQ-verified registry staff apply from a public jobs board (salon name hidden until shortlisted)."""
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from database import db, _raw_db
from security import require_super_admin, require_tenant_admin, current_tenant

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


@router.post("/hiring/requests/{rid}/close")
async def close_request(rid: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    res = await _raw_db.hiring_requests.update_one(
        {"id": rid, "tenant_id": t["id"]}, {"$set": {"status": "closed", "closed_at": _now()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Request not found")
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


@router.post("/public/jobs/{rid}/apply")
async def apply_job(rid: str, body: JobApplyIn):
    """Only staff already in the HQ-verified registry can apply — verified by registered phone."""
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
    if not emp:
        raise HTTPException(403, "This number isn't in the Miracurl verified staff registry. "
                                 "Ask your salon owner to register you first.")
    if await _raw_db.job_applications.find_one({"request_id": rid, "employee_id": emp["id"]}):
        raise HTTPException(409, "You've already applied for this position — HQ will contact you.")
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
    return {"ok": True, "message": f"Applied as {emp.get('name')} — Miracurl HQ will call you to schedule a trial."}


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


@router.get("/super-admin/hiring/candidates")
async def search_candidates(q: str = "", user=Depends(require_super_admin)):
    """Search the verified registry for candidates to propose to a salon."""
    flt = {"$or": [{"name": {"$regex": q, "$options": "i"}},
                   {"city": {"$regex": q, "$options": "i"}}]} if q.strip() else {}
    emps = await _raw_db.registry_employees.find(flt, {"_id": 0}).sort("created_at", -1).to_list(20)
    out = []
    for e in emps:
        latest = await _raw_db.registry_employments.find_one(
            {"employee_id": e["id"]}, {"_id": 0, "designation": 1, "salon_name": 1},
            sort=[("created_at", -1)])
        out.append({"employee_id": e["id"], "name": e.get("name"), "phone": e.get("phone"),
                    "city": e.get("city") or "", "designation": (latest or {}).get("designation") or "",
                    "last_salon": (latest or {}).get("salon_name") or ""})
    return {"candidates": out}


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
