"""Iter 166 — WhatsApp campaign queue + guardrails + branding reception/manager phone bug fix.

CRITICAL: No real messages are sent. We NEVER POST to /campaigns with a valid payload,
and we NEVER POST to /test-send with a valid phone. Compose (LLM) is allowed.
"""
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


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": ADMIN[2]})
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": ADMIN[0], "password": ADMIN[1]}, timeout=15)
    assert r.status_code == 200, r.text
    csrf = s.cookies.get("csrf_token") or s.cookies.get("csrf")
    if csrf:
        s.headers["X-CSRF-Token"] = csrf
    s.headers["X-Owner-Pin"] = "4321"
    return s


# ------------------ Branding bug fix ------------------
class TestBrandingPhonesPersistence:
    def test_put_and_get_reception_manager_phone(self, admin_session):
        s = admin_session
        try:
            payload = {"reception_phone": "+91 98765 11111",
                       "manager_phone": "+91 98765 22222"}
            r = s.put(f"{BASE}/api/settings/branding", json=payload, timeout=15)
            assert r.status_code == 200, r.text

            r2 = s.get(f"{BASE}/api/settings/branding", timeout=15)
            assert r2.status_code == 200, r2.text
            d = r2.json()
            assert d.get("reception_phone") == "+91 98765 11111", d
            assert d.get("manager_phone") == "+91 98765 22222", d
        finally:
            # restore blanks
            r3 = s.put(f"{BASE}/api/settings/branding",
                       json={"reception_phone": "", "manager_phone": ""}, timeout=15)
            assert r3.status_code == 200
            r4 = s.get(f"{BASE}/api/settings/branding", timeout=15)
            assert r4.json().get("reception_phone") == ""
            assert r4.json().get("manager_phone") == ""


# ------------------ Usage + daily cap ------------------
class TestUsageAndCap:
    def test_get_usage(self, admin_session):
        r = admin_session.get(f"{BASE}/api/whatsapp-link/usage", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d.get("sent"), int)
        assert d.get("cap") == 200
        assert isinstance(d.get("remaining"), int)
        gap = d.get("gap_seconds")
        assert isinstance(gap, list) and len(gap) == 2
        assert gap[0] == 30 and gap[1] == 45
        assert "resets_at" in d

    def test_daily_cap_roundtrip(self, admin_session):
        s = admin_session
        try:
            r = s.put(f"{BASE}/api/whatsapp-link/daily-cap", json={"daily_cap": 150}, timeout=15)
            assert r.status_code == 200, r.text
            u = s.get(f"{BASE}/api/whatsapp-link/usage", timeout=15).json()
            assert u.get("cap") == 150
        finally:
            r2 = s.put(f"{BASE}/api/whatsapp-link/daily-cap", json={"daily_cap": 200}, timeout=15)
            assert r2.status_code == 200
            u2 = s.get(f"{BASE}/api/whatsapp-link/usage", timeout=15).json()
            assert u2.get("cap") == 200

    def test_daily_cap_too_low(self, admin_session):
        r = admin_session.put(f"{BASE}/api/whatsapp-link/daily-cap", json={"daily_cap": 5}, timeout=15)
        assert r.status_code == 422, r.text


# ------------------ Campaigns list + detail + actions ------------------
class TestCampaignsList:
    def test_list_has_festive_glow(self, admin_session):
        r = admin_session.get(f"{BASE}/api/whatsapp-link/campaigns", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "campaigns" in d and "usage" in d
        camps = d["campaigns"]
        assert isinstance(camps, list) and len(camps) >= 1
        target = next((c for c in camps if c.get("name") == "Festive glow facial test"), None)
        assert target is not None, f"Festive glow facial test campaign missing: {[c.get('name') for c in camps]}"
        assert target.get("status") == "done"
        assert (target.get("sent") or 0) == 1
        # stash id
        pytest._festive_cid = target["id"]

    def test_detail_returns_recipients(self, admin_session):
        cid = getattr(pytest, "_festive_cid", None)
        assert cid, "prereq test_list_has_festive_glow failed"
        r = admin_session.get(f"{BASE}/api/whatsapp-link/campaigns/{cid}", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d.get("recipients"), list)

    def test_detail_unknown_404(self, admin_session):
        r = admin_session.get(f"{BASE}/api/whatsapp-link/campaigns/does-not-exist-123", timeout=15)
        assert r.status_code == 404

    def test_pause_on_done_returns_409(self, admin_session):
        cid = getattr(pytest, "_festive_cid", None)
        assert cid
        r = admin_session.post(f"{BASE}/api/whatsapp-link/campaigns/{cid}/pause", timeout=15)
        assert r.status_code == 409, r.text

    def test_bogus_action_400(self, admin_session):
        cid = getattr(pytest, "_festive_cid", None)
        assert cid
        r = admin_session.post(f"{BASE}/api/whatsapp-link/campaigns/{cid}/bogus-action", timeout=15)
        assert r.status_code == 400, r.text


# ------------------ Compose (LLM, no send) ------------------
class TestCompose:
    def test_compose_returns_text_image_candidates(self, admin_session):
        s = admin_session
        rc = s.get(f"{BASE}/api/customers", timeout=15)
        assert rc.status_code == 200, rc.text
        cust = rc.json()
        if isinstance(cust, dict):
            cust = cust.get("customers") or cust.get("items") or []
        assert isinstance(cust, list) and len(cust) > 0, "need at least one customer"
        cid = cust[0]["id"]
        r = s.post(f"{BASE}/api/whatsapp-link/campaigns/compose",
                   json={"customer_ids": [cid], "brief": "Weekend hair spa 15% off"}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        text = d.get("text") or ""
        assert "{name}" in text, f"no {{name}} placeholder in text: {text!r}"
        assert "/book/" in text, f"no /book/ link in text: {text!r}"
        img = d.get("image")
        assert isinstance(img, dict) and img.get("id") and img.get("url"), f"bad image: {img}"
        cands = d.get("candidates")
        assert isinstance(cands, list) and len(cands) > 0


# ------------------ Validation on /campaigns (never sends) ------------------
class TestCampaignCreateValidation:
    def test_empty_customer_ids_422(self, admin_session):
        r = admin_session.post(f"{BASE}/api/whatsapp-link/campaigns",
                               json={"customer_ids": [], "text": "Hello everyone, this is a valid message"},
                               timeout=15)
        assert r.status_code == 422, r.text

    def test_text_too_short_422(self, admin_session):
        r = admin_session.post(f"{BASE}/api/whatsapp-link/campaigns",
                               json={"customer_ids": ["some-id"], "text": "hi"},
                               timeout=15)
        assert r.status_code == 422, r.text
