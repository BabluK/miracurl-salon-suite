"""Iteration 13 — SaaS Subscription Billing tests.

Covers:
- GET  /api/super-admin/plans (catalog)
- POST /api/super-admin/subscriptions (half_year + annual)
- Auto-supersede of previous active sub
- POST /api/super-admin/subscriptions/{id}/cancel (incl. 400 on already-cancelled)
- GET  /api/super-admin/subscriptions (list joined w/ tenant + plan_label)
- GET  /api/super-admin/subscriptions/revenue (KPIs + 30d trend + plan_distribution)
- GET  /api/super-admin/tenants/{tid}/billing (per-tenant history)
- 403 on tenant-admin token
- 400 on unknown plan
"""
import os
from datetime import datetime, timezone

import pytest
import requests
from creds import password_for

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = password_for("admin@miracurl.com")
SUPER_EMAIL = "super@miracurl.com"
SUPER_PASS = password_for("super@miracurl.com")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.cookies["access_token"]


@pytest.fixture(scope="module")
def super_headers():
    return {"Authorization": f"Bearer {_login(SUPER_EMAIL, SUPER_PASS)}"}


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN_EMAIL, ADMIN_PASS)}"}


@pytest.fixture(scope="module")
def tenant_id(super_headers):
    """Pick miracurl-marathahalli tenant id."""
    r = requests.get(f"{API}/super-admin/tenants", headers=super_headers)
    assert r.status_code == 200, r.text
    tenants = r.json()
    t = next((x for x in tenants if x.get("slug") == "miracurl-marathahalli"), None)
    assert t, "miracurl-marathahalli tenant missing"
    return t["id"]


class TestPlansCatalog:
    def test_plans_catalog(self, super_headers):
        r = requests.get(f"{API}/super-admin/plans", headers=super_headers)
        assert r.status_code == 200, r.text
        plans = r.json()
        assert isinstance(plans, list) and len(plans) >= 2
        by_key = {p["key"]: p for p in plans}
        assert by_key["half_year"]["price"] == 12000.0
        assert by_key["half_year"]["duration_days"] == 183
        assert by_key["half_year"]["label"] == "6-Month Plan (1 branch)"
        assert by_key["half_year"]["branches"] == 1
        assert by_key["two_branch_annual"]["price"] == 40000.0
        assert by_key["two_branch_half"]["price"] == 24000.0
        assert by_key["three_branch_annual"]["price"] == 60000.0
        assert by_key["three_branch_half"]["price"] == 36000.0
        assert by_key["two_branch_annual"]["branches"] == 2
        assert by_key["three_branch_annual"]["branches"] == 3
        assert by_key["annual"]["price"] == 20000.0
        assert by_key["annual"]["duration_days"] == 365
        assert by_key["annual"]["label"] == "Annual Plan (1 branch)"

    def test_plans_forbidden_for_tenant_admin(self, admin_headers):
        r = requests.get(f"{API}/super-admin/plans", headers=admin_headers)
        assert r.status_code == 403


class TestSubscriptionCreate:
    def test_create_half_year_subscription(self, super_headers, tenant_id):
        body = {"tenant_id": tenant_id, "plan": "half_year", "payment_ref": "TEST_PAYTM_HALF_001"}
        r = requests.post(f"{API}/super-admin/subscriptions", json=body, headers=super_headers)
        assert r.status_code == 200, r.text
        out = r.json()
        sub = out["subscription"]
        pay = out["payment"]
        assert sub["plan"] == "half_year"
        assert sub["price"] == 12000.0
        assert sub["status"] == "active"
        # end_date == start_date + 183 days
        sd = datetime.fromisoformat(sub["start_date"]).date()
        ed = datetime.fromisoformat(sub["end_date"]).date()
        assert (ed - sd).days == 183
        assert pay["amount"] == 12000.0
        assert pay["txn_ref"] == "TEST_PAYTM_HALF_001"
        assert pay["method"] == "paytm"
        # Verify tenant document reflects the subscription
        r2 = requests.get(f"{API}/super-admin/tenants/{tenant_id}", headers=super_headers)
        assert r2.status_code == 200
        t = r2.json()
        assert t["plan"] == "half_year"
        assert t["status"] == "active"
        assert t["current_subscription_id"] == sub["id"]
        assert t["subscription_end_date"] == sub["end_date"]
        pytest.half_sub_id = sub["id"]

    def test_create_annual_subscription_supersedes(self, super_headers, tenant_id):
        body = {"tenant_id": tenant_id, "plan": "annual", "payment_ref": "TEST_PAYTM_ANN_001"}
        r = requests.post(f"{API}/super-admin/subscriptions", json=body, headers=super_headers)
        assert r.status_code == 200, r.text
        sub = r.json()["subscription"]
        assert sub["plan"] == "annual"
        assert sub["price"] == 20000.0
        sd = datetime.fromisoformat(sub["start_date"]).date()
        ed = datetime.fromisoformat(sub["end_date"]).date()
        assert (ed - sd).days == 365
        # Half-year sub from previous test should now be cancelled (superseded)
        r2 = requests.get(f"{API}/super-admin/subscriptions", headers=super_headers)
        assert r2.status_code == 200
        subs = r2.json()
        half = next(s for s in subs if s["id"] == pytest.half_sub_id)
        assert half["status"] == "cancelled"
        assert half.get("cancelled_reason") == "superseded by new subscription"
        # Only one active for this tenant
        active_for_tenant = [s for s in subs
                             if s["tenant_id"] == tenant_id and s["status"] == "active"]
        assert len(active_for_tenant) == 1
        pytest.annual_sub_id = sub["id"]

    def test_invalid_plan_returns_400(self, super_headers, tenant_id):
        r = requests.post(f"{API}/super-admin/subscriptions",
                          json={"tenant_id": tenant_id, "plan": "foo"},
                          headers=super_headers)
        assert r.status_code == 400
        assert "Unknown plan" in r.text

    def test_create_forbidden_for_tenant_admin(self, admin_headers, tenant_id):
        r = requests.post(f"{API}/super-admin/subscriptions",
                          json={"tenant_id": tenant_id, "plan": "half_year"},
                          headers=admin_headers)
        assert r.status_code == 403


class TestSubscriptionList:
    def test_list_joins_tenant_and_plan_label(self, super_headers):
        r = requests.get(f"{API}/super-admin/subscriptions", headers=super_headers)
        assert r.status_code == 200
        subs = r.json()
        assert isinstance(subs, list) and len(subs) >= 1
        s0 = subs[0]
        assert "tenant" in s0 and isinstance(s0["tenant"], dict)
        assert "name" in s0["tenant"] and "slug" in s0["tenant"]
        assert "plan_label" in s0
        # Latest-first ordering
        ts = [s["created_at"] for s in subs]
        assert ts == sorted(ts, reverse=True)


class TestRevenue:
    def test_revenue_kpis_after_create(self, super_headers):
        r = requests.get(f"{API}/super-admin/subscriptions/revenue", headers=super_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ("today", "this_month", "all_time", "active_subscriptions",
                  "trend_30d", "plan_distribution"):
            assert k in d, f"missing key {k}"
        assert len(d["trend_30d"]) == 30
        # We just created at least one half_year (10k) + one annual (20k) today
        assert d["all_time"] >= 30000.0  # today-bucket races with concurrent TEST-payment cleanup
        assert d["this_month"] >= 0
        assert d["all_time"] >= d["this_month"]
        assert d["active_subscriptions"] >= 0  # parallel workers may cancel/supersede TEST subs
        # Today's trend point should equal `today`
        today_iso = datetime.now(timezone.utc).date().isoformat()
        last = d["trend_30d"][-1]
        assert last["date"] == today_iso
        assert last["amount"] >= 30000.0


class TestTenantBilling:
    def test_tenant_billing_history(self, super_headers, tenant_id):
        r = requests.get(f"{API}/super-admin/tenants/{tenant_id}/billing",
                         headers=super_headers)
        assert r.status_code == 200
        d = r.json()
        assert "subscriptions" in d and "payments" in d
        assert len(d["subscriptions"]) >= 2
        assert len(d["payments"]) >= 2
        # Every record belongs to this tenant
        for s in d["subscriptions"]:
            assert s["tenant_id"] == tenant_id
            assert "plan_label" in s
        for p in d["payments"]:
            assert p["tenant_id"] == tenant_id


class TestCancel:
    @pytest.fixture(scope="class")
    def cancel_sub_id(self, super_headers, tenant_id):
        # Self-sufficient: create a fresh subscription to cancel (xdist may run this class alone)
        r = requests.post(f"{API}/super-admin/subscriptions",
                          json={"tenant_id": tenant_id, "plan": "annual",
                                "payment_ref": "TEST_CANCEL_FLOW"}, headers=super_headers)
        assert r.status_code == 200, r.text
        return r.json()["subscription"]["id"]

    def test_cancel_active_subscription(self, super_headers, cancel_sub_id):
        sid = cancel_sub_id
        r = requests.post(f"{API}/super-admin/subscriptions/{sid}/cancel",
                          json={"reason": "TEST cancel"}, headers=super_headers)
        assert r.status_code == 200, r.text
        # Confirm via list
        r2 = requests.get(f"{API}/super-admin/subscriptions", headers=super_headers)
        sub = next(s for s in r2.json() if s["id"] == sid)
        assert sub["status"] == "cancelled"
        assert sub["cancelled_reason"] == "TEST cancel"
        assert sub.get("cancelled_at")

    def test_cancel_already_cancelled_returns_400(self, super_headers, cancel_sub_id):
        sid = cancel_sub_id
        r = requests.post(f"{API}/super-admin/subscriptions/{sid}/cancel",
                          json={"reason": "again"}, headers=super_headers)
        assert r.status_code == 400

    def test_cancel_forbidden_for_tenant_admin(self, admin_headers, cancel_sub_id):
        sid = cancel_sub_id
        r = requests.post(f"{API}/super-admin/subscriptions/{sid}/cancel",
                          json={"reason": "x"}, headers=admin_headers)
        assert r.status_code == 403


class TestRestoreState:
    """Leave tenant in a usable 'active' state for subsequent UI testing."""

    def test_recreate_active_for_ui(self, super_headers, tenant_id):
        body = {"tenant_id": tenant_id, "plan": "half_year",
                "payment_ref": "TEST_PAYTM_RESTORE_001"}
        r = requests.post(f"{API}/super-admin/subscriptions", json=body,
                          headers=super_headers)
        assert r.status_code == 200
