"""Mira Lead Generation Agent — AI web research pipeline for finding & pitching salons.
Lead Finder (Google Places when key enabled, else AI research) -> Research -> Email Finder
-> Qualification -> Outreach -> Super-admin approval -> Send.
"""
import os
import re
import uuid
import asyncio
import base64
import logging
from datetime import datetime, timezone, timedelta

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from database import _raw_db
from security import require_super_admin
from services.pdf import screens_tour_attachment

router = APIRouter()
log = logging.getLogger("mira_leads")

_UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"}
_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_SKIP_EMAIL = ("example.", "sentry.", "wixpress", "@2x", ".png", ".jpg", "@sentry", "no-reply@", "noreply@")
FUNNEL_TARGETS = {"target_leads": 300, "qualified": 100, "emails_sent": 50, "demos": 10, "customers": 5}


async def _places_search(client: httpx.AsyncClient, city: str, n: int) -> tuple:
    """Real salon data from Google Places API (New). Returns (places, note)."""
    key = os.environ.get("GOOGLE_MAPS_API_KEY", "")
    if not key:
        return [], "no_key"
    try:
        r = await client.post(
            "https://places.googleapis.com/v1/places:searchText",
            headers={"Content-Type": "application/json", "X-Goog-Api-Key": key,
                     "X-Goog-FieldMask": ("places.displayName,places.rating,places.userRatingCount,"
                                          "places.websiteUri,places.nationalPhoneNumber,places.formattedAddress")},
            json={"textQuery": f"beauty salons in {city}", "pageSize": min(n, 20)}, timeout=20)
        data = r.json()
        if "places" not in data:
            log.warning("places api unavailable: %s", str(data)[:200])
            return [], (data.get("error") or {}).get("message", "no results")[:90]
        return [{"name": p.get("displayName", {}).get("text", ""), "rating": p.get("rating"),
                 "reviews": p.get("userRatingCount"), "website": p.get("websiteUri", ""),
                 "phone": p.get("nationalPhoneNumber", ""), "address": p.get("formattedAddress", "")}
                for p in data["places"]], ""
    except Exception as e:
        log.warning("places search failed: %s", e)
        return [], str(e)[:90]


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _fetch_page(client: httpx.AsyncClient, url: str) -> str:
    try:
        r = await client.get(url, headers=_UA, timeout=12, follow_redirects=True)
        if r.status_code >= 400:
            return ""
        return r.text[:150000]
    except Exception:
        return ""


async def _fetch_site(client: httpx.AsyncClient, website: str) -> str:
    """Try the given domain plus www/https variants; return first HTML that loads."""
    if not website:
        return ""
    url = website if website.startswith("http") else f"https://{website}"
    html = await _fetch_page(client, url)
    if not html and "//www." not in url:
        html = await _fetch_page(client, url.replace("://", "://www."))
    return html


def _extract_emails(html: str) -> list:
    found = []
    for m in _EMAIL_RE.findall(html or ""):
        low = m.lower()
        if any(s in low for s in _SKIP_EMAIL) or low in found:
            continue
        found.append(low)
    return found[:5]


def _score(lead: dict) -> tuple:
    breakdown = []
    score = 0
    if not lead.get("website"):
        score += 20
        breakdown.append("No website +20")
    elif lead.get("website_quality") == "poor":
        score += 20
        breakdown.append("Poor website +20")
    if not lead.get("has_online_booking"):
        score += 30
        breakdown.append("No booking system +30")
    if (lead.get("branches") or 1) >= 2:
        score += 30
        breakdown.append("Multiple branches +30")
    if (lead.get("reviews") or 0) >= 500 and not lead.get("website"):
        score += 20
        breakdown.append("🔥 500+ reviews, no website +20")
    return score, breakdown


async def _live_plans() -> dict:
    from routes.subscriptions import load_plan_overrides, PLAN_CATALOG
    try:
        await load_plan_overrides()
    except Exception:
        pass
    return {k: dict(v) for k, v in PLAN_CATALOG.items()}


def _pricing_lines(plans: dict) -> str:
    return "\n".join(f"- {v['label']}: Rs.{int(v['price']):,}" for v in plans.values())


def _pricing_table_html(plans: dict) -> str:
    rows = ""
    for k, v in plans.items():
        annual = "annual" in k
        style = "background:#faf6ec;font-weight:bold" if annual else ""
        badge = ' <span style="background:#d4af37;color:#fff;font-size:10px;padding:2px 7px;border-radius:8px;vertical-align:middle">BEST VALUE</span>' if annual else ""
        rows += (f'<tr style="{style}"><td style="padding:8px 14px;border-bottom:1px solid #eee">{v["label"]}{badge}</td>'
                 f'<td style="padding:8px 14px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">₹{int(v["price"]):,}</td></tr>')
    return (
        '<div style="margin:22px 0">'
        '<div style="font-size:15px;font-weight:bold;color:#1c1c22;margin-bottom:8px">Miracurl Suite — Plans &amp; Pricing</div>'
        '<table style="border-collapse:collapse;width:100%;max-width:480px;font-size:14px;color:#333;border:1px solid #eee;border-radius:10px">'
        f'{rows}</table>'
        '<div style="font-size:12px;color:#777;margin-top:8px">💡 Multi-branch discounts available — the more branches, the more you save. Full details in the attached brochure.</div>'
        '</div>')


_PRICE_RE = re.compile(r"(?:for |at )?(?:just |only )?(?:Rs\.?|₹|INR)\s?[\d,]+\s?(?:/-|/month|/year|per month|per year|a month|a year)?", re.I)


async def _draft_email(lead: dict) -> dict:
    from routes.mira_common import _ask_json
    pricing = _pricing_lines(await _live_plans())
    research = {k: v for k, v in lead.items()
                if k not in ("email_body", "email_subject", "id", "_id", "run_id", "score_breakdown", "status")}
    out = await _ask_json(
        "You are Mira, the outreach agent for Miracurl Suite — an all-in-one salon management platform "
        "(online booking, WhatsApp marketing & automation, staff attendance & payroll, memberships, GST billing). "
        f"Current live plan pricing:\n{pricing}\n"
        "Write warm, short, personalized B2B outreach emails to Indian salon owners.",
        f"Salon research data: {research}\n"
        "Write a personalized email to this salon's owner. Rules: greet as 'Hi {name} team' or owner if known; "
        "1st line must reference something SPECIFIC from the research (their rating/reviews, services, branches); "
        "if the salon has 500+ reviews but no website, emphasize how much repeat business they're losing without "
        "online booking given their popularity; "
        "2nd para: point out what they seem to be missing (online booking / WhatsApp automation / website) and how "
        "Miracurl Suite fixes it; recommend the plan that best fits their branch count and note the annual plan is "
        "the best value; do NOT list prices in the body — a full pricing table is appended below your email "
        "automatically; mention the attached brochure PDF has full details; CTA: free live demo — reply to this email or visit "
        "https://miracurl-suite.com/demo to pick a demo slot. Max 140 words, no fluff, plain paragraphs. "
        "The subject line must be a scroll-stopping HOT hook: personalized with the salon's name, rating, review "
        "count or a money angle (e.g. 'Kudos on 4.9⭐ Atmos — now automate the rush 🔥'), create curiosity or FOMO, "
        "exactly ONE tasteful emoji (🔥 ✨ 💇 📈 ⭐), max 60 chars, never spammy ALL-CAPS. "
        'Return JSON: {"subject":"<hot personalized subject max 60 chars>","body":"<email body, use \\n between paragraphs>"}')
    return {"subject": (out.get("subject") or "Grow your salon with Miracurl Suite")[:120],
            "body": _PRICE_RE.sub("at the plans priced below", out.get("body") or "")}


async def _emails_from_contact_pages(client: httpx.AsyncClient, website: str, soup) -> list:
    base = website.rstrip("/") if website.startswith("http") else f"https://{website.rstrip('/')}"
    for a in soup.select("a[href]"):
        href = a.get("href", "")
        if "contact" in href.lower() and not href.startswith("mailto:"):
            url = href if href.startswith("http") else f"{base}/{href.lstrip('/')}"
            emails = _extract_emails(await _fetch_page(client, url))
            if emails:
                return emails
            break
    for path in ("/contact", "/contact-us", "/contactus"):
        emails = _extract_emails(await _fetch_page(client, base + path))
        if emails:
            return emails
    return []


async def _scrape_site(client: httpx.AsyncClient, website_hint: str) -> dict:
    """Fetch the salon website and extract emails / instagram / booking signal / text."""
    site_html = await _fetch_site(client, website_hint)
    if not site_html:
        return {"website": "", "emails": [], "instagram": "", "booking": False, "text": ""}
    soup = BeautifulSoup(site_html, "html.parser")
    low = site_html.lower()
    booking = any(k in low for k in ("book now", "book appointment", "book online", "bookslot",
                                     "calendly", "setmore", "fresha", "zylu", "dingg"))
    ig = soup.select_one('a[href*="instagram.com/"]')
    emails = _extract_emails(site_html) or await _emails_from_contact_pages(client, website_hint, soup)
    return {"website": website_hint, "emails": emails,
            "instagram": ig.get("href", "")[:120] if ig else "",
            "booking": booking, "text": soup.get_text(" ", strip=True)[:2500]}


async def _llm_research(name: str, city: str, site: dict) -> dict:
    from routes.mira_common import _ask_json
    website = site["website"]
    return await _ask_json(
        "You are the Research Agent for a salon-software company. You MAY use your general knowledge about this "
        "salon brand (typical Google rating, whether it is a chain and roughly how many branches it has in this city, "
        "its usual services). But judge website_quality and online booking primarily from the provided website text. "
        "Never invent emails or website URLs.",
        f"Salon: {name}, City: {city}, India. Website {'(verified live)' if website else '(none found)'}: {website}\n"
        f"Website text: {site['text'] or '(no website content)'}\n"
        'Return JSON: {"rating": <typical Google rating like 4.3, null only if you truly do not know this brand>, '
        '"services": ["..."], "branches": <estimated branch count in this city, 1 if single outlet>, '
        f'"instagram": "<handle/url or empty>", "has_online_booking": {str(site["booking"]).lower()} '
        'or true if the website text clearly offers online booking, '
        '"website_quality": "<none|poor|good — judge from the website text richness>", '
        '"owner_name": "<if found, else empty>"}')


async def _research_salon(client: httpx.AsyncClient, name: str, city: str, website_hint: str = "") -> dict:
    site = await _scrape_site(client, website_hint)
    info = await _llm_research(name, city, site)
    lead = {
        "id": str(uuid.uuid4()), "name": name, "city": city,
        "website": site["website"], "instagram": site["instagram"] or (info.get("instagram") or ""),
        "rating": info.get("rating"), "services": (info.get("services") or [])[:6],
        "branches": int(info.get("branches") or 1),
        "has_online_booking": site["booking"] or bool(info.get("has_online_booking")),
        "website_quality": (info.get("website_quality") or ("none" if not site["website"] else "poor")),
        "owner_name": info.get("owner_name") or "",
        "email": site["emails"][0] if site["emails"] else "",
        "email_source": site["website"] if site["emails"] else "",
        "all_emails": site["emails"], "crm": False,
        "status": "researched", "created_at": _now(),
    }
    lead["score"], lead["score_breakdown"] = _score(lead)
    return lead


async def _find_candidates(client: httpx.AsyncClient, city: str, target: int, existing: set) -> tuple:
    """Returns (source, candidates, note). Google Maps when available, else Mira AI research."""
    raw, note = await _places_search(client, city, target + 8)
    places = [p for p in raw if p["name"] and p["name"].lower() not in existing][:target]
    if places:
        return "maps", [{"name": p["name"], "website": p["website"], "area": p["address"], "_place": p}
                        for p in places], ""
    if raw and not places:
        note = "all Maps results already contacted"
    from routes.mira_common import _ask_json
    plan = await _ask_json(
        "You are the Lead Finder agent for a salon-software company targeting Indian salons. "
        "List REAL salon businesses that operate in the given city — well-known local salons and chains. "
        "Include their official website domain ONLY if you are confident it is correct; otherwise leave empty. "
        "Never invent salon names or domains.",
        f"City: {city}, India. Already contacted (skip these): {sorted(existing)[:40]}\n"
        f'Return JSON: {{"salons": [{{"name": "<salon name>", "website": "<https://… or empty>", '
        f'"area": "<locality if known>"}}]}} with up to {target + 6} salons.')
    return "ai", [c for c in (plan.get("salons") or [])
                  if c.get("name") and c["name"].strip().lower() not in existing][:target], note


async def _build_candidate_lead(client: httpx.AsyncClient, cand: dict, city: str, run_id: str) -> dict:
    lead = await _research_salon(client, cand["name"].strip(), city, (cand.get("website") or "").strip())
    lead["run_id"] = run_id
    lead["area"] = cand.get("area") or ""
    place = cand.get("_place")
    if place:
        lead["rating"] = place.get("rating") or lead["rating"]
        lead["reviews"] = place.get("reviews")
        lead["phone"] = place.get("phone") or ""
        lead["address"] = place.get("address") or ""
        lead["source"] = "google_maps"
        lead["score"], lead["score_breakdown"] = _score(lead)
    if lead["email"]:
        draft = await _draft_email(lead)
        lead.update({"email_subject": draft["subject"], "email_body": draft["body"], "status": "drafted"})
    else:
        lead["status"] = "no_email"
    return lead


async def _log_candidate_source(_log, source: str, note: str):
    if source == "maps":
        await _log("📍 Google Maps: real salons with ratings & websites found.")
    elif note == "no_key":
        await _log("ℹ️ Google Maps key not configured on this server — using Mira AI research instead.")
    else:
        await _log(f"⚠️ Google Maps unavailable ({note or 'no results'}) — using Mira AI research instead.")


async def _research_candidates(client: httpx.AsyncClient, cands: list, city: str, run_id: str, _log) -> int:
    done = 0
    for cand in cands:
        try:
            lead = await _build_candidate_lead(client, cand, city, run_id)
            await _raw_db.mira_leads.insert_one(lead)
            done += 1
            await _log(f"📋 {lead['name']}: score {lead['score']} | email: {lead['email'] or 'not found'}", researched=done)
        except Exception as e:  # noqa: BLE001 — one bad candidate must not stop the run
            await _log(f"⚠️ {cand.get('name')} skipped: {str(e)[:80]}")
        await asyncio.sleep(1.5)
    return done


async def _run_pipeline(run_id: str, city: str, target: int):
    async def _log(msg, **sets):
        await _raw_db.mira_lead_runs.update_one(
            {"id": run_id}, {"$push": {"log": f"[{_now()[11:19]}] {msg}"}, "$set": sets or {}})
    try:
        async with httpx.AsyncClient() as client:
            await _log(f"🔍 Lead Finder: Mira is listing real salons in {city}…", stage="finding")
            existing = {(d.get("name") or "").lower() async for d in _raw_db.mira_leads.find({"city": city}, {"name": 1})}
            source, cands, note = await _find_candidates(client, city, target, existing)
            if not cands:
                await _log("No new salons found — try another city or run again later.", status="done", stage="done")
                return
            await _log_candidate_source(_log, source, note)
            await _log(f"✅ Found {len(cands)} candidate salons. Researching each…", stage="researching", found=len(cands))
            done = await _research_candidates(client, cands, city, run_id, _log)
            await _log(f"🎉 Run complete — {done} leads ready for your review.", status="done", stage="done")
    except Exception as e:
        log.exception("lead run failed")
        await _log(f"❌ Run failed: {str(e)[:120]}", status="failed", stage="failed")


class RunIn(BaseModel):
    city: str = Field(..., min_length=2, max_length=60)
    target: int = Field(10, ge=1, le=25)


@router.post("/super-admin/mira-leads/run")
async def start_run(body: RunIn, user=Depends(require_super_admin)):
    active = await _raw_db.mira_lead_runs.find_one({"status": "running"})
    if active:
        raise HTTPException(409, "A lead run is already in progress — wait for it to finish.")
    run = {"id": str(uuid.uuid4()), "city": body.city.strip().title(), "target": body.target,
           "status": "running", "stage": "starting", "found": 0, "researched": 0,
           "log": [], "created_at": _now()}
    await _raw_db.mira_lead_runs.insert_one({**run})
    asyncio.create_task(_run_pipeline(run["id"], run["city"], body.target))
    run.pop("_id", None)
    return run


@router.get("/super-admin/mira-leads/runs")
async def list_runs(user=Depends(require_super_admin)):
    return await _raw_db.mira_lead_runs.find({}, {"_id": 0}).sort("created_at", -1).to_list(10)


@router.get("/super-admin/mira-leads")
async def list_leads(status: str = "", user=Depends(require_super_admin)):
    q = {"status": status} if status else {}
    return await _raw_db.mira_leads.find(q, {"_id": 0}).sort("score", -1).to_list(300)


@router.get("/super-admin/mira-leads/stats")
async def lead_stats(user=Depends(require_super_admin)):
    total = await _raw_db.mira_leads.count_documents({})
    qualified = await _raw_db.mira_leads.count_documents({"score": {"$gte": 50}})
    sent = await _raw_db.mira_leads.count_documents({"status": {"$in": ["sent", "demo", "customer"]}})
    demos = await _raw_db.mira_leads.count_documents({"status": {"$in": ["demo", "customer"]}})
    customers = await _raw_db.mira_leads.count_documents({"status": "customer"})
    return {"actual": {"target_leads": total, "qualified": qualified, "emails_sent": sent,
                       "demos": demos, "customers": customers},
            "targets": FUNNEL_TARGETS}


class LeadEditIn(BaseModel):
    email: str = ""
    email_subject: str = ""
    email_body: str = ""


@router.put("/super-admin/mira-leads/{lid}")
async def edit_lead(lid: str, body: LeadEditIn, user=Depends(require_super_admin)):
    sets = {k: v for k, v in body.model_dump().items() if v}
    if body.email and not _EMAIL_RE.fullmatch(body.email):
        raise HTTPException(400, "Invalid email address")
    if sets.get("email"):
        sets["status"] = "drafted"
    await _raw_db.mira_leads.update_one({"id": lid}, {"$set": sets})
    return await _raw_db.mira_leads.find_one({"id": lid}, {"_id": 0})


def _outreach_email_html(lead: dict, plans: dict) -> str:
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    pixel = (f'<img src="{base}/api/public/lead-track/{lead.get("id", "")}/open.png" '
             'width="1" height="1" style="display:block;width:1px;height:1px" alt="" />') if lead.get("id") else ""
    paras = "".join(f'<p style="font-size:14px;color:#3a3a40;line-height:1.8;margin:0 0 15px">{p}</p>'
                    for p in (lead.get("email_body") or "").split("\n") if p.strip())
    return f"""
    <div style="background:#efe9dc;padding:28px 12px;font-family:Georgia,serif">
      <div style="max-width:600px;margin:0 auto;background:#fdfbf7;border:1px solid #e6ddc8;border-radius:18px;overflow:hidden;box-shadow:0 10px 34px rgba(28,28,34,.14)">
        <img src="{base}/assets/mira-outreach-hero.png" alt="Miracurl Suite — Mira, your AI salon partner" width="600" style="width:100%;display:block" />
        <div style="height:3px;background:linear-gradient(90deg,#b08d3f,#e8c37f,#b08d3f)"></div>
        <div style="padding:30px 34px 4px">{paras}</div>
        <div style="padding:0 34px">{_pricing_table_html(plans)}</div>
        <div style="padding:2px 34px 28px">
          <a href="{base}/demo" style="display:inline-block;background:#1c1c22;color:#e8c37f;text-decoration:none;padding:13px 32px;border-radius:999px;font-size:14px;letter-spacing:.6px">Book a free live demo ✦</a>
          <p style="font-size:12px;color:#8a8474;margin:16px 0 0">📎 The attached brochure covers every module of Miracurl Suite.</p>
        </div>
        <div style="background:#1c1c22;padding:16px 34px;text-align:center">
          <span style="color:#e8c37f;font-size:15px;letter-spacing:2px">MIRACURL ✦ SUITE</span>
          <div style="color:#8a8a92;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin-top:3px">Mira — your AI salon partner</div>
        </div>
      </div>
      {pixel}
    </div>"""


_SCREENS_TOUR_PDF = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "miracurl-screens-tour.pdf")


@router.get("/public/lead-track/{lid}/open.png")
async def lead_track_open(lid: str, request: Request):
    from security import public_rate_limit
    from routes.hq_documents import _PIXEL_PNG
    public_rate_limit(request, "lead-open", limit=60, window_sec=600)
    await _raw_db.mira_leads.update_one(
        {"id": lid, "opened_at": None},
        {"$set": {"opened_at": _now()}})
    await _raw_db.mira_leads.update_one(
        {"id": lid, "opened_at": {"$exists": False}},
        {"$set": {"opened_at": _now()}})
    return Response(content=_PIXEL_PNG, media_type="image/png",
                    headers={"Cache-Control": "no-store, no-cache, must-revalidate"})


@router.post("/super-admin/mira-leads/{lid}/approve")
async def approve_and_send(lid: str, user=Depends(require_super_admin)):
    lead = await _raw_db.mira_leads.find_one({"id": lid}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    if not lead.get("email"):
        raise HTTPException(400, "No email address on this lead — add one first.")
    if lead.get("status") == "sent":
        raise HTTPException(400, "Already sent")
    from email_service import _send_email
    from routes.hq_documents import suite_overview_attachment
    html = _outreach_email_html(lead, await _live_plans())
    attachments = [await asyncio.to_thread(suite_overview_attachment)]
    tour = screens_tour_attachment()
    if tour:
        attachments.append(tour)
    result = await _send_email([lead["email"]], lead.get("email_subject") or "Miracurl Suite — free demo",
                               html, attachments=attachments, book_url="https://miracurl-suite.com/demo")
    if not result.get("sent"):
        raise HTTPException(502, f"Send failed: {result.get('error')}")
    await _raw_db.mira_leads.update_one(
        {"id": lid}, {"$set": {"status": "sent", "sent_at": _now(), "approved_by": user.get("email")}})
    return {"ok": True, "sent_to": lead["email"]}


@router.post("/super-admin/mira-leads/{lid}/reject")
async def reject_lead(lid: str, user=Depends(require_super_admin)):
    await _raw_db.mira_leads.update_one({"id": lid}, {"$set": {"status": "rejected"}})
    return {"ok": True}


@router.post("/super-admin/mira-leads/{lid}/send-slot-picker")
async def lead_send_slot_picker(lid: str, request: Request, user=Depends(require_super_admin)):
    """Send a 'pick your demo time' email to a lead (creates their demo invite if needed)."""
    lead = await _raw_db.mira_leads.find_one({"id": lid}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    if not lead.get("email"):
        raise HTTPException(400, "No email address on this lead — add one first.")
    from routes.hq_documents import _send_slot_picker_email
    em = lead["email"].strip().lower()
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    base = f"https://{host}" if host else os.environ.get("APP_PUBLIC_URL", "").rstrip("/")
    inv = await _raw_db.demo_invites.find_one({"email": em}, {"_id": 0})
    if not inv:
        inv = {"id": str(uuid.uuid4()), "email": em, "name": lead.get("owner_name") or lead.get("name") or "",
               "salon_name": lead.get("name") or "", "preferred_slot": None, "status": None,
               "first_sent_at": _now(), "reminder_sent_at": None, "responded": False,
               "opened_at": None, "demo_requested_at": None, "clicked_at": None,
               "track_base": base, "seen_by_hq_open": True, "seen_by_hq_req": True}
        await _raw_db.demo_invites.insert_one({**inv})
        inv.pop("_id", None)
    result = await _send_slot_picker_email(inv, inv.get("track_base") or base)
    if result.get("sent"):
        await _raw_db.mira_leads.update_one({"id": lid}, {"$set": {"slot_picker_sent_at": _now()}})
    return result


@router.get("/public/brochure.pdf")
async def public_brochure():
    from routes.hq_documents import suite_overview_attachment
    import base64
    att = await asyncio.to_thread(suite_overview_attachment)
    return Response(content=base64.b64decode(att["content"]), media_type="application/pdf",
                    headers={"Content-Disposition": 'inline; filename="miracurl-suite-overview.pdf"'})


def _wa_phone(raw: str) -> str:
    num = "".join(ch for ch in (raw or "") if ch.isdigit())
    if num.startswith("0"):
        num = num[1:]
    return f"91{num}" if len(num) == 10 else num


async def _wa_message(lead: dict) -> str:
    plans = await _live_plans()
    half, annual = int(plans["half_year"]["price"]), int(plans["annual"]["price"])
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    intro = f"Hi {lead.get('owner_name') or lead['name'] + ' team'}! 👋\n"
    if lead.get("rating"):
        reviews = f" with {lead['reviews']} reviews" if lead.get("reviews") else ""
        intro += f"Came across your salon in {lead.get('city', '')} — {lead['rating']}⭐{reviews} is truly impressive!\n\n"
    else:
        intro += f"Came across your salon in {lead.get('city', '')} and had to reach out!\n\n"
    return (intro +
            "I'm Mira from *Miracurl Suite* — the all-in-one salon platform: online booking, "
            "WhatsApp marketing & automation, staff attendance & payroll, memberships and GST billing.\n\n"
            f"💰 Plans start at Rs.{half:,} for 6 months — *best value: Annual at Rs.{annual:,}* "
            "(multi-branch discounts available!)\n\n"
            f"📎 Full brochure with all details: {base}/api/public/brochure.pdf\n"
            f"🌐 {base}\n\n"
            "Reply here for a *free 15-minute live demo* — I'd love to show you around! ✨")


@router.get("/super-admin/mira-leads/{lid}/whatsapp")
async def whatsapp_link(lid: str, user=Depends(require_super_admin)):
    from urllib.parse import quote
    lead = await _raw_db.mira_leads.find_one({"id": lid}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    phone = _wa_phone(lead.get("phone", ""))
    if not phone:
        raise HTTPException(400, "No phone number on this lead.")
    msg = await _wa_message(lead)
    return {"wa_url": f"https://wa.me/{phone}?text={quote(msg)}", "phone": phone, "message": msg}


@router.post("/super-admin/mira-leads/{lid}/whatsapp-sent")
async def whatsapp_mark_sent(lid: str, user=Depends(require_super_admin)):
    await _raw_db.mira_leads.update_one(
        {"id": lid}, {"$set": {"status": "sent", "sent_via": "whatsapp", "sent_at": _now(),
                               "approved_by": user.get("email")}})
    return {"ok": True}


class StageIn(BaseModel):
    stage: str = Field(..., pattern=r"^(sent|demo|customer)$")


@router.post("/super-admin/mira-leads/{lid}/stage")
async def set_stage(lid: str, body: StageIn, user=Depends(require_super_admin)):
    await _raw_db.mira_leads.update_one({"id": lid}, {"$set": {"status": body.stage}})
    return {"ok": True}


@router.delete("/super-admin/mira-leads/{lid}")
async def delete_lead(lid: str, user=Depends(require_super_admin)):
    await _raw_db.mira_leads.delete_one({"id": lid})
    return {"ok": True}


FOLLOWUP_AFTER_DAYS = 5


def _followup_email(lead: dict, plans: dict) -> tuple:
    half = int(plans["half_year"]["price"])
    annual = int(plans["annual"]["price"])
    subject = f"Re: {lead.get('email_subject') or 'Miracurl Suite — free demo'}"
    body = (f"Hi {lead.get('owner_name') or lead['name'] + ' team'},\n\n"
            f"Just a gentle follow-up — did you get a chance to see my earlier email about "
            f"Miracurl Suite? Salon owners like you use it to automate online bookings, WhatsApp "
            f"marketing, staff attendance and memberships from just Rs.{half:,} for 6 months "
            f"(best value: Rs.{annual:,}/year, multi-branch discounts available).\n\n"
            f"If you'd like, I can set up a quick 15-minute live demo this week — just reply to this "
            f"email or pick a slot at https://miracurl-suite.com/demo.\n\n"
            f"Warm regards,\nTeam Miracurl")
    return subject, body


async def run_lead_followups() -> dict:
    """One-time gentle follow-up to leads still in 'sent' after FOLLOWUP_AFTER_DAYS days."""
    from email_service import _send_email
    cutoff = (datetime.now(timezone.utc) - timedelta(days=FOLLOWUP_AFTER_DAYS)).isoformat()
    due = await _raw_db.mira_leads.find(
        {"status": "sent", "sent_at": {"$lte": cutoff}, "follow_up_sent_at": {"$exists": False}},
        {"_id": 0}).to_list(50)
    sent = failed = 0
    plans = await _live_plans() if due else {}
    for lead in due:
        subject, body = _followup_email(lead, plans)
        base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
        html = ("".join(f"<p>{p}</p>" for p in body.split("\n") if p.strip())
                + f'<img src="{base}/api/public/lead-track/{lead["id"]}/open.png" width="1" height="1" style="display:block" alt="" />')
        tour = screens_tour_attachment()
        try:
            result = await _send_email([lead["email"]], subject, html,
                                       attachments=[tour] if tour else None,
                                       book_url="https://miracurl-suite.com/demo")
            if result.get("sent"):
                await _raw_db.mira_leads.update_one(
                    {"id": lead["id"]}, {"$set": {"follow_up_sent_at": _now()}})
                sent += 1
            else:
                failed += 1
        except Exception as e:
            log.error("lead followup failed for %s: %s", lead.get("email"), e)
            failed += 1
        await asyncio.sleep(0.5)
    return {"due": len(due), "sent": sent, "failed": failed}


@router.post("/super-admin/mira-leads/followups/run")
async def trigger_followups(user=Depends(require_super_admin)):
    return await run_lead_followups()


async def _lead_with_email(lid: str) -> dict:
    lead = await _raw_db.mira_leads.find_one({"id": lid}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    if not lead.get("email"):
        raise HTTPException(400, "No email address on this lead — add one first.")
    return lead


def _rate_guard(lead: dict, field: str, what: str):
    last = lead.get(field)
    if last and (datetime.now(timezone.utc) - datetime.fromisoformat(last)).total_seconds() < 300:
        raise HTTPException(429, f"{what} sent moments ago — wait a few minutes before sending again")


@router.post("/super-admin/mira-leads/{lid}/remind")
async def lead_remind(lid: str, user=Depends(require_super_admin)):
    """Manual gentle reminder to an already-sent lead — works whether or not they opened."""
    from email_service import _send_email
    lead = await _lead_with_email(lid)
    _rate_guard(lead, "last_reminder_at", "Reminder")
    subject, body = _followup_email(lead, await _live_plans())
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    html = ("".join(f"<p>{p}</p>" for p in body.split("\n") if p.strip())
            + f'<img src="{base}/api/public/lead-track/{lid}/open.png" width="1" height="1" style="display:block" alt="" />')
    tour = screens_tour_attachment()
    result = await _send_email([lead["email"]], subject, html,
                               attachments=[tour] if tour else None,
                               book_url="https://miracurl-suite.com/demo")
    if not result.get("sent"):
        raise HTTPException(502, f"Send failed: {result.get('error')}")
    await _raw_db.mira_leads.update_one({"id": lid}, {
        "$set": {"last_reminder_at": _now(),
                 "follow_up_sent_at": lead.get("follow_up_sent_at") or _now()},
        "$inc": {"reminder_count": 1}})
    return {"ok": True, "sent_to": lead["email"]}


@router.post("/super-admin/mira-leads/{lid}/resend")
async def lead_resend_pitch(lid: str, user=Depends(require_super_admin)):
    """Re-send the original pitch email with the brochure + screens-tour PDFs."""
    from email_service import _send_email
    from routes.hq_documents import suite_overview_attachment
    lead = await _lead_with_email(lid)
    _rate_guard(lead, "pdf_resent_at", "PDF")
    html = _outreach_email_html(lead, await _live_plans())
    attachments = [await asyncio.to_thread(suite_overview_attachment)]
    tour = screens_tour_attachment()
    if tour:
        attachments.append(tour)
    result = await _send_email([lead["email"]], lead.get("email_subject") or "Miracurl Suite — free demo",
                               html, attachments=attachments, book_url="https://miracurl-suite.com/demo")
    if not result.get("sent"):
        raise HTTPException(502, f"Send failed: {result.get('error')}")
    await _raw_db.mira_leads.update_one({"id": lid}, {"$set": {"pdf_resent_at": _now()}})
    return {"ok": True, "sent_to": lead["email"]}


class LeadMeetInviteIn(BaseModel):
    date: str = Field(min_length=10, max_length=10)  # YYYY-MM-DD
    time: str = Field(min_length=5, max_length=5)    # HH:MM (IST)
    duration_min: int = Field(default=30, ge=15, le=120)
    meet_link: str = Field(default="", max_length=200)


@router.post("/super-admin/mira-leads/{lid}/meet-invite")
async def lead_meet_invite(lid: str, body: LeadMeetInviteIn, user=Depends(require_super_admin)):
    """Google Meet invite email with .ics calendar attachment — mirrors the Inquiries flow."""
    from email_service import _send_email, marketing_email_html
    from routes.sales import _build_ics
    lead = await _lead_with_email(lid)
    try:
        ist_dt = datetime.strptime(f"{body.date} {body.time}", "%Y-%m-%d %H:%M")
    except ValueError:
        raise HTTPException(400, "Invalid date/time")
    start_utc = (ist_dt - timedelta(hours=5, minutes=30)).replace(tzinfo=timezone.utc)
    end_utc = start_utc + timedelta(minutes=body.duration_min)
    first = (lead.get("owner_name") or lead.get("name") or "there").split()[0].title()
    hq_email = os.environ.get("HQ_EMAIL", "hello@miracurl.com")
    pretty = ist_dt.strftime("%A, %d %B %Y at %I:%M %p IST")
    link_line = f"\nJoin here: {body.meet_link}" if body.meet_link else ""
    ics = _build_ics(lid, start_utc, end_utc, f"Miracurl Salon Suite demo — {lead.get('name', '')}",
                     f"Google Meet demo of Miracurl Salon Suite.{link_line}".replace("\n", "\\n"),
                     hq_email, lead["email"])
    body_text = (
        f"Dear {first},\n"
        f"Your Miracurl Salon Suite demo is confirmed for {pretty} ({body.duration_min} minutes).\n"
        + (f"Google Meet link: {body.meet_link}\n" if body.meet_link else "The meeting link is in the attached calendar invite.\n")
        + "The invite is attached — open it to add the meeting to your calendar automatically.\n"
        "See you there!\nWarm regards,\nMiracurl Family")
    html = marketing_email_html("Miracurl Salon Suite", body_text,
                                body.meet_link or os.environ.get("APP_PUBLIC_URL", ""),
                                cta_label="Join the meeting ✦" if body.meet_link else "Explore Miracurl ✦")
    res = await _send_email([lead["email"]], f"Your Miracurl demo is confirmed — {pretty}",
                            html, attachments=[{"filename": "miracurl-demo.ics",
                                                "content": base64.b64encode(ics.encode()).decode()}])
    if not res.get("sent"):
        raise HTTPException(400, f"Email failed: {res.get('error')}")
    await _raw_db.mira_leads.update_one({"id": lid}, {"$set": {
        "status": "demo",
        "meeting": {"at_ist": f"{body.date} {body.time}", "duration_min": body.duration_min,
                    "meet_link": body.meet_link, "sent_at": _now()}}})
    return {"ok": True, "when": pretty}
