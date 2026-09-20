"""Login email management: owner changes a manager's login email; HQ lists & renames any login of a tenant."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

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
