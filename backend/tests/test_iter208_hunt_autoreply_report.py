"""Iter 208 — hunt-all scoping, auto_reply_to_lead, outreach report found_stats/waiting/auto_replied."""
import os
import asyncio
import time
import requests
import pytest
from _creds import pw
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Single event loop shared across tests to avoid motor's "Event loop is closed" when
# calling asyncio.run() repeatedly against the module-level motor client.
_LOOP = asyncio.new_event_loop()


def _run(coro):
    return _LOOP.run_until_complete(coro)
EMAIL = "admin@miracurl-suite.com"
PASSWORD = pw("SUPER_ADMIN")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text[:200]
    csrf = s.cookies.get("csrf_token")
    assert csrf
    s.headers.update({"X-CSRF-Token": csrf, "Content-Type": "application/json"})
    return s


# --- hunt-all scoped --------------------------------------------------------
def test_hunt_all_scoped_restaurant_bangalore(client):
    r = client.post(f"{BASE_URL}/api/super-admin/mira-leads/hunt-all?vertical=restaurant&city=Bangalore", timeout=60)
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert set(body.keys()) >= {"started", "count"}
    assert isinstance(body["count"], int)
    assert isinstance(body["started"], bool)
    if body["started"]:
        # Stop immediately — don't wait for pipeline
        stop = client.post(f"{BASE_URL}/api/super-admin/mira-leads/runs/stop", timeout=30)
        assert stop.status_code in (200, 204)
        # verify the active-run label contained Bangalore restaurants
        time.sleep(0.5)
        runs = client.get(f"{BASE_URL}/api/super-admin/mira-leads/runs", timeout=30).json()
        assert isinstance(runs, list) and runs, runs
        assert "Bangalore restaurants" in (runs[0].get("city") or ""), runs[0]
    else:
        # count must be 0 if not started
        assert body["count"] == 0


# --- _extract_emails % filter ----------------------------------------------
def test_extract_emails_drops_url_encoded_junk():
    from routes.lead_gen import _extract_emails
    out = _extract_emails('x %22cafe%22%20bangalore%20%22@gmail.com real hello@cafe.in', 'cafe.in')
    assert out == ['hello@cafe.in'], out


# --- auto_reply_to_lead branches -------------------------------------------
def _ensure_auto_reply_on(client):
    r = client.put(f"{BASE_URL}/api/super-admin/mira/outreach/settings", json={"auto_reply": True}, timeout=30)
    assert r.status_code == 200, r.text[:200]
    assert r.json().get("auto_reply") is True


def test_auto_reply_no_email_returns_off(client):
    _ensure_auto_reply_on(client)
    from routes.mira_outreach import auto_reply_to_lead
    result = _run(auto_reply_to_lead({"id": "t-noemail", "name": "T", "email": ""}))
    assert result == {"sent": False, "reason": "off"}, result


def test_auto_reply_opt_out_detected(client):
    _ensure_auto_reply_on(client)
    from routes.mira_outreach import auto_reply_to_lead
    result = _run(auto_reply_to_lead({
        "id": "t-optout", "name": "T", "email": "nobody@example.invalid",
        "last_reply_text": "not interested"}))
    assert result.get("sent") is False
    assert result.get("reason") == "opt_out", result


def test_auto_reply_status_demo_already_handled(client):
    _ensure_auto_reply_on(client)
    from routes.mira_outreach import auto_reply_to_lead
    result = _run(auto_reply_to_lead({
        "id": "t-demo", "name": "T", "email": "nobody@example.invalid", "status": "demo"}))
    assert result == {"sent": False, "reason": "already handled"}, result


def test_opt_out_regex_positive_phrase_is_none():
    from routes.mira_outreach import _OPT_OUT_RE
    assert _OPT_OUT_RE.search("Yes send me a demo") is None


# --- settings PUT toggle ---------------------------------------------------
def test_put_settings_auto_reply_toggle(client):
    r = client.put(f"{BASE_URL}/api/super-admin/mira/outreach/settings", json={"auto_reply": False}, timeout=30)
    assert r.status_code == 200
    assert r.json().get("auto_reply") is False
    # restore
    r2 = client.put(f"{BASE_URL}/api/super-admin/mira/outreach/settings", json={"auto_reply": True}, timeout=30)
    assert r2.status_code == 200
    assert r2.json().get("auto_reply") is True


# --- GET outreach/report has found_stats / waiting_for_reply / auto_replied -
def test_outreach_report_has_new_fields(client):
    r = client.get(f"{BASE_URL}/api/super-admin/mira/outreach/report?vertical=restaurant&days=1", timeout=60)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert "found_stats" in d and isinstance(d["found_stats"], dict), d.keys()
    fs = d["found_stats"]
    for k in ("found", "with_email", "newly_opened"):
        assert k in fs, fs
        assert isinstance(fs[k], (int, float)), (k, fs[k])
    assert "waiting_for_reply" in d and isinstance(d["waiting_for_reply"], (int, float))
    assert "auto_replied" in d and isinstance(d["auto_replied"], (int, float))
