"""Mira finds leads everywhere — Instagram, Facebook, LinkedIn, web directories and email footprints —
not just Google Maps. Search-engine discovery (DDG → Bing fallback) + Mira normalises the hits into leads."""
import asyncio
import html as html_lib
import logging
import re
import uuid
from datetime import datetime, timezone
from urllib.parse import parse_qs, quote_plus, unquote, urlparse

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from database import _raw_db
from security import require_super_admin

router = APIRouter()
log = logging.getLogger("lead_discover")

SOURCES = {
    "google": ("Google Places", "{noun}s in {city}"),
    "instagram": ("Instagram", 'site:instagram.com "{noun}" "{city}"'),
    "facebook": ("Facebook", 'site:facebook.com "{noun}" "{city}"'),
    "linkedin": ("LinkedIn", 'site:linkedin.com/company "{noun}" "{city}"'),
    "web": ("Web directories", '"{noun}" "{city}" (justdial OR sulekha OR yelp OR tripadvisor OR zomato OR "book online")'),
    "email": ("Email footprints", '"{noun}" "{city}" "@gmail.com" OR "@yahoo.com" OR "contact us"'),
}
_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{8,}\d)")
_RESULT_RE = re.compile(r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>.*?(?:<a[^>]+class="result__snippet"[^>]*>(.*?)</a>)?', re.DOTALL)
_BING_RE = re.compile(r'<li class="b_algo".*?<h2><a href="([^"]+)"[^>]*>(.*?)</a></h2>.*?(?:<p[^>]*>(.*?)</p>)?', re.DOTALL)
_UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept-Language": "en"}
_SYS = ("You are Mira, Miracurl Suite's lead researcher. From raw search hits, extract REAL local businesses of the requested type in the "
        "requested city. Skip aggregators, articles, job posts, and duplicates. For each business return: name, city, source "
        "(instagram|facebook|linkedin|web|email), url, handle (instagram/facebook handle if any), email (only if literally present), "
        "phone (only if literally present, keep country code), owner_name (if present), note (one line: why they're a good fit). "
        "Reply ONLY with JSON {\"leads\": [...]} — max 15 items.")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(t: str) -> str:
    return html_lib.unescape(re.sub(r"<[^>]+>", "", t or "")).strip()


def _ddg_url(href: str) -> str:
    if "duckduckgo.com/l/" in href:
        q = parse_qs(urlparse(href).query).get("uddg")
        return unquote(q[0]) if q else href
    return href


async def _search(client: httpx.AsyncClient, query: str) -> list[dict]:
    from routes.lead_gen import _fetch_page
    for url, rx in ((f"https://html.duckduckgo.com/html/?q={quote_plus(query)}", _RESULT_RE), (f"https://www.bing.com/search?q={quote_plus(query)}&setlang=en", _BING_RE)):
        page = await _fetch_page(client, url)
        if not page or "complete the following challenge" in page:
            continue
        hits = [{"url": _ddg_url(html_lib.unescape(m.group(1))), "title": _clean(m.group(2)), "snippet": _clean(m.group(3) or "")} for m in rx.finditer(page)]
        if hits:
            return hits[:12]
    return []


async def _google_places(noun: str, city: str, want: int) -> list[dict]:
    """Structured, phone-rich results straight from Google Places (no LLM needed) — works even when social search is rate-limited."""
    import os
    from routes.lead_gen import _places_query
    key = os.environ.get("GOOGLE_MAPS_API_KEY", "")
    if not key:
        return []
    try:
        async with httpx.AsyncClient() as client:
            places = await _places_query(client, key, f"{noun}s in {city}", min(want, 20))
    except Exception as e:  # noqa: BLE001
        log.warning("google places discovery failed: %s", e)
        return []
    return [{"name": p["name"], "source": "google", "url": p.get("website") or "", "phone": p.get("phone") or "", "email": "",
             "rating": p.get("rating"), "reviews": p.get("reviews"), "address": p.get("address") or "",
             "note": f"Google Places · {p.get('rating') or '–'}★ ({p.get('reviews') or 0} reviews)"} for p in places if p.get("name")]


class DiscoverIn(BaseModel):
    vertical: str = Field("salon", pattern="^(salon|restaurant)$")
    city: str = Field(..., min_length=2, max_length=60)
    sources: list[str] = Field(default_factory=lambda: list(SOURCES))
    limit: int = Field(15, ge=1, le=30)


@router.get("/super-admin/mira-leads/discover/sources")
async def discover_sources(user=Depends(require_super_admin)):
    return {"sources": [{"id": k, "label": v[0]} for k, v in SOURCES.items()]}


@router.post("/super-admin/mira-leads/discover")
async def discover_leads(body: DiscoverIn, user=Depends(require_super_admin)):
    """Search every selected channel, let Mira normalise the hits, save new leads (deduped by url/handle/phone/email)."""
    from routes.mira_common import _ask_json
    from services.mira_brain import FAST_MODEL, brain_prompt, learn
    noun = "restaurant" if body.vertical == "restaurant" else "salon"
    picked = [s for s in body.sources if s in SOURCES] or list(SOURCES)
    google_leads = []
    if "google" in picked:
        google_leads = await _google_places(noun, body.city, body.limit)
        picked = [s for s in picked if s != "google"]
    async with httpx.AsyncClient(headers=_UA) as client:
        results = await asyncio.gather(*[_search(client, SOURCES[s][1].format(noun=noun, city=body.city)) for s in picked])
    raw = []
    for src, hits in zip(picked, results):
        for h in hits:
            raw.append({"source": src, **h, "emails": _EMAIL_RE.findall(h["snippet"])[:2], "phones": [p.strip() for p in _PHONE_RE.findall(h["snippet"])][:2]})
    per_source = {s: len(h) for s, h in zip(picked, results)}
    if google_leads:
        per_source["google"] = len(google_leads)
    if not raw and not google_leads:
        return {"found": 0, "saved": 0, "per_source": per_source, "leads": [], "note": "Search engines returned nothing (possibly rate-limited) — try again in a minute or a different city."}
    out = {"leads": []} if not raw else await _ask_json(_SYS + await brain_prompt(20), f"Business type: {noun}. City: {body.city}.\n\nSearch hits:\n" + "\n".join(
        f"[{r['source']}] {r['title']} | {r['url']} | {r['snippet'][:220]} | emails={r['emails']} phones={r['phones']}" for r in raw[:60]), model=FAST_MODEL)
    leads = (google_leads + [l for l in (out.get("leads") or []) if isinstance(l, dict) and l.get("name")])[:max(body.limit, len(google_leads))]
    run_id = str(uuid.uuid4())
    saved = []
    for l in leads:
        url, handle = (l.get("url") or "").strip(), (l.get("handle") or "").strip().lstrip("@")
        if url and not re.match(r"^https?://[^\s<>\"']+$", url):
            url = ""
        email, phone = (l.get("email") or "").strip().lower(), re.sub(r"[^\d+]", "", l.get("phone") or "")
        dup_or = [{"name": {"$regex": f"^{re.escape(l['name'])}$", "$options": "i"}, "city": {"$regex": f"^{re.escape(body.city)}$", "$options": "i"}}]
        if url:
            dup_or.append({"website": url})
        if handle:
            dup_or.append({"instagram": handle})
        if email:
            dup_or.append({"email": email})
        if len(phone) >= 10:
            dup_or.append({"phone": {"$regex": f"{phone[-10:]}$"}})
        if await _raw_db.mira_leads.find_one({"$or": dup_or}, {"_id": 1}):
            continue
        doc = {"id": str(uuid.uuid4()), "name": l["name"][:120], "city": body.city, "vertical": body.vertical, "run_id": run_id,
               "source": l.get("source") if l.get("source") in SOURCES else "web", "website": url if url and "instagram.com" not in url and "facebook.com" not in url and "linkedin.com" not in url else "",
               "address": (l.get("address") or "")[:160],
               "instagram": handle if "instagram" in (l.get("source") or "") else "", "social_url": url,
               "email": email if _EMAIL_RE.fullmatch(email or "") else "", "phone": (f"+{phone.lstrip('+')}" if len(phone) >= 10 else ""),
               "owner_name": (l.get("owner_name") or "")[:80], "rating": l.get("rating"), "reviews": l.get("reviews") or 0,
               "score": 55 if l.get("source") == "google" and len(phone) >= 10 else 35, "score_breakdown": [f"found on {l.get('source')}"] + ([f"{l.get('rating')}★ · {l.get('reviews')} reviews"] if l.get("rating") else []),
               "notes": (l.get("note") or "")[:240], "crm": False, "status": "researched" if (email or len(phone) >= 10) else "no_email",
               "discovered_by": "mira_discover", "created_at": _now()}
        await _raw_db.mira_leads.insert_one(dict(doc))
        saved.append(doc)
    await _raw_db.mira_lead_runs.insert_one({"id": run_id, "kind": "discover", "vertical": body.vertical, "city": body.city, "sources": picked,
                                            "found": len(leads), "saved": len(saved), "per_source": per_source, "by": user.get("email"), "created_at": _now()})
    if saved:
        best = max(per_source, key=per_source.get)
        await learn("discovery", f"{body.city} {noun}s: {len(saved)} new leads from {', '.join(picked)} — richest source was {SOURCES[best][0]}.")
    return {"found": len(leads), "saved": len(saved), "per_source": per_source, "run_id": run_id, "leads": saved}
