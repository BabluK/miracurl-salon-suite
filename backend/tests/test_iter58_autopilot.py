"""Iteration 58 — Mira Auto-Pilot backend tests."""
import os
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")

ADMIN = {"email": "admin@miracurl.com", "password": "q6QY@tn3p#9DtL", "slug": "miracurl-marathahalli"}
ELEG = {"email": "owner@elegance.com", "password": "Owner@123", "slug": "elegance-koramangala"}


def _login(creds):
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": creds["slug"]})
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": creds["email"], "password": creds["password"]},
               headers={"X-Tenant-Slug": creds["slug"]}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def admin_sess():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def eleg_sess():
    return _login(ELEG)


# ── auth ────────────────────────────────────────────────────────────────
def test_autopilot_requires_auth():
    r = requests.get(f"{BASE}/api/mira-studio/autopilot",
                     headers={"X-Tenant-Slug": ADMIN["slug"]}, timeout=15)
    assert r.status_code == 401


# ── settings GET/PUT ────────────────────────────────────────────────────
def test_get_settings(admin_sess):
    r = admin_sess.get(f"{BASE}/api/mira-studio/autopilot", timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ("enabled", "daily_post", "winback_emails", "email_daily_cap", "winback_days"):
        assert k in d
    assert d["enabled"] is True  # main agent enabled it


def test_put_empty_returns_400(admin_sess):
    r = admin_sess.put(f"{BASE}/api/mira-studio/autopilot", json={}, timeout=15)
    assert r.status_code == 400


def test_put_cap_clamps_to_50(admin_sess):
    r = admin_sess.put(f"{BASE}/api/mira-studio/autopilot",
                       json={"email_daily_cap": 100}, timeout=15)
    assert r.status_code == 200
    assert r.json()["email_daily_cap"] == 50
    # restore small cap for safety (real Resend)
    admin_sess.put(f"{BASE}/api/mira-studio/autopilot",
                   json={"email_daily_cap": 3}, timeout=15)


# ── activity ────────────────────────────────────────────────────────────
def test_activity_returns_runs_and_outreach(admin_sess):
    r = admin_sess.get(f"{BASE}/api/mira-studio/autopilot/activity", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "runs" in d and "outreach" in d
    assert isinstance(d["runs"], list) and isinstance(d["outreach"], list)
    # today's run should exist from main agent earlier run
    assert len(d["runs"]) >= 1
    today = d["runs"][0]
    assert "wa_queue" in today
    assert isinstance(today["wa_queue"], list)


# ── run-now (LLM heavy — up to 120s) ────────────────────────────────────
def test_run_now_reuses_today_calendar(admin_sess):
    # capture today's calendar count before
    cal_before = admin_sess.get(f"{BASE}/api/mira-studio/calendar", timeout=20).json()
    from datetime import date
    today = date.today().isoformat()
    before_today = [c for c in (cal_before.get("items", cal_before) if isinstance(cal_before, dict) else cal_before) if c.get("date") == today]

    r = admin_sess.post(f"{BASE}/api/mira-studio/autopilot/run-now", timeout=180)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert d.get("post_created") is True
    assert d.get("posted_live") is False  # no Meta connection
    assert "emails_sent" in d and "wa_leads" in d
    assert isinstance(d.get("errors", []), list)

    # no duplicate calendar items today
    cal_after = admin_sess.get(f"{BASE}/api/mira-studio/calendar", timeout=20).json()
    after_today = [c for c in (cal_after.get("items", cal_after) if isinstance(cal_after, dict) else cal_after) if c.get("date") == today]
    assert len(after_today) == len(before_today) or len(before_today) == 0, \
        f"duplicate calendar items: before={len(before_today)} after={len(after_today)}"


# ── wa-sent ─────────────────────────────────────────────────────────────
def test_wa_sent_removes_lead(admin_sess):
    act = admin_sess.get(f"{BASE}/api/mira-studio/autopilot/activity", timeout=15).json()
    runs = act.get("runs", [])
    if not runs or not runs[0].get("wa_queue"):
        pytest.skip("no wa_queue leads to test")
    lead = runs[0]["wa_queue"][0]
    cid = lead["customer_id"]
    before_count = len(runs[0]["wa_queue"])

    r = admin_sess.post(f"{BASE}/api/mira-studio/autopilot/wa-sent",
                        json={"customer_id": cid}, timeout=15)
    assert r.status_code == 200

    act2 = admin_sess.get(f"{BASE}/api/mira-studio/autopilot/activity", timeout=15).json()
    q2 = act2["runs"][0]["wa_queue"]
    assert len(q2) == before_count - 1
    assert not any(w["customer_id"] == cid for w in q2)
    # outreach has whatsapp entry
    assert any(o["channel"] == "whatsapp" and o.get("customer_id") == cid for o in act2["outreach"])


# ── tenant isolation ────────────────────────────────────────────────────
def test_tenant_isolation_elegance(eleg_sess):
    r = eleg_sess.get(f"{BASE}/api/mira-studio/autopilot", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["enabled"] is False  # default off for elegance
    r2 = eleg_sess.get(f"{BASE}/api/mira-studio/autopilot/activity", timeout=15)
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["runs"] == []
    assert d2["outreach"] == []


# ── re-enable for miracurl at end ───────────────────────────────────────
def test_zzz_leave_enabled(admin_sess):
    admin_sess.put(f"{BASE}/api/mira-studio/autopilot", json={"enabled": True}, timeout=15)
    r = admin_sess.get(f"{BASE}/api/mira-studio/autopilot", timeout=15)
    assert r.json()["enabled"] is True
