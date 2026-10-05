"""Iteration 210 — Outreach report (Boss Brief) tests.
Covers:
  (A) GET /api/super-admin/mira/outreach/report?vertical=salon|restaurant returns new boss keys + html with BOSS BRIEF.
  (B) Unit tests on services.outreach_report with temp mira_leads/mira_outreach_log docs.
  (C) _super_admin_emails() includes HQ admin and excludes login-only mailboxes.
  (D) Regression: /super-admin/mira-leads/auto-wa and /super-admin/mira/tone-memory still 200.
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

import pytest
import requests
from dotenv import load_dotenv
from tests._creds import pw

sys.path.insert(0, "/app/backend")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
SA_EMAIL = "admin@miracurl-suite.com"
SA_PASS = pw("SUPER_ADMIN")
TAG = "iter210"


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def sa_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": SA_EMAIL, "password": SA_PASS}, timeout=20)
    assert r.status_code == 200, f"super-admin login failed: {r.status_code} {r.text[:200]}"
    csrf = s.cookies.get("csrf_token")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf})
    return s


# ---------- (A) HTTP endpoint ----------
@pytest.mark.parametrize("vertical", ["salon", "restaurant"])
def test_outreach_report_endpoint_has_boss_keys(sa_session, vertical):
    r = sa_session.get(f"{BASE_URL}/api/super-admin/mira/outreach/report", params={"vertical": vertical, "days": 7}, timeout=30)
    assert r.status_code == 200, f"status={r.status_code} body={r.text[:300]}"
    data = r.json()
    for k in ("pitched_today", "hot_today", "by_segment", "segment_cities", "top_cities",
              "demo_invites", "meeting_invites", "demos_booked", "replies", "wa_pitches",
              "sent_today", "by_country", "journey", "found_stats"):
        assert k in data, f"missing key {k} for vertical={vertical}"
    for k in ("pitched_today", "hot_today", "demo_invites", "meeting_invites", "demos_booked", "replies", "wa_pitches"):
        assert isinstance(data[k], int), f"{k} not int: {type(data[k])}"
    assert isinstance(data["by_segment"], list)
    assert isinstance(data["segment_cities"], dict)
    assert isinstance(data["top_cities"], list)
    html = data.get("html") or data.get("report_html") or ""
    assert "BOSS BRIEF" in html, "BOSS BRIEF marker missing from html"


# ---------- (D) regression ----------
def test_autowa_still_ok(sa_session):
    r = sa_session.get(f"{BASE_URL}/api/super-admin/mira-leads/auto-wa", timeout=20)
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    d = r.json()
    assert "template_status" in d
    assert "phone_only" in d and isinstance(d["phone_only"], bool)
    assert "phone_only_total" in d
    assert "phone_only_queued" in d


def test_tone_memory_still_ok(sa_session):
    r = sa_session.get(f"{BASE_URL}/api/super-admin/mira/tone-memory", timeout=20)
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"


# ---------- (B) & (C) unit tests on services ----------
@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


async def _seed_and_build():
    from database import _raw_db
    from services.outreach_report import build_report, boss_subject, report_html, _super_admin_emails
    now_iso = datetime.now(timezone.utc).isoformat()
    lead_docs, log_docs = [], []
    cities = ["Bangalore", "Mumbai", "Bangalore"]
    for i, city in enumerate(cities):
        lid = f"iter210-lead-{uuid.uuid4().hex[:8]}"
        lead_docs.append({
            "id": lid, "_t": TAG, "vertical": "salon", "name": f"TEST_Salon_{i}",
            "city": city, "country": "IN", "sent_at": now_iso, "created_at": now_iso,
            "status": "sent",
            "reviews": 1200 if i == 0 else 50,
            "category": "luxury spa" if i == 0 else "hair salon",
            "rating": 4.6,
        })
        log_docs.append({
            "_t": TAG, "channel": "email", "kind": "pitch", "lead_id": lid,
            "city": city, "country": "IN", "vertical": "salon", "created_at": now_iso,
        })
    await _raw_db.mira_leads.insert_many(lead_docs)
    await _raw_db.mira_outreach_log.insert_many(log_docs)
    try:
        rep = await build_report("salon", 1)
        subj = boss_subject(rep)
        html = report_html(rep)
        emails = await _super_admin_emails()
        return rep, subj, html, emails
    finally:
        await _raw_db.mira_leads.delete_many({"_t": TAG})
        await _raw_db.mira_outreach_log.delete_many({"_t": TAG})


def test_build_report_with_seeded_data(event_loop):
    rep, subj, html, emails = event_loop.run_until_complete(_seed_and_build())
    assert rep["pitched_today"] == 3, f"pitched_today={rep['pitched_today']}, by_segment={rep['by_segment']}"
    segs = [s for s, _ in rep["by_segment"]]
    assert "Luxury Salons" in segs, f"segments={segs}"
    assert "Salons" in segs, f"segments={segs}"
    assert "Bangalore" in rep["top_cities"], f"top_cities={rep['top_cities']}"
    assert "Mumbai" in rep["top_cities"], f"top_cities={rep['top_cities']}"
    assert rep["hot_today"] >= 1, f"hot_today={rep['hot_today']}"
    assert subj.startswith("💇 Today Mira sent 3 hot-lead email"), f"subj={subj!r}"
    assert "Luxury Salons" in subj and "Bangalore" in subj, f"subj={subj!r}"
    assert "BOSS BRIEF" in html


def test_boss_subject_zero_pitches(event_loop):
    async def _run():
        from services.outreach_report import build_report, boss_subject
        from database import _raw_db
        # ensure clean slate for this tag
        await _raw_db.mira_leads.delete_many({"_t": TAG})
        await _raw_db.mira_outreach_log.delete_many({"_t": TAG})
        rep = await build_report("salon", 1)
        # Force pitched_today = 0 case (real preview data may be 0 anyway)
        rep_zero = {**rep, "pitched_today": 0, "by_segment": [], "top_cities": [], "hot_today": 0}
        return boss_subject(rep_zero)
    subj = event_loop.run_until_complete(_run())
    assert "no new pitches to salons" in subj, f"subj={subj!r}"
    assert subj.startswith("💇"), f"subj={subj!r}"


def test_super_admin_emails_includes_hq_admin(event_loop):
    async def _run():
        from services.outreach_report import _super_admin_emails
        return await _super_admin_emails()
    emails = event_loop.run_until_complete(_run())
    assert isinstance(emails, list)
    assert SA_EMAIL in emails, f"HQ admin missing from {emails}"
    # Login-only mailboxes (super@miracurl.com style retired) should be absent
    for e in emails:
        assert "super@miracurl.com" not in e, f"login-only email leaked: {e}"
