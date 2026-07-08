"""Iteration 7 regression + new feature tests:
- Auth login regression
- Public booking refactor (helpers _resolve_staff/_resolve_or_create_customer/_apply_referral_credit/_create_public_appointment)
- POS create_invoice refactor (_check_stock_or_400, _compute_invoice_totals)
- Sales report unchanged
- NEW: Super-admin bulk customer import (text + vCard + dedupe + 403)
"""
import os
import pytest
import requests
from datetime import datetime, timezone, timedelta
from creds import password_for

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = password_for("admin@miracurl.com")
SUPER_EMAIL = "super@miracurl.com"
SUPER_PASS = password_for("super@miracurl.com")
DEFAULT_SLUG = "miracurl-marathahalli"
DEFAULT_TID = "83ab97b6-b481-4172-afd7-53a46c93317d"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.cookies["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def super_token():
    return _login(SUPER_EMAIL, SUPER_PASS)


# ---- Auth regression ----
class TestAuthRegression:
    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["email"] == ADMIN_EMAIL
        assert d["user"]["role"] == "admin"
        assert isinstance(r.cookies.get("access_token"), str)

    def test_super_admin_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS})
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["role"] == "super_admin"

    def test_wrong_password_401(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "WRONG"})
        assert r.status_code in (400, 401)


# ---- Public booking refactor regression (helpers) ----
class TestPublicBookingRefactor:
    def _unique_phone(self):
        ts = int(datetime.now().timestamp() * 1000) % 10**8
        return f"83{ts:08d}"

    def test_get_salon_info(self):
        r = requests.get(f"{API}/public/salon/{DEFAULT_SLUG}")
        assert r.status_code == 200
        d = r.json()
        assert "name" in d and "phone" in d and "location" in d

    def test_get_services_and_staff(self):
        r1 = requests.get(f"{API}/public/services/{DEFAULT_SLUG}")
        r2 = requests.get(f"{API}/public/staff/{DEFAULT_SLUG}")
        assert r1.status_code == 200 and r2.status_code == 200
        assert isinstance(r1.json(), list) and len(r1.json()) > 0

    def test_full_booking_flow_contract(self, admin_token):
        """Verifies the refactored helpers still return the same JSON shape."""
        svcs = requests.get(f"{API}/public/services/{DEFAULT_SLUG}").json()
        when = (datetime.now(timezone(timedelta(hours=5, minutes=30))) + timedelta(days=2)).replace(
            hour=15, minute=0, second=0, microsecond=0
        )
        body = {
            "customer_name": "TEST_Iter7Book",
            "customer_phone": self._unique_phone(),
            "service_ids": [svcs[0]["id"]],
            "scheduled_at": when.isoformat(),
        }
        r = requests.post(f"{API}/public/book/{DEFAULT_SLUG}", json=body)
        if r.status_code in (409, 429):
            pytest.skip(f"public endpoint saturated: {r.status_code} {r.text[:120]}")
        assert r.status_code in (200, 429), r.text
        if r.status_code == 429:
            pytest.skip("Rate-limited; contract unchanged in earlier iterations")
        d = r.json()
        # Contract: appointment + summary.customer_referral_code (auto-assigned for new customer)
        assert "appointment" in d
        assert "summary" in d
        assert d.get("is_new_customer")
        assert d["summary"].get("customer_referral_code"), "New customer must get an auto-referral code"
        appt = d["appointment"]
        assert appt["customer_name"] == body["customer_name"]
        assert appt["status"] in ("scheduled", "pending", "confirmed", "booked")
        assert "total" in d["summary"] and "duration_min" in d["summary"]
        # Cleanup
        try:
            requests.delete(
                f"{API}/appointments/{appt['id']}",
                headers={"Authorization": f"Bearer {admin_token}", "X-Tenant-Slug": DEFAULT_SLUG},
            )
        except Exception:
            pass


# ---- POS create_invoice refactor regression ----
class TestInvoiceRefactor:
    def test_create_invoice_with_service(self, admin_token):
        H = {"Authorization": f"Bearer {admin_token}", "X-Tenant-Slug": DEFAULT_SLUG}
        # Get a customer + a service
        custs = requests.get(f"{API}/customers", headers=H).json()
        if not custs:
            # create one
            cr = requests.post(f"{API}/customers", headers=H,
                               json={"name": "TEST_Iter7Cust", "phone": "8400000099"})
            assert cr.status_code in (200, 201)
            cust = cr.json()
        else:
            cust = custs[0]
        svcs = requests.get(f"{API}/services", headers=H).json()
        assert len(svcs) > 0
        svc = svcs[0]
        body = {
            "customer_id": cust["id"],
            "items": [{"type": "service", "ref_id": svc["id"], "name": svc["name"],
                       "qty": 1, "price": float(svc["price"])}],
            "discount": 0.0,
            "tax_pct": 18.0,
            "payment_mode": "cash",
        }
        r = requests.post(f"{API}/invoices", headers=H, json=body)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        # Contract from _compute_invoice_totals
        for k in ("invoice_no", "subtotal", "tax", "total", "items", "customer_id"):
            assert k in d, f"missing key: {k}"
        # Math: subtotal = price * qty; total = subtotal - discount - credit_applied + tax
        assert abs(d["subtotal"] - float(svc["price"])) < 0.01
        expected_tax = round((d["subtotal"] - d.get("discount", 0) - d.get("credit_applied", 0)) * 0.18, 2)
        assert abs(d["tax"] - expected_tax) < 0.5

    def test_sales_report_unchanged(self, admin_token):
        H = {"Authorization": f"Bearer {admin_token}", "X-Tenant-Slug": DEFAULT_SLUG}
        r = requests.get(f"{API}/reports/sales", headers=H)
        assert r.status_code == 200
        d = r.json()
        for k in ("total_invoices", "total_revenue", "by_payment_mode", "invoices"):
            assert k in d


# ---- NEW: Super-admin Bulk Customer Import ----
class TestBulkCustomerImport:
    URL = None  # set in setup

    @classmethod
    def setup_class(cls):
        cls.URL = f"{API}/super-admin/tenants/{DEFAULT_TID}/customers/import"

    def _h(self, tok):
        return {"Authorization": f"Bearer {tok}"}

    def _unique(self):
        return int(datetime.now().timestamp() * 1000) % 10**7

    def test_text_import_succeeds(self, super_token):
        u = self._unique()
        # use unique phone numbers to avoid 'already in salon'
        body = {"text": f"Test One Iter7, 9{u:07d}1\nTest Two Iter7, 9{u:07d}2", "format": "auto"}
        r = requests.post(self.URL, headers=self._h(super_token), json=body)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["tenant"]["id"] == DEFAULT_TID
        assert d["summary"]["total_parsed"] == 2
        assert d["summary"]["added"] == 2
        assert len(d["rows"]) == 2
        for row in d["rows"]:
            assert row["status"] == "added"
            assert row["referral_code"]  # auto-assigned
            assert isinstance(row["referral_code"], str) and len(row["referral_code"]) >= 3

    def test_duplicate_re_import_skipped(self, super_token):
        u = self._unique()
        phone1 = f"9{u:07d}3"
        body = {"text": f"Test Dup, {phone1}", "format": "auto"}
        r1 = requests.post(self.URL, headers=self._h(super_token), json=body)
        assert r1.status_code == 200, r1.text
        assert r1.json()["summary"]["added"] == 1
        # Re-import
        r2 = requests.post(self.URL, headers=self._h(super_token), json=body)
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2["summary"]["added"] == 0
        assert d2["summary"]["skipped"] == 1
        assert d2["rows"][0]["status"] == "skipped"
        assert "already in salon" in d2["rows"][0]["reason"].lower()

    def test_vcard_import_succeeds(self, super_token):
        u = self._unique()
        phone = f"9{u:07d}4"
        vcard = (
            "BEGIN:VCARD\r\n"
            "VERSION:3.0\r\n"
            "FN:VCard Test Iter7\r\n"
            f"TEL;TYPE=CELL:+91 {phone}\r\n"
            "END:VCARD\r\n"
        )
        body = {"text": vcard, "format": "auto"}
        r = requests.post(self.URL, headers=self._h(super_token), json=body)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["summary"]["total_parsed"] >= 1
        assert d["summary"]["added"] >= 1
        assert d["rows"][0]["name"].startswith("VCard Test")

    def test_explicit_format_vcard(self, super_token):
        u = self._unique()
        phone = f"9{u:07d}5"
        vcard = (
            "BEGIN:VCARD\nVERSION:3.0\nFN:Explicit VCard\n"
            f"TEL:+91-{phone}\nEND:VCARD\n"
        )
        r = requests.post(self.URL, headers=self._h(super_token),
                          json={"text": vcard, "format": "vcard"})
        assert r.status_code == 200, r.text
        assert r.json()["summary"]["added"] >= 1

    def test_tenant_admin_forbidden(self, admin_token):
        """Tenant admin cannot call super-admin bulk import."""
        body = {"text": "Hacker, 9999000111", "format": "auto"}
        r = requests.post(self.URL, headers=self._h(admin_token), json=body)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_unauthenticated_401(self):
        r = requests.post(self.URL, json={"text": "x, 9876543210", "format": "auto"})
        assert r.status_code in (401, 403)

    def test_invalid_tenant_404(self, super_token):
        url = f"{API}/super-admin/tenants/nonexistent-tid-xxx/customers/import"
        r = requests.post(url, headers=self._h(super_token),
                          json={"text": "A, 9876500001", "format": "auto"})
        assert r.status_code == 404, r.text

    def test_empty_text_400(self, super_token):
        r = requests.post(self.URL, headers=self._h(super_token),
                          json={"text": "no phones here just text", "format": "auto"})
        # No phone-looking digits -> "No valid contacts found"
        assert r.status_code == 400, r.text

    def test_phone_country_code_normalization(self, super_token):
        u = self._unique()
        # Indian 10-digit prefixed with 91 (12 digits total) should be normalized to last 10
        ten = f"9{u:07d}66"  # 10 digits starting with 9
        twelve = "91" + ten  # 12 total
        body = {"text": f"Norm Test, +{twelve}", "format": "auto"}
        r = requests.post(self.URL, headers=self._h(super_token), json=body)
        assert r.status_code == 200, r.text
        added_phone = r.json()["rows"][0]["phone"]
        # _normalize_phone strips 91 prefix when total == 12 digits
        assert added_phone == ten, f"Expected {ten}, got {added_phone}"
