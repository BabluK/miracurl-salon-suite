"""Iteration 158 — Owner 'Ask Miracurl to fix this' tickets + HQ go-live checklist gate."""
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests
import sys as _sys; _sys.path.insert(0, __import__("os").path.dirname(__file__))
from _creds import password_for  # noqa: E402

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")

TENANT_EMAIL = "admin@miracurl.com"
TENANT_PW = password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD")
TENANT_SLUG = "miracurl-marathahalli"
SUPER_EMAIL = "super@miracurl.com"
SUPER_PW = "og9T@41Es#OQb6"
MANAGER_EMAIL = "manager@miracurl.com"
MANAGER_PW = "Manager@1234"


def _login(email, pw, slug=None):
    s = requests.Session()
    h = {"Content-Type": "application/json"}
    if slug:
        h["X-Tenant-Slug"] = slug
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw}, headers=h)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text[:200]}"
    s.headers.update({"X-CSRF-Token": s.cookies.get("csrf_token") or ""})
    if slug:
        s.headers.update({"X-Tenant-Slug": slug})
    return s


def _notices(sess, since_hours=1):
    since = (datetime.now(timezone.utc) - timedelta(hours=since_hours)).isoformat()
    n = sess.get(f"{BASE}/api/notifications/new-bookings", params={"since": since})
    assert n.status_code == 200, n.text
    j = n.json()
    return j if isinstance(j, list) else (j.get("notices") or j.get("items") or j.get("notifications") or [])


@pytest.fixture(scope="module")
def hq():
    return _login(SUPER_EMAIL, SUPER_PW)


@pytest.fixture(scope="module")
def owner():
    return _login(TENANT_EMAIL, TENANT_PW, TENANT_SLUG)


@pytest.fixture(scope="module")
def mira_tid(hq):
    r = hq.get(f"{BASE}/api/super-admin/tenants")
    body = r.json()
    rows = body if isinstance(body, list) else body.get("tenants") or body.get("rows") or body.get("items") or []
    tid = next((t["id"] for t in rows if t.get("slug") == TENANT_SLUG), None)
    assert tid
    return tid


# ---------------- 1. Owner fix requests ----------------
class TestFixRequest:
    def test_create_lists_and_notifies(self, owner):
        payload = {"issue": "QA: haircut price wrong", "page": "/services", "page_title": "Services"}
        r = owner.post(f"{BASE}/api/support/fix-request", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        assert d.get("ticket_no")
        assert d.get("id")
        pytest.fix_ticket = d["ticket_no"]
        pytest.fix_id = d["id"]

        # GET listing
        r = owner.get(f"{BASE}/api/support/fix-requests")
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        m = next((x for x in items if x.get("ticket_no") == d["ticket_no"]), None)
        assert m is not None, f"created ticket not in listing; items={items[:3]}"
        assert m.get("status") == "open"
        assert m.get("page") == "/services"

        # notice fix_request in owner bell
        notes = _notices(owner)
        assert any(n.get("kind") == "fix_request" for n in notes), f"no fix_request notice; sample: {notes[:3]}"

    def test_short_issue_422(self, owner):
        r = owner.post(f"{BASE}/api/support/fix-request",
                       json={"issue": "hi", "page": "/services", "page_title": "Services"})
        assert r.status_code == 422, r.text


# ---------------- 2. Super Admin HQ Inbox + resolve → fix_done ----------------
class TestHqInbox:
    def test_hq_sees_fix_request_and_resolve(self, hq, owner):
        r = hq.get(f"{BASE}/api/super-admin/hq-messages")
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        # find the newly created fix_request for our tenant
        m = next((x for x in items if x.get("kind") == "fix_request"
                  and x.get("tenant_slug") == TENANT_SLUG
                  and x.get("ticket_no") == getattr(pytest, "fix_ticket", None)), None)
        assert m is not None, f"fix_request not found in HQ inbox; sample: {[x for x in items if x.get('kind')=='fix_request'][:2]}"
        assert m.get("page") == "/services"
        mid = m["id"]

        # PATCH note
        rn = hq.patch(f"{BASE}/api/super-admin/hq-messages/{mid}/note", json={"note": "done"})
        assert rn.status_code == 200, rn.text

        # PATCH resolved
        rr = hq.patch(f"{BASE}/api/super-admin/hq-messages/{mid}/status", json={"status": "resolved"})
        assert rr.status_code == 200, rr.text
        assert rr.json().get("status") == "resolved"

        time.sleep(1)
        # owner sees resolved
        lr = owner.get(f"{BASE}/api/support/fix-requests")
        assert lr.status_code == 200
        row = next((x for x in lr.json()["items"] if x.get("id") == mid), None)
        assert row is not None
        assert row.get("status") == "resolved"

        # owner bell has fix_done
        notes = _notices(owner)
        assert any(n.get("kind") == "fix_done" for n in notes), f"no fix_done notice; sample: {notes[:3]}"


# ---------------- 3. Go-live checklist gate ----------------
class TestChecklistGate:
    def test_pause_gate_checklist_then_go_live(self, hq, mira_tid):
        # pause first to be able to go_live
        r = hq.put(f"{BASE}/api/super-admin/rewards-campaign/onboarding/{mira_tid}", json={"action": "pause"})
        assert r.status_code == 200, r.text
        assert r.json()["onboarding"]["live"] is False

        # Reset checklist to empty by explicitly setting all False first
        r = hq.put(f"{BASE}/api/super-admin/rewards-campaign/onboarding/{mira_tid}",
                   json={"action": "checklist", "checklist": {"poster_printed": False, "qr_placed": False, "staff_briefed": False}})
        assert r.status_code == 200, r.text

        # go_live now should 400 with checklist message
        r = hq.put(f"{BASE}/api/super-admin/rewards-campaign/onboarding/{mira_tid}", json={"action": "go_live"})
        assert r.status_code == 400, r.text
        assert "checklist" in r.text.lower(), r.text

        # tick all three
        r = hq.put(f"{BASE}/api/super-admin/rewards-campaign/onboarding/{mira_tid}",
                   json={"action": "checklist", "checklist": {"poster_printed": True, "qr_placed": True, "staff_briefed": True}})
        assert r.status_code == 200, r.text
        cl = r.json()["onboarding"].get("checklist") or {}
        assert cl.get("poster_printed") is True
        assert cl.get("qr_placed") is True
        assert cl.get("staff_briefed") is True

        # go_live now succeeds
        r = hq.put(f"{BASE}/api/super-admin/rewards-campaign/onboarding/{mira_tid}", json={"action": "go_live"})
        assert r.status_code == 200, r.text
        assert r.json()["onboarding"]["live"] is True

    def test_features_include_checklist_items(self, hq, mira_tid):
        r = hq.get(f"{BASE}/api/super-admin/tenants/{mira_tid}/features")
        assert r.status_code == 200, r.text
        ob = r.json()["onboarding"]
        assert "checklist" in ob
        items = ob.get("checklist_items") or []
        assert len(items) == 3, f"expected 3 checklist_items, got {items}"
        keys = {i["key"] for i in items}
        assert keys == {"poster_printed", "qr_placed", "staff_briefed"}
        assert isinstance(ob.get("entries"), int)
        assert ob.get("live") is True  # final state
