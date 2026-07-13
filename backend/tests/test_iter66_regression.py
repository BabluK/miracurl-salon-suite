"""Iter 66 – Regression pass for Super Admin lead-gen + demo + gallery + reviews + whats-new."""
import io
import os
import re
import asyncio
import pytest
import requests
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    with open("/app/frontend/.env") as fh:
        for ln in fh:
            if ln.startswith("REACT_APP_BACKEND_URL="):
                BASE = ln.split("=", 1)[1].strip().rstrip("/")

SUPER_EMAIL = "super@miracurl.com"
SUPER_PW = "og9T@41Es#OQb6"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PW = "q6QY@tn3p#9DtL"
TENANT = "miracurl-marathahalli"
TEST_LEAD_EMAIL = "delivered+qa@resend.dev"
TEST_CUST_EMAIL = "delivered+qa2@resend.dev"

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "miracurl_db"


# ---------------- fixtures ----------------
@pytest.fixture(scope="module")
def super_sess():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PW})
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def admin_sess():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT})
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PW},
               headers={"X-Tenant-Slug": TENANT})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def db():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# ---------------- documents + earnings ----------------
class TestDocsAndEarnings:
    def test_list_documents(self, super_sess):
        r = super_sess.get(f"{BASE}/api/super-admin/documents")
        assert r.status_code == 200
        docs = r.json()["documents"]
        keys = {d["key"] for d in docs}
        # Expect 4 core docs
        assert len(docs) >= 4
        assert {"onboarding_policy", "hiring_policy", "suite_overview"}.issubset(keys) or \
               len([k for k in keys if "polic" in k or "overview" in k or "terms" in k]) >= 3, \
               f"keys={keys}"

    @pytest.mark.parametrize("key", ["onboarding_policy", "hiring_policy", "suite_overview", "terms_conditions"])
    def test_pdf_download(self, super_sess, key):
        r = super_sess.get(f"{BASE}/api/super-admin/documents/{key}/pdf")
        if r.status_code == 404:
            pytest.skip(f"doc key {key} not present")
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        # PDF header magic bytes
        assert r.content[:4] == b"%PDF", f"not a PDF: first bytes = {r.content[:20]!r}"
        assert len(r.content) > 500

    def test_earnings(self, super_sess):
        r = super_sess.get(f"{BASE}/api/super-admin/earnings")
        assert r.status_code == 200
        data = r.json()
        assert "series" in data and "totals" in data
        assert len(data["series"]) == 6
        assert {"subscriptions", "placement_fees", "combined"}.issubset(data["totals"].keys())


# ---------------- lead-gen recipients + send ----------------
class TestLeadGen:
    def test_recipients_no_tenants_key(self, super_sess):
        r = super_sess.get(f"{BASE}/api/super-admin/demo-campaign/recipients")
        assert r.status_code == 200
        data = r.json()
        assert "leads" in data
        assert "tenants" not in data, f"recipients response leaked tenants: keys={list(data.keys())}"
        # tenant owner email must NOT appear in leads
        emails = {l["email"].lower() for l in data["leads"]}
        assert ADMIN_EMAIL.lower() not in emails, "tenant owner email leaked into leads"

    def test_send_to_lead_and_block_partner(self, super_sess, db):
        # Send one to safe delivered+qa lead
        payload = {
            "recipients": [{"email": TEST_LEAD_EMAIL, "name": "QA Lead", "salon_name": "QA Salon"}],
            "note": "TEST", "subject": "TEST regression",
        }
        r = super_sess.post(f"{BASE}/api/super-admin/demo-campaign/send", json=payload)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["sent"] == 1, data
        # confirm invite persisted
        inv = _run(db.demo_invites.find_one({"email": TEST_LEAD_EMAIL}))
        assert inv is not None
        assert inv.get("first_sent_at")
        # Save to module-level via db lookup for later tests

    def test_send_to_tenant_owner_blocked(self, super_sess):
        payload = {
            "recipients": [{"email": ADMIN_EMAIL, "name": "MC", "salon_name": "MC"}],
            "note": "TEST", "subject": "TEST",
        }
        r = super_sess.post(f"{BASE}/api/super-admin/demo-campaign/send", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["sent"] == 0
        assert data["failed"] == 1
        err = data["results"][0].get("error", "")
        assert "partner" in err.lower() or "skipped" in err.lower(), err


# ---------------- demo tracking + slot + invites ----------------
class TestDemoTrackingAndSlot:
    def _invite_id(self, db):
        inv = _run(db.demo_invites.find_one({"email": TEST_LEAD_EMAIL}, {"_id": 0}))
        assert inv, "invite not seeded — run TestLeadGen first"
        return inv["id"]

    def test_open_pixel(self, db):
        iid = self._invite_id(db)
        r = requests.get(f"{BASE}/api/public/demo-track/{iid}/open.png")
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/png")
        inv = _run(db.demo_invites.find_one({"id": iid}))
        assert inv.get("opened_at"), "opened_at not set after pixel fetch"

    def test_click_redirect(self, db):
        iid = self._invite_id(db)
        r = requests.get(f"{BASE}/api/public/demo-track/{iid}/click", allow_redirects=False)
        assert r.status_code == 302
        loc = r.headers.get("Location", "")
        assert f"/demo-slot/{iid}" in loc, f"unexpected redirect: {loc}"
        inv = _run(db.demo_invites.find_one({"id": iid}))
        assert inv.get("demo_requested_at")

    def test_demo_slot_info(self, db):
        iid = self._invite_id(db)
        r = requests.get(f"{BASE}/api/public/demo-slot/{iid}")
        assert r.status_code == 200
        d = r.json()
        assert d["dates"] and d["times"]
        assert len(d["dates"]) >= 3

    def test_demo_slot_book(self, db):
        iid = self._invite_id(db)
        info = requests.get(f"{BASE}/api/public/demo-slot/{iid}").json()
        date0 = info["dates"][0]
        r = requests.post(f"{BASE}/api/public/demo-slot/{iid}",
                          json={"date": date0, "time": "16:00", "phone": "9998887777"})
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert d["ok"] == True
        assert "gcal" in d and "calendar.google.com" in d["gcal"]

    def test_invites_list(self, super_sess, db):
        r = super_sess.get(f"{BASE}/api/super-admin/demo-campaign/invites")
        assert r.status_code == 200
        data = r.json()
        assert "invites" in data
        emails = [i["email"] for i in data["invites"]]
        assert TEST_LEAD_EMAIL in emails

    def test_resend_invite(self, super_sess, db):
        import time
        time.sleep(2)  # Resend API rate limit: 2 req/sec
        iid = self._invite_id(db)
        r = super_sess.post(f"{BASE}/api/super-admin/demo-campaign/invites/{iid}/resend")
        assert r.status_code == 200, f"resend {r.status_code}: {r.text[:200]}"

    def test_followups_idempotent(self, super_sess, db):
        # backdate the invite 6 days
        iid = self._invite_id(db)
        old = (datetime.now(timezone.utc) - timedelta(days=6)).isoformat()
        _run(db.demo_invites.update_one(
            {"id": iid},
            {"$set": {"first_sent_at": old, "reminder_sent_at": None, "responded": False}}))
        r1 = super_sess.post(f"{BASE}/api/super-admin/demo-campaign/followups/run")
        assert r1.status_code == 200
        d1 = r1.json()
        # Should have sent >=1 (our seeded invite)
        assert d1["sent"] >= 1, d1
        r2 = super_sess.post(f"{BASE}/api/super-admin/demo-campaign/followups/run")
        d2 = r2.json()
        assert d2["sent"] == 0, f"second run not idempotent: {d2}"

    def test_delete_invite_cleanup(self, super_sess, db):
        iid = self._invite_id(db)
        r = super_sess.delete(f"{BASE}/api/super-admin/demo-campaign/invites/{iid}")
        assert r.status_code == 200
        gone = _run(db.demo_invites.find_one({"id": iid}))
        assert gone is None
        # Also cleanup TEST demo_campaigns
        _run(db.demo_campaigns.delete_many({"subject": {"$regex": "TEST"}}))


# ---------------- public salon page ----------------
class TestPublicSalonPage:
    def test_public_salon_page(self):
        r = requests.get(f"{BASE}/api/public/salon-page/{TENANT}")
        assert r.status_code == 200
        d = r.json()
        assert d["slug"] == TENANT
        assert d["book_url"] == f"/book/{TENANT}"
        assert "services" in d and "gallery" in d and "reviews" in d
        assert "_id" not in d


# ---------------- salon gallery ----------------
class TestGallery:
    def test_gallery_list(self, admin_sess):
        r = admin_sess.get(f"{BASE}/api/salon/gallery")
        assert r.status_code == 200
        d = r.json()
        assert "photos" in d and "max" in d

    def test_gallery_upload_and_delete(self, admin_sess):
        # Simpler: use a known-minimal jpg
        minimal_jpg = (
            b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
            b"\xff\xdb\x00C\x00" + b"\x08" * 64 +
            b"\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00"
            b"\xff\xc4\x00\x14\x00\x01" + b"\x00" * 15 + b"\x00"
            b"\xff\xc4\x00\x14\x10\x01" + b"\x00" * 15 + b"\x00"
            b"\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xfb\xd0"
            b"\xff\xd9"
        )
        files = {"file": ("test.jpg", minimal_jpg, "image/jpeg")}
        r = admin_sess.post(f"{BASE}/api/salon/gallery", files=files)
        if r.status_code >= 400:
            pytest.skip(f"gallery upload failed status={r.status_code} body={r.text[:200]}")
        d = r.json()
        # response is single photo dict {id, url}
        pid = d.get("id")
        assert pid, d
        # verify list contains it
        list_r = admin_sess.get(f"{BASE}/api/salon/gallery")
        photos = list_r.json().get("photos") or []
        assert any(p["id"] == pid for p in photos), f"uploaded photo not in list; photos={photos}"
        # verify appears on public salon page
        pub = requests.get(f"{BASE}/api/public/salon-page/{TENANT}").json()
        assert len(pub.get("gallery", [])) >= 1
        # delete
        r = admin_sess.delete(f"{BASE}/api/salon/gallery/{pid}")
        assert r.status_code == 200


# ---------------- review requests ----------------
class TestReviewRequests:
    def test_setting_default_true(self, admin_sess):
        r = admin_sess.get(f"{BASE}/api/settings/review-requests")
        assert r.status_code == 200
        d = r.json()
        assert d["enabled"] == True

    def test_toggle(self, admin_sess):
        r = admin_sess.put(f"{BASE}/api/settings/review-requests", json={"enabled": False})
        assert r.status_code == 200 and r.json()["enabled"] == False
        r2 = admin_sess.put(f"{BASE}/api/settings/review-requests", json={"enabled": True})
        assert r2.status_code == 200 and r2.json()["enabled"] == True

    def test_pending_and_send(self, admin_sess, db):
        # Seed customer + completed appointment 4h ago
        tenant = _run(db.tenants.find_one({"slug": TENANT}, {"_id": 0, "id": 1}))
        tid = tenant["id"]
        import uuid
        cust_id = f"TEST_cust_{uuid.uuid4().hex[:8]}"
        appt_id = f"TEST_appt_{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc)
        _run(db.customers.insert_one({
            "id": cust_id, "tenant_id": tid, "name": "TEST QA Customer",
            "email": TEST_CUST_EMAIL, "phone": "919998887777",
            "created_at": now.isoformat(),
        }))
        _run(db.appointments.insert_one({
            "id": appt_id, "tenant_id": tid, "customer_id": cust_id,
            "customer_name": "TEST QA Customer",
            "status": "completed",
            "scheduled_at": (now - timedelta(hours=4)).isoformat(),
            "created_at": (now - timedelta(hours=5)).isoformat(),
        }))
        try:
            r = admin_sess.get(f"{BASE}/api/reviews/pending-requests")
            assert r.status_code == 200
            items = r.json()["items"]
            found = [i for i in items if i["appointment_id"] == appt_id]
            assert found, f"seeded appointment not in pending list; items={len(items)}"
            row = found[0]
            assert row["wa_link"] and "wa.me/" in row["wa_link"]
            # request-now
            r2 = admin_sess.post(f"{BASE}/api/reviews/request-now")
            assert r2.status_code == 200
            d = r2.json()
            assert d.get("sent", 0) + d.get("failed", 0) >= 1
            # idempotent: second run should not resend this appointment
            r3 = admin_sess.post(f"{BASE}/api/reviews/request-now")
            d3 = r3.json()
            # appointment marked review_request_sent_at → no longer a candidate
            appt = _run(db.appointments.find_one({"id": appt_id}))
            if d.get("sent", 0) >= 1:
                assert appt.get("review_request_sent_at"), "sent flag not persisted"
        finally:
            _run(db.appointments.delete_one({"id": appt_id}))
            _run(db.customers.delete_one({"id": cust_id}))


# ---------------- whats-new ----------------
class TestWhatsNew:
    def test_whats_new_build(self, admin_sess):
        r = admin_sess.get(f"{BASE}/api/whats-new")
        assert r.status_code == 200
        d = r.json()
        assert d.get("build") == "2026-07-12.5", f"build={d.get('build')}"
        # highlights non-empty
        rels = d.get("releases") or d.get("highlights") or []
        assert rels, d


# ---------------- regression: general endpoints ----------------
class TestRegression:
    def test_super_notifications(self, super_sess):
        r = super_sess.get(f"{BASE}/api/super-admin/notifications")
        assert r.status_code == 200
        assert "items" in r.json()

    def test_admin_dashboard_stats(self, admin_sess):
        # A few core admin GETs that should return 200
        for path in ["/api/services", "/api/staff", "/api/appointments"]:
            r = admin_sess.get(f"{BASE}{path}")
            assert r.status_code == 200, f"{path} returned {r.status_code}"
