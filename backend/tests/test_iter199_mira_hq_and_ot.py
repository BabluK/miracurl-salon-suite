"""iter199 regression: (1) Voice-calling removed from HQ Mira console; (2) Auto-closed attendance overtime fix."""
import os
import re
import pytest
import requests
from datetime import datetime

from _creds import pw  # type: ignore


def _read_env(path: str, key: str) -> str:
    try:
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return ""


BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _read_env("/app/frontend/.env", "REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL must be set"

SUPER_EMAIL = "admin@miracurl-suite.com"
SALON_EMAIL = "admin@miracurl.com"
TENANT_SLUG = "miracurl-marathahalli"


# ---------- fixtures ----------
def _login(session: requests.Session, email: str, password: str, tenant: str | None = None):
    headers = {"Content-Type": "application/json"}
    if tenant:
        headers["X-Tenant-Slug"] = tenant
    r = session.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, headers=headers, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return r


@pytest.fixture(scope="module")
def super_session():
    s = requests.Session()
    _login(s, SUPER_EMAIL, pw("SUPER_ADMIN"))
    return s


@pytest.fixture(scope="module")
def salon_session():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT_SLUG})
    _login(s, SALON_EMAIL, pw("SALON_ADMIN"), tenant=TENANT_SLUG)
    return s


def _csrf(session: requests.Session) -> dict:
    tok = session.cookies.get("csrf_token")
    assert tok, "csrf_token cookie not present"
    return {"X-CSRF-Token": tok}


# ---------- (1) Mira HQ briefing — no calling wording ----------
class TestMiraHqBriefing:
    def test_briefing_no_call_wording(self, super_session):
        r = super_session.get(f"{BASE}/api/super-admin/mira/briefing", timeout=30)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        text = (body.get("text") or body.get("message") or body.get("greeting") or "").lower()
        # Data keys
        data = body.get("data") or body
        assert "hot_leads" in data
        assert "hot_leads_with_phone" in data
        assert "emails_drafted_awaiting_your_approval" in data
        for forbidden in ("call_interested", "callable_hot_leads_with_phone", "mira_calls_made_today"):
            assert forbidden not in data, f"forbidden key {forbidden} present"
        # Text: word "call" (as whole word), "dial", "retry failed" must be absent
        assert not re.search(r"\bcall\b", text), f"'call' word found in briefing text: {text[:300]}"
        assert "dial" not in text, f"'dial' found: {text[:300]}"
        assert "retry failed" not in text, f"'retry failed' found: {text[:300]}"

    def test_map_briefing(self, super_session):
        r = super_session.get(f"{BASE}/api/super-admin/mira/map-briefing", timeout=30)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        data = body.get("data") or body
        assert "hot_leads" in data
        assert "calls_today" not in data
        assert "callable_hot" not in data
        text = (body.get("text") or "").lower()
        assert not re.search(r"\bcall\b", text)
        assert "dial" not in text

    def test_platform_map_live(self, super_session):
        r = super_session.get(f"{BASE}/api/super-admin/platform-map/live", timeout=30)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert "events" in body
        assert "insight" in body
        assert "call_stats" not in body


# ---------- Removed endpoints ----------
class TestRemovedCallEndpoints:
    @pytest.mark.parametrize("method,path", [
        ("GET", "/api/super-admin/mira-calls"),
        ("POST", "/api/super-admin/mira-calls/call-hot"),
        ("GET", "/api/super-admin/mira-calls/auto-settings"),
        ("GET", "/api/super-admin/mira-calls/scheduled"),
        ("POST", "/api/webhooks/twilio/voice/test-id"),
    ])
    def test_endpoint_gone(self, super_session, method, path):
        headers = {}
        if method == "POST":
            headers.update(_csrf(super_session))
        r = super_session.request(method, f"{BASE}{path}", headers=headers, timeout=30,
                                  json={} if method == "POST" else None)
        assert r.status_code != 200, f"{method} {path} should be gone but returned 200: {r.text[:200]}"
        # 404 / 403 / 405 / 422 all acceptable — just not 200
        assert r.status_code in (401, 403, 404, 405, 422), f"unexpected status {r.status_code} for {path}"


# ---------- Still-working HQ endpoints ----------
class TestHqEndpointsAlive:
    @pytest.mark.parametrize("path", [
        "/api/super-admin/mira/home",
        "/api/super-admin/mira/live-task",
        "/api/super-admin/mira/memory",
        "/api/super-admin/mira/pipeline",
        "/api/super-admin/mira/face-status",
        "/api/super-admin/platform-overview",
    ])
    def test_ok(self, super_session, path):
        r = super_session.get(f"{BASE}{path}", timeout=30)
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"


class TestMiraAsk:
    def test_ask_hi(self, super_session):
        headers = _csrf(super_session)
        headers["Content-Type"] = "application/json"
        r = super_session.post(f"{BASE}/api/super-admin/mira/ask",
                               json={"question": "hi mira"}, headers=headers, timeout=45)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert "answer" in body, body
        assert "tab" in body, body
        assert "action" in body, body
        assert body["action"] == "", f"action should be empty for greeting, got {body['action']!r}"


# ---------- (2) Overtime auto-close fix ----------
class TestOvertimeAutoCloseFix:
    def test_no_phantom_ot_for_auto_closed(self, salon_session):
        r = salon_session.get(f"{BASE}/api/attendance/overtime", params={"month": "2026-09", "status": "all"}, timeout=30)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        records = body if isinstance(body, list) else (body.get("records") or body.get("items") or body.get("data") or [])
        auto_closed = [x for x in records if x.get("auto_checked_out")]
        print(f"Total records: {len(records)}, auto_closed: {len(auto_closed)}")
        for rec in auto_closed:
            if rec.get("ot_status") == "approved":
                continue
            op = rec.get("overtime_pay") or 0
            oh = rec.get("overtime_hours") or 0
            assert op == 0, f"auto-closed record has overtime_pay={op}: {rec}"
            assert oh == 0, f"auto-closed record has overtime_hours={oh}: {rec}"
        # Reverse: any record with OT pay > 0 must not be auto_checked_out
        for rec in records:
            if (rec.get("overtime_pay") or 0) > 0:
                assert not rec.get("auto_checked_out"), f"record with OT pay is auto_checked_out: {rec}"


# ---------- Regression ----------
class TestRegression:
    def test_tenant_dashboard(self, salon_session):
        r = salon_session.get(f"{BASE}/api/reports/dashboard", timeout=30)
        assert r.status_code == 200, r.text[:200]

    def test_super_mira_leads_list(self, super_session):
        r = super_session.get(f"{BASE}/api/super-admin/mira-leads", timeout=30)
        assert r.status_code == 200, r.text[:200]
