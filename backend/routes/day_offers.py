"""Mira Day-Smart Offers — weekday-aware AI offer suggestions with one-tap flyer download."""
import logging
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from database import db, _raw_db
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


async def _catalog_context(t: dict) -> dict:
    services = await db.services.find(
        {}, {"_id": 0, "name": 1, "price": 1, "category": 1}).sort("price", -1).to_list(40)
    since = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    invoices = await db.invoices.find(
        {"created_at": {"$gte": since}}, {"_id": 0, "items": 1, "created_at": 1}).to_list(3000)
    svc_counts: dict = {}
    weekday_counts = [0] * 7
    for inv in invoices:
        try:
            weekday_counts[datetime.fromisoformat(inv["created_at"].replace("Z", "+00:00")).weekday()] += 1
        except (ValueError, KeyError):
            pass
        for it in inv.get("items") or []:
            if it.get("type") == "service":
                svc_counts[it["name"]] = svc_counts.get(it["name"], 0) + int(it.get("qty") or 1)
    ranked = sorted(svc_counts.items(), key=lambda x: -x[1])
    sold_names = set(svc_counts)
    slow = [s["name"] for s in services if s["name"] not in sold_names][:8]
    return {
        "services": services,
        "top_services": ranked[:8],
        "slow_services": slow or [n for n, _ in ranked[-5:]],
        "weekday_invoices": weekday_counts,
    }


def _build_offer_prompt(t: dict, ctx: dict, now: datetime, kind: str, retry_hint: str, forced_pct: int | None = None) -> str:
    catalog = "\n".join(f"- {s['name']} · ₹{s['price']:.0f} ({s.get('category') or 'General'})" for s in ctx["services"][:30])
    tops = ", ".join(f"{n} ({c} sold)" for n, c in ctx["top_services"]) or "no sales data yet"
    slows = ", ".join(ctx["slow_services"]) or "none"
    strategy = DAY_STRATEGY[now.weekday()]
    pct_rule = '"discount_pct":<int 0-40>'
    if forced_pct:
        strategy = (f"IMPORTANT — the salon OWNER has fixed today's discount at exactly {forced_pct}%. "
                    f"You MUST apply exactly {forced_pct}% off. Your job is only to pick WHICH 1-3 services "
                    f"benefit most from a {forced_pct}% discount today. (Day context: {strategy})")
        pct_rule = f'"discount_pct":{forced_pct}'
    validity = "TODAY only, valid today"
    if kind == "flash":
        strategy = ("🔴 FLASH SITUATION: CCTV shows several chairs sitting EMPTY right now. "
                    "Design an aggressive limited-time flash offer valid for the NEXT 2 HOURS ONLY "
                    "(25-40% off or an irresistible instant combo) to pull walk-ins immediately. "
                    "Copy must feel urgent — 'next 2 hours', 'walk in now'.")
        validity = "the NEXT 2 HOURS only"
    return (
        f"Salon: {t.get('name')}. Today is {now.strftime('%A, %d %B %Y')}, time {now.strftime('%I:%M %p')} IST.\n"
        f"Day strategy: {strategy}\n"
        f"Last-60-days bills per weekday (Mon..Sun): {ctx['weekday_invoices']}\n"
        f"Best sellers: {tops}\nSlow-moving services: {slows}\n"
        f"SERVICE CATALOG (real prices — never invent services):\n{catalog}\n"
        f"{retry_hint}\n"
        f"Design ONE irresistible offer valid {validity}. Pick 1-3 REAL services from the catalog. "
        "Compute offer prices from the real prices using your chosen discount. "
        'Return JSON: {"title":"<catchy 4-7 word offer name>","offer_text":"<one punchy line, e.g. Flat 25% OFF ...>",'
        '"discount_pct":<int 0-40>,"services":[{"name":"<exact catalog name>","original_price":<num>,"offer_price":<num>}],'
        '"reasoning":"<2-3 sentences: why THIS offer for THIS moment, mention footfall pattern>",'
        '"whatsapp_caption":"<ready-to-post WhatsApp/Instagram caption with emojis, mention the validity window>"}')


def _offer_doc(t: dict, data: dict, now: datetime, kind: str) -> dict:
    if not data.get("title") or not isinstance(data.get("services"), list):
        raise HTTPException(400, "Mira returned an unexpected offer format — try again")
    return {
        "id": str(uuid.uuid4()), "tenant_id": t["id"], "date": now.date().isoformat(),
        "day_name": now.strftime("%A"), "kind": kind,
        "title": str(data["title"])[:80], "offer_text": str(data.get("offer_text") or "")[:140],
        "discount_pct": int(data.get("discount_pct") or 0),
        "services": [{"name": str(s.get("name", ""))[:60],
                      "original_price": float(s.get("original_price") or 0),
                      "offer_price": float(s.get("offer_price") or 0)}
                     for s in data["services"][:3]],
        "reasoning": str(data.get("reasoning") or "")[:500],
        "whatsapp_caption": str(data.get("whatsapp_caption") or "")[:600],
        "status": "suggested", "created_at": datetime.now(timezone.utc).isoformat(),
    }


async def _suggest_offer(t: dict, retry_hint: str = "", kind: str = "daily", forced_pct: int | None = None) -> dict:
    from routes.mira_studio import _ask_json
    now = _today_ist()
    ctx = await _catalog_context(t)
    system = ("You are Mira, an expert salon revenue strategist for Indian salons. You know Fri-Sat-Sun are busy "
              "and Mon-Thu are lean, and you design day-smart offers that maximise chair occupancy AND margin.")
    data = await _ask_json(system, _build_offer_prompt(t, ctx, now, kind, retry_hint, forced_pct))
    if forced_pct:
        data["discount_pct"] = forced_pct
    doc = _offer_doc(t, data, now, kind)
    await _raw_db.day_offers.delete_many({"tenant_id": t["id"], "date": doc["date"], "status": "suggested", "kind": kind})
    await _raw_db.day_offers.insert_one({**doc})
    return doc


@router.get("/day-offers/today")
async def today_offer(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    today = _today_ist().date().isoformat()
    accepted = await _raw_db.day_offers.find_one(
        {"tenant_id": t["id"], "date": today, "status": "accepted", "kind": {"$ne": "flash"}}, {"_id": 0})
    if accepted:
        return {"offer": accepted}
    suggested = await _raw_db.day_offers.find_one(
        {"tenant_id": t["id"], "date": today, "status": "suggested", "kind": {"$ne": "flash"}}, {"_id": 0})
    return {"offer": suggested}


class SuggestIn(BaseModel):
    discount_pct: int | None = None


def _clean_pct(v: int | None) -> int | None:
    return max(1, min(70, int(v))) if v else None


@router.post("/day-offers/suggest")
async def suggest_offer(body: SuggestIn = SuggestIn(), user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    today = _today_ist().date().isoformat()
    accepted = await _raw_db.day_offers.find_one(
        {"tenant_id": t["id"], "date": today, "status": "accepted", "kind": {"$ne": "flash"}}, {"_id": 0})
    if accepted:
        return {"offer": accepted, "already_accepted": True}
    return {"offer": await _suggest_offer(t, forced_pct=_clean_pct(body.discount_pct))}


@router.post("/day-offers/suggest-another")
async def suggest_another(body: SuggestIn = SuggestIn(), user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return {"offer": await _suggest_offer(
        t, retry_hint="Give a DIFFERENT idea than before — vary the services or offer style.",
        forced_pct=_clean_pct(body.discount_pct))}


@router.post("/day-offers/unlock")
async def unlock_offer(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Owner changed their mind — discard today's accepted daily offer so a new one can be generated."""
    today = _today_ist().date().isoformat()
    await _raw_db.day_offers.delete_many(
        {"tenant_id": t["id"], "date": today, "kind": {"$ne": "flash"}})
    return {"ok": True}


class AcceptIn(BaseModel):
    offer_id: str
    template: str = "dark_glam"


@router.post("/day-offers/accept")
async def accept_offer(body: AcceptIn, request: Request, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Owner said YES — lock the offer for today, generate a flyer and auto-post to Google Business."""
    doc = await _raw_db.day_offers.find_one({"id": body.offer_id, "tenant_id": t["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Offer suggestion not found — ask Mira again")
    if doc["status"] == "accepted" and doc.get("flyer_url"):
        return {"offer": doc}
    from routes.offer_flyer import FlyerIn, create_flyer
    flyer_body = FlyerIn(
        template=body.template,
        headline=doc["title"],
        offer_text=doc["offer_text"],
        services=[f"{s['name']} ₹{s['offer_price']:.0f}" for s in doc["services"]],
        valid_until=f"Today only · {doc['day_name']}")
    try:
        flyer = await create_flyer(flyer_body, user=user, t=t)
        flyer_id, flyer_url = flyer["id"], flyer["url"]
    except Exception as e:
        logging.getLogger("day_offers").warning(f"flyer generation failed, accepting without flyer: {e}")
        flyer_id, flyer_url = None, None
    google_post = None
    try:
        from routes.social_connect import publish_google_post, _base
        lines = "\n".join(f"• {s['name']}: ₹{s['offer_price']:.0f} (was ₹{s['original_price']:.0f})" for s in doc["services"])
        summary = f"{doc['title']}\n{doc['offer_text']}\n{lines}\nValid TODAY only — walk in or book now!"
        image_abs = f"{_base(request)}{flyer_url}" if flyer_url else None
        google_post = await publish_google_post(t["id"], summary, image_abs, offer_title=doc["title"])
    except Exception as e:
        logging.getLogger("day_offers").warning(f"google auto-post failed: {e}")
        google_post = {"ok": False, "error": str(e)[:200]}
    patch = {"status": "accepted", "accepted_at": datetime.now(timezone.utc).isoformat(),
             "flyer_id": flyer_id, "flyer_url": flyer_url, "google_post": google_post}
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
    return {"offer": {
        "title": doc.get("title"), "offer_text": doc.get("offer_text"),
        "day_name": doc.get("day_name"), "kind": doc.get("kind", "day"),
        "services": [{"name": s.get("name"), "price": s.get("price"),
                      "offer_price": s.get("offer_price")} for s in (doc.get("services") or [])],
    }}
