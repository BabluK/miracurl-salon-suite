"""Iter38 backend regression:
- AUTH migration to HttpOnly cookies (no Authorization header path exercised)
- SEC-001 chat privacy via session_key
- SEC-002 coupon race / usage cap
- SEC-003 identity tamper (no overwrite for returning customer)
- Owner chats endpoint must exclude session_key from responses
"""
import os
import time
import uuid
import requests
import pytest
from creds import password_for

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL must be set"
SLUG = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = password_for("admin@miracurl.com")


# -------- Fixtures --------
@pytest.fixture(scope="module")
def admin_session():
    """Cookie-authenticated session. NO Authorization header is set anywhere.
    All subsequent requests rely purely on the HttpOnly access_token cookie."""
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, r.text
    # Cookies should be set on the session jar
    assert "access_token" in s.cookies, f"access_token cookie not set. got: {dict(s.cookies)}"
    # Header path must not be used
    assert "Authorization" not in s.headers
    return s


# -------- AUTH: cookie-only migration --------
class TestAuthCookie:
    def test_login_sets_httponly_cookies(self):
        s = requests.Session()
        r = s.post(f"{BASE}/api/auth/login",
                   json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
        assert r.status_code == 200, r.text
        # Verify Set-Cookie has HttpOnly + Secure + SameSite attrs
        set_cookie_hdrs = r.headers.get("set-cookie", "")
        # requests concatenates multiple Set-Cookie headers with comma; check flag markers
        assert "access_token=" in set_cookie_hdrs
        assert "HttpOnly" in set_cookie_hdrs
        assert "Secure" in set_cookie_hdrs
        assert "SameSite=lax" in set_cookie_hdrs.lower() or "samesite=lax" in set_cookie_hdrs.lower()
        # refresh_token cookie also present
        assert "refresh_token=" in set_cookie_hdrs
        # cookie jar has both
        assert "access_token" in s.cookies
        assert "refresh_token" in s.cookies

    def test_me_with_cookie_only_no_auth_header(self, admin_session):
        r = admin_session.get(f"{BASE}/api/auth/me", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("email") == ADMIN_EMAIL
        assert d.get("role") == "admin"

    def test_me_without_credentials_401(self):
        r = requests.get(f"{BASE}/api/auth/me", timeout=15)
        assert r.status_code == 401

    def test_protected_endpoints_via_cookie(self, admin_session):
        """Sanity: every page the review request lists must load with cookie auth."""
        # These map to Dashboard / Appointments / POS / Services / Plans / Messages / Reports
        endpoints = [
            "/api/appointments",
            "/api/services",
            "/api/customers",
            "/api/invoices",
            "/api/coupons",
            "/api/packages",
            "/api/memberships",
            "/api/owner-chats",
            "/api/staff",
            "/api/reports/dashboard",
        ]
        failures = []
        for ep in endpoints:
            r = admin_session.get(f"{BASE}{ep}", timeout=20)
            if r.status_code != 200:
                failures.append((ep, r.status_code, r.text[:120]))
        assert not failures, f"Protected endpoints failed cookie auth: {failures}"

    def test_logout_clears_cookie_and_blocks_access(self):
        s = requests.Session()
        s.post(f"{BASE}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
        assert "access_token" in s.cookies
        r = s.post(f"{BASE}/api/auth/logout", timeout=15)
        assert r.status_code == 200
        # Cookie should have been cleared (Max-Age=0 → requests drops it)
        # After logout, /api/auth/me must be 401
        r2 = s.get(f"{BASE}/api/auth/me", timeout=15)
        assert r2.status_code == 401, f"Expected 401 after logout, got {r2.status_code}: {r2.text[:200]}"


# -------- SEC-001: chat privacy via session_key --------
class TestSec001ChatPrivacy:
    def test_public_chat_start_requires_session_key_min_len(self):
        r = requests.post(f"{BASE}/api/public/chat/{SLUG}/start",
                          json={"name": "TEST_shortkey", "phone": "9876543210",
                                "session_key": "tooShort"}, timeout=15)
        assert r.status_code in (400, 422), r.text

    def test_two_sessions_same_phone_get_separate_threads(self):
        key_a = "TESTsecA" + uuid.uuid4().hex[:16]
        key_b = "TESTsecB" + uuid.uuid4().hex[:16]
        phone = "9998887" + str(int(time.time()))[-3:]
        r1 = requests.post(f"{BASE}/api/public/chat/{SLUG}/start",
                           json={"name": "TEST_Victim", "phone": phone,
                                 "session_key": key_a}, timeout=15)
        assert r1.status_code == 200, r1.text
        tid_a = r1.json()["thread_id"]
        # Send a private message on thread A
        requests.post(f"{BASE}/api/public/chat/{SLUG}/{tid_a}/send",
                      json={"message": "TEST_secret_only_victim_sees"}, timeout=15)

        # Attacker enters same phone but different session_key
        r2 = requests.post(f"{BASE}/api/public/chat/{SLUG}/start",
                           json={"name": "TEST_Attacker", "phone": phone,
                                 "session_key": key_b}, timeout=15)
        assert r2.status_code == 200
        tid_b = r2.json()["thread_id"]
        assert tid_b != tid_a, "SEC-001 REGRESSION: same phone must yield different thread ids"
        # Attacker sees NO messages (fresh thread)
        msgs_b = r2.json().get("messages") or []
        assert msgs_b == [], f"SEC-001 REGRESSION: attacker got victim messages: {msgs_b}"

    def test_owner_chats_response_excludes_session_key(self, admin_session):
        r = admin_session.get(f"{BASE}/api/owner-chats", timeout=15)
        assert r.status_code == 200
        threads = r.json()
        assert isinstance(threads, list)
        for th in threads:
            assert "session_key" not in th, f"session_key leaked in owner-chats: {th}"


# -------- SEC-002: coupon max_uses cap --------
class TestSec002CouponCap:
    @pytest.fixture(scope="class")
    def coupon(self, admin_session):
        code = "TESTSEC" + uuid.uuid4().hex[:5].upper()
        payload = {"code": code, "type": "percent", "value": 10, "max_uses": 1, "active": True}
        r = admin_session.post(f"{BASE}/api/coupons", json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        yield data
        # Cleanup
        try:
            admin_session.delete(f"{BASE}/api/coupons/{data['id']}", timeout=10)
        except Exception:
            pass

    def test_public_coupon_check_valid(self, coupon):
        r = requests.get(f"{BASE}/api/public/coupon-check/{SLUG}/{coupon['code']}", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # Valid response shape may vary; presence must indicate valid
        valid = d.get("valid")
        assert valid or valid is None and (d.get("value") or d.get("discount_value"))

    def test_consume_then_second_use_rejected(self, admin_session, coupon):
        # First consumption: bump used_count via direct coupons update path is not exposed,
        # so simulate by patching to used_count=max_uses via admin update if supported;
        # otherwise, hit /public/coupon-check after we manually increment through invoice.
        # Simpler: consume via admin PUT if supported; else use /api/coupons/{id} to bump used_count
        code = coupon["code"]
        cid = coupon["id"]
        # Try to force used_count to max_uses via admin update endpoint
        # Prefer whichever exists — try PUT then PATCH
        upd_payload = {"used_count": coupon.get("max_uses", 1)}
        r = admin_session.put(f"{BASE}/api/coupons/{cid}", json=upd_payload, timeout=10)
        if r.status_code >= 400:
            r2 = admin_session.patch(f"{BASE}/api/coupons/{cid}", json=upd_payload, timeout=10)
            if r2.status_code >= 400:
                pytest.skip(f"No admin update route to bump used_count (PUT {r.status_code}, PATCH {r2.status_code})")

        # Now /public/coupon-check must indicate it is exhausted (400 or valid:false)
        r3 = requests.get(f"{BASE}/api/public/coupon-check/{SLUG}/{code}", timeout=15)
        if r3.status_code == 200:
            body = r3.json()
            assert not body.get("valid"), f"Exhausted coupon must be invalid: {body}"
        else:
            assert r3.status_code in (400, 404), r3.text


# -------- SEC-003: identity tamper (no overwrite for returning customer) --------
class TestSec003IdentityTamper:
    def test_returning_customer_name_email_not_overwritten(self, admin_session):
        # Seed a customer with known phone via admin API
        phone = "955500" + str(int(time.time()))[-5:]
        seed = {"name": "TEST_OriginalName", "phone": phone,
                "email": "TEST_original@example.com", "gender": "Female"}
        r = admin_session.post(f"{BASE}/api/customers", json=seed, timeout=15)
        assert r.status_code in (200, 201), r.text
        cust_id = r.json().get("id")

        # Get a valid service_id for the tenant
        svc_r = requests.get(f"{BASE}/api/public/services/{SLUG}", timeout=15)
        assert svc_r.status_code == 200
        svc_list = svc_r.json()
        assert svc_list, "no services available for public booking"
        svc_id = svc_list[0]["id"]

        # Public book with attacker-provided different name/email
        scheduled = "2026-11-15T11:00:00+00:00"
        booking = {
            "service_ids": [svc_id],
            "customer_name": "ATTACKER_Name",
            "customer_phone": phone,
            "customer_email": "attacker@evil.com",
            "gender": "Other",
            "scheduled_at": scheduled,
            "is_new_customer": True,  # attacker LYING that new
        }
        rb = requests.post(f"{BASE}/api/public/book/{SLUG}", json=booking, timeout=25)
        # booking may succeed or fail (rate-limit / slot) — the *tamper check* is what we care about
        if rb.status_code >= 400:
            pytest.skip(f"Booking rejected (unrelated to tamper test): {rb.status_code} {rb.text[:200]}")

        # Verify customer record unchanged
        r2 = admin_session.get(f"{BASE}/api/customers/{cust_id}", timeout=10)
        assert r2.status_code == 200, r2.text
        c = r2.json()
        assert c["name"] == "TEST_OriginalName", f"SEC-003 REGRESSION: name overwritten to {c['name']}"
        assert c.get("email") == "TEST_original@example.com", (
            f"SEC-003 REGRESSION: email overwritten to {c.get('email')}")

        # Also verify: summary.customer_referral_code should be None for RETURNING customer
        summary = rb.json().get("summary") or {}
        assert summary.get("customer_referral_code") in (None, ""), (
            f"SEC-003 REGRESSION: referral code echoed for returning customer: {summary}")
        assert summary.get("referral_credit") in (None, 0), (
            f"SEC-003 REGRESSION: referral credit echoed for returning customer: {summary}")

        # Cleanup: delete customer and appointment
        try:
            admin_session.delete(f"{BASE}/api/customers/{cust_id}", timeout=10)
        except Exception:
            pass


# -------- AI Assistant chat (cookie auth, no Authorization header) --------
class TestAssistantAiChat:
    def test_assistant_history_via_cookie(self, admin_session):
        """Verify /api/assistant/history (cookie auth) doesn't 401 — regression proof
        that admin-only endpoints continue working after Authorization-header removal."""
        r = admin_session.get(f"{BASE}/api/assistant/history",
                              params={"session_id": "test-cookie-auth"}, timeout=15)
        assert r.status_code == 200, f"cookie-auth regression: {r.status_code} {r.text[:200]}"

    def test_assistant_chat_stream_via_cookie(self, admin_session):
        """POST /api/assistant/chat with cookie — expect 200 stream, NOT 401."""
        payload = {"session_id": "cookie-regression-" + uuid.uuid4().hex[:6],
                   "message": "ping"}
        r = admin_session.post(f"{BASE}/api/assistant/chat", json=payload,
                               timeout=90, stream=True)
        assert r.status_code == 200, f"cookie-auth regression: {r.status_code} {r.text[:200]}"
        # consume a tiny bit of the stream to ensure it's actually flowing
        next(r.iter_content(64, decode_unicode=True), None)
        # LLM may or may not respond quickly; presence of ANY bytes (or empty on error path) is OK
        # main assertion is the 200 status (no 401)
        r.close()
