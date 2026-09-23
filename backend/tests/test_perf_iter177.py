"""Backend sanity for iteration_177 perf changes."""
import os
import time
import requests
from _creds import pw

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = pw("SALON_ADMIN")
TENANT = "miracurl-marathahalli"


def _login():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
               headers={"X-Tenant-Slug": TENANT, "Content-Type": "application/json"},
               timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return s


def test_public_demo_slots_200_fast():
    t0 = time.time()
    r = requests.get(f"{BASE}/api/public/demo/slots", timeout=10)
    dt = time.time() - t0
    assert r.status_code == 200, r.text[:200]
    assert dt < 2.0, f"slots slow: {dt:.2f}s"
    j = r.json()
    assert "dates" in j and "times" in j


def test_reports_dashboard_authed_fast():
    s = _login()
    t0 = time.time()
    r = s.get(f"{BASE}/api/reports/dashboard",
              headers={"X-Tenant-Slug": TENANT}, timeout=15)
    dt = time.time() - t0
    assert r.status_code == 200, r.text[:300]
    assert dt < 2.0, f"dashboard slow: {dt:.2f}s"


def test_auth_me_and_tenants_current_authed():
    s = _login()
    r1 = s.get(f"{BASE}/api/auth/me", headers={"X-Tenant-Slug": TENANT}, timeout=10)
    r2 = s.get(f"{BASE}/api/tenants/current", headers={"X-Tenant-Slug": TENANT}, timeout=10)
    assert r1.status_code == 200, r1.text[:200]
    assert r2.status_code == 200, r2.text[:200]


def test_super_admin_login_and_tenants_current_404():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": "super@miracurl.com", "password": pw("SUPER_ADMIN")},
               timeout=15)
    assert r.status_code == 200, r.text[:200]
    # super admin has no tenant -> /tenants/current should 404 (or similar non-200)
    r2 = s.get(f"{BASE}/api/tenants/current", timeout=10)
    assert r2.status_code in (400, 401, 403, 404), f"unexpected {r2.status_code}"


def test_customers_crud_get_cache_freshness_backend_side():
    """Ensures the underlying API returns the new record immediately (backend contract)."""
    s = _login()
    # list before
    r0 = s.get(f"{BASE}/api/customers", headers={"X-Tenant-Slug": TENANT}, timeout=10)
    assert r0.status_code == 200
    before = len(r0.json() if isinstance(r0.json(), list) else r0.json().get("items", []))

    payload = {"name": f"TEST_perf_{int(time.time())}", "phone": f"9{int(time.time()) % 1000000000:09d}"}
    csrf = s.cookies.get("csrf_token") or ""
    rc = s.post(f"{BASE}/api/customers",
                headers={"X-Tenant-Slug": TENANT, "X-Owner-Pin": "4321",
                         "X-CSRF-Token": csrf,
                         "Content-Type": "application/json"},
                json=payload, timeout=10)
    assert rc.status_code in (200, 201), f"create failed {rc.status_code}: {rc.text[:200]}"
    new = rc.json()
    new_id = new.get("id") or new.get("_id")

    r1 = s.get(f"{BASE}/api/customers", headers={"X-Tenant-Slug": TENANT}, timeout=10)
    assert r1.status_code == 200
    items = r1.json() if isinstance(r1.json(), list) else r1.json().get("items", [])
    assert len(items) >= before + 1, "new customer not appearing in list"
    assert any((c.get("id") == new_id or c.get("name") == payload["name"]) for c in items)

    if new_id:
        rd = s.delete(f"{BASE}/api/customers/{new_id}",
                      headers={"X-Tenant-Slug": TENANT, "X-Owner-Pin": "4321",
                               "X-CSRF-Token": csrf}, timeout=10)
        assert rd.status_code in (200, 204)
