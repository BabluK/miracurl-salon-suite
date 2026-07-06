"""Iter 49 regressions:
- Cookie-only auth (no access_token in body)
- Logout clears cookies
- Signup-salon cookie-only
- Evening + Morning Mira briefing (audio)
- Super-admin monthly report role guard & call
- Staff registry search regression (Aadhaar pepper migration)
- Products CSV import regression (POST /products/import)
- POS invoice creation regression (loyalty helper refactor)
"""
import io
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
TENANT = "miracurl-marathahalli"

ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PW = "q6QY@tn3p#9DtL"
SUPER_EMAIL = "super@miracurl.com"
SUPER_PW = "og9T@41Es#OQb6"


# ---------- helpers ----------
def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return s, r


@pytest.fixture(scope="module")
def admin_session():
    s, _ = _login(ADMIN_EMAIL, ADMIN_PW)
    s.headers.update({"X-Tenant-Slug": TENANT})
    return s


@pytest.fixture(scope="module")
def super_session():
    s, _ = _login(SUPER_EMAIL, SUPER_PW)
    return s


# ============ AUTH REGRESSION ============
class TestAuthCookieOnly:
    def test_login_no_token_in_body(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "access_token" not in body, f"Body must not contain access_token: {body}"
        assert "refresh_token" not in body
        assert "token" not in body
        assert "user" in body and body["user"].get("email") == ADMIN_EMAIL
        # cookies set
        cookies = r.cookies
        assert "access_token" in cookies
        assert "refresh_token" in cookies

    def test_me_works_via_cookie_only(self):
        s, _ = _login(ADMIN_EMAIL, ADMIN_PW)
        # no Authorization header at all
        r = s.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["email"] == ADMIN_EMAIL

    def test_logout_clears_cookies_and_me_401(self):
        s, _ = _login(ADMIN_EMAIL, ADMIN_PW)
        r = s.post(f"{API}/auth/logout", timeout=30)
        assert r.status_code == 200
        # In the same session, cookies should be gone
        r2 = s.get(f"{API}/auth/me", timeout=30)
        assert r2.status_code in (401, 403), f"expected 401/403 after logout, got {r2.status_code}"


# ============ SIGNUP SALON REGRESSION ============
class TestSignupSalonCookieOnly:
    def test_signup_salon_no_token_in_body(self):
        uniq = uuid.uuid4().hex[:8]
        payload = {
            "salon_name": f"TEST_Salon_{uniq}",
            "owner_name": "Test Owner",
            "owner_email": f"test_owner_{uniq}@example.com",
            "password": "Sup3r!Secret_pw",
            "phone": "9998887777",
            "city": "Bangalore",
        }
        r = requests.post(f"{API}/public/signup-salon", json=payload, timeout=45)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" not in body
        assert "token" not in body
        assert "user" in body and "tenant" in body
        # cookies set
        assert "access_token" in r.cookies


# ============ MIRA BRIEFINGS ============
class TestMiraBriefings:
    def test_morning_briefing_ok(self, admin_session):
        r = admin_session.get(f"{API}/reports/morning-briefing", timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "salutation" in body and "yesterday_revenue" in body

    def test_morning_briefing_audio_ok(self, admin_session):
        # single call only (LLM credits)
        r = admin_session.get(f"{API}/reports/morning-briefing/audio?lang=en", timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("audio_b64") and len(body["audio_b64"]) > 100
        assert body.get("text")

    def test_evening_briefing_audio_en(self, admin_session):
        r = admin_session.get(f"{API}/reports/evening-briefing/audio?lang=en", timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("audio_b64") and len(body["audio_b64"]) > 100
        assert body.get("text")
        assert body.get("ask_restock") is False
        assert body.get("lang") == "en"

    def test_evening_briefing_audio_hi(self, admin_session):
        r = admin_session.get(f"{API}/reports/evening-briefing/audio?lang=hi", timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("audio_b64")
        assert body.get("lang") == "hi"


# ============ SUPER ADMIN MONTHLY REPORT ============
class TestMonthlyReport:
    def test_forbid_salon_admin(self, admin_session):
        r = admin_session.post(f"{API}/super-admin/send-monthly-report", json={"tenant_id": None}, timeout=30)
        assert r.status_code == 403, f"salon admin should be forbidden, got {r.status_code}"

    def test_super_admin_specific_tenant(self, super_session):
        # find a tenant that has no email to avoid spamming; else pass a fake tenant_id
        tenants = super_session.get(f"{API}/super-admin/tenants", timeout=30).json()
        assert isinstance(tenants, list) and tenants
        # Prefer 'Email Test Salon' if available; else use first tenant with no owner email
        target = None
        for t in tenants:
            name = (t.get("name") or "").lower()
            if "email test" in name or "test" in name:
                target = t; break
        if target is None:
            target = tenants[0]
        r = super_session.post(f"{API}/super-admin/send-monthly-report", json={"tenant_id": target["id"]}, timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "sent" in body or "failed" in body or "results" in body or "message" in body


# ============ STAFF REGISTRY (Aadhaar pepper migration) ============
class TestRegistrySearch:
    def test_registry_employees_search(self, admin_session):
        r = admin_session.get(f"{API}/registry/employees?q=priya", timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)


# ============ PRODUCTS CSV IMPORT ============
class TestProductsCSVImport:
    def test_products_import_route_exists(self, admin_session):
        csv_body = (
            "name,category,price,stock\n"
            f"TEST_Product_{uuid.uuid4().hex[:6]},Care,199,10\n"
        )
        files = {"file": ("products.csv", io.BytesIO(csv_body.encode()), "text/csv")}
        r = admin_session.post(f"{API}/products/import", files=files, timeout=45)
        assert r.status_code == 200, f"products/import returned {r.status_code}: {r.text[:400]}"
        body = r.json()
        assert "added" in body and "updated" in body and "skipped" in body


# ============ POS INVOICE ============
class TestInvoiceCreate:
    def test_invoice_totals(self, admin_session):
        # fetch customer + staff + service
        customers = admin_session.get(f"{API}/customers", timeout=30).json()
        staff = admin_session.get(f"{API}/staff", timeout=30).json()
        services = admin_session.get(f"{API}/services", timeout=30).json()
        assert customers and staff and services
        svc = services[0]
        payload = {
            "customer_id": customers[0]["id"],
            "staff_id": staff[0]["id"],
            "items": [{
                "type": "service",
                "ref_id": svc["id"],
                "name": svc.get("name", "Svc"),
                "price": float(svc.get("price", 100)),
                "qty": 1,
            }],
            "payment_mode": "cash",
        }
        r = admin_session.post(f"{API}/invoices", json=payload, timeout=45)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "total" in body and body["total"] > 0
        assert "subtotal" in body
