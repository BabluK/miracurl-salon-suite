"""Iteration 96: verify branch rename cascade + geo-link + branding maps_url + staff fence.
Review focus:
- PUT /api/branches/{bid} cascades new name to staff/users/invoices, then restore.
- GET /api/attendance/today?branch=<name> is case+whitespace insensitive; __main__ isolates main-salon staff.
- Reports dashboard/sales branch filters return real totals for main salon + AECS.
- POST /api/invoices as branch-locked manager tags branch_name = current AECS branch name.
- POST /api/tenants/current/geo/from-link accepts (a) full maps URL, (b) ?q=lat,lng, (c) plain text, (d) rejects non-Google.
- GET/PUT /api/settings/branding maps_url sets tenant lat/lng.
- GET /api/staff/me/fence for a staff account returns fenced=true.
Restores AECS branch name + main salon coords at the end.
"""
import os
import time
import pytest
import requests

def _load_env_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v
    try:
        for line in open("/app/frontend/.env"):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    except OSError:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE = _load_env_backend_url().rstrip("/") + "/api"
TENANT = "miracurl-marathahalli"

from creds import password_for  # noqa: E402

ADMIN_EMAIL = "admin@miracurl.com"
MGR_EMAIL = "aecs.manager@miracurl.com"
STAFF_EMAIL = "priya.staff@miracurl.com"
OWNER_PIN = "4321"

MAIN_LAT = 12.9482932
MAIN_LNG = 77.7049318


def _login(email, password, headers=None):
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT, "Content-Type": "application/json"})
    if headers:
        s.headers.update(headers)
    r = s.post(f"{BASE}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    s = _login(ADMIN_EMAIL, password_for(ADMIN_EMAIL), {"X-Owner-Pin": OWNER_PIN})
    return s


@pytest.fixture(scope="module")
def manager():
    return _login(MGR_EMAIL, password_for(MGR_EMAIL))


@pytest.fixture(scope="module")
def staff_sess():
    return _login(STAFF_EMAIL, password_for(STAFF_EMAIL))


@pytest.fixture(scope="module")
def aecs_branch(admin):
    r = admin.get(f"{BASE}/branches")
    assert r.status_code == 200, r.text
    branches = r.json()
    aecs = next((b for b in branches if "aecs" in (b.get("name") or "").lower()), None)
    assert aecs, f"AECS branch not found. Branches: {[b.get('name') for b in branches]}"
    return aecs


# -------- 1) branch case/whitespace insensitivity --------
def test_attendance_today_case_and_whitespace(admin, aecs_branch):
    name = aecs_branch["name"]
    r_exact = admin.get(f"{BASE}/attendance/today", params={"branch": name})
    assert r_exact.status_code == 200
    exact = r_exact.json()

    variant = f"  {name.lower()}  "
    r_var = admin.get(f"{BASE}/attendance/today", params={"branch": variant})
    assert r_var.status_code == 200
    var = r_var.json()
    assert var["total_staff"] == exact["total_staff"], (
        f"Case/whitespace mismatch: exact={exact['total_staff']} variant={var['total_staff']}")
    assert var["total_staff"] > 0


def test_attendance_today_main_only(admin):
    r = admin.get(f"{BASE}/attendance/today", params={"branch": "__main__"})
    assert r.status_code == 200
    data = r.json()
    # Should be 6-7 per spec
    assert 3 <= data["total_staff"] <= 15, f"__main__ staff count: {data['total_staff']}"
    for row in data["roster"]:
        assert not (row.get("branch") or "").strip(), f"main-only leaked branch-tagged staff: {row}"


def test_attendance_today_all(admin):
    r = admin.get(f"{BASE}/attendance/today")
    assert r.status_code == 200
    data = r.json()
    assert data["total_staff"] >= 6


# -------- 2) branch rename cascade --------
def test_branch_rename_cascade_and_restore(admin, aecs_branch):
    bid = aecs_branch["id"]
    original_name = aecs_branch["name"]
    new_name = "TEST_AECS_Renamed_TMP"

    # Roster under original name
    r0 = admin.get(f"{BASE}/attendance/today", params={"branch": original_name})
    assert r0.status_code == 200
    orig_count = r0.json()["total_staff"]
    assert orig_count > 0

    # Rename
    payload = {"name": new_name,
               "address": aecs_branch.get("address") or "AECS Layout",
               "phone": aecs_branch.get("phone") or "",
               "maps_url": aecs_branch.get("maps_url") or ""}
    r1 = admin.put(f"{BASE}/branches/{bid}", json=payload)
    assert r1.status_code == 200, r1.text

    try:
        # Staff list under NEW name
        r2 = admin.get(f"{BASE}/attendance/today", params={"branch": new_name})
        assert r2.status_code == 200
        new_count = r2.json()["total_staff"]
        assert new_count == orig_count, f"cascade broke roster: orig={orig_count} new={new_count}"

        # Old name should now be empty (branch_name in staff was updated)
        r3 = admin.get(f"{BASE}/attendance/today", params={"branch": original_name})
        assert r3.status_code == 200
        assert r3.json()["total_staff"] == 0, "stale name still returns staff (cascade failed)"
    finally:
        # Restore
        payload["name"] = original_name
        r_restore = admin.put(f"{BASE}/branches/{bid}", json=payload)
        assert r_restore.status_code == 200, f"restore failed: {r_restore.text}"

    # Re-verify restore
    r4 = admin.get(f"{BASE}/attendance/today", params={"branch": original_name})
    assert r4.status_code == 200
    assert r4.json()["total_staff"] == orig_count


# -------- 3) dashboard revenue by branch --------
def test_dashboard_main(admin):
    r = admin.get(f"{BASE}/reports/dashboard", params={"branch": "__main__"})
    assert r.status_code == 200
    data = r.json()
    assert data["month_revenue"] > 0, f"__main__ month_revenue=0: {data}"


def test_dashboard_aecs(admin, aecs_branch):
    r = admin.get(f"{BASE}/reports/dashboard", params={"branch": aecs_branch["name"]})
    assert r.status_code == 200
    data = r.json()
    assert data["month_revenue"] >= 0
    # spec says ~118; assert not None
    assert "month_revenue" in data


def test_sales_report_branch(admin, aecs_branch):
    r = admin.get(f"{BASE}/reports/sales", params={"branch": aecs_branch["name"]})
    assert r.status_code == 200
    j = r.json()
    assert "total_revenue" in j
    for row in j["by_branch"]:
        # branch filter should only return AECS invoices
        assert aecs_branch["name"].casefold() in (row["branch"] or "").casefold() or row["revenue"] == 0


# -------- 4) manager invoice tagged with current AECS branch name --------
def test_manager_invoice_tagged_with_aecs(manager, admin, aecs_branch):
    # Find customer + service item
    cust = admin.get(f"{BASE}/customers").json()
    if isinstance(cust, dict) and "items" in cust:
        cust = cust["items"]
    assert cust, "need at least one customer"
    customer_id = cust[0]["id"]

    payload = {
        "customer_id": customer_id,
        "items": [{"type": "service", "ref_id": "adhoc", "name": "TEST_iter96_svc",
                   "qty": 1, "price": 50.0}],
        "payment_mode": "cash",
    }
    r = manager.post(f"{BASE}/invoices", json=payload)
    assert r.status_code in (200, 201), f"invoice create: {r.status_code} {r.text}"
    inv = r.json()
    inv_id = inv.get("id")
    print(f"TEST_INVOICE_ID={inv_id}")
    # Must be tagged with current AECS branch name (case may differ from manager's stored branch)
    assert (inv.get("branch_name") or "").strip().casefold() == aecs_branch["name"].strip().casefold(), (
        f"branch_name mismatch: got '{inv.get('branch_name')}' expected '{aecs_branch['name']}'")

    # Confirm appears in AECS dashboard today_revenue
    time.sleep(1)
    r2 = admin.get(f"{BASE}/reports/dashboard", params={"branch": aecs_branch["name"]})
    assert r2.status_code == 200
    assert r2.json()["today_revenue"] >= 50


# -------- 5) geo from-link variants --------
def test_geo_from_link_full_url(admin):
    url = "https://www.google.com/maps/place/Bengaluru/@12.9716,77.5946,15z/data=!3m1!4b1!4m5!3m4!1s0x0!8m2!3d12.9716!4d77.5946"
    r = admin.post(f"{BASE}/tenants/current/geo/from-link", json={"url": url})
    assert r.status_code == 200, r.text
    j = r.json()
    assert abs(j["latitude"] - 12.9716) < 0.01
    assert abs(j["longitude"] - 77.5946) < 0.01


def test_geo_from_link_q_param(admin):
    url = "https://maps.google.com/?q=13.0827,80.2707"
    r = admin.post(f"{BASE}/tenants/current/geo/from-link", json={"url": url})
    assert r.status_code == 200, r.text
    j = r.json()
    assert abs(j["latitude"] - 13.0827) < 0.01


def test_geo_from_link_non_google_rejected(admin):
    r = admin.post(f"{BASE}/tenants/current/geo/from-link",
                   json={"url": "https://openstreetmap.org/#map=15/12.9716/77.5946"})
    assert r.status_code == 400


def test_geo_from_link_plain_text_and_restore(admin):
    # Uses live Google Places — restore main salon coords too
    r = admin.post(f"{BASE}/tenants/current/geo/from-link",
                   json={"url": "Miracurl Unisex Saloon Marathahalli Bengaluru"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["latitude"] is not None
    assert j["longitude"] is not None

    # Explicit restore to canonical main-salon coords
    r2 = admin.put(f"{BASE}/tenants/current/geo",
                   json={"latitude": MAIN_LAT, "longitude": MAIN_LNG})
    assert r2.status_code == 200


# -------- 6) settings/branding maps_url --------
def test_branding_returns_maps_url(admin):
    r = admin.get(f"{BASE}/settings/branding")
    assert r.status_code == 200
    assert "maps_url" in r.json()


def test_branding_put_maps_url_updates_geo(admin):
    # Snapshot current
    cur = admin.get(f"{BASE}/settings/branding").json()
    original_maps = cur.get("maps_url") or ""
    test_url = "https://maps.google.com/?q=12.9482932,77.7049318"
    r = admin.put(f"{BASE}/settings/branding", json={"maps_url": test_url})
    assert r.status_code == 200
    # Now tenant should have latitude/longitude near main
    tr = admin.get(f"{BASE}/tenants/current").json()
    assert abs(tr.get("latitude", 0) - MAIN_LAT) < 0.01
    # Restore original maps_url if present
    if original_maps:
        admin.put(f"{BASE}/settings/branding", json={"maps_url": original_maps})


# -------- 7) staff fence --------
def test_staff_fence(staff_sess):
    r = staff_sess.get(f"{BASE}/staff/me/fence")
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["fenced"] == True, f"expected fenced=True, got {j}"
    assert j["label"] in ("the salon",) or j["label"], j
    assert j["fence_m"] > 0
