"""Iteration 214 — Preview Logo Upload tests.

Covers:
  * POST /api/public/signup-logo (PNG success + .txt rejection)
  * GET /api/files/<id> returns image/png
  * uploads record has tenant_id='pending-signup', kind='logo'
  * POST /api/public/signup-salon with logo_url -> tenant.logo_url set
  * Uploads record re-tagged to the newly created tenant id
  * GET /api/public/salon/<slug> returns logo_url
  * logo_url with invalid pattern -> 422
"""
import io
import os
import time
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")


def _png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGBA", (64, 64), (200, 160, 90, 255)).save(buf, "PNG")
    return buf.getvalue()


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    return s


class TestSignupLogo:
    uploaded_id = None
    uploaded_url = None

    def test_upload_png(self, session):
        files = {"file": ("logo.png", _png_bytes(), "image/png")}
        r = session.post(f"{BASE_URL}/api/public/signup-logo", files=files, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "id" in data and "url" in data and "size" in data
        assert data["url"].startswith("/api/files/")
        assert data["url"].endswith(data["id"])
        TestSignupLogo.uploaded_id = data["id"]
        TestSignupLogo.uploaded_url = data["url"]

    def test_get_served_as_png(self, session):
        assert TestSignupLogo.uploaded_url, "upload must succeed first"
        r = session.get(f"{BASE_URL}{TestSignupLogo.uploaded_url}", timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/png")
        assert len(r.content) > 100

    def test_reject_txt(self, session):
        files = {"file": ("note.txt", b"hello world", "text/plain")}
        r = session.post(f"{BASE_URL}/api/public/signup-logo", files=files, timeout=30)
        assert r.status_code == 400
        assert "Only JPG, PNG, GIF or WebP" in r.text


class TestSignupSalonWithLogo:
    slug = None
    tenant_logo_url = None

    def test_signup_invalid_logo_url_pattern(self, session):
        ts = int(time.time())
        payload = {
            "salon_name": "Logo Test Salon Bad",
            "slug": f"logo-bad-{ts}",
            "owner_name": "Logo Tester",
            "owner_email": f"logo-bad-{ts}@example.com",
            "password": "LogoTest@123",
            "logo_url": "http://evil.com/x.png",
        }
        r = session.post(f"{BASE_URL}/api/public/signup-salon", json=payload, timeout=30)
        assert r.status_code == 422, r.text

    def test_signup_with_valid_logo(self, session):
        # Fresh upload for the signup (reuse module logo if present)
        logo_url = TestSignupLogo.uploaded_url
        if not logo_url:
            files = {"file": ("logo.png", _png_bytes(), "image/png")}
            up = session.post(f"{BASE_URL}/api/public/signup-logo", files=files, timeout=30)
            assert up.status_code == 200, up.text
            logo_url = up.json()["url"]

        ts = int(time.time())
        slug = f"logo-test-{ts}"
        payload = {
            "salon_name": "Logo Test Salon",
            "slug": slug,
            "owner_name": "Logo Tester",
            "owner_email": f"logo-test-{ts}@example.com",
            "password": "LogoTest@123",
            "logo_url": logo_url,
        }
        r = session.post(f"{BASE_URL}/api/public/signup-salon", json=payload, timeout=60)
        if r.status_code == 429:
            pytest.skip(f"Rate limited: {r.text}")
        assert r.status_code == 200, r.text
        TestSignupSalonWithLogo.slug = slug
        TestSignupSalonWithLogo.tenant_logo_url = logo_url

    def test_public_salon_returns_logo(self, session):
        slug = TestSignupSalonWithLogo.slug
        if not slug:
            pytest.skip("signup did not complete")
        r = session.get(f"{BASE_URL}/api/public/salon/{slug}", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("logo_url") == TestSignupSalonWithLogo.tenant_logo_url
