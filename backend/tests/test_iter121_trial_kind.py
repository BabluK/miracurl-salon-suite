"""Iteration 121: newbiz 90-day trial + super admin trial_kind enrichment."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
SA_EMAIL = "super@miracurl.com"
SA_PASS = "og9T@41Es#OQb6"


@pytest.fixture(scope="module")
def sa_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": SA_EMAIL, "password": SA_PASS}, timeout=20)
    assert r.status_code == 200, f"SA login failed: {r.status_code} {r.text[:200]}"
    # Attach CSRF header if cookie present
    csrf = s.cookies.get("csrf_token")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf})
    return s


def test_sa_login_ok(sa_session):
    assert sa_session is not None


def test_super_admin_tenants_enrichment(sa_session):
    r = sa_session.get(f"{BASE_URL}/api/super-admin/tenants", timeout=30)
    assert r.status_code == 200, r.text[:300]
    tenants = r.json()
    assert isinstance(tenants, list) and len(tenants) > 0

    by_name = {t.get("name"): t for t in tenants}
    # Newbiz tenant
    tnb = by_name.get("Test Newbiz Salon 90")
    assert tnb is not None, "Test Newbiz Salon 90 not found in list"
    assert tnb.get("trial_kind") == "newbiz90", f"trial_kind={tnb.get('trial_kind')}"
    assert tnb.get("signup_offer") == "newbiz"
    # trial_days_left present + reasonable (up to 90)
    tdl = tnb.get("trial_days_left")
    assert isinstance(tdl, int), f"trial_days_left not int: {tdl}"
    assert 0 <= tdl <= 90, f"trial_days_left out of range: {tdl}"

    # 7-day control (if present)
    t7 = by_name.get("Test Control Salon 7")
    if t7 is not None and t7.get("status") == "trial":
        assert t7.get("trial_kind") == "trial7", f"control trial_kind={t7.get('trial_kind')}"

    # 30-day sample
    t30 = by_name.get("Infinity Family Restaurant")
    if t30 is not None and t30.get("status") == "trial":
        assert t30.get("trial_kind") == "trial30", f"trial30 got={t30.get('trial_kind')}"


def test_referred_by_name_enrichment(sa_session):
    r = sa_session.get(f"{BASE_URL}/api/super-admin/tenants", timeout=30)
    tenants = r.json()
    for t in tenants:
        if t.get("referred_by_tenant_id"):
            assert "referred_by_name" in t, f"tenant {t.get('name')} missing referred_by_name"
            # value can be None if referrer deleted; but key should exist for enrichment
