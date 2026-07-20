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
from schemas import Staff, StaffIn

router = APIRouter()

from routes.registry import _aadhaar_fp
from routes.staff_portal import IST_TZ

# ---------------- Staff ----------------
_STAFF_SENSITIVE_FIELDS = {
    "monthly_base_salary": 0, "commission_pct": 0, "bank_details": 0, "aadhaar_last4": 0,
    "max_advance": 0, "overtime_rate": 0, "salary_visible": 0, "notice_period_days": 0,
    "serving_notice": 0, "last_working_day": 0,
}


@router.get("/staff")
async def list_staff(user=Depends(get_current_user)):
    proj = {"_id": 0, "aadhaar_hash": 0}
    if user.get("role") not in ("admin", "super_admin"):
        proj.update(_STAFF_SENSITIVE_FIELDS)  # SEC-001: staff/manager get no pay/bank/ID data
    return await db.staff.find({"former": {"$ne": True}}, proj).to_list(500)


# ── Previous staff (left / notice completed) — Settings section ──

async def _close_registry_employment(s: dict) -> None:
    """Close the open registry employment for this salon with the exit date."""
    phone = re.sub(r"\D", "", s.get("phone") or "")
    if len(phone) < 10:
        return
    emp = await _raw_db.registry_employees.find_one({"phone": {"$regex": f"{phone[-10:]}$"}}, {"_id": 0, "id": 1})
    if not emp:
        return
    await _raw_db.registry_employments.update_many(
        {"employee_id": emp["id"], "to_date": None, "tenant_id": s["tenant_id"]},
        {"$set": {"to_date": s.get("last_working_day") or datetime.now(timezone.utc).date().isoformat(),
                  "reason_for_leaving": "Completed notice period"}})


async def auto_close_departed_staff() -> dict:
    """Daily sweep: staff whose last working day has passed → former, login blocked,
    registry employment closed with the exit date. Idempotent."""
    today = datetime.now(timezone(timedelta(hours=5, minutes=30))).date().isoformat()
    rows = await _raw_db.staff.find(
        {"last_working_day": {"$nin": [None, ""], "$lt": today}, "former": {"$ne": True}},
        {"_id": 0}).to_list(500)
    for s in rows:
        await _raw_db.staff.update_one({"id": s["id"]}, {"$set": {
            "active": False, "former": True, "left_on": s["last_working_day"], "serving_notice": False}})
        if s.get("user_id"):
            await _raw_db.users.update_one({"id": s["user_id"]}, {"$set": {"disabled": True}})
        await _close_registry_employment(s)
    return {"closed": len(rows)}


@router.get("/staff/previous")
async def previous_staff_list(user=Depends(require_tenant_admin)):
    """Staff who left — kept in this list for 6 months. Registry history is permanent."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=183)).date().isoformat()
    rows = await db.staff.find(
        {"former": True, "former_hidden": {"$ne": True}, "left_on": {"$gte": cutoff}},
        {"_id": 0, "id": 1, "name": 1, "role": 1, "phone": 1, "email": 1, "left_on": 1, "rehired_as": 1, "relieving_letter": 1},
    ).sort("left_on", -1).to_list(200)
    return {"items": rows}


class RelievingIn(BaseModel):
    letter_type: str = Field(..., pattern="^(excellent|standard|terminated|absconded)$")
    reason: str = Field("", max_length=200)
    email_to: Optional[EmailStr] = None


async def _downgrade_registry_rating(s: dict, letter_type: str, reason: str):
    """Terminated/absconded staff lose rating on the public verification portal."""
    phone = re.sub(r"\D", "", s.get("phone") or "")
    if len(phone) < 10:
        return
    emp = await _raw_db.registry_employees.find_one({"phone": {"$regex": f"{phone[-10:]}$"}}, {"_id": 0, "id": 1})
    if not emp:
        return
    new_rating = 1.0 if letter_type == "absconded" else 1.5
    label = "Absconded" if letter_type == "absconded" else "Terminated"
    await _raw_db.registry_employments.update_many(
        {"employee_id": emp["id"], "tenant_id": s["tenant_id"]},
        {"$set": {"rating": new_rating, "reason_for_leaving": label,
                  "comment": (f"{label} by employer" + (f" — {reason}" if reason else ""))[:1000]}})


@router.post("/staff/previous/{sid}/relieving-letter")
async def send_relieving_letter(sid: str, body: RelievingIn,
                                user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Owner issues a relieving/termination letter PDF (salon letterhead) to a departed
    staff member's personal email. Terminated/absconded also lowers their public registry rating."""
    from services.pdf import _render_relieving_letter_pdf, RELIEVING_TEMPLATES
    s = await db.staff.find_one({"id": sid, "former": True}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Previous staff entry not found")
    from_date = (s.get("joined_date") or s.get("created_at") or "")[:10]
    to_date = s.get("left_on") or s.get("last_working_day") or datetime.now(timezone.utc).date().isoformat()
    pdf = _render_relieving_letter_pdf(t, s, body.letter_type, from_date, to_date, body.reason)
    title = RELIEVING_TEMPLATES[body.letter_type][0]
    to = body.email_to or s.get("personal_email") or s.get("email")
    emailed = False
    if to:
        res = await _send_email(
            [to], f"{title} — {t.get('name')}",
            f"<div style='font-family:Arial,sans-serif;font-size:14px;color:#333'>"
            f"<p>Dear {html_lib.escape(s.get('name') or '')},</p>"
            f"<p>Please find attached your <b>{title}</b> from <b>{html_lib.escape(t.get('name') or '')}</b> "
            f"covering your employment from {from_date or 'N/A'} to {to_date}.</p>"
            f"<p style='color:#888;font-size:12px'>This is a system-generated document issued by the management.</p></div>",
            attachments=[{"filename": f"{body.letter_type}-letter-{(s.get('name') or 'staff').replace(' ', '-')}.pdf",
                          "content": base64.b64encode(pdf).decode()}])
        emailed = bool(res.get("sent"))
        if to and not emailed:
            raise HTTPException(502, f"Email failed: {res.get('error')}")
    await db.staff.update_one({"id": sid}, {"$set": {"relieving_letter": {
        "type": body.letter_type, "reason": body.reason, "sent_to": to, "emailed": emailed,
        "sent_at": datetime.now(timezone.utc).isoformat(), "by": user.get("email")}}})
    if body.letter_type in ("terminated", "absconded"):
        await _downgrade_registry_rating(s, body.letter_type, body.reason)
    return {"ok": True, "emailed": emailed, "sent_to": to,
            "rating_downgraded": body.letter_type in ("terminated", "absconded")}


@router.delete("/staff/previous/{sid}")
async def previous_staff_delete(sid: str, user=Depends(require_tenant_admin)):
    """Remove an entry from the Previous Staff list (registry history stays intact)."""
    res = await db.staff.update_one({"id": sid, "former": True}, {"$set": {"former_hidden": True}})
    if not res.matched_count:
        raise HTTPException(404, "Previous staff entry not found")
    return {"ok": True}


@router.post("/staff/previous/{sid}/rehire")
async def previous_staff_rehire(sid: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Welcome them back: fresh staff ID for the new stint; the registry links it to
    their permanent history automatically (same registry employee, new employment)."""
    old = await db.staff.find_one({"id": sid, "former": True}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Previous staff entry not found")
    now = datetime.now(timezone.utc).isoformat()
    new_id = str(uuid.uuid4())
    fresh = {k: old.get(k) for k in ("name", "phone", "email", "role", "specialties", "commission_pct",
                                     "salary", "week_off_day", "shift_start", "shift_end") if old.get(k) is not None}
    await db.staff.insert_one({**fresh, "id": new_id, "tenant_id": t["id"], "active": True,
                               "rehired_from": sid, "created_at": now})
    await db.staff.update_one({"id": sid}, {"$set": {"rehired_as": new_id, "former_hidden": True}})
    # Registry continuity: same permanent registry profile, NEW open employment for this stint.
    registry_linked = False
    phone = re.sub(r"\D", "", old.get("phone") or "")
    if len(phone) >= 10:
        emp = await _raw_db.registry_employees.find_one({"phone": {"$regex": f"{phone[-10:]}$"}}, {"_id": 0, "id": 1})
        if emp:
            await _raw_db.registry_employments.insert_one({
                "id": str(uuid.uuid4()), "employee_id": emp["id"], "tenant_id": t["id"],
                "salon_name": t.get("name") or "Salon", "designation": old.get("role") or "Stylist",
                "skills": old.get("specialties") or [], "from_date": now[:10], "to_date": None,
                "rating": None, "reason_for_leaving": "Working",
                "comment": f"Rehired on {now[:10]} — previous stint closed on {old.get('left_on') or 'n/a'}.",
                "hq_verified": False, "created_by": user["id"], "created_at": now})
            registry_linked = True
    return {"ok": True, "staff_id": new_id, "registry_linked": registry_linked}


def _staff_write_payload(body: StaffIn) -> dict:
    d = body.model_dump()
    aad = re.sub(r"\D", "", d.pop("aadhaar", None) or "")
    if aad:
        if len(aad) != 12:
            raise HTTPException(400, "Aadhaar must be exactly 12 digits")
        d["aadhaar_last4"] = aad[-4:]
        d["aadhaar_hash"] = _aadhaar_fp(aad)
    return d


@router.post("/staff")
async def create_staff(body: StaffIn, user=Depends(require_tenant_admin), _pin=Depends(require_owner_pin)):
    s = Staff(**_staff_write_payload(body)).model_dump()
    await db.staff.insert_one(s)
    return _clean({k: v for k, v in s.items() if k != "aadhaar_hash"})

@router.put("/staff/{sid}")
async def update_staff(sid: str, body: StaffIn, user=Depends(require_tenant_admin), _pin=Depends(require_owner_pin)):
    await db.staff.update_one({"id": sid}, {"$set": _staff_write_payload(body)})
    return await db.staff.find_one({"id": sid}, {"_id": 0, "aadhaar_hash": 0})

@router.delete("/staff/{sid}")
async def delete_staff(sid: str, user=Depends(require_tenant_admin), _pin=Depends(require_owner_pin)):
    # If the staff has a linked user (login credential), also delete the login
    # so the deleted staff cannot access the salon.
    s = await db.staff.find_one({"id": sid}, {"_id": 0, "user_id": 1})
    if s and s.get("user_id"):
        await db.users.delete_one({"id": s["user_id"]})
    await db.staff.delete_one({"id": sid})
    return {"ok": True}


# ---------------- Salary advances ----------------
class AdvanceIn(BaseModel):
    amount: float = Field(..., gt=0)
    note: str = Field("", max_length=200)


@router.post("/staff/{sid}/advance")
async def give_advance(sid: str, body: AdvanceIn, admin=Depends(require_tenant_admin), _pin=Depends(require_owner_pin)):
    """One advance per staff per month, only after the 15th, capped at staff.max_advance.
    Auto-deducted from that month's salary slip."""
    staff = await db.staff.find_one({"id": sid}, {"_id": 0})
    if not staff:
        raise HTTPException(404, "Staff not found")
    max_adv = float(staff.get("max_advance") or 0)
    if max_adv <= 0:
        raise HTTPException(400, "No advance limit set for this staff. Edit the staff profile and set 'Max advance' first.")
    if body.amount > max_adv:
        raise HTTPException(400, f"Advance cannot exceed the ₹{max_adv:,.0f} limit set for {staff.get('name')}.")
    today_ist = datetime.now(IST_TZ).date()
    if today_ist.day <= 15:
        raise HTTPException(400, "Advance can only be given after the 15th of the month.")
    month = today_ist.strftime("%Y-%m")
    if await db.advances.find_one({"staff_id": sid, "month": month}):
        raise HTTPException(400, f"{staff.get('name')} has already taken an advance this month (one per month).")
    doc = {
        "id": str(uuid.uuid4()), "staff_id": sid, "staff_name": staff.get("name"),
        "amount": round(body.amount, 2), "note": body.note.strip(), "month": month,
        "given_by": admin.get("email"), "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.advances.insert_one(doc)
    return _clean(doc)


@router.get("/staff/{sid}/advances")
async def list_advances(sid: str, admin=Depends(require_tenant_admin)):
    rows = await db.advances.find({"staff_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(24)
    return rows


@router.delete("/staff/{sid}/advance/{aid}")
async def delete_advance(sid: str, aid: str, admin=Depends(require_tenant_admin), _pin=Depends(require_owner_pin)):
    """Undo a mistakenly-recorded advance — allowed only within the same month."""
    month = datetime.now(IST_TZ).strftime("%Y-%m")
    res = await db.advances.delete_one({"id": aid, "staff_id": sid, "month": month})
    if res.deleted_count == 0:
        raise HTTPException(404, "Advance not found (past-month advances can't be removed)")
    return {"ok": True}


# ============== Staff Portal (login, attendance, salary slip) ==============

class StaffLoginCreateIn(BaseModel):
    email: EmailStr


def _generate_temp_password() -> str:
    """Temp password: two friendly words + a strong random token, e.g. Bright-Silk-kTz9Qw2Lp4A.
    The token alone carries ~64 bits of entropy (audit SEC-002)."""
    _words = ["Rose", "Silk", "Gold", "Ivory", "Coral", "Bright", "Velvet",
              "Amber", "Pearl", "Onyx", "Blush", "Willow", "Ember", "Frost"]
    return f"{secrets.choice(_words)}-{secrets.choice(_words)}-{secrets.token_urlsafe(8)}"


class StaffTransferIn(BaseModel):
    target_tenant_id: str


@router.post("/staff/{sid}/transfer")
async def transfer_staff(sid: str, body: StaffTransferIn,
                         admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Move a staff member (profile + portal login) to another salon the SAME owner controls.
    Their booking-portal visibility follows automatically; history stays with the old branch."""
    owned = set(admin.get("tenant_ids") or [])
    if admin.get("tenant_id"):
        owned.add(admin["tenant_id"])
    target_tid = body.target_tenant_id.strip()
    if target_tid == t["id"]:
        raise HTTPException(400, "Staff is already in this salon")
    if admin.get("role") != "super_admin" and target_tid not in owned:
        raise HTTPException(403, "You can only transfer staff between salons linked to your login")
    target = await _raw_db.tenants.find_one({"id": target_tid}, {"_id": 0, "id": 1, "name": 1, "slug": 1})
    if not target:
        raise HTTPException(404, "Target salon not found")
    s = await db.staff.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Staff member not found")
    await _raw_db.staff.update_one(
        {"id": sid, "tenant_id": t["id"]},
        {"$set": {"tenant_id": target_tid, "branch": "",
                  "transferred_from": t["id"],
                  "transferred_at": datetime.now(timezone.utc).isoformat()}})
    if s.get("user_id"):
        await _raw_db.users.update_one({"id": s["user_id"]}, {"$set": {"tenant_id": target_tid}})
    return {"ok": True, "staff": s["name"], "transferred_to": target,
            "login_moved": bool(s.get("user_id"))}


@router.post("/staff/{sid}/create-login")
async def create_staff_login(
    sid: str, body: StaffLoginCreateIn,
    admin=Depends(require_tenant_admin), t=Depends(current_tenant),
):
    """Create a login credential for a staff member. Returns a one-time temp
    password to share with the staff — they'll be forced to change it on first
    login (must_change_password=True)."""
    s = await db.staff.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Staff member not found")
    if s.get("user_id"):
        raise HTTPException(400, "This staff already has a login")
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    temp_pw = _generate_temp_password()
    new_user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": s.get("name") or "Staff",
        "role": "staff",
        "tenant_id": t["id"],
        "status": "active",
        "disabled": False,
        "password_hash": hash_pw(temp_pw),
        "must_change_password": True,
        "staff_id": sid,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(new_user)
    await db.staff.update_one({"id": sid}, {"$set": {"user_id": new_user["id"], "email": email}})
    return {
        "ok": True,
        "email": email,
        "temp_password": temp_pw,
        "must_change_password": True,
    }


@router.post("/staff/{sid}/reset-login")
async def reset_staff_login(sid: str, admin=Depends(require_tenant_admin)):
    """Regenerate a one-time temp password for a staff who ALREADY has a login
    (e.g. the owner lost the original). Forces a password change on next login."""
    s = await db.staff.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Staff member not found")
    if not s.get("user_id"):
        raise HTTPException(400, "This staff has no login yet — use 'Give login' first")
    login_user = await db.users.find_one({"id": s["user_id"]}, {"_id": 0, "email": 1})
    if not login_user:
        raise HTTPException(400, "Linked login account not found — use 'Give login' to recreate it")
    temp_pw = _generate_temp_password()
    await db.users.update_one(
        {"id": s["user_id"]},
        {"$set": {"password_hash": hash_pw(temp_pw), "must_change_password": True, "disabled": False, "status": "active",
                  "password_changed_at": datetime.now(timezone.utc).isoformat()}})
    # Keep the staff record's email in sync with the actual login email so the
    # owner always shares the correct address (root cause of "invalid password").
    await db.staff.update_one({"id": sid}, {"$set": {"email": login_user["email"]}})
    return {"ok": True, "email": login_user["email"], "temp_password": temp_pw, "must_change_password": True}


# ---------------- Manager accounts (restricted-access role) ----------------
class ManagerCreateIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    email: str
    role: str = "Manager"
    phone: str = ""
    specialties: List[str] = []
    commission_pct: float = 10.0
    monthly_base_salary: float = 0.0
    salary_visible: bool = True

    @field_validator("email")
    @classmethod
    def _email(cls, v):
        v = v.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
            raise ValueError("Enter a valid email")
        return v

@router.get("/managers")
async def list_managers(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    rows = await _raw_db.users.find(
        {"tenant_id": t["id"], "role": "manager"},
        {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(100)
    return rows

@router.post("/managers")
async def create_manager(body: ManagerCreateIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    if await _raw_db.users.find_one({"email": body.email}):
        raise HTTPException(400, "Email already registered")
    temp_pw = _generate_temp_password()
    new_user = {
        "id": str(uuid.uuid4()), "email": body.email, "name": body.name.strip(),
        "role": "manager", "tenant_id": t["id"], "status": "active", "disabled": False,
        "password_hash": hash_pw(temp_pw), "must_change_password": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _raw_db.users.insert_one(new_user)
    # A manager is also a team member: create a linked staff profile so they appear
    # in Staff/booking and get salary slips (all details captured up-front, like staff).
    staff_doc = Staff(
        name=new_user["name"], role=body.role or "Manager", phone=body.phone,
        email=body.email, specialties=body.specialties, commission_pct=body.commission_pct,
        monthly_base_salary=body.monthly_base_salary, salary_visible=body.salary_visible,
        user_id=new_user["id"],
    ).model_dump()
    await db.staff.insert_one(staff_doc)
    return {"ok": True, "id": new_user["id"], "email": body.email, "name": new_user["name"],
            "temp_password": temp_pw, "must_change_password": True}

@router.post("/managers/{uid}/reset")
async def reset_manager(uid: str, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    u = await _raw_db.users.find_one({"id": uid, "tenant_id": t["id"], "role": "manager"}, {"_id": 0, "email": 1})
    if not u:
        raise HTTPException(404, "Manager not found")
    temp_pw = _generate_temp_password()
    await _raw_db.users.update_one(
        {"id": uid},
        {"$set": {"password_hash": hash_pw(temp_pw), "must_change_password": True, "disabled": False, "status": "active",
                  "password_changed_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "email": u["email"], "temp_password": temp_pw, "must_change_password": True}

@router.delete("/managers/{uid}")
async def delete_manager(uid: str, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    res = await _raw_db.users.delete_one({"id": uid, "tenant_id": t["id"], "role": "manager"})
    if res.deleted_count == 0:
        raise HTTPException(404, "Manager not found")
    await db.staff.delete_one({"user_id": uid})
    return {"ok": True}


# ---------------- WhatsApp send-approval workflow (manager → admin) ----------------
class WhatsAppRequestIn(BaseModel):
    client_name: str = Field(..., max_length=120)
    client_phone: str = Field("", max_length=20)
    message: str = Field(..., max_length=2000)
    kind: str = Field("confirmation", max_length=40)

@router.post("/whatsapp-requests")
async def create_whatsapp_request(body: WhatsAppRequestIn, user=Depends(get_current_user)):
    """A manager requests to send a WhatsApp message; admin must approve."""
    doc = {
        "id": str(uuid.uuid4()), "requested_by": user["id"],
        "requested_by_name": user.get("name") or user.get("email"),
        "client_name": body.client_name, "client_phone": "".join(c for c in body.client_phone if c.isdigit()),
        "message": body.message, "kind": body.kind, "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.whatsapp_requests.insert_one(doc)
    return {"ok": True, "id": doc["id"], "status": "pending"}

@router.get("/whatsapp-requests")
async def list_whatsapp_requests(status: str = "pending", admin=Depends(require_tenant_admin)):
    q = {} if status == "all" else {"status": status}
    return await db.whatsapp_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)

@router.get("/whatsapp-requests/pending-count")
async def whatsapp_pending_count(admin=Depends(require_tenant_admin)):
    return {"count": await db.whatsapp_requests.count_documents({"status": "pending"})}

@router.post("/whatsapp-requests/{rid}/approve")
async def approve_whatsapp_request(rid: str, admin=Depends(require_tenant_admin)):
    r = await db.whatsapp_requests.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Request not found")
    await db.whatsapp_requests.update_one(
        {"id": rid}, {"$set": {"status": "approved", "approved_by": admin["id"],
                               "approved_at": datetime.now(timezone.utc).isoformat()}})
    phone = r.get("client_phone") or ""
    from urllib.parse import quote as _quote
    wa_url = (f"https://wa.me/{phone}?text=" if phone else "https://wa.me/?text=") + _quote(r["message"])
    return {"ok": True, "wa_url": wa_url}

@router.post("/whatsapp-requests/{rid}/reject")
async def reject_whatsapp_request(rid: str, admin=Depends(require_tenant_admin)):
    res = await db.whatsapp_requests.update_one(
        {"id": rid, "status": "pending"},
        {"$set": {"status": "rejected", "approved_by": admin["id"], "approved_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Request not found or already handled")
    return {"ok": True}



@router.post("/staff/{sid}/toggle-active")
async def toggle_staff_active(sid: str, admin=Depends(require_tenant_admin)):
    """Enable/disable a staff record + their login (if any). Disabled staff
    cannot log in; the record is preserved for historical reports."""
    s = await db.staff.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Staff member not found")
    new_active = not bool(s.get("active", True))
    await db.staff.update_one({"id": sid}, {"$set": {"active": new_active}})
    if s.get("user_id"):
        await db.users.update_one({"id": s["user_id"]}, {"$set": {"disabled": not new_active}})
    return {"active": new_active}


