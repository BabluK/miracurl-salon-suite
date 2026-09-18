"""Signature Loyalty Card: gold stamp card — 1 stamp per visit, reward when full. Salons only."""
import io
import os
import re
from dataclasses import dataclass
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
    logo_shape: str = Field("circle", max_length=10)

    def clean(self) -> dict:
        d = self.model_dump()
        d["surprise_gifts"] = [str(g).strip()[:80] for g in d["surprise_gifts"] if str(g).strip()][:12]
        if d.get("logo_shape") not in ("circle", "square", "blend"):
            d["logo_shape"] = "circle"
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
    gift: str | None = Field(None, max_length=80)


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
    gift = (body.gift or "").strip()[:80] or cfg["reward_label"]
    import uuid as _uuid
    await _raw_db.loyalty_gift_log.insert_one({
        "id": str(_uuid.uuid4()), "tenant_id": t["id"], "customer_id": cust["id"],
        "customer_name": cust.get("name"), "phone": re.sub(r"[^0-9]", "", body.phone)[-10:],
        "gift": gift, "is_surprise": bool(body.gift),
        "redeemed_by": user.get("name") or user.get("email") or "staff",
        "created_at": datetime.now(timezone.utc).isoformat()})
    out = _card(cust, cfg)
    out["redeemed"] = True
    out["gift"] = gift
    return out


@router.get("/reports/loyalty-gifts")
async def loyalty_gift_report(start: str, end: str, user=Depends(get_current_user), t=Depends(current_tenant)):
    """Gifts handed out on stamp-card redemptions within [start, end] (YYYY-MM-DD)."""
    rows = await _raw_db.loyalty_gift_log.find(
        {"tenant_id": t["id"], "created_at": {"$gte": start, "$lte": end + "T23:59:59.999Z"}},
        {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"total": len(rows), "rows": rows}


@router.get("/public/loyalty/{slug}")
async def public_view_card(slug: str, phone: str, request: Request):
    """Guest checks their own stamp card on the booking page. Rate-limited like wallet lookup."""
    await public_rate_limit(request, key_suffix="stamp-lookup", limit=5, window_sec=600)
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


def _ordinal(n: int) -> str:
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


class LoyaltyJoinIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=60)
    phone: str = Field(..., max_length=20)
    email: str | None = Field(None, max_length=120)


@router.post("/public/loyalty-join/{slug}")
async def public_loyalty_join(slug: str, body: LoyaltyJoinIn, request: Request):
    """Walk-in guest scans the Loyalty Club QR and joins with name/phone/email."""
    await public_rate_limit(request, key_suffix="loyalty-join", limit=6, window_sec=600)
    await durable_rate_limit(request, "loyalty-join", limit=6, window_sec=600)
    t = await _raw_db.tenants.find_one({"slug": slug}, {"_id": 0, "id": 1, "name": 1, "location": 1, "loyalty_stamps": 1})
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
    if is_new:
        # Fire-and-forget welcome SMS with the stamp-card link (skips gracefully if SMS not set up)
        try:
            import asyncio as _asyncio
            import os as _os
            from sms_service import send_tenant_sms
            base = (request.headers.get("origin") or _os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")).rstrip("/")
            club = f"{t.get('name')} {t.get('location')}".strip() if t.get("location") else t.get("name")
            sms_body = (f"Welcome to the {club} Loyalty Club, {(cust.get('name') or body.name).split(' ')[0]}! "
                        f"You earn a gold stamp every visit - complete {cfg['stamps_needed']} and a surprise gift is yours. "
                        f"Your card: {base}/loyalty/{slug}")
            _asyncio.create_task(send_tenant_sms(t["id"], digits, sms_body, kind="loyalty_welcome"))
        except Exception:
            pass
    return {"ok": True, "is_new": is_new, "salon_name": t.get("name"), "location": t.get("location") or "",
            "first_name": (cust.get("name") or body.name).split(" ")[0],
            "stamps": card["stamps"], "needed": card["needed"], "reward_label": cfg["reward_label"]}


def _shaped_logo(logo_bytes: bytes, size: int, shape: str):
    """Contain-fit tenant logo: white circle disc, rounded square, or blended (no disc)."""
    import io as _io
    from PIL import Image, ImageDraw
    try:
        logo = Image.open(_io.BytesIO(logo_bytes)).convert("RGBA")
    except Exception:
        return None
    GOLD = (206, 165, 94, 255)
    if shape == "blend":
        s = size + 24
        logo.thumbnail((s, s), Image.LANCZOS)
        return logo
    inner = int(size * 0.66) if shape != "square" else size - 26
    logo.thumbnail((inner, inner), Image.LANCZOS)
    base = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    if shape == "square":
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=size // 6, fill=(255, 255, 255, 255))
        d.rounded_rectangle([2, 2, size - 3, size - 3], radius=size // 6, outline=GOLD, width=4)
    else:
        d.ellipse([0, 0, size - 1, size - 1], fill=(255, 255, 255, 255))
        d.ellipse([2, 2, size - 3, size - 3], outline=GOLD, width=4)
    base.alpha_composite(logo, ((size - logo.width) // 2, (size - logo.height) // 2))
    return base


LOYALTY_BGS = {"deco": "loyalty_qr_bg.jpg", "dining": "table_qr_bg.jpg",
               "emerald": "loyalty_bg_emerald.jpg", "burgundy": "loyalty_bg_burgundy.jpg",
               "midnight": "loyalty_bg_midnight.jpg", "lightgold": "loyalty_bg_lightgold.jpg"}


@dataclass
class _Poster:
    """Mutable drawing context shared by the poster steps (720×1080 canvas, palette, cursor y)."""
    t: dict
    base: str
    cfg: dict
    design: str
    logo_shape: str
    logo_bytes: bytes | None
    assets_dir: str
    bg: object = None
    d: object = None
    gift: object = None
    y: int = 44
    W: int = 720
    H: int = 1080

    @property
    def resto(self) -> bool:
        return self.t.get("business_type") == "restaurant"

    @property
    def light(self) -> bool:
        return self.design == "lightgold"

    @property
    def gold(self):
        return (146, 106, 38) if self.light else (206, 165, 94)

    @property
    def soft(self):
        return (96, 84, 62) if self.light else (232, 224, 210)

    @property
    def ink(self):
        return (70, 58, 38) if self.light else (255, 255, 255)

    @property
    def foot(self):
        return (120, 106, 80) if self.light else (160, 148, 128)

    def font(self, name: str, size: int):
        from PIL import ImageFont
        try:
            return ImageFont.truetype(os.path.join(self.assets_dir, "fonts", name), size)
        except Exception:
            return ImageFont.load_default()

    def center(self, text: str, y: float, f, fill) -> None:
        self.d.text(((self.W - self.d.textlength(text, font=f)) / 2, y), text, font=f, fill=fill)


def _poster_canvas(p: _Poster) -> None:
    """Cover-fit the design background (or a dark fallback) and load the gift-box sprite."""
    from PIL import Image, ImageDraw
    bg_file = LOYALTY_BGS.get(p.design) or LOYALTY_BGS["dining" if p.resto else "deco"]
    bg_path = os.path.join(p.assets_dir, "posters", bg_file)
    if os.path.exists(bg_path):
        bg = Image.open(bg_path).convert("RGB")
        scale = max(p.W / bg.width, p.H / bg.height)
        bg = bg.resize((round(bg.width * scale), round(bg.height * scale)))
        lx, ty = (bg.width - p.W) // 2, (bg.height - p.H) // 2
        bg = bg.crop((lx, ty, lx + p.W, ty + p.H))
    else:
        bg = Image.new("RGB", (p.W, p.H), (18, 16, 13))
    p.bg, p.d = bg, ImageDraw.Draw(bg)
    gift_path = os.path.join(p.assets_dir, "posters", "gift_box_gold.png")
    p.gift = Image.open(gift_path).convert("RGBA") if os.path.exists(gift_path) else None


def _poster_header(p: _Poster) -> None:
    """Logo, auto-shrunk salon name, location line and the diamond-flanked LOYALTY CLUB label."""
    if p.logo_bytes:
        shape = p.logo_shape if p.logo_shape in ("circle", "square", "blend") else (p.cfg.get("logo_shape") or "circle")
        lg = _shaped_logo(p.logo_bytes, 150, shape)
        if lg is not None:
            p.bg.paste(lg, ((p.W - lg.width) // 2, p.y), lg)
            p.y += lg.height + 12
    name = p.t.get("name") or ("Our Restaurant" if p.resto else "Our Salon")
    size = 46
    f = p.font("PlayfairDisplay-Bold.ttf", size)
    while p.d.textlength(name, font=f) > p.W - 130 and size > 24:
        size -= 3
        f = p.font("PlayfairDisplay-Bold.ttf", size)
    p.center(name, p.y, f, p.gold)
    p.y += size + 8
    loc = (p.t.get("location") or "").strip()
    if loc:
        p.center(loc[:48].upper(), p.y, p.font("FreeSansBold.ttf", 19), p.soft)
        p.y += 30
    else:
        p.y += 6
    lbl_f = p.font("FreeSansBold.ttf", 28)
    lbl = "L O Y A L T Y   C L U B"
    lw = p.d.textlength(lbl, font=lbl_f)
    p.center(lbl, p.y, lbl_f, p.soft)
    for dx in (-lw / 2 - 32, lw / 2 + 32):
        cx, cy = p.W / 2 + dx, p.y + 16
        p.d.polygon([(cx, cy - 8), (cx + 6, cy), (cx, cy + 8), (cx - 6, cy)], fill=p.gold)
    p.y += 48


def _poster_stamp_journey(p: _Poster, n: int) -> None:
    """Row of gold stamp dots ending in a mini gift box."""
    dot, gap = (34, 10) if n <= 10 else (30, 8)
    total = n * (dot + gap) - gap
    sx = (p.W - total) / 2
    cyy = p.y + dot / 2
    for i in range(n):
        x0 = sx + i * (dot + gap)
        if i == n - 1 and p.gift is not None:
            gsm = p.gift.resize((dot + 10, dot + 10))
            p.bg.paste(gsm, (int(x0 - 5), int(cyy - (dot + 10) / 2)), gsm)
        else:
            p.d.ellipse([x0, cyy - dot / 2, x0 + dot, cyy + dot / 2], outline=p.gold, width=3)
            mx, my = x0 + dot / 2, cyy
            p.d.polygon([(mx, my - 7), (mx + 5, my), (mx, my + 7), (mx - 5, my)], fill=(120, 96, 58))
    p.y += dot + 26


def _poster_qr(p: _Poster) -> None:
    """Rounded white QR card (gold outline on the light design)."""
    import qrcode
    from PIL import Image, ImageDraw
    qr = qrcode.make(f"{p.base}/loyalty/{p.t.get('slug') or ''}", box_size=10, border=1).convert("RGB")
    qs, pad = 330, 18
    qr = qr.resize((qs, qs))
    box = Image.new("RGB", (qs + pad * 2, qs + pad * 2), (255, 255, 255))
    box.paste(qr, (pad, pad))
    m = Image.new("L", box.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, box.width - 1, box.height - 1], radius=26, fill=255)
    p.bg.paste(box, ((p.W - box.width) // 2, p.y), m)
    if p.light:
        bx, by = (p.W - box.width) // 2, p.y
        p.d.rounded_rectangle([bx, by, bx + box.width - 1, by + box.height - 1], radius=26, outline=p.gold, width=3)
    p.y += box.height + 16


def _poster_gift_block(p: _Poster, n: int) -> None:
    """Glowing gift box + 'A SURPRISE GIFT awaits at your Nth visit' copy, then the footer URL."""
    if p.gift is not None:
        gb = p.gift.resize((190, 190))
        p.bg.paste(gb, (86, p.y - 8), gb)
    tx = 292
    p.d.text((tx, p.y + 28), "A SURPRISE GIFT", font=p.font("FreeSansBold.ttf", 32), fill=p.gold)
    p.d.text((tx, p.y + 70), f"awaits at your {_ordinal(n)} visit", font=p.font("FreeSansBold.ttf", 22), fill=p.soft)
    p.d.text((tx, p.y + 104), "Scan · Join in 10 seconds", font=p.font("FreeSansBold.ttf", 20), fill=p.ink)
    p.d.text((tx, p.y + 132), "Earn a gold stamp every visit", font=p.font("FreeSansBold.ttf", 20), fill=p.ink)
    p.center(f"{p.base.replace('https://', '')}/loyalty/{p.t.get('slug') or ''}", p.H - 56, p.font("FreeSansBold.ttf", 17), p.foot)


def _render_poster(p: _Poster) -> bytes:
    n = int(p.cfg["stamps_needed"])
    _poster_canvas(p)
    _poster_header(p)
    _poster_stamp_journey(p, n)
    _poster_qr(p)
    _poster_gift_block(p, n)
    out = io.BytesIO()
    p.bg.save(out, format="JPEG", quality=85)
    return out.getvalue()


async def _loyalty_poster_jpeg(t: dict, origin: str, design: str, logo_shape: str) -> bytes:
    """Polished Loyalty Club QR poster — guests scan to join and start collecting stamps."""
    import asyncio
    from routes.services_catalog import _tenant_logo_bytes
    base = (origin or os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")).rstrip("/")
    logo_bytes = await _tenant_logo_bytes(t, base)
    assets_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets")
    p = _Poster(t=t, base=base, cfg=_cfg(t), design=design, logo_shape=logo_shape, logo_bytes=logo_bytes, assets_dir=assets_dir)
    return await asyncio.to_thread(_render_poster, p)


@router.get("/settings/loyalty-qr-poster.png")
async def loyalty_qr_poster(origin: str = "", design: str = "", logo_shape: str = "",
                            user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    from fastapi import Response
    img = await _loyalty_poster_jpeg(t, origin, design, logo_shape)
    return Response(content=img, media_type="image/jpeg",
                    headers={"Content-Disposition": 'attachment; filename="loyalty-club-qr.jpg"'})


@router.get("/settings/loyalty-qr-poster.pdf")
async def loyalty_qr_poster_pdf(origin: str = "", design: str = "", logo_shape: str = "",
                                user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Same poster as a print-ready PDF page."""
    import io
    import asyncio
    from fastapi import Response
    from PIL import Image
    img = await _loyalty_poster_jpeg(t, origin, design, logo_shape)

    def _to_pdf() -> bytes:
        im = Image.open(io.BytesIO(img)).convert("RGB")
        out = io.BytesIO()
        im.save(out, "PDF", resolution=120)
        return out.getvalue()

    pdf = await asyncio.to_thread(_to_pdf)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="loyalty-club-qr.pdf"'})


async def run_loyalty_nudges(t: dict, base: str) -> dict:
    """SMS every member who is 1-2 stamps from their surprise gift (max once per 14 days each)."""
    import asyncio as _asyncio
    from sms_service import send_tenant_sms
    cfg = _cfg(t)
    if not cfg["enabled"]:
        return {"ok": False, "sent": 0, "skipped": 0}
    needed = int(cfg["stamps_needed"])
    cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    cands = await _raw_db.customers.find(
        {"tenant_id": t["id"], "stamps": {"$gt": 0}, "phone": {"$regex": r"\d{10}$"}},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "stamps": 1, "stamp_rewards_redeemed": 1,
         "loyalty_nudged_at": 1}).to_list(2000)
    club = f"{t.get('name')} {t.get('location')}".strip() if t.get("location") else t.get("name")
    sent = skipped = 0
    for c in cands:
        card = _card(c, cfg)
        away = needed - card["stamps"]
        if card["rewards_available"] > 0 or away > 2 or card["stamps"] == 0:
            continue
        if (c.get("loyalty_nudged_at") or "") > cutoff:
            skipped += 1
            continue
        if sent >= 50:
            break
        first = (c.get("name") or "there").split(" ")[0]
        digits = re.sub(r"[^0-9]", "", c["phone"])[-10:]
        body_txt = (f"Hi {first}! You're just {away} visit{'s' if away > 1 else ''} away from your "
                    f"surprise gift at {club}. Book your next visit: {base}/book/{t.get('slug') or ''}")
        res = await send_tenant_sms(t["id"], digits, body_txt, kind="loyalty_nudge")
        if res.get("sent"):
            sent += 1
            await _raw_db.customers.update_one(
                {"tenant_id": t["id"], "id": c["id"]},
                {"$set": {"loyalty_nudged_at": datetime.now(timezone.utc).isoformat()}})
        else:
            skipped += 1
            if "points" in str(res.get("error") or "").lower():
                break
        await _asyncio.sleep(0.15)
    return {"ok": True, "sent": sent, "skipped": skipped}


@router.post("/loyalty/stamps/send-nudges")
async def send_gift_nudges(request: Request, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Manual trigger for gift nudges (also auto-runs every Monday 9 AM IST)."""
    import os as _os
    if not _cfg(t)["enabled"]:
        raise HTTPException(400, "Enable the loyalty card first")
    base = (request.headers.get("origin") or _os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")).rstrip("/")
    return await run_loyalty_nudges(t, base)
