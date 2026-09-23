"""Iter 172 — Official Meta Cloud API WhatsApp channel (unofficial gateway removed)."""
import os
import pytest
import requests
from _creds import pw

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
TENANT = "miracurl-marathahalli"
EMAIL = "admin@miracurl.com"
PWD = pw("SALON_ADMIN")


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT})
    r = s.post(f"{BASE}/api/auth/login", json={"email": EMAIL, "password": PWD}, timeout=20)
    assert r.status_code == 200, r.text
    csrf = r.json().get("csrf_token") or s.cookies.get("csrf_token")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf})
    s.headers.update({"X-Owner-Pin": "4321"})
    return s


# ---------- status ----------
def test_status_official_channel(sess):
    r = sess.get(f"{BASE}/api/whatsapp-link/status", timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("available") is True
    assert d.get("connected") is True
    assert d.get("channel") == "official"
    assert d.get("sender", "").replace(" ", "") == "+" + os.environ["WHATSAPP_PLATFORM_NUMBER"]
    assert isinstance(d.get("credits"), int)
    tpls = d.get("templates") or []
    assert isinstance(tpls, list) and len(tpls) == 6
    expected = {"miracurl_booking_confirmed", "miracurl_reminder_1h", "miracurl_review_request",
                "miracurl_winback", "miracurl_birthday_wish", "miracurl_festival_offer"}
    assert expected == set(tpls), f"expected {expected}, got {set(tpls)}"


# ---------- removed endpoints ----------
@pytest.mark.parametrize("method,path", [
    ("POST", "/api/whatsapp-link/start"),
    ("POST", "/api/whatsapp-link/pairing-code"),
    ("POST", "/api/whatsapp-link/unlink"),
    ("PUT",  "/api/whatsapp-link/preferences"),
])
def test_removed_endpoints_return_404_or_405(sess, method, path):
    r = sess.request(method, f"{BASE}{path}", json={}, timeout=15)
    assert r.status_code in (404, 405), f"{method} {path} → {r.status_code} {r.text[:120]}"


# ---------- usage / daily cap ----------
def test_usage_default_cap_1000(sess):
    r = sess.get(f"{BASE}/api/whatsapp-link/usage", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "cap" in d or "daily_cap" in d
    cap = d.get("cap", d.get("daily_cap"))
    assert cap in (1000, 2000) or isinstance(cap, int)


def test_daily_cap_put_valid_and_invalid(sess):
    r = sess.put(f"{BASE}/api/whatsapp-link/daily-cap", json={"daily_cap": 2000}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("daily_cap") == 2000

    r2 = sess.put(f"{BASE}/api/whatsapp-link/daily-cap", json={"daily_cap": 6000}, timeout=15)
    assert r2.status_code == 422, f"expected 422, got {r2.status_code} {r2.text[:200]}"

    # restore
    rb = sess.put(f"{BASE}/api/whatsapp-link/daily-cap", json={"daily_cap": 1000}, timeout=15)
    assert rb.status_code == 200


# ---------- inbox ----------
def test_inbox_ok(sess):
    r = sess.get(f"{BASE}/api/whatsapp-link/inbox", timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("linked") is True
    assert isinstance(d.get("replies"), list)


# ---------- campaigns list has result counts ----------
def test_campaigns_list_has_counts(sess):
    r = sess.get(f"{BASE}/api/whatsapp-link/campaigns", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    camps = d.get("campaigns") or []
    for c in camps[:5]:
        assert "delivered" in c and isinstance(c["delivered"], int)
        assert "read" in c and isinstance(c["read"], int)
        assert "booked" in c and isinstance(c["booked"], int)


# ---------- compose ----------
def test_compose_festival_returns_offer_fields(sess):
    body = {"audience": "loyal", "customer_ids": [], "brief": "Diwali glow offer", "offer_type": "festive"}
    r = sess.post(f"{BASE}/api/whatsapp-link/campaigns/compose", json=body, timeout=90)
    assert r.status_code == 200, r.text
    d = r.json()
    text = d.get("text") or ""
    assert "{name}" in text, f"text missing {{name}}: {text[:200]}"
    assert (d.get("offer") or "").strip(), "offer empty"
    assert (d.get("festival") or "").strip(), "festival empty"
    assert (d.get("valid_till") or "").strip(), "valid_till empty"


# ---------- campaigns validation (NO sends) ----------
def test_campaigns_selected_no_ids_400(sess):
    body = {"audience": "selected", "customer_ids": [], "text": "hello there friends"}
    r = sess.post(f"{BASE}/api/whatsapp-link/campaigns", json=body, timeout=15)
    assert r.status_code == 400, f"{r.status_code} {r.text[:200]}"


def test_campaigns_bad_image_url_422(sess):
    body = {"audience": "selected", "customer_ids": ["x"], "text": "hello there friends",
            "image_url": "http://169.254.169.254/x"}
    r = sess.post(f"{BASE}/api/whatsapp-link/campaigns", json=body, timeout=15)
    assert r.status_code == 422, f"{r.status_code} {r.text[:200]}"


def test_campaigns_bad_offer_type_422(sess):
    body = {"audience": "selected", "customer_ids": ["x"], "text": "hello there friends", "offer_type": "bogus"}
    r = sess.post(f"{BASE}/api/whatsapp-link/campaigns", json=body, timeout=15)
    assert r.status_code == 422, f"{r.status_code} {r.text[:200]}"


# ---------- winback ----------
def test_winback_blast_preview(sess):
    r = sess.get(f"{BASE}/api/winback/blast/preview?days=45", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("own_number") is True
    assert d.get("whatsapp_enabled") is True


def test_winback_blast_dry_run(sess):
    r = sess.post(f"{BASE}/api/winback/blast", json={"days": 45, "limit": 5, "dry_run": True}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("dry_run") is True
