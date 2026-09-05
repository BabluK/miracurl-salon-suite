"""
Regression tests for image thumbnail system + branding batch:
- GET /api/files/{id}?w=  → resized WEBP smaller than original
- GET /api/img?src=&w=    → allowlisted CDN proxy resize; SSRF blocked
- PUT /api/settings/branding logo_shape + header_bg validation
- GET /api/public/salon/{slug} includes new fields
"""
import io
import os
import uuid
import requests
import pytest
from PIL import Image
from creds import password_for

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
TENANT = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PWD = password_for("admin@miracurl.com")
PIN = "4321"


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        headers={"X-Tenant-Slug": TENANT, "Content-Type": "application/json"},
        json={"email": ADMIN_EMAIL, "password": ADMIN_PWD},
    )
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def csrf(sess):
    return sess.cookies.get("csrf_token")


@pytest.fixture(scope="module")
def uploaded_file(sess, csrf):
    # Create a 1200x800 PNG in-memory
    im = Image.new("RGB", (1200, 800), (200, 120, 40))
    # Add gradient noise so webp encoding has content
    for x in range(0, 1200, 30):
        for y in range(0, 800, 30):
            im.putpixel((x, y), ((x + y) % 255, (x * 3) % 255, (y * 5) % 255))
    buf = io.BytesIO()
    im.save(buf, "PNG")
    data = buf.getvalue()
    files = {"file": ("test.png", data, "image/png")}
    r = sess.post(
        f"{BASE_URL}/api/uploads/image?kind=service",
        files=files,
        headers={"X-CSRF-Token": csrf, "X-Owner-Pin": PIN},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    return {"id": body["id"], "size": body["size"]}


# ---------- /api/files/{id}?w= ----------

def test_files_original_serves(sess, uploaded_file):
    r = sess.get(f"{BASE_URL}/api/files/{uploaded_file['id']}")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("image/")
    assert len(r.content) > 1000


def test_files_thumbnail_smaller_webp(sess, uploaded_file):
    r = sess.get(f"{BASE_URL}/api/files/{uploaded_file['id']}?w=160", timeout=30)
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/webp"
    assert len(r.content) < uploaded_file["size"], (
        f"thumb {len(r.content)} not smaller than original {uploaded_file['size']}"
    )
    # cache-control immutable
    assert "immutable" in r.headers.get("cache-control", "")


def test_files_invalid_returns_404(sess):
    r = sess.get(f"{BASE_URL}/api/files/{uuid.uuid4()}")
    assert r.status_code == 404


# ---------- /api/img proxy ----------

def test_img_proxy_non_allowlisted_400():
    r = requests.get(f"{BASE_URL}/api/img", params={"src": "https://evil.com/x.png", "w": 160})
    assert r.status_code == 400


def test_img_proxy_http_scheme_blocked():
    r = requests.get(
        f"{BASE_URL}/api/img",
        params={"src": "http://static.prod-images.emergentagent.com/x.png", "w": 160},
    )
    assert r.status_code == 400


def test_img_proxy_allowlisted_host_accepted_or_fetch_error():
    # We can't guarantee a specific asset exists, but the host allowlist must pass
    # the initial validation. If fetch fails, 400 with 'Image fetch failed' is OK;
    # if hosts change, mark as skip.
    src = "https://static.prod-images.emergentagent.com/nonexistent-asset-abc123.png"
    r = requests.get(f"{BASE_URL}/api/img", params={"src": src, "w": 160}, timeout=30)
    # Either successful proxy (200) or fetch failed (400 "Image fetch failed"), never host-not-allowed
    assert r.status_code in (200, 400)
    if r.status_code == 400:
        assert "Host not allowed" not in r.text


# ---------- Branding logo_shape + header_bg ----------

def _put_branding(sess, csrf, payload):
    return sess.put(
        f"{BASE_URL}/api/settings/branding",
        headers={"X-CSRF-Token": csrf, "X-Owner-Pin": PIN, "Content-Type": "application/json"},
        json=payload,
    )


def test_branding_valid_logo_shape_square(sess, csrf):
    r = _put_branding(sess, csrf, {"logo_shape": "square", "header_bg": "#F3E5BF"})
    assert r.status_code == 200, r.text
    g = sess.get(f"{BASE_URL}/api/settings/branding")
    assert g.status_code == 200
    body = g.json()
    assert body.get("logo_shape") == "square"
    assert body.get("header_bg") == "#F3E5BF"


def test_branding_valid_logo_shape_circle(sess, csrf):
    r = _put_branding(sess, csrf, {"logo_shape": "circle"})
    assert r.status_code == 200, r.text
    g = sess.get(f"{BASE_URL}/api/settings/branding").json()
    assert g.get("logo_shape") == "circle"


def test_branding_invalid_logo_shape_422(sess, csrf):
    r = _put_branding(sess, csrf, {"logo_shape": "triangle"})
    assert r.status_code == 422, r.text


def test_branding_header_bg_too_long_422(sess, csrf):
    r = _put_branding(sess, csrf, {"header_bg": "x" * 25})
    assert r.status_code == 422, r.text


def test_branding_restore_defaults(sess, csrf):
    r = _put_branding(sess, csrf, {"logo_shape": "square", "header_bg": "#F3E5BF", "book_bg": "img:champagne"})
    assert r.status_code == 200, r.text


# ---------- Public site payload ----------

def test_public_salon_returns_new_fields():
    r = requests.get(f"{BASE_URL}/api/public/salon/{TENANT}")
    assert r.status_code == 200
    body = r.json()
    assert "logo_shape" in body, f"logo_shape missing; keys={list(body.keys())}"
    assert "header_bg" in body, f"header_bg missing; keys={list(body.keys())}"
    assert body["logo_shape"] in ("circle", "square")
