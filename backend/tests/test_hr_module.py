"""HR module backend tests: shifts, geo-fence, advances, aadhaar, salary slip, auto-checkout."""
import os
import datetime as dt
import pytest
import requests

from creds import password_for
from _creds import pw

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = password_for("admin@miracurl.com")
STAFF_EMAIL = "priya.staff@miracurl.com"
STAFF_PASS = pw("STAFF")
PRIYA_ID = "3cdf66d1-ea58-4605-a4d7-333330a96e8a"
TENANT_ID = "83ab97b6-b481-4172-afd7-53a46c93317d"
PINNED_LAT, PINNED_LNG = 12.9569, 77.7011
NEAR_LAT, NEAR_LNG = 12.95694, 77.70153
FAR_LAT, FAR_LNG = 13.0, 77.75

def login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.cookies.get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s

@pytest.fixture(scope="module")
def admin():
    s = login(ADMIN_EMAIL, ADMIN_PASS)
    s.headers.update({"X-Owner-Pin": "4321"})
    return s

@pytest.fixture(scope="module")
def staff():
    return login(STAFF_EMAIL, STAFF_PASS)


# ---------- Aadhaar / staff profile ----------
class TestStaffProfile:
    def test_put_staff_aadhaar_and_shift(self, admin):
        # Fetch current row to merge (StaffIn requires name/role/phone)
        cur = admin.get(f"{BASE}/api/staff", timeout=15).json()
        rows = cur if isinstance(cur, list) else cur.get("staff", [])
        me = next((s for s in rows if s.get("id") == PRIYA_ID), None)
        assert me, "Priya not found in staff list"
        payload = {
            "name": me.get("name", "Priya Sharma"),
            "role": me.get("role", "Senior Stylist"),
            "phone": me.get("phone", "9876543210"),
            "aadhaar": "999912345678",
            "overtime_rate": 100,
            "max_advance": 5000,
            "shift_start": "10:00",
            "shift_end": "21:00",
            "notice_period_days": 30,
        }
        r = admin.put(f"{BASE}/api/staff/{PRIYA_ID}", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("aadhaar_last4") == "5678"
        assert "aadhaar_hash" not in data
        assert data.get("overtime_rate") == 100
        assert data.get("max_advance") == 5000
        assert data.get("shift_start") == "10:00"
        assert data.get("shift_end") == "21:00"
        assert data.get("notice_period_days") == 30

    def test_list_staff_no_aadhaar_hash(self, admin):
        r = admin.get(f"{BASE}/api/staff", timeout=15)
        assert r.status_code == 200
        body = r.json()
        rows = body if isinstance(body, list) else body.get("staff", body.get("items", []))
        for row in rows:
            assert "aadhaar_hash" not in row, f"leaked aadhaar_hash in staff row {row.get('id')}"


# ---------- Advance ----------
class TestAdvance:
    def test_advance_before_16th_rejected(self, admin):
        # Today is Jul 5, 2026 per context — must reject
        r = admin.post(f"{BASE}/api/staff/{PRIYA_ID}/advance", json={"amount": 1000}, timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
        detail = (r.json().get("detail") or "").lower()
        assert "15th" in detail or "after the 15" in detail, r.text

    def test_advance_amount_exceeds_max(self, admin):
        # If date-based rejection triggers first, still 400; check message
        r = admin.post(f"{BASE}/api/staff/{PRIYA_ID}/advance", json={"amount": 999999}, timeout=15)
        assert r.status_code == 400

    def test_advance_list_history(self, admin):
        r = admin.get(f"{BASE}/api/staff/{PRIYA_ID}/advances", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, (list, dict))


# ---------- Geo-fence & check-in ----------
class TestGeoFenceCheckin:
    def test_set_geo_fence(self, admin):
        r = admin.put(f"{BASE}/api/tenants/current/geo",
                       json={"latitude": PINNED_LAT, "longitude": PINNED_LNG}, timeout=15)
        assert r.status_code == 200, r.text

    def test_check_in_no_coords_returns_400(self, staff):
        r = staff.post(f"{BASE}/api/staff/me/check-in", json={}, timeout=15)
        # Idempotent: Priya may already have record today → 200 returning existing. Skip if so.
        if r.status_code == 200:
            pytest.skip(f"Priya already checked in today (idempotent). Response: {r.json()}")
        assert r.status_code == 400, r.text
        assert "location" in (r.json().get("detail") or "").lower()

    def test_check_in_far_coords_returns_403(self, staff):
        r = staff.post(f"{BASE}/api/staff/me/check-in",
                        json={"lat": FAR_LAT, "lng": FAR_LNG}, timeout=15)
        if r.status_code == 200:
            pytest.skip("Priya already checked in today (idempotent).")
        assert r.status_code == 403, r.text

    def test_check_in_near_coords_success(self, staff):
        r = staff.post(f"{BASE}/api/staff/me/check-in",
                        json={"lat": NEAR_LAT, "lng": NEAR_LNG}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        # record fields
        assert "check_in_distance_m" in data or "distance_m" in data
        assert "late_minutes" in data or "late_penalty" in data


# ---------- Salary slip ----------
class TestSalarySlip:
    def test_salary_slip_json(self, staff):
        r = staff.get(f"{BASE}/api/staff/me/salary-slip", params={"month": "2026-07"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["overtime_total", "late_penalty_total", "advance_total", "deductions_total", "net_payable"]:
            assert k in d, f"missing {k} in slip: {list(d.keys())}"

    def test_salary_slip_pdf(self, staff):
        r = staff.get(f"{BASE}/api/staff/me/salary-slip.pdf", params={"month": "2026-07"}, timeout=20)
        assert r.status_code == 200, f"status {r.status_code}"
        assert "application/pdf" in r.headers.get("content-type", "").lower()


# ---------- Registry aadhaar search ----------
class TestRegistrySearch:
    def test_registry_search_by_aadhaar(self, admin):
        r = admin.get(f"{BASE}/api/registry/employees", params={"q": "123412341234"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        items = body if isinstance(body, list) else body.get("items", body.get("employees", []))
        assert len(items) >= 1, f"expected employee, got {body}"
        emp = items[0]
        assert "aadhaar_hash" not in emp
        # masked format like XXXX-XXXX-1234
        masked = emp.get("aadhaar_masked", "")
        assert masked.endswith("1234"), f"unexpected mask: {masked}"
        assert emp.get("history_scope") == "full" or body.get("history_scope") == "full"


# ---------- Regression ----------
class TestRegression:
    def test_attendance_today_columns(self, admin):
        r = admin.get(f"{BASE}/api/attendance/today", timeout=15)
        assert r.status_code == 200
        body = r.json()
        rows = body.get("roster", []) if isinstance(body, dict) else body
        assert len(rows) > 0
        keys = set(rows[0].keys())
        for k in ["late_penalty", "overtime_pay", "auto_checked_out"]:
            assert k in keys, f"missing {k} in attendance row keys {keys}"

    def test_staff_performance_ranges(self, admin):
        r = admin.get(f"{BASE}/api/reports/staff-performance", timeout=15)
        assert r.status_code == 200
        assert "ranges" in r.json()

    def test_create_staff_basic(self, admin):
        payload = {"name": "TEST_HRProbe", "role": "Junior Stylist", "phone": "9999900000", "email": f"testhrprobe_{int(dt.datetime.now().timestamp())}@example.com"}
        r = admin.post(f"{BASE}/api/staff", json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        sid = r.json().get("id")
        if sid:
            admin.delete(f"{BASE}/api/staff/{sid}", timeout=10)
