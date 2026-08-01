"""
Iteration 94 — Branch-locked manager + manager section access
Tests: manager branch-lock enforcement on attendance/dashboard;
       manager can read staff/cctv/ai-inquiries/settings/hire/desk-qr;
       manager 403 on /api/managers CRUD;
       admin regressions on all; PATCH /managers/{uid}/branch validation.
"""
import os
import requests
import pytest

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = _load_backend_url()
TENANT = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = "q6QY@tn3p#9DtL"
MGR_EMAIL = "aecs.manager@miracurl.com"
MGR_PASS = "Mgr@12345"
LOCKED_BRANCH = "Miracurl — AECS Layout, Brookefield"


def _login(email, password):
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT, "Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def admin_client():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def mgr_client():
    return _login(MGR_EMAIL, MGR_PASS)


# ---------- Manager branch-lock enforcement ----------
class TestManagerBranchLock:
    def test_attendance_today_no_param(self, mgr_client):
        r = mgr_client.get(f"{BASE_URL}/api/attendance/today")
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        # data may be list or object. Extract staff/branch entries
        rows = data if isinstance(data, list) else (data.get("roster") or data.get("staff") or data.get("rows") or data.get("items") or [])
        branches = {(r_.get("branch") or "").strip() for r_ in rows if isinstance(r_, dict)}
        branches.discard("")
        # allowed: exactly the locked branch (no MAIN staff visible)
        assert branches.issubset({LOCKED_BRANCH}), f"Manager saw branches: {branches}"
        assert len(rows) > 0, "manager should see at least the AECS staff"

    def test_attendance_today_ignores_branch_param(self, mgr_client):
        r = mgr_client.get(f"{BASE_URL}/api/attendance/today", params={"branch": "SomethingElse"})
        assert r.status_code == 200
        j = r.json()
        rows = j if isinstance(j, list) else (j.get("roster") or j.get("staff") or j.get("rows") or j.get("items") or [])
        branches = {(r_.get("branch") or "").strip() for r_ in rows if isinstance(r_, dict)}
        branches.discard("")
        assert branches.issubset({LOCKED_BRANCH}), f"branch= override leaked: {branches}"

    def test_dashboard_200(self, mgr_client):
        r = mgr_client.get(f"{BASE_URL}/api/reports/dashboard")
        assert r.status_code == 200, r.text[:300]


# ---------- Manager section access ----------
class TestManagerSectionAccess:
    def test_staff_list(self, mgr_client):
        r = mgr_client.get(f"{BASE_URL}/api/staff")
        assert r.status_code == 200
        data = r.json()
        rows = data if isinstance(data, list) else data.get("staff") or data.get("items") or []
        # ensure no salary leakage
        for row in rows[:10]:
            assert "salary" not in row, f"salary leaked to manager: {row}"
            assert "salary_monthly" not in row

    def test_cctv_config(self, mgr_client):
        r = mgr_client.get(f"{BASE_URL}/api/cctv/config")
        assert r.status_code == 200

    def test_ai_inquiries(self, mgr_client):
        r = mgr_client.get(f"{BASE_URL}/api/ai-inquiries")
        assert r.status_code == 200

    def test_late_fines_settings(self, mgr_client):
        r = mgr_client.get(f"{BASE_URL}/api/settings/late-fines")
        assert r.status_code == 200

    def test_hire_jobs_list(self, mgr_client):
        r = mgr_client.get(f"{BASE_URL}/api/hiring/requests")
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"

    def test_desk_qr_png(self, mgr_client):
        r = mgr_client.get(f"{BASE_URL}/api/attendance/desk-qr")
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "image" in ct or r.content[:4] == b"\x89PNG", f"content-type={ct}"


# ---------- Manager must NOT access /api/managers ----------
class TestManagerForbiddenOwnerEndpoints:
    def test_get_managers_403(self, mgr_client):
        r = mgr_client.get(f"{BASE_URL}/api/managers")
        assert r.status_code == 403, r.status_code

    def test_post_managers_403(self, mgr_client):
        r = mgr_client.post(f"{BASE_URL}/api/managers", json={"email": "x@x.com", "name": "x", "password": "Passw@123"})
        assert r.status_code == 403, r.status_code


# ---------- Admin regression + branch patch ----------
class TestAdminRegression:
    def test_admin_dashboard(self, admin_client):
        assert admin_client.get(f"{BASE_URL}/api/reports/dashboard").status_code == 200

    def test_admin_staff(self, admin_client):
        assert admin_client.get(f"{BASE_URL}/api/staff").status_code == 200

    def test_admin_cctv(self, admin_client):
        assert admin_client.get(f"{BASE_URL}/api/cctv/config").status_code == 200

    def test_admin_ai_inquiries(self, admin_client):
        assert admin_client.get(f"{BASE_URL}/api/ai-inquiries").status_code == 200

    def test_admin_late_fines(self, admin_client):
        assert admin_client.get(f"{BASE_URL}/api/settings/late-fines").status_code == 200

    def test_admin_hire(self, admin_client):
        assert admin_client.get(f"{BASE_URL}/api/hiring/requests").status_code == 200

    def test_admin_desk_qr(self, admin_client):
        assert admin_client.get(f"{BASE_URL}/api/attendance/desk-qr").status_code == 200

    def test_admin_managers_list(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/managers")
        assert r.status_code == 200
        rows = r.json() if isinstance(r.json(), list) else r.json().get("managers") or r.json().get("items") or []
        # find aecs.manager
        aecs = next((m for m in rows if (m.get("email") or "").lower() == MGR_EMAIL), None)
        assert aecs, f"aecs manager not in list: {[m.get('email') for m in rows]}"
        # save uid for later
        pytest.aecs_uid = aecs.get("uid") or aecs.get("id") or aecs.get("_id")
        assert pytest.aecs_uid, f"no uid in manager row: {aecs}"

    def test_admin_attendance_today_all_branches(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/attendance/today")
        assert r.status_code == 200
        data = r.json()
        rows = data if isinstance(data, list) else (data.get("roster") or data.get("staff") or data.get("rows") or data.get("items") or [])
        assert len(rows) > 0, "admin should see at least some staff in roster"
        # Manager saw only AECS; admin should see the same set or a superset. Ensure roster contains rows.
        # Confirm admin isn't artificially branch-locked by trying explicit main filter (no branch or branch="")
        r2 = admin_client.get(f"{BASE_URL}/api/attendance/today", params={"branch": LOCKED_BRANCH})
        assert r2.status_code == 200
        j2 = r2.json()
        rows2 = j2 if isinstance(j2, list) else (j2.get("roster") or [])
        assert len(rows) >= len(rows2), f"admin unfiltered({len(rows)}) < branch-filtered({len(rows2)}) — admin appears locked"

    def test_patch_manager_branch_invalid(self, admin_client):
        uid = getattr(pytest, "aecs_uid", None)
        assert uid, "need aecs uid from list test"
        r = admin_client.patch(f"{BASE_URL}/api/managers/{uid}/branch", json={"branch": "NotARealBranch"})
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text[:200]}"

    def test_patch_manager_branch_clear_and_restore(self, admin_client):
        uid = getattr(pytest, "aecs_uid", None)
        assert uid
        # clear
        r = admin_client.patch(f"{BASE_URL}/api/managers/{uid}/branch", json={"branch": ""})
        assert r.status_code == 200, r.text[:200]
        # restore
        r = admin_client.patch(f"{BASE_URL}/api/managers/{uid}/branch", json={"branch": LOCKED_BRANCH})
        assert r.status_code == 200, r.text[:200]


# ---------- POS regression ----------
class TestPosRegression:
    def test_pos_offers(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/pos/offers")
        assert r.status_code == 200
