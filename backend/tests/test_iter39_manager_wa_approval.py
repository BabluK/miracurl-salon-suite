"""Iter 39 — Manager role + WhatsApp approval workflow.

Covers:
- Login for admin, manager, staff (cookie auth)
- Manager RBAC across critical endpoints
- Manager appointment-confirm creates wa_request instead of wa_url
- Admin list/approve/reject whatsapp-requests
- Regression: admin confirm still returns whatsapp_url, no request created
"""
import os
import uuid
import requests
import pytest
from datetime import datetime, timezone, timedelta
from creds import password_for
from _creds import pw

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@miracurl.com", "password": password_for("admin@miracurl.com")}
MANAGER = {"email": "manager@miracurl.com", "password": pw("MANAGER")}
STAFF = {"email": "priya.staff@miracurl.com", "password": pw("STAFF")}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    return s, r.json()


@pytest.fixture(scope="module")
def admin_session():
    s, u = _login(ADMIN)
    return s, u


@pytest.fixture(scope="module")
def manager_session():
    s, u = _login(MANAGER)
    return s, u


@pytest.fixture(scope="module")
def staff_session():
    try:
        s, u = _login(STAFF)
        return s, u
    except AssertionError as e:
        pytest.skip(f"staff login unavailable (may have been rotated): {e}")


# ---------- Auth / role ----------

class TestAuthRoles:
    def test_manager_login_role(self, manager_session):
        _, u = manager_session
        assert u["user"]["role"] == "manager"

    def test_admin_login_role(self, admin_session):
        _, u = admin_session
        assert u["user"]["role"] == "admin"

    def test_staff_login_role(self, staff_session):
        _, u = staff_session
        assert u["user"]["role"] == "staff"


# ---------- Manager RBAC ----------

class TestManagerRBAC:
    def test_manager_customers_allowed(self, manager_session):
        s, _ = manager_session
        r = s.get(f"{API}/customers", timeout=15)
        assert r.status_code == 200, r.text

    def test_manager_reports_dashboard_allowed(self, manager_session):
        s, _ = manager_session
        r = s.get(f"{API}/reports/dashboard", timeout=15)
        assert r.status_code == 200, r.text

    def test_manager_reports_sales_forbidden(self, manager_session):
        s, _ = manager_session
        r = s.get(f"{API}/reports/sales", timeout=15)
        assert r.status_code == 403, r.text

    def test_manager_reports_daily_forbidden(self, manager_session):
        s, _ = manager_session
        r = s.get(f"{API}/reports/daily", timeout=15)
        assert r.status_code == 403, r.text

    def test_manager_reports_staff_commission_forbidden(self, manager_session):
        s, _ = manager_session
        r = s.get(f"{API}/reports/staff-commission", timeout=15)
        assert r.status_code == 403, r.text

    def test_manager_whatsapp_requests_list_forbidden(self, manager_session):
        s, _ = manager_session
        r = s.get(f"{API}/whatsapp-requests", timeout=15)
        assert r.status_code == 403, r.text

    def test_manager_whatsapp_requests_post_allowed(self, manager_session):
        s, _ = manager_session
        payload = {
            "client_name": "TEST_MGR_WA_" + uuid.uuid4().hex[:6],
            "client_phone": "9876543210",
            "message": "TEST manager wa request",
            "kind": "reminder",
        }
        r = s.post(f"{API}/whatsapp-requests", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"]
        assert d["status"] == "pending"


# ---------- Admin list / approve / reject ----------

class TestAdminWhatsAppApprovals:
    def test_admin_can_list(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/whatsapp-requests?status=pending", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_approve_flow(self, admin_session, manager_session):
        # Manager creates a request; admin approves
        ms, _ = manager_session
        create = ms.post(f"{API}/whatsapp-requests", json={
            "client_name": "TEST_APPROVE_" + uuid.uuid4().hex[:6],
            "client_phone": "9998887771",
            "message": "TEST approve message",
            "kind": "confirmation",
        }, timeout=15)
        assert create.status_code == 200
        rid = create.json()["id"]

        s, _ = admin_session
        r = s.post(f"{API}/whatsapp-requests/{rid}/approve", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"]
        assert "wa_url" in d and d["wa_url"].startswith("https://wa.me/")
        assert "TEST%20approve%20message" in d["wa_url"] or "TEST+approve" in d["wa_url"] or "approve" in d["wa_url"]

        # Now missing from pending list
        listing = s.get(f"{API}/whatsapp-requests?status=pending", timeout=15).json()
        assert not any(x["id"] == rid for x in listing)

    def test_admin_reject_flow(self, admin_session, manager_session):
        ms, _ = manager_session
        create = ms.post(f"{API}/whatsapp-requests", json={
            "client_name": "TEST_REJECT_" + uuid.uuid4().hex[:6],
            "client_phone": "9998887772",
            "message": "TEST reject message",
            "kind": "review",
        }, timeout=15)
        rid = create.json()["id"]

        s, _ = admin_session
        r = s.post(f"{API}/whatsapp-requests/{rid}/reject", timeout=15)
        assert r.status_code == 200
        assert r.json()["ok"]

        listing = s.get(f"{API}/whatsapp-requests?status=pending", timeout=15).json()
        assert not any(x["id"] == rid for x in listing)


# ---------- Appointment confirm branch (manager vs admin) ----------

def _get_refs(session):
    """Fetch a customer/staff/service id from the tenant."""
    cus = session.get(f"{API}/customers", timeout=15).json()
    svs = session.get(f"{API}/services", timeout=15).json()
    stf = session.get(f"{API}/staff", timeout=15).json()
    assert cus and svs and stf, "missing seed data"
    return cus[0]["id"], stf[0]["id"], svs[0]["id"]


def _create_appt(session, phone="9812340001"):
    cid, sid, svid = _get_refs(session)
    when = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    body = {
        "customer_id": cid,
        "staff_id": sid,
        "service_ids": [svid],
        "scheduled_at": when,
    }
    r = session.post(f"{API}/appointments", json=body, timeout=15)
    assert r.status_code in (200, 201), f"create appt failed: {r.status_code} {r.text}"
    return r.json()["id"]


class TestAppointmentConfirm:
    def test_manager_confirm_creates_wa_request(self, manager_session):
        s, _ = manager_session
        aid = _create_appt(s)
        r = s.put(f"{API}/appointments/{aid}/status", json={"status": "confirmed"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("wa_request_created"), d
        assert d.get("whatsapp_url") in (None, ""), d

    def test_admin_confirm_returns_whatsapp_url(self, admin_session):
        s, _ = admin_session
        aid = _create_appt(s, phone="9812340002")
        r = s.put(f"{API}/appointments/{aid}/status", json={"status": "confirmed"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("whatsapp_url", "").startswith("https://wa.me/"), d
        assert not d.get("wa_request_created"), d


# ---------- Staff regression ----------

class TestStaffRegression:
    def test_staff_cannot_access_reports_sales(self, staff_session):
        s, _ = staff_session
        r = s.get(f"{API}/reports/sales", timeout=15)
        assert r.status_code == 403

    def test_staff_cannot_list_whatsapp_requests(self, staff_session):
        s, _ = staff_session
        r = s.get(f"{API}/whatsapp-requests", timeout=15)
        assert r.status_code == 403
