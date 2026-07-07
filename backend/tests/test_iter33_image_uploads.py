"""Iter 33 — Image uploads (staff/service/product) via Emergent Object Storage.

Covers:
- Auth-gated POST /api/uploads/image?kind=... with PNG returns 200 + record shape
- Roundtrip through GET /api/files/{id} returns exact bytes + Cache-Control immutable
- Validation: 4MB → 413, .txt → 400, empty → 400
- Tenant isolation: DB record tagged with tenant_id, cross-tenant retrieval is public (by design) but path is scoped
- Kinds: staff, service, product all upload cleanly
"""
import io
import os
import pytest
import requests
from PIL import Image
from creds import password_for

BASE = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://hair-hub-system.preview.emergentagent.com",
).rstrip("/")

MIRA = {"email": "admin@miracurl.com", "password": password_for("admin@miracurl.com")}
ELEG = {"email": "owner@elegance.com", "password": "Owner@123"}


def _login(creds):
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    return r.cookies["access_token"]


def _png_bytes(size=(64, 64), color="blue"):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(scope="module")
def mira_token():
    return _login(MIRA)


@pytest.fixture(scope="module")
def eleg_token():
    return _login(ELEG)


def _headers(tok):
    return {"Authorization": f"Bearer {tok}"}


class TestUploadHappyPath:
    """POST /api/uploads/image returns proper record; GET /api/files/{id} roundtrips."""

    @pytest.mark.parametrize("kind", ["staff", "service", "product"])
    def test_upload_png_and_download_roundtrip(self, mira_token, kind):
        png = _png_bytes()
        files = {"file": (f"test_{kind}.png", png, "image/png")}
        r = requests.post(
            f"{BASE}/api/uploads/image",
            params={"kind": kind},
            files=files,
            headers=_headers(mira_token),
            timeout=60,
        )
        assert r.status_code == 200, f"kind={kind} upload failed: {r.status_code} {r.text}"
        body = r.json()
        assert set(["id", "url", "size", "content_type"]).issubset(body.keys())
        assert body["content_type"] == "image/png"
        assert body["size"] == len(png)
        assert body["url"].startswith("/api/files/")
        file_id = body["id"]
        assert body["url"].endswith(file_id)

        # GET roundtrip - bytes must match exactly
        r2 = requests.get(f"{BASE}{body['url']}", timeout=60)
        assert r2.status_code == 200
        assert r2.headers.get("content-type", "").startswith("image/png")
        # NOTE: preview ingress rewrites Cache-Control to no-store. Verify the
        # backend sets the immutable header by hitting the internal port directly.
        r_internal = requests.get(f"http://localhost:8001{body['url']}", timeout=30)
        assert r_internal.status_code == 200
        assert r_internal.headers.get("cache-control") == "public, max-age=31536000, immutable"
        assert r2.content == png, "downloaded bytes must equal uploaded bytes"


class TestUploadValidation:
    """Client-side and server-side validation."""

    def test_txt_file_rejected(self, mira_token):
        files = {"file": ("evil.txt", b"hello world", "text/plain")}
        r = requests.post(
            f"{BASE}/api/uploads/image",
            params={"kind": "misc"},
            files=files,
            headers=_headers(mira_token),
            timeout=30,
        )
        assert r.status_code == 400
        assert "JPG" in r.text or "allowed" in r.text.lower()

    def test_empty_file_rejected(self, mira_token):
        files = {"file": ("empty.png", b"", "image/png")}
        r = requests.post(
            f"{BASE}/api/uploads/image",
            params={"kind": "misc"},
            files=files,
            headers=_headers(mira_token),
            timeout=30,
        )
        assert r.status_code == 400
        assert "empty" in r.text.lower()

    def test_over_3mb_returns_413(self, mira_token):
        # 4MB payload — send 4MB of arbitrary bytes with .png extension.
        # Server checks size after reading regardless of image validity.
        big = b"\x89PNG\r\n\x1a\n" + os.urandom(4 * 1024 * 1024)
        files = {"file": ("big.png", big, "image/png")}
        r = requests.post(
            f"{BASE}/api/uploads/image",
            params={"kind": "misc"},
            files=files,
            headers=_headers(mira_token),
            timeout=120,
        )
        assert r.status_code == 413, f"expected 413, got {r.status_code}: {r.text}"
        assert "too large" in r.text.lower()

    def test_unauthenticated_upload_rejected(self):
        files = {"file": ("x.png", _png_bytes(), "image/png")}
        r = requests.post(
            f"{BASE}/api/uploads/image",
            params={"kind": "staff"},
            files=files,
            timeout=30,
        )
        assert r.status_code in (401, 403), f"expected 401/403 without auth, got {r.status_code}"


class TestTenantIsolation:
    """Uploads are tagged with tenant_id (verified via cross-tenant retrievability
    being intentional, but path scope stored under tenant_id in DB — we can only
    verify the outward behaviour: URL is retrievable, and separate tokens produce
    distinct file_ids)."""

    def test_two_tenants_get_distinct_file_ids(self, mira_token, eleg_token):
        png = _png_bytes(color="red")
        files = {"file": ("m.png", png, "image/png")}
        rm = requests.post(f"{BASE}/api/uploads/image", params={"kind": "staff"},
                           files=files, headers=_headers(mira_token), timeout=60)
        assert rm.status_code == 200, rm.text
        files = {"file": ("e.png", png, "image/png")}
        re_ = requests.post(f"{BASE}/api/uploads/image", params={"kind": "staff"},
                            files=files, headers=_headers(eleg_token), timeout=60)
        assert re_.status_code == 200, re_.text
        assert rm.json()["id"] != re_.json()["id"]

        # Public read intentional: both retrievable
        for url in (rm.json()["url"], re_.json()["url"]):
            r = requests.get(f"{BASE}{url}", timeout=60)
            assert r.status_code == 200

    def test_get_missing_file_returns_404(self):
        r = requests.get(f"{BASE}/api/files/00000000-0000-0000-0000-000000000000", timeout=30)
        assert r.status_code == 404
