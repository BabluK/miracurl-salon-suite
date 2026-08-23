"""Iteration 101: Site Info (Landing redesign) — public GET + super PUT."""
from _creds import _PW_ADMIN, _PW_SUPER
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
SUPER_EMAIL = "super@miracurl.com"
SUPER_PW = _PW_SUPER
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PW = _PW_ADMIN
TENANT = "miracurl-marathahalli"


@pytest.fixture(scope="module")
def super_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": SUPER_EMAIL, "password": SUPER_PW}, timeout=30)
    assert r.status_code == 200, f"super login failed {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PW},
               headers={"X-Tenant-Slug": TENANT}, timeout=30)
    assert r.status_code == 200, f"admin login failed {r.status_code} {r.text}"
    return s


def test_public_site_info_defaults():
    r = requests.get(f"{BASE_URL}/api/public/site-info", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "contact_email" in data
    assert "ceo_name" in data
    assert "10+ years of IT industry experience" in data["ceo_about"]
    # socials present (may be empty strings or previously set)
    for k in ("instagram", "facebook", "youtube", "whatsapp"):
        assert k in data


def test_put_site_info_forbidden_for_non_super(admin_session):
    r = admin_session.put(f"{BASE_URL}/api/super/site-info",
                          json={"instagram": "https://x.example"},
                          headers={"X-Tenant-Slug": TENANT}, timeout=30)
    assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"


def test_put_site_info_super_updates_and_persists(super_session):
    # snapshot current
    original = requests.get(f"{BASE_URL}/api/public/site-info", timeout=30).json()

    payload = {
        "instagram": "https://instagram.com/miracurlsuite",
        "facebook": "https://facebook.com/miracurlsuite",
        "ceo_name": "Test CEO",
    }
    r = super_session.put(f"{BASE_URL}/api/super/site-info", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["instagram"] == payload["instagram"]
    assert out["ceo_name"] == "Test CEO"

    # verify via public GET (persistence)
    r2 = requests.get(f"{BASE_URL}/api/public/site-info", timeout=30)
    d = r2.json()
    assert d["ceo_name"] == "Test CEO"
    assert d["instagram"] == payload["instagram"]
    assert d["facebook"] == payload["facebook"]

    # RESTORE defaults per request
    restore = {
        "instagram": "",
        "facebook": original.get("facebook", ""),
        "ceo_name": "Founder & CEO",
    }
    rr = super_session.put(f"{BASE_URL}/api/super/site-info", json=restore, timeout=30)
    assert rr.status_code == 200
    final = requests.get(f"{BASE_URL}/api/public/site-info", timeout=30).json()
    assert final["ceo_name"] == "Founder & CEO"
    assert final["instagram"] == ""
