"""Iter-186 — Single Owner-PIN unlocks all three hidden financials via /reports/team-unlock."""
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
    assert url
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


# --- /reports/team-unlock ---
def test_manager_team_unlock_no_pin(manager):
    r = manager.get(f"{BASE}/reports/team-unlock")
    assert r.status_code == 403
    assert r.json().get("detail") == "OWNER_PIN_REQUIRED"


def test_manager_team_unlock_wrong_pin(manager):
    r = manager.get(f"{BASE}/reports/team-unlock", headers={"X-Owner-Pin": "0000"})
    assert r.status_code == 403
    assert r.json().get("detail") == "OWNER_PIN_REQUIRED"


def test_manager_team_unlock_correct_pin(manager):
    r = manager.get(f"{BASE}/reports/team-unlock", headers={"X-Owner-Pin": PIN})
    assert r.status_code == 200, r.text
    d = r.json()
    assert "month_revenue" in d and isinstance(d["month_revenue"], (int, float))
    trend = d.get("revenue_trend")
    assert isinstance(trend, list) and len(trend) == 7
    for e in trend:
        assert "date" in e and "revenue" in e
    perf = d.get("staff_performance")
    assert isinstance(perf, dict)
    for k in ("today", "yesterday", "week", "month", "last_month", "ranges"):
        assert k in perf, f"missing key {k} in staff_performance"


def test_owner_team_unlock_no_pin(owner):
    r = owner.get(f"{BASE}/reports/team-unlock")
    assert r.status_code == 200, r.text
    d = r.json()
    assert "month_revenue" in d
    assert isinstance(d.get("revenue_trend"), list) and len(d["revenue_trend"]) == 7
    perf = d.get("staff_performance")
    for k in ("today", "yesterday", "week", "month", "last_month", "ranges"):
        assert k in perf


# --- Regression: existing endpoints still work + values consistent ---
def test_regression_endpoints_consistent(manager):
    r_team = manager.get(f"{BASE}/reports/team-unlock", headers={"X-Owner-Pin": PIN})
    assert r_team.status_code == 200
    team = r_team.json()

    # revenue-peek
    r_peek = manager.get(f"{BASE}/settings/revenue-peek", headers={"X-Owner-Pin": PIN})
    assert r_peek.status_code == 200, r_peek.text
    assert r_peek.json().get("month_revenue") == team["month_revenue"]

    # staff-performance without pin -> 403
    r_sp_nopin = manager.get(f"{BASE}/reports/staff-performance")
    assert r_sp_nopin.status_code == 403

    r_sp = manager.get(f"{BASE}/reports/staff-performance", headers={"X-Owner-Pin": PIN})
    assert r_sp.status_code == 200

    # revenue-trend without pin -> 403
    r_rt_nopin = manager.get(f"{BASE}/reports/revenue-trend")
    assert r_rt_nopin.status_code == 403

    r_rt = manager.get(f"{BASE}/reports/revenue-trend", headers={"X-Owner-Pin": PIN})
    assert r_rt.status_code == 200
    # consistency: trend arrays match
    assert r_rt.json().get("revenue_trend") == team["revenue_trend"]
