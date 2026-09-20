"""HQ: change a tenant's OWNER login email safely — shared logins, existing owner logins, manager/staff conflicts."""
import logging
import re
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException

from database import _raw_db
from security import hash_pw

log = logging.getLogger("owner_email")


def owned_tenant_ids(u: dict) -> set:
    ids = set(u.get("tenant_ids") or [])
    if u.get("tenant_id"):
        ids.add(u["tenant_id"])
    return ids


async def _detach_owner(owner: dict, tid: str) -> dict:
    """Take ONE business off an owner login; delete the login once it owns nothing."""
    remaining = owned_tenant_ids(owner) - {tid}
    if not remaining:
        await _raw_db.users.delete_one({"id": owner["id"]})
        await _raw_db.sessions.delete_many({"user_id": owner["id"]})
        return {"removed_login": owner["email"]}
    new_active = owner.get("tenant_id") if owner.get("tenant_id") in remaining else sorted(remaining)[0]
    await _raw_db.users.update_one({"id": owner["id"]}, {"$pull": {"tenant_ids": tid}, "$set": {"tenant_id": new_active}})
    return {"detached_from": owner["email"]}


async def _conflict_detail(existing: dict, new_email: str) -> dict:
    t = await _raw_db.tenants.find_one({"id": existing.get("tenant_id")}, {"_id": 0, "name": 1})
    role = existing.get("role") or "user"
    branch = existing.get("branch") or ""
    branch_label = "main branch" if branch == "__main__" else branch
    where = ((t or {}).get("name") or "another business") + (f" · {branch_label}" if branch_label else "")
    return {
        "code": "email_in_use", "email": new_email, "role": role, "name": existing.get("name"),
        "user_id": existing["id"], "where": where,
        "message": (f"{new_email} is already the {role} login for {existing.get('name') or 'someone'} ({where}). "
                    f"To KEEP that {role} login, change its email first (Logins list below, or the owner's Staff → Managers → Change email) and retry. "
                    f"Or use 'Take over' to turn that {role} login into this business's owner login."),
    }


async def _email_new_credentials(t: dict, new_email: str, temp_pw: str) -> dict:
    from email_service import _credentials_email_html, _send_email
    try:
        return await _send_email([new_email], f"🔑 Your Miracurl owner login — {t['name']}",
                                 _credentials_email_html(t["name"], new_email, temp_pw))
    except Exception as e:  # noqa: BLE001 — credentials are also returned on screen
        log.warning("owner credentials email failed: %s", e)
        return {"sent": False, "error": str(e)}


async def _link_existing_owner(existing: dict, tid: str) -> dict:
    sets = {"tenant_ids": sorted(owned_tenant_ids(existing) | {tid})}
    if not existing.get("tenant_id"):
        sets["tenant_id"] = tid
    await _raw_db.users.update_one({"id": existing["id"]}, {"$set": sets})
    return {"mode": "linked_existing_owner", "owner_salon_count": len(sets["tenant_ids"])}


async def _take_over_login(existing: dict, tid: str, now: str, by: str) -> dict:
    await _raw_db.users.update_one(
        {"id": existing["id"]},
        {"$set": {"role": "admin", "tenant_id": tid, "tenant_ids": sorted(owned_tenant_ids(existing) | {tid}),
                  "status": "active", "disabled": False, "promoted_to_owner_at": now, "promoted_by": by},
         "$unset": {"branch": ""}})
    return {"mode": f"took_over_{existing.get('role') or 'user'}_login"}


async def _rename_owner_login(owner: dict, old_email: str, new_email: str, now: str, by: str) -> dict:
    await _raw_db.users.update_one(
        {"id": owner["id"]},
        {"$set": {"email": new_email, "login_email_changed_at": now},
         "$push": {"previous_emails": {"email": old_email, "changed_at": now, "by": by}}})
    r = await _raw_db.tenants.update_many({"owner_email": old_email}, {"$set": {"owner_email": new_email}})
    return {"mode": "renamed_login", "branches_updated": r.modified_count}


async def _create_owner_login(t: dict, new_email: str, now: str, by: str) -> dict:
    from routes.staff_admin import _generate_temp_password
    temp_pw = _generate_temp_password()
    await _raw_db.users.insert_one({
        "id": str(uuid.uuid4()), "email": new_email, "name": t.get("owner_name") or "Owner",
        "role": "admin", "tenant_id": t["id"], "tenant_ids": [t["id"]], "status": "active",
        "password_hash": hash_pw(temp_pw), "must_change_password": True, "created_at": now, "created_by": by})
    return {"mode": "created_login", "temp_password": temp_pw, "email_status": await _email_new_credentials(t, new_email, temp_pw)}


async def _apply_owner_change(t: dict, owner: dict | None, existing: dict | None, new_email: str, old_email: str,
                              scope: str, takeover: bool, now: str, by: str) -> dict:
    """Pick the one mode that applies; returns the result fragment (mode + extras)."""
    tid = t["id"]
    if existing and owner and existing["id"] == owner["id"]:
        return {"mode": "unchanged_login"}
    if existing and existing.get("role") == "admin":
        out = await _link_existing_owner(existing, tid)
    elif existing:
        if not takeover:
            raise HTTPException(409, await _conflict_detail(existing, new_email))
        out = await _take_over_login(existing, tid, now, by)
    elif owner and (scope == "all" or owned_tenant_ids(owner) <= {tid}):
        return await _rename_owner_login(owner, old_email, new_email, now, by)
    else:
        out = await _create_owner_login(t, new_email, now, by)
    if owner:
        out.update(await _detach_owner(owner, tid))
    return out


async def change_owner_email(t: dict, new_email: str, scope: str = "all", takeover: bool = False, by: str = "hq") -> dict:
    """scope: 'all' renames a shared login for every branch on it; 'this' gives THIS business its own login."""
    tid, now = t["id"], datetime.now(timezone.utc).isoformat()
    old_email = (t.get("owner_email") or "").lower()
    owner = await _raw_db.users.find_one({"email": old_email, "role": "admin"}) if old_email else None
    existing = await _raw_db.users.find_one({"email": new_email})
    result: dict = {"owner_email": new_email, "previous_owner_email": old_email}
    result.update(await _apply_owner_change(t, owner, existing, new_email, old_email, scope, takeover, now, by))
    await _raw_db.tenants.update_one({"id": tid}, {"$set": {"owner_email": new_email}})
    if old_email:
        await _raw_db.login_attempts.delete_many({"identifier": {"$regex": f"{re.escape(old_email)}$"}})
    log.info("[Miracurl] owner email %s -> %s for tenant %s (%s) by %s", old_email, new_email, tid, result["mode"], by)
    return result


async def rename_login_email(u: dict, new_email: str, by: str) -> dict:
    """Rename ANY login (manager/staff/owner) keeping password, role, branch lock and history."""
    old = (u.get("email") or "").lower()
    if old == new_email:
        raise HTTPException(400, "That is already this login's email")
    if await _raw_db.users.find_one({"email": new_email}, {"_id": 1}):
        raise HTTPException(400, f"{new_email} is already used by another login — pick a different one")
    now = datetime.now(timezone.utc).isoformat()
    await _raw_db.users.update_one(
        {"id": u["id"]},
        {"$set": {"email": new_email, "login_email_changed_at": now},
         "$push": {"previous_emails": {"email": old, "changed_at": now, "by": by}}})
    await _raw_db.staff.update_many({"user_id": u["id"]}, {"$set": {"email": new_email}})
    if u.get("role") == "admin" and old:
        await _raw_db.tenants.update_many({"owner_email": old}, {"$set": {"owner_email": new_email}})
    if old:
        await _raw_db.login_attempts.delete_many({"identifier": {"$regex": f"{re.escape(old)}$"}})
    log.info("[Miracurl] login email %s -> %s (%s) by %s", old, new_email, u.get("role"), by)
    return {"ok": True, "id": u["id"], "email": new_email, "previous_email": old, "role": u.get("role")}
