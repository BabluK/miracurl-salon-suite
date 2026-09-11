"""Iter146 — Hair Colour Try-On + Veo narrated validation/resume.

Backend tests for:
  - GET /api/public/color/{slug} (public catalogue with 12 colours + images)
  - POST /api/public/color/{slug}/pick (guest pick → 6-char code + notice)
  - GET /api/color-picks (tenant admin list)
  - GET /api/hair-colors (tenant admin catalogue)
  - GET /api/color/poster (branded PNG)
  - GET /api/notifications/new-bookings notices includes color_pick
  - Veo narrated mode without voiceover → fails fast
  - POST /api/super/veo-ad/{unknown}/resume → 404
  - Veo avatar mode → 422
"""
import os
import re
import time
import pytest
import requests

def _load_frontend_url():
    if os.environ.get("REACT_APP_BACKEND_URL"):
        return os.environ["REACT_APP_BACKEND_URL"]
    try:
        for line in open("/app/frontend/.env"):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    except FileNotFoundError:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE = _load_frontend_url().rstrip("/")
SLUG = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = "q6QY@tn3p#9DtL"
SUPER_EMAIL = "super@miracurl.com"
SUPER_PASS = "og9T@41Es#OQb6"


# ── auth helpers ───────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
               headers={"X-Tenant-Slug": SLUG})
    assert r.status_code == 200, r.text
    csrf = s.cookies.get("csrf_token")
    assert csrf, "csrf_token cookie missing after login"
    s.headers.update({"X-Tenant-Slug": SLUG, "X-CSRF-Token": csrf})
    return s


@pytest.fixture(scope="module")
def super_session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": SUPER_EMAIL, "password": SUPER_PASS})
    assert r.status_code == 200, r.text
    csrf = s.cookies.get("csrf_token")
    assert csrf
    s.headers.update({"X-CSRF-Token": csrf})
    return s


# ── public catalogue ───────────────────────────────────────────────────────────

def test_public_color_catalog_ok():
    r = requests.get(f"{BASE}/api/public/color/{SLUG}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["slug"] == SLUG
    assert isinstance(body.get("name"), str) and body["name"]
    colors = body["colors"]
    assert len(colors) == 12
    ids = {c["id"] for c in colors}
    for cid in ("copper-sunset", "rose-brown", "mushroom-mocha-balayage"):
        assert cid in ids
    for c in colors:
        for k in ("id", "name", "tag", "swatch", "suits", "depth", "image_url"):
            assert k in c, f"missing {k} on {c.get('id')}"
        assert len(c["swatch"]) == 3
        assert c["image_url"], f"image_url missing for {c['id']}"


def test_public_color_catalog_unknown_slug():
    r = requests.get(f"{BASE}/api/public/color/no-such-salon")
    assert r.status_code == 404


# ── public pick ────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def qa_pick():
    """POST a QA Guest pick (used by later tests)."""
    r = requests.post(
        f"{BASE}/api/public/color/{SLUG}/pick",
        json={"color_id": "copper-sunset", "name": "QA Guest",
              "phone": "9000000099", "undertone": "warm", "depth": "medium"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert re.fullmatch(r"[A-Z0-9]{6}", body["code"])
    assert body["color"]["id"] == "copper-sunset"
    assert body["color"]["name"] == "Copper Sunset"
    assert body["color"].get("image_url")
    return body


def test_pick_shape(qa_pick):
    assert qa_pick["code"]


def test_pick_invalid_color():
    r = requests.post(f"{BASE}/api/public/color/{SLUG}/pick",
                      json={"color_id": "not-a-real-color", "name": "x"})
    assert r.status_code == 404
    assert "Unknown" in r.json().get("detail", "")


def test_pick_invalid_undertone():
    r = requests.post(f"{BASE}/api/public/color/{SLUG}/pick",
                      json={"color_id": "copper-sunset", "undertone": "hot"})
    assert r.status_code == 422


# ── admin views ────────────────────────────────────────────────────────────────

def test_admin_color_picks_lists_qa_guest(admin_session, qa_pick):
    r = admin_session.get(f"{BASE}/api/color-picks")
    assert r.status_code == 200, r.text
    picks = r.json()["picks"]
    match = [p for p in picks if p.get("code") == qa_pick["code"]]
    assert match, f"Pick with code {qa_pick['code']} not in list"
    p = match[0]
    assert p["color_name"] == "Copper Sunset"
    assert p["name"] == "QA Guest"
    assert p["phone"] == "9000000099"
    assert p["undertone"] == "warm"


def test_admin_hair_colors_twelve(admin_session):
    r = admin_session.get(f"{BASE}/api/hair-colors")
    assert r.status_code == 200
    assert len(r.json()["colors"]) == 12


def test_color_poster_ok(admin_session):
    r = admin_session.get(f"{BASE}/api/color/poster")
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("image/png")
    assert len(r.content) > 50 * 1024, f"poster only {len(r.content)} bytes"
    # PNG IHDR at bytes 16..24 → width, height (big-endian uint32)
    import struct
    w, h = struct.unpack(">II", r.content[16:24])
    assert w == 1080 and h == 1620, f"got {w}x{h}"


def test_color_poster_unauth():
    r = requests.get(f"{BASE}/api/color/poster")
    assert r.status_code in (401, 403)


def test_new_bookings_contains_color_pick_notice(admin_session, qa_pick):
    since = "2000-01-01T00:00:00+00:00"
    r = admin_session.get(f"{BASE}/api/notifications/new-bookings", params={"since": since})
    assert r.status_code == 200, r.text
    notices = r.json().get("notices") or []
    matching = [n for n in notices if "QA Guest picked Copper Sunset" in (n.get("title") or "")]
    assert matching, f"No color_pick notice found; sample titles: {[n.get('title') for n in notices[:8]]}"


# ── Veo narrated mode & resume ────────────────────────────────────────────────

def test_veo_narrated_without_voiceover_fails_fast(super_session):
    r = super_session.post(f"{BASE}/api/super/veo-ad", json={"mode": "narrated"})
    # Google may return 429 if quota already exhausted at create time → accept
    if r.status_code == 429 or (r.status_code == 400 and "GEMINI" in r.text):
        pytest.skip(f"Gemini not ready: {r.status_code} {r.text[:120]}")
    assert r.status_code == 200, r.text
    job_id = r.json()["job_id"]
    try:
        deadline = time.time() + 60
        status = None
        while time.time() < deadline:
            g = super_session.get(f"{BASE}/api/super/veo-ad/{job_id}")
            assert g.status_code == 200
            doc = g.json()
            status = doc.get("status")
            if status in ("failed", "done"):
                break
            time.sleep(2)
        assert status == "failed", f"Expected failed, got {status}: {doc}"
        err = (doc.get("error") or "").lower()
        assert ("narrated mode needs a voiceover script" in err) or ("429" in err) or ("quota" in err), \
            f"unexpected error: {doc.get('error')}"
    finally:
        super_session.delete(f"{BASE}/api/super/veo-ad/{job_id}")


def test_veo_resume_unknown_job(super_session):
    r = super_session.post(f"{BASE}/api/super/veo-ad/does-not-exist/resume")
    assert r.status_code == 404


def test_veo_avatar_mode_422(super_session):
    r = super_session.post(f"{BASE}/api/super/veo-ad", json={"mode": "avatar"})
    assert r.status_code == 422
