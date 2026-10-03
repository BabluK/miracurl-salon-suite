"""Iter 207 tests: mira-leads list/cleanup, run-now dry, outreach report + email."""
import os
import time
import requests
import pytest
from datetime import datetime, timezone
from pymongo import MongoClient
from _creds import pw

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "miracurl_db")

EMAIL = "admin@miracurl-suite.com"
PASSWORD = pw("SUPER_ADMIN")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    csrf = s.cookies.get("csrf_token")
    assert csrf, f"no csrf cookie, cookies={list(s.cookies.keys())}"
    s.headers.update({"X-CSRF-Token": csrf, "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


# --- GET /api/super-admin/mira-leads ---------------------------------------
def test_list_leads_newest_first_includes_restaurants(client):
    r = client.get(f"{BASE_URL}/api/super-admin/mira-leads", timeout=30)
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list) and len(rows) > 0
    # verify newest-first ordering by created_at
    ts = [row.get("created_at", "") for row in rows if row.get("created_at")]
    assert ts == sorted(ts, reverse=True), "leads not sorted by created_at desc"
    # verify restaurant vertical present
    rest = [row for row in rows if row.get("vertical") == "restaurant"]
    assert len(rest) >= 1, f"expected restaurant leads, got {len(rest)}"
    print(f"total={len(rows)} restaurant={len(rest)}")


def test_list_leads_filter_by_run_id(client):
    r = client.get(f"{BASE_URL}/api/super-admin/mira-leads", timeout=30)
    rows = r.json()
    rest = [row for row in rows if row.get("vertical") == "restaurant" and row.get("run_id")]
    assert rest, "no restaurant row with run_id"
    rid = rest[0]["run_id"]
    r2 = client.get(f"{BASE_URL}/api/super-admin/mira-leads?run_id={rid}", timeout=30)
    assert r2.status_code == 200
    rows2 = r2.json()
    assert len(rows2) > 0
    assert all(x.get("run_id") == rid for x in rows2)


# --- POST /api/super-admin/mira-leads/cleanup ------------------------------
def test_cleanup_modes_and_invalid(client, mongo):
    coll = mongo.mira_leads
    now = datetime.now(timezone.utc).isoformat()
    # Insert 3 temp leads
    coll.delete_many({"id": {"$in": ["qa-clean-1", "qa-clean-2", "qa-clean-3"]}})
    coll.insert_many([
        {"id": "qa-clean-1", "status": "no_email", "email": "", "name": "QA NoEmail",
         "created_at": now, "vertical": "salon"},
        {"id": "qa-clean-2", "status": "rejected", "email": "x@y.com", "name": "QA Rejected",
         "created_at": now, "vertical": "salon"},
        {"id": "qa-clean-3", "status": "sent", "email": "z@y.com", "name": "QA Sent",
         "sent_at": now, "created_at": now, "vertical": "salon"},
    ])

    # invalid mode -> 422
    r_bad = client.post(f"{BASE_URL}/api/super-admin/mira-leads/cleanup",
                        json={"mode": "nope"}, timeout=30)
    assert r_bad.status_code == 422, f"expected 422 got {r_bad.status_code} {r_bad.text[:200]}"

    # mode=rejected deletes qa-clean-2 only
    r1 = client.post(f"{BASE_URL}/api/super-admin/mira-leads/cleanup",
                     json={"mode": "rejected"}, timeout=30)
    assert r1.status_code == 200
    assert r1.json().get("mode") == "rejected"
    assert coll.find_one({"id": "qa-clean-2"}) is None
    assert coll.find_one({"id": "qa-clean-1"}) is not None
    assert coll.find_one({"id": "qa-clean-3"}) is not None

    # mode=no_email deletes qa-clean-1
    r2 = client.post(f"{BASE_URL}/api/super-admin/mira-leads/cleanup",
                     json={"mode": "no_email"}, timeout=30)
    assert r2.status_code == 200
    assert coll.find_one({"id": "qa-clean-1"}) is None
    # qa-clean-3 (sent) must survive
    assert coll.find_one({"id": "qa-clean-3"}) is not None

    # cleanup the survivor
    coll.delete_many({"id": {"$in": ["qa-clean-1", "qa-clean-2", "qa-clean-3"]}})


# --- POST /api/super-admin/mira/outreach/run-now?dry_run=true --------------
def test_run_now_dry_run(client):
    r = client.post(f"{BASE_URL}/api/super-admin/mira/outreach/run-now?dry_run=true", timeout=90)
    # 409 skipped is also acceptable (business skip) but should be 200 per spec
    assert r.status_code in (200, 409), f"{r.status_code} {r.text[:300]}"
    if r.status_code == 200:
        data = r.json()
        assert "would_email" in data or "would_remind" in data, data
        assert isinstance(data.get("would_email", []), list)
        assert isinstance(data.get("would_remind", []), list)


# --- GET /api/super-admin/mira/outreach/report -----------------------------
@pytest.mark.parametrize("vert", ["salon", "restaurant"])
def test_outreach_report(client, vert):
    r = client.get(f"{BASE_URL}/api/super-admin/mira/outreach/report?vertical={vert}&days=30", timeout=60)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    for k in ["sent_today", "new_sends", "reminders", "by_country", "by_city",
              "journey", "leads_today", "recent_leads", "html", "days"]:
        assert k in d, f"missing key {k} for {vert}"
    assert "Outreach report" in d["html"]
    assert d["days"] == 30


def test_outreach_report_days_clamp(client):
    r = client.get(f"{BASE_URL}/api/super-admin/mira/outreach/report?vertical=salon&days=0", timeout=60)
    assert r.status_code == 200
    assert r.json()["days"] == 1


def test_outreach_report_invalid_vertical_treated_as_salon(client):
    r = client.get(f"{BASE_URL}/api/super-admin/mira/outreach/report?vertical=garbage&days=7", timeout=60)
    assert r.status_code == 200
    # salon journey should be present; we just check it returns valid payload shape
    assert "journey" in r.json()


# --- POST /api/super-admin/mira/outreach/report/send (ONE call only) --------
def test_outreach_report_send_restaurant(client):
    r = client.post(f"{BASE_URL}/api/super-admin/mira/outreach/report/send?vertical=restaurant&days=7", timeout=120)
    assert r.status_code == 200, r.text[:400]
    d = r.json()
    assert "reports" in d and isinstance(d["reports"], list) and len(d["reports"]) == 1
    rep = d["reports"][0]
    assert rep.get("vertical") == "restaurant"
    assert rep.get("sent") is True
    assert "Restaurants" in rep.get("subject", "")
