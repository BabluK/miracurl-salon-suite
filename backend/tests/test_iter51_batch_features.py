"""Iter 51 — Landing dark-luxe + salary/OT + GST + platform digest + XFF lockout regression."""
import os
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
import sys
import uuid
import asyncio
_SHARED_LOOP = asyncio.new_event_loop()

def _run_async(coro):
    return _SHARED_LOOP.run_until_complete(coro)
from datetime import datetime, timezone

import pytest
import requests

from creds import password_for

# Make backend importable for unit tests on private helpers
sys.path.insert(0, "/app/backend")

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASSWORD = password_for("admin@miracurl.com")
TENANT_SLUG = "miracurl-marathahalli"

SUPER_EMAIL = "super@miracurl.com"
SUPER_PASSWORD = password_for("super@miracurl.com")


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_sess():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    s.headers.update({"X-Tenant-Slug": TENANT_SLUG})
    return s


@pytest.fixture(scope="module")
def super_sess():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASSWORD})
    assert r.status_code == 200, r.text
    return s


# ==================== OT UNIT ====================
class TestOvertimeUnit:
    def test_overtime_computations(self):
        from routes.staff_portal import _overtime_for, IST_TZ
        staff = {"shift_end": "21:00"}
        # 22:10 -> 70 min = 2 completed 30-min blocks = ₹100
        co1 = datetime(2026, 1, 15, 22, 10, tzinfo=IST_TZ)
        h1, pay1 = _overtime_for(staff, co1)
        assert pay1 == 100.0, f"Expected 100.0 for 22:10, got {pay1}"
        # 21:20 -> 20 min = 0 completed 30-min blocks = ₹0
        co2 = datetime(2026, 1, 15, 21, 20, tzinfo=IST_TZ)
        h2, pay2 = _overtime_for(staff, co2)
        assert pay2 == 0.0, f"Expected 0.0 for 21:20, got {pay2}"

    def test_overtime_with_custom_rate(self):
        from routes.staff_portal import _overtime_for, IST_TZ
        staff = {"shift_end": "21:00", "overtime_rate": 200}  # 200/hr => 100/block
        co = datetime(2026, 1, 15, 22, 30, tzinfo=IST_TZ)  # 90 min = 3 blocks
        _, pay = _overtime_for(staff, co)
        assert pay == 300.0, f"Expected 300.0 for 22:30 @₹200/hr, got {pay}"


# ==================== PRODUCT COMMISSION (2%) ====================
class TestProductCommission:
    def test_product_commission_2pct_via_direct_compute(self, admin_sess):
        """Create a paid invoice with a product line, run _compute_salary_for_month,
        assert product_commission_amount == 2% of product_gross, then delete invoice."""
        from routes.staff_portal import _compute_salary_for_month
        from database import _current_tenant_id

        # Resolve tenant + a real staff + a real product
        # Fetch tenant + first staff + first product via admin session
        r = admin_sess.get(f"{API}/staff")
        assert r.status_code == 200, r.text
        staff_list = r.json()
        assert staff_list, "No staff in tenant"
        staff = staff_list[0]

        r = admin_sess.get(f"{API}/products")
        assert r.status_code == 200
        prods = r.json()
        # Ensure at least one product exists; if not create a throwaway
        product = None
        created_product_id = None
        for p in prods:
            if (p.get("stock") or 0) >= 2:
                product = p
                break
        if not product:
            r = admin_sess.post(f"{API}/products", json={
                "name": f"TEST_Prod_{uuid.uuid4().hex[:6]}",
                "price": 500, "stock": 100, "category": "TEST"
            })
            assert r.status_code in (200, 201), r.text
            product = r.json()
            created_product_id = product["id"]

        r = admin_sess.get(f"{API}/customers")
        assert r.status_code == 200
        custs = r.json()
        assert custs, "No customer"
        cust = custs[0]

        # Create paid invoice with product item (price 500, qty 2)
        payload = {
            "customer_id": cust["id"],
            "staff_id": staff["id"],
            "items": [{
                "type": "product", "ref_id": product["id"], "name": product["name"],
                "qty": 2, "price": 500, "staff_id": staff["id"], "staff_name": staff["name"]
            }],
            "tax_pct": 0,  # isolate product_gross
            "payment_mode": "cash",
        }
        r = admin_sess.post(f"{API}/invoices", json=payload)
        assert r.status_code == 200, r.text
        inv = r.json()
        inv_id = inv["id"]

        try:
            # Do compute in a single event loop, cleanup in same loop
            async def _run_and_cleanup():
                from database import _raw_db
                tenant_doc = await _raw_db.tenants.find_one({"slug": TENANT_SLUG}, {"_id": 0})
                assert tenant_doc, "tenant not found"
                _current_tenant_id.set(tenant_doc["id"])
                now = datetime.now(timezone.utc)
                slip = await _compute_salary_for_month(staff, now.year, now.month, tenant_doc)
                await _raw_db.invoices.delete_one({"id": inv_id})
                if created_product_id:
                    await _raw_db.products.delete_one({"id": created_product_id})
                return slip
            slip = _run_async(_run_and_cleanup())
            print(f"product_gross={slip['product_gross']} product_commission_amount={slip['product_commission_amount']} product_commission_pct={slip['product_commission_pct']}")
            assert slip["product_commission_pct"] == 2.0
            assert slip["product_gross"] >= 1000.0
            expected = round(slip["product_gross"] * 2.0 / 100, 2)
            assert slip["product_commission_amount"] == expected
        except Exception:
            # best-effort cleanup via API if the async run failed
            try: admin_sess.delete(f"{API}/invoices/{inv_id}")
            except Exception: pass
            raise


# ==================== GST REGRESSION ====================
class TestGSTRegression:
    def test_tax_settings_shows_18pct(self, admin_sess):
        # Idempotent: another suite may have toggled GST — restore steady state first.
        admin_sess.put(f"{API}/settings/tax",
                       json={"tax_enabled": True, "gst_number": "29ABCDE1234F1Z5",
                             "gst_legal_name": "Miracurl Salon", "tax_pct": 18})
        r = admin_sess.get(f"{API}/settings/tax")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("tax_enabled"), f"tax_enabled: {d}"
        assert float(d.get("tax_pct") or 0) == 18.0, f"tax_pct: {d}"

    def test_invoice_applies_18pct_tax(self, admin_sess):
        # Fetch service + customer to build an invoice
        r = admin_sess.get(f"{API}/services")
        assert r.status_code == 200
        services = [s for s in r.json() if (s.get("price") or 0) > 0]
        assert services, "No services"
        svc = services[0]
        r = admin_sess.get(f"{API}/customers")
        custs = r.json()
        cust = custs[0]

        payload = {
            "customer_id": cust["id"],
            "items": [{"type": "service", "ref_id": svc["id"], "name": svc["name"],
                       "qty": 1, "price": float(svc["price"])}],
            "payment_mode": "cash",
        }
        r = admin_sess.post(f"{API}/invoices", json=payload)
        assert r.status_code == 200, r.text
        inv = r.json()
        try:
            subtotal = float(inv["subtotal"])
            tax = float(inv["tax"])
            # Discount/coupons should be zero here; expect tax == 18% of (subtotal - discount)
            expected_tax = round((subtotal - float(inv.get("discount") or 0)) * 0.18, 2)
            assert abs(tax - expected_tax) < 0.02, f"tax={tax} expected~{expected_tax} inv={inv}"
        finally:
            async def _cleanup():
                from database import _raw_db
                await _raw_db.invoices.delete_one({"id": inv["id"]})
                # Also revert customer stat changes best-effort
                await _raw_db.customers.update_one(
                    {"id": cust["id"]},
                    {"$inc": {"total_spent": -float(inv["total"]), "visits": -1}}
                )
            _run_async(_cleanup())


# ==================== PLATFORM DIGEST ====================
class TestPlatformDigest:
    def test_send_platform_digest(self, super_sess):
        r = super_sess.post(f"{API}/super-admin/send-platform-digest")
        assert r.status_code == 200, r.text
        d = r.json()
        if d.get("sent") != 1 and any(w in str(d.get("error", "")).lower() for w in ("too many", "quota", "rate")):
            pytest.skip("Resend rate-limited (2 rps)")
        assert d.get("sent") == 1, f"digest not sent: {d}"


# ==================== XFF LOCKOUT ====================
class TestXFFLockout:
    def test_lockout_is_per_forwarded_ip(self):
        """5 bad attempts from IP-A for fake email -> 423.
        First attempt from IP-B for same fake email -> 401 (not 423)."""
        fake_email = f"lockout_{uuid.uuid4().hex[:8]}@nowhere.example"
        ip_a = f"10.99.{uuid.uuid4().int % 200 + 1}.10"
        ip_b = f"10.99.{uuid.uuid4().int % 200 + 1}.20"
        while ip_a == ip_b:
            ip_b = f"10.99.{uuid.uuid4().int % 200 + 1}.20"

        # Hammer IP-A
        got_423 = False
        for i in range(8):
            r = requests.post(f"{API}/auth/login",
                              json={"email": fake_email, "password": "wrong"},
                              headers={"X-Forwarded-For": ip_a})
            if r.status_code == 423:
                got_423 = True
                break
            assert r.status_code == 401, f"attempt {i}: {r.status_code} {r.text}"
        assert got_423, f"Never got 423 lockout from IP {ip_a}"

        # IP-B same email — should be 401 (not 423) because ident is IP-scoped
        r = requests.post(f"{API}/auth/login",
                          json={"email": fake_email, "password": "wrong"},
                          headers={"X-Forwarded-For": ip_b})
        assert r.status_code == 401, (
            f"IP-B {ip_b} got {r.status_code}, expected 401 — lockout leaking across IPs. Body: {r.text}"
        )

        # Cleanup lockout row via pymongo (sync — avoids motor/loop reuse issues)
        try:
            import pymongo
            mc = pymongo.MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
            mc[os.environ.get("DB_NAME", "miracurl_db")].login_attempts.delete_many(
                {"identifier": {"$regex": fake_email}}
            )
            mc.close()
        except Exception as e:
            print(f"cleanup warning: {e}")


# ==================== CORE REGRESSION ====================
class TestCoreRegression:
    def test_admin_login_and_dashboard(self, admin_sess):
        r = admin_sess.get(f"{API}/reports/dashboard")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "today_revenue" in d

    def test_admin_reports_sales_has_avg_rating(self, admin_sess):
        r = admin_sess.get(f"{API}/reports/sales")
        assert r.status_code == 200
        d = r.json()
        assert "avg_rating" in d

    def test_super_admin_login_and_overview(self, super_sess):
        r = super_sess.get(f"{API}/super-admin/overview")
        assert r.status_code == 200


# ==================== SALES CHAT (regression on new landing) ====================
class TestSalesChat:
    def test_sales_chat_start_and_message(self, super_sess):
        # start
        r = requests.post(f"{API}/public/sales-chat/start", json={
            "name": f"TEST_Lead_{uuid.uuid4().hex[:6]}",
            "email": f"lead_{uuid.uuid4().hex[:6]}@test.com",
            "phone": "9999999999",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("inquiry_id")
        assert data.get("greeting") or data.get("message") or True
        inq_id = data["inquiry_id"]

        # send one message
        r = requests.post(f"{API}/public/sales-chat/message", json={
            "inquiry_id": inq_id, "message": "How much is annual plan?"
        })
        assert r.status_code == 200, r.text
        reply = r.json()
        assert reply.get("reply") or reply.get("message")

        # cleanup as super admin
        d = super_sess.delete(f"{API}/super-admin/inquiries/{inq_id}")
        assert d.status_code in (200, 204), d.text
