"""Iter 26 — Revenue Dashboard endpoints + save-flow re-verification.

Covers:
  * GET /api/super-admin/subscriptions/revenue (super=200, admin=403)
  * GET /api/super-admin/subscriptions/export.csv (super=200 text/csv, header row + 9 cols)
  * Save flows: Settings branding, Settings tax, Customers, Staff, Products
  * 401 interceptor sanity — bad token on protected endpoint returns 401
"""
import csv
import io
import os
import pytest
import requests
from creds import password_for

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PW = password_for("admin@miracurl.com")
SUPER_EMAIL = "super@miracurl.com"
SUPER_PW = password_for("super@miracurl.com")

EXPECTED_CSV_HEADER = [
    "paid_at", "tenant_slug", "tenant_name", "owner_email",
    "amount_inr", "method", "txn_ref", "subscription_id", "notes",
]


@pytest.fixture(scope="session")
def super_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": SUPER_EMAIL, "password": SUPER_PW}, timeout=15)
    assert r.status_code == 200, f"super login failed {r.status_code} {r.text}"
    return r.cookies["access_token"]


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=15)
    assert r.status_code == 200, f"admin login failed {r.status_code} {r.text}"
    return r.cookies["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Revenue endpoint ----------
class TestRevenueEndpoint:
    def test_revenue_as_super_admin(self, super_token):
        r = requests.get(f"{BASE_URL}/api/super-admin/subscriptions/revenue",
                         headers=_auth(super_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # Required keys
        for k in ["today", "this_month", "all_time", "active_subscriptions",
                  "cancelled_30d", "churn_pct", "mrr", "arr", "avg_lifetime_days",
                  "trend_30d", "plan_distribution", "top_tenants"]:
            assert k in d, f"missing key {k}"
        # Types
        assert isinstance(d["today"], (int, float))
        assert isinstance(d["this_month"], (int, float))
        assert isinstance(d["all_time"], (int, float))
        assert isinstance(d["active_subscriptions"], int)
        assert isinstance(d["cancelled_30d"], int)
        assert isinstance(d["churn_pct"], (int, float))
        assert isinstance(d["mrr"], (int, float))
        assert isinstance(d["arr"], (int, float))
        # 30 entries in trend
        assert isinstance(d["trend_30d"], list)
        assert len(d["trend_30d"]) == 30, f"trend_30d len={len(d['trend_30d'])}"
        for row in d["trend_30d"]:
            assert "date" in row and "amount" in row
        # top_tenants is list (may be empty)
        assert isinstance(d["top_tenants"], list)
        # ARR must equal 12 * MRR (float tolerance)
        assert abs(d["arr"] - d["mrr"] * 12.0) < 0.05

    def test_revenue_as_tenant_admin_forbidden(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/super-admin/subscriptions/revenue",
                         headers=_auth(admin_token), timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"


# ---------- CSV export ----------
class TestRevenueCSVExport:
    def test_csv_export_super(self, super_token):
        r = requests.get(f"{BASE_URL}/api/super-admin/subscriptions/export.csv",
                         headers=_auth(super_token), timeout=15)
        assert r.status_code == 200, r.text
        assert "text/csv" in r.headers.get("content-type", "")
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower(), f"missing attachment header: {cd}"
        assert ".csv" in cd
        # Parse rows
        reader = csv.reader(io.StringIO(r.text))
        rows = list(reader)
        assert len(rows) >= 1, "csv has no rows"
        assert rows[0] == EXPECTED_CSV_HEADER, f"header mismatch: {rows[0]}"
        # Any data rows should be 9 columns
        for row in rows[1:]:
            assert len(row) == 9, f"row has {len(row)} cols: {row}"

    def test_csv_export_admin_forbidden(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/super-admin/subscriptions/export.csv",
                         headers=_auth(admin_token), timeout=15)
        assert r.status_code == 403


# ---------- Settings branding save ----------
class TestSettingsBranding:
    def test_branding_save_persists(self, admin_token):
        # Get current
        g = requests.get(f"{BASE_URL}/api/settings/branding",
                        headers=_auth(admin_token), timeout=15)
        assert g.status_code == 200
        orig = g.json()
        # Save modified
        new_hours = "Mon-Sun 11-10 iter26"
        payload = {**orig, "hours": new_hours}
        # payload may contain extra keys but branding endpoint should accept
        p = requests.put(f"{BASE_URL}/api/settings/branding", json=payload,
                         headers=_auth(admin_token), timeout=15)
        assert p.status_code == 200, p.text
        # Verify
        g2 = requests.get(f"{BASE_URL}/api/settings/branding",
                          headers=_auth(admin_token), timeout=15)
        assert g2.json().get("hours") == new_hours
        # Restore
        requests.put(f"{BASE_URL}/api/settings/branding", json=orig,
                     headers=_auth(admin_token), timeout=15)


# ---------- Settings tax save ----------
class TestSettingsTax:
    def test_tax_toggle_on_off(self, admin_token):
        # Save original
        g = requests.get(f"{BASE_URL}/api/settings/tax",
                       headers=_auth(admin_token), timeout=15)
        assert g.status_code == 200
        orig = g.json()

        # Turn ON
        r = requests.put(f"{BASE_URL}/api/settings/tax",
                         json={"tax_enabled": True, "gst_number": "29ABCDE1234F1Z5", "tax_pct": 18},
                         headers=_auth(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        g2 = requests.get(f"{BASE_URL}/api/settings/tax", headers=_auth(admin_token), timeout=15)
        d = g2.json()
        assert d["tax_enabled"]
        assert d["gst_number"] == "29ABCDE1234F1Z5"

        # Turn OFF
        r2 = requests.put(f"{BASE_URL}/api/settings/tax",
                          json={"tax_enabled": False}, headers=_auth(admin_token), timeout=15)
        assert r2.status_code == 200
        g3 = requests.get(f"{BASE_URL}/api/settings/tax", headers=_auth(admin_token), timeout=15)
        assert not g3.json()["tax_enabled"]
        # Restore
        requests.put(f"{BASE_URL}/api/settings/tax", json=orig,
                     headers=_auth(admin_token), timeout=15)


# ---------- Customer save flow ----------
class TestCustomerSave:
    def test_create_edit_delete(self, admin_token):
        payload = {"name": "TEST_iter26_cust", "phone": "9990000126", "email": "iter26@t.test"}
        r = requests.post(f"{BASE_URL}/api/customers", json=payload,
                          headers=_auth(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        # Edit
        r2 = requests.put(f"{BASE_URL}/api/customers/{cid}",
                          json={"name": "TEST_iter26_cust_v2", "phone": "9990000126"},
                          headers=_auth(admin_token), timeout=15)
        assert r2.status_code == 200
        # GET verify
        g = requests.get(f"{BASE_URL}/api/customers/{cid}",
                         headers=_auth(admin_token), timeout=15)
        assert g.status_code == 200
        assert g.json()["name"] == "TEST_iter26_cust_v2"
        # Delete
        d = requests.delete(f"{BASE_URL}/api/customers/{cid}",
                            headers=_auth(admin_token), timeout=15)
        assert d.status_code in (200, 204)


# ---------- Staff save flow ----------
class TestStaffSave:
    def test_create_edit_delete(self, admin_token):
        pin = {"X-Owner-Pin": "4321"}
        payload = {"name": "TEST_iter26_staff", "role": "stylist", "phone": "9990000226"}
        r = requests.post(f"{BASE_URL}/api/staff", json=payload,
                          headers={**_auth(admin_token), **pin}, timeout=15)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        r2 = requests.put(f"{BASE_URL}/api/staff/{sid}",
                          json={"name": "TEST_iter26_staff_v2", "role": "stylist", "phone": "9990000226"},
                          headers={**_auth(admin_token), **pin}, timeout=15)
        assert r2.status_code == 200
        # Verify — list
        lst = requests.get(f"{BASE_URL}/api/staff", headers={**_auth(admin_token), **pin}, timeout=15).json()
        assert any(s.get("id") == sid and s.get("name") == "TEST_iter26_staff_v2" for s in lst)
        # Delete
        d = requests.delete(f"{BASE_URL}/api/staff/{sid}",
                            headers={**_auth(admin_token), **pin}, timeout=15)
        assert d.status_code in (200, 204)


# ---------- Product save flow ----------
class TestProductSave:
    def test_create_edit_delete(self, admin_token):
        payload = {
            "name": "TEST_iter26_prod",
            "sku": "T26-001",
            "category": "misc",
            "price": 199.0,
            "cost": 100.0,
            "stock": 10,
            "unit": "pc",
            "reorder_level": 2,
        }
        r = requests.post(f"{BASE_URL}/api/products", json=payload,
                          headers=_auth(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        # Edit price
        upd = {**payload, "price": 249.0}
        r2 = requests.put(f"{BASE_URL}/api/products/{pid}", json=upd,
                          headers=_auth(admin_token), timeout=15)
        assert r2.status_code == 200
        lst = requests.get(f"{BASE_URL}/api/products", headers=_auth(admin_token), timeout=15).json()
        row = next((p for p in lst if p.get("id") == pid), None)
        assert row is not None
        assert float(row["price"]) == 249.0
        # Delete
        d = requests.delete(f"{BASE_URL}/api/products/{pid}",
                            headers=_auth(admin_token), timeout=15)
        assert d.status_code in (200, 204)


# ---------- 401 interceptor sanity — server returns 401 for bad token ----------
class TestAuth401:
    def test_bad_token_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/settings/branding",
                         headers={"Authorization": "Bearer clearly-not-a-token"}, timeout=15)
        assert r.status_code == 401, f"expected 401 for bad token, got {r.status_code}"
