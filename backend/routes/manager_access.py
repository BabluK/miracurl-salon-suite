"""Manager section-access gate + activity logging.
Managers get the full admin menu, but sensitive sections need the Owner (Admin) PIN.
Every attempt is logged so the owner can audit manager activity."""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import _raw_db
from security import (
    get_current_user, current_tenant, require_owner_pin, verify_pw,
    _pin_attempt_guard, _pin_attempt_fail, _pin_attempt_clear,
)

log = logging.getLogger("manager_access")
router = APIRouter(prefix="/manager", tags=["manager-access"])

SECTIONS = {"/staff": "Staff", "/cctv": "AI CCTV", "/attendance": "Attendance",
            "/hire": "Hire Staff", "/messages": "Messages", "/settings": "Settings",
            "/staff-activities": "Staff Activities"}


class AccessIn(BaseModel):
    section: str = Field(..., max_length=40)
    pin: str = Field("", max_length=12)


async def _log(t, user, section: str, action: str):
    await _raw_db.manager_activity_logs.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": t["id"],
        "user_id": user.get("id", ""), "name": user.get("name") or user.get("email", ""),
        "email": user.get("email", ""), "role": user.get("role", ""),
        "section": SECTIONS.get(section, section), "action": action,
        "at": datetime.now(timezone.utc).isoformat(),
    })


@router.post("/section-access")
async def section_access(body: AccessIn, user=Depends(get_current_user), t=Depends(current_tenant)):
    role = user.get("role")
    if role == "super_admin":
        return {"ok": True}
    if role not in ("manager", "admin"):
        raise HTTPException(403, "Not allowed")
    ph = (t or {}).get("security_pin_hash")
    if not ph:
        await _log(t, user, body.section, "opened (no PIN set)")
        return {"ok": True}
    if not body.pin:
        await _log(t, user, body.section, "attempted")
        return {"ok": False, "pin_required": True}
    await _pin_attempt_guard(t["id"])
    if not verify_pw(body.pin.strip(), ph):
        await _pin_attempt_fail(t["id"])
        await _log(t, user, body.section, "denied (wrong PIN)")
        raise HTTPException(403, "Incorrect Admin PIN")
    await _pin_attempt_clear(t["id"])
    await _log(t, user, body.section, "unlocked")
    return {"ok": True}


@router.get("/activity-logs", dependencies=[Depends(require_owner_pin)])
async def activity_logs(user=Depends(get_current_user), t=Depends(current_tenant)):
    rows = await _raw_db.manager_activity_logs.find(
        {"tenant_id": t["id"]}, {"_id": 0}).sort("at", -1).to_list(300)
    return {"logs": rows}
