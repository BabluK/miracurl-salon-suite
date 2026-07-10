"""Deployment history for Super Admin: bundled release notes synced to DB, individually deletable."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from database import _raw_db
from security import require_super_admin
from release_notes import RELEASES, BUILD

router = APIRouter()


@router.get("/super/version")
async def server_version(admin=Depends(require_super_admin)):
    return {
        "build": BUILD,
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
