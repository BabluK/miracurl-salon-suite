"""Auth & tenancy security: JWT, cookies, password hashing, role guards, rate limit."""
import asyncio
import logging
import hashlib
import hmac
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, Response
from pymongo import ReturnDocument

from database import _current_tenant_id, _raw_db, _super_admin_ok, db

# ---------------- JWT helpers ----------------
JWT_ALG = "HS256"
def jwt_secret(): return os.environ["JWT_SECRET"]

def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_pw(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False

def make_access(user_id: str, email: str, sid: str | None = None) -> str:
    payload = {"sub": user_id, "email": email,
               "jti": uuid.uuid4().hex,
               "iat": int(datetime.now(timezone.utc).timestamp()),
               "exp": datetime.now(timezone.utc) + timedelta(hours=8),
               "type": "access"}
    if sid:
        payload["sid"] = sid
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALG)

def make_refresh(user_id: str, sid: str | None = None) -> str:
    payload = {"sub": user_id,
               "jti": uuid.uuid4().hex,
               "iat": int(datetime.now(timezone.utc).timestamp()),
               "exp": datetime.now(timezone.utc) + timedelta(days=7),
               "type": "refresh"}
    if sid:
        payload["sid"] = sid
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALG)


def _device_label(ua: str) -> str:
    u = (ua or "").lower()
    if "iphone" in u:
        dev = "iPhone"
    elif "ipad" in u:
        dev = "iPad"
    elif "android" in u:
        dev = "Android phone"
    elif "windows" in u:
        dev = "Windows PC"
    elif "mac os" in u or "macintosh" in u:
        dev = "Mac"
    elif "linux" in u:
        dev = "Linux PC"
    else:
        dev = "Unknown device"
    if "edg" in u:
        br = "Edge"
    elif "opr" in u or "opera" in u:
        br = "Opera"
    elif "chrome" in u and "chromium" not in u:
        br = "Chrome"
    elif "safari" in u and "chrome" not in u:
        br = "Safari"
    elif "firefox" in u:
        br = "Firefox"
    else:
        br = "Browser"
    return f"{br} on {dev}"


def _is_private_ip(ip: str) -> bool:
    import ipaddress
    try:
        a = ipaddress.ip_address(ip)
        return a.is_private or a.is_loopback or a.is_link_local or a.is_reserved
    except ValueError:
        return True


async def _geo_lookup(ip: str) -> dict:
    """City/region/country for an IP — cached 30 days in ip_geo, never blocks login."""
    if not ip or _is_private_ip(ip):
        return {"city": "", "region": "", "country": "", "country_code": "", "label": "Local network"}
    cached = await _raw_db.ip_geo.find_one({"ip": ip}, {"_id": 0})
    if cached and cached.get("fetched_at", "") > (datetime.now(timezone.utc) - timedelta(days=30)).isoformat():
        return cached
    geo = {"ip": ip, "city": "", "region": "", "country": "", "country_code": "", "label": ""}
    try:
        import httpx
        async with httpx.AsyncClient(timeout=3.5) as cl:
            r = await cl.get(f"https://ipwho.is/{ip}", params={"fields": "success,city,region,country,country_code"})
        d = r.json() if r.status_code == 200 else {}
        if d.get("success"):
            geo.update({"city": d.get("city") or "", "region": d.get("region") or "",
                        "country": d.get("country") or "", "country_code": d.get("country_code") or ""})
    except Exception:
        pass
    geo["label"] = ", ".join(x for x in (geo["city"], geo["region"] if geo["region"] != geo["city"] else "", geo["country"]) if x) or "Unknown location"
    geo["fetched_at"] = datetime.now(timezone.utc).isoformat()
    await _raw_db.ip_geo.update_one({"ip": ip}, {"$set": geo}, upsert=True)
    return geo


async def _tag_session_location(sid: str, ip: str):
    geo = await _geo_lookup(ip)
    await _raw_db.sessions.update_one({"sid": sid}, {"$set": {
        "location": geo.get("label", ""), "city": geo.get("city", ""),
        "country": geo.get("country", ""), "country_code": geo.get("country_code", "")}})
    try:
        await _super_admin_login_alert(sid)
    except Exception as e:  # noqa: BLE001
        logging.warning(f"login alert skipped: {e}")


async def _super_admin_login_alert(sid: str):
    """Email the HQ owner when a super-admin signs in from a device or city not seen before."""
    sess = await _raw_db.sessions.find_one({"sid": sid}, {"_id": 0})
    if not sess:
        return
    user = await _raw_db.users.find_one({"id": sess["user_id"]}, {"_id": 0, "email": 1, "role": 1, "name": 1})
    if not user or user.get("role") != "super_admin":
        return
    device, city = sess.get("device") or "Unknown device", sess.get("city") or ""
    seen = await _raw_db.sessions.find_one(
        {"user_id": sess["user_id"], "sid": {"$ne": sid}, "device": device, "city": city}, {"_id": 1})
    if seen:
        return
    from email_service import _send_email
    import html as h
    when = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")
    where = h.escape(sess.get("location") or city or "Unknown location")
    body = f"""
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #eee;border-radius:16px;overflow:hidden">
      <div style="background:#1c1c22;padding:26px 30px"><span style="color:#e8c37f;font-size:21px;letter-spacing:1.5px">Miracurl HQ</span>
      <div style="color:#8a8a92;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin-top:4px">Security alert</div></div>
      <div style="padding:30px">
        <h2 style="margin:0 0 12px;color:#1c1c22">New sign-in to the HQ console</h2>
        <p style="font-size:14px;color:#333;line-height:1.75">Your super-admin login <b>{h.escape(user['email'])}</b> was just used from a device or city we haven't seen before.</p>
        <table style="font-size:13px;color:#333;border-collapse:collapse">
          <tr><td style="padding:4px 14px 4px 0;color:#777">Device</td><td>{h.escape(device)}</td></tr>
          <tr><td style="padding:4px 14px 4px 0;color:#777">Location</td><td>{where}</td></tr>
          <tr><td style="padding:4px 14px 4px 0;color:#777">IP</td><td>{h.escape(sess.get('ip') or '')}</td></tr>
          <tr><td style="padding:4px 14px 4px 0;color:#777">Time</td><td>{when}</td></tr>
        </table>
        <p style="font-size:13px;color:#555;line-height:1.7;margin-top:16px">Was this you? No action needed. If not, open <b>HQ → Security</b>, sign out all other devices and change your password immediately.</p>
      </div></div>"""
    await _send_email([user["email"]], f"🔐 New HQ sign-in from {device}{' · ' + city if city else ''}", body)
    await _raw_db.sessions.update_one({"sid": sid}, {"$set": {"alerted_new_device": True}})


async def start_session(user_id: str, email: str, tenant_id, request: Request, method: str = "password") -> str:
    """Register this device's login session; the returned sid is embedded in both tokens."""
    sid = uuid.uuid4().hex
    ua = (request.headers.get("user-agent") or "")[:300]
    ip = client_ip(request)
    now = datetime.now(timezone.utc).isoformat()
    await _raw_db.sessions.insert_one({
        "sid": sid, "user_id": user_id, "email": email, "tenant_id": tenant_id,
        "device": _device_label(ua), "ip": ip, "method": method, "location": "",
        "created_at": now, "last_seen": now, "revoked": False})
    asyncio.get_event_loop().create_task(_tag_session_location(sid, ip))
    return sid


def current_sid(request: Request) -> str | None:
    token = _extract_bearer_token(request)
    if not token:
        return None
    try:
        return jwt.decode(token, jwt_secret(), algorithms=[JWT_ALG],
                          options={"verify_exp": False}).get("sid")
    except jwt.InvalidTokenError:
        return None


async def _check_session(payload: dict):
    """Device sessions: a revoked sid means this device was signed out remotely."""
    sid = payload.get("sid")
    if not sid:
        return
    sess = await _raw_db.sessions.find_one({"sid": sid}, {"_id": 0, "revoked": 1, "last_seen": 1})
    if not sess or sess.get("revoked"):
        raise HTTPException(401, "This device was signed out — please log in again")
    try:
        last = datetime.fromisoformat(sess["last_seen"])
        if (datetime.now(timezone.utc) - last).total_seconds() > 300:
            await _raw_db.sessions.update_one(
                {"sid": sid}, {"$set": {"last_seen": datetime.now(timezone.utc).isoformat()}})
    except (KeyError, TypeError, ValueError):
        pass

def _reject_if_token_predates_password_change(payload: dict, user: dict):
    """SEC-002: tokens minted before the user's last password change are dead.
    Old tokens without an iat claim are treated as pre-change (rejected)."""
    pca = user.get("password_changed_at")
    if not pca:
        return
    try:
        pca_ts = datetime.fromisoformat(pca).timestamp()
    except Exception:
        return
    if float(payload.get("iat", 0)) < pca_ts:
        raise HTTPException(401, "Session expired — please sign in again")

def set_auth_cookies(resp: Response, access: str, refresh: str, persistent: bool = True):
    # Secure=True is required by browsers when SameSite is Lax on cross-origin
    # requests over HTTPS. In dev over plain HTTP the cookie is still delivered
    # because same-origin. Env override for special testing setups.
    # persistent=False -> session cookies: browser close = signed out (password asked again).
    _sec = os.environ.get("COOKIE_SECURE", "true").lower() != "false"
    resp.set_cookie("access_token", access, httponly=True, secure=_sec, samesite="lax",
                    max_age=28800 if persistent else None, path="/")
    resp.set_cookie("refresh_token", refresh, httponly=True, secure=_sec, samesite="lax",
                    max_age=604800 if persistent else None, path="/")
    set_csrf_cookie(resp, access, persistent)


# ---------------- CSRF (signed double-submit cookie, SEC-P3) ----------------
# Token = "<anchor>.<nonce>.<hmac>" where anchor is the session sid (or user id)
# and the HMAC binds nonce+anchor using material derived from the JWT signing value (env only). The cookie
# is deliberately NOT HttpOnly: the frontend reads it and echoes it back in the
# X-CSRF-Token header on every state-changing call. A cross-site attacker can
# neither read the cookie nor forge a valid HMAC.

# Domain-separation label (NOT a secret): keeps the CSRF HMAC key distinct from the
# JWT signing key. The only secret material is JWT_SECRET, read from the environment.
_CSRF_DOMAIN_TAG = "csrf-v1:"  # HKDF-style domain-separation tag; secret material comes only from JWT_SECRET (.env)


def _csrf_key() -> bytes:
    return (_CSRF_DOMAIN_TAG + jwt_secret()).encode()


def make_csrf_token(anchor: str) -> str:
    nonce = secrets.token_urlsafe(18)
    mac = hmac.new(_csrf_key(), f"{anchor}.{nonce}".encode(), hashlib.sha256).hexdigest()
    return f"{anchor}.{nonce}.{mac}"


def csrf_token_valid(value: str, expected_anchor: str | None = None) -> bool:
    try:
        anchor, nonce, mac = value.rsplit(".", 2)
        good = hmac.compare_digest(
            hmac.new(_csrf_key(), f"{anchor}.{nonce}".encode(), hashlib.sha256).hexdigest(), mac)
        if expected_anchor:
            good = good and hmac.compare_digest(anchor, expected_anchor)
        return good
    except (ValueError, AttributeError):
        return False


def set_csrf_cookie(resp: Response, access_token: str, persistent: bool = True, name: str = "csrf_token"):
    try:
        payload = jwt.decode(access_token, jwt_secret(), algorithms=[JWT_ALG],
                             options={"verify_exp": False})
    except jwt.InvalidTokenError:
        return
    anchor = payload.get("sid") or payload.get("sub") or ""
    _sec = os.environ.get("COOKIE_SECURE", "true").lower() != "false"
    resp.set_cookie(name, make_csrf_token(anchor), httponly=False, secure=_sec,
                    samesite="lax", max_age=604800 if persistent else None, path="/")

def _extract_bearer_token(request: Request) -> str | None:
    token = request.cookies.get("access_token")
    if token:
        return token
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


def _decode_access_token(token: str) -> dict:
    payload: dict = {}
    try:
        payload = jwt.decode(token, jwt_secret(), algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError as e:
        raise HTTPException(401, "Token expired") from e
    except jwt.InvalidTokenError as e:
        raise HTTPException(401, "Invalid token") from e
    if payload.get("type") != "access":
        raise HTTPException(401, "Invalid token type")
    return payload


async def _apply_tenant_context(request: Request, user: dict) -> None:
    """Set tenant context from explicit header/query, falling back to user.tenant_id."""
    slug = request.headers.get("X-Tenant-Slug") or request.query_params.get("tenant")
    if slug:
        t = await db.tenants.find_one({"slug": slug}, {"_id": 0})
        if not t:
            raise HTTPException(404, f"Tenant '{slug}' not found")
        if user.get("role") != "super_admin" and user.get("tenant_id") != t["id"]:
            # Multi-salon owners: each DEVICE keeps its own active salon — the
            # slug THIS device sends wins (they own that salon too), so switching
            # salons on one phone never flips the other phone.
            if t["id"] in (user.get("tenant_ids") or []):
                user["tenant_id"] = t["id"]
                _current_tenant_id.set(t["id"])
                return
            # Stale slug left in localStorage by a previous user/booking page on
            # this device — the logged-in user's own tenant_id is authoritative,
            # so self-heal instead of 403ing (fixes staff first-login onboarding).
            if user.get("tenant_id"):
                _current_tenant_id.set(user["tenant_id"])
                return
            raise HTTPException(403, "Cross-tenant access denied")
        if user.get("role") == "super_admin" and not request.url.path.startswith("/api/super-admin"):
            if request.method == "DELETE":
                raise HTTPException(403, "Super-admin can view, correct and update salon data — but deleting is reserved for the salon owner. Ask the owner, or note it via Contact HQ.")
            await _hq_workspace_guard(request, user, t)
        _current_tenant_id.set(t["id"])
        return
    if user.get("role") != "super_admin" and user.get("tenant_id"):
        _current_tenant_id.set(user["tenant_id"])
    elif user.get("role") == "super_admin":
        # Super-admin without a slug picks up the global-access override so
        # TenantCollection knows this is intentional.
        _super_admin_ok.set(True)


async def _hq_workspace_guard(request: Request, user: dict, t: dict) -> None:
    """HQ inside a salon's workspace: needs owner consent, every write is audited, owner is told once a day."""
    if t.get("support_access") is not True:
        raise HTTPException(403, "Miracurl support access is OFF for this salon. Enable it in Super Admin → Features for this tenant first.")
    today = datetime.now(timezone.utc).date().isoformat()
    if (t.get("hq_access_notified_on") or "") != today:
        await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"hq_access_notified_on": today}})
        try:
            from services.tenant_notices import notify_tenant
            await notify_tenant(t["id"], "hq_access", "Miracurl support is in your workspace",
                                "HQ opened your salon to help with setup / a fix. Every change is listed in Settings → Audit log.",
                                "/settings#audit-log", f"hq_access:{today}")
        except Exception:  # noqa: BLE001
            pass
    if request.method in ("POST", "PUT", "PATCH"):
        await log_audit(t["id"], {"name": "Miracurl Support", "email": "support@miracurl-suite.com", "role": "support"}, "hq_edit", f"{request.method} {request.url.path}")


async def revoke_token_jtis(request: Request):
    """SEC: blacklist the presented tokens' jtis on logout (per-device — other sessions live on)."""
    for name in ("access_token", "refresh_token"):
        token = request.cookies.get(name)
        if not token:
            continue
        try:
            payload = jwt.decode(token, jwt_secret(), algorithms=[JWT_ALG])
        except jwt.InvalidTokenError:
            continue
        jti, exp = payload.get("jti"), payload.get("exp")
        if jti and exp:
            await db.revoked_tokens.update_one(
                {"jti": jti},
                {"$set": {"jti": jti, "expires_at": datetime.fromtimestamp(exp, tz=timezone.utc)}},
                upsert=True)


async def _reject_if_revoked(payload: dict):
    jti = payload.get("jti")
    if jti and await db.revoked_tokens.find_one({"jti": jti}, {"_id": 1}):
        raise HTTPException(401, "Session ended — please sign in again")


async def get_current_user(request: Request) -> dict:
    token = _extract_bearer_token(request)
    if not token:
        raise HTTPException(401, "Not authenticated")
    payload = _decode_access_token(token)
    await _reject_if_revoked(payload)
    await _check_session(payload)
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    _reject_if_token_predates_password_change(payload, user)
    # SEC-001 hardening: a self-registered account with no tenant_id has no
    # business seeing anyone else's data. Only super_admin is allowed to
    # operate globally without a tenant scope. Everyone else is fail-closed.
    if user.get("role") != "super_admin" and not user.get("tenant_id"):
        raise HTTPException(
            403,
            "Your account is not yet linked to a salon. Please ask your salon admin to activate you.",
        )
    if user.get("status") == "pending":
        raise HTTPException(403, "Account pending admin approval.")
    if user.get("disabled"):
        raise HTTPException(403, "Your account has been disabled by the salon admin.")
    # SEC-005: temp-password accounts may only touch auth endpoints until they rotate.
    if user.get("must_change_password") and not request.url.path.startswith("/api/auth/"):
        raise HTTPException(403, "PASSWORD_CHANGE_REQUIRED")
    await _apply_tenant_context(request, user)
    return user

async def require_admin(user=Depends(get_current_user)):
    # Operational access: owners, super-admins and salon managers.
    if user.get("role") not in ("admin", "super_admin", "manager"):
        raise HTTPException(403, "Admin role required")
    return user


def branch_lock(user, branch):
    """Branch-locked manager logins may only ever query their own branch."""
    if (user or {}).get("role") == "manager" and (user or {}).get("branch"):
        return user["branch"]
    return branch

# ---- In-memory rate limit for public booking ----
_RATE_BUCKET: dict = {}

_TRUSTED_PROXY_COUNT = int(os.environ.get("TRUSTED_PROXY_COUNT", "3"))


def client_ip(request: Request) -> str:
    """Real client IP, spoof-resistant.

    X-Forwarded-For is client-controllable on the LEFT (appended left-to-right by
    each hop). Only the rightmost `_TRUSTED_PROXY_COUNT` entries — added by our own
    ingress — can be trusted. We take the entry immediately BEFORE our trusted
    proxies; anything further left is attacker-supplied and ignored. This stops
    brute-force / rate-limit evasion via forged X-Forwarded-For headers.
    """
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        if parts:
            idx = len(parts) - _TRUSTED_PROXY_COUNT
            return parts[idx] if idx >= 0 else parts[0]
    return request.client.host if request.client else "anon"

def _log_sec_event(kind: str, tenant_id: str = "", ip: str = "", detail: str = ""):
    """Fire-and-forget security event for the HQ snapshot (failed_login/pin_fail/pin_lockout/rate_limit)."""
    doc = {"kind": kind, "tenant_id": tenant_id or "", "ip": ip, "detail": detail[:120],
           "day": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
           "at": datetime.now(timezone.utc).isoformat()}
    try:
        asyncio.ensure_future(_raw_db.security_events.insert_one(doc))
    except RuntimeError:
        pass


def _mem_rate_check(request: Request, key_suffix: str, limit: int, window_sec: int):
    ip = client_ip(request)
    key = f"{ip}:{key_suffix}"
    now = datetime.now(timezone.utc).timestamp()
    bucket = [t for t in _RATE_BUCKET.get(key, []) if now - t < window_sec]
    if len(bucket) >= limit:
        _log_sec_event("rate_limit", ip=ip, detail=key_suffix)
        raise HTTPException(429, "Too many requests. Please wait a few minutes and try again.")
    bucket.append(now)
    _RATE_BUCKET[key] = bucket


async def public_rate_limit(request: Request, key_suffix: str = "", limit: int = 8, window_sec: int = 600):
    """Allow `limit` requests per IP per `window_sec` — in-memory fast path PLUS the durable
    Mongo-backed window (survives restarts, shared across workers; SEC-001 audit fix)."""
    _mem_rate_check(request, key_suffix, limit, window_sec)
    await durable_rate_limit(request, key_suffix, limit, window_sec)


async def global_daily_cap(kind: str, limit: int, message: str = ""):
    """Platform-wide (not per-IP) daily cap for abuse-prone public flows — IP rotation can't evade it."""
    now = datetime.now(timezone.utc)
    doc = await _raw_db.rate_limits.find_one_and_update(
        {"_id": f"global:{kind}:{now.strftime('%Y-%m-%d')}"},
        {"$inc": {"n": 1}, "$setOnInsert": {"expire_at": now + timedelta(days=2)}},
        upsert=True, return_document=ReturnDocument.AFTER)
    if doc["n"] > limit:
        _log_sec_event("global_cap", ip="-", detail=kind)
        raise HTTPException(429, message or "We're experiencing unusually high traffic — please try again later.")


_rl_index_ready = False

async def durable_rate_limit(request: Request, key_suffix: str, limit: int, window_sec: int):
    """Mongo-backed fixed-window rate limit — survives restarts and is shared across workers."""
    global _rl_index_ready
    if not _rl_index_ready:
        await _raw_db.rate_limits.create_index("expire_at", expireAfterSeconds=0)
        _rl_index_ready = True
    now = datetime.now(timezone.utc)
    bucket_key = f"{client_ip(request)}:{key_suffix}:{int(now.timestamp()) // window_sec}"
    doc = await _raw_db.rate_limits.find_one_and_update(
        {"_id": bucket_key},
        {"$inc": {"n": 1}, "$setOnInsert": {"expire_at": now + timedelta(seconds=window_sec * 2)}},
        upsert=True, return_document=ReturnDocument.AFTER)
    if doc["n"] > limit:
        _log_sec_event("rate_limit", ip=client_ip(request), detail=key_suffix)
        raise HTTPException(429, "Too many requests. Please wait a few minutes and try again.")


async def ai_daily_quota(tenant_id: str, kind: str, limit: int):
    """Per-tenant daily cap on paid-AI calls (LLM / speech). Durable in Mongo."""
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    doc = await _raw_db.ai_quotas.find_one_and_update(
        {"_id": f"{tenant_id}:{kind}:{day}"}, {"$inc": {"n": 1}},
        upsert=True, return_document=ReturnDocument.AFTER)
    if doc["n"] > limit:
        raise HTTPException(429, "Today's AI assistant limit has been reached — please try again tomorrow or contact the salon directly.")



async def require_super_admin(user=Depends(get_current_user)):
    if user.get("role") != "super_admin":
        raise HTTPException(403, "Super-admin role required")
    return user

async def require_tenant_admin(user=Depends(get_current_user)):
    """Admin of the current tenant, or super-admin."""
    if user.get("role") == "super_admin":
        return user
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin role required")
    return user

async def current_tenant(user=Depends(get_current_user)) -> dict:
    """Returns the tenant dict for the currently-set context. Useful for endpoints that need salon details."""
    tid = _current_tenant_id.get()
    if not tid:
        raise HTTPException(400, "No tenant context. Pass X-Tenant-Slug header or use a tenant-scoped login.")
    t = await db.tenants.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    return t



# ---------------- Owner Security PIN guard ----------------
async def _pin_attempt_guard(tid: str):
    rec = await _raw_db.pin_attempts.find_one({"tenant_id": tid})
    if rec and rec.get("count", 0) >= 5:
        lu = rec.get("locked_until")
        if lu and datetime.fromisoformat(lu) > datetime.now(timezone.utc):
            raise HTTPException(423, "Too many wrong PIN attempts — locked for 15 minutes.")


async def _pin_attempt_fail(tid: str):
    now = datetime.now(timezone.utc)
    rec = await _raw_db.pin_attempts.find_one_and_update(
        {"tenant_id": tid},
        {"$inc": {"count": 1},
         "$set": {"last_attempt": now.isoformat(),
                  "locked_until": (now + timedelta(minutes=15)).isoformat()}},
        upsert=True, return_document=ReturnDocument.AFTER)
    _log_sec_event("pin_lockout" if rec.get("count", 0) >= 5 else "pin_fail", tenant_id=tid)


async def _pin_attempt_clear(tid: str):
    await _raw_db.pin_attempts.delete_one({"tenant_id": tid})


async def require_owner_pin(request: Request, user=Depends(get_current_user), t=Depends(current_tenant)):
    """Guards sensitive staff/salary writes on the shared admin login.
    No-op until the owner sets a Security PIN in Settings. 5 wrong tries = 15-min lockout."""
    if user.get("role") == "super_admin":
        return True
    ph = (t or {}).get("security_pin_hash")
    if not ph:
        if user.get("role") == "manager":
            raise HTTPException(403, "OWNER_PIN_NOT_SET")
        return True
    pin = request.headers.get("X-Owner-Pin") or ""
    if not pin:
        raise HTTPException(403, "OWNER_PIN_REQUIRED")
    await _pin_attempt_guard(t["id"])
    if not verify_pw(pin, ph):
        await _pin_attempt_fail(t["id"])
        try:
            await _raw_db.manager_activity_logs.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": t["id"],
                "user_id": user.get("id", ""), "name": user.get("name") or user.get("email", ""),
                "email": user.get("email", ""), "role": user.get("role", ""),
                "section": "Owner PIN", "action": "wrong_pin",
                "at": datetime.now(timezone.utc).isoformat()})
        except Exception:  # noqa: BLE001
            pass
        raise HTTPException(403, "OWNER_PIN_REQUIRED")
    await _pin_attempt_clear(t["id"])
    await log_audit(t["id"], user, "pin_used", f"Owner PIN verified for {request.method} {request.url.path}")
    return True


async def log_audit(tenant_id: str, user: dict, action: str, detail: str) -> None:
    """Owner-visible audit trail of sensitive actions (Settings → Audit Log). Best-effort."""
    try:
        await _raw_db.audit_log.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": tenant_id,
            "actor": user.get("name") or user.get("email") or "?",
            "email": user.get("email", ""), "role": user.get("role", ""),
            "action": action, "detail": detail[:300],
            "at": datetime.now(timezone.utc).isoformat()})
    except Exception:  # noqa: BLE001
        pass


# ---------------- Public base URL (tracking links, QR codes, pay links) ----------------
# Always the official domain (APP_PUBLIC_URL). The request host is honoured ONLY for
# Emergent preview deployments so links keep working while testing; an attacker-controlled
# Host header can never end up inside an email, QR code or redirect.
_PREVIEW_HOST_SUFFIXES = (".emergentagent.com", "localhost")


def public_base_url(request: Request | None = None) -> str:
    official = os.environ.get("APP_PUBLIC_URL", "").rstrip("/")
    if request is None:
        return official
    raw = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    host = raw.split(",")[0].strip().lower()
    bare = host.split(":")[0]
    if host and any(bare == s.lstrip(".") or bare.endswith(s) for s in _PREVIEW_HOST_SUFFIXES):
        proto = request.headers.get("x-forwarded-proto", "https").split(",")[0].strip() or "https"
        return f"{proto}://{host}"
    return official
