"""Iter 15 backend regression — per-line staff fields on InvoiceItem.

Validates that:
1. POST /api/invoices accepts items[].staff_id and items[].staff_name (no 422).
2. The response invoice.items[*] returns the staff_id / staff_name set on create.
3. A line without staff_id / staff_name still works (backward compat — fields optional).
"""

import os
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASSWORD = "Miracurl@123"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def seed_ids(headers):
    """Pick one customer, one staff, one service from the tenant."""
    cust = requests.get(f"{BASE_URL}/api/customers", headers=headers, timeout=15).json()
    staff = requests.get(f"{BASE_URL}/api/staff", headers=headers, timeout=15).json()
    svc = requests.get(f"{BASE_URL}/api/services", headers=headers, timeout=15).json()

    if not cust:
        c = requests.post(
            f"{BASE_URL}/api/customers",
            headers=headers,
            json={"name": "TEST_ITER15", "phone": f"99000{int(time.time())%100000:05d}"},
            timeout=15,
        ).json()
        cust = [c]
    assert staff, "Tenant must have at least one staff for this test"
    assert svc, "Tenant must have at least one service for this test"

    return {
        "customer": cust[0],
        "staff": staff[0],
        "staff2": staff[1] if len(staff) > 1 else staff[0],
        "service": svc[0],
    }


class TestInvoicePerLineStaff:
    def test_create_invoice_with_per_line_staff(self, headers, seed_ids):
        s1 = seed_ids["staff"]
        s2 = seed_ids["staff2"]
        svc = seed_ids["service"]
        cust = seed_ids["customer"]

        payload = {
            "customer_id": cust["id"],
            "customer_name": cust["name"],
            "staff_id": s1["id"],
            "items": [
                {
                    "type": "service",
                    "ref_id": svc["id"],
                    "name": svc["name"],
                    "qty": 1,
                    "price": svc.get("price", 500),
                    "staff_id": s1["id"],
                    "staff_name": s1["name"],
                },
                {
                    "type": "service",
                    "ref_id": svc["id"],
                    "name": svc["name"],
                    "qty": 1,
                    "price": svc.get("price", 500),
                    "staff_id": s2["id"],
                    "staff_name": s2["name"],
                },
            ],
            "subtotal": svc.get("price", 500) * 2,
            "discount": 0,
            "tax": 0,
            "total": svc.get("price", 500) * 2,
            "payment_mode": "cash",
        }

        r = requests.post(
            f"{BASE_URL}/api/invoices", headers=headers, json=payload, timeout=20
        )
        assert r.status_code in (200, 201), f"{r.status_code} :: {r.text}"

        inv = r.json()
        assert "id" in inv
        assert len(inv["items"]) == 2
        assert inv["items"][0]["staff_id"] == s1["id"]
        assert inv["items"][0]["staff_name"] == s1["name"]
        assert inv["items"][1]["staff_id"] == s2["id"]
        assert inv["items"][1]["staff_name"] == s2["name"]

        # GET list to verify persisted (no single-invoice endpoint exists)
        g = requests.get(f"{BASE_URL}/api/invoices", headers=headers, timeout=15)
        assert g.status_code == 200, g.text
        listed = [x for x in g.json() if x.get("id") == inv["id"]]
        assert listed, "Created invoice not found in /api/invoices list"
        gi = listed[0]
        assert gi["items"][0]["staff_name"] == s1["name"]
        assert gi["items"][1]["staff_name"] == s2["name"]

    def test_create_invoice_without_staff_fields_still_works(self, headers, seed_ids):
        svc = seed_ids["service"]
        cust = seed_ids["customer"]
        payload = {
            "customer_id": cust["id"],
            "customer_name": cust["name"],
            "items": [
                {
                    "type": "service",
                    "ref_id": svc["id"],
                    "name": svc["name"],
                    "qty": 1,
                    "price": svc.get("price", 500),
                }
            ],
            "subtotal": svc.get("price", 500),
            "discount": 0,
            "tax": 0,
            "total": svc.get("price", 500),
            "payment_mode": "cash",
        }
        r = requests.post(
            f"{BASE_URL}/api/invoices", headers=headers, json=payload, timeout=20
        )
        assert r.status_code in (200, 201), f"{r.status_code} :: {r.text}"
        inv = r.json()
        assert inv["items"][0].get("staff_id") in (None, "")
        assert inv["items"][0].get("staff_name") in (None, "")

    def test_create_invoice_with_null_line_staff_accepted(self, headers, seed_ids):
        """Frontend sends `staff_id: null, staff_name: null` when no per-line staff picked."""
        svc = seed_ids["service"]
        cust = seed_ids["customer"]
        payload = {
            "customer_id": cust["id"],
            "customer_name": cust["name"],
            "items": [
                {
                    "type": "service",
                    "ref_id": svc["id"],
                    "name": svc["name"],
                    "qty": 1,
                    "price": svc.get("price", 500),
                    "staff_id": None,
                    "staff_name": None,
                }
            ],
            "subtotal": svc.get("price", 500),
            "discount": 0,
            "tax": 0,
            "total": svc.get("price", 500),
            "payment_mode": "cash",
        }
        r = requests.post(
            f"{BASE_URL}/api/invoices", headers=headers, json=payload, timeout=20
        )
        assert r.status_code in (200, 201), f"{r.status_code} :: {r.text}"
