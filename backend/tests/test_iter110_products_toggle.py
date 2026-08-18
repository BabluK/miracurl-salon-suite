"""Iteration 110 - Miracurl Products toggle backend tests.

Verifies:
- Public salon endpoint returns show_products (default true)
- Salon admin can GET/PUT /api/settings/miracurl-products and it round-trips
- Restores toggle to enabled at the end.
"""
import os
import pytest
import requests

def _read_frontend_env():
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL missing")

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env()).rstrip("/")
TENANT_SLUG = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASSWORD = "q6QY@tn3p#9DtL"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT_SLUG, "Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    yield s
    # Ensure enabled at the end
    s.put(f"{BASE_URL}/api/settings/miracurl-products", json={"enabled": True})


def test_public_salon_show_products_default_true():
    r = requests.get(f"{BASE_URL}/api/public/salon/{TENANT_SLUG}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "show_products" in data, f"show_products missing in response: {list(data.keys())}"
    assert data["show_products"] is True


def test_settings_get_default_enabled(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/settings/miracurl-products")
    assert r.status_code == 200, r.text
    assert r.json().get("enabled") is True


def test_toggle_off_then_public_hides(admin_session):
    r = admin_session.put(f"{BASE_URL}/api/settings/miracurl-products", json={"enabled": False})
    assert r.status_code == 200, r.text
    assert r.json().get("enabled") is False

    # GET to persist
    g = admin_session.get(f"{BASE_URL}/api/settings/miracurl-products")
    assert g.json().get("enabled") is False

    # Public reflects
    p = requests.get(f"{BASE_URL}/api/public/salon/{TENANT_SLUG}")
    assert p.status_code == 200
    assert p.json().get("show_products") is False


def test_toggle_on_restores(admin_session):
    r = admin_session.put(f"{BASE_URL}/api/settings/miracurl-products", json={"enabled": True})
    assert r.status_code == 200
    assert r.json().get("enabled") is True

    p = requests.get(f"{BASE_URL}/api/public/salon/{TENANT_SLUG}")
    assert p.json().get("show_products") is True
