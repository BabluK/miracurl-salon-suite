"""Iter 152 regression — colour try-on + payroll + manager + colour reminder + public book smoke."""
import os
import time
import pytest
import requests
import os as _os
import sys as _sys

_sys.path.insert(0, _os.path.dirname(__file__))
from _creds import password_for  # noqa: E402

def _base():
    v = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if not v:
        try:
            for line in open("/app/frontend/.env"):
                if line.startswith("REACT_APP_BACKEND_URL="):
                    v = line.split("=", 1)[1].strip()
                    break
        except Exception:
            pass
    return v.rstrip("/")

BASE = _base()
SLUG = "miracurl-marathahalli"
OWNER_EMAIL = "admin@miracurl.com"
OWNER_PASS = password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD")
MANAGER_EMAIL = "manager@miracurl.com"
MANAGER_PASS = "Manager@1234"
STAFF_EMAIL = "priya.staff@miracurl.com"
STAFF_PASS = "Staff@5678"
OWNER_PIN = "4321"

TIMEOUT = 30
SLOW_MS = 500


def _login(email, password, tenant=SLUG):
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": tenant})
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=TIMEOUT)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text[:200]}"
    csrf = s.cookies.get("csrf_token")
    if csrf:
        s.headers["X-CSRF-Token"] = csrf
    return s


@pytest.fixture(scope="module")
def owner():
    s = _login(OWNER_EMAIL, OWNER_PASS)
    s.headers["X-Owner-Pin"] = OWNER_PIN
    return s


@pytest.fixture(scope="module")
def manager():
    return _login(MANAGER_EMAIL, MANAGER_PASS)


@pytest.fixture(scope="module")
def staff():
    return _login(STAFF_EMAIL, STAFF_PASS)


TIMINGS = {}


def _timed(session, method, url, **kw):
    t = time.time()
    r = session.request(method, url, timeout=TIMEOUT, **kw)
    ms = int((time.time() - t) * 1000)
    TIMINGS[f"{method} {url.replace(BASE,'')}"] = ms
    return r, ms


# ---------- BACKEND smoke ----------
@pytest.mark.parametrize("path", [
    "/api/auth/me",
    "/api/reports/dashboard",
    "/api/appointments?upcoming=true",
    "/api/staff",
    "/api/services",
    "/api/customers",
    "/api/products",
    "/api/invoices",
    "/api/whats-new",
])
def test_owner_smoke(owner, path):
    r, ms = _timed(owner, "GET", f"{BASE}{path}")
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
    if ms > SLOW_MS:
        print(f"SLOW {path} = {ms}ms")


def test_whats_new_release(owner):
    r = owner.get(f"{BASE}/api/whats-new", timeout=TIMEOUT)
    data = r.json()
    text = str(data)
    assert "2026-09-12.260" in text or "2026-09-12" in text, "release entry missing"


# ---------- Public colour ----------
def test_public_color_catalog():
    r, ms = _timed(requests, "GET", f"{BASE}/api/public/color/{SLUG}")
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    colors = data.get("colors", [])
    men = data.get("men_colors", [])
    assert len(colors) >= 40, f"colors count {len(colors)}"
    assert len(men) >= 16, f"men count {len(men)}"
    for c in colors[:5]:
        if str(c.get("id", "")).startswith("custom-"):
            continue
        assert "tier" in c and "description" in c and "level" in c and "price" in c, c


def test_public_color_trending():
    r = requests.get(f"{BASE}/api/public/color/{SLUG}/trending", timeout=TIMEOUT)
    assert r.status_code == 200, r.text[:200]


TEST_PHONE = "9000000123"


PICK_CODE = {"code": None}


def test_public_color_pick_and_customer_tag():
    body = {"color_id": "men-burgundy", "name": "Iter152 QA", "phone": TEST_PHONE, "gender": "men"}
    r = requests.post(f"{BASE}/api/public/color/{SLUG}/pick", json=body, timeout=TIMEOUT)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    PICK_CODE["code"] = d.get("code") or d.get("pick_code")
    assert PICK_CODE["code"], f"no code returned: {d}"


CREATED_APPT_ID = {"id": None}


def test_public_color_book():
    if not PICK_CODE["code"]:
        pytest.skip("pick code missing")
    body = {
        "customer_name": "Iter152 QA",
        "customer_phone": TEST_PHONE,
        "service_ids": [],
        "color_code": PICK_CODE["code"],
        "scheduled_at": "2026-12-15T11:00:00",
    }
    r = requests.post(f"{BASE}/api/public/book/{SLUG}", json=body, timeout=TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    appt = d.get("appointment") or d
    names = appt.get("service_names", []) or []
    joined = " ".join(names).lower()
    assert ("colour" in joined) or ("color" in joined), f"appointment.service_names {names} (top-level keys {list(d.keys())})"
    bv = appt.get("booked_via", "")
    assert f"/book/{SLUG}" in bv, f"booked_via={bv}"
    CREATED_APPT_ID["id"] = appt.get("id")


# ---------- Manager role ----------
def test_manager_hair_colors(manager):
    r = manager.get(f"{BASE}/api/hair-colors", timeout=TIMEOUT)
    assert r.status_code == 200, r.text[:200]


def test_manager_hair_color_guide(manager):
    r = manager.get(f"{BASE}/api/hair-colors/dark-brown/guide", timeout=TIMEOUT)
    assert r.status_code == 200, r.text[:200]


def test_manager_color_picks(manager):
    r = manager.get(f"{BASE}/api/color-picks?limit=3", timeout=TIMEOUT)
    assert r.status_code == 200, r.text[:200]


def test_manager_auto_services_forbidden(manager):
    r = manager.post(f"{BASE}/api/hair-colors/auto-services", json={}, timeout=TIMEOUT)
    assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text[:200]}"


# ---------- Owner colour-formula on test appt ----------
def test_owner_color_formula(owner):
    aid = CREATED_APPT_ID["id"]
    if not aid:
        pytest.skip("no appt id from public book")
    r = owner.patch(
        f"{BASE}/api/appointments/{aid}/color-formula",
        json={"formula": "20g 5.3 + 20g 6.0 + 40ml 20vol", "price": 1299},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    total = d.get("total") or d.get("total_amount") or d.get("appointment", {}).get("total")
    assert total is not None, f"no total in {d}"


# ---------- Payroll ----------
def test_owner_overtime_list(owner):
    r, ms = _timed(owner, "GET", f"{BASE}/api/attendance/overtime?status=all")
    assert r.status_code == 200, r.text[:200]


def test_staff_target_progress(staff):
    r = staff.get(f"{BASE}/api/staff/me/target-progress", timeout=TIMEOUT)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    assert d.get("has_target") is True, d
    assert d.get("monthly_target") == 50000, d


def test_staff_salary_slip(staff):
    r = staff.get(f"{BASE}/api/staff/me/salary-slip?month=2026-09", timeout=TIMEOUT)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    assert "commission_withheld" in d, list(d.keys())


# ---------- Colour price reminder preview ----------
def test_colour_price_reminder(owner):
    r = owner.get(f"{BASE}/api/colour-price-reminder/preview", timeout=TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    for k in ("count", "appointments", "recipients"):
        assert k in d, f"missing {k} in {list(d.keys())}"


# ---------- Cleanup ----------
def test_cleanup_appt(owner):
    aid = CREATED_APPT_ID["id"]
    if not aid:
        pytest.skip("nothing to clean")
    r = owner.delete(f"{BASE}/api/appointments/{aid}", timeout=TIMEOUT)
    assert r.status_code in (200, 204, 404)


def test_print_timings():
    for k, v in sorted(TIMINGS.items(), key=lambda x: -x[1]):
        marker = "SLOW" if v > SLOW_MS else ""
        print(f"{v:5d}ms {marker} {k}")
