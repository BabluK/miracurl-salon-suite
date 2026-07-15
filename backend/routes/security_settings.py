# Extracted from server.py — domain route module (auto-split refactor)
import os  # noqa: F401
import re  # noqa: F401
import io  # noqa: F401
import csv  # noqa: F401
import math  # noqa: F401
import uuid  # noqa: F401
import hmac  # noqa: F401
import hashlib  # noqa: F401
import asyncio  # noqa: F401
import base64  # noqa: F401
import secrets  # noqa: F401
import logging  # noqa: F401
import html as html_lib  # noqa: F401
from datetime import datetime, timezone, timedelta  # noqa: F401
from typing import Dict, List, Optional  # noqa: F401
from urllib.parse import quote, urlparse  # noqa: F401

import requests  # noqa: F401
from fastapi import (  # noqa: F401
    APIRouter, HTTPException, Depends, Request, Response, Query, UploadFile, File, Form,
)
from starlette.responses import StreamingResponse  # noqa: F401
from pydantic import BaseModel, Field, EmailStr, field_validator  # noqa: F401

from database import client, _raw_db, db, _current_tenant_id, _clean  # noqa: F401
from security import (  # noqa: F401
    hash_pw, verify_pw, get_current_user, require_admin, public_rate_limit,
    durable_rate_limit, ai_daily_quota, require_super_admin, require_tenant_admin,
    current_tenant, require_owner_pin, _pin_attempt_guard, _pin_attempt_fail, _pin_attempt_clear,
)
from models import (  # noqa: F401
    Tenant, Customer, Appointment, REVIEW_REWARD_CREDITS, MAX_CUSTOMER_CREDIT,
    REFERRAL_REWARD_REFERRER, REFERRAL_REWARD_REFERRED,
)
from email_service import (  # noqa: F401
    _send_email, _welcome_email_html, _credentials_email_html, _monthly_report_html,
    _weekly_report_html, _birthday_email_html, _platform_digest_html,
)
from services.storage import _put_object, _get_object, _MIME, APP_NAME, validate_image_bytes  # noqa: F401
from services.pdf import _render_salary_slip_pdf, _render_resume_pdf  # noqa: F401
from services.billing import (  # noqa: F401
    _validate_coupon, _consume_coupon, _coupon_discount, _active_membership, _loyalty_rules,
)
from utils import _csv_cell, _csv_row, _read_csv_upload, MAX_CSV_BYTES  # noqa: F401
router = APIRouter()

class SecurityPinIn(BaseModel):
    new_pin: str = Field(..., pattern=r"^\d{4,6}$")
    current_pin: Optional[str] = None

@router.get("/settings/security-pin")
async def security_pin_status(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return {"set": bool(t.get("security_pin_hash"))}


@router.put("/settings/security-pin")
async def set_security_pin(body: SecurityPinIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    existing = t.get("security_pin_hash")
    if existing:
        await _pin_attempt_guard(t["id"])
        if not (body.current_pin and verify_pw(body.current_pin, existing)):
            await _pin_attempt_fail(t["id"])
            raise HTTPException(403, "Current PIN is incorrect")
        await _pin_attempt_clear(t["id"])
    await db.tenants.update_one({"id": t["id"]}, {"$set": {"security_pin_hash": hash_pw(body.new_pin)}})
    return {"ok": True, "set": True}


class BranchSwitchRequestIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    phone: str = Field(..., min_length=7, max_length=20)
    position: str = Field(..., min_length=2, max_length=60)
    branch: str = Field("", max_length=120)


class BranchSwitchVerifyIn(BaseModel):
    request_id: str
    otp: str = Field(..., min_length=4, max_length=8)


class OwnerPinIn(BaseModel):
    pin: str = Field(..., min_length=4, max_length=6)


def _mask_email(e: str) -> str:
    if not e or "@" not in e:
        return ""
    u, d = e.split("@", 1)
    return f"{u[:2]}***@{d}"


def _switch_otp_email_html(t: dict, req: dict) -> str:
    esc = html_lib.escape
    return f"""<div style="font-family:Georgia,serif;background:#f4f2ee;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:#191921;border-radius:16px;padding:28px;text-align:center">
      <div style="color:#c9a35c;font-size:11px;letter-spacing:3px;text-transform:uppercase">Branch switch approval</div>
      <div style="color:#fff;font-size:20px;margin-top:8px">{esc(t.get('name') or 'Your salon')}</div>
      <p style="color:#9a9aa6;font-size:13px;margin-top:14px"><b style="color:#fff">{esc(req['requester_name'])}</b> ({esc(req['requester_position'])} &middot; {esc(req['requester_phone'])}) wants to switch the dashboard to <b style="color:#fff">{esc(req.get('branch') or 'All branches')}</b>.</p>
      <div style="background:#26262f;border:1px solid #c9a35c;border-radius:12px;padding:14px;margin:18px 0">
        <div style="color:#9a9aa6;font-size:11px">Share this OTP only if you approve</div>
        <div style="color:#c9a35c;font-size:32px;letter-spacing:8px;font-weight:700;margin-top:4px">{req['otp']}</div>
      </div>
      <div style="color:#6f6f7a;font-size:11px">Valid for 10 minutes. If you don't recognise this person, ignore this email.</div>
    </div></div>"""


@router.post("/branch-switch/request")
async def branch_switch_request(body: BranchSwitchRequestIn, user=Depends(get_current_user), t=Depends(current_tenant)):
    """Anyone on a shared login must identify themselves; a 6-digit OTP goes to the owner."""
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()), "otp": f"{secrets.randbelow(900000) + 100000}",
        "requester_name": body.name.strip(), "requester_phone": body.phone.strip(),
        "requester_position": body.position.strip(), "branch": body.branch.strip(),
        "status": "pending", "attempts": 0, "requested_by_user": user.get("email"),
        "expires_at": (now + timedelta(minutes=10)).isoformat(), "created_at": now.isoformat(),
    }
    await db.branch_switch_requests.insert_one(doc)
    owner_email = (t or {}).get("owner_email")
    sent = False
    if owner_email:
        res = await _send_email(
            [owner_email],
            f"Branch switch OTP — {body.name.strip()} ({body.position.strip()})",
            _switch_otp_email_html(t, doc))
        sent = bool(res.get("sent"))
    return {"request_id": doc["id"], "owner_email": _mask_email(owner_email or ""),
            "email_sent": sent, "expires_in_min": 10}


@router.post("/branch-switch/verify")
async def branch_switch_verify(body: BranchSwitchVerifyIn, user=Depends(get_current_user)):
    req = await db.branch_switch_requests.find_one({"id": body.request_id}, {"_id": 0})
    if not req or req.get("status") != "pending":
        raise HTTPException(400, "Request not found or already used — ask for a new OTP")
    if req["expires_at"] < datetime.now(timezone.utc).isoformat():
        await db.branch_switch_requests.update_one({"id": req["id"]}, {"$set": {"status": "expired"}})
        raise HTTPException(400, "OTP expired — please request approval again")
    if int(req.get("attempts") or 0) >= 5:
        await db.branch_switch_requests.update_one({"id": req["id"]}, {"$set": {"status": "blocked"}})
        raise HTTPException(400, "Too many wrong attempts — request a new OTP")
    if not hmac.compare_digest(str(req["otp"]), body.otp.strip()):
        await db.branch_switch_requests.update_one({"id": req["id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(400, "Incorrect OTP")
    await db.branch_switch_requests.update_one(
        {"id": req["id"]},
        {"$set": {"status": "approved", "approved_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True}


@router.post("/branch-switch/owner-pin")
async def branch_switch_owner_pin(body: OwnerPinIn, user=Depends(get_current_user), t=Depends(current_tenant)):
    """Owner fast-path: knowing the Security PIN proves it's the owner switching."""
    ph = (t or {}).get("security_pin_hash")
    if not ph:
        raise HTTPException(400, "No owner PIN set — use the OTP option")
    await _pin_attempt_guard(t["id"])
    if not verify_pw(body.pin, ph):
        await _pin_attempt_fail(t["id"])
        raise HTTPException(403, "Incorrect PIN")
    await _pin_attempt_clear(t["id"])
    return {"ok": True}


class SalonSwitchIn(BaseModel):
    tenant_id: str
    pin: Optional[str] = None


@router.post("/auth/switch-salon")
async def switch_salon(body: SalonSwitchIn, user=Depends(get_current_user), t=Depends(current_tenant)):
    """Multi-salon owners: switch the active salon on their login.
    Owner PIN of the CURRENT salon confirms the switch (no-op until a PIN is set)."""
    allowed = set(user.get("tenant_ids") or [])
    if user.get("tenant_id"):
        allowed.add(user["tenant_id"])
    if body.tenant_id not in allowed:
        raise HTTPException(403, "This salon is not linked to your login")
    if body.tenant_id == user.get("tenant_id"):
        return {"ok": True, "already_active": True}
    ph = (t or {}).get("security_pin_hash")
    if ph:
        if not body.pin:
            raise HTTPException(403, "OWNER_PIN_REQUIRED")
        await _pin_attempt_guard(t["id"])
        if not verify_pw(body.pin, ph):
            await _pin_attempt_fail(t["id"])
            raise HTTPException(403, "Incorrect PIN")
        await _pin_attempt_clear(t["id"])
    await db.users.update_one({"id": user["id"]}, {"$set": {"tenant_id": body.tenant_id}})
    target = await db.tenants.find_one({"id": body.tenant_id}, {"_id": 0, "id": 1, "name": 1, "slug": 1})
    return {"ok": True, "active_salon": target}


@router.get("/auth/my-salons/overview")
async def my_salons_overview(request: Request, user=Depends(get_current_user), t=Depends(current_tenant)):
    """Group Dashboard (multi-salon owners): today's collections across all salons.
    Locked behind the Owner PIN of the currently active salon (header X-Owner-Pin)."""
    if user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(403, "Only the owner/admin can view the Group Dashboard")
    ids = set(user.get("tenant_ids") or [])
    if user.get("tenant_id"):
        ids.add(user["tenant_id"])
    if len(ids) < 2:
        raise HTTPException(400, "Only one salon is linked to your login")
    ph = (t or {}).get("security_pin_hash")
    if ph:
        pin = request.headers.get("X-Owner-Pin", "")
        if not pin:
            raise HTTPException(403, "OWNER_PIN_REQUIRED")
        await _pin_attempt_guard(t["id"])
        if not verify_pw(pin, ph):
            await _pin_attempt_fail(t["id"])
            raise HTTPException(403, "Incorrect PIN")
        await _pin_attempt_clear(t["id"])
    ist = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(ist)
    day_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).isoformat()
    month_start = now_ist.replace(day=1, hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).isoformat()
    today_ist = now_ist.date().isoformat()
    salons = []
    for tid in ids:
        t = await _raw_db.tenants.find_one(
            {"id": tid}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "location": 1, "logo_url": 1})
        if not t:
            continue
        async def _inv_sum(since: str) -> tuple[float, int]:
            row = await _raw_db.invoices.aggregate([
                {"$match": {"tenant_id": tid, "created_at": {"$gte": since}}},
                {"$group": {"_id": None, "total": {"$sum": {"$toDouble": {"$ifNull": ["$total", 0]}}},
                            "n": {"$sum": 1}}}]).to_list(1)
            return (round(row[0]["total"], 2), row[0]["n"]) if row else (0.0, 0)

        today_total, today_count = await _inv_sum(day_start)
        month_total, _ = await _inv_sum(month_start)
        appts_today = await _raw_db.appointments.count_documents(
            {"tenant_id": tid, "scheduled_at": {"$regex": f"^{today_ist}"}, "status": {"$ne": "cancelled"}})
        salons.append({
            **t,
            "today": today_total,
            "invoices_today": today_count,
            "month": month_total,
            "appointments_today": appts_today,
            "active": tid == user.get("tenant_id"),
        })
    salons.sort(key=lambda x: -x["today"])
    return {
        "date": today_ist,
        "salons": salons,
        "total_today": round(sum(s["today"] for s in salons), 2),
        "total_month": round(sum(s["month"] for s in salons), 2),
    }


@router.get("/branch-switch/pending")
async def branch_switch_pending(user=Depends(require_tenant_admin)):
    now_iso = datetime.now(timezone.utc).isoformat()
    return await db.branch_switch_requests.find(
        {"status": "pending", "expires_at": {"$gt": now_iso}}, {"_id": 0}).sort("created_at", -1).to_list(20)


@router.post("/branch-switch/{rid}/deny")
async def branch_switch_deny(rid: str, user=Depends(require_tenant_admin)):
    await db.branch_switch_requests.update_one({"id": rid}, {"$set": {"status": "denied"}})
    return {"ok": True}


# ---------------- Entertainment: custom tenant playlists ----------------
class PlaylistIn(BaseModel):
    label: str = Field(..., min_length=2, max_length=60)
    url: str = Field(..., min_length=10, max_length=500)


def _parse_media_url(url: str) -> Optional[dict]:
    u = url.strip()
    m = re.search(r"open\.spotify\.com/(playlist|album|track)/([A-Za-z0-9]+)", u)
    if m:
        return {"kind": "spotify", "media_type": m.group(1), "media_id": m.group(2)}
    if "youtube.com" in u or "youtu.be" in u:
        m = re.search(r"[?&]list=([A-Za-z0-9_-]+)", u)
        if m:
            return {"kind": "youtube", "media_type": "playlist", "media_id": m.group(1)}
        m = re.search(r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)([A-Za-z0-9_-]{6,})", u)
        if m:
            return {"kind": "youtube", "media_type": "video", "media_id": m.group(1)}
    return None


@router.get("/entertainment/playlists")
async def list_playlists(user=Depends(require_tenant_admin)):
    return await db.entertainment_playlists.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)


@router.post("/entertainment/playlists")
async def add_playlist(body: PlaylistIn, user=Depends(require_tenant_admin)):
    parsed = _parse_media_url(body.url)
    if not parsed:
        raise HTTPException(400, "Couldn't read that link — paste a YouTube video/playlist URL or a Spotify playlist/album/track URL.")
    doc = {"id": str(uuid.uuid4()), "label": body.label.strip(), "url": body.url.strip(),
           **parsed, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.entertainment_playlists.insert_one(doc)
    return _clean(doc)


@router.delete("/entertainment/playlists/{pid}")
async def delete_playlist(pid: str, user=Depends(require_tenant_admin)):
    await db.entertainment_playlists.delete_one({"id": pid})
    return {"ok": True}


