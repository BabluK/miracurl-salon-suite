"""Gift Cards: public purchase (occasion e-cards) + salon payment config + POS redemption."""
import hashlib
import hmac
import html as html_lib
import os
import re
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import quote

import razorpay as _razorpay
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from database import _raw_db
from security import require_tenant_admin, current_tenant, public_rate_limit

router = APIRouter()

MAIN_TENANT_SLUG = "miracurl-marathahalli"
_EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}")

OCCASIONS = [
    {"key": "birthday", "label": "Birthday", "emoji": "🎂", "grad": ["#f43f5e", "#fb923c"]},
    {"key": "anniversary", "label": "Anniversary", "emoji": "💍", "grad": ["#a855f7", "#ec4899"]},
    {"key": "valentine", "label": "Valentine's Day", "emoji": "❤️", "grad": ["#e11d48", "#f472b6"]},
    {"key": "mothers-day", "label": "Mother's Day", "emoji": "💐", "grad": ["#ec4899", "#f9a8d4"]},
    {"key": "fathers-day", "label": "Father's Day", "emoji": "👔", "grad": ["#0ea5e9", "#6366f1"]},
    {"key": "diwali", "label": "Diwali", "emoji": "🪔", "grad": ["#f59e0b", "#dc2626"]},
    {"key": "christmas", "label": "Christmas", "emoji": "🎄", "grad": ["#16a34a", "#dc2626"]},
    {"key": "new-year", "label": "New Year", "emoji": "🎉", "grad": ["#6366f1", "#a855f7"]},
    {"key": "wedding", "label": "Wedding", "emoji": "👰", "grad": ["#d4af37", "#f5e6c8"]},
    {"key": "thank-you", "label": "Thank You", "emoji": "🙏", "grad": ["#0d9488", "#22d3ee"]},
    {"key": "congratulations", "label": "Congratulations", "emoji": "🎊", "grad": ["#f59e0b", "#84cc16"]},
    {"key": "just-because", "label": "Just Because", "emoji": "✨", "grad": ["#d4af37", "#b45309"]},
]
_OCC = {o["key"]: o for o in OCCASIONS}
DEFAULT_AMOUNTS = [500, 1000, 2000, 5000]
DEFAULT_VALIDITY = 180  # days (~6 months)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _gc_settings(t: dict) -> dict:
    s = t.get("gift_card_settings") or {}
    return {"enabled": bool(s.get("enabled", True)),
            "razorpay_key_id": s.get("razorpay_key_id") or "",
            "razorpay_key_secret": s.get("razorpay_key_secret") or "",
            "upi_id": s.get("upi_id") or "",
            "validity_days": int(s.get("validity_days") or DEFAULT_VALIDITY),
            "occasion_campaigns": bool(s.get("occasion_campaigns", True)),
            "amounts": s.get("amounts") or DEFAULT_AMOUNTS}


def _pay_keys(t: dict) -> tuple[str, str]:
    """Salon's own Razorpay keys; the main Miracurl salon falls back to platform keys."""
    s = _gc_settings(t)
    if s["razorpay_key_id"] and s["razorpay_key_secret"]:
        return s["razorpay_key_id"], s["razorpay_key_secret"]
    if t.get("slug") == MAIN_TENANT_SLUG:
        return os.environ.get("RAZORPAY_KEY_ID", ""), os.environ.get("RAZORPAY_KEY_SECRET", "")
    return "", ""


async def _tenant_by_slug(slug: str) -> dict:
    t = await _raw_db.tenants.find_one(
        {"slug": slug, "status": {"$in": ["active", "trial"]}}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Salon not found")
    return t


def _gen_code() -> str:
    a = secrets.token_hex(4).upper()
    return f"GC-{a[:4]}-{a[4:]}"


# ---------------- public: config + order ----------------

@router.get("/public/gift-cards/{slug}/config")
async def gift_card_config(slug: str):
    t = await _tenant_by_slug(slug)
    s = _gc_settings(t)
    key_id, key_secret = _pay_keys(t)
    return {"enabled": s["enabled"],
            "salon": {"name": t.get("name"), "logo_url": t.get("logo_url") or "",
                      "location": t.get("location") or "", "currency": t.get("currency") or "INR"},
            "occasions": OCCASIONS, "amounts": s["amounts"], "validity_days": s["validity_days"],
            "payment": {"razorpay": bool(key_id and key_secret), "upi": bool(s["upi_id"]),
                        "upi_id": s["upi_id"]}}


class GiftOrderIn(BaseModel):
    occasion: str
    amount: float = Field(gt=0, le=100000)
    buyer_name: str
    buyer_email: str
    buyer_phone: str = ""
    recipient_name: str
    recipient_email: str
    recipient_whatsapp: str = ""
    message: str = ""
    send_on: str = ""  # "" = now, else YYYY-MM-DD
    pay_method: str  # razorpay | upi


def _validate_gift_order(body: GiftOrderIn, t: dict, s: dict) -> tuple:
    """Validate a public gift-card order; returns (key_id, key_secret) for razorpay."""
    if not s["enabled"]:
        raise HTTPException(400, "Gift cards are not available at this salon")
    if body.occasion not in _OCC:
        raise HTTPException(400, "Pick an occasion")
    for e in (body.buyer_email, body.recipient_email):
        if not _EMAIL_RE.fullmatch(e.strip().lower()):
            raise HTTPException(400, "Enter valid email addresses")
    if len(body.buyer_name.strip()) < 2 or len(body.recipient_name.strip()) < 2:
        raise HTTPException(400, "Enter both names")
    if body.send_on:
        try:
            datetime.strptime(body.send_on, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(400, "Invalid send date")
    key_id, key_secret = _pay_keys(t)
    if body.pay_method == "razorpay" and not (key_id and key_secret):
        raise HTTPException(400, "Online payment is not enabled at this salon")
    if body.pay_method == "upi" and not s["upi_id"]:
        raise HTTPException(400, "UPI payment is not enabled at this salon")
    if body.pay_method not in ("razorpay", "upi"):
        raise HTTPException(400, "Unknown payment method")
    return key_id, key_secret


def _gift_payment_init(gc: dict, t: dict, s: dict, key_id: str, key_secret: str) -> dict:
    """Create the razorpay order or UPI intent link; mutates gc with gateway ids."""
    amount = gc["amount"]
    if gc["pay_method"] == "razorpay":
        rzp = _razorpay.Client(auth=(key_id, key_secret))
        order = rzp.order.create({"amount": int(round(amount * 100)), "currency": "INR",
                                  "receipt": f"gc_{gc['id'][:30]}",
                                  "notes": {"gift_card_id": gc["id"], "tenant_slug": t["slug"]}})
        gc["razorpay_order_id"] = order["id"]
        gc["razorpay_key_id"] = key_id
        return {"order_id": order["id"], "key_id": key_id, "amount": order["amount"],
                "salon_name": t.get("name")}
    upi = s["upi_id"]
    pn = re.sub(r"[^A-Za-z0-9 ]", "", t.get("name") or "Salon")[:40]
    return {"upi_id": upi,
            "upi_link": f"upi://pay?pa={upi}&pn={pn.replace(' ', '%20')}&am={amount:.2f}&cu=INR&tn=GiftCard"}


@router.post("/public/gift-cards/{slug}/order")
async def gift_card_order(slug: str, body: GiftOrderIn, request: Request):
    public_rate_limit(request, "gift-order", limit=10, window_sec=600)
    t = await _tenant_by_slug(slug)
    s = _gc_settings(t)
    key_id, key_secret = _validate_gift_order(body, t, s)
    amount = round(float(body.amount), 2)
    gc = {"id": str(uuid.uuid4()), "tenant_id": t["id"], "tenant_slug": t["slug"],
          "code": "", "occasion": body.occasion, "amount": amount, "balance": amount,
          "currency": t.get("currency") or "INR",
          "buyer_name": body.buyer_name.strip()[:80], "buyer_email": body.buyer_email.strip().lower(),
          "buyer_phone": re.sub(r"\D", "", body.buyer_phone)[:15],
          "recipient_name": body.recipient_name.strip()[:80],
          "recipient_email": body.recipient_email.strip().lower(),
          "recipient_whatsapp": re.sub(r"\D", "", body.recipient_whatsapp)[:15],
          "message": body.message.strip()[:400], "send_on": body.send_on,
          "pay_method": body.pay_method, "status": "pending_payment",
          "validity_days": s["validity_days"], "created_at": _now()}
    resp = {"gift_card_id": gc["id"], **_gift_payment_init(gc, t, s, key_id, key_secret)}
    await _raw_db.gift_cards.insert_one({**gc})
    return resp


@router.post("/public/gift-cards/verify")
async def gift_card_verify(body: dict, request: Request):
    """Razorpay checkout callback → verify signature → issue the card."""
    public_rate_limit(request, "gift-verify", limit=20, window_sec=600)
    gc = await _raw_db.gift_cards.find_one(
        {"razorpay_order_id": body.get("razorpay_order_id") or "_"}, {"_id": 0})
    if not gc:
        raise HTTPException(404, "Order not found")
    if gc["status"] != "pending_payment":
        return {"ok": True, "status": gc["status"]}
    t = await _raw_db.tenants.find_one({"id": gc["tenant_id"]}, {"_id": 0})
    _, key_secret = _pay_keys(t)
    payload = f"{body.get('razorpay_order_id')}|{body.get('razorpay_payment_id')}".encode()
    expected = hmac.new(key_secret.encode(), payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, str(body.get("razorpay_signature") or "")):
        raise HTTPException(400, "Payment signature verification failed")
    await _raw_db.gift_cards.update_one(
        {"id": gc["id"]}, {"$set": {"razorpay_payment_id": body.get("razorpay_payment_id"),
                                    "paid_at": _now()}})
    return await _issue_gift_card(gc["id"])


class UpiPaidIn(BaseModel):
    upi_ref: str = ""


@router.post("/public/gift-cards/{gcid}/upi-paid")
async def gift_card_upi_paid(gcid: str, body: UpiPaidIn, request: Request):
    public_rate_limit(request, "gift-upi-paid", limit=10, window_sec=600)
    gc = await _raw_db.gift_cards.find_one({"id": gcid}, {"_id": 0})
    if not gc:
        raise HTTPException(404, "Order not found")
    if gc["status"] != "pending_payment":
        return {"ok": True, "status": gc["status"]}
    await _raw_db.gift_cards.update_one(
        {"id": gcid}, {"$set": {"status": "awaiting_confirmation",
                                "upi_ref": body.upi_ref.strip()[:60], "upi_claimed_at": _now()}})
    return {"ok": True, "status": "awaiting_confirmation"}


# ---------------- issuance + e-card email ----------------

async def _issue_gift_card(gcid: str) -> dict:
    gc = await _raw_db.gift_cards.find_one({"id": gcid}, {"_id": 0})
    t = await _raw_db.tenants.find_one({"id": gc["tenant_id"]}, {"_id": 0})
    code = _gen_code()
    while await _raw_db.gift_cards.find_one({"code": code}, {"_id": 1}):
        code = _gen_code()
    today = datetime.now(timezone.utc).date()
    expires = (today + timedelta(days=int(gc.get("validity_days") or DEFAULT_VALIDITY))).isoformat()
    scheduled = bool(gc.get("send_on")) and gc["send_on"] > today.isoformat()
    status = "scheduled" if scheduled else "active"
    await _raw_db.gift_cards.update_one(
        {"id": gcid}, {"$set": {"code": code, "status": status, "expires_at": expires,
                                "issued_at": _now()}})
    gc.update({"code": code, "status": status, "expires_at": expires})
    wa_url = "" if scheduled else _gift_whatsapp_url(gc, t)
    if not scheduled:
        await _email_gift_card(gc, t)
    await _email_buyer_receipt(gc, t, scheduled, wa_url)
    return {"ok": True, "status": status, "code": code if not scheduled else "",
            "expires_at": expires, "send_on": gc.get("send_on") or "", "whatsapp_url": wa_url}


def _cur(gc: dict) -> str:
    return "₹" if (gc.get("currency") or "INR") == "INR" else "$"


def _gift_whatsapp_url(gc: dict, t: dict) -> str:
    """wa.me deep link that delivers the gift card straight to the recipient's WhatsApp."""
    digits = gc.get("recipient_whatsapp") or ""
    if not digits or not gc.get("code"):
        return ""
    wa_phone = digits if len(digits) > 10 else f"91{digits}"
    occ = _OCC.get(gc["occasion"], _OCC["just-because"])
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    salon = t.get("name") or "the salon"
    msg = (f"{occ['emoji']} Hi {gc['recipient_name']}! {gc['buyer_name']} sent you a "
           f"{occ['label']} gift card for {salon} worth {_cur(gc)}{gc['amount']:g}! 🎁\n\n")
    if gc.get("message"):
        msg += f"💌 \"{gc['message']}\"\n\n"
    msg += (f"🎟 Gift card code: {gc['code']}\n"
            f"⏳ Valid till {gc.get('expires_at')}\n\n"
            f"Show this code at {salon} to redeem it on any service ✂️✨\n"
            f"Book your visit: {base}/book/{gc['tenant_slug']}")
    return f"https://wa.me/{wa_phone}?text={quote(msg)}"


def _ecard_html(gc: dict, t: dict) -> str:
    occ = _OCC.get(gc["occasion"], _OCC["just-because"])
    g1, g2 = occ["grad"]
    salon = html_lib.escape(t.get("name") or "Salon")
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    logo_url = t.get("logo_url") or ""
    if logo_url.startswith("/"):
        logo_url = base + logo_url
    logo = (f'<img src="{logo_url}" alt="{salon}" style="max-height:54px;max-width:180px;margin-bottom:8px" />'
            if logo_url else
            f'<div style="font-size:26px;font-weight:bold;color:#fff;margin-bottom:6px">{salon}</div>')
    msg = (f'<p style="font-style:italic;color:#555;border-left:3px solid {g1};padding-left:12px;margin:18px 0">'
           f'"{html_lib.escape(gc["message"])}"</p>') if gc.get("message") else ""
    return f"""
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto">
      <div style="background:linear-gradient(120deg,{g1},{g2});border-radius:20px;padding:34px 30px;text-align:center">
        {logo}
        <div style="font-size:40px;line-height:1">{occ["emoji"]}</div>
        <div style="color:#fff;font-size:13px;letter-spacing:3px;text-transform:uppercase;margin-top:8px;opacity:.9">{occ["label"]} Gift Card</div>
        <div style="color:#fff;font-size:44px;font-weight:bold;margin:10px 0">{_cur(gc)}{gc["amount"]:g}</div>
        <div style="display:inline-block;background:rgba(255,255,255,.92);border-radius:12px;padding:12px 26px;margin-top:6px">
          <div style="font-size:10px;letter-spacing:2px;color:#888;text-transform:uppercase">Gift card code</div>
          <div style="font-family:'Courier New',monospace;font-size:22px;font-weight:bold;color:#1c1c22;letter-spacing:2px">{gc["code"]}</div>
        </div>
        <div style="color:rgba(255,255,255,.85);font-size:11px;margin-top:12px">Valid till {gc["expires_at"]} · Redeem at {salon}{(" · " + html_lib.escape(t.get("location"))) if t.get("location") else ""}</div>
      </div>
      <div style="padding:24px 8px;color:#333">
        <p>Dear <b>{html_lib.escape(gc["recipient_name"])}</b>,</p>
        <p><b>{html_lib.escape(gc["buyer_name"])}</b> has sent you a {occ["label"]} gift card for
           <b>{salon}</b> worth <b>{_cur(gc)}{gc["amount"]:g}</b>! 🎁</p>
        {msg}
        <p style="font-size:13px;color:#666">Simply show the code above at the salon — it works across any
           services until the balance runs out. Book your pampering session below ✂️</p>
      </div>
    </div>"""


async def _email_gift_card(gc: dict, t: dict) -> None:
    from email_service import _send_email
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    occ = _OCC.get(gc["occasion"], _OCC["just-because"])
    res = await _send_email(
        [gc["recipient_email"]],
        f"{occ['emoji']} {gc['buyer_name']} sent you a gift card for {t.get('name')}!",
        _ecard_html(gc, t), book_url=f"{base}/book/{gc['tenant_slug']}", book_label="Book your visit ✦")
    await _raw_db.gift_cards.update_one(
        {"id": gc["id"]}, {"$set": {"recipient_email_sent": bool(res.get("sent")), "sent_at": _now()}})


async def _email_buyer_receipt(gc: dict, t: dict, scheduled: bool, wa_url: str = "") -> None:
    from email_service import _send_email
    when = (f"It will be delivered to {html_lib.escape(gc['recipient_name'])} on <b>{gc['send_on']}</b> as scheduled."
            if scheduled else f"It has been emailed to <b>{html_lib.escape(gc['recipient_email'])}</b>.")
    wa_btn = (f"""<p style="margin-top:18px"><a href="{wa_url}" style="background:#25D366;color:#fff;
        text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:24px;display:inline-block">
        💬 Send it to {html_lib.escape(gc['recipient_name'])} on WhatsApp too</a></p>""" if wa_url else "")
    await _send_email(
        [gc["buyer_email"]], f"🎁 Your gift card for {gc['recipient_name']} is confirmed",
        f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#333">
        <h2 style="color:#1c1c22">Gift card confirmed 🎁</h2>
        <p>Hi {html_lib.escape(gc['buyer_name'])}, your <b>{_cur(gc)}{gc['amount']:g}</b>
        {_OCC.get(gc['occasion'], _OCC['just-because'])['label']} gift card for
        <b>{html_lib.escape(t.get('name') or '')}</b> is confirmed. {when}</p>
        {wa_btn}
        <p style="font-size:12px;color:#888">Valid till {gc.get('expires_at')} · Redeemable in-salon against any services.</p>
        </div>""")


async def deliver_scheduled_gift_cards() -> int:
    """Daily scheduler: deliver scheduled cards + flag expired ones."""
    today = datetime.now(timezone.utc).date().isoformat()
    sent = 0
    rows = await _raw_db.gift_cards.find(
        {"status": "scheduled", "send_on": {"$lte": today}}, {"_id": 0}).to_list(200)
    for gc in rows:
        t = await _raw_db.tenants.find_one({"id": gc["tenant_id"]}, {"_id": 0})
        if t:
            await _email_gift_card(gc, t)
            await _raw_db.gift_cards.update_one({"id": gc["id"]}, {"$set": {"status": "active"}})
            sent += 1
    await _raw_db.gift_cards.update_many(
        {"status": "active", "expires_at": {"$lt": today}, "balance": {"$gt": 0}},
        {"$set": {"status": "expired"}})
    return sent


# ---------------- tenant admin ----------------

class GiftSettingsIn(BaseModel):
    enabled: bool = True
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    upi_id: str = ""
    validity_days: int = Field(DEFAULT_VALIDITY, ge=15, le=365)
    occasion_campaigns: bool = True
    amounts: list = DEFAULT_AMOUNTS


@router.get("/gift-cards/settings")
async def get_gift_settings(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    s = _gc_settings(t)
    s["razorpay_key_secret"] = "••••••" if s["razorpay_key_secret"] else ""
    s["hq_gateway"] = t.get("slug") == MAIN_TENANT_SLUG and bool(os.environ.get("RAZORPAY_KEY_ID"))
    key_id, key_secret = _pay_keys(t)
    s["payment_ready"] = bool((key_id and key_secret) or s["upi_id"])
    return s


@router.put("/gift-cards/settings")
async def set_gift_settings(body: GiftSettingsIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    cur = _gc_settings(t)
    secret = body.razorpay_key_secret.strip()
    if secret == "••••••":
        secret = cur["razorpay_key_secret"]
    amounts = sorted({int(a) for a in body.amounts if 50 <= int(a) <= 100000})[:6] or DEFAULT_AMOUNTS
    await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"gift_card_settings": {
        "enabled": body.enabled, "razorpay_key_id": body.razorpay_key_id.strip(),
        "razorpay_key_secret": secret, "upi_id": body.upi_id.strip(),
        "validity_days": body.validity_days, "occasion_campaigns": body.occasion_campaigns,
        "amounts": amounts}}})
    return {"ok": True}


@router.get("/gift-cards")
async def list_gift_cards(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    rows = await _raw_db.gift_cards.find(
        {"tenant_id": t["id"], "status": {"$ne": "pending_payment"}},
        {"_id": 0, "razorpay_key_id": 0}).sort("created_at", -1).to_list(300)
    active = [r for r in rows if r["status"] in ("active", "scheduled")]
    stats = {"sold": len([r for r in rows if r["status"] != "cancelled"]),
             "revenue": round(sum(r["amount"] for r in rows if r["status"] not in ("cancelled", "awaiting_confirmation")), 2),
             "outstanding": round(sum(r["balance"] for r in active), 2),
             "awaiting": len([r for r in rows if r["status"] == "awaiting_confirmation"])}
    return {"items": rows, "stats": stats}


@router.post("/gift-cards/{gcid}/confirm")
async def confirm_gift_card(gcid: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Owner confirms UPI money received → card issued + emailed."""
    gc = await _raw_db.gift_cards.find_one({"id": gcid, "tenant_id": t["id"]}, {"_id": 0})
    if not gc:
        raise HTTPException(404, "Gift card order not found")
    if gc["status"] not in ("awaiting_confirmation", "pending_payment"):
        raise HTTPException(400, f"Order is already {gc['status']}")
    await _raw_db.gift_cards.update_one({"id": gcid}, {"$set": {"paid_at": _now(), "confirmed_by": user["id"]}})
    return await _issue_gift_card(gcid)


@router.post("/gift-cards/{gcid}/cancel")
async def cancel_gift_card(gcid: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    gc = await _raw_db.gift_cards.find_one({"id": gcid, "tenant_id": t["id"]}, {"_id": 0})
    if not gc:
        raise HTTPException(404, "Gift card order not found")
    if gc["status"] in ("redeemed",):
        raise HTTPException(400, "Fully redeemed cards can't be cancelled")
    await _raw_db.gift_cards.update_one({"id": gcid}, {"$set": {"status": "cancelled", "cancelled_at": _now()}})
    return {"ok": True}


class GiftCheckIn(BaseModel):
    code: str


@router.post("/gift-cards/check")
async def check_gift_card(body: GiftCheckIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """POS: look up a gift card code before billing."""
    gc = await _raw_db.gift_cards.find_one(
        {"code": body.code.strip().upper(), "tenant_id": t["id"]}, {"_id": 0})
    if not gc:
        return {"valid": False, "reason": "Code not found for this salon"}
    today = datetime.now(timezone.utc).date().isoformat()
    if gc["status"] == "expired" or (gc.get("expires_at") and gc["expires_at"] < today):
        return {"valid": False, "reason": f"Card expired on {gc.get('expires_at')}"}
    if gc["status"] not in ("active", "scheduled"):
        return {"valid": False, "reason": f"Card is {gc['status']}"}
    if gc["balance"] <= 0:
        return {"valid": False, "reason": "No balance left on this card"}
    return {"valid": True, "balance": gc["balance"], "amount": gc["amount"],
            "recipient_name": gc["recipient_name"], "occasion": gc["occasion"],
            "expires_at": gc.get("expires_at")}


async def redeem_gift_card(code: str, tenant_id: str, bill_total: float, invoice_id: str) -> dict:
    """Called from POS invoice creation. Returns {applied, code} or raises."""
    gc = await _raw_db.gift_cards.find_one(
        {"code": code.strip().upper(), "tenant_id": tenant_id}, {"_id": 0})
    if not gc:
        raise HTTPException(400, "Gift card code not found for this salon")
    today = datetime.now(timezone.utc).date().isoformat()
    if gc.get("expires_at") and gc["expires_at"] < today:
        raise HTTPException(400, f"Gift card expired on {gc['expires_at']}")
    if gc["status"] not in ("active", "scheduled") or gc["balance"] <= 0:
        raise HTTPException(400, "Gift card has no usable balance")
    applied = round(min(float(gc["balance"]), float(bill_total)), 2)
    new_balance = round(gc["balance"] - applied, 2)
    await _raw_db.gift_cards.update_one({"id": gc["id"]}, {
        "$set": {"balance": new_balance,
                 "status": "redeemed" if new_balance <= 0 else "active"},
        "$push": {"redemptions": {"invoice_id": invoice_id, "amount": applied, "at": _now()}}})
    try:
        await _email_balance_update(gc, applied, new_balance)
    except Exception:
        pass  # never block billing on an email hiccup
    return {"applied": applied, "code": gc["code"], "balance_left": new_balance}


async def _email_balance_update(gc: dict, applied: float, balance_left: float) -> None:
    """After each POS redemption, email the card holder their usage + remaining balance."""
    from email_service import _send_email
    t = await _raw_db.tenants.find_one({"id": gc["tenant_id"]}, {"_id": 0}) or {}
    occ = _OCC.get(gc["occasion"], _OCC["just-because"])
    g1, g2 = occ["grad"]
    salon = html_lib.escape(t.get("name") or "the salon")
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    used_total = round(gc["amount"] - balance_left, 2)
    if balance_left > 0:
        bal_line = (f'<div style="color:#fff;font-size:34px;font-weight:bold;margin-top:6px">{_cur(gc)}{balance_left:g}</div>'
                    f'<div style="color:rgba(255,255,255,.85);font-size:11px">remaining · valid till {gc.get("expires_at")}</div>')
        note = f"You still have <b>{_cur(gc)}{balance_left:g}</b> to enjoy — the same code works until the balance runs out."
        subject = f"🎁 {_cur(gc)}{applied:g} redeemed — {_cur(gc)}{balance_left:g} still left on your gift card"
    else:
        bal_line = ('<div style="color:#fff;font-size:28px;font-weight:bold;margin-top:6px">Fully redeemed ✓</div>'
                    '<div style="color:rgba(255,255,255,.85);font-size:11px">Thank you for visiting!</div>')
        note = f"Your gift card is now fully used. We hope you loved your time at {salon} 💛"
        subject = f"🎁 Gift card fully redeemed — thank you for visiting {t.get('name') or ''}!"
    await _send_email(
        [gc["recipient_email"]], subject,
        f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto">
        <div style="background:linear-gradient(120deg,{g1},{g2});border-radius:18px;padding:26px;text-align:center">
          <div style="color:rgba(255,255,255,.9);font-size:11px;letter-spacing:3px;text-transform:uppercase">Gift card balance update</div>
          <div style="font-family:'Courier New',monospace;color:#fff;font-size:18px;font-weight:bold;letter-spacing:2px;margin-top:6px">{gc["code"]}</div>
          {bal_line}
        </div>
        <div style="padding:20px 8px;color:#333">
          <p>Hi {html_lib.escape(gc["recipient_name"])},</p>
          <p>You just redeemed <b>{_cur(gc)}{applied:g}</b> at <b>{salon}</b>.
             Used so far: <b>{_cur(gc)}{used_total:g}</b> of {_cur(gc)}{gc["amount"]:g}. {note}</p>
        </div></div>""",
        book_url=f"{base}/book/{gc['tenant_slug']}", book_label="Book your next visit ✦")


# ---------------- expiry reminders + occasion campaigns ----------------

_OCCASION_CALENDAR = [
    ("valentine", "02-14"), ("mothers-day", "05-10"), ("fathers-day", "06-21"),
    ("christmas", "12-25"), ("new-year", "01-01"),
    # Diwali moves with the lunar calendar
    ("diwali", {"2026": "2026-11-08", "2027": "2027-10-29", "2028": "2028-10-17", "2029": "2029-11-05"}),
]
CAMPAIGN_LEAD_DAYS = 7
CAMPAIGN_MAX_RECIPIENTS = 300


def _upcoming_occasion(today) -> Optional[tuple]:
    """Returns (occasion_key, date_iso) if a big gifting occasion is within the lead window."""
    for key, spec in _OCCASION_CALENDAR:
        for yr in (today.year, today.year + 1):
            if isinstance(spec, dict):
                d = spec.get(str(yr))
                if not d:
                    continue
                occ_date = datetime.strptime(d, "%Y-%m-%d").date()
            else:
                occ_date = datetime.strptime(f"{yr}-{spec}", "%Y-%m-%d").date()
            delta = (occ_date - today).days
            if 0 < delta <= CAMPAIGN_LEAD_DAYS:
                return key, occ_date.isoformat()
    return None


async def send_expiry_reminders() -> int:
    """Nudge buyer + recipient when a card expires in ~14 or ~3 days with balance left."""
    from email_service import _send_email
    today = datetime.now(timezone.utc).date()
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    sent = 0
    for flag, days in (("reminder_14_sent", 14), ("reminder_3_sent", 3)):
        cutoff = (today + timedelta(days=days)).isoformat()
        rows = await _raw_db.gift_cards.find(
            {"status": "active", "balance": {"$gt": 0}, flag: {"$ne": True},
             "expires_at": {"$lte": cutoff, "$gte": today.isoformat()}}, {"_id": 0}).to_list(100)
        for gc in rows:
            t = await _raw_db.tenants.find_one({"id": gc["tenant_id"]}, {"_id": 0})
            if not t:
                continue
            occ = _OCC.get(gc["occasion"], _OCC["just-because"])
            days_left = (datetime.strptime(gc["expires_at"], "%Y-%m-%d").date() - today).days
            book = f"{base}/book/{gc['tenant_slug']}"
            salon = html_lib.escape(t.get("name") or "the salon")
            await _send_email(
                [gc["recipient_email"]],
                f"⏳ Your {occ['label']} gift card expires in {days_left} days — {_cur(gc)}{gc['balance']:g} left!",
                f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#333">
                <h2 style="color:#1c1c22">Don't let your gift slip away {occ['emoji']}</h2>
                <p>Hi {html_lib.escape(gc['recipient_name'])}, your gift card
                <b style="font-family:monospace">{gc['code']}</b> from <b>{html_lib.escape(gc['buyer_name'])}</b>
                still has <b>{_cur(gc)}{gc['balance']:g}</b> to spend at <b>{salon}</b> —
                but it expires on <b>{gc['expires_at']}</b>. Treat yourself before it's gone! ✂️</p>
                </div>""", book_url=book, book_label="Book & redeem now ✦")
            await _send_email(
                [gc["buyer_email"]],
                f"💛 The gift card you gave {gc['recipient_name']} is still unused ({days_left} days left)",
                f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#333">
                <h2 style="color:#1c1c22">A little nudge 💛</h2>
                <p>Hi {html_lib.escape(gc['buyer_name'])}, the <b>{_cur(gc)}{gc['amount']:g}</b> {occ['label']}
                gift card you sent {html_lib.escape(gc['recipient_name'])} still has
                <b>{_cur(gc)}{gc['balance']:g}</b> unused and expires on <b>{gc['expires_at']}</b>.
                Maybe remind them to book their pampering session at {salon}? 😊</p>
                </div>""")
            await _raw_db.gift_cards.update_one({"id": gc["id"]}, {"$set": {flag: True}})
            sent += 1
    return sent


def _campaign_html(t: dict, occ: dict, occ_date: str, cust_name: str, amounts: list) -> str:
    g1, g2 = occ["grad"]
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    salon = html_lib.escape(t.get("name") or "Salon")
    chips = "".join(f'<span style="display:inline-block;background:rgba(255,255,255,.9);color:#1c1c22;'
                    f'border-radius:999px;padding:6px 16px;margin:3px;font-weight:bold;font-size:13px">₹{a}</span>'
                    for a in amounts[:4])
    return f"""
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto">
      <div style="background:linear-gradient(120deg,{g1},{g2});border-radius:20px;padding:32px 28px;text-align:center">
        <div style="font-size:44px">{occ['emoji']}</div>
        <div style="color:#fff;font-size:24px;font-weight:bold;margin-top:6px">{occ['label']} is almost here!</div>
        <div style="color:rgba(255,255,255,.9);font-size:14px;margin-top:8px">
          Surprise someone you love with a <b>{salon}</b> gift card 🎁</div>
        <div style="margin-top:14px">{chips}</div>
        <a href="{base}/gift/{t.get('slug')}" style="display:inline-block;background:#1c1c22;color:#fff;
           text-decoration:none;border-radius:999px;padding:13px 30px;font-weight:bold;font-size:14px;margin-top:16px">
           Send a gift card in 1 minute →</a>
      </div>
      <p style="color:#666;font-size:13px;padding:16px 8px">Hi {html_lib.escape(cust_name or 'there')},
      {occ['label']} falls on <b>{occ_date}</b> — a {salon} gift card is delivered instantly by email
      (or scheduled for the day itself) and works on any service. 💛</p>
    </div>"""


async def send_occasion_campaigns() -> int:
    """Auto-promote gift cards to each salon's customer list before big occasions."""
    from email_service import _send_email
    today = datetime.now(timezone.utc).date()
    up = _upcoming_occasion(today)
    if not up:
        return 0
    occ_key, occ_date = up
    occ = _OCC[occ_key]
    sent_total = 0
    tenants = await _raw_db.tenants.find(
        {"status": {"$in": ["active", "trial"]}}, {"_id": 0}).to_list(500)
    for t in tenants:
        s = _gc_settings(t)
        if not s["enabled"] or not s.get("occasion_campaigns", True):
            continue
        key_id, key_secret = _pay_keys(t)
        if not ((key_id and key_secret) or s["upi_id"]):
            continue  # nowhere for the money to go
        already = await _raw_db.gift_campaign_log.find_one(
            {"tenant_id": t["id"], "occasion": occ_key, "occasion_date": occ_date}, {"_id": 1})
        if already:
            continue
        custs = await _raw_db.customers.find(
            {"tenant_id": t["id"], "email": {"$regex": "@"}},
            {"_id": 0, "name": 1, "email": 1}).to_list(CAMPAIGN_MAX_RECIPIENTS)
        n = 0
        for c in custs:
            res = await _send_email(
                [c["email"]],
                f"{occ['emoji']} {occ['label']} gift idea — a {t.get('name')} gift card 🎁",
                _campaign_html(t, occ, occ_date, c.get("name") or "", s["amounts"]))
            if res.get("sent"):
                n += 1
        await _raw_db.gift_campaign_log.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": t["id"], "occasion": occ_key,
            "occasion_date": occ_date, "recipients": n, "at": _now()})
        sent_total += n
    return sent_total
