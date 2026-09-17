"""Settings → Link WhatsApp: the salon pairs its own WhatsApp number with the self-hosted gateway by QR."""
import re

from fastapi import APIRouter, Depends, HTTPException
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


@router.post("/test-send")
async def link_test_send(body: TestSendIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    digits = re.sub(r"\D", "", body.phone)
    if len(digits) < 10:
        raise HTTPException(400, "Enter a valid mobile number with country code")
    sid = await gw.tenant_connected(t["id"])
    if not sid:
        raise HTTPException(409, "Your WhatsApp isn't linked yet — scan the QR first")
    text = body.text.strip() or f"Hello from {t.get('name', 'our salon')} ✦ This is a test message from Miracurl — your WhatsApp is linked and working."
    try:
        r = await gw.send_text(sid, t["id"], digits, text)
    except RuntimeError as e:
        raise HTTPException(502, f"Send failed — {e}")
    return {"ok": True, "message_id": r.get("messageId"), "to": digits}


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


class ComposeIn(BaseModel):
    customer_ids: list[str] = Field(..., min_length=1, max_length=500)
    brief: str = Field("", max_length=600)


@router.post("/campaigns/compose")
async def campaign_compose(body: ComposeIn, request: Request, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Mira writes the WhatsApp caption and picks the best image from the salon's own flyers/photos."""
    from routes.mira_common import _ask_json
    cands = await _image_candidates(t)
    custs = await _raw_db.customers.find({"tenant_id": t["id"], "id": {"$in": body.customer_ids}},
                                         {"_id": 0, "name": 1, "gender": 1, "visits": 1, "total_spent": 1}).to_list(500)
    base = public_base_url(request)
    prompt = (f"Business: {t.get('name')} ({t.get('business_type') or 'salon'}), {t.get('location') or ''}. "
              f"Audience: {len(custs)} selected guests — genders {sorted({(c.get('gender') or '?') for c in custs})}, "
              f"avg visits {round(sum(c.get('visits') or 0 for c in custs) / max(1, len(custs)), 1)}. "
              f"Owner's brief: {body.brief or 'a warm offer / campaign message to bring these guests back'}. "
              f"Booking link: {base}/book/{t.get('slug', '')}. "
              f"Image options (pick exactly one id): {[{'id': c['id'], 'label': c['label']} for c in cands]}. "
              "Write a WhatsApp message under 380 characters: friendly, Indian salon tone, 1-2 emojis max, use {name} as the "
              "greeting placeholder, include the booking link once, no hashtags. Return {\"text\": str, \"image_id\": str, \"why\": str}.")
    out = await _ask_json("You are Mira, the marketing assistant for a salon/restaurant SaaS.", prompt)
    pick = next((c for c in cands if c["id"] == out.get("image_id")), cands[-1] if cands else None)
    return {"text": (out.get("text") or "").strip(), "image": pick, "why": out.get("why", ""), "candidates": cands}


class CampaignIn(BaseModel):
    customer_ids: list[str] = Field(..., min_length=1, max_length=500)
    text: str = Field(..., min_length=5, max_length=1000)
    image_url: Optional[str] = Field(None, max_length=600)
    name: str = Field("CRM campaign", max_length=80)


@router.post("/campaigns")
async def campaign_create(body: CampaignIn, request: Request, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    if not await gw.tenant_connected(t["id"]):
        raise HTTPException(409, "Link your salon WhatsApp in Settings first")
    custs = await _raw_db.customers.find({"tenant_id": t["id"], "id": {"$in": body.customer_ids}},
                                         {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(500)
    rcps = [{"customer_id": c["id"], "name": c.get("name") or "", "phone": c["phone"]}
            for c in custs if len(re.sub(r"\D", "", c.get("phone") or "")) >= 10]
    if not rcps:
        raise HTTPException(400, "None of the selected guests has a valid mobile number")
    img = body.image_url
    if img and img.startswith("/"):
        img = f"{public_base_url(request)}{img}"
    doc = await camp.create_campaign(t, name=body.name, text=body.text, image_url=img, recipients=rcps, created_by=user["id"])
    use = await camp.usage_today(t)
    doc.pop("recipients", None)
    return {**doc, "skipped_no_phone": len(custs) - len(rcps), "usage": use}


@router.get("/campaigns")
async def campaign_list(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return {"campaigns": await camp.list_campaigns(t["id"]), "usage": await camp.usage_today(t)}


@router.get("/campaigns/{cid}")
async def campaign_detail(cid: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    doc = await _raw_db.wa_campaigns.find_one({"id": cid, "tenant_id": t["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Campaign not found")
    return doc


@router.post("/campaigns/{cid}/{action}")
async def campaign_action(cid: str, action: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    status = {"pause": "paused", "resume": "queued", "cancel": "cancelled"}.get(action)
    if not status:
        raise HTTPException(400, "Unknown action")
    if not await camp.set_status(t["id"], cid, status):
        raise HTTPException(409, "Campaign already finished")
    return {"ok": True, "status": status}
