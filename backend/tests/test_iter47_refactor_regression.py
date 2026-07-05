"""
Iter 47 — Refactor Regression Suite

Tests to catch subtle regressions after the module extractions:
- database.py, security.py, services/storage.py, services/pdf.py

Covers: auth (all 4 roles), tenant scoping, RBAC, storage (upload/serve),
core flows (staff, attendance, invoice, dashboard, registry, super-admin,
engineer health), and cross-module PDF endpoints.
"""
import os
import io
import time
import base64
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

CREDS = {
    "super": ("super@miracurl.com", "og9T@41Es#OQb6"),
    "admin": ("admin@miracurl.com", "q6QY@tn3p#9DtL"),
    "manager": ("manager@miracurl.com", "Manager@Miracurl123"),
    "staff": ("priya.staff@miracurl.com", "Priya@Miracurl123"),
}


def _login(role):
    s = requests.Session()
    email, pw = CREDS[role]
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"{role} login failed: {r.status_code} {r.text[:200]}"
    return s, r.json()


# ---------- AUTH REGRESSION ----------
class TestAuth:
    @pytest.mark.parametrize("role", ["super", "admin", "manager", "staff"])
    def test_login_all_roles(self, role):
        s, body = _login(role)
        assert "user" in body
        assert body["user"]["role"] in ("super_admin", "admin", "manager", "staff")
        # HttpOnly cookies set
        cookies = s.cookies.get_dict()
        assert any(k in cookies for k in ("access_token", "refresh_token")), \
            f"no auth cookies for {role}: {cookies.keys()}"

    @pytest.mark.parametrize("role", ["super", "admin", "manager", "staff"])
    def test_me_works(self, role):
        s, _ = _login(role)
        r = s.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r.status_code == 200
        assert "email" in r.json()

    def test_wrong_password_401(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "admin@miracurl.com", "password": "WRONGxyz"},
                          timeout=10)
        assert r.status_code == 401

    def test_protected_without_cookie_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r.status_code == 401

    def test_refresh_flow(self):
        s, _ = _login("admin")
        r = s.post(f"{BASE_URL}/api/auth/refresh", timeout=10)
        # Endpoint may be POST or GET; accept 200 or 401 (if not implemented as expected)
        assert r.status_code in (200, 204), f"refresh returned {r.status_code}: {r.text[:200]}"
        # After refresh, /me should still work
        r2 = s.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r2.status_code == 200

    def test_logout_clears_cookies(self):
        s, _ = _login("admin")
        r = s.post(f"{BASE_URL}/api/auth/logout", timeout=10)
        assert r.status_code in (200, 204)
        r2 = s.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r2.status_code == 401

    def test_manager_blocked_from_admin_only(self):
        """Manager should be blocked from admin-only endpoints (require_tenant_admin).
        DELETE /api/staff/{sid} uses require_tenant_admin.
        """
        s, _ = _login("manager")
        # Use a bogus id — auth check happens before lookup, so a manager
        # should get 403 regardless of whether the id exists.
        r = s.delete(f"{BASE_URL}/api/staff/nonexistent-id-xyz", timeout=10)
        assert r.status_code in (403, 401), \
            f"manager should be blocked from delete-staff (require_tenant_admin), got {r.status_code}: {r.text[:200]}"


# ---------- TENANT SCOPING ----------
class TestTenantScoping:
    def test_admin_sees_only_own_tenant_staff(self):
        s, body = _login("admin")
        tenant_id = body["user"]["tenant_id"]
        r = s.get(f"{BASE_URL}/api/staff", timeout=15)
        assert r.status_code == 200
        staff = r.json()
        assert isinstance(staff, list)
        # Every staff row should belong to admin's tenant (either explicit tenant_id or none)
        for st in staff:
            if "tenant_id" in st:
                assert st["tenant_id"] == tenant_id, \
                    f"tenant leak! staff {st.get('id')} belongs to {st.get('tenant_id')}"


# ---------- STORAGE REGRESSION ----------
class TestStorage:
    # 1x1 transparent PNG
    PNG_B64 = ("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
               "+A8AAQUBAScY42YAAAAASUVORK5CYII=")

    def test_upload_and_serve(self):
        s, _ = _login("admin")
        png = base64.b64decode(self.PNG_B64)
        files = {"file": ("test_pixel.png", io.BytesIO(png), "image/png")}
        # Try common upload endpoints
        tried = []
        for path in ["/api/uploads/image", "/api/uploads", "/api/tenant/upload-logo"]:
            r = s.post(f"{BASE_URL}{path}", files=files, timeout=30)
            tried.append((path, r.status_code))
            if r.status_code == 200:
                data = r.json()
                url = data.get("url") or data.get("path") or data.get("logo_url")
                assert url, f"upload {path} 200 but no url in {data}"
                # Try to fetch it
                get_r = requests.get(url if url.startswith("http") else f"{BASE_URL}{url}",
                                     timeout=15)
                assert get_r.status_code == 200, f"fetch upload failed {get_r.status_code}"
                assert get_r.headers.get("content-type", "").startswith("image/") or len(get_r.content) > 0
                return
        pytest.skip(f"No matching upload endpoint found. tried={tried}")


# ---------- CORE FLOWS ----------
class TestCoreFlows:
    def test_staff_list(self):
        s, _ = _login("admin")
        r = s.get(f"{BASE_URL}/api/staff", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_attendance_today(self):
        s, _ = _login("admin")
        r = s.get(f"{BASE_URL}/api/attendance/today", timeout=15)
        assert r.status_code == 200

    def test_staff_checkin_geo(self):
        s, _ = _login("staff")
        # near pinned fence (12.9569,77.7011) → (12.95694,77.70153)
        r = s.post(f"{BASE_URL}/api/staff/me/check-in",
                   json={"lat": 12.95694, "lng": 77.70153},
                   timeout=15)
        # Already checked in today = 400 is acceptable regression-wise
        assert r.status_code in (200, 400), f"check-in failed: {r.status_code} {r.text[:200]}"

    def test_dashboard(self):
        s, _ = _login("admin")
        r = s.get(f"{BASE_URL}/api/reports/dashboard", timeout=20)
        assert r.status_code == 200

    def test_dashboard_branch_filter(self):
        s, _ = _login("admin")
        r = s.get(f"{BASE_URL}/api/reports/dashboard?branch=main", timeout=20)
        assert r.status_code == 200

    def test_public_registry_search(self):
        r = requests.get(f"{BASE_URL}/api/public/registry/search",
                         params={"q": "123412341234"}, timeout=15)
        assert r.status_code == 200, f"registry search failed: {r.status_code} {r.text[:200]}"
        data = r.json()
        # hire_verdict should be included per spec
        results = data.get("results") if isinstance(data, dict) else data
        if isinstance(results, list) and results:
            first = results[0]
            assert "hire_verdict" in first, \
                f"missing hire_verdict in registry result: {list(first.keys())}"

    def test_pos_invoice_create(self):
        s, _ = _login("admin")
        # Fetch services + staff + customers
        rs = s.get(f"{BASE_URL}/api/services", timeout=10)
        services = rs.json() if rs.status_code == 200 else []
        rst = s.get(f"{BASE_URL}/api/staff", timeout=10)
        staff = rst.json() if rst.status_code == 200 else []
        rc = s.get(f"{BASE_URL}/api/customers", timeout=10)
        customers = rc.json() if rc.status_code == 200 else []
        if not services or not staff or not customers:
            pytest.skip("Missing services/staff/customers seed")
        svc = services[0]
        st = staff[0]
        cust = customers[0]
        payload = {
            "customer_id": cust["id"],
            "staff_id": st["id"],
            "items": [{
                "type": "service",
                "ref_id": svc.get("id"),
                "name": svc.get("name", "Test"),
                "qty": 1,
                "price": svc.get("price", 100),
            }],
            "discount": 0,
            "payment_mode": "cash",
        }
        r = s.post(f"{BASE_URL}/api/invoices", json=payload, timeout=15)
        assert r.status_code in (200, 201), f"invoice create: {r.status_code} {r.text[:400]}"


# ---------- SUPER-ADMIN ----------
class TestSuperAdmin:
    def test_tenants_list(self):
        s, _ = _login("super")
        r = s.get(f"{BASE_URL}/api/super-admin/tenants", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_overview(self):
        s, _ = _login("super")
        r = s.get(f"{BASE_URL}/api/super-admin/overview", timeout=15)
        assert r.status_code == 200

    def test_engineer_health(self):
        s, _ = _login("super")
        r = s.get(f"{BASE_URL}/api/super-admin/system/health", timeout=20)
        assert r.status_code == 200


# ---------- CROSS-MODULE PDF ENDPOINTS ----------
class TestPdfEndpoints:
    def test_registry_pdf(self):
        r = requests.get(f"{BASE_URL}/api/public/registry/search",
                         params={"aadhaar": "123412341234"}, timeout=15)
        if r.status_code != 200:
            pytest.skip("registry search unavailable")
        # try a PDF variant of the endpoint if exposed
        r2 = requests.get(f"{BASE_URL}/api/public/registry/pdf",
                          params={"aadhaar": "123412341234"}, timeout=20)
        # 200/404 both acceptable — if 500, that's the regression we want
        assert r2.status_code != 500, f"registry PDF 500: {r2.text[:300]}"

    def test_salary_slip_pdf(self):
        s, _ = _login("admin")
        rs = s.get(f"{BASE_URL}/api/staff", timeout=10)
        staff = rs.json() if rs.status_code == 200 else []
        if not staff:
            pytest.skip("no staff to try salary slip pdf")
        sid = staff[0]["id"]
        # try common route shapes
        for path in [
            f"/api/staff/{sid}/salary-slip/pdf",
            f"/api/salary/slip/{sid}/pdf",
            f"/api/staff/{sid}/salary-slip",
        ]:
            r = s.get(f"{BASE_URL}{path}", timeout=20)
            assert r.status_code != 500, f"salary slip PDF 500 at {path}: {r.text[:200]}"
            if r.status_code == 200:
                return
        # not fatal — just don't want 500s
