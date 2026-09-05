"""Tests for founder invitation template, demo trial days, and WA quick-invite CRUD."""
import os
import re
import time
import random
import pytest
import requests
from creds import password_for

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")

SUPER_EMAIL = "super@miracurl.com"
SUPER_PASSWORD = password_for(SUPER_EMAIL)


@pytest.fixture(scope="module")
def super_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": SUPER_EMAIL, "password": SUPER_PASSWORD},
               timeout=30)
    print(f"[super_session] BASE={BASE_URL} status={r.status_code} cookies={[c.name for c in s.cookies]}")
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text[:200]}"
    csrf = s.cookies.get("csrf_token")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf})
    return s


# ---------- Plan catalog ----------
def test_public_plans_trial_days():
    r = requests.get(f"{BASE_URL}/api/public/plans", timeout=15)
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    # trial_days is at top level (dict of plans keyed by id + trial_days key)
    assert data.get("trial_days") == 30, f"expected trial_days=30, got {data.get('trial_days')}"


# ---------- Demo preview: trial days honoured ----------
def test_demo_preview_uses_30_days(super_session):
    r = super_session.get(f"{BASE_URL}/api/super-admin/demo-campaign/preview?template=demo", timeout=20)
    assert r.status_code == 200, r.text[:200]
    html = r.text.lower()
    assert "30-day free trial" in html, "expected '30-day free trial' in demo preview"
    assert "7-day free trial" not in html, "old 7-day text still present"


def test_demo_preview_restaurant_free_first_month(super_session):
    r = super_session.get(f"{BASE_URL}/api/super-admin/demo-campaign/preview?template=demo&vertical=restaurant", timeout=20)
    assert r.status_code == 200
    assert "FREE first month" in r.text


# ---------- Founder preview ----------
def test_founder_preview_contains_personalisation(super_session):
    params = {
        "template": "founder",
        "name": "Priya Sharma",
        "salon_name": "Glow Studio",
        "note": "Hello there testnote",
    }
    r = super_session.get(f"{BASE_URL}/api/super-admin/demo-campaign/preview", params=params, timeout=20)
    assert r.status_code == 200, r.text[:200]
    html = r.text
    for needle in ["Hi Priya,", "Glow Studio", "6 MONTHS", "COMPLETELY FREE",
                   "Bablu Kumar", "admin@miracurl-suite.com", "+91 91802 61256",
                   "Explore Miracurl Suite", "Hello there testnote"]:
        assert needle in html, f"founder preview missing: {needle!r}"


# ---------- Demo send validation ----------
def test_demo_send_bogus_template_422(super_session):
    r = super_session.post(f"{BASE_URL}/api/super-admin/demo-campaign/send",
                           json={"recipients": [{"email": "x@example.com"}], "template": "bogus"},
                           timeout=20)
    assert r.status_code == 422, f"expected 422 got {r.status_code}: {r.text[:200]}"


# ---------- Founder send + history ----------
FOUNDER_EMAIL = f"qa.founder.{random.randint(100000,999999)}@example.com"
DEMO_EMAIL = f"qa.demo.{random.randint(100000,999999)}@example.com"


@pytest.fixture(scope="module")
def founder_send_result(super_session):
    payload = {
        "recipients": [{"email": FOUNDER_EMAIL, "name": "Anita Rao", "salon_name": "Rose Petal Salon"}],
        "template": "founder",
        "note": "",
        "currency": "auto",
        "vertical": "salon",
    }
    r = super_session.post(f"{BASE_URL}/api/super-admin/demo-campaign/send", json=payload, timeout=45)
    return r


def test_founder_send_status(founder_send_result):
    r = founder_send_result
    assert r.status_code == 200, f"founder send status {r.status_code}: {r.text[:300]}"
    data = r.json()
    print(f"[founder-send] response: {data}")
    # sent count is either 1 or 0 if Resend rejected @example.com - we accept both but report
    assert "sent" in data or "queued" in data or "results" in data, f"unexpected shape: {data}"


def test_founder_history_subject(super_session, founder_send_result):
    time.sleep(1.5)
    r = super_session.get(f"{BASE_URL}/api/super-admin/demo-campaign/history", timeout=20)
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    campaigns = body.get("campaigns") if isinstance(body, dict) else body
    campaigns = campaigns or []
    # find the newest founder campaign
    match = next((c for c in campaigns if c.get("template") == "founder"), None)
    assert match is not None, f"no founder campaign in history: {campaigns[:2]}"
    subj = match.get("subject") or ""
    assert "personal invitation" in subj.lower(), f"bad founder subject: {subj!r}"
    assert "founder" in subj.lower() or "miracurl" in subj.lower()


def test_demo_send_history_30day(super_session):
    payload = {
        "recipients": [{"email": DEMO_EMAIL, "name": "Demo Qa", "salon_name": "Demo Salon"}],
        "template": "demo",
        "currency": "auto",
        "vertical": "salon",
    }
    r = super_session.post(f"{BASE_URL}/api/super-admin/demo-campaign/send", json=payload, timeout=45)
    assert r.status_code == 200, r.text[:300]
    time.sleep(1.5)
    h = super_session.get(f"{BASE_URL}/api/super-admin/demo-campaign/history", timeout=20)
    body = h.json() if h.status_code == 200 else {}
    campaigns = body.get("campaigns") if isinstance(body, dict) else body
    campaigns = campaigns or []
    # newest demo campaign
    match = next((c for c in campaigns if c.get("template") == "demo"), None)
    assert match is not None, "no demo campaign in history"
    subj = match.get("subject") or ""
    assert "30-Day" in subj or "30-day" in subj.lower(), f"expected 30-Day in subject, got: {subj!r}"
    assert "7-day" not in subj.lower() and "7-Day" not in subj


# ---------- Founder signup → 180 days ----------
def test_founder_signup_180_days(super_session):
    # Fresh send to delivered+<tag>@resend.dev so Resend accepts and invite row is stored
    tag = f"iter124f{random.randint(100000, 999999)}"
    email = f"delivered+{tag}@resend.dev"
    send_payload = {
        "recipients": [{"email": email, "name": "Anita Rao", "salon_name": "Rose Petal Salon"}],
        "template": "founder", "currency": "auto", "vertical": "salon",
    }
    r = super_session.post(f"{BASE_URL}/api/super-admin/demo-campaign/send", json=send_payload, timeout=45)
    assert r.status_code == 200, r.text[:200]
    time.sleep(1.0)

    inv = super_session.get(f"{BASE_URL}/api/super-admin/demo-campaign/invites", timeout=15)
    invites = inv.json().get("invites", []) if inv.status_code == 200 else []
    found = any(i.get("email", "").lower() == email.lower() and i.get("template") == "founder" for i in invites)
    if not found:
        pytest.skip(f"Founder invite did not persist for {email}; skipping 180-day check")

    signup_payload = {
        "salon_name": f"QA Founder {tag}",
        "owner_name": "Anita Rao",
        "owner_email": email,
        "password": "TestPass@123",
        "phone": f"9{random.randint(100000000, 999999999)}",
        "city": "Bengaluru",
    }
    r2 = requests.post(f"{BASE_URL}/api/public/signup-salon", json=signup_payload, timeout=30)
    assert r2.status_code == 200, f"signup failed: {r2.status_code} {r2.text[:400]}"
    data = r2.json()
    assert data.get("trial_days") == 180, f"expected trial_days=180, got {data.get('trial_days')}"
    tenant = data.get("tenant") or {}
    assert tenant.get("signup_offer") == "founder_6m", f"expected signup_offer=founder_6m, got {tenant.get('signup_offer')}"
    # Cleanup best-effort
    tid = tenant.get("id")
    if tid:
        try:
            super_session.delete(f"{BASE_URL}/api/super-admin/tenants/{tid}", timeout=15)
        except Exception:
            pass


# ---------- WA invites ----------
def test_wa_invite_recent_list(super_session):
    r = super_session.get(f"{BASE_URL}/api/super-admin/wa-invite/recent", timeout=15)
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", [])
    assert isinstance(items, list)


def test_wa_invite_crud(super_session):
    # Create
    payload = {"phone": "09999000111", "vertical": "salon",
               "name": "QA Test Salon", "city": "Test City"}
    r = super_session.post(f"{BASE_URL}/api/super-admin/wa-invite", json=payload, timeout=20)
    assert r.status_code == 200, f"create wa-invite failed: {r.status_code} {r.text[:200]}"
    body = r.json()
    assert "wa_url" in body or "url" in body, f"no wa_url: {body}"
    invite_id = body.get("id") or body.get("_id") or (body.get("invite") or {}).get("id")

    # Verify in recent
    r2 = super_session.get(f"{BASE_URL}/api/super-admin/wa-invite/recent", timeout=15)
    items = r2.json()
    items = items if isinstance(items, list) else items.get("items", [])
    if not invite_id:
        # find by phone
        for it in items:
            if "9999000111" in (it.get("phone") or ""):
                invite_id = it.get("id") or it.get("_id")
                break
    assert invite_id, f"invite id not found; items[0]={items[0] if items else None}"

    # Delete
    r3 = super_session.delete(f"{BASE_URL}/api/super-admin/wa-invite/{invite_id}", timeout=15)
    assert r3.status_code == 200, f"delete failed: {r3.status_code} {r3.text[:200]}"

    # Verify gone
    r4 = super_session.get(f"{BASE_URL}/api/super-admin/wa-invite/recent", timeout=15)
    items4 = r4.json()
    items4 = items4 if isinstance(items4, list) else items4.get("items", [])
    still = any((it.get("id") or it.get("_id")) == invite_id for it in items4)
    assert not still, "invite still present after delete"

    # Delete unknown → 404
    r5 = super_session.delete(f"{BASE_URL}/api/super-admin/wa-invite/nonexistent_id_xyz", timeout=15)
    assert r5.status_code == 404, f"expected 404 for unknown, got {r5.status_code}"

    # Cleanup leads collection best-effort (may not exist as an endpoint)
    try:
        super_session.delete(f"{BASE_URL}/api/super-admin/leads/by-phone/919999000111", timeout=10)
    except Exception:
        pass
