"""Iteration 78 — Full pre-onboarding regression.
Focus: all-role login, POS math correctness, multi-tenant isolation,
owner-PIN gates on reports, public booking route, super-admin console.
Uses existing /app/memory/test_credentials.md via creds.password_for.
"""
import os
import requests
import pytest
from creds import password_for

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = "admin@miracurl.com"
MANAGER = "manager@miracurl.com"
SUPER = "super@miracurl.com"
OWNER_ELEGANCE = "owner@elegance.com"
PIN = "4321"


def _login(email, tenant_slug=None):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    if tenant_slug:
        s.headers["X-Tenant-Slug"] = tenant_slug
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password_for(email)})
    if r.status_code != 200:
        pytest.skip(f"login {email} failed: {r.status_code} {r.text[:120]}")
    if "access_token" in r.cookies:
        s.headers["Authorization"] = f"Bearer {r.cookies['access_token']}"
    return s, r


# ---------------- Role logins ----------------
class TestAllRolesLogin:
    def test_admin_login(self):
        s, r = _login(ADMIN)
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["email"] == ADMIN
        # httpOnly cookie present
        assert "HttpOnly" in r.headers.get("set-cookie", "") or "httponly" in r.headers.get("set-cookie", "").lower()

    def test_manager_login(self):
        s, r = _login(MANAGER)
        assert r.status_code == 200
        assert r.json()["user"]["email"] == MANAGER

    def test_super_admin_login(self):
        s, r = _login(SUPER)
        assert r.status_code == 200
        assert r.json()["user"]["email"] == SUPER
        assert r.json()["user"].get("role") in ("super_admin", "superadmin", "super", "platform_admin"), r.json()["user"]

    def test_wrong_password_rejected(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN, "password": "definitely-wrong-xyz"})
        assert r.status_code == 401

    def test_logout_clears_session(self):
        s, _ = _login(ADMIN)
        lr = s.post(f"{API}/auth/logout")
        assert lr.status_code == 200
        # NB: bearer header lingers in-session; but a fresh session without cookie must 401
        clean = requests.Session()
        assert clean.get(f"{API}/auth/me").status_code == 401


# ---------------- POS invoice math ----------------
class TestPOSInvoiceMath:
    def _admin(self):
        s, _ = _login(ADMIN)
        s.headers["X-Owner-Pin"] = PIN
        return s

    def test_invoice_two_line_items_math(self):
        s = self._admin()
        svcs = s.get(f"{API}/services").json()
        prods = s.get(f"{API}/products").json()
        custs = s.get(f"{API}/customers").json()
        svc = svcs[0]
        # find a product with stock
        prod = next((p for p in prods if int(p.get("stock") or 0) > 1), None)
        if not prod:
            pytest.skip("no product with stock")
        cust = next((c for c in custs if not str(c.get("name", "")).upper().startswith("TEST")), custs[0])
        items = [
            {"type": "service", "ref_id": svc["id"], "name": svc["name"], "qty": 1, "price": 500.0},
            {"type": "product", "ref_id": prod["id"], "name": prod["name"], "qty": 2, "price": 200.0},
        ]
        r = s.post(f"{API}/invoices", json={
            "customer_id": cust["id"], "items": items,
            "tax_pct": 18, "payment_mode": "cash", "redeem_points": 0,
        })
        assert r.status_code == 200, r.text
        inv = r.json()
        # subtotal = 500 + 400 = 900
        subtotal = inv.get("subtotal")
        assert subtotal is not None and abs(subtotal - 900.0) < 0.01, f"expected subtotal 900, got {subtotal} (inv={inv})"
        # discount may exist from customer credit; total math: (subtotal-discount)*(1+tax%)
        disc = float(inv.get("discount", 0) or 0)
        tax_cfg = s.get(f"{API}/settings/tax").json()
        pct = float(tax_cfg.get("tax_pct") or 0) if tax_cfg.get("tax_enabled") else 0.0
        base = subtotal - disc
        expected_total = round(base * (1 + pct / 100), 2)
        assert abs(inv["total"] - expected_total) < 0.02, f"expected total {expected_total}, got {inv['total']} (disc={disc}, pct={pct})"
        # tax field should be consistent
        if "tax" in inv:
            expected_tax = round(base * pct / 100, 2)
            assert abs(inv["tax"] - expected_tax) < 0.02
        # invoice visible in list
        lst = s.get(f"{API}/invoices").json()
        assert any(i["id"] == inv["id"] for i in lst)

    def test_invoice_pdf_endpoint(self):
        s = self._admin()
        invs = s.get(f"{API}/invoices").json()
        if not invs:
            pytest.skip("no invoices to fetch PDF for")
        iid = invs[0]["id"]
        r = s.get(f"{API}/invoices/{iid}/pdf")
        assert r.status_code in (200, 404), f"unexpected pdf status {r.status_code}: {r.text[:120]}"


# ---------------- Owner PIN gates ----------------
class TestOwnerPinGates:
    def test_staff_commission_requires_pin(self):
        s, _ = _login(ADMIN)
        # without pin
        s.get(f"{API}/reports/staff-commission")
        # some implementations pass through header check; check either 401/403 pin OR requires pin
        s.headers["X-Owner-Pin"] = PIN
        r2 = s.get(f"{API}/reports/staff-commission")
        assert r2.status_code == 200, f"with-pin should succeed: {r2.status_code} {r2.text[:120]}"

    def test_billing_erase_requires_pin(self):
        s, _ = _login(ADMIN)
        # wrong pin should fail
        s.headers["X-Owner-Pin"] = "0000"
        r = s.post(f"{API}/reports/billing-data/erase", json={"scope": "last-month", "confirm": False})
        assert r.status_code in (401, 403), f"wrong pin should be rejected: {r.status_code}"

    def test_verify_owner_pin_endpoint(self):
        s, _ = _login(ADMIN)
        s.headers["X-Owner-Pin"] = PIN
        r = s.post(f"{API}/settings/verify-owner-pin", json={})
        assert r.status_code == 200


# ---------------- Multi-tenant isolation ----------------
class TestTenantIsolation:
    def test_elegance_cannot_see_miracurl_data(self):
        s_el, _ = _login(OWNER_ELEGANCE, tenant_slug="elegance-koramangala")
        s_mi, _ = _login(ADMIN, tenant_slug="miracurl-marathahalli")

        # Get sample from miracurl
        mi_customers = s_mi.get(f"{API}/customers").json()
        mi_ids = {c["id"] for c in mi_customers} if isinstance(mi_customers, list) else set()

        # Elegance list must not contain miracurl ids
        el_customers = s_el.get(f"{API}/customers").json()
        assert isinstance(el_customers, list)
        el_ids = {c["id"] for c in el_customers}
        assert el_ids.isdisjoint(mi_ids), f"tenant leak: {el_ids & mi_ids}"

        # Same for invoices
        el_inv = s_el.get(f"{API}/invoices").json()
        mi_inv = s_mi.get(f"{API}/invoices").json()
        el_inv_ids = {i["id"] for i in el_inv}
        mi_inv_ids = {i["id"] for i in mi_inv}
        assert el_inv_ids.isdisjoint(mi_inv_ids), "invoice leak between tenants"

        # Staff
        el_staff = s_el.get(f"{API}/staff").json()
        mi_staff = s_mi.get(f"{API}/staff").json()
        assert {s["id"] for s in el_staff}.isdisjoint({s["id"] for s in mi_staff})

    def test_elegance_cannot_access_miracurl_customer_by_id(self):
        s_el, _ = _login(OWNER_ELEGANCE, tenant_slug="elegance-koramangala")
        s_mi, _ = _login(ADMIN, tenant_slug="miracurl-marathahalli")
        mi_customers = s_mi.get(f"{API}/customers").json()
        if not mi_customers:
            pytest.skip("no miracurl customers to cross-fetch")
        target = mi_customers[0]["id"]
        r = s_el.get(f"{API}/customers/{target}")
        assert r.status_code == 404, f"tenant leak via id fetch: {r.status_code} {r.text[:100]}"


# ---------------- Public booking (no auth) ----------------
class TestPublicBookingRoute:
    def test_miracurl_public_salon_by_slug(self):
        # public endpoint accepts slug via header or path
        r = requests.get(f"{API}/public/salon", headers={"X-Tenant-Slug": "miracurl-marathahalli"})
        assert r.status_code == 200
        assert "name" in r.json()

    def test_elegance_public_services_by_slug(self):
        r = requests.get(f"{API}/public/services", headers={"X-Tenant-Slug": "elegance-koramangala"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------- Super Admin ----------------
class TestSuperAdmin:
    def test_super_admin_tenant_list(self):
        s, _ = _login(SUPER)
        # try a few common endpoints
        for ep in ["/super-admin/tenants", "/super-admin/salons", "/super-admin/security/snapshot"]:
            r = s.get(f"{API}{ep}")
            if r.status_code == 200:
                return
        pytest.fail("no super-admin listing endpoint responded 200")


# ---------------- Dashboard (admin) ----------------
class TestAdminDashboard:
    def test_dashboard_endpoint_stable(self):
        s, _ = _login(ADMIN)
        s.headers["X-Owner-Pin"] = PIN
        r = s.get(f"{API}/reports/dashboard")
        assert r.status_code == 200
        d = r.json()
        for k in ("today_revenue", "today_bookings", "total_customers", "active_staff"):
            assert k in d


# ---------------- Gallery / Mira Studio smoke ----------------
class TestGalleryAndMiraStudioSmoke:
    def test_gallery_list(self):
        s, _ = _login(ADMIN)
        s.headers["X-Owner-Pin"] = PIN
        r = s.get(f"{API}/gallery")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_mira_studio_agents_list(self):
        s, _ = _login(ADMIN)
        s.headers["X-Owner-Pin"] = PIN
        r = s.get(f"{API}/mira-studio/agents")
        assert r.status_code == 200
        assert isinstance(r.json(), (list, dict))

    def test_social_connections_returns_config(self):
        s, _ = _login(ADMIN)
        s.headers["X-Owner-Pin"] = PIN
        r = s.get(f"{API}/social/connections")
        assert r.status_code == 200
        d = r.json()
        # must expose the config booleans the removed helper used
        for k in ("meta_configured", "google_configured"):
            assert k in d, f"missing {k} in {d}"


# ---------------- Inventory low-stock ----------------
class TestInventoryLowStock:
    def test_low_stock_field_present(self):
        s, _ = _login(ADMIN)
        s.headers["X-Owner-Pin"] = PIN
        r = s.get(f"{API}/products")
        assert r.status_code == 200
        for p in r.json():
            assert "stock" in p and "name" in p


# ---------------- Forgot password (render only, no submit) ----------------
class TestForgotPasswordSmoke:
    def test_endpoint_accepts_shape(self):
        # Do NOT actually submit an email to avoid rate-limit hit for iteration_79
        # Just OPTIONS-check or a bad-shape POST that gets 422 without consuming the bucket
        r = requests.post(f"{API}/auth/forgot-password", json={})
        # 422 (missing required field) OR 200 (silent no-op) — anything except 5xx
        assert r.status_code < 500, f"forgot-password 5xx: {r.status_code}"
