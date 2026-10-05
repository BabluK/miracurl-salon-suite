"""One cold-start round-trip: session + tenant + dashboard KPIs in a single response.
Saves 1-2 full client↔server round-trips on every app open (≈300-600 ms for owners far from the server)."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from security import get_current_user, current_tenant
from routes.auth import _attach_salons
from routes.tenant_settings import get_current_tenant
from routes.reports import dashboard as _dashboard

router = APIRouter()


@router.get("/bootstrap")
async def bootstrap(dash: int = 0, branch: Optional[str] = None, user=Depends(get_current_user)):
    out = {"user": await _attach_salons(user), "tenant": None, "dashboard": None}
    if user.get("role") == "super_admin":
        return out
    try:
        t = await current_tenant(user)
    except HTTPException:
        return out
    out["tenant"] = await get_current_tenant(t)
    if dash and user.get("role") in ("admin", "manager"):
        try:
            out["dashboard"] = await _dashboard(branch, user, t)
        except HTTPException:
            pass
    return out
