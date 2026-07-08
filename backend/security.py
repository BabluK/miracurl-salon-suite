"""Auth & tenancy security: JWT, cookies, password hashing, role guards, rate limit."""
import os
import uuid
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import HTTPException, Depends, Request, Response
from database import db, _current_tenant_id, _super_admin_ok

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

def make_access(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "jti": uuid.uuid4().hex,
               "iat": int(datetime.now(timezone.utc).timestamp()),
               "exp": datetime.now(timezone.utc) + timedelta(hours=8),
               "type": "access"}
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALG)

def make_refresh(user_id: str) -> str:
    payload = {"sub": user_id,
               "jti": uuid.uuid4().hex,
               "iat": int(datetime.now(timezone.utc).timestamp()),
               "exp": datetime.now(timezone.utc) + timedelta(days=7),
               "type": "refresh"}
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALG)

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

def set_auth_cookies(resp: Response, access: str, refresh: str):
    # Secure=True is required by browsers when SameSite is Lax on cross-origin
    # requests over HTTPS. In dev over plain HTTP the cookie is still delivered
    # because same-origin. Env override for special testing setups.
    _sec = os.environ.get("COOKIE_SECURE", "true").lower() != "false"
    resp.set_cookie("access_token", access, httponly=True, secure=_sec, samesite="lax", max_age=28800, path="/")
    resp.set_cookie("refresh_token", refresh, httponly=True, secure=_sec, samesite="lax", max_age=604800, path="/")

def _extract_bearer_token(request: Request) -> Optional[str]:
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
            # Multi-salon owners: a stale slug header from BEFORE a branch switch
            # points at another salon they own — self-heal to the active salon
            # instead of 403ing the whole app.
            if t["id"] in (user.get("tenant_ids") or []):
                _current_tenant_id.set(user["tenant_id"])
                return
            raise HTTPException(403, "Cross-tenant access denied")
        if (user.get("role") == "super_admin" and request.method == "DELETE"
                and not request.url.path.startswith("/api/super-admin")):
            raise HTTPException(403, "Super-admin can view, correct and update salon data — but deleting is reserved for the salon owner. Ask the owner, or note it via Contact HQ.")
        _current_tenant_id.set(t["id"])
        return
    if user.get("role") != "super_admin" and user.get("tenant_id"):
        _current_tenant_id.set(user["tenant_id"])
    elif user.get("role") == "super_admin":
        # Super-admin without a slug picks up the global-access override so
        # TenantCollection knows this is intentional.
        _super_admin_ok.set(True)


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

# ---- In-memory rate limit for public booking ----
_RATE_BUCKET: dict = {}

def client_ip(request: Request) -> str:
    """Real client IP behind the ingress (first hop of X-Forwarded-For), else socket peer."""
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "anon"

def public_rate_limit(request: Request, key_suffix: str = "", limit: int = 8, window_sec: int = 600):
    """Allow `limit` requests per IP per `window_sec` seconds."""
    ip = client_ip(request)
    key = f"{ip}:{key_suffix}"
    now = datetime.now(timezone.utc).timestamp()
    bucket = [t for t in _RATE_BUCKET.get(key, []) if now - t < window_sec]
    if len(bucket) >= limit:
        raise HTTPException(429, "Too many requests. Please wait a few minutes and try again.")
    bucket.append(now)
    _RATE_BUCKET[key] = bucket



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

