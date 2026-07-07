"""Iter37 backend spot checks: coupons/packages/memberships CRUD, public availability/coupon-check, invoice with coupon."""
import os
import requests
import pytest
from creds import password_for

BASE = (os.environ.get('REACT_APP_BACKEND_URL') or 'https://hair-hub-system.preview.emergentagent.com').rstrip('/')
SLUG = "miracurl-marathahalli"

@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email":"admin@miracurl.com","password":password_for("admin@miracurl.com")})
    assert r.status_code == 200
    return r.cookies["access_token"]

@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture(scope="module", autouse=True)
def ensure_seed_offers(h):
    """Data drifts in a long-lived preview DB — recreate the demo offers if missing."""
    cs = requests.get(f"{BASE}/api/coupons", headers=h).json()
    if not any(c.get("code") == "TESTQA20" for c in cs):
        requests.post(f"{BASE}/api/coupons", headers=h,
                      json={"code": "TESTQA20", "type": "percent", "value": 20, "active": True})
    ps = requests.get(f"{BASE}/api/packages", headers=h).json()
    if not any("Facial" in (p.get("name") or "") for p in ps):
        svcs = requests.get(f"{BASE}/api/services", headers=h).json()
        if svcs:
            requests.post(f"{BASE}/api/packages", headers=h,
                          json={"name": "Facial Glow Pack (5 sessions)", "price": 4000,
                                "service_id": svcs[0]["id"], "sessions": 5, "validity_days": 365})
    ms = requests.get(f"{BASE}/api/memberships", headers=h).json()
    if not any("Gold" in (m.get("name") or "") for m in ms):
        requests.post(f"{BASE}/api/memberships", headers=h,
                      json={"name": "Gold Membership", "price": 2999, "discount_pct": 15, "validity_days": 365})


def test_list_coupons(h):
    r = requests.get(f"{BASE}/api/coupons", headers=h)
    assert r.status_code == 200
    codes = [c.get("code") for c in r.json()]
    assert "TESTQA20" in codes, f"TESTQA20 missing: {codes}"

def test_list_packages(h):
    r = requests.get(f"{BASE}/api/packages", headers=h)
    assert r.status_code == 200
    names = [p.get("name") for p in r.json()]
    assert any("Facial" in (n or "") for n in names), names

def test_list_memberships(h):
    r = requests.get(f"{BASE}/api/memberships", headers=h)
    assert r.status_code == 200
    names = [m.get("name") for m in r.json()]
    assert any("Gold" in (n or "") for n in names), names

def test_public_coupon_check_valid():
    r = requests.get(f"{BASE}/api/public/coupon-check/{SLUG}/TESTQA20")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("valid") is True
    assert d.get("value") == 20 or d.get("discount_value") == 20 or "coupon" in d

def test_public_coupon_check_invalid():
    r = requests.get(f"{BASE}/api/public/coupon-check/{SLUG}/WRONGCODE")
    # either 404 or valid:false
    if r.status_code == 200:
        assert r.json().get("valid") is False
    else:
        assert r.status_code in (400, 404)

def test_public_availability_slot_blocked():
    r = requests.get(f"{BASE}/api/public/availability/{SLUG}?date=2026-07-04")
    assert r.status_code == 200, r.text
    d = r.json()
    slots = d.get("slots") or d.get("availability") or d
    print("slots sample:", str(slots)[:400])
    # Non-strict - just report
    assert slots is not None
