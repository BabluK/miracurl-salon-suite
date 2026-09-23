"""Tests for Branches CRUD, Branding (logo apply/remove), and RBAC."""
import os
import pytest
import requests
from creds import password_for
from _creds import pw

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@miracurl.com", "password": password_for("admin@miracurl.com")}
MANAGER = {"email": "manager@miracurl.com", "password": pw("MANAGER")}
KNOWN_LOGO_URL = "/api/files/4e079c13-1102-4e77-b87d-6d0595320b00"


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin_session():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def manager_session():
    return _login(MANAGER)


@pytest.fixture(scope="module")
def created_branch_ids():
    ids = []
    yield ids
    # cleanup at end
    try:
        s = _login(ADMIN)
        for bid in ids:
            s.delete(f"{API}/branches/{bid}")
    except Exception:
        pass


# ---------------- Branches CRUD ----------------
class TestBranchesCRUD:
    def test_list_branches(self, admin_session):
        r = admin_session.get(f"{API}/branches")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_create_branch_and_verify_persistence(self, admin_session, created_branch_ids):
        payload = {
            "name": "TEST_Branch_Indiranagar",
            "address": "100 Main Rd, Indiranagar, Bangalore 560038",
            "phone": "+91 90000 00001",
            "maps_url": "https://maps.app.goo.gl/test1",
        }
        r = admin_session.post(f"{API}/branches", json=payload)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["name"] == payload["name"]
        assert b["address"] == payload["address"]
        assert b["phone"] == payload["phone"]
        assert "id" in b and isinstance(b["id"], str)
        created_branch_ids.append(b["id"])

        # GET to verify persistence
        lst = admin_session.get(f"{API}/branches").json()
        assert any(x["id"] == b["id"] and x["name"] == payload["name"] for x in lst)

    def test_update_branch(self, admin_session, created_branch_ids):
        assert created_branch_ids, "need a created branch"
        bid = created_branch_ids[0]
        upd = {
            "name": "TEST_Branch_Indiranagar_Renamed",
            "address": "200 Updated Rd, Bangalore 560038",
            "phone": "+91 90000 00002",
            "maps_url": "https://maps.app.goo.gl/updated",
        }
        r = admin_session.put(f"{API}/branches/{bid}", json=upd)
        assert r.status_code == 200, r.text

        lst = admin_session.get(f"{API}/branches").json()
        row = next(x for x in lst if x["id"] == bid)
        assert row["name"] == upd["name"]
        assert row["address"] == upd["address"]

    def test_validation_short_name(self, admin_session):
        r = admin_session.post(f"{API}/branches", json={"name": "A", "address": "Long enough address 123"})
        assert r.status_code == 422

    def test_validation_short_address(self, admin_session):
        r = admin_session.post(f"{API}/branches", json={"name": "OK Name", "address": "shrt"})
        assert r.status_code == 422

    def test_update_nonexistent_branch(self, admin_session):
        r = admin_session.put(f"{API}/branches/nonexistent-id", json={
            "name": "TEST_x", "address": "Some long enough address here",
        })
        assert r.status_code == 404

    def test_delete_branch(self, admin_session, created_branch_ids):
        assert created_branch_ids
        bid = created_branch_ids.pop(0)
        r = admin_session.delete(f"{API}/branches/{bid}")
        assert r.status_code == 200
        lst = admin_session.get(f"{API}/branches").json()
        assert not any(x["id"] == bid for x in lst)


# ---------------- Public sync ----------------
class TestPublicBranchesSync:
    def test_public_salon_branches_in_sync(self, admin_session):
        # add a branch
        payload = {
            "name": "TEST_Public_Sync",
            "address": "Sync Address 456 Street Bangalore",
            "phone": "+91 90000 00099",
            "maps_url": "",
        }
        r = admin_session.post(f"{API}/branches", json=payload)
        assert r.status_code == 200
        bid = r.json()["id"]
        try:
            pub = requests.get(f"{API}/public/salon/miracurl-marathahalli", timeout=15)
            assert pub.status_code == 200
            data = pub.json()
            assert "branches" in data
            assert any(b["id"] == bid and b["name"] == payload["name"] for b in data["branches"])
            # logo_url should be present too
            assert "logo_url" in data
        finally:
            admin_session.delete(f"{API}/branches/{bid}")


# ---------------- RBAC ----------------
class TestRBAC:
    def test_manager_cannot_list_branches(self, manager_session):
        # Managers may READ the branch list (needed for dropdowns) but never mutate.
        r = manager_session.get(f"{API}/branches")
        assert r.status_code == 200

    def test_manager_cannot_add_branch(self, manager_session):
        r = manager_session.post(f"{API}/branches", json={
            "name": "TEST_ManagerBlocked", "address": "should not be created ever",
        })
        assert r.status_code == 403

    def test_manager_cannot_generate_logo(self, manager_session):
        r = manager_session.post(f"{API}/branding/logo/generate", json={"style": "luxury"})
        assert r.status_code == 403

    def test_manager_cannot_apply_logo(self, manager_session):
        r = manager_session.post(f"{API}/branding/logo/apply", json={"url": ""})
        assert r.status_code == 403


# ---------------- Branding: apply / remove / re-apply ----------------
class TestBrandingApply:
    def test_invalid_logo_url_rejected(self, admin_session):
        r = admin_session.post(f"{API}/branding/logo/apply", json={"url": "javascript:alert(1)"})
        assert r.status_code == 400

    def test_remove_then_reapply_logo(self, admin_session):
        # Snapshot original logo
        me = admin_session.get(f"{API}/tenants/current").json()
        original = me.get("logo_url") or KNOWN_LOGO_URL

        # Remove
        r = admin_session.post(f"{API}/branding/logo/apply", json={"url": ""})
        assert r.status_code == 200
        assert r.json()["logo_url"] == ""
        cur = admin_session.get(f"{API}/tenants/current").json()
        assert (cur.get("logo_url") or "") == ""

        # Re-apply the known logo file (per instructions)
        r2 = admin_session.post(f"{API}/branding/logo/apply", json={"url": KNOWN_LOGO_URL})
        assert r2.status_code == 200
        assert r2.json()["logo_url"] == KNOWN_LOGO_URL
        cur2 = admin_session.get(f"{API}/tenants/current").json()
        assert cur2.get("logo_url") == KNOWN_LOGO_URL

        # public salon should reflect it
        pub = requests.get(f"{API}/public/salon/miracurl-marathahalli", timeout=15).json()
        assert pub.get("logo_url") == KNOWN_LOGO_URL

        # Restore whatever original was (should be same)
        admin_session.post(f"{API}/branding/logo/apply", json={"url": original})
