"""Deployment history for Super Admin: bundled release notes synced to DB, individually deletable."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from database import _raw_db
from security import require_super_admin, get_current_user
from release_notes import RELEASES, BUILD, BUILD_TIME, BUILD_LOG

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
    frontend_raw = os.environ.get("FRONTEND_URL", "").strip()
    frontend_list = [f.strip().rstrip("/") for f in frontend_raw.split(",") if f.strip()]
    frontend_ok = (not frontend_list) or "*" in frontend_list or base in frontend_list
    allowed = [h.strip().lower() for h in os.environ.get("ALLOWED_PUBLIC_HOSTS", "").split(",") if h.strip()]
    host = urlparse(base).hostname or ""
    checks = [
        {"label": "APP_PUBLIC_URL is set", "ok": bool(base), "detail": base or "missing"},
        {"label": "Uses https", "ok": base.startswith("https://"), "detail": urlparse(base).scheme or "—"},
        {"label": "Official domain (not a preview host)", "ok": bool(host) and not host.endswith(".emergentagent.com") and host != "localhost", "detail": host or "—"},
        {"label": "Allowed by FRONTEND_URL (CORS origins)", "ok": frontend_ok,
         "detail": "any origin (*)" if "*" in frontend_list else (", ".join(frontend_list) or "not set")},
        {"label": "Listed in ALLOWED_PUBLIC_HOSTS", "ok": (not allowed) or host in allowed, "detail": ", ".join(allowed) or "not set"},
    ]
    reach = {"label": "Domain answers as this app", "ok": False, "detail": "skipped"}
    live_build = None
    if base and host:
        try:
            async with httpx.AsyncClient(timeout=6, follow_redirects=True) as c:
                r = await c.get(f"{base}/api/public/build")
            live_build = r.json().get("build") if r.status_code == 200 else None
            reach = {"label": "Domain answers as this app", "ok": bool(live_build),
                     "detail": f"live build {live_build}" if live_build else f"HTTP {r.status_code}"}
        except Exception as e:  # noqa: BLE001
            reach = {"label": "Domain answers as this app", "ok": False, "detail": f"unreachable: {type(e).__name__}"}
    checks.append(reach)
    # Build strings sort chronologically (YYYY-MM-DD.N) — production older than this server ⇒ deploy pending
    deploy_pending = bool(live_build) and live_build != BUILD and _build_key(live_build) < _build_key(BUILD)
    pending = [e for e in BUILD_LOG if live_build and _build_key(e["build"]) > _build_key(live_build)] if deploy_pending else []
    if live_build:
        await _record_deploy(live_build)
    return {"ok": all(c["ok"] for c in checks), "base": base, "host": host, "checks": checks,
            "this_build": BUILD, "live_build": live_build, "deploy_pending": deploy_pending, "pending": pending}


async def _record_deploy(live_build: str) -> None:
    """Timeline of production deploys: one row each time the live build changes (with what shipped)."""
    from database import _raw_db
    last = await _raw_db.deploy_log.find_one({}, {"_id": 0, "build": 1}, sort=[("seen_at", -1)])
    if last and last["build"] == live_build:
        return
    prev_key = _build_key(last["build"]) if last else None
    shipped = [e["note"] for e in BUILD_LOG
               if _build_key(e["build"]) <= _build_key(live_build) and (prev_key is None or _build_key(e["build"]) > prev_key)]
    await _raw_db.deploy_log.insert_one({
        "id": str(uuid.uuid4()), "build": live_build, "previous_build": (last or {}).get("build"),
        "seen_at": datetime.now(timezone.utc).isoformat(), "shipped": shipped[:20],
        "rollback": bool(prev_key and _build_key(live_build) < prev_key)})


@router.get("/super/deploy-log")
async def deploy_log(user=Depends(require_super_admin)):
    from database import _raw_db
    rows = await _raw_db.deploy_log.find({}, {"_id": 0}).sort("seen_at", -1).to_list(50)
    return {"deploys": rows}


def _build_key(b: str) -> tuple:
    date, _, n = (b or "").partition(".")
    return (date, int(n) if n.isdigit() else 0)


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


_deploy_cache: dict = {"at": 0.0, "data": None}


@router.get("/super/deploy-status")
async def deploy_status(refresh: bool = False, admin=Depends(require_super_admin)):
    """This server's build vs. the live production build → what's still waiting to be published. Cached 5 min."""
    import os
    import time
    import httpx
    from release_notes import BUILD_LOG
    if _deploy_cache["data"] and not refresh and time.time() - _deploy_cache["at"] < 300:
        return _deploy_cache["data"]
    prod_url = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com").rstrip("/")
    live = None
    try:
        async with httpx.AsyncClient(timeout=8) as http:
            r = await http.get(f"{prod_url}/api/public/build")
            live = (r.json() or {}).get("build") if r.status_code == 200 else None
    except Exception:  # noqa: BLE001 — production unreachable → report unknown
        live = None
    pending = [e for e in BUILD_LOG if live and e["build"] > live] if live else []
    out = {"here": BUILD, "live": live, "prod_url": prod_url, "is_production": live == BUILD,
           "pending_count": len(pending), "pending": pending[:8], "checked_at": datetime.now(timezone.utc).isoformat()}
    _deploy_cache.update(at=time.time(), data=out)
    return out
