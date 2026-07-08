"""
Iter 35 — Full regression test for Miracurl Salon Management SaaS.
Covers: auth, RBAC/security 403s, public booking E2E, CRM lifecycle,
CSV round-trips, QR poster, services preset, appointment WhatsApp/completion,
public discovery APIs.
"""
import io
import os
import time
import uuid
import pytest
import requests
from creds import password_for

def _read_frontend_env():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for line in open(p):
            if line.strip().startswith("REACT_APP_BACKEND_URL="):
                return line.strip().split("=", 1)[1]
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env()).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@miracurl.com", password_for("admin@miracurl.com"))
STAFF = ("priya.staff@miracurl.com", "Priya@Miracurl123")
SUPER = ("super@miracurl.com", password_for("super@miracurl.com"))
SLUG = "miracurl-marathahalli"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text[:200]}"
    return r.cookies["access_token"]


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(*ADMIN)}"}


@pytest.fixture(scope="module")
def staff_headers():
    return {"Authorization": f"Bearer {_login(*STAFF)}"}


@pytest.fixture(scope="module")
def super_headers():
    return {"Authorization": f"Bearer {_login(*SUPER)}"}


# ---------------- AUTH ----------------
class TestAuth:
    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]}, timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert "access_token" in r.cookies
        assert j.get("user", {}).get("role") in ("admin", "owner", "salon_admin", "manager")

    def test_staff_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": STAFF[0], "password": STAFF[1]}, timeout=20)
        assert r.status_code == 200
        assert "access_token" in r.cookies

    def test_super_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": SUPER[0], "password": SUPER[1]}, timeout=20)
        assert r.status_code == 200
        assert "access_token" in r.cookies

    def test_bad_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN[0], "password": "wrong"}, timeout=20)
        assert r.status_code in (400, 401, 403)


# ---------------- SECURITY / RBAC ----------------
class TestRBAC:
    """Staff must get 403 on admin-only endpoints; admin must get 200."""

    @pytest.mark.parametrize("path", [
        "/reports/dashboard",
        "/reports/sales",
        "/customers",
        "/customers/export",
    ])
    def test_staff_forbidden_get(self, staff_headers, path):
        r = requests.get(f"{API}{path}", headers=staff_headers, timeout=20)
        assert r.status_code == 403, f"{path} expected 403 got {r.status_code}"

    @pytest.mark.parametrize("path", [
        "/reports/dashboard",
        "/reports/sales",
        "/customers",
        "/customers/export",
    ])
    def test_admin_allowed_get(self, admin_headers, path):
        r = requests.get(f"{API}{path}", headers=admin_headers, timeout=30)
        assert r.status_code == 200, f"{path} expected 200 got {r.status_code} {r.text[:200]}"

    def test_staff_cannot_edit_staff(self, staff_headers, admin_headers):
        # Grab any staff id via admin, then try PUT via staff.
        rs = requests.get(f"{API}/staff", headers=admin_headers, timeout=20)
        assert rs.status_code == 200
        staff_list = rs.json()
        if not staff_list:
            pytest.skip("No staff exists")
        sid = staff_list[0]["id"]
        r = requests.put(f"{API}/staff/{sid}", headers=staff_headers, json={"name": "hax"}, timeout=20)
        assert r.status_code == 403


# ---------------- PUBLIC APIs ----------------
class TestPublicAPI:
    def test_public_salons_search(self):
        r = requests.get(f"{API}/public/salons", params={"q": "mira"}, timeout=20)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) > 0
        assert any("mira" in (s.get("slug", "") + s.get("name", "")).lower() for s in arr)

    def test_public_services_slug(self):
        r = requests.get(f"{API}/public/services/{SLUG}", timeout=20)
        assert r.status_code == 200
        svcs = r.json()
        assert isinstance(svcs, list)
        assert len(svcs) >= 30, f"expected 30+ services, got {len(svcs)}"
        missing_img = [s for s in svcs if not s.get("image_url")]
        assert not missing_img, f"{len(missing_img)} services missing image_url"

    def test_public_staff_slug(self):
        r = requests.get(f"{API}/public/staff/{SLUG}", timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_public_salon_slug(self):
        r = requests.get(f"{API}/public/salon/{SLUG}", timeout=20)
        assert r.status_code == 200
        assert r.json().get("slug") == SLUG


# ---------------- PUBLIC BOOKING + CRM LIFECYCLE ----------------
@pytest.fixture(scope="module")
def booking_context():
    """Create a fake public booking and hand back ids for downstream tests."""
    svcs = requests.get(f"{API}/public/services/{SLUG}", timeout=20).json()
    stf = requests.get(f"{API}/public/staff/{SLUG}", timeout=20).json()
    assert svcs and stf, "need services and staff"
    svc = svcs[0]
    stylist = stf[0]
    # schedule 2 days ahead so it appears "upcoming"
    from datetime import datetime, timedelta, timezone
    when = (datetime.now(timezone.utc) + timedelta(days=2)).replace(microsecond=0).isoformat()
    unique = uuid.uuid4().hex[:6]
    payload = {
        "customer_name": f"TESTBOOK_{unique}",
        "customer_phone": f"9{int(time.time()) % 10**9:09d}",
        "gender": "Female",
        "service_ids": [svc["id"]],
        "staff_id": stylist["id"],
        "scheduled_at": when,
    }
    r = requests.post(f"{API}/public/book/{SLUG}", json=payload, timeout=25)
    if r.status_code in (409, 429):
        pytest.skip(f"public endpoint saturated: {r.status_code} {r.text[:120]}")
    assert r.status_code in (200, 201), f"public book failed {r.status_code}: {r.text[:300]}"
    appt = r.json()
    if "appointment" in appt:
        appt = appt["appointment"]
    assert appt.get("id"), f"no appt id in {appt}"
    ctx = {"appt_id": appt["id"], "phone": payload["customer_phone"], "name": payload["customer_name"],
           "gender": "Female", "svc": svc, "stylist": stylist, "payload": payload}
    yield ctx
    # cleanup — admin deletes appointment; customer cleanup best-effort
    try:
        tok = _login(*ADMIN)
        h = {"Authorization": f"Bearer {tok}"}
        requests.delete(f"{API}/appointments/{ctx['appt_id']}", headers=h, timeout=10)
        # delete any TESTBOOK customer that was created on completion
        clist = requests.get(f"{API}/customers", headers=h, params={"q": "TESTBOOK_"}, timeout=15)
        if clist.status_code == 200:
            for c in clist.json():
                if c.get("name", "").startswith("TESTBOOK_"):
                    requests.delete(f"{API}/customers/{c['id']}", headers=h, timeout=10)
    except Exception:
        pass


class TestBookingCRMLifecycle:
    def test_booking_customer_not_in_crm_yet(self, booking_context, admin_headers):
        """Public booking must NOT show up in CRM until completed."""
        r = requests.get(f"{API}/customers", headers=admin_headers, params={"q": "TESTBOOK_"}, timeout=15)
        assert r.status_code == 200
        matches = [c for c in r.json() if c.get("name", "") == booking_context["name"]]
        assert not matches, "new public booking must not appear in CRM before completion"

    def test_confirm_returns_whatsapp_url(self, booking_context, admin_headers):
        aid = booking_context["appt_id"]
        r = requests.put(f"{API}/appointments/{aid}/status",
                         json={"status": "confirmed"}, headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text[:300]
        j = r.json()
        assert j.get("appointment", {}).get("status") == "confirmed"
        assert j.get("whatsapp_url"), "confirm should return whatsapp_url"
        assert "wa.me" in j["whatsapp_url"]

    def test_complete_creates_crm_customer(self, booking_context, admin_headers):
        aid = booking_context["appt_id"]
        r = requests.put(f"{API}/appointments/{aid}/status",
                         json={"status": "completed"}, headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text[:300]
        j = r.json()
        assert j.get("crm_updated")
        # Now the customer must appear in CRM
        c = requests.get(f"{API}/customers", headers=admin_headers,
                         params={"q": booking_context["name"]}, timeout=15)
        assert c.status_code == 200
        matches = [x for x in c.json() if x.get("name") == booking_context["name"]]
        assert matches, "customer should be present in CRM after completion"
        cust = matches[0]
        assert cust.get("visits", 0) >= 1
        assert (cust.get("total_spent") or 0) > 0
        assert cust.get("last_visited"), "last_visited must be set"
        assert (cust.get("gender") or "").lower() == "female"


# ---------------- APPOINTMENTS ----------------
class TestAppointments:
    def test_list_appointments(self, admin_headers):
        r = requests.get(f"{API}/appointments", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------- CSV ROUND-TRIP ----------------
class TestCSV:
    def _roundtrip(self, admin_headers, export_path, import_path, required_col):
        r = requests.get(f"{API}{export_path}", headers=admin_headers, timeout=25)
        assert r.status_code == 200, f"{export_path} -> {r.status_code}"
        content = r.content
        assert required_col in content.decode("utf-8", errors="ignore").splitlines()[0].lower()
        files = {"file": ("import.csv", io.BytesIO(content), "text/csv")}
        r2 = requests.post(f"{API}{import_path}", headers=admin_headers, files=files, timeout=45)
        assert r2.status_code == 200, f"{import_path} -> {r2.status_code}: {r2.text[:200]}"
        j = r2.json()
        assert "added" in j or "updated" in j or "skipped" in j

    def test_services_roundtrip(self, admin_headers):
        self._roundtrip(admin_headers, "/services/export", "/services/import", "name")

    def test_customers_roundtrip(self, admin_headers):
        self._roundtrip(admin_headers, "/customers/export", "/customers/import", "name")

    def test_products_roundtrip(self, admin_headers):
        self._roundtrip(admin_headers, "/products/export", "/products/import", "name")

    def test_non_csv_rejected(self, admin_headers):
        files = {"file": ("bogus.txt", io.BytesIO(b"hello world"), "text/plain")}
        r = requests.post(f"{API}/services/import", headers=admin_headers, files=files, timeout=15)
        assert r.status_code == 400, f"expected 400 got {r.status_code}"


# ---------------- QR POSTER ----------------
class TestQRPoster:
    def test_requires_auth(self):
        r = requests.get(f"{API}/settings/qr-poster",
                         params={"origin": "https://x.example"}, timeout=20)
        assert r.status_code in (401, 403)

    def test_returns_png(self, admin_headers):
        r = requests.get(f"{API}/settings/qr-poster",
                         params={"origin": "https://x.example"},
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("image/png")
        # PNG signature
        assert r.content[:8] == b"\x89PNG\r\n\x1a\n"


# ---------------- SERVICES PRESET ----------------
class TestServicesPreset:
    def test_import_preset(self, admin_headers):
        r = requests.post(f"{API}/services/import-preset", headers=admin_headers, timeout=45)
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        assert "added" in j and "updated" in j


# ---------------- REPORTS / DASHBOARD ----------------
class TestReports:
    def test_dashboard_kpis(self, admin_headers):
        r = requests.get(f"{API}/reports/dashboard", headers=admin_headers, timeout=25)
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j, dict)

    def test_sales(self, admin_headers):
        r = requests.get(f"{API}/reports/sales", headers=admin_headers, timeout=25)
        assert r.status_code == 200


# ---------------- STAFF PORTAL ----------------
class TestStaffPortal:
    def test_staff_profile(self, staff_headers):
        r = requests.get(f"{API}/staff/me/profile", headers=staff_headers, timeout=20)
        assert r.status_code == 200
        assert r.json().get("email") == STAFF[0] or r.json().get("id")

    def test_attendance_today_admin(self, admin_headers):
        r = requests.get(f"{API}/attendance/today", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), (list, dict))
