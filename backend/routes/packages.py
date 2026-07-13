"""Mira Packages — AI-designed Men/Women service bundles with one-tap Google post + WhatsApp share."""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from database import _raw_db
from security import require_tenant_admin, current_tenant

router = APIRouter()
log = logging.getLogger("packages")

AUDIENCE_HINT = {
    "men": "for MEN — grooming bundle: haircut, beard styling, hair colour, cleanup/de-tan, head massage etc.",
    "women": "for WOMEN — beauty bundle: haircut, colour, keratin/smoothening, facial, mani-pedi, threading etc.",
    "family": "for FAMILY / COUPLES — a smart mix of men's and women's services they can enjoy together.",
}


class SuggestIn(BaseModel):
    audience: str = "women"
    discount_pct: int | None = None


@router.post("/mira-packages/suggest")
async def suggest_package(body: SuggestIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    from routes.mira_studio import _ask_json
    from routes.day_offers import _catalog_context
    if body.audience not in AUDIENCE_HINT:
        raise HTTPException(400, "audience must be men, women or family")
    ctx = await _catalog_context(t)
    catalog = "\n".join(f"- {s['name']} · ₹{s['price']:.0f} ({s.get('category') or 'General'})" for s in ctx["services"][:30])
    eng = ", ".join(f"{n} ({c} pts)" for n, c in ctx.get("engagement", []))
    pct = max(5, min(60, int(body.discount_pct))) if body.discount_pct else None
    pct_line = (f"The owner has FIXED the package discount at exactly {pct}% off the combined value — package_price must be exactly {pct}% less."
                if pct else "Choose a compelling package discount (15-30% off the combined value).")
    data = await _ask_json(
        "You are Mira, an expert salon revenue strategist for Indian salons. You design irresistible service "
        "packages that feel premium yet great value.",
        f"Salon: {t.get('name')}. Design ONE service package {AUDIENCE_HINT[body.audience]}\n"
        f"{'AUDIENCE INSIGHTS — services ranked by social engagement: ' + eng + chr(10) if eng else ''}"
        f"SERVICE CATALOG (real prices — never invent services):\n{catalog}\n"
        f"Pick 3-5 REAL services. {pct_line}\n"
        'Return JSON: {"name":"<catchy 3-6 word package name>","tagline":"<one premium punchy line>",'
        '"services":[{"name":"<exact catalog name>","price":<num>}],"total_value":<sum of prices>,'
        '"package_price":<discounted bundle price, round to nearest 49/99>,'
        '"caption":"<ready-to-post WhatsApp/Google caption with emojis, list services, show total value vs package price, end with book-now nudge>"}')
    if not data.get("name") or not isinstance(data.get("services"), list) or not data["services"]:
        raise HTTPException(400, "Mira returned an unexpected package format — try again")
    total = float(data.get("total_value") or sum(float(s.get("price") or 0) for s in data["services"]))
    price = float(data.get("package_price") or 0)
    doc = {
        "id": str(uuid.uuid4()), "tenant_id": t["id"], "audience": body.audience,
        "name": str(data["name"])[:80], "tagline": str(data.get("tagline") or "")[:140],
        "services": [{"name": str(s.get("name", ""))[:60], "price": float(s.get("price") or 0)}
                     for s in data["services"][:5]],
        "total_value": total, "package_price": price,
        "discount_pct": round((1 - price / total) * 100) if total > 0 and 0 < price < total else (pct or 0),
        "caption": str(data.get("caption") or "")[:900],
        "status": "draft", "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _raw_db.mira_packages.insert_one({**doc})
    return {"package": doc}


class PublishIn(BaseModel):
    package_id: str
    template: str = "dark_glam"


@router.post("/mira-packages/publish")
async def publish_package(body: PublishIn, request: Request, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Generate a poster and post the package on Google Business. WhatsApp status is shared from the UI."""
    doc = await _raw_db.mira_packages.find_one({"id": body.package_id, "tenant_id": t["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Package not found — ask Mira again")
    if doc["status"] == "published" and doc.get("flyer_url"):
        return {"package": doc}
    from routes.offer_flyer import FlyerIn, create_flyer
    audience_label = {"men": "For Men", "women": "For Women", "family": "For the Family"}[doc["audience"]]
    try:
        flyer = await create_flyer(FlyerIn(
            template=body.template,
            headline=doc["name"],
            offer_text=f"{audience_label} · Worth ₹{doc['total_value']:.0f} — now ₹{doc['package_price']:.0f}",
            services=[f"{s['name']} ₹{s['price']:.0f}" for s in doc["services"]],
            valid_until="Limited period package"), user=user, t=t)
        flyer_id, flyer_url = flyer["id"], flyer["url"]
    except Exception as e:
        log.warning(f"package flyer generation failed: {e}")
        flyer_id, flyer_url = None, None
    google_post = None
    try:
        from routes.social_connect import publish_google_post, _base
        image_abs = f"{_base(request)}{flyer_url}" if flyer_url else None
        google_post = await publish_google_post(t["id"], doc["caption"], image_abs, offer_title=doc["name"])
    except Exception as e:
        log.warning(f"package google post failed: {e}")
        google_post = {"ok": False, "error": str(e)[:200]}
    patch = {"status": "published", "published_at": datetime.now(timezone.utc).isoformat(),
             "flyer_id": flyer_id, "flyer_url": flyer_url, "google_post": google_post}
    await _raw_db.mira_packages.update_one({"id": doc["id"]}, {"$set": patch})
    return {"package": {**doc, **patch}}


@router.get("/mira-packages")
async def list_packages(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    docs = await _raw_db.mira_packages.find(
        {"tenant_id": t["id"]}, {"_id": 0}).sort("created_at", -1).to_list(10)
    return {"packages": docs}
