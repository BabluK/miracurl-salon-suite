"""Competitor Price Watch — Mira re-checks US competitor pricing pages monthly and flags when Miracurl is
no longer the cheapest. Results live in platform_settings {key: "competitor_watch"}."""
import logging
import re
from datetime import datetime, timezone

import httpx

from database import _raw_db

log = logging.getLogger("competitor_watch")

# (name, pricing url, segment, benchmark lowest monthly USD as of Oct 2026 — used only when the live page can't be read)
COMPETITORS = [
    ("Fresha", "https://www.fresha.com/for-business/pricing", "salon", 19.95),
    ("Vagaro", "https://www.vagaro.com/pro/pricing", "salon", 30.00),
    ("GlossGenius", "https://glossgenius.com/pricing", "salon", 28.00),
    ("Square Appointments", "https://squareup.com/us/en/appointments/pricing", "salon", 49.00),
    ("Square for Restaurants", "https://squareup.com/us/en/point-of-sale/restaurants/pricing", "restaurant", 49.00),
    ("Toast POS", "https://pos.toasttab.com/pricing", "restaurant", 69.00),
]
OUR_KEYS = {"salon": "intl_starter_monthly", "restaurant": "resto_intl_monthly"}
_PRICE_RE = re.compile(r"(?<![+\w])\$\s?(\d{1,3}(?:\.\d{1,2})?)\s*(?:/|per)\s*(?:mo\b|month)", re.I)
_UA = {"User-Agent": "Mozilla/5.0 (compatible; MiraPriceWatch/1.0; +https://miracurl-suite.com)"}


def _lowest_monthly(html: str, benchmark: float) -> tuple[float | None, list[float]]:
    """Lowest base-plan monthly price on the page. Add-on prices ("+$10/mo") and anything under half the known
    benchmark (per-seat extras, promos) are ignored so a $10 add-on never masquerades as the plan price."""
    text = re.sub(r"<[^>]+>", " ", html)
    prices = sorted({float(p) for p in _PRICE_RE.findall(text) if benchmark * 0.5 <= float(p) <= 500})
    return (prices[0] if prices else None), prices[:10]


async def _check_one(client: httpx.AsyncClient, name: str, url: str, segment: str, benchmark: float) -> dict:
    row = {"name": name, "url": url, "segment": segment, "benchmark": benchmark, "checked_at": datetime.now(timezone.utc).isoformat()}
    try:
        r = await client.get(url, headers=_UA, timeout=20, follow_redirects=True)
        lowest, prices = _lowest_monthly(r.text, benchmark) if r.status_code == 200 else (None, [])
        if lowest is None:
            raise ValueError(f"no monthly price found (HTTP {r.status_code})")
        row.update({"lowest_monthly": lowest, "prices_seen": prices, "source": "live"})
    except Exception as e:  # noqa: BLE001 — competitor pages are JS-heavy / bot-guarded; fall back to the benchmark
        row.update({"lowest_monthly": benchmark, "prices_seen": [], "source": "benchmark", "error": str(e)[:120]})
    return row


async def run_competitor_watch(trigger: str = "scheduler") -> dict:
    from services.plans import PLAN_CATALOG
    async with httpx.AsyncClient() as client:
        rows = [await _check_one(client, *c) for c in COMPETITORS]
    verdicts = {}
    for seg, key in OUR_KEYS.items():
        ours = float((PLAN_CATALOG.get(key) or {}).get("price") or 0)
        rivals = [r for r in rows if r["segment"] == seg and r.get("lowest_monthly")]
        cheapest_rival = min(rivals, key=lambda r: r["lowest_monthly"]) if rivals else None
        cheapest = bool(ours) and (not cheapest_rival or ours < cheapest_rival["lowest_monthly"])
        verdicts[seg] = {"our_key": key, "our_monthly": ours, "cheapest": cheapest,
                         "closest_rival": cheapest_rival["name"] if cheapest_rival else None,
                         "rival_monthly": cheapest_rival["lowest_monthly"] if cheapest_rival else None,
                         "gap": round((cheapest_rival["lowest_monthly"] - ours), 2) if cheapest_rival and ours else None}
    doc = {"key": "competitor_watch", "ran_at": datetime.now(timezone.utc).isoformat(), "trigger": trigger, "rows": rows, "verdicts": verdicts}
    await _raw_db.platform_settings.update_one({"key": "competitor_watch"}, {"$set": doc}, upsert=True)
    await record_history_point(doc)
    await _flag_if_undercut(verdicts)
    return doc


async def record_history_point(doc: dict) -> None:
    """One point per calendar month (re-checks within a month overwrite) — feeds the HQ trend chart."""
    month = (doc.get("ran_at") or datetime.now(timezone.utc).isoformat())[:7]
    point = {"month": month, "ran_at": doc.get("ran_at"),
             "prices": {r["name"]: r.get("lowest_monthly") or r.get("benchmark") for r in doc.get("rows", [])},
             "ours": {seg: v.get("our_monthly") for seg, v in (doc.get("verdicts") or {}).items()}}
    await _raw_db.competitor_watch_history.update_one({"month": month}, {"$set": point}, upsert=True)


async def competitor_history() -> dict:
    """Month-over-month series for the trend chart. Backfills from the latest snapshot if history is empty."""
    if not await _raw_db.competitor_watch_history.count_documents({}):
        latest = await _raw_db.platform_settings.find_one({"key": "competitor_watch"}, {"_id": 0})
        if latest and latest.get("rows"):
            await record_history_point(latest)
    pts = await _raw_db.competitor_watch_history.find({}, {"_id": 0}).sort("month", 1).to_list(60)
    rows = []
    for p in pts:
        row = {"month": p["month"], **{k: v for k, v in (p.get("prices") or {}).items() if v is not None}}
        for seg, price in (p.get("ours") or {}).items():
            if price:
                row[f"Miracurl ({seg})"] = price
        rows.append(row)
    series = [{"key": n, "segment": sg, "ours": False} for n, _u, sg, _b in COMPETITORS]
    series += [{"key": f"Miracurl ({seg})", "segment": seg, "ours": True} for seg in OUR_KEYS]
    return {"rows": rows, "series": series, "months": len(rows)}


async def _flag_if_undercut(verdicts: dict) -> None:
    from routes.lead_common import log_mira_event
    undercut = {s: v for s, v in verdicts.items() if not v["cheapest"]}
    if not undercut:
        await log_mira_event("result", "💲 Competitor price watch: Miracurl is still the cheapest for salons and restaurants in the US.")
        return
    lines = [f"{s.title()}: ours ${v['our_monthly']:.0f}/mo vs {v['closest_rival']} ${v['rival_monthly']:.2f}/mo" for s, v in undercut.items()]
    await log_mira_event("alert", "⚠️ Competitor price watch — we're no longer the cheapest: " + " · ".join(lines))
    try:
        from email_service import _send_email, hq_notify_emails
        html = ("<div style='font-family:Georgia,serif;max-width:560px;margin:0 auto'><h2 style='color:#b8932e'>⚠️ We're no longer the cheapest</h2>"
                + "".join(f"<p style='font-size:14px'>{ln}</p>" for ln in lines)
                + "<p style='color:#666;font-size:13px'>Adjust prices in HQ → Billing &amp; Subscriptions → Plan catalog. Mira re-checks on the 1st of every month.</p></div>")
        await _send_email(hq_notify_emails("admin"), "⚠️ Price watch: a competitor is now cheaper than Miracurl", html, from_name="Mira at Miracurl")
    except Exception:  # noqa: BLE001
        log.exception("price watch email failed")


async def competitor_watch_due() -> bool:
    doc = await _raw_db.platform_settings.find_one({"key": "competitor_watch"}, {"_id": 0, "ran_at": 1})
    return not doc or (doc.get("ran_at") or "")[:7] != datetime.now(timezone.utc).isoformat()[:7]
