"""Iter 223 - /api/bootstrap endpoint tests (user + tenant + dashboard in one call)."""
import os
import requests
import pytest
from tests._creds import pw

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")

ADMIN = ("admin@miracurl.com", pw("SALON_ADMIN"), "miracurl-marathahalli")
MANAGER = ("manager@miracurl.com", pw("MANAGER"), "miracurl-marathahalli")
SUPER = ("admin@miracurl-suite.com", pw("SUPER_ADMIN"), None)
OWNER2 = ("owner@elegance.com", pw("ELEGANCE_OWNER"), "elegance-koramangala")


def _login(email, password, slug):
    s = requests.Session()
    # Prime CSRF
    s.get(f"{BASE_URL}/api/csrf/token", headers={"X-Tenant-Slug": slug} if slug else {})
    csrf = s.cookies.get("csrf_token")
    headers = {"X-CSRF-Token": csrf or ""}
    if slug:
        headers["X-Tenant-Slug"] = slug
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, headers=headers)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text[:200]}"
    return s


def _hdr(slug):
    return {"X-Tenant-Slug": slug} if slug else {}


# ------- Unauthenticated -------
def test_bootstrap_unauth_401():
    r = requests.get(f"{BASE_URL}/api/bootstrap")
    assert r.status_code == 401, f"expected 401 got {r.status_code}"


# ------- Salon admin -------
class TestSalonAdmin:
    @pytest.fixture(scope="class")
    def sess(self):
        return _login(*ADMIN)

    def test_bootstrap_no_dash(self, sess):
        r = sess.get(f"{BASE_URL}/api/bootstrap", headers=_hdr(ADMIN[2]))
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "user" in data and "tenant" in data and "dashboard" in data
        assert data["dashboard"] is None
        assert data["user"]["email"] == ADMIN[0]
        assert data["user"].get("role") == "admin"
        assert data["tenant"] is not None
        # tenant shape should include features/entitlements like /tenants/current
        assert "features" in data["tenant"] or "entitlements" in data["tenant"] or "plan" in data["tenant"] or "name" in data["tenant"]

    def test_bootstrap_with_dash(self, sess):
        r = sess.get(f"{BASE_URL}/api/bootstrap?dash=1", headers=_hdr(ADMIN[2]))
        assert r.status_code == 200
        data = r.json()
        assert data["dashboard"] is not None, "dashboard should be populated when dash=1"
        d = data["dashboard"]
        # Should contain revenue keys
        keys = set(d.keys()) if isinstance(d, dict) else set()
        assert any(k in keys for k in ("today_revenue", "month_revenue", "revenue_today", "revenue_month")), f"missing revenue keys in {keys}"

    def test_user_shape_matches_auth_me(self, sess):
        r1 = sess.get(f"{BASE_URL}/api/auth/me", headers=_hdr(ADMIN[2]))
        r2 = sess.get(f"{BASE_URL}/api/bootstrap", headers=_hdr(ADMIN[2]))
        assert r1.status_code == 200 and r2.status_code == 200
        me = r1.json()
        bs_user = r2.json()["user"]
        # Compare key fields
        for k in ("email", "role", "id", "_id"):
            if k in me:
                assert me.get(k) == bs_user.get(k), f"user.{k} mismatch: {me.get(k)} vs {bs_user.get(k)}"
        if "salons" in me:
            assert "salons" in bs_user

    def test_tenant_shape_matches_tenants_current(self, sess):
        r1 = sess.get(f"{BASE_URL}/api/tenants/current", headers=_hdr(ADMIN[2]))
        r2 = sess.get(f"{BASE_URL}/api/bootstrap", headers=_hdr(ADMIN[2]))
        if r1.status_code != 200:
            pytest.skip(f"/tenants/current not accessible: {r1.status_code}")
        t = r1.json()
        bs_t = r2.json()["tenant"]
        for k in ("slug", "name", "id", "_id"):
            if k in t:
                assert t.get(k) == bs_t.get(k), f"tenant.{k} mismatch"


# ------- Manager -------
class TestManager:
    @pytest.fixture(scope="class")
    def sess(self):
        return _login(*MANAGER)

    def test_bootstrap_dash_populated_branch_locked(self, sess):
        r = sess.get(f"{BASE_URL}/api/bootstrap?dash=1", headers=_hdr(MANAGER[2]))
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["user"]["role"] == "manager"
        assert data["dashboard"] is not None, "manager should get dashboard"
        # Compare with /reports/dashboard
        rd = sess.get(f"{BASE_URL}/api/reports/dashboard", headers=_hdr(MANAGER[2]))
        assert rd.status_code == 200
        # Both should produce same shape; branch locked -> same keys and values roughly
        d1 = data["dashboard"]
        d2 = rd.json()
        assert set(d1.keys()) == set(d2.keys()), f"dashboard shape differs: {set(d1.keys())^set(d2.keys())}"


# ------- Super admin -------
class TestSuperAdmin:
    @pytest.fixture(scope="class")
    def sess(self):
        return _login(*SUPER)

    def test_bootstrap_super_user_only(self, sess):
        r = sess.get(f"{BASE_URL}/api/bootstrap?dash=1")
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["user"]["role"] == "super_admin"
        assert data["tenant"] is None
        assert data["dashboard"] is None


# ------- 2nd tenant -------
class TestOwner2:
    @pytest.fixture(scope="class")
    def sess(self):
        return _login(*OWNER2)

    def test_bootstrap_isolated(self, sess):
        r = sess.get(f"{BASE_URL}/api/bootstrap?dash=1", headers=_hdr(OWNER2[2]))
        assert r.status_code == 200
        data = r.json()
        assert data["tenant"] is not None
        # Should be elegance tenant
        assert data["tenant"].get("slug") == "elegance-koramangala" or "elegance" in str(data["tenant"].get("name", "")).lower()
