"""Mira HQ assistant (briefing/ask/speak), Platform-Map live feed, digests, memory vault & Face-ID."""
import html as html_lib
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import _raw_db
from security import require_super_admin

router = APIRouter()
log = logging.getLogger("mira_hq")

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


HOT_QUERY = {"reviews": {"$gte": 500}, "$or": [{"website": ""}, {"website": None}, {"website": {"$exists": False}}]}


# (collection, limit, icon, title, sub) — newest rows of each feed become Platform-Map activity events
_ACTIVITY_FEEDS = (
    ("mira_leads", 5, "🧲", lambda d: f"New lead — {d.get('name')}", lambda d: d.get("city") or ""),
    ("appointments", 4, "📅", lambda d: "Booking confirmed", lambda d: d.get("customer_name") or ""),
    ("subscription_payments", 4, "💰", lambda d: f"Subscription payment ₹{round(d.get('amount') or 0)}", lambda d: ""),
    ("tenants", 3, "🏢", lambda d: f"New salon — {d.get('name')}", lambda d: ""),
    ("registry_employees", 3, "🪪", lambda d: f"Staff registered — {d.get('name')}", lambda d: ""),
)


async def _activity_events() -> list:
    events = []
    proj = {"_id": 0, "name": 1, "city": 1, "customer_name": 1, "amount": 1, "created_at": 1}
    for coll, limit, icon, title, sub in _ACTIVITY_FEEDS:
        rows = await getattr(_raw_db, coll).find({}, proj).sort("created_at", -1).to_list(limit)
        events.extend({"icon": icon, "title": title(d), "sub": sub(d), "at": d.get("created_at", "")} for d in rows)
    return events


async def _lead_trend(now: datetime) -> dict:
    week_ago = (now - timedelta(days=7)).isoformat()
    two_weeks = (now - timedelta(days=14)).isoformat()
    this_week = await _raw_db.mira_leads.count_documents({"created_at": {"$gte": week_ago}})
    prev_week = await _raw_db.mira_leads.count_documents({"created_at": {"$gte": two_weeks, "$lt": week_ago}})
    change = round((this_week - prev_week) / prev_week * 100) if prev_week else (100 if this_week else 0)
    return {"leads_this_week": this_week, "leads_prev_week": prev_week, "change_pct": change}


@router.get("/super-admin/platform-map/live")
async def platform_map_live(user=Depends(require_super_admin)):
    """Real-time feed powering the Platform Map: live activity + AI lead insight."""
    now = datetime.now(timezone.utc)
    events = await _activity_events()
    events = sorted([e for e in events if e["at"]], key=lambda x: x["at"], reverse=True)[:12]
    return {"events": events, "insight": await _lead_trend(now)}


# ---------------- HQ Mira voice assistant ----------------

_IST = timezone(timedelta(hours=5, minutes=30))

MIRA_TABS = ["tenants", "notifications", "platform-map", "billing", "partners", "leaderboard", "revenue",
             "docs", "lead-email", "mira-leads", "demo-calendar", "ai", "inquiries", "mira-studio",
             "hiring", "inbox", "verify-staff", "team", "deployments", "load", "database", "security"]


async def _system_health() -> tuple:
    """(health list, orphans, alert strings) — SUPER ADMIN Mira only."""
    try:
        await _raw_db.command("ping")
        db_ok = True
    except Exception:  # noqa: BLE001
        db_ok = False
    health = [
        {"name": "API Services", "ok": True},
        {"name": "Database", "ok": db_ok},
        {"name": "Storage", "ok": True},
        {"name": "Email Service", "ok": bool(os.environ.get("RESEND_API_KEY"))},
        {"name": "AI Service", "ok": bool(os.environ.get("EMERGENT_LLM_KEY"))},
    ]
    flag = await _raw_db.system_flags.find_one(
        {"key": "db_health"}, {"_id": 0, "orphans": 1, "new_findings": 1, "announced": 1, "checked_at": 1})
    flag = flag or {}
    orphans = int(flag.get("orphans") or 0)
    alerts = [f"{h['name']} is DOWN — check configuration" for h in health if not h["ok"]]
    if flag.get("new_findings") and not flag.get("announced"):
        alerts.append(f"weekly health sweep found new issues — {'; '.join(flag['new_findings'][:3])}. "
                      "Review the Database tab or just ask me to purge them")
    return health, orphans, alerts


async def _lead_snapshot(today: str) -> dict:
    """Lead-gen side of the HQ snapshot: hot leads, drafted emails, weekly heat risers."""
    rd = await _raw_db.platform_settings.find_one({"key": "lead_heat_risers"}, {"_id": 0}) or {}
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    return {
        "hot_leads": await _raw_db.mira_leads.count_documents({**HOT_QUERY}),
        "hot_leads_with_phone": await _raw_db.mira_leads.count_documents(
            {**HOT_QUERY, "phone": {"$nin": ["", None]}, "status": {"$nin": ["customer", "rejected"]}}),
        "leads_heated_up_this_week": (rd.get("risers") or [])[:3] if (rd.get("ran_at") or "") >= week_ago else [],
        "emails_drafted_awaiting_your_approval": await _raw_db.mira_leads.count_documents(
            {"status": {"$in": ["drafted", "researched"]}, "email": {"$nin": ["", None]}}),
        "wa_intros_sent_today": await _raw_db.mira_wa_intros.count_documents({"created_at": {"$gte": today}}),
        "wa_intro_replies_today": await _raw_db.mira_leads.count_documents({"wa_intro_replied_at": {"$gte": today}}),
    }


async def _ops_snapshot(today: str, yesterday: str, soon: str) -> dict:
    """Operations side of the HQ snapshot: inbox, verifications, tenants, bookings, revenue."""
    rev = await _raw_db.subscription_payments.aggregate([
        {"$match": {"$or": [{"paid_at": yesterday},
                            {"paid_at": {"$in": ["", None]}, "created_at": {"$gte": yesterday, "$lt": today}}]}},
        {"$group": {"_id": None, "s": {"$sum": "$amount"}}}]).to_list(1)
    return {
        "new_verification_requests": await _raw_db.staff_verification_requests.count_documents({"status": "new"}),
        "unread_hq_inbox": await _raw_db.hq_messages.count_documents({"read": {"$ne": True}}),
        "active_and_trial_salons": await _raw_db.tenants.count_documents({"status": {"$in": ["active", "trial"]}}),
        "trials_expiring_in_5_days": await _raw_db.tenants.count_documents(
            {"status": "trial", "trial_ends_at": {"$lte": soon, "$gte": today}}),
        "bookings_today_all_salons": await _raw_db.appointments.count_documents({"date": today}),
        "subscription_revenue_yesterday": round((rev[0]["s"] if rev else 0) or 0, 2),
    }


async def _hq_snapshot() -> dict:
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    yesterday = (now.date() - timedelta(days=1)).isoformat()
    soon = (now.date() + timedelta(days=5)).isoformat()
    return {**await _lead_snapshot(today), **await _ops_snapshot(today, yesterday, soon)}


def _tod_greeting() -> str:
    h = datetime.now(_IST).hour
    return "Good morning" if h < 12 else ("Good afternoon" if h < 17 else "Good evening")


def _plural(c: int, singular: str, plural: str) -> str:
    return f"{c} {singular if c == 1 else plural}"


def _briefing_summary(snap: dict) -> str:
    rules = (
        ("hot_leads", "hot lead is", "hot leads are", " waiting"),
        ("bookings_today_all_salons", "booking", "bookings", " across your salons today"),
        ("new_verification_requests", "new staff verification request", "new staff verification requests", ""),
        ("trials_expiring_in_5_days", "trial", "trials", " expiring within 5 days"),
    )
    bits = [f"{_plural(snap[k], s, p)}{tail}" for k, s, p, tail in rules[:2] if snap[k]]
    if snap["subscription_revenue_yesterday"]:
        bits.append(f"₹{snap['subscription_revenue_yesterday']:g} subscription revenue collected yesterday")
    bits += [f"{_plural(snap[k], s, p)}{tail}" for k, s, p, tail in rules[2:] if snap[k]]
    return "; ".join(bits[:4]) if bits else "everything is calm right now"


def _briefing_wa_report(snap: dict) -> str:
    n, r = snap["wa_intros_sent_today"], snap["wa_intro_replies_today"]
    if not n and not r:
        return ""
    rep = f" WhatsApp: I introduced Miracurl to {_plural(n, 'hot lead', 'hot leads')} today"
    return rep + (f" — {_plural(r, 'reply', 'replies')} already, check the Lead Agent!" if r else ".")


def _briefing_suggestion(snap: dict) -> str:
    drafted = snap["emails_drafted_awaiting_your_approval"]
    if drafted:
        return f" Tip: {_plural(drafted, 'personalized email is', 'personalized emails are')} drafted and waiting for your approval."
    if snap["hot_leads_with_phone"]:
        return f" Tip: {snap['hot_leads_with_phone']} hot leads have phone numbers — a WhatsApp nudge could convert them."
    return ""


async def _briefing_heat_note() -> str:
    """Announce weekly lead-heat risers once, then mark them announced."""
    rd = await _raw_db.platform_settings.find_one({"key": "lead_heat_risers"}, {"_id": 0}) or {}
    if not rd.get("risers") or rd.get("announced"):
        return ""
    top = rd["risers"][0]
    note = (f" 🔥 Heat alert: {_plural(len(rd['risers']), 'lead', 'leads')} got hotter after my weekly refresh — "
            f"top mover: {top['name']} jumped from {top['from']} to {top['to']}. Worth reaching out!")
    await _raw_db.platform_settings.update_one({"key": "lead_heat_risers"}, {"$set": {"announced": True}})
    return note


@router.get("/super-admin/mira/briefing")
async def mira_briefing(user=Depends(require_super_admin)):
    from routes.hq_credit_wallet import _wallet as _hq_wallet, low_stock_line
    from routes.mira_outreach import outreach_summary
    snap = await _hq_snapshot()
    outreach = await outreach_summary()
    stock_note = low_stock_line(await _hq_wallet())
    text = (f"Hey Miracurl! {_tod_greeting()}! {_briefing_summary(snap)}."
            f" Outreach report: {outreach['greeting']}"
            f"{_briefing_wa_report(snap)}{await _briefing_heat_note()}{_briefing_suggestion(snap)} "
            + (f"{stock_note} " if stock_note else "")
            + "How may I help you today — what details do you want me to show?")
    _health, _orphans, alerts = await _system_health()
    if alerts:
        text += " One more thing, Boss — we have some system health items that need your attention: " + "; ".join(alerts[:2]) + "."
        await _raw_db.system_flags.update_one({"key": "db_health"}, {"$set": {"announced": True}})
    return {"text": text, "data": snap, "health_alerts": alerts, "outreach": outreach}


async def _map_counts(today: str) -> dict:
    pay = await _raw_db.subscription_payments.aggregate([
        {"$match": {"$or": [{"paid_at": today},
                            {"paid_at": {"$in": ["", None]}, "created_at": {"$gte": today}}]}},
        {"$group": {"_id": None, "n": {"$sum": 1}, "s": {"$sum": "$amount"}}}]).to_list(1)
    return {"leads_today": await _raw_db.mira_leads.count_documents({"created_at": {"$gte": today}}),
            "payments_today": (pay[0]["n"] if pay else 0) or 0,
            "payments_amount_today": round((pay[0]["s"] if pay else 0) or 0),
            "tenants_today": await _raw_db.tenants.count_documents({"created_at": {"$gte": today}}),
            "staff_today": await _raw_db.registry_employees.count_documents({"created_at": {"$gte": today}}),
            "bookings_today": await _raw_db.appointments.count_documents({"date": today}),
            "hot_leads": await _raw_db.mira_leads.count_documents({**HOT_QUERY})}


def _map_bits(d: dict) -> list:
    bits = [f"{_plural(d['leads_today'], 'new lead', 'new leads')} received" if d["leads_today"] else "no new leads received so far today"]
    if d["payments_today"]:
        bits.append(f"{_plural(d['payments_today'], 'subscription payment', 'subscription payments')} received worth ₹{d['payments_amount_today']:,}")
    for key, s, p, tail in (("tenants_today", "new tenant", "new tenants", " added"),
                            ("staff_today", "staff member", "staff members", " registered"),
                            ("bookings_today", "booking", "bookings", " across your salons")):
        if d[key]:
            bits.append(f"{_plural(d[key], s, p)}{tail}")
    return bits


def _map_lead_line(d: dict) -> str:
    if d["hot_leads"]:
        return f"{_plural(d['hot_leads'], 'hot lead is', 'hot leads are')} waiting in the pipeline — worth a follow-up."
    return ""


@router.get("/super-admin/mira/map-briefing")
async def mira_map_briefing(user=Depends(require_super_admin)):
    """Spoken real-time update when the Platform Map opens."""
    d = await _map_counts(datetime.now(timezone.utc).date().isoformat())
    text = (f"Hey Miracurl! Live update — {'; '.join(_map_bits(d))}. {_map_lead_line(d)} "
            "Please give me a command — what do you want to know?").replace("  ", " ")
    return {"text": text, "data": d}


class MiraAskIn(BaseModel):
    question: str
    last_mira: str = ""


_MIRA_GREETING_RE = r"(hey|hi|hello|hay|ok|okay|namaste)?\s*(mira|meera|myra|maira|mirra)"


def _mira_system_prompt() -> str:
    return ("You are Mira, the AI Chief-of-Staff of the Miracurl Suite super-admin console (a SaaS for salons AND "
                       "restaurants), and an EXPERT lead-generation & growth consultant who acts on the Boss's behalf. "
                       "Think step by step about what the Boss really wants, then answer in ONE to THREE short spoken-style "
                       "sentences using the live platform snapshot. If a dashboard tab is clearly relevant, include it. "
                       f"Valid tabs: {', '.join(MIRA_TABS)}. "
                       "The 'Current time' line in the message tells you the exact local time — ALWAYS use the matching "
                       "greeting (Good morning before 12 PM, Good afternoon 12–5 PM, Good evening after 5 PM); NEVER guess. "
                       "LANGUAGE: reply in the SAME language the admin used — English or Hindi (Devanagari script). "
                       "Hinglish (Hindi words in Latin script) counts as Hindi: reply in Devanagari Hindi. "
                       "YOUR AUTONOMOUS POWERS (the 'outreach' block in the snapshot is your own work log): you run the Outreach "
                       "Autopilot — you find salon & restaurant leads worldwide by yourself, email hot leads a vertical-specific "
                       "pitch with a demo link (daily cap = outreach.settings.daily_email_limit), WhatsApp them in allowed countries, "
                       "and email HQ (admin@miracurl-suite.com) the moment a lead replies, books a demo or signs up. "
                       "When asked what you did / how outreach is going, report today's numbers from outreach.today and outreach.totals. "
                       "ACTIONS you may trigger (set the 'action' field, else empty string): "
                       "'outreach_now' — Boss asks to send emails / start outreach / reach hot leads now; "
                       "'outreach_on' / 'outreach_off' — Boss asks to enable, start autopilot permanently, pause or stop it; "
                       "'hunt:<City, CC>:<salon|restaurant>' — Boss asks to find/hunt leads in a specific city (use ISO country "
                       "suffix like 'Dubai, AE'; Indian cities have no suffix; default vertical salon); "
                       "'set_limit:<n>' — Boss asks to change the daily email limit. "
                       "STRICT RULE: set an action ONLY when the Boss gives an explicit command in THIS message "
                       "(e.g. 'start outreach', 'send the emails now', 'turn autopilot on', 'hunt Dubai'). Questions, status "
                       "reports and your own suggestions MUST have action ''. Actions are never executed directly — the Boss "
                       "sees a Confirm button first — so phrase your answer as a proposal ('I can …'), never as already done. "
                       "BE PROACTIVE: if outreach is disabled, suggest switching it on. If emails_drafted_awaiting_your_approval > 0 "
                       "mention the autopilot will send them. Suggest hunting a new city when ready_to_send is low. You do NOT make "
                       "phone calls — outreach happens over WhatsApp and email. "
                       'Respond ONLY with JSON: {"answer": "<spoken answer>", "tab": "<tab id or empty>", "action": "<action or empty>"}')


def _mira_greeting_reply(outreach: dict | None = None) -> dict:
    answer = (f"{_tod_greeting()}, Boss! 🙏 It's wonderful to have you here. "
              + (f"Outreach report: {outreach['greeting']} " if outreach else "")
              + "What do you want me to do today? Just give me your command — or ask me anything.")
    return {"answer": answer, "tab": "", "action": ""}


async def _act_outreach_now(_arg: str, _user: dict) -> str:
    from routes import mira_outreach as mo
    out = await mo.run_outreach_cycle(force=True, ignore_hours=True)
    if out.get("skipped"):
        return f" (Outreach is already running — {out['skipped']}.)"
    bits = [f"emailed {out['emailed']} hot lead{'s' if out['emailed'] != 1 else ''}"]
    if out.get("whatsapp"):
        bits.append(f"{out['whatsapp']} WhatsApp intro(s)")
    if out.get("hunt"):
        bits.append(f"started hunting {out['hunt']['vertical']}s in {out['hunt']['city']}")
    return f" Done — I just {', '.join(bits)}; {out['sent_today']}/{out['limit']} emails used today."


async def _act_outreach_toggle(enabled: bool, user: dict) -> str:
    from routes import mira_outreach as mo
    await _raw_db.platform_settings.update_one({"key": mo.SETTINGS_KEY}, {"$set": {"enabled": enabled, "updated_at": _now(), "updated_by": user.get("email")}}, upsert=True)
    return " Outreach Autopilot is now ON — I'll email hot leads every few minutes within the daily cap." if enabled else " Outreach Autopilot paused."


async def _act_set_limit(arg: str, _user: dict) -> str:
    from routes import mira_outreach as mo
    n = int(re.sub(r"\D", "", arg) or 0)
    if not 1 <= n <= 1000:
        return ""
    await _raw_db.platform_settings.update_one({"key": mo.SETTINGS_KEY}, {"$set": {"daily_email_limit": n, "updated_at": _now()}}, upsert=True)
    return f" Daily email limit set to {n}."


async def _act_hunt(arg: str, user: dict) -> str:
    from routes.lead_gen import RunIn, start_run
    city, _, vertical = arg.partition(":")
    vertical = vertical.strip() if vertical.strip() in ("salon", "restaurant") else "salon"
    if not city.strip():
        return ""
    try:
        await start_run(RunIn(city=city.strip(), target=10, vertical=vertical), user)
        return f" Lead hunt started — {vertical}s in {city.strip()}. I'll email the hot ones automatically."
    except Exception as e:  # noqa: BLE001
        return f" Couldn't start the hunt: {getattr(e, 'detail', str(e))[:80]}."


# action registry: "<verb>[:<arg>]" → handler(arg, user)
_ACTIONS = {
    "outreach_now": _act_outreach_now,
    "outreach_on": lambda _a, u: _act_outreach_toggle(True, u),
    "outreach_off": lambda _a, u: _act_outreach_toggle(False, u),
    "set_limit": _act_set_limit,
    "hunt": _act_hunt,
}


async def _run_mira_action(action: str, user: dict) -> str:
    """Execute a confirmed Mira action; returns a short spoken confirmation ('' if nothing ran)."""
    verb, _, arg = action.partition(":")
    handler = _ACTIONS.get(verb)
    return await handler(arg, user) if handler else ""


async def _mira_llm_decision(user_id: str, question: str, last_mira: str, snap: dict) -> dict:
    """Ask the LLM for {answer, tab}; degrades to a polite fallback on any error."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    from services.mira_brain import MODEL, brain_prompt
    memory_block = await brain_prompt()
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"mira-hq-{user_id}-{uuid.uuid4().hex[:6]}",
                   system_message=_mira_system_prompt()).with_model("openai", MODEL)
    prev = f'Previous Mira message: "{last_mira.strip()[:200]}"\n' if last_mira.strip() else ""
    ist_now = datetime.now(_IST)
    msg = (f"Current time: {ist_now.strftime('%A %d %B, %I:%M %p')} IST ({_tod_greeting()}).\n"
           f"Live snapshot: {json.dumps(snap)}\n{memory_block}{prev}\nAdmin says: {question.strip()[:300]}")
    try:
        raw = await chat.send_message(UserMessage(text=msg))
        m = re.search(r"\{.*\}", str(raw), re.S)
        return json.loads(m.group(0)) if m else {"answer": str(raw)[:300], "tab": ""}
    except Exception as e:
        log.error(f"mira ask failed: {e}")
        return {"answer": "Sorry, I couldn't process that just now — please try again.", "tab": ""}



_ACTION_RE = re.compile(r"^(outreach_now|outreach_on|outreach_off|set_limit:\d{1,4}|hunt:[A-Za-z .'\-]{2,40}(, [A-Z]{2})?:(salon|restaurant))$")


def _describe_action(action: str) -> str:
    if action == "outreach_now":
        return "send the next batch of outreach emails to hot leads right now"
    if action == "outreach_on":
        return "switch the Outreach Autopilot ON (Mira emails hot leads daily within the cap)"
    if action == "outreach_off":
        return "pause the Outreach Autopilot"
    if action.startswith("set_limit:"):
        return f"set the daily email limit to {action.split(':')[1]}"
    if action.startswith("hunt:"):
        p = action.split(":")
        return f"start a lead hunt for {p[2] if len(p) > 2 else 'salon'}s in {p[1]} (uses Places + AI credits)"
    return action


class MiraConfirmIn(BaseModel):
    action: str = Field(..., max_length=80)


@router.post("/super-admin/mira/confirm-action")
async def mira_confirm_action(body: MiraConfirmIn, user=Depends(require_super_admin)):
    """SEC-001: state-changing Mira actions run only after the Boss explicitly confirms — never on LLM output alone."""
    action = body.action.strip()
    if not _ACTION_RE.match(action):
        raise HTTPException(400, "Unknown action")
    from routes.lead_common import log_mira_event
    await log_mira_event("ask", f"Boss confirmed: {_describe_action(action)}")
    result = (await _run_mira_action(action, user)).strip()
    return {"ok": True, "action": action, "answer": result or "Done, Boss."}


@router.post("/super-admin/mira/ask")
async def mira_ask(body: MiraAskIn, user=Depends(require_super_admin)):
    from routes.lead_common import log_mira_event
    from routes.mira_outreach import outreach_summary
    await log_mira_event("ask", f"Boss asked: \"{body.question[:120]}\"")
    q_clean = re.sub(r"[^a-z ]", "", body.question.lower()).strip()
    outreach = await outreach_summary()
    if re.fullmatch(_MIRA_GREETING_RE, q_clean):
        return _mira_greeting_reply(outreach)
    snap = {**await _hq_snapshot(), "outreach": {k: outreach[k] for k in ("settings", "today", "yesterday", "totals", "ready_to_send")}}
    d = await _mira_llm_decision(user["id"], body.question, body.last_mira, snap)
    answer = str(d.get("answer") or "")[:500]
    tab = d.get("tab") if d.get("tab") in MIRA_TABS else ""
    action = str(d.get("action") or "").strip()[:80]
    pending = None
    if action and _ACTION_RE.match(action):
        pending = {"action": action, "label": _describe_action(action)}
        answer = (answer + " ✦ Tap Confirm below and I'll do it.")[:700]
    return {"answer": answer, "tab": tab, "action": "", "pending_action": pending}


class MiraSpeakIn(BaseModel):
    text: str


@router.post("/super-admin/mira/speak")
async def mira_speak(body: MiraSpeakIn, user=Depends(require_super_admin)):
    from routes.briefings import _tts_cached_speech
    audio_b64 = await _tts_cached_speech(body.text.strip()[:900], voice="shimmer", speed=1.03)
    return {"audio_b64": audio_b64}


# ---------------- Mira daily digest email (7 PM IST) ----------------

DIGEST_HOUR_IST = 19


async def send_daily_digest(force: bool = False) -> bool:
    """Evening email to super admins: leads found, emails sent, demo requests."""
    from email_service import _send_email, hq_notify_emails
    ist_now = datetime.now(_IST)
    today_ist = ist_now.date().isoformat()
    if not force:
        if ist_now.hour < DIGEST_HOUR_IST:
            return False
        sent = await _raw_db.platform_settings.find_one(
            {"key": "mira_digest", "last_sent": today_ist}, {"_id": 1})
        if sent:
            return False
    day_start_utc = (ist_now.replace(hour=0, minute=0, second=0, microsecond=0)).astimezone(timezone.utc).isoformat()
    stats = await _outreach_stats(day_start_utc)
    rows = _lead_rows(stats["demo_leads"], "No demo requests today — approve the drafted emails to keep the pipeline warm.")
    html = f"""
    <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto">
      <div style="background:#1c1c22;border-radius:18px 18px 0 0;padding:24px 28px">
        <div style="color:#d4af37;font-size:20px;font-weight:bold">🌙 Mira's Evening Digest</div>
        <div style="color:#999;font-size:12px;margin-top:4px">{ist_now.strftime('%A, %d %B %Y')} · Miracurl HQ</div>
      </div>
      <div style="background:#fff;border:1px solid #eee;border-top:0;border-radius:0 0 18px 18px;padding:24px 28px">
        <table style="width:100%;border-spacing:6px 0"><tr>
          {_stat_cell(stats["leads_found"], "Leads found")}
          {_stat_cell(stats["emails_sent"], "Emails sent", "#0f766e")}
          {_stat_cell(len(stats["demo_leads"]), "Demo requests 🎉", "#0a7d43")}
          {_stat_cell(stats["drafted"], "Awaiting approval", "#b45309")}
        </tr></table>
        <h3 style="color:#1c1c22;font-size:14px;margin:22px 0 6px">Today's demo requests</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#333">{rows}</table>
        <p style="font-size:12px;color:#777;margin-top:18px">
          🔥 {stats["hot_now"]} hot leads in the pipeline — open the Lead Agent tab to approve drafted emails or start a WhatsApp nudge.</p>
      </div>
    </div>"""
    to = ([os.environ["HQ_DIGEST_EMAIL"]] if os.environ.get("HQ_DIGEST_EMAIL")
          else hq_notify_emails("admin"))
    if not to:
        return False
    res = await _send_email(
        to, f"🌙 Mira's digest — {stats['leads_found']} leads found, {stats['emails_sent']} emails, {len(stats['demo_leads'])} demo requests",
        html, book_url="https://miracurl-suite.com/super-admin", book_label="Open HQ Console ✦")
    await _raw_db.platform_settings.update_one(
        {"key": "mira_digest"}, {"$set": {"last_sent": today_ist, "at": _now(),
                                          "email_sent": bool(res.get("sent"))}}, upsert=True)
    return bool(res.get("sent"))


async def _outreach_stats(since: str) -> dict:
    return {
        "leads_found": await _raw_db.mira_leads.count_documents({"created_at": {"$gte": since}}),
        "emails_sent": await _raw_db.mira_leads.count_documents({"status": "sent", "sent_at": {"$gte": since}}),
        "demo_leads": await _raw_db.mira_leads.find(
            {"status": {"$in": ["demo", "replied"]}, "updated_at": {"$gte": since}},
            {"_id": 0, "name": 1, "city": 1, "phone": 1, "email": 1}).to_list(100),
        "drafted": await _raw_db.mira_leads.count_documents(
            {"status": {"$in": ["drafted", "researched"]}, "email": {"$nin": ["", None]}}),
        "hot_now": await _raw_db.mira_leads.count_documents({**HOT_QUERY}),
    }


def _stat_cell(v, label, color="#1c1c22") -> str:
    return (f'<td style="padding:14px 10px;text-align:center;background:#faf7f2;border-radius:12px">'
            f'<div style="font-size:26px;font-weight:bold;color:{color}">{v}</div>'
            f'<div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px">{label}</div></td>')


def _lead_rows(leads: list, empty: str) -> str:
    return "".join(
        f'<tr><td style="padding:7px 10px;border-bottom:1px solid #f0ece4">🎉 <b>{html_lib.escape(l.get("name") or "")}</b>'
        f'<span style="color:#888"> · {html_lib.escape(l.get("city") or "")}</span></td>'
        f'<td style="padding:7px 10px;border-bottom:1px solid #f0ece4;color:#555;font-size:12px">'
        f'{html_lib.escape(l.get("phone") or "")}{(" · " + html_lib.escape(l["email"])) if l.get("email") else ""}</td></tr>'
        for l in leads) or f'<tr><td style="padding:10px;color:#999;font-size:12px" colspan="2">{empty}</td></tr>'


# ---------------- Weekly Win Report (Monday morning email) ----------------

async def _weekly_already_sent(ist_now) -> bool:
    if ist_now.weekday() != 0 or ist_now.hour < 9:
        return True
    return bool(await _raw_db.platform_settings.find_one(
        {"key": "mira_weekly_win", "last_sent": ist_now.strftime("%G-W%V")}, {"_id": 1}))


async def _weekly_risers(since: str) -> list[dict]:
    rd = await _raw_db.platform_settings.find_one({"key": "lead_heat_risers"}, {"_id": 0}) or {}
    return (rd.get("risers") or [])[:3] if (rd.get("ran_at") or "") >= since else []


def _risers_html(risers: list[dict]) -> str:
    if not risers:
        return ""
    return ("<h3 style='color:#1c1c22;font-size:14px;margin:20px 0 6px'>🔥 Heating up this week</h3>" +
            "".join(f"<div style='font-size:13px;color:#333;padding:4px 0'>• <b>{html_lib.escape(r['name'])}</b> "
                    f"<span style='color:#888'>{html_lib.escape(r.get('city') or '')}</span> — score {r['from']} → <b>{r['to']}</b></div>"
                    for r in risers))


def _weekly_win_html(ist_now, stats: dict, new_tenants: int, win_rows: str, riser_html: str) -> str:
    return f"""
    <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto">
      <div style="background:#1c1c22;border-radius:18px 18px 0 0;padding:24px 28px">
        <div style="color:#d4af37;font-size:20px;font-weight:bold">🏆 Mira's Weekly Win Report</div>
        <div style="color:#999;font-size:12px;margin-top:4px">Week of {(ist_now - timedelta(days=7)).strftime('%d %b')} – {ist_now.strftime('%d %b %Y')} · Miracurl HQ</div>
      </div>
      <div style="background:#fff;border:1px solid #eee;border-top:0;border-radius:0 0 18px 18px;padding:24px 28px">
        <table style="width:100%;border-spacing:6px 0"><tr>
          {_stat_cell(stats["leads_found"], "New leads")}
          {_stat_cell(stats["emails_sent"], "Emails sent", "#0f766e")}
          {_stat_cell(len(stats["demo_leads"]), "Demos 🎉", "#0a7d43")}
          {_stat_cell(new_tenants, "New salons", "#7c3aed")}
        </tr></table>
        <table style="width:100%;border-spacing:6px 0;margin-top:6px"><tr>
          {_stat_cell(stats["drafted"], "Awaiting approval", "#b45309")}
          {_stat_cell(stats["hot_now"], "Hot leads", "#ea580c")}
        </tr></table>
        <h3 style="color:#1c1c22;font-size:14px;margin:22px 0 6px">This week's demo requests</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#333">{win_rows}</table>
        {riser_html}
        <p style="font-size:12px;color:#777;margin-top:18px">
          Have a great week! Tell me a city and I'll hunt fresh salon leads for you. — Mira 💫</p>
      </div>
    </div>"""


async def send_weekly_win_report(force: bool = False) -> bool:
    """Monday-morning email: Mira's last-7-day wins — leads, emails, demo requests, heat risers."""
    from email_service import _send_email, hq_notify_emails
    ist_now = datetime.now(_IST)
    week_key = ist_now.strftime("%G-W%V")
    if not force and await _weekly_already_sent(ist_now):
        return False
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    stats = await _outreach_stats(since)
    new_tenants = await _raw_db.tenants.count_documents({"created_at": {"$gte": since}})
    win_rows = _lead_rows(stats["demo_leads"], "No demo requests this week — a fresh outreach push could change that.")
    html = _weekly_win_html(ist_now, stats, new_tenants, win_rows, _risers_html(await _weekly_risers(since)))
    to = ([os.environ["HQ_DIGEST_EMAIL"]] if os.environ.get("HQ_DIGEST_EMAIL")
          else hq_notify_emails("admin"))
    if not to:
        return False
    res = await _send_email(
        to, f"🏆 Mira's week — {stats['leads_found']} new leads, {stats['emails_sent']} emails, {len(stats['demo_leads'])} demos",
        html, book_url="https://miracurl-suite.com/super-admin", book_label="Open HQ Console ✦")
    await _raw_db.platform_settings.update_one(
        {"key": "mira_weekly_win"}, {"$set": {"last_sent": week_key, "at": _now(),
                                              "email_sent": bool(res.get("sent"))}}, upsert=True)
    return bool(res.get("sent"))


def _goal_coach(collected: float, target: float, stretch: float, pct: float, avg_pay: int) -> str:
    lk = lambda v: f"{v / 100000:g}"  # noqa: E731
    if collected >= stretch:
        return f"LEGENDARY, Boss! ₹{collected:,.0f} collected — you've crossed even the ₹{lk(stretch)} lakh stretch goal! 🏆"
    if collected >= target:
        return (f"Target achieved, Boss! 🎉 ₹{collected:,.0f} is past the ₹{lk(target)}L goal — "
                f"now let's chase the ₹{lk(stretch)}L stretch. Keep onboarding!")
    if collected > 0:
        needed = int((target - collected + avg_pay - 1) // avg_pay) if avg_pay else 0
        return (f"We're at {pct:g}% of the ₹{lk(target)}L goal. At ~₹{avg_pay:,} per payment, "
                f"about {needed} more subscription payments get us there — say 'find salon leads' and I'll hunt!")
    return (f"No subscription revenue yet this month, Boss. Our ₹{lk(target)}–{lk(stretch)} lakh goal needs "
            "more salons onboard — tell me a city and I'll start hunting leads right away!")


async def _revenue_goal(now: datetime) -> dict:
    """Month-to-date subscription revenue vs the Boss's target/stretch, with Mira's coaching line."""
    month_start = now.date().replace(day=1).isoformat()
    goal_doc = await _raw_db.platform_settings.find_one({"key": "revenue_goal"}, {"_id": 0}) or {}
    target = float(goal_doc.get("target") or 1000000)
    stretch = float(goal_doc.get("stretch") or max(2000000, target * 2))
    mrev = await _raw_db.subscription_payments.aggregate([
        {"$match": {"$or": [{"paid_at": {"$gte": month_start}},
                            {"paid_at": {"$in": ["", None]}, "created_at": {"$gte": month_start}}]}},
        {"$group": {"_id": None, "s": {"$sum": "$amount"}, "n": {"$sum": 1}}}]).to_list(1)
    collected = round((mrev[0]["s"] if mrev else 0) or 0, 2)
    pay_n = (mrev[0]["n"] if mrev else 0) or 0
    pct = round(collected / target * 100, 1) if target else 0.0
    avg_pay = round(collected / pay_n) if pay_n else 0
    return {"collected_this_month": collected, "payments_this_month": pay_n,
            "target": target, "stretch": stretch, "pct": pct,
            "month": now.strftime("%B"), "coach": _goal_coach(collected, target, stretch, pct, avg_pay)}


@router.get("/super-admin/mira/home")
async def mira_home(user=Depends(require_super_admin)):
    """Everything Mira Home needs in one call: snapshot cards + memory timeline."""
    snap = await _hq_snapshot()
    now = datetime.now(timezone.utc)
    two_days = (now - timedelta(hours=48)).isoformat()
    new_prospects = await _raw_db.leads.count_documents({"created_at": {"$gte": two_days}})
    followups = await _raw_db.demo_invites.count_documents({"status": {"$in": ["pending", "sent", "opened"]}})
    emails_sent = await _raw_db.leads.count_documents({"status": {"$in": ["sent", "demo", "customer", "replied"]}})
    active_run = await _raw_db.mira_lead_runs.find_one(
        {"status": "running"}, {"_id": 0, "city": 1, "stage": 1, "found": 1})
    in5 = (now + timedelta(days=5)).date().isoformat()
    trials_expiring = await _raw_db.tenants.count_documents(
        {"status": "trial", "trial_ends_at": {"$lte": in5}})
    timeline = await _raw_db.mira_timeline.find({}, {"_id": 0}).sort("created_at", -1).to_list(30)
    health, orphans, alerts = await _system_health()
    revenue_goal = await _revenue_goal(now)
    sweep = await _raw_db.system_flags.find_one(
        {"key": "db_health"}, {"_id": 0, "checked_at": 1, "orphans": 1, "new_findings": 1, "announced": 1})
    blog_drafts = await _raw_db.blog_posts.find(
        {"published": False}, {"_id": 0, "title": 1, "auto_draft": 1, "created_at": 1}
    ).sort("created_at", -1).to_list(5)
    from routes.mira_outreach import outreach_summary
    outreach = await outreach_summary()
    google_pending = await _raw_db.social_connections.count_documents({"google_business": {"$exists": True}, "google_business.api_ready": {"$ne": True}})
    return {"snapshot": snap, "new_prospects_48h": new_prospects, "followups_due": followups, "google_pending": google_pending,
            "emails_sent": emails_sent, "active_run": active_run,
            "trials_expiring": trials_expiring, "timeline": timeline,
            "health": health, "orphan_records": orphans, "health_alerts": alerts,
            "revenue_goal": revenue_goal, "weekly_sweep": sweep or {}, "blog_drafts": blog_drafts,
            "outreach": outreach}


class RevenueGoalIn(BaseModel):
    target: float = Field(..., gt=0)
    stretch: float = Field(0, ge=0)


@router.put("/super-admin/mira/revenue-goal")
async def set_revenue_goal(body: RevenueGoalIn, user=Depends(require_super_admin)):
    stretch = body.stretch if body.stretch > body.target else body.target * 2
    await _raw_db.platform_settings.update_one(
        {"key": "revenue_goal"},
        {"$set": {"key": "revenue_goal", "target": body.target, "stretch": stretch,
                  "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return {"ok": True, "target": body.target, "stretch": stretch}


@router.get("/super-admin/mira/live-task")
async def mira_live_task(user=Depends(require_super_admin)):
    """Lightweight poll: what is Mira actually doing right now (for live narration)."""
    run = await _raw_db.mira_lead_runs.find_one(
        {"status": "running"},
        {"_id": 0, "city": 1, "stage": 1, "found": 1, "researched": 1, "target": 1, "log": {"$slice": -1}})
    if run:
        last = re.sub(r"^\[\d{2}:\d{2}:\d{2}\]\s*", "", (run.get("log") or [""])[-1])
        city = run.get("city") or ""
        found, done = run.get("found") or 0, run.get("researched") or 0
        stage = run.get("stage") or "working"
        label = {
            "starting": f"Starting a lead hunt in {city}…",
            "finding": f"Scanning salons in {city}…",
            "researching": f"Analyzing {found} salons in {city} — {done} researched…",
            "hunting": f"Hunting missing emails — {found} inbox{'es' if found != 1 else ''} found…",
        }.get(stage, f"Working on {city or 'a background task'}…")
        return {"active": True, "kind": "lead_hunt", "label": label, "detail": last,
                "city": city, "stage": stage, "found": found, "researched": done}
    return {"active": False}


# ---------------- Mira Memory Vault ----------------
class MemoryIn(BaseModel):
    category: str = Field("general", max_length=40)
    text: str = Field(..., min_length=2, max_length=500)


@router.get("/super-admin/mira/memory")
async def mira_memory_list(user=Depends(require_super_admin)):
    rows = await _raw_db.mira_memory.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": rows}


@router.post("/super-admin/mira/memory")
async def mira_memory_add(body: MemoryIn, user=Depends(require_super_admin)):
    doc = {"id": str(uuid.uuid4()), "category": body.category.strip().lower() or "general",
           "text": body.text.strip(), "created_at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.mira_memory.insert_one({**doc})
    from routes.lead_common import log_mira_event
    await log_mira_event("memory", f"Boss saved a memory: \"{body.text[:90]}\"")
    doc.pop("_id", None)
    return doc


@router.put("/super-admin/mira/memory/{mid}")
async def mira_memory_edit(mid: str, body: MemoryIn, user=Depends(require_super_admin)):
    r = await _raw_db.mira_memory.update_one(
        {"id": mid}, {"$set": {"category": body.category.strip().lower() or "general",
                               "text": body.text.strip(),
                               "updated_at": datetime.now(timezone.utc).isoformat()}})
    if not r.matched_count:
        raise HTTPException(404, "Memory not found")
    return {"ok": True}


@router.delete("/super-admin/mira/memory/{mid}")
async def mira_memory_delete(mid: str, user=Depends(require_super_admin)):
    await _raw_db.mira_memory.delete_one({"id": mid})
    return {"ok": True}


async def mira_memory_prompt() -> str:
    from services.mira_brain import brain_prompt
    return await brain_prompt()


# ---------------- Follow-up Pipeline ----------------
_PIPE_MAP = {
    "NEW": ("researched", "drafted", "approved", "no_email"),
    "CONTACTED": ("sent", "emailed", "followup_sent"),
    "INTERESTED": ("replied", "demo", "opened"),
    "CONVERTED": ("customer", "converted"),
}


def _pipe_suggestion(col: str, lead: dict) -> str:
    days_since = 999
    for f in ("last_followup_at", "sent_at", "created_at"):
        if lead.get(f):
            try:
                days_since = (datetime.now(timezone.utc) - datetime.fromisoformat(str(lead[f]).replace("Z", "+00:00"))).days
                break
            except ValueError:
                continue
    if col == "NEW":
        if not lead.get("email") and lead.get("phone"):
            return "No email found — open WhatsApp and introduce Miracurl directly."
        return "Review the drafted intro email and approve it for sending."
    if col == "CONTACTED":
        if days_since >= 3:
            return f"No reply for {days_since} days — send a short value-based follow-up (email or WhatsApp), don't repeat the pitch."
        return "Recently contacted — wait for a reply, follow up after 3 days."
    if col == "INTERESTED":
        return "They're warm! Offer a demo slot today — strike while the interest is hot."
    noun = "restaurants" if (lead.get("vertical") or "salon") == "restaurant" else "salons"
    return f"Converted 🎉 — onboard them well and ask for a referral to nearby {noun}."


@router.get("/super-admin/mira/pipeline")
async def mira_pipeline(vertical: str = "", user=Depends(require_super_admin)):
    import urllib.parse
    from routes.lead_gen import _wa_message
    q = {"status": {"$nin": ["rejected", "failed", "unsubscribed"]}}
    if vertical == "restaurant":
        q["vertical"] = "restaurant"
    elif vertical == "salon":
        q["vertical"] = {"$in": ["salon", None, ""]}
    leads = await _raw_db.mira_leads.find(
        q, {"_id": 0, "id": 1, "name": 1, "city": 1, "email": 1, "phone": 1, "status": 1, "vertical": 1, "owner_name": 1,
            "reviews": 1, "rating": 1, "sent_at": 1, "last_followup_at": 1, "created_at": 1, "website": 1,
            "email_source": 1, "phone_source": 1, "sent_via": 1, "replied_at": 1, "followup_stage": 1, "instagram_handle": 1}
    ).sort("created_at", -1).to_list(400)
    cols = {k: [] for k in _PIPE_MAP}
    totals = {"salon": 0, "restaurant": 0}
    for lead in leads:
        col = next((k for k, v in _PIPE_MAP.items() if (lead.get("status") or "researched") in v), "NEW")
        totals["restaurant" if lead.get("vertical") == "restaurant" else "salon"] += 1
        wa = ""
        digits = re.sub(r"\D", "", lead.get("phone") or "")
        if digits:
            if len(digits) == 10:
                digits = "91" + digits
            wa = f"https://wa.me/{digits}?text={urllib.parse.quote(await _wa_message(lead))}"
        cols[col].append({**lead, "vertical": lead.get("vertical") or "salon", "suggestion": _pipe_suggestion(col, lead), "wa_link": wa})
    return {"columns": [{"key": k, "label": k.title().replace("_", " "), "leads": v[:60]} for k, v in cols.items()],
            "counts": {k: len(v) for k, v in cols.items()}, "totals": totals, "vertical": vertical or "all"}


# ---------------- Face-ID ----------------
class FaceIn(BaseModel):
    image_b64: str = Field(..., min_length=100)


@router.get("/super-admin/mira/face-status")
async def face_status(user=Depends(require_super_admin)):
    doc = await _raw_db.mira_settings.find_one({"key": f"face_ref_{user['id']}"}, {"_id": 0, "enrolled_at": 1})
    return {"enrolled": bool(doc), "enrolled_at": (doc or {}).get("enrolled_at")}


@router.post("/super-admin/mira/face-enroll")
async def face_enroll(body: FaceIn, user=Depends(require_super_admin)):
    await _raw_db.mira_settings.update_one(
        {"key": f"face_ref_{user['id']}"},
        {"$set": {"key": f"face_ref_{user['id']}", "image_b64": body.image_b64[:2_000_000],
                  "enrolled_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True)
    from routes.lead_common import log_mira_event
    await log_mira_event("memory", "Boss enrolled Face-ID — Mira will now verify by face at login.")
    return {"ok": True}


@router.delete("/super-admin/mira/face-enroll")
async def face_unenroll(user=Depends(require_super_admin)):
    await _raw_db.mira_settings.delete_one({"key": f"face_ref_{user['id']}"})
    return {"ok": True}


@router.post("/super-admin/mira/face-verify")
async def face_verify(body: FaceIn, user=Depends(require_super_admin)):
    ref = await _raw_db.mira_settings.find_one({"key": f"face_ref_{user['id']}"}, {"_id": 0, "image_b64": 1})
    if not ref:
        raise HTTPException(400, "No enrolled face — enroll Face-ID first")
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"faceid-{uuid.uuid4().hex[:8]}",
                   system_message=("You are a face verification system. Image 1 is the enrolled reference face; "
                                   "image 2 is a live webcam capture. Decide if they show the SAME person. "
                                   "Be tolerant of lighting/angle/glasses. If either image has no clear human face, match=false. "
                                   'Respond ONLY with JSON: {"match": true/false, "confidence": 0-100, "reason": "<short>"}')
                   ).with_model("gemini", "gemini-3-flash-preview")
    try:
        resp = await chat.send_message(UserMessage(
            text="Same person?",
            file_contents=[ImageContent(image_base64=ref["image_b64"]), ImageContent(image_base64=body.image_b64)]))
        raw = (resp or "").strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        m = re.search(r"\{.*\}", raw, re.S)
        d = json.loads(m.group(0)) if m else {}
    except Exception as e:  # noqa: BLE001
        logging.error(f"face verify failed: {e}")
        raise HTTPException(502, "Face verification service unavailable — try again")
    match = bool(d.get("match")) and float(d.get("confidence") or 0) >= 55
    if match:
        from routes.lead_common import log_mira_event
        await log_mira_event("memory", "Boss verified by Face-ID ✓ — Mira welcomed them.")
    return {"match": match, "confidence": d.get("confidence"), "reason": d.get("reason", "")}


# ---------------- Platform Overview ----------------
@router.get("/super-admin/platform-overview")
async def platform_overview(user=Depends(require_super_admin)):
    now = datetime.now(timezone.utc)
    in5 = (now + timedelta(days=5)).date().isoformat()
    tenants = await _raw_db.tenants.find(
        {}, {"_id": 0, "id": 1, "name": 1, "location": 1, "status": 1, "trial_ends_at": 1, "created_at": 1}).to_list(1000)
    subs = {"active": 0, "trial": 0, "expiring": 0, "cancelled": 0}
    for t in tenants:
        st = t.get("status") or "active"
        if st == "trial" and (t.get("trial_ends_at") or "9999") <= in5:
            subs["expiring"] += 1
        elif st in subs:
            subs[st] += 1
        elif st in ("suspended", "cancelled", "expired"):
            subs["cancelled"] += 1
        else:
            subs["active"] += 1
    recent = sorted(tenants, key=lambda t: t.get("created_at") or "", reverse=True)[:5]
    month = now.strftime("%Y-%m")
    pipe = [{"$match": {"created_at": {"$gte": f"{month}-01"}}},
            {"$group": {"_id": "$tenant_id", "revenue": {"$sum": {"$toDouble": {"$ifNull": ["$total", 0]}}}}},
            {"$sort": {"revenue": -1}}, {"$limit": 5}]
    top = await _raw_db.invoices.aggregate(pipe).to_list(5)
    names = {t["id"]: t for t in tenants}
    top_rev = [{"name": names.get(r["_id"], {}).get("name") or "Unknown salon",
                "location": names.get(r["_id"], {}).get("location") or "",
                "revenue": round(r["revenue"], 2)} for r in top if r["_id"]]
    health, _orphans, _alerts = await _system_health()
    return {"subscriptions": {**subs, "total": len(tenants)},
            "recent": [{k: t.get(k) for k in ("name", "location", "status", "trial_ends_at")} for t in recent],
            "health": health, "all_ok": all(h["ok"] for h in health), "top_revenue": top_rev}
