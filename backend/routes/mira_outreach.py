"""Mira Outreach Autopilot — HQ-side: Mira hunts leads worldwide, emails hot salon/restaurant leads
(separate templates per vertical), WhatsApps them where the country is allowed, keeps a daily history
and emails HQ the moment a lead converts (reply / demo request / signup)."""
import asyncio
import html as _html
import logging
import os
import re
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import _raw_db
from security import require_super_admin
from routes.lead_common import (_live_plans, _outreach_email_html, _lead_reply_to, _lead_headers, log_mira_event)
from routes.lead_wa_auto import HOT_QUERY, _wa_phone, send_intro, template_status

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
_DEFAULTS = {"enabled": False, "daily_email_limit": 100, "per_cycle": 10, "min_score": 50,
             "verticals": ["salon", "restaurant"], "wa_countries": ["91"], "auto_hunt": True, "hunts_per_day": 2,
             "hunt_countries": ["IN", "AE", "UK", "US", "SG", "AU", "CA"], "start_hour": 9, "end_hour": 18}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _country_of(city: str) -> str:
    m = re.search(r",\s*([A-Za-z]{2,3})$", (city or "").strip())
    return m.group(1).upper() if m else "IN"


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


async def _log_send(lead: dict, channel: str, detail: str = "") -> None:
    await _raw_db.mira_outreach_log.insert_one({
        "id": str(uuid.uuid4()), "day": _today(), "created_at": _now(), "channel": channel,
        "lead_id": lead["id"], "name": lead.get("name") or "", "vertical": lead.get("vertical") or "salon",
        "city": lead.get("city") or "", "country": _country_of(lead.get("city")),
        "email": lead.get("email") or "", "phone": lead.get("phone") or "",
        "hot": bool((lead.get("reviews") or 0) >= 500 and not lead.get("website")),
        "score": lead.get("score") or 0, "detail": detail[:160]})


def _candidate_query(vertical: str, min_score: int) -> dict:
    return {"status": {"$in": ["drafted", "researched"]}, "email": {"$nin": ["", None]},
            "unsubscribed": {"$ne": True}, "vertical": vertical if vertical == "restaurant" else {"$in": ["salon", None, ""]},
            "$or": [{"score": {"$gte": min_score}}, HOT_QUERY]}


async def _pick_candidates(s: dict, budget: int, ignore_hours: bool) -> list:
    """Round-robin salon / restaurant so both verticals get their share; hottest first; local business hours."""
    from routes.lead_gen import _has_real_inbox
    pools = []
    for v in s["verticals"]:
        rows = await _raw_db.mira_leads.find(_candidate_query(v, s["min_score"]), {"_id": 0}).sort(
            [("reviews", -1), ("score", -1)]).to_list(120)
        rows = [r for r in rows if _has_real_inbox(r.get("email"))
                and (ignore_hours or s["start_hour"] <= _local_hour(r.get("city")) < s["end_hour"])]
        pools.append(rows)
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
        emailed = wa = failed = 0
        picked = await _pick_candidates(s, max(budget, 0), ignore_hours) if budget > 0 else []
        if dry_run:
            return {"dry_run": True, "would_email": [{"name": p.get("name"), "vertical": p.get("vertical") or "salon",
                                                      "city": p.get("city"), "email": p.get("email"), "score": p.get("score")} for p in picked],
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
        hunt = await _auto_hunt_if_thin(s) if s["auto_hunt"] else None
        if emailed or wa:
            await log_mira_event("outreach", f"📨 Autopilot: emailed {emailed} hot lead{'s' if emailed != 1 else ''}"
                                             f"{f' · {wa} WhatsApp intro(s)' if wa else ''} — {await sent_today('email')}/{s['daily_email_limit']} today")
        return {"emailed": emailed, "whatsapp": wa, "failed": failed, "hunt": hunt,
                "sent_today": await sent_today("email"), "limit": s["daily_email_limit"]}


async def _auto_hunt_if_thin(s: dict) -> dict | None:
    """Mira picks her own next city (rotating the world list, alternating verticals) when few emails remain to send."""
    from routes.lead_gen import _run_pipeline, fail_stale_runs
    await fail_stale_runs()
    if await _raw_db.mira_lead_runs.find_one({"status": "running"}):
        return None
    if await _raw_db.mira_lead_runs.count_documents({"auto_outreach": True, "created_at": {"$gte": _today()}}) >= s["hunts_per_day"]:
        return None
    ready = sum([await _raw_db.mira_leads.count_documents(_candidate_query(v, s["min_score"])) for v in s["verticals"]])
    if ready >= s["daily_email_limit"]:
        return None
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    recent = {r.get("city") async for r in _raw_db.mira_lead_runs.find({"created_at": {"$gte": since}}, {"city": 1})}
    cities = [c for c in _WORLD_CITIES if _country_of(c) in s["hunt_countries"] and c not in recent] or \
             [c for c in _WORLD_CITIES if _country_of(c) in s["hunt_countries"]]
    if not cities:
        return None
    n_prev = await _raw_db.mira_lead_runs.count_documents({"auto_outreach": True})
    city, vertical = cities[n_prev % len(cities)], s["verticals"][n_prev % len(s["verticals"])]
    run = {"id": str(uuid.uuid4()), "city": city, "target": 10, "vertical": vertical, "status": "running",
           "stage": "starting", "found": 0, "researched": 0, "auto_outreach": True, "log": [], "created_at": _now()}
    await _raw_db.mira_lead_runs.insert_one({**run})
    await log_mira_event("search", f"🌍 Autopilot: Mira picked {city} on her own and is hunting {vertical}s there.")
    asyncio.create_task(_run_pipeline(run["id"], city, 10, vertical))
    return {"city": city, "vertical": vertical}


# ---------------- conversion alerts → HQ ----------------

async def notify_hq_conversion(lead: dict, kind: str, snippet: str = "") -> bool:
    """Email admin@ the moment a lead we reached out to replies / books a demo / signs up (once per kind)."""
    from email_service import _send_email, hq_notify_emails
    if kind in (lead.get("conversion_alerts") or []):
        return False
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    vert = "Restaurant" if (lead.get("vertical") or "salon") == "restaurant" else "Salon"
    label = {"replied": "replied to Mira's email", "wa_replied": "replied on WhatsApp",
             "demo": "requested a live demo", "signup": "signed up for a free trial"}.get(kind, kind)
    rows = "".join(f'<tr><td style="padding:6px 10px;color:#777;font-size:12px">{k}</td><td style="padding:6px 10px;font-size:13px"><b>{_html.escape(str(v))}</b></td></tr>'
                   for k, v in (("Business", lead.get("name")), ("Type", vert), ("City", lead.get("city")),
                                ("Email", lead.get("email")), ("Phone", lead.get("phone") or "—"),
                                ("Score", f"{lead.get('score') or 0}/100 · {lead.get('reviews') or 0} reviews")) if v)
    html = f"""
      <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #e6ddc8;border-radius:16px;overflow:hidden">
        <div style="background:#1c1c22;padding:22px 26px"><div style="color:#e8c37f;font-size:18px;font-weight:bold">🔥 Hot lead converted — {vert}</div>
          <div style="color:#8a8a92;font-size:11px;letter-spacing:2px;margin-top:4px">MIRA OUTREACH AUTOPILOT</div></div>
        <div style="padding:22px 26px;font-family:Arial,sans-serif;color:#333;font-size:14px;line-height:1.6">
          <p>Boss, <b>{_html.escape(lead.get('name') or 'a lead')}</b> just <b>{label}</b>. Time to send the demo invite ✦</p>
          <table style="border-collapse:collapse;width:100%;background:#fff;border:1px solid #eee;border-radius:10px">{rows}</table>
          {f'<p style="background:#f7f2e7;padding:12px 14px;border-radius:10px;font-size:13px;color:#555;margin-top:14px"><i>“{_html.escape(snippet[:400])}”</i></p>' if snippet else ''}
          <p style="text-align:center;margin:22px 0 4px"><a href="{base}/super-admin?tab=mira-leads" style="background:#1c1c22;color:#e8c37f;text-decoration:none;padding:12px 30px;border-radius:999px;font-weight:bold">Open Lead Agent → send demo invite</a></p>
        </div></div>"""
    res = await _send_email(hq_notify_emails("admin"), f"🔥 {lead.get('name') or 'Lead'} {label} — send the demo invite",
                            html, from_name="Mira at Miracurl", suite_label="HQ alert")
    await _raw_db.mira_leads.update_one({"id": lead["id"]}, {"$addToSet": {"conversion_alerts": kind},
                                                             "$set": {"conversion_alerted_at": _now()}})
    await _raw_db.mira_outreach_log.insert_one({
        "id": str(uuid.uuid4()), "day": _today(), "created_at": _now(), "channel": "conversion", "kind": kind,
        "lead_id": lead["id"], "name": lead.get("name") or "", "vertical": lead.get("vertical") or "salon",
        "city": lead.get("city") or "", "country": _country_of(lead.get("city")), "email": lead.get("email") or "",
        "detail": snippet[:160], "hq_emailed": bool(res.get("sent"))})
    await log_mira_event("alert", f"🔥 {lead.get('name') or 'A lead'} {label} — I emailed HQ so you can send the demo invite.")
    return bool(res.get("sent"))


async def notify_hq_conversion_by_email(email: str, kind: str, snippet: str = "") -> bool:
    em = (email or "").strip().lower()
    if not em:
        return False
    lead = await _raw_db.mira_leads.find_one({"$or": [{"email": em}, {"all_emails": em}]}, {"_id": 0})
    return await notify_hq_conversion(lead, kind, snippet) if lead else False


# ---------------- reporting ----------------

async def _day_counts(day: str) -> dict:
    agg = await _raw_db.mira_outreach_log.aggregate([
        {"$match": {"day": day}},
        {"$group": {"_id": {"c": "$channel", "v": "$vertical"}, "n": {"$sum": 1}}}]).to_list(20)
    d = {"emails": 0, "salon": 0, "restaurant": 0, "whatsapp": 0, "conversions": 0}
    for r in agg:
        c, v, n = r["_id"]["c"], r["_id"]["v"], r["n"]
        if c == "email":
            d["emails"] += n
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
    ready = sum([await _raw_db.mira_leads.count_documents(_candidate_query(v, s["min_score"])) for v in s["verticals"]])
    hunts_today = await _raw_db.mira_lead_runs.count_documents({"auto_outreach": True, "created_at": {"$gte": today}})
    return {"settings": s, "today": t, "yesterday": y, "ready_to_send": ready, "hunts_today": hunts_today,
            "totals": {"emails": total_emails, "whatsapp": total_wa, "replies": total_replies, "conversions": total_conv},
            "greeting": _greeting(s, t, y, total_emails, total_replies, total_conv, ready)}


def _greeting(s: dict, t: dict, y: dict, total_emails: int, total_replies: int, total_conv: int, ready: int) -> str:
    parts = []
    if t["emails"]:
        parts.append(f"Today I've emailed {t['emails']} hot lead{'s' if t['emails'] != 1 else ''} "
                     f"({t['salon']} salon{'s' if t['salon'] != 1 else ''} · {t['restaurant']} restaurant{'s' if t['restaurant'] != 1 else ''})")
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
    enabled: bool
    daily_email_limit: int = Field(100, ge=1, le=1000)
    per_cycle: int = Field(10, ge=1, le=50)
    min_score: int = Field(50, ge=0, le=100)
    verticals: list[str] = Field(default_factory=lambda: ["salon", "restaurant"])
    wa_countries: list[str] = Field(default_factory=lambda: ["91"])
    auto_hunt: bool = True
    hunts_per_day: int = Field(2, ge=0, le=10)
    hunt_countries: list[str] = Field(default_factory=lambda: ["IN", "AE", "UK", "US", "SG", "AU", "CA"])


@router.put("/super-admin/mira/outreach/settings")
async def put_settings(body: OutreachSettingsIn, user=Depends(require_super_admin)):
    verts = [v for v in body.verticals if v in ("salon", "restaurant")] or ["salon", "restaurant"]
    wa = [re.sub(r"\D", "", c) for c in body.wa_countries if re.sub(r"\D", "", c)]
    hunt = [c.upper() for c in body.hunt_countries if c.upper() in _COUNTRIES] or _DEFAULTS["hunt_countries"]
    doc = {**body.model_dump(), "verticals": verts, "wa_countries": wa, "hunt_countries": hunt, "updated_at": _now(),
           "updated_by": user.get("email")}
    await _raw_db.platform_settings.update_one({"key": SETTINGS_KEY}, {"$set": doc}, upsert=True)
    await log_mira_event("settings", f"Boss {'switched ON' if body.enabled else 'paused'} Outreach Autopilot — {body.daily_email_limit} emails/day, "
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
