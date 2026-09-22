"""Iter-185 — Revenue Trend (7-day) owner-PIN gating for managers on miracurl-marathahalli."""
import os
import requests
import pytest


def _get_base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip()
                    break
    assert url, "REACT_APP_BACKEND_URL not set"
    return url.rstrip("/") + "/api"


BASE = _get_base()
SLUG = "miracurl-marathahalli"
OWNER_EMAIL = "admin@miracurl.com"
OWNER_PASS = "q6QY@tn3p#9DtL"
MGR_EMAIL = "manager@miracurl.com"
MGR_PASS = "Manager@1234"
PIN = "4321"


def _login(email, password):
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": SLUG})
    r = s.post(f"{BASE}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    csrf = s.cookies.get("csrf_token")
    if csrf:
        s.headers["X-CSRF-Token"] = csrf
    return s


@pytest.fixture(scope="module")
def manager():
    return _login(MGR_EMAIL, MGR_PASS)


@pytest.fixture(scope="module")
def owner():
    return _login(OWNER_EMAIL, OWNER_PASS)


# --- Dashboard payload embeds trend lock ---
def test_manager_dashboard_trend_locked(manager):
    r = manager.get(f"{BASE}/reports/dashboard")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("revenue_trend") == []
    assert d.get("revenue_trend_locked") is True


def test_owner_dashboard_trend_open(owner):
    r = owner.get(f"{BASE}/reports/dashboard")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("revenue_trend_locked") is False
    trend = d.get("revenue_trend")
    assert isinstance(trend, list) and len(trend) == 7
    for entry in trend:
        assert "date" in entry and "revenue" in entry


# --- GET /reports/revenue-trend ---
def test_manager_trend_requires_pin(manager):
    r = manager.get(f"{BASE}/reports/revenue-trend")
    assert r.status_code == 403
    assert r.json().get("detail") == "OWNER_PIN_REQUIRED"


def test_manager_trend_wrong_pin(manager):
    r = manager.get(f"{BASE}/reports/revenue-trend", headers={"X-Owner-Pin": "0000"})
    assert r.status_code == 403
    assert r.json().get("detail") == "OWNER_PIN_REQUIRED"


def test_manager_trend_correct_pin(manager):
    r = manager.get(f"{BASE}/reports/revenue-trend", headers={"X-Owner-Pin": PIN})
    assert r.status_code == 200, r.text
    d = r.json()
    trend = d.get("revenue_trend")
    assert isinstance(trend, list) and len(trend) == 7
    for entry in trend:
        assert "date" in entry and "revenue" in entry


def test_owner_trend_no_pin_needed(owner):
    r = owner.get(f"{BASE}/reports/revenue-trend")
    assert r.status_code == 200, r.text
    d = r.json()
    assert isinstance(d.get("revenue_trend"), list) and len(d["revenue_trend"]) == 7


# --- Toggle OFF then restore ON (leave TRUE at end) ---
def test_toggle_off_then_on(owner, manager):
    r = owner.put(f"{BASE}/settings/revenue-lock", json={"hide": False},
                  headers={"X-Owner-Pin": PIN})
    assert r.status_code == 200, r.text

    # Dashboard trend now visible to manager
    r2 = manager.get(f"{BASE}/reports/dashboard")
    assert r2.status_code == 200
    d = r2.json()
    assert d.get("revenue_trend_locked") is False
    assert isinstance(d.get("revenue_trend"), list) and len(d["revenue_trend"]) == 7

    # /reports/revenue-trend no longer needs PIN
    r3 = manager.get(f"{BASE}/reports/revenue-trend")
    assert r3.status_code == 200, r3.text

    # Restore ON
    r4 = owner.put(f"{BASE}/settings/revenue-lock", json={"hide": True},
                   headers={"X-Owner-Pin": PIN})
    assert r4.status_code == 200

    # Confirm manager is locked again
    r5 = manager.get(f"{BASE}/reports/revenue-trend")
    assert r5.status_code == 403
