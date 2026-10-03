"""Iter 213: competitor-watch history endpoint + signup preview regression (backend-side)."""
import os
import pytest
import requests
from _creds import pw

def _base():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        # fall back to frontend/.env
        try:
            for line in open("/app/frontend/.env"):
                if line.startswith("REACT_APP_BACKEND_URL="):
                    v = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
        except OSError:
            pass
    assert v, "REACT_APP_BACKEND_URL missing"
    return v.rstrip("/")


BASE = _base()


@pytest.fixture(scope="module")
def super_session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": "admin@miracurl-suite.com", "password": pw("SUPER_ADMIN")},
               timeout=20)
    assert r.status_code == 200, r.text
    csrf = s.cookies.get("csrf_token")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf, "Origin": BASE})
    return s


# --- auth-gate ---
def test_history_requires_auth():
    r = requests.get(f"{BASE}/api/super-admin/competitor-watch/history", timeout=20)
    assert r.status_code in (401, 403), r.status_code


# --- history shape ---
def test_history_shape(super_session):
    r = super_session.get(f"{BASE}/api/super-admin/competitor-watch/history", timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert set(["rows", "series", "months"]).issubset(j.keys())
    assert isinstance(j["rows"], list)
    assert isinstance(j["series"], list)
    assert len(j["series"]) == 8, f"expected 8 series entries (6 rivals + 2 ours), got {len(j['series'])}"
    keys = {s["key"] for s in j["series"]}
    assert "Miracurl (salon)" in keys and "Miracurl (restaurant)" in keys
    assert {"Fresha", "Vagaro", "Square for Restaurants", "Toast POS"}.issubset(keys)
    # each series has segment + ours flag
    for s in j["series"]:
        assert s["segment"] in ("salon", "restaurant")
        assert isinstance(s["ours"], bool)
    assert j["months"] == len(j["rows"])


# --- run then history ---
def test_run_then_history_monthly_upsert(super_session):
    r1 = super_session.post(f"{BASE}/api/super-admin/competitor-watch/run", timeout=90)
    assert r1.status_code == 200, r1.text
    run_doc = r1.json()
    assert run_doc.get("ran_at")
    cur_month = run_doc["ran_at"][:7]

    h1 = super_session.get(f"{BASE}/api/super-admin/competitor-watch/history", timeout=30).json()
    assert h1["months"] >= 1
    row = next((r for r in h1["rows"] if r["month"] == cur_month), None)
    assert row is not None, f"current month row {cur_month} missing in history"

    # row values should match run doc's rows' lowest_monthly for each competitor name
    for rr in run_doc.get("rows", []):
        name = rr["name"]
        expected = rr.get("lowest_monthly") or rr.get("benchmark")
        if expected is None:
            continue
        # some rows may omit a competitor; only check present names
        if name in row:
            assert abs(float(row[name]) - float(expected)) < 0.01, f"{name}: row={row[name]} vs run={expected}"

    # re-run same month shouldn't increase month count (upsert per month)
    before = h1["months"]
    r2 = super_session.post(f"{BASE}/api/super-admin/competitor-watch/run", timeout=90)
    assert r2.status_code == 200
    h2 = super_session.get(f"{BASE}/api/super-admin/competitor-watch/history", timeout=30).json()
    assert h2["months"] == before, f"re-run inflated months: {before} -> {h2['months']}"
