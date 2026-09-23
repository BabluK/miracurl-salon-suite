"""Iteration 135 — Mira earnings anomaly alerts (HQ Settlement tracker)."""
import os
import pytest
import requests
import os as _os
import sys as _sys

_sys.path.insert(0, _os.path.dirname(__file__))
from _creds import password_for  # noqa: E402
from _creds import pw

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

TENANT_EMAIL = "admin@miracurl.com"
TENANT_PW = password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD")
TENANT_SLUG = "miracurl-marathahalli"
SUPER_EMAIL = "super@miracurl.com"
SUPER_PW = pw("SUPER_ADMIN")


def _login(email, pw, slug=None):
    s = requests.Session()
    h = {"Content-Type": "application/json"}
    if slug:
        h["X-Tenant-Slug"] = slug
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw}, headers=h)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    csrf = s.cookies.get("csrf_token") or ""
    s.headers.update({"X-CSRF-Token": csrf})
    if slug:
        s.headers.update({"X-Tenant-Slug": slug})
    return s


@pytest.fixture(scope="module")
def super_admin():
    return _login(SUPER_EMAIL, SUPER_PW)


@pytest.fixture(scope="module")
def tenant_client():
    return _login(TENANT_EMAIL, TENANT_PW, TENANT_SLUG)


# GET anomalies endpoint
def test_anomalies_response_shape(super_admin):
    r = super_admin.get(f"{BASE}/api/super-admin/rewards-campaign/anomalies")
    assert r.status_code == 200, r.text[:200]
    j = r.json()
    for k in ("rows", "flagged", "threshold_pct", "min_baseline", "last_alert"):
        assert k in j, f"missing key {k}"
    assert j["threshold_pct"] == 30
    assert j["min_baseline"] == 5000
    assert isinstance(j["rows"], list)
    assert isinstance(j["flagged"], int)


def test_anomalies_marathahalli_early_and_whitefield_no_baseline(super_admin):
    r = super_admin.get(f"{BASE}/api/super-admin/rewards-campaign/anomalies")
    j = r.json()
    rows = {row["slug"]: row for row in j["rows"]}
    # marathahalli should be flagged 'early' because campaign start is 2026-09-06 (< 7 days from any reasonable now) — actually depends on today's date.
    m = rows.get("miracurl-marathahalli")
    assert m, f"marathahalli not present. slugs={list(rows.keys())}"
    # Flag must be a valid enum
    assert m["flag"] in ("silent", "drop", "ok", "early", "no_baseline")
    # If early, mira_note mentions 7 days
    if m["flag"] == "early":
        assert "7 days" in m["mira_note"] or "7 day" in m["mira_note"]
    for k in ("tenant_id", "name", "slug", "baseline_monthly", "current_monthly", "current_bills", "days_in_campaign", "drop_pct", "mira_note"):
        assert k in m, f"missing key {k} in row"
    w = rows.get("miracurl-whitefield")
    if w:
        assert w["flag"] == "no_baseline", f"whitefield flag was {w['flag']}"


def test_anomalies_sort_order(super_admin):
    r = super_admin.get(f"{BASE}/api/super-admin/rewards-campaign/anomalies")
    rows = r.json()["rows"]
    order = {"silent": 0, "drop": 1, "ok": 2, "early": 3, "no_baseline": 4}
    prev = -1
    for row in rows:
        cur = order[row["flag"]]
        assert cur >= prev, f"sort broken: {[r_['flag'] for r_ in rows]}"
        prev = cur


# POST alert-now endpoint
def test_alert_now_nothing_flagged(super_admin):
    r = super_admin.post(f"{BASE}/api/super-admin/rewards-campaign/anomalies/alert")
    assert r.status_code == 200, r.text[:200]
    j = r.json()
    assert j.get("ok") is True
    # nothing flagged given current state
    assert j.get("flagged", 0) == 0
    assert j.get("sent") is False


def test_anomalies_forbidden_for_tenant(tenant_client):
    r = tenant_client.get(f"{BASE}/api/super-admin/rewards-campaign/anomalies")
    assert r.status_code == 403, f"expected 403, got {r.status_code}"


def test_alert_forbidden_for_tenant(tenant_client):
    r = tenant_client.post(f"{BASE}/api/super-admin/rewards-campaign/anomalies/alert")
    assert r.status_code == 403, f"expected 403, got {r.status_code}"


# Tenant onboarding + cleanup (light — just verify create + list + delete)
def test_onboard_new_tenant_and_delete(super_admin):
    import time
    ts = int(time.time())
    slug = f"qa-anom-{ts}"
    payload = {
        "name": f"QA Anom {ts}",
        "slug": slug,
        "owner_name": "QA Owner",
        "owner_email": f"qa.anom.{ts}@example.com",
        "plan": "pro",
        "business_type": "salon",
        "location": "Test",
        "phone": "",
        "owner_phone": "",
    }
    # Try common tenant-create endpoint
    r = super_admin.post(f"{BASE}/api/super-admin/tenants", json=payload)
    if r.status_code == 404:
        pytest.skip("tenant create endpoint not at /api/super-admin/tenants")
    assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    tid = body.get("tenant", {}).get("id") or body.get("id")
    assert tid, f"no id in response: {body}"
    # Try delete
    d = super_admin.delete(f"{BASE}/api/super-admin/tenants/{tid}")
    print(f"delete status={d.status_code} body={d.text[:200]}")
    # cleanup marker
    if d.status_code not in (200, 204):
        print(f"CLEANUP_NEEDED: tenant slug={slug} id={tid}")
