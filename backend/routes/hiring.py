"""Staff Hiring Marketplace — salon owners post hiring requests, HQ curates as middleman,
HQ-verified registry staff apply from a public jobs board (salon name hidden until shortlisted)."""
import asyncio
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from typing import Optional

from database import db, _raw_db
from security import require_super_admin, require_admin, current_tenant, public_rate_limit

log = logging.getLogger("hiring")
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
async def create_request(body: HiringRequestIn, user=Depends(require_admin), t=Depends(current_tenant)):
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
async def my_requests(user=Depends(require_admin), t=Depends(current_tenant)):
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
async def close_request(rid: str, user=Depends(require_admin), t=Depends(current_tenant)):
    res = await _raw_db.hiring_requests.update_one(
        {"id": rid, "tenant_id": t["id"]}, {"$set": {"status": "closed", "closed_at": _now()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Request not found")
    return {"ok": True}


@router.delete("/hiring/requests/{rid}")
async def delete_request(rid: str, user=Depends(require_admin), t=Depends(current_tenant)):
    """Delete a CLOSED hiring request (and its applications). PIN-free so managers can manage hiring."""
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


async def _find_registry_by_phone(phone: str):
    async for e in _raw_db.registry_employees.find({}, {"_id": 0}):
        if _norm_phone(e.get("phone", "")) == phone:
            return e
    return None


async def _create_application(rid: str, req: dict, emp: dict) -> None:
    latest_emp = await _raw_db.registry_employments.find_one(
        {"employee_id": emp["id"]}, {"_id": 0, "designation": 1, "skills": 1},
        sort=[("created_at", -1)])
    await _raw_db.job_applications.insert_one({
        "id": str(uuid.uuid4()), "request_id": rid, "tenant_id": req["tenant_id"],
        "employee_id": emp["id"], "candidate_name": emp.get("name"),
        "candidate_phone": emp.get("phone"), "candidate_city": emp.get("city") or "",
        "candidate_designation": (latest_emp or {}).get("designation") or "",
        "candidate_skills": (latest_emp or {}).get("skills") or "",
        "status": "applied", "source": "applied", "seen_by_hq": False,
        "created_at": _now(), "updated_at": _now(),
    })


@router.post("/public/jobs/{rid}/apply")
async def apply_job(rid: str, body: JobApplyIn, request: Request):
    """Only staff already in the HQ-verified registry can apply — verified by registered
    phone + matching name. SEC-002: rate-limited and always returns a generic response so
    registry membership can't be enumerated."""
    await public_rate_limit(request, key_suffix="jobapply", limit=6, window_sec=3600)
    req = await _raw_db.hiring_requests.find_one({"id": rid, "status": "open"}, {"_id": 0})
    if not req:
        raise HTTPException(404, "This position is no longer open")
    phone = _norm_phone(body.phone)
    if len(phone) != 10:
        raise HTTPException(400, "Enter your 10-digit registered mobile number")
    emp = await _find_registry_by_phone(phone)
    # Unknown phone, name mismatch, or duplicate → same generic 200 (no enumeration signal)
    if emp and _name_matches(body.name, emp.get("name", "")) \
            and not await _raw_db.job_applications.find_one({"request_id": rid, "employee_id": emp["id"]}):
        await _create_application(rid, req, emp)
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
    await _raw_db.placement_fees.update_many({"seen_by_hq": False}, {"$set": {"seen_by_hq": True}})
    return {"ok": True}


def _rating_summary(history: list) -> dict:
    """avg rating / count / latest written review from a candidate's employment history."""
    ratings = [float(h["rating"]) for h in history if h.get("rating")]
    last_review = next(
        ({"salon_name": h.get("salon_name") or "", "rating": float(h["rating"]),
          "comment": (h.get("comment") or "")[:140]}
         for h in history if h.get("rating") and (h.get("comment") or "").strip()), None)
    return {"avg_rating": round(sum(ratings) / len(ratings), 1) if ratings else None,
            "ratings_count": len(ratings), "last_review": last_review}


def _profile_from(e: dict, history: list) -> dict:
    """history is sorted newest-first; empty to_date on the latest row = currently active."""
    le = history[0] if history else {}
    active = bool(le) and not (le.get("to_date") or "").strip()
    return {
        "employee_id": e["id"], "name": e.get("name"), "phone": e.get("phone"),
        "city": e.get("city") or "", "designation": le.get("designation") or "",
        "employment_status": "active" if active else "left",
        "salon_name": le.get("salon_name") or "", "salon_tenant_id": le.get("tenant_id") or "",
        **_rating_summary(history),
    }


async def _candidate_profiles(emps: list) -> list:
    ids = [e["id"] for e in emps]
    emp_rows = await _raw_db.registry_employments.find(
        {"employee_id": {"$in": ids}}, {"_id": 0}).sort("from_date", -1).to_list(2000)
    by_emp: dict = {}
    for r in emp_rows:
        by_emp.setdefault(r["employee_id"], []).append(r)
    return [_profile_from(e, by_emp.get(e["id"], [])) for e in emps]


def _filter_candidates(cands: list, role: str, status: str, exclude_tid: str) -> list:
    if exclude_tid:
        cands = [c for c in cands
                 if not (c["employment_status"] == "active" and c["salon_tenant_id"] == exclude_tid)]
    if role.strip():
        rq = role.strip().lower()
        cands = [c for c in cands if rq in c["designation"].lower()]
    if status in ("active", "left"):
        cands = [c for c in cands if c["employment_status"] == status]
    return cands


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
    cands = _filter_candidates(cands, role, status, exclude_tid)
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
        await _record_hire({**app_doc, **patch})
    return {**app_doc, **patch}


# ─────────── Placement fees (HQ charges a configurable fee per successful hire) ───────────
PLACEMENT_FEE_INR = 1000.0  # default — Super Admin can change it


async def _placement_fee_amount() -> float:
    doc = await _raw_db.platform_settings.find_one({"key": "placement_fee"}, {"_id": 0})
    try:
        return float(doc["amount"]) if doc else PLACEMENT_FEE_INR
    except (KeyError, TypeError, ValueError):
        return PLACEMENT_FEE_INR


def _make_payment_link(amount: float, ref_id: str, salon_name: str, candidate: str, owner_email: str) -> str:
    kid, ks = os.environ.get("RAZORPAY_KEY_ID"), os.environ.get("RAZORPAY_KEY_SECRET")
    if not kid or not ks:
        return ""
    try:
        import razorpay
        client = razorpay.Client(auth=(kid, ks))
        pl = client.payment_link.create({
            "amount": int(round(amount * 100)), "currency": "INR",
            "reference_id": ref_id[:40],
            "description": f"Miracurl placement fee — {candidate} hired at {salon_name}"[:250],
            "customer": {"email": owner_email or ""},
            "notify": {"email": False, "sms": False},
            "notes": {"type": "placement_fee", "fee_id": ref_id},
        })
        return pl.get("short_url", "")
    except Exception as e:
        log.error("payment link failed: %s", e)
        return ""


async def _email_fee_to_owner(fee: dict, owner_email: str) -> None:
    if not owner_email:
        return
    import html as _h
    from email_service import _send_email
    cand, salon = _h.escape(fee.get("candidate_name") or "your new hire"), _h.escape(fee.get("salon_name") or "your salon")
    amt = f"₹{fee['amount']:,.0f}"
    pay_block = (f'<p style="margin:18px 0"><a href="{fee["payment_link"]}" style="background:#111;color:#f5d78e;padding:12px 26px;border-radius:999px;text-decoration:none;font-weight:bold">Pay {amt} now</a></p>'
                 if fee.get("payment_link") else "<p>Our team will share the payment details with you shortly.</p>")
    html = (f'<div style="font-family:Georgia,serif;max-width:520px;margin:auto;padding:26px;border:1px solid #eee;border-radius:14px">'
            f'<h2 style="margin:0 0 8px">Congratulations on your new hire! 🎉</h2>'
            f'<p><b>{cand}</b> has been hired at <b>{salon}</b> through the Miracurl Hiring Marketplace.</p>'
            f'<p>As per the marketplace terms, a one-time placement fee of <b>{amt}</b> is now due.</p>'
            f'{pay_block}'
            f'<p style="font-size:12px;color:#888">Questions? Just reply to this email — Miracurl HQ</p></div>')
    try:
        await _send_email(owner_email, f"Placement fee {amt} — {cand} hired 🎉", html)
    except Exception as e:
        log.error("fee email failed: %s", e)


async def _record_hire(app_doc: dict) -> dict:
    """Close the request, create the placement fee (configured amount), generate a Razorpay
    payment link and email it to the salon owner. Idempotent per application."""
    await _raw_db.hiring_requests.update_one(
        {"id": app_doc["request_id"]},
        {"$set": {"status": "closed", "closed_at": _now(), "closed_reason": "hired"}})
    existing = await _raw_db.placement_fees.find_one({"application_id": app_doc["id"]}, {"_id": 0})
    if existing:
        return existing
    req = await _raw_db.hiring_requests.find_one({"id": app_doc["request_id"]}, {"_id": 0}) or {}
    tenant = await db.tenants.find_one({"id": req.get("tenant_id", "")},
                                       {"_id": 0, "name": 1, "owner_email": 1, "slug": 1}) or {}
    amount = await _placement_fee_amount()
    fee = {"id": str(uuid.uuid4()), "application_id": app_doc["id"], "request_id": app_doc["request_id"],
           "tenant_id": req.get("tenant_id", ""), "salon_name": req.get("salon_name") or tenant.get("name", ""),
           "slug": req.get("slug") or tenant.get("slug", ""), "candidate_name": app_doc.get("candidate_name"),
           "role": req.get("role", ""), "amount": amount, "status": "due",
           "payment_link": "", "seen_by_hq": False, "created_at": _now()}
    fee["payment_link"] = await asyncio.to_thread(
        _make_payment_link, amount, fee["id"], fee["salon_name"], fee["candidate_name"] or "", tenant.get("owner_email", ""))
    await _raw_db.placement_fees.insert_one({**fee})
    await _email_fee_to_owner(fee, tenant.get("owner_email", ""))
    return fee


def _match_open_application(apps: list, user_doc: dict, email_by_emp: dict) -> Optional[dict]:
    email = (user_doc.get("email") or "").strip().lower()
    match = next((a for a in apps if email and email_by_emp.get(a["employee_id"]) == email), None)
    if match:
        return match
    # Name fallback must be STRICT (exact normalized full name) — a single shared
    # token like "Test"/"Kumar" must never auto-mark an application as hired.
    given = re.sub(r"\s+", " ", (user_doc.get("name") or "").strip().lower())
    return next((a for a in apps if given and given == re.sub(r"\s+", " ", (a.get("candidate_name") or "").strip().lower())), None)


async def auto_mark_hired_on_staff_attach(tenant: dict, user_doc: dict) -> Optional[dict]:
    """Called when a salon owner creates/attaches staff login credentials. If the new staff
    matches an open hiring application for this salon, auto-mark it hired so HQ gets
    notified and the placement fee + payment link go out."""
    apps = await _raw_db.job_applications.find(
        {"tenant_id": tenant["id"], "status": {"$in": ["applied", "shortlisted", "trial_scheduled"]}},
        {"_id": 0}).to_list(100)
    if not apps:
        return None
    regs = await _raw_db.registry_employees.find(
        {"id": {"$in": [a["employee_id"] for a in apps]}}, {"_id": 0, "id": 1, "email": 1}).to_list(200)
    email_by_emp = {r["id"]: (r.get("email") or "").strip().lower() for r in regs}
    match = _match_open_application(apps, user_doc, email_by_emp)
    if not match:
        return None
    await _raw_db.job_applications.update_one(
        {"id": match["id"]},
        {"$set": {"status": "hired", "updated_at": _now(), "hired_via": "staff_credentials_created"}})
    fee = await _record_hire(match)
    return {"application_id": match["id"], "candidate": match.get("candidate_name"), "fee": fee.get("amount")}


class FeeAmountIn(BaseModel):
    amount: float = Field(..., gt=0, le=100000)


@router.put("/super-admin/hiring/placement-fee")
async def set_placement_fee(body: FeeAmountIn, user=Depends(require_super_admin)):
    await _raw_db.platform_settings.update_one(
        {"key": "placement_fee"},
        {"$set": {"amount": round(body.amount, 2), "updated_at": _now()}}, upsert=True)
    return {"ok": True, "amount": round(body.amount, 2)}


@router.post("/super-admin/hiring/placement-fees/{fid}/send-link")
async def send_fee_link(fid: str, user=Depends(require_super_admin)):
    fee = await _raw_db.placement_fees.find_one({"id": fid}, {"_id": 0})
    if not fee:
        raise HTTPException(404, "Fee not found")
    if fee.get("status") == "paid":
        raise HTTPException(400, "This fee is already paid")
    tenant = await db.tenants.find_one({"id": fee.get("tenant_id", "")}, {"_id": 0, "owner_email": 1}) or {}
    if not fee.get("payment_link"):
        link = await asyncio.to_thread(
            _make_payment_link, fee["amount"], fee["id"], fee.get("salon_name", ""),
            fee.get("candidate_name") or "", tenant.get("owner_email", ""))
        if link:
            fee["payment_link"] = link
            await _raw_db.placement_fees.update_one({"id": fid}, {"$set": {"payment_link": link}})
    await _email_fee_to_owner(fee, tenant.get("owner_email", ""))
    return {"ok": True, "payment_link": fee.get("payment_link", ""),
            "emailed_to": tenant.get("owner_email", "") or None}


@router.get("/super-admin/hiring/placement-fees")
async def placement_fees(user=Depends(require_super_admin)):
    rows = await _raw_db.placement_fees.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    return {"items": rows, "fee_per_hire": await _placement_fee_amount(), "totals": {
        "due": round(sum(r["amount"] for r in rows if r["status"] == "due"), 2),
        "paid": round(sum(r["amount"] for r in rows if r["status"] == "paid"), 2),
        "this_month": round(sum(r["amount"] for r in rows if r["created_at"][:7] == month), 2),
        "hires": len(rows)}}


@router.post("/super-admin/hiring/placement-fees/{fid}/mark-paid")
async def mark_fee_paid(fid: str, user=Depends(require_super_admin)):
    res = await _raw_db.placement_fees.update_one(
        {"id": fid, "status": "due"}, {"$set": {"status": "paid", "paid_at": _now()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Fee not found or already paid")
    return {"ok": True}


# ─────────── Shareable candidate profile (HQ → salon owner via WhatsApp) ───────────

def _candidate_wa_link(app_doc: dict, req: dict, tenant: dict, url: str) -> str | None:
    num = re.sub(r"\D", "", tenant.get("whatsapp_number") or tenant.get("phone") or "")
    if not num:
        return None
    from urllib.parse import quote
    trial = (f" Trial proposed: {app_doc.get('trial_date')} at {app_doc.get('trial_time')}."
             if app_doc.get("trial_date") else "")
    text = (f"Hi {tenant.get('name', '')} ✦ Miracurl HQ here. For your *{req.get('role', 'staff')}* opening, "
            f"we shortlisted *{app_doc.get('candidate_name')}* ({app_doc.get('candidate_designation') or 'verified professional'})."
            f"{trial} See their verified work history & ratings, and confirm in one tap: {url}")
    return f"https://wa.me/{'91' + num if len(num) == 10 else num}?text={quote(text)}"


@router.post("/super-admin/hiring/applications/{aid}/share-link")
async def share_link(aid: str, user=Depends(require_super_admin)):
    """Capability URL: verified work history + ratings, with one-tap trial confirm for the owner."""
    app_doc = await _raw_db.job_applications.find_one({"id": aid}, {"_id": 0})
    if not app_doc:
        raise HTTPException(404, "Application not found")
    token = app_doc.get("share_token")
    if not token:
        token = secrets.token_urlsafe(18)
        await _raw_db.job_applications.update_one({"id": aid}, {"$set": {"share_token": token}})
    url = f"{os.environ.get('APP_PUBLIC_URL', 'https://miracurl-suite.com')}/candidate/{token}"
    req = await _raw_db.hiring_requests.find_one({"id": app_doc["request_id"]}, {"_id": 0}) or {}
    tenant = await db.tenants.find_one({"id": req.get("tenant_id", "")},
                                       {"_id": 0, "whatsapp_number": 1, "phone": 1, "name": 1}) or {}
    return {"url": url, "wa_link": _candidate_wa_link(app_doc, req, tenant, url)}


def _serialize_history(history: list) -> list:
    return [{"salon_name": h.get("salon_name") or "", "designation": h.get("designation") or "",
             "from_date": h.get("from_date") or "", "to_date": h.get("to_date") or "",
             "rating": h.get("rating"), "comment": (h.get("comment") or "")[:200],
             "skills": h.get("skills") or []} for h in history]


@router.get("/public/candidate/{token}")
async def public_candidate(token: str):
    """Owner-facing profile behind an unguessable token. No phone/ID numbers exposed."""
    app_doc = await _raw_db.job_applications.find_one({"share_token": token}, {"_id": 0})
    if not app_doc:
        raise HTTPException(404, "Profile link expired or invalid")
    emp = await _raw_db.registry_employees.find_one({"id": app_doc["employee_id"]}, {"_id": 0}) or {}
    history = await _raw_db.registry_employments.find(
        {"employee_id": app_doc["employee_id"]}, {"_id": 0}).sort("from_date", -1).to_list(20)
    req = await _raw_db.hiring_requests.find_one({"id": app_doc["request_id"]}, {"_id": 0}) or {}
    summary = _rating_summary(history)
    return {
        "candidate_name": app_doc.get("candidate_name"), "city": emp.get("city") or "",
        "designation": app_doc.get("candidate_designation") or "",
        "hq_verified": any(h.get("hq_verified") for h in history),
        "avg_rating": summary["avg_rating"], "ratings_count": summary["ratings_count"],
        "history": _serialize_history(history),
        "role": req.get("role") or "", "status": app_doc.get("status"),
        "trial_date": app_doc.get("trial_date"), "trial_time": app_doc.get("trial_time"),
        "trial_notes": app_doc.get("trial_notes"),
        "owner_confirmed": bool(app_doc.get("owner_confirmed")),
    }


@router.post("/public/candidate/{token}/confirm-trial")
async def confirm_trial(token: str, request: Request):
    await public_rate_limit(request, key_suffix="candconfirm", limit=20, window_sec=3600)
    app_doc = await _raw_db.job_applications.find_one({"share_token": token}, {"_id": 0})
    if not app_doc:
        raise HTTPException(404, "Profile link expired or invalid")
    await _raw_db.job_applications.update_one(
        {"id": app_doc["id"]},
        {"$set": {"owner_confirmed": True, "owner_confirmed_at": _now(), "seen_by_hq": False}})
    return {"ok": True, "message": "Confirmed! Miracurl HQ will finalise the trial with the candidate."}
