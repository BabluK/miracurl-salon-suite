"""Miracurl Growth Advisory — chargeable strategy service for salon owners.
HQ (Bablu / Miracurl team) delivers it; Razorpay collects; Miracurl keeps a platform cut,
the rest is the advisor payout. Owners buy from Settings; HQ schedules the slot."""
import html as html_lib
import os
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import db, _raw_db
from security import current_tenant, require_super_admin, require_tenant_admin
from services.billing import RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, _rzp_client

router = APIRouter()
CFG_KEY = "growth_advisory"

DEFAULT_TIERS = [
    {"id": "starter", "name": "Starter Strategy Call", "price": 4999, "badge": "",
     "tagline": "A 60-minute 1:1 call that finds the money you're leaving on the table.",
     "includes": ["60-min video call with the Miracurl growth team", "Revenue & footfall audit of your last 90 days",
                  "5 quick wins you can act on this week", "Written summary within 24 hours"]},
    {"id": "blueprint", "name": "Growth Blueprint", "price": 14999, "badge": "Most popular",
     "tagline": "A 90-day plan built to take your salon to ₹3–5 lakh a month.",
     "includes": ["2 deep-dive strategy sessions", "Pricing & service-menu redesign", "Membership, loyalty & referral plan",
                  "90-day marketing calendar (WhatsApp, Instagram, Google)", "Staff targets & incentive structure",
                  "30-day check-in call"]},
    {"id": "dwy", "name": "Done-with-you · 3 months", "price": 29999, "badge": "Hands-on",
     "tagline": "We work beside you every week until the numbers move.",
     "includes": ["Everything in Growth Blueprint", "Weekly 30-min execution calls for 12 weeks",
                  "Campaign copy & creatives done for you (Mira AI)", "Hiring & training playbook",
                  "Monthly P&L review", "WhatsApp priority line to the Miracurl team"]},
]
DEFAULT_CFG = {"key": CFG_KEY, "enabled": False, "platform_cut_pct": 10, "opt_in_mode": "selected",
               "opted_tenant_ids": [], "tiers": DEFAULT_TIERS,
               "headline": "Miracurl Growth Advisory",
               "pitch": "Strategic growth planning from the team that runs 100+ salons' numbers every day. "
                        "Our goal for you: a predictable ₹3–5 lakh a month."}
STATUSES = {"paid", "scheduled", "completed", "refunded"}


async def get_cfg() -> dict:
    doc = await _raw_db.hq_settings.find_one({"key": CFG_KEY}, {"_id": 0})
    return {**DEFAULT_CFG, **(doc or {})}


def _split(amount: float, cut_pct: float) -> dict:
    cut = int(round(amount * cut_pct / 100))
    return {"platform_cut": cut, "advisor_payout": int(round(amount)) - cut}


def _tenant_offered(cfg: dict, t: dict) -> bool:
    if not cfg.get("enabled") or t.get("status") != "active":
        return False
    return cfg.get("opt_in_mode") == "all" or t["id"] in (cfg.get("opted_tenant_ids") or [])


# ── Super Admin ──
class TierIn(BaseModel):
    id: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=2, max_length=80)
    price: int = Field(ge=99, le=1_000_000)
    badge: str = Field("", max_length=30)
    tagline: str = Field("", max_length=200)
    includes: list[str] = Field(default_factory=list, max_length=12)


class CfgIn(BaseModel):
    enabled: bool
    platform_cut_pct: float = Field(ge=0, le=50)
    opt_in_mode: str = Field(pattern="^(all|selected)$")
    headline: str = Field(min_length=3, max_length=80)
    pitch: str = Field("", max_length=400)
    tiers: list[TierIn] = Field(min_length=1, max_length=5)


async def _ledger(cfg: dict) -> dict:
    rows = await _raw_db.advisory_bookings.find({"status": {"$ne": "created"}}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for r in rows:
        r["progress"] = await _progress(r)
    live = [r for r in rows if r["status"] != "refunded"]
    gross = sum(r["amount"] for r in live)
    return {"bookings": rows, "stats": {"count": len(live), "gross": gross,
                                        **_split(gross, cfg["platform_cut_pct"]),
                                        "pending_schedule": sum(1 for r in rows if r["status"] == "paid")}}


@router.get("/super-admin/growth-advisory")
async def sa_get(user=Depends(require_super_admin)):
    cfg = await get_cfg()
    tenants = await _raw_db.tenants.find({"status": "active"}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "plan": 1, "owner_email": 1}).to_list(500)
    opted = set(cfg.get("opted_tenant_ids") or [])
    for t in tenants:
        t["opted"] = t["id"] in opted
    tenants.sort(key=lambda x: (not x["opted"], (x.get("name") or "").lower()))
    return {"config": cfg, "tenants": tenants, **await _ledger(cfg), "razorpay_enabled": bool(RAZORPAY_KEY_ID)}


@router.put("/super-admin/growth-advisory")
async def sa_put(body: CfgIn, user=Depends(require_super_admin)):
    data = body.model_dump()
    if len({t["id"] for t in data["tiers"]}) != len(data["tiers"]):
        raise HTTPException(400, "Tier ids must be unique")
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_by"] = user.get("email")
    await _raw_db.hq_settings.update_one({"key": CFG_KEY}, {"$set": data}, upsert=True)
    return await get_cfg()


class OptIn(BaseModel):
    opted: bool


@router.post("/super-admin/growth-advisory/tenants/{tenant_id}/opt-in")
async def sa_opt(tenant_id: str, body: OptIn, user=Depends(require_super_admin)):
    if not await _raw_db.tenants.find_one({"id": tenant_id}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Tenant not found")
    op = {"$addToSet": {"opted_tenant_ids": tenant_id}} if body.opted else {"$pull": {"opted_tenant_ids": tenant_id}}
    await _raw_db.hq_settings.update_one({"key": CFG_KEY}, {**op, "$setOnInsert": {"enabled": False}}, upsert=True)
    return {"ok": True, "opted": body.opted}


class ScheduleIn(BaseModel):
    slot_at: str = Field(min_length=10, max_length=40)
    duration_min: int = Field(60, ge=15, le=240)
    meet_link: str = Field("", max_length=300)
    note: str = Field("", max_length=500)


@router.post("/super-admin/growth-advisory/bookings/{booking_id}/schedule")
async def sa_schedule(booking_id: str, body: ScheduleIn, user=Depends(require_super_admin)):
    try:
        when = datetime.fromisoformat(body.slot_at)
    except ValueError:
        raise HTTPException(400, "Invalid slot time")
    b = await _raw_db.advisory_bookings.find_one({"id": booking_id, "status": {"$in": ["paid", "scheduled"]}}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found or not schedulable")
    sess = {"slot_at": body.slot_at, "duration_min": body.duration_min, "meet_link": body.meet_link.strip(),
            "note": body.note.strip(), "scheduled_by": user.get("email"), "scheduled_at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.advisory_bookings.update_one({"id": booking_id}, {"$set": {"status": "scheduled", "session": sess}})
    pretty = when.strftime("%a, %d %b %Y · %I:%M %p")
    await _email_owner(b, f"📅 Your {b['tier_name']} session is booked — {pretty}",
                       f"Your Miracurl Growth Advisory session is confirmed for <b>{pretty}</b> ({body.duration_min} min).",
                       body.meet_link.strip(), body.note.strip())
    return {"ok": True, "status": "scheduled", "session": sess}


class StatusIn(BaseModel):
    status: str = Field(pattern="^(completed|refunded|paid)$")


# ── 90-day progress tracker ──
class TrackerIn(BaseModel):
    target_monthly: int = Field(ge=10000, le=100_000_000)
    start_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


@router.post("/super-admin/growth-advisory/bookings/{booking_id}/tracker")
async def sa_tracker(booking_id: str, body: TrackerIn, user=Depends(require_super_admin)):
    r = await _raw_db.advisory_bookings.update_one(
        {"id": booking_id, "status": {"$in": ["paid", "scheduled", "completed"]}},
        {"$set": {"tracker": {"target_monthly": body.target_monthly, "start_date": body.start_date, "set_by": user.get("email")}}})
    if not r.matched_count:
        raise HTTPException(404, "Booking not found")
    b = await _raw_db.advisory_bookings.find_one({"id": booking_id}, {"_id": 0})
    return {"ok": True, "progress": await _progress(b)}


async def _revenue_between(tenant_id: str, start_iso: str, end_iso: str) -> float:
    rows = await _raw_db.invoices.aggregate([
        {"$match": {"tenant_id": tenant_id, "status": {"$ne": "voided"}, "created_at": {"$gte": start_iso, "$lt": end_iso}}},
        {"$group": {"_id": None, "s": {"$sum": "$total"}}}]).to_list(1)
    return float(rows[0]["s"]) if rows else 0.0


def _month_start(d: date) -> date:
    return d.replace(day=1)


def _add_months(d: date, n: int) -> date:
    m = d.month - 1 + n
    return d.replace(year=d.year + m // 12, month=m % 12 + 1, day=1)


async def _progress(b: dict) -> Optional[dict]:
    if b.get("status") not in ("scheduled", "completed"):
        return None
    tr = b.get("tracker") or {}
    start_s = tr.get("start_date") or ((b.get("session") or {}).get("slot_at") or b.get("paid_at") or b["created_at"])[:10]
    target = int(tr.get("target_monthly") or 300000)
    start = date.fromisoformat(start_s)
    today = datetime.now(timezone.utc).date()
    end = start + timedelta(days=90)
    tid = b["tenant_id"]
    months = []
    cur = _month_start(today)
    for i in range(3, -1, -1):
        ms = _add_months(cur, -i)
        me = _add_months(ms, 1)
        rev = await _revenue_between(tid, ms.isoformat(), me.isoformat())
        months.append({"label": ms.strftime("%b"), "month": ms.isoformat()[:7], "revenue": round(rev), "current": i == 0})
    current_rev = months[-1]["revenue"]
    base_start, base_end = _add_months(_month_start(start), -3), _month_start(start)
    baseline = await _revenue_between(tid, base_start.isoformat(), base_end.isoformat()) / 3
    milestones = []
    for day in (30, 60, 90):
        md = start + timedelta(days=day)
        reached = today >= md
        rev = await _revenue_between(tid, (md - timedelta(days=30)).isoformat(), md.isoformat()) if reached else None
        milestones.append({"day": day, "date": md.isoformat(), "reached": reached, "revenue": round(rev) if rev is not None else None,
                           "hit_target": (rev >= target) if rev is not None else None})
    return {"target_monthly": target, "start_date": start.isoformat(), "end_date": end.isoformat(),
            "day": max(0, min(90, (today - start).days)), "days_left": max(0, (end - today).days),
            "current_month_revenue": current_rev, "pct_to_target": round(min(100.0, current_rev / target * 100), 1) if target else 0,
            "baseline_monthly": round(baseline), "months": milestones and months, "milestones": milestones,
            "custom": bool(tr)}


@router.post("/super-admin/growth-advisory/bookings/{booking_id}/status")
async def sa_status(booking_id: str, body: StatusIn, user=Depends(require_super_admin)):
    r = await _raw_db.advisory_bookings.update_one(
        {"id": booking_id, "status": {"$in": list(STATUSES)}},
        {"$set": {"status": body.status, f"{body.status}_at": datetime.now(timezone.utc).isoformat(), "status_by": user.get("email")}})
    if not r.matched_count:
        raise HTTPException(404, "Booking not found")
    return {"ok": True, "status": body.status}


# ── Tenant owner ──
def _public_tiers(cfg: dict) -> list:
    return [{k: t[k] for k in ("id", "name", "price", "badge", "tagline", "includes")} for t in cfg["tiers"]]


@router.get("/settings/growth-advisory")
async def owner_get(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    cfg = await get_cfg()
    mine = await _raw_db.advisory_bookings.find({"tenant_id": t["id"], "status": {"$ne": "created"}},
                                                {"_id": 0, "razorpay_signature": 0}).sort("created_at", -1).to_list(50)
    for m in mine:
        m["progress"] = await _progress(m)
    return {"offered": _tenant_offered(cfg, t), "headline": cfg["headline"], "pitch": cfg["pitch"],
            "tiers": _public_tiers(cfg), "bookings": mine,
            "razorpay_enabled": bool(RAZORPAY_KEY_ID), "test_mode": RAZORPAY_KEY_ID.startswith("rzp_test_")}


class OrderIn(BaseModel):
    tier: str = Field(min_length=2, max_length=30)
    goal: str = Field("", max_length=400)


@router.post("/settings/growth-advisory/order")
async def owner_order(body: OrderIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    cfg = await get_cfg()
    if not _tenant_offered(cfg, t):
        raise HTTPException(403, "Growth Advisory isn't enabled for your salon yet — ask Miracurl HQ.")
    tier = next((x for x in cfg["tiers"] if x["id"] == body.tier), None)
    if not tier:
        raise HTTPException(400, "Unknown package")
    rzp = _rzp_client()
    if not rzp:
        raise HTTPException(503, "Online payment is unavailable right now — contact HQ to book.")
    receipt = f"adv_{t['slug'][:18]}_{int(datetime.now(timezone.utc).timestamp())}"[:40]
    order = rzp.order.create({"amount": int(tier["price"]) * 100, "currency": "INR", "receipt": receipt,
                              "notes": {"kind": "growth_advisory", "tenant_id": t["id"], "tier": tier["id"]}})
    await _raw_db.advisory_bookings.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": t["id"], "tenant_name": t.get("name"), "tenant_slug": t.get("slug"),
        "owner_email": user.get("email") or t.get("owner_email"), "owner_name": user.get("name") or t.get("owner_name") or "",
        "tier_id": tier["id"], "tier_name": tier["name"], "amount": int(tier["price"]),
        "platform_cut_pct": cfg["platform_cut_pct"], **_split(tier["price"], cfg["platform_cut_pct"]),
        "goal": body.goal.strip(), "razorpay_order_id": order["id"], "status": "created",
        "created_at": datetime.now(timezone.utc).isoformat()})
    return {"order_id": order["id"], "amount": order["amount"], "currency": order["currency"],
            "key_id": RAZORPAY_KEY_ID, "label": tier["name"], "prefill": {"email": user.get("email"), "name": user.get("name")}}


class VerifyIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.post("/settings/growth-advisory/verify")
async def owner_verify(body: VerifyIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    from routes.subscriptions import _verify_rzp_signature
    if not (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET):
        raise HTTPException(503, "Razorpay is not configured.")
    if not _verify_rzp_signature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature):
        raise HTTPException(400, "Payment signature verification failed — possible tampering.")
    b = await _raw_db.advisory_bookings.find_one_and_update(
        {"razorpay_order_id": body.razorpay_order_id, "status": "created", "tenant_id": t["id"]},
        {"$set": {"status": "paid", "razorpay_payment_id": body.razorpay_payment_id,
                  "paid_at": datetime.now(timezone.utc).isoformat()}}, return_document=True)
    if not b:
        raise HTTPException(400, "Unknown, already-consumed, or foreign order — please retry.")
    b.pop("_id", None)
    await _notify_paid(b)
    return {"ok": True, "booking": {k: b[k] for k in ("id", "tier_name", "amount", "status", "paid_at")}}


# ── Emails ──
def _wrap(title: str, body_html: str) -> str:
    return f"""
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #eee;border-radius:16px;overflow:hidden">
      <div style="background:#1c1c22;padding:26px 30px">
        <span style="color:#e8c37f;font-size:21px;letter-spacing:1.5px">Miracurl Growth Advisory</span>
        <div style="color:#8a8a92;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin-top:4px">Strategy · Revenue · Growth</div>
      </div>
      <div style="padding:30px">
        <h2 style="margin:0 0 12px;font-size:20px;color:#1c1c22">{title}</h2>{body_html}
        <p style="font-size:11px;color:#999;margin-top:26px;border-top:1px solid #eee;padding-top:14px">
          Miracurl · Salon &amp; Restaurant Management Suite · reply to this email to reach the growth team.</p>
      </div>
    </div>"""


async def _email_owner(b: dict, subject: str, lead: str, meet_link: str = "", note: str = ""):
    from email_service import _send_email
    if not b.get("owner_email"):
        return
    extra = ""
    if meet_link:
        extra += f'<p style="margin:14px 0"><a href="{html_lib.escape(meet_link)}" style="display:inline-block;background:#1c1c22;color:#e8c37f;text-decoration:none;padding:12px 26px;border-radius:10px;font-size:14px">Join the session ✦</a></p>'
    if note:
        extra += f'<p style="font-size:13px;color:#555;line-height:1.7"><b>From your advisor:</b> {html_lib.escape(note)}</p>'
    body = (f'<p style="font-size:14px;color:#333;line-height:1.75">Hi {html_lib.escape(b.get("owner_name") or "there")},</p>'
            f'<p style="font-size:14px;color:#333;line-height:1.75">{lead}</p>{extra}'
            f'<p style="font-size:12px;color:#777">Package: <b>{html_lib.escape(b["tier_name"])}</b> · ₹{b["amount"]:,} · Ref {b["id"][:8].upper()}</p>')
    try:
        await _send_email([b["owner_email"]], subject, _wrap(subject.split("—")[0].strip(" 📅✅"), body), tag="growth-advisory")
    except Exception:  # noqa: BLE001
        pass


async def _notify_paid(b: dict):
    from email_service import _send_email, hq_notify_emails
    await _email_owner(b, f"✅ Welcome to Miracurl Growth Advisory — {b['tier_name']}",
                       "Your payment is confirmed. The Miracurl growth team will email you within 1 business day with your "
                       "session slot. Meanwhile, reply with your biggest goal for the next 90 days so we can prepare.")
    base = os.environ.get("APP_PUBLIC_URL", "").rstrip("/")
    hq = (f'<p style="font-size:14px;color:#333;line-height:1.75"><b>{html_lib.escape(b.get("tenant_name") or "")}</b> '
          f'({html_lib.escape(b.get("tenant_slug") or "")}) bought <b>{html_lib.escape(b["tier_name"])}</b> for ₹{b["amount"]:,}.</p>'
          f'<p style="font-size:13px;color:#555">Platform cut {b["platform_cut_pct"]}% = ₹{b["platform_cut"]:,} · Advisor payout ₹{b["advisor_payout"]:,}<br>'
          f'Owner: {html_lib.escape(b.get("owner_name") or "")} · {html_lib.escape(b.get("owner_email") or "")}<br>'
          f'Goal: {html_lib.escape(b.get("goal") or "—")}</p>'
          f'<p><a href="{base}/super-admin?tab=growth-advisory" style="display:inline-block;background:#1c1c22;color:#e8c37f;text-decoration:none;padding:12px 26px;border-radius:10px;font-size:14px">Schedule the session ✦</a></p>')
    try:
        await _send_email(hq_notify_emails("sales"), f"💼 New Growth Advisory booking — {b.get('tenant_name')} · ₹{b['amount']:,}",
                          _wrap("New advisory booking", hq), tag="growth-advisory-hq")
    except Exception:  # noqa: BLE001
        pass
