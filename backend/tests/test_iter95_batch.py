"""
Iteration 95 — Batch of fixes:
- dashboard/sales support branch=__main__ (bills with no branch_name) and named branch
- voided bills excluded from dashboard/sales
- PUT /invoices keeps staff_id on service items
- POST /invoices/{id}/void with Owner PIN; second void → 400; audit trail entry
- /reports/staff-commission default pct=0
"""
from _creds import _PW_ADMIN
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

TENANT = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = _PW_ADMIN
OWNER_PIN = "4321"
CUSTOMER_ID = "fb48bf16-ca60-44e5-af63-53cb8b2a5860"
AECS_BRANCH = "Miracurl — AECS Layout, Brookefield"


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT, "Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"admin login: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def a_staff_id(admin):
    r = admin.get(f"{BASE_URL}/api/staff")
    assert r.status_code == 200
    staff = r.json()
    assert staff, "no staff"
    return staff[0]["id"], staff[0].get("name") or "Stylist"


# -------- Dashboard branch filter --------

class TestDashboardBranch:
    def test_dashboard_main_only(self, admin):
        r = admin.get(f"{BASE_URL}/api/reports/dashboard", params={"branch": "__main__"})
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "today_revenue" in d and "month_revenue" in d
        assert isinstance(d["month_revenue"], (int, float))

    def test_dashboard_aecs_branch(self, admin):
        r = admin.get(f"{BASE_URL}/api/reports/dashboard", params={"branch": AECS_BRANCH})
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "month_revenue" in d

    def test_dashboard_no_branch_ge_main(self, admin):
        r_all = admin.get(f"{BASE_URL}/api/reports/dashboard").json()
        r_main = admin.get(f"{BASE_URL}/api/reports/dashboard", params={"branch": "__main__"}).json()
        assert r_all["month_revenue"] + 0.01 >= r_main["month_revenue"]


# -------- Sales branch filter --------

class TestSalesBranch:
    def test_sales_main_only(self, admin):
        r = admin.get(f"{BASE_URL}/api/reports/sales",
                      params={"start": "2026-07-01", "end": "2026-08-05", "branch": "__main__"})
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "by_branch" in d
        # All invoices should have branch_name null/empty → grouped as "Main"
        for row in d["by_branch"]:
            assert row["branch"] == "Main", f"unexpected branch in main-only: {row}"

    def test_sales_aecs_only(self, admin):
        r = admin.get(f"{BASE_URL}/api/reports/sales",
                      params={"start": "2026-07-01", "end": "2026-08-05", "branch": AECS_BRANCH})
        assert r.status_code == 200
        d = r.json()
        for row in d["by_branch"]:
            assert row["branch"] == AECS_BRANCH, f"leaked non-AECS row: {row}"


# -------- Void invoice flow --------

class TestVoidInvoice:
    def test_create_void_and_audit(self, admin, a_staff_id):
        sid, sname = a_staff_id
        payload = {
            "customer_id": CUSTOMER_ID,
            "items": [{"type": "service", "ref_id": "adhoc", "name": "TEST_service", "qty": 1, "price": 500,
                       "staff_id": sid, "staff_name": sname}],
            "payment_mode": "cash",
            "manual_discount": 0,
        }
        r = admin.post(f"{BASE_URL}/api/invoices", json=payload)
        assert r.status_code in (200, 201), f"create invoice: {r.status_code} {r.text[:300]}"
        inv = r.json()
        inv_id = inv["id"]
        inv_total = inv["total"]

        # Dashboard today revenue before void
        rev_before = admin.get(f"{BASE_URL}/api/reports/dashboard").json()["today_revenue"]

        # Void
        headers = {"X-Owner-Pin": OWNER_PIN}
        r = admin.post(f"{BASE_URL}/api/invoices/{inv_id}/void",
                       json={"editor_name": "Owner", "reason": "test wrong punch"},
                       headers=headers)
        assert r.status_code == 200, f"void: {r.status_code} {r.text[:300]}"

        # Void again → 400
        r2 = admin.post(f"{BASE_URL}/api/invoices/{inv_id}/void",
                        json={"editor_name": "Owner", "reason": "again"},
                        headers=headers)
        assert r2.status_code == 400, f"expected 400 second void, got {r2.status_code}"

        # Dashboard revenue should exclude voided bill
        time.sleep(0.5)
        rev_after = admin.get(f"{BASE_URL}/api/reports/dashboard").json()["today_revenue"]
        assert rev_after <= rev_before - inv_total + 0.5, (
            f"voided bill still counted: before={rev_before} after={rev_after} inv_total={inv_total}")

        # Audit trail contains action:'void'
        r3 = admin.get(f"{BASE_URL}/api/invoice-edits", headers=headers)
        assert r3.status_code == 200
        edits = r3.json()
        void_edits = [e for e in edits if e.get("invoice_id") == inv_id and e.get("action") == "void"]
        assert void_edits, "no void audit entry"


# -------- PUT /invoices keeps staff_id --------

class TestEditKeepsStaff:
    def test_edit_preserves_staff(self, admin, a_staff_id):
        sid, sname = a_staff_id
        # Create a fresh non-voided bill
        payload = {
            "customer_id": CUSTOMER_ID,
            "items": [{"type": "service", "ref_id": "adhoc", "name": "TEST_edit_svc", "qty": 1, "price": 300,
                       "staff_id": sid, "staff_name": sname}],
            "payment_mode": "cash",
        }
        r = admin.post(f"{BASE_URL}/api/invoices", json=payload)
        assert r.status_code in (200, 201)
        inv_id = r.json()["id"]

        # Edit with items carrying staff_id / staff_name
        headers = {"X-Owner-Pin": OWNER_PIN}
        body = {
            "editor_name": "Owner",
            "items": [{"type": "service", "ref_id": "adhoc", "name": "TEST_edit_svc", "qty": 1, "price": 350,
                       "staff_id": sid, "staff_name": sname}],
        }
        r = admin.put(f"{BASE_URL}/api/invoices/{inv_id}", json=body, headers=headers)
        assert r.status_code == 200, r.text[:300]
        got = r.json()
        assert got["items"][0].get("staff_id") == sid, f"staff_id not preserved: {got['items'][0]}"
        assert got["items"][0].get("staff_name") == sname

        # Cleanup: void it
        admin.post(f"{BASE_URL}/api/invoices/{inv_id}/void",
                   json={"editor_name": "Owner", "reason": "TEST cleanup"},
                   headers=headers)


# -------- Staff commission default pct=0 --------

class TestCommissionDefaultZero:
    def test_pct_default_zero(self, admin):
        headers = {"X-Owner-Pin": OWNER_PIN}
        r = admin.get(f"{BASE_URL}/api/reports/staff-commission",
                      params={"start": "2026-07-01", "end": "2026-08-05"},
                      headers=headers)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d.get("pct") == 0.0, f"default pct not 0: {d.get('pct')}"
        for row in d.get("rows", []):
            assert row["commission_pct"] == 0.0
            assert row["commission_amount"] == 0.0
