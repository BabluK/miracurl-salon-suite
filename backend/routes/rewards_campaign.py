"""Miracurl Customer Rewards campaign — Super Admin configures, customers join from the salon's public page,
entries are computed live from POS bills / referrals / reviews, Top-10 winners are showcased."""
import logging
import html as html_lib
import os
import re
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from database import _raw_db
from email_service import _send_email
from security import current_tenant, public_rate_limit, require_super_admin, require_tenant_admin
from services.storage import _put_object, APP_NAME

router = APIRouter()
log = logging.getLogger("rewards")

DEFAULT_CAMPAIGN = {
    "id": "main", "vertical": "salon", "tagline": "", "name": "Miracurl Customer Rewards – 2026", "enabled": False,
    "eligible_plans": ["annual"], "min_transaction": 1500, "budget": 8000,
    "start_date": "2026-10-01", "end_date": "2026-12-31", "winner_count": 10,
    "rewards": [{"tier": "Diamond", "emoji": "💎", "winners": 1}, {"tier": "Platinum", "emoji": "🪩", "winners": 2},
                {"tier": "Gold", "emoji": "🥇", "winners": 7}],
    "salon_share_pct": 10,
    "entry_rules": [{"key": "purchase", "label": "Eligible purchase ₹1,500+", "entries": 1},
                    {"key": "referral", "label": "Refer a friend who completes an eligible purchase", "entries": 1},
                    {"key": "referral3", "label": "Refer 3 friends", "entries": 3},
                    {"key": "review", "label": "Leave a genuine review", "entries": 1},
                    {"key": "profile", "label": "Complete profile on Miracurl", "entries": 1},
                    {"key": "follow", "label": "Follow / engage with the campaign", "entries": 1},
                    {"key": "votes", "label": "Every 10 public votes on your look (max 5)", "entries": 1}],
    "terms": "One entry per eligible transaction of ₹1,500 or more on salon services during the campaign period. "
             "Referral entries count when the referred friend completes an eligible purchase. Winners are selected by the "
             "Miracurl team from all valid entries based on entries earned and the quality of the shared salon experience; "
             "decisions are final. Photos and stories are featured only with the customer's consent. Memberships are "
             "non-transferable and redeemable at the salon where the entry was earned.",
    "events": [],
    "tenant_terms": "Miracurl funds the Diamond / Platinum / Gold memberships awarded to winners. Salons redeem winner memberships "
                    "at their own outlet. Salons display the printable QR poster and record eligible bills in Miracurl POS. "
                    "After the campaign closes, Miracurl HQ shares the settlement and payment link for the salon's share of "
                    "reward fulfilment (if any). Entries are audited from POS invoices; disputes are settled by Miracurl HQ.",
    "payment_link": "",
    "payment_note": "",
    "updates": [],
}


def _campaign_events(c: dict) -> list:
    """HQ-defined events + auto milestones (casting closes, models announced), upcoming first."""
    from datetime import date as _date, timedelta as _td
    end = _date.fromisoformat(c["end_date"])
    auto = [{"date": c["end_date"], "title": "Casting closes", "note": "Last day to spend, share your look & apply."},
            {"date": (end + _td(days=7)).isoformat(), "title": "Brand Models announced", "note": "Winners revealed on this page & the salon's socials."}]
    today = _date.today().isoformat()
    ev = [e for e in (c.get("events") or []) if e.get("date") and e.get("title")] + auto
    ev.sort(key=lambda e: e["date"])
    return [{**e, "upcoming": e["date"] >= today} for e in ev]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


DEFAULT_RESTAURANT_CAMPAIGN = {
    **DEFAULT_CAMPAIGN,
    "id": "restaurant", "vertical": "restaurant",
    "name": "Miracurl Taste Ambassador — Diner Rewards",
    "tagline": "Dine, share your plate, get cast as a Taste Ambassador.",
    "min_transaction": 500,
    "rewards": [{"tier": "Diamond", "emoji": "💎", "winners": 1}, {"tier": "Platinum", "emoji": "🪩", "winners": 2},
                {"tier": "Gold", "emoji": "🥇", "winners": 7}],
    "tenant_flags": {},
}
CAMPAIGN_DEFAULTS = {"main": DEFAULT_CAMPAIGN, "restaurant": DEFAULT_RESTAURANT_CAMPAIGN}


def campaign_id_for(t: dict) -> str:
    return "restaurant" if (t or {}).get("business_type") == "restaurant" else "main"


async def get_campaign(cid: str = "main") -> dict:
    cid = cid if cid in CAMPAIGN_DEFAULTS else "main"
    c = await _raw_db.rewards_campaign.find_one({"id": cid}, {"_id": 0})
    return {**CAMPAIGN_DEFAULTS[cid], **(c or {}), "id": cid}


async def get_campaign_for(t: dict) -> dict:
    """The campaign a tenant belongs to — salons → 'main' (Brand Model), restaurants → 'restaurant' (Taste Ambassador)."""
    return await get_campaign(campaign_id_for(t))


async def get_campaign_for_slug(slug: str) -> dict:
    t = await _raw_db.tenants.find_one({"slug": slug}, {"_id": 0, "business_type": 1})
    return await get_campaign_for(t or {})


_RESTO_WORDS = [("Brand Models", "Taste Ambassadors"), ("Brand Model", "Taste Ambassador"), ("salon's", "restaurant's"),
                ("Salons", "Restaurants"), ("salons", "restaurants"), ("Salon", "Restaurant"), ("salon", "restaurant"),
                ("stylist", "chef"), ("appointment", "table")]


def verticalise_text(v, c: dict):
    """Restaurant campaign copy: swap salon wording in any str / list / dict (server-stored defaults are salon-worded)."""
    if c.get("vertical") != "restaurant":
        return v
    if isinstance(v, str):
        for a, b in _RESTO_WORDS:
            v = v.replace(a, b)
        return v
    if isinstance(v, list):
        return [verticalise_text(x, c) for x in v]
    if isinstance(v, dict):
        return {k: verticalise_text(x, c) for k, x in v.items()}
    return v


def _pfilter(c: dict) -> dict:
    """Participants of this campaign (legacy salon participants have no campaign_id)."""
    return {"campaign_id": "restaurant"} if c["id"] == "restaurant" else {"campaign_id": {"$ne": "restaurant"}}


def _is_live(c: dict) -> bool:
    today = datetime.now(timezone.utc).date().isoformat()
    return bool(c.get("enabled")) and c["start_date"] <= today <= c["end_date"]


def _plan_matches(plan: str, eligible: list) -> bool:
    return plan in eligible or any(plan.endswith("_" + e) for e in eligible)


def _tenant_eligible(c: dict, t: dict) -> bool:
    """Brand Model casting is a SALON campaign — restaurants are never part of it (they get their own campaign)."""
    is_resto = t.get("business_type") == "restaurant"
    if is_resto != (c.get("vertical") == "restaurant") or t.get("status") not in ("active", "trial"):
        return False
    flag = (c.get("tenant_flags") or {}).get(t["id"])
    if flag is not None:
        return bool(flag)
    return t.get("status") == "active" and _plan_matches(t.get("plan") or "", c.get("eligible_plans") or [])


async def _count_eligible(c: dict) -> int:
    ts = await _raw_db.tenants.find({"status": {"$in": ["active", "trial"]}}, {"_id": 0, "id": 1, "plan": 1, "status": 1, "business_type": 1}).to_list(1000)
    return sum(1 for t in ts if _tenant_eligible(c, t))


def _plan_query(eligible: list) -> dict:
    return {"plan": {"$regex": "(^|_)(" + "|".join(re.escape(e) for e in eligible) + ")$"}} if eligible else {"plan": "__none__"}


# ── Super Admin ──
class CampaignIn(BaseModel):
    name: str = Field(..., min_length=3, max_length=120)
    enabled: bool = False
    eligible_plans: list[str] = Field(default_factory=lambda: ["annual"])
    min_transaction: float = Field(1500, ge=0)
    budget: float = Field(8000, ge=0)
    start_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    end_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    winner_count: int = Field(10, ge=1, le=100)
    rewards: list[dict] = Field(default_factory=list)
    salon_share_pct: float = Field(10, ge=0, le=100)
    tagline: str = Field("", max_length=200)
    entry_rules: list[dict] = Field(default_factory=list)
    terms: str = Field("", max_length=3000)
    events: list[dict] = Field(default_factory=list, max_length=12)
    tenant_terms: str = Field("", max_length=4000)
    payment_link: str = Field("", max_length=500, pattern=r"^(https?://\S+)?$")
    payment_note: str = Field("", max_length=600)
    updates: list[dict] = Field(default_factory=list, max_length=30)


@router.get("/super-admin/rewards-campaign")
async def sa_get_campaign(campaign: str = "main", user=Depends(require_super_admin)):
    c = await get_campaign(campaign)
    c["live"] = _is_live(c)
    c["participants"] = await _raw_db.rewards_participants.count_documents(_pfilter(c))
    c["eligible_tenants"] = await _count_eligible(c)
    c["rzp_enabled"] = bool(os.environ.get("RAZORPAY_KEY_ID") and os.environ.get("RAZORPAY_KEY_SECRET"))
    c["rzp_key"] = (os.environ.get("RAZORPAY_KEY_ID") or "")[:12]
    return c


@router.get("/super-admin/rewards-campaign/tenants")
async def sa_campaign_tenants(campaign: str = "main", user=Depends(require_super_admin)):
    c = await get_campaign(campaign)
    flags = c.get("tenant_flags") or {}
    ts = await _raw_db.tenants.find({"status": {"$ne": "deleted"}},
                                    {"_id": 0, "id": 1, "name": 1, "slug": 1, "plan": 1, "status": 1, "location": 1, "logo_url": 1, "business_type": 1}).to_list(1000)
    counts = {r["_id"]: r["n"] for r in await _raw_db.rewards_participants.aggregate(
        [{"$group": {"_id": "$tenant_id", "n": {"$sum": 1}}}]).to_list(1000)}
    want_resto = c.get("vertical") == "restaurant"
    restaurants = [] if want_resto else [{k: t.get(k) for k in ("id", "name", "slug", "location", "logo_url", "status")} for t in ts if t.get("business_type") == "restaurant"]
    ts = [t for t in ts if (t.get("business_type") == "restaurant") == want_resto]
    out = []
    for t in ts:
        plan_ok = _plan_matches(t.get("plan") or "", c.get("eligible_plans") or [])
        out.append({**t, "on": _tenant_eligible(c, t), "plan_ok": plan_ok,
                    "manual": flags.get(t["id"]), "participants": counts.get(t["id"], 0)})
    out.sort(key=lambda x: (not x["on"], -x["participants"], (x.get("name") or "").lower()))
    return {"tenants": out, "restaurants": restaurants, "on_count": sum(1 for x in out if x["on"]), "live": _is_live(c), "enabled": bool(c.get("enabled"))}


class TenantFlagIn(BaseModel):
    on: Optional[bool] = None  # None = follow plan rule


@router.post("/super-admin/rewards-campaign/tenants/{tenant_id}/flag")
async def sa_campaign_tenant_flag(tenant_id: str, body: TenantFlagIn, user=Depends(require_super_admin)):
    t = await _raw_db.tenants.find_one({"id": tenant_id}, {"_id": 0, "id": 1, "plan": 1, "status": 1, "business_type": 1})
    if not t:
        raise HTTPException(404, "Tenant not found")
    cid = campaign_id_for(t)
    op = {"$unset": {f"tenant_flags.{tenant_id}": ""}} if body.on is None else {"$set": {f"tenant_flags.{tenant_id}": body.on}}
    await _raw_db.rewards_campaign.update_one({"id": cid}, {**op, "$setOnInsert": {"id": cid}}, upsert=True)
    c = await get_campaign(cid)
    return {"ok": True, "on": _tenant_eligible(c, t), "manual": body.on, "on_count": await _count_eligible(c)}


@router.put("/super-admin/rewards-campaign")
async def sa_put_campaign(body: CampaignIn, campaign: str = "main", user=Depends(require_super_admin)):
    if body.end_date < body.start_date:
        raise HTTPException(400, "End date must be after start date")
    doc = {**body.model_dump(), "id": "main", "updated_at": _now(), "updated_by": user.get("email", "")}
    if not doc["rewards"]:
        doc["rewards"] = DEFAULT_CAMPAIGN["rewards"]
    if not doc["entry_rules"]:
        doc["entry_rules"] = DEFAULT_CAMPAIGN["entry_rules"]
    cid = campaign if campaign in CAMPAIGN_DEFAULTS else "main"
    doc["id"], doc["vertical"] = cid, CAMPAIGN_DEFAULTS[cid]["vertical"]
    await _raw_db.rewards_campaign.update_one({"id": cid}, {"$set": doc}, upsert=True)
    return await sa_get_campaign(cid, user)


@router.get("/super-admin/rewards-campaign/participants")
async def sa_participants(campaign: str = "main", user=Depends(require_super_admin)):
    c = await get_campaign(campaign)
    rows = await _raw_db.rewards_participants.find(_pfilter(c), {"_id": 0}).sort("joined_at", -1).to_list(500)
    await _entries_batch(c, rows)
    rows.sort(key=lambda p: (-p["entries"]["total"], p["joined_at"]))
    return {"participants": rows}


class WinnerIn(BaseModel):
    tier: Optional[str] = None  # Diamond | Platinum | Gold | None (clear)


@router.post("/super-admin/rewards-campaign/participants/{pid}/winner")
async def sa_set_winner(pid: str, body: WinnerIn, user=Depends(require_super_admin)):
    _pp = await _raw_db.rewards_participants.find_one({"id": pid}, {"_id": 0, "tenant_id": 1}) or {}
    c = await get_campaign_for(await _raw_db.tenants.find_one({"id": _pp.get("tenant_id")}, {"_id": 0, "business_type": 1}) or {})
    tiers = {r["tier"] for r in c["rewards"]}
    if body.tier and body.tier not in tiers:
        raise HTTPException(400, "Unknown tier")
    p = await _raw_db.rewards_participants.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Participant not found")
    if body.tier:
        cap = next(r["winners"] for r in c["rewards"] if r["tier"] == body.tier)
        taken = await _raw_db.rewards_participants.count_documents({"winner_tier": body.tier, "id": {"$ne": pid}})
        if taken >= cap:
            raise HTTPException(400, f"All {cap} {body.tier} winner slot(s) are already assigned")
    await _raw_db.rewards_participants.update_one({"id": pid}, {"$set": {
        "winner_tier": body.tier, "winner_rank": None, "won_at": _now() if body.tier else None}})
    return {"ok": True}


# ── Entries (computed live, nothing to sync) ──
def _digits10(phone: str) -> str:
    return "".join(ch for ch in (phone or "") if ch.isdigit())[-10:]


async def _entries_batch(c: dict, parts: list) -> None:
    """Attach p["entries"] to every participant with a bounded number of queries (no N+1)."""
    if not parts:
        return
    rules = {r["key"]: r["entries"] for r in c["entry_rules"]}
    pids = [p["id"] for p in parts]
    votes = await _vote_counts(pids)
    ref_rows = await _raw_db.rewards_participants.aggregate([
        {"$match": {"referred_by": {"$in": pids}, "first_purchase_at": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$referred_by", "n": {"$sum": 1}}}]).to_list(len(pids))
    referred = {r["_id"]: r["n"] for r in ref_rows}
    tenant_ids = list({p["tenant_id"] for p in parts})
    # customers keep raw phone formatting ("+91 98765-43210"); normalise in Python — one indexed query per batch
    cust_by_key: dict = {}
    async for x in _raw_db.customers.find({"tenant_id": {"$in": tenant_ids}}, {"_id": 0, "id": 1, "tenant_id": 1, "phone": 1}):
        k = (x["tenant_id"], _digits10(x.get("phone", "")))
        if k[1]:
            cust_by_key.setdefault(k, []).append(x["id"])
    cust_by_pid = {p["id"]: cust_by_key.get((p["tenant_id"], _digits10(p.get("phone", ""))), []) for p in parts}
    cust_ids = sorted({cid for ids in cust_by_pid.values() for cid in ids})
    inv_rows = await _raw_db.invoices.aggregate([
        {"$match": {"customer_id": {"$in": cust_ids}, "status": {"$nin": ["voided", "open"]},
                    "created_at": {"$gte": c["start_date"], "$lte": c["end_date"] + "T23:59:59"},
                    "total": {"$gte": float(c["min_transaction"])}}},
        {"$group": {"_id": "$customer_id", "n": {"$sum": 1}}}]).to_list(len(cust_ids) or 1) if cust_ids else []
    inv_by_cust = {r["_id"]: r["n"] for r in inv_rows}
    newly_purchased = []
    for p in parts:
        purchases = sum(inv_by_cust.get(cid, 0) for cid in cust_by_pid[p["id"]])
        ref = referred.get(p["id"], 0)
        v = votes.get(p["id"], 0)
        breakdown = {
            "purchase": purchases * rules.get("purchase", 1),
            "referral": ref * rules.get("referral", 1),
            "referral3": (rules.get("referral3", 3) if ref >= 3 else 0),
            "review": rules.get("review", 1) if p.get("review_at") else 0,
            "profile": rules.get("profile", 1) if (p.get("name") and p.get("email") and p.get("photo_url")) else 0,
            "follow": rules.get("follow", 1) if p.get("followed_at") else 0,
            "votes": min(5, v // 10) * rules.get("votes", 1),
        }
        p["entries"] = {**breakdown, "purchases": purchases, "referred": ref, "vote_count": v, "total": sum(breakdown.values())}
        if purchases and not p.get("first_purchase_at"):
            newly_purchased.append(p["id"])
    if newly_purchased:  # referral credit depends on this flag; single write for the batch
        await _raw_db.rewards_participants.update_many({"id": {"$in": newly_purchased}, "first_purchase_at": {"$in": [None, ""]}},
                                                        {"$set": {"first_purchase_at": _now()}})


async def _compute_entries(c: dict, p: dict) -> dict:
    await _entries_batch(c, [p])
    return p["entries"]


# ── Tenant (salon owner): status + printable QR poster ──
@router.get("/settings/rewards-campaign")
async def tenant_campaign(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    c = await get_campaign_for(t)
    parts = await _raw_db.rewards_participants.find({"tenant_id": t["id"]}, {"_id": 0}).to_list(500)
    await _entries_batch(c, parts)
    parts.sort(key=lambda p: (-p["entries"]["total"], p["joined_at"]))
    pub = verticalise_text({k: c[k] for k in ("name", "min_transaction", "start_date", "end_date", "winner_count", "rewards", "eligible_plans")}, c)
    nudges = await _raw_db.rewards_nudges.find({"tenant_id": t["id"], "wa_done": False}, {"_id": 0}).sort("created_at", -1).to_list(50)
    today = date.today().isoformat()
    status = ("live" if _is_live(c) else "upcoming" if c.get("enabled") and c["start_date"] > today
              else "ended" if c.get("enabled") and c["end_date"] < today else "off")
    pub.update(verticalise_text({k: c.get(k) or ("" if k != "updates" else []) for k in ("tenant_terms", "payment_link", "payment_note", "updates")}, c))
    pub["updates"] = sorted(pub["updates"], key=lambda u: u.get("date", ""), reverse=True)
    popup_key = f"{c.get('updated_at', '')}|{c['start_date']}|{bool(c.get('payment_link'))}"
    acked = await _raw_db.rewards_tenant_acks.find_one({"tenant_id": t["id"], "user_id": user["id"], "key": popup_key}, {"_id": 1})
    from routes.rewards_settlements import tenant_settlement
    from routes.campaign_agreement import agreement_state
    return {"campaign": pub, "agreement": await agreement_state(t, c), "enabled": bool(c.get("enabled")), "live": _is_live(c), "eligible": _tenant_eligible(c, t) and _is_live(c),
            "plan_ok": _tenant_eligible(c, t), "status": status, "participants": parts, "slug": t.get("slug"), "nudges": nudges,
            "popup_key": popup_key, "show_popup": bool(c.get("enabled")) and _tenant_eligible(c, t) and not acked,
            "settlement": await tenant_settlement(t["id"], c["id"])}


class AckIn(BaseModel):
    key: str = Field(min_length=1, max_length=200)


@router.post("/settings/rewards-campaign/ack")
async def tenant_campaign_ack(body: AckIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    await _raw_db.rewards_tenant_acks.update_one({"tenant_id": t["id"], "user_id": user["id"], "key": body.key},
                                                 {"$set": {"acked_at": _now()}}, upsert=True)
    return {"ok": True}


async def _rewards_poster_jpeg(t: dict, c: dict, origin: str) -> bytes:
    import asyncio
    import io
    from routes.services_catalog import _tenant_logo_bytes
    from routes.loyalty_stamps import _shaped_logo
    base = (origin or os.environ.get("APP_PUBLIC_URL", "")).rstrip("/")
    logo_bytes = await _tenant_logo_bytes(t, base)
    slug = t.get("slug") or ""

    def _render() -> bytes:
        import qrcode
        from PIL import Image, ImageDraw, ImageFont
        W, H = 720, 1080
        assets = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets")
        bg_path = os.path.join(assets, "posters", "loyalty_bg_midnight.jpg")
        if os.path.exists(bg_path):
            bg = Image.open(bg_path).convert("RGB")
            scale = max(W / bg.width, H / bg.height)
            bg = bg.resize((round(bg.width * scale), round(bg.height * scale)))
            lx, ty = (bg.width - W) // 2, (bg.height - H) // 2
            bg = bg.crop((lx, ty, lx + W, ty + H))
        else:
            bg = Image.new("RGB", (W, H), (15, 15, 20))
        d = ImageDraw.Draw(bg)
        GOLD, LIGHT, INK, FOOT = (212, 175, 55), (232, 224, 210), (255, 255, 255), (160, 148, 128)

        def _font(name, size):
            try:
                return ImageFont.truetype(os.path.join(assets, "fonts", name), size)
            except Exception:  # noqa: BLE001
                return ImageFont.load_default()

        def center(text, y, f, fill):
            d.text(((W - d.textlength(text, font=f)) / 2, y), text, font=f, fill=fill)

        y = 40
        if logo_bytes:
            lg = _shaped_logo(logo_bytes, 130, "circle")
            if lg is not None:
                bg.paste(lg, ((W - lg.width) // 2, y), lg)
                y += lg.height + 10
        name, size = t.get("name") or "Our Salon", 44
        f = _font("PlayfairDisplay-Bold.ttf", size)
        while d.textlength(name, font=f) > W - 120 and size > 24:
            size -= 3
            f = _font("PlayfairDisplay-Bold.ttf", size)
        center(name, y, f, GOLD)
        y += size + 6
        loc = (t.get("location") or "").strip()
        if loc:
            center(loc[:48].upper(), y, _font("FreeSansBold.ttf", 18), LIGHT)
            y += 28
        y += 8
        lbl_f = _font("FreeSansBold.ttf", 24)
        lbl = "B R A N D   M O D E L   C A S T I N G"
        lw = d.textlength(lbl, font=lbl_f)
        center(lbl, y, lbl_f, LIGHT)
        for dx in (-lw / 2 - 30, lw / 2 + 30):
            cx, cy = W / 2 + dx, y + 14
            d.polygon([(cx, cy - 8), (cx + 6, cy), (cx, cy + 8), (cx - 6, cy)], fill=GOLD)
        y += 46
        center("Become our Brand Model", y, _font("PlayfairDisplay-Bold.ttf", 40), INK)
        y += 56
        qr = qrcode.make(f"{base}/rewards/{slug}", box_size=10, border=1).convert("RGB").resize((320, 320))
        pad = 18
        box = Image.new("RGB", (320 + pad * 2, 320 + pad * 2), (255, 255, 255))
        box.paste(qr, (pad, pad))
        m = Image.new("L", box.size, 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, box.width - 1, box.height - 1], radius=26, fill=255)
        bg.paste(box, ((W - box.width) // 2, y), m)
        y += box.height + 22
        center(f"Spend ₹{int(c['min_transaction']):,}+ in one bill & scan to apply", y, _font("FreeSansBold.ttf", 22), LIGHT)
        y += 36
        tiers = "   ·   ".join(f"{r['tier']} ×{r['winners']}" for r in c["rewards"])
        center("WIN A MEMBERSHIP", y, _font("FreeSansBold.ttf", 28), GOLD)
        y += 40
        center(tiers, y, _font("FreeSansBold.ttf", 20), INK)
        y += 34
        center("Share your look · refer friends · get featured on Miracurl", y, _font("FreeSansBold.ttf", 17), LIGHT)
        center(f"{c['start_date']}  →  {c['end_date']}", H - 138, _font("FreeSansBold.ttf", 17), FOOT)
        center(f"{base.replace('https://', '')}/rewards/{slug}", H - 110, _font("FreeSansBold.ttf", 15), FOOT)
        out = io.BytesIO()
        bg.save(out, format="JPEG", quality=88)
        return out.getvalue()

    return await asyncio.to_thread(_render)


@router.get("/settings/rewards-qr-poster.png")
async def rewards_qr_poster(origin: str = "", user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    from fastapi import Response
    c = await get_campaign_for(t)
    from routes.campaign_agreement import agreement_ok
    if not await agreement_ok(t["id"], c):
        raise HTTPException(403, "Accept the Participation Agreement first (Settings → Brand Model Campaign) to unlock the QR poster")
    img = await _rewards_poster_jpeg(t, c, origin)
    return Response(content=img, media_type="image/jpeg",
                    headers={"Content-Disposition": 'attachment; filename="rewards-campaign-qr.jpg"'})


# ── Public ──
@router.get("/public/rewards/{slug}")
async def public_campaign(slug: str):
    c = await get_campaign_for_slug(slug)
    t = await _raw_db.tenants.find_one({"slug": slug}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "plan": 1, "status": 1, "business_type": 1,
                                                       "logo_url": 1, "location": 1, "phone": 1})
    if not t:
        raise HTTPException(404, "Salon not found")
    from routes.campaign_agreement import agreement_ok
    agreed = await agreement_ok(t["id"], c)
    eligible = _tenant_eligible(c, t) and _is_live(c) and agreed
    winners = await _raw_db.rewards_participants.find(
        {"winner_tier": {"$nin": [None, ""]}, "consent": True, **_pfilter(c)},
        {"_id": 0, "name": 1, "photo_url": 1, "story": 1, "winner_tier": 1, "salon_name": 1, "salon_slug": 1, "won_at": 1}).to_list(20)
    order = {r["tier"]: i for i, r in enumerate(c["rewards"])}
    winners.sort(key=lambda w: order.get(w["winner_tier"], 99))
    pub = verticalise_text({k: c.get(k) for k in ("name", "min_transaction", "start_date", "end_date", "winner_count", "rewards", "entry_rules", "terms", "tagline")}, c)
    pub["events"] = verticalise_text(_campaign_events(c), c)
    today = date.today().isoformat()
    status = ("live" if _is_live(c) else "upcoming" if c.get("enabled") and c["start_date"] > today
              else "ended" if c.get("enabled") and c["end_date"] < today else "off")
    return {"campaign": pub, "salon": {k: t.get(k) for k in ("name", "slug", "logo_url", "location", "phone", "business_type")},
            "eligible": eligible, "live": _is_live(c), "status": status, "salon_on": _tenant_eligible(c, t),
            "agreement_pending": _tenant_eligible(c, t) and not agreed, "vertical": c.get("vertical", "salon"),
            "participants": await _raw_db.rewards_participants.count_documents(_pfilter(c)),
            "winners": winners}


class JoinIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    phone: str = Field(..., min_length=8, max_length=20)
    email: str = Field(..., min_length=5, max_length=120)
    ref: Optional[str] = Field(None, max_length=40)
    consent: bool = False


def _welcome_html(name: str, salon: str, c: dict, link: str) -> str:
    steps = ["Visit the salon and enjoy your services", f"Spend ₹{int(c['min_transaction']):,}+ in one bill",
             "Refer friends & family — every eligible friend earns you an entry", "Scan the campaign QR after your visit / keep this link",
             "Get featured — 10 outstanding customers are showcased on the Miracurl website"]
    steps_html = "".join(f'<tr><td style="width:28px;color:#d4af37;font-weight:bold;vertical-align:top;padding:6px 0">{i + 1}</td>'
                         f'<td style="padding:6px 0;color:#3a3a42">{s}</td></tr>' for i, s in enumerate(steps))
    rewards = " · ".join(f'{r["emoji"]} {r["tier"]} ×{r["winners"]}' for r in c["rewards"])
    return f"""<div style="font-family:Georgia,serif;max-width:580px;margin:0 auto;background:#fffdf9;border-radius:20px;overflow:hidden;box-shadow:0 6px 30px rgba(20,18,12,.1)">
  <div style="background:#15151b;padding:26px 36px;text-align:center"><div style="font-size:20px;letter-spacing:4px;color:#d4af37">MIRACURL</div>
    <div style="color:#f4f1e8;font-size:22px;margin-top:10px">🎉 Welcome to {html_lib.escape(c['name'])}</div>
    <div style="color:#b9b2a3;font-size:12px;letter-spacing:2px;margin-top:6px">SPEND · REFER · PARTICIPATE · WIN</div></div>
  <div style="padding:28px 36px;color:#3a3a42;line-height:1.7;font-size:15px">
    <p>Hi {html_lib.escape(name.split(' ')[0])},</p>
    <p>You're in! You've joined the rewards campaign at <b>{html_lib.escape(salon)}</b>. Here's how it works:</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px">{steps_html}</table>
    <div style="background:#fdf8ec;border:1px solid #eee3c4;border-radius:14px;padding:14px 18px;margin:18px 0;font-size:14px">
      <b>🎁 Chance to win:</b> {rewards} — plus special salon rewards.<br>
      <span style="color:#7d7668;font-size:12.5px">Campaign period: {c['start_date']} → {c['end_date']}</span></div>
    <p style="text-align:center"><a href="{link}" style="display:inline-block;background:#d4af37;color:#15151b;font-weight:bold;text-decoration:none;padding:13px 34px;border-radius:999px">View my campaign page ✦</a></p>
    <p style="font-size:12px;color:#9a948a">Your entries are counted automatically from your bills at the salon (use this same phone number). Refer friends with your link above — they must complete an eligible purchase for your entry to count.</p>
  </div></div>"""


@router.post("/public/rewards/{slug}/join")
async def public_join(slug: str, body: JoinIn, request: Request):
    await public_rate_limit(request, "rewards-join", limit=6, window_sec=600)
    c = await get_campaign_for_slug(slug)
    t = await _raw_db.tenants.find_one({"slug": slug}, {"_id": 0, "id": 1, "name": 1, "plan": 1, "status": 1, "business_type": 1})
    if not t:
        raise HTTPException(404, "Salon not found")
    from routes.campaign_agreement import agreement_ok
    if not await agreement_ok(t["id"], c):
        raise HTTPException(403, "This salon hasn't completed campaign onboarding yet — please check back soon")
    if not (_tenant_eligible(c, t) and _is_live(c)):
        raise HTTPException(400, "This salon is not part of the campaign right now")
    phone = "".join(ch for ch in body.phone if ch.isdigit())[-12:]
    email = body.email.lower().strip()
    if "@" not in email:
        raise HTTPException(400, "Please enter a valid email")
    existing = await _raw_db.rewards_participants.find_one({"tenant_id": t["id"], "phone": phone}, {"_id": 0, "id": 1, "ref_code": 1})
    if existing:
        return {"ok": True, "already": True, "id": existing["id"], "ref_code": existing["ref_code"]}
    referrer = await _raw_db.rewards_participants.find_one({"ref_code": body.ref}, {"_id": 0, "id": 1}) if body.ref else None
    p = {"id": str(uuid.uuid4()), "tenant_id": t["id"], "salon_name": t["name"], "salon_slug": slug, "name": body.name.strip(),
         "phone": phone, "email": email, "consent": bool(body.consent), "ref_code": uuid.uuid4().hex[:8],
         "referred_by": (referrer or {}).get("id"), "joined_at": _now(), "campaign_id": c["id"], "photo_url": None, "story": "",
         "review_at": None, "followed_at": None, "first_purchase_at": None, "winner_tier": None}
    await _raw_db.rewards_participants.insert_one({**p})
    base = os.environ.get("APP_PUBLIC_URL", "").rstrip("/")
    link = f"{base}/rewards/{slug}?ref={p['ref_code']}"
    status = await _send_email([email], f"🎉 Welcome to {c['name']} — you're in!", _welcome_html(p["name"], t["name"], c, link))
    return {"ok": True, "id": p["id"], "ref_code": p["ref_code"], "email_sent": bool(status.get("sent"))}


class StoryIn(BaseModel):
    phone: str = Field(..., min_length=8, max_length=20)
    story: str = Field("", max_length=600)
    photo_url: Optional[str] = Field(None, max_length=300)
    consent: bool = True
    followed: bool = False


@router.post("/public/rewards/{slug}/story")
async def public_story(slug: str, body: StoryIn, request: Request):
    """Participant adds their photo (already uploaded via /api/upload) + salon story; identified by phone."""
    await public_rate_limit(request, "rewards-story", limit=6, window_sec=600)
    phone = "".join(ch for ch in body.phone if ch.isdigit())[-12:]
    p = await _raw_db.rewards_participants.find_one({"salon_slug": slug, "phone": phone}, {"_id": 0, "id": 1})
    if not p:
        raise HTTPException(404, "We couldn't find your entry — join the campaign first with this phone number")
    upd = {"story": body.story.strip(), "consent": bool(body.consent)}
    if body.photo_url and body.photo_url.startswith("/api/files/"):
        upd["photo_url"] = body.photo_url
    if body.followed:
        upd["followed_at"] = _now()
    await _raw_db.rewards_participants.update_one({"id": p["id"]}, {"$set": upd})
    return {"ok": True}


@router.get("/public/rewards/{slug}/me")
async def public_me(slug: str, phone: str, request: Request):
    await public_rate_limit(request, "rewards-me", limit=20, window_sec=600)
    c = await get_campaign_for_slug(slug)
    ph = "".join(ch for ch in phone if ch.isdigit())[-12:]
    p = await _raw_db.rewards_participants.find_one({"salon_slug": slug, "phone": ph}, {"_id": 0})
    if not p:
        raise HTTPException(404, "No entry for this phone number yet")
    entries = await _compute_entries(c, p)
    return {"id": p["id"], "name": p["name"], "ref_code": p["ref_code"], "entries": entries, "photo_url": p.get("photo_url"),
            "story": p.get("story", ""), "winner_tier": p.get("winner_tier"), "vote_milestones": p.get("vote_milestones") or []}


@router.post("/public/rewards/{slug}/photo")
async def public_photo(slug: str, request: Request, phone: str = Form(...), file: UploadFile = File(...)):
    """Participant photo for the Top-10 showcase (≤5 MB image). Identified by the phone used to join."""
    await public_rate_limit(request, "rewards-photo", limit=6, window_sec=3600)
    ph = "".join(ch for ch in phone if ch.isdigit())[-12:]
    p = await _raw_db.rewards_participants.find_one({"salon_slug": slug, "phone": ph}, {"_id": 0, "id": 1, "tenant_id": 1})
    if not p:
        raise HTTPException(404, "Join the campaign first with this phone number")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "Only image files are allowed")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "Image too large — max 5 MB")
    fid = str(uuid.uuid4())
    ext = (file.filename or "img.jpg").rsplit(".", 1)[-1].lower()[:5] or "jpg"
    try:
        result = _put_object(f"{APP_NAME}/rewards/{p['id']}/{fid}.{ext}", data, file.content_type)
    except Exception as e:  # noqa: BLE001
        log.error("rewards photo upload failed: %s", e)
        raise HTTPException(502, "Upload failed — try again")
    await _raw_db.uploads.insert_one({
        "id": fid, "tenant_id": p["tenant_id"], "kind": "rewards_photo", "storage_path": result.get("path"),
        "original_filename": file.filename or f"{fid}.{ext}", "content_type": file.content_type, "size": len(data),
        "uploaded_by": f"rewards:{p['id']}", "is_deleted": False, "created_at": _now()})
    await _raw_db.rewards_participants.update_one({"id": p["id"]}, {"$set": {"photo_url": f"/api/files/{fid}"}})
    return {"ok": True, "url": f"/api/files/{fid}"}


# ── Winner announcement card (1080×1080, shareable) ──
async def _winner_card_png(p: dict, t: dict, c: dict, base: str, story: bool = False) -> bytes:
    import asyncio
    import io
    from routes.services_catalog import _tenant_logo_bytes
    from routes.loyalty_stamps import _shaped_logo
    base = (base or os.environ.get("APP_PUBLIC_URL", "")).rstrip("/")
    logo_bytes = await _tenant_logo_bytes(t, base)
    photo_bytes = await _tenant_logo_bytes({"logo_url": p["photo_url"]}, base) if p.get("photo_url") else None
    slug = t.get("slug") or p.get("salon_slug") or ""
    from routes.site_info import _get_info
    ig_handle = (await _get_info()).get("instagram_handle") or ""

    def _render() -> bytes:
        import qrcode
        from PIL import Image, ImageDraw, ImageFont
        W, H = (1080, 1920) if story else (1080, 1080)
        assets = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets")
        bg_path = os.path.join(assets, "posters", "loyalty_bg_midnight.jpg")
        if os.path.exists(bg_path):
            bg = Image.open(bg_path).convert("RGB")
            s = max(W / bg.width, H / bg.height)
            bg = bg.resize((round(bg.width * s), round(bg.height * s)))
            lx, ty = (bg.width - W) // 2, (bg.height - H) // 2
            bg = bg.crop((lx, ty, lx + W, ty + H))
        else:
            bg = Image.new("RGB", (W, H), (15, 15, 20))
        # darken centre band for legibility
        shade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(shade).rounded_rectangle([60, 60, W - 60, H - 60], radius=40, fill=(10, 10, 16, 150))
        bg = Image.alpha_composite(bg.convert("RGBA"), shade)
        d = ImageDraw.Draw(bg)
        GOLD, LIGHT, INK, FOOT = (212, 175, 55), (232, 224, 210), (255, 255, 255), (170, 158, 138)
        d.rounded_rectangle([60, 60, W - 60, H - 60], radius=40, outline=GOLD, width=3)
        d.rounded_rectangle([72, 72, W - 72, H - 72], radius=34, outline=(212, 175, 55, 90), width=1)

        def _font(name, size):
            try:
                return ImageFont.truetype(os.path.join(assets, "fonts", name), size)
            except Exception:  # noqa: BLE001
                return ImageFont.load_default()

        def center(text, y, f, fill):
            d.text(((W - d.textlength(text, font=f)) / 2, y), text, font=f, fill=fill)

        def fit(text, name, size, max_w, min_size=24):
            f = _font(name, size)
            while d.textlength(text, font=f) > max_w and size > min_size:
                size -= 3
                f = _font(name, size)
            return f, size

        y = 260 if story else 96
        if logo_bytes:
            lg = _shaped_logo(logo_bytes, 140 if story else 96, "circle")
            if lg is not None:
                bg.paste(lg, ((W - lg.width) // 2, y), lg)
                y += lg.height + 12
        f, sz = fit(t.get("name") or "", "PlayfairDisplay-Bold.ttf", 52 if story else 40, W - 240)
        center(t.get("name") or "", y, f, GOLD)
        y += sz + 18
        loc = (t.get("location") or "").strip()
        if loc:
            center(loc.upper()[:40], y, _font("FreeSansBold.ttf", 16), LIGHT)
            y += 26

        # hero: photo circle or trophy
        hero_size, hero_y = (560, y + 40) if story else (310, y + 12)
        if photo_bytes:
            try:
                ph = Image.open(io.BytesIO(photo_bytes)).convert("RGB")
                s = max(hero_size / ph.width, hero_size / ph.height)
                ph = ph.resize((round(ph.width * s), round(ph.height * s)))
                lx, ty = (ph.width - hero_size) // 2, (ph.height - hero_size) // 2
                ph = ph.crop((lx, ty, lx + hero_size, ty + hero_size))
                m = Image.new("L", (hero_size, hero_size), 0)
                ImageDraw.Draw(m).ellipse([0, 0, hero_size - 1, hero_size - 1], fill=255)
                cx = (W - hero_size) // 2
                d.ellipse([cx - 8, hero_y - 8, cx + hero_size + 8, hero_y + hero_size + 8], outline=GOLD, width=6)
                bg.paste(ph, (cx, hero_y), m)
            except Exception:  # noqa: BLE001
                photo_ok = False
            else:
                photo_ok = True
        else:
            photo_ok = False
        if not photo_ok:
            tp = os.path.join(assets, "posters", "trophy_gold.png")
            if os.path.exists(tp):
                tr = Image.open(tp).convert("RGBA").resize((hero_size, hero_size))
                bg.alpha_composite(tr, ((W - hero_size) // 2, hero_y))
            else:
                cx = W // 2
                d.ellipse([cx - 120, hero_y + 45, cx + 120, hero_y + 285], outline=GOLD, width=8)
        y = hero_y + hero_size + (70 if story else 34)

        lbl = "B R A N D   M O D E L   ·   W I N N E R"
        lf = _font("FreeSansBold.ttf", 26 if story else 20)
        lw = d.textlength(lbl, font=lf)
        center(lbl, y, lf, GOLD)
        for dx in (-lw / 2 - 26, lw / 2 + 26):
            cx, cy = W / 2 + dx, y + 12
            d.polygon([(cx, cy - 7), (cx + 5, cy), (cx, cy + 7), (cx - 5, cy)], fill=GOLD)
        y += 52 if story else 38
        f, sz = fit(p["name"], "PlayfairDisplay-Bold.ttf", 88 if story else 66, W - 200, 34)
        center(p["name"], y, f, INK)
        y += sz + (40 if story else 26)
        center(f"wins a {p['winner_tier']} Membership", y, _font("FreeSansBold.ttf", 40 if story else 30), GOLD)
        if story:
            y += 70
            center("Your style. Your story. Your moment.", y, _font("PlayfairDisplay-Bold.ttf", 34), LIGHT)

        # footer: QR + CTA
        qr = qrcode.make(f"{base}/rewards/{slug}", box_size=6, border=1).convert("RGB").resize((132, 132))
        box = Image.new("RGB", (148, 148), (255, 255, 255))
        box.paste(qr, (8, 8))
        m = Image.new("L", box.size, 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, 147, 147], radius=16, fill=255)
        qx, qy = W - 96 - 148, H - (330 if story else 112) - 148
        bg.paste(box, (qx, qy), m)
        d.text((96, qy + 22), "Want to be our next Brand Model?", font=_font("FreeSansBold.ttf", 24), fill=INK)
        d.text((96, qy + 60), f"Spend ₹{int(c['min_transaction']):,}+ at {t.get('name') or 'the salon'}, scan & apply.", font=_font("FreeSansBold.ttf", 18), fill=LIGHT)
        d.text((96, qy + 92), f"{base.replace('https://', '')}/rewards/{slug}", font=_font("FreeSansBold.ttf", 16), fill=FOOT)
        center(f"Powered by Miracurl  ·  @{ig_handle}" if ig_handle else "Powered by Miracurl", H - (300 if story else 96), _font("FreeSansBold.ttf", 18 if story else 15), FOOT)
        if story:  # everything ends above ~1650px — Instagram's bottom UI band (≈1670–1920) stays clear
            center("Swipe up · link in bio", H - 272, _font("FreeSansBold.ttf", 16), FOOT)
        out = io.BytesIO()
        bg.convert("RGB").save(out, format="PNG", optimize=True)
        return out.getvalue()

    return await asyncio.to_thread(_render)


async def _card_response(p: dict, origin: str, fmt: str = "square"):
    from fastapi import Response
    if not p.get("winner_tier"):
        raise HTTPException(400, "This participant hasn't been announced as a winner yet")
    t = await _raw_db.tenants.find_one({"id": p["tenant_id"]}, {"_id": 0}) or {"slug": p.get("salon_slug"), "name": p.get("salon_name")}
    c = await get_campaign_for(t)
    story = fmt == "story"
    png = await _winner_card_png(p, t, c, origin, story=story)
    fname = f"brand-model-{(p['name'] or 'winner').lower().replace(' ', '-')[:30]}{'-story' if story else ''}.png"
    return Response(content=png, media_type="image/png", headers={"Content-Disposition": f'inline; filename="{fname}"'})


@router.get("/super-admin/rewards-campaign/participants/{pid}/card.png")
async def sa_winner_card(pid: str, origin: str = "", fmt: str = "square", user=Depends(require_super_admin)):
    p = await _raw_db.rewards_participants.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Participant not found")
    return await _card_response(p, origin, fmt)


@router.get("/settings/rewards-winner-card/{pid}.png")
async def tenant_winner_card(pid: str, origin: str = "", fmt: str = "square", user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    p = await _raw_db.rewards_participants.find_one({"id": pid, "tenant_id": t["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Participant not found")
    return await _card_response(p, origin, fmt)


@router.get("/public/rewards/{slug}/winner-card.png")
async def public_winner_card(slug: str, phone: str, request: Request, origin: str = "", fmt: str = "square"):
    await public_rate_limit(request, "rewards-card", limit=10, window_sec=600)
    ph = "".join(ch for ch in phone if ch.isdigit())[-12:]
    p = await _raw_db.rewards_participants.find_one({"salon_slug": slug, "phone": ph}, {"_id": 0})
    if not p:
        raise HTTPException(404, "No entry for this phone number yet")
    return await _card_response(p, origin, fmt)


# ── Model voting (public) ──
async def _vote_counts(pids: list) -> dict:
    rows = await _raw_db.rewards_votes.aggregate([{"$match": {"participant_id": {"$in": pids}}},
                                                  {"$group": {"_id": "$participant_id", "n": {"$sum": 1}}}]).to_list(1000)
    return {r["_id"]: r["n"] for r in rows}


@router.get("/public/rewards/{slug}/applicants")
async def public_applicants(slug: str, request: Request, voter: str = ""):
    """Applicants with a photo + consent, ranked by public votes."""
    await public_rate_limit(request, "rewards-applicants", limit=120, window_sec=600)
    rows = await _raw_db.rewards_participants.find(
        {"salon_slug": slug, "consent": True, "photo_url": {"$nin": [None, ""]}},
        {"_id": 0, "id": 1, "name": 1, "photo_url": 1, "story": 1, "winner_tier": 1, "joined_at": 1}).to_list(300)
    counts = await _vote_counts([r["id"] for r in rows])
    vp = "".join(ch for ch in voter if ch.isdigit())[-12:]
    mine = set()
    if vp:
        mine = {v["participant_id"] async for v in _raw_db.rewards_votes.find({"salon_slug": slug, "voter_phone": vp}, {"_id": 0, "participant_id": 1})}
    for r in rows:
        r["votes"] = counts.get(r["id"], 0)
        r["voted"] = r["id"] in mine
        r["name"] = r["name"].split(" ")[0] + (" " + r["name"].split(" ")[-1][0] + "." if " " in r["name"] else "")
    rows.sort(key=lambda r: (-r["votes"], r["joined_at"]))
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return {"applicants": rows, "total_votes": sum(counts.values())}


class VoteIn(BaseModel):
    participant_id: str = Field(min_length=8, max_length=64)
    phone: str = Field(min_length=10, max_length=15)


@router.post("/public/rewards/{slug}/vote")
async def public_vote(slug: str, body: VoteIn, request: Request):
    await public_rate_limit(request, "rewards-vote", limit=40, window_sec=600)
    c = await get_campaign_for_slug(slug)
    if not _is_live(c):
        raise HTTPException(400, "Voting is closed")
    vp = "".join(ch for ch in body.phone if ch.isdigit())[-12:]
    if len(vp) < 10:
        raise HTTPException(400, "Enter a valid mobile number")
    p = await _raw_db.rewards_participants.find_one({"id": body.participant_id, "salon_slug": slug, "consent": True}, {"_id": 0, "id": 1, "phone": 1, "tenant_id": 1})
    if not p:
        raise HTTPException(404, "Applicant not found")
    if p.get("phone", "").endswith(vp[-10:]):
        raise HTTPException(400, "You can't vote for yourself — share your link with friends instead")
    removed = await _raw_db.rewards_votes.delete_one({"participant_id": p["id"], "voter_phone": vp})
    if removed.deleted_count:
        voted = False
    else:
        from pymongo.errors import DuplicateKeyError
        try:
            await _raw_db.rewards_votes.insert_one({"id": str(uuid.uuid4()), "participant_id": p["id"], "voter_phone": vp,
                                                   "tenant_id": p["tenant_id"], "salon_slug": slug, "at": _now()})
        except DuplicateKeyError:
            pass  # concurrent duplicate — already counted
        voted = True
    votes = await _raw_db.rewards_votes.count_documents({"participant_id": p["id"]})
    milestone = await _check_vote_milestones(p["id"], votes, slug) if voted else None
    return {"ok": True, "voted": voted, "votes": votes, "milestone": milestone}


# ── Vote milestone nudges (10 / 25 / 50) ──
VOTE_MILESTONES = (10, 25, 50)


def _milestone_text(name: str, salon: str, votes: int, m: int, link: str) -> str:
    nxt = next((x for x in VOTE_MILESTONES if x > m), None)
    push = f"Next stop: {nxt} votes = another casting entry." if nxt else "You're in the top tier — keep the momentum!"
    return (f"🎉 {name.split(' ')[0]}, you just crossed {m} votes ({votes} now) in the {salon} Brand Model casting! "
            f"Every 10 votes = +1 entry. {push} Share your look again: {link}")


async def _check_vote_milestones(pid: str, votes: int, slug: str) -> Optional[int]:
    p = await _raw_db.rewards_participants.find_one({"id": pid}, {"_id": 0})
    if not p:
        return None
    done = set(p.get("vote_milestones") or [])
    hit = [m for m in VOTE_MILESTONES if votes >= m and m not in done]
    if not hit:
        return None
    m = max(hit)
    await _raw_db.rewards_participants.update_one({"id": pid}, {"$addToSet": {"vote_milestones": {"$each": hit}}})
    base = os.environ.get("APP_PUBLIC_URL", "").rstrip("/")
    link = f"{base}/rewards/{slug}?vote={pid}"
    text = _milestone_text(p["name"], p.get("salon_name") or "the salon", votes, m, link)
    sent_email = sent_sms = False
    if p.get("email"):
        try:
            from email_service import _send_email
            html = (f'<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #eee;border-radius:16px;overflow:hidden">'
                    f'<div style="background:#1c1c22;padding:26px 30px"><span style="color:#e8c37f;font-size:21px;letter-spacing:1.5px">{html_lib.escape(p.get("salon_name") or "")}</span>'
                    f'<div style="color:#8a8a92;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin-top:4px">Brand Model Casting</div></div>'
                    f'<div style="padding:30px"><h2 style="margin:0 0 10px;color:#1c1c22">🎉 {m} votes — you\'re on a roll!</h2>'
                    f'<p style="font-size:14px;color:#333;line-height:1.75">{html_lib.escape(text)}</p>'
                    f'<a href="https://wa.me/?text={html_lib.escape(requests_quote(text))}" style="display:inline-block;margin-top:10px;background:#25D366;color:#fff;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:14px">Share on WhatsApp</a></div></div>')
            await _send_email([p["email"]], f"🎉 You crossed {m} votes in the Brand Model casting!", html)
            sent_email = True
        except Exception:  # noqa: BLE001
            pass
    try:
        from sms_service import send_sms
        r = await send_sms(p["phone"], text[:300])
        sent_sms = bool(r.get("sent"))
    except Exception:  # noqa: BLE001
        pass
    await _raw_db.rewards_nudges.insert_one({
        "id": str(uuid.uuid4()), "participant_id": pid, "participant_name": p["name"], "phone": p["phone"],
        "tenant_id": p["tenant_id"], "salon_slug": slug, "milestone": m, "votes": votes, "text": text,
        "sent_email": sent_email, "sent_sms": sent_sms, "wa_done": False, "created_at": _now()})
    return m


def requests_quote(s: str) -> str:
    from urllib.parse import quote
    return quote(s)


@router.post("/settings/rewards-nudges/{nid}/done")
async def tenant_nudge_done(nid: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    r = await _raw_db.rewards_nudges.update_one({"id": nid, "tenant_id": t["id"]}, {"$set": {"wa_done": True, "wa_done_at": _now(), "wa_by": user.get("email")}})
    if not r.matched_count:
        raise HTTPException(404, "Nudge not found")
    return {"ok": True}


async def ensure_rewards_indexes():
    await _raw_db.rewards_votes.create_index([("participant_id", 1), ("voter_phone", 1)], unique=True)
    await _raw_db.rewards_votes.create_index([("salon_slug", 1), ("voter_phone", 1)])
    await _raw_db.rewards_participants.create_index([("salon_slug", 1), ("phone", 1)])
    await _raw_db.rewards_participants.create_index("referred_by")
    await _raw_db.rewards_nudges.create_index([("tenant_id", 1), ("wa_done", 1)])
    await _raw_db.customers.create_index([("tenant_id", 1), ("phone", 1)])
