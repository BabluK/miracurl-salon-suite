# Extracted from server.py — domain route module (auto-split refactor)
import os
import re
import uuid
import asyncio
import base64
import secrets
import logging
import html as html_lib
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional

import requests
from fastapi import (
    APIRouter, HTTPException, Depends, Request, UploadFile, File, Form,
)
from pydantic import BaseModel, Field

from database import _raw_db, db, _current_tenant_id, _clean
from security import (
    hash_pw, verify_pw, get_current_user, public_rate_limit, require_super_admin,
    require_tenant_admin, current_tenant, log_audit,
)
from models import (
    Tenant, Customer,
)
from email_service import (
    hq_inbox,
    _send_email, _welcome_email_html, _credentials_email_html, _monthly_report_html,
    _weekly_report_html, _platform_digest_html,
)
from services.storage import _put_object, APP_NAME
from services.entitlements import entitlements as _entitlements_of  # noqa: E402
from schemas import TenantIn, TenantUpdateIn

router = APIRouter()

from emergentintegrations.llm.chat import LlmChat, UserMessage
from constants import AFFILIATE_REWARD_INR
from routes.staff_admin import _generate_temp_password

@router.get("/super-admin/affiliates/leaderboard")
async def affiliate_leaderboard(user=Depends(require_super_admin), limit: int = 25):
    """Top tenants by total affiliate credits earned through referrals."""
    cursor = db.tenants.find(
        {"affiliate_credits": {"$gt": 0}},
        {"_id": 0, "id": 1, "slug": 1, "name": 1, "owner_email": 1, "affiliate_credits": 1},
    ).sort("affiliate_credits", -1).limit(int(limit))
    rows = await cursor.to_list(limit)
    # Attach signup counts in a single query
    ids = [r["id"] for r in rows]
    pipeline = [
        {"$match": {"referrer_tenant_id": {"$in": ids}}},
        {"$group": {"_id": "$referrer_tenant_id", "count": {"$sum": 1}}},
    ]
    counts = {x["_id"]: x["count"] async for x in db.affiliate_referrals.aggregate(pipeline)}
    for r in rows:
        r["referral_count"] = counts.get(r["id"], 0)
        r["affiliate_credits"] = float(r.get("affiliate_credits") or 0)
    return {"items": rows, "reward_per_signup": AFFILIATE_REWARD_INR}


@router.get("/super-admin/affiliates/referrals")
async def affiliate_referrals_list(user=Depends(require_super_admin)):
    """Every refer-a-salon signup with its reward status (pending until first payment)."""
    rows = await db.affiliate_referrals.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    rids = list({r.get("referrer_tenant_id") for r in rows if r.get("referrer_tenant_id")})
    tmap = {t["id"]: t["name"] for t in await db.tenants.find(
        {"id": {"$in": rids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(rids) or 1)}
    pending = credited_inr = 0
    for r in rows:
        r["referrer_name"] = tmap.get(r.get("referrer_tenant_id"), r.get("referrer_slug", "—"))
        r.setdefault("status", "credited")  # legacy referrals were credited instantly
        if r["status"] == "pending":
            pending += 1
        else:
            credited_inr += float(r.get("credit_amount") or 0)
    return {"items": rows, "reward_per_signup": AFFILIATE_REWARD_INR,
            "stats": {"total": len(rows), "pending": pending,
                      "credited": len(rows) - pending, "credited_inr": round(credited_inr, 2)}}


@router.get("/super-admin/hq-messages")
async def hq_messages(user=Depends(require_super_admin)):
    items = await _raw_db.hq_messages.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    unread = await _raw_db.hq_messages.count_documents({"read": {"$ne": True}})
    return {"items": items, "unread": unread}


@router.patch("/super-admin/hq-messages/{mid}/read")
async def hq_message_read(mid: str, user=Depends(require_super_admin)):
    await _raw_db.hq_messages.update_one({"id": mid}, {"$set": {"read": True}})
    return {"ok": True}


class TicketStatusIn(BaseModel):
    status: str = Field(..., pattern=r"^(open|in_progress|resolved)$")
    note: Optional[str] = Field(None, max_length=600)


@router.patch("/super-admin/hq-messages/{mid}/status")
async def hq_ticket_status(mid: str, body: TicketStatusIn, user=Depends(require_super_admin)):
    now = datetime.now(timezone.utc).isoformat()
    sets = {"status": body.status}
    if body.note is not None:
        sets.update({"hq_note": body.note.strip(), "hq_note_by": user.get("email"), "hq_note_at": now})
    if body.status == "in_progress":
        sets.update({"read": True, "in_progress_at": now, "in_progress_by": user.get("email")})
    if body.status == "resolved":
        sets.update({"read": True, "resolved_at": now, "resolved_by": user.get("email")})
    res = await _raw_db.hq_messages.update_one({"id": mid}, {"$set": sets})
    if not res.matched_count:
        raise HTTPException(404, "Message not found")
    m = await _raw_db.hq_messages.find_one({"id": mid}, {"_id": 0, "kind": 1, "tenant_id": 1, "ticket_no": 1, "page": 1})
    if m and m.get("kind") == "fix_request" and m.get("tenant_id"):
        from services.tenant_notices import notify_tenant
        no = m.get("ticket_no")
        if body.status == "resolved":
            await notify_tenant(m["tenant_id"], "fix_done", f"✅ Fix request #{no} resolved by Miracurl Support",
                                body.note or "Have a look — changes are listed in Settings → Audit log.", m.get("page") or "/settings", f"fix_done:{mid}")
        elif body.status == "in_progress":
            await notify_tenant(m["tenant_id"], "fix_progress", f"🛠 Miracurl is working on fix request #{no}",
                                body.note or "HQ has opened your workspace and is on it — you'll be told when it's done.", m.get("page") or "/settings", f"fix_progress:{mid}")
    return {"ok": True, "status": body.status}


def _demo_staff_names() -> set:
    """Demo/seed staff never appear in owner reports — even for old invoices billed under them."""
    from seeds import SEED_STAFF
    return {(s.get("name") or "").lower() for s in SEED_STAFF}


async def _tenant_month_stats(tid: str, start: str, end: str) -> dict:
    invs = await _raw_db.invoices.find(
        {"tenant_id": tid, "paid": True, "created_at": {"$gte": start, "$lt": end}}, {"_id": 0}).to_list(3000)
    revenue = sum(i["total"] for i in invs)
    by_svc, by_staff = {}, {}
    demo_names = _demo_staff_names()
    weekly = [0.0, 0.0, 0.0, 0.0, 0.0]  # days 1-7, 8-14, 15-21, 22-28, 29+
    for i in invs:
        for it in i.get("items", []):
            by_svc[it["name"]] = by_svc.get(it["name"], 0) + it["price"] * it.get("qty", 1)
        if i.get("staff_name") and i["staff_name"].lower() not in demo_names:
            by_staff[i["staff_name"]] = by_staff.get(i["staff_name"], 0) + i["total"]
        try:
            day = int(str(i.get("created_at", ""))[8:10])
            weekly[min((day - 1) // 7, 4)] += float(i.get("total") or 0)
        except (ValueError, IndexError):
            pass
    prev_start_dt = (datetime.strptime(start, "%Y-%m-%d") - timedelta(days=1)).replace(day=1)
    prev_invs = await _raw_db.invoices.find(
        {"tenant_id": tid, "paid": True,
         "created_at": {"$gte": prev_start_dt.strftime("%Y-%m-%d"), "$lt": start}},
        {"_id": 0, "total": 1}).to_list(3000)
    prev_revenue = sum(float(i.get("total") or 0) for i in prev_invs)
    return {
        "revenue": revenue,
        "prev_revenue": prev_revenue,
        "weekly": weekly,
        "invoices": len(invs),
        "avg_bill": revenue / len(invs) if invs else 0,
        "new_customers": await _raw_db.customers.count_documents(
            {"tenant_id": tid, "created_at": {"$gte": start, "$lt": end}}),
        "appointments": await _raw_db.appointments.count_documents(
            {"tenant_id": tid, "scheduled_at": {"$gte": start, "$lt": end}}),
        "top_services": sorted(by_svc.items(), key=lambda x: -x[1])[:3],
        "top_staff": sorted(by_staff.items(), key=lambda x: -x[1])[:3],
    }


class MonthlyReportIn(BaseModel):
    tenant_id: Optional[str] = None   # None = all active/trial tenants


def _rule_based_month_tip(stats: dict) -> str:
    rev, prev = float(stats.get("revenue") or 0), float(stats.get("prev_revenue") or 0)
    if prev and rev < prev:
        return ("Revenue dipped vs last month — send a 'We miss you' offer to guests silent for 45+ days; "
                "the Win-back card on your dashboard does it in one tap.")
    if stats.get("top_services"):
        return (f"{stats['top_services'][0][0]} is your bestseller — bundle it with a quieter service "
                "as a combo offer to lift your average bill.")
    return "Share your online booking link on WhatsApp status weekly — steady reminders keep next month's calendar full."


async def _monthly_tip(t: dict, stats: dict) -> str:
    """One AI-written suggestion for the monthly email; rule-based fallback."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        return _rule_based_month_tip(stats)
    weeks = ", ".join(f"W{i + 1} ₹{v:,.0f}" for i, v in enumerate(stats.get("weekly") or []))
    top_svc = stats["top_services"][0][0] if stats.get("top_services") else "n/a"
    top_stf = stats["top_staff"][0][0] if stats.get("top_staff") else "n/a"
    try:
        chat = LlmChat(
            api_key=key, session_id=f"monthly-tip-{t['id']}-{uuid.uuid4().hex[:6]}",
            system_message=("You write ONE actionable business suggestion (max 35 words, no emojis, no preamble) "
                            "for an Indian salon/restaurant owner planning next month, based on last month's numbers. "
                            "Be specific and practical."),
        ).with_model("openai", "gpt-5.4-mini")
        resp = await chat.send_message(UserMessage(text=(
            f"Month revenue ₹{stats['revenue']:,.0f} (previous month ₹{stats.get('prev_revenue', 0):,.0f}), "
            f"{stats['invoices']} bills, avg bill ₹{stats['avg_bill']:,.0f}, {stats['new_customers']} new guests, "
            f"top service: {top_svc}, top staff: {top_stf}. Week-wise: {weeks}. Give one suggestion.")))
        tip = (resp or "").strip().strip('"')
        return tip if 10 < len(tip) < 280 else _rule_based_month_tip(stats)
    except Exception as e:
        logging.warning(f"monthly tip LLM failed, using fallback: {e}")
        return _rule_based_month_tip(stats)


async def _run_monthly_reports(tenant_id: Optional[str] = None) -> dict:
    """Email last month's business report. Used by the super-admin button AND the 1st-of-month auto-scheduler."""
    now = datetime.now(timezone.utc)
    first_this = now.replace(day=1)
    last_month_end = first_this.strftime("%Y-%m-%d")
    last_month_start = (first_this - timedelta(days=1)).replace(day=1)
    start = last_month_start.strftime("%Y-%m-%d")
    month_label = last_month_start.strftime("%B %Y")
    flt = {"id": tenant_id} if tenant_id else {"status": {"$in": ["active", "trial"]}}
    tenants = await db.tenants.find(flt, {"_id": 0}).to_list(500)
    if not tenants:
        return {"month": month_label, "sent": 0, "failed": 0, "results": []}
    results = []
    for t in tenants:
        recipients = [e for e in {t.get("owner_email"), t.get("salon_email")} if e]
        if not recipients:
            results.append({"tenant": t["name"], "sent": False, "error": "no email on file"})
            continue
        stats = await _tenant_month_stats(t["id"], start, last_month_end)
        tip = await _monthly_tip(t, stats)
        status = await _send_email(
            recipients,
            f"✦ Your Miracurl monthly report — {month_label}",
            _monthly_report_html(t, month_label, stats, tip))
        results.append({"tenant": t["name"], "recipients": recipients,
                        "sent": status.get("sent", False), "error": status.get("error")})
    sent = sum(1 for r in results if r["sent"])
    return {"month": month_label, "sent": sent, "failed": len(results) - sent, "results": results}


async def _tenant_week_stats(tid: str, start: str, end: str) -> dict:
    """Stats for one Mon–Sun week [start, end). daily[7] indexed Mon..Sun."""
    invs = await _raw_db.invoices.find(
        {"tenant_id": tid, "paid": True, "created_at": {"$gte": start, "$lt": end}}, {"_id": 0}).to_list(3000)
    revenue = sum(float(i.get("total") or 0) for i in invs)
    start_dt = datetime.strptime(start, "%Y-%m-%d")
    daily = [0.0] * 7
    by_svc, by_staff = {}, {}
    demo_names = _demo_staff_names()
    for i in invs:
        for it in i.get("items", []):
            by_svc[it["name"]] = by_svc.get(it["name"], 0) + it["price"] * it.get("qty", 1)
        if i.get("staff_name") and i["staff_name"].lower() not in demo_names:
            by_staff[i["staff_name"]] = by_staff.get(i["staff_name"], 0) + float(i.get("total") or 0)
        try:
            idx = (datetime.strptime(str(i.get("created_at", ""))[:10], "%Y-%m-%d") - start_dt).days
            if 0 <= idx <= 6:
                daily[idx] += float(i.get("total") or 0)
        except ValueError:
            pass
    prev_start = (start_dt - timedelta(days=7)).strftime("%Y-%m-%d")
    prev_invs = await _raw_db.invoices.find(
        {"tenant_id": tid, "paid": True, "created_at": {"$gte": prev_start, "$lt": start}},
        {"_id": 0, "total": 1}).to_list(3000)
    return {
        "revenue": revenue,
        "prev_revenue": sum(float(i.get("total") or 0) for i in prev_invs),
        "daily": daily,
        "invoices": len(invs),
        "avg_bill": revenue / len(invs) if invs else 0,
        "new_customers": await _raw_db.customers.count_documents(
            {"tenant_id": tid, "created_at": {"$gte": start, "$lt": end}}),
        "top_services": sorted(by_svc.items(), key=lambda x: -x[1])[:3],
        "top_staff": sorted(by_staff.items(), key=lambda x: -x[1])[:3],
    }


_WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _rule_based_tip(stats: dict) -> str:
    daily = stats.get("daily") or []
    if not daily or max(daily) <= 0:
        return "A quiet week — try sharing your online booking link on WhatsApp status to fill next week's slots."
    best = _WEEK_DAYS[daily.index(max(daily))]
    positive = [d for d in daily if d > 0]
    worst_val = min(positive) if positive else 0
    worst = _WEEK_DAYS[daily.index(worst_val)] if positive else ""
    tip = f"{best} was your strongest day"
    if worst and worst != best:
        tip += f" — consider a {worst} happy-hour offer to fill the quieter slot."
    else:
        tip += " — keep that momentum going with a repeat-visit offer."
    return tip


async def _weekly_tip(t: dict, stats: dict) -> str:
    """One AI-written actionable tip for the weekly email; rule-based fallback."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        return _rule_based_tip(stats)
    daily = stats.get("daily") or []
    day_summary = ", ".join(f"{_WEEK_DAYS[i]} ₹{v:,.0f}" for i, v in enumerate(daily[:7]))
    top_svc = stats["top_services"][0][0] if stats.get("top_services") else "n/a"
    try:
        chat = LlmChat(
            api_key=key, session_id=f"weekly-tip-{t['id']}-{uuid.uuid4().hex[:6]}",
            system_message=("You write ONE actionable business tip (max 30 words, no emojis, no preamble) "
                            "for an Indian salon owner based on their weekly numbers. Be specific and practical."),
        ).with_model("openai", "gpt-5.4-mini")
        resp = await chat.send_message(UserMessage(text=(
            f"Week revenue ₹{stats['revenue']:,.0f} (previous week ₹{stats.get('prev_revenue', 0):,.0f}), "
            f"{stats['invoices']} bills, {stats['new_customers']} new guests, top service: {top_svc}. "
            f"Day-wise: {day_summary}. Give one tip.")))
        tip = (resp or "").strip().strip('"')
        return tip if 10 < len(tip) < 260 else _rule_based_tip(stats)
    except Exception as e:
        logging.warning(f"weekly tip LLM failed, using fallback: {e}")
        return _rule_based_tip(stats)


async def _run_weekly_reports(tenant_id: Optional[str] = None) -> dict:
    """Email last completed Mon–Sun week's snapshot. Used by the super-admin button AND the Monday auto-scheduler."""
    ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    this_monday = (ist - timedelta(days=ist.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    start_dt = this_monday - timedelta(days=7)
    start = start_dt.strftime("%Y-%m-%d")
    end = this_monday.strftime("%Y-%m-%d")
    week_label = f"{start_dt.strftime('%d %b')} – {(this_monday - timedelta(days=1)).strftime('%d %b %Y')}"
    flt = {"id": tenant_id} if tenant_id else {"status": {"$in": ["active", "trial"]}}
    tenants = await db.tenants.find(flt, {"_id": 0}).to_list(500)
    results = []
    for t in tenants:
        recipients = [e for e in {t.get("owner_email"), t.get("salon_email")} if e]
        if not recipients:
            results.append({"tenant": t["name"], "sent": False, "error": "no email on file"})
            continue
        stats = await _tenant_week_stats(t["id"], start, end)
        tip = await _weekly_tip(t, stats)
        status = await _send_email(
            recipients,
            f"✦ Your Miracurl weekly snapshot — {week_label}",
            _weekly_report_html(t, week_label, stats, tip))
        results.append({"tenant": t["name"], "recipients": recipients,
                        "sent": status.get("sent", False), "error": status.get("error")})
    sent = sum(1 for r in results if r["sent"])
    return {"week": week_label, "sent": sent, "failed": len(results) - sent, "results": results}


@router.post("/super-admin/send-weekly-report")
async def send_weekly_report(body: MonthlyReportIn, user=Depends(require_super_admin)):
    out = await _run_weekly_reports(body.tenant_id)
    if not out["results"]:
        raise HTTPException(404, "No matching salons")
    return out


@router.post("/super-admin/send-monthly-report")
async def send_monthly_report(body: MonthlyReportIn, user=Depends(require_super_admin)):
    out = await _run_monthly_reports(body.tenant_id)
    if not out["results"]:
        raise HTTPException(404, "No matching salons")
    return out


@router.get("/super-admin/tenants")
async def list_tenants(user=Depends(require_super_admin)):
    tenants = await db.tenants.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Salons-per-owner-email count (multi-salon owners)
    owners = await db.users.find(
        {"role": "admin", "email": {"$in": list({t.get("owner_email") for t in tenants if t.get("owner_email")})}},
        {"_id": 0, "email": 1, "tenant_ids": 1, "tenant_id": 1}).to_list(1000)
    counts = {}
    for o in owners:
        ids = o.get("tenant_ids") or ([o["tenant_id"]] if o.get("tenant_id") else [])
        counts[o["email"]] = max(counts.get(o["email"], 0), len(set(ids)))
    ref_names = {t["id"]: t["name"] for t in tenants}
    today = datetime.now(timezone.utc).date()
    from email_service import _is_login_only
    admins = await db.users.find({"role": "admin", "tenant_id": {"$in": [t["id"] for t in tenants]}},
                                 {"_id": 0, "tenant_id": 1, "tenant_ids": 1, "notify_email": 1, "email": 1}).to_list(2000)
    real_inbox = set()
    for a in admins:
        cands = [a.get("notify_email"), a.get("email")]
        if any(c and not _is_login_only(c) for c in cands):
            real_inbox.update((a.get("tenant_ids") or []) + ([a["tenant_id"]] if a.get("tenant_id") else []))
    for t in tenants:
        t["inbox_ok"] = (t["id"] in real_inbox) or any(
            t.get(k) and not _is_login_only(t[k]) for k in ("notify_email", "salon_email", "owner_email"))
    for t in tenants:
        t["owner_salon_count"] = counts.get(t.get("owner_email"), 1)
        if t.get("referred_by_tenant_id"):
            t["referred_by_name"] = ref_names.get(t["referred_by_tenant_id"])
        trial_end = t.get("trial_end_date") or t.get("trial_ends_at")
        if t.get("signup_offer") == "newbiz":
            t["trial_kind"] = "newbiz90"
        elif t.get("status") == "trial" and trial_end and t.get("created_at"):
            try:
                span = (date.fromisoformat(str(trial_end)[:10])
                        - datetime.fromisoformat(str(t["created_at"]).replace("Z", "+00:00")).date()).days
                t["trial_kind"] = "trial30" if 25 <= span < 60 else "trial7" if span < 25 else "trial_long"
                t["trial_span_days"] = span
                t["trial_span_label"] = (f"{t['trial_months']}-month" if t.get("trial_months") and t["trial_months"] != 12
                                         else "1-year" if t.get("trial_months") == 12 else f"{span}-day")
            except (ValueError, TypeError):
                pass
        if t.get("status") == "trial" and trial_end:
            try:
                t["trial_days_left"] = (date.fromisoformat(str(trial_end)[:10]) - today).days
            except (ValueError, TypeError):
                pass
    return tenants


class OnboardImgIn(BaseModel):
    tenant_id: str = Field(..., max_length=64)
    vibe: str = Field("luxury", max_length=40)


@router.post("/super-admin/onboarding-image")
async def superadmin_onboarding_bg(body: OnboardImgIn, user=Depends(require_super_admin)):
    """AI background for the 'Welcome Onboard' WhatsApp-status poster."""
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
    t = await db.tenants.find_one({"id": body.tenant_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Salon not found")
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    vibes = {
        "luxury": "opulent dark luxury salon interior, warm golden bokeh lights, marble and brass details",
        "festive": "celebratory salon scene with soft golden confetti, ribbons and sparkling bokeh",
        "minimal": "elegant minimal beauty studio, soft neutral tones, diffused daylight, subtle gold accents",
        "floral": "dreamy salon backdrop with soft blush florals, silk drapes and golden light leaks",
    }
    prompt = (f"Vertical 9:16 background image for a premium salon welcome poster: "
              f"{vibes.get(body.vibe, vibes['luxury'])}. Cinematic soft-focus photography, dark vignette edges, "
              f"generous empty space in the center for overlay text. Absolutely NO text, NO letters, NO logos, NO people's faces.")
    gen = OpenAIImageGeneration(api_key=key)
    from routes.mira_common import paint_offloop
    try:
        images = await paint_offloop(gen, prompt=prompt)
    except Exception as e:
        raise HTTPException(400, f"Background generation failed: {e}")
    if not images:
        raise HTTPException(400, "No image was generated")
    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/superadmin/onboarding/{file_id}.png"
    try:
        result = _put_object(storage_path, images[0], "image/png")
    except requests.HTTPError as e:
        raise HTTPException(400, f"Storage upload failed: {e}") from e
    await _raw_db.uploads.insert_one({
        "id": file_id, "tenant_id": t["id"], "kind": "onboarding",
        "storage_path": result.get("path", storage_path),
        "original_filename": f"{file_id}.png", "content_type": "image/png",
        "size": len(images[0]), "uploaded_by": user["id"], "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"url": f"/api/files/{file_id}"}

async def _generate_onboarding_poster(t: dict) -> str:
    """Unique AI welcome poster per tenant. Returns absolute URL or '' (never blocks onboarding)."""
    try:
        from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
        key = os.environ.get("EMERGENT_LLM_KEY")
        if not key:
            return ""
        if t.get("business_type") == "restaurant":
            vibe = secrets.choice([
                "opulent dark luxury restaurant interior with warm golden bokeh lights, marble tables and brass details",
                "celebratory fine-dining scene with soft golden confetti, candlelit tables and sparkling champagne bokeh",
                "royal Indian-inspired restaurant decor with marigold accents, warm diyas glow, brass thalis and gold filigree",
                "modern chic bistro with emerald velvet booths, gold-rimmed mirrors, glowing pendant lights over plated dishes",
                "sizzling tandoor grill glow with elegant smoke wisps, copper cookware and warm amber lighting",
            ])
            prompt = (f"Wide 3:2 luxury welcome banner for a restaurant: {vibe}. "
                      f"Elegant gold serif text centered reading exactly: 'Welcome {t['name']}'. "
                      f"Sparkling light particles, cinematic lighting, premium hospitality-brand aesthetic. No people's faces.")
        else:
            vibe = secrets.choice([
                "opulent dark luxury salon interior with warm golden bokeh lights, marble and brass details",
                "celebratory salon scene with soft golden confetti, ribbons and sparkling champagne bokeh",
                "dreamy salon backdrop with soft blush florals, silk drapes and golden light leaks",
                "modern chic salon with emerald velvet chairs, gold-rimmed mirrors and glowing pendant lights",
                "royal Indian-inspired salon decor with marigold accents, warm diyas glow and gold filigree",
            ])
            prompt = (f"Wide 3:2 luxury welcome banner for a beauty salon: {vibe}. "
                      f"Elegant gold serif text centered reading exactly: 'Welcome {t['name']}'. "
                      f"Sparkling light particles, cinematic lighting, premium beauty-brand aesthetic. No people's faces.")
        gen = OpenAIImageGeneration(api_key=key)
        from routes.mira_common import paint_offloop
        images = await paint_offloop(gen, prompt=prompt)
        if not images:
            return ""
        file_id = str(uuid.uuid4())
        storage_path = f"{APP_NAME}/superadmin/welcome-posters/{file_id}.png"
        result = _put_object(storage_path, images[0], "image/png")
        await _raw_db.uploads.insert_one({
            "id": file_id, "tenant_id": t["id"], "kind": "welcome_poster",
            "storage_path": result.get("path", storage_path),
            "original_filename": f"{file_id}.png", "content_type": "image/png",
            "size": len(images[0]), "uploaded_by": "system", "is_deleted": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        url = f"{os.environ.get('APP_PUBLIC_URL', 'https://miracurl-suite.com')}/api/files/{file_id}"
        await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"welcome_poster_url": url}})
        return url
    except Exception as e:
        logging.warning(f"welcome poster generation failed: {e}")
        return ""


@router.post("/super-admin/tenants")
async def create_tenant(body: TenantIn, user=Depends(require_super_admin)):
    if await db.tenants.find_one({"slug": body.slug}):
        raise HTTPException(400, "Slug already in use")
    existing_owner = await db.users.find_one({"email": body.owner_email.lower()})
    if existing_owner and existing_owner.get("role") != "admin":
        raise HTTPException(
            400, "This email belongs to a staff/manager login — a salon can only be tagged to an OWNER (admin) email.")
    t = Tenant(
        slug=body.slug, name=body.name, owner_email=body.owner_email.lower(),
        location=body.location, phone=body.phone, plan=body.plan, status="trial",
        salon_email=(body.salon_email or "").lower() or None, owner_phone=body.owner_phone,
    ).model_dump()
    t["business_type"] = body.business_type or "salon"
    from routes.subscriptions import get_trial_days
    from services.trial_onboarding import issue_trial_kit, trial_end
    _default_days = await get_trial_days()
    _now = datetime.now(timezone.utc)
    _end = trial_end(_now, body.trial_months, _default_days).isoformat()
    t["created_at"] = _now.isoformat()
    t["trial_ends_at"] = t["trial_end_date"] = _end
    t["trial_months"] = body.trial_months
    t["owner_name"] = body.owner_name
    if body.logo_url:
        t["logo_url"] = body.logo_url
    if body.module_locks is not None:
        from services.entitlements import MODULES
        t["module_locks"] = [m for m in body.module_locks if m in MODULES]
    await db.tenants.insert_one(t)
    t.pop("_id", None)
    trial_kit_task = lambda: asyncio.create_task(issue_trial_kit(t["id"], body.trial_months, _default_days))  # noqa: E731
    if t["business_type"] == "restaurant":
        from services.tenant_seed import _seed_restaurant_defaults
        await _seed_restaurant_defaults(t["id"])

    if existing_owner:
        # MULTI-SALON: tag the new salon to the existing owner login (same email & password).
        prev_ids = existing_owner.get("tenant_ids") or ([existing_owner["tenant_id"]] if existing_owner.get("tenant_id") else [])
        await db.users.update_one(
            {"id": existing_owner["id"]},
            {"$set": {"tenant_ids": sorted(set(prev_ids) | {t["id"]})}})
        salon_count = len(set(prev_ids) | {t["id"]})
        email_status = await _send_email(
            [body.owner_email.lower()],
            f"New salon added to your Miracurl account ✦ {t['name']}",
            f"<div style='font-family:Georgia,serif;padding:24px'><h2>Namaste {existing_owner.get('name') or 'Owner'} ✦</h2>"
            f"<p><b>{t['name']}</b> has been added to your Miracurl account.</p>"
            f"<p>You now manage <b>{salon_count} salons</b> with the same login ({body.owner_email.lower()}). "
            f"Use the salon switcher in the top bar (your Owner PIN confirms each switch).</p></div>")
        trial_kit_task()
        return {
            "tenant": t,
            "owner_email": body.owner_email,
            "linked_existing_owner": True,
            "owner_salon_count": salon_count,
            "email_status": email_status,
            "trial_end_date": _end,
            "congrats_email": "queued",
        }

    # Generate a one-time password if the super-admin didn't supply one. The
    # owner must change it on first login (see `must_change_password`).
    if body.owner_password:
        temp_pw = body.owner_password
    else:
        # Friendly prefix + high-entropy token (~64 bits) — see _generate_temp_password.
        temp_pw = _generate_temp_password()
    owner = {
        "id": str(uuid.uuid4()),
        "email": body.owner_email.lower(),
        "name": body.owner_name,
        "role": "admin",
        "tenant_id": t["id"],
        "status": "active",
        "password_hash": hash_pw(temp_pw),
        "must_change_password": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(owner)
    # Email the one-time credentials to the owner's personal email AND the salon email.
    recipients = [body.owner_email.lower()]
    if t.get("salon_email") and t["salon_email"] not in recipients:
        recipients.append(t["salon_email"])
    # Every onboarded salon gets its own unique AI-generated welcome poster.
    poster_url = await _generate_onboarding_poster(t)
    from routes.hq_documents import _all_doc_attachments
    try:
        _bt = "restaurant" if t.get("business_type") == "restaurant" else "salon"
        welcome_attachments = await asyncio.to_thread(_all_doc_attachments, _bt)
    except Exception as e:
        logging.warning(f"brochure attachment failed: {e}")
        welcome_attachments = None
    email_status = await _send_email(
        recipients,
        ("Welcome to Miracurl — your restaurant account is ready 🍽️✦"
         if t["business_type"] == "restaurant"
         else "Welcome to Miracurl — your salon account is ready ✦"),
        _welcome_email_html(t["name"], body.owner_email.lower(), temp_pw, poster_url,
                            business_type=t["business_type"], owner_name=body.owner_name,
                            locked_modules=_entitlements_of(t)["locked"]),
        attachments=welcome_attachments)
    trial_kit_task()
    # Return the temp password ONCE so super-admin can copy/share it. Never
    # stored in cleartext or retrievable again — a lost password requires a
    # /forgot flow just like any user.
    return {
        "tenant": t,
        "owner_email": body.owner_email,
        "temp_password": temp_pw,
        "must_change_password": True,
        "email_recipients": recipients,
        "email_status": email_status,
        "trial_end_date": _end,
        "congrats_email": "queued",
    }


# ---------------- Contact Miracurl HQ (admin → platform team, with attachments) ----------------
_HQ_MAX_FILES = 3
_HQ_MAX_TOTAL_BYTES = 10 * 1024 * 1024


@router.post("/contact-hq")
async def contact_hq(
    request: Request,
    subject: str = Form(..., min_length=2, max_length=150),
    message: str = Form(..., min_length=2, max_length=5000),
    files: List[UploadFile] = File(default=[]),
    admin=Depends(require_tenant_admin), t=Depends(current_tenant),
):
    # Throttle per tenant: 5 messages / hour (audit P3 — email quota/storage abuse)
    await public_rate_limit(request, key_suffix=f"hq-{t['id']}", limit=5, window_sec=3600)
    if len(files) > _HQ_MAX_FILES:
        raise HTTPException(400, f"Maximum {_HQ_MAX_FILES} attachments allowed")
    attachments, names, total = [], [], 0
    for f in files:
        data = await f.read()
        total += len(data)
        if total > _HQ_MAX_TOTAL_BYTES:
            raise HTTPException(413, "Attachments too large — max 10MB total")
        if data:
            fname = re.sub(r"[\r\n]", "", (f.filename or "attachment"))[:120]
            attachments.append({"filename": fname, "content": base64.b64encode(data).decode()})
            names.append(fname)
    safe_msg = html_lib.escape(message).replace("\n", "<br/>")
    html = f"""
<div style="font-family:Arial,sans-serif;max-width:600px">
<h2 style="color:#1a1a2e">📨 Message from a salon owner</h2>
<p><b>Salon:</b> {html_lib.escape(t['name'])} ({t['slug']})<br/>
<b>From:</b> {html_lib.escape(admin['email'])}<br/>
<b>Subject:</b> {html_lib.escape(subject)}</p>
<div style="background:#f8f7fc;border:1px solid #e6e3f2;border-radius:10px;padding:16px;font-size:14px;color:#333">{safe_msg}</div>
<p style="font-size:12px;color:#888;margin-top:14px">Attachments: {html_lib.escape(', '.join(names)) or 'none'} · Sent via Miracurl Contact HQ</p>
</div>"""
    status = await _send_email(
        [hq_inbox("support")],
        f"[Miracurl HQ] {subject} — {t['name']}", html, attachments=attachments or None)
    await _raw_db.hq_messages.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": t["id"], "tenant_name": t["name"],
        "from_email": admin["email"], "subject": subject, "message": message,
        "attachments": names, "email_status": status, "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    if not status.get("sent"):
        raise HTTPException(400, f"Message saved but email delivery failed: {status.get('error')}")
    return {"ok": True}


class ChangePasswordIn(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


@router.post("/auth/change-password")
async def change_password(body: ChangePasswordIn, user=Depends(get_current_user)):
    """Authenticated password change. Clears the must_change_password flag so
    the forced-change modal disappears on subsequent logins."""
    fresh = await db.users.find_one({"id": user["id"]})
    if not fresh or not verify_pw(body.current_password, fresh["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    if body.current_password == body.new_password:
        raise HTTPException(400, "New password must be different from current")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "password_hash": hash_pw(body.new_password),
            "must_change_password": False,
            "password_changed_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True}



@router.get("/super-admin/tenants/{tid}")
async def get_tenant(tid: str, user=Depends(require_super_admin)):
    t = await db.tenants.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    # add some stats
    _current_tenant_id.set(t["id"])
    t["stats"] = {
        "customers": await db.customers.count_documents({}),
        "appointments": await db.appointments.count_documents({}),
        "invoices": await db.invoices.count_documents({}),
        "users": await _raw_db.users.count_documents({"tenant_id": t["id"]}),
    }
    _current_tenant_id.set(None)
    return t

@router.put("/super-admin/tenants/{tid}")
async def update_tenant(tid: str, body: TenantUpdateIn, user=Depends(require_super_admin)):
    t = await db.tenants.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    scope = upd.pop("owner_email_scope", None) or "all"
    takeover = bool(upd.pop("owner_email_takeover", False))
    if not upd:
        raise HTTPException(400, "No fields to update")
    for f in ("owner_email", "salon_email"):
        if f in upd:
            upd[f] = upd[f].strip().lower()

    owner_login = None
    old_email = (t.get("owner_email") or "").lower()
    if upd.get("owner_email") and upd["owner_email"] != old_email:
        from services.owner_email import change_owner_email
        owner_login = await change_owner_email(t, upd.pop("owner_email"), scope=scope, takeover=takeover, by=user.get("email", "hq"))
    elif "owner_email" in upd:
        upd.pop("owner_email")

    if upd:
        await db.tenants.update_one({"id": tid}, {"$set": upd})
    out = await db.tenants.find_one({"id": tid}, {"_id": 0})
    if owner_login:
        out["owner_login"] = owner_login
    return out


@router.post("/super-admin/tenants/{tid}/resend-credentials")
async def resend_owner_credentials(tid: str, user=Depends(require_super_admin)):
    """Reset the owner's password to a fresh temp one and email the new credentials.
    Owner must change it on first login. Affects ALL salons sharing this login."""
    t = await db.tenants.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    owner_email = (t.get("owner_email") or "").lower()
    owner = await db.users.find_one({"email": owner_email, "role": "admin"})
    if not owner:
        raise HTTPException(404, "No owner (admin) login found for this salon's owner email")
    temp_pw = _generate_temp_password()
    await db.users.update_one({"id": owner["id"]}, {"$set": {
        "password_hash": hash_pw(temp_pw), "must_change_password": True, "disabled": False,
        "password_changed_at": datetime.now(timezone.utc).isoformat()}})
    recipients = [owner_email]
    if t.get("salon_email") and t["salon_email"].lower() not in recipients:
        recipients.append(t["salon_email"].lower())
    email_status = await _send_email(
        recipients, f"🔑 Your new Miracurl login credentials — {t['name']}",
        _credentials_email_html(t["name"], owner_email, temp_pw))
    owned = set(owner.get("tenant_ids") or [])
    if owner.get("tenant_id"):
        owned.add(owner["tenant_id"])
    return {"ok": True, "temp_password": temp_pw, "owner_email": owner_email,
            "email_recipients": recipients, "email_status": email_status,
            "affects_salons": max(len(owned), 1)}


class BranchLinkIn(BaseModel):
    branch_tenant_id: str


@router.post("/super-admin/tenants/{tid}/link-branch")
async def link_branch(tid: str, body: BranchLinkIn, user=Depends(require_super_admin)):
    """Link ANOTHER salon (by its unique Tenant ID) to THIS salon's owner login.
    Works even when the two salons were created with different owner emails."""
    t = await db.tenants.find_one({"id": tid}, {"_id": 0, "id": 1, "name": 1, "owner_email": 1})
    if not t:
        raise HTTPException(404, "Tenant not found")
    bid = body.branch_tenant_id.strip()
    if bid == tid:
        raise HTTPException(400, "A salon can't be linked to itself")
    branch = await db.tenants.find_one({"id": bid}, {"_id": 0, "id": 1, "name": 1, "slug": 1})
    if not branch:
        raise HTTPException(404, f"No salon found with Tenant ID '{bid}' — double-check the ID")
    owner = await db.users.find_one({"email": (t.get("owner_email") or "").lower(), "role": "admin"})
    if not owner:
        raise HTTPException(404, "No owner (admin) login found for this salon")
    owned = set(owner.get("tenant_ids") or [])
    if owner.get("tenant_id"):
        owned.add(owner["tenant_id"])
    if bid in owned:
        raise HTTPException(400, f"'{branch['name']}' is already linked to this owner")
    await db.users.update_one({"id": owner["id"]}, {"$addToSet": {"tenant_ids": bid}})
    if not owner.get("tenant_ids"):  # ensure primary is also in the array for consistency
        await db.users.update_one({"id": owner["id"]}, {"$addToSet": {"tenant_ids": owner.get("tenant_id")}})
    return {"ok": True, "linked": {"id": branch["id"], "name": branch["name"], "slug": branch["slug"]},
            "owner_email": owner["email"], "total_salons": len(owned) + 1}


@router.post("/super-admin/tenants/{tid}/unlink-branch")
async def unlink_branch(tid: str, body: BranchLinkIn, user=Depends(require_super_admin)):
    """Remove a linked branch from this salon's owner login (cannot remove the active salon)."""
    t = await db.tenants.find_one({"id": tid}, {"_id": 0, "id": 1, "owner_email": 1})
    if not t:
        raise HTTPException(404, "Tenant not found")
    owner = await db.users.find_one({"email": (t.get("owner_email") or "").lower(), "role": "admin"})
    if not owner:
        raise HTTPException(404, "No owner (admin) login found for this salon")
    bid = body.branch_tenant_id.strip()
    if bid == owner.get("tenant_id"):
        raise HTTPException(400, "Can't unlink the owner's currently active salon — switch their active salon first")
    await db.users.update_one({"id": owner["id"]}, {"$pull": {"tenant_ids": bid}})
    return {"ok": True, "unlinked": bid}


@router.get("/super-admin/tenants/{tid}/linked-branches")
async def linked_branches(tid: str, user=Depends(require_super_admin)):
    """All salons linked to this salon's owner login (for the edit modal)."""
    t = await db.tenants.find_one({"id": tid}, {"_id": 0, "id": 1, "owner_email": 1})
    if not t:
        raise HTTPException(404, "Tenant not found")
    owner = await db.users.find_one({"email": (t.get("owner_email") or "").lower(), "role": "admin"})
    if not owner:
        return {"owner_found": False, "salons": []}
    owned = set(owner.get("tenant_ids") or [])
    if owner.get("tenant_id"):
        owned.add(owner["tenant_id"])
    salons = await db.tenants.find(
        {"id": {"$in": list(owned)}},
        {"_id": 0, "id": 1, "name": 1, "slug": 1, "location": 1, "status": 1}).sort("name", 1).to_list(20)
    for s in salons:
        s["active_for_owner"] = s["id"] == owner.get("tenant_id")
    return {"owner_found": True, "owner_email": owner["email"], "salons": salons}


# ---------------- Trusted Partners (public profile of the platform) ----------------
async def _reviews_by_tenant() -> dict:
    aggs = await _raw_db.reviews.aggregate([
        {"$match": {"public": True}},
        {"$group": {"_id": "$tenant_id", "avg": {"$avg": "$rating"}, "n": {"$sum": 1}}},
    ]).to_list(2000)
    return {a["_id"]: a for a in aggs}


def _tenant_partner_card(t: dict, agg: Optional[dict]) -> dict:
    return {
        "id": t["id"], "source": "tenant", "name": t.get("name") or "",
        "logo_url": t.get("logo_url") or "", "city": t.get("location") or "",
        "rating": round(float(agg["avg"]), 1) if agg else None,
        "reviews_count": int(agg["n"]) if agg else 0,
        "blurb": t.get("partner_blurb") or "",
        "owner_review": t.get("partner_review") or None,
        "featured": bool(t.get("partner_featured")),
        "trusted": bool(t.get("trusted_badge")), "trusted_since": (t.get("trusted_badge") or {}).get("since", ""),
        "slug": t.get("slug") or "", "since": (t.get("created_at") or "")[:10],
    }


class PartnerReviewIn(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    text: str = Field("", max_length=500)


@router.get("/partner-review")
async def get_partner_review(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """The salon owner's own rating/review of the Miracurl platform."""
    rev = t.get("partner_review") or {}
    locked = bool(rev) and not t.get("partner_review_editable")
    return {**rev, "locked": locked}


@router.put("/partner-review")
async def save_partner_review(body: PartnerReviewIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    # One-time review: once submitted it locks. Only Miracurl HQ can re-enable editing.
    if t.get("partner_review") and not t.get("partner_review_editable"):
        raise HTTPException(403, "Your review is already published and locked. Contact Miracurl HQ to enable editing.")
    doc = {"rating": int(body.rating), "text": body.text.strip(),
           "author": user.get("name") or t.get("owner_name") or t.get("name") or "Owner",
           "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.tenants.update_one(
        {"id": t["id"]},
        {"$set": {"partner_review": doc}, "$unset": {"partner_review_editable": ""}})
    return {**doc, "locked": True}


@router.get("/public/partners")
async def public_partners(request: Request):
    """Landing-page 'Trusted Partners': onboarded salons (auto) + manual partners."""
    await public_rate_limit(request, key_suffix="partners", limit=30, window_sec=600)
    by_tid = await _reviews_by_tenant()
    tenants = await _raw_db.tenants.find(
        {"status": {"$in": ["active", "trial"]}},
        {"_id": 0, "id": 1, "name": 1, "logo_url": 1, "location": 1, "slug": 1,
         "created_at": 1, "partner_visible": 1, "partner_featured": 1, "partner_blurb": 1, "partner_review": 1, "trusted_badge": 1},
    ).to_list(300)
    out = [_tenant_partner_card(t, by_tid.get(t["id"]))
           for t in tenants if t.get("partner_visible") is not False
           and not re.search(r"\btest\b", t.get("name") or "", re.I)]
    manual = await _raw_db.partners.find({}, {"_id": 0}).to_list(100)
    out += [{**p, "source": "manual", "reviews_count": p.get("reviews_count", 0)} for p in manual]
    out.sort(key=lambda p: (not p.get("featured"), not p.get("trusted"), -(p.get("rating") or 0)))
    return out


class PartnerTenantIn(BaseModel):
    visible: Optional[bool] = None
    featured: Optional[bool] = None
    blurb: Optional[str] = Field(None, max_length=400)
    allow_review_edit: Optional[bool] = None


class ManualPartnerIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    logo_url: str = Field("", max_length=500)
    city: str = Field("", max_length=100)
    blurb: str = Field("", max_length=400)
    rating: Optional[float] = Field(None, ge=0, le=5)
    featured: bool = False


@router.get("/super-admin/partners")
async def super_partners(user=Depends(require_super_admin)):
    by_tid = await _reviews_by_tenant()
    tenants = await _raw_db.tenants.find(
        {"status": {"$in": ["active", "trial"]}},
        {"_id": 0, "id": 1, "name": 1, "logo_url": 1, "location": 1, "slug": 1,
         "created_at": 1, "partner_visible": 1, "partner_featured": 1, "partner_blurb": 1,
         "partner_review": 1, "partner_review_editable": 1},
    ).to_list(300)
    cards = []
    for t in tenants:
        c = _tenant_partner_card(t, by_tid.get(t["id"]))
        c["visible"] = t.get("partner_visible") is not False
        c["review_editable"] = bool(t.get("partner_review_editable"))
        cards.append(c)
    manual = await _raw_db.partners.find({}, {"_id": 0}).to_list(100)
    return {"tenants": cards, "manual": manual}


@router.put("/super-admin/partners/tenant/{tid}")
async def update_partner_tenant(tid: str, body: PartnerTenantIn, user=Depends(require_super_admin)):
    sets = {}
    if body.visible is not None:
        sets["partner_visible"] = body.visible
    if body.featured is not None:
        sets["partner_featured"] = body.featured
    if body.blurb is not None:
        sets["partner_blurb"] = body.blurb.strip()
    if body.allow_review_edit is not None:
        sets["partner_review_editable"] = body.allow_review_edit
    if not sets:
        raise HTTPException(400, "Nothing to update")
    r = await db.tenants.update_one({"id": tid}, {"$set": sets})
    if r.matched_count == 0:
        raise HTTPException(404, "Tenant not found")
    return {"ok": True, **sets}


@router.post("/super-admin/partners/manual")
async def add_manual_partner(body: ManualPartnerIn, user=Depends(require_super_admin)):
    doc = {"id": str(uuid.uuid4()), **body.model_dump(),
           "created_at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.partners.insert_one(doc)
    return _clean(doc)


@router.delete("/super-admin/partners/manual/{pid}")
async def delete_manual_partner(pid: str, user=Depends(require_super_admin)):
    await _raw_db.partners.delete_one({"id": pid})
    return {"ok": True}


@router.delete("/super-admin/tenants/{tid}")
async def delete_tenant(tid: str, user=Depends(require_super_admin)):
    # Soft delete: mark cancelled. Hard delete leaves orphan data we may want.
    await db.tenants.update_one({"id": tid}, {"$set": {"status": "cancelled"}})
    return {"ok": True}


# Every tenant-scoped collection — kept in sync with TenantCollection usage in database.py
_TENANT_SCOPED_COLLECTIONS = [
    "advances", "appointments", "attendance", "branch_switch_requests", "chat_messages",
    "chat_threads", "coupons", "customer_memberships", "customer_packages", "customers",
    "entertainment_playlists", "feedback", "gallery", "invoices", "leave_requests",
    "memberships", "packages", "products", "reviews", "services", "sms_pack_payments",
    "staff", "staff_resumes", "vendors", "whatsapp_requests",
    # non-TenantCollection but tenant-keyed
    "subscriptions", "subscription_payments", "pin_attempts", "partner_overrides",
]


@router.delete("/super-admin/tenants/{tid}/permanent")
async def permanent_delete_tenant(tid: str, request: Request, user=Depends(require_super_admin)):
    """HARD delete: wipes the salon and ALL its data (customers, invoices, staff, bookings,
    subscriptions, logins…). Irreversible. Requires ?confirm=<exact slug> to prevent mistakes.
    Intended for removing test/demo salons."""
    t = await db.tenants.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    confirm = request.query_params.get("confirm", "")
    if confirm != t.get("slug"):
        raise HTTPException(400, f"Type the salon's exact slug '{t.get('slug')}' to confirm permanent deletion.")

    deleted: dict = {}
    for coll in _TENANT_SCOPED_COLLECTIONS:
        res = await _raw_db[coll].delete_many({"tenant_id": tid})
        if res.deleted_count:
            deleted[coll] = res.deleted_count

    # Users: remove logins whose ONLY salon is this one; unlink it from multi-salon owners.
    async for u in _raw_db.users.find({"$or": [{"tenant_id": tid}, {"tenant_ids": tid}]}, {"_id": 0, "id": 1, "tenant_id": 1, "tenant_ids": 1, "role": 1}):
        others = [x for x in (u.get("tenant_ids") or []) if x != tid]
        if u.get("role") == "super_admin" or (u.get("tenant_id") and u["tenant_id"] != tid) or others:
            # Multi-salon owner / super-admin: just unlink this branch, keep the login.
            new_active = u["tenant_id"] if (u.get("tenant_id") and u["tenant_id"] != tid) else (others[0] if others else None)
            await _raw_db.users.update_one({"id": u["id"]},
                {"$pull": {"tenant_ids": tid}, "$set": {"tenant_id": new_active}})
        else:
            await _raw_db.users.delete_one({"id": u["id"]})
            deleted["users"] = deleted.get("users", 0) + 1

    await _raw_db.tenants.delete_one({"id": tid})
    deleted["tenants"] = 1
    logging.getLogger("super_admin").warning(
        "PERMANENT DELETE tenant %s (%s) by %s — %s", tid, t.get("slug"), user["email"], deleted)
    return {"ok": True, "deleted_salon": t.get("name"), "records_removed": deleted}


@router.post("/super-admin/tenants/{tid}/reactivate")
async def reactivate_tenant(tid: str, user=Depends(require_super_admin)):
    """Re-onboard a cancelled salon: restore access (7-day grace trial), issue a
    fresh one-time owner password and re-send the welcome email. All historical
    data (customers, invoices, staff) is preserved."""
    t = await db.tenants.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    if t.get("status") not in ("cancelled", "suspended"):
        raise HTTPException(400, f"Tenant is already {t.get('status')} — nothing to reactivate")
    owner = await db.users.find_one(
        {"tenant_id": tid, "email": (t.get("owner_email") or "").lower()}, {"_id": 0})
    if not owner:
        owner = await db.users.find_one({"tenant_id": tid, "role": "admin"}, {"_id": 0})
    if not owner:
        raise HTTPException(404, "No owner login found for this tenant")
    trial_end = (datetime.now(timezone.utc) + timedelta(days=7)).date().isoformat()
    await db.tenants.update_one({"id": tid}, {"$set": {
        "status": "trial", "trial_end_date": trial_end, "trial_ends_at": trial_end,
        "subscription_end_date": None,
        "reactivated_at": datetime.now(timezone.utc).isoformat(),
    }})
    temp_pw = _generate_temp_password()
    await db.users.update_one({"id": owner["id"]}, {"$set": {
        "password_hash": hash_pw(temp_pw), "must_change_password": True, "status": "active"}})
    recipients = [owner["email"]]
    if t.get("salon_email") and t["salon_email"] not in recipients:
        recipients.append(t["salon_email"])
    email_status = await _send_email(
        recipients,
        "Welcome back to Miracurl — your salon is live again ✦",
        _welcome_email_html(t["name"], owner["email"], temp_pw, t.get("welcome_poster_url") or ""))
    return {
        "ok": True, "owner_email": owner["email"], "temp_password": temp_pw,
        "trial_end_date": trial_end, "email_recipients": recipients,
        "email_status": email_status,
    }


# ---------------- Super-Admin: Bulk customer import ----------------
VCARD_FN_RE = re.compile(r"^FN(?:;[^:]*)?:(.+)$", re.MULTILINE)
VCARD_N_RE = re.compile(r"^N(?:;[^:]*)?:(.+)$", re.MULTILINE)
VCARD_TEL_RE = re.compile(r"^TEL(?:;[^:]*)?:(.+)$", re.MULTILINE)
PHONE_DIGITS_RE = re.compile(r"\d{7,15}")


def _normalize_phone(raw: str) -> Optional[str]:
    """Strip non-digits; keep last 10–15 digits. Return None if unusable."""
    digits = "".join(c for c in (raw or "") if c.isdigit())
    if len(digits) < 7:
        return None
    # Strip India country code prefix (91) when phone is 12 digits starting with 91
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    return digits[-15:]


def _parse_vcard(text: str) -> list:
    """Return list of {name, phone} from a vCard (.vcf) blob."""
    rows = []
    blocks = re.split(r"BEGIN:VCARD", text, flags=re.IGNORECASE)
    for block in blocks:
        if "END:VCARD" not in block.upper():
            continue
        fn = VCARD_FN_RE.search(block)
        n = VCARD_N_RE.search(block)
        name = (fn.group(1) if fn else (n.group(1).replace(";", " ").strip() if n else "")).strip()
        for tel in VCARD_TEL_RE.findall(block):
            phone = _normalize_phone(tel)
            if phone:
                rows.append({"name": name or "Imported Customer", "phone": phone})
    return rows


def _parse_plain_text(text: str) -> list:
    """Parse pasted lines: 'Name, +91 98765 43210' OR 'Name\\t+91 98765 43210' OR 'Name +91...' OR just digits."""
    rows = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        # Find the longest digit run that looks like a phone
        m = PHONE_DIGITS_RE.search(line.replace(" ", "").replace("-", ""))
        if not m:
            continue
        phone = _normalize_phone(m.group(0))
        if not phone:
            continue
        # Name = everything except the phone token(s)
        name_part = re.sub(r"[+\d][\d\s\-()]{6,}", "", line).strip(" ,;-\t")
        rows.append({"name": name_part or "Imported Customer", "phone": phone})
    return rows


def parse_customer_import(text: str, fmt: str) -> list:
    """fmt: 'vcard' | 'text' | 'auto'. Returns list of {name, phone}."""
    if not text or not text.strip():
        return []
    fmt = (fmt or "auto").lower()
    if fmt == "vcard" or (fmt == "auto" and "BEGIN:VCARD" in text.upper()):
        return _parse_vcard(text)
    return _parse_plain_text(text)


class CustomerImportIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=2_000_000)
    format: str = Field("auto", pattern="^(auto|vcard|text)$")


class CustomerImportRowOut(BaseModel):
    name: str
    phone: str
    status: str  # 'added' | 'skipped' | 'invalid'
    reason: Optional[str] = None
    referral_code: Optional[str] = None


@router.post("/super-admin/tenants/{tid}/customers/import")
async def super_admin_import_customers(tid: str, body: CustomerImportIn, user=Depends(require_super_admin)):
    tenant = await db.tenants.find_one({"id": tid}, {"_id": 0})
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    parsed = parse_customer_import(body.text, body.format)
    if not parsed:
        raise HTTPException(400, "No valid contacts found. Make sure each line has a phone number.")

    # Scope all DB operations to this tenant
    _current_tenant_id.set(tenant["id"])
    try:
        rows: list = []
        added = 0
        skipped = 0
        seen_in_batch: set = set()  # dedupe within the same upload
        for r in parsed:
            phone = r["phone"]
            name = (r.get("name") or "Imported Customer").strip()[:80]
            if phone in seen_in_batch:
                rows.append({"name": name, "phone": phone, "status": "skipped", "reason": "duplicate in upload"})
                skipped += 1
                continue
            seen_in_batch.add(phone)
            existing = await db.customers.find_one({"phone": phone}, {"_id": 0, "id": 1, "referral_code": 1})
            if existing:
                rows.append({"name": name, "phone": phone, "status": "skipped", "reason": "already in salon",
                             "referral_code": existing.get("referral_code")})
                skipped += 1
                continue
            cust = Customer(name=name, phone=phone, notes="Imported from contacts").model_dump()
            await db.customers.insert_one(cust)
            rows.append({"name": name, "phone": phone, "status": "added", "referral_code": cust["referral_code"]})
            added += 1
        return {
            "tenant": {"id": tenant["id"], "slug": tenant["slug"], "name": tenant["name"]},
            "summary": {"total_parsed": len(parsed), "added": added, "skipped": skipped},
            "rows": rows,
        }
    finally:
        _current_tenant_id.set(None)


class ImportCleanIn(BaseModel):
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")  # local day the guests were added
    action: str = Field("preview", pattern="^(preview|delete|move)$")
    target_tid: Optional[str] = None


def _untouched_import_filter(tenant: dict, day: str) -> dict:
    from services.day_window import _tenant_tz, _local_day_window
    _d, start, end = _local_day_window(_tenant_tz(tenant), day)
    return {"tenant_id": tenant["id"], "created_at": {"$gte": start, "$lte": end},
            "$and": [{"$or": [{"visits": {"$in": [0, None]}}, {"visits": {"$exists": False}}]},
                     {"$or": [{"total_spent": {"$in": [0, None]}}, {"total_spent": {"$exists": False}}]}]}


@router.post("/super-admin/tenants/{tid}/customers/import-clean")
async def super_admin_import_clean(tid: str, body: ImportCleanIn, user=Depends(require_super_admin)):
    """Undo a bulk import that landed in the wrong salon: guests ADDED on that local day who were never
    billed (0 visits, ₹0) are previewed, deleted, or moved to another tenant (phones already there are skipped)."""
    tenant = await _raw_db.tenants.find_one({"id": tid}, {"_id": 0, "id": 1, "slug": 1, "name": 1, "timezone": 1})
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    flt = _untouched_import_filter(tenant, body.date)
    rows = await _raw_db.customers.find(flt, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(20000)
    ids = [r["id"] for r in rows]
    out = {"tenant": {"id": tenant["id"], "slug": tenant["slug"], "name": tenant["name"]}, "date": body.date,
           "matched": len(rows), "sample": rows[:8], "action": body.action}
    if body.action == "preview" or not ids:
        return out
    if body.action == "delete":
        res = await _raw_db.customers.delete_many({"tenant_id": tenant["id"], "id": {"$in": ids}})
        out["deleted"] = res.deleted_count
    else:
        target = await _raw_db.tenants.find_one({"id": body.target_tid or ""}, {"_id": 0, "id": 1, "slug": 1, "name": 1})
        if not target or target["id"] == tenant["id"]:
            raise HTTPException(400, "Pick a different target salon to move the guests into")
        have = {c["phone"] async for c in _raw_db.customers.find({"tenant_id": target["id"], "phone": {"$in": [r["phone"] for r in rows if r.get("phone")]}}, {"_id": 0, "phone": 1})}
        move_ids = [r["id"] for r in rows if r.get("phone") not in have]
        dup_ids = [r["id"] for r in rows if r.get("phone") in have]
        res = await _raw_db.customers.update_many({"tenant_id": tenant["id"], "id": {"$in": move_ids}}, {"$set": {"tenant_id": target["id"]}})
        dup = await _raw_db.customers.delete_many({"tenant_id": tenant["id"], "id": {"$in": dup_ids}}) if dup_ids else None
        out.update({"moved": res.modified_count, "duplicates_removed": dup.deleted_count if dup else 0,
                    "target": target})
    await log_audit(tenant["id"], user, "hq_import_clean", f"{body.action} {len(ids)} untouched guests added {body.date}")
    logging.warning("[hq] import-clean %s on %s (%s): %s", body.action, tenant["slug"], body.date, {k: v for k, v in out.items() if k in ("matched", "deleted", "moved", "duplicates_removed")})
    return out


@router.get("/super-admin/overview")
async def super_admin_overview(user=Depends(require_super_admin)):
    tenants = await db.tenants.find({}, {"_id": 0}).to_list(500)
    by_status = {}
    by_plan = {}
    for t in tenants:
        status, plan = t.get("status", "unknown"), t.get("plan", "unknown")
        by_status[status] = by_status.get(status, 0) + 1
        by_plan[plan] = by_plan.get(plan, 0) + 1
    return {
        "total_tenants": len(tenants),
        "by_status": by_status,
        "by_plan": by_plan,
        "recent": tenants[:5],
    }
async def _run_platform_digest() -> dict:
    """Monday HQ email: platform pulse — salons, leads, expiring trials, open tickets, revenue."""
    hq = hq_inbox("admin")
    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).isoformat()
    week_ahead = (now + timedelta(days=7)).isoformat()
    tenants = await _raw_db.tenants.find({}, {"_id": 0, "name": 1, "status": 1, "trial_ends_at": 1}).to_list(500)
    tenants = [t for t in tenants if not re.search(r"\btest\b", t.get("name") or "", re.I)]
    expiring = [{"name": t["name"], "ends": str(t.get("trial_ends_at", ""))[:10]}
                for t in tenants if t.get("status") == "trial" and week_ago < str(t.get("trial_ends_at", "")) < week_ahead]
    leads = await _raw_db.tenant_inquiries.find(
        {"created_at": {"$gte": week_ago}}, {"_id": 0, "name": 1, "phone": 1}).to_list(50)
    invs = await _raw_db.invoices.find(
        {"paid": True, "created_at": {"$gte": week_ago[:10]}}, {"_id": 0, "total": 1}).to_list(5000)
    ist = now + timedelta(hours=5, minutes=30)
    stats = {
        "week_label": f"Week of {ist.strftime('%d %b %Y')}",
        "active_tenants": sum(1 for t in tenants if t.get("status") == "active"),
        "trial_tenants": sum(1 for t in tenants if t.get("status") == "trial"),
        "new_leads": len(leads),
        "recent_leads": leads,
        "open_tickets": await _raw_db.dev_tickets.count_documents({"status": {"$nin": ["done", "closed"]}}),
        "platform_revenue": round(sum(float(i.get("total") or 0) for i in invs), 2),
        "expiring_trials": expiring,
    }
    status = await _send_email([hq], f"✦ Platform Health Digest — {stats['week_label']}", _platform_digest_html(stats))
    return {"sent": 1 if status.get("sent") else 0, "error": status.get("error"), "stats_summary": {k: v for k, v in stats.items() if k not in ("recent_leads", "expiring_trials")}}


@router.post("/super-admin/send-platform-digest")
async def send_platform_digest(user=Depends(require_super_admin)):
    return await _run_platform_digest()




@router.get("/super-admin/referrals")
async def super_admin_referrals(user=Depends(require_super_admin)):
    """Refer & Earn overview: every referral edge + rewards granted."""
    refs = await _raw_db.affiliate_referrals.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    names = {t["id"]: t.get("name", "") async for t in _raw_db.tenants.find({}, {"_id": 0, "id": 1, "name": 1})}
    rows = [{"referrer": names.get(r.get("referrer_tenant_id"), r.get("referrer_slug", "?")),
             "referred": names.get(r.get("referred_tenant_id"), "?"),
             "signed_up": str(r.get("created_at", ""))[:10],
             "qualified_at": str(r.get("qualified_at", ""))[:10],
             "status": r.get("status", "pending")} for r in refs]
    rewards = await _raw_db.referral_rewards.find({}, {"_id": 0}).sort("granted_at", -1).to_list(100)
    comms = await _raw_db.partner_commissions.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for c in comms:
        c["referrer"] = names.get(c.get("referrer_tenant_id"), "?")
    return {"referrals": rows, "rewards": rewards, "commissions": comms}


@router.post("/super-admin/referrals/commissions/{cid}/mark-paid")
async def mark_commission_paid(cid: str, user=Depends(require_super_admin)):
    r = await _raw_db.partner_commissions.update_one(
        {"id": cid, "status": "pending"},
        {"$set": {"status": "paid", "paid_at": datetime.now(timezone.utc).isoformat()}})
    if not r.modified_count:
        raise HTTPException(404, "Commission not found or already paid")
    return {"ok": True}
