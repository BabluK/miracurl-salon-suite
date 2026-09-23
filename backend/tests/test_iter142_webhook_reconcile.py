"""Iter 142: Razorpay webhook reconciliation — signed events activate / fail / refund subscriptions."""
import hashlib
import hmac
import json
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient
from _creds import pw

API = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].splitlines()[0].strip() + "/api"
ENV = {k: v.strip().strip('"').strip("'") for k, v in (l.split("=", 1) for l in open("/app/backend/.env").read().splitlines() if "=" in l and not l.startswith("#"))}
SECRET = ENV["RAZORPAY_WEBHOOK_SECRET"]
db = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]
ORDER = f"order_test{uuid.uuid4().hex[:10]}"
PAY = f"pay_test{uuid.uuid4().hex[:10]}"
TID = str(uuid.uuid4())
SLUG = f"wh-qa-{uuid.uuid4().hex[:6]}"


def _post(event: dict, sig: str | None = None, event_id: str | None = None):
    raw = json.dumps(event).encode()
    sig = sig or hmac.new(SECRET.encode(), raw, hashlib.sha256).hexdigest()
    h = {"Content-Type": "application/json", "x-razorpay-signature": sig, "x-razorpay-event-id": event_id or f"evt_{uuid.uuid4().hex[:8]}"}
    return requests.post(f"{API}/billing/razorpay/webhook", data=raw, headers=h, timeout=60)


def _ev(kind: str, **entity):
    if kind.startswith("refund"):
        return {"event": kind, "payload": {"refund": {"entity": {"id": f"rfnd_{uuid.uuid4().hex[:8]}", "order_id": ORDER, "payment_id": PAY, "amount": 1200000, **entity}}}}
    return {"event": kind, "payload": {"payment": {"entity": {"id": PAY, "order_id": ORDER, "amount": 1200000, **entity}}}}


@pytest.fixture(scope="module", autouse=True)
def tenant():
    now = datetime.now(timezone.utc).isoformat()
    db.tenants.insert_one({"id": TID, "slug": SLUG, "name": "Webhook QA Salon", "owner_email": "delivered@resend.dev", "owner_name": "QA",
                           "status": "trial", "plan": "starter", "business_type": "salon", "created_at": now, "trial_ends_at": now, "trial_end_date": now})
    db.subscription_payments.insert_one({"id": str(uuid.uuid4()), "kind": "razorpay_pending", "razorpay_order_id": ORDER, "tenant_id": TID,
                                         "plan": "half_year", "branch_tenant_ids": None, "amount": 12000.0, "credits_applied": 0, "status": "created", "created_at": now})
    yield
    for c in ("subscription_payments", "subscriptions", "subscription_invoices", "razorpay_webhook_events", "subscription_pay_links"):
        db[c].delete_many({"$or": [{"tenant_id": TID}, {"order_id": {"$regex": f"^{ORDER}"}}, {"razorpay_order_id": {"$regex": f"^{ORDER}"}}]})
    db.tenants.delete_one({"id": TID})


def test_secret_configured():
    assert SECRET, "RAZORPAY_WEBHOOK_SECRET must be set"


def test_bad_signature_rejected():
    r = _post(_ev("payment.captured"), sig="deadbeef")
    assert r.status_code == 400, r.text


def test_captured_activates_subscription():
    r = _post(_ev("payment.captured", status="captured"), event_id="evt_cap_" + ORDER)
    assert r.status_code == 200, r.text
    assert r.json()["result"] == "subscription_activated"
    t = db.tenants.find_one({"id": TID})
    assert t["status"] == "active" and t["subscription_end_date"], t
    sub = db.subscriptions.find_one({"tenant_id": TID, "status": "active"})
    assert sub and sub["plan"] == "half_year"
    pending = db.subscription_payments.find_one({"razorpay_order_id": ORDER, "kind": "razorpay_pending"})
    assert pending["status"] == "captured" and pending["captured_via"] == "webhook"
    paid = db.subscription_payments.find_one({"tenant_id": TID, "txn_ref": PAY})
    assert paid and paid["amount"] == 12000.0 and paid["recorded_by"] == "razorpay_webhook"


def test_duplicate_event_id_is_noop():
    r = _post(_ev("payment.captured", status="captured"), event_id="evt_cap_" + ORDER)
    assert r.status_code == 200 and r.json().get("duplicate") is True
    assert db.subscriptions.count_documents({"tenant_id": TID}) == 1


def test_order_paid_after_capture_is_idempotent():
    r = _post(_ev("order.paid"))
    assert r.status_code == 200 and r.json()["result"] == "already_reconciled"
    assert db.subscriptions.count_documents({"tenant_id": TID}) == 1


def test_refund_revokes_access():
    r = _post(_ev("refund.processed", status="processed"))
    assert r.status_code == 200 and r.json()["result"] == "refund_applied", r.text
    t = db.tenants.find_one({"id": TID})
    assert t["status"] == "trial" and not t.get("subscription_end_date"), t
    sub = db.subscriptions.find_one({"tenant_id": TID})
    assert sub["status"] == "refunded"
    paid = db.subscription_payments.find_one({"tenant_id": TID, "txn_ref": PAY})
    assert paid["status"] == "refunded" and paid["refund_amount_inr"] == 12000.0


def test_payment_failed_marks_pending():
    order2 = ORDER + "b"
    db.subscription_payments.insert_one({"id": str(uuid.uuid4()), "kind": "razorpay_pending", "razorpay_order_id": order2, "tenant_id": TID,
                                         "plan": "half_year", "amount": 12000.0, "credits_applied": 0, "status": "created", "created_at": datetime.now(timezone.utc).isoformat()})
    ev = {"event": "payment.failed", "payload": {"payment": {"entity": {"id": "pay_fail1", "order_id": order2, "amount": 1200000, "error_description": "Card declined"}}}}
    r = _post(ev)
    assert r.status_code == 200 and r.json()["result"] == "payment_failed_recorded"
    d = db.subscription_payments.find_one({"razorpay_order_id": order2})
    assert d["status"] == "failed" and d["failure_reason"] == "Card declined"


def test_events_archived_and_status_endpoint():
    assert db.razorpay_webhook_events.count_documents({"order_id": ORDER}) >= 3
    s = requests.Session()
    s.post(f"{API}/auth/login", json={"email": "super@miracurl.com", "password": os.environ.get("SUPER_PW", pw("SUPER_ADMIN"))}, timeout=30)
    r = s.get(f"{API}/super-admin/razorpay/webhook-status", timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["configured"] is True and j["url"].endswith("/api/billing/razorpay/webhook") and j["recent"]


def test_refund_notice_recorded_and_reactivation_link():
    t = db.tenants.find_one({"id": TID})
    n = t.get("last_refund_notice")
    assert n and n["amount"] == 12000.0 and n["sent"] is True and n["pay_link_token"], n
    link = db.subscription_pay_links.find_one({"token": n["pay_link_token"]})
    assert link and link["created_by"] == "refund-reactivation" and link["status"] == "pending"
    r = requests.get(f"{API}/public/pay-link/{n['pay_link_token']}", timeout=30)
    assert r.status_code == 200 and r.json()["amount"] > 0


def test_offer_stats_endpoint():
    s = requests.Session()
    s.post(f"{API}/auth/login", json={"email": "super@miracurl.com", "password": os.environ.get("SUPER_PW", pw("SUPER_ADMIN"))}, timeout=30)
    r = s.get(f"{API}/super-admin/trial-offer/stats?days=90", timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    for k in ("offer", "plain", "all"):
        assert {"sent", "opened", "paid", "revenue", "conv_pct", "open_pct", "discount_given"} <= set(j[k])
    assert isinstance(j["recent_paid"], list)
