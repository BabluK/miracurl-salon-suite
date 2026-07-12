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
    return {"profile": emp, "employments": history, "member_since": acct.get("created_at")}


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
