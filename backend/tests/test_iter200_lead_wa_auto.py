"""iter200: WhatsApp Lead Nudge — auto-WA replaces retired Twilio auto-dialer.

STRICT: never set enabled=true; never call wa-intro on a real lead. Both would send real WhatsApp messages.
"""
import os
import sys
import pytest
import requests

sys.path.insert(0, os.path.dirname(__file__))
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


def _login(session, email, password, tenant=None):
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


def _csrf(session) -> dict:
    tok = session.cookies.get("csrf_token")
    assert tok, "csrf_token cookie not present"
    return {"X-CSRF-Token": tok, "Content-Type": "application/json"}


# ---------- GET auto-wa settings ----------
class TestGetAutoWa:
    def test_get_returns_expected_keys(self, super_session):
        r = super_session.get(f"{BASE}/api/super-admin/mira-leads/auto-wa", timeout=30)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        for k in ("enabled", "daily_limit", "start_hour", "end_hour", "template", "template_status",
                  "sent_today", "replied_total"):
            assert k in d, f"missing key {k}: {d}"
        assert d["template"] == "miracurl_lead_intro"
        assert isinstance(d["enabled"], bool)
        assert isinstance(d["daily_limit"], int)
        assert isinstance(d["sent_today"], int)
        assert isinstance(d["replied_total"], int)
        # STRICT precheck: must be disabled by policy
        assert d["enabled"] is False, "auto-wa is ENABLED — real messages could be sent. Aborting."
        # Meta template expected APPROVED per problem statement
        assert d["template_status"] == "APPROVED", f"template_status={d['template_status']}"


# ---------- PUT auto-wa (never enable) ----------
class TestPutAutoWa:
    def test_put_persists_daily_limit(self, super_session):
        headers = _csrf(super_session)
        # Change to 30 (still disabled)
        r = super_session.put(f"{BASE}/api/super-admin/mira-leads/auto-wa",
                              json={"enabled": False, "daily_limit": 30}, headers=headers, timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert r.json()["daily_limit"] == 30
        assert r.json()["enabled"] is False
        # Re-GET
        g = super_session.get(f"{BASE}/api/super-admin/mira-leads/auto-wa", timeout=30).json()
        assert g["daily_limit"] == 30
        assert g["enabled"] is False
        # Restore back to 25
        r2 = super_session.put(f"{BASE}/api/super-admin/mira-leads/auto-wa",
                               json={"enabled": False, "daily_limit": 25}, headers=headers, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["daily_limit"] == 25
        assert r2.json()["enabled"] is False

    @pytest.mark.parametrize("bad", [0, 101, -1, 200])
    def test_put_bad_daily_limit_422(self, super_session, bad):
        headers = _csrf(super_session)
        r = super_session.put(f"{BASE}/api/super-admin/mira-leads/auto-wa",
                              json={"enabled": False, "daily_limit": bad}, headers=headers, timeout=30)
        assert r.status_code == 422, f"expected 422 for daily_limit={bad}, got {r.status_code}: {r.text[:200]}"


# ---------- POST wa-intro (invalid lead only) ----------
class TestSendIntro:
    def test_send_intro_unknown_lead_404(self, super_session):
        headers = _csrf(super_session)
        r = super_session.post(f"{BASE}/api/super-admin/mira-leads/does-not-exist/wa-intro",
                               json={}, headers=headers, timeout=30)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"


# ---------- Briefing snapshot ----------
class TestBriefing:
    def test_briefing_has_wa_intro_counters(self, super_session):
        r = super_session.get(f"{BASE}/api/super-admin/mira/briefing", timeout=30)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        data = body.get("data") or body
        assert "wa_intros_sent_today" in data, f"missing wa_intros_sent_today: {list(data.keys())}"
        assert "wa_intro_replies_today" in data, f"missing wa_intro_replies_today: {list(data.keys())}"
        assert isinstance(data["wa_intros_sent_today"], int)
        assert isinstance(data["wa_intro_replies_today"], int)


# ---------- Auth: non-super-admin blocked ----------
class TestAuthGating:
    def test_salon_admin_forbidden(self, salon_session):
        r = salon_session.get(f"{BASE}/api/super-admin/mira-leads/auto-wa", timeout=30)
        assert r.status_code in (401, 403), f"expected 401/403 for salon admin, got {r.status_code}"

    def test_anon_forbidden(self):
        r = requests.get(f"{BASE}/api/super-admin/mira-leads/auto-wa", timeout=30)
        assert r.status_code in (401, 403)


# ---------- Unit-level (no network) ----------
class TestUnit:
    def test_intro_params_and_wa_phone_and_disabled_scheduler(self):
        sys.path.insert(0, "/app/backend")
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")
        from routes.lead_wa_auto import _intro_params, _wa_phone, _local_hour, auto_wa_hot_leads
        import asyncio

        # _intro_params — always 5 strings
        params = _intro_params({"name": "Glow Salon", "city": "Bangalore", "rating": 4.7,
                                "reviews": 800, "owner_name": "Priya Sharma", "vertical": "salon"})
        assert len(params) == 5
        assert all(isinstance(p, str) for p in params)
        assert params[0] == "Priya"
        assert params[4] == "salon"

        # restaurant vertical
        rp = _intro_params({"vertical": "restaurant"})
        assert rp[4] == "restaurant"
        assert len(rp) == 5 and all(isinstance(p, str) for p in rp)

        # _wa_phone
        assert _wa_phone("098765 43210") == "919876543210"
        assert _wa_phone("9876543210") == "919876543210"
        assert _wa_phone("+91 98765 43210") == "919876543210"

        # _local_hour returns float
        h = _local_hour("919876543210")
        assert isinstance(h, float) and 0 <= h < 24

        # auto_wa_hot_leads returns 0 while disabled
        n = asyncio.get_event_loop().run_until_complete(auto_wa_hot_leads()) \
            if False else asyncio.run(auto_wa_hot_leads())
        assert n == 0, f"scheduler returned {n} while disabled — must be 0"
