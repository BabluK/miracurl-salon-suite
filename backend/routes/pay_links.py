"""Super Admin per-tenant subscription payment links — one link, tenant pays, plan activates."""
import logging
import os
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
import html as html_lib

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from database import _raw_db, db
from security import require_super_admin, public_rate_limit, public_base_url
from routes.payments_common import _checkout
from routes.subscriptions import (
    _rzp_client, _verify_rzp_signature, _fresh_plan_or_400,
    _apply_subscription_to_tenants, PLAN_CATALOG,
    RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, SubscriptionPayment,
)

router = APIRouter()
log = logging.getLogger("pay_links")

LINK_VALID_DAYS = 7
_CUSTOM_MONTH_DAYS = {1: 31, 3: 92, 6: 183, 12: 365}
_CUR_SYM = {"INR": "₹", "USD": "$", "GBP": "£", "EUR": "€", "AED": "AED "}


def _fmt_amt(link: dict) -> str:
    sym = _CUR_SYM.get(link.get("currency") or "INR", "₹")
    return f"{sym}{float(link['amount']):,.0f}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _link_plans(currency: str = "INR") -> list:
    if currency == "INR":
        return [{"key": k, "label": v["label"], "price": v["price"], "duration_days": v["duration_days"]}
                for k, v in PLAN_CATALOG.items()
                if not v.get("currency") and int(v.get("branches") or 1) == 1]
    return [{"key": k, "label": v["label"], "price": v["price"], "duration_days": v["duration_days"]}
            for k, v in PLAN_CATALOG.items() if v.get("currency") == currency]


def _effective_status(link: dict) -> str:
    if link["status"] == "pending" and link.get("expires_at", "") < _now().isoformat():
        return "expired"
    return link["status"]


def _request_base(request: Request) -> str:
    return public_base_url(request)


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
    currency = "INR"
    if tenant_id:
        t = await _raw_db.tenants.find_one({"id": tenant_id}, {"_id": 0, "currency": 1})
        currency = (t or {}).get("currency") or "INR"
    rows = await _raw_db.subscription_pay_links.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)
    for r in rows:
        r["status"] = _effective_status(r)
    all_rows = rows if tenant_id else rows
    if tenant_id:  # stats always across ALL links so HQ sees global conversion
        all_rows = await _raw_db.subscription_pay_links.find({}, {"_id": 0, "status": 1, "opened_at": 1,
                                                                  "amount": 1, "expires_at": 1}).to_list(500)
        for r in all_rows:
            r["status"] = _effective_status(r)
    paid = [r for r in all_rows if r["status"] == "paid"]
    stats = {"total": len(all_rows), "opened": sum(1 for r in all_rows if r.get("opened_at")),
             "paid": len(paid), "revenue": round(sum(float(r.get("amount") or 0) for r in paid), 2),
             "conversion_pct": round(len(paid) * 100 / len(all_rows), 1) if all_rows else 0}
    from routes.subscriptions import load_plan_overrides
    await load_plan_overrides()
    return {"plans": _link_plans(currency), "links": rows, "stats": stats, "valid_days": LINK_VALID_DAYS,
            "currency": currency, "currency_symbol": _CUR_SYM.get(currency, "₹"),
            "test_mode": RAZORPAY_KEY_ID.startswith("rzp_test_"),
            "enabled": bool(RAZORPAY_KEY_ID) if currency == "INR" else bool(os.environ.get("STRIPE_API_KEY"))}


@router.post("/super-admin/pay-links")
async def create_pay_link(body: PayLinkIn, user=Depends(require_super_admin)):
    t = await _raw_db.tenants.find_one({"id": body.tenant_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    currency = t.get("currency") or "INR"
    if currency == "INR" and not RAZORPAY_KEY_ID:
        raise HTTPException(503, "Razorpay is not configured — add the keys first.")
    if currency != "INR" and not os.environ.get("STRIPE_API_KEY"):
        raise HTTPException(503, "Stripe is not configured — international links need STRIPE_API_KEY.")
    sym = _CUR_SYM.get(currency, "₹")
    if body.plan == "custom":
        amt = float(body.custom_amount or 0)
        max_amt = 500000 if currency == "INR" else 20000
        if not 1 <= amt <= max_amt:
            raise HTTPException(400, f"Custom amount must be between {sym}1 and {sym}{max_amt:,.0f}")
        months = body.custom_months if body.custom_months in _CUSTOM_MONTH_DAYS else 6
        duration = _CUSTOM_MONTH_DAYS[months]
        label = (body.custom_label or "").strip() or f"Special {months}-Month Offer"
    else:
        plan_info = await _fresh_plan_or_400(body.plan)
        plan_cur = plan_info.get("currency") or "INR"
        if plan_cur != currency:
            raise HTTPException(400, f"This salon pays in {currency} — pick a {currency} plan (or a custom price)")
        if currency == "INR" and int(plan_info.get("branches") or 1) != 1:
            raise HTTPException(400, "Payment links support single-branch INR plans (or a custom price)")
        amt, duration, label = float(plan_info["price"]), plan_info["duration_days"], plan_info["label"]
    link = {
        "id": str(uuid.uuid4()), "token": secrets.token_urlsafe(8),
        "tenant_id": t["id"], "tenant_slug": t["slug"], "salon_name": t.get("name") or t["slug"],
        "owner_email": t.get("owner_email") or "", "plan": body.plan, "plan_label": label,
        "amount": amt, "currency": currency, "duration_days": duration, "note": body.note.strip()[:300],
        "status": "pending", "expires_at": (_now() + timedelta(days=LINK_VALID_DAYS)).isoformat(),
        "created_at": _now().isoformat(), "created_by": user.get("email") or user["id"],
    }
    await _raw_db.subscription_pay_links.insert_one({**link})
    from services.tenant_notices import notify_tenant
    await notify_tenant(link["tenant_id"], "offer", f"💳 Plan offer from Miracurl HQ — {link['plan_label']}",
                        f"{_fmt_amt(link)} · pay in one tap: {os.environ.get('APP_PUBLIC_URL', 'https://miracurl-suite.com')}/pay/{link['token']}",
                        f"{os.environ.get('APP_PUBLIC_URL', 'https://miracurl-suite.com')}/pay/{link['token']}")
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
    amt = _fmt_amt(link)
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
    url = f"{os.environ.get('APP_PUBLIC_URL', 'https://miracurl-suite.com')}/pay/{link['token']}"  # never trust request host for money links
    res = await _send_email(
        [link["owner_email"]],
        f"🎉 {link['salon_name']} — your exclusive Miracurl plan is ready ({link['plan_label']})",
        _pay_link_email_html(link, url))
    if not res.get("sent"):
        raise HTTPException(502, res.get("error") or "Email failed")
    await _raw_db.subscription_pay_links.update_one(
        {"id": pid}, {"$set": {"emailed_at": _now().isoformat(), "emailed_to": link["owner_email"]}})
    return {"ok": True, "sent_to": link["owner_email"]}


async def send_renewal_nudges() -> int:
    """7 days before subscription_end_date: auto-create a renewal pay link + email the owner. Once per end date."""
    from email_service import _send_email
    now = _now()
    today = now.date().isoformat()
    soon = (now.date() + timedelta(days=7)).isoformat()
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    sent = 0
    tenants = await _raw_db.tenants.find(
        {"status": "active", "subscription_end_date": {"$gte": today, "$lte": soon},
         "owner_email": {"$nin": ["", None]}},
        {"_id": 0, "id": 1, "slug": 1, "name": 1, "owner_email": 1, "plan": 1,
         "subscription_end_date": 1, "renewal_nudged_for": 1}).to_list(200)
    for t in tenants:
        if t.get("renewal_nudged_for") == t["subscription_end_date"]:
            continue
        await _raw_db.tenants.update_one(
            {"id": t["id"]}, {"$set": {"renewal_nudged_for": t["subscription_end_date"]}})
        plan_key = t.get("plan") if t.get("plan") in PLAN_CATALOG else "half_year"
        info = PLAN_CATALOG.get(plan_key) or {}
        if info.get("currency") or int(info.get("branches") or 1) != 1:
            plan_key = "half_year"
        info = await _fresh_plan_or_400(plan_key)
        link = {
            "id": str(uuid.uuid4()), "token": secrets.token_urlsafe(8),
            "tenant_id": t["id"], "tenant_slug": t["slug"], "salon_name": t.get("name") or t["slug"],
            "owner_email": t["owner_email"], "plan": plan_key, "plan_label": info["label"],
            "amount": float(info["price"]), "duration_days": info["duration_days"],
            "note": "Renewal — thank you for being with Miracurl 💛",
            "status": "pending", "expires_at": (now + timedelta(days=LINK_VALID_DAYS)).isoformat(),
            "created_at": now.isoformat(), "created_by": "auto-renewal-nudge",
        }
        await _raw_db.subscription_pay_links.insert_one({**link})
        end_nice = datetime.fromisoformat(t["subscription_end_date"] + "T00:00:00").strftime("%d %b %Y")
        url = f"{base}/pay/{link['token']}"
        salon = html_lib.escape(link["salon_name"])
        res = await _send_email(
            [t["owner_email"]],
            f"⏳ {link['salon_name']} — your Miracurl plan ends on {end_nice}. Renew in one tap",
            f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#333">
            <h2 style="color:#1c1c22">Time flies, {salon} ✨</h2>
            <p>Your Miracurl subscription ends on <b>{end_nice}</b>. Renew now so bookings, SMS,
            payroll and Mira keep running without a single interruption.</p>
            <div style="background:#faf6ec;border-radius:14px;padding:16px 20px;margin:16px 0;text-align:center">
              <div style="font-size:12px;letter-spacing:2px;color:#888;text-transform:uppercase">{html_lib.escape(link['plan_label'])}</div>
              <div style="font-size:32px;font-weight:bold;color:#1c1c22">{_fmt_amt(link)}</div>
            </div>
            <p style="text-align:center;margin:22px 0">
              <a href="{url}" style="background:linear-gradient(120deg,#d4af37,#b45309);color:#fff;text-decoration:none;
                 font-weight:bold;font-size:16px;padding:15px 38px;border-radius:30px;display:inline-block">
                 Renew now — pay {_fmt_amt(link)} securely →</a></p>
            <p style="font-size:12px;color:#888;text-align:center">{'Secure card payment via Stripe' if (link.get('currency') or 'INR') != 'INR' else 'Secure payment via Razorpay · UPI / Card / NetBanking'}
            · Your plan activates instantly after payment.</p>
            <p style="font-size:13px;color:#333">With warmth,<br/><b>The Miracurl Team</b> 💛</p></div>""")
        if res.get("sent"):
            sent += 1
    return sent


async def create_trial_pay_link(t: dict, note: str, now: datetime | None = None, offer: dict | None = None) -> dict:
    """One-tap activation pay link for a trial tenant (plan resolves like renewal nudges).
    `offer` = {"kind": percent|flat, "percent", "flat", "valid_hours"} applies a limited-time discount."""
    if (t.get("currency") or "INR") != "INR":
        raise ValueError("trial pay links are INR/Razorpay only")
    now = now or _now()
    plan_key = t.get("plan") if t.get("plan") in PLAN_CATALOG else "half_year"
    info = PLAN_CATALOG.get(plan_key) or {}
    if info.get("currency") or int(info.get("branches") or 1) != 1:
        plan_key = "half_year"
    info = await _fresh_plan_or_400(plan_key)
    price = float(info["price"])
    discount = 0.0
    expires = now + timedelta(days=LINK_VALID_DAYS)
    if offer:
        discount = float(offer.get("flat") or 0) if offer.get("kind") == "flat" else round(price * float(offer.get("percent") or 0) / 100, 0)
        discount = max(0.0, min(discount, price - 1))
        expires = now + timedelta(hours=int(offer.get("valid_hours") or 48))
    link = {
        "id": str(uuid.uuid4()), "token": secrets.token_urlsafe(8),
        "tenant_id": t["id"], "tenant_slug": t["slug"], "salon_name": t.get("name") or t["slug"],
        "owner_email": t.get("owner_email") or "", "plan": plan_key, "plan_label": info["label"],
        "amount": price - discount, "duration_days": info["duration_days"],
        "original_amount": price if discount else None, "discount": discount or None,
        "offer_label": (f"{int(offer['percent'])}% trial upgrade offer" if offer and offer.get("kind") != "flat"
                        else f"₹{int(discount):,} trial upgrade offer") if discount else None,
        "note": note, "status": "pending", "expires_at": expires.isoformat(),
        "created_at": now.isoformat(), "created_by": "trial-nudge",
    }
    await _raw_db.subscription_pay_links.insert_one({**link})
    link["url"] = f"{os.environ.get('APP_PUBLIC_URL', 'https://miracurl-suite.com')}/pay/{link['token']}"
    return link


_TRIAL_NUDGE_DAYS = (5, 10, 13)


async def run_trial_nudges() -> int:
    """Trial day 5/10/13: email the owner their own usage stats + a one-tap pay link.
    Plan/price resolves exactly like renewal nudges (super-admin plan overrides apply).
    Idempotent via trial_nudges collection. Sends only 9-20 IST."""
    from email_service import _send_email
    now = _now()
    ist_hour = (now + timedelta(hours=5, minutes=30)).hour
    if not 9 <= ist_hour < 20:
        return 0
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    sent = 0
    async for t in _raw_db.tenants.find(
            {"status": "trial", "owner_email": {"$nin": ["", None]}},
            {"_id": 0, "id": 1, "slug": 1, "name": 1, "owner_email": 1, "owner_name": 1,
             "plan": 1, "created_at": 1, "trial_ends_at": 1, "currency": 1}):
        if (t.get("currency") or "INR") != "INR":
            continue
        try:
            created = datetime.fromisoformat(str(t.get("created_at")).replace("Z", "+00:00"))
        except Exception:
            continue
        day = (now.date() - created.date()).days
        if day not in _TRIAL_NUDGE_DAYS:
            continue
        if await _raw_db.trial_nudges.find_one({"tenant_id": t["id"], "day": day}):
            continue
        link = await create_trial_pay_link(t, f"Trial day-{day} activation offer", now)
        plan_key = link["plan"]
        month = now.strftime("%Y-%m")
        agg = await _raw_db.invoices.aggregate([
            {"$match": {"tenant_id": t["id"], "created_at": {"$regex": f"^{month}"},
                        "status": {"$ne": "voided"}}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}}]).to_list(1)
        billed = round((agg[0]["total"] if agg else 0) or 0)
        bills = (agg[0]["count"] if agg else 0) or 0
        custs = await _raw_db.customers.count_documents({"tenant_id": t["id"]})
        try:
            trial_end = datetime.fromisoformat(str(t.get("trial_ends_at")).replace("Z", "+00:00"))
            days_left = max(0, (trial_end.date() - now.date()).days)
        except Exception:
            days_left = max(0, 14 - day)
        stats = (f"₹{billed:,} billed across {bills} bill{'s' if bills != 1 else ''} this month"
                 if billed else f"{custs} customer{'s' if custs != 1 else ''} already in your CRM")
        url = f"{base}/pay/{link['token']}"
        salon = html_lib.escape(t.get("name") or t["slug"])
        res = await _send_email(
            [t["owner_email"]],
            f"Day {day} of your Miracurl trial — {stats} 💛",
            f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#333">
            <h2 style="color:#1c1c22">Your salon is growing on Miracurl 🚀</h2>
            <p>Hi {html_lib.escape(t.get('owner_name') or 'there')}, a quick snapshot from <b>{salon}</b>:</p>
            <div style="background:#faf6ec;border:1px solid #eadfc8;border-radius:14px;padding:16px 20px;font-size:15px">
              📈 <b>{stats}</b><br>👥 {custs} customers on file · 🗓 day {day} of your free trial ({days_left} day{'s' if days_left != 1 else ''} left)
            </div>
            <p>Keep bookings, SMS, payroll and Mira running without interruption — activate in one tap:</p>
            <div style="background:#faf6ec;border-radius:14px;padding:16px 20px;margin:16px 0;text-align:center">
              <div style="font-size:12px;letter-spacing:2px;color:#888;text-transform:uppercase">{html_lib.escape(link['plan_label'])}</div>
              <div style="font-size:32px;font-weight:bold;color:#1c1c22">{_fmt_amt(link)}</div>
            </div>
            <p style="text-align:center;margin:22px 0">
              <a href="{url}" style="background:linear-gradient(120deg,#d4af37,#b45309);color:#fff;text-decoration:none;
                 font-weight:bold;font-size:16px;padding:15px 38px;border-radius:30px;display:inline-block">
                 Activate my plan — pay {_fmt_amt(link)} securely →</a></p>
            <p style="font-size:12px;color:#888;text-align:center">Secure payment via Razorpay · UPI / Card / NetBanking
            · Your plan activates instantly after payment.</p>
            <p style="font-size:13px;color:#333">With warmth,<br/><b>The Miracurl Team</b> 💛</p></div>""")
        await _raw_db.trial_nudges.insert_one({
            "tenant_id": t["id"], "day": day, "sent": bool(res.get("sent")),
            "billed": billed, "customers": custs, "pay_link_token": link["token"],
            "plan": plan_key, "amount": link["amount"], "at": now.isoformat()})
        if res.get("sent"):
            sent += 1
    return sent


# ---------------- public: tenant opens the link & pays ----------------

@router.get("/public/pay-link/{token}")
async def public_pay_link(token: str, request: Request):
    await public_rate_limit(request, key_suffix="pay-link", limit=30, window_sec=600)
    link = await _raw_db.subscription_pay_links.find_one({"token": token}, {"_id": 0})
    if not link:
        raise HTTPException(404, "This payment link doesn't exist — please ask Miracurl HQ for a fresh one")
    if link["status"] == "pending" and not link.get("opened_at"):
        await _raw_db.subscription_pay_links.update_one(
            {"id": link["id"], "opened_at": {"$exists": False}},
            {"$set": {"opened_at": _now().isoformat()}})
    tnt = await _raw_db.tenants.find_one({"id": link["tenant_id"]}, {"_id": 0, "business_type": 1, "logo_url": 1, "location": 1}) or {}
    return {"status": _effective_status(link), "salon_name": link["salon_name"],
            "business_type": tnt.get("business_type") or "salon", "tenant_logo_url": tnt.get("logo_url") or "",
            "tenant_location": tnt.get("location") or "", "is_trial_offer": link.get("created_by") == "trial-nudge",
            "plan_label": link["plan_label"], "amount": link["amount"],
            "currency": link.get("currency") or "INR",
            "currency_symbol": _CUR_SYM.get(link.get("currency") or "INR", "₹"),
            "gateway": "razorpay" if (link.get("currency") or "INR") == "INR" else "stripe",
            "months": round(link["duration_days"] / 30.5), "note": link.get("note") or "",
            "expires_at": link["expires_at"], "paid_at": link.get("paid_at"),
            "original_amount": link.get("original_amount"), "discount": link.get("discount"), "offer_label": link.get("offer_label"),
            "key_id": RAZORPAY_KEY_ID, "test_mode": RAZORPAY_KEY_ID.startswith("rzp_test_")}


@router.post("/public/pay-link/{token}/order")
async def public_pay_link_order(token: str, request: Request):
    await public_rate_limit(request, key_suffix="pay-link-order", limit=10, window_sec=600)
    link = await _raw_db.subscription_pay_links.find_one({"token": token}, {"_id": 0})
    if not link:
        raise HTTPException(404, "Payment link not found")
    st = _effective_status(link)
    if st != "pending":
        raise HTTPException(400, "This link has expired — ask Miracurl HQ for a fresh one"
                            if st == "expired" else "This link was already used")
    if (link.get("currency") or "INR") != "INR":
        raise HTTPException(400, "This is an international link — pay by card via Stripe instead.")
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
        <p>Your payment of <b>{_fmt_amt(link)}</b> for the <b>{html_lib.escape(link['plan_label'])}</b>
        went through perfectly. Your Miracurl subscription is active till <b>{end_date}</b>.</p>
        <p>The whole Miracurl team is really happy to have you onboard — if you need anything at all,
        just reply to this email and we'll jump right in. 💛</p>
        <p style="font-size:13px;color:#333;margin-top:14px">With warmth,<br/><b>The Miracurl Team</b></p></div>""")


async def _hq_paid_alert_email(link: dict, end_date: str, payment_id: str) -> None:
    """The moment a salon pays through a link, HQ gets an instant email."""
    from email_service import _send_email
    hq = os.environ.get("HQ_EMAIL")
    if not hq:
        return
    salon = html_lib.escape(link["salon_name"])
    await _send_email(
        [hq], f"💰 {salon} just paid {_fmt_amt(link)} via your payment link!",
        f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#333">
        <h2 style="color:#1c1c22">Cha-ching! 🎉</h2>
        <p><b>{salon}</b> just completed payment through the HQ payment link you sent.</p>
        <table style="font-size:14px;border-collapse:collapse;margin:14px 0">
          <tr><td style="padding:5px 14px 5px 0;color:#888">Amount</td><td><b>{_fmt_amt(link)}</b></td></tr>
          <tr><td style="padding:5px 14px 5px 0;color:#888">Plan</td><td>{html_lib.escape(link['plan_label'])}</td></tr>
          <tr><td style="padding:5px 14px 5px 0;color:#888">Active till</td><td><b>{end_date}</b></td></tr>
          <tr><td style="padding:5px 14px 5px 0;color:#888">Owner</td><td>{html_lib.escape(link.get('owner_email') or '—')}</td></tr>
          <tr><td style="padding:5px 14px 5px 0;color:#888">Payment ref</td><td style="font-family:monospace;font-size:12px">{html_lib.escape(payment_id)}</td></tr>
        </table>
        <p style="font-size:13px;color:#555">Their subscription is already activated automatically — nothing to do on your side.
        The full record is in Super Admin → Billing &amp; Subscriptions. ✨</p></div>""")


async def send_pay_link_reminders() -> int:
    """Mira's gentle nudge: pending links expiring within 2 days get one reminder email."""
    from email_service import _send_email
    now = _now()
    soon = (now + timedelta(days=2)).isoformat()
    rows = await _raw_db.subscription_pay_links.find(
        {"status": "pending", "expires_at": {"$gt": now.isoformat(), "$lte": soon},
         "reminder_sent": {"$ne": True}, "owner_email": {"$nin": ["", None]}},
        {"_id": 0}).to_list(100)
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    sent = 0
    for link in rows:
        await _raw_db.subscription_pay_links.update_one(
            {"id": link["id"]}, {"$set": {"reminder_sent": True, "reminded_at": now.isoformat()}})
        salon = html_lib.escape(link["salon_name"])
        url = f"{base}/pay/{link['token']}"
        expires = datetime.fromisoformat(link["expires_at"]).strftime("%d %b %Y")
        res = await _send_email(
            [link["owner_email"]],
            f"⏳ {salon} — your exclusive Miracurl plan link expires soon",
            f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#333">
            <h2 style="color:#1c1c22">A gentle reminder from Mira ✦</h2>
            <p>Hi! Just a friendly nudge — the special <b>{html_lib.escape(link['plan_label'])}</b> at
            <b>{_fmt_amt(link)}</b> that our team reserved for <b>{salon}</b> is still waiting for you,
            and this personal link expires on <b>{expires}</b>.</p>
            <p>We'd truly love to have you onboard — activating takes under a minute:</p>
            <p style="text-align:center;margin:22px 0">
              <a href="{url}" style="background:linear-gradient(120deg,#d4af37,#b45309);color:#fff;text-decoration:none;
                 font-weight:bold;font-size:15px;padding:14px 34px;border-radius:30px;display:inline-block">
                 Activate my plan — {_fmt_amt(link)} →</a></p>
            <p style="font-size:12px;color:#888;text-align:center">{'Secure card payment via Stripe' if (link.get('currency') or 'INR') != 'INR' else 'Secure payment via Razorpay · UPI / Card / NetBanking'}</p>
            <p style="font-size:13px;color:#333">If anything is holding you back, simply reply to this email —
            we're really happy to help. 💛<br/><b>The Miracurl Team</b></p></div>""")
        if res.get("sent"):
            sent += 1
    return sent


async def _finalize_paid_link(link: dict, method: str, payment_ref: str, now: datetime) -> dict:
    """Activate the subscription + notify everyone. `link` must already be atomically claimed."""
    plan_info = {"label": link["plan_label"], "price": float(link["amount"]),
                 "duration_days": int(link["duration_days"]), "branches": 1,
                 "currency": None if (link.get("currency") or "INR") == "INR" else link["currency"]}
    plan_key = link["plan"] if link["plan"] in PLAN_CATALOG else "custom"
    subs = await _apply_subscription_to_tenants(
        [link["tenant_id"]], plan_key, plan_info,
        payment_method=method, payment_ref=payment_ref,
        notes=f"HQ payment link {link['token']} · {method} {payment_ref}", start=now)
    sub = subs[0]
    pay = SubscriptionPayment(
        subscription_id=sub["id"], tenant_id=link["tenant_id"], amount=float(link["amount"]),
        paid_at=now.date().isoformat(), method=method, txn_ref=payment_ref,
        recorded_by=f"pay_link:{link['created_by']}",
        notes=f"HQ payment link {link['token']}").model_dump()
    await db.subscription_payments.insert_one(pay)
    pay.pop("_id", None)
    from services.subscription_invoice import issue_subscription_kit
    await issue_subscription_kit(pay, sub, plan_label=link["plan_label"], currency=link.get("currency") or "INR")
    await _raw_db.hq_messages.insert_one({
        "id": str(uuid.uuid4()), "salon_name": link["salon_name"], "from_email": link.get("owner_email"),
        "message": f"💳 Paid {_fmt_amt(link)} via your payment link ({link['plan_label']}) — "
                   f"subscription active till {sub['end_date']} 🎉",
        "created_at": now.isoformat(), "read": False})
    try:
        await _thank_you_email(link, sub["end_date"])
    except Exception as e:
        log.warning("pay-link thank-you email failed: %s", e)
    try:
        await _hq_paid_alert_email(link, sub["end_date"], payment_ref)
    except Exception as e:
        log.warning("pay-link HQ paid-alert email failed: %s", e)
    return sub


@router.post("/public/pay-link/{token}/verify")
async def public_pay_link_verify(body: PayLinkVerifyIn, token: str, request: Request):
    await public_rate_limit(request, key_suffix="pay-link-verify", limit=10, window_sec=600)
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
    sub = await _finalize_paid_link(link, "razorpay", body.razorpay_payment_id, now)
    return {"ok": True, "salon_name": link["salon_name"], "plan_label": link["plan_label"],
            "end_date": sub["end_date"]}


class StripeCheckoutIn(BaseModel):
    origin_url: str = ""


@router.post("/public/pay-link/{token}/stripe-checkout")
async def pay_link_stripe_checkout(token: str, body: StripeCheckoutIn, request: Request):
    """International links: card payment via Stripe Checkout."""
    await public_rate_limit(request, key_suffix="pay-link-stripe", limit=10, window_sec=600)
    if not os.environ.get("STRIPE_API_KEY"):
        raise HTTPException(503, "Stripe is not configured. Contact Miracurl HQ.")
    link = await _raw_db.subscription_pay_links.find_one({"token": token}, {"_id": 0})
    if not link:
        raise HTTPException(404, "Payment link not found")
    st = _effective_status(link)
    if st != "pending":
        raise HTTPException(400, "This link has expired — ask Miracurl HQ for a fresh one"
                            if st == "expired" else "This link was already used")
    cur = (link.get("currency") or "INR").lower()
    if cur == "inr":
        raise HTTPException(400, "INR links pay via Razorpay.")
    origin = (body.origin_url or "").rstrip("/") or os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    from emergentintegrations.payments.stripe.checkout import CheckoutSessionRequest
    sc = _checkout(request)
    session = await sc.create_checkout_session(CheckoutSessionRequest(
        amount=float(link["amount"]), currency=cur,
        success_url=f"{origin}/pay/{token}?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/pay/{token}",
        metadata={"kind": "pay_link", "pay_link_id": link["id"], "tenant_id": link["tenant_id"]}))
    await _raw_db.subscription_pay_links.update_one(
        {"id": link["id"]}, {"$set": {"stripe_session_id": session.session_id}})
    await _raw_db.payment_transactions.insert_one({
        "session_id": session.session_id, "tenant_id": link["tenant_id"], "kind": "pay_link",
        "pay_link_id": link["id"], "amount": float(link["amount"]), "currency": cur,
        "status": "initiated", "payment_status": "pending",
        "created_at": _now().isoformat(), "updated_at": _now().isoformat()})
    return {"checkout_url": session.url, "session_id": session.session_id}


async def settle_stripe_pay_link(session_id: str) -> bool:
    """Claim + activate a Stripe-paid link (called from status polling AND stripe webhook)."""
    now = _now()
    link = await _raw_db.subscription_pay_links.find_one_and_update(
        {"stripe_session_id": session_id, "status": "pending"},
        {"$set": {"status": "paid", "paid_at": now.isoformat(), "stripe_payment_ref": session_id}},
        return_document=True)
    if not link:
        return False
    await _finalize_paid_link(link, "stripe", session_id, now)
    return True


@router.get("/public/pay-link/{token}/stripe-status/{session_id}")
async def pay_link_stripe_status(token: str, session_id: str, request: Request):
    await public_rate_limit(request, key_suffix="pay-link-stripe-status", limit=30, window_sec=600)
    link = await _raw_db.subscription_pay_links.find_one(
        {"token": token, "stripe_session_id": session_id}, {"_id": 0})
    if not link:
        raise HTTPException(404, "Payment link not found")
    if link["status"] != "paid":
        try:
            status = await _checkout(request).get_checkout_status(session_id)
            if status.payment_status == "paid":
                await settle_stripe_pay_link(session_id)
                await _raw_db.payment_transactions.update_one(
                    {"session_id": session_id},
                    {"$set": {"status": "completed", "payment_status": "paid", "updated_at": _now().isoformat()}})
                link = await _raw_db.subscription_pay_links.find_one({"token": token}, {"_id": 0})
        except Exception as e:
            log.warning("stripe pay-link status check failed: %s", e)
    return {"status": link["status"], "paid_at": link.get("paid_at")}
