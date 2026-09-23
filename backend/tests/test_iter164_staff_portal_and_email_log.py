"""Iter 164 backend tests: staff /salon-today, bank-details account_number, HQ email-log clear."""
import os
import pytest
import requests
from pathlib import Path
import os as _os
import sys as _sys

_sys.path.insert(0, _os.path.dirname(__file__))
from _creds import password_for  # noqa: E402
from _creds import pw

def _load_frontend_env():
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return os.environ.get("REACT_APP_BACKEND_URL")

BASE = _load_frontend_env().rstrip("/")
TENANT = "miracurl-marathahalli"
STAFF_EMAIL = "priya.staff@miracurl.com"
STAFF_PASS = pw("STAFF")
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD")
SUPER_EMAIL = "super@miracurl.com"
SUPER_PASS = pw("SUPER_ADMIN")


def _login(email, pwd, tenant=None):
    s = requests.Session()
    headers = {"Content-Type": "application/json"}
    if tenant:
        headers["X-Tenant-Slug"] = tenant
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pwd}, headers=headers)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    if tenant:
        s.headers["X-Tenant-Slug"] = tenant
    csrf = s.cookies.get("csrf_token") or s.cookies.get("csrf")
    if csrf:
        s.headers["X-CSRF-Token"] = csrf
    return s


@pytest.fixture(scope="module")
def staff_session():
    return _login(STAFF_EMAIL, STAFF_PASS, TENANT)


@pytest.fixture(scope="module")
def admin_session():
    return _login(ADMIN_EMAIL, ADMIN_PASS, TENANT)


@pytest.fixture(scope="module")
def super_session():
    return _login(SUPER_EMAIL, SUPER_PASS)


# ---- Staff /salon-today ----
class TestSalonToday:
    def test_staff_salon_today_returns_numeric_fields(self, staff_session):
        r = staff_session.get(f"{BASE}/api/staff/me/salon-today")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "today" in d and "yesterday" in d
        for k in ("date", "cash", "upi", "card", "total", "bills", "bookings"):
            assert k in d["today"], f"missing {k} in today"
            assert k in d["yesterday"], f"missing {k} in yesterday"
        for k in ("cash", "upi", "card", "total"):
            assert isinstance(d["today"][k], (int, float))
        for k in ("bills", "bookings"):
            assert isinstance(d["today"][k], int)

    def test_admin_forbidden_salon_today(self, admin_session):
        r = admin_session.get(f"{BASE}/api/staff/me/salon-today")
        # Admin user is not linked to a staff record → 403
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"


# ---- Bank details account_number ----
class TestBankDetails:
    def test_put_bank_details_with_valid_account_number(self, staff_session):
        payload = {
            "bank_name": "Axis Bank",
            "ifsc": "UTIB0001234",
            "account_holder": "Priya Sharma",
            "account_number": "501001234567891234",
        }
        r = staff_session.put(f"{BASE}/api/staff/me/bank-details", json=payload)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # Verify GET reflects it
        p = staff_session.get(f"{BASE}/api/staff/me/profile")
        assert p.status_code == 200
        bd = p.json().get("bank_details") or {}
        assert bd.get("account_number") == "501001234567891234"
        assert bd.get("ifsc") == "UTIB0001234"

    def test_put_bank_details_non_digit_account_rejected(self, staff_session):
        payload = {
            "bank_name": "Axis Bank",
            "ifsc": "UTIB0001234",
            "account_holder": "Priya Sharma",
            "account_number": "ABCDEF1234",  # letters not allowed
        }
        r = staff_session.put(f"{BASE}/api/staff/me/bank-details", json=payload)
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"


# ---- Super Admin email-log clear ----
class TestEmailLogClear:
    def test_clear_email_log_super_admin(self, super_session):
        r = super_session.delete(f"{BASE}/api/super-admin/email-log")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        assert "deleted" in d and isinstance(d["deleted"], int)

    def test_clear_email_log_forbidden_for_tenant_admin(self, admin_session):
        r = admin_session.delete(f"{BASE}/api/super-admin/email-log")
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
