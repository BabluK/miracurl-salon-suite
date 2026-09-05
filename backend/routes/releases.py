"""Deployment history for Super Admin: bundled release notes synced to DB, individually deletable."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from database import _raw_db
from security import require_super_admin, get_current_user
from release_notes import RELEASES, BUILD, BUILD_TIME

router = APIRouter()

# Items with these prefixes are HQ-internal and hidden from salon owners' "What's New" popup.
_INTERNAL_PREFIXES = ("Super Admin:", "Deployments:", "Platform:", "Miracurl Team:")


@router.get("/whats-new")
async def whats_new(user=Depends(get_current_user)):
    """Highlights of the latest deployment — powers the 'What's New ✨' popup.
    Shown to every console login: owner/admins, managers and super-admins."""
    if user.get("role") not in ("admin", "manager", "super_admin"):
        raise HTTPException(403, "Admin or manager role required")
    latest = RELEASES[0]
    highlights = [c for c in latest["changes"] if not c.startswith(_INTERNAL_PREFIXES)][:8]
    return {"build": BUILD, "date": latest["date"], "highlights": highlights}


@router.get("/public/build")
async def public_build():
    """Unauthenticated build fingerprint — powers the 'New version available' toast."""
    return {"build": BUILD}


@router.get("/super/link-health")
async def link_health(user=Depends(require_super_admin)):
    """Is every outgoing link pinned to the official domain? Green badge in HQ; red if APP_PUBLIC_URL is missing/wrong."""
    import os
    from urllib.parse import urlparse
    import httpx
    base = os.environ.get("APP_PUBLIC_URL", "").strip().rstrip("/")
    frontend = os.environ.get("FRONTEND_URL", "").strip().rstrip("/")
    allowed = [h.strip().lower() for h in os.environ.get("ALLOWED_PUBLIC_HOSTS", "").split(",") if h.strip()]
    host = urlparse(base).hostname or ""
    checks = [
        {"label": "APP_PUBLIC_URL is set", "ok": bool(base), "detail": base or "missing"},
        {"label": "Uses https", "ok": base.startswith("https://"), "detail": urlparse(base).scheme or "—"},
        {"label": "Official domain (not a preview host)", "ok": bool(host) and not host.endswith(".emergentagent.com") and host != "localhost", "detail": host or "—"},
        {"label": "Matches FRONTEND_URL", "ok": (not frontend) or frontend == base, "detail": frontend or "not set"},
        {"label": "Listed in ALLOWED_PUBLIC_HOSTS", "ok": (not allowed) or host in allowed, "detail": ", ".join(allowed) or "not set"},
    ]
    reach = {"label": "Domain answers as this app", "ok": False, "detail": "skipped"}
    if base and host:
        try:
            async with httpx.AsyncClient(timeout=6, follow_redirects=True) as c:
                r = await c.get(f"{base}/api/public/build")
            remote = r.json().get("build") if r.status_code == 200 else None
            reach = {"label": "Domain answers as this app", "ok": bool(remote),
                     "detail": f"live build {remote}" + ("" if remote == BUILD else f" (this server: {BUILD})") if remote else f"HTTP {r.status_code}"}
        except Exception as e:  # noqa: BLE001
            reach = {"label": "Domain answers as this app", "ok": False, "detail": f"unreachable: {type(e).__name__}"}
    checks.append(reach)
    return {"ok": all(c["ok"] for c in checks), "base": base, "host": host, "checks": checks}


@router.get("/super/version")
async def server_version(admin=Depends(require_super_admin)):
    return {
        "build": BUILD,
        "build_time": BUILD_TIME,
        "latest_tag": f"MIRA-DEPLOYED-{RELEASES[0]['date']}",
        "server_time": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/super/releases")
async def list_releases(admin=Depends(require_super_admin)):
    for r in RELEASES:
        tag = f"MIRA-DEPLOYED-{r['date']}"
        existing = await _raw_db.deploy_releases.find_one({"tag": tag})
        if not existing:
            await _raw_db.deploy_releases.insert_one({
                "id": str(uuid.uuid4()), "tag": tag, "date": r["date"],
                "changes": r["changes"], "deleted": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        elif not existing.get("deleted") and existing.get("changes") != r["changes"]:
            await _raw_db.deploy_releases.update_one({"tag": tag}, {"$set": {"changes": r["changes"]}})
    rows = await _raw_db.deploy_releases.find({"deleted": False}, {"_id": 0}).sort("date", -1).to_list(100)
    return {"releases": rows}


@router.delete("/super/releases/{rid}")
async def delete_release(rid: str, admin=Depends(require_super_admin)):
    res = await _raw_db.deploy_releases.update_one({"id": rid}, {"$set": {"deleted": True}})
    if res.matched_count == 0:
        raise HTTPException(404, "Release entry not found")
    return {"ok": True}
