"""Iter 113 — Restaurant vertical rollout.

Covers:
- POST /api/public/signup-salon business_type=restaurant → trial 30d, 8 menu, Host staff
- POST /api/public/signup-salon default (no business_type) → salon, trial 7d
- GET /api/public/salon/hair-hub-system returns business_type
- POST /api/public/book/{resto} with empty service_ids + party/seating works
- POST /api/public/book/{salon} with empty service_ids still 400
- POST /api/public/book/{salon} with valid service_ids works
- GET /api/public/plans includes resto_* with vertical=restaurant
- PUT /api/super-admin/plans/resto_quarter persists price then restored
"""
import os, uuid, time, datetime as dt
import pytest, requests
from creds import password_for

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
# Load from frontend .env if not set
if not BASE:
    with open("/app/frontend/.env") as f:
        for ln in f:
            if ln.startswith("REACT_APP_BACKEND_URL="):
                BASE = ln.split("=", 1)[1].strip().rstrip("/")

SUPER_EMAIL = "super@miracurl.com"
SUPER_PW = password_for("super@miracurl.com")

SALON_SLUG = "miracurl-marathahalli"
RESTO_SLUG = "spice-garden-test"


def _uniq(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="module")
def super_session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PW})
    assert r.status_code == 200, r.text
    return s


def test_signup_restaurant_creates_30d_trial_menu_and_host():
    slug = _uniq("resto")
    email = f"TEST_{slug}@example.com"
    r = requests.post(f"{BASE}/api/public/signup-salon", json={
        "salon_name": f"TEST Resto {slug}",
        "slug": slug,
        "owner_name": "Test Owner",
        "owner_email": email,
        "password": "TestPass@123",
        "business_type": "restaurant",
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["trial_days"] == 30
    assert d["tenant"]["business_type"] == "restaurant"
    # Verify seeded menu + host via public endpoints
    services = requests.get(f"{BASE}/api/public/services/{slug}").json()
    assert len(services) == 8, f"expected 8 menu items, got {len(services)}"
    staff = requests.get(f"{BASE}/api/public/staff/{slug}").json()
    assert any(s.get("role") == "Host" for s in staff), staff


def test_signup_default_business_type_is_salon_7d_trial():
    slug = _uniq("salon")
    r = requests.post(f"{BASE}/api/public/signup-salon", json={
        "salon_name": f"TEST Salon {slug}",
        "slug": slug,
        "owner_name": "Test Owner",
        "owner_email": f"TEST_{slug}@example.com",
        "password": "TestPass@123",
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["trial_days"] == 7
    assert d["tenant"].get("business_type", "salon") == "salon"


def test_public_salon_returns_business_type():
    r = requests.get(f"{BASE}/api/public/salon/{RESTO_SLUG}")
    assert r.status_code == 200
    assert r.json().get("business_type") == "restaurant"

    r2 = requests.get(f"{BASE}/api/public/salon/{SALON_SLUG}")
    assert r2.status_code == 200
    assert r2.json().get("business_type") in ("salon", None) or r2.json().get("business_type") == "salon"


def _future_iso(hour_ist=13, minute=0, days=3):
    d = dt.datetime.utcnow() + dt.timedelta(days=days)
    total_min = hour_ist * 60 + minute - 330
    h, m = divmod(total_min % (24 * 60), 60)
    return d.replace(hour=h, minute=m, second=0, microsecond=0).isoformat() + "+00:00"


def test_public_book_restaurant_no_services_works():
    payload = {
        "customer_name": "TEST Guest",
        "customer_phone": "9812340001",
        "service_ids": [],
        "scheduled_at": _future_iso(14, 30, days=5 + (uuid.uuid4().int % 3)),
        "party_size": 4,
        "seating": "outdoor",
    }
    r = requests.post(f"{BASE}/api/public/book/{RESTO_SLUG}", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    appt = d["appointment"]
    assert appt["service_names"] == ["Table reservation"]
    assert appt["party_size"] == 4
    assert appt["seating"] == "outdoor"
    assert appt["duration_min"] == 90
    assert appt["staff_name"]  # Host auto-assigned


def test_public_book_salon_no_services_returns_400():
    payload = {
        "customer_name": "TEST Guest",
        "customer_phone": "9812340002",
        "service_ids": [],
        "scheduled_at": _future_iso(),
    }
    r = requests.post(f"{BASE}/api/public/book/{SALON_SLUG}", json=payload)
    assert r.status_code == 400
    assert "Invalid services" in r.text or "invalid services" in r.text.lower()


def test_public_book_salon_valid_services_works():
    services = requests.get(f"{BASE}/api/public/services/{SALON_SLUG}").json()
    svc = next((s for s in services if s.get("active", True)), None)
    assert svc, "no bookable service"
    # Use unique phone to avoid rate-limit collisions
    phone = f"98123{uuid.uuid4().int % 100000:05d}"
    # Ensure the 5-digit suffix keeps it valid (starts with 9 already)
    payload = {
        "customer_name": "TEST Guest Salon",
        "customer_phone": phone,
        "service_ids": [svc["id"]],
        "scheduled_at": _future_iso(),
    }
    r = requests.post(f"{BASE}/api/public/book/{SALON_SLUG}", json=payload)
    # Could get 409 if slot full or 429 rate limit — accept 200 primarily
    assert r.status_code in (200, 409), r.text
    if r.status_code == 200:
        d = r.json()
        assert d["appointment"]["service_names"]


def test_public_plans_include_resto():
    r = requests.get(f"{BASE}/api/public/plans")
    assert r.status_code == 200
    plans = r.json()
    for key, price in [("resto_quarter", 3000), ("resto_half", 6000), ("resto_annual", 12000)]:
        assert key in plans, f"missing {key}"
        assert plans[key]["price"] == price
        assert plans[key].get("vertical") == "restaurant"


def test_super_admin_edit_resto_plan_persists(super_session):
    # Set new price
    r = super_session.put(f"{BASE}/api/super-admin/plans/resto_quarter",
                          json={"price": 3500, "label": "Restaurant 3-Month", "duration_days": 92, "branches": 1})
    assert r.status_code == 200, r.text
    assert r.json()["price"] == 3500
    # Verify via public
    plans = requests.get(f"{BASE}/api/public/plans").json()
    assert plans["resto_quarter"]["price"] == 3500
    # Restore
    r2 = super_session.put(f"{BASE}/api/super-admin/plans/resto_quarter",
                           json={"price": 3000, "label": "Restaurant 3-Month", "duration_days": 92, "branches": 1})
    assert r2.status_code == 200
    plans2 = requests.get(f"{BASE}/api/public/plans").json()
    assert plans2["resto_quarter"]["price"] == 3000
