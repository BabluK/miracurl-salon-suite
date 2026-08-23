"""
Post-refactor regression sweep (iteration_68).
Tests the split-monolith backend still handles the critical live flows:
admin auth, customers, services, staff, inventory, public booking,
offers, tenant settings, dashboard, super admin, chat, assistant, email footer.
"""
from _creds import _PW_ADMIN, _PW_SUPER
import os
import time
import uuid
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
TENANT = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PW = _PW_ADMIN
SUPER_EMAIL = "super@miracurl.com"
SUPER_PW = _PW_SUPER
OWNER_PIN = "4321"


# ---------- shared session fixtures ----------
@pytest.fixture(scope="session")
def admin_sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-Slug": TENANT})
    r = s.post(f"{API}/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PW},
               headers={"X-Tenant-Slug": TENANT})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="session")
def super_sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PW})
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text[:200]}"
    return s


# ---------- Auth ----------
class TestAuth:
    def test_me(self, admin_sess):
        r = admin_sess.get(f"{API}/auth/me")
        assert r.status_code == 200
        j = r.json()
        assert j.get("email") == ADMIN_EMAIL

    def test_bad_password(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": "wrong"},
                          headers={"X-Tenant-Slug": TENANT})
        assert r.status_code in (400, 401, 403)


# ---------- Customers ----------
class TestCustomers:
    def test_list_and_export(self, admin_sess):
        assert admin_sess.get(f"{API}/customers").status_code == 200
        r = admin_sess.get(f"{API}/customers/export")
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "").lower() or r.text.startswith(("id,", "name,", "\ufeff"))

    def test_create_and_get(self, admin_sess):
        phone = "9" + str(int(time.time()))[-9:]
        r = admin_sess.post(f"{API}/customers",
                            json={"name": "TEST Cust", "phone": phone, "email": f"test{phone}@x.com"})
        assert r.status_code in (200, 201), r.text
        cid = r.json().get("id")
        assert cid
        g = admin_sess.get(f"{API}/customers/{cid}")
        assert g.status_code == 200
        assert g.json().get("phone") == phone


# ---------- Services ----------
class TestServices:
    def test_list_export(self, admin_sess):
        r = admin_sess.get(f"{API}/services")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert admin_sess.get(f"{API}/services/export").status_code == 200

    def test_crud(self, admin_sess):
        r = admin_sess.post(f"{API}/services", json={
            "name": "TEST Service", "category": "TEST", "price": 100, "duration_min": 30,
        })
        assert r.status_code in (200, 201), r.text
        sid = r.json().get("id")
        u = admin_sess.put(f"{API}/services/{sid}", json={
            "name": "TEST Service", "category": "TEST", "price": 150, "duration_min": 30,
        })
        assert u.status_code == 200
        d = admin_sess.delete(f"{API}/services/{sid}")
        assert d.status_code in (200, 204)


# ---------- Staff ----------
class TestStaff:
    def test_list(self, admin_sess):
        assert admin_sess.get(f"{API}/staff").status_code == 200

    def test_create_toggle_delete(self, admin_sess):
        headers = {"X-Owner-Pin": OWNER_PIN}
        phone = "8" + str(int(time.time()))[-9:]
        r = admin_sess.post(f"{API}/staff",
                            json={"name": "TEST Staff", "phone": phone, "role": "stylist"},
                            headers=headers)
        assert r.status_code in (200, 201), r.text
        sid = r.json().get("id")
        assert sid
        t = admin_sess.post(f"{API}/staff/{sid}/toggle-active", headers=headers)
        assert t.status_code in (200, 204)
        d = admin_sess.delete(f"{API}/staff/{sid}", headers=headers)
        assert d.status_code in (200, 204)


class TestStaffPortalReadonly:
    def test_endpoints(self, admin_sess):
        for path in ("/attendance/today", "/staff/leaderboard", "/leave-requests/pending-count"):
            r = admin_sess.get(f"{API}{path}")
            assert r.status_code == 200, f"{path} -> {r.status_code}"


# ---------- Inventory ----------
class TestInventory:
    def test_products_crud(self, admin_sess):
        assert admin_sess.get(f"{API}/products").status_code == 200
        sku = f"TEST-{uuid.uuid4().hex[:6]}"
        r = admin_sess.post(f"{API}/products",
                            json={"name": "TEST Product", "sku": sku, "category": "TEST",
                                  "price": 100, "cost": 50, "stock": 10})
        assert r.status_code in (200, 201), r.text
        pid = r.json().get("id")
        u = admin_sess.put(f"{API}/products/{pid}",
                           json={"name": "TEST Product", "sku": sku, "category": "TEST",
                                 "price": 100, "cost": 50, "stock": 20})
        assert u.status_code == 200
        assert admin_sess.delete(f"{API}/products/{pid}").status_code in (200, 204)

    def test_vendors(self, admin_sess):
        assert admin_sess.get(f"{API}/vendors").status_code == 200
        r = admin_sess.post(f"{API}/vendors",
                            json={"name": "TEST Vendor", "email": f"v{uuid.uuid4().hex[:6]}@x.com",
                                  "phone": "9000000001"})
        assert r.status_code in (200, 201, 400)  # duplicate ok


# ---------- Appointments / Invoices ----------
class TestPOSReadonly:
    def test_lists(self, admin_sess):
        assert admin_sess.get(f"{API}/appointments").status_code == 200
        assert admin_sess.get(f"{API}/invoices").status_code == 200


# ---------- Reviews ----------
class TestReviews:
    def test_owner_list(self, admin_sess):
        assert admin_sess.get(f"{API}/reviews").status_code == 200

    def test_public_featured(self):
        r = requests.get(f"{API}/public/reviews/featured/{TENANT}")
        assert r.status_code == 200


# ---------- Public booking site ----------
class TestPublicSite:
    slug = TENANT  # public slug uses tenant slug (problem statement typo)

    def test_salon(self):
        r = requests.get(f"{API}/public/salon/{TENANT}")
        assert r.status_code == 200

    def test_services(self):
        r = requests.get(f"{API}/public/services/{self.slug}")
        assert r.status_code == 200

    def test_staff(self):
        r = requests.get(f"{API}/public/staff/{self.slug}")
        assert r.status_code == 200

    def test_availability(self):
        from datetime import date, timedelta
        d = (date.today() + timedelta(days=1)).isoformat()
        r = requests.get(f"{API}/public/availability/{self.slug}", params={"date": d})
        assert r.status_code == 200


# ---------- Offers ----------
class TestOffers:
    def test_lists(self, admin_sess):
        for p in ("/packages", "/memberships", "/coupons"):
            r = admin_sess.get(f"{API}{p}")
            assert r.status_code == 200, f"{p} -> {r.status_code}"

    def test_coupon_create_delete(self, admin_sess):
        code = f"TEST{uuid.uuid4().hex[:5].upper()}"
        r = admin_sess.post(f"{API}/coupons",
                            json={"code": code, "type": "percent", "value": 10, "active": True})
        assert r.status_code in (200, 201), r.text
        cid = r.json().get("id")
        assert admin_sess.delete(f"{API}/coupons/{cid}").status_code in (200, 204)


# ---------- Tenant settings ----------
class TestTenantSettings:
    def test_paths(self, admin_sess):
        for p in ("/tenants/current", "/branches", "/settings/tax", "/settings/branding"):
            r = admin_sess.get(f"{API}{p}")
            assert r.status_code == 200, f"{p} -> {r.status_code}"


# ---------- Dashboard/Reports ----------
class TestDashboard:
    def test_paths(self, admin_sess):
        for p in ("/dashboard/reminders", "/reports/dashboard", "/reports/daily"):
            r = admin_sess.get(f"{API}{p}")
            assert r.status_code == 200, f"{p} -> {r.status_code}"


# ---------- Super admin ----------
class TestSuperAdmin:
    def test_endpoints(self, super_sess):
        for p in ("/super-admin/overview", "/super-admin/tenants", "/super-admin/partners",
                  "/super-admin/security/snapshot", "/super-admin/affiliates/leaderboard"):
            r = super_sess.get(f"{API}{p}")
            assert r.status_code == 200, f"{p} -> {r.status_code} {r.text[:120]}"


# ---------- Owner chat / public chat ----------
class TestChat:
    def test_start_send_and_owner_list(self, admin_sess):
        sk = ("TESTsessionkey" + uuid.uuid4().hex)[:60]
        start = requests.post(f"{API}/public/chat/{TENANT}/start",
                              json={"name": "TEST Chatter", "phone": "9000000123",
                                    "session_key": sk})
        assert start.status_code in (200, 201), start.text
        sess = start.json().get("session_id") or start.json().get("id")
        if sess:
            requests.post(f"{API}/public/chat/{TENANT}/send",
                          json={"session_id": sess, "text": "TEST hi"})
            requests.get(f"{API}/public/chat/{TENANT}/poll", params={"session_id": sess})
        assert admin_sess.get(f"{API}/owner-chats").status_code == 200
        assert admin_sess.get(f"{API}/owner-chats/unread-count").status_code == 200


# ---------- Assistant ----------
class TestAssistant:
    def test_chat_and_history(self, admin_sess):
        sid = "TESTsess" + uuid.uuid4().hex[:8]
        r = admin_sess.post(f"{API}/assistant/chat",
                            json={"session_id": sid, "message": "hello"})
        # AI can be slow but shouldn't 5xx
        assert r.status_code in (200, 202), f"assistant/chat -> {r.status_code} {r.text[:200]}"
        h = admin_sess.get(f"{API}/assistant/history", params={"session_id": sid})
        assert h.status_code == 200


# ---------- Email footer python-level ----------
class TestEmailFooter:
    def test_brand_footer_content(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from email_service import _brand_footer
        html = _brand_footer("https://example.com/book")
        assert "Book Now" in html
        assert "Powered by" in html
        assert "Miracurl" in html
        assert "example.com/book" in html
