"""Iter 16 backend contract tests — per-stylist commission report.

Endpoint under test: GET /api/reports/staff-commission?start&end&pct

Covers:
- Default 30% and custom pct (0, 50)
- Validation guard: pct<0 and pct>100 → 400/422
- Fallback: invoice.staff_id used when item.staff_id is null
- Unassigned bucket when neither item nor invoice has staff
- Date filter producing empty rows
- Auth required (401 when no token)
- Tenant isolation (secondary tenant invoices excluded)
"""

import os
import time
import pytest
import requests
from creds import password_for

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

ADMIN_EMAIL = os.environ.get("MIRACURL_ADMIN_EMAIL", "admin@miracurl.com")
ADMIN_PASSWORD = os.environ.get("MIRACURL_ADMIN_PASSWORD", password_for("admin@miracurl.com"))
TENANT2_EMAIL = os.environ.get("ELEGANCE_ADMIN_EMAIL", "owner@elegance.com")
TENANT2_PASSWORD = os.environ.get("ELEGANCE_ADMIN_PASSWORD", "Owner@123")


def _login(email, password):
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.cookies["access_token"]


@pytest.fixture(scope="module")
def admin_headers():
    tok = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tenant2_headers():
    try:
        tok = _login(TENANT2_EMAIL, TENANT2_PASSWORD)
        return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    except AssertionError:
        pytest.skip("Secondary tenant not seeded; skipping tenant isolation test")


@pytest.fixture(scope="module")
def seed(admin_headers):
    cust = requests.get(f"{BASE_URL}/api/customers", headers=admin_headers, timeout=15).json()
    staff = requests.get(f"{BASE_URL}/api/staff", headers=admin_headers, timeout=15).json()
    svc = requests.get(f"{BASE_URL}/api/services", headers=admin_headers, timeout=15).json()
    if not cust:
        c = requests.post(
            f"{BASE_URL}/api/customers",
            headers=admin_headers,
            json={"name": "TEST_ITER16", "phone": f"99000{int(time.time())%100000:05d}"},
            timeout=15,
        ).json()
        cust = [c]
    assert staff and svc, "Tenant needs at least one staff and one service"
    return {
        "customer": cust[0],
        "staff": staff[0],
        "staff2": staff[1] if len(staff) > 1 else staff[0],
        "service": svc[0],
    }


def _post_invoice(headers, payload):
    r = requests.post(f"{BASE_URL}/api/invoices", headers=headers, json=payload, timeout=20)
    assert r.status_code in (200, 201), f"{r.status_code}: {r.text}"
    return r.json()


# ---------- Tests ----------

class TestCommissionDefault:
    def test_shape_and_default_pct(self, admin_headers, seed):
        s = seed["staff"]
        svc = seed["service"]
        cust = seed["customer"]
        price = svc.get("price", 500) or 500
        # Ensure there's at least one staff-attributed invoice in window
        _post_invoice(admin_headers, {
            "customer_id": cust["id"], "customer_name": cust["name"],
            "staff_id": s["id"],
            "items": [{
                "type": "service", "ref_id": svc["id"], "name": svc["name"],
                "qty": 1, "price": price,
                "staff_id": s["id"], "staff_name": s["name"],
            }],
            "subtotal": price, "discount": 0, "tax": 0, "total": price,
            "payment_mode": "cash",
        })
        r = requests.get(
            f"{BASE_URL}/api/reports/staff-commission?start=2025-01-01&end=2026-12-31",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Required top-level keys
        for k in ("from", "to", "pct", "rows", "unassigned",
                  "total_invoices", "total_gross", "total_commission"):
            assert k in body, f"missing key: {k}"
        assert body["pct"] == 30.0 or body["pct"] == 30
        # Rows sorted desc by gross_revenue
        grosses = [r_["gross_revenue"] for r_ in body["rows"]]
        assert grosses == sorted(grosses, reverse=True)
        # Each row has required keys
        if body["rows"]:
            row = body["rows"][0]
            for k in ("staff_id", "staff_name", "role", "gross_revenue",
                      "commission_pct", "commission_amount",
                      "item_count", "service_count", "product_count"):
                assert k in row, f"row missing {k}"
            # commission_amount math
            for r_ in body["rows"]:
                assert abs(r_["commission_amount"] - round(r_["gross_revenue"] * 30 / 100, 2)) < 0.05
        # total_commission == sum(rows.commission_amount)
        total = round(sum(r_["commission_amount"] for r_ in body["rows"]), 2)
        assert abs(total - body["total_commission"]) < 0.05
        # Unassigned bucket shape
        unassigned = body["unassigned"]
        for k in ("gross_revenue", "item_count", "service_count", "product_count"):
            assert k in unassigned

    def test_custom_pct_50(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/reports/staff-commission?start=2025-01-01&end=2026-12-31&pct=50",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["pct"] == 50 or body["pct"] == 50.0
        for row in body["rows"]:
            assert abs(row["commission_amount"] - round(row["gross_revenue"] * 0.5, 2)) < 0.05
            assert row["commission_pct"] == 50 or row["commission_pct"] == 50.0

    def test_custom_pct_zero(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/reports/staff-commission?start=2025-01-01&end=2026-12-31&pct=0",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        for row in body["rows"]:
            assert row["commission_amount"] == 0
        assert body["total_commission"] == 0

    def test_invalid_pct_rejected(self, admin_headers):
        r1 = requests.get(
            f"{BASE_URL}/api/reports/staff-commission?start=2025-01-01&end=2026-12-31&pct=-5",
            headers=admin_headers, timeout=15,
        )
        assert r1.status_code in (400, 422), f"expected 400/422 for pct=-5, got {r1.status_code}"
        r2 = requests.get(
            f"{BASE_URL}/api/reports/staff-commission?start=2025-01-01&end=2026-12-31&pct=150",
            headers=admin_headers, timeout=15,
        )
        assert r2.status_code in (400, 422), f"expected 400/422 for pct=150, got {r2.status_code}"


class TestCommissionAttribution:
    def test_invoice_level_staff_fallback(self, admin_headers, seed):
        """Invoice.staff_id set, item.staff_id null → row attributed to staff, NOT unassigned."""
        s = seed["staff2"]
        svc = seed["service"]
        cust = seed["customer"]
        price = svc.get("price", 500) or 500
        inv = _post_invoice(admin_headers, {
            "customer_id": cust["id"], "customer_name": cust["name"],
            "staff_id": s["id"],
            "items": [{
                "type": "service", "ref_id": svc["id"], "name": svc["name"],
                "qty": 1, "price": price,
                "staff_id": None, "staff_name": None,
            }],
            "subtotal": price, "discount": 0, "tax": 0, "total": price,
            "payment_mode": "cash",
        })
        r = requests.get(
            f"{BASE_URL}/api/reports/staff-commission?start=2025-01-01&end=2026-12-31",
            headers=admin_headers, timeout=15,
        )
        body = r.json()
        staff_ids = [row["staff_id"] for row in body["rows"]]
        assert s["id"] in staff_ids, f"staff_id {s['id']} not in {staff_ids}; inv={inv.get('id')}"

    def test_unassigned_bucket_when_no_staff_anywhere(self, admin_headers, seed):
        svc = seed["service"]
        cust = seed["customer"]
        price = svc.get("price", 500) or 500
        # Get current unassigned baseline
        r0 = requests.get(
            f"{BASE_URL}/api/reports/staff-commission?start=2025-01-01&end=2026-12-31",
            headers=admin_headers, timeout=15,
        )
        before = r0.json()["unassigned"]["gross_revenue"]
        # Create invoice w/o any staff
        _post_invoice(admin_headers, {
            "customer_id": cust["id"], "customer_name": cust["name"],
            "items": [{
                "type": "service", "ref_id": svc["id"], "name": svc["name"],
                "qty": 1, "price": price,
            }],
            "subtotal": price, "discount": 0, "tax": 0, "total": price,
            "payment_mode": "cash",
        })
        r1 = requests.get(
            f"{BASE_URL}/api/reports/staff-commission?start=2025-01-01&end=2026-12-31",
            headers=admin_headers, timeout=15,
        )
        after = r1.json()["unassigned"]["gross_revenue"]
        assert after >= before + price - 0.01, (
            f"unassigned bucket did not grow: before={before} after={after} delta={after - before}"
        )


class TestCommissionDateFilter:
    def test_future_range_returns_empty(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/reports/staff-commission?start=2199-01-01&end=2199-12-31",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["rows"] == []
        assert body["total_gross"] == 0
        assert body["total_commission"] == 0


class TestCommissionAuth:
    def test_no_token_unauthorized(self):
        r = requests.get(
            f"{BASE_URL}/api/reports/staff-commission?start=2025-01-01&end=2026-12-31",
            timeout=15,
        )
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


class TestCommissionTenantIsolation:
    def test_secondary_tenant_invoices_isolated(self, admin_headers, tenant2_headers, seed):
        # Create an invoice in tenant2 with a tenant2 staff
        st2 = requests.get(f"{BASE_URL}/api/staff", headers=tenant2_headers, timeout=15).json()
        svc2 = requests.get(f"{BASE_URL}/api/services", headers=tenant2_headers, timeout=15).json()
        cust2 = requests.get(f"{BASE_URL}/api/customers", headers=tenant2_headers, timeout=15).json()
        if not st2 or not svc2:
            pytest.skip("Tenant2 has no staff/service seeded")
        if not cust2:
            cust2 = [requests.post(
                f"{BASE_URL}/api/customers",
                headers=tenant2_headers,
                json={"name": "TEST_ITER16_T2", "phone": f"98000{int(time.time())%100000:05d}"},
                timeout=15,
            ).json()]
        price = svc2[0].get("price", 500) or 500
        inv2 = _post_invoice(tenant2_headers, {
            "customer_id": cust2[0]["id"], "customer_name": cust2[0]["name"],
            "staff_id": st2[0]["id"],
            "items": [{
                "type": "service", "ref_id": svc2[0]["id"], "name": svc2[0]["name"],
                "qty": 1, "price": price,
                "staff_id": st2[0]["id"], "staff_name": st2[0]["name"],
            }],
            "subtotal": price, "discount": 0, "tax": 0, "total": price,
            "payment_mode": "cash",
        })
        # Pull commission report under tenant1; tenant2 staff must not appear
        r = requests.get(
            f"{BASE_URL}/api/reports/staff-commission?start=2025-01-01&end=2026-12-31",
            headers=admin_headers, timeout=15,
        )
        body = r.json()
        tenant1_staff_ids = {row["staff_id"] for row in body["rows"]}
        assert st2[0]["id"] not in tenant1_staff_ids, (
            f"Tenant2 staff leaked into tenant1 commission report: inv={inv2.get('id')}"
        )
