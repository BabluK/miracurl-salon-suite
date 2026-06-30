"""Iter 19: Tax settings + POS guest typeahead + Landing root route.
Tests for GET/PUT /api/settings/tax, invoice tax enforcement, and resets state.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASSWORD = "Miracurl@123"
SUPER_EMAIL = "super@miracurl.com"
SUPER_PASSWORD = "Super@Miracurl123"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------------- Tax Settings ----------------

class TestTaxSettings:
    def test_initial_get_tax_settings(self, admin_headers):
        # Force disabled first to ensure clean baseline
        requests.put(f"{BASE_URL}/api/settings/tax", headers=admin_headers,
                     json={"tax_enabled": False, "tax_pct": 0})
        r = requests.get(f"{BASE_URL}/api/settings/tax", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["tax_enabled"] is False
        assert data["tax_pct"] == 0
        assert "gst_number" in data
        assert "gst_legal_name" in data

    def test_put_tax_enabled_no_gstin_400(self, admin_headers):
        r = requests.put(f"{BASE_URL}/api/settings/tax", headers=admin_headers,
                         json={"tax_enabled": True, "tax_pct": 18}, timeout=15)
        assert r.status_code == 400, r.text
        assert "gst" in r.text.lower()

    def test_put_invalid_gstin_format_422(self, admin_headers):
        r = requests.put(f"{BASE_URL}/api/settings/tax", headers=admin_headers,
                         json={"tax_enabled": True, "gst_number": "BADGSTIN", "tax_pct": 18}, timeout=15)
        assert r.status_code == 422, r.text

    def test_put_valid_tax_settings(self, admin_headers):
        r = requests.put(f"{BASE_URL}/api/settings/tax", headers=admin_headers,
                         json={"tax_enabled": True, "gst_number": "29ABCDE1234F1Z5",
                               "gst_legal_name": "Miracurl Salon", "tax_pct": 18}, timeout=15)
        assert r.status_code == 200, r.text
        g = requests.get(f"{BASE_URL}/api/settings/tax", headers=admin_headers, timeout=15).json()
        assert g["tax_enabled"] is True
        assert g["gst_number"] == "29ABCDE1234F1Z5"
        assert g["gst_legal_name"] == "Miracurl Salon"
        assert float(g["tax_pct"]) == 18.0


# ---------------- Invoice tax behaviour ----------------

def _get_first_service_and_customer(headers):
    services = requests.get(f"{BASE_URL}/api/services", headers=headers, timeout=15).json()
    customers = requests.get(f"{BASE_URL}/api/customers", headers=headers, timeout=15).json()
    return services[0], customers[0]


class TestInvoiceTax:
    def test_invoice_when_tax_disabled(self, admin_headers):
        # Disable tax first
        r = requests.put(f"{BASE_URL}/api/settings/tax", headers=admin_headers,
                         json={"tax_enabled": False, "tax_pct": 0})
        assert r.status_code == 200, r.text

        svc, cust = _get_first_service_and_customer(admin_headers)
        payload = {
            "customer_id": cust["id"],
            "items": [{"type": "service", "ref_id": svc["id"], "name": svc["name"],
                       "price": float(svc.get("price", 100)), "qty": 1}],
            "discount": 0,
            "tax_pct": 18,  # client tries to charge — server must override
            "payment_mode": "Cash",
        }
        r = requests.post(f"{BASE_URL}/api/invoices", headers=admin_headers, json=payload, timeout=20)
        assert r.status_code in (200, 201), r.text
        inv = r.json()
        assert float(inv["tax"]) == 0.0, f"Tax should be 0 when disabled, got {inv['tax']}"

    def test_invoice_when_tax_enabled(self, admin_headers):
        # Enable tax 18% with valid GSTIN
        r = requests.put(f"{BASE_URL}/api/settings/tax", headers=admin_headers,
                         json={"tax_enabled": True, "gst_number": "29ABCDE1234F1Z5",
                               "gst_legal_name": "Miracurl Salon", "tax_pct": 18})
        assert r.status_code == 200, r.text

        svc, cust = _get_first_service_and_customer(admin_headers)
        price = float(svc.get("price", 100))
        payload = {
            "customer_id": cust["id"],
            "items": [{"type": "service", "ref_id": svc["id"], "name": svc["name"], "price": price, "qty": 1}],
            "discount": 0,
            "tax_pct": 18,
            "payment_mode": "Cash",
        }
        r = requests.post(f"{BASE_URL}/api/invoices", headers=admin_headers, json=payload, timeout=20)
        assert r.status_code in (200, 201), r.text
        inv = r.json()
        assert float(inv["tax"]) > 0, f"Tax should be >0 when enabled, got {inv['tax']}"
        # total == subtotal - discount + tax
        expected = round(float(inv["subtotal"]) - float(inv["discount"]) + float(inv["tax"]), 2)
        assert round(float(inv["total"]), 2) == expected


class TestCleanup:
    def test_reset_tax_disabled(self, admin_headers):
        r = requests.put(f"{BASE_URL}/api/settings/tax", headers=admin_headers,
                         json={"tax_enabled": False, "tax_pct": 0}, timeout=15)
        assert r.status_code == 200, r.text
        g = requests.get(f"{BASE_URL}/api/settings/tax", headers=admin_headers, timeout=15).json()
        assert g["tax_enabled"] is False
        assert g["tax_pct"] == 0


# ---------------- Regression: super-admin + public booking ----------------

class TestRegression:
    def test_super_admin_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": SUPER_EMAIL, "password": SUPER_PASSWORD}, timeout=15)
        assert r.status_code == 200, r.text
        token = r.json()["access_token"]
        tr = requests.get(f"{BASE_URL}/api/super-admin/tenants",
                          headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert tr.status_code == 200, tr.text
        assert isinstance(tr.json(), list)
        assert len(tr.json()) >= 1

    def test_public_booking_tenant(self):
        # Public booking page resolves via /api/public/salon/{slug}
        r = requests.get(f"{BASE_URL}/api/public/salon/miracurl-marathahalli", timeout=15)
        assert r.status_code == 200, r.text
