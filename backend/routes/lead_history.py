"""Lead history for the Boss — every lead Mira found, by vertical (Salon/Spa/Boutique/Barber vs Restaurant) × country,
with a per-lead timeline and the stale list (pitched 15+ days ago, no reply) that can be deleted or re-sent."""
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends

from database import _raw_db
from security import require_super_admin
from services.hq_conversion import country_of
from services.outreach_report import _country_name

router = APIRouter()
STALE_DAYS = 15
_FIELDS = {"_id": 0, "id": 1, "name": 1, "city": 1, "vertical": 1, "category": 1, "status": 1, "email": 1, "phone": 1, "score": 1, "reviews": 1,
           "created_at": 1, "sent_at": 1, "replied_at": 1, "wa_intro_sent_at": 1, "wa_intro_replied_at": 1, "demo_invite_sent_at": 1,
           "slot_picker_sent_at": 1, "meeting_invite_sent_at": 1, "demo_booked_at": 1, "demo_slot": 1, "reminder_sent_at": 1,
           "pdf_resent_at": 1, "auto_replied_at": 1, "converted_tenant_id": 1, "rejected_at": 1, "source": 1}
_EVENTS = [("created_at", "🔎 Found by Mira"), ("sent_at", "📧 Pitch e-mail sent"), ("wa_intro_sent_at", "📱 WhatsApp pitch sent"),
           ("reminder_sent_at", "🔔 Reminder sent"), ("pdf_resent_at", "📎 Pitch re-sent"), ("replied_at", "💬 Replied by e-mail"),
           ("wa_intro_replied_at", "💬 Replied on WhatsApp"), ("auto_replied_at", "🤖 Mira auto-replied"), ("demo_invite_sent_at", "📅 Demo invite sent"),
           ("slot_picker_sent_at", "🗓️ Slot picker sent"), ("meeting_invite_sent_at", "📨 Meeting invite sent"), ("demo_booked_at", "✅ Demo booked"),
           ("rejected_at", "🚫 Rejected")]


def _vertical(lead: dict) -> str:
    return "restaurant" if (lead.get("vertical") or "salon") == "restaurant" else "salon"


def _is_stale(lead: dict, cutoff: str) -> bool:
    last_touch = max([lead.get(k) or "" for k in ("sent_at", "wa_intro_sent_at", "reminder_sent_at", "pdf_resent_at")] or [""])
    heard_back = any(lead.get(k) for k in ("replied_at", "wa_intro_replied_at", "demo_booked_at", "converted_tenant_id"))
    return bool(last_touch) and last_touch < cutoff and not heard_back and lead.get("status") not in ("customer", "rejected", "demo")


def timeline(lead: dict) -> list[dict]:
    return sorted([{"at": lead[k], "label": lbl} for k, lbl in _EVENTS if lead.get(k)], key=lambda e: e["at"])


_STALE_KEYS = ("id", "name", "city", "email", "phone", "status", "sent_at", "wa_intro_sent_at")


def _country_bucket(out: dict, v: str, ld: dict) -> dict:
    code = country_of(ld.get("city"))
    return out[v]["countries"].setdefault(code, {"code": code, "country": _country_name(ld.get("city")), "total": 0, "found": 0, "pitched": 0,
                                                 "replied": 0, "demo": 0, "customers": 0, "stale": 0, "cities": {}})


def _tally(bucket: dict, ld: dict) -> None:
    bucket["total"] += 1
    bucket["found"] += 1
    bucket["pitched"] += bool(ld.get("sent_at") or ld.get("wa_intro_sent_at"))
    bucket["replied"] += bool(ld.get("replied_at") or ld.get("wa_intro_replied_at"))
    bucket["demo"] += bool(ld.get("demo_invite_sent_at") or ld.get("demo_booked_at") or ld.get("status") == "demo")
    bucket["customers"] += bool(ld.get("converted_tenant_id") or ld.get("status") == "customer")
    city = (ld.get("city") or "—").split(",")[0].strip()
    bucket["cities"][city] = bucket["cities"].get(city, 0) + 1


def _stale_row(ld: dict, v: str, country: str) -> dict:
    last_touch = max(ld.get("sent_at") or "", ld.get("wa_intro_sent_at") or "", ld.get("reminder_sent_at") or "", ld.get("pdf_resent_at") or "")
    return {**{k: ld.get(k) for k in _STALE_KEYS}, "vertical": v, "country": country,
            "days_silent": (datetime.now(timezone.utc) - datetime.fromisoformat(last_touch)).days}


@router.get("/super-admin/mira-leads/history")
async def lead_history(user=Depends(require_super_admin)):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=STALE_DAYS)).isoformat()
    leads = await _raw_db.mira_leads.find({}, _FIELDS).sort("created_at", -1).to_list(5000)
    out = {"salon": {"label": "Salon · Spa · Boutique · Barber", "total": 0, "countries": {}},
           "restaurant": {"label": "Restaurants", "total": 0, "countries": {}}}
    stale = []
    for ld in leads:
        v = _vertical(ld)
        bucket = _country_bucket(out, v, ld)
        out[v]["total"] += 1
        _tally(bucket, ld)
        if _is_stale(ld, cutoff):
            bucket["stale"] += 1
            stale.append(_stale_row(ld, v, bucket["country"]))
    for v in out.values():
        for c in v["countries"].values():
            c["cities"] = sorted(c["cities"].items(), key=lambda x: -x[1])[:6]
        v["countries"] = sorted(v["countries"].values(), key=lambda c: -c["total"])
    return {"stale_days": STALE_DAYS, "verticals": out, "stale": sorted(stale, key=lambda s: -s["days_silent"])[:200], "total": len(leads)}


@router.get("/super-admin/mira-leads/{lid}/timeline")
async def lead_timeline(lid: str, user=Depends(require_super_admin)):
    ld = await _raw_db.mira_leads.find_one({"id": lid}, _FIELDS) or {}
    return {"id": lid, "name": ld.get("name"), "events": timeline(ld)}
