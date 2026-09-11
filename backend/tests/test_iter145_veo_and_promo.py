"""Iter145 backend regression:
- IS_PREVIEW_ENV True + preview scheduler-disable log
- HQ brand-contacts GET/PUT (super admin, CSRF)
- veo-ad/photo upload validation
- veo-ad duration/photo_id/mode validation
- promo-video tenant_slug 404 + presenter→feature_tour mapping + delete + list tenant_name
"""
import io
import os
import sys
import time

import pytest
import requests

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Load /app/backend/.env manually
_ENV = os.path.join(BACKEND_DIR, ".env")
if os.path.exists(_ENV):
    for line in open(_ENV):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
API = BASE + "/api"

SUPER_EMAIL = "super@miracurl.com"
SUPER_PW = "og9T@41Es#OQb6"
TENANT_SLUG = "miracurl-marathahalli"


@pytest.fixture(scope="module")
def super_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PW})
    assert r.status_code == 200, r.text
    s.headers.update({"X-CSRF-Token": s.cookies.get("csrf_token")})
    return s


# ── (1) preview flag ────────────────────────────────────────────────
def test_is_preview_env_true():
    from database import IS_PREVIEW_ENV
    assert IS_PREVIEW_ENV is True


def test_scheduler_disabled_log_present():
    with open("/var/log/supervisor/backend.err.log") as f:
        assert "PREVIEW environment: 29 outbound schedulers disabled" in f.read()


# ── (2) brand-contacts GET/PUT ──────────────────────────────────────
def test_brand_contacts_get_has_defaults(super_session):
    r = super_session.get(f"{API}/super/brand-contacts")
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("brand", "tagline", "email", "website", "motto"):
        assert k in d, f"missing {k}: {d}"
    assert "phone" in d and "instagram" in d


def test_brand_contacts_put_then_restore(super_session):
    # Snapshot original
    orig = super_session.get(f"{API}/super/brand-contacts").json()
    orig_phone = orig.get("phone", "")
    orig_ig = orig.get("instagram", "")

    r = super_session.put(f"{API}/super/brand-contacts",
                          json={"phone": "+91 90000 00000", "instagram": "miracurl.suite"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["phone"] == "+91 90000 00000"
    assert d["instagram"] == "@miracurl.suite", f"expected leading @, got {d['instagram']!r}"

    # Restore by PUT with empty strings — per test spec, expect fallback to defaults.
    r2 = super_session.put(f"{API}/super/brand-contacts",
                           json={"phone": "", "instagram": ""})
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    # Cleanup regardless of outcome: hard-delete stored keys via direct Mongo
    if d2.get("phone") != orig_phone or d2.get("instagram") != orig_ig:
        # BUG: PUT with empty strings didn't clear values. Report it after cleanup.
        from motor.motor_asyncio import AsyncIOMotorClient
        import asyncio
        async def _clear():
            db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
            await db.hq_settings.update_one({"key": "brand_contacts"},
                                            {"$unset": {"phone": "", "instagram": ""}})
        asyncio.run(_clear())
        pytest.fail(
            f"PUT with empty strings did not clear values. "
            f"Response phone={d2.get('phone')!r} instagram={d2.get('instagram')!r} "
            f"(expected phone={orig_phone!r} instagram={orig_ig!r}). "
            f"Root cause: routes/veo_studio.py brand_contacts_put filters empty strings via "
            f"`{{k: v.strip() for k, v in body.model_dump().items() if v and v.strip()}}` so no $set/$unset happens.")


# ── (3) veo-ad photo upload validation ──────────────────────────────
_PNG = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0"
        b"\x00\x00\x00\x03\x00\x01_ Nf\x00\x00\x00\x00IEND\xaeB`\x82")


@pytest.fixture(scope="module")
def uploaded_photo(super_session):
    files = {"file": ("x.png", io.BytesIO(_PNG), "image/png")}
    r = super_session.post(f"{API}/super/veo-ad/photo", files=files)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "photo_id" in d and "url" in d
    yield d["photo_id"]
    # cleanup upload
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        import asyncio
        async def _rm():
            db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
            await db.uploads.delete_one({"id": d["photo_id"]})
        asyncio.run(_rm())
    except Exception:
        pass


def test_veo_photo_upload_png_ok(uploaded_photo):
    assert uploaded_photo


def test_veo_photo_rejects_txt(super_session):
    files = {"file": ("x.txt", io.BytesIO(b"hello"), "text/plain")}
    r = super_session.post(f"{API}/super/veo-ad/photo", files=files)
    assert r.status_code == 400, r.text


# ── (4) veo-ad validation (no real generation) ──────────────────────
def test_veo_ad_bad_duration(super_session):
    r = super_session.post(f"{API}/super/veo-ad", json={"concept": "x", "duration": 45})
    assert r.status_code == 400, r.text
    assert "30" in r.text and "60" in r.text


def test_veo_ad_unknown_photo(super_session):
    r = super_session.post(f"{API}/super/veo-ad",
                           json={"concept": "x", "duration": 30, "photo_id": "nope"})
    assert r.status_code == 404, r.text


def test_veo_ad_avatar_mode_rejected(super_session):
    r = super_session.post(f"{API}/super/veo-ad", json={"concept": "x", "mode": "avatar"})
    assert r.status_code == 422, r.text


# ── (5) promo-video validation & mapping ────────────────────────────
def test_promo_video_unknown_tenant_404(super_session):
    r = super_session.post(f"{API}/super/promo-video", json={"tenant_slug": "does-not-exist"})
    assert r.status_code == 404, r.text
    assert "tenant" in r.text.lower()


def test_promo_video_presenter_maps_to_feature_tour(super_session):
    r = super_session.post(f"{API}/super/promo-video", json={"mode": "presenter"})
    assert r.status_code == 200, r.text
    jid = r.json()["job_id"]
    # Give it a beat so the doc is fully written
    time.sleep(0.3)
    r2 = super_session.get(f"{API}/super/promo-video/{jid}")
    assert r2.status_code == 200, r2.text
    doc = r2.json()
    assert doc["params"]["mode"] == "feature_tour", f"got {doc['params']['mode']}"
    # Immediately delete so we don't waste credits
    r3 = super_session.delete(f"{API}/super/promo-video/{jid}")
    assert r3.status_code in (200, 204, 404), r3.text  # 404 possible if job auto-cleaned


def test_promo_video_list_has_tenant_name(super_session):
    r = super_session.get(f"{API}/super/promo-videos")
    assert r.status_code == 200, r.text
    videos = r.json().get("videos", [])
    # Per spec: two most recent 'done' videos are tenant promos for Miracurl Unisex Family Salon
    tenant_promos = [v for v in videos if v.get("tenant_name")]
    assert tenant_promos, f"no tenant_name videos found in {len(videos)} done videos"
    # At least one should reference the marathahalli salon
    names = [v.get("tenant_name") for v in tenant_promos]
    assert any("Miracurl" in (n or "") for n in names), f"names={names}"
