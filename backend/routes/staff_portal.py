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
    branch_lock,
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

from routes.registry import _safe_fetch_image_bytes
from routes.uploads import _MAX_UPLOAD_BYTES

# ---- Staff self-service (role=staff) ----

async def _current_staff(user=Depends(get_current_user)) -> dict:
    """Resolve the staff record for the logged-in user. Only staff (or admin
    viewing their own linked record) can access self-service endpoints."""
    staff_id = user.get("staff_id")
    if not staff_id:
        raise HTTPException(403, "This account is not linked to any staff profile.")
    s = await db.staff.find_one({"id": staff_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Staff profile not found")
    return s


@router.get("/staff/me/profile")
async def staff_me_profile(s=Depends(_current_staff)):
    return s


# ---------------- Staff planned leave requests ----------------
LONG_LEAVE_DAYS = 5          # leaves LONGER than this need advance notice
LONG_LEAVE_NOTICE_DAYS = 30  # ...of at least 1 month


class LeaveRequestIn(BaseModel):
    from_date: str = Field(..., max_length=10)
    to_date: str = Field(..., max_length=10)
    reason: str = Field("", max_length=500)


def _parse_leave_dates(from_date: str, to_date: str) -> tuple:
    try:
        f = datetime.strptime(from_date, "%Y-%m-%d").date()
        t = datetime.strptime(to_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Dates must be YYYY-MM-DD")
    if t < f:
        raise HTTPException(400, "End date cannot be before start date")
    return f, t


@router.post("/staff/me/leave-requests")
async def create_leave_request(body: LeaveRequestIn, s=Depends(_current_staff)):
    f, t = _parse_leave_dates(body.from_date, body.to_date)
    today_ist = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date()
    if f < today_ist:
        raise HTTPException(400, "Leave cannot start in the past")
    days = (t - f).days + 1
    if days > LONG_LEAVE_DAYS and f < today_ist + timedelta(days=LONG_LEAVE_NOTICE_DAYS):
        raise HTTPException(
            400,
            f"Leaves longer than {LONG_LEAVE_DAYS} days must be requested at least 1 month in advance "
            f"(earliest allowed start: {(today_ist + timedelta(days=LONG_LEAVE_NOTICE_DAYS)).isoformat()})",
        )
    overlap = await db.leave_requests.find_one({
        "staff_id": s["id"], "status": {"$in": ["pending", "approved"]},
        "from_date": {"$lte": t.isoformat()}, "to_date": {"$gte": f.isoformat()},
    }, {"_id": 0, "id": 1, "status": 1})
    if overlap:
        raise HTTPException(400, f"You already have a {overlap['status']} leave request overlapping these dates")
    doc = {
        "id": str(uuid.uuid4()), "staff_id": s["id"], "staff_name": s.get("name"),
        "from_date": f.isoformat(), "to_date": t.isoformat(), "days": days,
        "reason": body.reason.strip(), "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.leave_requests.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.get("/staff/me/leave-requests")
async def my_leave_requests(s=Depends(_current_staff)):
    return await db.leave_requests.find({"staff_id": s["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)


@router.delete("/staff/me/leave-requests/{rid}")
async def cancel_leave_request(rid: str, s=Depends(_current_staff)):
    res = await db.leave_requests.update_one(
        {"id": rid, "staff_id": s["id"], "status": "pending"},
        {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Request not found or already handled")
    return {"ok": True}


class AdminLeaveIn(LeaveRequestIn):
    staff_id: str = Field(..., max_length=64)


@router.post("/leave-requests/admin-mark")
async def admin_mark_leave(body: AdminLeaveIn, admin=Depends(require_admin)):
    """Owner/admin/manager marks a staff member on leave (auto-approved) — hides them from
    the booking page and shows 'On leave' on the attendance board for those dates."""
    s = await db.staff.find_one({"id": body.staff_id}, {"_id": 0, "id": 1, "name": 1})
    if not s:
        raise HTTPException(404, "Staff member not found")
    f, t = _parse_leave_dates(body.from_date, body.to_date)
    overlap = await db.leave_requests.find_one({
        "staff_id": s["id"], "status": {"$in": ["pending", "approved"]},
        "from_date": {"$lte": t.isoformat()}, "to_date": {"$gte": f.isoformat()},
    }, {"_id": 0, "id": 1, "status": 1})
    if overlap:
        if overlap["status"] == "pending":
            await db.leave_requests.update_one(
                {"id": overlap["id"]},
                {"$set": {"status": "approved", "decided_by": admin.get("name") or admin.get("email"),
                          "decided_at": datetime.now(timezone.utc).isoformat(),
                          "admin_note": "Approved while marking leave"}})
            return {"ok": True, "approved_existing": True}
        raise HTTPException(400, f"{s['name']} already has approved leave overlapping these dates")
    doc = {
        "id": str(uuid.uuid4()), "staff_id": s["id"], "staff_name": s.get("name"),
        "from_date": f.isoformat(), "to_date": t.isoformat(), "days": (t - f).days + 1,
        "reason": (body.reason or "Marked by admin").strip(), "status": "approved",
        "marked_by_admin": True, "decided_by": admin.get("name") or admin.get("email"),
        "decided_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.leave_requests.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.get("/leave-requests")
async def list_leave_requests(status: str = "pending", admin=Depends(require_tenant_admin)):
    q = {} if status == "all" else {"status": status}
    return await db.leave_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)


@router.get("/leave-requests/pending-count")
async def leave_requests_pending_count(admin=Depends(require_tenant_admin)):
    return {"count": await db.leave_requests.count_documents({"status": "pending"})}


class LeaveDecisionIn(BaseModel):
    note: str = Field("", max_length=300)


@router.post("/leave-requests/{rid}/approve")
async def approve_leave_request(rid: str, body: LeaveDecisionIn = LeaveDecisionIn(), admin=Depends(require_tenant_admin)):
    res = await db.leave_requests.update_one(
        {"id": rid, "status": "pending"},
        {"$set": {"status": "approved", "admin_note": body.note.strip(), "decided_by": admin.get("name") or admin.get("email"),
                  "decided_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Request not found or already handled")
    return {"ok": True, "status": "approved"}


@router.post("/leave-requests/{rid}/reject")
async def reject_leave_request(rid: str, body: LeaveDecisionIn = LeaveDecisionIn(), admin=Depends(require_tenant_admin)):
    res = await db.leave_requests.update_one(
        {"id": rid, "status": "pending"},
        {"$set": {"status": "rejected", "admin_note": body.note.strip(), "decided_by": admin.get("name") or admin.get("email"),
                  "decided_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Request not found or already handled")
    return {"ok": True, "status": "rejected"}


# ---------------- Staff week-off change requests ----------------
WEEK_OFF_ALLOWED_DAYS = {"monday", "tuesday", "wednesday", "thursday"}


class WeekOffChangeIn(BaseModel):
    requested_day: str = Field(..., max_length=12)
    reason: str = Field("", max_length=300)


@router.post("/staff/me/week-off-requests")
async def create_week_off_request(body: WeekOffChangeIn, s=Depends(_current_staff)):
    day = body.requested_day.strip().lower()
    now_ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    if day not in WEEK_OFF_ALLOWED_DAYS:
        raise HTTPException(400, "Week-off can only be Monday to Thursday — Friday, Saturday and Sunday are peak salon days")
    if day == now_ist.strftime("%A").lower():
        raise HTTPException(400, "Your new week-off can't be today itself — please pick a different day")
    if day == (s.get("week_off_day") or "").lower():
        raise HTTPException(400, f"{day.title()} is already your week-off day")
    if await db.week_off_requests.find_one({"staff_id": s["id"], "status": "pending"}, {"_id": 0, "id": 1}):
        raise HTTPException(400, "You already have a pending week-off change request — please wait for your owner's decision")
    doc = {
        "id": str(uuid.uuid4()), "staff_id": s["id"], "staff_name": s.get("name"),
        "current_day": (s.get("week_off_day") or "").lower() or None,
        "requested_day": day, "reason": body.reason.strip(),
        "status": "pending", "locked": True,
        "requested_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.week_off_requests.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.get("/staff/me/week-off-requests")
async def my_week_off_requests(s=Depends(_current_staff)):
    return await db.week_off_requests.find({"staff_id": s["id"]}, {"_id": 0}).sort("requested_at", -1).to_list(50)


@router.get("/week-off-requests")
async def list_week_off_requests(status: str = "pending", admin=Depends(require_tenant_admin)):
    q = {} if status == "all" else {"status": status}
    return await db.week_off_requests.find(q, {"_id": 0}).sort("requested_at", -1).to_list(200)


@router.post("/week-off-requests/{rid}/approve")
async def approve_week_off_request(rid: str, body: LeaveDecisionIn = LeaveDecisionIn(), admin=Depends(require_tenant_admin)):
    req = await db.week_off_requests.find_one({"id": rid, "status": "pending"}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Request not found or already handled")
    now = datetime.now(timezone.utc)
    effective_from = ((now + timedelta(hours=5, minutes=30)).date() + timedelta(days=1)).isoformat()
    await db.week_off_requests.update_one({"id": rid}, {"$set": {
        "status": "approved", "admin_note": body.note.strip(),
        "decided_by": admin.get("name") or admin.get("email"),
        "decided_at": now.isoformat(), "effective_from": effective_from}})
    await db.staff.update_one({"id": req["staff_id"]}, {"$set": {"week_off_day": req["requested_day"]}})
    return {"ok": True, "status": "approved", "effective_from": effective_from}


@router.post("/week-off-requests/{rid}/reject")
async def reject_week_off_request(rid: str, body: LeaveDecisionIn = LeaveDecisionIn(), admin=Depends(require_tenant_admin)):
    res = await db.week_off_requests.update_one(
        {"id": rid, "status": "pending"},
        {"$set": {"status": "rejected", "admin_note": body.note.strip(),
                  "decided_by": admin.get("name") or admin.get("email"),
                  "decided_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Request not found or already handled")
    return {"ok": True, "status": "rejected"}


# ---- Attendance rules: geo-fence, late fines, overtime, auto-checkout ----
IST_TZ = timezone(timedelta(hours=5, minutes=30))
GRACE_MINUTES = 10          # default grace — admin can override per tenant
LATE_FINE_TIERS_DEFAULT = {"grace_minutes": GRACE_MINUTES, "fine_5": 50.0, "fine_10": 100.0, "fine_15": 150.0, "fine_30": 300.0}
GEO_FENCE_M = 300           # check-in blocked beyond this distance from salon (tenant override: geo_fence_m)
HALF_DAY_AFTER_MIN = 180    # no check-in 3h past shift start -> half-day salary deduction


def _half_day_amount(staff: dict) -> float:
    """Half of one day's salary: (monthly base / 30) / 2."""
    base = float(staff.get("monthly_base_salary") or 0)
    return round(base / 30 / 2, 2)
AUTO_CHECKOUT_HOURS = 12    # forgot to check out — shift auto-closes at 12h


class GeoIn(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None
    accuracy: Optional[float] = None
    qr_token: Optional[str] = None
    week_off_confirmed: Optional[bool] = False


def _parse_hhmm(val, fallback: str) -> tuple:
    try:
        h, m = str(val).strip().split(":")
        h, m = int(h), int(m)
        if 0 <= h <= 23 and 0 <= m <= 59:
            return h, m
    except (ValueError, AttributeError):
        pass
    h, m = fallback.split(":")
    return int(h), int(m)


def _late_fine_rules(tenant: Optional[dict]) -> dict:
    saved = (tenant or {}).get("late_fines") or {}
    return {**LATE_FINE_TIERS_DEFAULT, **{k: saved[k] for k in LATE_FINE_TIERS_DEFAULT if k in saved}}


def _late_penalty_for(staff: dict, checkin_ist: datetime, tenant: Optional[dict] = None) -> tuple:
    """(minutes_late, fine ₹). Admin-configurable tiered fines after the grace window.
    Grace applies Monday–Friday only — Saturday & Sunday (peak days) have ZERO grace."""
    rules = _late_fine_rules(tenant)
    h, m = _parse_hhmm(staff.get("shift_start"), "10:00")
    start = checkin_ist.replace(hour=h, minute=m, second=0, microsecond=0)
    late_min = int((checkin_ist - start).total_seconds() // 60)
    grace = int(rules["grace_minutes"]) if checkin_ist.weekday() < 5 else 0
    if late_min <= grace:
        return max(late_min, 0), 0.0
    past = late_min - grace
    if past <= 5:
        fine = rules["fine_5"]
    elif past <= 10:
        fine = rules["fine_10"]
    elif past <= 15:
        fine = rules["fine_15"]
    else:
        fine = rules["fine_30"]
    return late_min, round(float(fine), 2)


class LateFineSettingsIn(BaseModel):
    grace_minutes: int = Field(10, ge=0, le=120)
    fine_5: float = Field(50, ge=0, le=100000)
    fine_10: float = Field(100, ge=0, le=100000)
    fine_15: float = Field(150, ge=0, le=100000)
    fine_30: float = Field(300, ge=0, le=100000)
    geo_fence_m: int = Field(300, ge=100, le=500)


@router.get("/settings/late-fines")
async def get_late_fine_settings(user=Depends(require_admin), t=Depends(current_tenant)):
    return {**_late_fine_rules(t), "geo_fence_m": int(t.get("geo_fence_m") or GEO_FENCE_M)}


@router.put("/settings/late-fines")
async def save_late_fine_settings(body: LateFineSettingsIn, user=Depends(require_admin), t=Depends(current_tenant)):
    data = body.model_dump()
    fence = data.pop("geo_fence_m")
    await db.tenants.update_one({"id": t["id"]}, {"$set": {"late_fines": data, "geo_fence_m": fence}})
    return {**data, "geo_fence_m": fence}


# OT policy: every completed 30-min block past shift end earns ₹50 by default.
OT_BLOCK_MINUTES = 30
OT_BLOCK_PAY = 50.0
PRODUCT_COMMISSION_PCT = 2.0  # % of product price credited to the selling staff's salary


def _overtime_for(staff: dict, checkout_ist: datetime) -> tuple:
    """(overtime_hours, overtime_pay ₹) for time worked past shift_end.
    Paid per completed 30-min block: ₹50 default, or staff's hourly overtime_rate/2 if set."""
    h, m = _parse_hhmm(staff.get("shift_end"), "21:00")
    end = checkout_ist.replace(hour=h, minute=m, second=0, microsecond=0)
    if checkout_ist <= end:
        return 0.0, 0.0
    secs = (checkout_ist - end).total_seconds()
    hours = round(secs / 3600, 2)
    blocks = int(secs // (OT_BLOCK_MINUTES * 60))
    rate = float(staff.get("overtime_rate") or 0)
    per_block = rate / 2 if rate > 0 else OT_BLOCK_PAY
    return hours, round(blocks * per_block, 2)


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * 6371000.0 * math.asin(math.sqrt(a))


async def _auto_close_stale_attendance():
    """Close any shift still open after 12h (staff forgot to check out)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=AUTO_CHECKOUT_HOURS)).isoformat()
    stale = await db.attendance.find(
        {"check_out_at": None, "check_in_at": {"$ne": None, "$lt": cutoff}},
        {"_id": 0}).to_list(200)
    for rec in stale:
        try:
            ci = datetime.fromisoformat(rec["check_in_at"])
        except (ValueError, TypeError):
            continue
        co = ci + timedelta(hours=AUTO_CHECKOUT_HOURS)
        staff = await db.staff.find_one({"id": rec["staff_id"]}, {"_id": 0}) or {}
        ot_h, ot_pay = _overtime_for(staff, co.astimezone(IST_TZ))
        await db.attendance.update_one(
            {"id": rec["id"]},
            {"$set": {"check_out_at": co.isoformat(), "hours_worked": float(AUTO_CHECKOUT_HOURS),
                      "auto_checked_out": True, "overtime_hours": ot_h, "overtime_pay": ot_pay}})


class WaiveFineIn(BaseModel):
    note: str = Field("", max_length=200)


@router.post("/attendance/{rec_id}/undo-checkout")
async def undo_checkout(rec_id: str, admin=Depends(require_admin), _pin=Depends(require_owner_pin)):
    """Correct a mistaken check-out — reopens the day so the staff member stays checked in."""
    rec = await db.attendance.find_one({"id": rec_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Attendance record not found")
    if not rec.get("check_out_at"):
        raise HTTPException(400, "This record has no check-out to undo")
    await db.attendance.update_one({"id": rec_id}, {"$set": {
        "check_out_at": None, "hours_worked": 0.0,
        "overtime_hours": 0.0, "overtime_pay": 0.0,
        "auto_checked_out": False, "check_out_method": None,
        "checkout_undone_by": admin.get("email"),
        "checkout_undone_at": datetime.now(timezone.utc).isoformat(),
        "prev_check_out_at": rec.get("check_out_at")}})
    return {"ok": True}


@router.post("/attendance/{rec_id}/waive-fine")
async def waive_late_fine(rec_id: str, body: WaiveFineIn, admin=Depends(require_admin), _pin=Depends(require_owner_pin)):
    """Correct a wrongly-applied late fine — zeroes the deduction, keeps an audit trail."""
    rec = await db.attendance.find_one({"id": rec_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Attendance record not found")
    fine = float(rec.get("late_penalty") or 0)
    if fine <= 0:
        raise HTTPException(400, "No fine on this record")
    await db.attendance.update_one({"id": rec_id}, {"$set": {
        "late_penalty": 0.0, "late_penalty_waived": fine,
        "waived_by": admin.get("email"), "waived_note": body.note.strip(),
        "waived_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "waived_amount": fine}


@router.post("/attendance/{rec_id}/undo-waive-fine")
async def undo_waive_late_fine(rec_id: str, admin=Depends(require_admin), _pin=Depends(require_owner_pin)):
    """Undo a mistaken fine waiver — restores the original late fine."""
    rec = await db.attendance.find_one({"id": rec_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Attendance record not found")
    waived = float(rec.get("late_penalty_waived") or 0)
    if waived <= 0:
        raise HTTPException(400, "No waived fine on this record")
    await db.attendance.update_one({"id": rec_id}, {"$set": {
        "late_penalty": waived, "late_penalty_waived": 0.0,
        "waive_undone_by": admin.get("email"),
        "waive_undone_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "restored_amount": waived}


@router.post("/attendance/{rec_id}/waive-half-day")
async def waive_half_day(rec_id: str, body: WaiveFineIn, admin=Depends(require_admin), _pin=Depends(require_owner_pin)):
    """Correct a wrongly-applied half-day mark — clears the deduction, keeps an audit trail."""
    rec = await db.attendance.find_one({"id": rec_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Attendance record not found")
    if not rec.get("half_day"):
        raise HTTPException(400, "No half-day mark on this record")
    ded = float(rec.get("half_day_deduction") or 0)
    await db.attendance.update_one({"id": rec_id}, {"$set": {
        "half_day": False, "half_day_deduction": 0.0, "no_show": False,
        "half_day_waived": ded, "half_day_waived_by": admin.get("email"),
        "half_day_waived_note": body.note.strip(),
        "half_day_waived_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "waived_amount": ded}


class ManualAttnIn(BaseModel):
    staff_id: str
    action: str = Field(..., pattern="^(check_in|check_out)$")
    time: str = Field(..., pattern=r"^\d{2}:\d{2}$")  # HH:MM IST
    note: str = Field("", max_length=200)
    date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")  # backfill up to 15 days


@router.post("/attendance/manual")
async def manual_attendance(body: ManualAttnIn, admin=Depends(require_admin),
                            _pin=Depends(require_owner_pin), t=Depends(current_tenant)):
    """Owner marks attendance on behalf of staff (PIN-gated). No GPS needed — owner attests presence."""
    staff = await db.staff.find_one({"id": body.staff_id}, {"_id": 0})
    if not staff:
        raise HTTPException(404, "Staff member not found")
    h, m = map(int, body.time.split(":"))
    if h > 23 or m > 59:
        raise HTTPException(400, "Invalid time")
    now_ist = datetime.now(IST_TZ)
    target_day = now_ist.date()
    if body.date:
        try:
            target_day = datetime.fromisoformat(body.date).date()
        except ValueError:
            raise HTTPException(400, "Invalid date")
        if target_day > now_ist.date():
            raise HTTPException(400, "Date can't be in the future")
        if (now_ist.date() - target_day).days > 15:
            raise HTTPException(400, "You can backfill attendance up to 15 days back only")
    when_ist = now_ist.replace(year=target_day.year, month=target_day.month, day=target_day.day,
                               hour=h, minute=m, second=0, microsecond=0)
    if when_ist > now_ist:
        raise HTTPException(400, "Time can't be in the future")
    when_utc = when_ist.astimezone(timezone.utc)
    today = target_day.isoformat()
    day_word = "today" if target_day == now_ist.date() else f"on {today}"
    rec = await db.attendance.find_one({"staff_id": staff["id"], "date": today}, {"_id": 0})
    audit = {"marked_by": admin.get("email"), "marked_note": body.note.strip(),
             "marked_at": datetime.now(timezone.utc).isoformat()}
    if body.action == "check_in":
        if rec and rec.get("check_in_at"):
            raise HTTPException(400, f"{staff.get('name')} is already checked in {day_word}.")
        late_min, penalty = _late_penalty_for(staff, when_ist, t)
        half_day = late_min >= HALF_DAY_AFTER_MIN
        fields = {"check_in_at": when_utc.isoformat(),
                  "late_minutes": late_min,
                  "late_penalty": 0.0 if half_day else penalty,
                  "half_day": half_day,
                  "half_day_deduction": _half_day_amount(staff) if half_day else 0.0,
                  "no_show": False,
                  "check_in_method": "manual_admin",
                  "check_in_lat": None, "check_in_lng": None, "check_in_distance_m": None,
                  **audit}
        if rec:
            await db.attendance.update_one({"staff_id": staff["id"], "date": today}, {"$set": fields})
        else:
            await db.attendance.insert_one({
                "id": str(uuid.uuid4()), "staff_id": staff["id"], "staff_name": staff.get("name"),
                "date": today, **fields, "check_out_at": None,
                "created_at": datetime.now(timezone.utc).isoformat()})
    else:
        if not rec or not rec.get("check_in_at"):
            raise HTTPException(400, f"{staff.get('name')} hasn't checked in {day_word} — check them in first.")
        if rec.get("check_out_at"):
            raise HTTPException(400, f"{staff.get('name')} is already checked out {day_word}.")
        check_in = datetime.fromisoformat(rec["check_in_at"])
        if when_utc <= check_in:
            raise HTTPException(400, "Check-out time must be after the check-in time.")
        hours = round((when_utc - check_in).total_seconds() / 3600, 2)
        ot_h, ot_pay = _overtime_for(staff, when_ist)
        await db.attendance.update_one(
            {"staff_id": staff["id"], "date": today},
            {"$set": {"check_out_at": when_utc.isoformat(), "hours_worked": hours,
                      "overtime_hours": ot_h, "overtime_pay": ot_pay,
                      "check_out_method": "manual_admin", **audit}})
    return await db.attendance.find_one({"staff_id": staff["id"], "date": today}, {"_id": 0})


def _norm_branch(v) -> str:
    return (v or "").strip().casefold()


def _fence_for(staff: dict, tenant: dict):
    """(lat, lng, label) the staff must check in near. A staff tagged to a CONFIGURED
    branch is fenced to that branch only; everyone else belongs to the main salon."""
    sb = _norm_branch(staff.get("branch"))
    if sb:
        for b in tenant.get("branches") or []:
            if _norm_branch(b.get("name")) == sb:
                if b.get("latitude") is not None and b.get("longitude") is not None:
                    return b["latitude"], b["longitude"], b["name"]
                return None, None, None  # their branch exists but isn't pinned — no fence
    # No tag, or a legacy tag that isn't a configured branch → main salon staff.
    if tenant.get("latitude") is not None and tenant.get("longitude") is not None:
        return tenant["latitude"], tenant["longitude"], "the salon"
    return None, None, None


@router.get("/staff/me/fence")
async def staff_me_fence(s=Depends(_current_staff), t=Depends(current_tenant)):
    """Where this staff member is geo-fenced for check-in (their branch, else main salon)."""
    lat, lng, label = _fence_for(s, t)
    branch = (s.get("branch") or "").strip()
    return {
        "fenced": lat is not None,
        "label": label or branch or "the salon",
        "branch": branch,
        "latitude": lat, "longitude": lng,
        "fence_m": int(t.get("geo_fence_m") or GEO_FENCE_M),
    }


@router.post("/staff/me/check-in")
async def staff_check_in(body: Optional[GeoIn] = None, s=Depends(_current_staff), t=Depends(current_tenant)):
    """Geo-fenced check-in with automatic late-fine calculation. Idempotent."""
    await _auto_close_stale_attendance()
    geo = body or GeoIn()
    today = datetime.now(timezone.utc).date().isoformat()
    existing = await db.attendance.find_one({"staff_id": s["id"], "date": today}, {"_id": 0})
    if existing and existing.get("check_in_at"):
        return existing
    is_week_off_today = (s.get("week_off_day") or "").lower() == datetime.now(IST_TZ).strftime("%A").lower()
    if is_week_off_today and not geo.week_off_confirmed:
        raise HTTPException(409, "WEEK_OFF_CONFIRM — Today is your week-off day. Please confirm you have your owner's approval to work today.")
    distance_m = None
    qr_ok = bool(geo.qr_token) and geo.qr_token == (t.get("attendance_qr_token") or "\x00")
    f_lat, f_lng, f_label = _fence_for(s, t)
    if f_lat is not None and not qr_ok:
        if geo.lat is None or geo.lng is None:
            raise HTTPException(400, "Location required — please allow GPS access in your browser to check in (or scan the salon desk QR).")
        distance_m = round(_haversine_m(geo.lat, geo.lng, f_lat, f_lng), 1)
        fence = int(t.get("geo_fence_m") or GEO_FENCE_M)
        gps_slack = min(float(geo.accuracy or 0), 200)  # forgive indoor GPS drift, capped
        if distance_m - gps_slack > fence:
            raise HTTPException(403, (
                f"You appear to be {int(distance_m)}m from {f_label}. Check-in is allowed only within {fence}m. "
                "If you ARE at the salon: the saved salon map location may be wrong (owner can re-pin it in Settings), "
                "or scan the salon desk QR to check in without GPS."))
    now = datetime.now(timezone.utc)
    late_min, penalty = _late_penalty_for(s, now.astimezone(IST_TZ), t)
    # Fines only for verified on-site check-ins (GPS inside the fence, or the desk QR).
    if distance_m is None and not qr_ok:
        penalty = 0.0
    half_day = late_min >= HALF_DAY_AFTER_MIN
    if half_day:
        penalty = 0.0  # half-day deduction replaces the late fine
    fields = {
        "check_in_at": now.isoformat(),
        "late_minutes": late_min, "late_penalty": penalty,
        "half_day": half_day,
        "half_day_deduction": _half_day_amount(s) if half_day else 0.0,
        "check_in_method": "qr" if qr_ok else "gps",
        "check_in_lat": geo.lat, "check_in_lng": geo.lng, "check_in_distance_m": distance_m,
    }
    if is_week_off_today:
        fields["week_off_override"] = True
    if existing:
        await db.attendance.update_one(
            {"staff_id": s["id"], "date": today},
            {"$set": fields},
        )
    else:
        await db.attendance.insert_one({
            "id": str(uuid.uuid4()),
            "staff_id": s["id"],
            "staff_name": s.get("name"),
            "date": today,
            **fields,
            "check_out_at": None,
            "created_at": now.isoformat(),
        })
    return await db.attendance.find_one({"staff_id": s["id"], "date": today}, {"_id": 0})


@router.post("/staff/me/check-out")
async def staff_check_out(body: Optional[GeoIn] = None, s=Depends(_current_staff)):
    geo = body or GeoIn()
    today = datetime.now(timezone.utc).date().isoformat()
    rec = await db.attendance.find_one({"staff_id": s["id"], "date": today}, {"_id": 0})
    if not rec or not rec.get("check_in_at"):
        raise HTTPException(400, "You haven't checked in yet today.")
    if rec.get("check_out_at"):
        return rec  # idempotent
    now = datetime.now(timezone.utc)
    check_in = datetime.fromisoformat(rec["check_in_at"])
    hours = round((now - check_in).total_seconds() / 3600, 2)
    ot_h, ot_pay = _overtime_for(s, now.astimezone(IST_TZ))
    await db.attendance.update_one(
        {"staff_id": s["id"], "date": today},
        {"$set": {"check_out_at": now.isoformat(), "hours_worked": hours,
                  "overtime_hours": ot_h, "overtime_pay": ot_pay,
                  "check_out_lat": geo.lat, "check_out_lng": geo.lng}},
    )
    return await db.attendance.find_one({"staff_id": s["id"], "date": today}, {"_id": 0})


@router.get("/staff/me/attendance")
async def staff_my_attendance(month: Optional[str] = None, s=Depends(_current_staff)):
    """List attendance for `month=YYYY-MM` (defaults to current month)."""
    from calendar import monthrange
    await _auto_close_stale_attendance()
    now = datetime.now(timezone.utc)
    if month:
        try:
            y, m = map(int, month.split("-"))
            start = f"{y:04d}-{m:02d}-01"
            end_day = monthrange(y, m)[1]
            end = f"{y:04d}-{m:02d}-{end_day:02d}"
        except Exception:
            raise HTTPException(400, "month must be YYYY-MM")
    else:
        y, m = now.year, now.month
        start = f"{y:04d}-{m:02d}-01"
        end_day = monthrange(y, m)[1]
        end = f"{y:04d}-{m:02d}-{end_day:02d}"
    recs = await db.attendance.find(
        {"staff_id": s["id"], "date": {"$gte": start, "$lte": end}},
        {"_id": 0},
    ).sort("date", -1).to_list(200)
    today = now.date().isoformat()
    today_rec = next((r for r in recs if r.get("date") == today), None)
    total_hours = round(sum(float(r.get("hours_worked") or 0) for r in recs), 2)
    total_days = sum(1 for r in recs if r.get("check_in_at"))
    return {
        "month": f"{y:04d}-{m:02d}",
        "records": recs,
        "today": today_rec,
        "total_hours": total_hours,
        "total_days": total_days,
    }


@router.get("/attendance/desk-qr")
async def attendance_desk_qr(request: Request, style: str = "poster", branch: str = "",
                             user=Depends(require_admin), t=Depends(current_tenant)):
    """Printable salon-desk QR — staff scan it to check in without GPS. style=poster (branded) | raw."""
    import qrcode
    from PIL import Image, ImageDraw, ImageFont
    token = t.get("attendance_qr_token")
    if not token:
        token = secrets.token_urlsafe(12)
        await db.tenants.update_one({"id": t["id"]}, {"$set": {"attendance_qr_token": token}})
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    proto = request.headers.get("x-forwarded-proto") or "https"
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, border=1)
    qr.add_data(f"{proto}://{host}/staff-portal?qr={token}")
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="#111111", back_color="white").convert("RGB")
    bg_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "qr_poster_bg.jpg")
    if style == "raw" or not os.path.exists(bg_path):
        buf = io.BytesIO()
        qr_img.resize((640, 640), Image.NEAREST).save(buf, format="PNG")
        buf.seek(0)
        return StreamingResponse(buf, media_type="image/png")
    poster = Image.open(bg_path).convert("RGB")  # 848x1264, white panel x178-669 y412-890
    qr_size = 430
    qr_img = qr_img.resize((qr_size, qr_size), Image.NEAREST)
    px = 178 + (669 - 178 - qr_size) // 2
    py = 412 + (890 - 412 - qr_size) // 2
    poster.paste(qr_img, (px, py))
    d = ImageDraw.Draw(poster)
    name = (t.get("name") or "").upper()
    branch_name = (branch or "").strip().upper()[:40]
    if name:
        try:
            fnt = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf", 34)
            fnt_s = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", 18)
            fnt_b = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", 22)
            if branch_name:
                d.text((poster.width // 2, poster.height - 108), name, font=fnt, fill=(212, 175, 55), anchor="mm")
                d.text((poster.width // 2, poster.height - 72), branch_name,
                       font=fnt_b, fill=(230, 220, 200), anchor="mm")
                d.text((poster.width // 2, poster.height - 40), "Powered by Miracurl", font=fnt_s, fill=(150, 150, 155), anchor="mm")
            else:
                d.text((poster.width // 2, poster.height - 92), name, font=fnt, fill=(212, 175, 55), anchor="mm")
                d.text((poster.width // 2, poster.height - 54), "Powered by Miracurl", font=fnt_s, fill=(150, 150, 155), anchor="mm")
        except OSError:
            pass
    buf = io.BytesIO()
    poster.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png",
                             headers={"Content-Disposition": 'inline; filename="staff-checkin-qr.png"'})


async def run_half_day_noshow_marker() -> int:
    """No check-in 3h past shift start (IST) -> mark half-day + salary deduction. Idempotent.
    Skips week-offs, approved leaves and already-marked/checked-in staff."""
    now_ist = datetime.now(IST_TZ)
    today = now_ist.date().isoformat()
    weekday = now_ist.strftime("%A").lower()
    marked = 0
    async for s in _raw_db.staff.find(
            {"active": True},
            {"_id": 0, "id": 1, "name": 1, "tenant_id": 1, "shift_start": 1,
             "week_off_day": 1, "monthly_base_salary": 1}):
        if (s.get("week_off_day") or "").lower() == weekday:
            continue
        h, m = _parse_hhmm(s.get("shift_start"), "10:00")
        cutoff = now_ist.replace(hour=h, minute=m, second=0, microsecond=0) + timedelta(minutes=HALF_DAY_AFTER_MIN)
        if now_ist < cutoff:
            continue
        rec = await _raw_db.attendance.find_one(
            {"staff_id": s["id"], "date": today}, {"_id": 0, "id": 1, "check_in_at": 1, "half_day": 1})
        if rec and (rec.get("check_in_at") or rec.get("half_day")):
            continue
        on_leave = await _raw_db.leave_requests.find_one(
            {"staff_id": s["id"], "status": "approved",
             "from_date": {"$lte": today}, "to_date": {"$gte": today}}, {"_id": 1})
        if on_leave:
            continue
        ded = _half_day_amount(s)
        sets = {"half_day": True, "half_day_deduction": ded, "no_show": True}
        if rec:
            await _raw_db.attendance.update_one({"id": rec["id"]}, {"$set": sets})
        else:
            await _raw_db.attendance.insert_one({
                "id": str(uuid.uuid4()), "staff_id": s["id"], "staff_name": s.get("name"),
                "tenant_id": s["tenant_id"], "date": today, "check_in_at": None,
                "check_out_at": None, "late_minutes": 0, "late_penalty": 0.0, **sets,
                "created_at": datetime.now(timezone.utc).isoformat()})
        marked += 1
    return marked


# ---- Admin attendance oversight ----

def _roster_row(s: dict, rec: Optional[dict], now: datetime) -> dict:
    """One attendance-roster row: derive status/hours from the day's record."""
    status, hours = "absent", 0.0
    if rec and rec.get("check_in_at"):
        if rec.get("check_out_at"):
            status = "completed"
            hours = float(rec.get("hours_worked") or 0)
        else:
            status = "on_shift"
            try:
                hours = round((now - datetime.fromisoformat(rec["check_in_at"])).total_seconds() / 3600, 2)
            except Exception:
                hours = 0.0
    r = rec or {}
    return {
        "staff_id": s["id"],
        "name": s.get("name"),
        "role": s.get("role"),
        "image_url": s.get("image_url"),
        "phone": s.get("phone"),
        "has_login": bool(s.get("user_id")),
        "status": status,
        "check_in_at": r.get("check_in_at"),
        "check_out_at": r.get("check_out_at"),
        "hours": hours,
        "late_minutes": r.get("late_minutes") or 0,
        "late_penalty": r.get("late_penalty") or 0,
        "late_penalty_waived": r.get("late_penalty_waived") or 0,
        "record_id": r.get("id"),
        "branch": s.get("branch") or "",
        "overtime_hours": r.get("overtime_hours") or 0,
        "overtime_pay": r.get("overtime_pay") or 0,
        "auto_checked_out": bool(r.get("auto_checked_out")),
        "half_day": bool(r.get("half_day")),
        "half_day_deduction": r.get("half_day_deduction") or 0,
        "no_show": bool(r.get("no_show")),
        "check_in_method": r.get("check_in_method") or "",
        "check_out_method": r.get("check_out_method") or "",
        "marked_by": r.get("marked_by") or "",
        "week_off_override": bool(r.get("week_off_override")),
    }


@router.get("/attendance/today")
async def attendance_today(date: Optional[str] = None,
                           branch: Optional[str] = None,
                           user=Depends(require_admin),
                           t=Depends(current_tenant)):
    """
    Roster for a given day (defaults to today).
    Returns EVERY active staff member with their current check-in/out state,
    so admin can see at a glance who is on-shift, who's finished, and who
    hasn't checked in yet.
    """
    day = (date or datetime.now(timezone.utc).date().isoformat()).strip()
    branch = branch_lock(user, branch)
    try:
        datetime.strptime(day, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "date must be YYYY-MM-DD")
    await _auto_close_stale_attendance()

    staff_q = {"active": True}
    if branch:
        if branch == "__main__":
            # Main salon = staff NOT assigned to a configured branch (incl. legacy tags).
            names = [b.get("name") for b in (t.get("branches") or []) if b.get("name")]
            if names:
                staff_q["branch"] = {"$nin": names}
        else:
            staff_q["branch"] = {"$regex": f"^\\s*{re.escape(branch.strip())}\\s*$", "$options": "i"}
    staff_list = await db.staff.find(
        staff_q,
        {"_id": 0, "id": 1, "name": 1, "role": 1, "image_url": 1, "user_id": 1, "phone": 1,
         "branch": 1, "week_off_day": 1},
    ).sort("name", 1).to_list(500)
    att = await db.attendance.find({"date": day}, {"_id": 0}).to_list(500)
    att_by_sid = {a["staff_id"]: a for a in att}
    leaves = await db.leave_requests.find(
        {"status": "approved", "from_date": {"$lte": day}, "to_date": {"$gte": day}},
        {"_id": 0, "staff_id": 1}).to_list(300)
    on_leave_ids = {lv["staff_id"] for lv in leaves}

    roster = []
    now = datetime.now(timezone.utc)
    day_weekday = datetime.strptime(day, "%Y-%m-%d").strftime("%A").lower()
    for s in staff_list:
        row = _roster_row(s, att_by_sid.get(s["id"]), now)
        if row["status"] == "absent":
            if s["id"] in on_leave_ids:
                row["status"] = "on_leave"
            elif (s.get("week_off_day") or "").lower() == day_weekday:
                row["status"] = "week_off"
        if not row.get("branch"):
            row["branch"] = (t.get("name") or "").strip()  # new hires without a branch belong to the main salon
        roster.append(row)

    return {
        "date": day,
        "total_staff": len(staff_list),
        "on_shift": sum(1 for r in roster if r["status"] == "on_shift"),
        "completed": sum(1 for r in roster if r["status"] == "completed"),
        "absent": sum(1 for r in roster if r["status"] == "absent"),
        "on_leave": sum(1 for r in roster if r["status"] == "on_leave"),
        "week_off": sum(1 for r in roster if r["status"] == "week_off"),
        "roster": roster,
    }


@router.get("/attendance/staff/{sid}")
async def attendance_by_staff(sid: str, month: Optional[str] = None,
                              _=Depends(require_admin)):
    """Admin view: attendance history for a single staff member for a month."""
    from calendar import monthrange
    now = datetime.now(timezone.utc)
    if month:
        try:
            y, m = map(int, month.split("-"))
        except Exception:
            raise HTTPException(400, "month must be YYYY-MM")
    else:
        y, m = now.year, now.month
    start = f"{y:04d}-{m:02d}-01"
    end = f"{y:04d}-{m:02d}-{monthrange(y, m)[1]:02d}"
    staff = await db.staff.find_one({"id": sid}, {"_id": 0})
    if not staff:
        raise HTTPException(404, "Staff not found")
    recs = await db.attendance.find(
        {"staff_id": sid, "date": {"$gte": start, "$lte": end}},
        {"_id": 0},
    ).sort("date", -1).to_list(200)
    return {
        "staff": {"id": staff["id"], "name": staff.get("name"), "role": staff.get("role"),
                  "image_url": staff.get("image_url"), "phone": staff.get("phone")},
        "month": f"{y:04d}-{m:02d}",
        "records": recs,
        "days_present": sum(1 for r in recs if r.get("check_in_at")),
        "total_hours": round(sum(float(r.get("hours_worked") or 0) for r in recs), 2),
    }


def _staff_invoice_earnings(invs: list, staff_id: str) -> dict:
    """Earnings attributable to one staff member, split by item type."""
    out = {"gross": 0.0, "service_gross": 0.0, "service_count": 0, "product_gross": 0.0, "product_count": 0}
    for inv in invs:
        inv_staff = inv.get("staff_id")
        for it in inv.get("items", []):
            sid = it.get("staff_id") or inv_staff
            if sid != staff_id:
                continue
            qty = int(it.get("qty") or 1)
            line_total = qty * float(it.get("price") or 0)
            out["gross"] += line_total
            if it.get("type") == "service":
                out["service_gross"] += line_total
                out["service_count"] += qty
            elif it.get("type") == "product":
                out["product_gross"] += line_total
                out["product_count"] += qty
    return out


def _attendance_month_totals(recs: list) -> dict:
    return {
        "days_present": sum(1 for r in recs if r.get("check_in_at")),
        "total_hours": round(sum(float(r.get("hours_worked") or 0) for r in recs), 2),
        "overtime_hours_total": round(sum(float(r.get("overtime_hours") or 0) for r in recs), 2),
        "overtime_total": round(sum(float(r.get("overtime_pay") or 0) for r in recs), 2),
        "late_penalty_total": round(sum(float(r.get("late_penalty") or 0) for r in recs), 2),
        "late_days": sum(1 for r in recs if (r.get("late_penalty") or 0) > 0),
        "half_days": sum(1 for r in recs if r.get("half_day")),
        "half_day_deduction_total": round(sum(float(r.get("half_day_deduction") or 0) for r in recs), 2),
    }


async def _compute_salary_for_month(staff: dict, year: int, month: int, tenant: dict) -> dict:
    """Base + commission from services performed in this calendar month."""
    from calendar import monthrange
    end_day = monthrange(year, month)[1]
    start = f"{year:04d}-{month:02d}-01T00:00:00Z"
    end = f"{year:04d}-{month:02d}-{end_day:02d}T23:59:59Z"
    invs = await db.invoices.find(
        {"created_at": {"$gte": start, "$lte": end}},
        {"_id": 0},
    ).to_list(5000)
    pct = float(staff.get("commission_pct") or 0)
    earn = _staff_invoice_earnings(invs, staff["id"])
    gross, service_gross, service_count = earn["gross"], earn["service_gross"], earn["service_count"]
    commission = round(service_gross * pct / 100, 2)
    # Product sales commission (default 2% of product price; tenant can override)
    product_pct = float(tenant.get("product_commission_pct") or PRODUCT_COMMISSION_PCT)
    product_commission = round(earn["product_gross"] * product_pct / 100, 2)
    # Monthly target bonus: if staff's FULL business crosses the admin-set target,
    # the target % applies on the entire business amount (owner's chosen scheme).
    monthly_target = float(staff.get("monthly_target") or 0)
    target_pct = float(staff.get("target_commission_pct") or 0)
    target_achieved = monthly_target > 0 and gross >= monthly_target
    target_bonus = round(gross * target_pct / 100, 2) if (target_achieved and target_pct > 0) else 0.0
    # Owner's scheme: when a monthly target is set, service commission is paid
    # ONLY if the staff reached that target for the month.
    commission_withheld = monthly_target > 0 and not target_achieved
    if commission_withheld:
        commission = 0.0
    # Attendance
    att_start = f"{year:04d}-{month:02d}-01"
    att_end = f"{year:04d}-{month:02d}-{end_day:02d}"
    recs = await db.attendance.find(
        {"staff_id": staff["id"], "date": {"$gte": att_start, "$lte": att_end}},
        {"_id": 0},
    ).to_list(200)
    att = _attendance_month_totals(recs)
    adv_rows = await db.advances.find(
        {"staff_id": staff["id"], "month": f"{year:04d}-{month:02d}"}, {"_id": 0}).to_list(5)
    advance_total = round(sum(float(a.get("amount") or 0) for a in adv_rows), 2)
    rb_rows = await _raw_db.review_bonuses.find(
        {"tenant_id": tenant["id"], "staff_id": staff["id"], "month": f"{year:04d}-{month:02d}"},
        {"_id": 0, "amount": 1}).to_list(500)
    review_bonus_total = round(sum(float(r.get("amount") or 0) for r in rb_rows), 2)
    base = float(staff.get("monthly_base_salary") or 0)
    deductions_total = round(att["late_penalty_total"] + advance_total + att["half_day_deduction_total"], 2)
    total = round(base + commission + product_commission + target_bonus + review_bonus_total
                  + att["overtime_total"] - deductions_total, 2)
    return {
        "period": f"{year:04d}-{month:02d}",
        "period_label": datetime(year, month, 1).strftime("%B %Y"),
        "staff": {
            "id": staff["id"], "name": staff.get("name"), "role": staff.get("role"),
            "email": staff.get("email"), "phone": staff.get("phone"),
            "joining_date": staff.get("joining_date"),
        },
        "salon": {
            "name": tenant.get("name"), "location": tenant.get("location"),
            "phone": tenant.get("phone"), "logo_url": tenant.get("logo_url"),
        },
        "monthly_base_salary": round(base, 2),
        "commission_pct": round(pct, 2),
        "service_gross": round(service_gross, 2),
        "service_count": service_count,
        "commission_amount": commission,
        "commission_withheld": commission_withheld,
        "product_gross": round(earn["product_gross"], 2),
        "product_count": earn["product_count"],
        "product_commission_pct": round(product_pct, 2),
        "product_commission_amount": product_commission,
        "monthly_target": round(monthly_target, 2),
        "target_commission_pct": round(target_pct, 2),
        "target_achieved": target_achieved,
        "target_bonus": target_bonus,
        "review_bonus_total": review_bonus_total,
        "review_bonus_count": len(rb_rows),
        **att,
        "advance_total": advance_total,
        "deductions_total": deductions_total,
        "gross_earnings": round(gross, 2),
        "net_payable": total,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _parse_month(month: Optional[str]) -> tuple:
    now = datetime.now(timezone.utc)
    if month:
        try:
            y, m = map(int, month.split("-"))
            if not (1 <= m <= 12) or y < 2000 or y > 2100:
                raise ValueError
        except Exception:
            raise HTTPException(400, "month must be YYYY-MM")
        return y, m
    return now.year, now.month


@router.get("/staff/leaderboard")
async def staff_leaderboard(month: Optional[str] = None, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Monthly business per staff, ranked — with target achievement & auto-bonus."""
    from calendar import monthrange
    y, m = _parse_month(month)
    end_day = monthrange(y, m)[1]
    invs = await db.invoices.find(
        {"created_at": {"$gte": f"{y:04d}-{m:02d}-01T00:00:00Z", "$lte": f"{y:04d}-{m:02d}-{end_day:02d}T23:59:59Z"}},
        {"_id": 0, "items": 1, "staff_id": 1}).to_list(5000)
    rows = []
    for s in await db.staff.find({"active": {"$ne": False}}, {"_id": 0}).to_list(200):
        earn = _staff_invoice_earnings(invs, s["id"])
        target = float(s.get("monthly_target") or 0)
        pct = float(s.get("target_commission_pct") or 0)
        achieved = target > 0 and earn["gross"] >= target
        rows.append({
            "staff_id": s["id"], "name": s.get("name"), "role": s.get("role"), "image_url": s.get("image_url"),
            "business": round(earn["gross"], 2), "service_count": earn["service_count"],
            "product_count": earn["product_count"],
            "monthly_target": target, "target_commission_pct": pct,
            "achieved_pct": round(earn["gross"] / target * 100, 1) if target > 0 else None,
            "target_achieved": achieved,
            "target_bonus": round(earn["gross"] * pct / 100, 2) if (achieved and pct > 0) else 0.0,
        })
    rows.sort(key=lambda r: -r["business"])
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return {"period": f"{y:04d}-{m:02d}", "rows": rows}


async def _attendance_month_rows(y: int, m: int) -> list:
    """Per-staff month sheet: presence, half-days, lates and fines."""
    prefix = f"{y:04d}-{m:02d}"
    staff_list = await db.staff.find(
        {"active": {"$ne": False}}, {"_id": 0, "id": 1, "name": 1, "role": 1, "branch": 1}).to_list(300)
    recs = await db.attendance.find({"date": {"$regex": f"^{prefix}"}}, {"_id": 0}).to_list(4000)
    by_sid = {}
    for r in recs:
        by_sid.setdefault(r["staff_id"], []).append(r)
    rows = []
    for s in staff_list:
        rs = by_sid.get(s["id"], [])
        late_fines = round(sum(float(r.get("late_penalty") or 0) for r in rs), 2)
        half_deduct = round(sum(float(r.get("half_day_deduction") or 0) for r in rs), 2)
        rows.append({
            "staff_id": s["id"], "name": s.get("name") or "", "role": s.get("role") or "",
            "branch": s.get("branch") or "",
            "days_present": sum(1 for r in rs if r.get("check_in_at")),
            "half_days": sum(1 for r in rs if r.get("half_day")),
            "late_count": sum(1 for r in rs if (r.get("late_minutes") or 0) > 0),
            "late_minutes": sum(int(r.get("late_minutes") or 0) for r in rs),
            "late_fines": late_fines,
            "half_day_deductions": half_deduct,
            "total_fines": round(late_fines + half_deduct, 2),
        })
    rows.sort(key=lambda r: r["name"])
    return rows


@router.get("/reports/attendance-month")
async def attendance_month_report(month: Optional[str] = None, user=Depends(require_tenant_admin)):
    y, m = _parse_month(month)
    return {"period": f"{y:04d}-{m:02d}", "rows": await _attendance_month_rows(y, m)}


@router.post("/reports/attendance-month/email")
async def email_attendance_month_report(month: Optional[str] = None,
                                        user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    from email_service import _send_email, _attendance_month_html
    y, m = _parse_month(month)
    rows = await _attendance_month_rows(y, m)
    label = datetime(y, m, 1).strftime("%B %Y")
    recipients = [e for e in {t.get("salon_email") or t.get("owner_email") or user.get("email")} if e]
    if not recipients:
        raise HTTPException(400, "No owner email on file")
    status = await _send_email(
        recipients, f"🗓️ Staff attendance summary — {label} · {t.get('name', '')}",
        _attendance_month_html(t, label, rows))
    out = {"ok": bool(status.get("sent")), "recipients": recipients, "rows": len(rows)}
    if status.get("error"):
        out["error"] = status["error"]
    return out


@router.get("/staff/me/salary-slip")
async def staff_my_salary_slip(month: Optional[str] = None,
                               s=Depends(_current_staff),
                               t=Depends(current_tenant)):
    """JSON salary summary for staff to preview before download."""
    if not s.get("salary_visible", True):
        raise HTTPException(403, "Salary details are not visible on your account. Please contact your salon admin.")
    y, m = _parse_month(month)
    return await _compute_salary_for_month(s, y, m, t)


async def _tenant_logo_bytes(tenant: dict):
    """Logo bytes for PDF rendering — reads /api/files uploads straight from storage (no HTTP self-call)."""
    url = tenant.get("logo_url") or ""
    try:
        if url.startswith("/api/files/"):
            rec = await _raw_db.uploads.find_one({"id": url.rsplit("/", 1)[-1], "is_deleted": False})
            if rec:
                from routes.uploads import _get_object
                data, _ = await asyncio.to_thread(_get_object, rec["storage_path"])
                return data
    except Exception as e:  # noqa: BLE001 — slip renders fine without a logo
        logging.warning(f"salary slip logo fetch failed: {e}")
    return None


@router.get("/staff/me/salary-slip.pdf")
async def staff_my_salary_slip_pdf(month: Optional[str] = None,
                                   s=Depends(_current_staff),
                                   t=Depends(current_tenant)):
    if not s.get("salary_visible", True):
        raise HTTPException(403, "Salary details are not visible on your account.")
    y, m = _parse_month(month)
    slip = await _compute_salary_for_month(s, y, m, t)
    slip["salon"]["logo_raw"] = await _tenant_logo_bytes(t)
    pdf_bytes = _render_salary_slip_pdf(slip)
    fname = f"salary-slip-{slip['staff']['name'].replace(' ', '-').lower()}-{slip['period']}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/staff/{sid}/salary-slip.pdf")
async def staff_salary_slip_pdf_admin(sid: str, month: Optional[str] = None,
                                      admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Owner/admin downloads any staff member's monthly salary slip (commissions + fines + advances)."""
    s = await db.staff.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Staff member not found")
    y, m = _parse_month(month)
    slip = await _compute_salary_for_month(s, y, m, t)
    slip["salon"]["logo_raw"] = await _tenant_logo_bytes(t)
    pdf_bytes = _render_salary_slip_pdf(slip)
    fname = f"salary-slip-{(slip['staff']['name'] or 'staff').replace(' ', '-').lower()}-{slip['period']}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )




# ---------------- Staff resume builder ----------------
RESUME_ROLE_PROMPTS = {
    "Beauty Expert": "As a Beauty Expert, I take complete care of every client — analysing their skin tone and skin type to recommend the best-suited facials and skincare products. I specialise in facials, clean-ups, de-tan treatments, hair spa and relaxing head massages, and I always guide clients on the right home-care routine so the results last longer.",
    "Nail Expert": "As a Nail Expert, I provide professional manicure, pedicure, nail-extension and nail-art services. I maintain strict hygiene and sterilisation standards, advise clients on nail health and after-care, and keep myself updated with the latest nail trends, shapes and techniques.",
    "Hair Expert": "As a Hair Expert, I handle haircuts, styling, blow-dry, colouring and hair treatments for both men and women. I study each client's face shape and hair texture to suggest the most flattering style, and I recommend the right products and routines to keep their hair healthy after every service.",
    "Manager": "As a Salon Manager, I oversee the complete daily operations — appointments, staff coordination, billing, inventory and client relationships. I focus on customer satisfaction, resolve escalations quickly, train and mentor junior staff, and consistently drive the salon's sales and service targets.",
    "Chemical Expert": "As a Chemical Expert, I specialise in advanced chemical services such as smoothening, keratin, botox, rebonding and global colouring. I carefully assess hair condition before every treatment, follow exact product ratios and safety protocols, and deliver zero-damage results with proper after-care guidance.",
}


class ResumePastJob(BaseModel):
    salon_name: str = Field("", max_length=120)
    from_date: str = Field("", max_length=30)
    to_date: str = Field("", max_length=30)
    phone: str = Field("", max_length=20)
    address: str = Field("", max_length=300)


class ResumeIn(BaseModel):
    total_experience_years: str = Field("", max_length=10)
    name: str = Field("", max_length=100)
    email: str = Field("", max_length=120)
    phone: str = Field("", max_length=20)
    current_address: str = Field("", max_length=300)
    permanent_address: str = Field("", max_length=300)
    photo_url: str = Field("", max_length=500)
    current_salon: str = Field("", max_length=150)
    currently_working: bool = True
    salon_phone: str = Field("", max_length=20)
    salon_address: str = Field("", max_length=300)
    designations: List[str] = Field(default_factory=list, max_length=5)
    responsibilities: Dict[str, str] = Field(default_factory=dict)
    past_jobs: List[ResumePastJob] = Field(default_factory=list, max_length=10)
    achievements: str = Field("", max_length=1500)
    hobbies: str = Field("", max_length=300)
    awards: str = Field("", max_length=1500)

    @field_validator("responsibilities")
    @classmethod
    def _cap_responsibilities(cls, v):
        if len(v) > 5:
            raise ValueError("too many responsibility entries")
        return {k[:50]: (val or "")[:1500] for k, val in v.items()}


def _resume_defaults(s: dict, t: dict) -> dict:
    years = ""
    if s.get("joining_date"):
        try:
            jd = datetime.fromisoformat(str(s["joining_date"])[:10])
            years = str(max(0, round((datetime.now() - jd).days / 365, 1)))
        except Exception:
            years = ""
    return {
        "total_experience_years": years,
        "name": s.get("name") or "",
        "email": s.get("email") or "",
        "phone": s.get("phone") or "",
        "current_address": "",
        "permanent_address": "",
        "photo_url": s.get("image_url") or "",
        "current_salon": t.get("name") or "",
        "currently_working": bool(s.get("active", True)),
        "salon_phone": t.get("phone") or "",
        "salon_address": t.get("location") or "",
        "designations": [],
        "responsibilities": {},
        "past_jobs": [],
        "achievements": "",
        "hobbies": "",
        "awards": "",
    }


@router.get("/staff/me/resume")
async def staff_my_resume(s=Depends(_current_staff), t=Depends(current_tenant)):
    saved = await db.staff_resumes.find_one({"staff_id": s["id"]}, {"_id": 0})
    data = saved or _resume_defaults(s, t)
    return {**data, "role_prompts": RESUME_ROLE_PROMPTS, "saved": bool(saved)}


@router.put("/staff/me/resume")
async def staff_save_resume(body: ResumeIn, s=Depends(_current_staff)):
    doc = body.model_dump()
    doc["designations"] = [d for d in doc["designations"] if d in RESUME_ROLE_PROMPTS]
    doc.update({"staff_id": s["id"], "updated_at": datetime.now(timezone.utc).isoformat()})
    await db.staff_resumes.update_one({"staff_id": s["id"]}, {"$set": doc}, upsert=True)
    return {"ok": True}


@router.get("/staff/me/resume.pdf")
async def staff_my_resume_pdf(s=Depends(_current_staff), t=Depends(current_tenant)):
    saved = await db.staff_resumes.find_one({"staff_id": s["id"]}, {"_id": 0})
    data = saved or _resume_defaults(s, t)
    if not (data.get("photo_url") or "").strip():
        data["photo_url"] = s.get("image_url") or ""
    # Internal upload URLs (/api/files/{id}) are read straight from object storage.
    purl = (data.get("photo_url") or "").strip()
    photo_bytes = None
    if purl.startswith("/api/files/"):
        rec = await _raw_db.uploads.find_one({"id": purl.rsplit("/", 1)[-1], "is_deleted": False})
        if rec and rec.get("tenant_id") == t["id"]:
            try:
                photo_bytes, _ = _get_object(rec["storage_path"])
            except Exception:
                photo_bytes = None
    fetcher = (lambda _u: photo_bytes) if photo_bytes else _safe_fetch_image_bytes
    pdf_bytes = await asyncio.to_thread(_render_resume_pdf, data, fetcher)
    fname = f"resume-{(data.get('name') or 'staff').replace(' ', '-').lower()}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


class BankDetailsIn(BaseModel):
    bank_name: str = Field("", max_length=100)
    ifsc: str = Field("", max_length=20)
    account_holder: str = Field("", max_length=100)


@router.put("/staff/me/bank-details")
async def staff_save_bank_details(body: BankDetailsIn, s=Depends(_current_staff)):
    """Staff self-service: save bank details (visible to salon admin for payouts)."""
    await db.staff.update_one({"id": s["id"]}, {"$set": {
        "bank_details": body.model_dump(),
        "bank_details_updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    return {"ok": True}


@router.post("/staff/me/photo")
async def staff_upload_photo(file: UploadFile = File(...), s=Depends(_current_staff), t=Depends(current_tenant)):
    """Staff self-service photo upload — updates their profile picture, which is
    shown on the admin Staff page and the public booking page."""
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    if ext not in _MIME:
        raise HTTPException(400, "Only JPG, PNG, GIF or WebP images are allowed")
    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Image too large — max {_MAX_UPLOAD_BYTES // (1024*1024)}MB")
    if not data:
        raise HTTPException(400, "Empty file")
    validate_image_bytes(ext, data)
    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/tenants/{t['id']}/staff/{file_id}.{ext}"
    try:
        result = _put_object(storage_path, data, _MIME[ext])
    except requests.HTTPError as e:
        raise HTTPException(400, f"Storage upload failed: {e}") from e
    await _raw_db.uploads.insert_one({
        "id": file_id, "tenant_id": t["id"], "kind": "staff",
        "storage_path": result.get("path", storage_path),
        "original_filename": file.filename or f"{file_id}.{ext}",
        "content_type": _MIME[ext], "size": len(data),
        "uploaded_by": s["id"], "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    public_url = f"/api/files/{file_id}"
    await db.staff.update_one({"id": s["id"]}, {"$set": {"image_url": public_url}})
    return {"url": public_url}


LATE_ALERT_GRACE_MIN = 10

_PUBLIC_BASE = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")


def _abs_media(u):
    if not u:
        return None
    return u if u.startswith("http") else f"{_PUBLIC_BASE}{u}"


def _staff_avatar_html(name, image_url, size: int = 52) -> str:
    url = _abs_media(image_url)
    if url:
        return (f'<img src="{url}" width="{size}" height="{size}" alt="{html_lib.escape(name or "")}" '
                f'style="display:block;width:{size}px;height:{size}px;border-radius:50%;object-fit:cover;'
                f'border:2px solid #e8c37f" />')
    initial = html_lib.escape((name or "?").strip()[:1].upper())
    return (f'<div style="width:{size}px;height:{size}px;border-radius:50%;background:#1c1c22;color:#e8c37f;'
            f'font-family:Georgia,serif;font-size:{size // 2}px;line-height:{size}px;text-align:center;'
            f'border:2px solid #e8c37f">{initial}</div>')


def _attendance_email_shell(t: dict, inner_html: str) -> str:
    """Branded shell: salon hero banner + logo band + white body card (email-client-safe inline styles)."""
    salon = html_lib.escape(t.get("name") or "Your Salon")
    logo = _abs_media(t.get("logo_url"))
    logo_html = (f'<img src="{logo}" width="42" height="42" alt="" style="display:block;width:42px;height:42px;'
                 f'border-radius:50%;object-fit:cover;background:#fff;border:2px solid #e8c37f" />'
                 if logo else
                 f'<div style="width:42px;height:42px;border-radius:50%;background:#e8c37f;color:#1c1c22;'
                 f'font-family:Georgia,serif;font-size:20px;line-height:42px;text-align:center;font-weight:bold">'
                 f'{salon[:1]}</div>')
    return f"""
    <div style="max-width:560px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;border:1px solid #ece7db;border-radius:18px;overflow:hidden;background:#ffffff">
      <img src="{_PUBLIC_BASE}/assets/email-attendance-hero.jpg" width="560" alt=""
        style="display:block;width:100%;max-height:170px;object-fit:cover" />
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#1c1c22">
        <tr>
          <td style="padding:12px 20px;width:52px">{logo_html}</td>
          <td style="padding:12px 8px 12px 0">
            <p style="margin:0;font-family:Georgia,serif;font-size:17px;color:#e8c37f;letter-spacing:0.5px">{salon}</p>
            <p style="margin:2px 0 0;font-size:10.5px;color:#9a9aa2;letter-spacing:2px;text-transform:uppercase">Attendance · Team Update</p>
          </td>
        </tr>
      </table>
      <div style="padding:26px 26px 22px">{inner_html}</div>
    </div>"""


def _late_reminder_html(t: dict, s: dict, mins: int) -> str:
    name = html_lib.escape(s.get("name") or "")
    shift = html_lib.escape(s.get("shift_start") or "10:00")
    inner = f"""
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td style="width:64px;vertical-align:top">{_staff_avatar_html(s.get("name"), s.get("image_url"), 52)}</td>
          <td style="vertical-align:middle;padding-left:4px">
            <h2 style="margin:0;font-size:19px;color:#1c1c22">Please hurry, {name} — you're getting late ⏰</h2>
          </td>
        </tr>
      </table>
      <p style="color:#444;font-size:14px;line-height:1.65;margin:16px 0 0">
        Your shift at <b>{html_lib.escape(t.get("name") or "")}</b> started at <b>{shift}</b> and you haven't checked in yet.</p>
      <div style="margin:14px 0 0">
        <span style="display:inline-block;background:#fdeaea;color:#c0392b;border:1px solid #f5c6c6;border-radius:999px;padding:7px 16px;font-size:13px;font-weight:bold">⏱ {mins} minutes late</span>
      </div>
      <p style="color:#444;font-size:14px;line-height:1.65;margin:16px 0 0">
        Please check in from your Staff Portal the moment you arrive.</p>
      <p style="color:#999;font-size:12px;margin:18px 0 0;border-top:1px solid #f0ece2;padding-top:14px">
        Checking in on time keeps your attendance clean and avoids late fines.</p>"""
    return _attendance_email_shell(t, inner)


def _late_digest_row(name, image_url, status_html: str) -> str:
    return f"""
      <tr>
        <td style="width:56px;padding:7px 0">{_staff_avatar_html(name, image_url, 44)}</td>
        <td style="padding:7px 0 7px 6px;border-bottom:1px solid #f6f2e9">
          <p style="margin:0;font-size:14px;color:#1c1c22"><b>{html_lib.escape(name or "")}</b></p>
          <p style="margin:3px 0 0">{status_html}</p>
        </td>
      </tr>"""


def _late_digest_html(t: dict, rows_html: str, today_label: str) -> str:
    inner = f"""
      <h2 style="margin:0;font-size:19px;color:#1c1c22">Today's late arrivals</h2>
      <p style="margin:4px 0 0;color:#999;font-size:12px">{today_label}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:14px">{rows_html}</table>
      <p style="color:#999;font-size:12px;margin:18px 0 0;border-top:1px solid #f0ece2;padding-top:14px">
        Each of them already received an automatic "please hurry" email 10 minutes after their shift start.</p>"""
    return _attendance_email_shell(t, inner)



@router.get("/staff/me/deductions")
async def staff_my_deductions(month: Optional[str] = None,
                              s=Depends(_current_staff), t=Depends(current_tenant)):
    """Everything deducted this month — late fines, half-day cuts and salary advances."""
    y, m = _parse_month(month)
    start = f"{y:04d}-{m:02d}-01"
    end = f"{y + (m == 12):04d}-{(m % 12) + 1:02d}-01"
    recs = await _raw_db.attendance.find(
        {"tenant_id": t["id"], "staff_id": s["id"], "date": {"$gte": start, "$lt": end},
         "$or": [{"late_penalty": {"$gt": 0}}, {"half_day_deduction": {"$gt": 0}}]},
        {"_id": 0, "date": 1, "late_minutes": 1, "late_penalty": 1, "half_day_deduction": 1}).to_list(100)
    items = []
    for r in sorted(recs, key=lambda x: x.get("date") or ""):
        if float(r.get("late_penalty") or 0) > 0:
            items.append({"date": r.get("date"), "type": "late_fine",
                          "label": f"Late fine — {int(r.get('late_minutes') or 0)} min late",
                          "amount": float(r["late_penalty"])})
        if float(r.get("half_day_deduction") or 0) > 0:
            items.append({"date": r.get("date"), "type": "half_day",
                          "label": "Half-day deduction (no check-in past shift)",
                          "amount": float(r["half_day_deduction"])})
    advances = await _raw_db.advances.find(
        {"staff_id": s["id"], "month": f"{y:04d}-{m:02d}"},
        {"_id": 0, "amount": 1, "note": 1, "created_at": 1}).to_list(5)
    for a in advances:
        items.append({"date": str(a.get("created_at") or "")[:10], "type": "advance",
                      "label": "Salary advance" + (f" — {a['note']}" if a.get("note") else ""),
                      "amount": float(a.get("amount") or 0)})
    return {"month": f"{y:04d}-{m:02d}", "items": items,
            "total": round(sum(i["amount"] for i in items), 2)}


@router.get("/staff/me/late-status")
async def staff_late_status(s=Depends(_current_staff), t=Depends(current_tenant)):
    """Portal banner check: is this staff member late (10+ min past shift start, not checked in)?"""
    today = datetime.now(timezone.utc).date().isoformat()
    att = await db.attendance.find_one({"staff_id": s["id"], "date": today}, {"_id": 0, "check_in_at": 1})
    if att and att.get("check_in_at"):
        return {"late": False, "minutes_late": 0}
    ist = datetime.now(IST_TZ)
    h, m = _parse_hhmm(s.get("shift_start"), "10:00")
    start = ist.replace(hour=h, minute=m, second=0, microsecond=0)
    mins = int((ist - start).total_seconds() // 60)
    return {"late": LATE_ALERT_GRACE_MIN <= mins <= 600, "minutes_late": max(mins, 0),
            "shift_start": s.get("shift_start") or "10:00"}


def staff_notify_email(s: dict) -> str:
    """Real inbox for staff notifications — auto-generated @miracurl.com work IDs are
    login placeholders, not mailboxes; never email them."""
    for e in (s.get("personal_email"), s.get("email")):
        if e and not e.lower().strip().endswith("@miracurl.com"):
            return e.strip()
    return ""


async def _run_late_alerts() -> dict:
    """10 min after shift start with no check-in → email staff. After 12:00 IST → owner summary."""
    ist = datetime.now(IST_TZ)
    today = datetime.now(timezone.utc).date().isoformat()
    emails_sent = summaries = 0
    tenants = await _raw_db.tenants.find(
        {"status": {"$in": ["active", "trial"]}},
        {"_id": 0, "id": 1, "name": 1, "owner_email": 1, "salon_email": 1, "logo_url": 1}).to_list(500)
    for t in tenants:
        staff_list = await _raw_db.staff.find(
            {"tenant_id": t["id"], "status": {"$nin": ["inactive", "archived"]},
             "former": {"$ne": True}, "active": {"$ne": False}, "disabled": {"$ne": True}},
            {"_id": 0, "id": 1, "name": 1, "email": 1, "personal_email": 1, "shift_start": 1,
             "image_url": 1, "week_off_day": 1}).to_list(300)
        weekday_now = ist.strftime("%A").lower()
        for s in staff_list:
            if re.search(r"\btest\b", s.get("name") or "", re.I):
                continue  # test-run leftovers never trigger alerts or owner digests
            if (s.get("week_off_day") or "").lower() == weekday_now:
                continue  # weekly off — never flag as late
            h, m = _parse_hhmm(s.get("shift_start"), "10:00")
            mins = int((ist - ist.replace(hour=h, minute=m, second=0, microsecond=0)).total_seconds() // 60)
            if not (LATE_ALERT_GRACE_MIN <= mins <= 240):
                continue
            att = await _raw_db.attendance.find_one(
                {"staff_id": s["id"], "date": today, "check_in_at": {"$ne": None}}, {"_id": 0, "id": 1})
            if att or await _raw_db.late_alerts.find_one({"staff_id": s["id"], "date": today}):
                continue
            await _raw_db.late_alerts.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": t["id"], "staff_id": s["id"],
                "staff_name": s.get("name"), "date": today, "minutes_late": mins,
                "at": datetime.now(timezone.utc).isoformat()})
            # No email nag by policy — staff see it on their portal dashboard (late banner +
            # deductions card). Email is reserved for credentials, resets and relieving letters.
        if ist.hour >= 12:
            alerts = await _raw_db.late_alerts.find({"tenant_id": t["id"], "date": today}, {"_id": 0}).to_list(100)
            flag = await _raw_db.system_flags.find_one({"key": f"late_summary:{t['id']}"})
            if alerts and (not flag or flag.get("value") != today):
                staff_imgs = {st["id"]: st.get("image_url") for st in staff_list}
                rows = ""
                for a in alerts:
                    att = await _raw_db.attendance.find_one(
                        {"staff_id": a["staff_id"], "date": today}, {"_id": 0, "check_in_at": 1, "late_minutes": 1})
                    if att and att.get("check_in_at"):
                        status = (f'<span style="display:inline-block;background:#fef6e2;color:#a8730a;border:1px solid #f3dfae;'
                                  f'border-radius:999px;padding:3px 12px;font-size:11.5px;font-weight:bold">'
                                  f'🕐 Checked in {att.get("late_minutes", 0)} min late</span>')
                    else:
                        status = ('<span style="display:inline-block;background:#fdeaea;color:#c0392b;border:1px solid #f5c6c6;'
                                  'border-radius:999px;padding:3px 12px;font-size:11.5px;font-weight:bold">'
                                  '⚠️ Not checked in yet</span>')
                    rows += _late_digest_row(a.get("staff_name"), staff_imgs.get(a["staff_id"]), status)
                recipients = [e for e in {t.get("owner_email"), t.get("salon_email")} if e]
                if recipients:
                    try:
                        await _send_email(
                            recipients, f"🌤️ Late arrivals today at {t.get('name')}",
                            _late_digest_html(t, rows, ist.strftime("%A, %d %B %Y")),
                            book_url=f"{_PUBLIC_BASE}/attendance", book_label="View Attendance ✦")
                        summaries += 1
                    except Exception as e:
                        logging.warning(f"late summary email failed for {t.get('name')}: {e}")
                await _raw_db.system_flags.update_one(
                    {"key": f"late_summary:{t['id']}"}, {"$set": {"value": today}}, upsert=True)
    return {"late_emails": emails_sent, "owner_summaries": summaries}

