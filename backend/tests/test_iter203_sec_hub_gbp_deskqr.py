"""Iter 203 — SEC-001 Mira confirm-action, Connections Hub, Google recheck, Desk QR + qr_branch."""
import os
import pytest
import requests
from _creds import pw

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
API = BASE_URL + "/api"

SUPER_EMAIL = "admin@miracurl-suite.com"
SUPER_PASS = pw("SUPER_ADMIN")
TENANT_EMAIL = "admin@miracurl.com"
TENANT_PASS = "q6QY@tn3p#9DtL"
TENANT_SLUG = "miracurl-marathahalli"


def _login(sess, email, password, slug=None):
    headers = {"Content-Type": "application/json", "Origin": BASE_URL}
    if slug:
        headers["X-Tenant-Slug"] = slug
    r = sess.post(f"{API}/auth/login", json={"email": email, "password": password}, headers=headers)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    csrf = sess.cookies.get("csrf_token")
    assert csrf
    sess.headers.update({"X-CSRF-Token": csrf, "Origin": BASE_URL})
    if slug:
        sess.headers.update({"X-Tenant-Slug": slug})
    return csrf


@pytest.fixture(scope="module")
def super_sess():
    s = requests.Session()
    _login(s, SUPER_EMAIL, SUPER_PASS)
    return s


@pytest.fixture(scope="module")
def tenant_sess():
    s = requests.Session()
    _login(s, TENANT_EMAIL, TENANT_PASS, slug=TENANT_SLUG)
    return s


# ============ SEC-001: Mira ask returns pending_action, confirm-action executes ============
class TestMiraSecConfirm:
    def test_ask_set_limit_returns_pending_action(self, super_sess):
        r = super_sess.post(f"{API}/super-admin/mira/ask",
                            json={"question": "set the daily email limit to 130"})
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        # SEC-001: action must be empty (no auto-execute) and pending_action carries the proposal
        assert d.get("action") == "", f"action should be empty but was {d.get('action')!r}"
        pa = d.get("pending_action")
        assert pa, f"pending_action missing. response={d}"
        assert pa["action"] == "set_limit:130", pa
        assert "label" in pa and pa["label"]

    def test_summary_still_100_before_confirm(self, super_sess):
        r = super_sess.get(f"{API}/super-admin/mira/outreach/summary")
        assert r.status_code == 200
        assert r.json()["settings"]["daily_email_limit"] == 100

    def test_confirm_set_limit_130(self, super_sess):
        r = super_sess.post(f"{API}/super-admin/mira/confirm-action",
                            json={"action": "set_limit:130"})
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert d.get("ok") is True
        assert d.get("action") == "set_limit:130"
        r2 = super_sess.get(f"{API}/super-admin/mira/outreach/summary")
        assert r2.json()["settings"]["daily_email_limit"] == 130

    def test_restore_limit_100(self, super_sess):
        r = super_sess.post(f"{API}/super-admin/mira/confirm-action",
                            json={"action": "set_limit:100"})
        assert r.status_code == 200
        r2 = super_sess.get(f"{API}/super-admin/mira/outreach/summary")
        assert r2.json()["settings"]["daily_email_limit"] == 100

    def test_confirm_unknown_action_rejected(self, super_sess):
        r = super_sess.post(f"{API}/super-admin/mira/confirm-action",
                            json={"action": "drop_db"})
        assert r.status_code == 400
        assert "Unknown action" in r.text

    def test_confirm_malformed_hunt_rejected(self, super_sess):
        r = super_sess.post(f"{API}/super-admin/mira/confirm-action",
                            json={"action": "hunt:<script>:salon"})
        assert r.status_code == 400

    def test_confirm_anonymous_401(self):
        r = requests.post(f"{API}/super-admin/mira/confirm-action",
                          json={"action": "set_limit:100"},
                          headers={"Origin": BASE_URL})
        assert r.status_code == 401

    def test_confirm_tenant_admin_403(self, tenant_sess):
        r = tenant_sess.post(f"{API}/super-admin/mira/confirm-action",
                             json={"action": "set_limit:100"})
        assert r.status_code == 403


# ============ Connections Hub ============
class TestConnectionsHub:
    def test_hub_shape_and_keys_order(self, tenant_sess):
        r = tenant_sess.get(f"{API}/settings/connections-hub")
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert "channels" in d and "ready" in d and "total" in d and "receipt_auto" in d
        assert d["total"] == 5
        assert len(d["channels"]) == 5
        keys = [c["key"] for c in d["channels"]]
        assert keys == ["whatsapp", "sms", "email", "meta", "google"], keys
        valid_states = {"ok", "pending", "off", "unavailable"}
        for c in d["channels"]:
            assert "title" in c and "state" in c and "line" in c and "action" in c
            assert c["state"] in valid_states, c

    def test_hub_anonymous_401(self):
        r = requests.get(f"{API}/settings/connections-hub",
                         headers={"X-Tenant-Slug": TENANT_SLUG})
        assert r.status_code == 401


# ============ Google recheck when not connected ============
class TestGoogleRecheck:
    def test_recheck_without_connection_400(self, tenant_sess):
        r = tenant_sess.post(f"{API}/social/google/recheck", json={})
        assert r.status_code == 400
        assert "Google" in r.text and "not connected" in r.text.lower()

    def test_connections_google_is_null(self, tenant_sess):
        r = tenant_sess.get(f"{API}/social/connections")
        assert r.status_code == 200
        d = r.json()
        assert d.get("google_business") is None


# ============ Attendance desk QR ============
class TestDeskQR:
    def test_desk_qr_with_branch(self, tenant_sess):
        r = tenant_sess.get(f"{API}/attendance/desk-qr", params={"branch": "Koramangala"})
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("image/png")
        assert len(r.content) > 500

    def test_desk_qr_without_branch(self, tenant_sess):
        r = tenant_sess.get(f"{API}/attendance/desk-qr")
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/png")
        assert len(r.content) > 500
