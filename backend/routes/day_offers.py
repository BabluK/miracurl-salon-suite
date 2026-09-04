"""Mira Day-Smart Offers — weekday-aware AI offer suggestions with one-tap flyer download."""
import logging
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from database import db, _raw_db
from festivals import festival_info, festival_prompt_line, festival_today
from security import require_tenant_admin, current_tenant

router = APIRouter()
log = logging.getLogger("day_offers")

IST = timedelta(hours=5, minutes=30)
DAY_STRATEGY = {
    0: "Monday — one of the QUIETEST days. Be aggressive: 25-35% off on slow-moving or high-margin services, or a value combo to pull walk-ins.",
    1: "Tuesday — quiet day. Aggressive offer: 20-30% off, ideally bundling a popular service with a slow-moving one.",
    2: "Wednesday — quiet mid-week day. Strong offer: 20-30% off or 1+1 style combos to fill empty chairs.",
    3: "Thursday — still a lean day. Good discount 15-25%, tease the weekend ('beat the weekend rush').",
    4: "Friday — footfall picks up. Light offer only: 5-10% off premium add-ons or an upsell package. No deep discounts needed.",
    5: "Saturday — BUSIEST day. Do NOT discount core services. Suggest premium upsell packages, add-on bundles or a small perk (free hair spa upgrade etc).",
    6: "Sunday — very busy. No deep discounts. Premium packages, family combos, or loyalty perks only.",
}


def _today_ist() -> datetime:
    return datetime.now(timezone.utc) + IST


def _invoice_stats(invoices: list) -> dict:
    """Service sales counts, weekday footfall and 7-day trend from recent invoices."""
    svc_counts: dict = {}
    weekday_counts = [0] * 7
    last7, prev7 = 0, 0
    now_utc = datetime.now(timezone.utc)
    for inv in invoices:
        try:
            dt = datetime.fromisoformat(inv["created_at"].replace("Z", "+00:00"))
            weekday_counts[dt.weekday()] += 1
            age = (now_utc - dt).days
            if age < 7:
                last7 += 1
            elif age < 14:
                prev7 += 1
        except (ValueError, KeyError):
            pass
        for it in inv.get("items") or []:
            if it.get("type") == "service":
                svc_counts[it["name"]] = svc_counts.get(it["name"], 0) + int(it.get("qty") or 1)
    return {"svc_counts": svc_counts, "weekday_counts": weekday_counts, "last7": last7, "prev7": prev7}


def _post_engagement_score(p: dict) -> int:
    score = 0
    for plat in ("instagram", "facebook"):
        e = (p.get("engagement") or {}).get(plat) or {}
        score += int(e.get("likes") or 0) + int(e.get("comments") or 0) * 2 + int(e.get("shares") or 0) * 3
    return score


def _engagement_scores(posts: list, services: list) -> dict:
    """Per-service social engagement score (likes + 2×comments + 3×shares) from past posts."""
    svc_eng: dict = {}
    for p in posts:
        score = _post_engagement_score(p)
        if not score:
            continue
        cap = (p.get("caption") or "").lower()
        for s in services:
            if s["name"].lower() in cap:
                svc_eng[s["name"]] = svc_eng.get(s["name"], 0) + score
    return svc_eng


async def _catalog_context(t: dict) -> dict:
    services = await db.services.find(
        {"active": {"$ne": False}}, {"_id": 0, "name": 1, "price": 1, "category": 1}).sort("price", -1).to_list(300)
    since = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    invoices = await db.invoices.find(
        {"created_at": {"$gte": since}}, {"_id": 0, "items": 1, "created_at": 1}).to_list(3000)
    stats = _invoice_stats(invoices)
    ranked = sorted(stats["svc_counts"].items(), key=lambda x: -x[1])
    slow = [s["name"] for s in services if s["name"] not in stats["svc_counts"]][:8]
    eng_posts = await _raw_db.social_posts.find(
        {"tenant_id": t["id"], "engagement": {"$exists": True}},
        {"_id": 0, "caption": 1, "engagement": 1}).to_list(100)
    svc_eng = _engagement_scores(eng_posts, services)
    return {
        "services": services,
        "top_services": ranked[:8],
        "slow_services": slow or [n for n, _ in ranked[-5:]],
        "weekday_invoices": stats["weekday_counts"],
        "last7": stats["last7"], "prev7": stats["prev7"],
        "engagement": sorted(svc_eng.items(), key=lambda x: -x[1])[:8],
    }


def _auto_tier(ctx: dict, now: datetime) -> tuple[str | None, str]:
    """Mira's auto-rhythm: budget crowd-pullers when footfall is dropping,
    premium high-margin offers on historically lean weekdays, free choice otherwise."""
    last7, prev7 = ctx.get("last7", 0), ctx.get("prev7", 0)
    if prev7 >= 5 and last7 < prev7 * 0.7:
        return "budget", (f"footfall is DOWN — only {last7} bills in the last 7 days vs {prev7} the week before; "
                          "an affordable crowd-puller will bring volume back")
    wk = ctx.get("weekday_invoices") or [0] * 7
    if sum(wk) >= 14:
        avg = sum(wk) / 7
        if wk[now.weekday()] < avg * 0.8:
            return "premium", (f"{now.strftime('%A')}s are historically lean here ({wk[now.weekday()]} bills vs "
                               f"{avg:.0f}/day average) — a deep deal on premium services fills chairs with high-ticket clients")
    return None, ""


@dataclass
class OfferOpts:
    kind: str = "daily"
    retry_hint: str = ""
    forced_pct: int | None = None
    tier: str | None = None
    auto_reason: str = ""


def _tier_line(opts: OfferOpts) -> str:
    if opts.tier not in ("premium", "budget"):
        return ""
    who = "MIRA'S AUTO-STRATEGY" if opts.auto_reason else "OWNER'S CHOICE"
    why = f" Why: {opts.auto_reason}. Weave this into your reasoning." if opts.auto_reason else ""
    if opts.tier == "premium":
        return (f"{who} — build today's offer ONLY from HIGH-TICKET premium services "
                "(the most expensive items in the catalog, e.g. Hair Color, Keratin, Botox, Hydra/Gold Facial). "
                f"Pick 1-3 of the priciest relevant services — high margin matters today.{why}\n")
    return (f"{who} — build today's offer ONLY from BUDGET-FRIENDLY services "
            "(lower-priced items well below the catalog's top prices, e.g. haircut, threading, basic facial, "
            f"basic mani-pedi). The goal is affordable walk-in volume, not big tickets.{why}\n")


def _build_offer_prompt(t: dict, ctx: dict, now: datetime, opts: OfferOpts) -> str:
    catalog = "\n".join(f"- {s['name']} · ₹{s['price']:.0f} ({s.get('category') or 'General'})" for s in ctx["services"][:30])
    tops = ", ".join(f"{n} ({c} sold)" for n, c in ctx["top_services"]) or "no sales data yet"
    slows = ", ".join(ctx["slow_services"]) or "none"
    strategy = DAY_STRATEGY[now.weekday()]
    eng = ", ".join(f"{n} ({c} pts)" for n, c in ctx.get("engagement", []))
    eng_line = (f"AUDIENCE INSIGHTS — services ranked by likes/comments on this salon's past social posts: {eng}. "
                "When choices are equal, prefer high-engagement services — the audience loves them.\n") if eng else ""
    pct_rule = '"discount_pct":<int 0-40>'
    if opts.forced_pct:
        strategy = (f"IMPORTANT — the salon OWNER has fixed today's discount at exactly {opts.forced_pct}%. "
                    f"You MUST apply exactly {opts.forced_pct}% off. Your job is only to pick WHICH 1-3 services "
                    f"benefit most from a {opts.forced_pct}% discount today. (Day context: {strategy})")
        pct_rule = f'"discount_pct":{opts.forced_pct}'
    validity = "TODAY only, valid today"
    if opts.kind == "flash":
        strategy = ("🔴 FLASH SITUATION: CCTV shows several chairs sitting EMPTY right now. "
                    "Design an aggressive limited-time flash offer valid for the NEXT 2 HOURS ONLY "
                    "(25-40% off or an irresistible instant combo) to pull walk-ins immediately. "
                    "Copy must feel urgent — 'next 2 hours', 'walk in now'.")
        validity = "the NEXT 2 HOURS only"
    return (
        f"Salon: {t.get('name')}. Today is {now.strftime('%A, %d %B %Y')}, time {now.strftime('%I:%M %p')} IST.\n"
        f"Day strategy: {strategy}\n"
        f"{festival_prompt_line(now.date())}"
        f"{_tier_line(opts)}"
        f"Last-60-days bills per weekday (Mon..Sun): {ctx['weekday_invoices']}\n"
        f"Best sellers: {tops}\nSlow-moving services: {slows}\n"
        f"{eng_line}"
        f"SERVICE CATALOG (real prices — never invent services):\n{catalog}\n"
        f"{opts.retry_hint}\n"
        f"Design ONE irresistible offer valid {validity}. Pick 1-3 REAL services from the catalog. "
        "Compute offer prices from the real prices using your chosen discount. "
        'Return JSON: {"title":"<catchy 4-7 word offer name>","offer_text":"<one punchy line, e.g. Flat 25% OFF ...>",'
        f'{pct_rule},"services":[{{"name":"<exact catalog name>","original_price":<num>,"offer_price":<num>}}],'
        '"reasoning":"<2-3 sentences: why THIS offer for THIS moment, mention footfall pattern>",'
        '"whatsapp_caption":"<ready-to-post WhatsApp/Instagram caption with emojis, mention the validity window>"}'
        "\nTITLE RULE: the title may only mention service types actually included in the offer — "
        "never call it a 'Spa' deal (or any other category) unless that exact type of service is in the list.")


def _norm_svc(x) -> str:
    return re.sub(r"[^a-z0-9]", "", str(x).lower())


def _resolve_offer_line(s: dict, real: dict, pct: int) -> dict:
    """One offer line with name & prices taken from the REAL catalog — never trust LLM numbers."""
    name = str(s.get("name", ""))[:60]
    key = _norm_svc(name)
    hit = real.get(key)
    if hit is None and real and key:
        match = next((k for k in real if k in key or key in k), None)
        hit = real.get(match)
    if hit:
        name, orig = hit
    else:
        orig = float(s.get("original_price") or 0)
    offer = float(s.get("offer_price") or 0)
    if pct:
        offer = float(max(0, round(orig * (1 - pct / 100))))
    elif offer <= 0 or offer > orig > 0:
        offer = orig
    return {"name": name, "original_price": orig, "offer_price": offer}


def _sanitize_offer_services(raw: list, catalog: list | None, pct: int) -> list:
    real = {_norm_svc(s["name"]): (str(s["name"])[:60], float(s.get("price") or 0)) for s in (catalog or [])}
    return [_resolve_offer_line(s, real, pct) for s in raw[:3]]


def _offer_doc(t: dict, data: dict, now: datetime, kind: str, catalog: list | None = None) -> dict:
    if not data.get("title") or not isinstance(data.get("services"), list):
        raise HTTPException(400, "Mira returned an unexpected offer format — try again")
    pct = int(data.get("discount_pct") or 0)
    services = _sanitize_offer_services(data["services"], catalog, pct)
    return {
        "id": str(uuid.uuid4()), "tenant_id": t["id"], "date": now.date().isoformat(),
        "day_name": now.strftime("%A"), "kind": kind,
        "title": str(data["title"])[:80], "offer_text": str(data.get("offer_text") or "")[:140],
        "discount_pct": pct,
        "services": services,
        "reasoning": str(data.get("reasoning") or "")[:500],
        "whatsapp_caption": str(data.get("whatsapp_caption") or "")[:600],
        "status": "suggested", "created_at": datetime.now(timezone.utc).isoformat(),
    }


async def _suggest_offer(t: dict, retry_hint: str = "", kind: str = "daily",
                         forced_pct: int | None = None, tier: str | None = None) -> dict:
    from routes.mira_studio import _ask_json
    from security import ai_daily_quota
    await ai_daily_quota(t["id"], "admin_ai_suggest", 80)
    now = _today_ist()
    ctx = await _catalog_context(t)
    auto_reason = ""
    if tier is None and kind == "daily":
        tier, auto_reason = _auto_tier(ctx, now)
    opts = OfferOpts(kind=kind, retry_hint=retry_hint, forced_pct=forced_pct, tier=tier, auto_reason=auto_reason)
    if t.get("business_type") == "restaurant":
        system = ("You are Mira, an expert restaurant revenue strategist for Indian restaurants. You know weekends are busy "
                  "and Mon-Thu are lean for dine-in, and you design day-smart food offers (category specials, combo deals, "
                  "family discounts) that maximise table occupancy AND margin.")
    else:
        system = ("You are Mira, an expert salon revenue strategist for Indian salons. You know Fri-Sat-Sun are busy "
                  "and Mon-Thu are lean, and you design day-smart offers that maximise chair occupancy AND margin.")
    data = await _ask_json(system, _build_offer_prompt(t, ctx, now, opts))
    if forced_pct:
        data["discount_pct"] = forced_pct
    doc = _offer_doc(t, data, now, kind, catalog=ctx.get("services"))
    if tier:
        doc["tier"] = tier
        doc["tier_auto"] = bool(auto_reason)
    await _raw_db.day_offers.delete_many({"tenant_id": t["id"], "date": doc["date"], "status": "suggested", "kind": kind})
    await _raw_db.day_offers.insert_one({**doc})
    return doc


@router.get("/day-offers/today")
async def today_offer(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    today_dt = _today_ist().date()
    today = today_dt.isoformat()
    fest = festival_info(today_dt)
    accepted = await _raw_db.day_offers.find_one(
        {"tenant_id": t["id"], "date": today, "status": "accepted", "kind": {"$ne": "flash"}}, {"_id": 0})
    if accepted:
        return {"offer": accepted, "festival": fest}
    suggested = await _raw_db.day_offers.find_one(
        {"tenant_id": t["id"], "date": today, "status": "suggested", "kind": {"$ne": "flash"}}, {"_id": 0})
    return {"offer": suggested, "festival": fest}


class SuggestIn(BaseModel):
    discount_pct: int | None = None
    tier: str | None = None


def _clean_pct(v: int | None) -> int | None:
    return max(1, min(70, int(v))) if v else None


def _clean_tier(v: str | None) -> str | None:
    return v if v in ("premium", "budget") else None


@router.post("/day-offers/suggest")
async def suggest_offer(body: SuggestIn = SuggestIn(), user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    today = _today_ist().date().isoformat()
    accepted = await _raw_db.day_offers.find_one(
        {"tenant_id": t["id"], "date": today, "status": "accepted", "kind": {"$ne": "flash"}}, {"_id": 0})
    if accepted:
        return {"offer": accepted, "already_accepted": True}
    return {"offer": await _suggest_offer(t, forced_pct=_clean_pct(body.discount_pct), tier=_clean_tier(body.tier))}


@router.post("/day-offers/suggest-another")
async def suggest_another(body: SuggestIn = SuggestIn(), user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return {"offer": await _suggest_offer(
        t, retry_hint="Give a DIFFERENT idea than before — vary the services or offer style.",
        forced_pct=_clean_pct(body.discount_pct), tier=_clean_tier(body.tier))}


@router.post("/day-offers/unlock")
async def unlock_offer(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Owner changed their mind — discard today's accepted daily offer so a new one can be generated."""
    today = _today_ist().date().isoformat()
    await _raw_db.day_offers.delete_many(
        {"tenant_id": t["id"], "date": today, "kind": {"$ne": "flash"}})
    return {"ok": True}


class ReflyerIn(BaseModel):
    template: str | None = None


def _offer_flyer_in(doc: dict, template: str):
    from routes.offer_flyer import FlyerIn
    return FlyerIn(
        template=template,
        headline=doc["title"],
        offer_text=doc["offer_text"],
        services=[f"{s['name']} ₹{s['offer_price']:.0f}" for s in doc["services"]],
        valid_until=f"Today only · {doc['day_name']}")


@router.post("/day-offers/regenerate-flyer")
async def regenerate_flyer(body: ReflyerIn = ReflyerIn(), user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Fresh poster design for today's accepted offer — the offer itself doesn't change."""
    today = _today_ist().date().isoformat()
    doc = await _raw_db.day_offers.find_one(
        {"tenant_id": t["id"], "date": today, "status": "accepted", "kind": {"$ne": "flash"}}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "No accepted offer today")
    from routes.offer_flyer import create_flyer, TEMPLATES, auto_template
    if body.template and body.template in TEMPLATES:
        template = body.template
    else:
        template = auto_template(exclude=doc.get("flyer_template"))
    flyer = await create_flyer(_offer_flyer_in(doc, template), user=user, t=t)
    patch = {"flyer_id": flyer["id"], "flyer_url": flyer["url"], "flyer_template": template}
    await _raw_db.day_offers.update_one({"id": doc["id"]}, {"$set": patch})
    return {"offer": {**doc, **patch}}


class AcceptIn(BaseModel):
    offer_id: str
    template: str | None = None  # None → Mira auto-picks (festival design when a festival is near)
    discount_pct: int | None = None  # owner-adjusted % — prices recalculated server-side
    service_names: list[str] | None = None  # owner-tuned service list (swap/remove/add before locking in)


async def _apply_services(doc: dict, names: list) -> dict:
    """Owner swapped services on the suggestion — rebuild the list from the real catalog."""
    catalog = await db.services.find({"active": {"$ne": False}}, {"_id": 0, "name": 1, "price": 1}).to_list(300)
    real = {s["name"].lower().strip(): s for s in catalog}
    pct = int(doc.get("discount_pct") or 0)
    services = []
    for n in names[:6]:
        m = real.get(str(n).lower().strip())
        if m:
            price = float(m["price"])
            services.append({"name": m["name"], "original_price": price,
                             "offer_price": float(max(0, round(price * (1 - pct / 100))))})
    if not services:
        raise HTTPException(400, "None of those services are on your menu — refresh and try again")
    doc["services"] = services
    return doc


def _apply_pct(doc: dict, pct: int) -> dict:
    """Owner changed the discount % — recompute prices and swap the % in the copy."""
    old = int(doc.get("discount_pct") or 0)
    for s in doc.get("services") or []:
        s["offer_price"] = float(max(0, round(float(s.get("original_price") or 0) * (1 - pct / 100))))
    doc["discount_pct"] = pct
    if old and old != pct:
        for f in ("title", "offer_text", "whatsapp_caption"):
            doc[f] = (doc.get(f) or "").replace(f"{old}%", f"{pct}%")
    return doc


async def _accept_flyer(doc: dict, template: str, user, t) -> tuple:
    from routes.offer_flyer import create_flyer
    try:
        flyer = await create_flyer(_offer_flyer_in(doc, template), user=user, t=t)
        return flyer["id"], flyer["url"]
    except Exception as e:
        logging.getLogger("day_offers").warning(f"flyer generation failed, accepting without flyer: {e}")
        return None, None


async def _auto_post_socials(request: Request, t: dict, doc: dict, flyer_url) -> tuple:
    google_post, meta_post = None, None
    try:
        from routes.social_connect import publish_google_post, publish_content, _base
        lines = "\n".join(f"• {s['name']}: ₹{s['offer_price']:.0f} (was ₹{s['original_price']:.0f})" for s in doc["services"])
        summary = f"{doc['title']}\n{doc['offer_text']}\n{lines}\nValid TODAY only — walk in or book now!"
        image_abs = f"{_base(request)}{flyer_url}" if flyer_url else None
        google_post = await publish_google_post(t["id"], summary, image_abs, offer_title=doc["title"])
        if image_abs:
            meta_post = await publish_content(
                t["id"], doc.get("whatsapp_caption") or summary, image_abs, ["instagram", "facebook"])
        else:
            meta_post = {"instagram": {"ok": False, "error": "No flyer image"},
                         "facebook": {"ok": False, "error": "No flyer image"}}
    except Exception as e:
        logging.getLogger("day_offers").warning(f"social auto-post failed: {e}")
        google_post = google_post or {"ok": False, "error": str(e)[:200]}
    return google_post, meta_post


class ServicesUpdateIn(BaseModel):
    service_names: list[str]


@router.post("/day-offers/update-services")
async def update_offer_services(body: ServicesUpdateIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Owner hand-picks which menu services today's (locked) offer applies to — live on the booking page instantly."""
    today = _today_ist().date().isoformat()
    doc = await _raw_db.day_offers.find_one(
        {"tenant_id": t["id"], "date": today, "status": {"$in": ["accepted", "suggested"]}, "kind": {"$ne": "flash"}},
        {"_id": 0}, sort=[("accepted_at", -1)])
    if not doc:
        raise HTTPException(404, "No offer for today yet — ask Mira first")
    await _apply_services(doc, body.service_names)
    await _raw_db.day_offers.update_one({"id": doc["id"]}, {"$set": {"services": doc["services"]}})
    return {"offer": doc}


@router.post("/day-offers/accept")
async def accept_offer(body: AcceptIn, request: Request, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Owner said YES — lock the offer for today, generate a flyer and auto-post to Google Business."""
    doc = await _raw_db.day_offers.find_one({"id": body.offer_id, "tenant_id": t["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Offer suggestion not found — ask Mira again")
    if doc["status"] == "accepted" and doc.get("flyer_url"):
        return {"offer": doc}
    pct = _clean_pct(body.discount_pct)
    pct_patch = {}
    if body.service_names:
        await _apply_services(doc, body.service_names)
        pct_patch["services"] = doc["services"]
    if pct and pct != int(doc.get("discount_pct") or 0):
        _apply_pct(doc, pct)
        pct_patch.update({"discount_pct": doc["discount_pct"], "services": doc["services"],
                          "title": doc["title"], "offer_text": doc["offer_text"],
                          "whatsapp_caption": doc.get("whatsapp_caption", "")})
    flyer_template = body.template
    if not flyer_template:
        from routes.offer_flyer import auto_template
        flyer_template = auto_template()
    flyer_id, flyer_url = await _accept_flyer(doc, flyer_template, user, t)
    google_post, meta_post = await _auto_post_socials(request, t, doc, flyer_url)
    patch = {**pct_patch,
             "status": "accepted", "accepted_at": datetime.now(timezone.utc).isoformat(),
             "flyer_id": flyer_id, "flyer_url": flyer_url, "flyer_template": flyer_template,
             "google_post": google_post, "meta_post": meta_post}
    await _raw_db.day_offers.update_one({"id": doc["id"]}, {"$set": patch})
    if doc.get("kind") == "flash":
        await _raw_db.flash_alerts.update_one(
            {"tenant_id": t["id"], "date": doc["date"]}, {"$set": {"status": "accepted"}})
    return {"offer": {**doc, **patch}}


# ───────── CCTV-triggered flash offers (empty chairs → 2-hour flash deal) ─────────

@router.get("/day-offers/flash-alert")
async def flash_alert(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Today's CCTV empty-chair alert (if any) + the flash offer built from it."""
    today = _today_ist().date().isoformat()
    alert = await _raw_db.flash_alerts.find_one({"tenant_id": t["id"], "date": today}, {"_id": 0})
    offer = await _raw_db.day_offers.find_one(
        {"tenant_id": t["id"], "date": today, "kind": "flash"}, {"_id": 0},
        sort=[("created_at", -1)]) if alert else None
    return {"alert": alert, "offer": offer}


@router.post("/day-offers/flash-suggest")
async def flash_suggest(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    today = _today_ist().date().isoformat()
    alert = await _raw_db.flash_alerts.find_one({"tenant_id": t["id"], "date": today}, {"_id": 0})
    if not alert:
        raise HTTPException(404, "No empty-chair alert today — flash offers unlock when CCTV spots idle chairs")
    offer = await _suggest_offer(
        t, retry_hint=f"CCTV currently sees {alert.get('empty_chairs')} empty chairs.", kind="flash")
    await _raw_db.flash_alerts.update_one(
        {"tenant_id": t["id"], "date": today}, {"$set": {"status": "suggested"}})
    return {"offer": offer}


@router.get("/public/day-offer/{slug}")
async def public_day_offer(slug: str):
    """Today's accepted Offer of the Day for the booking page banner (no auth)."""
    t = await _raw_db.tenants.find_one({"slug": slug}, {"_id": 0, "id": 1})
    if not t:
        raise HTTPException(404, "Salon not found")
    today = _today_ist().date().isoformat()
    doc = await _raw_db.day_offers.find_one(
        {"tenant_id": t["id"], "date": today, "status": "accepted"}, {"_id": 0},
        sort=[("accepted_at", -1)])
    if not doc:
        return {"offer": None}
    if doc.get("kind") == "flash" and doc.get("accepted_at"):
        ends_at = (datetime.fromisoformat(doc["accepted_at"]) + timedelta(hours=2)).isoformat()
    else:
        now_ist = _today_ist()
        ends_at = (now_ist.replace(hour=23, minute=59, second=59, microsecond=0) - IST).isoformat()
    fest = festival_today(_today_ist().date())
    occasion = f"{fest['emoji']} {fest['name']}" if fest else f"{doc.get('day_name') or _today_ist().strftime('%A')}'s offer"
    return {"offer": {
        "title": doc.get("title"), "offer_text": doc.get("offer_text"),
        "day_name": doc.get("day_name"), "kind": doc.get("kind", "day"),
        "discount_pct": int(doc.get("discount_pct") or 0),
        "occasion": occasion, "is_festival": bool(fest),
        "ends_at": ends_at, "flyer_url": doc.get("flyer_url"),
        "services": [{"name": s.get("name"), "price": s.get("original_price"),
                      "offer_price": s.get("offer_price")} for s in (doc.get("services") or [])],
    }}
