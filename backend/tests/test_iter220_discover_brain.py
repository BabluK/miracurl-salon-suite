"""Iteration 220 — multi-source lead discovery, Mira brain memory, and HQ ask integration."""
import os
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
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
    # cleanup Pune mira_discover leads + their run docs
    res = db.mira_leads.delete_many({"discovered_by": "mira_discover", "city": "Pune"})
    print(f"\n[cleanup] deleted {res.deleted_count} discover leads for Pune")
    res2 = db.mira_lead_runs.delete_many({"kind": "discover", "city": "Pune"})
    print(f"[cleanup] deleted {res2.deleted_count} discover runs for Pune")
    client.close()


# --- Discover sources & POST discover ---
class TestDiscovery:
    def test_sources_unauth(self):
        r = requests.get(f"{BASE_URL}/api/super-admin/mira-leads/discover/sources", timeout=15)
        assert r.status_code in (401, 403)

    def test_sources_ok(self, super_session):
        r = super_session.get(f"{BASE_URL}/api/super-admin/mira-leads/discover/sources", timeout=15)
        assert r.status_code == 200
        data = r.json()
        ids = {s["id"] for s in data["sources"]}
        assert ids == {"instagram", "facebook", "linkedin", "web", "email"}, ids

    def test_discover_unauth(self):
        r = requests.post(f"{BASE_URL}/api/super-admin/mira-leads/discover",
                          json={"vertical": "salon", "city": "Pune", "sources": ["facebook"], "limit": 5}, timeout=15)
        assert r.status_code in (401, 403)

    def test_discover_validation_short_city(self, super_session):
        r = super_session.post(f"{BASE_URL}/api/super-admin/mira-leads/discover",
                               json={"vertical": "salon", "city": "P", "sources": ["facebook"], "limit": 5}, timeout=15)
        assert r.status_code == 422

    def test_discover_run_and_dedupe(self, super_session, mongo_cleanup):
        payload = {"vertical": "salon", "city": "Pune", "sources": ["facebook"], "limit": 5}
        t0 = time.time()
        r = super_session.post(f"{BASE_URL}/api/super-admin/mira-leads/discover", json=payload, timeout=120)
        print(f"\n[discover1] {r.status_code} in {time.time()-t0:.1f}s")
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert set(d.keys()) >= {"found", "saved", "per_source", "leads"}
        print(f"[discover1] keys={list(d.keys())} found={d['found']} saved={d['saved']} per_source={d['per_source']} note={d.get('note','')[:80]}")
        saved_first = d["saved"]
        db = mongo_cleanup

        if "run_id" in d:
            run_doc = db.mira_lead_runs.find_one({"id": d["run_id"]})
            assert run_doc is not None
            assert run_doc["kind"] == "discover"
            if saved_first > 0:
                lead = db.mira_leads.find_one({"run_id": d["run_id"]})
                assert lead is not None
                assert lead["discovered_by"] == "mira_discover"
                assert lead["source"] == "facebook"
        else:
            # Search engines rate-limited — endpoint correctly returns note and no run_id
            assert d.get("note"), "empty raw hits should include an advisory note"
            pytest.skip("Search engines returned 0 hits (rate limited) — dedupe check skipped")

        # Second run — should save 0 or fewer (dedupe)
        t0 = time.time()
        r2 = super_session.post(f"{BASE_URL}/api/super-admin/mira-leads/discover", json=payload, timeout=120)
        print(f"[discover2] {r2.status_code} in {time.time()-t0:.1f}s")
        assert r2.status_code == 200
        d2 = r2.json()
        print(f"[discover2] found={d2['found']} saved={d2['saved']}")
        assert d2["saved"] <= saved_first, f"dedupe failed: {d2['saved']} > {saved_first}"


# --- HQ Mira ask + memory ---
class TestBrainMemory:
    def test_memory_list_has_auto(self, super_session):
        r = super_session.get(f"{BASE_URL}/api/super-admin/mira/memory", timeout=15)
        assert r.status_code == 200
        rows = r.json() if isinstance(r.json(), list) else r.json().get("memory") or r.json().get("items") or []
        print(f"\n[memory] total rows={len(rows)}")
        auto_rows = [m for m in rows if m.get("source") == "auto"]
        print(f"[memory] auto rows={len(auto_rows)}")
        assert len(auto_rows) >= 1, "no auto-learned memory rows found"
        cats = {m.get("category") for m in auto_rows}
        assert cats & {"discovery", "outcome"}, f"unexpected auto categories: {cats}"

    def test_mira_ask(self, super_session):
        r = super_session.post(f"{BASE_URL}/api/super-admin/mira/ask",
                               json={"question": "In one line, what do you remember about our lead outreach?"}, timeout=90)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        answer = d.get("answer") or d.get("reply") or d.get("text") or ""
        print(f"\n[ask] answer={answer[:200]}")
        assert isinstance(answer, str) and len(answer.strip()) > 10, f"answer too short: {answer!r}"
