"""Dedicated Mira AI assistant for every salon — voice briefing + Q&A scoped to the tenant's own data."""
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import db
from security import require_tenant_admin

router = APIRouter()
log = logging.getLogger("tenant_mira")

_IST = timezone(timedelta(hours=5, minutes=30))

MIRA_TABS = ["/dashboard", "/appointments", "/pos", "/customers", "/staff", "/services",
             "/inventory", "/reports", "/marketing", "/reviews"]


def _tod_greeting() -> str:
    h = datetime.now(_IST).hour
    return "Good morning" if h < 12 else ("Good afternoon" if h < 17 else "Good evening")


async def _biz_word(user: dict) -> str:
    from database import _raw_db
    t = await _raw_db.tenants.find_one({"id": user.get("tenant_id")}, {"_id": 0, "business_type": 1})
    return "restaurant" if (t or {}).get("business_type") == "restaurant" else "salon"


async def _salon_snapshot() -> dict:
    today = datetime.now(timezone.utc).date().isoformat()
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    snap = {}
    try:
        snap["bookings_today"] = await db.appointments.count_documents({"date": today})
        snap["pending_bookings_today"] = await db.appointments.count_documents(
            {"date": today, "status": {"$in": ["pending", "confirmed"]}})
    except Exception:
        snap["bookings_today"] = 0
    try:
        rev = await db.invoices.aggregate([
            {"$match": {"created_at": {"$gte": today}}},
            {"$group": {"_id": None, "n": {"$sum": 1}, "s": {"$sum": "$total"}}}]).to_list(1)
        snap["invoices_today"] = (rev[0]["n"] if rev else 0) or 0
        snap["revenue_today"] = round((rev[0]["s"] if rev else 0) or 0)
    except Exception:
        snap["revenue_today"] = 0
    try:
        snap["new_customers_this_week"] = await db.customers.count_documents({"created_at": {"$gte": week_ago}})
        snap["total_customers"] = await db.customers.count_documents({})
    except Exception:
        pass
    try:
        snap["active_staff"] = await db.staff.count_documents({"active": {"$ne": False}})
        att = await db.attendance.find(
            {"date": today, "check_in_at": {"$ne": None}},
            {"_id": 0, "staff_name": 1, "check_out_at": 1}).to_list(100)
        snap["staff_on_floor"] = [a.get("staff_name") for a in att if not a.get("check_out_at") and a.get("staff_name")]
        snap["staff_done_for_day"] = [a.get("staff_name") for a in att if a.get("check_out_at") and a.get("staff_name")]
        weekday = datetime.now(_IST).strftime("%A").lower()
        offs = await db.staff.find(
            {"active": {"$ne": False}, "week_off_day": weekday}, {"_id": 0, "name": 1}).to_list(50)
        snap["staff_week_off_today"] = [s["name"] for s in offs if s.get("name")]
    except Exception:
        pass
    try:
        snap["active_services"] = await db.services.count_documents({"active": {"$ne": False}})
    except Exception:
        pass
    try:
        snap["unread_reviews"] = await db.reviews.count_documents({"seen": {"$ne": True}})
    except Exception:
        pass
    return snap


@router.get("/tenant/mira/briefing")
async def tenant_mira_briefing(user=Depends(require_tenant_admin)):
    snap = await _salon_snapshot()

    def _n(c, s, p):
        return f"{c} {s if c == 1 else p}"
    def _names(lst, cap=4):
        lst = lst or []
        return ", ".join(lst[:cap]) + (f" and {len(lst) - cap} more" if len(lst) > cap else "")
    bits = []
    if snap.get("revenue_today"):
        bits.append(f"today's collection is ₹{snap['revenue_today']:,} from {_n(snap.get('invoices_today') or 0, 'bill', 'bills')}")
    else:
        bits.append("no collection yet today")
    if snap.get("bookings_today"):
        bits.append(f"{_n(snap['bookings_today'], 'booking', 'bookings')} on today's calendar")
    else:
        bits.append("no bookings yet today")
    on_floor = snap.get("staff_on_floor") or []
    done = snap.get("staff_done_for_day") or []
    if on_floor:
        bits.append(f"{_names(on_floor)} {'is' if len(on_floor) == 1 else 'are'} on the floor")
    elif done:
        bits.append(f"{_names(done)} finished their shift")
    else:
        bits.append("no staff has checked in yet")
    if snap.get("staff_week_off_today"):
        bits.append(f"{_names(snap['staff_week_off_today'])} {'is' if len(snap['staff_week_off_today']) == 1 else 'are'} on week-off today")
    if snap.get("new_customers_this_week"):
        bits.append(f"{_n(snap['new_customers_this_week'], 'new customer', 'new customers')} this week")
    text = (f"Hey! {_tod_greeting()}! Here's your {await _biz_word(user)} right now — {'; '.join(bits)}. "
            "How may I help you today — what would you like to know?")
    return {"text": text, "data": snap}


class TenantMiraAskIn(BaseModel):
    question: str = Field(..., min_length=1, max_length=400)
    last_mira: str = Field("", max_length=600)


async def _catalog_context() -> str:
    """Full service menu + staff roster so Mira truly knows THIS salon."""
    services = await db.services.find(
        {"active": {"$ne": False}},
        {"_id": 0, "name": 1, "category": 1, "price": 1, "duration_min": 1}).to_list(200)
    staff = await db.staff.find(
        {"active": {"$ne": False}}, {"_id": 0, "name": 1, "role": 1}).to_list(50)
    svc = "\n".join(
        f"- {s.get('name')} [{s.get('category') or 'General'}] ₹{s.get('price') or 0:g} · {s.get('duration_min') or 0} min"
        for s in services) or "(no services listed)"
    stf = "\n".join(f"- {s.get('name')} ({s.get('role') or 'stylist'})" for s in staff) or "(no staff listed)"
    return f"SERVICE MENU:\n{svc}\n\nSTAFF TEAM:\n{stf}"


async def _revenue_report() -> dict:
    """Accurate revenue by period (IST calendar) + top staff per period, from real invoices."""
    now_ist = datetime.now(_IST)
    today = now_ist.date()
    monday = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)
    last_month_end = month_start - timedelta(days=1)
    last_month_start = last_month_end.replace(day=1)
    periods = {
        "this_week (Mon till now)": (monday, today),
        "last_week (Mon-Sun)": (monday - timedelta(days=7), monday - timedelta(days=1)),
        "this_month": (month_start, today),
        "last_month": (last_month_start, last_month_end),
        "last_3_months (rolling 90 days)": (today - timedelta(days=90), today),
    }
    earliest = min(p[0] for p in periods.values()).isoformat()
    invs = await db.invoices.find(
        {"status": {"$nin": ["voided", "open"]}, "created_at": {"$gte": earliest}},
        {"_id": 0, "created_at": 1, "total": 1, "items": 1, "staff_id": 1}).to_list(8000)
    staff_docs = await db.staff.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(300)
    smap = {s["id"]: s.get("name") or "Unknown" for s in staff_docs}
    report = {}
    for label, (start, end) in periods.items():
        lo, hi = start.isoformat(), end.isoformat() + "T23:59:59"
        rev, n, by_staff = 0.0, 0, {}
        for inv in invs:
            ca = (inv.get("created_at") or "")[:19]
            if not (lo <= ca <= hi):
                continue
            rev += float(inv.get("total") or 0)
            n += 1
            for it in inv.get("items", []):
                sid = it.get("staff_id") or inv.get("staff_id")
                if sid:
                    by_staff[sid] = by_staff.get(sid, 0.0) + int(it.get("qty") or 1) * float(it.get("price") or 0)
        top = sorted(by_staff.items(), key=lambda kv: -kv[1])[:3]
        report[label] = {
            "revenue": round(rev), "invoices": n,
            "date_range": f"{start.isoformat()} to {end.isoformat()}",
            "top_staff": [{"name": smap.get(sid, "Unknown"), "business": round(amt)} for sid, amt in top],
        }
    return report


@router.post("/tenant/mira/ask")
async def tenant_mira_ask(body: TenantMiraAskIn, user=Depends(require_tenant_admin)):
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    snap = await _salon_snapshot()
    catalog = await _catalog_context()
    revenue_report = await _revenue_report()
    from security import ai_daily_quota
    await ai_daily_quota(user.get("tenant_id") or "", "tenant_mira_ask", 300)
    biz = await _biz_word(user)
    menu_word = "menu (dishes)" if biz == "restaurant" else "service menu"
    promo_line = ("if orders are low suggest a Today's Special or happy-hours promo; "
                  if biz == "restaurant" else
                  "if bookings are low suggest a promo or win-back campaign; ")
    chat = LlmChat(api_key=key, session_id=f"tenant-mira-{user.get('tenant_id', '')[:12]}",
                   system_message=(
                       f"You are Mira, this {biz}'s dedicated AI manager inside the Miracurl Suite dashboard. "
                       f"You know THIS {biz}'s full {menu_word} and staff team (provided below) — answer questions "
                       "about items, prices and staff precisely from it; never invent items. "
                       f"Answer the {biz} owner's question in ONE or TWO short spoken-style sentences using the "
                       f"live {biz} snapshot provided. Be a proactive consultant: {promo_line}"
                       "if reviews are unread suggest replying; celebrate good revenue. "
                       f"If a dashboard page is clearly relevant include it. Valid tabs: {', '.join(MIRA_TABS)}. "
                       "The 'Current time' line gives the exact local time — use the matching greeting "
                       "(Good morning before 12 PM, Good afternoon 12–5 PM, Good evening after 5 PM); never guess. "
                       "LANGUAGE: reply in the SAME language the owner used — English or Hindi (Devanagari). "
                       "Hinglish counts as Hindi. "
                       "REVENUE QUESTIONS (CRITICAL): when asked about business/revenue for ANY period (last week, this week, "
                       "last month, this month, last 3 months), answer ONLY from the REVENUE REPORT in the message — quote the exact "
                       "revenue and invoice count for THAT period, and name the top staff performer with their business amount "
                       "(e.g. 'Last week you did ₹X across N bills — most business was by NAME with ₹Y'). "
                       "The 'revenue_today' figure in the snapshot is ONLY for today — NEVER use it for any other period. "
                       "If a period shows 0 revenue, say so honestly. "
                       f"\n\n{catalog}\n\n"
                       'Respond ONLY with JSON: {"answer": "<spoken answer>", "tab": "<tab path or empty>"}'
                   )).with_model("openai", "gpt-4o-mini")
    prev = f'Previous Mira message: "{body.last_mira.strip()[:200]}"\n' if body.last_mira.strip() else ""
    msg = (f"Current time: {datetime.now(_IST).strftime('%A %d %B, %I:%M %p')} IST ({_tod_greeting()}).\n"
           f"Live {biz} snapshot (today only): {json.dumps(snap)}\n"
           f"REVENUE REPORT (accurate period figures — use these for any period question): {json.dumps(revenue_report)}\n"
           f"{prev}\nOwner says: {body.question.strip()[:400]}")
    try:
        raw = await chat.send_message(UserMessage(text=msg))
        m = re.search(r"\{.*\}", str(raw), re.S)
        d = json.loads(m.group(0)) if m else {}
    except Exception as e:
        log.error(f"tenant mira ask failed: {e}")
        raise HTTPException(502, "Mira had trouble thinking — please try again")
    answer = str(d.get("answer") or "Sorry, I didn't catch that — could you rephrase?")[:600]
    tab = d.get("tab") if d.get("tab") in MIRA_TABS else ""
    return {"answer": answer, "tab": tab}


class TenantMiraSpeakIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=900)


@router.post("/tenant/mira/speak")
async def tenant_mira_speak(body: TenantMiraSpeakIn, user=Depends(require_tenant_admin)):
    from routes.briefings import _tts_cached_speech
    audio_b64 = await _tts_cached_speech(body.text.strip()[:900], voice="shimmer", speed=1.03)
    return {"audio_b64": audio_b64}
