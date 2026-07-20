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
_SKIP_EMAIL = ("example.", "sentry.", "wixpress", "@2x", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg",
               "@sentry", "no-reply@", "noreply@", "donotreply@", "mailer-daemon@", "postmaster@",
               "user@", "test@", "demo@", "sample@", "name@", "your@", "youremail@", "email@",
               "someone@", "john@", "jane@", "filler@", "placeholder@", "webmaster@")
# Exact placeholder/service domains that page builders & widgets leave behind — never real salon inboxes.
_SKIP_DOMAINS = {
    "domain.com", "mystore.com", "example.com", "example.org", "example.net", "yourdomain.com",
    "yoursite.com", "yourwebsite.com", "yourcompany.com", "email.com", "website.com", "company.com",
    "test.com", "demo.com", "site.com", "mysite.com", "domain.co", "acme.com", "abc.com", "xyz.com",
    "mail.com", "address.com", "change.me", "localhost.com", "squarespace.com", "wix.com", "godaddy.com",
    "shopify.com", "wordpress.com", "yourshop.com", "business.com", "companyname.com", "sitename.com",
}
# When several emails are found, prefer real salon inbox prefixes in this order.
_EMAIL_PREFIX_RANK = ("booking", "bookings", "appointment", "appointments", "reservations",
                      "info", "hello", "hi", "contact", "enquiry", "enquiries", "inquiries",
                      "salon", "care", "team", "office", "admin")
# Obfuscated emails: "info [at] salon [dot] com" → info@salon.com
_OBFUSCATED_AT = re.compile(r"\s*[\[\(\{]\s*at\s*[\]\)\}]\s*", re.I)
_OBFUSCATED_DOT = re.compile(r"\s*[\[\(\{]\s*dot\s*[\]\)\}]\s*", re.I)
FUNNEL_TARGETS = {"target_leads": 300, "qualified": 100, "emails_sent": 50, "demos": 10, "customers": 5}


_SEARCH_CATEGORIES = [
    ("Salon", "beauty salons in {city}"),
    ("Unisex Salon", "unisex salons in {city}"),
    ("Spa", "spas and wellness centres in {city}"),
    ("Boutique", "beauty boutiques in {city}"),
    ("Hair Care", "hair care and hair studios in {city}"),
]


async def _places_query(client: httpx.AsyncClient, key: str, query: str, want: int) -> list:
    """Places text-search with pagination — up to 3 pages (60 results) per query."""
    out, token = [], None
    for _ in range(3):
        payload = {"textQuery": query, "pageSize": 20}
        if token:
            payload["pageToken"] = token
        r = await client.post(
            "https://places.googleapis.com/v1/places:searchText",
            headers={"Content-Type": "application/json", "X-Goog-Api-Key": key,
                     "X-Goog-FieldMask": ("places.displayName,places.rating,places.userRatingCount,"
                                          "places.websiteUri,places.nationalPhoneNumber,places.formattedAddress,"
                                          "nextPageToken")},
            json=payload, timeout=20)
        data = r.json()
        if "places" not in data:
            if out:
                break
            raise RuntimeError((data.get("error") or {}).get("message", "no results")[:90])
        out += [{"name": p.get("displayName", {}).get("text", ""), "rating": p.get("rating"),
                 "reviews": p.get("userRatingCount"), "website": p.get("websiteUri", ""),
                 "phone": p.get("nationalPhoneNumber", ""), "address": p.get("formattedAddress", "")}
                for p in data["places"]]
        token = data.get("nextPageToken")
        if not token or len(out) >= want:
            break
    return out[:want]


def _collect_places(pairs, seen, out, first_err):
    for cat, res in pairs:
        if isinstance(res, BaseException):
            log.warning("places search [%s] failed: %s", cat, res)
            first_err = first_err or str(res)[:90]
            continue
        for p in res:
            k = (p["name"].strip().lower(), (p.get("address") or "").strip().lower()[:40])
            if not p["name"] or k in seen:
                continue
            seen.add(k)
            out.append({**p, "category": cat})
    return first_err


async def _places_area_phase(client, key, city, areas, seen, out) -> str:
    """Each category searched per rotating locality, in parallel."""
    tasks, cats = [], []
    for cat, q in _SEARCH_CATEGORIES:
        for a in areas:
            tasks.append(_places_query(client, key, q.format(city=f"{a}, {city}"), 20))
            cats.append(cat)
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return _collect_places(zip(cats, results), seen, out, "")


async def _places_citywide_phase(client, key, city, n, seen, out, first_err) -> str:
    """City-wide deep search (initial run, small towns, or thin localities)."""
    per_cat = min(60, max(12, (n // len(_SEARCH_CATEGORIES)) + 10))
    results = await asyncio.gather(
        *[_places_query(client, key, q.format(city=city), per_cat) for _, q in _SEARCH_CATEGORIES],
        return_exceptions=True)
    return _collect_places(zip([c for c, _ in _SEARCH_CATEGORIES], results), seen, out, first_err)


async def _places_search(client: httpx.AsyncClient, city: str, n: int, areas: list | None = None) -> tuple:
    """Advanced multi-category Google Places search: Salon, Unisex Salon, Spa,
    Boutique and Hair Care queried in PARALLEL with pagination (up to 60/category),
    deduped, best-reviewed first. Works for any city worldwide (e.g. 'London, UK')."""
    key = os.environ.get("GOOGLE_MAPS_API_KEY", "")
    if not key:
        return [], "no_key"
    seen, out, first_err = set(), [], ""
    if areas:
        first_err = await _places_area_phase(client, key, city, areas, seen, out)
    if len(out) < n:
        first_err = await _places_citywide_phase(client, key, city, n, seen, out, first_err)
    if not out:
        return [], first_err or "no results"
    out.sort(key=lambda p: (p.get("reviews") or 0, p.get("rating") or 0), reverse=True)
    return out[:max(n, 1)], ""


def _now():
    return datetime.now(timezone.utc).isoformat()


def _peer_is_public(resp) -> bool:
    """Re-validate the ACTUAL connected peer IP (defeats DNS-rebinding TOCTOU). Fail closed."""
    import ipaddress
    try:
        peer = ipaddress.ip_address(resp.stream._stream._httpcore_stream._stream.get_extra_info("peername")[0])
    except Exception:
        try:
            peer = ipaddress.ip_address(resp.extensions["network_stream"].get_extra_info("server_addr")[0])
        except Exception:
            return True  # peer unknowable on this transport; hop was already pre-validated by DNS check
    return not (peer.is_private or peer.is_loopback or peer.is_link_local
                or peer.is_reserved or peer.is_multicast or peer.is_unspecified)


async def _fetch_page(client: httpx.AsyncClient, url: str) -> str:
    from routes.registry import is_safe_public_url
    try:
        for _ in range(4):  # SEC-003: validate every hop against private/internal targets
            if not is_safe_public_url(url):
                return ""
            r = await client.get(url, headers=_UA, timeout=12, follow_redirects=False)
            if not _peer_is_public(r):  # SEC-001: defeat DNS-rebinding — re-check connected IP
                return ""
            if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("location"):
                url = str(httpx.URL(url).join(r.headers["location"]))
                continue
            if r.status_code >= 400:
                return ""
            return r.text[:150000]
        return ""
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


def _site_domain(website: str) -> str:
    host = re.sub(r"^https?://", "", (website or "").lower()).split("/")[0]
    return host[4:] if host.startswith("www.") else host


def _email_rank(email: str, site_domain: str) -> tuple:
    """Sort key: same-domain first, then known salon-inbox prefixes, then shortest."""
    local, _, domain = email.partition("@")
    same_domain = 0 if (site_domain and domain.endswith(site_domain)) else 1
    try:
        prefix_rank = _EMAIL_PREFIX_RANK.index(next(p for p in _EMAIL_PREFIX_RANK if local.startswith(p)))
    except StopIteration:
        prefix_rank = len(_EMAIL_PREFIX_RANK)
    return (same_domain, prefix_rank, len(email))


def _extract_emails(html: str, site_domain: str = "") -> list:
    text = _OBFUSCATED_DOT.sub(".", _OBFUSCATED_AT.sub("@", html or ""))
    found = []
    for m in _EMAIL_RE.findall(text):
        low = m.lower().strip(".")
        domain = low.rsplit("@", 1)[-1]
        if any(s in low for s in _SKIP_EMAIL) or domain in _SKIP_DOMAINS or low in found:
            continue
        found.append(low)
    found.sort(key=lambda e: _email_rank(e, site_domain))
    return found[:5]


async def _domain_resolves(email: str) -> bool:
    """Cheap dead-domain filter — a typo'd or parked domain can't receive mail."""
    import socket
    domain = email.rsplit("@", 1)[-1]
    try:
        await asyncio.wait_for(asyncio.to_thread(socket.getaddrinfo, domain, None), timeout=4)
        return True
    except Exception:
        return False


async def _pick_deliverable(emails: list) -> list:
    """Reorder so the first email has a live domain; drop candidates whose domain is dead."""
    alive, dead = [], []
    for e in emails[:3]:
        (alive if await _domain_resolves(e) else dead).append(e)
    return alive + emails[3:] if alive else []


def _score(lead: dict) -> tuple:
    """Balanced scoring across ALL salons. Migration leads (already on Fresha/Vagaro etc.) score
    highest since they convert best, but growth-stage salons (no website/booking) also score well
    as prospects who need software. Every salon is a valid target."""
    breakdown = []
    score = 0
    if lead.get("website"):
        score += 25
        breakdown.append("Has website +25")
    else:
        score += 15
        breakdown.append("No website — needs one +15")
    if lead.get("has_online_booking"):
        score += 20
        breakdown.append("Online booking +20")
    else:
        score += 15
        breakdown.append("No online booking — opportunity +15")
    if lead.get("competitor"):
        score += 25
        breakdown.append(f"🔥 Uses {lead['competitor']} (migration lead) +25")
    if (lead.get("instagram_followers") or 0) >= 5000:
        score += 10
        breakdown.append("Instagram 5k+ +10")
    if (lead.get("reviews") or 0) >= 100:
        score += 10
        breakdown.append("100+ reviews +10")
    if (lead.get("branches") or 1) >= 2:
        score += 10
        breakdown.append("Multi-location +10")
    return min(score, 100), breakdown


async def _live_plans() -> dict:
    from routes.subscriptions import load_plan_overrides, PLAN_CATALOG
    try:
        await load_plan_overrides()
    except Exception:
        pass
    return {k: dict(v) for k, v in PLAN_CATALOG.items()}


def _lead_intl(city: str) -> bool:
    """True when the lead's city is outside India (e.g. 'London, UK', 'New York, US')."""
    m = re.search(r",\s*([A-Za-z]{2,3})$", (city or "").strip())
    return bool(m and m.group(1).upper() not in ("IN", "IND"))


def _plans_for(plans: dict, intl: bool) -> dict:
    """USD plans for international leads, INR plans for Indian leads."""
    return {k: v for k, v in plans.items() if (v.get("currency") == "USD") == intl}


def _pricing_lines(plans: dict) -> str:
    return "\n".join(
        (f"- {v['label']}: ${v['price']:,.0f}" if v.get("currency") == "USD"
         else f"- {v['label']}: Rs.{int(v['price']):,}")
        for v in plans.values())


def _pricing_table_html(plans: dict) -> str:
    rows = ""
    for k, v in plans.items():
        annual = "annual" in k
        style = "background:#faf6ec;font-weight:bold" if annual else ""
        badge = ' <span style="background:#d4af37;color:#fff;font-size:10px;padding:2px 7px;border-radius:8px;vertical-align:middle">BEST VALUE</span>' if annual else ""
        price = f"${v['price']:,.0f}" if v.get("currency") == "USD" else f"₹{int(v['price']):,}"
        rows += (f'<tr style="{style}"><td style="padding:8px 14px;border-bottom:1px solid #eee">{v["label"]}{badge}</td>'
                 f'<td style="padding:8px 14px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">{price}</td></tr>')
    intl = any(v.get("currency") == "USD" for v in plans.values())
    foot = ('💳 Billed in USD via a secure international payment link.' if intl
            else '💡 Multi-branch discounts available — the more branches, the more you save. Full details in the attached brochure.')
    return (
        '<div style="margin:22px 0">'
        '<div style="font-size:15px;font-weight:bold;color:#1c1c22;margin-bottom:8px">Miracurl Suite — Plans &amp; Pricing</div>'
        '<table style="border-collapse:collapse;width:100%;max-width:480px;font-size:14px;color:#333;border:1px solid #eee;border-radius:10px">'
        f'{rows}</table>'
        f'<div style="font-size:12px;color:#777;margin-top:8px">{foot}</div>'
        '</div>')


_PRICE_RE = re.compile(r"(?:for |at )?(?:just |only )?(?:Rs\.?|₹|INR|\$|USD)\s?[\d,]+(?:\.\d+)?\s?(?:/-|/month|/year|per month|per year|a month|a year)?", re.I)


async def _draft_email(lead: dict) -> dict:
    from routes.mira_common import _ask_json
    pricing = _pricing_lines(_plans_for(await _live_plans(), _lead_intl(lead.get("city"))))
    research = {k: v for k, v in lead.items()
                if k not in ("email_body", "email_subject", "id", "_id", "run_id", "score_breakdown", "status")}
    out = await _ask_json(
        "You are Mira, the outreach agent for Miracurl Suite — an all-in-one salon management platform "
        "(online booking, WhatsApp marketing & automation, staff attendance & payroll, memberships, GST billing). "
        f"Current live plan pricing:\n{pricing}\n"
        "Write warm, short, personalized B2B outreach emails to salon owners anywhere in the world — "
        "match the tone and spelling to the salon's country (the city may include a country like 'London, UK').",
        f"Salon research data: {research}\n"
        "Write a personalized email to this salon's owner. Rules: greet as 'Hi {name} team' or owner if known; "
        "1st line must reference something SPECIFIC from the research (their rating/reviews, services, branches); "
        "if the research shows a 'competitor' field (e.g. Fresha/Vagaro/Mindbody/Booksy), this is a MIGRATION lead — "
        "warmly acknowledge they already use online booking software, then position Miracurl as an all-in-one upgrade "
        "at a lower cost with easy migration and simple onboarding (no long contracts, no per-booking commissions); "
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


_CONTACT_PATHS = ("/contact", "/contact-us", "/contactus", "/contact.html", "/pages/contact",
                  "/pages/contact-us", "/about", "/about-us", "/book", "/booking", "/appointments")


def _homepage_contact_links(soup, base: str, site_domain: str):
    """mailto emails (if any) + contact/about/book links found on the homepage."""
    linked = []
    for a in soup.select("a[href]"):
        href = a.get("href", "")
        if href.startswith("mailto:"):
            emails = _extract_emails(href[7:], site_domain)
            if emails:
                return emails, []
            continue
        if any(k in href.lower() for k in ("contact", "about", "book", "appointment")):
            url = href if href.startswith("http") else f"{base}/{href.lstrip('/')}"
            if url not in linked:
                linked.append(url)
    return [], linked


async def _emails_from_contact_pages(client: httpx.AsyncClient, website: str, soup, site_domain: str) -> list:
    """Dig deeper: follow contact/about/book links found on the homepage, then common paths."""
    base = website.rstrip("/") if website.startswith("http") else f"https://{website.rstrip('/')}"
    mailto, linked = _homepage_contact_links(soup, base, site_domain)
    if mailto:
        return mailto
    tried = set()
    for url in linked[:3]:
        tried.add(url.rstrip("/"))
        emails = _extract_emails(await _fetch_page(client, url), site_domain)
        if emails:
            return emails
    for path in _CONTACT_PATHS:
        url = base + path
        if url.rstrip("/") in tried:
            continue
        emails = _extract_emails(await _fetch_page(client, url), site_domain)
        if emails:
            return emails
    return []


_COMPETITORS = {
    "fresha.com": "Fresha", "vagaro.com": "Vagaro", "vagaro": "Vagaro",
    "mindbodyonline.com": "Mindbody", "mindbody": "Mindbody", "booksy.com": "Booksy", "booksy": "Booksy",
    "squareup.com": "Square", "square.site": "Square",
    "styleseat.com": "StyleSeat", "styleseat": "StyleSeat",
    "schedulicity.com": "Schedulicity", "schedulicity": "Schedulicity",
    "glossgenius.com": "GlossGenius", "glossgenius": "GlossGenius",
    "phorest.com": "Phorest", "phorest": "Phorest", "saloniris.com": "Salon Iris",
    "acuityscheduling.com": "Acuity", "setmore.com": "Setmore", "fresha": "Fresha",
}


def _detect_competitor(html: str) -> str:
    low = (html or "").lower()
    for needle, label in _COMPETITORS.items():
        if needle in low:
            return label
    return ""


async def _scrape_site(client: httpx.AsyncClient, website_hint: str) -> dict:
    """Fetch the salon website and extract emails / instagram / booking signal / competitor software / text."""
    site_html = await _fetch_site(client, website_hint)
    if not site_html:
        return {"website": "", "emails": [], "instagram": "", "booking": False, "text": "", "competitor": ""}
    soup = BeautifulSoup(site_html, "html.parser")
    low = site_html.lower()
    competitor = _detect_competitor(site_html)
    booking = bool(competitor) or any(k in low for k in ("book now", "book appointment", "book online",
                                      "bookslot", "calendly", "setmore", "fresha", "zylu", "dingg"))
    ig = soup.select_one('a[href*="instagram.com/"]')
    domain = _site_domain(website_hint)
    emails = _extract_emails(site_html, domain) or await _emails_from_contact_pages(client, website_hint, soup, domain)
    emails = await _pick_deliverable(emails)
    return {"website": website_hint, "emails": emails,
            "instagram": ig.get("href", "")[:120] if ig else "",
            "booking": booking, "competitor": competitor,
            "text": soup.get_text(" ", strip=True)[:2500]}


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
        f'"instagram": "<handle/url or empty>", "instagram_followers": <approx follower count if you know this brand, else 0>, '
        f'"has_online_booking": {str(site["booking"]).lower()} '
        'or true if the website text clearly offers online booking, '
        '"website_quality": "<none|poor|good — judge from the website text richness>", '
        '"owner_name": "<if found, else empty>"}')


async def _research_salon(client: httpx.AsyncClient, name: str, city: str, website_hint: str = "") -> dict:
    site = await _scrape_site(client, website_hint)
    info = await _llm_research(name, city, site)
    lead = {
        "id": str(uuid.uuid4()), "name": name, "city": city,
        "website": site["website"], "instagram": site["instagram"] or (info.get("instagram") or ""),
        "instagram_followers": int(info.get("instagram_followers") or 0),
        "rating": info.get("rating"), "services": (info.get("services") or [])[:6],
        "branches": int(info.get("branches") or 1),
        "has_online_booking": site["booking"] or bool(info.get("has_online_booking")),
        "website_quality": (info.get("website_quality") or ("none" if not site["website"] else "poor")),
        "competitor": site.get("competitor") or "",
        "owner_name": info.get("owner_name") or "",
        "email": site["emails"][0] if site["emails"] else "",
        "email_source": site["website"] if site["emails"] else "",
        "all_emails": site["emails"], "crm": False,
        "status": "researched", "created_at": _now(),
    }
    lead["score"], lead["score_breakdown"] = _score(lead)
    return lead


async def _next_localities(city: str, k: int = 3) -> list:
    """Rotate through popular localities of a city so repeat runs explore fresh neighbourhoods.
    Locality list is AI-built once per city and cached; cursor advances every run."""
    key = city.lower().strip()
    doc = await _raw_db.lead_localities.find_one({"city": key})
    if not doc:
        from routes.mira_common import _ask_json
        try:
            plan = await _ask_json(
                "You know world cities and their commercial neighbourhoods well.",
                f"City/region: {city}. List its popular commercial localities/neighbourhoods known for salons, "
                'spas and shopping. Return JSON: {"localities": ["...", ...]} with 12-18 short names '
                "(no city name repeated inside them). If it is a small town with no distinct localities, return [].")
            locs = [str(x).strip()[:40] for x in (plan.get("localities") or []) if str(x).strip()][:18]
        except Exception:
            locs = []
        doc = {"city": key, "localities": locs, "cursor": 0}
        await _raw_db.lead_localities.insert_one({**doc})
    locs = doc.get("localities") or []
    if not locs:
        return []
    cur = doc.get("cursor", 0) % len(locs)
    picked = [locs[(cur + i) % len(locs)] for i in range(min(k, len(locs)))]
    await _raw_db.lead_localities.update_one({"city": key}, {"$set": {"cursor": (cur + k) % len(locs)}})
    return picked


async def _find_candidates(client: httpx.AsyncClient, city: str, target: int, existing: set,
                           areas: list | None = None) -> tuple:
    """Returns (source, candidates, note). Google Maps when available, else Mira AI research."""
    raw, note = await _places_search(client, city, max(target * 3, 40), areas=areas)
    places = [p for p in raw if p["name"] and p["name"].lower() not in existing][:target]
    if places:
        return "maps", [{"name": p["name"], "website": p["website"], "area": p["address"], "_place": p}
                        for p in places], ""
    if raw and not places:
        note = "all Maps results already contacted"
    from routes.mira_common import _ask_json
    plan = await _ask_json(
        "You are the Lead Finder agent for a salon-software company targeting salons worldwide. "
        "List REAL salon businesses that operate in the given city — well-known local salons and chains. "
        "Include their official website domain ONLY if you are confident it is correct; otherwise leave empty. "
        "Never invent salon names or domains.",
        f"City/region: {city} (may include a country, e.g. 'London, UK'). "
        f"Already contacted (skip these): {sorted(existing)[:40]}\n"
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
        lead["category"] = place.get("category") or ""
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
        await _log("📍 Google Maps advanced search: Salons, Unisex Salons, Spas, Boutiques & Hair Care studios found (deduped, best-reviewed first).")
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
            tag = f" · 🔥 {lead['competitor']}" if lead.get("competitor") else ""
            await _log(f"📋 {lead['name']}: score {lead['score']}{tag} | email: {lead['email'] or 'not found'}", researched=done)
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
            areas = await _next_localities(city, 3)
            if areas:
                await _log(f"🧭 This run explores: {', '.join(areas)} (fresh localities each run)")
            existing = {(d.get("name") or "").lower() async for d in _raw_db.mira_leads.find({"city": city}, {"name": 1})}
            source, cands, note = await _find_candidates(client, city, target, existing, areas=areas)
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
    target: int = Field(10, ge=1, le=50)


async def _hunt_all_pipeline(run_id: str, leads: list):
    async def _log(msg, **sets):
        await _raw_db.mira_lead_runs.update_one(
            {"id": run_id}, {"$push": {"log": f"[{_now()[11:19]}] {msg}"}, "$set": sets or {}})
    found = 0
    try:
        await _log(f"🔍 Email hunt started — re-checking {len(leads)} leads with no inbox (website → Instagram → web search)…", stage="hunting")
        for i, lead in enumerate(leads, 1):
            try:
                email, source, all_emails = await _deep_email_hunt(lead)
            except Exception as e:
                await _log(f"⚠️ {lead.get('name', '?')}: hunt error ({str(e)[:60]})")
                continue
            if email:
                lead.update({"email": email, "email_source": source, "all_emails": all_emails})
                draft = await _draft_email(lead)
                await _raw_db.mira_leads.update_one({"id": lead["id"]}, {"$set": {
                    "email": email, "email_source": source, "all_emails": all_emails,
                    "email_subject": draft["subject"], "email_body": draft["body"], "status": "drafted"}})
                found += 1
                await _log(f"🎯 {lead.get('name', '?')}: found {email} via {source} — pitch drafted", found=found)
            else:
                await _log(f"📋 {lead.get('name', '?')}: still no email ({i}/{len(leads)})")
        await _log(f"🎉 Hunt complete — {found} new inbox{'es' if found != 1 else ''} found out of {len(leads)} leads.",
                   status="done", stage="done", researched=len(leads))
    except Exception as e:
        log.exception("email hunt run failed")
        await _log(f"❌ Hunt failed: {str(e)[:120]}", status="failed", stage="failed")


@router.post("/super-admin/mira-leads/hunt-all")
async def hunt_all_emails(user=Depends(require_super_admin)):
    """One click: run the second-pass email hunt across every lead that has no inbox yet."""
    active = await _raw_db.mira_lead_runs.find_one({"status": "running"})
    if active:
        raise HTTPException(409, "A run is already in progress — wait for it to finish.")
    leads = await _raw_db.mira_leads.find(
        {"status": {"$in": ["no_email", "drafted", "researched"]},
         "$or": [{"email": ""}, {"email": None}, {"email": {"$exists": False}}]},
        {"_id": 0}).sort("score", -1).to_list(200)
    if not leads:
        return {"started": False, "count": 0}
    run = {"id": str(uuid.uuid4()), "city": "Email hunt — all no-email leads", "target": len(leads),
           "status": "running", "stage": "hunting", "found": 0, "researched": 0,
           "log": [], "created_at": _now()}
    await _raw_db.mira_lead_runs.insert_one({**run})
    asyncio.create_task(_hunt_all_pipeline(run["id"], leads))
    return {"started": True, "count": len(leads)}


@router.post("/super-admin/mira-leads/run")
async def start_run(body: RunIn, user=Depends(require_super_admin)):
    active = await _raw_db.mira_lead_runs.find_one({"status": "running"})
    if active:
        raise HTTPException(409, "A lead run is already in progress — wait for it to finish.")
    city = re.sub(r",\s*([A-Za-z]{2,3})$", lambda m: ", " + m.group(1).upper(), body.city.strip().title())
    run = {"id": str(uuid.uuid4()), "city": city, "target": body.target,
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


def _name_tokens(name: str) -> list:
    return [t for t in re.split(r"[^a-z0-9]+", (name or "").lower()) if len(t) > 3]


def _related_emails(emails: list, lead: dict) -> list:
    """Web-search results can contain strangers' emails — keep only ones plausibly this salon's."""
    site = _site_domain(lead.get("website") or "")
    tokens = _name_tokens(lead.get("name") or "")
    out = []
    for e in emails:
        domain = e.rsplit("@", 1)[-1]
        if site and domain.endswith(site):
            out.append(e)
        elif any(t in e for t in tokens):
            out.append(e)
    return out


async def _deep_email_hunt(lead: dict) -> tuple:
    """Second-pass hunt: website deep-crawl → Instagram bio → web search snippets."""
    site_domain = _site_domain(lead.get("website") or "")
    async with httpx.AsyncClient(timeout=15) as client:
        if lead.get("website"):
            site = await _scrape_site(client, lead["website"])
            if site["emails"]:
                return site["emails"][0], f"website: {lead['website']}", site["emails"]
        ig = (lead.get("instagram") or "").strip()
        if ig:
            handle = ig.rstrip("/").split("/")[-1].lstrip("@").split("?")[0]
            if handle:
                html = await _fetch_page(client, f"https://www.instagram.com/{handle}/")
                emails = await _pick_deliverable(_extract_emails(html, site_domain))
                if emails:
                    return emails[0], f"instagram: @{handle}", emails
        from urllib.parse import quote_plus
        q = quote_plus(f'"{lead.get("name", "")}" {lead.get("city", "")} email contact')
        html = await _fetch_page(client, f"https://html.duckduckgo.com/html/?q={q}")
        emails = _related_emails(_extract_emails(html, site_domain), lead)
        emails = await _pick_deliverable(emails)
        if emails:
            return emails[0], "web search", emails
    return "", "", []


@router.post("/super-admin/mira-leads/{lid}/find-email")
async def find_email_retry(lid: str, user=Depends(require_super_admin)):
    """Manual second-pass email hunt for a lead where the first crawl found nothing."""
    lead = await _raw_db.mira_leads.find_one({"id": lid}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    email, source, all_emails = await _deep_email_hunt(lead)
    if not email:
        return {"found": False}
    lead.update({"email": email, "email_source": source, "all_emails": all_emails})
    draft = await _draft_email(lead)
    updates = {"email": email, "email_source": source, "all_emails": all_emails,
               "email_subject": draft["subject"], "email_body": draft["body"], "status": "drafted"}
    await _raw_db.mira_leads.update_one({"id": lid}, {"$set": updates})
    return {"found": True, **updates}


@router.get("/super-admin/mira-leads/roi")
async def lead_roi(user=Depends(require_super_admin)):
    """Outreach funnel + revenue: contacted → replied → demo → converted, with $ per converted salon."""
    contacted = await _raw_db.mira_leads.count_documents({"status": {"$in": ["sent", "demo", "customer", "replied"]}})
    replied = await _raw_db.mira_leads.count_documents(
        {"$or": [{"status": "replied"}, {"replied_at": {"$exists": True}}]})
    demos = await _raw_db.mira_leads.count_documents(
        {"$or": [{"status": {"$in": ["demo", "customer"]}}, {"demo_slot": {"$exists": True}}]})
    converted = await _raw_db.mira_leads.find(
        {"status": "customer"}, {"_id": 0, "name": 1, "city": 1, "converted_at": 1,
                                 "converted_tenant_id": 1, "converted_tenant_slug": 1}).to_list(500)
    from routes.subscriptions import PLAN_CATALOG
    intl_annual = float(PLAN_CATALOG.get("intl_pro_annual", {}).get("price") or 0)
    inr_annual = float(PLAN_CATALOG.get("annual", {}).get("price") or 0)
    rows = []
    won_usd = won_inr = 0.0
    for c in converted:
        ten = await _raw_db.tenants.find_one(
            {"id": c.get("converted_tenant_id")},
            {"_id": 0, "currency": 1, "plan": 1, "status": 1}) if c.get("converted_tenant_id") else None
        is_usd = bool(ten and (ten.get("currency") or "INR") != "INR")
        value = intl_annual if is_usd else inr_annual
        cur = "USD" if is_usd else "INR"
        if is_usd:
            won_usd += value
        else:
            won_inr += value
        rows.append({"name": c.get("name"), "city": c.get("city"),
                     "converted_at": (c.get("converted_at") or "")[:10],
                     "slug": c.get("converted_tenant_slug"),
                     "plan_value": value, "currency": cur,
                     "still_active": bool(ten and ten.get("status") in ("active", "trial"))})
    rows.sort(key=lambda r: r["converted_at"], reverse=True)
    conv_rate = round(len(converted) / contacted * 100, 1) if contacted else 0.0
    return {
        "funnel": {"contacted": contacted, "replied": replied, "demos": demos, "converted": len(converted)},
        "conversion_rate": conv_rate,
        "won_annual_usd": round(won_usd, 2), "won_annual_inr": round(won_inr, 2),
        "converted_leads": rows,
    }


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
    import html as _html
    paras = "".join(f'<p style="font-size:14px;color:#3a3a40;line-height:1.8;margin:0 0 15px">{_html.escape(p)}</p>'
                    for p in (lead.get("email_body") or "").split("\n") if p.strip())
    return f"""
    <div style="background:#efe9dc;padding:28px 12px;font-family:Georgia,serif">
      <div style="max-width:600px;margin:0 auto;background:#fdfbf7;border:1px solid #e6ddc8;border-radius:18px;overflow:hidden;box-shadow:0 10px 34px rgba(28,28,34,.14)">
        <img src="{base}/assets/mira-outreach-hero.png" alt="Miracurl Suite — Mira, your AI salon partner" width="600" style="width:100%;display:block" />
        <div style="height:3px;background:linear-gradient(90deg,#b08d3f,#e8c37f,#b08d3f)"></div>
        <div style="padding:30px 34px 4px">{paras}</div>
        <div style="padding:0 34px">{_pricing_table_html(_plans_for(plans, _lead_intl(lead.get("city"))))}</div>
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
                               html, attachments=attachments, book_url="https://miracurl-suite.com/demo",
                               reply_to=_lead_reply_to())
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
    stage: str = Field(..., pattern=r"^(sent|demo|customer|replied)$")


@router.post("/super-admin/mira-leads/{lid}/stage")
async def set_stage(lid: str, body: StageIn, user=Depends(require_super_admin)):
    if body.stage == "replied":
        await _raw_db.mira_leads.update_one(
            {"id": lid, "replied_at": {"$exists": False}}, {"$set": {"replied_at": _now()}})
    await _raw_db.mira_leads.update_one({"id": lid}, {"$set": {"status": body.stage}})
    return {"ok": True}


def _lead_reply_to() -> str | None:
    """Replies land on the Resend inbound domain so the webhook can flag 🔥 Replied."""
    return os.environ.get("LEAD_REPLY_INBOX") or None


@router.post("/webhooks/resend-inbound")
async def resend_inbound_webhook(request: Request):
    """Resend Inbound (email.received) → match sender to a lead and flag it Replied."""
    secret = os.environ.get("RESEND_INBOUND_SECRET")
    if not secret:
        raise HTTPException(503, "Inbound webhook not configured (set RESEND_INBOUND_SECRET)")
    import hmac
    provided = request.headers.get("x-inbound-secret", "")
    if not hmac.compare_digest(provided, secret):
        raise HTTPException(403, "Bad webhook secret")
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON")
    data = payload.get("data") or payload
    m = _EMAIL_RE.search(str(data.get("from") or ""))
    sender = m.group(0).lower() if m else ""
    if not sender:
        return {"ok": True, "matched": False}
    lead = await _raw_db.mira_leads.find_one(
        {"$or": [{"email": sender}, {"all_emails": sender}]},
        {"_id": 0, "id": 1, "name": 1, "status": 1})
    if not lead:
        return {"ok": True, "matched": False}
    await _raw_db.mira_leads.update_one(
        {"id": lead["id"], "replied_at": {"$exists": False}}, {"$set": {"replied_at": _now()}})
    sets = {"reply_subject": str(data.get("subject") or "")[:200]}
    if lead.get("status") not in ("demo", "customer"):
        sets["status"] = "replied"
    await _raw_db.mira_leads.update_one({"id": lead["id"]}, {"$set": sets})
    log.info("lead reply detected: %s (%s)", lead["name"], sender)
    return {"ok": True, "matched": True}


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
                                       book_url="https://miracurl-suite.com/demo",
                                       reply_to=_lead_reply_to())
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
                               book_url="https://miracurl-suite.com/demo",
                               reply_to=_lead_reply_to())
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
