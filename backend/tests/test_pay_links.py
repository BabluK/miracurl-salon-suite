"""Backend sanity tests for Super Admin per-tenant payment links."""
import os
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
SUPER_EMAIL = "super@miracurl.com"
SUPER_PASS = "og9T@41Es#OQb6"
ELEGANCE_SLUG = "elegance-koramangala"


@pytest.fixture(scope="module")
def super_session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def elegance_tenant_id(super_session):
    r = super_session.get(f"{BASE}/api/super-admin/tenants")
    assert r.status_code == 200
    tenants = r.json() if isinstance(r.json(), list) else r.json().get("tenants", [])
    for t in tenants:
        if t.get("slug") == ELEGANCE_SLUG:
            return t["id"]
    pytest.skip("Elegance tenant not found")


def test_list_pay_links(super_session, elegance_tenant_id):
    r = super_session.get(f"{BASE}/api/super-admin/pay-links?tenant_id={elegance_tenant_id}")
    assert r.status_code == 200
    d = r.json()
    assert "plans" in d and "links" in d
    assert isinstance(d["plans"], list) and len(d["plans"]) >= 1
    # Should contain half_year plan
    assert any(p["key"] == "half_year" for p in d["plans"])


def test_create_pay_link_unknown_tenant(super_session):
    r = super_session.post(f"{BASE}/api/super-admin/pay-links",
                           json={"tenant_id": "nope-nope-nope", "plan": "half_year"})
    assert r.status_code == 404


def test_create_pay_link_custom_zero(super_session, elegance_tenant_id):
    r = super_session.post(f"{BASE}/api/super-admin/pay-links",
                           json={"tenant_id": elegance_tenant_id, "plan": "custom",
                                 "custom_amount": 0, "custom_months": 6})
    assert r.status_code == 400


def test_public_pay_link_bad_token():
    r = requests.get(f"{BASE}/api/public/pay-link/doesnotexist999")
    assert r.status_code == 404


def test_public_pay_link_pre_existing():
    r = requests.get(f"{BASE}/api/public/pay-link/u46bKNOSfh4")
    assert r.status_code == 200
    d = r.json()
    assert d["status"] in ("pending", "paid", "expired", "cancelled")
    assert d["amount"] == 12000
    assert "Elegance" in d["salon_name"]


def test_create_and_revoke_custom_link(super_session, elegance_tenant_id):
    # Create custom
    r = super_session.post(f"{BASE}/api/super-admin/pay-links",
                           json={"tenant_id": elegance_tenant_id, "plan": "custom",
                                 "custom_amount": 7999, "custom_months": 6,
                                 "note": "TEST_backend agent link"})
    assert r.status_code == 200, r.text
    link = r.json()["link"]
    assert link["amount"] == 7999
    assert link["status"] == "pending"
    token = link["token"]

    # Verify via public GET
    r2 = requests.get(f"{BASE}/api/public/pay-link/{token}")
    assert r2.status_code == 200
    assert r2.json()["status"] == "pending"

    # Revoke
    r3 = super_session.delete(f"{BASE}/api/super-admin/pay-links/{link['id']}")
    assert r3.status_code == 200

    # Verify status flipped to cancelled
    r4 = requests.get(f"{BASE}/api/public/pay-link/{token}")
    assert r4.status_code == 200
    assert r4.json()["status"] == "cancelled"
