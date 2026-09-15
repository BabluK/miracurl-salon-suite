"""HQ unified notifications + public per-salon SEO pages."""
import os
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from database import db, _raw_db
from security import require_super_admin

router = APIRouter()


def _days_left(end) -> int:
    if not end:
        return 9999
    try:
        return (datetime.fromisoformat(str(end)[:10]).date() - datetime.now(timezone.utc).date()).days
    except ValueError:
        return 9999


async def _hiring_items(since: str) -> list:
    items = []
    apps = await _raw_db.job_applications.find(
        {"created_at": {"$gte": since}}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for a in apps:
        items.append({"id": f"app-{a['id']}", "type": "hiring", "icon": "💼",
                      "title": f"New job application — {a.get('candidate_name')}",
                      "body": f"{a.get('candidate_designation') or 'Professional'} · status {a.get('status')}",
                      "at": a["created_at"], "tab": "hiring", "unread": not a.get("seen_by_hq")})
    confirms = await _raw_db.job_applications.find(
        {"owner_confirmed": True, "owner_confirmed_at": {"$gte": since}}, {"_id": 0}).to_list(30)
    for a in confirms:
        items.append({"id": f"conf-{a['id']}", "type": "hiring", "icon": "🤝",
                      "title": f"Owner confirmed trial — {a.get('candidate_name')}",
                      "body": f"Trial {a.get('trial_date') or ''} {a.get('trial_time') or ''}",
                      "at": a["owner_confirmed_at"], "tab": "hiring", "unread": not a.get("seen_by_hq")})
    return items


async def _message_items(since: str) -> list:
    items = []
    msgs = await _raw_db.hq_messages.find(
        {"created_at": {"$gte": since}}, {"_id": 0}).sort("created_at", -1).to_list(40)
    for m in msgs:
        items.append({"id": f"msg-{m.get('id')}", "type": "inbox", "icon": "📩",
                      "title": f"Message from {m.get('salon_name') or m.get('from_email') or 'salon owner'}",
                      "body": (m.get("message") or m.get("text") or "")[:100],
                      "at": m.get("created_at"), "tab": "inbox", "unread": not m.get("read")})
    leads = await _raw_db.tenant_inquiries.find(
        {"created_at": {"$gte": since}}, {"_id": 0}).sort("created_at", -1).to_list(40)
    for q in leads:
        items.append({"id": f"lead-{q.get('id')}", "type": "lead", "icon": "🧲",
                      "title": f"New software lead — {q.get('salon_name') or q.get('name') or 'unknown'}",
                      "body": (q.get("message") or q.get("phone") or "")[:100],
                      "at": q.get("created_at"), "tab": "inquiries",
                      "unread": q.get("status", "new") == "new"})
    return items


async def _tenant_items(since: str) -> list:
    items = []
    tenants = await db.tenants.find({}, {"_id": 0}).to_list(2000)
    for t in tenants:
        if (t.get("created_at") or "") >= since:
            items.append({"id": f"tnt-{t['id']}", "type": "signup", "icon": "🎉",
                          "title": f"New salon onboarded — {t.get('name')}",
                          "body": f"{t.get('slug')} · plan {t.get('plan') or 'trial'}",
                          "at": t["created_at"], "tab": "tenants", "unread": False})
        if t.get("status") in ("active", "trial"):
            days = _days_left(t.get("subscription_end_date") or t.get("trial_end_date") or t.get("trial_ends_at"))
            if -30 <= days <= 7:
                label = f"expires in {days}d" if days >= 0 else f"EXPIRED {-days}d ago"
                items.append({"id": f"ren-{t['id']}", "type": "renewal", "icon": "⏳",
                              "title": f"{t.get('name')} — {t.get('status')} {label}",
                              "body": "Open renewals queue to follow up",
                              "at": datetime.now(timezone.utc).isoformat(), "tab": "leaderboard",
                              "unread": days <= 3})
    return items


async def _demo_items(since: str) -> list:
    items = []
    rows = await _raw_db.demo_invites.find(
        {"$or": [{"opened_at": {"$gte": since}}, {"demo_requested_at": {"$gte": since}}]},
        {"_id": 0}).to_list(100)
    for r in rows:
        who = r.get("name") or r.get("email")
        salon = f" ({r['salon_name']})" if r.get("salon_name") else ""
        if r.get("demo_requested_at"):
            slot = r.get("preferred_slot") or {}
            local = f" · {slot['local_time']} their time" if slot.get("local_time") else ""
            when = f"Booked {slot['date']} at {slot['time']} IST{local} — add it to your calendar!" if slot.get("date") else \
                f"{r.get('email')} clicked 'Request my demo time' — call them!"
            items.append({"id": f"demoreq-{r['id']}", "type": "demo", "icon": "🔥",
                          "title": f"Demo requested — {who}{salon}",
                          "body": when,
                          "invite_id": r["id"], "email": r.get("email"),
                          "picker_sent": bool(r.get("slot_picker_sent_at")),
                          "at": r["demo_requested_at"], "tab": "lead-email",
                          "unread": not r.get("seen_by_hq_req", True)})
        elif r.get("opened_at"):
            items.append({"id": f"demoopen-{r['id']}", "type": "demo", "icon": "👀",
                          "title": f"Demo invite opened — {who}{salon}",
                          "body": f"{r.get('email')} opened your invitation email",
                          "invite_id": r["id"], "email": r.get("email"),
                          "picker_sent": bool(r.get("slot_picker_sent_at")),
                          "at": r["opened_at"], "tab": "lead-email",
                          "unread": not r.get("seen_by_hq_open", True)})
    return items


async def _verify_items(since: str) -> list:
    """Public staff-verification requests + owner relieving-letter requests."""
    items = []
    rows = await _raw_db.staff_verification_requests.find(
        {"$or": [{"created_at": {"$gte": since}},
                 {"relieving_request.requested_at": {"$gte": since}},
                 {"owner_rated_at": {"$gte": since}}]}, {"_id": 0}).to_list(200)
    for r in rows:
        salon = f" ({r['salon_name']})" if r.get("salon_name") else ""
        if r.get("created_at", "") >= since:
            items.append({"id": f"vreq-{r['id']}", "type": "verify", "icon": "🪪",
                          "title": f"Staff verification request — {r.get('name')}{salon}",
                          "body": f"Call the owner ({r.get('owner_phone') or 'no phone shared'}) to verify, then generate the badge",
                          "at": r["created_at"], "tab": "verify-staff",
                          "unread": r.get("status") == "new" and not r.get("seen_by_hq", False)})
        if r.get("owner_rated_at", "") >= since:
            items.append({"id": f"vrate-{r['id']}", "type": "verify", "icon": "⭐",
                          "title": f"Owner rated {r.get('name')}: {r.get('owner_rating_label')}{salon}",
                          "body": "One-click owner rating recorded on the registry profile",
                          "at": r["owner_rated_at"], "tab": "verify-staff",
                          "unread": not r.get("seen_by_hq", True)})
        rl = r.get("relieving_request") or {}
        if rl.get("requested_at", "") >= since:
            items.append({"id": f"vrl-{r['id']}", "type": "verify", "icon": "📄",
                          "title": f"Relieving letter requested — {r.get('name')}{salon}",
                          "body": f"Owner marked exit as '{rl.get('letter_type')}' — review & send the certificate PDF"
                                  if rl.get("status") == "pending" else "Relieving letter sent ✓",
                          "at": rl["requested_at"], "tab": "verify-staff",
                          "unread": rl.get("status") == "pending" and not r.get("seen_by_hq_rl", False)})
    return items


@router.get("/super-admin/notifications")
async def hq_notifications(user=Depends(require_super_admin)):
    """Everything the super admin should know about, in one feed (last 30 days)."""
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    items = ((await _hiring_items(since)) + (await _message_items(since)) + (await _tenant_items(since))
             + (await _fee_items(since)) + (await _demo_items(since)) + (await _verify_items(since)))
    reads = {r["id"]: r async for r in _raw_db.hq_notification_reads.find({}, {"_id": 0})}
    items = [i for i in items if not (reads.get(i["id"]) or {}).get("dismissed")]
    for i in items:
        if i["id"] in reads:
            i["unread"] = False
    items.sort(key=lambda x: x.get("at") or "", reverse=True)
    items.sort(key=lambda x: 0 if x.get("unread") else 1)  # unread first, read sink below
    unread = sum(1 for i in items if i.get("unread"))
    return {"items": items[:80], "unread": unread}


class NotifReadIn(BaseModel):
    ids: list = []
    dismiss: bool = False


@router.post("/super-admin/notifications/mark-read")
async def mark_notifications_read(body: NotifReadIn, user=Depends(require_super_admin)):
    now = datetime.now(timezone.utc).isoformat()
    ids = [str(i)[:80] for i in body.ids[:200]]
    for nid in ids:
        await _raw_db.hq_notification_reads.update_one(
            {"id": nid}, {"$set": {"id": nid, "dismissed": body.dismiss, "read_at": now}}, upsert=True)
    return {"ok": True, "count": len(ids)}


async def _fee_items(since: str) -> list:
    rows = await _raw_db.placement_fees.find(
        {"created_at": {"$gte": since}}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [{"id": f"fee-{r['id']}", "type": "hiring", "icon": "💰",
             "title": f"Candidate hired — proceed with payment: {r.get('candidate_name') or 'Candidate'} at {r.get('salon_name') or 'salon'} (₹{r.get('amount', 0):,.0f} {'due' if r.get('status') == 'due' else 'paid ✓'})",
             "at": r["created_at"], "tab": "hiring",
             "unread": r.get("status") == "due" and not r.get("seen_by_hq")}
            for r in rows]


# ─────────── Public per-salon SEO pages ───────────

async def _public_catalog_and_reviews(tenant_id: str) -> tuple[list, list]:
    """Tenant-scoped reads for the public page (services by price, public non-test reviews)."""
    from database import _current_tenant_id
    tok = _current_tenant_id.set(tenant_id)
    try:
        services = await db.services.find({}, {"_id": 0, "name": 1, "price": 1, "category": 1,
                                               "duration_min": 1, "image_url": 1}).sort("price", -1).to_list(24)
        reviews = await db.reviews.find({"public": True,
                                         "$nor": [{"customer_name": {"$regex": "^TEST", "$options": "i"}},
                                                  {"comment": {"$regex": "^TEST", "$options": "i"}}]},
                                        {"_id": 0, "customer_name": 1, "rating": 1, "comment": 1, "created_at": 1}
                                        ).sort("created_at", -1).to_list(200)
    finally:
        _current_tenant_id.reset(tok)
    return services, reviews


def _rating_summary(reviews: list) -> tuple[float | None, int]:
    ratings = [float(r["rating"]) for r in reviews if r.get("rating")]
    return (round(sum(ratings) / len(ratings), 1) if ratings else None), len(ratings)


def _public_page_payload(t: dict, s: str, services: list, reviews: list, extra: dict | None = None) -> dict:
    avg, count = _rating_summary(reviews)
    return {
        "name": t.get("name"), "slug": s, "location": t.get("location") or "",
        "business_type": t.get("business_type") or "salon", "phone": t.get("phone") or "", "about": t.get("about") or "",
        "gallery": [p["url"] for p in (t.get("gallery") or [])][:6], "logo_url": t.get("logo_url") or "",
        "avg_rating": avg, "reviews_count": count, "services": services,
        "reviews": [r for r in reviews if (r.get("comment") or "").strip()][:6], "book_url": f"/book/{s}",
        "hero_image": t.get("hero_image") or t.get("book_bg") or "", "hours": t.get("hours") or "",
        "open_time": t.get("open_time") or "10:00", "close_time": t.get("close_time") or "21:00",
        "maps_url": t.get("maps_url") or "", "instagram_url": t.get("instagram_url") or "",
        "facebook_url": t.get("facebook_url") or "", "youtube_url": t.get("youtube_url") or "",
        "whatsapp_number": t.get("whatsapp_number") or "",
        "branches": [b.get("name") for b in (t.get("branches") or []) if b.get("name")],
        **(extra or {}),
    }


async def _public_page_extras(t: dict) -> dict:
    """Social proof + upsell flags for the landing page (all tenant-scoped via explicit tenant_id)."""
    tid = t["id"]
    from routes.hair_colors import _catalog_with_images
    customers = await _raw_db.customers.count_documents({"tenant_id": tid})
    mem = await _raw_db.memberships.find_one({"tenant_id": tid, "active": True}, {"_id": 0, "name": 1, "cashback_pct": 1, "discount_pct": 1, "price": 1},
                                             sort=[("price", -1)])
    gift = (t.get("gift_card_settings") or {}).get("enabled", True)
    shades = [c for c in await _catalog_with_images(tid) if c.get("image_url")][:6] if t.get("business_type") != "restaurant" else []
    return {"customers_count": customers, "membership": mem, "gift_cards_enabled": bool(gift),
            "shades": [{"id": c["id"], "name": c["name"], "image_url": c["image_url"], "swatch": c.get("swatch")} for c in shades]}


@router.get("/public/salon-page/{slug}")
async def public_salon_page(slug: str):
    t = await db.tenants.find_one({"slug": slug, "status": {"$in": ["active", "trial"]}}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Salon not found")
    services, reviews = await _public_catalog_and_reviews(t["id"])
    try:
        extra = await _public_page_extras(t)
    except Exception:  # noqa: BLE001 — extras are decorative
        extra = {}
    return _public_page_payload(t, slug, services, reviews, extra)


@router.get("/public/sitemap-salons.xml")
async def sitemap_salons():
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com").rstrip("/")
    tenants = await db.tenants.find({"status": {"$in": ["active", "trial"]}}, {"_id": 0, "slug": 1}).to_list(2000)
    urls = "\n".join(
        f"  <url><loc>{base}/salon/{t['slug']}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>"
        for t in tenants)
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "\n</urlset>")
    return Response(content=xml, media_type="application/xml")
