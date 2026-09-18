"""Authentication & onboarding: register, login, logout, refresh, password reset,
staff attach, public salon self-signup (7-day trial)."""
import asyncio
import html as html_lib
import logging
import os
import re
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from database import _raw_db, db
from models import Tenant
from security import (
    JWT_ALG,
    _reject_if_revoked,
    _reject_if_token_predates_password_change,
    client_ip,
    current_sid,
    current_tenant,
    get_current_user,
    global_daily_cap,
    hash_pw,
    jwt_secret,
    make_access,
    make_refresh,
    public_rate_limit,
    require_tenant_admin,
    revoke_token_jtis,
    set_auth_cookies,
    start_session,
    verify_pw,
)

router = APIRouter()


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str
    remember: bool = False


GRACE_DAYS = 60  # HQ courtesy window after expiry before login is blocked


def _subscription_deadline(t: dict) -> date | None:
    """Last allowed login day: subscription/trial end + grace days (or explicit grace_until)."""
    end = t.get("subscription_end_date") or t.get("trial_end_date") or t.get("trial_ends_at")
    if not end:
        return None
    try:
        end_d = date.fromisoformat(str(end)[:10])
    except ValueError:
        return None
    limit = end_d + timedelta(days=GRACE_DAYS)
    if t.get("grace_until"):
        try:
            limit = max(limit, date.fromisoformat(str(t["grace_until"])[:10]))
        except ValueError:
            pass
    return limit


def _trial_gate(t: dict, trial_end: str) -> None:
    """Pure trial — blocks the day after trial ends (only an explicit HQ grace_until extends it)."""
    try:
        limit = date.fromisoformat(str(trial_end)[:10])
    except ValueError:
        return
    if t.get("grace_until"):
        try:
            limit = max(limit, date.fromisoformat(str(t["grace_until"])[:10]))
        except ValueError:
            pass
    if date.today() > limit:
        end_d = date.fromisoformat(str(trial_end)[:10])
        raise HTTPException(403, {
            "code": "trial_expired",
            "end_date": end_d.isoformat(),
            "message": f"Your free trial ended on {end_d.strftime('%d %b %Y')}. "
                       "Please contact the Miracurl team to activate your subscription."})


async def _subscription_gate(user: dict) -> None:
    """Block login for expired salons. Trials get NO grace; paid plans get the grace window."""
    if user.get("role") == "super_admin" or not user.get("tenant_id"):
        return
    t = await db.tenants.find_one(
        {"id": user["tenant_id"]},
        {"_id": 0, "status": 1, "subscription_end_date": 1, "trial_end_date": 1,
         "trial_ends_at": 1, "grace_until": 1})
    if not t:
        return
    _raise_if_suspended(t)
    sub_end = t.get("subscription_end_date")
    trial_end = t.get("trial_end_date") or t.get("trial_ends_at")
    if not sub_end and trial_end:
        return _trial_gate(t, trial_end)
    limit = _subscription_deadline(t)
    if limit and date.today() > limit:
        _raise_subscription_expired(sub_end or trial_end)


def _raise_if_suspended(t: dict) -> None:
    if t.get("status") == "suspended":
        raise HTTPException(403, {
            "code": "suspended",
            "message": "Your salon account is currently suspended. Please contact the Miracurl team to reactivate."})


def _raise_subscription_expired(end) -> None:
    end_d = date.fromisoformat(str(end)[:10])
    raise HTTPException(403, {
        "code": "subscription_expired",
        "end_date": end_d.isoformat(),
        "message": f"We're sorry — your subscription expired on {end_d.strftime('%d %b %Y')}. "
                   "Please pay to continue using Miracurl Suite, or contact the Miracurl team."})

class ForgotIn(BaseModel):
    email: EmailStr
    personal_email: EmailStr | None = None

class ResetIn(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)

async def _match_unclaimed_staff(email: str) -> tuple[dict | None, dict | None]:
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
    sid = await start_session(user["id"], email, None, request)
    access = make_access(user["id"], email, sid)
    refresh = make_refresh(user["id"], sid)
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


async def _link_matched_staff(target: dict, tenant_id: str, user_id: str) -> str | None:
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
TRIAL_DAYS = 7  # legacy — live value comes from routes.subscriptions.get_trial_days()
_SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$")


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:40] or "salon"


class SalonSignupIn(BaseModel):
    salon_name: str = Field(..., min_length=3, max_length=80)
    slug: str | None = None  # auto-generated if blank
    owner_name: str = Field(..., min_length=2, max_length=80)
    owner_email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    location: str | None = None
    phone: str | None = None
    ref: str | None = None  # affiliate referrer slug (Refer-a-salon program)
    offer: str | None = Field(None, max_length=20)  # e.g. "newbiz" → 90-day trial
    newly_opened: bool | None = False  # self-declared new business on the signup page
    opening_date: str | None = Field(None, max_length=10)  # ISO date, past or future
    region: str | None = Field(None, pattern="^(in|intl)$")  # pricing region picked at signup
    timezone: str | None = Field(None, max_length=64)  # browser timezone (stored for intl salons)
    business_type: str | None = Field("salon", pattern="^(salon|restaurant)$")


from constants import AFFILIATE_REWARD_INR


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


async def _resolve_referrer(ref: str | None, candidate: str) -> dict | None:
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
        "credit_amount": AFFILIATE_REWARD_INR,  # legacy field; reward is now 1 free month
        "reward": "free_month",
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def _convert_lead_to_customer(email: str, tenant: dict) -> None:
    """Lead-agent ROI: if this signup email matches an outreach lead, mark it converted 🟢."""
    now = datetime.now(timezone.utc).isoformat()
    await _raw_db.mira_leads.update_many(
        {"$or": [{"email": email.lower()}, {"all_emails": email.lower()}]},
        {"$set": {"status": "customer", "converted_at": now,
                  "converted_tenant_id": tenant["id"], "converted_tenant_slug": tenant["slug"]}})


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
    tenant["business_type"] = body.business_type or "salon"
    if body.region == "intl":
        tenant["currency"] = "USD"
        if body.timezone:
            tenant["timezone"] = body.timezone
    return tenant


from services.tenant_seed import _seed_restaurant_defaults  # noqa: E402


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


async def _send_newbiz_plan_email(tenant: dict, owner_email: str, trial_end: str) -> None:
    """New-Biz Plan Email: the special subscription plan sheet, sent right after claiming the offer."""
    from email_service import _send_email, newbiz_plan_email_html
    from routes.subscriptions import PLAN_CATALOG, load_plan_overrides
    await load_plan_overrides()
    resto = tenant.get("business_type") == "restaurant"
    intl = tenant.get("currency") == "USD"
    keys = {(False, False): ("half_year", "annual"),
            (False, True): ("intl_pro_half", "intl_pro_annual"),
            (True, False): ("resto_half", "resto_annual"),
            (True, True): ("resto_intl_half", "resto_intl_annual")}[(resto, intl)]
    from routes.subscriptions import load_plan_overrides
    await load_plan_overrides()  # live super-admin prices, not the boot-time defaults
    plans = [PLAN_CATALOG[k] for k in keys if k in PLAN_CATALOG]
    login_url = f"{os.environ.get('APP_PUBLIC_URL', 'https://miracurl-suite.com')}/login"
    try:
        status = await _send_email(
            [owner_email], f"🎊 Your special New-Business plan — FREE 90-day setup for {tenant.get('name')}",
            newbiz_plan_email_html(tenant, trial_end, plans),
            book_url=login_url, book_label="Open my dashboard ✦")
        if not status.get("sent"):
            logging.warning(f"newbiz plan email failed: {status.get('error')}")
    except Exception as e:
        logging.warning(f"newbiz plan email failed: {e}")


async def _send_signup_welcome(tenant: dict, body: SalonSignupIn, trial_end: str) -> None:
    from email_service import (
        _send_email,
        restaurant_welcome_email_html,
        salon_welcome_email_html,
    )
    login_url = f"{os.environ.get('APP_PUBLIC_URL', 'https://miracurl-suite.com')}/login"
    # SEC-001: poster (paid AI image) is generated on the owner's FIRST LOGIN, not at signup
    poster_url = ""
    is_resto = tenant.get("business_type") == "restaurant"
    if is_resto:
        subject = f"Welcome to Miracurl — {tenant['name']} is ready to serve 🍽️✦"
        html = restaurant_welcome_email_html(tenant["name"], body.owner_name, body.owner_email.lower(),
                                             body.password, trial_end, poster_url)
        book_label = "Log in to your restaurant ✦"
    else:
        subject = f"Welcome to Miracurl — {tenant['name']} is ready to shine ✂️✦"
        html = salon_welcome_email_html(tenant["name"], body.owner_name, body.owner_email.lower(),
                                        body.password, trial_end, poster_url)
        book_label = "Log in to your salon ✦"
    try:
        status = await _send_email([body.owner_email.lower()], subject, html,
                                   book_url=login_url, book_label=book_label)
        if not status.get("sent"):
            logging.warning(f"signup welcome email failed: {status.get('error')}")
    except Exception as e:
        logging.warning(f"signup welcome email failed: {e}")


async def _signup_offer(body: SalonSignupIn, email: str) -> tuple[str | None, int]:
    """(offer tag, trial days) — newbiz → 90 d, founder letter → 180 d, else Plan Catalog default."""
    from routes.subscriptions import get_trial_days
    trial_days = await get_trial_days()  # super-admin configurable (Plan Catalog), default 30
    if (body.offer or "").strip().lower() == "newbiz" or bool(body.newly_opened):
        return "newbiz", 90  # new / newly-opened business: FREE 90-day setup
    if await _raw_db.demo_invites.find_one({"email": email, "template": "founder"}, {"_id": 0, "id": 1}):
        from routes.hq_documents import FOUNDER_INVITE_TRIAL_DAYS
        return "founder_6m", max(trial_days, FOUNDER_INVITE_TRIAL_DAYS)  # founder's letter promised 6 months free
    return None, trial_days


def _apply_offer_fields(tenant: dict, offer: str | None, body: SalonSignupIn) -> None:
    if offer:
        tenant["signup_offer"] = offer
    if offer == "newbiz":
        tenant["new_business"] = True
        od = (body.opening_date or "").strip()
        if re.match(r"^\d{4}-\d{2}-\d{2}$", od):
            tenant["opening_date"] = od


async def _create_signup_tenant(body: SalonSignupIn, email: str) -> tuple[dict, dict | None, str, int]:
    """Validate slug/offer, insert the tenant, kick off welcome emails. Returns (tenant, referrer, trial_end, trial_days)."""
    candidate = await _resolve_unique_slug(body)
    offer, trial_days = await _signup_offer(body, email)
    trial_end = (datetime.now(timezone.utc) + timedelta(days=trial_days)).date().isoformat()
    referrer = await _resolve_referrer(body.ref, candidate)
    tenant = _build_signup_tenant(body, candidate, referrer, trial_end)
    tenant["welcome_poster_pending"] = True  # SEC-001: paid AI poster deferred to first login
    _apply_offer_fields(tenant, offer, body)
    await db.tenants.insert_one(tenant)
    if tenant.get("business_type") == "restaurant":
        await _seed_restaurant_defaults(tenant["id"])
    asyncio.create_task(_send_signup_welcome(dict(tenant), body, trial_end))
    if offer == "newbiz":
        asyncio.create_task(_send_newbiz_plan_email(dict(tenant), email, trial_end))
    return tenant, referrer, trial_end, trial_days


@router.post("/public/signup-salon")
async def public_signup_salon(body: SalonSignupIn, request: Request, response: Response):
    await public_rate_limit(request, key_suffix="signup", limit=4, window_sec=900)
    await global_daily_cap("signup", 50, "New signups are temporarily paused due to unusually high demand — "
                                         "please try again tomorrow or contact us at miracurl-suite.com/contact-us.")
    email = body.owner_email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "An account with this email already exists")

    tenant, referrer, trial_end, trial_days = await _create_signup_tenant(body, email)
    owner = _build_signup_owner(body, email, tenant["id"])
    await db.users.insert_one(owner)
    if referrer:
        await _record_pending_referral(referrer, tenant)
    await _convert_lead_to_customer(email, tenant)

    sid = await start_session(owner["id"], email, tenant["id"], request)
    set_auth_cookies(response, make_access(owner["id"], email, sid), make_refresh(owner["id"], sid))
    owner.pop("password_hash", None)
    tenant.pop("_id", None)
    owner.pop("_id", None)
    return {"user": owner, "tenant": tenant, "trial_end_date": trial_end, "trial_days": trial_days}


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


async def _reject_if_locked(rec: dict | None, arec: dict | None, now: datetime):
    """Layer 1: per-IP lock (5 fails / 15m). Layer 2: per-account lock (IP-rotation proof)."""
    if rec and rec.get("count", 0) >= 5:
        locked_until = rec.get("locked_until")
        if locked_until and datetime.fromisoformat(locked_until) > now:
            raise HTTPException(423, "Too many attempts. Try again later.")
    if arec and arec.get("locked_until") and datetime.fromisoformat(arec["locked_until"]) > now:
        raise HTTPException(423, "This account is temporarily locked after too many failed attempts. "
                                 "Try again later or use Forgot Password.")


async def _register_failed_login(request: Request, email: str, ident: str, acct_ident: str,
                                 arec: dict | None, now: datetime):
    """Record a failed attempt on both counters. Account-global counter: 1h sliding
    window, ceiling of 10 fails, escalating lock 15m -> 30m -> 1h -> 2h -> 4h (capped)
    so an attacker can't permanently DoS the real owner, while IP rotation no longer
    resets the clock."""
    from security import _log_sec_event
    await db.login_attempts.update_one(
        {"identifier": ident},
        {"$inc": {"count": 1},
         "$set": {"last_attempt": now.isoformat(),
                  "locked_until": (now + timedelta(minutes=15)).isoformat()}},
        upsert=True,
    )
    try:
        stale = bool(arec) and (now - datetime.fromisoformat(arec.get("last_attempt", now.isoformat()))).total_seconds() > 3600
    except (ValueError, TypeError):
        stale = True
    acount = 1 if (not arec or stale) else arec.get("count", 0) + 1
    strikes = 0 if (not arec or stale) else arec.get("strikes", 0)
    aupd = {"count": acount, "last_attempt": now.isoformat()}
    if acount >= 10 and acount % 5 == 0:
        strikes += 1
        lock_min = min(15 * (2 ** (strikes - 1)), 240)
        aupd["strikes"] = strikes
        aupd["locked_until"] = (now + timedelta(minutes=lock_min)).isoformat()
        _log_sec_event("account_locked", tenant_id=request.headers.get("X-Tenant-Slug", ""),
                       ip=client_ip(request), detail=f"{email} locked {lock_min}m after {acount} fails")
    await db.login_attempts.update_one({"identifier": acct_ident}, {"$set": aupd}, upsert=True)
    _log_sec_event("failed_login", tenant_id=request.headers.get("X-Tenant-Slug", ""),
                   ip=client_ip(request), detail=email)


async def _issue_session(user: dict, email: str, request: Request, response: Response, remember: bool) -> dict:
    await _subscription_gate(user)
    sid = await start_session(user["id"], email, user.get("tenant_id"), request)
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login_at": datetime.now(timezone.utc).isoformat()}})
    access = make_access(user["id"], email, sid)
    refresh = make_refresh(user["id"], sid)
    set_auth_cookies(response, access, refresh, persistent=remember)
    user.pop("password_hash", None)
    user.pop("_id", None)
    await _attach_salons(user)
    return {"user": user}


async def _deferred_welcome_poster(tid: str) -> None:
    """SEC-001: generate the AI welcome poster only once a real owner logs in (bots never trigger it)."""
    t = await db.tenants.find_one({"id": tid, "welcome_poster_pending": True}, {"_id": 0})
    if not t:
        return
    await db.tenants.update_one({"id": tid}, {"$unset": {"welcome_poster_pending": ""}})
    from routes.super_admin_ops import _generate_onboarding_poster
    await _generate_onboarding_poster(t)


@router.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower()
    ident = f"{client_ip(request)}:{email}"
    acct_ident = f"acct:{email}"  # SEC-P3: global per-account layer — IP rotation can't evade it
    rec = await db.login_attempts.find_one({"identifier": ident})
    arec = await db.login_attempts.find_one({"identifier": acct_ident})
    now = datetime.now(timezone.utc)
    await _reject_if_locked(rec, arec, now)
    user = await db.users.find_one({"email": email})
    if not user or not verify_pw(body.password, user["password_hash"]):
        await _register_failed_login(request, email, ident, acct_ident, arec, now)
        raise HTTPException(401, "Invalid email or password")
    # SEC / access control: admin can disable a staff account without deleting it.
    # A disabled user MUST NOT get a token, even if the password is correct.
    if user.get("disabled"):
        raise HTTPException(403, "Your account has been disabled by the salon admin. Please contact them.")
    await db.login_attempts.delete_many({"identifier": {"$in": [ident, acct_ident]}})
    if user.get("role") == "admin" and user.get("tenant_id"):
        asyncio.create_task(_deferred_welcome_poster(user["tenant_id"]))
    return await _issue_session(user, email, request, response, body.remember)


class GoogleSessionIn(BaseModel):
    session_id: str = Field(min_length=8, max_length=500)


@router.post("/auth/google/session")
async def google_session(body: GoogleSessionIn, request: Request, response: Response):
    """Emergent-managed Google sign-in: exchange the one-time session_id server-side, then log the
    matching Miracurl user in (same JWT cookies as password login). No account is auto-created."""
    import httpx
    from security import durable_rate_limit
    await durable_rate_limit(request, f"google-login:{client_ip(request)}", limit=20, window_sec=600)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                                 headers={"X-Session-ID": body.session_id})
    except httpx.HTTPError:
        raise HTTPException(502, "Google sign-in service unavailable — please try again")
    if r.is_error:
        raise HTTPException(401, "Google sign-in expired — please try again")
    info = r.json()
    email = (info.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(401, "Google did not return an email address")
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(403, f"No Miracurl account uses {email}. Ask your salon admin to add you, or start a free trial.")
    if user.get("disabled"):
        raise HTTPException(403, "Your account has been disabled by the salon admin. Please contact them.")
    patch = {"google_sub": info.get("id"), "google_linked_at": datetime.now(timezone.utc).isoformat()}
    if info.get("picture") and not user.get("avatar_url"):
        patch["avatar_url"] = info["picture"]
    await db.users.update_one({"id": user["id"]}, {"$set": patch})
    if user.get("role") == "admin" and user.get("tenant_id"):
        asyncio.create_task(_deferred_welcome_poster(user["tenant_id"]))
    return await _issue_session(user, email, request, response, True)


class OtpRequestIn(BaseModel):
    email: EmailStr


class OtpVerifyIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


@router.post("/auth/otp/request")
async def otp_request(body: OtpRequestIn, request: Request):
    """Strong fallback when the password fails: a 6-digit one-time code emailed to the account's own address.
    Always answers 200 so account existence is never revealed."""
    from security import durable_rate_limit
    email = body.email.lower().strip()
    await durable_rate_limit(request, f"otp-req:{client_ip(request)}", limit=10, window_sec=600)
    await durable_rate_limit(request, f"otp-req-email:{email}", limit=4, window_sec=600)
    user = await db.users.find_one({"email": email, "disabled": {"$ne": True}}, {"_id": 0, "id": 1, "name": 1, "tenant_id": 1})
    if user:
        code = f"{secrets.randbelow(10**6):06d}"
        now = datetime.now(timezone.utc)
        await db.login_otps.update_one({"email": email}, {"$set": {
            "email": email, "code_hash": hash_pw(code), "expires_at": (now + timedelta(minutes=10)).isoformat(),
            "attempts": 0, "created_at": now.isoformat(), "ip": client_ip(request)}}, upsert=True)
        t = await db.tenants.find_one({"id": user.get("tenant_id")}, {"_id": 0, "name": 1}) if user.get("tenant_id") else None
        brand = (t or {}).get("name") or "Miracurl Suite"
        html = (f"<div style='font-family:Georgia,serif;max-width:480px;margin:auto;padding:28px;border:1px solid #eee;border-radius:16px'>"
                f"<h2 style='margin:0 0 8px;color:#111'>Your Miracurl sign-in code</h2>"
                f"<p style='color:#555;margin:0 0 18px'>Hi {html_lib.escape(user.get('name') or 'there')}, use this one-time code to sign in to <b>{html_lib.escape(brand)}</b>. It expires in 10 minutes.</p>"
                f"<div style='font-size:34px;letter-spacing:10px;font-weight:700;color:#111;background:#faf6ee;border:1px dashed #d4af37;border-radius:12px;padding:16px;text-align:center'>{code}</div>"
                f"<p style='color:#888;font-size:12px;margin-top:18px'>If you didn't try to sign in, ignore this email — your password still works and nobody can sign in without this code.</p></div>")
        from email_service import _send_email
        asyncio.create_task(_send_email([email], f"{code} is your Miracurl sign-in code", html, from_name="Miracurl Security"))
    return {"ok": True, "message": "If that email belongs to a Miracurl account, a 6-digit code is on its way."}


@router.post("/auth/otp/verify")
async def otp_verify(body: OtpVerifyIn, request: Request, response: Response):
    from security import durable_rate_limit
    email = body.email.lower().strip()
    await durable_rate_limit(request, f"otp-verify:{client_ip(request)}", limit=15, window_sec=600)
    rec = await db.login_otps.find_one({"email": email})
    if not rec or rec.get("expires_at", "") < datetime.now(timezone.utc).isoformat():
        raise HTTPException(401, "Code expired — request a new one")
    if rec.get("attempts", 0) >= 5:
        await db.login_otps.delete_one({"email": email})
        raise HTTPException(429, "Too many wrong codes — request a new one")
    if not verify_pw(body.code, rec["code_hash"]):
        await db.login_otps.update_one({"email": email}, {"$inc": {"attempts": 1}})
        raise HTTPException(401, "That code isn't right")
    await db.login_otps.delete_one({"email": email})
    user = await db.users.find_one({"email": email})
    if not user or user.get("disabled"):
        raise HTTPException(403, "This account is not active")
    return await _issue_session(user, email, request, response, True)

@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    await revoke_token_jtis(request)
    sid = current_sid(request)
    if sid:
        await _raw_db.sessions.update_one(
            {"sid": sid},
            {"$set": {"revoked": True, "revoked_at": datetime.now(timezone.utc).isoformat()}})
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    response.delete_cookie("csrf_token", path="/")
    return {"ok": True}


@router.get("/auth/sessions")
async def list_sessions(request: Request, user=Depends(get_current_user)):
    """Every device currently signed in to this account (active in the last 8 days)."""
    cur = current_sid(request)
    active_since = (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()
    rows = await _raw_db.sessions.find(
        {"user_id": user["id"], "revoked": False, "last_seen": {"$gte": active_since}},
        {"_id": 0}).sort("last_seen", -1).to_list(50)
    from security import _geo_lookup
    for r in rows:
        r["current"] = r["sid"] == cur
        if not r.get("location"):
            geo = await _geo_lookup(r.get("ip", ""))
            r.update({"location": geo.get("label", ""), "city": geo.get("city", ""),
                      "country": geo.get("country", ""), "country_code": geo.get("country_code", "")})
            await _raw_db.sessions.update_one({"sid": r["sid"]}, {"$set": {
                "location": r["location"], "city": r["city"], "country": r["country"], "country_code": r["country_code"]}})
    return {"sessions": rows}


@router.delete("/auth/sessions/{sid}")
async def logout_device(sid: str, user=Depends(get_current_user)):
    """Remotely sign out ONE device — its next request gets a 401."""
    r = await _raw_db.sessions.update_one(
        {"sid": sid, "user_id": user["id"]},
        {"$set": {"revoked": True, "revoked_at": datetime.now(timezone.utc).isoformat()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Session not found")
    return {"ok": True}


@router.post("/auth/sessions/logout-all")
async def logout_all_devices(request: Request, user=Depends(get_current_user)):
    """Sign out every OTHER device — the one making this call stays logged in."""
    cur = current_sid(request)
    r = await _raw_db.sessions.update_many(
        {"user_id": user["id"], "revoked": False, "sid": {"$ne": cur}},
        {"$set": {"revoked": True, "revoked_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "signed_out": r.modified_count}

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
        from security import _check_session
        await _check_session(payload)  # P3: refresh also honours remote sign-out
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(401, "User not found")
        if user.get("disabled") or user.get("status") == "disabled" or user.get("active") is False:
            raise HTTPException(401, "Account disabled")
        _reject_if_token_predates_password_change(payload, user)
        access = make_access(user["id"], user["email"], payload.get("sid"))
        response.set_cookie(
            "access_token", access, httponly=True,
            secure=(os.environ.get("COOKIE_SECURE", "true").lower() != "false"),
            samesite="lax", max_age=28800, path="/",
        )
        from security import set_csrf_cookie
        set_csrf_cookie(response, access)  # rotate the CSRF token with the new access token
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
    base = (os.environ.get("APP_PUBLIC_URL") or os.environ.get("FRONTEND_URL") or "https://miracurl-suite.com").rstrip("/")
    reset_link = f"{base}/reset-password?token={token}"
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
    await public_rate_limit(request, key_suffix="forgotpw", limit=5, window_sec=3600)
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    reset_recipient = email
    if user and user.get("role") in ("staff", "employee"):
        # Staff login IDs aren't real inboxes — response stays generic (no enumeration).
        reset_recipient = await _staff_reset_recipient(email, body.personal_email)
        if not reset_recipient:
            user = None
    elif user:
        # Login IDs like @miracurl.com aren't inboxes: route to the account's notification email
        # (users.notify_email → tenant notify/owner email → HQ aliases for super-admin).
        from email_service import _resolve_recipients
        resolved = await _resolve_recipients([email])
        reset_recipient = resolved[0] if resolved else None
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
            logging.error(f"reset email send failed (user {user['id']}): {e}")
        logging.info("[Miracurl] Password reset requested for user %s", user["id"])
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
        "must_change_password": False,
        "password_changed_at": datetime.now(timezone.utc).isoformat()}})
    await db.password_reset_tokens.update_one({"token": body.token}, {"$set": {"used": True}})
    user = await db.users.find_one({"id": rec["user_id"]}, {"_id": 0, "email": 1})
    if user and user.get("email"):
        import re as _re
        await db.login_attempts.delete_many({"identifier": {"$regex": f"{_re.escape(user['email'])}$"}})
    return {"ok": True}


class NotifyEmailIn(BaseModel):
    notify_email: str = Field("", max_length=200)


@router.put("/auth/me/notify-email")
async def set_notify_email(body: NotifyEmailIn, user=Depends(get_current_user)):
    """Real inbox for this login (login IDs like @miracurl.com can't receive mail)."""
    from email_service import _is_login_only
    val = body.notify_email.strip().lower()
    if val and ("@" not in val or "." not in val.rsplit("@", 1)[-1]):
        raise HTTPException(400, "Enter a valid email address")
    if val and _is_login_only(val):
        raise HTTPException(400, "That domain is login-only — use a real inbox (Gmail, company mail, etc.)")
    await db.users.update_one({"id": user["id"]}, {"$set": {"notify_email": val or None}})
    return {"ok": True, "notify_email": val or None}


@router.post("/auth/me/send-reset-link")
async def send_my_reset_link(request: Request, user=Depends(get_current_user)):
    """From the forced-password-change screen: email a reset link to the account's real inbox."""
    await public_rate_limit(request, key_suffix="myreset", limit=5, window_sec=3600)
    from email_service import _resolve_recipients
    recipients = await _resolve_recipients([user["email"]])
    if not recipients:
        raise HTTPException(400, "No notification email on file for this login — ask HQ to add one.")
    token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({
        "token": token, "user_id": user["id"], "used": False,
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()})
    for r in recipients:
        await _send_reset_email(user["email"], r, token)
    masked = [r[:2] + "•••" + r[r.index("@"):] for r in recipients]
    return {"ok": True, "sent_to": masked}


class LoginEmailIn(BaseModel):
    new_email: EmailStr
    current_password: str = Field(min_length=1, max_length=200)


@router.put("/auth/me/login-email")
async def change_login_email(body: LoginEmailIn, request: Request, user=Depends(get_current_user)):
    """Super-admin only: rename the login ID (e.g. super@miracurl.com → admin@miracurl-suite.com).
    Requires the current password; sessions stay valid (JWT sub = user id)."""
    if user.get("role") != "super_admin":
        raise HTTPException(403, "Only the super-admin can change their login email here")
    await public_rate_limit(request, key_suffix="loginemail", limit=5, window_sec=3600)
    full = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 1, "email": 1})
    if not full or not verify_pw(body.current_password, full["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    new_email = body.new_email.lower().strip()
    if new_email == full["email"]:
        raise HTTPException(400, "That is already your login email")
    if await db.users.find_one({"email": new_email}, {"_id": 1}):
        raise HTTPException(400, "That email is already used by another account")
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"id": user["id"]}, {"$set": {"email": new_email, "login_email_changed_at": now},
                                                   "$push": {"previous_emails": {"email": full["email"], "changed_at": now}}})
    await db.login_attempts.delete_many({"identifier": {"$regex": f"{re.escape(full['email'])}$"}})
    logging.info("[Miracurl] super-admin login email changed %s -> %s", full["email"], new_email)
    return {"ok": True, "email": new_email, "previous_email": full["email"]}


class ProfileIn(BaseModel):
    """Fields omitted (None) are left untouched; send "" to clear."""
    name: str | None = Field(None, max_length=80)
    notify_email: str | None = Field(None, max_length=200)
    instagram: str | None = Field(None, max_length=60)
    phone: str | None = Field(None, max_length=20)


def _validate_notify_email(raw: str) -> str | None:
    from email_service import _is_login_only
    ne = raw.strip().lower()
    if not ne:
        return None
    if "@" not in ne or "." not in ne.rsplit("@", 1)[-1]:
        raise HTTPException(400, "Enter a valid email address")
    if _is_login_only(ne):
        raise HTTPException(400, "That domain is login-only — use a real inbox (Gmail, company mail, etc.)")
    return ne


def _validate_instagram(raw: str) -> str | None:
    ig = raw.strip().lstrip("@").rstrip("/").split("/")[-1]
    if not ig:
        return None
    if not re.fullmatch(r"[A-Za-z0-9._]{1,30}", ig):
        raise HTTPException(400, "Instagram handle can only contain letters, numbers, dots and underscores")
    return ig


def _normalize_phone(raw: str) -> str | None:
    return "".join(ch for ch in raw if ch.isdigit() or ch == "+") or None


@router.put("/auth/me/profile")
async def update_my_profile(body: ProfileIn, user=Depends(get_current_user)) -> dict:
    """Own profile: display name, real inbox (Gmail), Instagram handle, WhatsApp number."""
    upd: dict = {}
    if body.notify_email is not None:
        upd["notify_email"] = _validate_notify_email(body.notify_email)
    if body.instagram is not None:
        upd["instagram"] = _validate_instagram(body.instagram)
    if body.phone is not None and body.phone.strip():
        upd["phone"] = _normalize_phone(body.phone)
    if body.name and body.name.strip():
        upd["name"] = body.name.strip()
    if upd:
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
    return {"ok": True, **upd, "name": upd.get("name", user.get("name"))}


@router.get("/auth/super-admins")
async def list_super_admins(user=Depends(get_current_user)) -> dict:
    """HQ logins (super-admin only) so the owner can spot & remove duplicates."""
    if user.get("role") != "super_admin":
        raise HTTPException(403, "Super-admin only")
    rows = await db.users.find({"role": "super_admin"}, {"_id": 0, "id": 1, "email": 1, "name": 1, "must_change_password": 1,
                                                       "last_login_at": 1, "created_at": 1, "photo_url": 1}).to_list(20)
    for r in rows:
        r["is_me"] = r["id"] == user["id"]
    return {"accounts": rows}


class RemoveSuperIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)


@router.delete("/auth/super-admins/{account_id}")
async def remove_super_admin(account_id: str, body: RemoveSuperIn, user=Depends(get_current_user)) -> dict:
    """Remove another super-admin login (e.g. the old super@miracurl.com re-created by an older seed)."""
    if user.get("role") != "super_admin":
        raise HTTPException(403, "Super-admin only")
    if account_id == user["id"]:
        raise HTTPException(400, "You can't remove the login you're using right now")
    me_doc = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 1})
    if not me_doc or not verify_pw(body.current_password, me_doc["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    target = await db.users.find_one({"id": account_id, "role": "super_admin"}, {"_id": 0, "id": 1, "email": 1})
    if not target:
        raise HTTPException(404, "Super-admin login not found")
    await db.users.delete_one({"id": account_id})
    await _raw_db.sessions.delete_many({"user_id": account_id})
    logging.warning("[Miracurl] super-admin login %s removed by %s", target["email"], user.get("email"))
    return {"ok": True, "removed": target["email"]}
