"""Rewards campaign core — defaults, campaign lookup and eligibility. Shared by rewards_campaign & rewards_settlements routes (no route imports)."""
from datetime import datetime, timezone, timedelta, date  # noqa: F401

from database import _raw_db


def campaign_id_for(t: dict) -> str:
    return "restaurant" if (t or {}).get("business_type") == "restaurant" else "main"


def _plan_matches(plan: str, eligible: list) -> bool:
    return plan in eligible or any(plan.endswith("_" + e) for e in eligible)


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


def _tenant_eligible(c: dict, t: dict) -> bool:
    """Brand Model casting is a SALON campaign — restaurants are never part of it (they get their own campaign)."""
    is_resto = t.get("business_type") == "restaurant"
    if is_resto != (c.get("vertical") == "restaurant") or t.get("status") not in ("active", "trial"):
        return False
    flag = (c.get("tenant_flags") or {}).get(t["id"])
    if flag is not None:
        return bool(flag)
    return t.get("status") == "active" and _plan_matches(t.get("plan") or "", c.get("eligible_plans") or [])
