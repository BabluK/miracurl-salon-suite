"""Iter-184 — tenant.hide_month_revenue owner-PIN gating for month revenue & staff performance."""
import os
import requests
import pytest

def _get_base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        # Fall back to frontend .env
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except FileNotFoundError:
            pass
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
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    # CSRF token cookie is set by login
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


# --- Manager dashboard masking ---
def test_manager_dashboard_masked(manager):
    r = manager.get(f"{BASE}/reports/dashboard")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("month_revenue") is None
    assert d.get("month_revenue_locked") is True
    assert d.get("month_revenue_hidden_for_staff") is True
    assert d.get("owner_pin_set") is True


def test_manager_staff_perf_requires_pin(manager):
    r = manager.get(f"{BASE}/reports/staff-performance")
    assert r.status_code == 403
    assert r.json().get("detail") == "OWNER_PIN_REQUIRED"


def test_manager_staff_perf_wrong_pin(manager):
    r = manager.get(f"{BASE}/reports/staff-performance", headers={"X-Owner-Pin": "0000"})
    assert r.status_code == 403
    assert r.json().get("detail") == "OWNER_PIN_REQUIRED"


def test_manager_staff_perf_correct_pin(manager):
    r = manager.get(f"{BASE}/reports/staff-performance", headers={"X-Owner-Pin": PIN})
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ["today", "yesterday", "week", "month", "last_month", "ranges"]:
        assert k in d, f"missing {k}"


def test_manager_revenue_peek_requires_pin(manager):
    r = manager.get(f"{BASE}/settings/revenue-peek")
    assert r.status_code == 403
    assert r.json().get("detail") == "OWNER_PIN_REQUIRED"


def test_manager_revenue_peek_correct_pin(manager):
    r = manager.get(f"{BASE}/settings/revenue-peek", headers={"X-Owner-Pin": PIN})
    assert r.status_code == 200, r.text
    d = r.json()
    assert "month_revenue" in d
    assert isinstance(d["month_revenue"], (int, float))


# --- Owner never locked ---
def test_owner_dashboard_numeric(owner):
    r = owner.get(f"{BASE}/reports/dashboard")
    assert r.status_code == 200, r.text
    d = r.json()
    assert isinstance(d.get("month_revenue"), (int, float))
    assert d.get("month_revenue_locked") is False


def test_owner_staff_perf_no_pin_needed(owner):
    r = owner.get(f"{BASE}/reports/staff-performance")
    assert r.status_code == 200, r.text


# --- Toggle OFF then back ON (leave TRUE at the end) ---
def test_toggle_off_then_on(owner, manager):
    # OFF
    r = owner.put(f"{BASE}/settings/revenue-lock", json={"hide": False},
                  headers={"X-Owner-Pin": PIN})
    assert r.status_code == 200, r.text

    # Manager no longer locked
    r2 = manager.get(f"{BASE}/reports/staff-performance")
    assert r2.status_code == 200, r2.text

    r3 = manager.get(f"{BASE}/reports/dashboard")
    assert r3.status_code == 200
    d = r3.json()
    assert isinstance(d.get("month_revenue"), (int, float))
    assert d.get("month_revenue_locked") is False

    # Restore ON
    r4 = owner.put(f"{BASE}/settings/revenue-lock", json={"hide": True},
                   headers={"X-Owner-Pin": PIN})
    assert r4.status_code == 200, r4.text

    # Confirm manager is locked again
    r5 = manager.get(f"{BASE}/reports/staff-performance")
    assert r5.status_code == 403
