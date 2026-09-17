"""Settings → Link WhatsApp: the salon pairs its own WhatsApp number with the self-hosted gateway by QR."""
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from security import current_tenant, require_tenant_admin
from services import whatsapp_gateway as gw

router = APIRouter(prefix="/whatsapp-link")


@router.get("/status")
async def link_status(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    if not gw.gateway_available():
        return {"available": False, "linked": False, "status": "unavailable", "connected": False}
    return {"available": True, **await gw.status(t)}


@router.post("/start")
async def link_start(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    if not gw.gateway_available():
        raise HTTPException(503, "WhatsApp gateway is not configured on this server")
    try:
        await gw.start_session(t)
    except RuntimeError as e:
        raise HTTPException(502, f"Couldn't start WhatsApp pairing — {e}")
    fresh = {**t, "wa_gateway": await gw.tenant_session(t["id"])}
    return {"available": True, **await gw.status(fresh)}


@router.post("/unlink")
async def link_unlink(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return await gw.unlink(t)


class PairIn(BaseModel):
    phone: str = Field(..., min_length=10, max_length=16)


@router.post("/pairing-code")
async def link_pairing_code(body: PairIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    if len(re.sub(r"\D", "", body.phone)) < 10:
        raise HTTPException(400, "Enter the WhatsApp number with country code, e.g. 918217072523")
    try:
        return await gw.pairing_code(t, body.phone)
    except RuntimeError as e:
        msg = str(e)
        if "409" in msg or "400" in msg:
            raise HTTPException(409, "WhatsApp is still starting up — wait a few seconds and try again")
        raise HTTPException(502, f"Couldn't get a pairing code — {msg[:200]}")


class PrefIn(BaseModel):
    prefer_over_sms: bool


@router.put("/preferences")
async def link_prefs(body: PrefIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    from database import _raw_db
    await _raw_db.tenants.update_one({"id": t["id"], "wa_gateway": {"$exists": True}},
                                     {"$set": {"wa_gateway.prefer_over_sms": body.prefer_over_sms}})
    return {"ok": True, "prefer_over_sms": body.prefer_over_sms}


class TestSendIn(BaseModel):
    phone: str = Field(..., min_length=10, max_length=16)
    text: str = Field("", max_length=1000)
    image_url: str | None = Field(None, max_length=600)


@router.post("/test-send")
async def link_test_send(body: TestSendIn, request: Request, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    digits = re.sub(r"\D", "", body.phone)
    if len(digits) < 10:
        raise HTTPException(400, "Enter a valid mobile number with country code")
    sid = await gw.tenant_connected(t["id"])
    if not sid:
        raise HTTPException(409, "Your WhatsApp isn't linked yet — scan the QR first")
    text = body.text.strip() or f"Hello from {t.get('name', 'our salon')} ✦ This is a test message from Miracurl — your WhatsApp is linked and working."
    try:
        img = None
        if body.image_url:
            from services.wa_campaigns import _image_payload
            from security import public_base_url
            url = body.image_url if body.image_url.startswith("http") else f"{public_base_url(request)}{body.image_url}"
            img = await _image_payload(url)
        if img:
            # same shape the campaign worker sends: image + caption in one bubble
            r = await gw._call("POST", f"/sessions/{sid}/messages/send-image",
                               json={"chatId": gw.wa_chat_id(digits), **img, "caption": text[:1024]}, timeout=90.0)
            await gw._log_msg(t["id"], gw.wa_chat_id(digits), "image", text, r.get("messageId"), sid)
        else:
            r = await gw.send_text(sid, t["id"], digits, text)
    except RuntimeError as e:
        raise HTTPException(502, f"Send failed — {e}")
    return {"ok": True, "message_id": r.get("messageId"), "to": digits, "with_image": bool(img)}


# ---------------- Campaigns (CRM → selected guests) with guardrails ----------------
from typing import Optional  # noqa: E402
from fastapi import Request  # noqa: E402
from database import _raw_db  # noqa: E402
from security import public_base_url  # noqa: E402
from services import wa_campaigns as camp  # noqa: E402

CURATED = [
    {"id": "curated:facial", "label": "Glowing facial / skin care", "url": "/assets/offers/facial.jpg"},
    {"id": "curated:hair", "label": "Hair styling, colour, keratin", "url": "/assets/offers/hair.jpg"},
    {"id": "curated:spa", "label": "Spa, massage, relaxation", "url": "/assets/offers/spa.jpg"},
    {"id": "curated:men", "label": "Men's grooming, beard, haircut", "url": "/assets/offers/men.jpg"},
    {"id": "curated:dining", "label": "Restaurant dining / food", "url": "/assets/offers/dining.jpg"},
]


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
    resto = t.get("business_type") == "restaurant"
    out += [c for c in CURATED if (c["id"] == "curated:dining") == resto]
    return out


@router.get("/usage")
async def link_usage(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return await camp.usage_today(t)


class CapIn(BaseModel):
    daily_cap: int = Field(..., ge=10, le=1000)


@router.put("/daily-cap")
async def link_daily_cap(body: CapIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"wa_gateway.daily_cap": body.daily_cap}})
    return {"ok": True, "daily_cap": body.daily_cap}


async def _audience_ids(t: dict, audience: str, ids: list[str]) -> list[str]:
    if audience == "all":
        rows = await _raw_db.customers.find({"tenant_id": t["id"], "phone": {"$nin": [None, ""]}}, {"_id": 0, "id": 1}).sort("last_visit", -1).to_list(500)
    elif audience == "loyal":
        rows = await _raw_db.customers.find({"tenant_id": t["id"], "phone": {"$nin": [None, ""]}, "visits": {"$gte": 3}}, {"_id": 0, "id": 1}).sort("visits", -1).to_list(500)
    else:
        return ids
    return [r["id"] for r in rows]


@router.get("/festivals")
async def link_festivals(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Mira's festival radar (same calendar that powers Offer of the Day)."""
    from festivals import festival_today, next_festival, FESTIVALS
    from datetime import date as _date, timedelta as _td
    from routes.reports import _tenant_tz
    today = datetime.now(_tenant_tz(t)).date()
    upcoming = []
    for iso, (name, emoji, span) in sorted(FESTIVALS.items()):
        d = _date.fromisoformat(iso)
        if today < d <= today + _td(days=60):
            upcoming.append({"name": name, "emoji": emoji, "date": iso, "days_away": (d - today).days})
    return {"today": festival_today(today), "next": next_festival(today, window=60), "upcoming": upcoming[:4]}


class PosterIn(BaseModel):
    festival: str = Field("", max_length=60)
    offer_type: str = Field("festive", pattern="^(general|festive|discount|new_service|winback)$")
    discount_pct: Optional[int] = Field(None, ge=5, le=70)
    service_ids: list[str] = Field(default_factory=list, max_length=10)
    headline: str = Field("", max_length=80)


@router.post("/campaigns/poster")
async def campaign_poster(body: PosterIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Mira paints a bespoke festival / offer poster for this campaign (same engine as Offer of the Day)."""
    from routes.mira_common import _gen_image
    from festivals import festival_today, next_festival
    from routes.reports import _tenant_tz
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
        "general": "an elegant premium brand poster, soft cream and gold",
    }[body.offer_type]
    subject = "a beautifully plated gourmet dish and ambient restaurant table" if resto else "a radiant model with glossy styled hair and flawless skin"
    headline = body.headline or (f"Happy {fest}" if fest else {"discount": "Limited-Time Offer", "new_service": "Now at " + t.get("name", "our salon"),
                                                                "winback": "We Miss You", "general": t.get("name", "Special Offer")}[body.offer_type])
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
    return {"all": min(500, await _raw_db.customers.count_documents(base)),
            "loyal": min(500, await _raw_db.customers.count_documents({**base, "visits": {"$gte": 3}}))}


class ComposeIn(BaseModel):
    audience: str = Field("selected", pattern="^(selected|all|loyal)$")
    customer_ids: list[str] = Field(default_factory=list, max_length=500)
    brief: str = Field("", max_length=600)
    offer_type: str = Field("general", pattern="^(general|festive|discount|new_service|winback)$")
    service_ids: list[str] = Field(default_factory=list, max_length=10)
    discount_pct: Optional[int] = Field(None, ge=5, le=70)


@router.post("/campaigns/compose")
async def campaign_compose(body: ComposeIn, request: Request, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Mira writes the WhatsApp caption and picks the best image from the salon's own flyers/photos."""
    from routes.mira_common import _ask_json
    cands = await _image_candidates(t)
    ids = await _audience_ids(t, body.audience, body.customer_ids)
    if not ids:
        raise HTTPException(400, "Pick at least one guest")
    custs = await _raw_db.customers.find({"tenant_id": t["id"], "id": {"$in": ids}},
                                         {"_id": 0, "name": 1, "gender": 1, "visits": 1, "total_spent": 1}).to_list(500)
    base = public_base_url(request)
    svcs = await _raw_db.services.find({"tenant_id": t["id"], "id": {"$in": body.service_ids}},
                                       {"_id": 0, "name": 1, "price": 1}).to_list(10) if body.service_ids else []
    from datetime import date as _date
    from festivals import festival_today, next_festival
    from routes.reports import _tenant_tz
    _today = datetime.now(_tenant_tz(t)).date()
    fest = festival_today(_today) or next_festival(_today, window=30)
    offer_line = {
        "festive": f"FESTIVE OFFER — theme it around {fest['emoji'] + ' ' + fest['name'] if fest else 'the upcoming festival season'}"
                   f"{(' (in ' + str(fest['days_away']) + ' days)') if fest and fest.get('days_away') else ''}.",
        "discount": f"DISCOUNT OFFER — exactly {body.discount_pct or 15}% off; show original → offer price for each service.",
        "new_service": "NEW / FEATURED SERVICE announcement — make guests curious to try it.",
        "winback": "WIN-BACK — warm 'we miss you' tone with a small comeback perk.",
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
              "Write a WhatsApp message under 380 characters: friendly, Indian salon tone, 1-2 emojis max, use {name} as the "
              "greeting placeholder, include the booking link once, no hashtags. Return {\"text\": str, \"image_id\": str, \"why\": str}.")
    out = await _ask_json("You are Mira, the marketing assistant for a salon/restaurant SaaS.", prompt, model="gpt-5.4")
    pick = next((c for c in cands if c["id"] == out.get("image_id")), cands[-1] if cands else None)
    return {"text": (out.get("text") or "").strip(), "image": pick, "why": out.get("why", ""), "candidates": cands}


class CampaignIn(BaseModel):
    audience: str = Field("selected", pattern="^(selected|all|loyal)$")
    customer_ids: list[str] = Field(default_factory=list, max_length=500)
    text: str = Field(..., min_length=5, max_length=1000)
    image_url: Optional[str] = Field(None, max_length=600)
    name: str = Field("CRM campaign", max_length=80)
    scheduled_at: Optional[str] = Field(None, max_length=40)


@router.post("/campaigns")
async def campaign_create(body: CampaignIn, request: Request, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    if not await gw.tenant_connected(t["id"]):
        raise HTTPException(409, "Link your salon WhatsApp in Settings first")
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
    use = await camp.usage_today(t)
    doc.pop("recipients", None)
    return {**doc, "skipped_no_phone": len(custs) - len(rcps), "usage": use}


@router.get("/campaigns")
async def campaign_list(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    rows = await camp.list_campaigns(t["id"])
    return {"campaigns": await camp.refresh_results(t, rows[:10]) + rows[10:], "usage": await camp.usage_today(t)}


@router.get("/campaigns/{cid}")
async def campaign_detail(cid: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    doc = await _raw_db.wa_campaigns.find_one({"id": cid, "tenant_id": t["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Campaign not found")
    return doc


@router.post("/campaigns/{cid}/approve")
async def campaign_approve(cid: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """One-tap approval of a Mira-drafted festival campaign → joins the throttled queue."""
    if not await gw.tenant_connected(t["id"]):
        raise HTTPException(409, "Link your salon WhatsApp in Settings first")
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
    return {"ok": True, "status": status}


# ---------------- Replies inbox ----------------
@router.get("/inbox")
async def link_inbox(days: int = 7, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Guests' WhatsApp replies (last N days) matched to CRM profiles — book them on the spot."""
    g = t.get("wa_gateway") or {}
    if not g.get("session_id"):
        return {"replies": [], "linked": False}
    try:
        data = await gw._call("GET", f"/sessions/{g['session_id']}/messages", params={"limit": 500, "direction": "incoming"}, timeout=20.0)
    except RuntimeError as e:
        raise HTTPException(502, f"Gateway unavailable — {e}")
    # WhatsApp hides numbers behind @lid ids; learn lid→phone from our own sends
    lid_to_phone: dict[str, str] = {}
    async for m in _raw_db.whatsapp_messages.find({"tenant_id": t["id"], "provider": "openwa"}, {"_id": 0, "to": 1, "message_id": 1}).sort("created_at", -1).limit(3000):
        mm = re.match(r"^(?:true|false)_(\d+)@lid", m.get("message_id") or "")
        if mm and m.get("to"):
            lid_to_phone.setdefault(mm.group(1), re.sub(r"\D", "", m["to"].split("@")[0]))
    since = (datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 30)))).isoformat()
    out = []
    for m in data.get("messages", []):
        frm = m.get("from") or ""
        if m.get("isGroup") or frm.endswith("@g.us") or "@g.us" in (m.get("to") or "") or not (m.get("body") or "").strip() or (m.get("createdAt") or "") < since:
            continue
        digits = re.sub(r"\D", "", frm.split("@")[0])
        phone = lid_to_phone.get(digits, "") if frm.endswith("@lid") else digits
        if not phone or len(phone) > 15 or phone[-10:] == re.sub(r"\D", "", g.get("phone") or "")[-10:]:
            continue  # skip our own number's messages (sent from the salon phone)
        out.append({"phone": phone, "body": m["body"][:500], "at": m.get("createdAt"), "type": m.get("type")})
    phones = list({r["phone"][-10:] for r in out})
    custs = await _raw_db.customers.find({"tenant_id": t["id"], "phone": {"$regex": "(" + "|".join(map(re.escape, phones)) + ")$"}},
                                         {"_id": 0, "id": 1, "name": 1, "phone": 1, "visits": 1, "last_visit": 1}).to_list(500) if phones else []
    by_last10 = {re.sub(r"\D", "", c.get("phone") or "")[-10:]: c for c in custs}
    for r in out:
        c = by_last10.get(r["phone"][-10:])
        r.update({"customer_id": c["id"] if c else None, "name": c["name"] if c else "Unknown guest",
                  "visits": (c or {}).get("visits", 0), "last_visit": (c or {}).get("last_visit")})
    out.sort(key=lambda r: r["at"] or "", reverse=True)
    return {"replies": out[:200], "linked": True, "unread": len(out)}
