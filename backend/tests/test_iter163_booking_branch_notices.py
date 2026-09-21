"""Iteration 163 — public booking branch_id, /notifications/new-bookings branch filter,
tenant_notices color_pick suppression + tenant scoping, /api/whats-new build."""
import os
from datetime import datetime, timezone, timedelta

import pytest
import requests
import pymongo
from dotenv import load_dotenv
import os as _os
import sys as _sys

_sys.path.insert(0, _os.path.dirname(__file__))
from _creds import password_for  # noqa: E402

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
TENANT = "miracurl-marathahalli"
OTHER_TENANT = "miracurl-whitefield"
BRANCH_ID = "30adde6f-2a21-402a-a72e-0ffd076330c8"
BRANCH_NAME = "Miracurl Unisex Family Salon- AECS"
SERVICE_ID = "9107746c-d322-4f78-9964-c3a499471dcf"  # Saree Draping ₹500 30min
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD")
TEST_PHONE = "9111100001"
TEST_NAME = "QA Flow Test"

_mongo = pymongo.MongoClient("mongodb://localhost:27017")["miracurl_db"]


def _scheduled_at():
    # tomorrow 15:00 local -> ISO with Z
    d = datetime.now(timezone.utc) + timedelta(days=2)
    d = d.replace(hour=9, minute=30, second=0, microsecond=0)  # 15:00 IST
    return d.isoformat().replace("+00:00", "Z")


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
               headers={"X-Tenant-Slug": TENANT})
    assert r.status_code == 200, r.text
    s.headers.update({"X-Tenant-Slug": TENANT})
    return s


@pytest.fixture(scope="module")
def cleanup():
    yield
    # Cleanup all test bookings/customer
    _mongo.appointments.delete_many({"customer_name": TEST_NAME})
    _mongo.customers.delete_many({"phone": TEST_PHONE})


def _book(branch_id=None, scheduled_at=None, notes="iter163-test"):
    body = {
        "customer_name": TEST_NAME,
        "customer_phone": TEST_PHONE,
        "service_ids": [SERVICE_ID],
        "scheduled_at": scheduled_at or _scheduled_at(),
        "notes": notes,
    }
    if branch_id is not None:
        body["branch_id"] = branch_id
    r = requests.post(f"{BASE_URL}/api/public/book/{TENANT}", json=body, timeout=30)
    return r


# -------- Public booking branch_id resolution --------
class TestPublicBookingBranch:
    def test_book_with_valid_branch_id(self, cleanup):
        # slightly stagger times so slot capacity doesn't clash
        r = _book(branch_id=BRANCH_ID,
                  scheduled_at=(datetime.now(timezone.utc) + timedelta(days=2, hours=1)).isoformat().replace("+00:00", "Z"))
        assert r.status_code == 200, r.text
        appt = r.json()["appointment"]
        assert appt["branch_id"] == BRANCH_ID
        assert appt["branch_name"] == BRANCH_NAME
        # persisted
        doc = _mongo.appointments.find_one({"id": appt["id"]}, {"_id": 0, "branch_id": 1, "branch_name": 1})
        assert doc["branch_id"] == BRANCH_ID and doc["branch_name"] == BRANCH_NAME

    def test_book_with_main_sentinel(self, cleanup):
        r = _book(branch_id="main",
                  scheduled_at=(datetime.now(timezone.utc) + timedelta(days=2, hours=2)).isoformat().replace("+00:00", "Z"))
        assert r.status_code == 200, r.text
        appt = r.json()["appointment"]
        assert appt.get("branch_id") is None
        assert appt.get("branch_name") == "__main__"

    def test_book_without_branch(self, cleanup):
        r = _book(branch_id=None,
                  scheduled_at=(datetime.now(timezone.utc) + timedelta(days=2, hours=3)).isoformat().replace("+00:00", "Z"))
        assert r.status_code == 200, r.text
        appt = r.json()["appointment"]
        assert "branch_id" not in appt or appt.get("branch_id") in (None,)
        assert "branch_name" not in appt or appt.get("branch_name") in (None,)


# -------- /notifications/new-bookings branch filter --------
class TestNewBookingsBranchFilter:
    def test_branch_filters(self, admin_session):
        since = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()

        r_all = admin_session.get(f"{BASE_URL}/api/notifications/new-bookings", params={"since": since, "branch": ""})
        assert r_all.status_code == 200, r_all.text
        all_names = [b.get("branch_name") for b in r_all.json()["bookings"]]

        r_main = admin_session.get(f"{BASE_URL}/api/notifications/new-bookings", params={"since": since, "branch": "__main__"})
        assert r_main.status_code == 200
        for b in r_main.json()["bookings"]:
            assert b.get("branch_name") in (None, "__main__")

        r_aecs = admin_session.get(f"{BASE_URL}/api/notifications/new-bookings", params={"since": since, "branch": BRANCH_NAME})
        assert r_aecs.status_code == 200
        for b in r_aecs.json()["bookings"]:
            assert b.get("branch_name") == BRANCH_NAME

        # ensure the branch bookings actually appeared in the "all" list
        assert BRANCH_NAME in all_names, f"expected AECS-branch booking in feed, got {all_names}"


# -------- color_pick notice suppression + tenant scoping --------
class TestNoticesFiltering:
    def test_color_pick_hidden_and_tenant_scoped(self, admin_session):
        tid_market = _mongo.tenants.find_one({"slug": TENANT}, {"id": 1})["id"]
        tid_white = _mongo.tenants.find_one({"slug": OTHER_TENANT}, {"id": 1})["id"]
        assert tid_white and tid_white != tid_market

        now = datetime.now(timezone.utc).isoformat()
        cp_doc = {"id": "TEST_iter163_cp", "tenant_id": tid_market, "kind": "color_pick",
                  "title": "TEST cp", "sub": "", "created_at": now, "dismissed_by": []}
        wf_doc = {"id": "TEST_iter163_wf", "tenant_id": tid_white, "kind": "info",
                  "title": "TEST WF cross-tenant", "sub": "", "created_at": now, "dismissed_by": []}
        _mongo.tenant_notices.insert_one(cp_doc)
        _mongo.tenant_notices.insert_one(wf_doc)
        try:
            since = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
            r = admin_session.get(f"{BASE_URL}/api/notifications/new-bookings", params={"since": since})
            assert r.status_code == 200
            notice_ids = [n.get("id") for n in r.json().get("notices", [])]
            assert "TEST_iter163_cp" not in notice_ids, "color_pick notice must be hidden"
            assert "TEST_iter163_wf" not in notice_ids, "notice from another tenant must not leak"
        finally:
            _mongo.tenant_notices.delete_many({"id": {"$in": ["TEST_iter163_cp", "TEST_iter163_wf"]}})


# -------- /api/whats-new --------
class TestWhatsNew:
    def test_build_and_highlight(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/whats-new")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("build") == "2026-09-16.265", d
        joined = " ".join(str(h) for h in d.get("highlights", [])).lower()
        assert "daily briefing" in joined or "briefing" in joined, joined
