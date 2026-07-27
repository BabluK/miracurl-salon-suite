"""Super Admin per-tenant subscription payment links — one link, tenant pays, plan activates."""
import logging
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
import html as html_lib

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from database import _raw_db, db
from security import require_super_admin, public_rate_limit
from routes.subscriptions import (
    _rzp_client, _verify_rzp_signature, _fresh_plan_or_400,
    _apply_subscription_to_tenants, PLAN_CATALOG,
    RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, SubscriptionPayment,
)

router = APIRouter()
log = logging.getLogger("pay_links")

LINK_VALID_DAYS = 7
_CUSTOM_MONTH_DAYS = {1: 31, 3: 92, 6: 183, 12: 365}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _link_plans() -> list:
    return [{"key": k, "label": v["label"], "price": v["price"], "duration_days": v["duration_days"]}
            for k, v in PLAN_CATALOG.items()
            if not v.get("currency") and int(v.get("branches") or 1) == 1]


def _effective_status(link: dict) -> str:
    if link["status"] == "pending" and link.get("expires_at", "") < _now().isoformat():
        return "expired"
    return link["status"]


def _request_base(request: Request) -> str:
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    proto = request.headers.get("x-forwarded-proto") or "https"
    return f"{proto}://{host}" if host else ""


class PayLinkIn(BaseModel):
    tenant_id: str
    plan: str  # PLAN_CATALOG key or "custom"
    custom_amount: Optional[float] = None
    custom_months: int = 6
    custom_label: str = ""
    note: str = ""


@router.get("/super-admin/pay-links")
async def list_pay_links(tenant_id: str = "", user=Depends(require_super_admin)):
    q = {"tenant_id": tenant_id} if tenant_id else {}
    rows = await _raw_db.subscription_pay_links.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)
    for r in rows:
        r["status"] = _effective_status(r)
    return {"plans": _link_plans(), "links": rows, "valid_days": LINK_VALID_DAYS,
            "test_mode": RAZORPAY_KEY_ID.startswith("rzp_test_"), "enabled": bool(RAZORPAY_KEY_ID)}


@router.post("/super-admin/pay-links")
async def create_pay_link(body: PayLinkIn, user=Depends(require_super_admin)):
    if not RAZORPAY_KEY_ID:
        raise HTTPException(503, "Razorpay is not configured — add the keys first.")
    t = await _raw_db.tenants.find_one({"id": body.tenant_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    if body.plan == "custom":
        amt = float(body.custom_amount or 0)
        if not 1 <= amt <= 500000:
            raise HTTPException(400, "Custom amount must be between ₹1 and ₹5,00,000")
        months = body.custom_months if body.custom_months in _CUSTOM_MONTH_DAYS else 6
        duration = _CUSTOM_MONTH_DAYS[months]
        label = (body.custom_label or "").strip() or f"Special {months}-Month Offer"
    else:
        plan_info = await _fresh_plan_or_400(body.plan)
        if plan_info.get("currency") or int(plan_info.get("branches") or 1) != 1:
            raise HTTPException(400, "Payment links support single-branch INR plans (or a custom price)")
        amt, duration, label = float(plan_info["price"]), plan_info["duration_days"], plan_info["label"]
    link = {
        "id": str(uuid.uuid4()), "token": secrets.token_urlsafe(8),
        "tenant_id": t["id"], "tenant_slug": t["slug"], "salon_name": t.get("name") or t["slug"],
        "owner_email": t.get("owner_email") or "", "plan": body.plan, "plan_label": label,
        "amount": amt, "duration_days": duration, "note": body.note.strip()[:300],
        "status": "pending", "expires_at": (_now() + timedelta(days=LINK_VALID_DAYS)).isoformat(),
        "created_at": _now().isoformat(), "created_by": user.get("email") or user["id"],
    }
    await _raw_db.subscription_pay_links.insert_one({**link})
    return {"ok": True, "link": link}


@router.delete("/super-admin/pay-links/{pid}")
async def revoke_pay_link(pid: str, user=Depends(require_super_admin)):
    r = await _raw_db.subscription_pay_links.update_one(
        {"id": pid, "status": "pending"}, {"$set": {"status": "cancelled", "cancelled_at": _now().isoformat()}})
    if not r.matched_count:
        raise HTTPException(404, "Link not found or already used")
    return {"ok": True}


def _pay_link_email_html(link: dict, url: str) -> str:
    salon = html_lib.escape(link["salon_name"])
    amt = f"₹{link['amount']:,.0f}".replace(".00", "")
    months = round(link["duration_days"] / 30.5)
    expires = datetime.fromisoformat(link["expires_at"]).strftime("%d %b %Y")
    note = (f'<p style="font-style:italic;color:#555;border-left:3px solid #d4af37;padding-left:12px;margin:16px 0">'
            f'"{html_lib.escape(link["note"])}"</p>') if link.get("note") else ""
    return f"""
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto">
      <div style="background:linear-gradient(120deg,#1c1c22,#3b2f4d);border-radius:20px;padding:34px 30px;text-align:center">
        <div style="font-size:26px;font-weight:bold;color:#d4af37;letter-spacing:2px">MIRACURL</div>
        <div style="color:rgba(255,255,255,.7);font-size:11px;letter-spacing:3px;text-transform:uppercase;margin-top:4px">AI Salon Suite</div>
        <div style="font-size:38px;margin-top:16px">🎉</div>
        <div style="color:#fff;font-size:20px;margin-top:8px">Welcome aboard, <b>{salon}</b>!</div>
        <div style="color:rgba(255,255,255,.85);font-size:13px;margin-top:6px;line-height:1.7">
          An exclusive plan reserved just for your salon</div>
        <div style="display:inline-block;background:rgba(255,255,255,.95);border-radius:14px;padding:16px 30px;margin-top:16px">
          <div style="font-size:11px;letter-spacing:2px;color:#888;text-transform:uppercase">{html_lib.escape(link["plan_label"])}</div>
          <div style="font-size:34px;font-weight:bold;color:#1c1c22">{amt}</div>
          <div style="font-size:11px;color:#888">{months} months of the full Miracurl Suite</div>
        </div>
      </div>
      <div style="padding:24px 8px;color:#333">
        <p>Namaste from the <b>Miracurl HQ team</b> 🙏</p>
        <p>We're genuinely thrilled to have <b>{salon}</b> with us — and we can't wait to see your salon
           grow with Mira by your side. As a warm welcome, our team has prepared this special plan
           exclusively for you.</p>
        {note}
        <div style="background:#faf6ec;border-radius:14px;padding:18px 20px;margin:18px 0">
          <div style="font-size:13px;font-weight:bold;color:#1c1c22;margin-bottom:8px">Everything you unlock ✨</div>
          <div style="font-size:13px;color:#555;line-height:2">
            📅 Appointments, POS billing &amp; GST invoices<br/>
            🤖 Mira AI — daily briefings, marketing studio &amp; voice greetings<br/>
            🌐 Your own public booking page + occasion gift cards<br/>
            💬 WhatsApp reminders, reviews &amp; the referral engine<br/>
            💛 Priority onboarding support — our team is really happy to onboard you</div></div>
        <p style="text-align:center;margin:26px 0">
          <a href="{url}" style="background:linear-gradient(120deg,#d4af37,#b45309);color:#fff;text-decoration:none;
             font-weight:bold;font-size:16px;padding:15px 38px;border-radius:30px;display:inline-block">
             Activate my plan — pay {amt} securely →</a></p>
        <p style="font-size:12px;color:#888;text-align:center">Secure payment via Razorpay (UPI · Card · NetBanking)
           · This personal link is valid till <b>{expires}</b>.</p>
        <p style="font-size:13px;color:#333;margin-top:14px">With warmth,<br/><b>The Miracurl Team</b> 💛</p>
      </div>
    </div>"""


@router.post("/super-admin/pay-links/{pid}/email")
async def email_pay_link(pid: str, request: Request, user=Depends(require_super_admin)):
    from email_service import _send_email
    link = await _raw_db.subscription_pay_links.find_one({"id": pid}, {"_id": 0})
    if not link:
        raise HTTPException(404, "Link not found")
    if _effective_status(link) != "pending":
        raise HTTPException(400, f"This link is {_effective_status(link)} — generate a fresh one")
    if not link.get("owner_email"):
        raise HTTPException(400, "This tenant has no owner email on file")
    url = f"{_request_base(request)}/pay/{link['token']}"
    res = await _send_email(
        [link["owner_email"]],
        f"🎉 {link['salon_name']} — your exclusive Miracurl plan is ready ({link['plan_label']})",
        _pay_link_email_html(link, url))
    if not res.get("sent"):
        raise HTTPException(502, res.get("error") or "Email failed")
    await _raw_db.subscription_pay_links.update_one(
        {"id": pid}, {"$set": {"emailed_at": _now().isoformat(), "emailed_to": link["owner_email"]}})
    return {"ok": True, "sent_to": link["owner_email"]}


# ---------------- public: tenant opens the link & pays ----------------

@router.get("/public/pay-link/{token}")
async def public_pay_link(token: str, request: Request):
    public_rate_limit(request, key_suffix="pay-link", limit=30, window_sec=600)
    link = await _raw_db.subscription_pay_links.find_one({"token": token}, {"_id": 0})
    if not link:
        raise HTTPException(404, "This payment link doesn't exist — please ask Miracurl HQ for a fresh one")
    return {"status": _effective_status(link), "salon_name": link["salon_name"],
            "plan_label": link["plan_label"], "amount": link["amount"],
            "months": round(link["duration_days"] / 30.5), "note": link.get("note") or "",
            "expires_at": link["expires_at"], "paid_at": link.get("paid_at"),
            "key_id": RAZORPAY_KEY_ID, "test_mode": RAZORPAY_KEY_ID.startswith("rzp_test_")}


@router.post("/public/pay-link/{token}/order")
async def public_pay_link_order(token: str, request: Request):
    public_rate_limit(request, key_suffix="pay-link-order", limit=10, window_sec=600)
    link = await _raw_db.subscription_pay_links.find_one({"token": token}, {"_id": 0})
    if not link:
        raise HTTPException(404, "Payment link not found")
    st = _effective_status(link)
    if st != "pending":
        raise HTTPException(400, "This link has expired — ask Miracurl HQ for a fresh one"
                            if st == "expired" else "This link was already used")
    rzp = _rzp_client()
    if not rzp:
        raise HTTPException(503, "Razorpay is not configured. Contact Miracurl HQ.")
    receipt = f"plink_{link['tenant_slug'][:18]}_{int(_now().timestamp())}"[:40]
    order = rzp.order.create({
        "amount": int(round(float(link["amount"]) * 100)), "currency": "INR", "receipt": receipt,
        "notes": {"kind": "pay_link", "pay_link_id": link["id"], "tenant_id": link["tenant_id"]}})
    await _raw_db.subscription_pay_links.update_one(
        {"id": link["id"]}, {"$set": {"razorpay_order_id": order["id"]}})
    return {"order_id": order["id"], "amount": order["amount"], "currency": "INR",
            "key_id": RAZORPAY_KEY_ID, "salon_name": link["salon_name"], "plan_label": link["plan_label"]}


class PayLinkVerifyIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


async def _thank_you_email(link: dict, end_date: str) -> None:
    from email_service import _send_email
    if not link.get("owner_email"):
        return
    salon = html_lib.escape(link["salon_name"])
    await _send_email(
        [link["owner_email"]], f"💛 Payment received — {salon} is fully activated!",
        f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#333">
        <h2 style="color:#1c1c22">You're all set, {salon} ✨</h2>
        <p>Your payment of <b>₹{link['amount']:,.0f}</b> for the <b>{html_lib.escape(link['plan_label'])}</b>
        went through perfectly. Your Miracurl subscription is active till <b>{end_date}</b>.</p>
        <p>The whole Miracurl team is really happy to have you onboard — if you need anything at all,
        just reply to this email and we'll jump right in. 💛</p>
        <p style="font-size:13px;color:#333;margin-top:14px">With warmth,<br/><b>The Miracurl Team</b></p></div>""")


@router.post("/public/pay-link/{token}/verify")
async def public_pay_link_verify(body: PayLinkVerifyIn, token: str, request: Request):
    public_rate_limit(request, key_suffix="pay-link-verify", limit=10, window_sec=600)
    if not (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET):
        raise HTTPException(503, "Razorpay is not configured.")
    if not _verify_rzp_signature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature):
        raise HTTPException(400, "Payment signature verification failed — possible tampering.")
    now = _now()
    # Atomic claim: only an unexpired pending link with THIS order id can be consumed once.
    link = await _raw_db.subscription_pay_links.find_one_and_update(
        {"token": token, "status": "pending", "razorpay_order_id": body.razorpay_order_id,
         "expires_at": {"$gt": now.isoformat()}},
        {"$set": {"status": "paid", "paid_at": now.isoformat(),
                  "razorpay_payment_id": body.razorpay_payment_id}},
        return_document=True)
    if not link:
        raise HTTPException(400, "Unknown, expired or already-used payment link — please contact Miracurl HQ.")
    # Price/duration come from the link the super-admin created — the deal that was offered.
    plan_info = {"label": link["plan_label"], "price": float(link["amount"]),
                 "duration_days": int(link["duration_days"]), "branches": 1}
    plan_key = link["plan"] if link["plan"] in PLAN_CATALOG else "custom"
    subs = await _apply_subscription_to_tenants(
        [link["tenant_id"]], plan_key, plan_info,
        payment_method="razorpay", payment_ref=body.razorpay_payment_id,
        notes=f"HQ payment link {link['token']} · order {body.razorpay_order_id}", start=now)
    sub = subs[0]
    await db.subscription_payments.insert_one(SubscriptionPayment(
        subscription_id=sub["id"], tenant_id=link["tenant_id"], amount=float(link["amount"]),
        paid_at=now.date().isoformat(), method="razorpay", txn_ref=body.razorpay_payment_id,
        recorded_by=f"pay_link:{link['created_by']}",
        notes=f"HQ payment link {link['token']}").model_dump())
    await _raw_db.hq_messages.insert_one({
        "id": str(uuid.uuid4()), "salon_name": link["salon_name"], "from_email": link.get("owner_email"),
        "message": f"💳 Paid ₹{link['amount']:,.0f} via your payment link ({link['plan_label']}) — "
                   f"subscription active till {sub['end_date']} 🎉",
        "created_at": now.isoformat(), "read": False})
    try:
        await _thank_you_email(link, sub["end_date"])
    except Exception as e:
        log.warning("pay-link thank-you email failed: %s", e)
    return {"ok": True, "salon_name": link["salon_name"], "plan_label": link["plan_label"],
            "end_date": sub["end_date"]}
