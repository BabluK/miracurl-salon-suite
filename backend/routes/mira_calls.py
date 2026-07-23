"""Mira AI outbound voice calls (Twilio) to hot leads + HQ voice assistant (briefing/ask/speak)."""
import asyncio
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from database import _raw_db
from security import require_super_admin

router = APIRouter()
log = logging.getLogger("mira_calls")

VOICE = 'voice="Polly.Aditi" language="en-IN"'


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _norm_phone(p: str) -> str:
    d = re.sub(r"\D", "", p or "")
    if d.startswith("91") and len(d) == 12:
        return "+" + d
    if d.startswith("0") and len(d) == 11:
        d = d[1:]
    if len(d) == 10:
        return "+91" + d
    return ("+" + d) if d else ""


def _twilio():
    from twilio.rest import Client
    return Client(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])


def _xml(body: str) -> Response:
    return Response(media_type="application/xml",
                    content=f'<?xml version="1.0" encoding="UTF-8"?><Response>{body}</Response>')


def _esc(s: str) -> str:
    return (s or "").replace("&", "and").replace("<", "").replace(">", "")


HOT_QUERY = {"reviews": {"$gte": 500}, "$or": [{"website": ""}, {"website": None}, {"website": {"$exists": False}}]}


def _pitch_text(salon: str) -> str:
    return (f"Hello! This is Mira, your A I Business Consultant from Miracurl Suite. "
            f"Am I speaking with the owner of {salon}? Wonderful. "
            "I'm calling on behalf of the Miracurl team because we're helping salons automate their entire "
            "business using Artificial Intelligence. "
            "Running a salon today is much more than great beauty services — you juggle appointments, staff "
            "attendance, payroll, inventory, customer follow ups, marketing, reviews and billing, and most "
            "owners lose hours every day on operations instead of growing their business. "
            "That's exactly why Miracurl Suite was created. Your own A I assistant works 24 hours a day: it "
            "answers customer enquiries, books appointments, handles follow ups, manages P O S billing, tracks "
            "individual staff check in and check out, captures new leads, and even responds to Google and "
            "social media enquiries. "
            "Salon owners using Miracurl Suite save hours every day, increase customer retention, improve their "
            "online reputation, and manage multiple branches from one dashboard — from anywhere. "
            "We'd love to give you a free personalised demonstration, plus a 7 day free trial where our team "
            "sets everything up at no cost. There is absolutely no obligation.")


def _gather_menu(base: str, call_id: str, convo: bool = True) -> str:
    ask = ("You can also just ask me anything — for example, how much does it cost. Or, " if convo else "")
    return (f'<Gather input="dtmf speech" numDigits="1" timeout="7" speechTimeout="auto" language="en-IN" '
            f'action="{base}/api/webhooks/twilio/voice/{call_id}/gather" method="POST">'
            f'<Say {VOICE}>{ask}Press 1 and I will email you the demo invitation, free trial activation, '
            f'feature brochure and pricing details right away. '
            f'Press 2 if you would like me to call back another time. '
            f'Press 9 to opt out of future calls.</Say></Gather>')


def _gather_listen(base: str, call_id: str) -> str:
    return (f'<Gather input="dtmf speech" numDigits="1" timeout="6" speechTimeout="auto" language="en-IN" '
            f'action="{base}/api/webhooks/twilio/voice/{call_id}/gather" method="POST"/>')


# ---------------- Twilio webhooks (public; call_id is an unguessable UUID) ----------------

@router.post("/webhooks/twilio/voice/{call_id}")
async def twilio_voice_twiml(call_id: str, retry: int = 0):
    c = await _raw_db.mira_call_logs.find_one({"id": call_id}, {"_id": 0})
    if not c:
        return _xml(f'<Say {VOICE}>Sorry, this call is no longer valid. Goodbye.</Say><Hangup/>')
    base = c["webhook_base"]
    if retry:
        body = (f'<Say {VOICE}>Just to repeat the options.</Say>{_gather_menu(base, call_id)}'
                f'<Say {VOICE}>No worries — you can explore us any time at miracurl suite dot com. '
                f'Thank you for your time today. Have a fantastic day!</Say>')
    else:
        body = (f'<Say {VOICE}>{_esc(_pitch_text(c.get("lead_name") or "your salon"))}</Say>'
                f'{_gather_menu(base, call_id)}'
                f'<Redirect method="POST">{base}/api/webhooks/twilio/voice/{call_id}?retry=1</Redirect>')
    return _xml(body)


MAX_TURNS = 5

_SALES_CONTEXT = (
    "You are Mira, an AI Business Consultant from Miracurl Suite, LIVE ON A PHONE CALL with a salon owner in India. "
    "Miracurl Suite is an AI-powered salon management platform: AI answers customer enquiries, books appointments, "
    "does follow-ups, POS billing, individual staff check-in/check-out attendance, payroll, inventory, memberships, "
    "review funnels, marketing, lead capture, Google/social enquiry replies, multi-branch dashboard. "
    "Offer: FREE personalised demo + 7-day free trial with full setup help, no obligation. Website: miracurl-suite.com. "
    "Objection handling — Busy: 'takes 20 seconds, may I email you the details?'. Already using other software: "
    "'many customers switched; Miracurl adds a virtual AI salon manager, not just bookings — open to a 20-minute comparison?'. "
    "Cost: 'flexible plans by salon size; we recommend the right plan in the free demo, and the 7-day trial is free.' "
    "RULES: Speak naturally like a friendly phone agent, MAX 40 words per reply, no emojis, no lists. "
    "Decide an action: 'continue' (keep talking), 'send_pack' (they agreed to receive details/demo/trial by email), "
    "'callback' (busy, call later), 'optout' (do not call again), 'end' (goodbye). "
    'Respond ONLY JSON: {"say":"<spoken reply>","action":"continue|send_pack|callback|optout|end"}')


async def _converse(c: dict, lead: dict, speech: str) -> Response:
    """Full conversation mode: lead spoke → LLM answers in Mira's voice, loops up to MAX_TURNS."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    base = c["webhook_base"]
    call_id = c["id"]
    convo = c.get("convo") or []
    convo.append({"role": "lead", "text": speech[:300]})
    turns = len([m for m in convo if m["role"] == "lead"])
    say, action = "", "continue"
    try:
        chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"mira-call-{call_id}",
                       system_message=_SALES_CONTEXT).with_model("openai", "gpt-4o-mini")
        history = "\n".join(f"{'Owner' if m['role'] == 'lead' else 'Mira'}: {m['text']}" for m in convo[-8:])
        raw = await chat.send_message(UserMessage(
            text=f"Salon: {lead.get('name') if lead else 'a salon'} ({(lead or {}).get('city') or 'India'}). "
                 f"Lead has email on file: {bool((lead or {}).get('email'))}.\n"
                 f"Conversation so far:\n{history}\n\nOwner just said: \"{speech}\". Reply as Mira."))
        m = re.search(r"\{.*\}", str(raw), re.S)
        d = json.loads(m.group(0)) if m else {}
        say = str(d.get("say") or "")[:400]
        action = d.get("action") if d.get("action") in ("continue", "send_pack", "callback", "optout", "end") else "continue"
    except Exception as e:
        log.error(f"converse LLM failed: {e}")
        say, action = "That's a great question — the easiest way is our free demo and 7 day trial.", "continue"
    convo.append({"role": "mira", "text": say})
    await _raw_db.mira_call_logs.update_one({"id": call_id}, {"$set": {"convo": convo, "conversed": True}})
    said = f"<Say {VOICE}>{_esc(say)}</Say>"
    if action == "send_pack":
        await _raw_db.mira_call_logs.update_one({"id": call_id}, {"$set": {"digits": "speech", "result": "interested"}})
        await _raw_db.mira_leads.update_one(
            {"id": c["lead_id"]}, {"$set": {"call_result": "interested", "last_call_at": _now(), "seen_by_hq": False}})
        asyncio.get_event_loop().create_task(_fulfil_interest(c["lead_id"]))
        return _xml(said + f"<Say {VOICE}>I am sending everything over right now. Thank you for your time today — "
                           f"have a fantastic day!</Say><Hangup/>")
    if action == "callback":
        await _raw_db.mira_call_logs.update_one({"id": call_id}, {"$set": {"result": "callback"}})
        await _raw_db.mira_leads.update_one(
            {"id": c["lead_id"]}, {"$set": {"call_result": "callback", "last_call_at": _now()}})
        return _xml(said + "<Hangup/>")
    if action == "optout":
        await _raw_db.mira_call_logs.update_one({"id": call_id}, {"$set": {"result": "opt_out"}})
        await _raw_db.mira_leads.update_one(
            {"id": c["lead_id"]}, {"$set": {"call_result": "opt_out", "do_not_call": True, "last_call_at": _now()}})
        return _xml(said + "<Hangup/>")
    if action == "end" or turns >= MAX_TURNS:
        return _xml(said + f"<Say {VOICE}>You can explore everything at miracurl suite dot com. "
                           f"Have a wonderful day!</Say><Hangup/>")
    return _xml(said + _gather_listen(base, c["id"]) +
                f'<Redirect method="POST">{base}/api/webhooks/twilio/voice/{call_id}?retry=1</Redirect>')


@router.post("/webhooks/twilio/voice/{call_id}/gather")
async def twilio_voice_gather(call_id: str, request: Request):
    form = await request.form()
    digit = str(form.get("Digits") or "")
    speech = str(form.get("SpeechResult") or "").strip()
    c = await _raw_db.mira_call_logs.find_one({"id": call_id}, {"_id": 0})
    if not c:
        return _xml("<Hangup/>")
    base = c["webhook_base"]
    lead = await _raw_db.mira_leads.find_one({"id": c["lead_id"]}, {"_id": 0})
    if not digit and speech:
        return await _converse(c, lead, speech)
    if digit == "1":
        await _raw_db.mira_call_logs.update_one({"id": call_id}, {"$set": {"digits": "1", "result": "interested"}})
        await _raw_db.mira_leads.update_one(
            {"id": c["lead_id"]}, {"$set": {"call_result": "interested", "last_call_at": _now(), "seen_by_hq": False}})
        asyncio.get_event_loop().create_task(_fulfil_interest(c["lead_id"]))
        if lead and lead.get("email"):
            line = "I'm sending your demo invitation, free trial activation, feature brochure and pricing details to your email right now."
        else:
            line = "I'm texting you the link with the demo invitation, free trial and pricing details right now."
        return _xml(f"<Say {VOICE}>Wonderful! {line} I am looking forward to helping you transform your salon "
                    f"with A I. Have a fantastic day!</Say><Hangup/>")
    if digit == "2":
        await _raw_db.mira_call_logs.update_one({"id": call_id}, {"$set": {"digits": "2", "result": "callback"}})
        await _raw_db.mira_leads.update_one(
            {"id": c["lead_id"]}, {"$set": {"call_result": "callback", "last_call_at": _now()}})
        return _xml(f'<Say {VOICE}>I completely understand. I will reach out another time. Meanwhile you can '
                    f'explore everything at miracurl suite dot com. Have a great day!</Say><Hangup/>')
    if digit == "9":
        await _raw_db.mira_call_logs.update_one({"id": call_id}, {"$set": {"digits": "9", "result": "opt_out"}})
        await _raw_db.mira_leads.update_one(
            {"id": c["lead_id"]}, {"$set": {"call_result": "opt_out", "do_not_call": True, "last_call_at": _now()}})
        return _xml(f'<Say {VOICE}>You have been opted out and will not receive calls from us again. '
                    f'Thank you, have a good day.</Say><Hangup/>')
    return _xml(f'<Redirect method="POST">{base}/api/webhooks/twilio/voice/{call_id}?retry=1</Redirect>')


@router.post("/webhooks/twilio/voice/{call_id}/status")
async def twilio_voice_status(call_id: str, request: Request):
    form = await request.form()
    status = str(form.get("CallStatus") or "")
    dur = int(form.get("CallDuration") or 0)
    upd = {"status": status, "duration": dur, "updated_at": _now()}
    await _raw_db.mira_call_logs.update_one({"id": call_id}, {"$set": upd})
    c = await _raw_db.mira_call_logs.find_one({"id": call_id}, {"_id": 0, "lead_id": 1})
    if c:
        await _raw_db.mira_leads.update_one(
            {"id": c["lead_id"]}, {"$set": {"last_call_status": status, "last_call_at": _now()}})
    return {"ok": True}


async def _fulfil_interest(lead_id: str) -> None:
    """Press 1 → email the full demo pack (or SMS the link if no email on the lead)."""
    try:
        lead = await _raw_db.mira_leads.find_one({"id": lead_id}, {"_id": 0})
        if not lead:
            return
        if lead.get("email") and lead.get("status") != "sent":
            from email_service import _send_email
            from routes.lead_gen import _outreach_email_html, _live_plans, _lead_reply_to
            from services.pdf import screens_tour_attachment
            from routes.hq_documents import suite_overview_attachment
            html = _outreach_email_html(lead, await _live_plans())
            attachments = [await asyncio.to_thread(suite_overview_attachment)]
            tour = screens_tour_attachment()
            if tour:
                attachments.append(tour)
            res = await _send_email([lead["email"]],
                                    lead.get("email_subject") or "Miracurl Suite — your free demo & 7-day trial",
                                    html, attachments=attachments,
                                    book_url="https://miracurl-suite.com/demo", reply_to=_lead_reply_to())
            if res.get("sent"):
                await _raw_db.mira_leads.update_one(
                    {"id": lead_id}, {"$set": {"status": "sent", "sent_at": _now(), "approved_by": "mira-call"}})
        elif lead.get("phone"):
            from twilio.rest import Client
            _twilio().messages.create(
                to=_norm_phone(lead["phone"]), from_=os.environ["TWILIO_PHONE_NUMBER"],
                body=("Hi! Mira from Miracurl Suite here \U0001F44B As promised: free demo + 7-day trial of the "
                      "AI salon platform \u2192 https://miracurl-suite.com/demo"))
    except Exception as e:
        log.error(f"fulfil interest failed for {lead_id}: {e}")


# ---------------- super admin: start calls + log ----------------

def _webhook_base(request: Request) -> str:
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    return f"https://{host}" if host else os.environ.get("APP_PUBLIC_URL", "").rstrip("/")


async def _start_call(lead: dict, base: str) -> dict:
    phone = _norm_phone(lead.get("phone") or "")
    if not phone:
        return {"ok": False, "error": "No valid phone number"}
    call_id = str(uuid.uuid4())
    await _raw_db.mira_call_logs.insert_one({
        "id": call_id, "lead_id": lead["id"], "lead_name": lead.get("name") or "",
        "phone": phone, "status": "queued", "digits": "", "result": "",
        "duration": 0, "webhook_base": base, "created_at": _now()})
    try:
        tw = await asyncio.to_thread(
            lambda: _twilio().calls.create(
                to=phone, from_=os.environ["TWILIO_PHONE_NUMBER"],
                url=f"{base}/api/webhooks/twilio/voice/{call_id}",
                status_callback=f"{base}/api/webhooks/twilio/voice/{call_id}/status",
                status_callback_event=["completed"], timeout=25, machine_detection="Enable"))
        await _raw_db.mira_call_logs.update_one({"id": call_id}, {"$set": {"twilio_sid": tw.sid, "status": "initiated"}})
        return {"ok": True, "call_id": call_id}
    except Exception as e:
        await _raw_db.mira_call_logs.update_one({"id": call_id}, {"$set": {"status": "failed", "error": str(e)[:300]}})
        return {"ok": False, "error": str(e)[:200]}


@router.post("/super-admin/mira-calls/{lid}/call")
async def call_one_lead(lid: str, request: Request, user=Depends(require_super_admin)):
    lead = await _raw_db.mira_leads.find_one({"id": lid}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    if lead.get("do_not_call"):
        raise HTTPException(400, "This lead opted out of calls")
    if not lead.get("phone"):
        raise HTTPException(400, "No phone number on this lead")
    res = await _start_call(lead, _webhook_base(request))
    if not res["ok"]:
        raise HTTPException(502, f"Call failed: {res['error']}")
    return res


class BatchCallIn(BaseModel):
    limit: int = 20


@router.post("/super-admin/mira-calls/call-hot")
async def call_hot_leads(body: BatchCallIn, request: Request, user=Depends(require_super_admin)):
    """Mira calls all HOT leads (500+ reviews, no website) with a phone number, staggered."""
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    leads = await _raw_db.mira_leads.find(
        {**HOT_QUERY, "phone": {"$nin": ["", None]}, "do_not_call": {"$ne": True},
         "call_result": {"$nin": ["interested", "opt_out"]},
         "status": {"$nin": ["customer", "rejected"]},
         "$or": [{"last_call_at": {"$exists": False}}, {"last_call_at": {"$lt": since}}]},
        {"_id": 0}).sort("reviews", -1).to_list(max(1, min(body.limit, 50)))
    if not leads:
        return {"ok": True, "queued": 0, "note": "No callable hot leads (all called in the last 7 days, opted out, or missing phones)"}
    base = _webhook_base(request)

    async def _runner():
        for ld in leads:
            await _start_call(ld, base)
            await asyncio.sleep(2)

    asyncio.get_event_loop().create_task(_runner())
    return {"ok": True, "queued": len(leads)}


@router.get("/super-admin/mira-calls")
async def list_calls(user=Depends(require_super_admin)):
    rows = await _raw_db.mira_call_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    stats = {"total": len(rows),
             "interested": len([r for r in rows if r.get("result") == "interested"]),
             "callback": len([r for r in rows if r.get("result") == "callback"]),
             "opt_out": len([r for r in rows if r.get("result") == "opt_out"]),
             "completed": len([r for r in rows if r.get("status") == "completed"])}
    return {"items": rows, "stats": stats}


@router.get("/super-admin/platform-map/live")
async def platform_map_live(user=Depends(require_super_admin)):
    """Real-time feed powering the Platform Map: Mira call stats, live activity, AI insight."""
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    week_ago = (now - timedelta(days=7)).isoformat()
    two_weeks = (now - timedelta(days=14)).isoformat()
    calls = await _raw_db.mira_call_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    call_stats = {"total": len(calls),
                  "today": len([c for c in calls if c.get("created_at", "") >= today]),
                  "interested": len([c for c in calls if c.get("result") == "interested"]),
                  "callback": len([c for c in calls if c.get("result") == "callback"]),
                  "conversations": len([c for c in calls if c.get("conversed")])}
    events = []
    for c in calls[:8]:
        label = {"interested": "pressed 1 — demo pack sent 🎉", "callback": "asked to call back",
                 "opt_out": "opted out"}.get(c.get("result"), c.get("status") or "dialing")
        events.append({"icon": "📞", "title": f"Mira called {c.get('lead_name') or 'a lead'}",
                       "sub": label, "at": c.get("created_at", "")})
    for l in await _raw_db.mira_leads.find({}, {"_id": 0, "name": 1, "city": 1, "created_at": 1}).sort("created_at", -1).to_list(5):
        events.append({"icon": "🧲", "title": f"New lead — {l.get('name')}", "sub": l.get("city") or "", "at": l.get("created_at", "")})
    for a in await _raw_db.appointments.find({}, {"_id": 0, "customer_name": 1, "created_at": 1}).sort("created_at", -1).to_list(4):
        events.append({"icon": "📅", "title": "Booking confirmed", "sub": a.get("customer_name") or "", "at": a.get("created_at", "")})
    for i in await _raw_db.invoices.find({}, {"_id": 0, "total": 1, "created_at": 1}).sort("created_at", -1).to_list(4):
        events.append({"icon": "💰", "title": f"Payment received ₹{round(i.get('total') or 0)}", "sub": "", "at": i.get("created_at", "")})
    for t in await _raw_db.tenants.find({}, {"_id": 0, "name": 1, "created_at": 1}).sort("created_at", -1).to_list(3):
        events.append({"icon": "🏢", "title": f"New salon — {t.get('name')}", "sub": "", "at": t.get("created_at", "")})
    for e in await _raw_db.registry_employees.find({}, {"_id": 0, "name": 1, "created_at": 1}).sort("created_at", -1).to_list(3):
        events.append({"icon": "🪪", "title": f"Staff registered — {e.get('name')}", "sub": "", "at": e.get("created_at", "")})
    events = sorted([e for e in events if e["at"]], key=lambda x: x["at"], reverse=True)[:12]
    this_week = await _raw_db.mira_leads.count_documents({"created_at": {"$gte": week_ago}})
    prev_week = await _raw_db.mira_leads.count_documents({"created_at": {"$gte": two_weeks, "$lt": week_ago}})
    change = round((this_week - prev_week) / prev_week * 100) if prev_week else (100 if this_week else 0)
    return {"call_stats": call_stats, "events": events,
            "insight": {"leads_this_week": this_week, "leads_prev_week": prev_week, "change_pct": change}}


# ---------------- HQ Mira voice assistant ----------------

_IST = timezone(timedelta(hours=5, minutes=30))

MIRA_TABS = ["tenants", "notifications", "platform-map", "billing", "partners", "leaderboard", "revenue",
             "docs", "lead-email", "mira-leads", "demo-calendar", "ai", "inquiries", "mira-studio",
             "hiring", "inbox", "verify-staff", "team", "deployments", "load", "database", "security"]


async def _hq_snapshot() -> dict:
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    yesterday = (now.date() - timedelta(days=1)).isoformat()
    soon = (now.date() + timedelta(days=5)).isoformat()
    hot = await _raw_db.mira_leads.count_documents({**HOT_QUERY})
    call_interested = await _raw_db.mira_leads.count_documents({"call_result": "interested"})
    calls_total = await _raw_db.mira_call_logs.count_documents({})
    calls_today = await _raw_db.mira_call_logs.count_documents({"created_at": {"$gte": today}})
    new_verify = await _raw_db.staff_verification_requests.count_documents({"status": "new"})
    unread_inbox = await _raw_db.hq_messages.count_documents({"read": {"$ne": True}})
    tenants_total = await _raw_db.tenants.count_documents({"status": {"$in": ["active", "trial"]}})
    trials_expiring = await _raw_db.tenants.count_documents(
        {"status": "trial", "trial_ends_at": {"$lte": soon, "$gte": today}})
    bookings_today = await _raw_db.appointments.count_documents({"date": today})
    rev = await _raw_db.invoices.aggregate([
        {"$match": {"created_at": {"$gte": yesterday, "$lt": today}}},
        {"$group": {"_id": None, "s": {"$sum": "$total"}}}]).to_list(1)
    return {"hot_leads": hot, "call_interested": call_interested,
            "mira_calls_made_total": calls_total, "mira_calls_made_today": calls_today,
            "new_verification_requests": new_verify,
            "unread_hq_inbox": unread_inbox,
            "active_and_trial_salons": tenants_total, "trials_expiring_in_5_days": trials_expiring,
            "bookings_today_all_salons": bookings_today,
            "revenue_yesterday_all_salons": round((rev[0]["s"] if rev else 0) or 0, 2)}


def _tod_greeting() -> str:
    h = datetime.now(_IST).hour
    return "Good morning" if h < 12 else ("Good afternoon" if h < 17 else "Good evening")


@router.get("/super-admin/mira/briefing")
async def mira_briefing(user=Depends(require_super_admin)):
    snap = await _hq_snapshot()
    bits = []
    def _n(c, s, p):
        return f"{c} {s if c == 1 else p}"
    if snap["hot_leads"]:
        bits.append(f"{_n(snap['hot_leads'], 'hot lead is', 'hot leads are')} waiting")
    if snap["bookings_today_all_salons"]:
        bits.append(f"{_n(snap['bookings_today_all_salons'], 'booking', 'bookings')} across your salons today")
    if snap["revenue_yesterday_all_salons"]:
        bits.append(f"₹{snap['revenue_yesterday_all_salons']:g} collected yesterday")
    if snap["new_verification_requests"]:
        bits.append(f"{_n(snap['new_verification_requests'], 'new staff verification request', 'new staff verification requests')}")
    if snap["trials_expiring_in_5_days"]:
        bits.append(f"{_n(snap['trials_expiring_in_5_days'], 'trial', 'trials')} expiring within 5 days")
    summary = "; ".join(bits[:4]) if bits else "everything is calm right now"
    text = (f"{_tod_greeting()} Miracurl! {summary}. "
            f"Tell me what details you want me to show.")
    return {"text": text, "data": snap}


class MiraAskIn(BaseModel):
    question: str


@router.post("/super-admin/mira/ask")
async def mira_ask(body: MiraAskIn, user=Depends(require_super_admin)):
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    snap = await _hq_snapshot()
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"mira-hq-{user['id']}",
                   system_message=(
                       "You are Mira, the voice assistant of the Miracurl Suite super-admin console. "
                       "Answer the admin's question in ONE or TWO short spoken-style sentences using the live "
                       "platform snapshot provided. If a dashboard tab is clearly relevant, include it. "
                       f"Valid tabs: {', '.join(MIRA_TABS)}. "
                       'Respond ONLY with JSON: {"answer": "<spoken answer>", "tab": "<tab id or empty string>"}'
                   )).with_model("openai", "gpt-4o-mini")
    msg = f"Live snapshot: {json.dumps(snap)}\n\nAdmin asks: {body.question.strip()[:300]}"
    try:
        raw = await chat.send_message(UserMessage(text=msg))
        m = re.search(r"\{.*\}", str(raw), re.S)
        d = json.loads(m.group(0)) if m else {"answer": str(raw)[:300], "tab": ""}
    except Exception as e:
        log.error(f"mira ask failed: {e}")
        d = {"answer": "Sorry, I couldn't process that just now — please try again.", "tab": ""}
    tab = d.get("tab") or ""
    return {"answer": str(d.get("answer") or "")[:500], "tab": tab if tab in MIRA_TABS else ""}


class MiraSpeakIn(BaseModel):
    text: str


@router.post("/super-admin/mira/speak")
async def mira_speak(body: MiraSpeakIn, user=Depends(require_super_admin)):
    from routes.briefings import _tts_cached_speech
    audio_b64 = await _tts_cached_speech(body.text.strip()[:900], voice="shimmer", speed=1.03)
    return {"audio_b64": audio_b64}
