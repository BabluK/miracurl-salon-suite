"""Backend tests for Mira Outreach Autopilot (iter 201).
Covers: summary, settings, run-now (dry_run only), history, countries, auth guards,
briefing/home 'outreach' payloads and mira/ask actions (outreach_on/off/set_limit).

CRITICAL: never call run-now without dry_run=true — that sends real emails.
"""
import os
import time
import pytest
import requests
from creds import password_for

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
SA_EMAIL = "admin@miracurl-suite.com"
SA_PWD = password_for("admin@miracurl-suite.com")
TENANT_EMAIL = "admin@miracurl.com"
TENANT_PWD = password_for("admin@miracurl.com")
TENANT_SLUG = "miracurl-marathahalli"

ORIGIN = BASE_URL


def _login(session, email, pwd, tenant=None):
    headers = {"Content-Type": "application/json", "Origin": ORIGIN}
    if tenant:
        headers["X-Tenant-Slug"] = tenant
    r = session.post(f"{BASE_URL}/api/auth/login", headers=headers,
                     json={"email": email, "password": pwd})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    csrf = session.cookies.get("csrf_token")
    assert csrf, "csrf_token cookie missing"
    return csrf


@pytest.fixture(scope="module")
def sa_session():
    s = requests.Session()
    csrf = _login(s, SA_EMAIL, SA_PWD)
    s.headers.update({"X-CSRF-Token": csrf, "Origin": ORIGIN, "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def tenant_session():
    s = requests.Session()
    csrf = _login(s, TENANT_EMAIL, TENANT_PWD, TENANT_SLUG)
    s.headers.update({"X-CSRF-Token": csrf, "X-Tenant-Slug": TENANT_SLUG,
                      "Origin": ORIGIN, "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module", autouse=True)
def _restore_settings(sa_session):
    """Ensure settings are restored (enabled False, limit 100) after tests."""
    yield
    try:
        sa_session.put(f"{BASE_URL}/api/super-admin/mira/outreach/settings", json={
            "enabled": False, "daily_email_limit": 100, "per_cycle": 10, "min_score": 50,
            "verticals": ["salon", "restaurant"], "wa_countries": ["91"],
            "auto_hunt": True, "hunts_per_day": 2,
            "hunt_countries": ["IN", "AE", "UK", "US", "SG", "AU", "CA"],
        })
    except Exception:
        pass


# ---------- summary ----------

class TestOutreachSummary:
    def test_summary_structure(self, sa_session):
        r = sa_session.get(f"{BASE_URL}/api/super-admin/mira/outreach/summary")
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("settings", "today", "yesterday", "ready_to_send", "hunts_today", "totals", "greeting"):
            assert k in j, f"missing key {k}"
        s = j["settings"]
        assert s["daily_email_limit"] == 100 or isinstance(s["daily_email_limit"], int)
        assert "salon" in s["verticals"] and "restaurant" in s["verticals"]
        assert "91" in s["wa_countries"] or isinstance(s["wa_countries"], list)
        assert isinstance(s["auto_hunt"], bool)
        assert isinstance(j["greeting"], str) and len(j["greeting"]) > 5


# ---------- settings PUT ----------

class TestOutreachSettings:
    def test_settings_saves_and_filters_invalid_vertical(self, sa_session):
        payload = {
            "enabled": False, "daily_email_limit": 120, "per_cycle": 10, "min_score": 50,
            "verticals": ["salon", "restaurant", "bogus"],  # bogus filtered
            "wa_countries": ["91", "971"], "auto_hunt": True, "hunts_per_day": 2,
            "hunt_countries": ["IN", "AE", "UK", "US", "SG", "AU", "CA"],
        }
        r = sa_session.put(f"{BASE_URL}/api/super-admin/mira/outreach/settings", json=payload)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ok"] is True
        assert "bogus" not in j["verticals"]
        assert set(j["verticals"]) == {"salon", "restaurant"}
        assert j["daily_email_limit"] == 120
        assert "971" in j["wa_countries"]
        # GET verify persistence
        r2 = sa_session.get(f"{BASE_URL}/api/super-admin/mira/outreach/summary")
        assert r2.json()["settings"]["daily_email_limit"] == 120

    def test_limit_out_of_range_returns_422(self, sa_session):
        base = {"enabled": False, "per_cycle": 10, "min_score": 50,
                "verticals": ["salon"], "wa_countries": ["91"],
                "auto_hunt": True, "hunts_per_day": 2, "hunt_countries": ["IN"]}
        r0 = sa_session.put(f"{BASE_URL}/api/super-admin/mira/outreach/settings",
                            json={**base, "daily_email_limit": 0})
        assert r0.status_code == 422, r0.text
        r5000 = sa_session.put(f"{BASE_URL}/api/super-admin/mira/outreach/settings",
                               json={**base, "daily_email_limit": 5000})
        assert r5000.status_code == 422, r5000.text

    def test_restore_limit_100(self, sa_session):
        r = sa_session.put(f"{BASE_URL}/api/super-admin/mira/outreach/settings", json={
            "enabled": False, "daily_email_limit": 100, "per_cycle": 10, "min_score": 50,
            "verticals": ["salon", "restaurant"], "wa_countries": ["91"],
            "auto_hunt": True, "hunts_per_day": 2,
            "hunt_countries": ["IN", "AE", "UK", "US", "SG", "AU", "CA"],
        })
        assert r.status_code == 200
        assert r.json()["daily_email_limit"] == 100


# ---------- run-now (DRY-RUN ONLY) ----------

class TestOutreachRunNowDryRun:
    def test_run_now_dry_run_no_side_effects(self, sa_session):
        # snapshot before
        before = sa_session.get(f"{BASE_URL}/api/super-admin/mira/outreach/history?days=1").json()
        cnt_before = len(before.get("items", []))
        r = sa_session.post(f"{BASE_URL}/api/super-admin/mira/outreach/run-now?dry_run=true")
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("dry_run") is True
        assert "would_email" in j and isinstance(j["would_email"], list)
        assert "budget_left_today" in j and isinstance(j["budget_left_today"], int)
        # verify no new log entries
        after = sa_session.get(f"{BASE_URL}/api/super-admin/mira/outreach/history?days=1").json()
        assert len(after.get("items", [])) == cnt_before


# ---------- history + countries ----------

class TestOutreachHistoryCountries:
    def test_history(self, sa_session):
        r = sa_session.get(f"{BASE_URL}/api/super-admin/mira/outreach/history?days=30")
        assert r.status_code == 200
        j = r.json()
        assert "days" in j and isinstance(j["days"], list)
        assert "items" in j and isinstance(j["items"], list)

    def test_countries(self, sa_session):
        r = sa_session.get(f"{BASE_URL}/api/super-admin/mira/outreach/countries")
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j.get("countries"), list) and len(j["countries"]) > 5
        assert isinstance(j.get("cities"), list) and len(j["cities"]) > 5
        assert all("iso" in c and "dial" in c for c in j["countries"][:3])


# ---------- auth guards ----------

class TestOutreachAuthGuards:
    OUT_PATHS = [
        ("GET", "/api/super-admin/mira/outreach/summary"),
        ("GET", "/api/super-admin/mira/outreach/history"),
        ("GET", "/api/super-admin/mira/outreach/countries"),
    ]

    def test_anonymous_blocked(self):
        for method, path in self.OUT_PATHS:
            r = requests.request(method, f"{BASE_URL}{path}")
            assert r.status_code in (401, 403), f"{path} anon got {r.status_code}"

    def test_tenant_admin_blocked(self, tenant_session):
        for method, path in self.OUT_PATHS:
            r = tenant_session.request(method, f"{BASE_URL}{path}")
            assert r.status_code in (401, 403), f"{path} tenant got {r.status_code}"


# ---------- briefing & home ----------

class TestMiraBriefingHome:
    def test_briefing_contains_outreach_report(self, sa_session):
        r = sa_session.get(f"{BASE_URL}/api/super-admin/mira/briefing")
        assert r.status_code == 200
        j = r.json()
        assert "Outreach report:" in j.get("text", ""), j.get("text", "")[:200]
        assert isinstance(j.get("outreach"), dict)
        assert "greeting" in j["outreach"]

    def test_home_has_outreach(self, sa_session):
        r = sa_session.get(f"{BASE_URL}/api/super-admin/mira/home")
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j.get("outreach"), dict)
        assert "greeting" in j["outreach"]
        assert "settings" in j["outreach"]


# ---------- mira/ask actions ----------

def _ask(sa_session, question):
    r = sa_session.post(f"{BASE_URL}/api/super-admin/mira/ask",
                        json={"question": question, "last_mira": ""})
    assert r.status_code == 200, r.text
    return r.json()


def _current_settings(sa_session):
    return sa_session.get(f"{BASE_URL}/api/super-admin/mira/outreach/summary").json()["settings"]


class TestMiraAskActions:
    def test_question_no_action(self, sa_session):
        j = _ask(sa_session, "How many emails did you send today?")
        assert j.get("action", "") == "", f"Expected empty action, got: {j}"

    def test_turn_on_autopilot(self, sa_session):
        j = _ask(sa_session, "turn on the outreach autopilot")
        assert j.get("action") == "outreach_on", j
        time.sleep(0.5)
        assert _current_settings(sa_session)["enabled"] is True

    def test_pause_outreach(self, sa_session):
        j = _ask(sa_session, "pause outreach")
        assert j.get("action") == "outreach_off", j
        time.sleep(0.5)
        assert _current_settings(sa_session)["enabled"] is False

    def test_set_limit(self, sa_session):
        j = _ask(sa_session, "set the daily email limit to 150")
        assert j.get("action", "").startswith("set_limit:150"), j
        time.sleep(0.5)
        assert _current_settings(sa_session)["daily_email_limit"] == 150
        # restore to 100 via PUT
        r = sa_session.put(f"{BASE_URL}/api/super-admin/mira/outreach/settings", json={
            "enabled": False, "daily_email_limit": 100, "per_cycle": 10, "min_score": 50,
            "verticals": ["salon", "restaurant"], "wa_countries": ["91"],
            "auto_hunt": True, "hunts_per_day": 2,
            "hunt_countries": ["IN", "AE", "UK", "US", "SG", "AU", "CA"],
        })
        assert r.status_code == 200
        assert r.json()["daily_email_limit"] == 100
        assert r.json()["enabled"] is False
