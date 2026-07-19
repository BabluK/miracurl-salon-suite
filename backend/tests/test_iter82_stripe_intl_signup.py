"""Iter 82: Region-aware signup + Stripe USD subscription checkout for intl salons."""
import os
import time
import uuid
import pytest
import requests
from dotenv import dotenv_values

_env = dotenv_values("/app/frontend/.env")
BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL")).rstrip("/")


def _unique_email(tag: str) -> str:
    return f"stripetest_{tag}_{uuid.uuid4().hex[:6]}@example.com"


def _signup(region=None, timezone=None):
    email = _unique_email(region or "in")
    payload = {
        "salon_name": f"Test Salon {uuid.uuid4().hex[:5]}",
        "owner_name": "Test Owner",
        "owner_email": email,
        "password": "TestPass@123",
    }
    if region:
        payload["region"] = region
    if timezone:
        payload["timezone"] = timezone
    s = requests.Session()
    r = s.post(f"{BASE}/api/public/signup-salon", json=payload, timeout=30)
    return s, r, email


# ---------- Signup region + currency behavior ----------
def test_signup_intl_sets_usd_currency_and_timezone():
    s, r, email = _signup(region="intl", timezone="America/New_York")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["tenant"]["currency"] == "USD"
    assert data["tenant"].get("timezone") == "America/New_York"
    assert data["user"]["email"] == email


def test_signup_default_no_usd_currency():
    s, r, _ = _signup()
    assert r.status_code == 200, r.text
    tenant = r.json()["tenant"]
    # Currency should not be forced to USD for default/IN region
    assert tenant.get("currency") != "USD"


def test_signup_region_in_no_usd():
    s, r, _ = _signup(region="in")
    assert r.status_code == 200, r.text
    tenant = r.json()["tenant"]
    assert tenant.get("currency") != "USD"


# ---------- Stripe subscription checkout ----------
@pytest.fixture(scope="module")
def intl_session():
    s, r, email = _signup(region="intl", timezone="America/New_York")
    assert r.status_code == 200
    slug = r.json()["tenant"]["slug"]
    s.headers.update({"X-Tenant-Slug": slug})
    return s, slug, email


def test_intl_settings_returns_usd(intl_session):
    s, slug, _ = intl_session
    r = s.get(f"{BASE}/api/settings/international", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["currency"] == "USD"
    assert d["stripe_ready"] is True


def test_stripe_checkout_creates_session(intl_session):
    s, slug, _ = intl_session
    r = s.post(f"{BASE}/api/billing/stripe/checkout",
               json={"plan": "intl_pro_annual", "origin_url": BASE}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["checkout_url"].startswith("https://checkout.stripe.com")
    assert d["session_id"]
    # Store for status check
    pytest.stripe_session_id = d["session_id"]


def test_stripe_checkout_rejects_non_intl_plan(intl_session):
    s, _, _ = intl_session
    r = s.post(f"{BASE}/api/billing/stripe/checkout",
               json={"plan": "annual", "origin_url": BASE}, timeout=15)
    assert r.status_code == 400, r.text


def test_stripe_checkout_unauthenticated():
    r = requests.post(f"{BASE}/api/billing/stripe/checkout",
                      json={"plan": "intl_pro_annual", "origin_url": BASE}, timeout=15)
    assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"


def test_stripe_status_pending(intl_session):
    s, _, _ = intl_session
    sid = getattr(pytest, "stripe_session_id", None)
    assert sid, "prev test must have created session"
    r = s.get(f"{BASE}/api/billing/stripe/status/{sid}", timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["payment_status"] == "pending"


def test_stripe_status_unknown_session_404(intl_session):
    s, _, _ = intl_session
    r = s.get(f"{BASE}/api/billing/stripe/status/cs_test_unknown_xxx", timeout=15)
    assert r.status_code == 404
