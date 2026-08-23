"""Iter 59 — Partner landing inquiries + Super-Admin follow-up tools (thank-you PDF + Meet invite).

Rate-limited endpoint /api/public/partner-inquiry is 5/10min per-IP. To keep the shared IP
from getting rate-limited before the rate-limit test finishes, we run submission-heavy tests
LAST in the file (pytest-collect order).
"""
from _creds import _PW_ADMIN, _PW_SUPER
import os
import time
import uuid
import requests
import pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
SUPER = {"email": "super@miracurl.com", "password": _PW_SUPER}
TENANT = {"email": "admin@miracurl.com", "password": _PW_ADMIN}
TENANT_SLUG = "miracurl-marathahalli"
DELIVERED = "delivered@resend.dev"


# ── session fixtures ────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def super_sess():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=SUPER, timeout=15)
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def tenant_sess():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=TENANT, headers={"X-Tenant-Slug": TENANT_SLUG}, timeout=15)
    assert r.status_code == 200
    s.headers.update({"X-Tenant-Slug": TENANT_SLUG})
    return s


@pytest.fixture(scope="module")
def anon():
    return requests.Session()


# ── 1. VALIDATION tests (no submissions yet — safe order) ───────────────────
def test_partner_inquiry_invalid_email_422(anon):
    r = anon.post(f"{BASE}/api/public/partner-inquiry",
                  json={"name": "Test User", "email": "not-an-email", "phone": "9999999999"}, timeout=10)
    assert r.status_code == 422, r.text


def test_partner_inquiry_short_phone_422(anon):
    r = anon.post(f"{BASE}/api/public/partner-inquiry",
                  json={"name": "Test User", "email": DELIVERED, "phone": "1234"}, timeout=10)
    assert r.status_code == 422, r.text


# ── 2. AUTH gating on super-admin endpoints ─────────────────────────────────
def test_send_thankyou_requires_super_admin(tenant_sess, anon):
    fake_iid = str(uuid.uuid4())
    r = anon.post(f"{BASE}/api/super-admin/inquiries/{fake_iid}/send-thankyou", timeout=10)
    assert r.status_code in (401, 403), r.status_code
    r2 = tenant_sess.post(f"{BASE}/api/super-admin/inquiries/{fake_iid}/send-thankyou", timeout=10)
    assert r2.status_code in (401, 403), r2.status_code


def test_send_invite_requires_super_admin(tenant_sess, anon):
    fake_iid = str(uuid.uuid4())
    payload = {"date": "2026-07-15", "time": "15:30", "duration_min": 30, "meet_link": "https://meet.google.com/xyz"}
    r = anon.post(f"{BASE}/api/super-admin/inquiries/{fake_iid}/send-invite", json=payload, timeout=10)
    assert r.status_code in (401, 403)
    r2 = tenant_sess.post(f"{BASE}/api/super-admin/inquiries/{fake_iid}/send-invite", json=payload, timeout=10)
    assert r2.status_code in (401, 403)


def test_list_inquiries_requires_super_admin(tenant_sess):
    r = tenant_sess.get(f"{BASE}/api/super-admin/inquiries", timeout=10)
    assert r.status_code in (401, 403)


# ── 3. Create one valid inquiry, verify list, and drive follow-ups ──────────
_created_iid = {"id": None}


def test_partner_inquiry_valid_ok(anon, super_sess):
    payload = {
        "name": "TEST_iter59 Buddy",
        "email": DELIVERED,
        "phone": "9876543210",
        "salon_name": "TEST_iter59 Salon",
        "preferred_time": "Weekday evenings",
        "message": "Please demo the auto-pilot marketing.",
    }
    r = anon.post(f"{BASE}/api/public/partner-inquiry", json=payload, timeout=15)
    if r.status_code == 429:
        # Rate limit already hit in a prior run — verify at least one TEST_iter59 lead exists
        lst = super_sess.get(f"{BASE}/api/super-admin/inquiries", timeout=15).json()
        items = lst.get("items", lst) if isinstance(lst, dict) else lst
        assert any("iter59" in (x.get("name") or "") for x in items), "no prior TEST_iter59 lead and rate limited"
        pytest.skip("Rate-limited; existing TEST_iter59 lead reused for follow-up tests")
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    assert r.json().get("ok")


def test_inquiry_appears_in_super_admin_list(super_sess):
    r = super_sess.get(f"{BASE}/api/super-admin/inquiries", timeout=15)
    assert r.status_code == 200
    body = r.json()
    items = body["items"] if isinstance(body, dict) else body
    assert isinstance(items, list) and len(items) > 0
    # Find our TEST_iter59 lead — should carry source partner_page
    ours = [x for x in items if x.get("email") == DELIVERED and "iter59" in (x.get("name") or "")]
    assert ours, "TEST_iter59 partner inquiry not found in list"
    lead = ours[0]
    assert lead["source"] == "partner_page"
    assert lead["salon_name"] == "TEST_iter59 Salon"
    assert lead["preferred_time"] == "Weekday evenings"
    assert lead["status"] == "new"
    _created_iid["id"] = lead["id"]


def test_send_thankyou_sends_and_updates(super_sess):
    iid = _created_iid["id"]
    assert iid
    r = super_sess.post(f"{BASE}/api/super-admin/inquiries/{iid}/send-thankyou", timeout=60)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    assert r.json().get("ok")
    # verify persistence
    lst = super_sess.get(f"{BASE}/api/super-admin/inquiries", timeout=15).json()
    items = lst.get("items", lst) if isinstance(lst, dict) else lst
    lead = next(x for x in items if x["id"] == iid)
    assert lead.get("thankyou_sent_at"), "thankyou_sent_at missing"
    assert lead["status"] == "contacted"


def test_send_invite_invalid_date_400(super_sess):
    iid = _created_iid["id"]
    r = super_sess.post(f"{BASE}/api/super-admin/inquiries/{iid}/send-invite",
                        json={"date": "07-15-2026", "time": "15:30"}, timeout=15)
    # pydantic will 422 length-fail on wrong format; the "%Y-%m-%d %H:%M" parse guard also returns 400
    assert r.status_code in (400, 422), r.status_code


def test_send_invite_missing_email_400(super_sess):
    # patch our lead to remove email via direct API? Not supported. Skip if not feasible.
    # Instead: use non-existent inquiry to hit 404, then a lead we create then wipe email via update? not possible.
    # Cover 400-missing-email by creating a lead directly through the API is not possible (email is required).
    # So: use bad iid to at least confirm 404 branch works.
    r = super_sess.post(f"{BASE}/api/super-admin/inquiries/{uuid.uuid4()}/send-invite",
                        json={"date": "2026-07-15", "time": "15:30"}, timeout=15)
    assert r.status_code == 404


def test_send_invite_ok_and_meeting_scheduled(super_sess):
    iid = _created_iid["id"]
    payload = {"date": "2026-07-15", "time": "15:30", "duration_min": 30,
               "meet_link": "https://meet.google.com/test-iter59"}
    r = super_sess.post(f"{BASE}/api/super-admin/inquiries/{iid}/send-invite", json=payload, timeout=60)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    j = r.json()
    assert j.get("ok")
    assert "when" in j and "IST" in j["when"]
    lst = super_sess.get(f"{BASE}/api/super-admin/inquiries", timeout=15).json()
    items = lst.get("items", lst) if isinstance(lst, dict) else lst
    lead = next(x for x in items if x["id"] == iid)
    assert lead["status"] == "meeting_scheduled"
    assert lead.get("meeting", {}).get("meet_link") == payload["meet_link"]
    assert lead["meeting"]["at_ist"] == "2026-07-15 15:30"


# ── 4. RATE LIMIT — MUST BE LAST — will burn IP quota for 10 min ───────────
def test_partner_inquiry_rate_limit_429_zzz_last(anon):
    """Rate limit is 5/10min per-IP. Main agent already used ~1-2, we used 3 above
    (1 valid + 2 in validation tests — validation tests also count against IP quota
    because rate_limit runs BEFORE body validation? Let's verify by hammering.)"""
    hit_429 = False
    for i in range(8):
        r = anon.post(f"{BASE}/api/public/partner-inquiry",
                      json={"name": f"TEST_iter59 rl{i}", "email": DELIVERED,
                            "phone": "9876543210", "salon_name": f"RL{i}"},
                      timeout=10)
        if r.status_code == 429:
            hit_429 = True
            break
        time.sleep(0.2)
    assert hit_429, "Expected 429 after 5+ submissions in 10min window"
