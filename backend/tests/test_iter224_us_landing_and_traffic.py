"""iter224: US landing variant removal of public mira-studio/mira-builder, visit beacon device + traffic segments."""
import os
import secrets
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].splitlines()[0]).rstrip("/")
SUPER_EMAIL = "admin@miracurl-suite.com"
SUPER_PASS = "og9T@41Es#OQb6"
TENANT_EMAIL = "admin@miracurl.com"
TENANT_PASS = "q6QY@tn3p#9DtL"
TENANT_SLUG = "miracurl-marathahalli"


def _login(email, password, tenant_slug=None):
    s = requests.Session()
    headers = {"Content-Type": "application/json"}
    if tenant_slug:
        headers["X-Tenant-Slug"] = tenant_slug
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, headers=headers)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    csrf = s.cookies.get("csrf_token")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf})
    if tenant_slug:
        s.headers.update({"X-Tenant-Slug": tenant_slug})
    return s


# ---------------- Visit beacon ----------------
class TestVisitBeacon:
    def test_visit_valid_mobile(self):
        vid = secrets.token_urlsafe(9)[:12]
        r = requests.post(f"{BASE_URL}/api/public/visit", json={
            "vid": vid, "path": "/pricing", "ref": "google.com", "region": "intl", "device": "mobile"
        })
        assert r.status_code == 204, r.text

    def test_visit_valid_desktop_in(self):
        vid = secrets.token_urlsafe(9)[:12]
        r = requests.post(f"{BASE_URL}/api/public/visit", json={
            "vid": vid, "path": "/signup-salon-india", "ref": "", "region": "in", "device": "desktop"
        })
        assert r.status_code == 204, r.text

    def test_visit_invalid_device(self):
        vid = secrets.token_urlsafe(9)[:12]
        r = requests.post(f"{BASE_URL}/api/public/visit", json={
            "vid": vid, "path": "/", "region": "intl", "device": "tablet"
        })
        assert r.status_code == 422, r.text

    def test_visit_invalid_region(self):
        vid = secrets.token_urlsafe(9)[:12]
        r = requests.post(f"{BASE_URL}/api/public/visit", json={
            "vid": vid, "path": "/", "region": "x", "device": "mobile"
        })
        assert r.status_code == 422, r.text


# ---------------- Traffic conversion segments ----------------
class TestTrafficConversion:
    def test_segments_present(self):
        s = _login(SUPER_EMAIL, SUPER_PASS)
        r = s.get(f"{BASE_URL}/api/super-admin/traffic-conversion")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "segments" in data and isinstance(data["segments"], list)
        for seg in data["segments"]:
            assert "region" in seg and "label" in seg
            assert "visitors" in seg and "mobile_pct" in seg
            assert "signup_page_rate_pct" in seg and "top_paths" in seg


# ---------------- Mira AI Studio removal ----------------
class TestMiraStudioRemoval:
    def test_public_mira_studio_plans_404(self):
        r = requests.get(f"{BASE_URL}/api/public/mira-studio/plans")
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text[:200]}"

    def test_public_mira_builder_404(self):
        r = requests.get(f"{BASE_URL}/api/public/mira-builder/sites")
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text[:200]}"

    def test_tenant_mira_studio_agents_still_works(self):
        s = _login(TENANT_EMAIL, TENANT_PASS, TENANT_SLUG)
        r = s.get(f"{BASE_URL}/api/mira-studio/agents")
        assert r.status_code == 200, f"tenant mira-studio should still work: {r.status_code} {r.text[:200]}"
