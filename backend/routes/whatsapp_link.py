"""WhatsApp (official Miracurl channel): credits, usage, festival radar, campaigns, Mira compose/poster."""
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from database import _raw_db
from security import current_tenant, public_base_url, require_tenant_admin
from services import wa_campaigns as camp

router = APIRouter(prefix="/whatsapp-link")


CURATED = [
    {"id": "curated:facial", "label": "Glowing facial / skin care", "url": "/assets/offers/facial.jpg"},
    {"id": "curated:hair", "label": "Hair styling, colour, keratin", "url": "/assets/offers/hair.jpg"},
    {"id": "curated:spa", "label": "Spa, massage, relaxation", "url": "/assets/offers/spa.jpg"},
    {"id": "curated:men", "label": "Men's grooming, beard, haircut", "url": "/assets/offers/men.jpg"},
    {"id": "curated:dining", "label": "Restaurant dining / food", "url": "/assets/offers/dining.jpg"},
]


def _sender_label() -> str:
    import os
    n = "".join(ch for ch in os.environ.get("WHATSAPP_PLATFORM_NUMBER", "") if ch.isdigit())
    return f"+{n[:2]} {n[2:7]} {n[7:]}" if len(n) == 12 else (f"+{n}" if n else "not configured")


async def _image_candidates(t: dict) -> list[dict]:
    out: list[dict] = []
    offers = await _raw_db.day_offers.find({"tenant_id": t["id"], "flyer_url": {"$nin": [None, ""]}},
                                           {"_id": 0, "title": 1, "flyer_url": 1, "date": 1}).sort("date", -1).to_list(5)
    for o in offers:
        out.append({"id": f"offer:{o['flyer_url']}", "label": f"Day offer flyer — {o.get('title', '')} ({o.get('date', '')})", "url": o["flyer_url"]})
    pkgs = await _raw_db.mira_packages.find({"tenant_id": t["id"], "flyer_url": {"$nin": [None, ""]}},
                                            {"_id": 0, "name": 1, "flyer_url": 1}).sort("created_at", -1).to_list(5)
    for p in pkgs:
        out.append({"id": f"package:{p['flyer_url']}", "label": f"Package flyer — {p.get('name', '')}", "url": p["flyer_url"]})
    gal = await _raw_db.gallery.find({"tenant_id": t["id"]}, {"_id": 0, "url": 1, "caption": 1, "kind": 1}).sort("created_at", -1).to_list(8)
    for g in gal:
        if g.get("url"):
            out.append({"id": f"gallery:{g['url']}", "label": f"Gallery photo — {g.get('caption') or g.get('kind') or 'salon work'}", "url": g["url"]})
    # drop flyers whose upload record no longer exists (deleted / other environment) so the picker never shows broken tiles
    fids = [c["url"].rsplit("/", 1)[-1] for c in out if c["url"].startswith("/api/files/")]
    alive = {u["id"] async for u in _raw_db.uploads.find({"id": {"$in": fids}, "is_deleted": False}, {"_id": 0, "id": 1})} if fids else set()
    out = [c for c in out if not c["url"].startswith("/api/files/") or c["url"].rsplit("/", 1)[-1] in alive]
    resto = t.get("business_type") == "restaurant"
    out += [c for c in CURATED if (c["id"] == "curated:dining") == resto]
    return out


@router.get("/status")
async def link_status(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Official Miracurl WhatsApp channel: always on; salons spend WhatsApp credits per message."""
    from services import whatsapp_official as official
    from services.whatsapp_cloud import wa_config
    cfg = wa_config()
    return {"available": bool(cfg["access_token"] and cfg["phone_number_id"]), "connected": True, "linked": True,
            "channel": "official", "sender": _sender_label(), "credits": await official.credits(t["id"]),
            "templates": list(official.TEMPLATES.values())}


@router.get("/usage")
async def link_usage(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return await camp.usage_today(t)


class CapIn(BaseModel):
    daily_cap: int = Field(..., ge=10, le=5000)


@router.put("/daily-cap")
async def link_daily_cap(body: CapIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"wa_daily_cap": body.daily_cap}})
    return {"ok": True, "daily_cap": body.daily_cap}


async def _messaged_ids(t: dict, days: int = 30) -> set[str]:
    """Guests who already received a WhatsApp campaign (status sent) in the last <days> — never message them twice."""
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    out: set[str] = set()
    async for c in _raw_db.wa_campaigns.find({"tenant_id": t["id"], "created_at": {"$gte": cutoff}}, {"_id": 0, "recipients.customer_id": 1, "recipients.status": 1}):
        out.update(r["customer_id"] for r in c.get("recipients") or [] if r.get("status") == "sent" and r.get("customer_id"))
    return out


async def _audience_all_ids(t: dict, audience: str) -> list[str]:
    q = {"tenant_id": t["id"], "phone": {"$nin": [None, ""]}}
    if audience == "loyal":
        q["visits"] = {"$gte": 3}
    if audience == "fresh":
        q["id"] = {"$nin": list(await _messaged_ids(t))}
    rows = await _raw_db.customers.find(q, {"_id": 0, "id": 1}).sort("visits" if audience == "loyal" else "last_visited", -1).to_list(20000)
    return [r["id"] for r in rows]


async def _audience_ids(t: dict, audience: str, ids: list[str]) -> list[str]:
    if audience == "selected":
        return ids
    return (await _audience_all_ids(t, audience))[:500]


@router.get("/festivals")
async def link_festivals(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Mira's festival radar (same calendar that powers Offer of the Day)."""
    from festivals import festival_today, next_festival, FESTIVALS
    from datetime import date as _date, timedelta as _td
    from services.day_window import _tenant_tz
    today = datetime.now(_tenant_tz(t)).date()
    upcoming = []
    for iso, (name, emoji, span) in sorted(FESTIVALS.items()):
        d = _date.fromisoformat(iso)
        if today < d <= today + _td(days=60):
            upcoming.append({"name": name, "emoji": emoji, "date": iso, "days_away": (d - today).days})
    return {"today": festival_today(today), "next": next_festival(today, window=60), "upcoming": upcoming[:4]}


class PosterIn(BaseModel):
    festival: str = Field("", max_length=60)
    offer_type: str = Field("festive", pattern="^(general|festive|discount|new_service|winback|thankyou)$")
    discount_pct: Optional[int] = Field(None, ge=5, le=70)
    service_ids: list[str] = Field(default_factory=list, max_length=10)
    headline: str = Field("", max_length=80)


@router.post("/campaigns/poster")
async def campaign_poster(body: PosterIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Mira paints a bespoke festival / offer poster for this campaign (same engine as Offer of the Day)."""
    from routes.mira_common import _gen_image
    from festivals import festival_today, next_festival
    from services.day_window import _tenant_tz
    today = datetime.now(_tenant_tz(t)).date()
    fest = body.festival or ((festival_today(today) or next_festival(today, window=60) or {}).get("name") or "")
    svcs = await _raw_db.services.find({"tenant_id": t["id"], "id": {"$in": body.service_ids}},
                                       {"_id": 0, "name": 1, "price": 1}).to_list(10) if body.service_ids else []
    resto = t.get("business_type") == "restaurant"
    theme = {
        "festive": f"a luxurious {fest or 'festive season'} celebration poster — traditional Indian festive motifs (diyas, marigolds, rangoli or the festival's own symbols), rich gold and jewel tones",
        "discount": "a bold premium sale poster, clean typography-led layout, gold and black",
        "new_service": "an elegant launch poster spotlighting a new signature service",
        "winback": "a warm 'we miss you' poster, soft blush and gold, welcoming mood",
        "thankyou": "a heartfelt gratitude poster — black and gold luxury, warm glow, elegant script feel, 'part of our journey' mood",
        "general": "an elegant premium brand poster, soft cream and gold",
    }[body.offer_type]
    subject = "a beautifully plated gourmet dish and ambient restaurant table" if resto else "a radiant model with glossy styled hair and flawless skin"
    headline = body.headline or (f"Happy {fest}" if fest else {"discount": "Limited-Time Offer", "new_service": "Now at " + t.get("name", "our salon"),
                                                                "winback": "We Miss You", "thankyou": "Thank You", "general": t.get("name", "Special Offer")}[body.offer_type])
    sub = " · ".join(x["name"] for x in svcs[:3]) if svcs else ("Hair · Skin · Nails · Spa" if not resto else "Dine-in · Takeaway · Celebrations")
    badge = f"FLAT {body.discount_pct}% OFF" if body.discount_pct else ""
    prompt = (f"Design {theme}, for a {'restaurant' if resto else 'unisex salon'} WhatsApp campaign. Square 1:1, photorealistic {subject} "
              f"as the hero in the upper two-thirds, the lower third calm and darker with soft bokeh. ABSOLUTELY NO TEXT, letters, "
              "numbers or logos anywhere in the image. Premium, Instagram-quality.")
    from services.poster_text import overlay_poster_text
    post = lambda b: overlay_poster_text(b, headline, sub, badge, t.get("name", ""))  # noqa: E731
    url = await _gen_image(prompt, t, "wa-campaign", post=post)
    if not url:
        raise HTTPException(502, "Mira couldn't paint the poster right now — try again in a moment")
    label = f"Mira poster — {headline}"
    return {"id": f"mira:{url}", "label": label, "url": url, "festival": fest}


@router.get("/audience-counts")
async def audience_counts(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    base = {"tenant_id": t["id"], "phone": {"$nin": [None, ""]}}
    total = await _raw_db.customers.count_documents(base)
    loyal = await _raw_db.customers.count_documents({**base, "visits": {"$gte": 3}})
    fresh = await _raw_db.customers.count_documents({**base, "id": {"$nin": list(await _messaged_ids(t))}})
    # One campaign sends to at most 500 guests (Meta pacing) — expose totals so the UI can say "500 of 2,060 per send"
    return {"all": min(500, total), "loyal": min(500, loyal), "fresh": min(500, fresh), "all_total": total, "loyal_total": loyal, "fresh_total": fresh,
            "messaged_30d": total - fresh, "per_send_limit": 500}


class ComposeIn(BaseModel):
    audience: str = Field("selected", pattern="^(selected|all|loyal|fresh)$")
    customer_ids: list[str] = Field(default_factory=list, max_length=500)
    brief: str = Field("", max_length=600)
    offer_type: str = Field("general", pattern="^(general|festive|discount|new_service|winback|thankyou)$")
    service_ids: list[str] = Field(default_factory=list, max_length=10)
    discount_pct: Optional[int] = Field(None, ge=5, le=70)
    image_url: Optional[str] = Field(None, max_length=200, pattern=r"^/api/files/[A-Za-z0-9-]{8,64}$")


async def _own_image_b64(t: dict, url: str | None) -> str | None:
    """Owner-uploaded campaign image (must belong to this tenant) as base64 for Mira's vision pass."""
    if not url:
        return None
    fid = url.rsplit("/", 1)[-1]
    rec = await _raw_db.uploads.find_one({"id": fid, "tenant_id": t["id"], "is_deleted": False}, {"_id": 0, "id": 1})
    if not rec:
        raise HTTPException(400, "That image isn't in your salon's uploads")
    payload = await camp._image_payload(url)
    if not payload:
        raise HTTPException(400, "Couldn't read the uploaded image")
    return payload["base64"]


@router.post("/campaigns/compose")
async def campaign_compose(body: ComposeIn, request: Request, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Mira writes the WhatsApp caption and picks the best image from the salon's own flyers/photos."""
    from routes.mira_common import _ask_json
    cands = await _image_candidates(t)
    own_b64 = await _own_image_b64(t, body.image_url)
    if own_b64:
        cands = [{"id": f"upload:{body.image_url}", "label": "Owner's uploaded image (attached)", "url": body.image_url}] + cands
    ids = await _audience_ids(t, body.audience, body.customer_ids)
    if not ids:
        raise HTTPException(400, "Pick at least one guest")
    custs = await _raw_db.customers.find({"tenant_id": t["id"], "id": {"$in": ids}},
                                         {"_id": 0, "name": 1, "gender": 1, "visits": 1, "total_spent": 1}).to_list(500)
    base = public_base_url(request)
    svcs = await _raw_db.services.find({"tenant_id": t["id"], "id": {"$in": body.service_ids}},
                                       {"_id": 0, "name": 1, "price": 1}).to_list(10) if body.service_ids else []
    from festivals import festival_today, next_festival
    from services.day_window import _tenant_tz
    _today = datetime.now(_tenant_tz(t)).date()
    fest = festival_today(_today) or next_festival(_today, window=30)
    offer_line = {
        "festive": f"FESTIVE OFFER — theme it around {fest['emoji'] + ' ' + fest['name'] if fest else 'the upcoming festival season'}"
                   f"{(' (in ' + str(fest['days_away']) + ' days)') if fest and fest.get('days_away') else ''}.",
        "discount": f"DISCOUNT OFFER — exactly {body.discount_pct or 15}% off; show original → offer price for each service.",
        "new_service": "NEW / FEATURED SERVICE announcement — make guests curious to try it.",
        "winback": "WIN-BACK — warm 'we miss you' tone with a small comeback perk.",
        "thankyou": "THANK-YOU / GRATITUDE — no discount, no sales push. The WhatsApp body is FIXED: '❤️ To our wonderful {salon} family, thank you for your trust, love and continued support. Every visit means so much to us. ✨ With gratitude, {sign-off}'. Set 'offer' to ONLY the sign-off line: '<Salon name>, <City>' (e.g. 'MDM Luxury Salon, Ranchi'). Poster text should echo the same gratitude message.",
        "general": "General campaign.",
    }[body.offer_type]
    svc_line = (" Services to feature (real catalogue, use these exact names & prices): "
                + ", ".join(f"{x['name']} ₹{int(x.get('price') or 0)}" for x in svcs)) if svcs else ""
    prompt = (f"Business: {t.get('name')} ({t.get('business_type') or 'salon'}), {t.get('location') or ''}. "
              f"{offer_line}{svc_line} "
              f"Audience: {len(custs)} selected guests — genders {sorted({(c.get('gender') or '?') for c in custs})}, "
              f"avg visits {round(sum(c.get('visits') or 0 for c in custs) / max(1, len(custs)), 1)}. "
              f"Owner's brief: {body.brief or 'a warm offer / campaign message to bring these guests back'}. "
              f"Booking link: {base}/book/{t.get('slug', '')}. "
              f"Image options (pick exactly one id): {[{'id': c['id'], 'label': c['label']} for c in cands]}. "
              + ("The owner UPLOADED THEIR OWN IMAGE (attached). Look at it carefully: read any text, offer, prices, dates, festival or service shown, "
                 "and write the message so it matches the image exactly (same offer/occasion/services); pick image_id 'upload:" + (body.image_url or "") + "'. "
                 if own_b64 else "")
              + "Write a WhatsApp message under 380 characters: friendly, Indian salon tone, 1-2 emojis max, use {name} as the "
              "greeting placeholder, include the booking link once, no hashtags. Also give: offer (one line ≤120 chars, e.g. 'Flat 20% off on all hair & skin services'), "
              "festival (the festival name if festive, else a short theme like 'Weekend Glow'), valid_till (like '12 Nov', within 10 days). "
              "Return {\"text\": str, \"image_id\": str, \"why\": str, \"offer\": str, \"festival\": str, \"valid_till\": str}.")
    out = await _ask_json("You are Mira, the marketing assistant for a salon/restaurant SaaS.", prompt, model="gpt-5.4",
                          images_b64=[own_b64] if own_b64 else None)
    pick = next((c for c in cands if c["id"] == out.get("image_id")), cands[0] if own_b64 else (cands[-1] if cands else None))
    return {"text": (out.get("text") or "").strip(), "image": pick, "why": out.get("why", ""), "candidates": cands,
            "offer": (out.get("offer") or "")[:160], "festival": (out.get("festival") or (fest or {}).get("name") or "")[:60],
            "valid_till": (out.get("valid_till") or "")[:30]}


class CampaignIn(BaseModel):
    audience: str = Field("selected", pattern="^(selected|all|loyal|fresh)$")
    customer_ids: list[str] = Field(default_factory=list, max_length=500)
    auto_batch: bool = False
    batch_mode: str = Field("hourly", pattern="^(hourly|daily|manual)$")
    batch_time: str = Field("23:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    text: str = Field(..., min_length=5, max_length=1000)
    image_url: Optional[str] = Field(None, max_length=600, pattern=r"^(/api/files/[A-Za-z0-9-]{8,64}|/assets/[A-Za-z0-9_./-]+\.(jpe?g|png|webp)|https://[^\s]+)$")
    name: str = Field("CRM campaign", max_length=80)
    scheduled_at: Optional[str] = Field(None, max_length=40)
    festival: str = Field("", max_length=60)
    offer: str = Field("", max_length=160)
    valid_till: str = Field("", max_length=30)
    offer_type: str = Field("festive", pattern="^(general|festive|discount|new_service|winback|thankyou)$")


@router.post("/campaigns")
async def campaign_create(body: CampaignIn, request: Request, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    from services import whatsapp_official as official
    if await official.credits(t["id"]) < 1:
        raise HTTPException(409, "No WhatsApp credits — top up in Settings → Credits")
    if body.offer_type == "thankyou" and (st := await official.template_status(await official.resolve_template(t, "thank_you"))) != "APPROVED":
        raise HTTPException(409, f"The Thank-You WhatsApp template is still {(st or 'pending').lower()} with Meta — usually approved within a few hours. Try again soon or pick another campaign type.")
    ids = await _audience_ids(t, body.audience, body.customer_ids)
    if not ids:
        raise HTTPException(400, "Pick at least one guest")
    custs = await _raw_db.customers.find({"tenant_id": t["id"], "id": {"$in": ids}},
                                         {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(500)
    rcps = [{"customer_id": c["id"], "name": c.get("name") or "", "phone": c["phone"]}
            for c in custs if len(re.sub(r"\D", "", c.get("phone") or "")) >= 10]
    if not rcps:
        raise HTTPException(400, "None of the selected guests has a valid mobile number")
    img = body.image_url
    if img and img.startswith("/"):
        img = f"{public_base_url(request)}{img}"
    sched = None
    if body.scheduled_at:
        from datetime import datetime as _dt, timezone as _tz
        try:
            sched = _dt.fromisoformat(body.scheduled_at.replace("Z", "+00:00")).astimezone(_tz.utc).isoformat()
        except ValueError:
            raise HTTPException(400, "Bad schedule time")
    doc = await camp.create_campaign(t, name=body.name, text=body.text, image_url=img, recipients=rcps, created_by=user["id"], scheduled_at=sched)
    await _raw_db.wa_campaigns.update_one({"id": doc["id"]}, {"$set": {"festival": body.festival, "offer": body.offer,
                                                                        "valid_till": body.valid_till, "offer_type": body.offer_type}})
    batches = 0
    mode, btime = body.batch_mode, body.batch_time
    await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"wa_batch_mode": mode, "wa_batch_time": btime}})
    if body.auto_batch and body.audience in ("all", "loyal", "fresh") and not sched:
        sent_ids = set(ids)
        rest = [i for i in await _audience_all_ids(t, body.audience) if i not in sent_ids]
        slots = _batch_slots(t, mode, btime, len(range(0, len(rest), 500)))
        for n, start in enumerate(range(0, len(rest), 500), start=1):
            chunk = rest[start:start + 500]
            bc = await _raw_db.customers.find({"tenant_id": t["id"], "id": {"$in": chunk}}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(500)
            brc = [{"customer_id": c["id"], "name": c.get("name") or "", "phone": c["phone"]} for c in bc if c.get("phone")]
            if not brc:
                continue
            b = await camp.create_campaign(t, name=f"{body.name} · batch {n + 1}", text=body.text, image_url=img, recipients=brc,
                                           created_by=user["id"], scheduled_at=slots[n - 1] or "9999-12-31T00:00:00+00:00")
            extra = {"status": "paused", "manual": True, "scheduled_at": None} if mode == "manual" else {}
            await _raw_db.wa_campaigns.update_one({"id": b["id"]}, {"$set": {"festival": body.festival, "offer": body.offer, "valid_till": body.valid_till,
                                                                             "offer_type": body.offer_type, "parent_id": doc["id"], "batch_no": n + 1,
                                                                             "batch_mode": mode, **extra}})
            batches += 1
        await _raw_db.wa_campaigns.update_one({"id": doc["id"]}, {"$set": {"batch_no": 1, "batches_total": batches + 1, "batch_mode": mode}})
        await _raw_db.wa_campaigns.update_many({"parent_id": doc["id"]}, {"$set": {"batches_total": batches + 1}})
    use = await camp.usage_today(t)
    doc.pop("recipients", None)
    return {**doc, "skipped_no_phone": len(custs) - len(rcps), "usage": use, "auto_batches_scheduled": batches, "batch_mode": mode}


def _batch_slots(t: dict, mode: str, btime: str, n: int) -> list[str | None]:
    """UTC ISO send times for n follow-up batches: hourly → +1h each; daily → next n days at btime (tenant tz); manual → None."""
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    from services.day_window import _tenant_tz
    if mode == "manual":
        return [None] * n
    now = _dt.now(_tz.utc)
    if mode == "daily":
        tz = _tenant_tz(t)
        hh, mm = (int(x) for x in btime.split(":"))
        first = now.astimezone(tz).replace(hour=hh, minute=mm, second=0, microsecond=0)
        if first <= now.astimezone(tz):
            first += _td(days=1)
        return [(first + _td(days=i)).astimezone(_tz.utc).isoformat() for i in range(n)]
    return [(now + _td(hours=i + 1)).isoformat() for i in range(n)]


@router.get("/batch-settings")
async def batch_settings(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    from services.day_window import _tenant_tz
    advice = await send_time_advice(t)
    return {"batch_mode": t.get("wa_batch_mode") or "hourly", "batch_time": t.get("wa_batch_time") or advice["hour"], "timezone": str(_tenant_tz(t)),
            "advice": advice, "time_is_default": not t.get("wa_batch_time")}


async def send_time_advice(t: dict) -> dict:
    """Mira's best send hour: hour-of-day (tenant tz) when this salon's guests actually READ or replied to WhatsApp messages.
    Falls back to platform-wide receipts, then to 11:00. wa_timestamp = Meta epoch of the last status (read time for status=read)."""
    from services.day_window import _tenant_tz
    tz = _tenant_tz(t)

    async def _hours(q: dict, ts_field: str, limit: int) -> list[int]:
        out = []
        async for m in _raw_db.whatsapp_messages.find(q, {"_id": 0, ts_field: 1}).sort("created_at", -1).limit(limit):
            v = m.get(ts_field)
            try:
                dt = datetime.fromtimestamp(int(v), tz=timezone.utc) if str(v).isdigit() else datetime.fromisoformat(str(v).replace("Z", "+00:00"))
            except (TypeError, ValueError):
                continue
            out.append(dt.astimezone(tz).hour)
        return out

    async def _sample(scope: dict) -> list[int]:
        reads = await _hours({**scope, "direction": "outbound", "status": "read", "wa_timestamp": {"$exists": True}}, "wa_timestamp", 3000)
        replies = await _hours({**scope, "direction": "inbound"}, "created_at", 1500)
        return reads + replies

    hours, source = await _sample({"tenant_id": t["id"]}), "salon"
    if len(hours) < 20:
        hours, source = await _sample({}), "platform"
    if len(hours) < 20:
        return {"hour": "11:00", "confidence": "low", "based_on": len(hours), "source": "default", "top": [],
                "why": "Not enough read receipts yet — 11 AM is the safest default for salon guests; Mira will refine this after your first campaigns."}
    buckets = [0] * 24
    for h in hours:
        if 8 <= h <= 21:  # never suggest late-night / early-morning sends
            buckets[h] += 1
    best = max(range(24), key=lambda h: buckets[h])
    top = sorted(({"hour": f"{h:02d}:00", "engagements": buckets[h]} for h in range(24) if buckets[h]), key=lambda x: -x["engagements"])[:3]
    conf = "high" if len(hours) >= 200 else "medium"
    who = "your guests" if source == "salon" else "salon guests across Miracurl"
    return {"hour": f"{best:02d}:00", "confidence": conf, "based_on": len(hours), "source": source, "top": top,
            "why": f"{who} read and reply to WhatsApp most around {best % 12 or 12} {'AM' if best < 12 else 'PM'} ({buckets[best]} of {len(hours)} engagements)."}


@router.get("/send-time-advice")
async def send_time_advice_ep(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return await send_time_advice(t)


@router.get("/campaigns")
async def campaign_list(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    rows = await camp.list_campaigns(t["id"])
    return {"campaigns": await camp.refresh_results(t, rows[:10]) + rows[10:], "usage": await camp.usage_today(t), "credit_alert": await _credit_alert(t)}


async def _credit_alert(t: dict) -> dict | None:
    """Warn before a queued/scheduled batch stalls: credits < pending recipients still to send."""
    from services import whatsapp_official as official
    credits = await official.credits(t["id"])
    pipeline = [{"$match": {"tenant_id": t["id"], "status": {"$in": ["queued", "running", "paused", "capped"]}}},
                {"$project": {"_id": 0, "id": 1, "name": 1, "batch_no": 1, "scheduled_at": 1, "status": 1,
                              "pending": {"$size": {"$filter": {"input": {"$ifNull": ["$recipients", []]}, "as": "r", "cond": {"$eq": ["$$r.status", "pending"]}}}}}}]
    active = [c for c in await _raw_db.wa_campaigns.aggregate(pipeline).to_list(200) if c["pending"] > 0]
    needed = sum(c["pending"] for c in active)
    if not active or credits >= needed:
        return None
    nxt = sorted(active, key=lambda c: (c.get("scheduled_at") or ""))[0]
    return {"credits": credits, "needed": needed, "short_by": needed - credits, "pending_batches": len(active),
            "next_batch": {"name": nxt["name"], "size": nxt["pending"], "scheduled_at": nxt.get("scheduled_at"), "covered": credits >= nxt["pending"]}}


@router.get("/campaigns/{cid}")
async def campaign_detail(cid: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    doc = await _raw_db.wa_campaigns.find_one({"id": cid, "tenant_id": t["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Campaign not found")
    return doc


@router.post("/campaigns/{cid}/approve")
async def campaign_approve(cid: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """One-tap approval of a Mira-drafted festival campaign → joins the throttled queue."""
    r = await _raw_db.wa_campaigns.update_one({"id": cid, "tenant_id": t["id"], "status": "draft"},
                                              {"$set": {"status": "queued", "approved_by": user["id"], "approved_at": datetime.now(timezone.utc).isoformat()}})
    if not r.modified_count:
        raise HTTPException(409, "Not a pending draft")
    return {"ok": True, "status": "queued"}


@router.post("/campaigns/{cid}/{action}")
async def campaign_action(cid: str, action: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    status = {"pause": "paused", "resume": "queued", "cancel": "cancelled"}.get(action)
    if not status:
        raise HTTPException(400, "Unknown action")
    if not await camp.set_status(t["id"], cid, status):
        raise HTTPException(409, "Campaign already finished")
    if action == "resume":
        await _raw_db.wa_campaigns.update_one({"id": cid, "tenant_id": t["id"], "manual": True},
                                              {"$set": {"released_by": (user.get("name") or user.get("email") or "you").split()[0],
                                                        "released_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "status": status}




class TestSendIn(BaseModel):
    phone: str = Field(..., min_length=10, max_length=16)
    festival: str = Field("", max_length=60)
    offer: str = Field("", max_length=160)
    valid_till: str = Field("", max_length=30)
    image_url: Optional[str] = Field(None, max_length=600, pattern=r"^(/api/files/[A-Za-z0-9-]{8,64}|/assets/[A-Za-z0-9_./-]+\.(jpe?g|png|webp)|https://[^\s]+)$")


@router.post("/test-send")
async def link_test_send(body: TestSendIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Send the festival campaign template to the owner's own number (1 credit)."""
    from services import whatsapp_official as official
    digits = re.sub(r"\D", "", body.phone)
    if len(digits) < 10:
        raise HTTPException(400, "Enter a valid mobile number")
    from datetime import timedelta
    params = [(user.get("name") or "there").split()[0], t.get("name", "our salon"), body.festival or "the festive season",
              body.offer or "a special festive treat", body.valid_till or (datetime.now(timezone.utc) + timedelta(days=7)).strftime("%d %b")]
    try:
        r = await official.send("festival", t, digits, params, image_url=body.image_url)
    except RuntimeError as e:
        raise HTTPException(409 if "credits" in str(e) else 502, str(e))
    return {"ok": True, "message_id": r.get("message_id"), "with_image": bool(body.image_url), "credits": await official.credits(t["id"])}


@router.get("/inbox")
async def link_inbox(days: int = 7, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Guests' WhatsApp replies (official channel webhook) matched to CRM profiles."""
    from datetime import timedelta
    since = (datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 30)))).isoformat()
    rows = await _raw_db.whatsapp_messages.find({"tenant_id": t["id"], "direction": "inbound", "created_at": {"$gte": since}, "text": {"$nin": [None, ""]}},
                                                 {"_id": 0, "wa_id": 1, "text": 1, "created_at": 1, "type": 1}).sort("created_at", -1).to_list(200)
    phones = list({(r.get("wa_id") or "")[-10:] for r in rows if r.get("wa_id")})
    custs = await _raw_db.customers.find({"tenant_id": t["id"], "phone": {"$regex": "(" + "|".join(map(re.escape, phones)) + ")$"}},
                                         {"_id": 0, "id": 1, "name": 1, "phone": 1, "visits": 1, "last_visit": 1}).to_list(500) if phones else []
    by10 = {re.sub(r"\D", "", c.get("phone") or "")[-10:]: c for c in custs}
    out = []
    for r in rows:
        c = by10.get((r.get("wa_id") or "")[-10:])
        out.append({"phone": r.get("wa_id"), "body": (r.get("text") or "")[:500], "at": r.get("created_at"), "type": r.get("type"),
                    "customer_id": c["id"] if c else None, "name": c["name"] if c else "Unknown guest",
                    "visits": (c or {}).get("visits", 0), "last_visit": (c or {}).get("last_visit")})
    return {"replies": out, "linked": True, "unread": len(out)}


# ---------------- Mira WhatsApp Receptionist ----------------
from services import wa_receptionist as rec  # noqa: E402


@router.get("/receptionist")
async def receptionist_status(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    from services.tenant_features import features_of
    from services.whatsapp_cloud import wa_config
    cfg = wa_config()
    own = (t.get("own_whatsapp") or {}) if (t.get("own_whatsapp") or {}).get("status") == "connected" else {}
    return {"enabled": t.get("wa_auto_reply") is not False, "feature_on": bool(features_of(t)["whatsapp"]),
            "channel_ready": bool(own) or bool(cfg["access_token"] and cfg["phone_number_id"] and rec.platform_number()),
            "own_number": bool(own), "display_number": own.get("display_phone_number") or _sender_label(),
            "platform_number": rec.platform_number(), "invite_link": rec.invite_link(t), "slug": t.get("slug"),
            "credits": int(t.get("wa_points") or 0), "business_type": t.get("business_type") or "salon",
            "last_inbound": await _last_inbound(t["id"]),
            "stats": await rec.stats(t["id"]), "threads": await rec.threads(t["id"])}


_SKIP_LABEL = {"no_credits": "skipped — no WhatsApp credits", "skipped_auto_reply_off": "skipped — Mira paused",
               "skipped_whatsapp_feature_off": "skipped — WhatsApp not enabled", "skipped_suspended": "skipped — account suspended",
               "human_queue": "waiting for you (human mode)", "replied": "Mira replied", "received": "processing…"}


async def _last_inbound(tenant_id: str) -> dict | None:
    """Most recent guest message + what happened to it — lets the owner see at a glance why Mira did/didn't answer."""
    m = await _raw_db.whatsapp_messages.find_one({"tenant_id": tenant_id, "direction": "inbound", "raw.id": {"$not": {"$regex": "TEST|LOCAL"}}},
                                                 {"_id": 0, "created_at": 1, "text": 1, "status": 1, "profile_name": 1, "wa_id": 1}, sort=[("created_at", -1)])
    if not m:
        return None
    return {"at": m.get("created_at"), "text": (m.get("text") or "")[:80], "from": m.get("profile_name") or f"+{m.get('wa_id', '')}",
            "status": m.get("status"), "label": _SKIP_LABEL.get(m.get("status") or "", m.get("status") or "")}


@router.get("/receptionist/qr.png")
async def receptionist_qr(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    import io
    import qrcode
    from fastapi.responses import Response
    img = qrcode.make(rec.invite_link(t), box_size=10, border=2)
    buf = io.BytesIO(); img.save(buf, format="PNG")
    return Response(buf.getvalue(), media_type="image/png", headers={"Cache-Control": "private, max-age=3600"})


def _sim_wa_id(tid: str, session: str) -> str:
    import hashlib
    return "999" + str(int(hashlib.sha256(f"{tid}:{session}".encode(), usedforsecurity=False).hexdigest()[:9], 16) % 10**9).zfill(9)


class SimulateIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    session: str = Field("sim", min_length=1, max_length=40, pattern=r"^[a-zA-Z0-9_-]+$")


@router.post("/receptionist/simulate")
async def receptionist_simulate(body: SimulateIn, request: Request, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Owner's test bench: runs the exact WhatsApp pipeline (routing, Mira, live slots, booking) without Meta or credits."""
    from security import ai_daily_quota, durable_rate_limit
    await durable_rate_limit(request, f"wa-sim:{t['id']}", limit=40, window_sec=600)
    await ai_daily_quota(t["id"], "wa_receptionist_sim", 150)
    wa_id = _sim_wa_id(t["id"], body.session)
    reply, booking, handoff = await rec.mira_reply_text(t, wa_id, rec.strip_ref(body.text), request=request)
    clean, date, confirm = rec.split_ui_markers(reply)
    slots: list[str] = []
    if date:
        from database import _current_tenant_id
        from routes.public_chat import _free_slots_for
        tok = _current_tenant_id.set(t["id"])
        try:
            slots = await _free_slots_for(date)
        finally:
            _current_tenant_id.reset(tok)
    return {"reply": clean, "booked": bool(booking), "booking": booking, "handoff": handoff, "wa_id": wa_id,
            "slots": slots[:30], "slots_date": date, "buttons": ["✅ Confirm", "✏️ Change time"] if confirm else []}


@router.delete("/receptionist/simulate/{session}")
async def receptionist_simulate_reset(session: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    wa_id = _sim_wa_id(t["id"], session)
    r = await _raw_db.public_ai_messages.delete_many({"sid": f"pub-{t['id']}-wa-{wa_id}"})
    return {"ok": True, "cleared": r.deleted_count}


async def _own_thread_or_404(t: dict, wa_id: str) -> None:
    if not re.fullmatch(r"\d{7,15}", wa_id):
        raise HTTPException(400, "bad wa_id")
    if not await rec.tenant_owns_thread(t["id"], wa_id):
        raise HTTPException(404, "No conversation with this guest")


@router.get("/receptionist/threads/{wa_id}")
async def receptionist_thread(wa_id: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    await _own_thread_or_404(t, wa_id)
    sess = await rec.get_session(wa_id)
    return {"wa_id": wa_id, "human": rec.human_active(sess), "human_until": (sess or {}).get("human_until"),
            "messages": await rec.thread_messages(t["id"], wa_id)}


class ReplyIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


@router.post("/receptionist/threads/{wa_id}/reply")
async def receptionist_reply(wa_id: str, body: ReplyIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Staff answers the guest directly (inside Meta's 24h service window). Mira stays quiet for 2h."""
    await _own_thread_or_404(t, wa_id)
    from services.whatsapp_cloud import send_text
    r = await _raw_db.tenants.update_one({"id": t["id"], "wa_points": {"$gte": 1}}, {"$inc": {"wa_points": -1}})
    if not r.modified_count:
        raise HTTPException(409, "No WhatsApp credits left — top up in Settings → Credits")
    try:
        data = await send_text(wa_id, body.text, tenant_id=t["id"])
    except RuntimeError as e:
        await _raw_db.tenants.update_one({"id": t["id"]}, {"$inc": {"wa_points": 1}})
        raise HTTPException(502, str(e))
    mid = ((data.get("messages") or [{}])[0]).get("id")
    await _raw_db.whatsapp_messages.update_one({"message_id": mid}, {"$set": {"sent_by": user.get("email") or "staff"}})
    await rec.set_human_mode(wa_id, t["id"], True, by=user.get("email") or "staff")
    return {"ok": True, "message_id": mid}


class HumanIn(BaseModel):
    on: bool


@router.put("/receptionist/threads/{wa_id}/human")
async def receptionist_human(wa_id: str, body: HumanIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Take over (Mira pauses for 2h) or hand the chat back to Mira."""
    await _own_thread_or_404(t, wa_id)
    return {"ok": True, **await rec.set_human_mode(wa_id, t["id"], body.on, by=user.get("email") or "staff")}
