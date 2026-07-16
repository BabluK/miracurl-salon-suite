"""Mira Lead Generation Agent — AI web research pipeline for finding & pitching salons.
Lead Finder (Google Places when key enabled, else AI research) -> Research -> Email Finder
-> Qualification -> Outreach -> Super-admin approval -> Send.
"""
import os
import re
import uuid
import asyncio
import logging
from datetime import datetime, timezone

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from database import _raw_db
from security import require_super_admin

router = APIRouter()
log = logging.getLogger("mira_leads")

_UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"}
_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_SKIP_EMAIL = ("example.", "sentry.", "wixpress", "@2x", ".png", ".jpg", "@sentry", "no-reply@", "noreply@")
FUNNEL_TARGETS = {"target_leads": 300, "qualified": 100, "emails_sent": 50, "demos": 10, "customers": 5}


async def _places_search(client: httpx.AsyncClient, city: str, n: int) -> list:
    """Real salon data from Google Places API (New). Returns [] if key missing/disabled."""
    key = os.environ.get("GOOGLE_MAPS_API_KEY", "")
    if not key:
        return []
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
            return []
        return [{"name": p.get("displayName", {}).get("text", ""), "rating": p.get("rating"),
                 "reviews": p.get("userRatingCount"), "website": p.get("websiteUri", ""),
                 "phone": p.get("nationalPhoneNumber", ""), "address": p.get("formattedAddress", "")}
                for p in data["places"]]
    except Exception as e:
        log.warning("places search failed: %s", e)
        return []


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
    return score, breakdown


async def _draft_email(lead: dict) -> dict:
    from routes.mira_common import _ask_json
    out = await _ask_json(
        "You are Mira, the outreach agent for Miracurl Suite — an all-in-one salon management platform "
        "(online booking, WhatsApp marketing & automation, staff attendance & payroll, memberships, GST billing) "
        "at just Rs.900/month. Write warm, short, personalized B2B outreach emails to Indian salon owners.",
        f"Salon research data: {lead}\n"
        "Write a personalized email to this salon's owner. Rules: greet as 'Hi {name} team' or owner if known; "
        "1st line must reference something SPECIFIC from the research (their rating/reviews, services, branches); "
        "2nd para: point out what they seem to be missing (online booking / WhatsApp automation / website) and how "
        "Miracurl Suite fixes it; mention Rs.900/month; CTA: free live demo — reply to this email or visit "
        "https://miracurl-suite.com to pick a demo slot. Max 130 words, no fluff, plain paragraphs. "
        'Return JSON: {"subject":"<catchy subject max 60 chars>","body":"<email body, use \\n between paragraphs>"}')
    return {"subject": (out.get("subject") or "Grow your salon with Miracurl Suite")[:120],
            "body": out.get("body") or ""}


async def _research_salon(client: httpx.AsyncClient, name: str, city: str, website_hint: str = "") -> dict:
    from routes.mira_common import _ask_json
    site_html = await _fetch_site(client, website_hint)
    website = website_hint if site_html else ""
    emails = _extract_emails(site_html)
    instagram = ""
    booking_signal = False
    site_text = ""
    if site_html:
        soup = BeautifulSoup(site_html, "html.parser")
        low = site_html.lower()
        booking_signal = any(k in low for k in ("book now", "book appointment", "book online", "bookslot",
                                                "calendly", "setmore", "fresha", "zylu", "dingg"))
        ig = soup.select_one('a[href*="instagram.com/"]')
        if ig:
            instagram = ig.get("href", "")[:120]
        if not emails:
            for a in soup.select("a[href]"):
                href = a.get("href", "")
                if "contact" in href.lower() and not href.startswith("mailto:"):
                    base = website.rstrip("/") if website.startswith("http") else f"https://{website.rstrip('/')}"
                    contact_url = href if href.startswith("http") else f"{base}/{href.lstrip('/')}"
                    emails = _extract_emails(await _fetch_page(client, contact_url))
                    break
        if not emails:
            base = website.rstrip("/") if website.startswith("http") else f"https://{website.rstrip('/')}"
            for path in ("/contact", "/contact-us", "/contactus"):
                emails = _extract_emails(await _fetch_page(client, base + path))
                if emails:
                    break
        site_text = soup.get_text(" ", strip=True)[:2500]
    info = await _ask_json(
        "You are the Research Agent for a salon-software company. You MAY use your general knowledge about this "
        "salon brand (typical Google rating, whether it is a chain and roughly how many branches it has in this city, "
        "its usual services). But judge website_quality and online booking primarily from the provided website text. "
        "Never invent emails or website URLs.",
        f"Salon: {name}, City: {city}, India. Website {'(verified live)' if website else '(none found)'}: {website}\n"
        f"Website text: {site_text or '(no website content)'}\n"
        'Return JSON: {"rating": <typical Google rating like 4.3, null only if you truly do not know this brand>, '
        '"services": ["..."], "branches": <estimated branch count in this city, 1 if single outlet>, '
        f'"instagram": "<handle/url or empty>", "has_online_booking": {str(booking_signal).lower()} '
        'or true if the website text clearly offers online booking, '
        '"website_quality": "<none|poor|good — judge from the website text richness>", '
        '"owner_name": "<if found, else empty>"}')
    lead = {
        "id": str(uuid.uuid4()), "name": name, "city": city,
        "website": website, "instagram": instagram or (info.get("instagram") or ""),
        "rating": info.get("rating"), "services": (info.get("services") or [])[:6],
        "branches": int(info.get("branches") or 1),
        "has_online_booking": booking_signal or bool(info.get("has_online_booking")),
        "website_quality": (info.get("website_quality") or ("none" if not website else "poor")),
        "owner_name": info.get("owner_name") or "",
        "email": emails[0] if emails else "", "email_source": website if emails else "",
        "all_emails": emails, "crm": False,
        "status": "researched", "created_at": _now(),
    }
    lead["score"], lead["score_breakdown"] = _score(lead)
    return lead


async def _run_pipeline(run_id: str, city: str, target: int):
    async def _log(msg, **sets):
        await _raw_db.mira_lead_runs.update_one(
            {"id": run_id}, {"$push": {"log": f"[{_now()[11:19]}] {msg}"}, "$set": sets or {}})
    try:
        from routes.mira_common import _ask_json
        async with httpx.AsyncClient() as client:
            await _log(f"🔍 Lead Finder: Mira is listing real salons in {city}…", stage="finding")
            existing = {(d.get("name") or "").lower() async for d in _raw_db.mira_leads.find({"city": city}, {"name": 1})}
            places = [p for p in await _places_search(client, city, target + 8)
                      if p["name"] and p["name"].lower() not in existing][:target]
            if places:
                await _log(f"📍 Google Maps: {len(places)} real salons with ratings & websites found.")
                cands = [{"name": p["name"], "website": p["website"], "area": p["address"], "_place": p} for p in places]
            else:
                await _log("ℹ️ Google Places not enabled — using Mira AI research instead.")
                plan = await _ask_json(
                    "You are the Lead Finder agent for a salon-software company targeting Indian salons. "
                    "List REAL salon businesses that operate in the given city — well-known local salons and chains. "
                    "Include their official website domain ONLY if you are confident it is correct; otherwise leave empty. "
                    "Never invent salon names or domains.",
                    f"City: {city}, India. Already contacted (skip these): {sorted(existing)[:40]}\n"
                    f'Return JSON: {{"salons": [{{"name": "<salon name>", "website": "<https://… or empty>", '
                    f'"area": "<locality if known>"}}]}} with up to {target + 6} salons.')
                cands = [c for c in (plan.get("salons") or [])
                         if c.get("name") and c["name"].strip().lower() not in existing][:target]
            if not cands:
                await _log("No new salons found — try another city or run again later.", status="done", stage="done")
                return
            await _log(f"✅ Found {len(cands)} candidate salons. Researching each…", stage="researching", found=len(cands))
            done = 0
            for cand in cands:
                name = cand["name"].strip()
                try:
                    lead = await _research_salon(client, name, city, (cand.get("website") or "").strip())
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
                        await _log(f"✉️ Drafting personalized email for {name} (score {lead['score']})…")
                        draft = await _draft_email(lead)
                        lead.update({"email_subject": draft["subject"], "email_body": draft["body"], "status": "drafted"})
                    else:
                        lead["status"] = "no_email"
                    await _raw_db.mira_leads.insert_one(lead)
                    done += 1
                    await _log(f"📋 {name}: score {lead['score']} | email: {lead['email'] or 'not found'}", researched=done)
                except Exception as e:
                    await _log(f"⚠️ {name} skipped: {str(e)[:80]}")
                await asyncio.sleep(1.5)
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
    html = "".join(f"<p>{p}</p>" for p in (lead.get("email_body") or "").split("\n") if p.strip())
    result = await _send_email([lead["email"]], lead.get("email_subject") or "Miracurl Suite — free demo",
                               html, book_url="https://miracurl-suite.com")
    if not result.get("sent"):
        raise HTTPException(502, f"Send failed: {result.get('error')}")
    await _raw_db.mira_leads.update_one(
        {"id": lid}, {"$set": {"status": "sent", "sent_at": _now(), "approved_by": user.get("email")}})
    return {"ok": True, "sent_to": lead["email"]}


@router.post("/super-admin/mira-leads/{lid}/reject")
async def reject_lead(lid: str, user=Depends(require_super_admin)):
    await _raw_db.mira_leads.update_one({"id": lid}, {"$set": {"status": "rejected"}})
    return {"ok": True}


class StageIn(BaseModel):
    stage: str = Field(..., pattern=r"^(demo|customer)$")


@router.post("/super-admin/mira-leads/{lid}/stage")
async def set_stage(lid: str, body: StageIn, user=Depends(require_super_admin)):
    await _raw_db.mira_leads.update_one({"id": lid}, {"$set": {"status": body.stage}})
    return {"ok": True}


@router.delete("/super-admin/mira-leads/{lid}")
async def delete_lead(lid: str, user=Depends(require_super_admin)):
    await _raw_db.mira_leads.delete_one({"id": lid})
    return {"ok": True}
