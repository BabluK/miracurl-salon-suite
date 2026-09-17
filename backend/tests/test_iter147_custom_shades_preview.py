"""Iter147 — Hair Colour Try-On extensions.

Custom salon shades (create/list/tenant-isolation/pick/delete), AI preview endpoint validation,
and updated poster (blurred backdrop, ≥ 300 KB).
"""
import base64
import io
import os
import time
import pytest
import requests
from PIL import Image
import sys as _sys; _sys.path.insert(0, __import__("os").path.dirname(__file__))
from _creds import password_for  # noqa: E402


def _load_backend_url():
    if os.environ.get("REACT_APP_BACKEND_URL"):
        return os.environ["REACT_APP_BACKEND_URL"]
    for line in open("/app/frontend/.env"):
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE = _load_backend_url().rstrip("/")
SLUG = "miracurl-marathahalli"
OTHER_SLUG = "elegance-koramangala"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD")


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
               headers={"X-Tenant-Slug": SLUG})
    assert r.status_code == 200, r.text
    csrf = s.cookies.get("csrf_token")
    assert csrf, "csrf_token cookie missing"
    s.headers.update({"X-Tenant-Slug": SLUG, "X-CSRF-Token": csrf})
    return s


@pytest.fixture(scope="module")
def custom_shade_id(admin_session):
    """Create the QA Rose Gold custom shade — used across tests and cleaned up at the end."""
    body = {"name": "QA Rose Gold", "tag": "Test",
            "swatch": ["#b76e86", "#e39ab2"], "suits": ["cool"], "depth": ["light"]}
    r = admin_session.post(f"{BASE}/api/hair-colors/custom", json=body)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    color = data["color"]
    assert color["id"].startswith("custom-")
    # swatch normalised to length 3 (last colour repeated)
    assert len(color["swatch"]) == 3
    assert color["swatch"][-1] == color["swatch"][-2] == "#e39ab2"
    assert color.get("tenant_id")
    cid = color["id"]
    yield cid
    # cleanup: hard delete if still present
    admin_session.delete(f"{BASE}/api/hair-colors/custom/{cid}")


# ── Validation ────────────────────────────────────────────────────────────────

def test_custom_shade_invalid_swatch(admin_session):
    r = admin_session.post(f"{BASE}/api/hair-colors/custom",
                           json={"name": "QA Bad", "tag": "", "swatch": ["nothex"],
                                 "suits": ["warm"], "depth": ["light"]})
    assert r.status_code == 400
    assert "swatch" in r.json().get("detail", "").lower()


def test_custom_shade_short_name_422(admin_session):
    r = admin_session.post(f"{BASE}/api/hair-colors/custom",
                           json={"name": "X", "tag": "", "swatch": ["#b76e86"],
                                 "suits": ["cool"], "depth": ["light"]})
    assert r.status_code == 422


# ── Listing + tenant isolation ────────────────────────────────────────────────

def test_admin_hair_colors_custom_first(admin_session, custom_shade_id):
    r = admin_session.get(f"{BASE}/api/hair-colors")
    assert r.status_code == 200
    colors = r.json()["colors"]
    assert colors, "empty catalog"
    first = colors[0]
    assert first["id"] == custom_shade_id
    assert first.get("custom") is True
    assert first["name"] == "QA Rose Gold"


def test_public_catalog_includes_custom_first(custom_shade_id):
    r = requests.get(f"{BASE}/api/public/color/{SLUG}")
    assert r.status_code == 200
    colors = r.json()["colors"]
    assert colors[0]["id"] == custom_shade_id
    assert colors[0].get("custom") is True


def test_public_catalog_other_tenant_isolated(custom_shade_id):
    r = requests.get(f"{BASE}/api/public/color/{OTHER_SLUG}")
    if r.status_code == 404:
        pytest.skip(f"Slug {OTHER_SLUG} does not exist in this environment")
    assert r.status_code == 200
    ids = {c["id"] for c in r.json()["colors"]}
    assert custom_shade_id not in ids, "Custom shade leaked to other tenant"


# ── Public pick can resolve custom id ────────────────────────────────────────

def test_public_pick_accepts_custom_id(custom_shade_id):
    r = requests.post(f"{BASE}/api/public/color/{SLUG}/pick",
                      json={"color_id": custom_shade_id, "name": "QA Custom"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["color"]["name"] == "QA Rose Gold"
    assert body["color"]["id"] == custom_shade_id


# ── Optional: paint finished within 90 s (soft) ───────────────────────────────

def test_custom_shade_image_painted_within_90s(admin_session, custom_shade_id):
    deadline = time.time() + 90
    image_url = None
    while time.time() < deadline:
        r = admin_session.get(f"{BASE}/api/hair-colors")
        assert r.status_code == 200
        match = [c for c in r.json()["colors"] if c["id"] == custom_shade_id]
        if match and match[0].get("image_url"):
            image_url = match[0]["image_url"]
            break
        time.sleep(5)
    if not image_url:
        pytest.skip("image_url still null after 90 s (paint runs async; reporting soft-fail only)")
    assert image_url


# ── Delete + idempotency ──────────────────────────────────────────────────────

def test_delete_custom_shade_then_404(admin_session):
    # Create a throw-away shade so we don't disturb custom_shade_id used elsewhere
    r = admin_session.post(f"{BASE}/api/hair-colors/custom",
                           json={"name": "QA Rose Gold Del", "tag": "Test",
                                 "swatch": ["#b76e86"], "suits": ["cool"], "depth": ["light"]})
    assert r.status_code == 200, r.text
    cid = r.json()["color"]["id"]
    # delete once → 200
    r1 = admin_session.delete(f"{BASE}/api/hair-colors/custom/{cid}")
    assert r1.status_code == 200
    # confirm not in list
    r2 = admin_session.get(f"{BASE}/api/hair-colors")
    assert cid not in {c["id"] for c in r2.json()["colors"]}
    # delete again → 404
    r3 = admin_session.delete(f"{BASE}/api/hair-colors/custom/{cid}")
    assert r3.status_code == 404


# ── Preview endpoint validation ──────────────────────────────────────────────

def test_preview_small_selfie_400():
    r = requests.post(f"{BASE}/api/public/color/{SLUG}/preview",
                      json={"color_id": "copper-brown", "selfie_b64": "abc"})
    assert r.status_code == 400
    assert "Selfie too small" in r.json().get("detail", "")


def test_preview_unknown_color_404():
    # 3000 bytes of base64 so the length check passes and we hit the color check.
    payload = base64.b64encode(b"\x00" * 3000).decode()
    r = requests.post(f"{BASE}/api/public/color/{SLUG}/preview",
                      json={"color_id": "nope", "selfie_b64": payload})
    assert r.status_code == 404


def _fetch_catalog_image_dataurl() -> str:
    """Grab the natural-black photo from the public catalog, downscale ≤900 px, JPEG data URL."""
    r = requests.get(f"{BASE}/api/public/color/{SLUG}")
    r.raise_for_status()
    nb = next((c for c in r.json()["colors"] if c["id"] == "natural-black"), None)
    assert nb and nb.get("image_url"), "natural-black image not painted"
    img_url = nb["image_url"] if nb["image_url"].startswith("http") else f"{BASE}{nb['image_url']}"
    ir = requests.get(img_url, timeout=30)
    ir.raise_for_status()
    im = Image.open(io.BytesIO(ir.content)).convert("RGB")
    w, h = im.size
    scale = min(1.0, 900.0 / max(w, h))
    if scale < 1.0:
        im = im.resize((int(w * scale), int(h * scale)))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def test_preview_ok_single_call():
    """One successful preview (costs image credits — only run once)."""
    dataurl = _fetch_catalog_image_dataurl()
    r = requests.post(f"{BASE}/api/public/color/{SLUG}/preview",
                      json={"color_id": "copper-brown", "selfie_b64": dataurl},
                      timeout=180)
    if r.status_code in (429, 502, 503):
        pytest.skip(f"Gemini transient/quota: {r.status_code} {r.text[:200]}")
    assert r.status_code == 200, r.text[:400]
    body = r.json()
    assert body["color"]["id"] == "copper-brown"
    assert isinstance(body.get("front"), str) and len(body["front"]) > 5000
    assert "back" in body  # may be None but key must exist


# ── Poster (photo backdrop, >300 KB) ─────────────────────────────────────────

def test_poster_photo_backdrop_size(admin_session):
    r = admin_session.get(f"{BASE}/api/color/poster")
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("image/png")
    assert len(r.content) > 300 * 1024, f"poster only {len(r.content)} bytes (expected >300 KB photo backdrop)"
    import struct
    w, h = struct.unpack(">II", r.content[16:24])
    assert (w, h) == (1080, 1620)


# ── Cleanup residual QA rows (safety net) ─────────────────────────────────────

def test_cleanup_seed_data(admin_session, custom_shade_id):
    """Delete QA seed data from Mongo directly so no test residue remains."""
    from pymongo import MongoClient
    mongo_url = None
    for line in open("/app/backend/.env"):
        if line.startswith("MONGO_URL="):
            mongo_url = line.split("=", 1)[1].strip().strip('"').strip("'")
        if line.startswith("DB_NAME="):
            db_name = line.split("=", 1)[1].strip().strip('"').strip("'")
    assert mongo_url and db_name
    cli = MongoClient(mongo_url)
    db = cli[db_name]
    # hard-delete tenant_hair_colors named QA*
    hc = db.tenant_hair_colors.delete_many({"name": {"$in": ["QA Rose Gold", "QA Rose Gold Del", "QA UI Shade"]}})
    picks = db.color_picks.delete_many({"name": {"$in": ["QA Custom", "QA Flow"]}})
    nots = db.tenant_notices.delete_many({"kind": "color_pick",
                                          "title": {"$regex": "QA (Custom|Flow) picked"}})
    print(f"cleanup: hair_colors={hc.deleted_count} picks={picks.deleted_count} notices={nots.deleted_count}")
