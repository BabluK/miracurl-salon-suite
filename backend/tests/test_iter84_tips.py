"""Iter 84 — Tip capture at billing (POS) + Staff Tips report."""
import os
import time
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
TENANT_SLUG = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASSWORD = "q6QY@tn3p#9DtL"
OWNER_PIN = "4321"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "X-Tenant-Slug": TENANT_SLUG,
    })
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    s.headers["X-Owner-Pin"] = OWNER_PIN
    return s


@pytest.fixture(scope="module")
def fixtures(session):
    """Grab a customer, staff, and service to use for invoice creation."""
    staff = session.get(f"{BASE_URL}/api/staff").json()
    services = session.get(f"{BASE_URL}/api/services").json()
    customers = session.get(f"{BASE_URL}/api/customers").json()
    assert staff and services, "need staff and services seeded"
    # Create a test customer if none available or all missing phone
    cust_list = customers.get("items") if isinstance(customers, dict) else customers
    if not cust_list:
        r = session.post(f"{BASE_URL}/api/customers",
                         json={"name": "TEST_TipsGuest", "phone": "9990001111"})
        assert r.status_code in (200, 201), r.text
        cust = r.json()
    else:
        cust = cust_list[0]
    svc = services[0] if isinstance(services, list) else services.get("items", [services])[0]
    return {
        "customer": cust,
        "staff": staff[0] if isinstance(staff, list) else staff.get("items", [staff])[0],
        "staff2": staff[1] if isinstance(staff, list) and len(staff) > 1 else (staff[0] if isinstance(staff, list) else staff.get("items", [staff])[0]),
        "service": svc,
    }


def _svc_item(svc, staff=None):
    return {
        "type": "service",
        "ref_id": svc["id"],
        "name": svc["name"],
        "qty": 1,
        "price": float(svc["price"]),
        **({"staff_id": staff["id"], "staff_name": staff["name"]} if staff else {}),
    }


created_invoice_ids = []


def test_tip_with_explicit_tip_staff(session, fixtures):
    cust, staff, svc = fixtures["customer"], fixtures["staff"], fixtures["service"]
    payload = {
        "customer_id": cust["id"],
        "items": [_svc_item(svc, staff=staff)],
        "tip_amount": 100,
        "tip_staff_id": staff["id"],
        "payment_mode": "cash",
    }
    r = session.post(f"{BASE_URL}/api/invoices", json=payload)
    assert r.status_code == 200, r.text
    inv = r.json()
    created_invoice_ids.append(inv["id"])
    assert inv["tip"] == 100
    assert inv["tip_staff_id"] == staff["id"]
    assert inv["tip_staff_name"] == staff["name"]
    # total must NOT include tip
    assert abs(inv["total"] - (inv["subtotal"] - inv["discount"] + inv["tax"])) < 0.01, \
        f"total {inv['total']} != subtotal-discount+tax; must exclude tip"
    assert inv["tip"] not in [inv["total"]], "tip should not equal total"
    assert inv["total"] < inv["total"] + inv["tip"]  # sanity


def test_tip_fallback_to_invoice_staff(session, fixtures):
    """tip_amount>0 with no tip_staff_id → falls back to invoice-level staff."""
    cust, staff, svc = fixtures["customer"], fixtures["staff2"], fixtures["service"]
    payload = {
        "customer_id": cust["id"],
        "staff_id": staff["id"],
        "items": [_svc_item(svc)],  # no per-line staff, invoice-level staff instead
        "tip_amount": 50,
        "payment_mode": "cash",
    }
    r = session.post(f"{BASE_URL}/api/invoices", json=payload)
    assert r.status_code == 200, r.text
    inv = r.json()
    created_invoice_ids.append(inv["id"])
    assert inv["tip"] == 50
    assert inv["tip_staff_id"] == staff["id"], f"tip_staff_id should fallback to invoice staff, got {inv['tip_staff_id']}"
    assert inv["tip_staff_name"] == staff["name"]


def test_tip_zero_no_staff(session, fixtures):
    cust, staff, svc = fixtures["customer"], fixtures["staff"], fixtures["service"]
    # snapshot customer state
    before = session.get(f"{BASE_URL}/api/customers/{cust['id']}").json()
    payload = {
        "customer_id": cust["id"],
        "staff_id": staff["id"],
        "items": [_svc_item(svc)],
        "tip_amount": 0,
        "payment_mode": "cash",
    }
    r = session.post(f"{BASE_URL}/api/invoices", json=payload)
    assert r.status_code == 200, r.text
    inv = r.json()
    created_invoice_ids.append(inv["id"])
    assert inv["tip"] == 0
    assert inv["tip_staff_id"] is None
    assert inv["tip_staff_name"] is None
    # customer.total_spent bumped by invoice.total only (not any tip)
    after = session.get(f"{BASE_URL}/api/customers/{cust['id']}").json()
    delta = float(after["total_spent"]) - float(before["total_spent"])
    assert abs(delta - inv["total"]) < 0.01, f"customer total_spent delta {delta} != invoice total {inv['total']}"


def test_negative_tip_rejected(session, fixtures):
    cust, staff, svc = fixtures["customer"], fixtures["staff"], fixtures["service"]
    payload = {
        "customer_id": cust["id"],
        "staff_id": staff["id"],
        "items": [_svc_item(svc)],
        "tip_amount": -5,
        "payment_mode": "cash",
    }
    r = session.post(f"{BASE_URL}/api/invoices", json=payload)
    assert r.status_code == 422, f"expected 422 for negative tip, got {r.status_code}: {r.text}"


def test_staff_tips_report(session, fixtures):
    today = datetime.now(timezone.utc).date().isoformat()
    r = session.get(f"{BASE_URL}/api/reports/staff-tips?start={today}&end={today}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "rows" in data and "total_tips" in data
    # The two invoices we created above (with tips) should be present
    staff1_id = fixtures["staff"]["id"]
    staff2_id = fixtures["staff2"]["id"]
    row_map = {r["staff_id"]: r for r in data["rows"]}
    assert staff1_id in row_map, f"staff1 tips missing; rows={data['rows']}"
    r1 = row_map[staff1_id]
    assert r1["tips_total"] >= 100
    assert r1["tip_count"] >= 1
    assert r1["avg_tip"] > 0
    # If staff1 != staff2, staff2 should also appear
    if staff2_id != staff1_id:
        assert staff2_id in row_map
        assert row_map[staff2_id]["tips_total"] >= 50
    # total_tips consistency
    assert data["total_tips"] >= 150
