"""Iter 202 — PLANS v2 (hide 6-month), mid-term upgrade quote/order, Mira reply inbox."""
import os
import pytest
import requests
from _creds import pw

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
API = BASE_URL + "/api"

SUPER_EMAIL = "admin@miracurl-suite.com"
SUPER_PASS = pw("SUPER_ADMIN")
TENANT_EMAIL = "admin@miracurl.com"
TENANT_PASS = "q6QY@tn3p#9DtL"
TENANT_SLUG = "miracurl-marathahalli"

HIDDEN_KEYS = ["half_year", "two_branch_half", "three_branch_half", "multi_branch_half", "resto_half", "resto_intl_half"]


def _login(sess, email, password, slug=None):
    headers = {"Content-Type": "application/json", "Origin": BASE_URL}
    if slug:
        headers["X-Tenant-Slug"] = slug
    r = sess.post(f"{API}/auth/login", json={"email": email, "password": password}, headers=headers)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    csrf = sess.cookies.get("csrf_token")
    assert csrf, "csrf_token cookie missing"
    sess.headers.update({"X-CSRF-Token": csrf, "Origin": BASE_URL})
    if slug:
        sess.headers.update({"X-Tenant-Slug": slug})
    return csrf


@pytest.fixture(scope="module")
def super_sess():
    s = requests.Session()
    _login(s, SUPER_EMAIL, SUPER_PASS)
    return s


@pytest.fixture(scope="module")
def tenant_sess():
    s = requests.Session()
    _login(s, TENANT_EMAIL, TENANT_PASS, slug=TENANT_SLUG)
    return s


# ============ PLANS v2 public catalog ============
class TestPublicPlans:
    def test_public_plans_hides_six_month(self):
        r = requests.get(f"{API}/public/plans")
        assert r.status_code == 200
        data = r.json()
        # New INR plans present
        assert "monthly" in data
        assert data["monthly"]["price"] == 1455.0
        assert data["monthly"]["duration_days"] == 31
        assert "quarter" in data
        assert data["quarter"]["price"] == 4365.0
        assert data["quarter"]["duration_days"] == 92
        assert "annual" in data
        assert data["annual"]["price"] == 14550.0
        assert data["annual"].get("highlight") is True
        assert "1 month free" in data["annual"]["label"].lower(), f"annual label: {data['annual']['label']}"
        assert "resto_monthly" in data and data["resto_monthly"]["price"] == 1000.0
        assert "resto_intl_monthly" in data and data["resto_intl_monthly"]["price"] == 45.0
        # 6-month plans MUST be hidden
        for k in HIDDEN_KEYS:
            assert k not in data, f"hidden plan '{k}' leaked into /public/plans"


# ============ Super-admin catalog no longer lists removed 6-month plans ============
class TestSuperAdminCatalogRemoved:
    def test_super_admin_plans_exclude_removed(self, super_sess):
        r = super_sess.get(f"{BASE_URL}/api/super-admin/plans", timeout=30)
        assert r.status_code == 200, r.text[:300]
        keys = {p["key"] for p in r.json()}
        for k in HIDDEN_KEYS:
            assert k not in keys, f"removed plan '{k}' still listed in HQ catalog"


# ============ Upgrade quote ============
class TestUpgradeQuote:
    def test_quote_annual_eligible(self, tenant_sess):
        r = tenant_sess.get(f"{API}/billing/upgrade-quote?plan=annual")
        assert r.status_code == 200
        q = r.json()
        assert q["eligible"] is True, f"quote: {q}"
        assert q["from_plan"] == "half_year"
        assert q["credit"] > 0
        assert q["new_price"] == 14550.0
        assert q["amount_due"] == round(14550.0 - q["credit"], 2)
        assert "new_end_date" in q

    def test_quote_downgrade_monthly_ineligible(self, tenant_sess):
        r = tenant_sess.get(f"{API}/billing/upgrade-quote?plan=monthly")
        assert r.status_code == 200
        q = r.json()
        assert q["eligible"] is False
        assert q.get("reason")

    def test_quote_currency_mismatch(self, tenant_sess):
        r = tenant_sess.get(f"{API}/billing/upgrade-quote?plan=intl_pro_annual")
        assert r.status_code == 200
        q = r.json()
        assert q["eligible"] is False

    def test_quote_unknown_plan_400(self, tenant_sess):
        r = tenant_sess.get(f"{API}/billing/upgrade-quote?plan=nope_xyz")
        assert r.status_code == 400


# ============ Razorpay order — upgrade flag ============
class TestRzpOrderUpgrade:
    def test_order_monthly_upgrade_400(self, tenant_sess):
        r = tenant_sess.post(f"{API}/billing/razorpay/order", json={"plan": "monthly", "upgrade": True})
        assert r.status_code == 400, f"{r.status_code} {r.text[:200]}"

    def test_order_annual_upgrade_200(self, tenant_sess):
        # get quote first for expected math
        q = tenant_sess.get(f"{API}/billing/upgrade-quote?plan=annual").json()
        assert q["eligible"] is True
        r = tenant_sess.post(f"{API}/billing/razorpay/order", json={"plan": "annual", "upgrade": True})
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        data = r.json()
        assert data.get("upgrade", {}).get("eligible") is True
        expected_payable = round((14550.0 - q["credit"]) * 1.18, 2)
        # small tolerance for rounding
        assert abs(float(data["payable"]) - expected_payable) < 1.0, f"payable {data['payable']} vs expected {expected_payable}"

    def test_order_hidden_plan_400(self, tenant_sess):
        r = tenant_sess.post(f"{API}/billing/razorpay/order", json={"plan": "half_year"})
        assert r.status_code == 400
        assert "no longer offered" in r.text.lower() or "unknown" in r.text.lower()


# ============ Mira reply inbox ============
class TestMiraReplies:
    def test_replies_shape(self, super_sess):
        r = super_sess.get(f"{API}/super-admin/mira/replies")
        assert r.status_code == 200
        data = r.json()
        assert "count" in data and "awaiting" in data and "replies" in data
        assert isinstance(data["replies"], list)
        if data["replies"]:
            row = data["replies"][0]
            assert "channel" in row
            assert "reply_text" in row
            assert "replied_at" in row or "last_reply_at" in row

    def test_draft_demo_reply(self, super_sess):
        r = super_sess.post(f"{API}/super-admin/mira-leads/qa-reply-test1/draft-demo-reply", json={})
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        data = r.json()
        assert "subject" in data and "body" in data
        assert "miracurl-suite.com/demo" in data["body"], f"body missing demo url: {data['body'][:300]}"

    def test_replies_anonymous_forbidden(self):
        r = requests.get(f"{API}/super-admin/mira/replies")
        assert r.status_code in (401, 403)

    def test_draft_anonymous_forbidden(self):
        r = requests.post(f"{API}/super-admin/mira-leads/qa-reply-test1/draft-demo-reply", json={})
        assert r.status_code in (401, 403)

    def test_replies_tenant_forbidden(self, tenant_sess):
        r = tenant_sess.get(f"{API}/super-admin/mira/replies")
        assert r.status_code in (401, 403)

    def test_draft_tenant_forbidden(self, tenant_sess):
        r = tenant_sess.post(f"{API}/super-admin/mira-leads/qa-reply-test1/draft-demo-reply", json={})
        assert r.status_code in (401, 403)
