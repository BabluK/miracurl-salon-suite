"""Mira Outreach Autopilot — HQ-side: Mira hunts leads worldwide, emails hot salon/restaurant leads
(separate templates per vertical), WhatsApps them where the country is allowed, keeps a daily history
and emails HQ the moment a lead converts (reply / demo request / signup)."""
import asyncio
import logging
import os
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import _raw_db
from security import require_super_admin
from routes.lead_common import (_live_plans, _outreach_email_html, _lead_reply_to, _lead_headers, log_mira_event, _unsub_footer)
from routes.lead_wa_auto import _wa_phone, send_intro, template_status

router = APIRouter()
log = logging.getLogger("mira_outreach")
SETTINGS_KEY = "mira_outreach"
_CYCLE_LOCK = asyncio.Lock()

# ISO suffix on lead.city → (dial code, UTC offset hours). India (no suffix) is the default.
_COUNTRIES = {
    "IN": ("91", 5.5), "US": ("1", -5), "CA": ("1", -5), "UK": ("44", 0), "GB": ("44", 0), "IE": ("353", 0),
    "AE": ("971", 4), "SA": ("966", 3), "QA": ("974", 3), "BH": ("973", 3), "OM": ("968", 4), "KW": ("965", 3),
    "SG": ("65", 8), "MY": ("60", 8), "AU": ("61", 10), "NZ": ("64", 12), "DE": ("49", 1), "FR": ("33", 1),
    "NL": ("31", 1), "ES": ("34", 1), "IT": ("39", 1), "ZA": ("27", 2), "KE": ("254", 3), "NG": ("234", 1),
    "PH": ("63", 8), "TH": ("66", 7), "ID": ("62", 7), "LK": ("94", 5.5), "BD": ("880", 6), "NP": ("977", 5.75),
}
# Mira's world tour — cities she rotates through on her own when the pipeline runs thin.
_WORLD_CITIES = [
    "Bangalore", "Mumbai", "Delhi", "Hyderabad", "Chennai", "Pune", "Kolkata", "Ahmedabad", "Jaipur", "Kochi",
    "Dubai, AE", "Abu Dhabi, AE", "Sharjah, AE", "Doha, QA", "Riyadh, SA", "Muscat, OM", "Manama, BH",
    "London, UK", "Manchester, UK", "Birmingham, UK", "Dublin, IE",
    "New York, US", "Los Angeles, US", "Chicago, US", "Houston, US", "Toronto, CA", "Vancouver, CA",
    "Singapore, SG", "Kuala Lumpur, MY", "Sydney, AU", "Melbourne, AU", "Auckland, NZ",
    "Nairobi, KE", "Johannesburg, ZA", "Colombo, LK", "Kathmandu, NP", "Dhaka, BD",
]
_DEFAULTS = {"enabled": True, "daily_email_limit": 100, "per_cycle": 10, "min_score": 30,
             "verticals": ["salon", "restaurant"], "wa_countries": ["91"], "auto_hunt": True, "hunts_per_day": 2,
             "hunt_countries": ["IN", "AE", "UK", "US", "SG", "AU", "CA"], "start_hour": 9, "end_hour": 18,
             # targeting: growing businesses (recently opened, < max_reviews Google reviews) + luxury salons
             "max_reviews": 300, "include_luxury": True,
             # reminder cadence for leads that never replied: day 7 → day 14 → day 30 → every 90 days
             "followup_days": [7, 7, 16, 90]}

_LUXURY_RE = re.compile(r"\b(luxury|luxe|premium|royal|elite|signature|prestige|boutique|spa|lounge|couture|imperial|platinum|grand)\b", re.I)


def is_luxury(lead: dict) -> bool:
    text = f"{lead.get('name') or ''} {lead.get('category') or ''} {lead.get('summary') or ''}"
    return bool(_LUXURY_RE.search(text)) or (float(lead.get("rating") or 0) >= 4.8 and int(lead.get("reviews") or 0) >= 1000)


def segment_of(lead: dict, max_reviews: int) -> str:
    if int(lead.get("reviews") or 0) < max_reviews:
        return "growing"
    return "luxury" if is_luxury(lead) else "other"


def _esc(v) -> str:
    import html as _h
    return _h.escape(str(v or ""))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


from services.hq_conversion import country_of as _country_of  # noqa: E402


def _local_hour(city: str) -> float:
    off = _COUNTRIES.get(_country_of(city), ("91", 5.5))[1]
    t = datetime.now(timezone.utc) + timedelta(hours=off)
    return t.hour + t.minute / 60


async def get_settings() -> dict:
    doc = await _raw_db.platform_settings.find_one({"key": SETTINGS_KEY}, {"_id": 0}) or {}
    return {k: doc.get(k, v) for k, v in _DEFAULTS.items()}


# ---------------- sending ----------------

async def send_pitch(lead: dict, by: str = "mira-autopilot") -> dict:
    """Email the researched pitch (vertical-specific template + demo link). Records the lead + history row."""
    from email_service import _send_email
    if not lead.get("email") or lead.get("unsubscribed") or lead.get("status") == "sent":
        return {"sent": False, "error": "not eligible"}
    html = _outreach_email_html(lead, await _live_plans())
    res = await _send_email([lead["email"]], lead.get("email_subject") or "Miracurl Suite — free demo", html,
                            book_url="https://miracurl-suite.com/demo", reply_to=_lead_reply_to(),
                            headers=_lead_headers(lead["id"]), from_name="Mira at Miracurl")
    if not res.get("sent"):
        await _raw_db.mira_leads.update_one({"id": lead["id"]}, {"$set": {"auto_send_error": str(res.get("error"))[:200],
                                                                          "auto_send_attempted_at": _now()}})
        return res
    await _raw_db.mira_leads.update_one({"id": lead["id"]}, {"$set": {
        "status": "sent", "sent_via": "email", "sent_at": _now(), "approved_by": by, "auto_sent": by == "mira-autopilot"}})
    await _log_send(lead, "email", detail=lead.get("email_subject") or "")
    return res


async def _log_send(lead: dict, channel: str, detail: str = "", kind: str = "pitch") -> None:
    await _raw_db.mira_outreach_log.insert_one({
        "id": str(uuid.uuid4()), "day": _today(), "created_at": _now(), "channel": channel, "kind": kind,
        "segment": segment_of(lead, 300),
        "lead_id": lead["id"], "name": lead.get("name") or "", "vertical": lead.get("vertical") or "salon",
        "city": lead.get("city") or "", "country": _country_of(lead.get("city")),
        "email": lead.get("email") or "", "phone": lead.get("phone") or "",
        "hot": bool((lead.get("reviews") or 0) >= 500 and not lead.get("website")),
        "score": lead.get("score") or 0, "detail": detail[:160]})


def _candidate_query(vertical: str, s: dict) -> dict:
    """Fresh leads only (never emailed): growing businesses under the review cap, plus luxury names when enabled."""
    seg = [{"reviews": {"$lt": s.get("max_reviews", 300)}}]
    if s.get("include_luxury", True):
        seg += [{"name": {"$regex": _LUXURY_RE.pattern, "$options": "i"}}, {"category": {"$regex": _LUXURY_RE.pattern, "$options": "i"}},
                {"rating": {"$gte": 4.8}, "reviews": {"$gte": 1000}}]
    return {"status": {"$in": ["drafted", "researched"]}, "email": {"$nin": ["", None]}, "sent_at": {"$exists": False},
            "unsubscribed": {"$ne": True}, "vertical": vertical if vertical == "restaurant" else {"$in": ["salon", None, ""]},
            "score": {"$gte": s.get("min_score", 30)}, "$or": seg}


async def _pick_candidates(s: dict, budget: int, ignore_hours: bool) -> list:
    """Round-robin salon / restaurant so both verticals get their share; hottest first; local business hours."""
    from routes.lead_gen import _has_real_inbox
    pools = []
    for v in s["verticals"]:
        rows = await _raw_db.mira_leads.find(_candidate_query(v, s), {"_id": 0}).sort(
            [("score", -1), ("created_at", -1)]).to_list(160)
        rows = [r for r in rows if _has_real_inbox(r.get("email"))
                and (ignore_hours or s["start_hour"] <= _local_hour(r.get("city")) < s["end_hour"])]
        # growing businesses first (the main target), luxury names after — 3 : 1 mix so both get daily coverage
        growing = [r for r in rows if segment_of(r, s["max_reviews"]) == "growing"]
        luxury = [r for r in rows if r not in growing]
        mixed = []
        while growing or luxury:
            mixed += growing[:3]; del growing[:3]
            mixed += luxury[:1]; del luxury[:1]
        pools.append(mixed)
    out, i = [], 0
    while len(out) < budget and any(pools):
        pool = pools[i % len(pools)]
        if pool:
            out.append(pool.pop(0))
        i += 1
    return out


async def _maybe_whatsapp(lead: dict, s: dict) -> bool:
    phone = _wa_phone(lead.get("phone") or "")
    if len(phone) < 10 or not any(phone.startswith(cc) for cc in s["wa_countries"]):
        return False
    if lead.get("wa_intro_sent_at") or lead.get("wa_opt_out") or lead.get("do_not_call"):
        return False
    if await template_status() != "APPROVED":
        return False
    res = await send_intro(lead, auto=True)
    if res.get("ok"):
        await _log_send(lead, "whatsapp", detail="intro template")
    return bool(res.get("ok"))


async def sent_today(channel: str = "email") -> int:
    return await _raw_db.mira_outreach_log.count_documents({"day": _today(), "channel": channel})


# ---------------- reminders (no reply yet): day 7 → day 14 → day 30 → every 90 days ----------------

_REMINDER_COPY = [
    ("Quick follow-up — did you get a chance to look?",
     "Hi {first},\n\nLast week I sent a note about how Miracurl Suite helps {vert}s like {name} run bookings, billing and WhatsApp reminders "
     "from one place. Did you get a chance to look?\n\nIf it's easier, pick a 20-minute demo slot here: {demo}\n\nWarmly,\nMira & the Miracurl team"),
    ("Still thinking it over? Here's the 2-minute version",
     "Hi {first},\n\nNo pressure — most owners tell us the hard part is finding 20 minutes. So here's the short version: fewer no-shows, "
     "faster billing, and repeat visits on autopilot, with a free trial to start.\n\nWhen you have a moment: {demo}\n\nMira & the Miracurl team"),
    ("A month on — anything changed at {name}?",
     "Hi {first},\n\nIt's been about a month since I first wrote. If the timing wasn't right then, I understand completely. "
     "If {name} is growing and the daily admin is piling up, I'd love to show you what Miracurl can take off your plate.\n\n{demo}\n\nMira & the Miracurl team"),
    ("Checking in from Miracurl — new this season",
     "Hi {first},\n\nA quick quarterly hello from Mira. We keep adding things owners ask for — QR ordering, loyalty stamps, AI review replies. "
     "If you'd like a fresh look at what's new for {vert}s, here's the demo link: {demo}\n\nAlways happy to help,\nMira & the Miracurl team"),
]


def _reminder_due(lead: dict, days: list[int]) -> bool:
    stage = int(lead.get("followup_stage") or 0)
    last = lead.get("last_followup_at") or lead.get("sent_at")
    if not last:
        return False
    wait = days[min(stage, len(days) - 1)]
    return datetime.fromisoformat(last.replace("Z", "+00:00")) + timedelta(days=wait) <= datetime.now(timezone.utc)


async def send_reminder(lead: dict) -> dict:
    from email_service import _send_email
    stage = int(lead.get("followup_stage") or 0)
    subj_t, body_t = _REMINDER_COPY[min(stage, len(_REMINDER_COPY) - 1)]
    vert = "restaurant" if (lead.get("vertical") or "salon") == "restaurant" else "salon"
    ctx = {"first": (lead.get("owner_name") or lead.get("name") or "there").split()[0].title(), "name": lead.get("name") or "your business",
           "vert": vert, "demo": _demo_url()}
    subject, body = subj_t.format(**ctx), body_t.format(**ctx)
    html = "".join(f"<p>{_esc(p)}</p>" for p in body.split("\n") if p.strip()) + _unsub_footer(lead["id"])
    res = await _send_email([lead["email"]], subject, html, book_url=_demo_url(), book_label="Pick a demo slot ✦",
                            reply_to=_lead_reply_to(), headers=_lead_headers(lead["id"]), from_name="Mira at Miracurl")
    if res.get("sent"):
        await _raw_db.mira_leads.update_one({"id": lead["id"]}, {"$set": {"last_followup_at": _now(), "follow_up_sent_at": _now()},
                                                                 "$inc": {"followup_stage": 1}})
        await _log_send(lead, "email", detail=subject, kind=f"reminder_{stage + 1}")
    return res


async def _pick_reminders(s: dict, budget: int, ignore_hours: bool) -> list:
    """Leads emailed earlier that never replied, whose next reminder is due — oldest first, one touch per lead per day."""
    from routes.lead_gen import _has_real_inbox
    if budget <= 0:
        return []
    rows = await _raw_db.mira_leads.find(
        {"status": "sent", "sent_via": "email", "email": {"$nin": ["", None]}, "unsubscribed": {"$ne": True},
         "replied_at": {"$exists": False}, "wa_intro_replied_at": {"$exists": False},
         "$or": [{"last_followup_at": {"$exists": False}}, {"last_followup_at": {"$lt": _today()}}]},
        {"_id": 0}).sort("sent_at", 1).to_list(400)
    days = s.get("followup_days") or _DEFAULTS["followup_days"]
    return [r for r in rows if _reminder_due(r, days) and _has_real_inbox(r.get("email"))
            and (ignore_hours or s["start_hour"] <= _local_hour(r.get("city")) < s["end_hour"])][:budget]


async def run_outreach_cycle(force: bool = False, dry_run: bool = False, ignore_hours: bool = False) -> dict:
    """One autopilot tick: email up to `per_cycle` eligible leads within today's cap, WhatsApp where allowed,
    then top up the pipeline with a fresh world-city hunt if it is thin."""
    s = await get_settings()
    if not s["enabled"] and not force:
        return {"skipped": "autopilot off"}
    if _CYCLE_LOCK.locked():
        return {"skipped": "another cycle is running"}
    async with _CYCLE_LOCK:
        budget = min(s["per_cycle"], s["daily_email_limit"] - await sent_today("email"))
        emailed = reminded = wa = failed = 0
        picked = await _pick_candidates(s, max(budget, 0), ignore_hours) if budget > 0 else []
        reminders = await _pick_reminders(s, budget - len(picked), ignore_hours)
        if dry_run:
            def _row(p): return {"name": p.get("name"), "vertical": p.get("vertical") or "salon", "city": p.get("city"),
                                 "email": p.get("email"), "score": p.get("score"), "reviews": p.get("reviews"),
                                 "segment": segment_of(p, s["max_reviews"]), "stage": int(p.get("followup_stage") or 0)}
            return {"dry_run": True, "would_email": [_row(p) for p in picked], "would_remind": [_row(p) for p in reminders],
                    "budget_left_today": max(s["daily_email_limit"] - await sent_today("email"), 0)}
        for lead in picked:
            res = await send_pitch(lead)
            if res.get("sent"):
                emailed += 1
                if await _maybe_whatsapp(lead, s):
                    wa += 1
            else:
                failed += 1
            await asyncio.sleep(0.8)
        for lead in reminders:
            if (await send_reminder(lead)).get("sent"):
                reminded += 1
            else:
                failed += 1
            await asyncio.sleep(0.8)
        hunt = await _auto_hunt_if_thin(s) if s["auto_hunt"] else None
        if emailed or wa or reminded:
            await log_mira_event("outreach", f"📨 Autopilot: emailed {emailed} new lead{'s' if emailed != 1 else ''}"
                                             f"{f' · {reminded} reminder(s)' if reminded else ''}{f' · {wa} WhatsApp intro(s)' if wa else ''}"
                                             f" — {await sent_today('email')}/{s['daily_email_limit']} today")
        return {"emailed": emailed, "reminders": reminded, "whatsapp": wa, "failed": failed, "hunt": hunt,
                "sent_today": await sent_today("email"), "limit": s["daily_email_limit"]}


async def _auto_hunt_if_thin(s: dict) -> dict | None:
    """Mira picks her own next city (rotating the world list, alternating verticals) when few emails remain to send."""
    from routes.lead_gen import _run_pipeline, fail_stale_runs
    await fail_stale_runs()
    if await _raw_db.mira_lead_runs.find_one({"status": "running"}):
        return None
    if await _raw_db.mira_lead_runs.count_documents({"auto_outreach": True, "created_at": {"$gte": _today()}}) >= s["hunts_per_day"]:
        return None
    ready = sum([await _raw_db.mira_leads.count_documents(_candidate_query(v, s)) for v in s["verticals"]])
    thin = any(await _raw_db.mira_leads.count_documents(_candidate_query(v, s)) < s["daily_email_limit"] // 2 for v in s["verticals"])
    if ready >= s["daily_email_limit"] and not thin:
        return None
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    recent = {r.get("city") async for r in _raw_db.mira_lead_runs.find({"created_at": {"$gte": since}}, {"city": 1})}
    cities = [c for c in _WORLD_CITIES if _country_of(c) in s["hunt_countries"] and c not in recent] or \
             [c for c in _WORLD_CITIES if _country_of(c) in s["hunt_countries"]]
    if not cities:
        return None
    n_prev = await _raw_db.mira_lead_runs.count_documents({"auto_outreach": True})
    city = cities[n_prev % len(cities)]
    # Keep BOTH verticals fed: hunt whichever has the thinner ready-to-send pool (restaurants were starving).
    pools = {v: await _raw_db.mira_leads.count_documents(_candidate_query(v, s)) for v in s["verticals"]}
    vertical = min(pools, key=pools.get) if pools else "salon"
    run = {"id": str(uuid.uuid4()), "city": city, "target": 10, "vertical": vertical, "status": "running",
           "stage": "starting", "found": 0, "researched": 0, "auto_outreach": True, "log": [], "created_at": _now()}
    await _raw_db.mira_lead_runs.insert_one({**run})
    await log_mira_event("search", f"🌍 Autopilot: Mira picked {city} on her own and is hunting {vertical}s there.")
    asyncio.create_task(_run_pipeline(run["id"], city, 10, vertical))
    return {"city": city, "vertical": vertical}


# conversion alerts live in services/hq_conversion.py (leaf module); re-exported for callers of this router
from services.hq_conversion import notify_hq_conversion, notify_hq_conversion_by_email  # noqa: E402,F401

# ---------------- reporting ----------------

async def _day_counts(day: str) -> dict:
    agg = await _raw_db.mira_outreach_log.aggregate([
        {"$match": {"day": day}},
        {"$group": {"_id": {"c": "$channel", "v": "$vertical", "k": {"$ifNull": ["$kind", "pitch"]}}, "n": {"$sum": 1}}}]).to_list(40)
    d = {"emails": 0, "new": 0, "reminders": 0, "salon": 0, "restaurant": 0, "whatsapp": 0, "conversions": 0}
    for r in agg:
        c, v, n = r["_id"]["c"], r["_id"]["v"], r["n"]
        if c == "email":
            d["emails"] += n
            d["reminders" if str(r["_id"]["k"]).startswith("reminder") else "new"] += n
            d["restaurant" if v == "restaurant" else "salon"] += n
        elif c in d:
            d[c] += n
        elif c == "conversion":
            d["conversions"] += n
    d["replies"] = await _raw_db.mira_leads.count_documents({"$or": [{"replied_at": {"$gte": day, "$lt": day + "T99"}},
                                                                     {"wa_intro_replied_at": {"$gte": day, "$lt": day + "T99"}}]})
    return d


async def outreach_summary() -> dict:
    s = await get_settings()
    today, yday = _today(), (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    t, y = await _day_counts(today), await _day_counts(yday)
    total_emails = await _raw_db.mira_outreach_log.count_documents({"channel": "email"})
    total_wa = await _raw_db.mira_outreach_log.count_documents({"channel": "whatsapp"})
    total_conv = await _raw_db.mira_outreach_log.count_documents({"channel": "conversion"})
    total_replies = await _raw_db.mira_leads.count_documents({"$or": [{"replied_at": {"$exists": True}}, {"wa_intro_replied_at": {"$exists": True}}]})
    ready = sum([await _raw_db.mira_leads.count_documents(_candidate_query(v, s)) for v in s["verticals"]])
    hunts_today = await _raw_db.mira_lead_runs.count_documents({"auto_outreach": True, "created_at": {"$gte": today}})
    return {"settings": s, "today": t, "yesterday": y, "ready_to_send": ready, "hunts_today": hunts_today,
            "totals": {"emails": total_emails, "whatsapp": total_wa, "replies": total_replies, "conversions": total_conv},
            "greeting": _greeting(s, t, y, total_emails, total_replies, total_conv, ready)}


def _greeting(s: dict, t: dict, y: dict, total_emails: int, total_replies: int, total_conv: int, ready: int) -> str:
    parts = []
    if t["emails"]:
        parts.append(f"Today I've emailed {t['new']} new lead{'s' if t['new'] != 1 else ''} "
                     f"({t['salon']} salon{'s' if t['salon'] != 1 else ''} · {t['restaurant']} restaurant{'s' if t['restaurant'] != 1 else ''})"
                     + (f" and sent {t['reminders']} reminder{'s' if t['reminders'] != 1 else ''} to earlier leads" if t.get("reminders") else ""))
    elif s["enabled"]:
        parts.append(f"No emails out yet today — the next batch goes at 9 AM in each lead's local time ({ready} ready to send)")
    else:
        parts.append(f"Outreach Autopilot is OFF — say “start outreach” and I'll email hot salon and restaurant leads myself, "
                     f"up to {s['daily_email_limit']} a day ({ready} ready to send)")
    if t["whatsapp"]:
        parts.append(f"{t['whatsapp']} WhatsApp intro{'s' if t['whatsapp'] != 1 else ''}")
    if t["replies"]:
        parts.append(f"{t['replies']} replied today 🔥")
    if t["conversions"]:
        parts.append(f"{t['conversions']} converted — HQ inbox has the demo-invite alert")
    line = "; ".join(parts) + "."
    if t["emails"] and not s["enabled"]:
        line += " Autopilot is paused now."
    if y["emails"]:
        line += f" Yesterday: {y['emails']} emails."
    line += f" All-time: {total_emails:,} emails, {total_replies} replies, {total_conv} conversions."
    return line


@router.get("/super-admin/mira/outreach/summary")
async def get_summary(user=Depends(require_super_admin)):
    return await outreach_summary()


@router.get("/super-admin/mira/outreach/history")
async def get_history(days: int = 30, user=Depends(require_super_admin)):
    days = max(1, min(days, 90))
    since = (datetime.now(timezone.utc).date() - timedelta(days=days - 1)).isoformat()
    agg = await _raw_db.mira_outreach_log.aggregate([
        {"$match": {"day": {"$gte": since}}},
        {"$group": {"_id": {"d": "$day", "c": "$channel", "v": "$vertical"}, "n": {"$sum": 1}}}]).to_list(2000)
    by_day: dict = {}
    for r in agg:
        d = by_day.setdefault(r["_id"]["d"], {"day": r["_id"]["d"], "emails": 0, "salon": 0, "restaurant": 0, "whatsapp": 0, "conversions": 0})
        c, v, n = r["_id"]["c"], r["_id"]["v"], r["n"]
        if c == "email":
            d["emails"] += n
            d["restaurant" if v == "restaurant" else "salon"] += n
        elif c == "whatsapp":
            d["whatsapp"] += n
        elif c == "conversion":
            d["conversions"] += n
    items = await _raw_db.mira_outreach_log.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"days": sorted(by_day.values(), key=lambda x: x["day"], reverse=True), "items": items}


class OutreachSettingsIn(BaseModel):
    """Partial update — any field omitted keeps its current value."""
    enabled: Optional[bool] = None
    daily_email_limit: Optional[int] = Field(None, ge=1, le=1000)
    per_cycle: Optional[int] = Field(None, ge=1, le=50)
    min_score: Optional[int] = Field(None, ge=0, le=100)
    verticals: Optional[list[str]] = None
    wa_countries: Optional[list[str]] = None
    auto_hunt: Optional[bool] = None
    hunts_per_day: Optional[int] = Field(None, ge=0, le=10)
    hunt_countries: Optional[list[str]] = None
    max_reviews: Optional[int] = Field(None, ge=10, le=5000)
    include_luxury: Optional[bool] = None
    followup_days: Optional[list[int]] = None


@router.put("/super-admin/mira/outreach/settings")
async def put_settings(body: OutreachSettingsIn, user=Depends(require_super_admin)):
    cur = await get_settings()
    merged = {**cur, **{k: v for k, v in body.model_dump().items() if v is not None}}
    verts = [v for v in merged["verticals"] if v in ("salon", "restaurant")] or ["salon", "restaurant"]
    wa = [re.sub(r"\D", "", c) for c in merged["wa_countries"] if re.sub(r"\D", "", c)]
    hunt = [c.upper() for c in merged["hunt_countries"] if c.upper() in _COUNTRIES] or _DEFAULTS["hunt_countries"]
    fdays = [max(1, min(int(d), 365)) for d in (merged.get("followup_days") or [])][:6] or _DEFAULTS["followup_days"]
    doc = {**merged, "verticals": verts, "wa_countries": wa, "hunt_countries": hunt, "followup_days": fdays, "updated_at": _now(),
           "updated_by": user.get("email")}
    await _raw_db.platform_settings.update_one({"key": SETTINGS_KEY}, {"$set": doc}, upsert=True)
    await log_mira_event("settings", f"Boss {'switched ON' if doc['enabled'] else 'paused'} Outreach Autopilot — {doc['daily_email_limit']} emails/day, "
                                     f"{' + '.join(verts)}, WhatsApp for +{', +'.join(wa) or '—'}.")
    return {"ok": True, **await get_settings()}


@router.post("/super-admin/mira/outreach/run-now")
async def run_now(dry_run: bool = False, user=Depends(require_super_admin)):
    out = await run_outreach_cycle(force=True, dry_run=dry_run, ignore_hours=True)
    if out.get("skipped"):
        raise HTTPException(409, out["skipped"])
    return out


@router.get("/super-admin/mira/outreach/countries")
async def list_countries(user=Depends(require_super_admin)):
    return {"countries": [{"iso": k, "dial": v[0]} for k, v in _COUNTRIES.items()], "cities": _WORLD_CITIES}


# ---------------- Reply Inbox: Mira drafts the demo invite, Boss sends in one tap ----------------

_REPLY_FIELDS = {"_id": 0, "id": 1, "name": 1, "owner_name": 1, "email": 1, "phone": 1, "city": 1, "status": 1, "vertical": 1,
                 "replied_at": 1, "last_reply_at": 1, "reply_subject": 1, "last_reply_text": 1,
                 "wa_intro_replied_at": 1, "wa_intro_reply": 1, "demo_draft": 1, "demo_invite_sent_at": 1, "meeting": 1}


@router.get("/super-admin/mira/replies")
async def mira_replies(user=Depends(require_super_admin)):
    """Every lead that wrote back by email OR WhatsApp, newest first, with their message + Mira's cached draft."""
    rows = await _raw_db.mira_leads.find(
        {"$or": [{"replied_at": {"$exists": True}}, {"wa_intro_replied_at": {"$exists": True}}]}, _REPLY_FIELDS).to_list(300)
    for r in rows:
        r["channel"] = "email" if r.get("replied_at") else "whatsapp"
        r["reply_text"] = r.get("last_reply_text") or r.get("wa_intro_reply") or ""
        r["replied_at"] = r.get("last_reply_at") or r.get("replied_at") or r.get("wa_intro_replied_at")
    rows.sort(key=lambda r: r.get("replied_at") or "", reverse=True)
    return {"count": len(rows), "awaiting": sum(1 for r in rows if not r.get("demo_invite_sent_at") and r.get("status") not in ("demo", "customer")), "replies": rows}


def _demo_url() -> str:
    return f"{os.environ.get('APP_PUBLIC_URL', 'https://miracurl-suite.com')}/demo"


async def draft_demo_reply(lead: dict) -> dict:
    from routes.mira_common import _ask_json
    vert = "restaurant" if (lead.get("vertical") or "salon") == "restaurant" else "salon"
    reply = (lead.get("last_reply_text") or lead.get("wa_intro_reply") or "").strip()[:1500]
    first = (lead.get("owner_name") or lead.get("name") or "there").split()[0].title()
    out = await _ask_json(
        f"You are Mira, the warm and sharp sales assistant of Miracurl Suite — SaaS for {vert}s (bookings/QR ordering, POS billing, "
        "staff, WhatsApp marketing, AI receptionist). A prospect replied to our outreach. Write a SHORT personal reply email "
        "(max 120 words, 3 short paragraphs, plain text with \\n between paragraphs) that: 1) thanks them and answers or "
        "acknowledges what they said, 2) invites them to a free 20-minute live demo and asks them to pick a slot at the demo link "
        f"{_demo_url()} (mention the link once), 3) signs off as 'Mira & the Miracurl team'. Match their language (English/Hindi/Hinglish). "
        'Never invent prices. Return JSON: {"subject": "<Re: subject, max 70 chars>", "body": "<email body>"}',
        f"Business: {lead.get('name')} ({vert}, {lead.get('city')}). Contact first name: {first}.\n"
        f"Their reply subject: {lead.get('reply_subject') or '—'}\nTheir reply:\n{reply or '(no text captured — they replied on WhatsApp)'}")
    draft = {"subject": (out.get("subject") or f"Re: Miracurl Suite demo for {lead.get('name') or 'you'}")[:120],
             "body": (out.get("body") or "").strip()[:2500], "drafted_at": _now()}
    await _raw_db.mira_leads.update_one({"id": lead["id"]}, {"$set": {"demo_draft": draft}})
    return draft


@router.post("/super-admin/mira-leads/{lid}/draft-demo-reply")
async def draft_demo_reply_ep(lid: str, user=Depends(require_super_admin)):
    lead = await _raw_db.mira_leads.find_one({"id": lid}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    return await draft_demo_reply(lead)


class DemoReplyIn(BaseModel):
    subject: str = Field(..., min_length=2, max_length=160)
    body: str = Field(..., min_length=10, max_length=4000)


@router.post("/super-admin/mira-leads/{lid}/send-demo-reply")
async def send_demo_reply(lid: str, body: DemoReplyIn, user=Depends(require_super_admin)):
    from email_service import _send_email, marketing_email_html
    lead = await _raw_db.mira_leads.find_one({"id": lid}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    if not lead.get("email"):
        raise HTTPException(400, "No email on this lead — reply on WhatsApp instead")
    html = marketing_email_html("Miracurl Suite", body.body, _demo_url(), "Pick my demo slot ✦")
    res = await _send_email([lead["email"]], body.subject, html, reply_to=_lead_reply_to(), from_name="Mira at Miracurl",
                            book_url=_demo_url(), book_label="Book a demo ✦")
    if not res.get("sent"):
        raise HTTPException(502, f"Send failed: {res.get('error')}")
    sets = {"demo_invite_sent_at": _now(), "demo_invite_by": user.get("email"), "demo_draft": None}
    if lead.get("status") not in ("demo", "customer"):
        sets["status"] = "demo"
    await _raw_db.mira_leads.update_one({"id": lid}, {"$set": sets})
    await _raw_db.mira_outreach_log.insert_one({
        "id": str(uuid.uuid4()), "day": _today(), "created_at": _now(), "channel": "demo_invite", "lead_id": lid,
        "name": lead.get("name") or "", "vertical": lead.get("vertical") or "salon", "city": lead.get("city") or "",
        "country": _country_of(lead.get("city")), "email": lead["email"], "detail": body.subject[:160]})
    await log_mira_event("result", f"📅 Demo invite sent to {lead.get('name') or lead['email']} — Boss approved Mira's reply.")
    return {"ok": True, "sent_to": lead["email"]}
