"""Iter 81 — Public /demo booking, refactored invite-based /demo-slot regression,
and DELETE /super-admin/subscriptions/{sid} tests.
"""
from _creds import _PW_SUPER
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
# Load from frontend/.env if not set
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for ln in f:
            if ln.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = ln.split("=", 1)[1].strip().rstrip("/")

SUPER_EMAIL = "super@miracurl.com"
SUPER_PWD = _PW_SUPER
DELIVERED = "delivered@resend.dev"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


@pytest.fixture(scope="module")
def db():
    with open("/app/backend/.env") as f:
        env = {}
        for ln in f:
            ln = ln.strip()
            if "=" in ln and not ln.startswith("#"):
                k, v = ln.split("=", 1)
                env[k] = v.strip().strip('"').strip("'")
    client = MongoClient(env.get("MONGO_URL", MONGO_URL))
    return client[env.get("DB_NAME", DB_NAME)]


@pytest.fixture(scope="module")
def public_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def super_client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": SUPER_EMAIL, "password": SUPER_PWD})
    if r.status_code != 200:
        pytest.skip(f"super-admin login failed: {r.status_code} {r.text}")
    return s


# ---------- PUBLIC /demo ----------
class TestPublicDemoSlots:
    def test_slots_no_auth(self, public_client):
        r = public_client.get(f"{BASE_URL}/api/public/demo/slots")
        assert r.status_code == 200
        data = r.json()
        assert len(data["dates"]) == 7
        assert data["times"] == ["11:00", "12:00", "13:00", "15:00", "16:00", "17:00", "18:00", "19:00"]

    def test_book_success_and_dedup(self, public_client, db):
        # cleanup any pre-existing
        db.demo_invites.delete_many({"email": DELIVERED})
        slots = public_client.get(f"{BASE_URL}/api/public/demo/slots").json()
        first_date = slots["dates"][0]
        payload = {
            "name": "TEST Regression",
            "salon_name": "TEST Salon",
            "city": "TEST City",
            "email": DELIVERED,
            "phone": "+919999999999",
            "date": first_date,
            "time": "12:00",
        }
        r = public_client.post(f"{BASE_URL}/api/public/demo/book", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"]
        assert data["slot"]["date"] == first_date
        assert data["slot"]["time"] == "12:00"
        assert "gcal" in data and data["gcal"].startswith("http")

        docs = list(db.demo_invites.find({"email": DELIVERED}))
        assert len(docs) == 1
        assert docs[0]["source"] == "public_demo_page"

        # Book again -> should update, not duplicate
        payload["time"] = "13:00"
        r2 = public_client.post(f"{BASE_URL}/api/public/demo/book", json=payload)
        assert r2.status_code == 200
        docs2 = list(db.demo_invites.find({"email": DELIVERED}))
        assert len(docs2) == 1
        assert docs2[0]["preferred_slot"]["time"] == "13:00"

    def test_reject_invalid_email(self, public_client):
        slots = public_client.get(f"{BASE_URL}/api/public/demo/slots").json()
        r = public_client.post(f"{BASE_URL}/api/public/demo/book", json={
            "name": "Bad", "email": "not-an-email", "date": slots["dates"][0], "time": "12:00"})
        assert r.status_code == 400

    def test_reject_invalid_time(self, public_client):
        slots = public_client.get(f"{BASE_URL}/api/public/demo/slots").json()
        r = public_client.post(f"{BASE_URL}/api/public/demo/book", json={
            "name": "Bad Time", "email": "TEST_bad@resend.dev",
            "date": slots["dates"][0], "time": "09:00"})
        assert r.status_code == 400

    def test_reject_past_date(self, public_client):
        past = (datetime.now(timezone.utc) - timedelta(days=2)).date().isoformat()
        r = public_client.post(f"{BASE_URL}/api/public/demo/book", json={
            "name": "Past", "email": "TEST_past@resend.dev",
            "date": past, "time": "12:00"})
        assert r.status_code == 400


# ---------- REGRESSION: invite-based /demo-slot ----------
class TestInviteBasedDemoSlot:
    @pytest.fixture(scope="class")
    def invite_id(self, db):
        iid = str(uuid.uuid4())
        db.demo_invites.insert_one({
            "id": iid, "email": DELIVERED, "name": "Regression Test",
            "salon_name": "Regression Salon",
            "responded": False, "reminder_sent_at": None,
            "first_sent_at": datetime.now(timezone.utc).isoformat(),
        })
        yield iid
        db.demo_invites.delete_one({"id": iid})

    def test_get_invite_slots(self, public_client, invite_id):
        r = public_client.get(f"{BASE_URL}/api/public/demo-slot/{invite_id}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "Regression Test"
        assert len(d["dates"]) == 7
        assert "12:00" in d["times"]

    def test_book_invite(self, public_client, invite_id, db):
        slots = public_client.get(f"{BASE_URL}/api/public/demo-slot/{invite_id}").json()
        r = public_client.post(f"{BASE_URL}/api/public/demo-slot/{invite_id}",
                               json={"date": slots["dates"][1], "time": "15:00", "phone": "+911234567890"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"]
        assert d["gcal"].startswith("http")
        doc = db.demo_invites.find_one({"id": invite_id})
        assert doc["preferred_slot"]["time"] == "15:00"
        assert doc["responded"]


# ---------- DELETE super-admin subscription ----------
class TestDeleteSubscription:
    def test_reject_active_and_delete_cancelled(self, super_client, db):
        # find an existing cancelled subscription, or create+cancel one
        cancelled = db.subscriptions.find_one({"status": "cancelled"})
        active = db.subscriptions.find_one({"status": "active"})

        if active:
            r = super_client.delete(f"{BASE_URL}/api/super-admin/subscriptions/{active['id']}")
            assert r.status_code == 400
            assert "cancel" in r.text.lower()

        if not cancelled:
            pytest.skip("no cancelled subscription in DB to delete-test")

        sid = cancelled["id"]
        # seed a payment for it to verify cascade
        pay_id = str(uuid.uuid4())
        db.subscription_payments.insert_one(
            {"id": pay_id, "subscription_id": sid, "amount": 1.0,
             "paid_at": datetime.now(timezone.utc).isoformat()})

        r = super_client.delete(f"{BASE_URL}/api/super-admin/subscriptions/{sid}")
        assert r.status_code == 200, r.text
        assert r.json()["ok"]
        assert db.subscriptions.find_one({"id": sid}) is None
        assert db.subscription_payments.find_one({"id": pay_id}) is None

    def test_delete_nonexistent(self, super_client):
        r = super_client.delete(f"{BASE_URL}/api/super-admin/subscriptions/nonexistent-xyz")
        assert r.status_code == 404


# ---------- Final cleanup ----------
def test_cleanup_delivered(db):
    db.demo_invites.delete_many({"email": DELIVERED})
    assert db.demo_invites.find_one({"email": DELIVERED}) is None
