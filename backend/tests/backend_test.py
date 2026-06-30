"""Miracurl Salon Management System - Backend API Tests"""
import os
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = "Miracurl@123"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data["access_token"]
    session.headers.update({"Authorization": f"Bearer {token}"})
    return data


# ---------------- Health ----------------
class TestHealth:
    def test_root(self, session):
        r = session.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# ---------------- Auth ----------------
class TestAuth:
    def test_login_success(self, session):
        r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
        assert r.status_code == 200
        d = r.json()
        assert "access_token" in d and "user" in d
        assert d["user"]["email"] == ADMIN_EMAIL
        # httpOnly cookies should be set
        assert "access_token" in r.cookies or "access_token" in r.headers.get("set-cookie", "")

    def test_login_wrong_password(self, session):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong-pass-xyz"})
        assert r.status_code == 401

    def test_me_with_bearer(self, auth, session):
        r = session.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_unauthed(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------------- Customers ----------------
class TestCustomers:
    def test_list_seeded(self, auth, session):
        r = session.get(f"{API}/customers")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 5

    def test_crud(self, auth, session):
        # create
        payload = {"name": "TEST_Customer", "phone": "9999000111", "email": "test_cust@test.com"}
        r = session.post(f"{API}/customers", json=payload)
        assert r.status_code == 200
        c = r.json()
        assert c["name"] == "TEST_Customer"
        assert "id" in c
        cid = c["id"]

        # get one
        r = session.get(f"{API}/customers/{cid}")
        assert r.status_code == 200
        assert r.json()["phone"] == "9999000111"

        # search
        r = session.get(f"{API}/customers", params={"q": "TEST_Customer"})
        assert r.status_code == 200
        assert any(x["id"] == cid for x in r.json())

        # update
        r = session.put(f"{API}/customers/{cid}", json={"name": "TEST_Updated", "phone": "9999000111"})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Updated"

        # delete
        r = session.delete(f"{API}/customers/{cid}")
        assert r.status_code == 200
        r = session.get(f"{API}/customers/{cid}")
        assert r.status_code == 404


# ---------------- Services ----------------
class TestServices:
    def test_list_seeded(self, auth, session):
        r = session.get(f"{API}/services")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 10

    def test_crud(self, auth, session):
        payload = {"name": "TEST_Service", "category": "Hair", "price": 100, "duration_min": 30}
        r = session.post(f"{API}/services", json=payload)
        assert r.status_code == 200
        sid = r.json()["id"]

        r = session.put(f"{API}/services/{sid}", json={"name": "TEST_Service2", "category": "Hair", "price": 150, "duration_min": 30})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Service2"

        r = session.delete(f"{API}/services/{sid}")
        assert r.status_code == 200


# ---------------- Staff ----------------
class TestStaff:
    def test_list_seeded(self, auth, session):
        r = session.get(f"{API}/staff")
        assert r.status_code == 200
        assert len(r.json()) >= 4

    def test_crud(self, auth, session):
        payload = {"name": "TEST_Staff", "role": "Stylist", "phone": "1112223333"}
        r = session.post(f"{API}/staff", json=payload)
        assert r.status_code == 200
        sid = r.json()["id"]
        r = session.delete(f"{API}/staff/{sid}")
        assert r.status_code == 200


# ---------------- Products ----------------
class TestProducts:
    def test_list_seeded(self, auth, session):
        r = session.get(f"{API}/products")
        assert r.status_code == 200
        assert len(r.json()) >= 6

    def test_crud(self, auth, session):
        payload = {"name": "TEST_Product", "category": "Hair Care", "sku": f"TEST-{datetime.now().timestamp()}",
                   "price": 100, "cost": 50, "stock": 10}
        r = session.post(f"{API}/products", json=payload)
        assert r.status_code == 200
        pid = r.json()["id"]
        r = session.delete(f"{API}/products/{pid}")
        assert r.status_code == 200


# ---------------- Appointments ----------------
class TestAppointments:
    def test_appointment_flow(self, auth, session):
        # get a customer, staff, service
        cust = session.get(f"{API}/customers").json()[0]
        staff = session.get(f"{API}/staff").json()[0]
        svc = session.get(f"{API}/services").json()[0]
        scheduled = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        payload = {
            "customer_id": cust["id"], "staff_id": staff["id"],
            "service_ids": [svc["id"]], "scheduled_at": scheduled,
        }
        r = session.post(f"{API}/appointments", json=payload)
        assert r.status_code == 200, r.text
        appt = r.json()
        aid = appt["id"]
        assert appt["total"] == svc["price"]

        # status update
        r = session.put(f"{API}/appointments/{aid}/status", json={"status": "completed"})
        assert r.status_code == 200
        assert r.json()["status"] == "completed"

        # list
        r = session.get(f"{API}/appointments")
        assert r.status_code == 200
        assert any(a["id"] == aid for a in r.json())

        # delete
        r = session.delete(f"{API}/appointments/{aid}")
        assert r.status_code == 200


# ---------------- Invoices / POS ----------------
class TestInvoices:
    def test_create_invoice(self, auth, session):
        cust = session.get(f"{API}/customers").json()[0]
        svc = session.get(f"{API}/services").json()[0]
        prod = session.get(f"{API}/products").json()[0]
        items = [
            {"type": "service", "ref_id": svc["id"], "name": svc["name"], "qty": 1, "price": svc["price"]},
            {"type": "product", "ref_id": prod["id"], "name": prod["name"], "qty": 1, "price": prod["price"]},
        ]
        payload = {"customer_id": cust["id"], "items": items, "tax_pct": 18, "payment_mode": "cash"}
        r = session.post(f"{API}/invoices", json=payload)
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv["invoice_no"].startswith("INV-")
        assert inv["total"] > 0
        assert inv["payment_mode"] == "cash"

        # list
        r = session.get(f"{API}/invoices")
        assert r.status_code == 200
        assert any(i["id"] == inv["id"] for i in r.json())


# ---------------- Reports ----------------
class TestReports:
    def test_dashboard(self, auth, session):
        r = session.get(f"{API}/reports/dashboard")
        assert r.status_code == 200
        d = r.json()
        for k in ["today_revenue", "today_bookings", "total_customers", "active_staff", "revenue_trend"]:
            assert k in d
        assert isinstance(d["revenue_trend"], list)
        assert len(d["revenue_trend"]) == 7

    def test_sales(self, auth, session):
        r = session.get(f"{API}/reports/sales")
        assert r.status_code == 200
        d = r.json()
        assert "total_invoices" in d and "total_revenue" in d


# ---------------- Public Booking (NO AUTH) ----------------
class TestPublicBooking:
    """Public customer-facing booking endpoints — must work WITHOUT auth."""

    def test_public_salon_no_auth(self):
        r = requests.get(f"{API}/public/salon")
        assert r.status_code == 200
        d = r.json()
        assert "name" in d and "tagline" in d and "hero_image" in d

    def test_public_services_no_auth(self):
        r = requests.get(f"{API}/public/services")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 1
        # only active services
        for s in data:
            assert s.get("active", True) is True
            assert "id" in s and "price" in s

    def test_public_staff_no_auth(self):
        r = requests.get(f"{API}/public/staff")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 1
        # sensitive fields should be excluded
        for s in data:
            assert "phone" not in s
            assert "email" not in s
            assert "commission_pct" not in s

    def test_public_book_creates_appointment_and_customer(self):
        svcs = requests.get(f"{API}/public/services").json()
        svc = svcs[0]
        ts = int(datetime.now().timestamp())
        phone = f"99888{ts % 100000:05d}"  # unique 10-digit phone
        scheduled = (datetime.now(timezone.utc) + timedelta(days=1)).replace(microsecond=0).isoformat()
        payload = {
            "customer_name": "TEST_PublicBook",
            "customer_phone": phone,
            "customer_email": "public@test.com",
            "service_ids": [svc["id"]],
            "scheduled_at": scheduled,
        }
        r = requests.post(f"{API}/public/book", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "appointment" in data and "summary" in data
        assert data["summary"]["total"] == svc["price"]
        assert data["summary"]["customer_name"] == "TEST_PublicBook"
        appt_id = data["appointment"]["id"]

        # Login as admin and verify appointment + customer visible
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        lr = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
        assert lr.status_code == 200
        s.headers.update({"Authorization": f"Bearer {lr.json()['access_token']}"})

        ar = s.get(f"{API}/appointments")
        assert ar.status_code == 200
        assert any(a["id"] == appt_id for a in ar.json()), "Public booking not visible to admin"

        cr = s.get(f"{API}/customers", params={"q": phone})
        assert cr.status_code == 200
        found = [c for c in cr.json() if c["phone"] == phone]
        assert len(found) == 1, "Customer not auto-created by public/book"

        # cleanup
        s.delete(f"{API}/appointments/{appt_id}")
        s.delete(f"{API}/customers/{found[0]['id']}")

    def test_public_book_validates_empty_services(self):
        r = requests.post(f"{API}/public/book", json={
            "customer_name": "TEST_x", "customer_phone": "9998887777",
            "service_ids": [], "scheduled_at": datetime.now(timezone.utc).isoformat(),
        })
        assert r.status_code == 400

    def test_public_book_with_specific_staff(self):
        staff_list = requests.get(f"{API}/public/staff").json()
        svcs = requests.get(f"{API}/public/services").json()
        target_staff = staff_list[0]
        ts = int(datetime.now().timestamp())
        phone = f"97777{ts % 100000:05d}"
        scheduled = (datetime.now(timezone.utc) + timedelta(days=2)).replace(microsecond=0).isoformat()
        r = requests.post(f"{API}/public/book", json={
            "customer_name": "TEST_StaffPick", "customer_phone": phone,
            "service_ids": [svcs[0]["id"]], "staff_id": target_staff["id"],
            "scheduled_at": scheduled,
        })
        assert r.status_code == 200, r.text
        assert r.json()["summary"]["staff_name"] == target_staff["name"]

    def test_protected_endpoints_still_require_auth(self):
        # Protected endpoints must still reject unauthenticated requests
        for ep in ["/customers", "/services", "/staff", "/appointments", "/invoices"]:
            r = requests.get(f"{API}{ep}")
            assert r.status_code == 401, f"{ep} should be 401 but got {r.status_code}"


# ---------------- Auth security ----------------
class TestAuthSecurity:
    def test_bcrypt_format_via_register_then_login(self, session):
        """Indirectly verifies bcrypt by registering a new user and logging in."""
        email = f"test_user_{int(datetime.now().timestamp())}@test.com"
        r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Pass@1234", "name": "Test"})
        assert r.status_code == 200
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "Pass@1234"})
        assert r.status_code == 200
        # httpOnly cookie present
        cookies_hdr = r.headers.get("set-cookie", "")
        assert "HttpOnly" in cookies_hdr or "httponly" in cookies_hdr.lower()
