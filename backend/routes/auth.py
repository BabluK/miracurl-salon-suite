"""Authentication & onboarding: register, login, logout, refresh, password reset,
staff attach, public salon self-signup (7-day trial)."""
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from database import db, _raw_db
from models import Tenant
from security import (
    JWT_ALG, jwt_secret, hash_pw, verify_pw, make_access, make_refresh,
    set_auth_cookies, get_current_user, require_tenant_admin, current_tenant,
    public_rate_limit, revoke_token_jtis, _reject_if_revoked,
    _reject_if_token_predates_password_change, client_ip,
)

router = APIRouter()


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class ForgotIn(BaseModel):
    email: EmailStr
    personal_email: Optional[EmailStr] = None

class ResetIn(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)

async def _match_unclaimed_staff(email: str) -> tuple[Optional[dict], Optional[dict]]:
    """(staff, tenant) when the email exactly matches a staff profile no user has claimed yet."""
    m = await _raw_db.staff.find_one(
        {"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}},
        {"_id": 0, "id": 1, "tenant_id": 1, "name": 1, "role": 1, "user_id": 1})
    if not m or m.get("user_id"):
        return None, None
    tenant = await _raw_db.tenants.find_one({"id": m["tenant_id"]}, {"_id": 0, "id": 1, "slug": 1, "name": 1})
    return (m, tenant) if tenant else (None, None)


@router.post("/auth/register")
async def register(body: RegisterIn, request: Request, response: Response):
    """Public staff registration.

    SECURITY (SEC-001 fix): the caller-controlled X-Tenant-Slug header is
    DELIBERATELY ignored here. A stranger cannot register themselves into
    another salon's data. New accounts are created as ORPHANS (tenant_id=None,
    status="pending"). A tenant admin must explicitly attach the account to
    their tenant via /api/tenants/staff/{user_id}/attach before the user can
    access any customer/appointment/invoice data.
    """
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    # Auto-link hint: if this email exactly matches a staff profile in a salon,
    # route the pending request to THAT salon's approval list (admin still approves).
    matched_staff, matched_tenant = await _match_unclaimed_staff(email)
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.name,
        "role": "staff",
        "tenant_id": None,
        "status": "pending",  # awaiting admin attach
        # Unverified HINT of which salon they meant to join — used ONLY to scope
        # the owner's pending list (privacy), never for authorization.
        "requested_tenant_slug": (matched_tenant or {}).get("slug")
                                 or (request.headers.get("X-Tenant-Slug") or "").strip().lower() or None,
        # Server-verified match to an unlinked staff profile (approval still required).
        "matched_staff_id": (matched_staff or {}).get("id"),
        "matched_tenant_id": (matched_tenant or {}).get("id"),
        "password_hash": hash_pw(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    access = make_access(user["id"], email)
    refresh = make_refresh(user["id"])
    set_auth_cookies(response, access, refresh)
    user.pop("password_hash", None)
    user.pop("_id", None)
    msg = ("Account created. Ask your salon admin to link it to your salon before you can log in fully."
           if not matched_staff else
           f"Account created — we found your staff profile at {matched_tenant['name']}. "
           f"Your salon admin has been asked to approve the link; you'll get full access once they do.")
    return {"user": user, "message": msg}


class StaffAttachIn(BaseModel):
    role: str = Field("staff", pattern=r"^(staff|admin)$")


async def _link_matched_staff(target: dict, tenant_id: str, user_id: str) -> Optional[str]:
    """After approval: link the user to their matched staff profile if it is still unclaimed."""
    if not target.get("matched_staff_id") or target.get("matched_tenant_id") != tenant_id:
        return None
    sp = await db.staff.find_one({"id": target["matched_staff_id"]},
                                 {"_id": 0, "id": 1, "name": 1, "user_id": 1, "email": 1})
    if not sp or sp.get("user_id") or (sp.get("email") or "").lower() != (target.get("email") or "").lower():
        return None
    await db.users.update_one({"id": user_id}, {"$set": {"staff_id": sp["id"]}})
    await db.staff.update_one({"id": sp["id"]}, {"$set": {"user_id": user_id}})
    return sp["name"]


@router.post("/tenants/staff/{user_id}/attach")
async def attach_staff(user_id: str, body: StaffAttachIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Tenant admin attaches a pending self-registered user to this tenant."""
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    if target.get("tenant_id") and target.get("tenant_id") != t["id"]:
        raise HTTPException(409, "User already belongs to another salon")
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"tenant_id": t["id"], "role": body.role, "status": "active",
                  "attached_at": datetime.now(timezone.utc).isoformat(),
                  "attached_by": admin["id"]}},
    )
    linked_staff = await _link_matched_staff(target, t["id"], user_id)
    # Hiring marketplace hook: if this new staff matches an open application for this
    # salon, auto-mark it hired → HQ notified + placement fee & payment link emailed.
    hired = None
    try:
        from routes.hiring import auto_mark_hired_on_staff_attach
        hired = await auto_mark_hired_on_staff_attach(t, target)
    except Exception as e:
        logging.getLogger("auth").error("auto-hire hook failed: %s", e)
    return {"ok": True, "marketplace_hire": hired, "linked_staff": linked_staff}


@router.delete("/tenants/staff/pending/{user_id}")
async def reject_pending_staff(user_id: str, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Reject (delete) an orphan self-registered account that requested this salon."""
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target or target.get("tenant_id") or target.get("status") != "pending":
        raise HTTPException(404, "Pending sign-up not found")
    if target.get("requested_tenant_slug") not in (t["slug"], None) and target.get("matched_tenant_id") != t["id"]:
        raise HTTPException(403, "This sign-up did not request your salon")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}


@router.get("/tenants/staff/pending")
async def list_pending_staff(_admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Show self-registered users awaiting admin attach so an owner can accept
    only the people they recognise (email must match the person's real address).
    SEC hardening: scoped to users who registered for THIS salon (or gave no hint),
    so one owner can't harvest sign-up emails intended for other salons."""
    pending = await db.users.find(
        {"tenant_id": None, "status": "pending",
         "$or": [{"requested_tenant_slug": {"$in": [t["slug"], None]}},
                 {"matched_tenant_id": t["id"]}]},
        {"_id": 0, "id": 1, "email": 1, "name": 1, "created_at": 1, "matched_staff_id": 1, "matched_tenant_id": 1},
    ).sort("created_at", -1).to_list(50)
    for p in pending:
        p["matched_staff"] = None
        if p.get("matched_staff_id") and p.get("matched_tenant_id") == t["id"]:
            sp = await db.staff.find_one({"id": p["matched_staff_id"]}, {"_id": 0, "name": 1, "role": 1, "user_id": 1})
            if sp and not sp.get("user_id"):
                p["matched_staff"] = {"name": sp["name"], "role": sp.get("role") or "Staff"}
        p.pop("matched_staff_id", None)
        p.pop("matched_tenant_id", None)
    return {"pending": pending}


# ============== Public Salon Self-Signup (7-day trial) ==============
TRIAL_DAYS = 7
_SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$")


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:40] or "salon"


class SalonSignupIn(BaseModel):
    salon_name: str = Field(..., min_length=3, max_length=80)
    slug: Optional[str] = None  # auto-generated if blank
    owner_name: str = Field(..., min_length=2, max_length=80)
    owner_email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    location: Optional[str] = None
    phone: Optional[str] = None
    ref: Optional[str] = None  # affiliate referrer slug (Refer-a-salon program)
    region: Optional[str] = Field(None, pattern="^(in|intl)$")  # pricing region picked at signup
    timezone: Optional[str] = Field(None, max_length=64)  # browser timezone (stored for intl salons)


AFFILIATE_REWARD_INR = 1000.0  # ₹ credited to the referrer for each verified signup


async def _resolve_unique_slug(body: SalonSignupIn) -> str:
    base_slug = body.slug.strip().lower() if body.slug else slugify(body.salon_name)
    if not _SLUG_RE.match(base_slug):
        raise HTTPException(400, "Slug must be lowercase letters, digits or hyphens (3–40 chars)")
    candidate = base_slug
    suffix = 1
    while await db.tenants.find_one({"slug": candidate}, {"_id": 0, "id": 1}):
        suffix += 1
        candidate = f"{base_slug}-{suffix}"
        if suffix > 50:
            raise HTTPException(400, "Couldn't generate a unique slug — try a different salon name")
    return candidate


async def _resolve_referrer(ref: Optional[str], candidate: str) -> Optional[dict]:
    """Refer-a-salon program — silently ignore invalid/self-ref to keep signup smooth."""
    if not ref:
        return None
    ref_slug = ref.strip().lower()
    if not ref_slug or ref_slug == candidate:
        return None
    return await db.tenants.find_one(
        {"slug": ref_slug, "status": {"$in": ["trial", "active"]}},
        {"_id": 0, "id": 1, "slug": 1, "owner_email": 1, "name": 1},
    )


async def _record_pending_referral(referrer: dict, tenant: dict) -> None:
    """Reward is granted only after the referred salon completes a real payment (anti-farming)."""
    await db.affiliate_referrals.insert_one({
        "id": str(uuid.uuid4()),
        "referrer_tenant_id": referrer["id"],
        "referrer_slug": referrer["slug"],
        "referred_tenant_id": tenant["id"],
        "referred_slug": tenant["slug"],
        "referred_salon_name": tenant["name"],
        "credit_amount": AFFILIATE_REWARD_INR,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


def _build_signup_tenant(body: SalonSignupIn, candidate: str, referrer: dict | None, trial_end: str) -> dict:
    tenant = Tenant(
        slug=candidate,
        name=body.salon_name.strip(),
        owner_email=body.owner_email.lower(),
        location=body.location,
        phone=body.phone,
        plan="trial",
        status="trial",
        referred_by_tenant_id=referrer["id"] if referrer else None,
    ).model_dump()
    tenant["trial_end_date"] = trial_end
    if body.region == "intl":
        tenant["currency"] = "USD"
        if body.timezone:
            tenant["timezone"] = body.timezone
    return tenant


def _build_signup_owner(body: SalonSignupIn, email: str, tenant_id: str) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.owner_name.strip(),
        "role": "admin",
        "tenant_id": tenant_id,
        "password_hash": hash_pw(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/public/signup-salon")
async def public_signup_salon(body: SalonSignupIn, request: Request, response: Response):
    public_rate_limit(request, key_suffix="signup", limit=4, window_sec=900)

    email = body.owner_email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "An account with this email already exists")

    candidate = await _resolve_unique_slug(body)
    trial_end = (datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)).date().isoformat()
    referrer = await _resolve_referrer(body.ref, candidate)

    tenant = _build_signup_tenant(body, candidate, referrer, trial_end)
    await db.tenants.insert_one(tenant)

    owner = _build_signup_owner(body, email, tenant["id"])
    await db.users.insert_one(owner)

    if referrer:
        await _record_pending_referral(referrer, tenant)

    access = make_access(owner["id"], email)
    refresh = make_refresh(owner["id"])
    set_auth_cookies(response, access, refresh)
    owner.pop("password_hash", None)
    tenant.pop("_id", None)
    owner.pop("_id", None)
    return {
        "user": owner,
        "tenant": tenant,
        "trial_end_date": trial_end,
        "trial_days": TRIAL_DAYS,
    }


async def _attach_salons(user: dict) -> dict:
    """Multi-salon owners: list all salons linked to this login."""
    ids = set(user.get("tenant_ids") or [])
    if user.get("tenant_id"):
        ids.add(user["tenant_id"])
    if len(ids) > 1:
        user["salons"] = await db.tenants.find(
            {"id": {"$in": list(ids)}},
            {"_id": 0, "id": 1, "name": 1, "slug": 1, "logo_url": 1, "location": 1, "status": 1},
        ).sort("name", 1).to_list(20)
    return user


@router.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower()
    ident = f"{client_ip(request)}:{email}"
    rec = await db.login_attempts.find_one({"identifier": ident})
    now = datetime.now(timezone.utc)
    if rec and rec.get("count", 0) >= 5:
        locked_until = rec.get("locked_until")
        if locked_until and datetime.fromisoformat(locked_until) > now:
            raise HTTPException(423, "Too many attempts. Try again later.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_pw(body.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": ident},
            {"$inc": {"count": 1},
             "$set": {"last_attempt": now.isoformat(),
                      "locked_until": (now + timedelta(minutes=15)).isoformat()}},
            upsert=True,
        )
        from security import _log_sec_event
        _log_sec_event("failed_login", tenant_id=request.headers.get("X-Tenant-Slug", ""),
                       ip=client_ip(request), detail=email)
        raise HTTPException(401, "Invalid email or password")
    # SEC / access control: admin can disable a staff account without deleting it.
    # A disabled user MUST NOT get a token, even if the password is correct.
    if user.get("disabled"):
        raise HTTPException(403, "Your account has been disabled by the salon admin. Please contact them.")
    await db.login_attempts.delete_one({"identifier": ident})
    access = make_access(user["id"], email)
    refresh = make_refresh(user["id"])
    set_auth_cookies(response, access, refresh)
    user.pop("password_hash", None)
    user.pop("_id", None)
    await _attach_salons(user)
    return {"user": user}

@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    await revoke_token_jtis(request)
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}

@router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return await _attach_salons(user)

@router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "No refresh token")
    try:
        payload = jwt.decode(token, jwt_secret(), algorithms=[JWT_ALG])
        if payload.get("type") != "refresh":
            raise HTTPException(401, "Invalid type")
        await _reject_if_revoked(payload)
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(401, "User not found")
        if user.get("disabled") or user.get("status") == "disabled" or user.get("active") is False:
            raise HTTPException(401, "Account disabled")
        _reject_if_token_predates_password_change(payload, user)
        access = make_access(user["id"], user["email"])
        response.set_cookie(
            "access_token", access, httponly=True,
            secure=(os.environ.get("COOKIE_SECURE", "true").lower() != "false"),
            samesite="lax", max_age=28800, path="/",
        )
        return {"ok": True}
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid refresh token")

async def _staff_reset_recipient(email: str, personal_email) -> str | None:
    """Active staff may self-reset only to the personal email on their staff record."""
    staff = await _raw_db.staff.find_one(
        {"email": email}, {"_id": 0, "active": 1, "status": 1, "personal_email": 1})
    provided = (personal_email or "").lower().strip()
    on_file = ((staff or {}).get("personal_email") or "").lower().strip()
    if (not staff or staff.get("active") is False
            or staff.get("status") in ("inactive", "archived")
            or not provided or not on_file or provided != on_file):
        return None
    return on_file


async def _send_reset_email(login_email: str, recipient: str, token: str):
    from email_service import _send_email
    reset_link = f"{os.environ.get('APP_PUBLIC_URL', '')}/reset-password?token={token}"
    await _send_email(
        [recipient],
        "Reset your Miracurl password",
        f"<div style='font-family:Arial,sans-serif;max-width:520px'>"
        f"<h2 style='margin:0 0 8px'>Password reset ✦</h2>"
        f"<p style='color:#444'>Tap the button below to set a new password for your login "
        f"<b>{login_email}</b>. This link works once and expires in 1 hour.</p>"
        f"<p style='margin:20px 0'><a href='{reset_link}' "
        f"style='background:#e11d48;color:#fff;padding:12px 22px;border-radius:24px;"
        f"text-decoration:none;font-weight:bold'>Set new password</a></p>"
        f"<p style='color:#888;font-size:12px'>Didn't ask for this? You can safely ignore this email — "
        f"your password stays unchanged.</p></div>")


@router.post("/auth/forgot-password")
async def forgot(body: ForgotIn, request: Request):
    from security import public_rate_limit
    public_rate_limit(request, key_suffix="forgotpw", limit=5, window_sec=3600)
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    reset_recipient = email
    if user and user.get("role") in ("staff", "employee"):
        # Staff login IDs aren't real inboxes — response stays generic (no enumeration).
        reset_recipient = await _staff_reset_recipient(email, body.personal_email)
        if not reset_recipient:
            user = None
    if user:
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({
            "token": token,
            "user_id": user["id"],
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "used": False,
        })
        try:
            await _send_reset_email(email, reset_recipient, token)
        except Exception as e:
            logging.error(f"reset email send failed for {reset_recipient}: {e}")
        logging.info("[Miracurl] Password reset requested for %s (token %d chars)", email, len(token))
    return {"message": "If that email exists, a reset link was sent."}

@router.post("/auth/reset-password")
async def reset(body: ResetIn):
    rec = await db.password_reset_tokens.find_one({"token": body.token})
    if not rec or rec.get("used"):
        raise HTTPException(400, "Invalid or used token")
    if datetime.fromisoformat(rec["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(400, "Token expired")
    await db.users.update_one({"id": rec["user_id"]}, {"$set": {
        "password_hash": hash_pw(body.new_password),
        "password_changed_at": datetime.now(timezone.utc).isoformat()}})
    await db.password_reset_tokens.update_one({"token": body.token}, {"$set": {"used": True}})
    user = await db.users.find_one({"id": rec["user_id"]}, {"_id": 0, "email": 1})
    if user and user.get("email"):
        import re as _re
        await db.login_attempts.delete_many({"identifier": {"$regex": f"{_re.escape(user['email'])}$"}})
    return {"ok": True}
