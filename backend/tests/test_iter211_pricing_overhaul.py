"""Iter 211 — PRICING OVERHAUL: no *_half keys, USD defaults, delete/restore permanence, RETIRED_PLANS compat."""
import os
import sys
import pytest
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
import requests
from _creds import pw

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
API = BASE_URL + "/api"
sys.path.insert(0, "/app/backend")

HALF_KEYS = ["half_year", "two_branch_half", "three_branch_half", "multi_branch_half", "resto_half", "resto_intl_half"]

USD_EXPECTED = {
    "intl_starter_monthly": 19, "intl_starter_annual": 190,
    "intl_pro_monthly": 45, "intl_pro_annual": 450,
    "intl_premium_monthly": 139, "intl_premium_annual": 1390,
    "intl_enterprise_monthly": 399,
    "resto_intl_monthly": 45, "resto_intl_quarter": 135, "resto_intl_annual": 450,
}
INR_EXPECTED = {
    "monthly": 1455, "quarter": 4365, "annual": 14550,
    "resto_monthly": 1000, "resto_quarter": 3000, "resto_annual": 10000,
}


def _login(sess, email, password, slug=None):
    headers = {"Content-Type": "application/json", "Origin": BASE_URL}
    if slug:
        headers["X-Tenant-Slug"] = slug
    r = sess.post(f"{API}/auth/login", json={"email": email, "password": password}, headers=headers)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    csrf = sess.cookies.get("csrf_token")
    assert csrf
    sess.headers.update({"X-CSRF-Token": csrf, "Origin": BASE_URL})
    if slug:
        sess.headers.update({"X-Tenant-Slug": slug})


@pytest.fixture(scope="module")
def super_sess():
    s = requests.Session()
    _login(s, "admin@miracurl-suite.com", pw("SUPER_ADMIN"))
    return s


@pytest.fixture(scope="module")
def tenant_sess():
    s = requests.Session()
    _login(s, "admin@miracurl.com", pw("SALON_ADMIN"), slug="miracurl-marathahalli")
    return s


# ===== Public plan catalog =====
class TestPublicPlans:
    def test_no_half_keys(self):
        r = requests.get(f"{API}/public/plans", timeout=15)
        assert r.status_code == 200
        data = r.json()
        for k in HALF_KEYS:
            assert k not in data, f"retired half key {k} leaked"

    def test_usd_prices(self):
        data = requests.get(f"{API}/public/plans", timeout=15).json()
        for k, p in USD_EXPECTED.items():
            assert k in data, f"missing {k}"
            assert float(data[k]["price"]) == float(p), f"{k} price {data[k]['price']} != {p}"

    def test_inr_prices(self):
        data = requests.get(f"{API}/public/plans", timeout=15).json()
        for k, p in INR_EXPECTED.items():
            assert k in data, f"missing {k}"
            assert float(data[k]["price"]) == float(p), f"{k} price {data[k]['price']} != {p}"

    def test_highlights_and_trial(self):
        data = requests.get(f"{API}/public/plans", timeout=15).json()
        assert data["intl_pro_annual"].get("highlight") is True
        assert data["resto_intl_annual"].get("highlight") is True
        # trial_days somewhere — top-level or per-plan
        has_trial = ("trial_days" in data) or any("trial_days" in v for v in data.values() if isinstance(v, dict))
        assert has_trial, "no trial_days found in /public/plans"


# ===== Super-admin catalog =====
class TestSuperAdminCatalog:
    def test_lists_19_no_half_no_hidden(self, super_sess):
        r = super_sess.get(f"{API}/super-admin/plans", timeout=20)
        assert r.status_code == 200, r.text[:300]
        plans = r.json()
        keys = {p["key"] for p in plans}
        for k in HALF_KEYS:
            assert k not in keys, f"HQ catalog still contains {k}"
        # count is expected to be 19
        assert len(plans) == 19, f"expected 19 plans, got {len(plans)}: {sorted(keys)}"
        for p in plans:
            assert not p.get("hidden"), f"plan {p['key']} has hidden:true"

    def test_update_price_live(self, super_sess):
        # change intl_starter_monthly to 21, verify public, restore to 19
        try:
            r = super_sess.put(f"{API}/super-admin/plans/intl_starter_monthly", json={"price": 21}, timeout=20)
            assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text[:200]}"
            pub = requests.get(f"{API}/public/plans").json()
            assert float(pub["intl_starter_monthly"]["price"]) == 21.0, pub["intl_starter_monthly"]
        finally:
            rb = super_sess.put(f"{API}/super-admin/plans/intl_starter_monthly", json={"price": 19}, timeout=20)
            assert rb.status_code == 200
            pub = requests.get(f"{API}/public/plans").json()
            assert float(pub["intl_starter_monthly"]["price"]) == 19.0

    def test_delete_and_restore_enterprise(self, super_sess):
        restored = False
        try:
            r = super_sess.delete(f"{API}/super-admin/plans/intl_enterprise_monthly", timeout=20)
            assert r.status_code == 200, f"DELETE failed: {r.status_code} {r.text[:200]}"
            j = r.json()
            assert j.get("ok") is True
            assert j.get("removed") is True
            # should be gone from both
            pub = requests.get(f"{API}/public/plans").json()
            assert "intl_enterprise_monthly" not in pub
            hq = super_sess.get(f"{API}/super-admin/plans").json()
            keys = {p["key"] for p in hq}
            assert "intl_enterprise_monthly" not in keys
        finally:
            rr = super_sess.post(f"{API}/super-admin/plans/intl_enterprise_monthly/restore", timeout=20)
            assert rr.status_code == 200, f"RESTORE failed: {rr.status_code} {rr.text[:300]}"
            restored = True
            pub = requests.get(f"{API}/public/plans").json()
            assert "intl_enterprise_monthly" in pub
            assert float(pub["intl_enterprise_monthly"]["price"]) == 399.0
        assert restored

    def test_delete_unknown_404(self, super_sess):
        r = super_sess.delete(f"{API}/super-admin/plans/no_such_plan_xyz", timeout=20)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"


# ===== Backend unit imports =====
class TestServiceUnits:
    def test_plan_info_retired(self):
        from services.plans import plan_info, RETIRED_PLANS, PLAN_CATALOG  # noqa
        info = plan_info("half_year")
        assert isinstance(info, dict) and info, f"empty plan_info: {info}"
        assert float(info.get("price", 0)) == 12000.0
        assert int(info.get("duration_days", 0)) == 183

    def test_plan_info_live(self):
        from services.plans import plan_info
        info = plan_info("annual")
        assert isinstance(info, dict) and info.get("price")

    def test_plan_info_unknown(self):
        from services.plans import plan_info
        assert plan_info("nope_xyz") == {}

    def test_plan_label(self):
        from services.subscription_common import plan_label
        lbl = plan_label("resto_half")
        assert "6-Month" in lbl or "6 Month" in lbl.lower().replace("-", " ").title() or "6-month" in lbl.lower()
        assert "Restaurant" in lbl or "restaurant" in lbl.lower()
        assert "Annual" in plan_label("annual") or "annual" in plan_label("annual").lower()

    def test_tenant_tier_usd_retired(self):
        from services.entitlements import tenant_tier
        # must not raise
        tier = tenant_tier({"currency": "USD", "plan": "resto_intl_half"})
        assert tier is not None


# ===== Upgrade quote for retired plan =====
class TestUpgradeQuoteRetired:
    def test_annual_eligible_from_half_year(self, tenant_sess):
        r = tenant_sess.get(f"{API}/billing/upgrade-quote?plan=annual", timeout=20)
        assert r.status_code == 200, r.text[:200]
        q = r.json()
        assert q.get("eligible") is True, f"not eligible: {q}"
        # Must not have 'Current plan is unknown' error
        reason = (q.get("reason") or "").lower()
        assert "unknown" not in reason


# ===== Regression =====
class TestRegression:
    def test_mira_leads_auto_wa(self, super_sess):
        r = super_sess.get(f"{API}/super-admin/mira-leads/auto-wa", timeout=20)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
