"""Shared billing domain: invoice totals, coupons, memberships, loyalty, receipts."""
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import HTTPException

from database import db
from utils import _pay_label


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


async def _apply_membership_cashback(inv: dict, cust: dict) -> float:
    """Premium membership perk: X% of the bill (excluding membership purchase lines)
    lands back in the customer's wallet as spendable balance."""
    m = await _active_membership(cust["id"])
    pct = float((m or {}).get("cashback_pct") or 0)
    if not m or pct <= 0:
        return 0.0
    base = float(inv.get("total") or 0) - sum(
        float(i.get("price") or 0) * int(i.get("qty") or 1)
        for i in inv.get("items", []) if i.get("type") == "membership")
    cashback = round(max(0.0, base) * pct / 100, 2)
    if cashback <= 0:
        return 0.0
    await db.customers.update_one({"id": cust["id"]}, {"$inc": {"wallet_balance": cashback}})
    await db.wallet_txns.insert_one({
        "id": str(uuid.uuid4()), "customer_id": cust["id"], "customer_name": cust.get("name"),
        "type": "membership_cashback", "amount": cashback, "bonus": 0,
        "note": f"{pct:g}% member cashback on {inv.get('invoice_no')}",
        "invoice_id": inv.get("id"), "member_id": m.get("member_id") or "",
        "at": datetime.now(timezone.utc).isoformat()})
    return cashback


async def _process_benefit_items(inv: dict, cust: dict):
    """Create package/membership records for purchases; consume redeemed sessions.
    Returns the list of memberships issued (for the POS congratulations popup)."""
    now = datetime.now(timezone.utc)
    issued = []
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
                from routes.premium_membership import _unique_member_id, send_membership_welcome_email
                member_id = await _unique_member_id()
                cm = {
                    "id": str(uuid.uuid4()), "customer_id": cust["id"], "customer_name": cust["name"],
                    "membership_id": m["id"], "name": m["name"], "tier": m.get("tier") or "custom",
                    "member_id": member_id, "amount": float(it["price"]) * int(it.get("qty") or 1),
                    "discount_pct": float(m["discount_pct"]),
                    "cashback_pct": float(m.get("cashback_pct") or 0),
                    "benefits": m.get("benefits") or [], "source": "pos",
                    "expires_at": (now + timedelta(days=int(m.get("validity_days") or 180))).isoformat(),
                    "purchased_at": now.isoformat(), "invoice_id": inv["id"]}
                await db.customer_memberships.insert_one(cm)
                email_sent = False
                if cust.get("email"):
                    try:
                        from database import _raw_db
                        saved = await db.customer_memberships.find_one({"id": cm["id"]}, {"_id": 0})
                        t = await _raw_db.tenants.find_one({"id": (saved or {}).get("tenant_id")}, {"_id": 0})
                        st = await send_membership_welcome_email(saved or cm, cust, t or {})
                        email_sent = bool((st or {}).get("sent"))
                    except Exception:
                        pass
                issued.append({
                    "customer_membership_id": cm["id"], "member_id": member_id,
                    "plan_name": m["name"], "tier": cm["tier"], "amount": cm["amount"],
                    "discount_pct": cm["discount_pct"], "cashback_pct": cm["cashback_pct"],
                    "purchased_at": cm["purchased_at"], "expires_at": cm["expires_at"],
                    "email_sent": email_sent})
        elif it["type"] == "package_redeem":
            await db.customer_packages.update_one(
                {"id": it["ref_id"], "sessions_left": {"$gt": 0}}, {"$inc": {"sessions_left": -1}})
    return issued


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
    from receipt_email import _smart_review_url
    name = (t or {}).get("name") or "Your Salon"
    pts = f" You earned {points_earned} loyalty pts." if points_earned else ""
    review = f" Loved it? Rate us (Mira writes your review!): {_smart_review_url(t, inv)}"
    return (f"{name}: Thank you {inv['customer_name']}! Receipt {inv['invoice_no']} - "
            f"Rs.{inv['total']:.0f} paid via {_pay_label(inv['payment_mode'])}.{pts}{review}")


async def _queue_review_request(inv: dict, cust: dict) -> None:
    """Review Booster: after billing, drop a ready-to-send WhatsApp into the approvals
    widget asking the guest to rate — the smart funnel routes 4★+ straight to Google."""
    if not cust.get("phone"):
        return
    from database import _raw_db
    from receipt_email import _smart_review_url
    t = await _raw_db.tenants.find_one({"id": inv["tenant_id"]}, {"_id": 0})
    if not t:
        return
    first = (cust.get("name") or "there").split(" ")[0]
    msg = (f"Hi {first}! ✦ Thank you for visiting {t.get('name') or 'us'} today. "
           f"Loved your experience? Tap to rate us — Mira even writes your Google review for you: "
           f"{_smart_review_url(t, inv)}")
    await _raw_db.whatsapp_requests.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": inv["tenant_id"],
        "requested_by": "mira", "requested_by_name": "Mira (auto)",
        "client_name": cust.get("name") or "", "client_phone": cust.get("phone") or "",
        "message": msg, "kind": "review_request", "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()})


def _receipt_whatsapp_url(t: dict, inv: dict, phone: str, points_earned: int) -> str | None:
    """wa.me link the cashier taps to send the receipt + smart review link on WhatsApp (free)."""
    from urllib.parse import quote
    from receipt_email import _smart_review_url
    num = re.sub(r"\D", "", phone or "")
    if not num:
        return None
    name = (t or {}).get("name") or "Your Salon"
    pts = f"\n✨ You earned *{points_earned} loyalty points* — redeem on your next visit!" if points_earned else ""
    msg = (f"✦ *{name}* ✦\n\nThank you {inv['customer_name']}! 🌸\n"
           f"Receipt *{inv['invoice_no']}* — ₹{inv['total']:.0f} paid via {_pay_label(inv['payment_mode'])}.{pts}\n\n"
           f"⭐ Loved your visit? Tap to rate us — Mira even writes your review for you:\n{_smart_review_url(t, inv)}")
    return f"https://wa.me/{'91' + num if len(num) == 10 else num}?text={quote(msg)}"


async def _send_billing_receipts(inv: dict, cust: dict, tenant_doc: Optional[dict], points_earned: int) -> dict:
    """Post-billing receipts. Email is free; each SMS burns 1 sms_point (credited by HQ)."""
    out = {"email": None, "sms": None, "whatsapp_url": None}
    t = tenant_doc or {}
    try:
        out["whatsapp_url"] = _receipt_whatsapp_url(t, inv, cust.get("phone") or "", points_earned)
    except Exception:  # noqa: BLE001
        out["whatsapp_url"] = None
    try:
        if cust.get("email"):
            from receipt_email import send_invoice_receipt_email
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
            from sms_service import send_tenant_sms
            out["sms"] = await send_tenant_sms(
                t["id"], cust["phone"], _receipt_sms_text(t, inv, points_earned), kind="billing")
    except Exception as e:  # noqa: BLE001
        out["sms"] = {"sent": False, "error": str(e)[:200]}
    return out
