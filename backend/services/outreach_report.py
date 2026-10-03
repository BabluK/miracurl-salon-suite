"""Daily HQ Outreach Report — one email per vertical (salon / restaurant): how many pitches went out by country & city,
plus every lead's journey (sent → opened → replied → demo picker → demo booked → converted) so the Boss can track each
vertical separately. Sent automatically once a day (after business hours IST) and on demand from the Outreach card."""
import logging
import os
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta

from database import _raw_db
from services.hq_conversion import country_of

log = logging.getLogger("outreach_report")

_COUNTRY_NAMES = {"IN": "India", "US": "USA", "CA": "Canada", "UK": "UK", "GB": "UK", "IE": "Ireland", "AE": "UAE", "SA": "Saudi Arabia",
                  "QA": "Qatar", "BH": "Bahrain", "OM": "Oman", "KW": "Kuwait", "SG": "Singapore", "MY": "Malaysia", "AU": "Australia",
                  "NZ": "New Zealand", "ZA": "South Africa", "KE": "Kenya", "LK": "Sri Lanka", "NP": "Nepal", "BD": "Bangladesh"}


def _esc(v) -> str:
    import html
    return html.escape(str(v or ""))


def _country_name(city: str) -> str:
    return _COUNTRY_NAMES.get(country_of(city), country_of(city) or "India")


def _city_only(city: str) -> str:
    return (city or "").split(",")[0].strip() or "—"


async def build_report(vertical: str, days: int = 1) -> dict:
    """Numbers + lead journey rows for one vertical over the last `days` days (default: today)."""
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    vq = {"vertical": "restaurant"} if vertical == "restaurant" else {"vertical": {"$in": ["salon", None, ""]}}
    sent_rows = await _raw_db.mira_outreach_log.find({"channel": "email", "created_at": {"$gte": since}, **vq},
                                                     {"_id": 0, "city": 1, "country": 1, "kind": 1, "lead_id": 1}).to_list(5000)
    by_country, by_city = Counter(), defaultdict(Counter)
    for r in sent_rows:
        c = _COUNTRY_NAMES.get(r.get("country") or "IN", r.get("country") or "India")
        by_country[c] += 1
        by_city[c][_city_only(r.get("city"))] += 1
    new_sends = sum(1 for r in sent_rows if not str(r.get("kind") or "pitch").startswith("reminder"))
    reminders = len(sent_rows) - new_sends
    # journey of every lead this vertical has ever been emailed (most recent activity first, capped)
    leads = await _raw_db.mira_leads.find(
        {**vq, "$or": [{"sent_at": {"$exists": True}}, {"wa_intro_sent_at": {"$exists": True}}]},
        {"_id": 0, "name": 1, "city": 1, "email": 1, "sent_at": 1, "sent_via": 1, "opened_at": 1, "replied_at": 1, "wa_intro_replied_at": 1,
         "slot_picker_sent_at": 1, "demo_invite_sent_at": 1, "demo_slot": 1, "status": 1, "converted_at": 1, "followup_stage": 1,
         "subject_variant": 1, "auto_replied": 1}).sort("sent_at", -1).to_list(400)
    today_leads = [l for l in leads if (l.get("sent_at") or "") >= since]
    found = await _raw_db.mira_leads.find({**vq, "created_at": {"$gte": since}}, {"_id": 0, "email": 1, "new_business": 1}).to_list(2000)
    found_stats = {"found": len(found), "with_email": sum(1 for f in found if f.get("email")), "newly_opened": sum(1 for f in found if f.get("new_business"))}
    waiting = sum(1 for l in leads if not (l.get("replied_at") or l.get("wa_intro_replied_at")) and l.get("status") == "sent")
    auto_replied = sum(1 for l in leads if l.get("auto_replied"))
    journey = Counter()
    for l in leads:
        journey["sent"] += 1
        journey["opened"] += bool(l.get("opened_at"))
        journey["replied"] += bool(l.get("replied_at") or l.get("wa_intro_replied_at"))
        journey["picker"] += bool(l.get("slot_picker_sent_at") or l.get("demo_invite_sent_at"))
        journey["demo"] += bool(l.get("demo_slot") or l.get("status") in ("demo", "customer"))
        journey["customer"] += bool(l.get("status") == "customer" or l.get("converted_at"))
    boss = await _boss_today(vertical, vq, since, sent_rows)
    return {"vertical": vertical, "since": since, "days": days, "sent_today": len(sent_rows), "new_sends": new_sends, "reminders": reminders,
            "by_country": by_country.most_common(), "by_city": {c: cc.most_common(8) for c, cc in by_city.items()},
            "journey": dict(journey), "leads_today": today_leads, "recent_leads": leads[:60],
            "found_stats": found_stats, "waiting_for_reply": waiting, "auto_replied": auto_replied, **boss}


def _segment_label(vertical: str, lead: dict) -> str:
    if vertical == "restaurant":
        return "Restaurants"
    from routes.lead_common import is_luxury
    return "Luxury Salons" if is_luxury(lead) else "Salons"


async def _boss_today(vertical: str, vq: dict, since: str, sent_rows: list) -> dict:
    """What the Boss wants at a glance: hot-lead pitches by segment × city, demos, meeting invites, WA pitches, replies — this period."""
    ids = [r["lead_id"] for r in sent_rows if r.get("lead_id") and not str(r.get("kind") or "pitch").startswith("reminder")]
    pitched = await _raw_db.mira_leads.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "city": 1, "reviews": 1, "rating": 1,
                                                                   "category": 1, "summary": 1, "score": 1}).to_list(len(ids) or 1) if ids else []
    by_segment, seg_city, hot = Counter(), defaultdict(Counter), 0
    for ld in pitched:
        seg = _segment_label(vertical, ld)
        by_segment[seg] += 1
        seg_city[seg][_city_only(ld.get("city"))] += 1
        hot += int(ld.get("reviews") or 0) >= 500 or int(ld.get("score") or 0) >= 70
    cities = Counter(_city_only(ld.get("city")) for ld in pitched)
    demo_invites = await _raw_db.mira_leads.count_documents({**vq, "demo_invite_sent_at": {"$gte": since}})
    meeting_invites = await _raw_db.mira_leads.count_documents({**vq, "$or": [{"slot_picker_sent_at": {"$gte": since}}, {"meeting_invite_sent_at": {"$gte": since}}]})
    demos_booked = await _raw_db.mira_leads.count_documents({**vq, "demo_booked_at": {"$gte": since}})
    replies = await _raw_db.mira_leads.count_documents({**vq, "$or": [{"replied_at": {"$gte": since}}, {"wa_intro_replied_at": {"$gte": since}}]})
    wa_q = {"created_at": {"$gte": since}} if vertical == "restaurant" else {"created_at": {"$gte": since}}
    wa_ids = [w["lead_id"] for w in await _raw_db.mira_wa_intros.find(wa_q, {"_id": 0, "lead_id": 1}).to_list(2000)]
    wa_pitches = await _raw_db.mira_leads.count_documents({**vq, "id": {"$in": wa_ids}}) if wa_ids else 0
    return {"pitched_today": len(pitched), "hot_today": hot, "by_segment": by_segment.most_common(),
            "segment_cities": {sg: cc.most_common(6) for sg, cc in seg_city.items()}, "top_cities": [c for c, _ in cities.most_common(3)],
            "demo_invites": demo_invites, "meeting_invites": meeting_invites, "demos_booked": demos_booked, "replies": replies, "wa_pitches": wa_pitches}


def boss_subject(rep: dict) -> str:
    """'🍽️ Today Mira sent 20 hot-lead emails to Restaurants in Bangalore' / '💇 … to Luxury Salons / Salons in Bangalore, Mumbai'."""
    icon = "🍽️" if rep["vertical"] == "restaurant" else "💇"
    when = "Today" if int(rep.get("days") or 1) <= 1 else f"Last {rep['days']} days:"
    n = rep.get("pitched_today", 0)
    if not n:
        noun = "restaurants" if rep["vertical"] == "restaurant" else "salons"
        return f"{icon} {when} Mira sent no new pitches to {noun} · found {rep['found_stats']['found']} new · waiting on {rep['waiting_for_reply']}"
    segs = " / ".join(sg for sg, _ in rep["by_segment"]) or ("Restaurants" if rep["vertical"] == "restaurant" else "Salons")
    cities = ", ".join(rep["top_cities"]) or "their cities"
    hot = f" ({rep['hot_today']} hot)" if rep.get("hot_today") and rep["hot_today"] != n else ""
    extra = []
    if rep.get("demo_invites"):
        extra.append(f"{rep['demo_invites']} demo invite{'s' if rep['demo_invites'] != 1 else ''}")
    if rep.get("meeting_invites"):
        extra.append(f"{rep['meeting_invites']} meeting invite{'s' if rep['meeting_invites'] != 1 else ''}")
    if rep.get("replies"):
        extra.append(f"{rep['replies']} repl{'ies' if rep['replies'] != 1 else 'y'}")
    tail = f" · {' · '.join(extra)}" if extra else ""
    return f"{icon} {when} Mira sent {n} hot-lead email{'s' if n != 1 else ''}{hot} to {segs} in {cities}{tail}"


def boss_block(rep: dict) -> str:
    """Boss brief: segment × city pitches + demos / meetings / WA / replies for the period."""
    seg_rows = "".join(
        f"<tr><td style='padding:7px 10px;border-bottom:1px solid #eee'><b>{_esc(sg)}</b>"
        f"<div style='color:#888;font-size:12px'>{_esc(' · '.join(f'{c} {k}' for c, k in rep['segment_cities'].get(sg, [])))}</div></td>"
        f"<td style='padding:7px 10px;border-bottom:1px solid #eee;text-align:right;font-size:18px;font-weight:bold'>{n}</td></tr>"
        for sg, n in rep.get("by_segment", [])) or "<tr><td style='padding:10px;color:#888'>No new pitches in this period.</td></tr>"
    kpi = lambda label, val, color="#1c1c22": (  # noqa: E731
        f"<td style='padding:10px 6px;text-align:center'><div style='font-size:20px;font-weight:bold;color:{color}'>{val}</div>"
        f"<div style='font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px'>{label}</div></td>")
    return f"""
      <div style="background:#1c1c22;color:#f3efe4;border-radius:14px;padding:16px 18px;margin:0 0 16px">
        <div style="font-size:11px;letter-spacing:2px;color:#e8c37f">BOSS BRIEF · {_esc(_period(rep).upper())}</div>
        <div style="font-size:15px;margin-top:4px">{_esc(boss_subject(rep).split(' ', 1)[1])}</div>
        <table style="width:100%;margin-top:10px;border-collapse:collapse"><tr>
          {kpi('Pitched', rep.get('pitched_today', 0), '#e8c37f')}{kpi('Hot leads', rep.get('hot_today', 0), '#fcd34d')}
          {kpi('Demo invites', rep.get('demo_invites', 0), '#c4b5fd')}{kpi('Meeting invites', rep.get('meeting_invites', 0), '#a5b4fc')}
          {kpi('WA pitches', rep.get('wa_pitches', 0), '#6ee7b7')}{kpi('Replies', rep.get('replies', 0), '#fdba74')}{kpi('Demos booked', rep.get('demos_booked', 0), '#86efac')}
        </tr></table>
      </div>
      <h3 style="margin:18px 0 6px;font-size:15px">🎯 Pitched {_period(rep)} by segment & city</h3>
      <table style="border-collapse:collapse;width:100%;background:#fdfbf7;border:1px solid #eee;border-radius:10px">{seg_rows}</table>"""


def _period(rep: dict) -> str:
    d = int(rep.get("days") or 1)
    return "today" if d <= 1 else f"in the last {d} days"


def _check(v) -> str:
    return "<span style='color:#1a9a5b;font-weight:bold'>✓</span>" if v else "<span style='color:#c9c2b4'>–</span>"


def _d(iso) -> str:
    return (iso or "")[:10]


def report_html(rep: dict) -> str:
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    noun = "Restaurants" if rep["vertical"] == "restaurant" else "Salons"
    icon = "🍽️" if rep["vertical"] == "restaurant" else "💇"
    j = rep["journey"]
    loc_rows = "".join(
        f"<tr><td style='padding:7px 10px;border-bottom:1px solid #eee'><b>{_esc(c)}</b>"
        f"<div style='color:#888;font-size:12px'>{_esc(' · '.join(f'{city} {n}' for city, n in rep['by_city'].get(c, [])))}</div></td>"
        f"<td style='padding:7px 10px;border-bottom:1px solid #eee;text-align:right;font-size:18px;font-weight:bold'>{n}</td></tr>"
        for c, n in rep["by_country"]) or "<tr><td style='padding:10px;color:#888'>No pitches went out in this period.</td></tr>"
    lead_rows = "".join(
        f"<tr><td style='padding:6px 8px;border-bottom:1px solid #f0ece2'><b>{_esc(l.get('name'))}</b>"
        f"<div style='color:#888;font-size:11px'>{_esc(l.get('city'))} · {_esc(l.get('email') or l.get('sent_via') or '')} · sent {_d(l.get('sent_at'))}"
        f"{' · ' + _esc(l['subject_variant']) if l.get('subject_variant') else ''}</div></td>"
        f"<td style='text-align:center'>{_check(l.get('opened_at'))}</td>"
        f"<td style='text-align:center'>{_check(l.get('replied_at') or l.get('wa_intro_replied_at'))}</td>"
        f"<td style='text-align:center'>{_check(l.get('slot_picker_sent_at') or l.get('demo_invite_sent_at'))}</td>"
        f"<td style='text-align:center'>{_check(l.get('demo_slot') or l.get('status') in ('demo', 'customer'))}</td>"
        f"<td style='text-align:center'>{_check(l.get('status') == 'customer' or l.get('converted_at'))}</td></tr>"
        for l in rep["recent_leads"]) or "<tr><td style='padding:10px;color:#888' colspan='6'>No leads emailed yet.</td></tr>"
    stat = lambda label, val, color="#1c1c22": (  # noqa: E731
        f"<td style='padding:10px 8px;text-align:center'><div style='font-size:22px;font-weight:bold;color:{color}'>{val}</div>"
        f"<div style='font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px'>{label}</div></td>")
    return f"""
    <div style="font-family:Georgia,serif;max-width:640px;margin:0 auto;color:#1c1c22">
      <div style="font-size:13px;letter-spacing:2px;color:#b08d3f">MIRACURL ✦ HQ</div>
      <h2 style="margin:6px 0 2px">{icon} Outreach report — {noun}</h2>
      <p style="color:#666;margin:0 0 16px;font-size:14px">{rep['sent_today']} email{'s' if rep['sent_today'] != 1 else ''} {_period(rep)}
        ({rep['new_sends']} new pitch{'es' if rep['new_sends'] != 1 else ''} · {rep['reminders']} reminder{'s' if rep['reminders'] != 1 else ''}).
        <b>{rep['waiting_for_reply']}</b> lead{'s' if rep['waiting_for_reply'] != 1 else ''} Mira is waiting to hear back from · {rep['auto_replied']} answered by Mira herself.</p>
      {boss_block(rep)}
      <p style="color:#666;margin:-8px 0 16px;font-size:13px">🔎 Found {_period(rep)}: <b>{rep['found_stats']['found']}</b> new {noun.lower()} ({rep['found_stats']['with_email']} with email · {rep['found_stats']['newly_opened']} newly opened).</p>
      <h3 style="margin:18px 0 6px;font-size:15px">📍 Sent {_period(rep)} by location</h3>
      <table style="border-collapse:collapse;width:100%;background:#fdfbf7;border:1px solid #eee;border-radius:10px">{loc_rows}</table>
      <h3 style="margin:22px 0 6px;font-size:15px">🧭 Journey so far (all {noun.lower()} ever emailed)</h3>
      <table style="width:100%;background:#fdfbf7;border:1px solid #eee;border-radius:10px"><tr>
        {stat('Sent', j.get('sent', 0))}{stat('Seen', j.get('opened', 0), '#0369a1')}{stat('Replied', j.get('replied', 0), '#c2410c')}
        {stat('Demo picker', j.get('picker', 0), '#6d28d9')}{stat('Demo booked', j.get('demo', 0), '#7c3aed')}{stat('Converted', j.get('customer', 0), '#15803d')}
      </tr></table>
      <h3 style="margin:22px 0 6px;font-size:15px">📋 Lead history (latest {len(rep['recent_leads'])})</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <tr style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px"><th style='text-align:left;padding:4px 8px'>Lead</th>
          <th>Seen</th><th>Replied</th><th>Picker</th><th>Demo</th><th>Won</th></tr>{lead_rows}</table>
      <p style="margin-top:22px"><a href="{base}/super-admin" style="background:#1c1c22;color:#e8c37f;padding:11px 22px;border-radius:99px;text-decoration:none;font-weight:bold">Open Mira Lead Agent →</a></p>
      <p style="color:#999;font-size:11px;margin-top:14px">Seen = opened the email (tracking pixel; mail scanners can trigger it). Picker = demo time-picker / demo invite sent. Reports arrive daily per vertical.</p>
    </div>"""


async def _super_admin_emails() -> list[str]:
    from email_service import _is_login_only
    rows = await _raw_db.users.find({"role": "super_admin", "active": {"$ne": False}}, {"_id": 0, "email": 1}).to_list(10)
    return [r["email"] for r in rows if r.get("email") and not _is_login_only(r["email"])]


async def send_vertical_report(vertical: str, days: int = 1, to: list | None = None) -> dict:
    from email_service import _send_email, hq_notify_emails
    rep = await build_report(vertical, days)
    subject = boss_subject(rep)
    recipients = to or list(dict.fromkeys(hq_notify_emails("admin") + hq_notify_emails("sales") + await _super_admin_emails()))
    res = await _send_email(recipients, subject, report_html(rep), from_name="Mira at Miracurl")
    await _raw_db.platform_settings.update_one({"key": "mira_outreach_report"},
                                               {"$set": {f"last_sent.{vertical}": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return {"vertical": vertical, "sent": bool(res.get("sent")), "error": res.get("error"), "subject": subject, "emails_today": rep["sent_today"]}


async def send_daily_reports(force: bool = False) -> list:
    """Both vertical reports, once per IST day after 19:00 IST (or immediately when forced)."""
    ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    doc = await _raw_db.platform_settings.find_one({"key": "mira_outreach_report"}, {"_id": 0}) or {}
    out = []
    for v in ("salon", "restaurant"):
        last = (doc.get("last_sent") or {}).get(v, "")
        last_ist = (datetime.fromisoformat(last) + timedelta(hours=5, minutes=30)).date().isoformat() if last else ""
        if force or (ist.hour >= 19 and last_ist != ist.date().isoformat()):
            try:
                out.append(await send_vertical_report(v))
            except Exception as e:  # noqa: BLE001
                log.exception("outreach report failed for %s", v)
                out.append({"vertical": v, "sent": False, "error": str(e)[:160]})
    return out
