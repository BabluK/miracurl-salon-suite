"""GPS branch pick at login: staff/managers see only the branch they are physically at (others disabled)."""
import math
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from database import _raw_db
from security import client_ip, current_tenant, get_current_user, log_audit, require_admin

router = APIRouter()
GEO_LOGIN_M = 100  # a branch further than this from the phone is disabled at login


class LocateIn(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    accuracy_m: Optional[float] = Field(None, ge=0)


class PickIn(BaseModel):
    branch: str = Field("", max_length=120)  # "__main__" | branch name
    distance_m: Optional[float] = None
    gps_verified: bool = False


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
async def pick_branch(body: PickIn, request: Request, user=Depends(get_current_user), t=Depends(current_tenant)):
    """Record which branch this device/login works from (remembered 15 days on the device)."""
    branch = body.branch.strip()
    names = {b.get("name") for b in (t.get("branches") or [])}
    if branch and branch != "__main__" and branch not in names:
        raise HTTPException(400, "Unknown branch")
    if user.get("branch") and user["branch"] != branch:
        raise HTTPException(403, "Your login is locked to another branch")
    pick = {"branch": branch, "distance_m": body.distance_m, "gps_verified": body.gps_verified,
            "at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.users.update_one({"id": user["id"]}, {"$set": {"last_branch_pick": pick}})
    label = _main_label(t) if branch == "__main__" else (branch or "all branches")
    dist = f" · GPS verified, {int(body.distance_m)} m" if body.gps_verified and body.distance_m is not None else " · no GPS"
    await log_audit(t["id"], user, "branch_login", f"{user.get('name') or user.get('email')} signed in at {label}{dist}")
    now = datetime.now(timezone.utc)
    await _raw_db.branch_logins.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": t["id"], "user_id": user["id"], "name": user.get("name"), "email": user.get("email"),
        "role": user.get("role"), "branch": branch, "branch_label": label, "gps_verified": body.gps_verified,
        "distance_m": body.distance_m, "device": _device_label(request.headers.get("user-agent", "")),
        "ip": client_ip(request), "at": now.isoformat(), "date": (now + timedelta(hours=5, minutes=30)).date().isoformat()})
    return {"ok": True, **pick}


def _device_label(ua: str) -> str:
    """'Chrome · Android' style label from the User-Agent (no fingerprinting, just a friendly hint)."""
    os_name = next((n for pat, n in (("iPhone", "iPhone"), ("iPad", "iPad"), ("Android", "Android"), ("Windows", "Windows"),
                                     ("Mac OS", "Mac"), ("CrOS", "ChromeOS"), ("Linux", "Linux")) if pat in ua), "Unknown device")
    browser = next((n for pat, n in (("EdgA", "Edge"), ("Edg/", "Edge"), ("OPR/", "Opera"), ("SamsungBrowser", "Samsung Internet"),
                                     ("CriOS", "Chrome"), ("Chrome/", "Chrome"), ("FxiOS", "Firefox"), ("Firefox/", "Firefox"),
                                     ("Safari/", "Safari")) if pat in ua), "")
    pwa = " app" if re.search(r"wv\)|; wv", ua) else ""
    return f"{browser}{pwa} · {os_name}".strip(" ·")


@router.get("/attendance/branch-logins")
async def branch_logins(date: Optional[str] = None, admin=Depends(require_admin), t=Depends(current_tenant)):
    """Who signed in at which branch on a given IST day (device + GPS-verified tick)."""
    day = date or (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date().isoformat()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
        raise HTTPException(400, "date must be YYYY-MM-DD")
    q: dict = {"tenant_id": t["id"], "date": day}
    if admin.get("role") == "manager" and admin.get("branch"):
        q["branch"] = admin["branch"]
    rows = await _raw_db.branch_logins.find(q, {"_id": 0, "ip": 0}).sort("at", -1).to_list(500)
    return {"date": day, "items": rows, "gps_verified": sum(1 for r in rows if r.get("gps_verified")), "total": len(rows)}


@router.get("/branches/unpinned")
async def unpinned_branches(admin=Depends(require_admin), t=Depends(current_tenant)):
    """Locations without a GPS pin — the branch picker can't verify staff there."""
    out = []
    if t.get("latitude") is None or t.get("longitude") is None:
        out.append({"value": "", "label": _main_label(t), "main": True,
                    "address": t.get("address") or f"{t.get('name') or ''} {t.get('location') or ''}".strip()})
    out += [{"value": b["name"], "label": b["name"], "main": False, "address": b.get("address") or b.get("maps_url") or ""}
            for b in (t.get("branches") or []) if b.get("name") and (b.get("latitude") is None or b.get("longitude") is None)]
    return {"items": out, "total_locations": 1 + len(t.get("branches") or [])}
