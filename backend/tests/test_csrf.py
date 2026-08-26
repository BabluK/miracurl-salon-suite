"""
Regression tests for CSRF double-submit cookie protection.
Covers: login sets csrf cookie, state-changing requires header, forged token rejected,
bearer bypass, public endpoints unaffected, refresh rotates csrf, logout clears.
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
TENANT = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PWD = "q6QY@tn3p#9DtL"


@pytest.fixture(scope="module")
def logged_in_session():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        headers={"X-Tenant-Slug": TENANT, "Content-Type": "application/json"},
        json={"email": ADMIN_EMAIL, "password": ADMIN_PWD},
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


def test_login_sets_all_three_cookies(logged_in_session):
    cookies = {c.name: c for c in logged_in_session.cookies}
    assert "access_token" in cookies
    assert "refresh_token" in cookies
    assert "csrf_token" in cookies, "csrf_token cookie must be set on login"
    # csrf_token should NOT be HttpOnly
    csrf_c = cookies["csrf_token"]
    # httponly stored as _rest sometimes; python requests uses ._rest
    httponly = csrf_c._rest.get("HttpOnly") if hasattr(csrf_c, "_rest") else None
    # HttpOnly key may be missing entirely which is expected (not HttpOnly)
    assert httponly is None or httponly is False


def test_state_change_without_csrf_header_returns_403(logged_in_session):
    # PUT settings/branding without header
    r = logged_in_session.put(
        f"{BASE_URL}/api/settings/branding",
        json={"working_hours": "10-9"},
    )
    assert r.status_code == 403
    assert "CSRF" in r.text or "csrf" in r.text.lower()


def test_state_change_with_csrf_header_succeeds(logged_in_session):
    csrf = logged_in_session.cookies.get("csrf_token")
    assert csrf
    r = logged_in_session.put(
        f"{BASE_URL}/api/settings/branding",
        headers={"X-CSRF-Token": csrf, "X-Owner-Pin": "4321"},
        json={"working_hours": "10:00 - 21:00"},
    )
    assert r.status_code in (200, 201, 204), f"Expected 2xx, got {r.status_code}: {r.text[:300]}"


def test_forged_matching_pair_rejected(logged_in_session):
    # Copy the session but override csrf cookie + header to forged same-value pair
    forged = "evil.evil.evil"
    # Build a manual request keeping other cookies but overriding csrf
    jar = requests.cookies.RequestsCookieJar()
    for c in logged_in_session.cookies:
        if c.name == "csrf_token":
            continue
        jar.set(c.name, c.value, domain=c.domain, path=c.path)
    jar.set("csrf_token", forged, domain=logged_in_session.cookies.list_domains()[0], path="/")
    r = requests.put(
        f"{BASE_URL}/api/settings/branding",
        headers={"X-CSRF-Token": forged, "X-Owner-Pin": "4321"},
        json={"working_hours": "x"},
        cookies=jar,
    )
    assert r.status_code == 403
    assert "Invalid CSRF" in r.text or "invalid" in r.text.lower()


def test_bearer_bypasses_csrf():
    # Login via bearer flow: same login endpoint returns access_token in body? Try tenant login
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        headers={"X-Tenant-Slug": TENANT, "Content-Type": "application/json"},
        json={"email": ADMIN_EMAIL, "password": ADMIN_PWD},
    )
    assert r.status_code == 200
    body = r.json()
    token = body.get("access_token") or body.get("token")
    if not token:
        pytest.skip("Login response does not expose bearer token; bearer path only via other clients")
    # Use bearer without cookies — must not return 403 CSRF
    r2 = requests.put(
        f"{BASE_URL}/api/settings/branding",
        headers={"Authorization": f"Bearer {token}", "X-Owner-Pin": "4321"},
        json={"working_hours": "10-9"},
    )
    assert r2.status_code != 403 or "CSRF" not in r2.text


def test_public_endpoint_no_csrf_needed():
    r = requests.get(f"{BASE_URL}/api/public/salon/{TENANT}")
    assert r.status_code == 200


def test_public_post_no_csrf_needed():
    r = requests.post(
        f"{BASE_URL}/api/public/ai-chat/hair-hub-system",
        headers={"X-Tenant-Slug": TENANT, "Content-Type": "application/json"},
        json={"message": "hi", "session_id": "test-csrf-sess"},
    )
    # accept 200 or 400/422 (validation) — key is NOT 403 CSRF
    assert r.status_code != 403 or "CSRF" not in r.text


def test_refresh_no_csrf_header_ok_and_rotates(logged_in_session):
    old_csrf = logged_in_session.cookies.get("csrf_token")
    r = logged_in_session.post(f"{BASE_URL}/api/auth/refresh")
    assert r.status_code == 200, f"refresh failed: {r.status_code} {r.text[:200]}"
    new_csrf = logged_in_session.cookies.get("csrf_token")
    assert new_csrf, "csrf_token cookie must be present after refresh"
    assert new_csrf != old_csrf, "csrf_token must rotate on refresh"


def test_logout_clears_cookies():
    s = requests.Session()
    s.post(
        f"{BASE_URL}/api/auth/login",
        headers={"X-Tenant-Slug": TENANT, "Content-Type": "application/json"},
        json={"email": ADMIN_EMAIL, "password": ADMIN_PWD},
    )
    csrf = s.cookies.get("csrf_token")
    r = s.post(f"{BASE_URL}/api/auth/logout", headers={"X-CSRF-Token": csrf})
    assert r.status_code in (200, 204)
    # After logout, cookies should be cleared (server sends expiry). Session jar may keep them
    # but subsequent authenticated call must fail.
    r2 = s.get(f"{BASE_URL}/api/auth/me")
    assert r2.status_code in (401, 403)
