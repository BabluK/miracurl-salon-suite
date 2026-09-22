# Extracted from server.py — domain route module (auto-split refactor)
import re
import uuid
import base64
import secrets
import logging
import html as html_lib
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import (
    APIRouter, HTTPException, Depends,
)
from pydantic import BaseModel, Field, EmailStr, field_validator

from database import _raw_db, db, _clean
from security import (
    hash_pw, get_current_user, require_admin, require_tenant_admin, current_tenant,
    require_owner_pin, log_audit,
)
from email_service import (
    _send_email,
)
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


async def _annotate_today_status(rows: list) -> None:
    """today_status: on_leave (approved leave covers today) · week_off (weekly day or one-time swap) · available."""
    from services.day_window import _tenant_tz
    from database import _current_tenant_id
    tid = _current_tenant_id.get()
    t = await _raw_db.tenants.find_one({"id": tid}, {"_id": 0, "timezone": 1}) if tid else None
    today = datetime.now(_tenant_tz(t)).date()
    day, weekday = today.isoformat(), today.strftime("%A").lower()
    leaves = await db.leave_requests.find(
        {"status": "approved", "from_date": {"$lte": day}, "to_date": {"$gte": day}}, {"_id": 0, "staff_id": 1}).to_list(300)
    on_leave = {lv["staff_id"] for lv in leaves}
    for s in rows:
        if s["id"] in on_leave:
            s["today_status"] = "on_leave"
        elif s.get("week_off_swap_date") == day or (not s.get("week_off_swap_date") and (s.get("week_off_day") or "").lower() == weekday):
            s["today_status"] = "week_off"
        else:
            s["today_status"] = "available"


@router.get("/staff")
async def list_staff(user=Depends(get_current_user)):
    proj = {"_id": 0, "aadhaar_hash": 0}
    if user.get("role") not in ("admin", "super_admin"):
        proj.update(_STAFF_SENSITIVE_FIELDS)  # SEC-001: staff/manager get no pay/bank/ID data
    await auto_close_departed_staff()  # idempotent: staff past their last working day disappear immediately
    rows = await db.staff.find({"former": {"$ne": True}}, proj).to_list(500)
    await _annotate_today_status(rows)
    tid = user.get("tenant_id")
    if tid:
        # staff temporarily working at another salon still show at home with an "away" flag
        away = await _raw_db.staff.find(
            {"temp_transfer.home_tenant_id": tid, "temp_transfer.status": "active",
             "former": {"$ne": True}}, proj).to_list(50)
        for s in away:
            s["away"] = True
        rows += away
    return rows


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
async def previous_staff_list(user=Depends(require_admin)):
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
    notice_served: bool = False


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
                                user=Depends(require_admin), t=Depends(current_tenant)):
    """Owner issues a relieving/termination letter PDF (salon letterhead) to a departed
    staff member's personal email. Terminated/absconded also lowers their public registry rating."""
    from services.pdf import _render_relieving_letter_pdf, RELIEVING_TEMPLATES
    s = await db.staff.find_one({"id": sid, "former": True}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Previous staff entry not found")
    notice_days = int(float(s.get("notice_period_days") or 0))
    if body.letter_type in ("excellent", "standard") and notice_days > 0 and not body.notice_served:
        raise HTTPException(400, f"{s.get('name')} had a {notice_days}-day notice period. A relieving letter can "
                                 "only be issued after the notice period is fully served — tick 'Notice period "
                                 "served' to confirm, or issue a termination letter instead.")
    from_date = (s.get("joined_date") or s.get("created_at") or "")[:10]
    to_date = s.get("left_on") or s.get("last_working_day") or datetime.now(timezone.utc).date().isoformat()
    pdf = _render_relieving_letter_pdf(t, s, body.letter_type, from_date, to_date, body.reason)
    title = RELIEVING_TEMPLATES[body.letter_type][0]
    from routes.staff_portal import staff_notify_email
    to = body.email_to or staff_notify_email(s)
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
async def previous_staff_delete(sid: str, user=Depends(require_admin)):
    """Remove an entry from the Previous Staff list (registry history stays intact)."""
    res = await db.staff.update_one({"id": sid, "former": True}, {"$set": {"former_hidden": True}})
    if not res.matched_count:
        raise HTTPException(404, "Previous staff entry not found")
    return {"ok": True}


@router.post("/staff/previous/{sid}/rehire")
async def previous_staff_rehire(sid: str, user=Depends(require_admin), t=Depends(current_tenant)):
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
    if not d.get("joining_date"):
        d.pop("joining_date", None)
    if d.get("serving_notice"):
        today = datetime.now(timezone(timedelta(hours=5, minutes=30))).date()
        start = d.get("notice_start_date") or today.isoformat()
        if start < today.isoformat():
            raise HTTPException(400, "Resignation date can't be in the past — pick today or a future date")
        d["notice_start_date"] = start
        if not d.get("last_working_day"):
            y, m, dd = map(int, start.split("-"))
            d["last_working_day"] = (datetime(y, m, dd) + timedelta(days=int(d.get("notice_period_days") or 30))).date().isoformat()
        if d["last_working_day"] < start:
            raise HTTPException(400, "Last working day must be on or after the resignation date")
    else:
        d["notice_start_date"] = None
    aad = re.sub(r"\D", "", d.pop("aadhaar", None) or "")
    if aad:
        if len(aad) != 12:
            raise HTTPException(400, "Aadhaar must be exactly 12 digits")
        d["aadhaar_last4"] = aad[-4:]
        d["aadhaar_hash"] = _aadhaar_fp(aad)
    return d


@router.post("/staff")
async def create_staff(body: StaffIn, user=Depends(require_admin), _pin=Depends(require_owner_pin)):
    s = Staff(**_staff_write_payload(body)).model_dump()
    await db.staff.insert_one(s)
    return _clean({k: v for k, v in s.items() if k != "aadhaar_hash"})

@router.put("/staff/{sid}")
async def update_staff(sid: str, body: StaffIn, user=Depends(require_admin), _pin=Depends(require_owner_pin)):
    await db.staff.update_one({"id": sid}, {"$set": _staff_write_payload(body)})
    return await db.staff.find_one({"id": sid}, {"_id": 0, "aadhaar_hash": 0})

@router.delete("/staff/{sid}")
async def delete_staff(sid: str, user=Depends(require_admin), _pin=Depends(require_owner_pin)):
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
async def give_advance(sid: str, body: AdvanceIn, admin=Depends(require_admin), _pin=Depends(require_owner_pin)):
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
async def list_advances(sid: str, admin=Depends(require_admin)):
    rows = await db.advances.find({"staff_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(24)
    return rows


@router.delete("/staff/{sid}/advance/{aid}")
async def delete_advance(sid: str, aid: str, admin=Depends(require_admin), _pin=Depends(require_owner_pin)):
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
    mode: str = Field("permanent", pattern="^(permanent|temporary)$")
    from_date: Optional[str] = None  # YYYY-MM-DD (temporary only)
    to_date: Optional[str] = None
    notify_channel: str = Field("app", pattern="^(app|email|sms)$")


def _move_staff_to(sid: str, s: dict, target_tid: str):
    """Coroutine pair: move staff doc + linked login to the target tenant."""
    ops = [_raw_db.staff.update_one({"id": sid}, {"$set": {"tenant_id": target_tid, "branch": ""}})]
    if s.get("user_id"):
        ops.append(_raw_db.users.update_one({"id": s["user_id"]}, {"$set": {"tenant_id": target_tid}}))
    return ops


@router.post("/staff/{sid}/transfer")
async def transfer_staff(sid: str, body: StaffTransferIn,
                         admin=Depends(require_admin), t=Depends(current_tenant)):
    """Move a staff member (profile + portal login) to another salon the SAME owner controls.
    Permanent: full move, history stays with the old branch.
    Temporary: works at the target salon between from_date and to_date (IST),
    then AUTOMATICALLY returns home — shown at home with an 'away' badge meanwhile."""
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
    now_iso = datetime.now(timezone.utc).isoformat()

    if body.mode == "temporary":
        if s.get("temp_transfer"):
            raise HTTPException(400, f"{s['name']} already has a temporary transfer — cancel it first")
        fd, td = (body.from_date or "").strip(), (body.to_date or "").strip()
        try:
            datetime.fromisoformat(fd)
            datetime.fromisoformat(td)
        except ValueError:
            raise HTTPException(400, "Pick valid From and To dates for a temporary transfer")
        today = datetime.now(IST_TZ).date().isoformat()
        if td < fd:
            raise HTTPException(400, "End date must be on or after the start date")
        if td < today:
            raise HTTPException(400, "End date is already in the past")
        tt = {"status": "scheduled", "home_tenant_id": t["id"], "home_name": t.get("name") or t.get("slug"),
              "home_branch": s.get("branch") or "", "target_tenant_id": target_tid,
              "target_name": target["name"], "from_date": fd, "to_date": td,
              "notify_channel": body.notify_channel,
              "created_by": admin.get("email"), "created_at": now_iso}
        starts_now = fd <= today
        if starts_now:
            tt["status"] = "active"
            for op in _move_staff_to(sid, s, target_tid):
                await op
        await _raw_db.staff.update_one({"id": sid}, {"$set": {"temp_transfer": tt}})
        try:
            await _notify_temp_transfer(s, tt, "start")
        except Exception as e:  # noqa: BLE001 — notifications must never block the transfer
            logging.error(f"temp transfer notify failed: {e}")
        return {"ok": True, "staff": s["name"], "transferred_to": target, "mode": "temporary",
                "active_now": starts_now, "from_date": fd, "to_date": td,
                "login_moved": bool(s.get("user_id")) and starts_now}

    for op in _move_staff_to(sid, s, target_tid):
        await op
    await _raw_db.staff.update_one(
        {"id": sid},
        {"$set": {"transferred_from": t["id"], "transferred_at": now_iso},
         "$unset": {"temp_transfer": ""}})
    return {"ok": True, "staff": s["name"], "transferred_to": target, "mode": "permanent",
            "login_moved": bool(s.get("user_id"))}


async def _staff_billed_at(tenant_id: str, staff_id: str, fd: str, td: str) -> tuple:
    """Sum of non-voided bills by this staff at a salon between two dates (ISO strings)."""
    if not (tenant_id and staff_id and fd and td):
        return 0, 0
    agg = await _raw_db.invoices.aggregate([
        {"$match": {"tenant_id": tenant_id, "staff_id": staff_id, "status": {"$ne": "voided"},
                    "created_at": {"$gte": fd, "$lte": td + "~"}}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}}]).to_list(1)
    return round((agg[0]["total"] if agg else 0) or 0, 2), (agg[0]["count"] if agg else 0) or 0


@router.get("/staff/temp-transfers/log")
async def temp_transfer_log(admin=Depends(require_admin), t=Depends(current_tenant)):
    """Admin-only: who worked at which salon temporarily + business they billed there."""
    rows = []
    cur = await _raw_db.staff.find(
        {"$or": [{"temp_transfer.home_tenant_id": t["id"]},
                 {"tenant_id": t["id"], "temp_transfer": {"$exists": True}}]},
        {"_id": 0, "id": 1, "name": 1, "temp_transfer": 1}).to_list(50)
    for s in cur:
        tt = s["temp_transfer"]
        billed, bills = await _staff_billed_at(tt.get("target_tenant_id"), s["id"],
                                               tt.get("from_date"), tt.get("to_date"))
        rows.append({"staff_name": s["name"], "target_name": tt.get("target_name"),
                     "home_name": tt.get("home_name"), "from_date": tt.get("from_date"),
                     "to_date": tt.get("to_date"), "status": tt.get("status"),
                     "billed": billed, "bills": bills})
    hist = await _raw_db.staff_transfer_log.find(
        {"kind": "temp_return", "home_tenant_id": t["id"]},
        {"_id": 0}).sort("returned_at", -1).to_list(30)
    for h in hist:
        rows.append({"staff_name": h.get("staff_name"), "target_name": h.get("target_name"),
                     "home_name": h.get("home_name"), "from_date": h.get("from_date"),
                     "to_date": h.get("to_date"), "status": "returned",
                     "billed": h.get("billed", 0), "bills": h.get("bills", 0)})
    return {"rows": rows}


async def _notify_temp_transfer(s: dict, tt: dict, phase: str) -> None:
    """Notify the staff member + managers/admins of BOTH branches when a temporary
    move starts or ends. Always drops a one-time in-app notice; the admin's chosen
    channel adds email or SMS on top."""
    from email_service import _send_email
    from sms_service import send_tenant_sms
    channel = tt.get("notify_channel") or "app"
    start = phase == "start"
    when = tt.get("from_date") if tt.get("from_date") == tt.get("to_date") \
        else f"{tt.get('from_date')} to {tt.get('to_date')}"
    if start:
        title = "Temporary duty assigned ✦"
        staff_msg = (f"You'll be working at {tt['target_name']} ({when}). Check in there during these dates — "
                     f"you'll be moved back to {tt['home_name']} automatically after {tt['to_date']}.")
        mgr_msg = (f"{s['name']} is on temporary duty at {tt['target_name']} ({when}). "
                   f"Home salon: {tt['home_name']}. They return automatically after {tt['to_date']}.")
    else:
        title = "Temporary duty ended ✦"
        staff_msg = f"Welcome back! Your temporary duty at {tt['target_name']} has ended — you're back at {tt['home_name']}."
        mgr_msg = f"{s['name']}'s temporary duty at {tt['target_name']} has ended — their profile is back at {tt['home_name']}."
    now = datetime.now(timezone.utc).isoformat()
    mgrs = await _raw_db.users.find(
        {"tenant_id": {"$in": [tt.get("home_tenant_id"), tt.get("target_tenant_id")]},
         "role": {"$in": ["manager", "admin"]}, "disabled": {"$ne": True}},
        {"_id": 0, "id": 1, "email": 1}).to_list(50)
    notices = []
    if s.get("user_id"):
        notices.append({"id": str(uuid.uuid4()), "user_id": s["user_id"], "title": title,
                        "message": staff_msg, "kind": "temp_transfer", "seen": False, "created_at": now})
    for m in mgrs:
        if m["id"] == s.get("user_id"):
            continue
        notices.append({"id": str(uuid.uuid4()), "user_id": m["id"], "title": title,
                        "message": mgr_msg, "kind": "temp_transfer", "seen": False, "created_at": now})
    if notices:
        await _raw_db.user_notices.insert_many(notices)
    if channel == "app":
        return
    def _html(msg: str) -> str:
        return (f"<div style='font-family:Georgia,serif;max-width:520px;margin:0 auto;color:#333'>"
                f"<h3 style='color:#1c1c22'>{html_lib.escape(title)}</h3><p>{html_lib.escape(msg)}</p>"
                f"<p style='font-size:12px;color:#999'>— Miracurl Suite</p></div>")
    mgr_emails = sorted({m["email"] for m in mgrs if m.get("email") and m["id"] != s.get("user_id")})
    if mgr_emails:
        await _send_email(mgr_emails, f"{title.rstrip(' ✦')}: {s['name']} — {tt['target_name']}", _html(mgr_msg))
    from routes.staff_portal import staff_notify_email
    staff_email = staff_notify_email(s)
    if channel == "email" and staff_email:
        await _send_email([staff_email], f"{title.rstrip(' ✦')} — {tt['target_name']}", _html(staff_msg))
    elif channel == "sms" and s.get("phone"):
        await send_tenant_sms(tt.get("home_tenant_id"), s["phone"],
                              f"Miracurl: {staff_msg}", kind="staff_transfer")


@router.get("/notices/unseen")
async def unseen_notices(user=Depends(get_current_user)):
    """One-time login notices for the current user (temp transfers etc.)."""
    rows = await _raw_db.user_notices.find(
        {"user_id": user["id"], "seen": False}, {"_id": 0}).sort("created_at", -1).to_list(10)
    return {"items": rows}


@router.post("/notices/mark-seen")
async def mark_notices_seen(user=Depends(get_current_user)):
    await _raw_db.user_notices.update_many(
        {"user_id": user["id"], "seen": False},
        {"$set": {"seen": True, "seen_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True}


async def _return_temp_staff(s: dict) -> None:
    tt = s.get("temp_transfer") or {}
    billed, bills = await _staff_billed_at(tt.get("target_tenant_id"), s["id"],
                                           tt.get("from_date"), tt.get("to_date"))
    await _raw_db.staff.update_one(
        {"id": s["id"]},
        {"$set": {"tenant_id": tt.get("home_tenant_id"), "branch": tt.get("home_branch") or ""},
         "$unset": {"temp_transfer": ""}})
    if s.get("user_id"):
        await _raw_db.users.update_one({"id": s["user_id"]}, {"$set": {"tenant_id": tt.get("home_tenant_id")}})
    await _raw_db.staff_transfer_log.insert_one({
        "id": str(uuid.uuid4()), "staff_id": s["id"], "staff_name": s.get("name"),
        "kind": "temp_return", "billed": billed, "bills": bills,
        **{k: tt.get(k) for k in ("home_tenant_id", "home_name", "target_tenant_id",
                                  "target_name", "from_date", "to_date")},
        "returned_at": datetime.now(timezone.utc).isoformat()})
    try:
        await _notify_temp_transfer(s, tt, "end")
    except Exception as e:  # noqa: BLE001
        logging.error(f"temp transfer end-notify failed: {e}")


async def run_temp_transfer_sweep() -> dict:
    """Activate temp transfers whose start date arrived; auto-return staff whose end date passed (IST)."""
    today = datetime.now(IST_TZ).date().isoformat()
    activated = returned = 0
    async for s in _raw_db.staff.find(
            {"temp_transfer.status": "scheduled", "temp_transfer.from_date": {"$lte": today},
             "former": {"$ne": True}}, {"_id": 0}):
        tt = s["temp_transfer"]
        for op in _move_staff_to(s["id"], s, tt["target_tenant_id"]):
            await op
        await _raw_db.staff.update_one({"id": s["id"]}, {"$set": {"temp_transfer.status": "active"}})
        activated += 1
    async for s in _raw_db.staff.find(
            {"temp_transfer.status": "active", "temp_transfer.to_date": {"$lt": today}}, {"_id": 0}):
        await _return_temp_staff(s)
        returned += 1
    return {"activated": activated, "returned": returned}


@router.post("/staff/{sid}/temp-transfer/cancel")
async def cancel_temp_transfer(sid: str, admin=Depends(require_admin), t=Depends(current_tenant)):
    """Cancel a scheduled temp transfer, or bring the staff back home right now."""
    s = await _raw_db.staff.find_one({"id": sid, "temp_transfer": {"$exists": True}}, {"_id": 0})
    if not s:
        raise HTTPException(404, "No temporary transfer found for this staff")
    tt = s["temp_transfer"]
    owned = set(admin.get("tenant_ids") or [])
    if admin.get("tenant_id"):
        owned.add(admin["tenant_id"])
    if admin.get("role") != "super_admin" and tt.get("home_tenant_id") not in owned and s.get("tenant_id") not in owned:
        raise HTTPException(403, "This staff isn't linked to your salons")
    if tt.get("status") == "active":
        await _return_temp_staff(s)
    else:
        await _raw_db.staff.update_one({"id": sid}, {"$unset": {"temp_transfer": ""}})
    return {"ok": True, "staff": s.get("name"), "returned_to": tt.get("home_name") or "home salon"}


@router.post("/staff/{sid}/create-login")
async def create_staff_login(
    sid: str, body: StaffLoginCreateIn,
    admin=Depends(require_admin), t=Depends(current_tenant),
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
    mail = await _send_staff_welcome(s.get("name"), t.get("name"), email, temp_pw,
                                     personal_email=s.get("personal_email") or "")
    return {
        "ok": True,
        "email": email,
        "temp_password": temp_pw,
        "must_change_password": True,
        "welcome_email_sent": mail.get("sent", False),
        "welcome_email_error": mail.get("error"),
    }


async def _send_staff_welcome(staff_name: str, salon_name: str, email: str, temp_pw: str,
                              role_label: str = "staff", personal_email: str = "") -> dict:
    """One-time credentials go to the staff's PERSONAL inbox — @miracurl.com login IDs
    are system-generated and not real mailboxes (never email them)."""
    from email_service import staff_welcome_email_html
    to = ""
    for cand in (personal_email, email):
        if cand and not cand.lower().strip().endswith("@miracurl.com"):
            to = cand.strip()
            break
    if not to:
        return {"sent": False, "error": "No personal email on file — share the credentials shown on screen, "
                                        "or add a personal email to the staff profile first."}
    try:
        return await _send_email(
            [to], f"Your {salon_name or 'Miracurl'} {role_label} login is ready ✦",
            staff_welcome_email_html(staff_name, salon_name, email, temp_pw, role_label))
    except Exception as e:  # noqa: BLE001 — credentials shown in-app either way
        logging.warning(f"staff welcome email failed: {e}")
        return {"sent": False, "error": str(e)[:200]}


@router.post("/staff/{sid}/reset-login")
async def reset_staff_login(sid: str, admin=Depends(require_admin), t=Depends(current_tenant)):
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
    mail = await _send_staff_welcome(s.get("name"), t.get("name"), login_user["email"], temp_pw,
                                     personal_email=s.get("personal_email") or "")
    return {"ok": True, "email": login_user["email"], "temp_password": temp_pw, "must_change_password": True,
            "welcome_email_sent": mail.get("sent", False), "welcome_email_error": mail.get("error")}


# ---------------- Manager accounts (restricted-access role) ----------------
class ManagerCreateIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    email: str
    password: Optional[str] = Field(None, min_length=8, max_length=128)  # owner-chosen; blank = random temp password emailed
    role: str = "Manager"
    phone: str = ""
    branch: str = Field("", max_length=120)
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

def _owner_tenant_ids(admin: dict, t: dict) -> set[str]:
    ids = set(admin.get("tenant_ids") or [])
    ids.add(t["id"])
    if admin.get("tenant_id"):
        ids.add(admin["tenant_id"])
    return ids


@router.get("/managers")
async def list_managers(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    rows = await _raw_db.users.find(
        {"$or": [{"tenant_id": t["id"]}, {"tenant_ids": t["id"]}], "role": "manager"},
        {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(100)
    now = datetime.now(timezone.utc).isoformat()
    for r in rows:
        r["salon_count"] = len(set(r.get("tenant_ids") or []) | ({r["tenant_id"]} if r.get("tenant_id") else set()))
        r["locked"] = bool(await _raw_db.login_attempts.find_one(
            {"identifier": {"$regex": f"{re.escape(r['email'])}$"}, "locked_until": {"$gt": now}}, {"_id": 1}))
        if not await db.staff.find_one({"user_id": r["id"]}, {"_id": 1}):  # managers must be visible in Staff of every business they cover
            await db.staff.insert_one(Staff(name=r.get("name") or "Manager", role="Manager", phone=r.get("phone") or "", email=r["email"],
                                            user_id=r["id"]).model_dump() | {"branch": "" if (r.get("branch") or "") == "__main__" else (r.get("branch") or "")})
    return rows


def _manager_staff_doc(body: ManagerCreateIn, user_id: str, name: str) -> dict:
    doc = Staff(
        name=name, role=body.role or "Manager", phone=body.phone,
        email=body.email, specialties=body.specialties, commission_pct=body.commission_pct,
        monthly_base_salary=body.monthly_base_salary, salary_visible=body.salary_visible,
        user_id=user_id,
    ).model_dump()
    doc["branch"] = "" if body.branch.strip() == "__main__" else body.branch.strip()
    return doc


async def _ensure_manager_staff_profile(body: ManagerCreateIn, user: dict) -> bool:
    """Managers must show up in Staff → create the profile here if this business doesn't have one yet."""
    if await db.staff.find_one({"user_id": user["id"]}, {"_id": 1}):
        return False
    await db.staff.insert_one(_manager_staff_doc(body, user["id"], body.name.strip() or user.get("name") or "Manager"))
    return True


async def _adopt_existing_login(existing: dict, body: ManagerCreateIn, t: dict, admin: dict) -> dict:
    """Email already has a login inside the owner's group → make it THE group manager instead of failing.
    Manager elsewhere → link here. Non-owner admin login (e.g. a leftover seed login) → convert to manager."""
    group = _owner_tenant_ids(admin, t)
    in_group = existing.get("tenant_id") in group or bool(set(existing.get("tenant_ids") or []) & group)
    is_owner = bool(await _raw_db.tenants.find_one({"owner_email": existing["email"]}, {"_id": 1}))
    if existing.get("role") not in ("manager", "admin") or not in_group or is_owner:
        raise HTTPException(400, "Email already registered")
    ids = sorted(set(existing.get("tenant_ids") or []) | {existing.get("tenant_id")} | group - {None})
    sets = {"role": "manager", "tenant_ids": ids, "branch": body.branch.strip(), "name": body.name.strip() or existing.get("name")}
    await _raw_db.users.update_one({"id": existing["id"]}, {"$set": sets, "$unset": {"staff_id": ""}})
    created = await _ensure_manager_staff_profile(body, existing)
    mode = "converted" if existing.get("role") == "admin" else "linked"
    await log_audit(t["id"], admin, "manager_link", f"Manager {existing['email']} {mode} — one login for {len(ids)} businesses")
    u = await _raw_db.users.find_one({"id": existing["id"]}, {"_id": 0, "password_hash": 0})
    return {**u, "ok": True, mode: True, "salon_count": len(ids), "staff_profile_created": created,
            "note": "Existing login kept its password" + (" — it was an owner-level login and is now a manager" if mode == "converted" else "")}


@router.post("/managers")
async def create_manager(body: ManagerCreateIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    existing = await _raw_db.users.find_one({"email": body.email}, {"_id": 0, "password_hash": 0})
    if existing:
        return await _adopt_existing_login(existing, body, t, admin)
    temp_pw = body.password or _generate_temp_password()
    # One manager profile for the whole group: a manager created here also covers every other
    # business on the owner's login (GPS picker chooses the place at sign-in) — no re-creating per branch.
    new_user = {
        "id": str(uuid.uuid4()), "email": body.email, "name": body.name.strip(),
        "role": "manager", "tenant_id": t["id"], "tenant_ids": sorted(_owner_tenant_ids(admin, t)),
        "status": "active", "disabled": False,
        "branch": body.branch.strip(),
        "password_hash": hash_pw(temp_pw), "must_change_password": not body.password,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _raw_db.users.insert_one(new_user)
    # A manager is also a team member: create a linked staff profile so they appear
    # in Staff/booking and get salary slips (all details captured up-front, like staff).
    await db.staff.insert_one(_manager_staff_doc(body, new_user["id"], new_user["name"]))
    mail = await _send_staff_welcome(new_user["name"], t.get("name"), body.email, temp_pw, "manager")
    return {"ok": True, "id": new_user["id"], "email": body.email, "name": new_user["name"],
            "temp_password": temp_pw, "must_change_password": not body.password,
            "welcome_email_sent": mail.get("sent", False), "welcome_email_error": mail.get("error")}

class ManagerBranchIn(BaseModel):
    branch: str = Field("", max_length=120)


@router.patch("/managers/{uid}/branch")
async def set_manager_branch(uid: str, body: ManagerBranchIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Lock (or unlock with empty) a manager login to one branch."""
    branch = body.branch.strip()
    if branch and branch != "__main__" and branch not in [b.get("name") for b in (t.get("branches") or [])]:
        raise HTTPException(400, "Unknown branch")
    res = await _raw_db.users.update_one(
        {"id": uid, "tenant_id": t["id"], "role": "manager"}, {"$set": {"branch": branch}})
    if res.matched_count == 0:
        raise HTTPException(404, "Manager not found")
    await db.staff.update_one({"user_id": uid}, {"$set": {"branch": "" if branch == "__main__" else branch}})
    return {"ok": True, "branch": branch}


class PromoteIn(BaseModel):
    email: Optional[EmailStr] = None
    branch: str = Field("", max_length=120)


@router.post("/staff/{sid}/promote")
async def promote_staff(sid: str, body: PromoteIn, admin=Depends(require_tenant_admin),
                        _pin=Depends(require_owner_pin), t=Depends(current_tenant)):
    """Promote an existing staff member to Manager — upgrades their portal login,
    or creates a fresh manager login if they never had one. Keeps all staff history."""
    s = await db.staff.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Staff member not found")
    branch = body.branch.strip()
    if branch and branch != "__main__" and branch not in [b.get("name") for b in (t.get("branches") or [])]:
        raise HTTPException(400, "Unknown branch")
    if s.get("user_id"):
        u = await _raw_db.users.find_one({"id": s["user_id"], "tenant_id": t["id"]}, {"_id": 0})
        if not u:
            raise HTTPException(400, "Linked login not found — use 'Give login' first")
        if u.get("role") == "manager":
            raise HTTPException(400, f"{s.get('name')} is already a manager")
        await _raw_db.users.update_one({"id": u["id"]}, {"$set": {"role": "manager", "branch": branch}})
        if branch:
            await db.staff.update_one({"id": sid}, {"$set": {"branch": "" if branch == "__main__" else branch}})
        return {"ok": True, "mode": "upgraded", "email": u["email"], "branch": branch}
    email = (body.email or "").lower().strip()
    if not email:
        raise HTTPException(400, "This staff has no login yet — provide a login email to create one")
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    temp_pw = _generate_temp_password()
    new_user = {
        "id": str(uuid.uuid4()), "email": email, "name": s.get("name") or "Manager",
        "role": "manager", "tenant_id": t["id"], "status": "active", "disabled": False,
        "branch": branch, "staff_id": sid,
        "password_hash": hash_pw(temp_pw), "must_change_password": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(new_user)
    upd = {"user_id": new_user["id"], "email": email}
    if branch:
        upd["branch"] = branch
    await db.staff.update_one({"id": sid}, {"$set": upd})
    mail = await _send_staff_welcome(new_user["name"], t.get("name"), email, temp_pw, "manager")
    return {"ok": True, "mode": "created", "email": email, "temp_password": temp_pw, "branch": branch,
            "welcome_email_sent": mail.get("sent", False), "welcome_email_error": mail.get("error")}


@router.post("/managers/{uid}/demote")
async def demote_manager(uid: str, admin=Depends(require_tenant_admin),
                         _pin=Depends(require_owner_pin), t=Depends(current_tenant)):
    """Demote a manager back to staff — keeps their login & staff profile, drops manager powers."""
    u = await _raw_db.users.find_one({"id": uid, "tenant_id": t["id"], "role": "manager"}, {"_id": 0})
    if not u:
        raise HTTPException(404, "Manager not found")
    staff = await db.staff.find_one({"user_id": uid}, {"_id": 0, "id": 1})
    sets = {"role": "staff", "branch": ""}
    if staff and not u.get("staff_id"):
        sets["staff_id"] = staff["id"]
    if not staff and not u.get("staff_id"):
        raise HTTPException(400, "No staff profile linked to this login — use Remove instead of Demote")
    await _raw_db.users.update_one({"id": uid}, {"$set": sets})
    return {"ok": True, "email": u["email"]}


class ManagerPasswordIn(BaseModel):
    password: str = Field(..., min_length=8, max_length=128)


@router.put("/managers/{uid}/password")
async def set_manager_password(uid: str, body: ManagerPasswordIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Owner sets the manager's password directly (no temp password, no forced change). Other devices are signed out."""
    u = await _raw_db.users.find_one({"id": uid, "role": "manager", "$or": [{"tenant_id": t["id"]}, {"tenant_ids": t["id"]}]}, {"_id": 0, "id": 1, "email": 1, "name": 1})
    if not u:
        raise HTTPException(404, "Manager not found")
    await _raw_db.users.update_one({"id": uid}, {"$set": {"password_hash": hash_pw(body.password), "must_change_password": False,
                                                          "disabled": False, "status": "active", "password_set_by_owner_at": datetime.now(timezone.utc).isoformat()}})
    await _raw_db.sessions.delete_many({"user_id": uid})
    await _raw_db.login_attempts.delete_many({"identifier": {"$regex": f"{re.escape(u['email'])}$"}})
    await log_audit(t["id"], admin, "manager_password_set", f"Owner set a new password for manager {u['email']}")
    return {"ok": True, "email": u["email"]}


@router.post("/managers/{uid}/unlock")
async def unlock_manager(uid: str, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Too many wrong attempts locked the manager out → owner clears it in one tap."""
    u = await _raw_db.users.find_one({"id": uid, "role": "manager", "$or": [{"tenant_id": t["id"]}, {"tenant_ids": t["id"]}]}, {"_id": 0, "email": 1})
    if not u:
        raise HTTPException(404, "Manager not found")
    r = await _raw_db.login_attempts.delete_many({"identifier": {"$regex": f"{re.escape(u['email'])}$"}})
    await log_audit(t["id"], admin, "manager_unlock", f"Owner unlocked manager login {u['email']}")
    return {"ok": True, "cleared": r.deleted_count}


@router.post("/managers/{uid}/reset")
async def reset_manager(uid: str, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    u = await _raw_db.users.find_one({"id": uid, "tenant_id": t["id"], "role": "manager"}, {"_id": 0, "email": 1, "name": 1})
    if not u:
        raise HTTPException(404, "Manager not found")
    temp_pw = _generate_temp_password()
    await _raw_db.users.update_one(
        {"id": uid},
        {"$set": {"password_hash": hash_pw(temp_pw), "must_change_password": True, "disabled": False, "status": "active",
                  "password_changed_at": datetime.now(timezone.utc).isoformat()}})
    mail = await _send_staff_welcome(u.get("name"), t.get("name"), u["email"], temp_pw, "manager")
    return {"ok": True, "email": u["email"], "temp_password": temp_pw, "must_change_password": True,
            "welcome_email_sent": mail.get("sent", False), "welcome_email_error": mail.get("error")}

@router.delete("/managers/{uid}")
async def delete_manager(uid: str, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    u = await _raw_db.users.find_one({"id": uid, "role": "manager", "$or": [{"tenant_id": t["id"]}, {"tenant_ids": t["id"]}]}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(404, "Manager not found")
    others = (set(u.get("tenant_ids") or []) | ({u["tenant_id"]} if u.get("tenant_id") else set())) - {t["id"]}
    if others and not others <= _owner_tenant_ids(admin, t):  # shared with a business this owner doesn't hold → only unlink here
        sets = {"tenant_ids": sorted(others)}
        if u.get("tenant_id") == t["id"]:
            sets["tenant_id"] = sorted(others)[0]
        await _raw_db.users.update_one({"id": uid}, {"$set": sets})
        await db.staff.update_many({"user_id": uid, "tenant_id": t["id"]}, {"$unset": {"user_id": ""}})
        return {"ok": True, "unlinked": True, "remaining_salons": len(others)}
    await _raw_db.users.delete_one({"id": uid})
    await _raw_db.sessions.delete_many({"user_id": uid})
    await _raw_db.staff.delete_many({"user_id": uid})  # profile in every business of the group
    return {"ok": True}


# ---------------- WhatsApp send-approval workflow (manager → admin) ----------------
class WhatsAppRequestIn(BaseModel):
    client_name: str = Field(..., max_length=120)
    client_phone: str = Field("", max_length=20)
    message: str = Field(..., max_length=2000)
    kind: str = Field("confirmation", max_length=40)

@router.post("/whatsapp-requests")
async def create_whatsapp_request(body: WhatsAppRequestIn, user=Depends(get_current_user)):
    """A manager requests to send a WhatsApp message; admin must approve. Duplicates are blocked."""
    phone_digits = "".join(c for c in body.client_phone if c.isdigit())
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    dup = await db.whatsapp_requests.find_one(
        {"client_name": body.client_name, "kind": body.kind,
         "status": {"$in": ["pending", "approved", "sent"]}, "created_at": {"$gte": cutoff},
         **({"client_phone": phone_digits} if phone_digits else {})},
        {"_id": 0, "status": 1})
    if dup:
        if dup["status"] == "pending":
            raise HTTPException(409, f"Already requested — a {body.kind} for {body.client_name} is awaiting admin approval")
        raise HTTPException(409, f"Already sent — the {body.kind} for {body.client_name} was approved in the last 24 hours")
    doc = {
        "id": str(uuid.uuid4()), "requested_by": user["id"],
        "requested_by_name": user.get("name") or user.get("email"),
        "client_name": body.client_name, "client_phone": phone_digits,
        "message": body.message, "kind": body.kind, "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.whatsapp_requests.insert_one(doc)
    return {"ok": True, "id": doc["id"], "status": "pending"}

def _wa_req_key(r: dict) -> tuple:
    return (r.get("client_phone") or (r.get("client_name") or "").strip().lower(), r.get("kind"))


async def _prune_wa_requests() -> None:
    """Keep the approvals queue clean: expire stale items, dedupe per customer,
    and auto-resolve requests whose message was already sent today."""
    now = datetime.now(timezone.utc)
    await db.whatsapp_requests.update_many(
        {"status": "pending", "created_at": {"$lt": (now - timedelta(hours=48)).isoformat()}},
        {"$set": {"status": "expired", "expired_at": now.isoformat()}})
    pend = await db.whatsapp_requests.find(
        {"status": "pending"},
        {"_id": 0, "id": 1, "client_name": 1, "client_phone": 1, "kind": 1}
    ).sort("created_at", -1).to_list(500)
    seen, superseded = set(), []
    for r in pend:
        key = _wa_req_key(r)
        if key in seen:
            superseded.append(r["id"])
        else:
            seen.add(key)
    if superseded:
        await db.whatsapp_requests.update_many(
            {"id": {"$in": superseded}},
            {"$set": {"status": "superseded", "expired_at": now.isoformat()}})
    today = now.date().isoformat()
    sent_today = await db.whatsapp_requests.find(
        {"status": {"$in": ["approved", "sent"]}, "approved_at": {"$gte": today}},
        {"_id": 0, "client_name": 1, "client_phone": 1, "kind": 1}).to_list(300)
    sent_keys = {_wa_req_key(s) for s in sent_today}
    resolved = [r["id"] for r in pend if r["id"] not in superseded and _wa_req_key(r) in sent_keys]
    if resolved:
        await db.whatsapp_requests.update_many(
            {"id": {"$in": resolved}},
            {"$set": {"status": "already_sent", "expired_at": now.isoformat()}})


@router.get("/whatsapp-requests")
async def list_whatsapp_requests(status: str = "pending", admin=Depends(require_admin)):
    await _prune_wa_requests()
    q = {} if status == "all" else {"status": status}
    return await db.whatsapp_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)

class CategorySpecialIn(BaseModel):
    category: str = Field(..., min_length=1, max_length=60)
    discount_pct: float = Field(..., gt=0, le=90)
    days: List[int] = Field(..., min_length=1, max_length=7)  # 0=Mon … 6=Sun


@router.get("/category-specials")
async def list_category_specials(admin=Depends(require_admin)):
    return await db.category_specials.find({}, {"_id": 0}).sort("category", 1).to_list(100)


@router.post("/category-specials")
async def create_category_special(body: CategorySpecialIn, admin=Depends(require_admin)):
    if any(d < 0 or d > 6 for d in body.days):
        raise HTTPException(400, "Days must be 0 (Mon) to 6 (Sun)")
    doc = {"id": uuid.uuid4().hex[:10], "category": body.category.strip(),
           "discount_pct": body.discount_pct, "days": sorted(set(body.days)),
           "active": True, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.category_specials.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/category-specials/{sid}")
async def delete_category_special(sid: str, admin=Depends(require_admin)):
    r = await db.category_specials.delete_one({"id": sid})
    if r.deleted_count == 0:
        raise HTTPException(404, "Special not found")
    return {"ok": True}


@router.get("/table-orders")
async def list_table_orders(admin=Depends(require_admin)):
    """Kitchen tickets — table orders for this restaurant (newest first)."""
    return await db.table_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)


class MarkBilledIn(BaseModel):
    ids: list = []
    paid: bool = True
    invoice_no: Optional[str] = None
    total: Optional[float] = None


@router.put("/table-orders/mark-billed")
async def mark_table_orders_billed(body: MarkBilledIn, admin=Depends(require_admin)):
    """One bill per table — marks every order on the closed bill as 'billed' so the table starts fresh."""
    ids = [str(i) for i in body.ids][:50]
    if not ids:
        raise HTTPException(400, "No order ids given")
    now = datetime.now(timezone.utc).isoformat()
    # Record integrity: bill total comes from the orders themselves, not the client
    rows = await db.table_orders.find({"id": {"$in": ids}, "status": {"$ne": "cancelled"}}, {"_id": 0, "total": 1}).to_list(len(ids) or 1)
    bill_total = round(sum(float(r.get("total") or 0) for r in rows), 2)
    r = await db.table_orders.update_many(
        {"id": {"$in": ids}, "status": {"$ne": "cancelled"}},
        {"$set": {"status": "billed", "updated_at": now, "billed_at": now, "paid": body.paid,
                  "paid_at": now if body.paid else None, "invoice_no": body.invoice_no, "bill_total": bill_total}})
    return {"ok": True, "billed": r.modified_count}


class TableOrderStatusIn(BaseModel):
    status: str


@router.get("/table-calls")
async def list_table_calls(admin=Depends(require_admin)):
    """Open waiter/water calls from tables (last 2 hours)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    return await db.table_calls.find(
        {"status": "open", "created_at": {"$gte": cutoff}}, {"_id": 0}).sort("created_at", -1).to_list(50)


@router.put("/table-calls/{cid}/done")
async def resolve_table_call(cid: str, admin=Depends(require_admin)):
    r = await db.table_calls.update_one(
        {"id": cid}, {"$set": {"status": "done", "resolved_at": datetime.now(timezone.utc).isoformat()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Call not found")
    return {"ok": True}


@router.get("/restaurant/insights")
async def restaurant_insights(admin=Depends(require_admin)):
    """Last-7-days table-order insights: best-selling dishes + busiest tables."""
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    rows = await db.table_orders.find(
        {"status": {"$ne": "cancelled"}, "created_at": {"$gte": since}}, {"_id": 0}).to_list(3000)
    dishes, tables = {}, {}
    for o in rows:
        t = tables.setdefault(o["table_no"], {"table_no": o["table_no"], "orders": 0, "revenue": 0.0})
        t["orders"] += 1
        t["revenue"] += float(o.get("total") or 0)
        for i in o.get("items", []):
            d = dishes.setdefault(i["name"], {"name": i["name"], "qty": 0, "revenue": 0.0})
            d["qty"] += int(i.get("qty") or 1)
            d["revenue"] += float(i.get("price") or 0) * int(i.get("qty") or 1)
    return {"days": 7, "orders": len(rows),
            "revenue": round(sum(float(o.get("total") or 0) for o in rows), 2),
            "top_dishes": sorted(dishes.values(), key=lambda x: -x["qty"])[:8],
            "busy_tables": sorted(tables.values(), key=lambda x: -x["orders"])[:8]}


@router.put("/table-orders/{oid}/status")
async def set_table_order_status(oid: str, body: TableOrderStatusIn, admin=Depends(require_admin)):
    if body.status not in ("new", "preparing", "served", "cancelled"):
        raise HTTPException(400, "Invalid status")
    r = await db.table_orders.update_one(
        {"id": oid}, {"$set": {"status": body.status,
                               "updated_at": datetime.now(timezone.utc).isoformat()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Order not found")
    return {"ok": True}


@router.get("/whatsapp-requests/pending-count")
async def whatsapp_pending_count(admin=Depends(require_admin)):
    await _prune_wa_requests()
    return {"count": await db.whatsapp_requests.count_documents({"status": "pending"})}

@router.post("/whatsapp-requests/approve-all")
async def approve_all_whatsapp_requests(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Approve every pending request in one tap — returns per-message WhatsApp links to send."""
    rows = await db.whatsapp_requests.find({"status": "pending"}, {"_id": 0}).to_list(200)
    if rows:
        await db.whatsapp_requests.update_many(
            {"id": {"$in": [r["id"] for r in rows]}, "status": "pending"},
            {"$set": {"status": "approved", "approved_by": admin["id"],
                      "approved_at": datetime.now(timezone.utc).isoformat()}})
    from urllib.parse import quote as _quote
    biz = (t.get("whatsapp_number") or "").strip()
    items = []
    for r in rows:
        phone = r.get("client_phone") or ""
        msg = _quote(r["message"])
        wa_url = (f"https://wa.me/{phone}?text=" if phone else "https://wa.me/?text=") + msg
        item = {"id": r["id"], "client_name": r.get("client_name") or "Guest",
                "kind": r.get("kind"), "wa_url": wa_url}
        if phone and biz:
            item["wa_business_url"] = (
                f"intent://send?phone={phone}&text={msg}"
                f"#Intent;scheme=whatsapp;package=com.whatsapp.w4b;"
                f"S.browser_fallback_url={_quote(wa_url)};end")
        items.append(item)
    return {"approved": len(items), "items": items}


@router.post("/whatsapp-requests/reject-all")
async def reject_all_whatsapp_requests(admin=Depends(require_tenant_admin)):
    res = await db.whatsapp_requests.update_many(
        {"status": "pending"},
        {"$set": {"status": "rejected", "approved_by": admin["id"],
                  "approved_at": datetime.now(timezone.utc).isoformat()}})
    return {"rejected": res.modified_count}


@router.post("/whatsapp-requests/{rid}/approve")
async def approve_whatsapp_request(rid: str, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    r = await db.whatsapp_requests.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Request not found")
    await db.whatsapp_requests.update_one(
        {"id": rid}, {"$set": {"status": "approved", "approved_by": admin["id"],
                               "approved_at": datetime.now(timezone.utc).isoformat()}})
    phone = r.get("client_phone") or ""
    from urllib.parse import quote as _quote
    msg = _quote(r["message"])
    wa_url = (f"https://wa.me/{phone}?text=" if phone else "https://wa.me/?text=") + msg
    out = {"ok": True, "wa_url": wa_url,
           "business_number": (t.get("whatsapp_number") or "").strip()}
    # Tenant has a business WhatsApp configured → Android intent link forces the
    # WhatsApp BUSINESS app (com.whatsapp.w4b) so the message goes out from the
    # salon's business number, never the owner's personal WhatsApp.
    if phone and out["business_number"]:
        out["wa_business_url"] = (
            f"intent://send?phone={phone}&text={msg}"
            f"#Intent;scheme=whatsapp;package=com.whatsapp.w4b;"
            f"S.browser_fallback_url={_quote(wa_url)};end")
    return out

@router.post("/whatsapp-requests/{rid}/reject")
async def reject_whatsapp_request(rid: str, admin=Depends(require_tenant_admin)):
    res = await db.whatsapp_requests.update_one(
        {"id": rid, "status": "pending"},
        {"$set": {"status": "rejected", "approved_by": admin["id"], "approved_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Request not found or already handled")
    return {"ok": True}



@router.post("/staff/{sid}/toggle-always-on-time")
async def toggle_always_on_time(sid: str, admin=Depends(require_admin)):
    """Owner/admin flags trusted staff — they're auto-marked checked-in & out on time daily."""
    s = await db.staff.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Staff member not found")
    val = not bool(s.get("always_on_time"))
    await db.staff.update_one({"id": sid}, {"$set": {"always_on_time": val}})
    return {"always_on_time": val}


@router.post("/staff/{sid}/toggle-active")
async def toggle_staff_active(sid: str, admin=Depends(require_admin)):
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


