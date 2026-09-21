"""Backend tests for POS back-dated bills feature (iter 181).

Covers:
- bill_date=yesterday + status=open → backdated true, created_at ~12:00 IST that day (06:30Z)
- bill_date 3+ days ago → 400
- bill_date tomorrow → 400
- bill_date=today → normal (no backdated)
- bill_date omitted → normal
- bill_date + status=completed → GET /api/invoices?date=<yesterday> lists it
- Clean up: DELETE /api/invoices/{id} works only for open bills
"""
import os
import re
from datetime import datetime, timedelta, timezone

import pytest
import requests

from _creds import password_for

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
TENANT_SLUG = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
OWNER_PIN = "4321"
IST = timezone(timedelta(hours=5, minutes=30))


def _today_ist() -> datetime:
    return datetime.now(IST)


def iso_date(offset_days: int) -> str:
    return (_today_ist().date() + timedelta(days=offset_days)).isoformat()


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT_SLUG, "Content-Type": "application/json"})
    pwd = password_for(ADMIN_EMAIL)
    assert pwd, "Password for admin not found"
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": pwd})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    csrf = s.cookies.get("csrf_token")
    assert csrf, "csrf cookie missing"
    s.headers.update({"X-CSRF-Token": csrf, "X-Owner-Pin": OWNER_PIN})
    return s


@pytest.fixture(scope="module")
def customer_id(api):
    # Pick any existing customer
    r = api.get(f"{BASE_URL}/api/customers?limit=1")
    assert r.status_code == 200, r.text
    rows = r.json() if isinstance(r.json(), list) else r.json().get("customers") or r.json().get("items") or []
    assert rows, "no customers to reuse"
    return rows[0]["id"]


@pytest.fixture(scope="module")
def service_item(api):
    r = api.get(f"{BASE_URL}/api/services")
    assert r.status_code == 200, r.text
    svcs = r.json() if isinstance(r.json(), list) else r.json().get("services") or []
    assert svcs, "no services"
    s = svcs[0]
    return {"type": "service", "ref_id": s["id"], "name": s["name"], "qty": 1, "price": float(s["price"])}


created_open_ids: list[str] = []
created_completed_ids: list[str] = []


class TestBackdatedInvoiceCreate:
    def test_backdate_yesterday_open(self, api, customer_id, service_item):
        y = iso_date(-1)
        payload = {"customer_id": customer_id, "items": [service_item],
                   "payment_mode": "cash", "status": "open",
                   "bill_date": y, "force_duplicate": True}
        r = api.post(f"{BASE_URL}/api/invoices", json=payload)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        inv = r.json()
        assert inv.get("backdated") is True
        assert inv.get("actual_created_at")
        # created_at should be 06:30Z (12:00 IST) of yesterday
        created = inv["created_at"]
        assert created.startswith(y), f"created_at not on {y}: {created}"
        assert "06:30" in created, f"created_at not 06:30 UTC: {created}"
        assert inv.get("status") == "open"
        created_open_ids.append(inv["id"])

    def test_backdate_three_days_ago_rejected(self, api, customer_id, service_item):
        d = iso_date(-3)
        r = api.post(f"{BASE_URL}/api/invoices", json={
            "customer_id": customer_id, "items": [service_item], "payment_mode": "cash",
            "status": "open", "bill_date": d, "force_duplicate": True})
        assert r.status_code == 400, r.text
        assert "back-dated up to 2 days" in r.text.lower() or "back-dated" in r.text.lower()

    def test_bill_date_future_rejected(self, api, customer_id, service_item):
        d = iso_date(1)
        r = api.post(f"{BASE_URL}/api/invoices", json={
            "customer_id": customer_id, "items": [service_item], "payment_mode": "cash",
            "status": "open", "bill_date": d, "force_duplicate": True})
        assert r.status_code == 400, r.text
        assert "future" in r.text.lower()

    def test_bill_date_today_is_normal(self, api, customer_id, service_item):
        t = iso_date(0)
        r = api.post(f"{BASE_URL}/api/invoices", json={
            "customer_id": customer_id, "items": [service_item], "payment_mode": "cash",
            "status": "open", "bill_date": t, "force_duplicate": True})
        assert r.status_code == 200, r.text
        inv = r.json()
        assert not inv.get("backdated"), f"today should not be backdated: {inv.get('backdated')}"
        created_open_ids.append(inv["id"])

    def test_bill_date_omitted_normal(self, api, customer_id, service_item):
        r = api.post(f"{BASE_URL}/api/invoices", json={
            "customer_id": customer_id, "items": [service_item], "payment_mode": "cash",
            "status": "open", "force_duplicate": True})
        assert r.status_code == 200, r.text
        inv = r.json()
        assert not inv.get("backdated")
        created_open_ids.append(inv["id"])

    def test_backdate_yesterday_completed_lists_in_get(self, api, customer_id, service_item):
        y = iso_date(-1)
        r = api.post(f"{BASE_URL}/api/invoices", json={
            "customer_id": customer_id, "items": [service_item], "payment_mode": "cash",
            "status": "completed", "bill_date": y, "force_duplicate": True})
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        inv = r.json()
        assert inv.get("backdated") is True
        # Invoice model doesn't include a top-level status field for the completed path
        # (status is only set to "open" when saving an open bill). Backdated flag is what matters.
        inv_id = inv["id"]
        created_completed_ids.append(inv_id)

        # GET /api/invoices?date=<yesterday> should list it
        r2 = api.get(f"{BASE_URL}/api/invoices", params={"date": y})
        assert r2.status_code == 200, r2.text
        rows = r2.json()
        ids = [row["id"] for row in rows]
        assert inv_id in ids, f"backdated completed bill {inv_id} not found in GET ?date={y}"


class TestCleanup:
    def test_delete_open_bills(self, api):
        for iid in created_open_ids:
            r = api.delete(f"{BASE_URL}/api/invoices/{iid}")
            assert r.status_code == 200, f"delete open failed for {iid}: {r.status_code} {r.text}"

    def test_delete_completed_bill_rejected(self, api):
        if not created_completed_ids:
            pytest.skip("no completed backdated bill created")
        iid = created_completed_ids[0]
        r = api.delete(f"{BASE_URL}/api/invoices/{iid}")
        # per spec: DELETE works only for open bills — completed should be rejected
        assert r.status_code == 400, f"expected 400 for delete on completed, got {r.status_code} {r.text}"
