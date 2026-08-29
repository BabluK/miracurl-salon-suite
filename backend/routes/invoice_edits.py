"""Invoice post-billing edits — editor-name audit trail + optional Owner PIN gate.

PIN behaviour follows require_owner_pin: no-op until the owner sets a Security
PIN in Settings, then every edit needs the X-Owner-Pin header.
Wallet/points bills are locked (money already moved from customer balances).
"""
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from database import db, _clean
from models import InvoiceItem
from security import require_admin, require_owner_pin, require_tenant_admin, current_tenant

router = APIRouter()

ALLOWED_MODES = {"cash", "card", "upi"}


class InvoiceEditIn(BaseModel):
    editor_name: str = Field(..., min_length=2, max_length=60)
    payment_mode: Optional[str] = None
    items: Optional[List[InvoiceItem]] = None
    manual_discount: Optional[float] = Field(None, ge=0)
    customer_name: Optional[str] = Field(None, max_length=80)
    customer_phone: Optional[str] = Field(None, max_length=20)


def _fixed_credits(inv: dict) -> float:
    return float(inv.get("membership_discount") or 0) + float(inv.get("coupon_discount") or 0) + float(inv.get("points_used") or 0)


def _derived_tax_pct(inv: dict, tenant_doc: dict) -> float:
    taxable = float(inv["subtotal"]) - float(inv.get("discount") or 0)
    if taxable > 0 and float(inv.get("tax") or 0) > 0:
        return round(float(inv["tax"]) / taxable * 100, 2)
    if (tenant_doc or {}).get("tax_enabled"):
        return float(tenant_doc.get("tax_pct") or 0)
    return 0.0


def _validate_edit(inv: dict, body: InvoiceEditIn) -> None:
    if inv.get("payment_mode") == "salon_wallet" or float(inv.get("points_used") or 0) > 0:
        raise HTTPException(400, "This bill used wallet/loyalty balance and is locked — void it and re-bill instead.")
    if body.payment_mode and body.payment_mode not in ALLOWED_MODES:
        raise HTTPException(400, f"Payment mode must be one of {sorted(ALLOWED_MODES)}")
    if body.items is not None and not body.items:
        raise HTTPException(400, "A bill needs at least one item")


def _recompute_totals(inv: dict, body: InvoiceEditIn, tenant_doc: dict) -> dict:
    items = [i.model_dump() for i in body.items] if body.items is not None else inv["items"]
    fixed = _fixed_credits(inv)
    old_manual = max(0.0, float(inv.get("discount") or 0) - fixed)
    manual = body.manual_discount if body.manual_discount is not None else old_manual
    subtotal = round(sum(i["qty"] * i["price"] for i in items), 2)
    discount = round(min(manual + fixed, subtotal), 2)
    tax_pct = _derived_tax_pct(inv, tenant_doc)
    taxable = max(0.0, subtotal - discount)
    tax = round(taxable * tax_pct / 100, 2)
    return {"payment_mode": body.payment_mode or inv["payment_mode"], "items": items,
            "subtotal": subtotal, "discount": discount, "tax": tax,
            "total": round(taxable + tax, 2)}


def _ensure_editable_month(inv: dict, t: dict) -> None:
    """Month lock: only current-month bills (tenant timezone) are editable."""
    from routes.reports import _tenant_tz
    tz = _tenant_tz(t)
    now_local = datetime.now(tz)
    try:
        cdt = datetime.fromisoformat(str(inv.get("created_at") or "").replace("Z", "+00:00"))
        if cdt.tzinfo is None:
            cdt = cdt.replace(tzinfo=timezone.utc)
    except ValueError:
        return
    if cdt < datetime(now_local.year, now_local.month, 1, tzinfo=tz):
        raise HTTPException(400, "Bills from previous months are locked and can't be edited")


async def _sync_linked_customer(inv: dict, body: InvoiceEditIn, delta: float) -> None:
    """Keep the linked CRM customer in sync (name/phone + lifetime spend delta)."""
    import re as _re
    cust_set = {}
    if body.customer_name is not None and body.customer_name.strip():
        cust_set["name"] = body.customer_name.strip()
    if body.customer_phone is not None and body.customer_phone.strip():
        cust_set["phone"] = _re.sub(r"[^0-9+]", "", body.customer_phone.strip())
    ops = {}
    if cust_set:
        ops["$set"] = cust_set
    if abs(delta) > 0.009 and inv.get("status") not in ("voided", "open"):
        ops["$inc"] = {"total_spent": delta}
    if ops:
        await db.customers.update_one({"id": inv["customer_id"]}, ops)


@router.put("/invoices/{inv_id}")
async def edit_invoice(inv_id: str, body: InvoiceEditIn, user=Depends(require_admin),
                       t=Depends(current_tenant)):
    # Owner PIN intentionally NOT required here — desk staff fix wrong bills themselves.
    # Every edit is still fully audited in invoice_edits (viewing/purging the trail stays PIN-locked).
    inv = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    _ensure_editable_month(inv, t)
    _validate_edit(inv, body)

    before = {"payment_mode": inv["payment_mode"], "items": inv["items"],
              "subtotal": inv["subtotal"], "discount": inv["discount"],
              "tax": inv["tax"], "total": inv["total"],
              "customer_name": inv.get("customer_name", "")}
    after = _recompute_totals(inv, body, t)
    updates = {**after,
               "last_edited_by": body.editor_name.strip(),
               "last_edited_at": datetime.now(timezone.utc).isoformat()}
    if body.customer_name is not None and body.customer_name.strip():
        updates["customer_name"] = body.customer_name.strip()
        after["customer_name"] = updates["customer_name"]
    await db.invoices.update_one({"id": inv_id}, {"$set": updates, "$inc": {"edit_count": 1}})
    if inv.get("customer_id"):
        await _sync_linked_customer(inv, body, round(float(after["total"]) - float(before["total"]), 2))
    updates["edit_count"] = int(inv.get("edit_count") or 0) + 1
    await db.invoice_edits.insert_one({
        "id": str(uuid.uuid4()), "invoice_id": inv_id, "invoice_no": inv["invoice_no"],
        "customer_name": inv.get("customer_name", ""),
        "editor_name": body.editor_name.strip(), "edited_by_account": user.get("email", ""),
        "edited_at": datetime.now(timezone.utc).isoformat(),
        "before": before, "after": after})
    return _clean({**inv, **updates})


class InvoiceVoidIn(BaseModel):
    editor_name: str = Field(..., min_length=2, max_length=60)
    reason: str = Field("", max_length=200)


@router.post("/invoices/{inv_id}/void")
async def void_invoice(inv_id: str, body: InvoiceVoidIn, user=Depends(require_admin),
                       t=Depends(current_tenant), _pin=Depends(require_owner_pin)):
    """Mark a wrongly-punched bill as voided — excluded from all revenue reports. Audited."""
    inv = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.get("status") == "voided":
        raise HTTPException(400, "This bill is already voided")
    now = datetime.now(timezone.utc).isoformat()
    await db.invoices.update_one({"id": inv_id}, {"$set": {
        "status": "voided", "voided_at": now,
        "voided_by": body.editor_name.strip(), "void_reason": body.reason.strip()}})
    await db.invoice_edits.insert_one({
        "id": str(uuid.uuid4()), "invoice_id": inv_id, "invoice_no": inv["invoice_no"],
        "customer_name": inv.get("customer_name", ""), "action": "void",
        "editor_name": body.editor_name.strip(), "edited_by_account": user.get("email", ""),
        "edited_at": now, "before": {"total": inv["total"], "status": inv.get("status") or "paid"},
        "after": {"status": "voided", "reason": body.reason.strip()}})
    return {"ok": True, "invoice_no": inv["invoice_no"]}


@router.get("/invoice-edits")
async def list_invoice_edits(user=Depends(require_admin), _pin=Depends(require_owner_pin)):
    return [_clean(e) for e in await db.invoice_edits.find({}, {"_id": 0}).sort("edited_at", -1).to_list(200)]


@router.delete("/invoice-edits/bulk")
async def bulk_delete_invoice_edits(scope: str = "older_than_30d", user=Depends(require_tenant_admin),
                                    t=Depends(current_tenant), _pin=Depends(require_owner_pin)):
    if scope == "all":
        if user.get("role") != "super_admin" and not (t or {}).get("security_pin_hash"):
            raise HTTPException(403, "Set an Owner Security PIN in Settings before purging the full audit trail.")
        q = {}
    elif scope == "older_than_30d":
        cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        q = {"edited_at": {"$lt": cutoff}}
    else:
        raise HTTPException(400, "scope must be 'older_than_30d' or 'all'")
    res = await db.invoice_edits.delete_many(q)
    return {"deleted": res.deleted_count}
