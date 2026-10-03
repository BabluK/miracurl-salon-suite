"""Iter 212 — DERIVED PRICING, PRICE ALERTS, COMPETITOR WATCH, LEAD HISTORY.

Covers:
- Derived plans (3-month = 3x, annual = 10x) in /api/public/plans
- Super admin PUT: derived keys rejected; monthly updates propagate
- services.plans.DERIVED_PLANS + apply_derived_prices
- email_service._resto_plan_rows + restaurant_trial_reminder_email_html
- /api/super-admin/price-alerts/preview + /sample  (DO NOT /send)
- /api/public/renew/<bad token>  → 404
- /api/super-admin/competitor-watch + /run
- /api/super-admin/mira-leads/history + /{id}/timeline
- Regression: outreach report, auto-wa, tenant upgrade-quote
"""
import os
import sys
import pytest
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")
import requests  # noqa: E402

sys.path.insert(0, "/app/backend")
from _creds import pw  # noqa: E402

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
API = BASE_URL + "/api"


def _login(sess, email, password, slug=None):
    headers = {"Content-Type": "application/json", "Origin": BASE_URL}
    if slug:
        headers["X-Tenant-Slug"] = slug
    r = sess.post(f"{API}/auth/login", json={"email": email, "password": password}, headers=headers)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    csrf = sess.cookies.get("csrf_token")
    assert csrf, "no csrf cookie"
    sess.headers.update({"X-CSRF-Token": csrf, "Origin": BASE_URL})
    if slug:
        sess.headers.update({"X-Tenant-Slug": slug})
    return r


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


# ---------------- (A) DERIVED PRICING ----------------
class TestPublicPlansDerived:
    def test_public_plans_derived_shape(self):
        r = requests.get(f"{API}/public/plans", timeout=15)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        plans = data.get("plans") or data
        # dict keyed by plan id
        if isinstance(plans, list):
            plans = {p["id"]: p for p in plans}
        # No *_half keys
        for k in list(plans.keys()):
            assert not k.endswith("_half"), f"stale half key present: {k}"

        monthly = plans["monthly"]["price"]
        quarter = plans["quarter"]
        annual = plans["annual"]
        assert quarter["price"] == 3 * monthly, (quarter, monthly)
        assert annual["price"] == 10 * monthly, (annual, monthly)
        assert quarter.get("derived_from") == "monthly" and quarter.get("multiplier") == 3
        assert annual.get("derived_from") == "monthly" and annual.get("multiplier") == 10
        assert annual["price"] == 14550, annual

        # Restaurant INR
        rm = plans["resto_monthly"]["price"]
        assert plans["resto_annual"]["price"] == 10 * rm == 10000
        assert plans["resto_annual"].get("derived_from") == "resto_monthly"

        # Restaurant USD
        rim = plans["resto_intl_monthly"]["price"]
        assert plans["resto_intl_quarter"]["price"] == 3 * rim == 135
        assert plans["resto_intl_annual"]["price"] == 10 * rim == 450
        assert plans["resto_intl_quarter"].get("derived_from") == "resto_intl_monthly"
        assert plans["resto_intl_annual"].get("derived_from") == "resto_intl_monthly"

        # Intl pro annual
        ipm = plans["intl_pro_monthly"]["price"]
        assert plans["intl_pro_annual"]["price"] == 10 * ipm == 450
        assert plans["intl_pro_annual"].get("derived_from") == "intl_pro_monthly"

        # pay as you go months
        payg = data.get("pay_as_you_go_months")
        assert payg == [3, 6], payg


class TestSuperAdminPutDerived:
    def test_put_derived_key_rejected(self, super_sess):
        r = super_sess.put(f"{API}/super-admin/plans/annual", json={"price": 99999})
        assert r.status_code == 400, r.text[:300]
        assert "monthly" in r.text.lower()

    def test_put_monthly_propagates_then_restore(self, super_sess):
        try:
            r = super_sess.put(f"{API}/super-admin/plans/monthly", json={"price": 1500})
            assert r.status_code == 200, r.text[:300]
            pub = requests.get(f"{API}/public/plans").json()
            plans = pub.get("plans") or pub
            if isinstance(plans, list):
                plans = {p["id"]: p for p in plans}
            assert plans["monthly"]["price"] == 1500
            assert plans["quarter"]["price"] == 4500
            assert plans["annual"]["price"] == 15000
        finally:
            r2 = super_sess.put(f"{API}/super-admin/plans/monthly", json={"price": 1455})
            assert r2.status_code == 200
            pub = requests.get(f"{API}/public/plans").json()
            plans = pub.get("plans") or pub
            if isinstance(plans, list):
                plans = {p["id"]: p for p in plans}
            assert plans["quarter"]["price"] == 4365
            assert plans["annual"]["price"] == 14550

    def test_put_resto_intl_monthly_propagates_then_restore(self, super_sess):
        try:
            r = super_sess.put(f"{API}/super-admin/plans/resto_intl_monthly", json={"price": 50})
            assert r.status_code == 200, r.text[:300]
            pub = requests.get(f"{API}/public/plans").json()
            plans = pub.get("plans") or pub
            if isinstance(plans, list):
                plans = {p["id"]: p for p in plans}
            assert plans["resto_intl_quarter"]["price"] == 150
            assert plans["resto_intl_annual"]["price"] == 500
        finally:
            r2 = super_sess.put(f"{API}/super-admin/plans/resto_intl_monthly", json={"price": 45})
            assert r2.status_code == 200
            pub = requests.get(f"{API}/public/plans").json()
            plans = pub.get("plans") or pub
            if isinstance(plans, list):
                plans = {p["id"]: p for p in plans}
            assert plans["resto_intl_quarter"]["price"] == 135
            assert plans["resto_intl_annual"]["price"] == 450


class TestUnits:
    def test_apply_derived_prices(self):
        from services.plans import DERIVED_PLANS, apply_derived_prices
        assert "annual" in DERIVED_PLANS and "quarter" in DERIVED_PLANS
        catalog = {"monthly": {"price": 2000, "duration_days": 30}}
        # make sure derived shells exist in a copy before apply
        for k in ("quarter", "annual"):
            catalog.setdefault(k, {"price": 0})
        out = apply_derived_prices(catalog) or catalog
        assert out["quarter"]["price"] == 6000
        assert out["annual"]["price"] == 20000

    def test_resto_plan_rows_and_email(self):
        import email_service
        rows = email_service._resto_plan_rows()
        assert isinstance(rows, str)
        assert "₹1,000" in rows
        assert "₹10,000" in rows
        assert "Monthly" in rows
        assert "Annual" in rows
        assert "12,000" not in rows
        html = email_service.restaurant_trial_reminder_email_html("X", 3, "2026-10-10", "trial", 0)
        assert "₹10,000" in html


# ---------------- (C) PRICE ALERTS ----------------
class TestPriceAlerts:
    def test_preview(self, super_sess):
        r = super_sess.get(f"{API}/super-admin/price-alerts/preview")
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "campaign" in data and "rows" in data
        assert "pending" in data and "already_sent" in data
        for row in data["rows"]:
            assert row.get("annual_key", "").endswith("_annual"), row
            assert "new_monthly" in row and "new_annual" in row
            expected = row["new_monthly"] * 12 - row["new_annual"]
            assert abs(row.get("annual_saving", 0) - expected) <= 0.01, row

    def test_sample(self, super_sess):
        r = super_sess.get(f"{API}/super-admin/price-alerts/sample")
        assert r.status_code in (200, 404), r.text[:300]
        if r.status_code == 200:
            text = r.text
            assert "Switch to annual" in text or "annual" in text.lower()

    def test_renew_bad_token_404(self):
        r = requests.get(f"{API}/public/renew/not-a-token", allow_redirects=False)
        assert r.status_code == 404, (r.status_code, r.text[:200])


# ---------------- (D) COMPETITOR WATCH ----------------
class TestCompetitorWatch:
    def test_get(self, super_sess):
        r = super_sess.get(f"{API}/super-admin/competitor-watch")
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        rows = data.get("rows") or data.get("competitors") or []
        assert len(rows) >= 6, f"expected 6 competitors, got {len(rows)}"

    def test_run(self, super_sess):
        r = super_sess.post(f"{API}/super-admin/competitor-watch/run", timeout=90)
        assert r.status_code == 200, r.text[:400]
        data = r.json()
        verdicts = data.get("verdicts") or {}
        assert verdicts.get("salon", {}).get("our_monthly") == 19, verdicts
        assert verdicts.get("restaurant", {}).get("our_monthly") == 45, verdicts
        rows = data.get("rows") or []
        for row in rows:
            lm = row.get("lowest_monthly")
            if lm is None:
                continue
            assert lm >= 9, row
            src = row.get("source")
            assert src in ("live", "benchmark"), row
            bench = row.get("benchmark") or row.get("benchmark_monthly")
            if bench:
                assert lm >= 0.5 * bench, row


# ---------------- (E) LEAD HISTORY ----------------
class TestLeadHistory:
    def test_history_shape(self, super_sess):
        r = super_sess.get(f"{API}/super-admin/mira-leads/history")
        assert r.status_code == 200, r.text[:400]
        data = r.json()
        assert data.get("stale_days") == 15
        total = data["total"]
        verts = data["verticals"]
        assert verts["salon"]["total"] + verts["restaurant"]["total"] == total
        for v in ("salon", "restaurant"):
            node = verts[v]
            assert "label" in node and "countries" in node
            for c in node["countries"]:
                assert len(c["code"]) in (2, 3)
                for k in ("total", "found", "pitched", "replied", "demo", "customers", "stale"):
                    assert c.get(k, 0) >= 0, (v, c)
        for s in data.get("stale", []):
            assert s.get("days_silent", 0) >= 15, s

    def test_timeline(self, super_sess):
        r = super_sess.get(f"{API}/super-admin/mira-leads")
        assert r.status_code == 200, r.text[:300]
        js = r.json()
        if isinstance(js, list):
            leads = js
        else:
            leads = js.get("leads") or js.get("rows") or []
        assert leads, "no leads to pick"
        lid = leads[0].get("id") or leads[0].get("_id")
        assert lid
        r2 = super_sess.get(f"{API}/super-admin/mira-leads/{lid}/timeline")
        assert r2.status_code == 200, r2.text[:300]
        events = r2.json().get("events") or []
        assert events, "empty timeline"
        ats = [e.get("at") for e in events]
        assert ats == sorted(ats), "not ascending"
        assert str(events[0].get("label", "")).startswith("🔎"), events[0]


# ---------------- REGRESSION ----------------
class TestRegression:
    def test_outreach_report(self, super_sess):
        r = super_sess.get(f"{API}/super-admin/mira/outreach/report?vertical=salon&days=7")
        assert r.status_code == 200, r.text[:300]

    def test_auto_wa(self, super_sess):
        r = super_sess.get(f"{API}/super-admin/mira-leads/auto-wa")
        assert r.status_code == 200, r.text[:300]

    def test_tenant_upgrade_quote(self, tenant_sess):
        r = tenant_sess.get(f"{API}/billing/upgrade-quote?plan=annual")
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data.get("eligible") is True, data
        assert data.get("new_price") == 14550, data
