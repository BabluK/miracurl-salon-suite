"""Tests for notify_email + send-reset-link + forgot-password routing (iter 129)."""
import os
import pytest
import requests
import sys as _sys; _sys.path.insert(0, __import__("os").path.dirname(__file__))
from _creds import password_for  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
TENANT = "miracurl-marathahalli"
TENANT_ADMIN = ("admin@miracurl.com", password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD"))
SUPER = ("super@miracurl.com", "og9T@41Es#OQb6")


def _login(email, password, tenant_slug=None):
    s = requests.Session()
    headers = {"Content-Type": "application/json"}
    if tenant_slug:
        headers["X-Tenant-Slug"] = tenant_slug
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, headers=headers)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    csrf = s.cookies.get("csrf_token")
    assert csrf, "csrf_token cookie missing"
    s.headers.update({"Content-Type": "application/json", "X-CSRF-Token": csrf})
    if tenant_slug:
        s.headers["X-Tenant-Slug"] = tenant_slug
    return s


@pytest.fixture(scope="module")
def tenant_session():
    s = _login(*TENANT_ADMIN, tenant_slug=TENANT)
    yield s
    # cleanup — clear notify email
    try:
        s.put(f"{BASE_URL}/api/auth/me/notify-email", json={"notify_email": ""})
    except Exception:
        pass


@pytest.fixture(scope="module")
def super_session():
    return _login(*SUPER)


# --- Tenant admin notify-email PUT validation ---
class TestNotifyEmailValidation:
    def test_reject_login_only_domain(self, tenant_session):
        r = tenant_session.put(f"{BASE_URL}/api/auth/me/notify-email",
                               json={"notify_email": "x@miracurl.com"})
        assert r.status_code == 400, r.text

    def test_reject_invalid_email(self, tenant_session):
        r = tenant_session.put(f"{BASE_URL}/api/auth/me/notify-email",
                               json={"notify_email": "not-an-email"})
        assert r.status_code == 400, r.text

    def test_accept_valid_email_and_persist(self, tenant_session):
        r = tenant_session.put(f"{BASE_URL}/api/auth/me/notify-email",
                               json={"notify_email": "delivered@resend.dev"})
        assert r.status_code == 200, r.text
        assert r.json().get("notify_email") == "delivered@resend.dev"
        # GET /me
        me = tenant_session.get(f"{BASE_URL}/api/auth/me")
        assert me.status_code == 200
        assert me.json().get("notify_email") == "delivered@resend.dev"


# --- send-reset-link ---
class TestSendResetLink:
    def test_send_reset_link_masked(self, tenant_session):
        # Ensure notify_email set
        tenant_session.put(f"{BASE_URL}/api/auth/me/notify-email",
                           json={"notify_email": "delivered@resend.dev"})
        r = tenant_session.post(f"{BASE_URL}/api/auth/me/send-reset-link")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        sent_to = data.get("sent_to") or []
        assert any("de•••@resend.dev" in s for s in sent_to), sent_to

    def test_send_reset_link_no_inbox_on_file(self, tenant_session):
        # Clear notify_email
        r0 = tenant_session.put(f"{BASE_URL}/api/auth/me/notify-email", json={"notify_email": ""})
        assert r0.status_code == 200
        r = tenant_session.post(f"{BASE_URL}/api/auth/me/send-reset-link")
        # tenant owner_email is also @miracurl.com login-only → should 400
        assert r.status_code == 400, r.text
        assert "No notification email" in r.text or "notification email" in r.text.lower()

    def test_send_reset_link_unauthenticated(self):
        r = requests.post(f"{BASE_URL}/api/auth/me/send-reset-link")
        assert r.status_code == 401, r.status_code

    def test_super_admin_reset_routes_to_hq(self, super_session):
        r = super_session.post(f"{BASE_URL}/api/auth/me/send-reset-link")
        assert r.status_code == 200, r.text
        sent_to = r.json().get("sent_to") or []
        joined = " ".join(sent_to)
        assert "ad•••@miracurl-suite.com" in joined, sent_to
        assert "su•••@miracurl-suite.com" in joined, sent_to


# --- forgot-password (generic response, but shouldn't 500) ---
class TestForgotPassword:
    def test_forgot_password_generic(self):
        r = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                          json={"email": "admin@miracurl.com"})
        assert r.status_code == 200, r.text
        assert "message" in r.json()


# --- Regression: login still works for both accounts ---
class TestLoginRegression:
    def test_tenant_admin_login(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": TENANT_ADMIN[0], "password": TENANT_ADMIN[1]},
                   headers={"X-Tenant-Slug": TENANT})
        assert r.status_code == 200, r.text
        assert s.cookies.get("access_token")
        assert s.cookies.get("csrf_token")

    def test_super_admin_login(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": SUPER[0], "password": SUPER[1]})
        assert r.status_code == 200, r.text
        assert s.cookies.get("access_token")
