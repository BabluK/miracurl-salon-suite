"""Iteration 221 — Google Places added as first discovery source for Mira Lead Agent."""
import os
import pytest
import requests
from pymongo import MongoClient

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@miracurl-suite.com"
ADMIN_PASSWORD = "og9T@41Es#OQb6"


def _strip(v: str) -> str:
    return (v or "").strip().strip('"').strip("'")


def _mongo():
    with open("/app/backend/.env") as f:
        env = dict(l.strip().split("=", 1) for l in f if "=" in l and not l.strip().startswith("#"))
    client = MongoClient(_strip(env["MONGO_URL"]))
    return client[_strip(env["DB_NAME"])], client


@pytest.fixture(scope="module")
def super_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    csrf = s.cookies.get("csrf_token")
    assert csrf, "no csrf cookie"
    s.headers.update({"X-CSRF-Token": csrf})
    return s


@pytest.fixture(scope="module")
def mongo_cleanup():
    db, client = _mongo()
    yield db
    res = db.mira_leads.delete_many({"discovered_by": "mira_discover", "city": "Mysuru"})
    print(f"\n[cleanup] deleted {res.deleted_count} discover leads for Mysuru")
    res2 = db.mira_lead_runs.delete_many({"kind": "discover", "city": "Mysuru"})
    print(f"[cleanup] deleted {res2.deleted_count} discover runs for Mysuru")
    client.close()


class TestGoogleDiscovery:
    def test_sources_google_first(self, super_session):
        r = super_session.get(f"{BASE_URL}/api/super-admin/mira-leads/discover/sources", timeout=15)
        assert r.status_code == 200
        data = r.json()
        sources = data["sources"]
        assert len(sources) == 6, f"expected 6 sources, got {len(sources)}: {sources}"
        ids = [s["id"] for s in sources]
        assert ids[0] == "google", f"google must be first, got order {ids}"
        assert set(ids) == {"google", "instagram", "facebook", "linkedin", "web", "email"}
        google = next(s for s in sources if s["id"] == "google")
        assert "Google" in google["label"]

    def test_discover_google_only(self, super_session, mongo_cleanup):
        payload = {"vertical": "salon", "city": "Mysuru", "sources": ["google"], "limit": 6}
        r = super_session.post(f"{BASE_URL}/api/super-admin/mira-leads/discover", json=payload, timeout=90)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        data = r.json()
        per_source = data.get("per_source", {})
        assert per_source.get("google", 0) > 0, f"google per_source zero: {data}"
        leads = data.get("leads", [])
        assert len(leads) > 0, f"no leads saved: {data}"
        # all saved leads must be from google
        for lead in leads:
            assert lead["source"] == "google", f"non-google source: {lead}"
        # most should have +91 phone
        with_phone = [l for l in leads if (l.get("phone") or "").startswith("+91")]
        assert len(with_phone) >= max(1, len(leads) // 2), f"too few +91 phones: {[l.get('phone') for l in leads]}"
        # score 55 when phone present
        for lead in with_phone:
            assert lead["score"] == 55, f"expected score 55 w/ phone, got {lead['score']} for {lead.get('name')}"
        # rating present on most
        with_rating = [l for l in leads if l.get("rating") is not None]
        assert len(with_rating) >= 1, "no rating on any google lead"
        # run_id present
        run_id = data.get("run_id")
        assert run_id, "no run_id returned"

        # verify run doc in mongo
        db = mongo_cleanup
        run_doc = db.mira_lead_runs.find_one({"id": run_id})
        assert run_doc, f"run doc {run_id} not found"
        assert run_doc["kind"] == "discover"
        assert run_doc["city"] == "Mysuru"
