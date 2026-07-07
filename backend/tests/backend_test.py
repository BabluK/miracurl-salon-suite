"""Miracurl Salon Management System - Backend API Tests"""
import os
import random
import pytest
import requests
from datetime import datetime, timezone, timedelta
from creds import password_for

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = password_for("admin@miracurl.com")


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
    token = r.cookies["access_token"]
    session.headers.update({"Authorization": f"Bearer {token}", "X-Owner-Pin": "4321"})
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
        assert "access_token" in r.cookies and "user" in d
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
        # get a customer, staff, service (avoid TEST_ rows — other workers delete them mid-run)
        custs = session.get(f"{API}/customers").json()
        cust = next((c for c in custs if not str(c.get("name", "")).upper().startswith("TEST")), custs[0])
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
        body = r.json()
        appt_out = body.get("appointment") or body
        assert appt_out["status"] == "completed"

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
        custs = session.get(f"{API}/customers").json()
        cust = next((c for c in custs if not str(c.get("name", "")).upper().startswith("TEST")), custs[0])
        svc = session.get(f"{API}/services").json()[0]
        prods = session.get(f"{API}/products").json()
        prod = next((p for p in prods if int(p.get("stock") or 0) > 0), None)
        if not prod:
            prod = prods[0]
            session.put(f"{API}/products/{prod['id']}", json={**{k: prod[k] for k in ("name", "category", "sku", "price", "cost") if k in prod}, "stock": 25})
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
        scheduled = _future_iso()
        payload = {
            "customer_name": "TEST_PublicBook",
            "customer_phone": phone,
            "customer_email": "public@test.com",
            "service_ids": [svc["id"]],
            "scheduled_at": scheduled,
        }
        r = requests.post(f"{API}/public/book", json=payload)
        if r.status_code == 429 or (r.status_code == 409):
            pytest.skip(f"public booking saturated/rate-limited: {r.status_code}")
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
        s.headers.update({"Authorization": f"Bearer {lr.cookies['access_token']}"})

        ar = s.get(f"{API}/appointments")
        assert ar.status_code == 200
        assert any(a["id"] == appt_id for a in ar.json()), "Public booking not visible to admin"

        # New CRM contract: public bookings stay "pending" (hidden) until the visit completes.
        cr = s.get(f"{API}/customers", params={"q": phone})
        assert cr.status_code == 200
        assert not [c for c in cr.json() if c["phone"] == phone], "pending public-booking customer must be hidden from CRM"

        # Complete the visit → customer enters CRM with the visit counted
        rc = s.put(f"{API}/appointments/{appt_id}/status", json={"status": "completed"})
        assert rc.status_code == 200, rc.text
        found = [c for c in s.get(f"{API}/customers", params={"q": phone}).json() if c["phone"] == phone]
        assert len(found) == 1, "customer must appear in CRM after completed visit"
        assert found[0].get("visits", 0) >= 1

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
        scheduled = _future_iso()
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
def _future_iso(days=None, hour_ist=None):
    """Random future ISO datetime within business hours (10:00-20:30 IST).
    Randomized so repeated suite runs don't saturate the same slot."""
    ist_dt = datetime.now(timezone(timedelta(hours=5, minutes=30))) + timedelta(days=days or random.randint(4, 45))
    ist_dt = ist_dt.replace(hour=hour_ist or random.randint(10, 20), minute=random.choice((0, 30)), second=0, microsecond=0)
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
    s.headers.update({"Authorization": f"Bearer {r.cookies['access_token']}"})
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
            "service_ids": [svcs[0]["id"]], "scheduled_at": _future_iso(),
        })
        assert r.status_code == 422, r.text
        assert "phone" in r.text.lower()


class TestIter3CustomerUpdate:
    """SEC-003: an unauthenticated public booking must NEVER overwrite a returning
    customer's saved name/email (strangers could tamper with records)."""

    def test_existing_phone_does_not_overwrite_name_email(self, admin_session_iter3):
        svcs = requests.get(f"{API}/public/services").json()
        phone = _unique_phone("92")
        # First booking
        r1 = requests.post(f"{API}/public/book", json={
            "customer_name": "TEST_Original", "customer_phone": phone,
            "customer_email": "orig@test.com",
            "service_ids": [svcs[0]["id"]], "scheduled_at": _future_iso(),
        })
        assert r1.status_code == 200, r1.text
        # Second booking with same phone but different name/email
        r2 = requests.post(f"{API}/public/book", json={
            "customer_name": "TEST_Updated", "customer_phone": phone,
            "customer_email": "updated@test.com",
            "service_ids": [svcs[0]["id"]], "scheduled_at": _future_iso(),
        })
        assert r2.status_code == 200, r2.text
        # Complete the first visit so the customer is visible in CRM
        appt1 = r1.json()["appointment"]["id"]
        admin_session_iter3.put(f"{API}/appointments/{appt1}/status", json={"status": "completed"})
        cr = admin_session_iter3.get(f"{API}/customers", params={"q": phone})
        rows = [c for c in cr.json() if c["phone"] == phone]
        assert len(rows) == 1
        assert rows[0]["name"] == "TEST_Original", "SEC-003: name must NOT be overwritten by a public booking"
        assert rows[0]["email"] == "orig@test.com", "SEC-003: email must NOT be overwritten by a public booking"
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
            "service_ids": [svcs[0]["id"]], "scheduled_at": _future_iso(),
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
            "service_ids": [svcs[0]["id"]], "scheduled_at": _future_iso(),
            "referral_code": code_a,
        })
        assert rB.status_code == 200, rB.text
        assert rB.json().get("referral_applied") is not None
        assert rB.json()["referral_applied"]["referrer_name"] == "TEST_RefA"

        # Complete both visits so the customers are visible in CRM
        admin_session_iter3.put(f"{API}/appointments/{rA.json()['appointment']['id']}/status", json={"status": "completed"})
        admin_session_iter3.put(f"{API}/appointments/{rB.json()['appointment']['id']}/status", json={"status": "completed"})
        cs = admin_session_iter3.get(f"{API}/customers").json()
        ca = next(c for c in cs if c["phone"] == phone_a)
        cb = next(c for c in cs if c["phone"] == phone_b)
        # B (the referred guest) gets the welcome credit at booking
        assert cb["referral_credit"] >= 100
        # SEC-001: A (the referrer) is credited only after B actually PAYS
        credit_a_before = ca["referral_credit"]
        svcp = svcs[0]
        ri = admin_session_iter3.post(f"{API}/invoices", json={
            "customer_id": cb["id"],
            "items": [{"type": "service", "ref_id": svcp["id"], "name": svcp["name"], "qty": 1, "price": 500}],
            "tax_pct": 0, "payment_mode": "cash", "redeem_points": 0,
        })
        assert ri.status_code == 200, ri.text
        ca_after = admin_session_iter3.get(f"{API}/customers/{ca['id']}").json()
        assert ca_after["referral_credit"] >= credit_a_before + 100, "referrer must be credited after referred guest pays"
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
            "service_ids": [svcs[0]["id"]], "scheduled_at": _future_iso(),
            "referral_code": code,
        })
        assert rB.status_code == 200, rB.text
        # Complete the visit so the customer is visible in CRM
        admin_session_iter3.put(f"{API}/appointments/{rB.json()['appointment']['id']}/status", json={"status": "completed"})
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
        # Total = (500 − credit) × (1 + tenant GST%) — GST comes from tenant settings, not the payload
        tax_cfg = admin_session_iter3.get(f"{API}/settings/tax").json()
        pct = float(tax_cfg.get("tax_pct") or 0) if tax_cfg.get("tax_enabled") else 0.0
        expected_total = round((500 - inv["discount"]) * (1 + pct / 100), 2)
        assert abs(inv["total"] - expected_total) < 0.01, f"Expected {expected_total}, got {inv['total']}"
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
        token = r.cookies["access_token"]
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



# ---------------- Iteration 4: Reviews ----------------
def _create_appointment_for_review(admin_s):
    """Create a fresh customer + appointment via authenticated admin API (no rate limit)."""
    svcs = admin_s.get(f"{API}/services").json()
    staff_list = admin_s.get(f"{API}/staff").json()
    phone = _unique_phone("85")
    cust_r = admin_s.post(f"{API}/customers", json={
        "name": "TEST_ReviewCust", "phone": phone, "email": "rev@test.com",
    })
    assert cust_r.status_code == 200, cust_r.text
    customer_id = cust_r.json()["id"]
    appt_r = admin_s.post(f"{API}/appointments", json={
        "customer_id": customer_id,
        "staff_id": staff_list[0]["id"],
        "service_ids": [svcs[0]["id"]],
        "scheduled_at": _future_iso(),
    })
    assert appt_r.status_code == 200, appt_r.text
    return appt_r.json()["id"], customer_id, phone


class TestIter4ReviewHappyPath:
    """5★ review → reward + credit increment"""

    def test_5_star_creates_reward_and_credit(self, admin_session_iter3):
        appt_id, customer_id, _ = _create_appointment_for_review(admin_session_iter3)
        # SEC-002: rewards only for PAID visits — bill the guest first
        svcs = admin_session_iter3.get(f"{API}/services").json()
        ri = admin_session_iter3.post(f"{API}/invoices", json={
            "customer_id": customer_id, "appointment_id": appt_id,
            "items": [{"type": "service", "ref_id": svcs[0]["id"], "name": svcs[0]["name"], "qty": 1, "price": 500}],
            "tax_pct": 0, "payment_mode": "cash",
        })
        assert ri.status_code == 200, ri.text
        # baseline credit (after invoice, before review)
        cust_before = admin_session_iter3.get(f"{API}/customers/{customer_id}").json()
        credit_before = cust_before.get("referral_credit", 0)

        r = requests.post(f"{API}/public/review/{appt_id}", json={
            "rating": 5,
            "comment": "Amazing experience! Will be back.",
        })
        if r.status_code == 429:
            pytest.skip("public review rate-limited")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["reward"] is not None
        assert data["reward"]["code"].startswith("THANKS-")
        assert data["reward"]["credit"] == 50.0
        assert data["review"]["rating"] == 5
        assert data["review"]["public"] is True

        # verify credit incremented
        cust_after = admin_session_iter3.get(f"{API}/customers/{customer_id}").json()
        assert cust_after.get("referral_credit", 0) == credit_before + 50.0

        # duplicate submission rejected
        r2 = requests.post(f"{API}/public/review/{appt_id}", json={"rating": 5, "comment": "again"})
        if r2.status_code == 429:
            pytest.skip("public review rate-limited")
        assert r2.status_code == 400
        assert "already" in r2.text.lower()

        # cleanup
        admin_session_iter3.delete(f"{API}/customers/{customer_id}")


class TestIter4Review3Star:
    """3★ review → public=false, NO reward, credit unchanged"""

    def test_3_star_no_reward(self, admin_session_iter3):
        appt_id, customer_id, _ = _create_appointment_for_review(admin_session_iter3)
        cust_before = admin_session_iter3.get(f"{API}/customers/{customer_id}").json()
        credit_before = cust_before.get("referral_credit", 0)

        r = requests.post(f"{API}/public/review/{appt_id}", json={"rating": 3})
        if r.status_code in (409, 429):
            pytest.skip(f"public endpoint saturated: {r.status_code} {r.text[:120]}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["reward"] is None
        assert data["review"]["rating"] == 3
        assert data["review"]["public"] is False

        cust_after = admin_session_iter3.get(f"{API}/customers/{customer_id}").json()
        assert cust_after.get("referral_credit", 0) == credit_before

        admin_session_iter3.delete(f"{API}/customers/{customer_id}")


class TestIter4ReviewValidation:
    """Rating out-of-range → 422"""

    def test_rating_zero_rejected(self, admin_session_iter3):
        appt_id, customer_id, _ = _create_appointment_for_review(admin_session_iter3)
        r = requests.post(f"{API}/public/review/{appt_id}", json={"rating": 0})
        if r.status_code == 429:
            pytest.skip("public review rate-limited")
        assert r.status_code == 422, r.text
        admin_session_iter3.delete(f"{API}/customers/{customer_id}")

    def test_rating_six_rejected(self, admin_session_iter3):
        appt_id, customer_id, _ = _create_appointment_for_review(admin_session_iter3)
        r = requests.post(f"{API}/public/review/{appt_id}", json={"rating": 6})
        if r.status_code == 429:
            pytest.skip("public review rate-limited")
        assert r.status_code == 422, r.text
        admin_session_iter3.delete(f"{API}/customers/{customer_id}")


class TestIter4ReviewInfo:
    """GET /public/review-info/{token}"""

    def test_review_info_returns_summary(self, admin_session_iter3):
        appt_id, customer_id, _ = _create_appointment_for_review(admin_session_iter3)
        r = requests.get(f"{API}/public/review-info/{appt_id}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "customer_name" in data
        assert "service_names" in data and isinstance(data["service_names"], list)
        assert data["already_submitted"] is False
        assert data["existing_rating"] is None

        # submit a 4★ review and verify already_submitted flips
        requests.post(f"{API}/public/review/{appt_id}", json={"rating": 4})
        r2 = requests.get(f"{API}/public/review-info/{appt_id}")
        d2 = r2.json()
        assert d2["already_submitted"] is True
        assert d2["existing_rating"] == 4

        admin_session_iter3.delete(f"{API}/customers/{customer_id}")

    def test_review_info_invalid_token_404(self):
        r = requests.get(f"{API}/public/review-info/not-a-real-id")
        assert r.status_code == 404
        assert "invalid" in r.text.lower()


class TestIter4FeaturedReviews:
    """GET /public/reviews/featured returns only public=true && rating>=4"""

    def test_featured_only_returns_high_public(self, admin_session_iter3):
        # seed a 5★ + a 3★
        a1, c1, _ = _create_appointment_for_review(admin_session_iter3)
        a2, c2, _ = _create_appointment_for_review(admin_session_iter3)
        requests.post(f"{API}/public/review/{a1}", json={"rating": 5, "comment": "TEST_FEAT_5"})
        requests.post(f"{API}/public/review/{a2}", json={"rating": 3, "comment": "TEST_FEAT_3"})

        r = requests.get(f"{API}/public/reviews/featured")
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        for row in rows:
            assert row["rating"] >= 4
            assert row.get("public", True) is True
            # PII fields stripped
            assert "customer_id" not in row
            assert "appointment_id" not in row
            assert "reward_code" not in row

        # cleanup
        admin_session_iter3.delete(f"{API}/customers/{c1}")
        admin_session_iter3.delete(f"{API}/customers/{c2}")


class TestIter4ReviewModeration:
    """Admin moderate + delete"""

    def test_list_reviews_requires_auth(self):
        r = requests.get(f"{API}/reviews")
        assert r.status_code in (401, 403)

    def test_moderate_toggles_public(self, admin_session_iter3):
        appt_id, customer_id, _ = _create_appointment_for_review(admin_session_iter3)
        sr = requests.post(f"{API}/public/review/{appt_id}", json={"rating": 5, "comment": "TEST_MOD"})
        if sr.status_code in (409, 429):
            pytest.skip(f"public endpoint saturated: {sr.status_code} {sr.text[:120]}")
        assert sr.status_code == 200
        rid = sr.json()["review"]["id"]

        # toggle public=False
        m = admin_session_iter3.put(f"{API}/reviews/{rid}/moderate", json={"public": False})
        assert m.status_code == 200, m.text
        assert m.json()["public"] is False

        # delete
        d = admin_session_iter3.delete(f"{API}/reviews/{rid}")
        assert d.status_code == 200
        # verify gone
        all_reviews = admin_session_iter3.get(f"{API}/reviews").json()
        assert not any(r["id"] == rid for r in all_reviews)

        admin_session_iter3.delete(f"{API}/customers/{customer_id}")

    def test_moderate_requires_admin(self):
        # register a staff user
        email = f"staff_rev_{int(datetime.now().timestamp())}@test.com"
        r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Pass@1234", "name": "StaffRev"})
        assert r.status_code == 200
        token = r.cookies["access_token"]
        # try to moderate (use any id, expect 403 before lookup)
        rr = requests.put(f"{API}/reviews/fake-id/moderate",
                          json={"public": False},
                          headers={"Authorization": f"Bearer {token}"})
        assert rr.status_code == 403, rr.text


class TestIter4DashboardReviewFields:
    def test_dashboard_includes_review_stats(self, admin_session_iter3):
        r = admin_session_iter3.get(f"{API}/reports/dashboard")
        assert r.status_code == 200
        data = r.json()
        assert "avg_rating" in data
        assert "review_count" in data
        assert "pending_reviews" in data
        assert isinstance(data["review_count"], int)
        assert data["pending_reviews"] >= 0


class TestIter4ReviewRateLimit:
    """RUN LAST — 10 req/10min per IP on /public/review/{token}"""

    def test_review_endpoint_rate_limit(self, admin_session_iter3):
        # rate-limit is enforced BEFORE duplicate check & 404, so hit any token 11+ times
        # use a known-bad token to avoid mutating real data
        statuses = []
        for i in range(25):
            r = requests.post(f"{API}/public/review/nonexistent-rl-token", json={"rating": 5})
            statuses.append(r.status_code)
        assert 429 in statuses, f"Expected 429 in burst, got {statuses}"
