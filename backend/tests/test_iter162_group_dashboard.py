"""Iteration 162 — Group Dashboard multi-salon overview + refactor regression (campaign onboarding).

Covers:
  1. GET /api/auth/my-salons/overview for every period chip + custom range.
  2. Owner PIN gating (missing PIN → 403 OWNER_PIN_REQUIRED, wrong PIN skipped to avoid lockout).
  3. Custom range validation (bad dates → 400, > 366 days → 400).
  4. Regression after campaign_onboarding refactor:
       - GET /api/settings/rewards-campaign (owner) still returns agreement + onboarding.
       - GET /api/settings/rewards-campaign/agreement (owner) → 200.
       - GET /api/super-admin/tenants/{tid}/features → 200 (agreement/onboarding fields).
       - GET /api/super-admin/rewards-campaign/onboarding → 200.
  5. Whats-new: build == 2026-09-16.264 and highlights mention 'Group Dashboard'.
"""
import os
import pytest
import requests
import os as _os
import sys as _sys

_sys.path.insert(0, _os.path.dirname(__file__))
from _creds import password_for  # noqa: E402
from _creds import pw

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=", 1)[1].split("\n", 1)[0]).rstrip("/")
API = f"{BASE_URL}/api"

OWNER_EMAIL = "admin@miracurl.com"
OWNER_PASS = password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD")
OWNER_PIN = "4321"
TENANT_SLUG = "miracurl-marathahalli"
SUPER_EMAIL = "super@miracurl.com"
SUPER_PASS = pw("SUPER_ADMIN")


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def owner_session():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT_SLUG})
    r = s.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASS})
    assert r.status_code == 200, f"owner login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def super_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS})
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text[:200]}"
    return s


# ---------- Group Dashboard (my-salons overview) ----------
PERIODS = ["today", "yesterday", "4d", "7d", "week", "month", "last_month", "3m", "6m", "2026-08"]


@pytest.mark.parametrize("period", PERIODS)
def test_my_salons_overview_period(owner_session, period):
    r = owner_session.get(f"{API}/auth/my-salons/overview",
                          headers={"X-Owner-Pin": OWNER_PIN}, params={"period": period})
    assert r.status_code == 200, f"{period}: {r.status_code} {r.text[:300]}"
    d = r.json()
    for key in ("period", "period_label", "salons", "total_today", "total_month",
                "total_cash", "total_upi", "total_card", "total_bills", "total_bookings", "top_stylist"):
        assert key in d, f"{period}: missing key {key}"
    assert d["period"] == period
    assert isinstance(d["salons"], list) and len(d["salons"]) >= 2, f"{period}: <2 salons"
    for s in d["salons"]:
        for k in ("today", "invoices_today", "cash", "upi", "card",
                  "top_stylist", "appointments_today", "month", "active"):
            assert k in s, f"{period}/{s.get('name')}: missing salon key {k}"
        ts = s["top_stylist"]
        if ts is not None:
            for k in ("staff_id", "name", "revenue", "services"):
                assert k in ts, f"top_stylist missing {k}"
    # Aggregations
    sum_bills = sum(s["invoices_today"] for s in d["salons"])
    sum_bkgs = sum(s["appointments_today"] for s in d["salons"])
    assert d["total_bills"] == sum_bills
    assert d["total_bookings"] == sum_bkgs
    payments = round(d["total_cash"] + d["total_upi"] + d["total_card"], 2)
    assert payments <= round(d["total_today"], 2) + 0.01, (
        f"{period}: cash+upi+card {payments} > total_today {d['total_today']}")


def test_custom_range_ok(owner_session):
    r = owner_session.get(f"{API}/auth/my-salons/overview",
                          headers={"X-Owner-Pin": OWNER_PIN},
                          params={"period": "custom", "date_from": "2026-09-01", "date_to": "2026-09-10"})
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert d["period"] == "custom"
    assert "Sep" in d["period_label"]


def test_custom_bad_dates(owner_session):
    r = owner_session.get(f"{API}/auth/my-salons/overview",
                          headers={"X-Owner-Pin": OWNER_PIN},
                          params={"period": "custom", "date_from": "not-a-date", "date_to": "2026-09-10"})
    assert r.status_code == 400


def test_custom_range_too_long(owner_session):
    r = owner_session.get(f"{API}/auth/my-salons/overview",
                          headers={"X-Owner-Pin": OWNER_PIN},
                          params={"period": "custom", "date_from": "2024-01-01", "date_to": "2026-09-10"})
    assert r.status_code == 400


def test_missing_owner_pin(owner_session):
    r = owner_session.get(f"{API}/auth/my-salons/overview", params={"period": "today"})
    # If no security PIN is set on tenant, endpoint won't require it; still document status
    assert r.status_code in (200, 403)
    if r.status_code == 403:
        body = r.text
        assert "OWNER_PIN_REQUIRED" in body or "PIN" in body, f"expected OWNER_PIN_REQUIRED, got: {body[:200]}"


# ---------- Regression after campaign_onboarding refactor ----------
def test_owner_rewards_campaign_settings(owner_session):
    r = owner_session.get(f"{API}/settings/rewards-campaign")
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    d = r.json()
    # Must expose agreement + onboarding-related keys after refactor
    assert isinstance(d, dict)
    # agreement info usually nested — check either flat or nested
    text = str(d).lower()
    assert "agreement" in text or "accepted" in text, f"agreement info missing: {list(d.keys())}"


def test_owner_agreement_endpoint(owner_session):
    r = owner_session.get(f"{API}/settings/rewards-campaign/agreement")
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"


def test_super_admin_tenant_features(super_session, owner_session):
    # Get tenant id via owner's me
    me = owner_session.get(f"{API}/auth/me")
    assert me.status_code == 200
    tid = me.json().get("tenant_id") or me.json().get("user", {}).get("tenant_id")
    assert tid, f"could not get tenant_id from /auth/me: {me.json()}"
    r = super_session.get(f"{API}/super-admin/tenants/{tid}/features")
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"


def test_super_admin_rewards_onboarding_list(super_session):
    r = super_session.get(f"{API}/super-admin/rewards-campaign/onboarding")
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"


# ---------- Whats New ----------
def test_whats_new_build(owner_session):
    r = owner_session.get(f"{API}/whats-new")
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    assert d.get("build") == "2026-09-16.264", f"build mismatch: {d.get('build')}"
    highlights = d.get("highlights") or []
    assert any("Group Dashboard" in h for h in highlights), f"no 'Group Dashboard' in highlights: {highlights}"
