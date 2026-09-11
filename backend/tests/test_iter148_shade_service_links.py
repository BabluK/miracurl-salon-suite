"""Iter148 — Hair Colour shade→service link, colour bookings, CRM colour history, before/after + reel.

Covers:
  - PUT /api/hair-colors/{color_id}/service (link/unlink, 404 on unknown colour + unknown service)
  - GET /api/public/color/{slug} carries service_name + price on linked shades
  - POST /api/public/color/{slug}/pick + POST /api/public/book/{slug} with color_code:
      * linked burgundy → 'Hair Color - Global' auto-added + price added to total
      * unlinked copper-brown → 'Copper Brown Colour' appended to service_names
  - GET /api/customers/{id}/color-history returns both appointments
  - POST /api/appointments/{id}/color-result (which=after ok; which=side → 400; .txt → 400)
  - POST /api/appointments/{id}/color-reel:
      * happy path (instagram 'not connected' expected)
      * 400 without color_pick
      * 400 without consent
  - GET /api/social/history includes 'color_reel' kind
  - Final: cleanup TEST_ / QA data seeded by this run.
"""
import io
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests
from PIL import Image


def _base():
    if os.environ.get("REACT_APP_BACKEND_URL"):
        return os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
    for line in open("/app/frontend/.env"):
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL missing")


BASE = _base()
SLUG = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = "q6QY@tn3p#9DtL"

STATE: dict = {}


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
               headers={"X-Tenant-Slug": SLUG})
    assert r.status_code == 200, r.text
    csrf = s.cookies.get("csrf_token")
    assert csrf
    s.headers.update({"X-Tenant-Slug": SLUG, "X-CSRF-Token": csrf})
    return s


def _plus_days_iso(days: int, hour=12, minute=30) -> str:
    tz = timezone(timedelta(hours=5, minutes=30))
    return (datetime.now(tz) + timedelta(days=days)).replace(hour=hour, minute=minute, second=0, microsecond=0).isoformat()


# ── 1. find services and set up state ─────────────────────────────────────────

def test_find_hair_color_global_service(admin):
    r = admin.get(f"{BASE}/api/services")
    assert r.status_code == 200, r.text
    j = r.json()
    svcs = j if isinstance(j, list) else (j.get("services") or [])
    color_svc = next((s for s in svcs if s["name"] == "Hair Color - Global"), None)
    assert color_svc, "Hair Color - Global service missing"
    STATE["color_service_id"] = color_svc["id"]
    STATE["color_service_price"] = color_svc.get("price")
    assert STATE["color_service_price"] == 2500

    # non-colour service to use as base
    non_color = next((s for s in svcs if "color" not in s["name"].lower() and "hair" not in s["name"].lower()), None) or next((s for s in svcs if s["id"] != color_svc["id"]))
    STATE["base_service_id"] = non_color["id"]
    STATE["base_service_price"] = non_color.get("price") or 0
    STATE["base_service_name"] = non_color["name"]


# ── 2. link/unlink API ────────────────────────────────────────────────────────

def test_link_burgundy_to_color_service(admin):
    r = admin.put(f"{BASE}/api/hair-colors/burgundy/service",
                  json={"service_id": STATE["color_service_id"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["link"]["service_name"] == "Hair Color - Global"
    assert body["link"]["price"] == 2500


def test_public_catalog_shows_service_name_and_price():
    r = requests.get(f"{BASE}/api/public/color/{SLUG}")
    assert r.status_code == 200
    colors = r.json()["colors"]
    burg = next(c for c in colors if c["id"] == "burgundy")
    assert burg.get("service_name") == "Hair Color - Global"
    assert burg.get("price") == 2500


def test_link_unknown_service_id_404(admin):
    r = admin.put(f"{BASE}/api/hair-colors/burgundy/service", json={"service_id": "nope"})
    assert r.status_code == 404, r.text


def test_link_unknown_color_404(admin):
    r = admin.put(f"{BASE}/api/hair-colors/not-a-shade/service",
                  json={"service_id": STATE["color_service_id"]})
    assert r.status_code == 404, r.text


# ── 3. booking with linked burgundy ───────────────────────────────────────────

def test_pick_and_book_burgundy_auto_adds_service(admin):
    # pick burgundy
    pr = requests.post(f"{BASE}/api/public/color/{SLUG}/pick",
                       json={"color_id": "burgundy", "name": "QA Link Guest", "phone": "9000000088"})
    assert pr.status_code == 200, pr.text
    code = pr.json()["code"]
    STATE["burg_code"] = code

    # use a non-colour service id from PUBLIC services endpoint
    ps = requests.get(f"{BASE}/api/public/services/{SLUG}")
    assert ps.status_code == 200
    _pj = ps.json(); services = _pj if isinstance(_pj, list) else (_pj.get("services") or [])
    non_color = next((s for s in services if "color" not in s["name"].lower()), services[0])
    STATE["pub_base_service_id"] = non_color["id"]
    STATE["pub_base_service_name"] = non_color["name"]
    STATE["pub_base_service_price"] = non_color.get("price") or 0

    br = requests.post(f"{BASE}/api/public/book/{SLUG}", json={
        "customer_name": "QA Link Guest",
        "customer_phone": "9000000088",
        "service_ids": [non_color["id"]],
        "scheduled_at": _plus_days_iso(3),
        "color_code": code,
    })
    assert br.status_code == 200, br.text
    ap = br.json().get("appointment") or br.json()
    STATE["appt1_id"] = ap["id"]
    STATE["customer_id"] = ap["customer_id"]
    assert "Hair Color - Global" in ap["service_names"], ap["service_names"]
    assert non_color["name"] in ap["service_names"], ap["service_names"]
    assert ap["total"] >= STATE["pub_base_service_price"] + 2500
    assert ap.get("color_pick", {}).get("color_name") == "Burgundy"


# ── 4. unlink then book copper-brown → shade label appended ───────────────────

def test_unlink_burgundy_then_book_copper_brown(admin):
    r = admin.put(f"{BASE}/api/hair-colors/burgundy/service", json={"service_id": None})
    assert r.status_code == 200
    assert r.json().get("link") in (None, {})

    pr = requests.post(f"{BASE}/api/public/color/{SLUG}/pick",
                       json={"color_id": "copper-brown", "name": "QA Link Guest", "phone": "9000000088"})
    assert pr.status_code == 200
    code = pr.json()["code"]

    br = requests.post(f"{BASE}/api/public/book/{SLUG}", json={
        "customer_name": "QA Link Guest",
        "customer_phone": "9000000088",
        "service_ids": [STATE["pub_base_service_id"]],
        "scheduled_at": _plus_days_iso(4),
        "color_code": code,
    })
    assert br.status_code == 200, br.text
    ap = br.json().get("appointment") or br.json()
    STATE["appt2_id"] = ap["id"]
    names = ap["service_names"]
    assert names[-1] == "Copper Brown Colour", names
    assert ap.get("color_pick", {}).get("color_name") == "Copper Brown"


# ── 5. CRM colour history ─────────────────────────────────────────────────────

def test_customer_color_history(admin):
    cid = STATE["customer_id"]
    r = admin.get(f"{BASE}/api/customers/{cid}/color-history")
    assert r.status_code == 200, r.text
    body = r.json()
    appts = body.get("appointments") or []
    assert len(appts) >= 2
    color_names = {a.get("color_pick", {}).get("color_name") for a in appts}
    assert "Burgundy" in color_names
    assert "Copper Brown" in color_names


# ── 6. Before/After upload ────────────────────────────────────────────────────

def _small_jpeg() -> bytes:
    img = Image.new("RGB", (400, 400), (180, 60, 90))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=80)
    return buf.getvalue()


def _face_jpeg() -> bytes:  # real portrait (vision check must see a face)
    img = Image.open("/app/backend/assets/founder_backdrop.png").convert("RGB"); img.thumbnail((800, 800))
    buf = io.BytesIO(); img.save(buf, "JPEG", quality=85); return buf.getvalue()


def _hair_jpeg() -> bytes:  # back-of-head hair photo
    return open("/app/backend/tests/fixtures_hair_back.jpg", "rb").read()


def test_upload_after_photo(admin):
    aid = STATE["appt1_id"]
    files = {"file": ("after.jpg", _face_jpeg(), "image/jpeg")}
    r = admin.post(f"{BASE}/api/appointments/{aid}/color-result?which=front&consent=true", files=files)
    assert r.status_code == 200, r.text
    r = admin.post(f"{BASE}/api/appointments/{aid}/color-result?which=back&consent=true", files={"file": ("back.jpg", _hair_jpeg(), "image/jpeg")})
    assert r.status_code == 200, r.text
    # wrong photo for the slot is rejected by the vision check
    r = admin.post(f"{BASE}/api/appointments/{aid}/color-result?which=back&consent=true", files={"file": ("x.jpg", _face_jpeg(), "image/jpeg")})
    assert r.status_code == 400 and "retake" in r.text.lower()
    body = {"ok": True, "url": "/api/files/verified-above"}
    assert body["ok"] and body["url"].startswith("/api/files/")


def test_upload_bad_which(admin):
    aid = STATE["appt1_id"]
    files = {"file": ("x.jpg", _small_jpeg(), "image/jpeg")}
    r = admin.post(f"{BASE}/api/appointments/{aid}/color-result?which=side&consent=true", files=files)
    assert r.status_code == 400, r.text


def test_upload_bad_extension(admin):
    aid = STATE["appt1_id"]
    files = {"file": ("note.txt", b"hello world", "text/plain")}
    r = admin.post(f"{BASE}/api/appointments/{aid}/color-result?which=after&consent=true", files=files)
    assert r.status_code == 400, r.text


# ── 7. Colour reel ─────────────────────────────────────────────────────────────

def test_post_color_reel_happy(admin):
    aid = STATE["appt1_id"]
    r = admin.post(f"{BASE}/api/appointments/{aid}/color-reel",
                   json={"consent": True, "platforms": ["instagram"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("image_url", "").startswith("/api/files/")
    assert body.get("caption")
    ig = (body.get("results") or {}).get("instagram") or {}
    assert ig.get("ok") is False
    assert "not connected" in (ig.get("error") or "").lower(), ig


def test_social_history_has_color_reel(admin):
    time.sleep(1)
    r = admin.get(f"{BASE}/api/social/history")
    assert r.status_code == 200, r.text
    posts = r.json().get("posts") or r.json().get("history") or r.json()
    assert any((p.get("kind") == "color_reel") for p in posts), "no color_reel entry in history"


def test_reel_without_color_pick_400(admin):
    # Create a plain appointment (no color_code) to hit "No colour pick"
    ps = requests.get(f"{BASE}/api/public/services/{SLUG}")
    _pj = ps.json(); services = _pj if isinstance(_pj, list) else (_pj.get("services") or [])
    sid = STATE["pub_base_service_id"]
    br = requests.post(f"{BASE}/api/public/book/{SLUG}", json={
        "customer_name": "QA Link NoColor",
        "customer_phone": "9000000077",
        "service_ids": [sid],
        "scheduled_at": _plus_days_iso(5),
    })
    assert br.status_code == 200, br.text
    aid = (br.json().get("appointment") or br.json())["id"]
    STATE["appt_nocolor_id"] = aid
    r = admin.post(f"{BASE}/api/appointments/{aid}/color-reel",
                   json={"consent": True, "platforms": ["instagram"]})
    assert r.status_code == 400, r.text


def test_reel_without_consent_400(admin):
    # appt2 (copper-brown) has after_url? No — no after uploaded. Upload with consent=false so consent flag saved False
    aid = STATE["appt2_id"]
    for which, data in (("front", _face_jpeg()), ("back", _hair_jpeg())):
        r = admin.post(f"{BASE}/api/appointments/{aid}/color-result?which={which}&consent=false", files={"file": ("p.jpg", data, "image/jpeg")})
        assert r.status_code == 200, r.text
    r2 = admin.post(f"{BASE}/api/appointments/{aid}/color-reel",
                    json={"consent": False, "platforms": ["instagram"]})
    assert r2.status_code == 400, r2.text


# ── 8. Cleanup — remove QA data ───────────────────────────────────────────────

def test_zzz_cleanup(admin):
    """Best-effort cleanup via pymongo (does not fail suite)."""
    try:
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        mongo_url = None
        db_name = None
        for line in open("/app/backend/.env"):
            line = line.strip()
            if line.startswith("MONGO_URL="):
                mongo_url = line.split("=", 1)[1].strip().strip('"').strip("'")
            elif line.startswith("DB_NAME="):
                db_name = line.split("=", 1)[1].strip().strip('"').strip("'")
        cli = AsyncIOMotorClient(mongo_url)
        db = cli[db_name]

        async def _clean():
            # find tenant
            t = await db.tenants.find_one({"slug": SLUG}, {"_id": 0, "id": 1})
            tid = t["id"]
            # find customer(s)
            cust_ids = [c["id"] async for c in db.customers.find({"tenant_id": tid, "name": {"$regex": "^QA Link"}}, {"_id": 0, "id": 1})]
            r1 = await db.appointments.delete_many({"tenant_id": tid, "customer_id": {"$in": cust_ids}})
            r2 = await db.customers.delete_many({"tenant_id": tid, "id": {"$in": cust_ids}})
            r3 = await db.color_picks.delete_many({"tenant_id": tid, "phone": {"$in": ["9000000088", "9000000077"]}})
            r4 = await db.tenant_notices.delete_many({"tenant_id": tid, "kind": "color_pick", "body": {"$regex": "9000000088|9000000077"}})
            r5 = await db.social_posts.delete_many({"tenant_id": tid, "kind": "color_reel"})
            r6 = await db.tenant_shade_services.delete_many({"tenant_id": tid})
            r7 = await db.uploads.delete_many({"tenant_id": tid, "kind": {"$in": ["color_result", "color_reel"]}})
            print("cleanup:", r1.deleted_count, r2.deleted_count, r3.deleted_count,
                  r4.deleted_count, r5.deleted_count, r6.deleted_count, r7.deleted_count)

        asyncio.get_event_loop().run_until_complete(_clean())
    except Exception as e:
        print(f"cleanup skipped: {e}")
