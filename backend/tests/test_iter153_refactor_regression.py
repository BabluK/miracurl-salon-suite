"""Iter 153 regression: after backend-wide unused import purge + refactors.

Any 500/NameError/ImportError on these endpoints is a HIGH bug.
"""
import os
import pytest
import requests
from datetime import datetime, timezone, timedelta

def _read_env(path):
    try:
        with open(path) as f:
            for ln in f:
                if ln.startswith("REACT_APP_BACKEND_URL="):
                    return ln.split("=",1)[1].strip()
    except Exception:
        pass
    return None
BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _read_env("/app/frontend/.env")).rstrip("/")
API = BASE + "/api"

ADMIN = ("admin@miracurl.com", "q6QY@tn3p#9DtL")
STAFF = ("priya.staff@miracurl.com", "Staff@5678")
SUPER = ("super@miracurl.com", "og9T@41Es#OQb6")
TSLUG = "miracurl-marathahalli"

SVC_ID = "d6585359-1052-4dd0-b7dc-1c20cf9f2327"
STAFF_ID = "3cdf66d1-ea58-4605-a4d7-333330a96e8a"


def _login(email, password, slug=None):
    s = requests.Session()
    headers = {"Content-Type": "application/json"}
    if slug:
        headers["X-Tenant-Slug"] = slug
        s.headers["X-Tenant-Slug"] = slug
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, headers=headers, timeout=20)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text[:300]}"
    csrf = s.cookies.get("csrf_token")
    if csrf:
        s.headers["X-CSRF-Token"] = csrf
    s.headers["X-Owner-Pin"] = "4321"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(*ADMIN, slug=TSLUG)

@pytest.fixture(scope="module")
def staff():
    return _login(*STAFF, slug=TSLUG)

@pytest.fixture(scope="module")
def superadmin():
    return _login(*SUPER)


# ---- Admin core smoke ----
SMOKE_GETS = [
    "/reports/dashboard",
    "/appointments?date=2026-09-12",
    "/services",
    "/customers",
    "/staff",
    "/products",
    "/invoices?limit=5",
    "/settings/tax",
    "/services/banner-schedules",
    "/color-picks",
    "/gift-cards",
    "/billing/subscription-status",
]

@pytest.mark.parametrize("path", SMOKE_GETS)
def test_admin_smoke(admin, path):
    r = admin.get(API + path, timeout=25)
    assert r.status_code == 200, f"GET {path} -> {r.status_code} {r.text[:300]}"
    # ensure JSON parseable
    r.json()


def test_admin_new_bookings_notifications(admin):
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    r = admin.get(f"{API}/notifications/new-bookings", params={"since": since}, timeout=20)
    assert r.status_code == 200, r.text[:300]
    r.json()


# ---- Public endpoints ----
def test_public_plans():
    r = requests.get(f"{API}/public/plans", timeout=15)
    assert r.status_code == 200, r.text[:200]
    assert isinstance(r.json(), (list, dict))

def test_public_salon():
    r = requests.get(f"{API}/public/salon/{TSLUG}", timeout=15)
    assert r.status_code == 200, r.text[:200]

def test_public_color():
    r = requests.get(f"{API}/public/color/{TSLUG}", timeout=15)
    assert r.status_code == 200, r.text[:200]

def test_public_pay_link_bogus_returns_404():
    r = requests.get(f"{API}/public/pay-link/does-not-exist-abc123", timeout=15)
    assert r.status_code in (404, 400), f"expected 404, got {r.status_code} {r.text[:200]}"


# ---- Public booking -> billing -> completed ----
@pytest.fixture(scope="module")
def created_booking():
    when = "2026-09-17T12:00:00+05:30"
    body = {
        "customer_name": "Iter153 QA",
        "customer_phone": "9000000153",
        "service_ids": [SVC_ID],
        "scheduled_at": when,
    }
    r = requests.post(f"{API}/public/book/{TSLUG}", json=body, timeout=25)
    assert r.status_code == 200, f"public book: {r.status_code} {r.text[:400]}"
    data = r.json()
    appt = data.get("appointment") or data
    aid = appt.get("id") or data.get("id")
    assert aid, f"no appt id in response: {data}"
    return {"id": aid, "customer_id": appt.get("customer_id") or data.get("customer_id")}


def test_public_booking_visible_to_admin(admin, created_booking):
    r = admin.get(f"{API}/appointments/{created_booking['id']}", timeout=15)
    assert r.status_code == 200, r.text[:300]


def test_billing_marks_appointment_completed(admin, created_booking):
    aid = created_booking["id"]
    # customer_id from the appointment
    ap = admin.get(f"{API}/appointments/{aid}", timeout=15).json()
    cust_id = ap.get("customer_id") or created_booking.get("customer_id")
    assert cust_id, "no customer_id"
    inv_body = {
        "customer_id": cust_id,
        "items": [{
            "type": "service",
            "kind": "service",
            "ref_id": SVC_ID,
            "name": "Hair Cut - Men",
            "price": 350,
            "qty": 1,
            "staff_id": STAFF_ID,
        }],
        "payment_mode": "cash",
        "status": "completed",
        "appointment_id": aid,
    }
    r = admin.post(f"{API}/invoices", json=inv_body, timeout=25)
    assert r.status_code == 200, f"invoice create: {r.status_code} {r.text[:500]}"

    ap2 = admin.get(f"{API}/appointments/{aid}", timeout=15).json()
    assert ap2.get("status") == "completed", f"expected status completed, got {ap2.get('status')}"
    assert ap2.get("completed_via") == "billing", f"expected completed_via billing, got {ap2.get('completed_via')}"

    r2 = admin.get(f"{API}/appointments/billing-status", params={"ids": aid}, timeout=15)
    assert r2.status_code == 200, r2.text[:300]
    js = r2.json()
    assert aid in str(js), f"appt not in billing-status: {js}"


# ---- Staff role ----
ALLOWED_CUST_KEYS = {"id","name","phone","gender","loyalty_points","wallet_balance","referral_code","visits","crm_status","created_at"}

def test_staff_customers_projection(staff):
    r = staff.get(f"{API}/customers", timeout=20)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    items = data if isinstance(data, list) else data.get("items") or data.get("customers") or []
    assert items, "no customers returned for staff"
    for c in items[:20]:
        extra = set(c.keys()) - ALLOWED_CUST_KEYS
        assert not extra, f"staff got extra customer fields: {extra} in {c.keys()}"


def test_staff_tax(staff):
    r = staff.get(f"{API}/settings/tax", timeout=15)
    assert r.status_code == 200, r.text[:300]

def test_staff_gift_card_check(staff):
    r = staff.post(f"{API}/gift-cards/check", json={"code": "GC-NOPE"}, timeout=15)
    assert r.status_code == 200, r.text[:300]
    js = r.json()
    assert js.get("valid") is False, f"expected valid:false, got {js}"

def test_staff_new_bookings(staff):
    r = staff.get(f"{API}/notifications/new-bookings", params={"since": "2026-09-12T00:00:00+00:00"}, timeout=15)
    assert r.status_code == 200, r.text[:300]


# ---- Super-admin ----
def test_super_founder_funnel(superadmin):
    r = superadmin.get(f"{API}/super-admin/founder-funnel", timeout=25)
    assert r.status_code == 200, r.text[:300]
    js = r.json()
    for k in ["sent","opened","replied","live","logged_in","rated","avg_rating","paid","salons"]:
        assert k in js, f"missing key {k} in founder-funnel keys={list(js.keys())}"

def test_super_plans(superadmin):
    r = superadmin.get(f"{API}/super-admin/plans", timeout=15)
    assert r.status_code == 200, r.text[:300]

def test_super_subscriptions(superadmin):
    r = superadmin.get(f"{API}/super-admin/subscriptions", timeout=20)
    assert r.status_code == 200, r.text[:300]

def test_super_rewards_agreements(superadmin):
    r = superadmin.get(f"{API}/super-admin/rewards-campaign/agreements", timeout=15)
    assert r.status_code == 200, r.text[:300]


# ---- Cash register report ----
def test_cash_send_report(admin):
    r = admin.post(f"{API}/cash/send-report", params={"date": "2026-09-12"}, timeout=30)
    assert r.status_code == 200, r.text[:400]
    js = r.json()
    for k in ("sent","failed","skipped"):
        assert k in js, f"missing {k} in cash report {js}"


# ---- Rewards campaign agreement ----
def test_rewards_accept_missing_agree(admin):
    r = admin.post(f"{API}/settings/rewards-campaign/agreement/accept",
                   json={"full_name":"QA Tester","designation":"Owner","agree":False}, timeout=15)
    assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text[:300]}"
    assert "agree" in r.text.lower() or "tick" in r.text.lower()

def test_rewards_accept_agree_true(admin):
    r = admin.post(f"{API}/settings/rewards-campaign/agreement/accept",
                   json={"full_name":"QA Tester","designation":"Owner","agree":True}, timeout=20)
    # Accept 200 or 400 (already accepted / not open), NOT 500
    assert r.status_code in (200, 400), f"unexpected {r.status_code}: {r.text[:400]}"


# ---- Morning briefing (email HTML builders indirectly) ----
def test_morning_briefing(admin):
    r = admin.get(f"{API}/reports/morning-briefing", timeout=25)
    assert r.status_code == 200, r.text[:400]
    js = r.json()
    assert "today_appointments" in js or "appointments" in js or isinstance(js, dict)
