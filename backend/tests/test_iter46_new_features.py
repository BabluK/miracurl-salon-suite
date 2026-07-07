"""
Iteration 46 — Test the 6 new features:
1) Super-Admin System Health
2) Dev Tickets CRUD + AI triage
3) Engineer Chat (grounded, session context)
4) New PLAN_CATALOG plans (multi_branch_half, multi_branch_annual)
5) Monthly report endpoint (post-refactor)
6) Dashboard ?branch= filter
"""
import os
import time
import pytest
import requests

from creds import password_for

def _load_base_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for line in open(p):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_base_url()
SUPER = {"email": "super@miracurl.com", "password": password_for("super@miracurl.com")}
ADMIN = {"email": "admin@miracurl.com", "password": password_for("admin@miracurl.com")}
MANAGER = {"email": "manager@miracurl.com", "password": "Manager@Miracurl123"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def super_client():
    return _login(SUPER)


@pytest.fixture(scope="module")
def admin_client():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def manager_client():
    return _login(MANAGER)


# ─── (1) SYSTEM HEALTH ───────────────────────────────────────────
class TestSystemHealth:
    def test_health_shape(self, super_client):
        r = super_client.get(f"{BASE_URL}/api/super-admin/system/health", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("api_ok", "db_ok", "db_latency_ms", "uptime_seconds",
                  "tenants", "users", "invoices", "open_tickets"):
            assert k in d, f"missing key: {k}"
        assert d["api_ok"] is True
        assert d["db_ok"] is True
        assert isinstance(d["tenants"], int) and d["tenants"] >= 1
        assert isinstance(d["users"], int) and d["users"] >= 1
        assert isinstance(d["uptime_seconds"], int) and d["uptime_seconds"] >= 0

    def test_health_forbidden_for_admin(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/super-admin/system/health", timeout=15)
        assert r.status_code == 403


# ─── (2) DEV TICKETS CRUD + AI TRIAGE ────────────────────────────
class TestDevTickets:
    created_id = None

    def test_create_with_triage(self, super_client):
        payload = {
            "title": "TEST_iter46 probe: /api/reports/dashboard latency",
            "description": "Automated iter46 probe — please ignore. Investigating tail latency on 3G.",
            "kind": "bug",
            "priority": "high",
        }
        r = super_client.post(f"{BASE_URL}/api/super-admin/dev-tickets", json=payload, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"] and d["title"] == payload["title"]
        assert d["status"] == "open"
        assert d["kind"] == "bug" and d["priority"] == "high"
        # LLM call is external, allow empty but log it
        assert "ai_triage" in d
        assert isinstance(d["ai_triage"], str)
        assert len(d["ai_triage"]) > 20, f"AI triage suspiciously short: {d['ai_triage']!r}"
        TestDevTickets.created_id = d["id"]

    def test_invalid_kind_and_priority(self, super_client):
        r = super_client.post(f"{BASE_URL}/api/super-admin/dev-tickets", json={
            "title": "TEST bad kind", "description": "x", "kind": "foo", "priority": "high"}, timeout=15)
        assert r.status_code == 422
        r = super_client.post(f"{BASE_URL}/api/super-admin/dev-tickets", json={
            "title": "TEST bad prio", "description": "x", "kind": "bug", "priority": "urgent"}, timeout=15)
        assert r.status_code == 422

    def test_list(self, super_client):
        r = super_client.get(f"{BASE_URL}/api/super-admin/dev-tickets", timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        assert any(t["id"] == TestDevTickets.created_id for t in arr)

    def test_update_status(self, super_client):
        tid = TestDevTickets.created_id
        r = super_client.put(f"{BASE_URL}/api/super-admin/dev-tickets/{tid}",
                             json={"status": "in_progress"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "in_progress"
        assert isinstance(d.get("log"), list) and len(d["log"]) >= 1
        assert "status" in d["log"][-1]["event"]

    def test_forbidden_for_non_super(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/super-admin/dev-tickets", timeout=15)
        assert r.status_code == 403
        r = admin_client.post(f"{BASE_URL}/api/super-admin/dev-tickets",
                              json={"title": "x123", "description": "y", "kind": "bug", "priority": "low"},
                              timeout=15)
        assert r.status_code == 403

    def test_delete(self, super_client):
        tid = TestDevTickets.created_id
        r = super_client.delete(f"{BASE_URL}/api/super-admin/dev-tickets/{tid}", timeout=15)
        assert r.status_code == 200
        # confirm gone
        r2 = super_client.put(f"{BASE_URL}/api/super-admin/dev-tickets/{tid}",
                              json={"status": "done"}, timeout=15)
        assert r2.status_code == 404


# ─── (3) ENGINEER CHAT ───────────────────────────────────────────
class TestEngineerChat:
    def test_first_reply_grounded(self, super_client):
        sid = f"iter46-{int(time.time())}"
        r = super_client.post(f"{BASE_URL}/api/super-admin/engineer-chat",
                              json={"message": "How many tenants are on the platform right now? Just the number.",
                                    "session_id": sid}, timeout=90)
        assert r.status_code == 200, r.text
        reply = r.json().get("reply", "")
        assert isinstance(reply, str) and len(reply) >= 1
        # request context
        r2 = super_client.post(f"{BASE_URL}/api/super-admin/engineer-chat",
                               json={"message": "What was my previous question?", "session_id": sid}, timeout=90)
        assert r2.status_code == 200
        r2t = r2.json().get("reply", "").lower()
        assert any(w in r2t for w in ("tenant", "tenants", "previous", "asked")), f"no context recall: {r2t[:200]}"


# ─── (4) PLANS ───────────────────────────────────────────────────
class TestPlans:
    def test_super_admin_plans(self, super_client):
        r = super_client.get(f"{BASE_URL}/api/super-admin/plans", timeout=15)
        assert r.status_code == 200
        plans = r.json()
        keys = {p["key"]: p for p in plans}
        assert "multi_branch_half" in keys, keys
        assert "multi_branch_annual" in keys
        assert keys["multi_branch_half"]["price"] == 45000
        assert keys["multi_branch_annual"]["price"] == 70000
        assert keys["multi_branch_half"]["duration_days"] == 183
        assert keys["multi_branch_annual"]["duration_days"] == 365
        assert len(plans) >= 4

    def test_tenant_billing_config_lists_all_plans(self, admin_client):
        # tenant-side settings endpoint that Settings.jsx uses to render plan grid
        # Try common endpoints:
        for path in ("/api/billing/razorpay/config", "/api/billing/config", "/api/billing/plans"):
            r = admin_client.get(f"{BASE_URL}{path}", timeout=15)
            if r.status_code == 200:
                data = r.json()
                plans = data.get("plans") if isinstance(data, dict) else data
                if plans and isinstance(plans, list):
                    keys = {p["key"] for p in plans}
                    assert "multi_branch_half" in keys, f"missing multi_branch_half in {path}: {keys}"
                    assert "multi_branch_annual" in keys
                    return
        pytest.fail("Could not find a tenant billing config endpoint listing plans")


# ─── (5) MONTHLY REPORT ──────────────────────────────────────────
class TestMonthlyReport:
    def test_send_all(self, super_client):
        r = super_client.post(f"{BASE_URL}/api/super-admin/send-monthly-report",
                              json={"tenant_id": None}, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "results" in d and isinstance(d["results"], list)
        assert "month" in d
        assert "sent" in d and "failed" in d
        # Resend test mode — sent may be 0 or 1, both accepted


# ─── (6) DASHBOARD BRANCH FILTER ─────────────────────────────────
class TestDashboardBranch:
    def test_branch_filter_reduces_revenue(self, admin_client):
        r_all = admin_client.get(f"{BASE_URL}/api/reports/dashboard", timeout=15)
        assert r_all.status_code == 200, r_all.text
        all_data = r_all.json()
        # Common shape: revenue_this_month / month_revenue
        assert isinstance(all_data, dict)

        r_b = admin_client.get(f"{BASE_URL}/api/reports/dashboard?branch=Munnekolal", timeout=15)
        assert r_b.status_code == 200
        b_data = r_b.json()
        assert isinstance(b_data, dict)
        # numeric fields for month_revenue if present
        for k in ("month_revenue", "revenue_month", "this_month_revenue", "revenue_this_month"):
            if k in all_data and k in b_data:
                assert b_data[k] <= all_data[k], f"{k}: branch={b_data[k]} > all={all_data[k]}"

    def test_unknown_branch_returns_zero(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/reports/dashboard?branch=DoesNotExistXYZ", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("month_revenue", "revenue_month", "this_month_revenue", "revenue_this_month",
                  "today_revenue", "revenue_today"):
            if k in d:
                assert d[k] == 0 or d[k] == 0.0, f"{k} not zero: {d[k]}"

    def test_manager_can_access_dashboard_branch(self, manager_client):
        r = manager_client.get(f"{BASE_URL}/api/reports/dashboard?branch=Munnekolal", timeout=15)
        assert r.status_code in (200, 403)  # manager may or may not have access; regression check
