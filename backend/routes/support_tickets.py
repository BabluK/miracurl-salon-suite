"""Owner "Ask Miracurl to fix this" tickets → HQ Inbox with one-click Open into the salon workspace."""
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from database import _raw_db
from email_service import hq_inbox, _send_email
from security import current_tenant, public_rate_limit, require_admin, require_super_admin
from services.tenant_notices import notify_tenant

router = APIRouter()
_now = lambda: datetime.now(timezone.utc).isoformat()  # noqa: E731


class FixRequestIn(BaseModel):
    issue: str = Field(..., min_length=5, max_length=2000)
    page: str = Field("/dashboard", max_length=200)
    page_title: str = Field("", max_length=120)


def _clean_page(p: str) -> str:
    p = (p or "/dashboard").strip()
    return p if p.startswith("/") and "//" not in p else "/dashboard"


@router.post("/support/fix-request")
async def create_fix_request(body: FixRequestIn, request: Request, user=Depends(require_admin), t=Depends(current_tenant)):
    await public_rate_limit(request, key_suffix=f"fix-{t['id']}", limit=10, window_sec=3600)
    from routes.lead_gen import _next_ticket_no
    no = await _next_ticket_no()
    page = _clean_page(body.page)
    subject = f"Fix request · {body.page_title or page}"
    doc = {"id": str(uuid.uuid4()), "tenant_id": t["id"], "tenant_name": t.get("name"), "tenant_slug": t.get("slug"),
           "from_email": user.get("email"), "from_name": user.get("name"), "subject": subject, "message": body.issue.strip(),
           "kind": "fix_request", "ticket_no": no, "status": "open", "page": page, "page_title": body.page_title,
           "attachments": [], "read": False, "created_at": _now()}
    await _raw_db.hq_messages.insert_one(dict(doc))
    base = os.environ.get("APP_PUBLIC_URL", "").rstrip("/")
    from services.hq_emails import fix_request_hq_email, fix_request_owner_email
    try:
        subj, html = fix_request_hq_email(t, no, page, body.page_title, body.issue, user.get("email") or "")
        await _send_email([hq_inbox("support")], subj, html, book_url=f"{base}/super-admin", book_label="Open Super Admin ✦",
                          reply_to=user.get("email"))
        from routes.rewards_settlements import _real_email
        em = await _real_email(t)
        if em:
            subj2, html2 = fix_request_owner_email(t, no, body.page_title or page, body.issue)
            await _send_email([em], subj2, html2, book_url=f"{base}/settings", book_label="Open Miracurl ✦")
    except Exception:  # noqa: BLE001 — ticket is stored regardless
        pass
    await notify_tenant(t["id"], "fix_request", f"Fix request #{no} sent to Miracurl",
                        "HQ will open your workspace and sort it — you'll be notified when it's done.", "/settings", f"fix_request:{no}")
    return {"ok": True, "ticket_no": no, "id": doc["id"]}


@router.get("/support/fix-requests")
async def my_fix_requests(user=Depends(require_admin), t=Depends(current_tenant)):
    rows = await _raw_db.hq_messages.find({"tenant_id": t["id"], "kind": "fix_request"},
                                          {"_id": 0, "id": 1, "ticket_no": 1, "subject": 1, "message": 1, "status": 1, "page": 1,
                                           "page_title": 1, "created_at": 1, "in_progress_at": 1, "resolved_at": 1, "hq_note": 1, "hq_note_at": 1}).sort("created_at", -1).to_list(20)
    return {"items": rows, "active": sum(1 for r in rows if r.get("status") != "resolved")}


class HqNoteIn(BaseModel):
    note: Optional[str] = Field(None, max_length=600)


def _lock_info(rows: list[dict], now: str) -> list[dict]:
    return [{"identifier": r.get("identifier"), "count": r.get("count", 0), "last_attempt": r.get("last_attempt"),
             "locked": bool(r.get("locked_until") and r["locked_until"] > now), "locked_until": r.get("locked_until")} for r in rows]


async def _check_salon_login(email: str, now: str) -> dict:
    u = await _raw_db.users.find_one({"email": email}, {"_id": 0, "password_hash": 0})
    out = {"queried": email, "found": bool(u), "findings": []}
    locks = _lock_info(await _raw_db.login_attempts.find({"identifier": {"$regex": f":{re.escape(email)}$"}}, {"_id": 0}).to_list(20), now)
    out["lockouts"] = locks
    if not u:
        out["findings"].append({"level": "error", "text": "No login exists with this email. Owner → Staff → 'Give login' creates one (check spelling / the email the owner typed)."})
        return out
    t = await _raw_db.tenants.find_one({"id": u.get("tenant_id")}, {"_id": 0, "name": 1, "slug": 1, "business_type": 1}) if u.get("tenant_id") else None
    staff = await _raw_db.staff.find_one({"user_id": u.get("id")}, {"_id": 0, "name": 1, "active": 1, "last_working_day": 1, "personal_email": 1, "phone": 1})
    out.update({"account": {"name": u.get("name"), "role": u.get("role"), "tenant": (t or {}).get("name"), "tenant_slug": (t or {}).get("slug"),
                            "disabled": bool(u.get("disabled")), "status": u.get("status"), "must_change_password": bool(u.get("must_change_password")),
                            "last_login_at": u.get("last_login_at"), "password_changed_at": u.get("password_changed_at"), "created_at": u.get("created_at")},
                "staff": staff})
    if u.get("disabled") or u.get("status") == "disabled":
        out["findings"].append({"level": "error", "text": "Account is DISABLED by the owner — Staff page → enable the login."})
    if any(l["locked"] for l in locks):
        out["findings"].append({"level": "error", "text": "Temporarily LOCKED after 5+ wrong passwords — tap 'Unlock now' or wait 15 minutes."})
    if u.get("must_change_password"):
        out["findings"].append({"level": "warn", "text": "Still on the one-time (temporary) password — they must log in with the temp password shared by the owner, then set their own. If lost: Owner → Staff → 'Reset login' generates a new one."})
    if staff and staff.get("active") is False:
        out["findings"].append({"level": "error", "text": "Linked staff record is inactive (marked left) — reactivate in Staff to allow login."})
    if staff and not staff.get("personal_email"):
        out["findings"].append({"level": "info", "text": "No personal email on the staff profile — welcome/temp-password emails are NOT sent; the owner must share credentials shown on screen."})
    if not u.get("last_login_at"):
        out["findings"].append({"level": "info", "text": "Never logged in successfully yet."})
    if not out["findings"]:
        out["findings"].append({"level": "ok", "text": "Account looks healthy — wrong password is the only remaining cause. Use 'Reset login' to issue a fresh temp password."})
    return out


async def _check_employee_portal(phone: str, now: str) -> dict:
    from routes.employee_portal import _find_registry_emp_by_phone, _is_employment_active
    emp = await _find_registry_emp_by_phone(phone)
    out = {"queried": phone, "found": bool(emp), "findings": []}
    out["lockouts"] = _lock_info(await _raw_db.login_attempts.find({"identifier": {"$regex": f":emp:{re.escape(phone)}$"}}, {"_id": 0}).to_list(20), now)
    if not emp:
        out["findings"].append({"level": "error", "text": "No Staff Registry record with this mobile — registration says 'not registered'. HQ/owner must add the employee to the Staff Registry (with Aadhaar) first."})
        return out
    acct = await _raw_db.employee_accounts.find_one({"employee_id": emp["id"]}, {"_id": 0, "created_at": 1, "password_changed_at": 1})
    active = await _is_employment_active(emp["id"])
    pending = await _raw_db.employee_reset_codes.find_one({"employee_id": emp["id"]}, {"_id": 0, "purpose": 1, "expires_at": 1, "attempts": 1})
    out.update({"registry": {"name": emp.get("name"), "staff_code": emp.get("staff_code"), "phone": emp.get("phone"), "email": emp.get("email") or "",
                             "has_aadhaar": bool(emp.get("aadhaar_hash")), "employment_active": active},
                "account": acct, "pending_code": pending})
    if not emp.get("aadhaar_hash"):
        out["findings"].append({"level": "error", "text": "Registry record has NO Aadhaar — Register/Reset can't verify them. Add the Aadhaar in Staff Registry."})
    if not active:
        out["findings"].append({"level": "error", "text": "Employment is not active (left / deactivated / notice period over) — portal blocks login by design. Reactivate the staff record or add an open employment."})
    if not acct:
        out["findings"].append({"level": "warn", "text": "No portal account yet — they must use the REGISTER tab (mobile + Aadhaar → 6-digit code → password), not Login."})
    if acct and not emp.get("email"):
        out["findings"].append({"level": "info", "text": "No email on the registry profile — verification codes fall back to SMS only (set MSG91 OTP template) — add an email to be safe."})
    if any(l["locked"] for l in out["lockouts"]):
        out["findings"].append({"level": "error", "text": "Temporarily LOCKED after 5+ wrong passwords — tap 'Unlock now' or wait 15 minutes."})
    if pending:
        out["findings"].append({"level": "info", "text": f"A {pending.get('purpose')} code is pending (expires {pending.get('expires_at', '')[:16]}, {pending.get('attempts', 0)} wrong tries)."})
    if not out["findings"]:
        out["findings"].append({"level": "ok", "text": "Registry + account look healthy — wrong password is the only remaining cause; use Reset Password on the portal."})
    return out


@router.get("/super-admin/login-check")
async def sa_login_check(q: str, user=Depends(require_super_admin)):
    """HQ diagnostic: why can't this staff member log in? q = login email or 10-digit mobile."""
    q = (q or "").strip().lower()
    now = _now()
    if "@" in q:
        return {"kind": "salon_login", **(await _check_salon_login(q, now))}
    digits = re.sub(r"\D", "", q)[-10:]
    if len(digits) != 10:
        raise HTTPException(400, "Enter the staff login email or their 10-digit mobile number")
    return {"kind": "employee_portal", **(await _check_employee_portal(digits, now))}


class UnlockIn(BaseModel):
    q: str = Field(..., min_length=3, max_length=120)


@router.post("/super-admin/login-check/unlock")
async def sa_login_unlock(body: UnlockIn, user=Depends(require_super_admin)):
    q = body.q.strip().lower()
    key = re.escape(q) if "@" in q else f"emp:{re.escape(re.sub(r'[^0-9]', '', q)[-10:])}"
    r = await _raw_db.login_attempts.delete_many({"identifier": {"$regex": f":{key}$"}})
    await _raw_db.hq_audit.insert_one({"id": str(uuid.uuid4()), "kind": "login_unlock", "by": user.get("email"), "target": q, "cleared": r.deleted_count, "at": _now()})
    return {"ok": True, "cleared": r.deleted_count}


@router.patch("/super-admin/hq-messages/{mid}/note")
async def hq_ticket_note(mid: str, body: HqNoteIn, user=Depends(require_super_admin)):
    r = await _raw_db.hq_messages.update_one({"id": mid}, {"$set": {"hq_note": (body.note or "").strip(), "hq_note_by": user.get("email")}})
    if not r.matched_count:
        raise HTTPException(404, "Message not found")
    return {"ok": True}
