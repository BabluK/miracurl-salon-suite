"""Iter 165 — Self-hosted OpenWA WhatsApp gateway link (no real sends performed)."""
import os
import pytest
import requests

def _read_frontend_env():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for line in open(p):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return ""

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env()).rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL must be set"

ADMIN = ("admin@miracurl.com", "q6QY@tn3p#9DtL", "miracurl-marathahalli")
MANAGER = ("manager@miracurl.com", "Manager@1234", "miracurl-marathahalli")
ELEG = ("owner@elegance.com", "Owner@123", "elegance-koramangala")


def _login(email, password, slug):
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": slug})
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} → {r.status_code} {r.text[:200]}"
    csrf = s.cookies.get("csrf_token") or s.cookies.get("csrf")
    if csrf:
        s.headers["X-CSRF-Token"] = csrf
    return s


# --- WhatsApp link status (miracurl admin) ---
def test_status_admin_linked():
    s = _login(*ADMIN)
    r = s.get(f"{BASE}/api/whatsapp-link/status", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["available"] is True
    assert d["linked"] is True
    assert d["connected"] is True
    assert d.get("phone", "").endswith("8217072523")
    assert d.get("status") in ("ready", "connected")
    assert d.get("prefer_over_sms") is True


def test_status_manager_forbidden():
    s = _login(*MANAGER)
    r = s.get(f"{BASE}/api/whatsapp-link/status", timeout=15)
    assert r.status_code == 403, f"manager should be forbidden, got {r.status_code}"


def test_status_unauth():
    r = requests.get(f"{BASE}/api/whatsapp-link/status",
                     headers={"X-Tenant-Slug": "miracurl-marathahalli"}, timeout=15)
    assert r.status_code == 401


# --- Preferences toggle round-trip ---
def test_preferences_toggle_roundtrip():
    s = _login(*ADMIN)
    try:
        r = s.put(f"{BASE}/api/whatsapp-link/preferences", json={"prefer_over_sms": False}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("prefer_over_sms") is False

        r2 = s.get(f"{BASE}/api/whatsapp-link/status", timeout=15)
        assert r2.json().get("prefer_over_sms") is False
    finally:
        # Always restore to true
        r3 = s.put(f"{BASE}/api/whatsapp-link/preferences", json={"prefer_over_sms": True}, timeout=15)
        assert r3.status_code == 200
        r4 = s.get(f"{BASE}/api/whatsapp-link/status", timeout=15)
        assert r4.json().get("prefer_over_sms") is True


# --- Validation errors (no sends) ---
def test_pairing_code_invalid_phone():
    s = _login(*ADMIN)
    r = s.post(f"{BASE}/api/whatsapp-link/pairing-code", json={"phone": "123"}, timeout=15)
    assert r.status_code in (400, 422), r.text


def test_test_send_invalid_phone():
    s = _login(*ADMIN)
    r = s.post(f"{BASE}/api/whatsapp-link/test-send", json={"phone": "12", "text": ""}, timeout=15)
    assert r.status_code in (400, 422), r.text


# --- Second tenant (not linked) ---
def test_elegance_status_not_linked():
    try:
        s = _login(*ELEG)
    except AssertionError as e:
        pytest.skip(f"Elegance tenant login unavailable: {e}")
    r = s.get(f"{BASE}/api/whatsapp-link/status", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["available"] is True
    assert d.get("connected") is False
    assert d.get("linked") is False
    assert d.get("status") == "not_created"


def test_elegance_test_send_not_linked():
    try:
        s = _login(*ELEG)
    except AssertionError as e:
        pytest.skip(f"Elegance tenant login unavailable: {e}")
    r = s.post(f"{BASE}/api/whatsapp-link/test-send",
               json={"phone": "919999999999", "text": ""}, timeout=15)
    assert r.status_code == 409, f"expected 409 not linked, got {r.status_code} {r.text[:200]}"


# --- Winback preview + dry-run blast ---
def test_winback_preview_and_dry_run():
    s = _login(*ADMIN)
    r = s.get(f"{BASE}/api/winback/blast/preview", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("whatsapp_enabled") is True

    r2 = s.post(f"{BASE}/api/winback/blast",
                json={"days": 60, "limit": 1, "dry_run": True}, timeout=20)
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2.get("dry_run") is True
    assert d2.get("sent", 0) == 0


# --- Review blast validation (nothing sent) ---
def test_review_blast_send_nonexistent_whatsapp():
    s = _login(*ADMIN)
    r = s.post(f"{BASE}/api/reviews/blast-send",
               json={"target_id": "nonexistent", "channel": "whatsapp"}, timeout=15)
    assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text[:200]}"


def test_review_blast_send_bad_channel():
    s = _login(*ADMIN)
    r = s.post(f"{BASE}/api/reviews/blast-send",
               json={"target_id": "nonexistent", "channel": "telegram"}, timeout=15)
    assert r.status_code == 422, f"expected 422, got {r.status_code} {r.text[:200]}"
