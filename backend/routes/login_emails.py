"""Login email management: owner changes a manager's login email; HQ lists & renames any login of a tenant."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from database import _raw_db
from security import current_tenant, log_audit, require_super_admin, require_tenant_admin
from services.owner_email import owned_tenant_ids, rename_login_email

router = APIRouter()


class LoginEmailIn(BaseModel):
    email: EmailStr
    merge: bool = False  # email already belongs to another manager here → keep ONE login for all branches


async def _merge_managers(u: dict, keep: dict, t: dict, admin: dict) -> dict:
    """Two manager logins for one person → keep `keep`, unlock its branch (GPS picks it at sign-in), drop `u`."""
    await _raw_db.users.update_one({"id": keep["id"]}, {"$set": {"branch": ""}})
    await _raw_db.users.delete_one({"id": u["id"]})
    await _raw_db.sessions.delete_many({"user_id": u["id"]})
    await _raw_db.staff.update_many({"user_id": u["id"]}, {"$unset": {"user_id": ""}})  # staff history stays
    await log_audit(t["id"], admin, "manager_merge",
                    f"Manager logins merged: {u.get('email')} removed → {keep.get('email')} now covers every branch (GPS picks it at sign-in)")
    return {"ok": True, "merged": True, "id": keep["id"], "email": keep["email"], "removed": u.get("email"), "role": "manager"}


@router.patch("/managers/{uid}/email")
async def set_manager_email(uid: str, body: LoginEmailIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Change a manager's login email — password, branch lock and staff history stay.
    If the email already belongs to another manager of this salon, `merge` keeps one login for all branches."""
    u = await _raw_db.users.find_one({"id": uid, "tenant_id": t["id"], "role": "manager"}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(404, "Manager not found")
    new_email = body.email.lower().strip()
    other = await _raw_db.users.find_one({"email": new_email, "id": {"$ne": uid}}, {"_id": 0, "password_hash": 0})
    if other and other.get("role") == "manager" and other.get("tenant_id") == t["id"]:
        if body.merge:
            return await _merge_managers(u, other, t, admin)
        br = other.get("branch") or ""
        where = "the main salon" if br == "__main__" else (br or "all branches")
        raise HTTPException(409, {"code": "manager_email_in_use", "name": other.get("name"), "branch": br, "keep_id": other["id"],
                                  "message": f"{new_email} is already the manager login for {other.get('name')} ({where}). "
                                             "One person needs only ONE manager login — merge them and the branch is picked by GPS at every sign-in."})
    out = await rename_login_email(u, new_email, admin.get("email", "owner"))
    await log_audit(t["id"], admin, "manager_email", f"Manager login email {out['previous_email']} → {out['email']}")
    return out


@router.get("/super-admin/tenants/{tid}/logins")
async def sa_tenant_logins(tid: str, user=Depends(require_super_admin)):
    """Every login that can open this business: owner(s), managers, staff — with role & branch."""
    t = await _raw_db.tenants.find_one({"id": tid}, {"_id": 0, "owner_email": 1})
    if not t:
        raise HTTPException(404, "Tenant not found")
    rows = await _raw_db.users.find(
        {"$or": [{"tenant_id": tid}, {"tenant_ids": tid}]},
        {"_id": 0, "id": 1, "email": 1, "name": 1, "role": 1, "branch": 1, "disabled": 1, "must_change_password": 1,
         "last_login_at": 1, "tenant_id": 1, "tenant_ids": 1}).to_list(300)
    order = {"admin": 0, "manager": 1, "staff": 2}
    owner_email = (t.get("owner_email") or "").lower()
    for r in rows:
        r["is_owner"] = r.get("role") == "admin" and (r.get("email") or "").lower() == owner_email
        r["salon_count"] = len(owned_tenant_ids(r))
        r.pop("tenant_ids", None)
    rows.sort(key=lambda r: (order.get(r.get("role"), 9), not r["is_owner"], r.get("email") or ""))
    return {"owner_email": owner_email, "logins": rows}


@router.put("/super-admin/users/{uid}/email")
async def sa_rename_login(uid: str, body: LoginEmailIn, user=Depends(require_super_admin)):
    u = await _raw_db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(404, "Login not found")
    if u.get("role") == "super_admin":
        raise HTTPException(400, "Change HQ logins from your own profile, not here")
    return await rename_login_email(u, body.email.lower().strip(), user.get("email", "hq"))


TEST_LOGIN_RE = r"(@test\.com$|^test_user_|^test_staff_|^staff_rev_|^stafftest@)"


@router.get("/super-admin/tenants/{tid}/test-logins")
async def sa_test_logins(tid: str, user=Depends(require_super_admin)):
    """Junk logins left behind by automated test runs (…@test.com, test_user_…) — never real people."""
    rows = await _raw_db.users.find({"tenant_id": tid, "role": {"$ne": "admin"}, "email": {"$regex": TEST_LOGIN_RE}},
                                    {"_id": 0, "id": 1, "email": 1, "name": 1, "role": 1}).to_list(200)
    return {"items": rows, "count": len(rows)}


@router.delete("/super-admin/tenants/{tid}/test-logins")
async def sa_delete_test_logins(tid: str, user=Depends(require_super_admin)):
    q = {"tenant_id": tid, "role": {"$ne": "admin"}, "email": {"$regex": TEST_LOGIN_RE}}
    ids = [u["id"] for u in await _raw_db.users.find(q, {"_id": 0, "id": 1}).to_list(200)]
    if not ids:
        return {"ok": True, "removed": 0}
    await _raw_db.users.delete_many({"id": {"$in": ids}})
    await _raw_db.sessions.delete_many({"user_id": {"$in": ids}})
    staff = await _raw_db.staff.delete_many({"tenant_id": tid, "$or": [{"user_id": {"$in": ids}}, {"email": {"$regex": TEST_LOGIN_RE}}]})
    await log_audit(tid, user, "test_logins_purged", f"HQ removed {len(ids)} test logins and {staff.deleted_count} test staff profiles")
    return {"ok": True, "removed": len(ids), "staff_removed": staff.deleted_count}


class RoleIn(BaseModel):
    role: str = Field(..., pattern="^(admin|manager)$")
    tenant_ids: list[str] = Field(default_factory=list)  # businesses this login should cover (manager: GPS picks at sign-in)


@router.put("/super-admin/users/{uid}/role")
async def sa_set_role(uid: str, body: RoleIn, user=Depends(require_super_admin)):
    """Owner ⇄ manager for one login; keeps password. Managers get tenant_ids (one login, many businesses)."""
    u = await _raw_db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not u or u.get("role") not in ("admin", "manager", "staff"):
        raise HTTPException(404, "Login not found")
    if body.role == "manager" and await _raw_db.tenants.find_one({"owner_email": u["email"]}, {"_id": 1}):
        raise HTTPException(409, f"{u['email']} is still the OWNER email of a business — change that owner email first")
    ids = sorted(set(body.tenant_ids or []) | set(u.get("tenant_ids") or []) | ({u["tenant_id"]} if u.get("tenant_id") else set()))
    if await _raw_db.tenants.count_documents({"id": {"$in": ids}}) != len(ids):
        raise HTTPException(400, "Unknown tenant in tenant_ids")
    sets = {"role": body.role, "tenant_ids": ids, "tenant_id": u.get("tenant_id") if u.get("tenant_id") in ids else ids[0], "branch": ""}
    await _raw_db.users.update_one({"id": uid}, {"$set": sets, "$unset": {"staff_id": ""}})
    await log_audit(sets["tenant_id"], user, "role_change", f"HQ set {u['email']} → {body.role} across {len(ids)} business(es)")
    return {"ok": True, "id": uid, "email": u["email"], **sets}
