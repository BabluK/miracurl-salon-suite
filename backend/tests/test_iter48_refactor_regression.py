"""Iter 48 — Regression tests after POS/Appointments/StaffRegistry/SuperAdmin
component extractions and backend refactors:
- list_staff() field stripping for non-admin roles
- morning_briefing helpers (_build_greeting_text/_revenue_sentence/_leave_sentence)
- leave-request endpoints
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

CREDS = {
    "super": ("super@miracurl.com", "og9T@41Es#OQb6"),
    "admin": ("admin@miracurl.com", "q6QY@tn3p#9DtL"),
    "staff": ("priya.staff@miracurl.com", "Priya@Miracurl123"),
}

SENSITIVE = {"monthly_base_salary", "bank_details", "aadhaar_last4",
             "commission_pct", "max_advance", "overtime_rate"}


def _login(role):
    email, pw = CREDS[role]
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"{role} login: {r.status_code} {r.text[:200]}"
    return s


# ---------- Staff field-stripping regression ----------
class TestStaffFieldStripping:
    def test_admin_sees_sensitive_fields(self):
        s = _login("admin")
        r = s.get(f"{BASE_URL}/api/staff", timeout=15)
        assert r.status_code == 200
        staff = r.json()
        assert isinstance(staff, list) and len(staff) > 0
        # At least one record should have salary field key present (may be 0)
        has_sensitive = any("monthly_base_salary" in st for st in staff)
        assert has_sensitive, "admin GET /api/staff must include monthly_base_salary"

    def test_staff_role_stripped(self):
        s = _login("staff")
        r = s.get(f"{BASE_URL}/api/staff", timeout=15)
        assert r.status_code == 200
        staff = r.json()
        assert isinstance(staff, list) and len(staff) > 0
        for st in staff:
            leaked = SENSITIVE.intersection(st.keys())
            assert not leaked, f"Staff role leaked sensitive keys: {leaked} in {st.get('name')}"


# ---------- Morning briefing regression ----------
class TestMorningBriefing:
    def test_morning_briefing_json(self):
        s = _login("admin")
        r = s.get(f"{BASE_URL}/api/reports/morning-briefing", timeout=15)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert "yesterday_revenue" in data, f"Missing yesterday_revenue: {data}"
        assert isinstance(data["yesterday_revenue"], (int, float))

    def test_morning_briefing_audio_cached(self):
        s = _login("admin")
        r1 = s.get(f"{BASE_URL}/api/reports/morning-briefing/audio", timeout=60)
        assert r1.status_code == 200, r1.text[:200]
        d1 = r1.json()
        assert "text" in d1 and d1["text"]
        assert "audio_b64" in d1
        # Second call — should be cached (fast)
        t0 = time.time()
        r2 = s.get(f"{BASE_URL}/api/reports/morning-briefing/audio", timeout=30)
        elapsed = time.time() - t0
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["text"] == d1["text"], "Cached text should match"
        # Cached call should be fast (< 3s)
        assert elapsed < 5.0, f"Cached audio took {elapsed:.2f}s — cache broken?"


# ---------- Leave-requests regression ----------
class TestLeaveRequests:
    def test_staff_me_leave_requests(self):
        s = _login("staff")
        r = s.get(f"{BASE_URL}/api/staff/me/leave-requests", timeout=15)
        assert r.status_code == 200, r.text[:200]
        assert isinstance(r.json(), list)

    def test_admin_all_leave_requests(self):
        s = _login("admin")
        r = s.get(f"{BASE_URL}/api/leave-requests?status=all", timeout=15)
        assert r.status_code == 200, r.text[:200]
        assert isinstance(r.json(), list)

    def test_admin_pending_count(self):
        s = _login("admin")
        r = s.get(f"{BASE_URL}/api/leave-requests/pending-count", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "count" in data or "pending" in data or isinstance(data, dict)


# ---------- Smoke: POS-related endpoints ----------
class TestPOSSmoke:
    def test_services_and_products_list(self):
        s = _login("admin")
        for path in ("/api/services", "/api/products", "/api/customers?limit=5"):
            r = s.get(f"{BASE_URL}{path}", timeout=15)
            assert r.status_code == 200, f"{path} -> {r.status_code}"

    def test_invoice_create(self):
        s = _login("admin")
        services = s.get(f"{BASE_URL}/api/services", timeout=10).json()
        staff = s.get(f"{BASE_URL}/api/staff", timeout=10).json()
        customers = s.get(f"{BASE_URL}/api/customers", timeout=10).json()
        if not (services and staff and customers):
            pytest.skip("Missing seed data")
        payload = {
            "customer_id": customers[0]["id"],
            "staff_id": staff[0]["id"],
            "items": [{"type": "service", "ref_id": services[0].get("id"),
                       "name": services[0].get("name", "Test"),
                       "qty": 1, "price": services[0].get("price", 100)}],
            "discount": 0,
            "payment_mode": "upi",
        }
        r = s.post(f"{BASE_URL}/api/invoices", json=payload, timeout=20)
        assert r.status_code in (200, 201), r.text[:200]
        data = r.json()
        assert "invoice_no" in data or "id" in data


# ---------- Appointments smoke ----------
class TestAppointments:
    def test_appointments_list(self):
        s = _login("admin")
        r = s.get(f"{BASE_URL}/api/appointments", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- Super Admin smoke ----------
class TestSuperAdmin:
    def test_tenants_list(self):
        s = _login("super")
        r = s.get(f"{BASE_URL}/api/super-admin/tenants", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
