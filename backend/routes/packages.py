"""Mira Packages — AI-designed Men/Women service bundles with one-tap Google post + WhatsApp share."""
import logging
import re
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from database import _raw_db
from security import require_tenant_admin, current_tenant, require_super_admin

router = APIRouter()
log = logging.getLogger("packages")

AUDIENCE_HINT = {
    "men": "for MEN — a grooming bundle men will love. Pick ONLY from the service catalog below.",
    "women": "for WOMEN — a beauty bundle women will love. Pick ONLY from the service catalog below.",
    "family": "for FAMILY / COUPLES — a smart mix of men's and women's services they can enjoy together. Pick ONLY from the service catalog below.",
}

_MEN_RE = re.compile(r"\b(men|man|male|gents?|boys?|beard|moustache|mustache|shave)\b", re.I)
_WOMEN_RE = re.compile(r"\b(women|woman|female|ladies|lady|girls?|bridal|bride|saree|sari|mehendi|mehndi|blouse)\b", re.I)


def _service_gender(s: dict) -> str:
    """men / women / unisex — prefers the owner-curated `gender` field (Services page);
    falls back to inferring from the service name + category text."""
    g = (s.get("gender") or "").lower()
    if g in ("male", "men"):
        return "men"
    if g in ("female", "women"):
        return "women"
    if g == "unisex":
        return "unisex"
    text = f"{s.get('name', '')} {s.get('category', '')}"
    m, w = bool(_MEN_RE.search(text)), bool(_WOMEN_RE.search(text))
    if m and not w:
        return "men"
    if w and not m:
        return "women"
    return "unisex"


def _audience_pool(services: list, audience: str) -> list:
    """Men get men's + unisex services, women get women's + unisex, family gets everything."""
    if audience not in ("men", "women"):
        return services
    pool = [s for s in services if _service_gender(s) in ("unisex", audience)]
    return pool if len(pool) >= 2 else services


class SuggestIn(BaseModel):
    audience: str = "women"
    discount_pct: int | None = None
    valid_days: int | None = None


async def _generate_package(t: dict, audience: str, pct: int | None = None,
                            valid_days: int | None = None, auto_reason: str | None = None) -> dict:
    """Core Mira package generation — used by the suggest endpoint AND the Monday auto-scheduler."""
    from routes.mira_studio import _ask_json
    from routes.day_offers import _catalog_context
    ctx = await _catalog_context(t)
    pool = _audience_pool(ctx["services"], audience)
    catalog = "\n".join(f"- {s['name']} · ₹{s['price']:.0f} ({s.get('category') or 'General'})" for s in pool[:30])
    eng = ", ".join(f"{n} ({c} pts)" for n, c in ctx.get("engagement", []))
    pct = max(5, min(60, int(pct))) if pct else None
    real = {s["name"].lower().strip(): s for s in pool}
    valid, bad_names = [], []
    for attempt in range(2):
        data = await _ask_json(
            "You are Mira, an expert salon revenue strategist for Indian salons. You design irresistible service "
            "packages that feel premium yet great value.",
            _pkg_prompt(t, audience, catalog, eng, pct, bad_names, attempt))
        if not data.get("name") or not isinstance(data.get("services"), list) or not data["services"]:
            raise HTTPException(400, "Mira returned an unexpected package format — try again")
        valid, bad_names = _match_catalog_services(data, real)
        if len(valid) >= 2:
            break
    if len(valid) < 2:
        raise HTTPException(400, "Mira picked services not on your menu — try again")
    doc = _package_doc(t, audience, data, valid, pct, valid_days, auto_reason)
    await _raw_db.mira_packages.insert_one({**doc})
    return doc


def _pkg_prompt(t: dict, audience: str, catalog: str, eng: str,
                pct: int | None, bad_names: list, attempt: int) -> str:
    pct_line = (f"The owner has FIXED the package discount at exactly {pct}% off the combined value — package_price must be exactly {pct}% less."
                if pct else "Choose a compelling package discount (15-30% off the combined value).")
    gender_line = ("STRICT: this package is exclusively for this audience — every service you pick must be from the list above (they are already suitable). "
                   if audience in ("men", "women") else "")
    retry_line = (f"YOUR PREVIOUS PICKS WERE REJECTED — these are NOT on the menu: {', '.join(bad_names)}. "
                  "Copy service names EXACTLY, character-for-character, from the catalog above.\n") if attempt else ""
    return (f"Salon: {t.get('name')}. Design ONE service package {AUDIENCE_HINT[audience]}\n"
            f"{'AUDIENCE INSIGHTS — services ranked by social engagement: ' + eng + chr(10) if eng else ''}"
            f"SERVICE CATALOG (real prices — never invent, rename or abbreviate services):\n{catalog}\n"
            f"Pick 3-5 REAL services, copying names EXACTLY as written above. {gender_line}{pct_line}\n{retry_line}"
            'Return JSON: {"name":"<catchy 3-6 word package name>","tagline":"<one premium punchy line>",'
            '"services":[{"name":"<exact catalog name>","price":<num>}],"total_value":<sum of prices>,'
            '"package_price":<discounted bundle price, round to nearest 49/99>,'
            '"caption":"<ready-to-post WhatsApp/Google caption with emojis, list services, show total value vs package price, end with book-now nudge>"}')


def _match_catalog_services(data: dict, real: dict) -> tuple[list, list]:
    """Match Mira's picks to real catalog services — returns (valid, rejected_names)."""
    valid, bad = [], []
    for s in data["services"][:6]:
        m = real.get(str(s.get("name", "")).lower().strip())
        if m:
            valid.append({"name": m["name"], "price": float(m["price"])})
        else:
            bad.append(str(s.get("name", ""))[:40])
    return valid, bad


def _pkg_price(data: dict, total: float, pct: int | None) -> tuple[float, int]:
    """Resolve the bundle price and the effective discount %."""
    price = float(data.get("package_price") or 0)
    if pct:
        price = round(total * (1 - pct / 100))
    elif not (0 < price < total):
        price = round(total * 0.8)
    disc = round((1 - price / total) * 100) if total > 0 and 0 < price < total else (pct or 0)
    return float(price), disc


def _package_doc(t: dict, audience: str, data: dict, valid: list,
                 pct: int | None, valid_days: int | None, auto_reason: str | None) -> dict:
    total = sum(s["price"] for s in valid)
    price, disc = _pkg_price(data, total, pct)
    doc = {
        "id": str(uuid.uuid4()), "tenant_id": t["id"], "audience": audience,
        "name": str(data["name"])[:80], "tagline": str(data.get("tagline") or "")[:140],
        "services": [{"name": str(s.get("name", ""))[:60], "price": float(s.get("price") or 0)}
                     for s in valid[:5]],
        "total_value": total, "package_price": price,
        "discount_pct": disc,
        "caption": str(data.get("caption") or "")[:900],
        "valid_days": valid_days if valid_days in (3, 4, 7, 15, 30) else None,
        "status": "draft", "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if auto_reason:
        doc["auto_suggested"] = True
        doc["auto_reason"] = auto_reason
    return doc


@router.post("/mira-packages/suggest")
async def suggest_package(body: SuggestIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    from security import ai_daily_quota
    if body.audience not in AUDIENCE_HINT:
        raise HTTPException(400, "audience must be men, women or family")
    await ai_daily_quota(t["id"], "admin_ai_suggest", 80)
    doc = await _generate_package(t, body.audience, pct=body.discount_pct, valid_days=body.valid_days)
    return {"package": doc}


class PublishIn(BaseModel):
    package_id: str
    template: str = "dark_glam"
    discount_pct: int | None = None  # owner-adjusted % — price recalculated server-side


def _apply_pkg_pct(doc: dict, pct: int) -> dict:
    """Owner changed the package discount % — recompute the bundle price and fix the caption copy."""
    old_pct = int(doc.get("discount_pct") or 0)
    old_price = round(float(doc.get("package_price") or 0))
    total = float(doc.get("total_value") or 0)
    new_price = round(total * (1 - pct / 100))
    doc["package_price"] = float(new_price)
    doc["discount_pct"] = pct
    cap = doc.get("caption") or ""
    if old_price and old_price != new_price:
        cap = cap.replace(f"₹{old_price}", f"₹{new_price}")
    if old_pct and old_pct != pct:
        cap = cap.replace(f"{old_pct}%", f"{pct}%")
    doc["caption"] = cap
    return doc


def _live_filter(tenant_id: str) -> dict:
    return {"tenant_id": tenant_id, "status": "published",
            "$or": [{"expires_at": None}, {"expires_at": {"$gte": datetime.now(timezone.utc).isoformat()}}]}


MAX_LIVE_PACKAGES = 4


@router.get("/mira-packages/live")
async def live_packages(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Published & non-expired packages currently visible on the public booking page."""
    docs = await _raw_db.mira_packages.find(
        _live_filter(t["id"]), {"_id": 0}).sort("published_at", -1).to_list(20)
    return {"packages": docs, "max_live": MAX_LIVE_PACKAGES}


@router.post("/mira-packages/{pid}/unpublish")
async def unpublish_package(pid: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Take a package off the public booking page."""
    res = await _raw_db.mira_packages.update_one(
        {"id": pid, "tenant_id": t["id"]},
        {"$set": {"status": "unpublished", "unpublished_at": datetime.now(timezone.utc).isoformat()}})
    if not res.matched_count:
        raise HTTPException(404, "Package not found")
    return {"ok": True}


async def _render_package_flyer(doc: dict, template: str, user, t) -> tuple:
    """Generate the package poster — returns (flyer_id, flyer_url), (None, None) on failure."""
    from routes.offer_flyer import FlyerIn, create_flyer
    audience_label = {"men": "For Men", "women": "For Women", "family": "For the Family"}[doc["audience"]]
    valid_days = doc.get("valid_days")
    valid_text = f"Valid for {valid_days} days only" if valid_days else "Limited period package"
    try:
        flyer = await create_flyer(FlyerIn(
            template=template,
            headline=doc["name"],
            offer_text=f"{audience_label} · Worth ₹{doc['total_value']:.0f} — now ₹{doc['package_price']:.0f}",
            services=[f"{s['name']} ₹{s['price']:.0f}" for s in doc["services"]],
            valid_until=valid_text), user=user, t=t)
        return flyer["id"], flyer["url"]
    except Exception as e:  # noqa: BLE001 — publish must proceed without a poster
        log.warning(f"package flyer generation failed: {e}")
        return None, None


async def _post_package_social(t: dict, doc: dict, flyer_url: str | None, request: Request) -> tuple:
    """Post the package to Google Business + Instagram/Facebook — returns (google_post, meta_post)."""
    google_post, meta_post = None, None
    try:
        from routes.social_connect import publish_google_post, publish_content, _base
        image_abs = f"{_base(request)}{flyer_url}" if flyer_url else None
        google_post = await publish_google_post(t["id"], doc["caption"], image_abs, offer_title=doc["name"])
        if image_abs:
            meta_post = await publish_content(t["id"], doc["caption"], image_abs, ["instagram", "facebook"])
        else:
            meta_post = {"instagram": {"ok": False, "error": "No poster image"},
                         "facebook": {"ok": False, "error": "No poster image"}}
    except Exception as e:  # noqa: BLE001 — social failures must not block publish
        log.warning(f"package social post failed: {e}")
        google_post = google_post or {"ok": False, "error": str(e)[:200]}
    return google_post, meta_post


@router.post("/mira-packages/publish")
async def publish_package(body: PublishIn, request: Request, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Generate a poster and post the package on Google Business. WhatsApp status is shared from the UI."""
    doc = await _raw_db.mira_packages.find_one({"id": body.package_id, "tenant_id": t["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Package not found — ask Mira again")
    if doc["status"] == "published" and doc.get("flyer_url"):
        return {"package": doc}
    live_count = await _raw_db.mira_packages.count_documents(_live_filter(t["id"]))
    if live_count >= MAX_LIVE_PACKAGES:
        raise HTTPException(400, f"You already have {MAX_LIVE_PACKAGES} live packages — remove one from the 'Live packages' list first")
    pct = max(5, min(60, int(body.discount_pct))) if body.discount_pct else None
    pct_patch = {}
    if pct and pct != int(doc.get("discount_pct") or 0):
        _apply_pkg_pct(doc, pct)
        pct_patch = {"package_price": doc["package_price"], "discount_pct": doc["discount_pct"], "caption": doc["caption"]}
    valid_days = doc.get("valid_days")
    expires_at = (datetime.now(timezone.utc) + timedelta(days=valid_days)).isoformat() if valid_days else None
    flyer_id, flyer_url = await _render_package_flyer(doc, body.template, user, t)
    google_post, meta_post = await _post_package_social(t, doc, flyer_url, request)
    patch = {**pct_patch,
             "status": "published", "published_at": datetime.now(timezone.utc).isoformat(),
             "expires_at": expires_at,
             "flyer_id": flyer_id, "flyer_url": flyer_url, "google_post": google_post, "meta_post": meta_post}
    await _raw_db.mira_packages.update_one({"id": doc["id"]}, {"$set": patch})
    return {"package": {**doc, **patch}}


_AUDIENCE_ROTATION = {"men": "women", "women": "family", "family": "men"}


def _needs_fresh_package(last: dict | None, now_iso: str, week_ago: str) -> bool:
    if not last:
        return False  # tenant never used packages — don't push unsolicited suggestions
    if last.get("created_at", "") >= week_ago:
        return False  # a fresh package already exists this week
    if last["status"] == "published" and (not last.get("expires_at") or last["expires_at"] > now_iso):
        return False  # last package is still live
    return True


async def _email_package_suggestion(t: dict, doc: dict) -> None:
    from email_service import _send_email
    recipients = [e for e in {t.get("owner_email"), t.get("salon_email")} if e]
    if not recipients:
        return
    items = "".join(f"<li>{s['name']} — ₹{s['price']:.0f}</li>" for s in doc["services"])
    await _send_email(
        recipients,
        f"✦ Mira designed a fresh package for {t.get('name')} — approve to publish",
        f"<div style='font-family:Arial,sans-serif;max-width:520px'>"
        f"<h2 style='margin:0 0 6px'>{doc['name']}</h2>"
        f"<p style='color:#666;margin:0 0 12px'>{doc['tagline']}</p>"
        f"<ul style='color:#444'>{items}</ul>"
        f"<p><b>Worth ₹{doc['total_value']:.0f} → package price ₹{doc['package_price']:.0f} "
        f"({doc['discount_pct']}% off)</b></p>"
        f"<p style='color:#666'>Your previous package expired, so Mira drafted this fresh suggestion. "
        f"Open your Miracurl dashboard → <b>Offers Studio</b> and tap <b>Publish</b> to create the poster "
        f"and post it on Google, Instagram &amp; Facebook.</p></div>")


async def run_monday_package_suggestions() -> dict:
    """Monday auto-suggester: when a tenant's last package has expired, Mira drafts a fresh
    suggestion (owner approves before publish) and emails the owner. Used by the weekly scheduler."""
    now_iso = datetime.now(timezone.utc).isoformat()
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    tenants = await _raw_db.tenants.find({"status": {"$in": ["active", "trial"]}}, {"_id": 0}).to_list(500)
    results = []
    for t in tenants:
        try:
            last = await _raw_db.mira_packages.find(
                {"tenant_id": t["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1)
            if not _needs_fresh_package(last[0] if last else None, now_iso, week_ago):
                continue
            last = last[0]
            audience = _AUDIENCE_ROTATION.get(last.get("audience"), "women")
            doc = await _generate_package(
                t, audience, valid_days=last.get("valid_days") or 7,
                auto_reason="Your previous package ended — Mira designed a fresh one to keep bookings coming")
            await _email_package_suggestion(t, doc)
            results.append({"tenant": t["name"], "ok": True, "package": doc["name"], "audience": audience})
        except Exception as e:  # noqa: BLE001 — one tenant must not block the rest
            log.warning(f"monday package suggestion failed for {t.get('name')}: {e}")
            results.append({"tenant": t.get("name"), "ok": False, "error": str(e)[:150]})
    ok = sum(1 for r in results if r.get("ok"))
    return {"suggested": ok, "failed": len(results) - ok, "results": results}


@router.post("/super-admin/run-package-suggestions")
async def trigger_package_suggestions(user=Depends(require_super_admin)):
    """Manual trigger for the Monday auto-package suggester (super-admin testing)."""
    return await run_monday_package_suggestions()


@router.get("/mira-packages")
async def list_packages(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    docs = await _raw_db.mira_packages.find(
        {"tenant_id": t["id"]}, {"_id": 0}).sort("created_at", -1).to_list(10)
    return {"packages": docs}


@router.get("/public/packages/{slug}")
async def public_packages(slug: str):
    """Published Mira packages for the public booking page (no auth)."""
    t = await _raw_db.tenants.find_one({"slug": slug}, {"_id": 0, "id": 1})
    if not t:
        raise HTTPException(404, "Salon not found")
    docs = await _raw_db.mira_packages.find(
        {"tenant_id": t["id"], "status": "published",
         "$or": [{"expires_at": None}, {"expires_at": {"$gte": datetime.now(timezone.utc).isoformat()}}]},
        {"_id": 0, "id": 1, "name": 1, "tagline": 1, "audience": 1, "services": 1,
         "total_value": 1, "package_price": 1, "discount_pct": 1, "expires_at": 1}).sort("published_at", -1).to_list(4)
    return {"packages": docs}
