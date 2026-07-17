"""Shared billing domain: invoice totals, coupons, memberships, loyalty, receipts."""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import HTTPException

from database import db
from receipt_email import send_invoice_receipt_email
from utils import _pay_label
from sms_service import send_sms


async def _gen_invoice_no():
    count = await db.invoices.count_documents({}) + 1
    return f"INV-{datetime.now(timezone.utc).strftime('%Y%m')}-{count:04d}"


async def _check_stock_or_400(items) -> dict:
    """Aggregate product quantities, verify stock; return {product_id: qty_needed}."""
    needed = {}
    for it in items:
        if it.type == "product":
            needed[it.ref_id] = needed.get(it.ref_id, 0) + it.qty
    for pid, qty in needed.items():
        prod = await db.products.find_one({"id": pid}, {"_id": 0, "name": 1, "stock": 1})
        if not prod:
            raise HTTPException(400, f"Product not found: {pid}")
        if prod["stock"] < qty:
            raise HTTPException(400, f"Insufficient stock for '{prod['name']}' — {prod['stock']} left, {qty} requested")
    return needed


async def _validate_coupon(code: Optional[str]):
    """Returns coupon doc or raises 400. None code → None."""
    if not code:
        return None
    c = await db.coupons.find_one({"code": code.strip().upper(), "active": True}, {"_id": 0})
    if not c:
        raise HTTPException(400, "Invalid coupon code")
    if c.get("expires_at") and c["expires_at"] < datetime.now(timezone.utc).date().isoformat():
        raise HTTPException(400, "This coupon has expired")
    if c.get("max_uses") and int(c.get("used_count") or 0) >= int(c["max_uses"]):
        raise HTTPException(400, "This coupon has reached its usage limit")
    return c


def _coupon_discount(coupon, amount: float) -> float:
    if not coupon or amount <= 0:
        return 0.0
    if coupon["type"] == "percent":
        return round(amount * float(coupon["value"]) / 100, 2)
    return round(min(float(coupon["value"]), amount), 2)


async def _consume_coupon(coupon) -> bool:
    """SEC-002: atomically increment used_count only while under max_uses.
    Returns True if consumed, False if the limit was hit under concurrency."""
    if not coupon:
        return False
    if coupon.get("max_uses"):
        res = await db.coupons.update_one(
            {"id": coupon["id"], "used_count": {"$lt": int(coupon["max_uses"])}},
            {"$inc": {"used_count": 1}})
        return res.modified_count == 1
    await db.coupons.update_one({"id": coupon["id"]}, {"$inc": {"used_count": 1}})
    return True


async def _active_membership(customer_id: str):
    now = datetime.now(timezone.utc).isoformat()
    return await db.customer_memberships.find_one(
        {"customer_id": customer_id, "expires_at": {"$gt": now}}, {"_id": 0}, sort=[("discount_pct", -1)])


def _redeemable_points(cust: dict, redeem_points: int, raw_subtotal: float,
                       remaining: float, loyalty_rules: Optional[dict]) -> int:
    """How many loyalty points can actually be redeemed on this bill."""
    req_points = max(0, int(redeem_points or 0))
    if loyalty_rules:
        if raw_subtotal < float(loyalty_rules.get("min_bill_to_redeem") or 0):
            return 0
        cap = int(loyalty_rules.get("max_redeem_per_visit") or 0)
        if cap > 0:
            req_points = min(req_points, cap)
    points_available = int(cust.get("loyalty_points") or 0)
    return min(req_points, points_available, int(remaining))


def _compute_invoice_totals(items, cust: dict, discount_in: float, tax_pct: float,
                            membership_pct: float = 0.0, coupon=None, redeem_points: int = 0,
                            loyalty_rules: Optional[dict] = None) -> dict:
    raw_subtotal = sum(it.qty * it.price for it in items)
    services_subtotal = sum(it.qty * it.price for it in items if it.type == "service")
    membership_discount = round(services_subtotal * (membership_pct or 0) / 100, 2)
    remaining = max(0, raw_subtotal - (discount_in or 0) - membership_discount)
    coupon_discount = _coupon_discount(coupon, remaining)
    remaining = max(0, remaining - coupon_discount)
    referral_credit_available = float(cust.get("referral_credit") or 0)
    referral_credit_used = min(referral_credit_available, remaining)
    remaining = max(0, remaining - referral_credit_used)
    points_used = _redeemable_points(cust, redeem_points, raw_subtotal, remaining, loyalty_rules)
    discount = (discount_in or 0) + membership_discount + coupon_discount + referral_credit_used + points_used
    taxable = max(0, raw_subtotal - discount)
    tax = taxable * (tax_pct or 0) / 100
    return {
        "subtotal": raw_subtotal,
        "discount": discount,
        "tax": tax,
        "total": taxable + tax,
        "referral_credit_used": referral_credit_used,
        "membership_discount": membership_discount,
        "coupon_discount": coupon_discount,
        "points_used": points_used,
    }


LOYALTY_EARN_PER_100 = 5  # default points per ₹100 of final bill; 1 point = ₹1
LOYALTY_DEFAULTS = {"earn_per_100": LOYALTY_EARN_PER_100, "max_redeem_per_visit": 200, "min_bill_to_redeem": 1000}


def _loyalty_rules(tenant_doc: Optional[dict]) -> dict:
    saved = (tenant_doc or {}).get("loyalty") or {}
    return {**LOYALTY_DEFAULTS, **{k: v for k, v in saved.items() if k in LOYALTY_DEFAULTS}}


async def _process_benefit_items(inv: dict, cust: dict):
    """Create package/membership records for purchases; consume redeemed sessions."""
    now = datetime.now(timezone.utc)
    for it in inv["items"]:
        if it["type"] == "package":
            p = await db.packages.find_one({"id": it["ref_id"]}, {"_id": 0})
            if p:
                await db.customer_packages.insert_one({
                    "id": str(uuid.uuid4()), "customer_id": cust["id"], "customer_name": cust["name"],
                    "package_id": p["id"], "package_name": p["name"], "service_id": p.get("service_id"),
                    "service_name": p.get("service_name"), "sessions_left": int(p["sessions"]),
                    "sessions_total": int(p["sessions"]),
                    "expires_at": (now + timedelta(days=int(p.get("validity_days") or 365))).isoformat(),
                    "purchased_at": now.isoformat(), "invoice_id": inv["id"]})
        elif it["type"] == "membership":
            m = await db.memberships.find_one({"id": it["ref_id"]}, {"_id": 0})
            if m:
                await db.customer_memberships.insert_one({
                    "id": str(uuid.uuid4()), "customer_id": cust["id"], "customer_name": cust["name"],
                    "membership_id": m["id"], "name": m["name"], "discount_pct": float(m["discount_pct"]),
                    "expires_at": (now + timedelta(days=int(m.get("validity_days") or 180))).isoformat(),
                    "purchased_at": now.isoformat(), "invoice_id": inv["id"]})
        elif it["type"] == "package_redeem":
            await db.customer_packages.update_one(
                {"id": it["ref_id"], "sessions_left": {"$gt": 0}}, {"$inc": {"sessions_left": -1}})


async def _validate_package_redeem_items(items: list, cust: dict):
    """Package-redeem lines must belong to this customer, have sessions left and
    not be expired; their price is forced to ₹0 (session pays, not money)."""
    now_iso = datetime.now(timezone.utc).isoformat()
    for it in items:
        if it.type == "package_redeem":
            cp = await db.customer_packages.find_one({"id": it.ref_id}, {"_id": 0})
            if not cp or cp["customer_id"] != cust["id"]:
                raise HTTPException(400, "Package not found for this guest")
            if cp["sessions_left"] < 1:
                raise HTTPException(400, f"No sessions left in '{cp['package_name']}'")
            if cp["expires_at"] < now_iso:
                raise HTTPException(400, f"Package '{cp['package_name']}' has expired")
            it.price = 0.0
            it.qty = 1


def _receipt_sms_text(t: dict, inv: dict, points_earned: int) -> str:
    name = (t or {}).get("name") or "Your Salon"
    pts = f" You earned {points_earned} loyalty pts." if points_earned else ""
    review = f" Loved it? Review us: {t['google_review_url']}" if (t or {}).get("google_review_url") else ""
    return (f"{name}: Thank you {inv['customer_name']}! Receipt {inv['invoice_no']} - "
            f"Rs.{inv['total']:.0f} paid via {_pay_label(inv['payment_mode'])}.{pts}{review}")


async def _send_billing_receipts(inv: dict, cust: dict, tenant_doc: Optional[dict], points_earned: int) -> dict:
    """Post-billing receipts. Email is free; each SMS burns 1 sms_point (credited by HQ)."""
    out = {"email": None, "sms": None}
    t = tenant_doc or {}
    try:
        if cust.get("email"):
            out["email"] = await send_invoice_receipt_email(t, inv, cust["email"], points_earned)
        else:
            out["email"] = {"sent": False, "error": "no_email"}
    except Exception as e:  # noqa: BLE001 — receipts must never break checkout
        out["email"] = {"sent": False, "error": str(e)[:200]}
    try:
        if not cust.get("phone"):
            out["sms"] = {"sent": False, "error": "no_phone"}
        elif not t.get("id"):
            out["sms"] = {"sent": False, "error": "no_tenant"}
        else:
            r = await db.tenants.update_one(
                {"id": t["id"], "sms_points": {"$gte": 1}}, {"$inc": {"sms_points": -1}})
            if r.modified_count == 0:
                out["sms"] = {"sent": False, "error": "no_sms_points"}
            else:
                res = await send_sms(cust["phone"], _receipt_sms_text(t, inv, points_earned))
                if not res.get("sent"):
                    await db.tenants.update_one({"id": t["id"]}, {"$inc": {"sms_points": 1}})
                fresh = await db.tenants.find_one({"id": t["id"]}, {"_id": 0, "sms_points": 1})
                res["points_left"] = int((fresh or {}).get("sms_points") or 0)
                out["sms"] = res
    except Exception as e:  # noqa: BLE001
        out["sms"] = {"sent": False, "error": str(e)[:200]}
    return out
