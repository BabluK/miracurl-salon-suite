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
    bits = []
    if snap.get("bookings_today"):
        bits.append(f"{_n(snap['bookings_today'], 'booking', 'bookings')} today")
    else:
        bits.append("no bookings yet today")
    if snap.get("revenue_today"):
        bits.append(f"₹{snap['revenue_today']:,} collected so far")
    if snap.get("new_customers_this_week"):
        bits.append(f"{_n(snap['new_customers_this_week'], 'new customer', 'new customers')} this week")
    text = (f"Hey! {_tod_greeting()}! Here's your salon right now — {'; '.join(bits)}. "
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


@router.post("/tenant/mira/ask")
async def tenant_mira_ask(body: TenantMiraAskIn, user=Depends(require_tenant_admin)):
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    snap = await _salon_snapshot()
    catalog = await _catalog_context()
    chat = LlmChat(api_key=key, session_id=f"tenant-mira-{user.get('tenant_id', '')[:12]}",
                   system_message=(
                       "You are Mira, this salon's dedicated AI manager inside the Miracurl Suite dashboard. "
                       "You know THIS salon's full service menu and staff team (provided below) — answer questions "
                       "about services, prices, durations and staff precisely from it; never invent items. "
                       "Answer the salon owner's question in ONE or TWO short spoken-style sentences using the "
                       "live salon snapshot provided. Be a proactive consultant: if bookings are low suggest a "
                       "promo or win-back campaign; if reviews are unread suggest replying; celebrate good revenue. "
                       f"If a dashboard page is clearly relevant include it. Valid tabs: {', '.join(MIRA_TABS)}. "
                       "The 'Current time' line gives the exact local time — use the matching greeting "
                       "(Good morning before 12 PM, Good afternoon 12–5 PM, Good evening after 5 PM); never guess. "
                       "LANGUAGE: reply in the SAME language the owner used — English or Hindi (Devanagari). "
                       "Hinglish counts as Hindi. "
                       f"\n\n{catalog}\n\n"
                       'Respond ONLY with JSON: {"answer": "<spoken answer>", "tab": "<tab path or empty>"}'
                   )).with_model("openai", "gpt-4o-mini")
    prev = f'Previous Mira message: "{body.last_mira.strip()[:200]}"\n' if body.last_mira.strip() else ""
    msg = (f"Current time: {datetime.now(_IST).strftime('%A %d %B, %I:%M %p')} IST ({_tod_greeting()}).\n"
           f"Live salon snapshot: {json.dumps(snap)}\n{prev}\nOwner says: {body.question.strip()[:400]}")
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
