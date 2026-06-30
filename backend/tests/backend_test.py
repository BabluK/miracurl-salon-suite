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
            "service_ids": [], "scheduled_at": (datetime.now(timezone.utc) + timedelta(days=1)).replace(hour=12, minute=0, second=0, microsecond=0).isoformat(),
        })
        assert r.status_code in (400, 422)

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


# ---------------- Iteration 3: hardening ----------------
def _future_iso(days=1, hour_ist=14):
    """Build a future ISO datetime at given IST hour."""
    # build IST datetime
    ist_dt = datetime.now(timezone(timedelta(hours=5, minutes=30))) + timedelta(days=days)
    ist_dt = ist_dt.replace(hour=hour_ist, minute=0, second=0, microsecond=0)
    return ist_dt.isoformat()


def _unique_phone(prefix="98"):
    ts = int(datetime.now().timestamp() * 1000) % 10**8
    return f"{prefix}{ts:08d}"  # 10 digits


@pytest.fixture(scope="session")
def admin_session_iter3():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


class TestIter3Validation:
    """Server-side validation on /public/book"""

    def test_past_scheduled_at_rejected(self):
        svcs = requests.get(f"{API}/public/services").json()
        past = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        r = requests.post(f"{API}/public/book", json={
            "customer_name": "TEST_Past", "customer_phone": _unique_phone("90"),
            "service_ids": [svcs[0]["id"]], "scheduled_at": past,
        })
        assert r.status_code == 422, r.text
        assert "future" in r.text.lower()

    def test_business_hours_22_ist_rejected(self):
        svcs = requests.get(f"{API}/public/services").json()
        # 22:00 IST tomorrow
        ist = datetime.now(timezone(timedelta(hours=5, minutes=30))) + timedelta(days=1)
        ist = ist.replace(hour=22, minute=0, second=0, microsecond=0)
        r = requests.post(f"{API}/public/book", json={
            "customer_name": "TEST_Late", "customer_phone": _unique_phone("91"),
            "service_ids": [svcs[0]["id"]], "scheduled_at": ist.isoformat(),
        })
        assert r.status_code == 422, r.text
        assert "10:00" in r.text or "9:00" in r.text

    def test_invalid_phone_rejected(self):
        svcs = requests.get(f"{API}/public/services").json()
        r = requests.post(f"{API}/public/book", json={
            "customer_name": "TEST_BadPhone", "customer_phone": "123",
            "service_ids": [svcs[0]["id"]], "scheduled_at": _future_iso(1, 12),
        })
        assert r.status_code == 422, r.text
        assert "phone" in r.text.lower()


class TestIter3CustomerUpdate:
    """Existing-phone booking should update name/email"""

    def test_existing_phone_updates_name_email(self, admin_session_iter3):
        svcs = requests.get(f"{API}/public/services").json()
        phone = _unique_phone("92")
        # First booking
        r1 = requests.post(f"{API}/public/book", json={
            "customer_name": "TEST_Original", "customer_phone": phone,
            "customer_email": "orig@test.com",
            "service_ids": [svcs[0]["id"]], "scheduled_at": _future_iso(1, 11),
        })
        assert r1.status_code == 200, r1.text
        # Second booking with same phone but different name/email
        r2 = requests.post(f"{API}/public/book", json={
            "customer_name": "TEST_Updated", "customer_phone": phone,
            "customer_email": "updated@test.com",
            "service_ids": [svcs[0]["id"]], "scheduled_at": _future_iso(2, 11),
        })
        assert r2.status_code == 200, r2.text
        # Verify via /api/customers
        cr = admin_session_iter3.get(f"{API}/customers", params={"q": phone})
        rows = [c for c in cr.json() if c["phone"] == phone]
        assert len(rows) == 1
        assert rows[0]["name"] == "TEST_Updated"
        assert rows[0]["email"] == "updated@test.com"
        admin_session_iter3.delete(f"{API}/customers/{rows[0]['id']}")


class TestIter3Referral:
    """Refer-a-friend flow"""

    def test_referral_flow_a_then_b_both_get_credit(self, admin_session_iter3):
        svcs = requests.get(f"{API}/public/services").json()
        phone_a = _unique_phone("93")
        phone_b = _unique_phone("94")
        # Customer A books
        rA = requests.post(f"{API}/public/book", json={
            "customer_name": "TEST_RefA", "customer_phone": phone_a,
            "service_ids": [svcs[0]["id"]], "scheduled_at": _future_iso(1, 12),
        })
        assert rA.status_code == 200, rA.text
        code_a = rA.json()["summary"]["customer_referral_code"]
        assert code_a and len(code_a) == 6

        # validate referral lookup
        rv = requests.get(f"{API}/public/referral/{code_a}")
        assert rv.status_code == 200
        assert rv.json()["referrer_name"] == "TEST_RefA"

        # Customer B books with A's code
        rB = requests.post(f"{API}/public/book", json={
            "customer_name": "TEST_RefB", "customer_phone": phone_b,
            "service_ids": [svcs[0]["id"]], "scheduled_at": _future_iso(2, 13),
            "referral_code": code_a,
        })
        assert rB.status_code == 200, rB.text
        assert rB.json().get("referral_applied") is not None
        assert rB.json()["referral_applied"]["referrer_name"] == "TEST_RefA"

        # Both have ₹100 credit
        cs = admin_session_iter3.get(f"{API}/customers").json()
        ca = next(c for c in cs if c["phone"] == phone_a)
        cb = next(c for c in cs if c["phone"] == phone_b)
        assert ca["referral_credit"] >= 100
        assert cb["referral_credit"] >= 100
        # cleanup
        admin_session_iter3.delete(f"{API}/customers/{ca['id']}")
        admin_session_iter3.delete(f"{API}/customers/{cb['id']}")

    def test_invalid_referral_code_404(self):
        r = requests.get(f"{API}/public/referral/INVALID")
        assert r.status_code == 404


class TestIter3InvoiceStock:
    """Stock check + referral credit applied as discount on invoice"""

    def test_invoice_insufficient_stock_rejects_and_no_decrement(self, admin_session_iter3):
        # Pick a product, request qty > stock
        products = admin_session_iter3.get(f"{API}/products").json()
        prod = sorted(products, key=lambda p: p["stock"])[0]  # lowest stock
        original_stock = prod["stock"]
        cust = admin_session_iter3.get(f"{API}/customers").json()[0]
        payload = {
            "customer_id": cust["id"],
            "items": [{"type": "product", "ref_id": prod["id"], "name": prod["name"],
                       "qty": original_stock + 10, "price": prod["price"]}],
            "tax_pct": 18, "payment_mode": "cash",
        }
        r = admin_session_iter3.post(f"{API}/invoices", json=payload)
        assert r.status_code == 400, r.text
        assert "insufficient stock" in r.text.lower()
        # verify stock NOT decremented
        p2 = admin_session_iter3.get(f"{API}/products").json()
        same = next(x for x in p2 if x["id"] == prod["id"])
        assert same["stock"] == original_stock

    def test_referral_credit_applied_as_discount(self, admin_session_iter3):
        # Create a TEST customer with referral_credit=100 manually via direct create
        r = admin_session_iter3.post(f"{API}/customers", json={
            "name": "TEST_CreditUser", "phone": _unique_phone("95"),
            "email": "credit@test.com",
        })
        assert r.status_code == 200
        cust = r.json()
        # Inject referral_credit via PUT? CustomerIn doesn't expose it. Use the referral flow instead.
        # Simpler: directly via mongo not possible from test → use referral flow
        # Create a referrer
        rA = admin_session_iter3.post(f"{API}/customers", json={
            "name": "TEST_Referrer", "phone": _unique_phone("96"),
        })
        referrer = rA.json()
        # Look up referrer via list to get referral_code
        all_c = admin_session_iter3.get(f"{API}/customers").json()
        referrer_full = next(c for c in all_c if c["id"] == referrer["id"])
        code = referrer_full["referral_code"]
        # Delete the test customer we just created, then make them via /public/book with referral
        admin_session_iter3.delete(f"{API}/customers/{cust['id']}")
        phone_new = _unique_phone("97")
        svcs = requests.get(f"{API}/public/services").json()
        rB = requests.post(f"{API}/public/book", json={
            "customer_name": "TEST_CreditUser2", "customer_phone": phone_new,
            "service_ids": [svcs[0]["id"]], "scheduled_at": _future_iso(3, 14),
            "referral_code": code,
        })
        assert rB.status_code == 200, rB.text
        # Find the new customer
        all_c = admin_session_iter3.get(f"{API}/customers").json()
        new_cust = next(c for c in all_c if c["phone"] == phone_new)
        assert new_cust["referral_credit"] >= 100

        # Create an invoice for them: subtotal=500
        svc = svcs[0]
        payload = {
            "customer_id": new_cust["id"],
            "items": [{"type": "service", "ref_id": svc["id"], "name": svc["name"],
                       "qty": 1, "price": 500}],
            "tax_pct": 0, "payment_mode": "cash",
        }
        ri = admin_session_iter3.post(f"{API}/invoices", json=payload)
        assert ri.status_code == 200, ri.text
        inv = ri.json()
        # Discount should include ₹100 referral credit
        assert inv["discount"] >= 100, f"Expected discount >= 100, got {inv['discount']}"
        # Total should reflect deduction: 500 - 100 = 400
        assert inv["total"] == 400, f"Expected total 400, got {inv['total']}"
        # Customer's credit decremented
        c_after = admin_session_iter3.get(f"{API}/customers/{new_cust['id']}").json()
        assert c_after["referral_credit"] < new_cust["referral_credit"]
        # cleanup
        admin_session_iter3.delete(f"{API}/customers/{new_cust['id']}")
        admin_session_iter3.delete(f"{API}/customers/{referrer['id']}")


class TestIter3RoleBasedDelete:
    """DELETE on /customers, /services, /staff, /products requires admin role"""

    def _register_staff(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        email = f"test_staff_{int(datetime.now().timestamp()*1000)}@test.com"
        r = s.post(f"{API}/auth/register", json={
            "email": email, "password": "Staff@1234", "name": "Test Staff"
        })
        assert r.status_code == 200, r.text
        token = r.json()["access_token"]
        # verify role is staff
        assert r.json()["user"]["role"] == "staff"
        s.headers.update({"Authorization": f"Bearer {token}"})
        return s

    def test_staff_cannot_delete(self, admin_session_iter3):
        staff_sess = self._register_staff()
        # try delete on each
        for ep in ["/customers/fake", "/services/fake", "/staff/fake", "/products/fake"]:
            r = staff_sess.delete(f"{API}{ep}")
            assert r.status_code == 403, f"{ep} expected 403 got {r.status_code}: {r.text}"
            assert "admin" in r.text.lower()

    def test_admin_can_delete(self, admin_session_iter3):
        # create a temp customer then admin deletes
        r = admin_session_iter3.post(f"{API}/customers", json={
            "name": "TEST_DelMe", "phone": _unique_phone("98"),
        })
        cid = r.json()["id"]
        r2 = admin_session_iter3.delete(f"{API}/customers/{cid}")
        assert r2.status_code == 200


class TestIter3RateLimit:
    """RUN LAST — exhausts the in-memory rate-limit bucket. Public booking IP-based bucket = 8 per 10min."""

    def test_rate_limit_kicks_in(self):
        svcs = requests.get(f"{API}/public/services").json()
        statuses = []
        for i in range(12):
            r = requests.post(f"{API}/public/book", json={
                "customer_name": f"TEST_RL{i}",
                "customer_phone": _unique_phone(f"7{i:01d}"),
                "service_ids": [svcs[0]["id"]],
                "scheduled_at": _future_iso(4 + i, 10),
            })
            statuses.append(r.status_code)
        # at least one 429 should appear in the 12 requests
        assert 429 in statuses, f"Expected 429 in burst, got {statuses}"


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
