"""Iter-191 backend tests:
   - Lead Email Fixer (email_real flag, edit_lead validation, status reset, email_fixed_at)
   - API Tier Enforcement (MODULE_LOCKED for USD starter/auto/module_locks) + grandfathering
   - Plan feature editor (annual/half_year features + highlight via /api/super-admin/plans)
"""
import os
import pytest
import requests

def _load_backend_url():
    for line in open("/app/frontend/.env"):
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL missing")


BASE = os.environ.get("REACT_APP_BACKEND_URL", _load_backend_url()).rstrip("/")

SA_EMAIL = "admin@miracurl-suite.com"
SA_PASS = "og9T@41Es#OQb6"
USD_EMAIL = "emma.glowaustin@test.com"
USD_PASS = "Glow@12345"
USD_SLUG = "glow-studio-austin"
USD_TENANT_ID = "39311ac2-9403-4c17-b100-70f84e5b03e7"
INR_EMAIL = "admin@miracurl.com"
INR_PASS = "q6QY@tn3p#9DtL"
INR_SLUG = "miracurl-marathahalli"


def _login(email, password, slug=None):
    s = requests.Session()
    h = {"Content-Type": "application/json"}
    if slug:
        h["X-Tenant-Slug"] = slug
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, headers=h)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    csrf = s.cookies.get("csrf_token")
    s.headers.update({"Content-Type": "application/json"})
    if csrf:
        s.headers["X-CSRF-Token"] = csrf
    if slug:
        s.headers["X-Tenant-Slug"] = slug
    return s


@pytest.fixture(scope="module")
def sa():
    return _login(SA_EMAIL, SA_PASS)


@pytest.fixture(scope="module")
def usd():
    return _login(USD_EMAIL, USD_PASS, USD_SLUG)


@pytest.fixture(scope="module")
def inr():
    return _login(INR_EMAIL, INR_PASS, INR_SLUG)


# ---------------- Leads ----------------
class TestLeadEmailFixer:
    def test_list_leads_email_real_flag(self, sa):
        r = sa.get(f"{BASE}/api/super-admin/mira-leads")
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) > 0
        for row in rows:
            assert "email_real" in row and isinstance(row["email_real"], bool)
            e = (row.get("email") or "").lower()
            if not e or e.endswith("@miracurl.com"):
                assert row["email_real"] is False, f"lead {row.get('id')} email='{e}' expected email_real False"

    def test_edit_lead_invalid_and_real_email(self, sa):
        rows = sa.get(f"{BASE}/api/super-admin/mira-leads").json()
        target = next((r for r in rows if not r["email_real"]), None)
        assert target, "no lead with email_real=False found"
        lid = target["id"]
        original_email = target.get("email") or ""
        original_status = target.get("status")

        # placeholder domain rejected
        r = sa.put(f"{BASE}/api/super-admin/mira-leads/{lid}", json={"email": "x@example.com"})
        assert r.status_code == 400, f"expected 400 placeholder, got {r.status_code} {r.text}"

        # real email accepted
        r = sa.put(f"{BASE}/api/super-admin/mira-leads/{lid}", json={"email": "qa.owner.fix@gmail.com"})
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["email"] == "qa.owner.fix@gmail.com"
        assert doc["email_real"] is True
        assert doc.get("email_fixed_at")
        if original_status in ("drafted", "no_email", "pending"):
            assert doc.get("status") == "drafted"

        # Restore via Mongo
        import subprocess
        import json as _json
        db_name = _get_db_name()
        payload = {"email": original_email, "status": original_status}
        cmd = ("db.mira_leads.updateOne({id:%s},{$set:%s,$unset:{email_fixed_at:''}})"
               % (_json.dumps(lid), _json.dumps(payload)))
        subprocess.run(["mongosh", db_name, "--quiet", "--eval", cmd], check=False, capture_output=True)


def _get_db_name():
    for line in open("/app/backend/.env"):
        if line.startswith("DB_NAME="):
            return line.split("=", 1)[1].strip()
    return "test_database"


# ---------------- Enforcement ----------------
class TestEnforcement:
    @pytest.fixture(autouse=True)
    def _reset(self, sa):
        yield
        # restore glow to auto/no locks
        sa.put(f"{BASE}/api/super-admin/tenants/{USD_TENANT_ID}/features",
               json={"tier": "auto", "module_locks": []})

    def test_starter_locks_inventory_receptionist(self, sa, usd):
        r = sa.put(f"{BASE}/api/super-admin/tenants/{USD_TENANT_ID}/features", json={"tier": "starter"})
        assert r.status_code == 200, r.text

        r = usd.get(f"{BASE}/api/products")
        assert r.status_code == 403
        body = r.json()
        assert body.get("detail") == "MODULE_LOCKED" and body.get("module") == "inventory", body

        r = usd.get(f"{BASE}/api/receptionist")
        assert r.status_code == 403
        body = r.json()
        assert body.get("module") == "receptionist", body

        assert usd.get(f"{BASE}/api/appointments").status_code == 200
        assert usd.get(f"{BASE}/api/customers").status_code == 200

    def test_auto_tier_unlocks(self, sa, usd):
        sa.put(f"{BASE}/api/super-admin/tenants/{USD_TENANT_ID}/features", json={"tier": "auto"})
        assert usd.get(f"{BASE}/api/products").status_code == 200

    def test_manual_module_locks(self, sa, usd):
        r = sa.put(f"{BASE}/api/super-admin/tenants/{USD_TENANT_ID}/features",
                   json={"module_locks": ["gallery", "cctv"]})
        assert r.status_code == 200
        cur = usd.get(f"{BASE}/api/tenants/current").json()
        ent = cur.get("entitlements", {})
        assert set(ent.get("module_locks") or []) == {"gallery", "cctv"}
        assert "gallery" in (ent.get("locked") or []) and "cctv" in (ent.get("locked") or [])

        r = usd.get(f"{BASE}/api/gallery")
        assert r.status_code == 403
        body = r.json()
        assert body.get("module") == "gallery", body

        sa.put(f"{BASE}/api/super-admin/tenants/{USD_TENANT_ID}/features", json={"module_locks": []})
        assert usd.get(f"{BASE}/api/gallery").status_code == 200

    def test_invalid_modules_dropped(self, sa, usd):
        r = sa.put(f"{BASE}/api/super-admin/tenants/{USD_TENANT_ID}/features",
                   json={"module_locks": ["not-a-real-module", "gallery"]})
        assert r.status_code == 200
        cur = usd.get(f"{BASE}/api/tenants/current").json()
        assert set(cur["entitlements"]["module_locks"]) == {"gallery"}


class TestGrandfathering:
    def test_inr_tenant_grandfathered(self, inr):
        cur = inr.get(f"{BASE}/api/tenants/current").json()
        ent = cur.get("entitlements", {})
        assert ent.get("grandfathered") is True
        assert ent.get("tier") is None
        assert ent.get("locked") == []

    def test_super_admin_bypass_when_locked(self, sa):
        # Attempt to add locks on the INR tenant, then verify SA (with X-Tenant-Slug) still gets 200
        # Get inr tenant id first
        tenants = sa.get(f"{BASE}/api/super-admin/tenants").json()
        inr_t = next((t for t in tenants if t.get("slug") == INR_SLUG), None)
        assert inr_t, "INR tenant not found"
        tid = inr_t["id"]
        sa.put(f"{BASE}/api/super-admin/tenants/{tid}/features", json={"module_locks": ["inventory"]})
        try:
            h = {"X-Tenant-Slug": INR_SLUG}
            r = sa.get(f"{BASE}/api/products", headers=h)
            assert r.status_code == 200, f"SA bypass failed: {r.status_code} {r.text[:200]}"
        finally:
            sa.put(f"{BASE}/api/super-admin/tenants/{tid}/features", json={"module_locks": []})


# ---------------- Plan Feature Editor ----------------
class TestPlanFeatureEditor:
    def test_update_features_and_highlight(self, sa):
        try:
            r = sa.put(f"{BASE}/api/super-admin/plans/annual",
                       json={"price": 20000, "features": ["QA bullet one", "QA bullet two"], "highlight": True})
            assert r.status_code == 200, r.text

            pub = requests.get(f"{BASE}/api/public/plans").json()
            annual = pub.get("annual")
            assert annual, "annual missing from public plans"
            assert annual.get("features") == ["QA bullet one", "QA bullet two"]
            assert annual.get("highlight") is True

            r = sa.put(f"{BASE}/api/super-admin/plans/half_year",
                       json={"price": 12000, "highlight": True})
            assert r.status_code == 200

            pub = requests.get(f"{BASE}/api/public/plans").json()
            half = pub.get("half_year")
            assert half and half.get("highlight") is True
            annual = pub.get("annual")
            assert annual and annual.get("highlight") is True
        finally:
            # cleanup
            sa.put(f"{BASE}/api/super-admin/plans/annual",
                   json={"price": 20000, "features": [], "highlight": False})
            sa.put(f"{BASE}/api/super-admin/plans/half_year",
                   json={"price": 12000, "features": [], "highlight": False})
            pub = requests.get(f"{BASE}/api/public/plans").json()
            annual = pub.get("annual")
            half = pub.get("half_year")
            assert annual.get("highlight") is False and annual.get("features", []) == []
            assert half.get("highlight") is False and half.get("features", []) == []
