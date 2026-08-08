"""Premium Membership: public purchase (booking page), member cards + QR,
welcome emails, admin members view, UPI approvals and expiry reminders."""
import base64
import hashlib
import hmac
import io
import re
import secrets
import uuid
from datetime import datetime, timezone, timedelta

import razorpay as _razorpay
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from database import _raw_db
from security import require_tenant_admin, current_tenant, public_rate_limit, get_current_user
from services.gift_card_service import _pay_keys, _gc_settings, _tenant_by_slug, _upi_qr_b64

router = APIRouter()

_EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}")
_ID_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

DEFAULT_BENEFITS = ["Birthday Offer", "Priority Booking", "Free Consultation"]
TIER_BENEFITS = {
    "silver": ["Birthday Offer", "Priority Booking"],
    "gold": ["Birthday Offer", "Priority Booking", "Free Consultation", "Free Hair Wash"],
    "platinum": ["Birthday Offer", "Priority Booking", "Free Consultation", "Free Hair Wash", "Free Hair Spa (once)"],
    "diamond": ["Birthday Offer", "Priority Booking", "Free Consultation", "Free Hair Wash", "Free Hair Spa (once)", "Dedicated Manager"],
    "custom": ["Birthday Offer", "Priority Booking", "Salon-defined perks"],
}
DEFAULT_PLANS = [
    {"tier": "silver", "name": "Silver", "price": 5000, "cashback_pct": 5, "discount_pct": 5},
    {"tier": "gold", "name": "Gold", "price": 7000, "cashback_pct": 7, "discount_pct": 7},
    {"tier": "platinum", "name": "Platinum", "price": 10000, "cashback_pct": 10, "discount_pct": 10},
    {"tier": "diamond", "name": "Diamond", "price": 15000, "cashback_pct": 15, "discount_pct": 15},
    {"tier": "custom", "name": "Custom", "price": 5000, "cashback_pct": 5, "discount_pct": 5,
     "custom": True, "min_price": 5000},
]
TIER_COLORS = {"silver": "#94a3b8", "gold": "#d4af37", "platinum": "#8b5cf6",
               "diamond": "#22d3ee", "custom": "#f59e0b"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def gen_member_id() -> str:
    grp = lambda: "".join(secrets.choice(_ID_ALPHABET) for _ in range(4))  # noqa: E731
    return f"MC-{grp()}-{grp()}-{grp()}"


async def _unique_member_id() -> str:
    mid = gen_member_id()
    while await _raw_db.customer_memberships.find_one({"member_id": mid}, {"_id": 1}):
        mid = gen_member_id()
    return mid


async def _ensure_premium_plans(t: dict) -> list:
    """Seed the 5 default premium plans for a salon the first time; idempotent."""
    existing = await _raw_db.memberships.find(
        {"tenant_id": t["id"], "public_purchase": True}, {"_id": 0}).to_list(20)
    if existing:
        return existing
    rows = []
    for p in DEFAULT_PLANS:
        rows.append({"id": str(uuid.uuid4()), "tenant_id": t["id"], "name": p["name"],
                     "tier": p["tier"], "price": float(p["price"]),
                     "discount_pct": float(p["discount_pct"]), "cashback_pct": float(p["cashback_pct"]),
                     "validity_days": 365, "benefits": TIER_BENEFITS.get(p["tier"], list(DEFAULT_BENEFITS)),
                     "custom": bool(p.get("custom")), "min_price": float(p.get("min_price") or 0),
                     "public_purchase": True, "active": True, "created_at": _now()})
    await _raw_db.memberships.insert_many([{**r} for r in rows])
    return rows


# ---------------- public: config + order + verify ----------------

@router.get("/public/membership/{slug}/config")
async def membership_config(slug: str):
    t = await _tenant_by_slug(slug)
    s = _gc_settings(t)
    key_id, key_secret = _pay_keys(t)
    plans = await _ensure_premium_plans(t)
    plans = [p for p in plans if p.get("active", True)]
    plans.sort(key=lambda p: (bool(p.get("custom")), float(p.get("price") or 0)))
    return {"salon": {"name": t.get("name"), "logo_url": t.get("logo_url") or "",
                      "location": t.get("location") or "", "slug": t["slug"]},
            "plans": [{k: p.get(k) for k in ("id", "name", "tier", "price", "cashback_pct",
                                             "discount_pct", "validity_days", "benefits",
                                             "custom", "min_price")} for p in plans],
            "payment": {"razorpay": bool(key_id and key_secret), "upi": bool(s["upi_id"]),
                        "upi_id": s["upi_id"]}}


class MemberOrderIn(BaseModel):
    plan_id: str
    amount: float = Field(0, ge=0, le=500000)  # custom plans only
    name: str = Field(..., min_length=2, max_length=80)
    phone: str = Field(..., min_length=8, max_length=15)
    email: str
    pay_method: str  # razorpay | upi
    renew_member_id: str = ""


@router.post("/public/membership/{slug}/order")
async def membership_order(slug: str, body: MemberOrderIn, request: Request):
    public_rate_limit(request, "member-order", limit=10, window_sec=600)
    t = await _tenant_by_slug(slug)
    s = _gc_settings(t)
    key_id, key_secret = _pay_keys(t)
    if body.pay_method == "razorpay" and not (key_id and key_secret):
        raise HTTPException(400, "Online card/UPI payment is not enabled at this salon")
    if body.pay_method == "upi" and not s["upi_id"]:
        raise HTTPException(400, "UPI payment is not enabled at this salon")
    if body.pay_method not in ("razorpay", "upi"):
        raise HTTPException(400, "Unknown payment method")
    if not _EMAIL_RE.fullmatch(body.email.strip().lower()):
        raise HTTPException(400, "Enter a valid email — your membership card is sent there")
    plan = await _raw_db.memberships.find_one(
        {"id": body.plan_id, "tenant_id": t["id"], "active": {"$ne": False}}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Membership plan not found")
    amount = float(plan["price"])
    if plan.get("custom"):
        amount = round(float(body.amount or 0), 2)
        if amount < float(plan.get("min_price") or 5000):
            raise HTTPException(400, f"Custom membership starts at ₹{int(plan.get('min_price') or 5000):,}")
    if body.renew_member_id:
        cm = await _raw_db.customer_memberships.find_one(
            {"member_id": body.renew_member_id.strip().upper(), "tenant_id": t["id"]}, {"_id": 1})
        if not cm:
            raise HTTPException(404, "Member ID not found for renewal")
    order = {"id": str(uuid.uuid4()), "tenant_id": t["id"], "tenant_slug": t["slug"],
             "plan_id": plan["id"], "plan_name": plan["name"], "tier": plan.get("tier") or "custom",
             "amount": amount, "cashback_pct": float(plan.get("cashback_pct") or 0),
             "discount_pct": float(plan.get("discount_pct") or 0),
             "benefits": plan.get("benefits") or list(DEFAULT_BENEFITS),
             "validity_days": int(plan.get("validity_days") or 365),
             "buyer_name": body.name.strip()[:80], "buyer_phone": re.sub(r"\D", "", body.phone)[:15],
             "buyer_email": body.email.strip().lower(),
             "renew_member_id": body.renew_member_id.strip().upper(),
             "pay_method": body.pay_method, "status": "pending_payment", "created_at": _now()}
    if body.pay_method == "razorpay":
        rzp = _razorpay.Client(auth=(key_id, key_secret))
        rz = rzp.order.create({"amount": int(round(amount * 100)), "currency": "INR",
                               "receipt": f"mem_{order['id'][:30]}",
                               "notes": {"membership_order_id": order["id"], "tenant_slug": t["slug"]}})
        order["razorpay_order_id"] = rz["id"]
        resp = {"order_id": order["id"], "razorpay_order_id": rz["id"], "key_id": key_id,
                "amount": rz["amount"], "salon_name": t.get("name")}
    else:
        upi = s["upi_id"]
        pn = re.sub(r"[^A-Za-z0-9 ]", "", t.get("name") or "Salon")[:40]
        upi_uri = f"upi://pay?pa={upi}&pn={pn.replace(' ', '%20')}&am={amount:.2f}&cu=INR&tn=Membership"
        tail = upi_uri.split("upi://", 1)[1]
        resp = {"order_id": order["id"], "upi_id": upi, "upi_link": upi_uri,
                "gpay_link": f"tez://upi/{tail}", "phonepe_link": f"phonepe://{tail}",
                "paytm_link": f"paytmmp://{tail}", "qr_b64": _upi_qr_b64(upi_uri)}
    await _raw_db.membership_orders.insert_one({**order})
    return resp


class RzpVerifyIn(BaseModel):
    razorpay_order_id: str = Field(..., min_length=1, max_length=120)
    razorpay_payment_id: str = Field("", max_length=120)
    razorpay_signature: str = Field("", max_length=256)


@router.post("/public/membership/verify")
async def membership_verify(body: RzpVerifyIn, request: Request):
    public_rate_limit(request, "member-verify", limit=20, window_sec=600)
    o = await _raw_db.membership_orders.find_one({"razorpay_order_id": body.razorpay_order_id}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    if o["status"] != "pending_payment":
        return {"ok": True, "status": o["status"], "member_id": o.get("member_id", "")}
    t = await _raw_db.tenants.find_one({"id": o["tenant_id"]}, {"_id": 0})
    _, key_secret = _pay_keys(t)
    payload = f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode()
    expected = hmac.new(key_secret.encode(), payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, body.razorpay_signature):
        raise HTTPException(400, "Payment signature verification failed")
    await _raw_db.membership_orders.update_one(
        {"id": o["id"]}, {"$set": {"razorpay_payment_id": body.razorpay_payment_id, "paid_at": _now()}})
    return await _activate_membership(o["id"])


class MemberUpiPaidIn(BaseModel):
    upi_ref: str = Field(..., min_length=6, max_length=60)


@router.post("/public/membership/{oid}/upi-paid")
async def membership_upi_paid(oid: str, body: MemberUpiPaidIn, request: Request):
    public_rate_limit(request, "member-upi-paid", limit=10, window_sec=600)
    o = await _raw_db.membership_orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    if o["status"] != "pending_payment":
        return {"ok": True, "status": o["status"]}
    await _raw_db.membership_orders.update_one(
        {"id": oid}, {"$set": {"status": "awaiting_confirmation", "upi_ref": body.upi_ref.strip()[:60],
                               "upi_claimed_at": _now()}})
    return {"ok": True, "status": "awaiting_confirmation"}


# ---------------- activation ----------------

async def _find_or_create_customer(o: dict) -> dict:
    cust = await _raw_db.customers.find_one(
        {"tenant_id": o["tenant_id"], "phone": o["buyer_phone"]}, {"_id": 0})
    if cust:
        if o.get("buyer_email") and not cust.get("email"):
            await _raw_db.customers.update_one({"id": cust["id"]}, {"$set": {"email": o["buyer_email"]}})
        return cust
    cust = {"id": str(uuid.uuid4()), "tenant_id": o["tenant_id"], "name": o["buyer_name"],
            "phone": o["buyer_phone"], "email": o["buyer_email"], "gender": "Other",
            "visits": 0, "total_spent": 0.0, "loyalty_points": 0, "wallet_balance": 0.0,
            "crm_status": "active", "source": "membership", "created_at": _now()}
    await _raw_db.customers.insert_one({**cust})
    return cust


async def _activate_membership(oid: str) -> dict:
    o = await _raw_db.membership_orders.find_one({"id": oid}, {"_id": 0})
    t = await _raw_db.tenants.find_one({"id": o["tenant_id"]}, {"_id": 0})
    cust = await _find_or_create_customer(o)
    now = datetime.now(timezone.utc)
    days = int(o.get("validity_days") or 365)
    renewed = False
    if o.get("renew_member_id"):
        cm = await _raw_db.customer_memberships.find_one(
            {"member_id": o["renew_member_id"], "tenant_id": o["tenant_id"]}, {"_id": 0})
        if cm:
            renewed = True
            try:
                cur_end = datetime.fromisoformat(cm["expires_at"])
            except Exception:
                cur_end = now
            new_end = (max(now, cur_end) + timedelta(days=days)).isoformat()
            await _raw_db.customer_memberships.update_one(
                {"id": cm["id"]},
                {"$set": {"expires_at": new_end, "name": o["plan_name"], "tier": o["tier"],
                          "discount_pct": o["discount_pct"], "cashback_pct": o["cashback_pct"],
                          "benefits": o["benefits"], "amount": o["amount"], "renewed_at": _now()},
                 "$unset": {"reminded_7d": "", "reminded_1d": ""}})
            cm.update({"expires_at": new_end, "tier": o["tier"], "name": o["plan_name"]})
            member_id = cm["member_id"]
    if not renewed:
        member_id = await _unique_member_id()
        cm = {"id": str(uuid.uuid4()), "tenant_id": o["tenant_id"], "customer_id": cust["id"],
              "customer_name": cust["name"], "membership_id": o["plan_id"], "name": o["plan_name"],
              "tier": o["tier"], "member_id": member_id, "amount": o["amount"],
              "discount_pct": o["discount_pct"], "cashback_pct": o["cashback_pct"],
              "benefits": o["benefits"], "source": "online",
              "expires_at": (now + timedelta(days=days)).isoformat(),
              "purchased_at": _now(), "order_id": o["id"]}
        await _raw_db.customer_memberships.insert_one({**cm})
    await _raw_db.membership_orders.update_one(
        {"id": oid}, {"$set": {"status": "activated", "member_id": member_id,
                               "customer_id": cust["id"], "activated_at": _now()}})
    try:
        await send_membership_welcome_email(cm, cust, t, renewed=renewed)
    except Exception:
        pass
    return {"ok": True, "status": "activated", "member_id": member_id,
            "expires_at": cm["expires_at"], "plan": o["plan_name"], "renewed": renewed}


# ---------------- card PDF + QR + email ----------------

def _member_qr_png(member_id: str) -> bytes:
    import os
    import qrcode
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    img = qrcode.make(f"{base}/member/{member_id}", box_size=8, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _card_digits(member_id: str) -> str:
    """Deterministic decorative 16-digit card number derived from the member id."""
    s = str(member_id or "X")
    h, out, i = 0, [], 0
    while len(out) < 16:
        h = (h * 31 + ord(s[i % len(s)]) + i) % 1000000007
        out.append(str(h % 10))
        i += 1
    return " ".join("".join(out[j:j + 4]) for j in range(0, 16, 4))


def _render_member_card_pdf(cm: dict, cust: dict, t: dict, qr_png: bytes) -> bytes:
    """Credit-card style membership card — tier-coloured, per-salon branding."""
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas as _canvas
    W, H = 486, 306
    buf = io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=(W, H))
    tier = (cm.get("tier") or "custom").lower()
    tier_hex = TIER_COLORS.get(tier, "#d4af37").lstrip("#")
    tr, tg, tb = (int(tier_hex[i:i + 2], 16) / 255 for i in (0, 2, 4))
    gold = (0.9, 0.78, 0.35)
    c.setFillColorRGB(0.07, 0.06, 0.10)
    c.rect(0, 0, W, H, stroke=0, fill=1)
    c.saveState()
    c.setFillColorRGB(tr, tg, tb)
    c.setFillAlpha(0.30)
    c.circle(W - 70, H - 30, 160, stroke=0, fill=1)
    c.setFillAlpha(0.15)
    c.circle(50, 30, 140, stroke=0, fill=1)
    c.restoreState()
    c.setStrokeColorRGB(tr, tg, tb)
    c.setLineWidth(2)
    c.roundRect(8, 8, W - 16, H - 16, 16, stroke=1, fill=0)
    # salon branding (top-left) + tier (top-right)
    salon_name = (t.get("name") or "YOUR SALON").upper()
    c.setFillColorRGB(*gold)
    c.setFont("Helvetica-Bold", 14 if len(salon_name) > 24 else 16)
    c.drawString(28, H - 46, salon_name[:34])
    c.setFillColorRGB(0.8, 0.8, 0.85)
    c.setFont("Helvetica", 8)
    c.drawString(28, H - 60, "PREMIUM MEMBERSHIP CARD")
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 15)
    c.drawRightString(W - 28, H - 46, tier.upper())
    c.setFillColorRGB(0.78, 0.78, 0.84)
    c.setFont("Helvetica", 9)
    c.drawRightString(W - 28, H - 60, "MEMBER")
    # chip
    c.setFillColorRGB(0.83, 0.69, 0.25)
    c.roundRect(28, H - 120, 44, 34, 6, stroke=0, fill=1)
    c.setStrokeColorRGB(0.55, 0.44, 0.12)
    c.setLineWidth(1)
    for y in (H - 113, H - 103, H - 93):
        c.line(30, y, 70, y)
    c.line(50, H - 118, 50, H - 88)
    # NFC arcs
    c.setStrokeColorRGB(0.9, 0.9, 0.95)
    c.setLineWidth(1.6)
    for r_ in (6, 11, 16):
        c.arc(W - 58 - r_, H - 104 - r_, W - 58 + r_, H - 104 + r_, 315, 90)
    # card number
    c.setFillColorRGB(*gold)
    c.setFont("Courier-Bold", 23)
    c.drawString(28, H - 160, _card_digits(cm.get("member_id") or ""))

    def lbl(x, y, label, value, size=11, mono=False):
        c.setFillColorRGB(0.6, 0.6, 0.68)
        c.setFont("Helvetica", 7)
        c.drawString(x, y, label.upper())
        c.setFillColorRGB(0.96, 0.96, 0.98)
        c.setFont("Courier-Bold" if mono else "Helvetica-Bold", size)
        c.drawString(x, y - 14, value)
    lbl(28, H - 188, "Member ID", cm.get("member_id") or "", 11, mono=True)
    try:
        thru = datetime.fromisoformat(cm["expires_at"]).strftime("%m/%Y")
    except (ValueError, TypeError, KeyError):
        thru = ""
    lbl(240, H - 188, "Valid Thru", thru, 11, mono=True)
    lbl(28, 54, "Member Name", (cust.get("name") or "").upper()[:26], 13)
    # QR bottom-right
    c.setFillColorRGB(1, 1, 1)
    c.roundRect(W - 124, 26, 96, 96, 8, stroke=0, fill=1)
    c.drawImage(ImageReader(io.BytesIO(qr_png)), W - 119, 31, 86, 86, mask="auto")
    c.setFillColorRGB(0.55, 0.55, 0.6)
    c.setFont("Helvetica-Oblique", 7)
    c.drawString(28, 20, "Powered by Miracurl Suite")
    c.showPage()
    c.save()
    return buf.getvalue()


def _wallet_btn(cm: dict, cust: dict, t: dict) -> str:
    """Best-effort Google Wallet button HTML for emails (empty string if unavailable)."""
    try:
        from routes.wallet_pass import build_membership_save_url, wallet_email_button
        return wallet_email_button(build_membership_save_url(cm, cust, t))
    except Exception:
        return ""


async def send_membership_welcome_email(cm: dict, cust: dict, t: dict, renewed: bool = False, resend: bool = False) -> dict:
    from email_service import _send_email
    import html as html_lib
    import os
    email = cust.get("email") or ""
    if not email:
        return {"sent": False, "error": "no email"}
    qr = _member_qr_png(cm["member_id"])
    pdf = _render_member_card_pdf(cm, cust, t, qr)
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    url = f"{base}/member/{cm['member_id']}"
    try:
        end = datetime.fromisoformat(cm["expires_at"]).strftime("%d %b %Y")
        thru = datetime.fromisoformat(cm["expires_at"]).strftime("%m/%Y")
    except Exception:
        end, thru = cm.get("expires_at", ""), ""
    tier = (cm.get("tier") or "member").capitalize()
    tier_css = "#" + TIER_COLORS.get((cm.get("tier") or "custom").lower(), "#d4af37").lstrip("#")
    salon = html_lib.escape(t.get("name") or "your salon")
    logo_url = t.get("logo_url") or ""
    if logo_url.startswith("/api/"):
        logo_url = f"{base}{logo_url}"
    logo_img = (f'<img src="{logo_url}" alt="" width="40" height="40" '
                f'style="border-radius:10px;object-fit:cover;margin-bottom:6px"/>' if logo_url else "")
    first = html_lib.escape((cust.get("name") or "there").split(" ")[0])
    verb = "renewed" if renewed else "activated"
    heading = ("🪪 Your Membership Card" if resend
               else ("🎉 Membership Renewed!" if renewed else "🎉 Welcome to Premium Membership"))
    intro = (f"Here's your <b>{html_lib.escape(cm.get('name') or tier)}</b> membership card for <b>{salon}</b>, as requested."
             if resend else
             f"Congratulations! Your <b>{html_lib.escape(cm.get('name') or tier)}</b> membership at <b>{salon}</b> has been {verb} successfully.")
    html = f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#333">
    <h2 style="color:#1c1c22">{heading}</h2>
    <p>Hi {first},</p>
    <p>{intro}</p>
    <div style="background:linear-gradient(135deg,#151020 0%,{tier_css}55 55%,#151020 100%);border:2px solid {tier_css};border-radius:18px;padding:22px 26px;color:#eee;margin:18px 0">
      <table style="width:100%;border-collapse:collapse"><tr>
        <td>{logo_img}<div style="color:#e6c65a;font-weight:bold;letter-spacing:2px;font-size:15px">{salon.upper()}</div>
          <div style="color:#999;font-size:9px;letter-spacing:1.5px">PREMIUM MEMBERSHIP CARD</div></td>
        <td style="text-align:right;vertical-align:top;color:#fff;font-weight:bold;font-size:16px">{tier.upper()}<div style="color:#aaa;font-size:10px;font-weight:normal">MEMBER</div></td>
      </tr></table>
      <div style="font-family:monospace;font-size:21px;letter-spacing:3px;color:#e6c65a;margin:20px 0 12px">{_card_digits(cm['member_id'])}</div>
      <table style="width:100%;font-size:13px;color:#ddd;border-collapse:collapse">
        <tr><td style="color:#888;font-size:9px;letter-spacing:1px">MEMBER ID</td><td style="color:#888;font-size:9px;letter-spacing:1px">VALID THRU</td></tr>
        <tr><td style="font-family:monospace;font-weight:bold">{cm['member_id']}</td><td style="font-family:monospace;font-weight:bold">{thru}</td></tr>
      </table>
      <div style="color:#888;font-size:9px;letter-spacing:1px;margin-top:14px">MEMBER NAME</div>
      <div style="font-weight:bold;font-size:15px;color:#fff">{html_lib.escape((cust.get('name') or '').upper())}</div>
      <table style="width:100%;margin-top:12px;font-size:12px;color:#ccc"><tr>
        <td>💰 {cm.get('cashback_pct') or 0:g}% cashback · valid till {end}</td>
      </tr></table>
    </div>
    <p>Show your <b>Membership QR</b> (attached) or your Member ID whenever you visit. Check your live balance & points anytime:</p>
    {_wallet_btn(cm, cust, t)}
    <p style="text-align:center;margin:20px 0"><a href="{url}" style="background:linear-gradient(120deg,#d4af37,#b45309);color:#fff;
       text-decoration:none;font-weight:bold;padding:13px 34px;border-radius:30px;display:inline-block">View my membership card →</a></p>
    <p style="font-size:12px;color:#888">Your digital membership card (PDF) and QR code are attached.</p>
    <p>Thank you,<br/><b>{salon}</b> · Miracurl Suite 💛</p></div>"""
    subject = (f"🪪 Your membership card — {cm['member_id']}" if resend
               else f"🎉 {'Your membership is renewed' if renewed else 'Welcome to Premium Membership'} — {cm['member_id']}")
    return await _send_email(
        [email],
        subject,
        html,
        attachments=[
            {"filename": f"membership-card-{cm['member_id']}.pdf", "content": base64.b64encode(pdf).decode()},
            {"filename": f"membership-qr-{cm['member_id']}.png", "content": base64.b64encode(qr).decode()},
        ])


# ---------------- public: member verify page + card download ----------------

async def _member_bundle(member_id: str) -> tuple:
    cm = await _raw_db.customer_memberships.find_one(
        {"member_id": member_id.strip().upper()}, {"_id": 0})
    if not cm:
        raise HTTPException(404, "Membership not found")
    cust = await _raw_db.customers.find_one({"id": cm["customer_id"]}, {"_id": 0}) or {}
    t = await _raw_db.tenants.find_one({"id": cm["tenant_id"]}, {"_id": 0}) or {}
    return cm, cust, t


@router.get("/public/member/{member_id}")
async def public_member(member_id: str, request: Request):
    public_rate_limit(request, "member-view", limit=60, window_sec=600)
    cm, cust, t = await _member_bundle(member_id)
    active = cm.get("expires_at", "") > _now()
    return {"member_id": cm["member_id"], "name": cust.get("name") or cm.get("customer_name"),
            "plan": cm.get("name"), "tier": cm.get("tier") or "member",
            "status": "Active" if active else "Expired", "amount": cm.get("amount") or 0,
            "purchased_at": cm.get("purchased_at"), "expires_at": cm.get("expires_at"),
            "cashback_pct": cm.get("cashback_pct") or 0, "discount_pct": cm.get("discount_pct") or 0,
            "benefits": cm.get("benefits") or [], "wallet_balance": cust.get("wallet_balance") or 0,
            "loyalty_points": cust.get("loyalty_points") or 0,
            "qr_b64": base64.b64encode(_member_qr_png(cm["member_id"])).decode(),
            "salon": {"name": t.get("name"), "slug": t.get("slug"), "logo_url": t.get("logo_url") or ""}}


@router.get("/public/member/{member_id}/card.pdf")
async def public_member_card_pdf(member_id: str, request: Request):
    public_rate_limit(request, "member-card-pdf", limit=20, window_sec=600)
    cm, cust, t = await _member_bundle(member_id)
    pdf = _render_member_card_pdf(cm, cust, t, _member_qr_png(cm["member_id"]))
    return Response(content=pdf, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="membership-card-{cm["member_id"]}.pdf"'})


@router.post("/public/member/{member_id}/email-card")
async def public_member_email_card(member_id: str, request: Request):
    """Member asks for their card by email (rate-limited; sends to the email on file only)."""
    public_rate_limit(request, "member-email-card", limit=5, window_sec=600)
    cm, cust, t = await _member_bundle(member_id)
    email = (cust.get("email") or "").strip()
    if not email:
        raise HTTPException(400, "No email on file for this membership — ask the salon to add your email")
    out = await send_membership_welcome_email(cm, cust, t, resend=True)
    if not out.get("sent"):
        raise HTTPException(400, "Couldn't send the email right now — please try again later")
    user_part, _, domain = email.partition("@")
    masked = f"{user_part[:2]}{'*' * max(1, len(user_part) - 2)}@{domain}"
    return {"ok": True, "sent_to": masked}


# ---------------- admin: members list + UPI approvals ----------------

@router.get("/premium-membership/members")
async def list_members(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """All onboarded members — salon-sold (POS) and customer-purchased (online)."""
    rows = await _raw_db.customer_memberships.find(
        {"tenant_id": t["id"]}, {"_id": 0}).sort("purchased_at", -1).to_list(300)
    cust_ids = list({r["customer_id"] for r in rows})
    custs = {c["id"]: c async for c in _raw_db.customers.find(
        {"id": {"$in": cust_ids}}, {"_id": 0, "id": 1, "phone": 1, "wallet_balance": 1, "loyalty_points": 1})}
    now = _now()
    out = []
    for r in rows:
        c = custs.get(r["customer_id"], {})
        out.append({"member_id": r.get("member_id") or "", "customer_name": r.get("customer_name"),
                    "phone": c.get("phone") or "", "plan": r.get("name"), "tier": r.get("tier") or "",
                    "amount": r.get("amount") or 0, "source": r.get("source") or "pos",
                    "purchased_at": r.get("purchased_at"), "expires_at": r.get("expires_at"),
                    "status": "active" if (r.get("expires_at") or "") > now else "expired",
                    "cashback_pct": r.get("cashback_pct") or 0, "discount_pct": r.get("discount_pct") or 0,
                    "wallet_balance": c.get("wallet_balance") or 0, "loyalty_points": c.get("loyalty_points") or 0})
    pending = await _raw_db.membership_orders.find(
        {"tenant_id": t["id"], "status": "awaiting_confirmation"},
        {"_id": 0, "id": 1, "buyer_name": 1, "buyer_phone": 1, "plan_name": 1, "amount": 1,
         "upi_ref": 1, "upi_claimed_at": 1}).sort("upi_claimed_at", -1).to_list(50)
    return {"members": out, "pending_upi": pending}


@router.post("/premium-membership/orders/{oid}/approve")
async def approve_member_order(oid: str, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    o = await _raw_db.membership_orders.find_one({"id": oid, "tenant_id": t["id"]}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    if o["status"] == "activated":
        return {"ok": True, "status": "activated", "member_id": o.get("member_id")}
    if o["status"] != "awaiting_confirmation":
        raise HTTPException(400, f"Order is {o['status']}")
    await _raw_db.membership_orders.update_one(
        {"id": oid}, {"$set": {"approved_by": admin.get("email"), "paid_at": _now()}})
    return await _activate_membership(oid)


@router.post("/premium-membership/orders/{oid}/reject")
async def reject_member_order(oid: str, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    r = await _raw_db.membership_orders.update_one(
        {"id": oid, "tenant_id": t["id"], "status": "awaiting_confirmation"},
        {"$set": {"status": "rejected", "rejected_by": admin.get("email"), "rejected_at": _now()}})
    if not r.modified_count:
        raise HTTPException(404, "Pending order not found")
    return {"ok": True}


# ---------------- POS: instant member lookup ----------------

@router.get("/pos/member-lookup/{member_id}")
async def pos_member_lookup(member_id: str, user=Depends(get_current_user), t=Depends(current_tenant)):
    """Billing staff type/scan a Member ID → guest + membership pulled up instantly."""
    mid = member_id.strip().upper()
    cm = await _raw_db.customer_memberships.find_one(
        {"tenant_id": t["id"], "member_id": mid}, {"_id": 0})
    if not cm:
        raise HTTPException(404, "No member with this ID at your salon")
    cust = await _raw_db.customers.find_one(
        {"id": cm["customer_id"]},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1,
         "wallet_balance": 1, "loyalty_points": 1})
    if not cust:
        raise HTTPException(404, "Member's guest profile not found")
    return {"customer": cust,
            "membership": {"member_id": cm["member_id"], "plan": cm.get("name"),
                           "tier": cm.get("tier") or "member",
                           "status": "active" if (cm.get("expires_at") or "") > _now() else "expired",
                           "expires_at": cm.get("expires_at"),
                           "cashback_pct": cm.get("cashback_pct") or 0,
                           "discount_pct": cm.get("discount_pct") or 0}}


# ---------------- Reports: membership revenue ----------------

@router.get("/reports/memberships")
async def membership_report(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Membership sales, active members and outstanding cashback (wallet) liability."""
    now = _now()
    month = now[:7]
    rows = await _raw_db.customer_memberships.find({"tenant_id": t["id"]}, {"_id": 0}).to_list(1000)
    active = [r for r in rows if (r.get("expires_at") or "") > now]
    sales_total = round(sum(float(r.get("amount") or 0) for r in rows), 2)
    sales_month = round(sum(float(r.get("amount") or 0) for r in rows
                            if (r.get("purchased_at") or "").startswith(month)), 2)
    online = sum(1 for r in rows if r.get("source") == "online")
    cb_agg = await _raw_db.wallet_txns.aggregate([
        {"$match": {"tenant_id": t["id"], "type": "membership_cashback"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "n": {"$sum": 1}}}]).to_list(1)
    cashback_paid = round((cb_agg[0]["total"] if cb_agg else 0) or 0, 2)
    active_cust_ids = list({r["customer_id"] for r in active})
    li_agg = await _raw_db.customers.aggregate([
        {"$match": {"id": {"$in": active_cust_ids}}},
        {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$wallet_balance", 0]}}}}]).to_list(1)
    liability = round((li_agg[0]["total"] if li_agg else 0) or 0, 2)
    expiring_30 = sum(1 for r in active if (r.get("expires_at") or "") <=
                      (datetime.now(timezone.utc) + timedelta(days=30)).isoformat())
    by_tier = {}
    for r in active:
        by_tier[r.get("tier") or "custom"] = by_tier.get(r.get("tier") or "custom", 0) + 1
    return {"sales_total": sales_total, "sales_this_month": sales_month,
            "members_total": len(rows), "members_active": len(active),
            "members_expired": len(rows) - len(active), "online": online, "pos": len(rows) - online,
            "cashback_credited_total": cashback_paid, "wallet_liability_active_members": liability,
            "expiring_in_30_days": expiring_30, "active_by_tier": by_tier}


# ---------------- expiry reminders (7d + 1d, hourly sweep) ----------------

async def run_membership_expiry_reminders() -> int:
    import os
    now = datetime.now(timezone.utc)
    ist_hour = (now + timedelta(hours=5, minutes=30)).hour
    if not 9 <= ist_hour < 20:
        return 0
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    sent = 0
    for days, flag in ((7, "reminded_7d"), (1, "reminded_1d")):
        lo, hi = now.isoformat(), (now + timedelta(days=days)).isoformat()
        async for cm in _raw_db.customer_memberships.find(
                {"member_id": {"$exists": True, "$ne": ""}, flag: {"$ne": True},
                 "expires_at": {"$gt": lo, "$lte": hi}}, {"_id": 0}):
            await _raw_db.customer_memberships.update_one({"id": cm["id"]}, {"$set": {flag: True}})
            cust = await _raw_db.customers.find_one({"id": cm["customer_id"]}, {"_id": 0}) or {}
            if not cust.get("email"):
                continue
            t = await _raw_db.tenants.find_one({"id": cm["tenant_id"]}, {"_id": 0}) or {}
            from email_service import _send_email
            import html as html_lib
            try:
                end = datetime.fromisoformat(cm["expires_at"]).strftime("%d %b %Y")
            except Exception:
                end = cm.get("expires_at", "")
            renew_url = f"{base}/membership/{t.get('slug')}?renew={cm['member_id']}"
            first = html_lib.escape((cust.get("name") or "there").split(" ")[0])
            res = await _send_email(
                [cust["email"]],
                f"⏳ Your {cm.get('name') or 'membership'} expires on {end} — renew in one tap",
                f"""<div style="font-family:Georgia,serif;max-width:540px;margin:0 auto;color:#333">
                <h2 style="color:#1c1c22">Don't lose your member perks, {first} ✦</h2>
                <p>Your <b>{html_lib.escape(cm.get('name') or 'Premium')}</b> membership at
                <b>{html_lib.escape(t.get('name') or 'your salon')}</b> (ID <b>{cm['member_id']}</b>)
                expires on <b>{end}</b> — that's {'tomorrow' if days == 1 else f'in {days} days'}.</p>
                <p>Renew now to keep your {cm.get('cashback_pct') or 0:g}% wallet cashback and member benefits running without a break:</p>
                <p style="text-align:center;margin:22px 0"><a href="{renew_url}" style="background:linear-gradient(120deg,#d4af37,#b45309);
                   color:#fff;text-decoration:none;font-weight:bold;padding:14px 36px;border-radius:30px;display:inline-block">Renew my membership →</a></p>
                <p style="font-size:12px;color:#888">Renewing extends your validity from your current expiry date — you never lose paid days.</p></div>""")
            if res.get("sent"):
                sent += 1
    return sent
