"""Signature Loyalty Card: gold stamp card — 1 stamp per visit, reward when full. Salons only."""
import re
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from pymongo import ReturnDocument

from database import db, _raw_db
from security import require_tenant_admin, current_tenant, get_current_user, public_rate_limit, durable_rate_limit

router = APIRouter()

DEFAULTS = {"enabled": False, "stamps_needed": 5,
            "reward_label": "20% off your next visit", "reward_discount_pct": 20,
            "surprise_gifts": []}


def _cfg(t: dict) -> dict:
    return {**DEFAULTS, **(t.get("loyalty_stamps") or {})}


class StampSettingsIn(BaseModel):
    enabled: bool = False
    stamps_needed: int = Field(5, ge=2, le=12)
    reward_label: str = Field("20% off your next visit", max_length=80)
    reward_discount_pct: int = Field(20, ge=0, le=100)
    surprise_gifts: list[str] = Field(default_factory=list)

    def clean(self) -> dict:
        d = self.model_dump()
        d["surprise_gifts"] = [str(g).strip()[:80] for g in d["surprise_gifts"] if str(g).strip()][:12]
        return d


@router.get("/settings/loyalty-stamps")
async def get_stamp_settings(user=Depends(get_current_user), t=Depends(current_tenant)):
    return _cfg(t)


@router.put("/settings/loyalty-stamps")
async def put_stamp_settings(body: StampSettingsIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    data = body.clean()
    await db.tenants.update_one({"id": t["id"]}, {"$set": {"loyalty_stamps": data}})
    return {"ok": True, **data}


def _card(cust: dict, cfg: dict) -> dict:
    stamps = int(cust.get("stamps") or 0)
    needed = int(cfg["stamps_needed"])
    return {"found": True, "name": cust.get("name"), "stamps": stamps % needed if stamps else 0,
            "raw_stamps": stamps, "needed": needed,
            "rewards_available": max(0, min(stamps // needed - int(cust.get("stamp_rewards_redeemed") or 0), 5)),
            "reward_label": cfg["reward_label"], "reward_discount_pct": cfg["reward_discount_pct"],
            "enabled": cfg["enabled"], "customer_id": cust.get("id")}


async def _find_cust(phone: str):
    digits = re.sub(r"[^0-9]", "", phone)[-10:]
    if len(digits) < 8:
        raise HTTPException(400, "Enter a valid phone number")
    return await db.customers.find_one(
        {"phone": {"$regex": f"{re.escape(digits)}$"}},
        {"_id": 0, "id": 1, "name": 1, "stamps": 1, "stamp_rewards_redeemed": 1})


@router.get("/loyalty/stamps")
async def staff_view_card(phone: str, user=Depends(get_current_user), t=Depends(current_tenant)):
    cfg = _cfg(t)
    cust = await _find_cust(phone)
    if not cust:
        return {"found": False, "enabled": cfg["enabled"], "surprise_gifts": cfg.get("surprise_gifts") or []}
    return {**_card(cust, cfg), "surprise_gifts": cfg.get("surprise_gifts") or []}


class StampIn(BaseModel):
    phone: str = Field(..., max_length=20)


@router.post("/loyalty/stamps/add")
async def add_stamp_manual(body: StampIn, user=Depends(get_current_user), t=Depends(current_tenant)):
    cfg = _cfg(t)
    if not cfg["enabled"]:
        raise HTTPException(400, "Loyalty stamp card is not enabled in Settings")
    cust = await _find_cust(body.phone)
    if not cust:
        raise HTTPException(404, "No customer found with that phone")
    await db.customers.update_one({"id": cust["id"]}, {"$inc": {"stamps": 1}})
    cust["stamps"] = int(cust.get("stamps") or 0) + 1
    return _card(cust, cfg)


@router.post("/loyalty/stamps/redeem")
async def redeem_reward(body: StampIn, user=Depends(get_current_user), t=Depends(current_tenant)):
    cfg = _cfg(t)
    if not cfg["enabled"]:
        raise HTTPException(400, "Loyalty stamp card is not enabled in Settings")
    cust = await _find_cust(body.phone)
    if not cust:
        raise HTTPException(404, "No customer found with that phone")
    available = int(cust.get("stamps") or 0) // cfg["stamps_needed"] - int(cust.get("stamp_rewards_redeemed") or 0)
    if available < 1:
        raise HTTPException(400, "Card is not full yet — no reward to redeem")
    await db.customers.update_one({"id": cust["id"]}, {"$inc": {"stamp_rewards_redeemed": 1}})
    cust["stamp_rewards_redeemed"] = int(cust.get("stamp_rewards_redeemed") or 0) + 1
    out = _card(cust, cfg)
    out["redeemed"] = True
    return out


@router.get("/public/loyalty/{slug}")
async def public_view_card(slug: str, phone: str, request: Request):
    """Guest checks their own stamp card on the booking page. Rate-limited like wallet lookup."""
    public_rate_limit(request, key_suffix="stamp-lookup", limit=5, window_sec=600)
    await durable_rate_limit(request, "stamp-lookup", limit=5, window_sec=600)
    t = await _raw_db.tenants.find_one({"slug": slug}, {"_id": 0, "id": 1, "business_type": 1, "loyalty_stamps": 1})
    if not t:
        raise HTTPException(404, "Salon not found")
    cfg = _cfg(t)
    if not cfg["enabled"]:
        return {"enabled": False}
    digits = re.sub(r"[^0-9]", "", phone)[-10:]
    if not re.fullmatch(r"[6-9]\d{9}", digits):
        raise HTTPException(400, "Enter your full 10-digit mobile number")
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    phone_doc = await _raw_db.rate_limits.find_one_and_update(
        {"_id": f"phone:{digits}:stamps:{slug}:{day}"},
        {"$inc": {"n": 1}, "$setOnInsert": {"expire_at": datetime.now(timezone.utc) + timedelta(days=1)}},
        upsert=True, return_document=ReturnDocument.AFTER)
    if phone_doc["n"] > 8:
        raise HTTPException(429, "Too many checks for this number today — please ask at the salon desk.")
    cust = await _raw_db.customers.find_one(
        {"tenant_id": t["id"], "phone": {"$regex": f"{digits}$"}},
        {"_id": 0, "id": 1, "stamps": 1, "stamp_rewards_redeemed": 1})
    if not cust:
        return {"enabled": True, "found": False, "needed": cfg["stamps_needed"], "reward_label": cfg["reward_label"]}
    out = _card(cust, cfg)
    out.pop("customer_id", None)
    out.pop("name", None)
    return out


class LoyaltyJoinIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=60)
    phone: str = Field(..., max_length=20)
    email: str | None = Field(None, max_length=120)


@router.post("/public/loyalty-join/{slug}")
async def public_loyalty_join(slug: str, body: LoyaltyJoinIn, request: Request):
    """Walk-in guest scans the Loyalty Club QR and joins with name/phone/email."""
    public_rate_limit(request, key_suffix="loyalty-join", limit=6, window_sec=600)
    await durable_rate_limit(request, "loyalty-join", limit=6, window_sec=600)
    t = await _raw_db.tenants.find_one({"slug": slug}, {"_id": 0, "id": 1, "name": 1, "loyalty_stamps": 1})
    if not t:
        raise HTTPException(404, "Salon not found")
    cfg = _cfg(t)
    if not cfg["enabled"]:
        raise HTTPException(400, "The Loyalty Club isn't active right now — please ask at the desk.")
    digits = re.sub(r"[^0-9]", "", body.phone)[-10:]
    if not re.fullmatch(r"[6-9]\d{9}", digits):
        raise HTTPException(400, "Enter your full 10-digit mobile number")
    email = (body.email or "").strip().lower()[:120] or None
    if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(400, "That email doesn't look right")
    cust = await _raw_db.customers.find_one(
        {"tenant_id": t["id"], "phone": {"$regex": f"{digits}$"}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "stamps": 1, "stamp_rewards_redeemed": 1})
    is_new = cust is None
    if is_new:
        from models import Customer
        doc = Customer(name=body.name.strip()[:60], phone=digits, email=email,
                       gender="Other").model_dump()
        doc["tenant_id"] = t["id"]
        # loyalty joiners are physically at the desk — keep them visible in POS/CRM
        doc["crm_status"] = "active"
        doc["source"] = "loyalty_qr"
        await _raw_db.customers.insert_one(doc)
        cust = doc
    elif email and not cust.get("email"):
        await _raw_db.customers.update_one({"tenant_id": t["id"], "id": cust["id"]}, {"$set": {"email": email}})
    card = _card(cust, cfg)
    card.pop("customer_id", None)
    return {"ok": True, "is_new": is_new, "salon_name": t.get("name"),
            "first_name": (cust.get("name") or body.name).split(" ")[0],
            "stamps": card["stamps"], "needed": card["needed"], "reward_label": cfg["reward_label"]}


@router.get("/settings/loyalty-qr-poster.png")
async def loyalty_qr_poster(origin: str = "", user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Polished Loyalty Club QR poster — guests scan to join and start collecting stamps."""
    import asyncio
    import io
    import os
    from fastapi import Response
    from routes.services_catalog import _tenant_logo_bytes, _circle_logo_pil
    base = (origin or os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")).rstrip("/")
    logo_bytes = await _tenant_logo_bytes(t, base)
    cfg = _cfg(t)

    def _render() -> bytes:
        import qrcode
        from PIL import Image, ImageDraw, ImageFont
        W, H = 720, 1080
        assets_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets")
        bg_path = os.path.join(assets_dir, "posters", "loyalty_qr_bg.jpg")
        if os.path.exists(bg_path):
            bg = Image.open(bg_path).convert("RGB")
            scale = max(W / bg.width, H / bg.height)
            bg = bg.resize((round(bg.width * scale), round(bg.height * scale)))
            lx, ty = (bg.width - W) // 2, (bg.height - H) // 2
            bg = bg.crop((lx, ty, lx + W, ty + H))
        else:
            bg = Image.new("RGB", (W, H), (18, 16, 13))
        d = ImageDraw.Draw(bg)
        GOLD = (206, 165, 94)
        LIGHT = (232, 224, 210)

        def _font(name, size):
            try:
                return ImageFont.truetype(os.path.join(assets_dir, "fonts", name), size)
            except Exception:
                return ImageFont.load_default()

        def center(text, y, f, fill):
            d.text(((W - d.textlength(text, font=f)) / 2, y), text, font=f, fill=fill)

        y = 56
        if logo_bytes:
            circ = _circle_logo_pil(logo_bytes, 180)
            if circ is not None:
                bg.paste(circ, ((W - 180) // 2, y), circ)
                y += 194
        name = t.get("name") or "Our Salon"
        size = 50
        f = _font("PlayfairDisplay-Bold.ttf", size)
        while d.textlength(name, font=f) > W - 140 and size > 26:
            size -= 3
            f = _font("PlayfairDisplay-Bold.ttf", size)
        center(name, y, f, GOLD)
        y += size + 16
        lbl_f = _font("FreeSansBold.ttf", 30)
        lbl = "L O Y A L T Y   C L U B"
        lw = d.textlength(lbl, font=lbl_f)
        center(lbl, y, lbl_f, LIGHT)
        for dx in (-lw / 2 - 34, lw / 2 + 34):
            cx, cy = W / 2 + dx, y + 17
            d.polygon([(cx, cy - 9), (cx + 7, cy), (cx, cy + 9), (cx - 7, cy)], fill=GOLD)
        y += 52
        center(f"Collect {cfg['stamps_needed']} gold stamps — unlock a surprise gift", y, _font("FreeSansBold.ttf", 22), GOLD)
        y += 56
        qr = qrcode.make(f"{base}/loyalty/{t.get('slug') or ''}", box_size=10, border=1).convert("RGB")
        qs = 380
        qr = qr.resize((qs, qs))
        pad = 20
        box = Image.new("RGB", (qs + pad * 2, qs + pad * 2), (255, 255, 255))
        box.paste(qr, (pad, pad))
        m = Image.new("L", box.size, 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, box.width - 1, box.height - 1], radius=28, fill=255)
        bg.paste(box, ((W - box.width) // 2, y), m)
        y += box.height + 28
        center("Scan · Join in 10 seconds · Earn a stamp every visit", y, _font("FreeSansBold.ttf", 24), (255, 255, 255))
        y += 40
        center(f"{base.replace('https://', '')}/loyalty/{t.get('slug') or ''}", y, _font("FreeSansBold.ttf", 18), (160, 148, 128))
        out = io.BytesIO()
        bg.save(out, format="JPEG", quality=85)
        return out.getvalue()

    img = await asyncio.to_thread(_render)
    return Response(content=img, media_type="image/jpeg",
                    headers={"Content-Disposition": 'attachment; filename="loyalty-club-qr.jpg"'})
