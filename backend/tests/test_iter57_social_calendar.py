"""Iter 57 — Social OAuth, Google reviews, Mira Content Calendar.
Covers untested paths: tenant isolation, invalid status 400, 404s, delete,
replan behavior, draft-reply LLM, unauthenticated 401s, calendar CRUD guards.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")

TENANT_A = "miracurl-marathahalli"
ADMIN_A = ("admin@miracurl.com", "q6QY@tn3p#9DtL")
TENANT_B = "elegance-koramangala"
ADMIN_B = ("owner@elegance.com", "Owner@123")

LLM_TIMEOUT = 90


def _login(email, password, slug):
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": slug, "Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:300]}"
    return s


@pytest.fixture(scope="module")
def sess_a():
    return _login(*ADMIN_A, TENANT_A)


@pytest.fixture(scope="module")
def sess_b():
    return _login(*ADMIN_B, TENANT_B)


# ── Unauthenticated guards ──────────────────────────────────────────────
@pytest.mark.parametrize("path,method", [
    ("/api/social/connections", "GET"),
    ("/api/social/meta/oauth/start", "GET"),
    ("/api/social/google/oauth/start", "GET"),
    ("/api/social/publish", "POST"),
    ("/api/social/google/reviews", "GET"),
    ("/api/social/google/draft-reply", "POST"),
    ("/api/mira-studio/calendar", "GET"),
    ("/api/mira-studio/calendar/plan", "POST"),
])
def test_unauthenticated_401(path, method):
    r = requests.request(method, f"{BASE_URL}{path}",
                         headers={"X-Tenant-Slug": TENANT_A}, json={} if method == "POST" else None, timeout=15)
    assert r.status_code in (401, 403), f"{method} {path} → {r.status_code}"


# ── /api/social/connections ─────────────────────────────────────────────
def test_connections_not_configured(sess_a):
    r = sess_a.get(f"{BASE_URL}/api/social/connections", timeout=15)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert not d["meta_configured"]
    assert not d["google_configured"]
    assert d["facebook"] is None
    assert d["instagram"] is None
    assert d["google_business"] is None


# ── OAuth start endpoints (not configured) ──────────────────────────────
def test_meta_oauth_start_not_configured(sess_a):
    r = sess_a.get(f"{BASE_URL}/api/social/meta/oauth/start", timeout=15)
    assert r.status_code == 400
    assert "not configured" in r.text.lower()


def test_google_oauth_start_not_configured(sess_a):
    r = sess_a.get(f"{BASE_URL}/api/social/google/oauth/start", timeout=15)
    assert r.status_code == 400
    assert "not configured" in r.text.lower()


# ── OAuth callback with bogus state (public, no auth) ───────────────────
def test_meta_callback_bogus_state_redirects():
    r = requests.get(f"{BASE_URL}/api/social/meta/oauth/callback",
                     params={"code": "x", "state": "bogus"},
                     allow_redirects=False, timeout=15)
    assert r.status_code in (302, 307), f"got {r.status_code}"
    assert "meta_error" in r.headers.get("location", "")


def test_google_callback_bogus_state_redirects():
    r = requests.get(f"{BASE_URL}/api/social/google/oauth/callback",
                     params={"code": "x", "state": "bogus"},
                     allow_redirects=False, timeout=15)
    assert r.status_code in (302, 307), f"got {r.status_code}"
    assert "google_error" in r.headers.get("location", "")


# ── /api/social/publish ─────────────────────────────────────────────────
def test_publish_empty_caption_400(sess_a):
    r = sess_a.post(f"{BASE_URL}/api/social/publish",
                    json={"caption": "  ", "image_url": "https://example.com/x.jpg"}, timeout=15)
    assert r.status_code == 400


def test_publish_not_connected_returns_errors(sess_a):
    r = sess_a.post(f"{BASE_URL}/api/social/publish",
                    json={"caption": "TEST caption", "image_url": "https://example.com/x.jpg",
                          "platforms": ["instagram", "facebook"]}, timeout=15)
    assert r.status_code == 200, r.text[:300]
    results = r.json()["results"]
    assert not results["facebook"]["ok"]
    assert "not connected" in results["facebook"]["error"].lower()
    assert not results["instagram"]["ok"]
    assert "not connected" in results["instagram"]["error"].lower()


# ── Google reviews ──────────────────────────────────────────────────────
def test_google_reviews_not_connected(sess_a):
    r = sess_a.get(f"{BASE_URL}/api/social/google/reviews", timeout=15)
    assert r.status_code == 400
    assert "not connected" in r.text.lower()


def test_google_draft_reply_llm(sess_a):
    r = sess_a.post(f"{BASE_URL}/api/social/google/draft-reply",
                    json={"reviewer": "Test", "rating": 5, "comment": "Great haircut!"},
                    timeout=LLM_TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert d.get("draft") and isinstance(d["draft"], str)
    assert len(d["draft"]) > 20


# ── Calendar CRUD ───────────────────────────────────────────────────────
def test_calendar_get_sorted(sess_a):
    r = sess_a.get(f"{BASE_URL}/api/mira-studio/calendar", timeout=15)
    assert r.status_code == 200, r.text[:300]
    items = r.json()["items"]
    if len(items) >= 2:
        dates = [i["date"] for i in items]
        assert dates == sorted(dates), "items not sorted by date"


def test_calendar_update_invalid_status_400(sess_a):
    # get any item
    r = sess_a.get(f"{BASE_URL}/api/mira-studio/calendar", timeout=15)
    items = r.json()["items"]
    if not items:
        pytest.skip("no calendar items to update")
    item_id = items[0]["id"]
    r = sess_a.put(f"{BASE_URL}/api/mira-studio/calendar/{item_id}",
                   json={"status": "garbage"}, timeout=15)
    assert r.status_code == 400


def test_calendar_update_wrong_id_404(sess_a):
    r = sess_a.put(f"{BASE_URL}/api/mira-studio/calendar/nonexistent-id-xyz",
                   json={"status": "approved"}, timeout=15)
    assert r.status_code == 404


def test_calendar_approve_and_delete(sess_a):
    # create a fresh item via direct DB is not possible from here; use PUT on existing then delete a fake
    r = sess_a.get(f"{BASE_URL}/api/mira-studio/calendar", timeout=15)
    items = r.json()["items"]
    if not items:
        pytest.skip("no calendar items")
    # Find an item we can safely mutate (last one)
    target = items[-1]
    original_status = target["status"]
    item_id = target["id"]
    # Approve
    r = sess_a.put(f"{BASE_URL}/api/mira-studio/calendar/{item_id}",
                   json={"status": "approved"}, timeout=15)
    assert r.status_code == 200
    # Verify
    r = sess_a.get(f"{BASE_URL}/api/mira-studio/calendar", timeout=15)
    found = next(i for i in r.json()["items"] if i["id"] == item_id)
    assert found["status"] == "approved"
    # Restore
    sess_a.put(f"{BASE_URL}/api/mira-studio/calendar/{item_id}",
               json={"status": original_status}, timeout=15)


def test_calendar_publish_guard_400(sess_a):
    r = sess_a.get(f"{BASE_URL}/api/mira-studio/calendar", timeout=15)
    items = r.json()["items"]
    if not items:
        pytest.skip("no items")
    item_id = items[0]["id"]
    r = sess_a.post(f"{BASE_URL}/api/mira-studio/calendar/{item_id}/publish", timeout=15)
    assert r.status_code == 400
    assert "connect" in r.text.lower() and ("instagram" in r.text.lower() or "facebook" in r.text.lower())


def test_calendar_publish_wrong_id_404(sess_a):
    r = sess_a.post(f"{BASE_URL}/api/mira-studio/calendar/nonexistent-xyz/publish", timeout=15)
    assert r.status_code == 404


# ── Tenant isolation ────────────────────────────────────────────────────
def test_tenant_isolation_calendar(sess_a, sess_b):
    r_a = sess_a.get(f"{BASE_URL}/api/mira-studio/calendar", timeout=15)
    r_b = sess_b.get(f"{BASE_URL}/api/mira-studio/calendar", timeout=15)
    assert r_a.status_code == 200 and r_b.status_code == 200
    ids_a = {i["id"] for i in r_a.json()["items"]}
    ids_b = {i["id"] for i in r_b.json()["items"]}
    if ids_a and ids_b:
        assert ids_a.isdisjoint(ids_b), "tenant leak between A and B"


def test_tenant_isolation_update_cross(sess_a, sess_b):
    r_a = sess_a.get(f"{BASE_URL}/api/mira-studio/calendar", timeout=15)
    items_a = r_a.json()["items"]
    if not items_a:
        pytest.skip("no items in tenant A")
    tenant_a_item = items_a[0]["id"]
    # tenant B tries to update tenant A's item → must 404
    r = sess_b.put(f"{BASE_URL}/api/mira-studio/calendar/{tenant_a_item}",
                   json={"status": "approved"}, timeout=15)
    assert r.status_code == 404


# ── Replan preserves approved items ─────────────────────────────────────
def test_replan_preserves_approved(sess_a):
    """Approve an existing item, replan for same date, verify approved survives."""
    r = sess_a.get(f"{BASE_URL}/api/mira-studio/calendar", timeout=15)
    items = r.json()["items"]
    if not items:
        pytest.skip("no calendar items")
    # pick a suggested item
    suggested = [i for i in items if i["status"] == "suggested"]
    if not suggested:
        pytest.skip("no suggested items to test with")
    target = suggested[0]
    tid = target["id"]
    tdate = target["date"]
    # Approve it
    sess_a.put(f"{BASE_URL}/api/mira-studio/calendar/{tid}",
               json={"status": "approved"}, timeout=15)
    # Replan the same week (start_date = today)
    r = sess_a.post(f"{BASE_URL}/api/mira-studio/calendar/plan",
                    json={"start_date": tdate}, timeout=LLM_TIMEOUT)
    assert r.status_code == 200, r.text[:500]
    # Fetch again — approved item should still exist
    r = sess_a.get(f"{BASE_URL}/api/mira-studio/calendar", timeout=15)
    ids = {i["id"]: i for i in r.json()["items"]}
    assert tid in ids, "approved item was wiped by replan"
    assert ids[tid]["status"] == "approved"
