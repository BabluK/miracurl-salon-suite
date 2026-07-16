"""New Salon Setup Wizard — progress tracking for tenant onboarding."""
from fastapi import APIRouter, Depends

from database import db
from security import require_tenant_admin, current_tenant

router = APIRouter()


@router.get("/setup/status")
async def setup_status(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    services = await db.services.count_documents({"active": True})
    staff = await db.staff.count_documents({"active": True})
    progress = {
        "profile": bool(t.get("logo_url")) or bool(t.get("phone") and t.get("location")),
        "services": services > 0,
        "staff": staff > 0,
        "hours": bool(t.get("hours")),
        "payment": bool(t.get("tax_enabled")) or bool(t.get("setup_payment_done")),
    }
    return {
        "done": bool(t.get("setup_done")) or all(progress.values()),
        "progress": progress,
        "counts": {"services": services, "staff": staff},
        "remaining": sum(1 for v in progress.values() if not v),
    }


@router.post("/setup/payment-done")
async def setup_payment_done(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Owner explicitly chose 'no tax / skip' — mark the payment step handled."""
    await db.tenants.update_one({"id": t["id"]}, {"$set": {"setup_payment_done": True}})
    return {"ok": True}


@router.post("/setup/complete")
async def setup_complete(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    await db.tenants.update_one({"id": t["id"]}, {"$set": {"setup_done": True}})
    return {"ok": True}
