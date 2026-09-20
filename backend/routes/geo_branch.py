"""GPS branch pick at login: staff/managers see only the branch they are physically at (others disabled)."""
import math
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import _raw_db
from security import current_tenant, get_current_user, log_audit

router = APIRouter()
GEO_LOGIN_M = 100  # a branch further than this from the phone is disabled at login


class LocateIn(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    accuracy_m: Optional[float] = Field(None, ge=0)


class PickIn(BaseModel):
    branch: str = Field("", max_length=120)  # "__main__" | branch name
    distance_m: Optional[float] = None


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _main_label(t: dict) -> str:
    return f"{t.get('name') or 'Main salon'} — {t['location']}" if t.get("location") else (t.get("name") or "Main salon")


def _option(value: str, label: str, lat, lng, here: LocateIn, radius: int) -> dict:
    if lat is None or lng is None:
        return {"value": value, "label": label, "pinned": False, "distance_m": None, "within": False}
    d = _haversine_m(here.latitude, here.longitude, float(lat), float(lng))
    return {"value": value, "label": label, "pinned": True, "distance_m": round(d), "within": d <= radius}


@router.post("/branch/locate")
async def locate_branch(body: LocateIn, user=Depends(get_current_user), t=Depends(current_tenant)):
    """Distance from the phone to the main salon and every branch; `within` = selectable at login."""
    radius = int(t.get("geo_login_m") or GEO_LOGIN_M)
    opts = [_option("__main__", _main_label(t), t.get("latitude"), t.get("longitude"), body, radius)]
    opts += [_option(b["name"], b["name"], b.get("latitude"), b.get("longitude"), body, radius)
             for b in (t.get("branches") or []) if b.get("name")]
    pinned = [o for o in opts if o["pinned"]]
    nearest = min(pinned, key=lambda o: o["distance_m"]) if pinned else None
    return {"radius_m": radius, "options": opts, "nearest": nearest["value"] if nearest else None,
            "any_within": any(o["within"] for o in opts), "any_pinned": bool(pinned),
            "locked_branch": user.get("branch") or ""}


@router.post("/branch/pick")
async def pick_branch(body: PickIn, user=Depends(get_current_user), t=Depends(current_tenant)):
    """Record which branch this login is working from today (GPS-verified pick)."""
    branch = body.branch.strip()
    names = {b.get("name") for b in (t.get("branches") or [])}
    if branch and branch != "__main__" and branch not in names:
        raise HTTPException(400, "Unknown branch")
    if user.get("branch") and user["branch"] != branch:
        raise HTTPException(403, "Your login is locked to another branch")
    pick = {"branch": branch, "distance_m": body.distance_m, "at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.users.update_one({"id": user["id"]}, {"$set": {"last_branch_pick": pick}})
    label = _main_label(t) if branch == "__main__" else (branch or "all branches")
    dist = f" · GPS {int(body.distance_m)} m" if body.distance_m is not None else ""
    await log_audit(t["id"], user, "branch_login", f"{user.get('name') or user.get('email')} signed in at {label}{dist}")
    return {"ok": True, **pick}
