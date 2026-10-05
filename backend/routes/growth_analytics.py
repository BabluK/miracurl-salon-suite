"""First-party traffic & conversion telemetry (traffic problem vs conversion problem) + printable signup QR codes."""
import io
import os
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from database import _raw_db
from security import global_daily_cap, public_rate_limit, require_super_admin

router = APIRouter()

MARKETING_PREFIXES = ("/", "/pricing", "/features", "/restaurant", "/signup-", "/blog", "/about-us", "/who-can-use",
                      "/mira.ai", "/contact-us", "/success-stories", "/products", "/ceo", "/demo", "/partner")
SIGNUP_PAGES = {
    "salon-india": ("Salon · India", "/signup-salon-india", "₹ INR pricing · 30-day free trial"),
    "salon-us": ("Salon · US / International", "/signup-salon-us", "$ USD pricing · 30-day free trial"),
    "restaurant-india": ("Restaurant · India", "/signup-restaurant-india", "₹ INR pricing · first month free"),
    "restaurant-us": ("Restaurant · US / International", "/signup-restaurant-us", "$ USD pricing · first month free"),
}
TRAFFIC_FLOOR = 500      # fewer unique visitors / month than this → it's a traffic problem
HEALTHY_CONVERSION = 2.0  # % visitors → signups considered healthy for SaaS trials
_VID_RE = re.compile(r"^[A-Za-z0-9_-]{8,40}$")


def _base() -> str:
    return (os.environ.get("APP_PUBLIC_URL") or os.environ.get("FRONTEND_URL") or "https://miracurl-suite.com").rstrip("/")


def _is_marketing(path: str) -> bool:
    return path == "/" or any(path.startswith(p) for p in MARKETING_PREFIXES if p != "/")


class VisitIn(BaseModel):
    vid: str = Field(..., min_length=8, max_length=40)
    path: str = Field(..., max_length=200)
    ref: str | None = Field(None, max_length=120)
    region: str | None = Field(None, pattern="^(in|intl)$")
    utm_source: str | None = Field(None, max_length=40)
    utm_medium: str | None = Field(None, max_length=40)


_SELF_REFS = ("app.emergent.sh", "emergent.sh", "emergentagent.com")


_NOT_SELF = {"ref": {"$nin": list(_SELF_REFS)}}  # rows logged before the beacon learned to skip the builder's own traffic


def _is_self_ref(ref: str) -> bool:
    ref = (ref or "").lower()
    return any(ref == d or ref.endswith("." + d) for d in _SELF_REFS)


@router.post("/public/visit", status_code=204)
async def log_visit(body: VisitIn, request: Request):
    """Lightweight beacon from marketing pages. Returns 204 even for ignored paths so the client never retries."""
    await public_rate_limit(request, key_suffix="visit", limit=240, window_sec=600)
    path = body.path.split("?")[0][:200]
    if not _VID_RE.match(body.vid) or not _is_marketing(path) or _is_self_ref(body.ref):
        return Response(status_code=204)
    try:
        await global_daily_cap("visit_beacon", 50000)
    except HTTPException:
        return Response(status_code=204)
    now = datetime.now(timezone.utc)
    await _raw_db.site_visits.insert_one({
        "vid": body.vid, "path": path, "ref": (body.ref or "")[:120], "region": body.region,
        "utm_source": (body.utm_source or "")[:40], "utm_medium": (body.utm_medium or "")[:40],
        "signup_page": path.startswith("/signup-"), "day": now.date().isoformat(), "created_at": now.isoformat(), "created_ts": now,
    })
    return Response(status_code=204)


async def _window_stats(start: datetime, end: datetime) -> dict:
    s, e = start.isoformat(), end.isoformat()
    match = {"created_at": {"$gte": s, "$lt": e}, **_NOT_SELF}
    pipeline = [{"$match": match}, {"$group": {"_id": None, "views": {"$sum": 1}, "visitors": {"$addToSet": "$vid"},
                                             "signup_visitors": {"$addToSet": {"$cond": ["$signup_page", "$vid", None]}}}}]
    agg = await _raw_db.site_visits.aggregate(pipeline).to_list(1)
    row = agg[0] if agg else {}
    visitors = len(row.get("visitors") or [])
    signup_visitors = len([v for v in (row.get("signup_visitors") or []) if v])
    signups = await _raw_db.tenants.count_documents({"created_at": {"$gte": s, "$lt": e}})
    return {"views": row.get("views", 0), "visitors": visitors, "signup_visitors": signup_visitors, "signups": signups,
            "conversion_pct": round(signups / visitors * 100, 2) if visitors else 0.0,
            "signup_page_rate_pct": round(signup_visitors / visitors * 100, 1) if visitors else 0.0}


def _verdict(cur: dict, projected: int) -> dict:
    if projected < TRAFFIC_FLOOR:
        return {"kind": "traffic", "title": "Traffic problem",
                "text": f"Only ~{projected} unique visitors projected this month (floor {TRAFFIC_FLOOR}). Not enough people see the site — "
                        "push SEO, Instagram reels, Google Business posts, WhatsApp outreach and the QR signup cards."}
    if cur["conversion_pct"] < HEALTHY_CONVERSION:
        drop = "before reaching the signup page" if cur["signup_page_rate_pct"] < 10 else "on the signup form itself"
        return {"kind": "conversion", "title": "Conversion problem",
                "text": f"{cur['visitors']} visitors but only {cur['signups']} signups ({cur['conversion_pct']}%). Most drop off {drop} — "
                        "check the GA4 signup_step funnel and Clarity recordings."}
    return {"kind": "healthy", "title": "Healthy funnel", "text": f"{cur['conversion_pct']}% of {cur['visitors']} visitors signed up — keep feeding the top of the funnel."}


@router.get("/super-admin/traffic-conversion")
async def traffic_conversion(user=Depends(require_super_admin)):
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_start = (month_start - timedelta(days=1)).replace(day=1)
    cur = await _window_stats(month_start, now + timedelta(seconds=1))
    prev = await _window_stats(prev_start, month_start)
    days_in_month = ((month_start + timedelta(days=32)).replace(day=1) - month_start).days
    elapsed = max(1, (now - month_start).days + 1)
    projected = round(cur["visitors"] / elapsed * days_in_month)
    since = (now - timedelta(days=30)).date().isoformat()
    daily = await _raw_db.site_visits.aggregate([
        {"$match": {"day": {"$gte": since}, **_NOT_SELF}},
        {"$group": {"_id": "$day", "visitors": {"$addToSet": "$vid"}}},
        {"$project": {"_id": 0, "day": "$_id", "visitors": {"$size": "$visitors"}}}, {"$sort": {"day": 1}}]).to_list(40)
    refs = await _raw_db.site_visits.aggregate([
        {"$match": {"created_at": {"$gte": month_start.isoformat()}, "ref": {"$nin": ["", None, *_SELF_REFS]}}},
        {"$group": {"_id": "$ref", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 5}]).to_list(5)
    sources = await _raw_db.site_visits.aggregate([
        {"$match": {"created_at": {"$gte": month_start.isoformat()}, "utm_source": {"$nin": ["", None]}}},
        {"$group": {"_id": "$utm_source", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 5}]).to_list(5)
    return {"month": month_start.strftime("%B %Y"), "current": cur, "previous": prev, "projected_visitors": projected,
            "traffic_floor": TRAFFIC_FLOOR, "healthy_conversion_pct": HEALTHY_CONVERSION, "verdict": _verdict(cur, projected),
            "daily": daily, "top_referrers": [{"ref": r["_id"], "n": r["n"]} for r in refs],
            "top_sources": [{"source": r["_id"], "n": r["n"]} for r in sources],
            "ga4_url": "https://analytics.google.com/", "clarity_url": f"https://clarity.microsoft.com/projects/view/{os.environ.get('CLARITY_PROJECT_ID', '')}/dashboard"}


@router.get("/super-admin/signup-qr")
async def signup_qr_list(user=Depends(require_super_admin)):
    base = _base()
    return {"base": base, "cards": [{"key": k, "label": lbl, "path": p, "note": note, "url": f"{base}{p}?utm_source=qr&utm_medium=print"}
                                    for k, (lbl, p, note) in SIGNUP_PAGES.items()]}


@router.get("/super-admin/signup-qr/{key}.png")
async def signup_qr_png(key: str, user=Depends(require_super_admin)):
    if key not in SIGNUP_PAGES:
        raise HTTPException(404, "Unknown signup page")
    import qrcode
    url = f"{_base()}{SIGNUP_PAGES[key][1]}?utm_source=qr&utm_medium=print"
    img = qrcode.make(url, box_size=12, border=2).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return Response(content=buf.getvalue(), media_type="image/png", headers={"Cache-Control": "private, max-age=3600"})
