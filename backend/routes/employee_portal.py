"""Employee self-service portal — registry-verified staff register with phone + Aadhaar,
manage their profile and apply to salon job openings. Separate cookie from salon auth."""
import re
import uuid
import jwt
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Depends, Request, Response
from pydantic import BaseModel, Field, field_validator

from database import _raw_db, db
from security import hash_pw, verify_pw, jwt_secret, JWT_ALG, public_rate_limit, client_ip
from routes.registry import _aadhaar_fps

router = APIRouter()

NOT_REGISTERED_MSG = ("You are not registered with us. Kindly contact the Miracurl Admin team "
                      "for registration — once onboarded, you can use this portal.")
_COOKIE = "emp_token"

_ACCESS_ENDED_MSG = ("This portal is available to active salon staff only. Your access ended because "
                     "you left the salon, were deactivated by your admin, or completed your notice period. "
                     "Please contact your salon admin or the Miracurl HQ team.")


async def _is_employment_active(employee_id: str) -> bool:
    """Portal access rule: ONLY currently-active staff may use the app.
    Left / disabled-by-admin / notice-period-completed → blocked everywhere."""
    emp = await _raw_db.registry_employees.find_one({"id": employee_id}, {"_id": 0, "phone": 1})
    if not emp:
        return False
    phone = _norm_phone(emp.get("phone") or "")
    today = datetime.now(timezone(timedelta(hours=5, minutes=30))).date().isoformat()
    staff_recs = []
    if len(phone) >= 10:
        staff_recs = await _raw_db.staff.find(
            {"phone": {"$regex": f"{re.escape(phone[-10:])}$"}},
            {"_id": 0, "active": 1, "last_working_day": 1}).to_list(20)
    if staff_recs:
        return any(s.get("active", True)
                   and not (s.get("last_working_day") and s["last_working_day"] < today)
                   for s in staff_recs)
    # Registry-only staff (HQ-verified, works at a non-Miracurl salon): active = open employment.
    return bool(await _raw_db.registry_employments.find_one(
        {"employee_id": employee_id, "to_date": None}, {"_id": 1}))


def _norm_phone(p: str) -> str:
    return re.sub(r"\D", "", p or "")[-10:]


def _make_emp_token(account_id: str, employee_id: str) -> str:
    payload = {"sub": account_id, "emp": employee_id,
               "iat": int(datetime.now(timezone.utc).timestamp()),
               "exp": datetime.now(timezone.utc) + timedelta(hours=12),
               "type": "emp_access"}
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALG)


def _set_emp_cookie(resp: Response, token: str):
    import os
    sec = os.environ.get("COOKIE_SECURE", "true").lower() != "false"
    resp.set_cookie(_COOKIE, token, httponly=True, secure=sec, samesite="lax", max_age=43200, path="/")


async def current_employee(request: Request) -> dict:
    token = request.cookies.get(_COOKIE)
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, jwt_secret(), algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(401, "Session expired — please log in again")
    if payload.get("type") != "emp_access":
        raise HTTPException(401, "Invalid token")
    acct = await _raw_db.employee_accounts.find_one({"id": payload["sub"]}, {"_id": 0})
    if not acct:
        raise HTTPException(401, "Account not found")
    if not await _is_employment_active(acct["employee_id"]):
        raise HTTPException(403, _ACCESS_ENDED_MSG)
    return acct


async def _find_registry_emp_by_phone(phone: str) -> dict | None:
    p = _norm_phone(phone)
    if len(p) != 10:
        return None
    async for e in _raw_db.registry_employees.find({}, {"_id": 0}):
        if _norm_phone(e.get("phone", "")) == p:
            return e
    return None


def _verify_aadhaar(emp: dict, aadhaar: str) -> bool:
    num = re.sub(r"\D", "", aadhaar or "")
    if len(num) != 12:
        return False
    return emp.get("aadhaar_hash") in _aadhaar_fps(num)


class RegisterIn(BaseModel):
    phone: str = Field(..., min_length=10, max_length=15)
    aadhaar: str = Field(..., min_length=12, max_length=14)
    password: str = Field(..., min_length=8, max_length=72)


class LoginIn(BaseModel):
    phone: str = Field(..., min_length=10, max_length=15)
    password: str = Field(..., min_length=1, max_length=72)


class ResetIn(BaseModel):
    phone: str = Field(..., min_length=10, max_length=15)
    aadhaar: str = Field(..., min_length=12, max_length=14)
    new_password: str = Field(..., min_length=8, max_length=72)


@router.post("/employee/register")
async def employee_register(body: RegisterIn, request: Request, response: Response):
    public_rate_limit(request, key_suffix="emp-register", limit=5, window_sec=900)
    emp = await _find_registry_emp_by_phone(body.phone)
    if not emp:
        raise HTTPException(404, NOT_REGISTERED_MSG)
    if not _verify_aadhaar(emp, body.aadhaar):
        raise HTTPException(403, "Your details don't match our records. Please check your Aadhaar number or contact the Miracurl Admin team.")
    if await _raw_db.employee_accounts.find_one({"employee_id": emp["id"]}):
        raise HTTPException(400, "You are already registered — please log in (or reset your password below)")
    if not await _is_employment_active(emp["id"]):
        raise HTTPException(403, _ACCESS_ENDED_MSG)
    acct = {"id": str(uuid.uuid4()), "employee_id": emp["id"], "phone": _norm_phone(body.phone),
            "password_hash": hash_pw(body.password),
            "created_at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.employee_accounts.insert_one(acct)
    _set_emp_cookie(response, _make_emp_token(acct["id"], emp["id"]))
    return {"ok": True, "name": emp.get("name"), "staff_code": emp.get("staff_code")}


@router.post("/employee/login")
async def employee_login(body: LoginIn, request: Request, response: Response):
    phone = _norm_phone(body.phone)
    ident = f"{client_ip(request)}:emp:{phone}"
    now = datetime.now(timezone.utc)
    rec = await db.login_attempts.find_one({"identifier": ident})
    if rec and rec.get("count", 0) >= 5:
        lu = rec.get("locked_until")
        if lu and datetime.fromisoformat(lu) > now:
            raise HTTPException(423, "Too many attempts. Try again later.")
    acct = await _raw_db.employee_accounts.find_one({"phone": phone}, {"_id": 0})
    if not acct or not verify_pw(body.password, acct["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": ident},
            {"$inc": {"count": 1},
             "$set": {"last_attempt": now.isoformat(),
                      "locked_until": (now + timedelta(minutes=15)).isoformat()}},
            upsert=True)
        raise HTTPException(401, "Invalid mobile number or password")
    await db.login_attempts.delete_one({"identifier": ident})
    if not await _is_employment_active(acct["employee_id"]):
        raise HTTPException(403, _ACCESS_ENDED_MSG)
    emp = await _raw_db.registry_employees.find_one({"id": acct["employee_id"]}, {"_id": 0, "aadhaar_hash": 0})
    _set_emp_cookie(response, _make_emp_token(acct["id"], acct["employee_id"]))
    return {"ok": True, "name": emp.get("name") if emp else ""}


@router.post("/employee/reset-password")
async def employee_reset_password(body: ResetIn, request: Request):
    public_rate_limit(request, key_suffix="emp-reset", limit=5, window_sec=900)
    emp = await _find_registry_emp_by_phone(body.phone)
    if not emp:
        raise HTTPException(404, NOT_REGISTERED_MSG)
    if not _verify_aadhaar(emp, body.aadhaar):
        raise HTTPException(403, "Your details don't match our records. Please check your Aadhaar number or contact the Miracurl Admin team.")
    res = await _raw_db.employee_accounts.update_one(
        {"employee_id": emp["id"]},
        {"$set": {"password_hash": hash_pw(body.new_password),
                  "password_changed_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(400, "No account yet for this number — please register first")
    return {"ok": True}


@router.post("/employee/logout")
async def employee_logout(response: Response):
    response.delete_cookie(_COOKIE, path="/")
    return {"ok": True}


@router.get("/employee/me")
async def employee_me(acct=Depends(current_employee)):
    emp = await _raw_db.registry_employees.find_one(
        {"id": acct["employee_id"]}, {"_id": 0, "aadhaar_hash": 0})
    if not emp:
        raise HTTPException(404, "Registry profile not found — contact the Miracurl Admin team")
    rows = await _raw_db.registry_employments.find(
        {"employee_id": emp["id"]}, {"_id": 0}).sort("from_date", -1).to_list(50)
    history = []
    for r in rows:
        t = await db.tenants.find_one({"id": r.get("tenant_id")}, {"_id": 0, "name": 1}) if r.get("tenant_id") not in (None, "hq") else None
        history.append({"salon": (t or {}).get("name") or r.get("salon_name") or "Miracurl HQ",
                        "designation": r.get("designation") or "Stylist",
                        "from_date": r.get("from_date"), "to_date": r.get("to_date"),
                        "hq_verified": bool(r.get("hq_verified"))})
    staff_info = await _current_staff_info(emp)
    return {"profile": emp, "employments": history, "member_since": acct.get("created_at"),
            "week_off_day": staff_info.get("week_off_day"),
            "shift_start": staff_info.get("shift_start"),
            "shift_end": staff_info.get("shift_end"),
            "staff_name": staff_info.get("name")}


class ConsentIn(BaseModel):
    public_visible: bool


@router.post("/employee/me/consent")
async def employee_consent(body: ConsentIn, acct=Depends(current_employee)):
    """One-click withdraw (or restore) consent for public Staff Registry lookups."""
    await _raw_db.registry_employees.update_one(
        {"id": acct["employee_id"]},
        {"$set": {"consent_withdrawn": not body.public_visible,
                  "consent_updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "public_visible": body.public_visible}


async def _current_staff_info(emp: dict) -> dict:
    """Week-off + shift from the active staff record matching this employee's phone."""
    phone = _norm_phone(emp.get("phone") or "")
    if not phone:
        return {}
    async for s in _raw_db.staff.find({"active": True},
                                      {"_id": 0, "phone": 1, "week_off_day": 1,
                                       "shift_start": 1, "shift_end": 1, "name": 1}):
        if _norm_phone(s.get("phone") or "") == phone:
            return s
    return {}


class ProfileIn(BaseModel):
    name: str = Field("", max_length=80)
    email: str = Field("", max_length=120)
    city: str = Field("", max_length=80)
    current_address: str = Field("", max_length=300)
    photo_url: str = Field("", max_length=500)

    @field_validator("email")
    @classmethod
    def _v_email(cls, v):
        v = v.strip().lower()
        if v and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("Invalid email address")
        return v


@router.patch("/employee/me")
async def employee_update_profile(body: ProfileIn, acct=Depends(current_employee)):
    patch = {k: v.strip() for k, v in body.model_dump().items() if v and v.strip()}
    if not patch:
        raise HTTPException(400, "Nothing to update")
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _raw_db.registry_employees.update_one({"id": acct["employee_id"]}, {"$set": patch})
    return {"ok": True}


# ─────────── My Resume builder ───────────

class ResumeIn(BaseModel):
    summary: str = Field("", max_length=600)
    skills: str = Field("", max_length=300)
    education: str = Field("", max_length=300)
    languages: str = Field("", max_length=200)
    extra_experience: str = Field("", max_length=800)


@router.get("/employee/resume")
async def get_resume(acct=Depends(current_employee)):
    doc = await _raw_db.employee_resumes.find_one({"employee_id": acct["employee_id"]}, {"_id": 0})
    return doc or {"summary": "", "skills": "", "education": "", "languages": "", "extra_experience": ""}


@router.put("/employee/resume")
async def save_resume(body: ResumeIn, acct=Depends(current_employee)):
    data = {k: v.strip() for k, v in body.model_dump().items()}
    data.update({"employee_id": acct["employee_id"],
                 "updated_at": datetime.now(timezone.utc).isoformat()})
    await _raw_db.employee_resumes.update_one(
        {"employee_id": acct["employee_id"]}, {"$set": data}, upsert=True)
    return {"ok": True}


class _ResumeWriter:
    """Thin cursor-tracking wrapper around a reportlab canvas."""
    GOLD, INK, GREY = (0.72, 0.6, 0.25), (0.12, 0.12, 0.14), (0.45, 0.45, 0.5)

    def __init__(self, c, W, H, mm):
        self.c, self.W, self.H, self.mm = c, W, H, mm
        self.y = H - 52 * mm

    def _page_break(self, floor=25):
        if self.y < floor * self.mm:
            self.c.showPage()
            self.y = self.H - 25 * self.mm

    def section(self, title):
        c, mm = self.c, self.mm
        self._page_break(35)
        c.setFillColorRGB(*self.GOLD)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(20 * mm, self.y, title.upper())
        c.setStrokeColorRGB(*self.GOLD)
        c.setLineWidth(0.7)
        c.line(20 * mm, self.y - 2 * mm, self.W - 20 * mm, self.y - 2 * mm)
        self.y -= 8 * mm

    def para(self, text, size=10, leading=5.2):
        import textwrap
        c, mm = self.c, self.mm
        c.setFillColorRGB(*self.INK)
        c.setFont("Helvetica", size)
        for line in textwrap.wrap(text, 95):
            self._page_break()
            c.drawString(20 * mm, self.y, line)
            self.y -= leading * mm
        self.y -= 2 * mm

    def job_row(self, r):
        c, mm = self.c, self.mm
        self._page_break(30)
        c.setFillColorRGB(*self.INK)
        c.setFont("Helvetica-Bold", 10.5)
        c.drawString(20 * mm, self.y, f"{r['designation']} — {r['salon']}")
        c.setFillColorRGB(*self.GREY)
        c.setFont("Helvetica", 9)
        verified = "  ✔ HQ Verified" if r.get("hq_verified") else ""
        c.drawRightString(self.W - 20 * mm, self.y,
                          f"{r.get('from_date') or ''} → {r.get('to_date') or 'Present'}{verified}")
        self.y -= 6 * mm


def _resume_header(c, W, H, mm, emp):
    c.setFillColorRGB(*_ResumeWriter.INK)
    c.rect(0, H - 42 * mm, W, 42 * mm, stroke=0, fill=1)
    c.setFillColorRGB(*_ResumeWriter.GOLD)
    c.setFont("Helvetica-Bold", 24)
    c.drawString(20 * mm, H - 22 * mm, emp.get("name") or "—")
    c.setFillColorRGB(0.92, 0.92, 0.92)
    c.setFont("Helvetica", 10)
    contact = " · ".join(x for x in [emp.get("phone"), emp.get("email"), emp.get("city")] if x)
    c.drawString(20 * mm, H - 29 * mm, contact)
    c.setFont("Helvetica-Oblique", 9)
    c.drawString(20 * mm, H - 35 * mm, f"Miracurl Verified Registry · Staff code {emp.get('staff_code', '')}")


def _resume_pdf(emp: dict, resume: dict, history: list) -> bytes:
    import io
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as rl_canvas

    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    _resume_header(c, W, H, mm, emp)
    w = _ResumeWriter(c, W, H, mm)

    if resume.get("summary"):
        w.section("Profile")
        w.para(resume["summary"])
    if resume.get("skills"):
        w.section("Skills")
        w.para(" · ".join(s.strip() for s in resume["skills"].split(",") if s.strip()))
    w.section("Experience")
    for r in history:
        w.job_row(r)
    if resume.get("extra_experience"):
        w.para(resume["extra_experience"], size=9.5)
    if resume.get("education"):
        w.section("Education")
        w.para(resume["education"])
    if resume.get("languages"):
        w.section("Languages")
        w.para(resume["languages"])

    c.setFillColorRGB(*_ResumeWriter.GREY)
    c.setFont("Helvetica-Oblique", 8)
    c.drawCentredString(W / 2, 14 * mm, "Generated by Miracurl Employee Portal · miracurl-suite.com/staff-registry")
    c.save()
    return buf.getvalue()


@router.get("/employee/resume/pdf")
async def resume_pdf(acct=Depends(current_employee)):
    import asyncio
    from fastapi.responses import Response as FastResponse
    emp = await _raw_db.registry_employees.find_one(
        {"id": acct["employee_id"]}, {"_id": 0, "aadhaar_hash": 0})
    if not emp:
        raise HTTPException(404, "Profile not found")
    resume = await _raw_db.employee_resumes.find_one({"employee_id": emp["id"]}, {"_id": 0}) or {}
    rows = await _raw_db.registry_employments.find(
        {"employee_id": emp["id"]}, {"_id": 0}).sort("from_date", -1).to_list(50)
    history = []
    for r in rows:
        t = await db.tenants.find_one({"id": r.get("tenant_id")}, {"_id": 0, "name": 1}) if r.get("tenant_id") not in (None, "hq") else None
        history.append({"salon": (t or {}).get("name") or r.get("salon_name") or "Miracurl HQ",
                        "designation": r.get("designation") or "Stylist",
                        "from_date": r.get("from_date"), "to_date": r.get("to_date"),
                        "hq_verified": bool(r.get("hq_verified"))})
    pdf = await asyncio.to_thread(_resume_pdf, emp, resume, history)
    fname = f"resume-{(emp.get('name') or 'staff').lower().replace(' ', '-')}.pdf"
    return FastResponse(content=pdf, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="{fname}"'})
