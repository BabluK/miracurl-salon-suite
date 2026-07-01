"""Iter 25 — Security regression + save-flow verification.

Covers:
  * REGRESSION AUTH: super-admin and salon-admin login still works
  * SAVE FLOW: settings/branding, settings/tax, customers CRUD, staff CRUD, products CRUD
  * SEC-001: seed no longer overwrites existing password on restart
  * SEC-002: Razorpay verify honors server plan, ignores client body plan, blocks replay
  * REGRESSION: billing config, dashboard reminders, super-admin renewals queue, settings/tax GET
"""
import os
import time
import hmac
import hashlib
import uuid
import asyncio
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = os.environ.get("MIRACURL_ADMIN_EMAIL", "admin@miracurl.com")
ADMIN_PW    = os.environ.get("MIRACURL_ADMIN_PASSWORD", "Miracurl@123")
SUPER_EMAIL = os.environ.get("MIRACURL_SUPER_EMAIL", "super@miracurl.com")
SUPER_PW    = os.environ.get("MIRACURL_SUPER_PASSWORD", "Super@Miracurl123")

# The old rzp TEST-mode secret is worthless post-live-switch, but leaving a
# hardcoded credential here still fails audit rules. Read strictly from env.
RZP_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data
    assert data["user"]["role"] == "admin"
    return data["access_token"]


@pytest.fixture(scope="module")
def super_token():
    r = requests.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PW}, timeout=15)
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["role"] == "super_admin"
    return data["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- REGRESSION AUTH ----------
class TestRegressionAuth:
    def test_super_admin_login(self, super_token):
        assert isinstance(super_token, str) and len(super_token) > 10

    def test_admin_login(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 10


# ---------- SAVE FLOWS ----------
class TestSaveFlows:
    def test_branding_get_then_put(self, admin_token):
        # GET baseline
        r = requests.get(f"{API}/settings/branding", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        baseline = r.json()
        original_url = baseline.get("google_review_url", "")
        original_hours = baseline.get("hours", "")

        new_url = "https://g.page/r/iter25-test/review"
        new_hours = "Mon-Sun 10:00 AM - 9:30 PM"
        r = requests.put(
            f"{API}/settings/branding",
            headers=_h(admin_token),
            json={"google_review_url": new_url, "hours": new_hours},
            timeout=15,
        )
        assert r.status_code == 200, f"branding PUT failed: {r.status_code} {r.text}"

        # GET reflects
        r = requests.get(f"{API}/settings/branding", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["google_review_url"] == new_url
        assert data["hours"] == new_hours

        # restore
        requests.put(
            f"{API}/settings/branding",
            headers=_h(admin_token),
            json={"google_review_url": original_url, "hours": original_hours},
            timeout=15,
        )

    def test_tax_put(self, admin_token):
        r = requests.put(
            f"{API}/settings/tax",
            headers=_h(admin_token),
            json={"tax_enabled": False},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # verify persisted
        g = requests.get(f"{API}/settings/tax", headers=_h(admin_token), timeout=15).json()
        assert g["tax_enabled"] is False

    def test_customer_create_and_update(self, admin_token):
        payload = {"name": "TEST_iter25_customer", "phone": "+91 99999 25001"}
        r = requests.post(f"{API}/customers", headers=_h(admin_token), json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        cust = r.json()
        cid = cust["id"]
        assert cust["name"] == payload["name"]
        assert cust["phone"] == payload["phone"]

        # UPDATE
        upd = {"name": "TEST_iter25_customer_upd", "phone": payload["phone"]}
        r = requests.put(f"{API}/customers/{cid}", headers=_h(admin_token), json=upd, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["name"] == "TEST_iter25_customer_upd"

        # verify persistence via list
        listed = requests.get(f"{API}/customers", headers=_h(admin_token), timeout=15).json()
        got = [x for x in listed if x["id"] == cid]
        assert got and got[0]["name"] == "TEST_iter25_customer_upd"

        # cleanup
        requests.delete(f"{API}/customers/{cid}", headers=_h(admin_token), timeout=15)

    def test_staff_create_and_update(self, admin_token):
        payload = {"name": "TEST_iter25_staff", "role": "Stylist", "phone": "+91 88888 25001"}
        r = requests.post(f"{API}/staff", headers=_h(admin_token), json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        sid = r.json()["id"]

        upd = {"name": "TEST_iter25_staff_upd", "role": "Senior Stylist", "phone": payload["phone"]}
        r = requests.put(f"{API}/staff/{sid}", headers=_h(admin_token), json=upd, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["name"] == "TEST_iter25_staff_upd"

        requests.delete(f"{API}/staff/{sid}", headers=_h(admin_token), timeout=15)

    def test_product_create_and_update(self, admin_token):
        sku = f"TESTSKU25-{uuid.uuid4().hex[:6]}"
        payload = {
            "name": "TEST_iter25_product",
            "category": "Haircare",
            "sku": sku,
            "price": 500.0,
            "cost": 300.0,
            "stock": 12,
        }
        r = requests.post(f"{API}/products", headers=_h(admin_token), json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        pid = r.json()["id"]

        upd = {**payload, "price": 550.0, "stock": 15}
        r = requests.put(f"{API}/products/{pid}", headers=_h(admin_token), json=upd, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["price"] == 550.0
        assert r.json()["stock"] == 15

        requests.delete(f"{API}/products/{pid}", headers=_h(admin_token), timeout=15)


# ---------- SEC-002 — Razorpay plan tampering + replay ----------
class TestRazorpaySecurity:
    def test_config_ok(self, admin_token):
        r = requests.get(f"{API}/billing/razorpay/config", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "key_id" in j
        assert j["test_mode"] is True
        assert isinstance(j["plans"], list) and len(j["plans"]) >= 2

    def test_verify_uses_server_plan_and_blocks_replay(self, admin_token):
        # (a) create order for half_year
        r = requests.post(
            f"{API}/billing/razorpay/order",
            headers=_h(admin_token),
            json={"plan": "half_year"},
            timeout=20,
        )
        assert r.status_code == 200, f"order create failed: {r.status_code} {r.text}"
        order = r.json()
        assert order["amount"] == 1_000_000, f"expected 1,000,000 paise, got {order['amount']}"
        order_id = order["order_id"]

        # (b) compute a valid signature
        payment_id = f"pay_test_iter25_{uuid.uuid4().hex[:10]}"
        sig = hmac.new(
            RZP_KEY_SECRET.encode(),
            f"{order_id}|{payment_id}".encode(),
            hashlib.sha256,
        ).hexdigest()

        # (c) verify with a TAMPERED client plan='annual' — server must record half_year
        r = requests.post(
            f"{API}/billing/razorpay/verify",
            headers=_h(admin_token),
            json={
                "razorpay_order_id": order_id,
                "razorpay_payment_id": payment_id,
                "razorpay_signature": sig,
                "plan": "annual",  # attacker tampering
            },
            timeout=20,
        )
        assert r.status_code == 200, f"verify failed: {r.status_code} {r.text}"
        j = r.json()
        assert j["ok"] is True
        assert j["plan"] == "half_year", f"SEC-002 BROKEN: server accepted client plan → {j}"
        # end_date ~ 183 days out
        from datetime import datetime, timezone, date
        end_d = datetime.fromisoformat(j["end_date"]).date()
        delta = (end_d - datetime.now(timezone.utc).date()).days
        assert 180 <= delta <= 186, f"end_date delta {delta} not in expected 183-day window"

        # (d) replay must fail with 400
        r2 = requests.post(
            f"{API}/billing/razorpay/verify",
            headers=_h(admin_token),
            json={
                "razorpay_order_id": order_id,
                "razorpay_payment_id": payment_id,
                "razorpay_signature": sig,
                "plan": "half_year",
            },
            timeout=20,
        )
        assert r2.status_code == 400, f"replay must be rejected, got {r2.status_code} {r2.text}"


# ---------- REGRESSION endpoints ----------
class TestRegressionEndpoints:
    def test_dashboard_reminders(self, admin_token):
        r = requests.get(f"{API}/dashboard/reminders", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "count" in j and "items" in j

    def test_super_renewals_queue(self, super_token):
        r = requests.get(f"{API}/super-admin/renewals/queue", headers=_h(super_token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), (list, dict))

    def test_settings_tax_default(self, admin_token):
        r = requests.get(f"{API}/settings/tax", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        assert "tax_enabled" in r.json()


# ---------- SEC-001 seed no-overwrite ----------
class TestSeedNoOverwrite:
    """Rotate admin password directly in Mongo → restart backend → old .env password must be REJECTED."""

    def test_seed_does_not_overwrite(self, admin_token):
        import subprocess
        from motor.motor_asyncio import AsyncIOMotorClient
        from passlib.context import CryptContext

        MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        DB_NAME   = os.environ.get("DB_NAME", "miracurl_db")
        pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
        rotated_pw = "Rotated@Iter25!"
        rotated_hash = pwd.hash(rotated_pw)
        original_hash = None

        async def rotate(new_hash):
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            existing = await db.users.find_one({"email": ADMIN_EMAIL})
            prev = existing.get("password_hash") if existing else None
            await db.users.update_one({"email": ADMIN_EMAIL}, {"$set": {"password_hash": new_hash}})
            client.close()
            return prev

        original_hash = asyncio.get_event_loop().run_until_complete(rotate(rotated_hash))
        assert original_hash and original_hash.startswith("$2b$"), f"bcrypt format check failed on original hash: {original_hash[:10]}..."

        try:
            # restart backend so seed_admin runs
            subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=True, capture_output=True)
            # wait for backend to be back
            for _ in range(30):
                try:
                    ping = requests.get(f"{API}/", timeout=3)
                    if ping.status_code < 500:
                        break
                except Exception:
                    pass
                time.sleep(1)
            time.sleep(2)

            # OLD .env password MUST be rejected (seed no longer overwrites)
            r_old = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=15)
            assert r_old.status_code in (400, 401), f"SEC-001 BROKEN — .env password still works after rotation: {r_old.status_code} {r_old.text}"

            # NEW password should still work
            r_new = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": rotated_pw}, timeout=15)
            assert r_new.status_code == 200, f"rotated password login failed: {r_new.status_code} {r_new.text}"
        finally:
            # ALWAYS restore the original hash so subsequent tests / user work
            asyncio.get_event_loop().run_until_complete(rotate(original_hash))
            # And restart once more just to be clean (seed will still leave hash as-is)
            subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=True, capture_output=True)
            for _ in range(30):
                try:
                    ping = requests.get(f"{API}/", timeout=3)
                    if ping.status_code < 500:
                        break
                except Exception:
                    pass
                time.sleep(1)
            time.sleep(2)
            # sanity: .env password works again
            r_restored = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=15)
            assert r_restored.status_code == 200, f"could not restore admin login: {r_restored.status_code} {r_restored.text}"
