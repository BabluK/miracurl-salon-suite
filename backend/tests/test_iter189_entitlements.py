"""Iter-189: USD tier entitlements — matrix, forced tier, INR non-gating."""
import os
import pytest
import requests
from _creds import pw

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")

SA_EMAIL = "admin@miracurl-suite.com"
SA_PW = pw("SUPER_ADMIN")
USD_OWNER_EMAIL = "emma.glowaustin@test.com"
USD_OWNER_PW = pw("USD_OWNER")
USD_TENANT_SLUG = "glow-studio-austin"
USD_TENANT_ID = "39311ac2-9403-4c17-b100-70f84e5b03e7"
INR_OWNER_EMAIL = "admin@miracurl.com"
INR_OWNER_PW = pw("SALON_ADMIN")
INR_TENANT_SLUG = "miracurl-marathahalli"


def _login(s: requests.Session, email: str, pw: str, slug: str | None = None):
    h = {"Content-Type": "application/json"}
    if slug:
        h["X-Tenant-Slug"] = slug
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, headers=h)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text[:300]}"
    return r


def _csrf(s: requests.Session):
    return s.cookies.get("csrf_token")


@pytest.fixture
def sa_session():
    s = requests.Session()
    _login(s, SA_EMAIL, SA_PW)
    return s


@pytest.fixture
def usd_session():
    s = requests.Session()
    _login(s, USD_OWNER_EMAIL, USD_OWNER_PW, USD_TENANT_SLUG)
    return s


@pytest.fixture
def inr_session():
    s = requests.Session()
    _login(s, INR_OWNER_EMAIL, INR_OWNER_PW, INR_TENANT_SLUG)
    return s


# --- Entitlements matrix ---
class TestMatrix:
    def test_matrix(self, sa_session):
        r = sa_session.get(f"{BASE_URL}/api/super-admin/entitlements/matrix")
        assert r.status_code == 200
        d = r.json()
        assert d["tiers"] == ["starter", "professional", "premium", "enterprise"]
        assert d["prices"]["starter"] == 39
        assert d["prices"]["professional"] == 79
        assert d["prices"]["premium"] == 149
        assert d["prices"]["enterprise"] == 399
        assert len(d["modules"]) == 23
        assert len(d["tier_modules"]["starter"]) == 12
        assert len(d["tier_modules"]["professional"]) == 17
        assert len(d["tier_modules"]["premium"]) == 23
        assert len(d["tier_modules"]["enterprise"]) == 23
        names = [c["name"] for c in d["competitors"]]
        assert len(d["competitors"]) == 6
        assert "Square Appointments" in names
        assert "Boulevard" in names


# --- USD tenant flows ---
class TestUsdTenant:
    def test_usd_owner_starter_locked(self, usd_session):
        r = usd_session.get(f"{BASE_URL}/api/tenants/current")
        assert r.status_code == 200
        ent = r.json().get("entitlements") or {}
        assert ent.get("tier") == "starter", ent
        assert ent.get("forced") is True
        locked = ent.get("locked") or []
        assert len(locked) == 11, f"locked={locked}"
        for m in ["receptionist", "inventory", "reports", "mira-studio", "cctv"]:
            assert m in locked, f"{m} should be locked"
        for m in ["appointments", "pos", "customers"]:
            assert m not in locked

    def test_sa_force_professional(self, sa_session):
        csrf = _csrf(sa_session)
        r = sa_session.put(
            f"{BASE_URL}/api/super-admin/tenants/{USD_TENANT_ID}/features",
            json={"tier": "professional"}, headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        )
        assert r.status_code == 200, r.text[:300]
        ent = r.json()["entitlements"]
        assert ent["tier"] == "professional"
        assert ent["forced"] is True
        locked = set(ent["locked"])
        assert locked == {"offers-studio", "mira-studio", "receptionist", "assistant", "registry", "cctv"}, locked

    def test_sa_force_auto_then_reset_starter(self, sa_session):
        csrf = _csrf(sa_session)
        r = sa_session.put(
            f"{BASE_URL}/api/super-admin/tenants/{USD_TENANT_ID}/features",
            json={"tier": "auto"}, headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        )
        assert r.status_code == 200
        ent = r.json()["entitlements"]
        assert ent["forced"] is False
        assert ent["tier"] == "premium", f"trial tenant should be premium, got {ent}"
        assert ent["locked"] == []
        # restore starter at end
        r2 = sa_session.put(
            f"{BASE_URL}/api/super-admin/tenants/{USD_TENANT_ID}/features",
            json={"tier": "starter"}, headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        )
        assert r2.status_code == 200
        ent2 = r2.json()["entitlements"]
        assert ent2["tier"] == "starter"
        assert ent2["forced"] is True

    def test_invalid_tier(self, sa_session):
        csrf = _csrf(sa_session)
        r = sa_session.put(
            f"{BASE_URL}/api/super-admin/tenants/{USD_TENANT_ID}/features",
            json={"tier": "gold"}, headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        )
        assert r.status_code == 422, r.status_code

    def test_sa_get_features_has_entitlements_and_channels(self, sa_session):
        r = sa_session.get(f"{BASE_URL}/api/super-admin/tenants/{USD_TENANT_ID}/features")
        assert r.status_code == 200
        d = r.json()
        assert "sms" in d
        assert "whatsapp" in d
        assert "support_access" in d
        assert "entitlements" in d


# --- INR tenant ---
class TestInrTenant:
    def test_inr_not_gated(self, inr_session):
        r = inr_session.get(f"{BASE_URL}/api/tenants/current")
        assert r.status_code == 200
        ent = r.json().get("entitlements") or {}
        assert ent.get("tier") is None
        assert ent.get("forced") is False
        assert ent.get("locked") == []
