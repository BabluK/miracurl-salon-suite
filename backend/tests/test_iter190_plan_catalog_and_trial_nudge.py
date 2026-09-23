"""Iter-190: configurable plan catalog (create/hide/restore/delete) + USD trial nudge."""
import os
import pytest
import requests
from pathlib import Path
from _creds import pw

def _load_base():
    v = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if v:
        return v.rstrip("/")
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = _load_base()

SA_EMAIL = "admin@miracurl-suite.com"
SA_PASSWORD = pw("SUPER_ADMIN")
INR_EMAIL = "admin@miracurl.com"
INR_PASSWORD = pw("SALON_ADMIN")
INR_SLUG = "miracurl-marathahalli"
USD_EMAIL = "emma.glowaustin@test.com"
USD_PASSWORD = pw("USD_OWNER")
USD_SLUG = "glow-studio-austin"


def _login(email, password, slug=None):
    s = requests.Session()
    headers = {"Content-Type": "application/json"}
    if slug:
        headers["X-Tenant-Slug"] = slug
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, headers=headers)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    csrf = s.cookies.get("csrf_token")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf})
    if slug:
        s.headers.update({"X-Tenant-Slug": slug})
    return s


@pytest.fixture(scope="module")
def sa():
    return _login(SA_EMAIL, SA_PASSWORD)


@pytest.fixture(scope="module")
def inr_owner():
    return _login(INR_EMAIL, INR_PASSWORD, INR_SLUG)


@pytest.fixture(scope="module")
def usd_owner():
    return _login(USD_EMAIL, USD_PASSWORD, USD_SLUG)


# ---------------- Plan create/validation ----------------
class TestPlanCreate:
    def test_create_inr_salon_plan(self, sa):
        r = sa.post(f"{BASE_URL}/api/super-admin/plans", json={
            "label": "QA Quarterly Plan", "price": 7000, "duration_days": 92,
            "branches": 1, "currency": "INR", "vertical": "salon",
            "features": ["All features", "3 months access"]})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["key"] == "qa_quarterly_plan"
        assert data.get("custom") is True
        assert data["price"] == 7000
        # verify on /public/plans
        pub = requests.get(f"{BASE_URL}/api/public/plans").json()
        assert "qa_quarterly_plan" in pub
        assert pub["qa_quarterly_plan"].get("custom") is True
        assert "All features" in pub["qa_quarterly_plan"].get("features", [])

    def test_duplicate_label_gets_suffix(self, sa):
        r = sa.post(f"{BASE_URL}/api/super-admin/plans", json={
            "label": "QA Quarterly Plan", "price": 7000, "duration_days": 92,
            "branches": 1, "currency": "INR", "vertical": "salon"})
        assert r.status_code == 200, r.text
        key = r.json()["key"]
        assert key.startswith("qa_quarterly_plan_") and len(key.split("_")[-1]) == 4
        # cleanup dup
        d = sa.delete(f"{BASE_URL}/api/super-admin/plans/{key}")
        assert d.status_code == 200 and d.json().get("removed") is True

    def test_create_usd_salon_plan(self, sa):
        r = sa.post(f"{BASE_URL}/api/super-admin/plans", json={
            "label": "QA Team Plan", "price": 59, "duration_days": 31,
            "currency": "USD", "vertical": "salon", "tier": "professional"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["key"] == "intl_qa_team_plan"
        assert data.get("currency") == "USD"
        pub = requests.get(f"{BASE_URL}/api/public/plans").json()
        assert pub["intl_qa_team_plan"]["currency"] == "USD"

    def test_create_restaurant_plan(self, sa):
        r = sa.post(f"{BASE_URL}/api/super-admin/plans", json={
            "label": "QA Resto Starter", "price": 3000, "duration_days": 92,
            "currency": "INR", "vertical": "restaurant"})
        assert r.status_code == 200, r.text
        assert r.json()["key"] == "resto_qa_resto_starter"

    def test_validation_price_zero(self, sa):
        r = sa.post(f"{BASE_URL}/api/super-admin/plans", json={
            "label": "QA Zero", "price": 0, "duration_days": 30,
            "currency": "INR", "vertical": "salon"})
        assert r.status_code == 400, r.text

    def test_validation_bad_currency(self, sa):
        r = sa.post(f"{BASE_URL}/api/super-admin/plans", json={
            "label": "QA Euro", "price": 100, "duration_days": 30,
            "currency": "EUR", "vertical": "salon"})
        assert r.status_code == 422, r.text


# ---------------- Hide / restore ----------------
class TestHideRestore:
    def test_hide_builtin(self, sa, inr_owner):
        r = sa.delete(f"{BASE_URL}/api/super-admin/plans/half_year")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("hidden") is True and body.get("removed") is False
        # not in /public/plans
        pub = requests.get(f"{BASE_URL}/api/public/plans").json()
        assert "half_year" not in pub
        # still in super-admin list with hidden:true
        sa_list = sa.get(f"{BASE_URL}/api/super-admin/plans").json()
        hy = next((p for p in sa_list if p["key"] == "half_year"), None)
        assert hy and hy.get("hidden") is True
        # rzp config for owner has no half_year
        cfg = inr_owner.get(f"{BASE_URL}/api/billing/razorpay/config").json()
        assert not any(p["key"] == "half_year" for p in cfg.get("plans", []))
        # order-create with half_year → 400 with 'no longer offered'
        oc = inr_owner.post(f"{BASE_URL}/api/billing/razorpay/order", json={"plan": "half_year"})
        assert oc.status_code == 400
        assert "no longer offered" in oc.text.lower()

    def test_restore_builtin(self, sa):
        r = sa.post(f"{BASE_URL}/api/super-admin/plans/half_year/restore")
        assert r.status_code == 200, r.text
        assert r.json()["price"] == 12000
        pub = requests.get(f"{BASE_URL}/api/public/plans").json()
        assert "half_year" in pub

    def test_delete_unknown_404(self, sa):
        r = sa.delete(f"{BASE_URL}/api/super-admin/plans/nonexistent_xyz")
        assert r.status_code == 404


# ---------------- Cleanup QA custom plans ----------------
class TestCleanup:
    def test_delete_qa_customs(self, sa):
        for key in ("qa_quarterly_plan", "intl_qa_team_plan", "resto_qa_resto_starter"):
            r = sa.delete(f"{BASE_URL}/api/super-admin/plans/{key}")
            assert r.status_code == 200, f"{key}: {r.text}"
            assert r.json().get("removed") is True
        pub = requests.get(f"{BASE_URL}/api/public/plans").json()
        for key in ("qa_quarterly_plan", "intl_qa_team_plan", "resto_qa_resto_starter"):
            assert key not in pub
        # half_year should still be there
        assert "half_year" in pub


# ---------------- Trial nudge ----------------
class TestTrialNudge:
    def test_usd_owner_trial_nudge(self, usd_owner):
        r = usd_owner.get(f"{BASE_URL}/api/tenants/current/trial-nudge")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("show") is True
        assert data.get("recommended") == "premium"
        assert "inventory" in data.get("needs_pro", [])
        assert "reports" in data.get("needs_pro", [])
        assert "receptionist" in data.get("needs_premium", [])

    def test_module_visit_valid(self, usd_owner):
        r = usd_owner.post(f"{BASE_URL}/api/tenants/current/module-visit", json={"module": "pos"})
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_module_visit_invalid(self, usd_owner):
        r = usd_owner.post(f"{BASE_URL}/api/tenants/current/module-visit", json={"module": "bogus"})
        # Either 200 with ok=false, or 422 (pattern-mismatch)
        if r.status_code == 200:
            assert r.json().get("ok") is False
        else:
            assert r.status_code == 422

    def test_inr_owner_no_nudge(self, inr_owner):
        r = inr_owner.get(f"{BASE_URL}/api/tenants/current/trial-nudge")
        assert r.status_code == 200
        assert r.json().get("show") is False
