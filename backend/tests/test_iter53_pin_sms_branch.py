"""Iter 53 — Owner Security PIN + SMS packs + Branch-switch OTP gating.

⚠️ Razorpay is LIVE (rzp_live_) — we only test order CREATION, never verify with fake sig
expecting success (a bad sig MUST return 400 — that IS the pass condition).
"""
import os
import pytest
import requests

from creds import password_for

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PW = password_for("admin@miracurl.com")
OWNER_PIN = "4321"


@pytest.fixture(scope="module")
def admin_sess():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


# ---------------- Security PIN status + change ----------------

def test_security_pin_status_set(admin_sess):
    r = admin_sess.get(f"{API}/settings/security-pin", timeout=10)
    assert r.status_code == 200
    assert r.json().get("set") is True


def test_security_pin_change_without_current_forbidden(admin_sess):
    r = admin_sess.put(f"{API}/settings/security-pin", json={"new_pin": "9999"}, timeout=10)
    assert r.status_code == 403


def test_security_pin_change_with_current_ok_keep_same(admin_sess):
    # Set PIN to 4321 again to leave state clean
    r = admin_sess.put(
        f"{API}/settings/security-pin",
        json={"new_pin": OWNER_PIN, "current_pin": OWNER_PIN},
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json().get("ok") is True
    # Verify still set
    r2 = admin_sess.get(f"{API}/settings/security-pin", timeout=10)
    assert r2.json().get("set") is True


# ---------------- Owner PIN guard on staff endpoints ----------------

def _staff_payload(name):
    return {"name": name, "role": "Stylist", "phone": "+919990000000",
            "monthly_base_salary": 20000, "commission_pct": 10}


def test_staff_create_without_pin_403(admin_sess):
    r = admin_sess.post(f"{API}/staff", json=_staff_payload("TEST_iter53_nopin"), timeout=10)
    assert r.status_code == 403
    assert "OWNER_PIN_REQUIRED" in r.text


def test_staff_create_wrong_pin_403(admin_sess):
    r = admin_sess.post(f"{API}/staff", json=_staff_payload("TEST_iter53_wrong"),
                        headers={"X-Owner-Pin": "9999"}, timeout=10)
    assert r.status_code == 403


@pytest.fixture(scope="module")
def created_staff_id(admin_sess):
    r = admin_sess.post(f"{API}/staff", json=_staff_payload("TEST_iter53_ok"),
                        headers={"X-Owner-Pin": OWNER_PIN}, timeout=15)
    assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
    sid = r.json().get("id")
    assert sid
    yield sid
    # cleanup
    admin_sess.delete(f"{API}/staff/{sid}", headers={"X-Owner-Pin": OWNER_PIN}, timeout=15)


def test_staff_put_pin_guard(admin_sess, created_staff_id):
    # without pin
    r = admin_sess.put(f"{API}/staff/{created_staff_id}",
                       json=_staff_payload("TEST_iter53_ok_upd"), timeout=10)
    assert r.status_code == 403
    # with pin
    r2 = admin_sess.put(f"{API}/staff/{created_staff_id}",
                        json=_staff_payload("TEST_iter53_ok_upd"),
                        headers={"X-Owner-Pin": OWNER_PIN}, timeout=10)
    assert r2.status_code == 200


def test_staff_advance_pin_guard(admin_sess, created_staff_id):
    payload = {"amount": 100, "note": "TEST_iter53 advance"}
    r = admin_sess.post(f"{API}/staff/{created_staff_id}/advance", json=payload, timeout=10)
    assert r.status_code == 403
    r2 = admin_sess.post(f"{API}/staff/{created_staff_id}/advance", json=payload,
                         headers={"X-Owner-Pin": OWNER_PIN}, timeout=10)
    # PIN guard passes: response should NOT be 403. Business validation (e.g. no
    # max_advance set) may return 400 which is fine for the PIN-guard contract.
    assert r2.status_code != 403, f"{r2.status_code} {r2.text}"


def test_waive_fine_pin_guard(admin_sess):
    """Endpoint should return 403 without pin regardless of rec_id validity."""
    r = admin_sess.post(f"{API}/attendance/does-not-exist/waive-fine",
                        json={"reason": "TEST"}, timeout=10)
    assert r.status_code == 403


# ---------------- SMS Packs ----------------

def test_sms_packs_catalog(admin_sess):
    r = admin_sess.get(f"{API}/sms-packs", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data.get("enabled") is True
    keys = {p["key"] for p in data["packs"]}
    assert {"pack_199", "pack_499", "pack_999"}.issubset(keys)
    for p in data["packs"]:
        assert "price" in p and "points" in p
    assert isinstance(data.get("balance"), int)


def test_sms_pack_order_creates_razorpay_order(admin_sess):
    r = admin_sess.post(f"{API}/sms-packs/order", json={"pack": "pack_199"}, timeout=20)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    d = r.json()
    assert d.get("order_id", "").startswith("order_")
    assert d.get("amount") == 19900
    assert d.get("key_id", "").startswith("rzp_live_")
    assert d.get("points")


def test_sms_pack_verify_fake_signature_400(admin_sess):
    # First create real order
    o = admin_sess.post(f"{API}/sms-packs/order", json={"pack": "pack_199"}, timeout=20).json()
    r = admin_sess.post(f"{API}/sms-packs/verify",
                        json={"razorpay_order_id": o["order_id"],
                              "razorpay_payment_id": "pay_fake",
                              "razorpay_signature": "deadbeef"},
                        timeout=15)
    assert r.status_code == 400
    assert "signature" in r.text.lower()


# ---------------- Branch-switch OTP ----------------

@pytest.fixture(scope="module")
def switch_request(admin_sess):
    body = {"name": "TEST_iter53_user", "phone": "+919990001111",
            "position": "Stylist", "branch": "Marathahalli"}
    r = admin_sess.post(f"{API}/branch-switch/request", json=body, timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    d = r.json()
    assert d.get("request_id")
    assert "***@" in (d.get("owner_email") or "")
    assert isinstance(d.get("email_sent"), bool)
    return d["request_id"]


def test_branch_switch_pending_lists_otp(admin_sess, switch_request):
    r = admin_sess.get(f"{API}/branch-switch/pending", timeout=10)
    assert r.status_code == 200
    rows = r.json()
    row = next((x for x in rows if x["id"] == switch_request), None)
    assert row is not None
    assert row.get("otp")
    assert len(str(row["otp"])) == 6


def test_branch_switch_wrong_otp_then_right_then_replay(admin_sess, switch_request):
    # Wrong
    r = admin_sess.post(f"{API}/branch-switch/verify",
                        json={"request_id": switch_request, "otp": "000000"}, timeout=10)
    assert r.status_code == 400
    assert "Incorrect" in r.text
    # Fetch real otp
    rows = admin_sess.get(f"{API}/branch-switch/pending", timeout=10).json()
    row = next(x for x in rows if x["id"] == switch_request)
    assert int(row.get("attempts") or 0) >= 1
    real_otp = row["otp"]
    # Right
    r2 = admin_sess.post(f"{API}/branch-switch/verify",
                         json={"request_id": switch_request, "otp": real_otp}, timeout=10)
    assert r2.status_code == 200
    assert r2.json().get("ok") is True
    # Replay
    r3 = admin_sess.post(f"{API}/branch-switch/verify",
                         json={"request_id": switch_request, "otp": real_otp}, timeout=10)
    assert r3.status_code == 400


def test_branch_switch_owner_pin_right_wrong(admin_sess):
    r = admin_sess.post(f"{API}/branch-switch/owner-pin", json={"pin": OWNER_PIN}, timeout=10)
    assert r.status_code == 200 and r.json().get("ok") is True
    r2 = admin_sess.post(f"{API}/branch-switch/owner-pin", json={"pin": "0000"}, timeout=10)
    assert r2.status_code == 403


def test_branch_switch_deny(admin_sess):
    body = {"name": "TEST_iter53_deny", "phone": "+919990001112",
            "position": "Stylist", "branch": ""}
    d = admin_sess.post(f"{API}/branch-switch/request", json=body, timeout=15).json()
    rid = d["request_id"]
    r = admin_sess.post(f"{API}/branch-switch/{rid}/deny", timeout=10)
    assert r.status_code == 200
    # No longer in pending
    rows = admin_sess.get(f"{API}/branch-switch/pending", timeout=10).json()
    assert not any(x["id"] == rid for x in rows)
