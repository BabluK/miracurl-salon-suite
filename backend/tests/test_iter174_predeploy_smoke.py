"""Pre-deploy regression smoke tests (iter174).

Covers: public webhook health, verify token reject, public AI chat,
public /book page, receptionist simulate + WA link status (sender label),
sms-packs (whatsapp channel), hq wallet.
"""
import os
import requests
from _creds import pw

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")

SALON_SLUG = "miracurl-marathahalli"
SALON_EMAIL = "admin@miracurl.com"
SALON_PASS = pw("SALON_ADMIN")
OWNER_PIN = "4321"

SUPER_EMAIL = "super@miracurl.com"
SUPER_PASS = pw("SUPER_ADMIN")


def _login(email, password, slug=None):
    s = requests.Session()
    headers = {"Content-Type": "application/json"}
    if slug:
        headers["X-Tenant-Slug"] = slug
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, headers=headers, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    csrf = s.cookies.get("csrf_token")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf})
    if slug:
        s.headers.update({"X-Tenant-Slug": slug})
    s.headers.update({"X-Owner-Pin": OWNER_PIN})
    return s


# -------- Public endpoints (no auth) --------

def test_webhook_health():
    r = requests.get(f"{BASE_URL}/api/webhooks/whatsapp/health", timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert (j.get("status") == "ok") or j.get("ok") is True, j


def test_webhook_verify_wrong_token_403():
    r = requests.get(
        f"{BASE_URL}/api/webhooks/whatsapp",
        params={"hub.mode": "subscribe", "hub.verify_token": "WRONG", "hub.challenge": "123"},
        timeout=15,
    )
    assert r.status_code == 403, r.status_code


def test_public_book_page():
    r = requests.get(f"{BASE_URL}/book/{SALON_SLUG}", timeout=20)
    # The route may return SPA HTML (200) — just ensure not 5xx
    assert r.status_code == 200, r.status_code


def test_public_ai_chat():
    r = requests.post(
        f"{BASE_URL}/api/public/ai-chat/{SALON_SLUG}",
        json={"message": "hi", "session_id": "deploycheck1234"},
        timeout=60,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    j = r.json()
    assert isinstance(j.get("reply") or j.get("message") or "", str)


# -------- Authenticated salon endpoints --------

def test_wa_link_status_sender_label():
    s = _login(SALON_EMAIL, SALON_PASS, SALON_SLUG)
    r = s.get(f"{BASE_URL}/api/whatsapp-link/status", timeout=20)
    assert r.status_code == 200, r.text[:200]
    j = r.json()
    # sender/label present and available true
    label = j.get("sender") or j.get("sender_label") or j.get("phone") or ""
    assert "9180" in label or "91802" in label or "+91" in label, j
    assert j.get("available") is True, j


def test_receptionist_simulate_salon():
    s = _login(SALON_EMAIL, SALON_PASS, SALON_SLUG)
    r = s.post(
        f"{BASE_URL}/api/whatsapp-link/receptionist/simulate",
        json={"text": "haircut price?"},
        timeout=60,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    j = r.json()
    reply = j.get("reply") or j.get("message") or ""
    assert isinstance(reply, str) and len(reply) > 0, j


def test_sms_packs_whatsapp_channel():
    s = _login(SALON_EMAIL, SALON_PASS, SALON_SLUG)
    r = s.get(f"{BASE_URL}/api/sms-packs?channel=whatsapp", timeout=20)
    assert r.status_code == 200, r.text[:200]
    j = r.json()
    packs = j.get("packs") or []
    ids = {p.get("key") or p.get("id") or p.get("code") or p.get("sku") for p in packs}
    for expected in ("wa_100", "wa_500", "wa_1000"):
        assert expected in ids, f"missing pack {expected}: {ids}"
    assert "balance" in j or "wa_balance" in j, list(j.keys())
    assert "wa_auto_reply" in j, list(j.keys())


def test_hq_wallet_super_admin():
    s = _login(SUPER_EMAIL, SUPER_PASS)
    r = s.get(f"{BASE_URL}/api/super-admin/credit-wallet", timeout=20)
    assert r.status_code == 200, r.text[:200]
    j = r.json()
    body = str(j).lower()
    assert "sms" in body, body[:200]
    assert "whatsapp" in body or "wa_" in body, body[:200]


def test_release_notes_build():
    # Public build fingerprint
    rp = requests.get(f"{BASE_URL}/api/public/build", timeout=15)
    assert rp.status_code == 200, rp.text[:200]
    assert "2026-09-18.279" in rp.text, f"public build did not report 2026-09-18.279: {rp.text[:200]}"

    # Authenticated version + releases (super admin)
    s = _login(SUPER_EMAIL, SUPER_PASS)
    rv = s.get(f"{BASE_URL}/api/super/version", timeout=20)
    assert rv.status_code == 200, rv.text[:200]
    vj = rv.json()
    assert vj.get("build") == "2026-09-18.279", vj

    r = s.get(f"{BASE_URL}/api/super/releases", timeout=20)
    assert r.status_code == 200, r.text[:200]
    body = r.text.lower()
    # Release notes should call out Receptionist + Credit wallet
    assert "receptionist" in body, "expected Mira Receptionist note in releases"
    assert "wallet" in body or "credit" in body, "expected credit wallet note in releases"
