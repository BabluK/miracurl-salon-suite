"""Fingerprint / Face ID login via WebAuthn passkeys (Android + iOS + desktop)."""
import base64
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from webauthn import (
    generate_registration_options, verify_registration_response,
    generate_authentication_options, verify_authentication_response,
)
from webauthn.helpers import options_to_json, base64url_to_bytes
from webauthn.helpers.structs import (
    AuthenticatorAttachment, AuthenticatorSelectionCriteria,
    ResidentKeyRequirement, UserVerificationRequirement,
    PublicKeyCredentialDescriptor,
)

from database import _raw_db
from security import get_current_user, make_access, make_refresh, set_auth_cookies, public_rate_limit

router = APIRouter()
_TTL = timedelta(minutes=5)


def _now():
    return datetime.now(timezone.utc)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _apex(host: str) -> str:
    """Registrable domain — www.x.com and x.com must share one passkey RP."""
    h = host or ""
    return h[4:] if h.startswith("www.") else h


def _rp(request: Request) -> tuple:
    src = request.headers.get("origin") or request.headers.get("referer") or ""
    host = urlparse(src).hostname or request.url.hostname
    return _apex(host), f"https://{host}"


def _origins(rp_id: str) -> list:
    return [f"https://{rp_id}", f"https://www.{rp_id}"]


def _challenge_from_credential(cred: dict) -> str:
    """The browser echoes our challenge inside clientDataJSON — use it to match
    the exact challenge we issued (prevents cross-tab/cross-user races)."""
    try:
        cdj = cred.get("response", {}).get("clientDataJSON", "")
        pad = cdj + "=" * (-len(cdj) % 4)
        data = json.loads(base64.urlsafe_b64decode(pad).decode())
        return data.get("challenge", "")
    except (ValueError, KeyError, AttributeError):
        return ""


class CredIn(BaseModel):
    credential: dict


class LoginOptsIn(BaseModel):
    email: str = Field("", max_length=200)


@router.post("/passkeys/register/options")
async def pk_register_options(request: Request, user=Depends(get_current_user)):
    rp_id, _ = _rp(request)
    existing = await _raw_db.passkeys.find({"user_id": user["id"]}, {"credential_id": 1}).to_list(20)
    challenge = secrets.token_bytes(32)
    options = generate_registration_options(
        rp_id=rp_id, rp_name="Miracurl Suite",
        user_id=user["id"].encode(), user_name=user["email"],
        user_display_name=user.get("name") or user["email"],
        challenge=challenge,
        exclude_credentials=[PublicKeyCredentialDescriptor(id=base64url_to_bytes(x["credential_id"]))
                             for x in existing],
        authenticator_selection=AuthenticatorSelectionCriteria(
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
    )
    await _raw_db.webauthn_challenges.insert_one({
        "purpose": "reg", "user_id": user["id"], "challenge": _b64(challenge),
        "rp_id": rp_id, "expires_at": (_now() + _TTL).isoformat()})
    return json.loads(options_to_json(options))


@router.post("/passkeys/register/verify")
async def pk_register_verify(body: CredIn, request: Request, user=Depends(get_current_user)):
    rp_id, origin = _rp(request)
    ch = _challenge_from_credential(body.credential)
    row = await _raw_db.webauthn_challenges.find_one_and_delete(
        {"purpose": "reg", "user_id": user["id"], "challenge": ch,
         "expires_at": {"$gt": _now().isoformat()}})
    if not row:
        raise HTTPException(400, "Fingerprint setup expired — try again")
    try:
        result = verify_registration_response(
            credential=body.credential,
            expected_challenge=base64url_to_bytes(row["challenge"]),
            expected_rp_id=row["rp_id"], expected_origin=_origins(row["rp_id"]),
            require_user_verification=True)
    except Exception as e:
        logging.warning(f"passkey register verify failed: {e}")
        raise HTTPException(400, "Fingerprint could not be verified — try again")
    await _raw_db.passkeys.update_one(
        {"credential_id": _b64(result.credential_id)},
        {"$set": {"user_id": user["id"], "email": user["email"],
                  "public_key": _b64(result.credential_public_key),
                  "sign_count": result.sign_count, "rp_id": row["rp_id"],
                  "created_at": _now().isoformat(), "last_used_at": _now().isoformat()}},
        upsert=True)
    return {"ok": True}


@router.post("/passkeys/login/options")
async def pk_login_options(body: LoginOptsIn, request: Request):
    await public_rate_limit(request, "pk-login", limit=20, window_sec=600)
    await _raw_db.webauthn_challenges.delete_many({"expires_at": {"$lt": _now().isoformat()}})
    rp_id, _ = _rp(request)
    creds = []
    if body.email.strip():
        async for c in _raw_db.passkeys.find({"email": body.email.strip().lower()}):
            creds.append(PublicKeyCredentialDescriptor(id=base64url_to_bytes(c["credential_id"])))
    challenge = secrets.token_bytes(32)
    options = generate_authentication_options(
        rp_id=rp_id, challenge=challenge, allow_credentials=creds,
        user_verification=UserVerificationRequirement.REQUIRED)
    await _raw_db.webauthn_challenges.insert_one({
        "purpose": "auth", "challenge": _b64(challenge), "rp_id": rp_id,
        "expires_at": (_now() + _TTL).isoformat()})
    return json.loads(options_to_json(options))


@router.post("/passkeys/login/verify")
async def pk_login_verify(body: CredIn, request: Request, response: Response):
    await public_rate_limit(request, "pk-login-verify", limit=20, window_sec=600)
    ch = _challenge_from_credential(body.credential)
    row = await _raw_db.webauthn_challenges.find_one_and_delete(
        {"purpose": "auth", "challenge": ch, "expires_at": {"$gt": _now().isoformat()}})
    if not row:
        raise HTTPException(400, "Fingerprint login expired — try again")
    key = await _raw_db.passkeys.find_one({"credential_id": body.credential.get("id")})
    if not key:
        raise HTTPException(401, "This device isn't set up for fingerprint login yet — sign in with your password once")
    rp = _apex(key["rp_id"])
    try:
        result = verify_authentication_response(
            credential=body.credential,
            expected_challenge=base64url_to_bytes(row["challenge"]),
            expected_rp_id=rp, expected_origin=_origins(rp),
            credential_public_key=base64url_to_bytes(key["public_key"]),
            credential_current_sign_count=int(key.get("sign_count") or 0),
            require_user_verification=True)
    except Exception as e:
        logging.warning(f"passkey login verify failed: {e}")
        raise HTTPException(401, "Fingerprint didn't match — try again or use your password")
    await _raw_db.passkeys.update_one(
        {"_id": key["_id"]},
        {"$set": {"sign_count": result.new_sign_count, "last_used_at": _now().isoformat()}})
    user = await _raw_db.users.find_one({"id": key["user_id"]}, {"_id": 0})
    if not user or user.get("disabled") or user.get("active") is False:
        raise HTTPException(401, "Account disabled")
    set_auth_cookies(response, make_access(user["id"], user["email"]), make_refresh(user["id"]), persistent=True)
    return {"ok": True, "user": {k: user.get(k) for k in ("id", "email", "name", "role", "branch", "tenant_id")}}
