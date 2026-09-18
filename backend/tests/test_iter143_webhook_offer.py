"""Iter 143 — extra webhook coverage (pay-link settle via order.paid, refund, unknown order)
+ trial-offer settings + trial-offer baked into nudge pay link.

SAFETY: Never completes a real payment. Only signed webhooks with the real
RAZORPAY_WEBHOOK_SECRET are used; verify endpoint gets FAKE signatures (expect 400).
Cleans up every seed row.
"""
import hashlib
import hmac
import json
import os
import time
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv
import os as _os
import sys as _sys

_sys.path.insert(0, _os.path.dirname(__file__))
from _creds import password_for  # noqa: E402

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = BASE_URL + "/api"
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET") or ""

SA_EMAIL = "super@miracurl.com"
SA_PASS = "og9T@41Es#OQb6"
TA_EMAIL = "admin@miracurl.com"
TA_PASS = password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD")
TA_SLUG = "miracurl-marathahalli"
OWNER_EMAIL = "delivered@resend.dev"

TS = int(time.time())
THROW_SLUG_LINK = f"iter143-link-{TS}"
THROW_SLUG_TRIAL = f"iter143-trial-{TS}"

# Track everything we create for cleanup
CREATED = {"tenant_ids": [], "order_ids": [], "payment_ids": [], "event_ids": [],
           "pay_link_tokens": [], "tenant_orders_verify": []}


def _login(email, password, slug=None):
    s = requests.Session()
    headers = {"X-Tenant-Slug": slug} if slug else {}
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password},
               headers=headers, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    csrf = s.cookies.get("csrf_token") or s.cookies.get("csrf")
    h = {}
    if csrf:
        h["X-CSRF-Token"] = csrf
    if slug:
        h["X-Tenant-Slug"] = slug
    s.headers.update(h)
    return s


@pytest.fixture(scope="module")
def sa():
    return _login(SA_EMAIL, SA_PASS)


@pytest.fixture(scope="module")
def ta():
    return _login(TA_EMAIL, TA_PASS, TA_SLUG)


@pytest.fixture(scope="module")
def mongo():
    return MongoClient(MONGO_URL)[DB_NAME]


def _sign(raw: bytes) -> str:
    return hmac.new(SECRET.encode(), raw, hashlib.sha256).hexdigest()


def _post_webhook(event: dict, sig: str | None = None, event_id: str | None = None, raw_override: bytes | None = None):
    raw = raw_override if raw_override is not None else json.dumps(event).encode()
    sig = sig if sig is not None else _sign(raw)
    eid = event_id or f"evt_{uuid.uuid4().hex[:12]}"
    CREATED["event_ids"].append(eid)
    h = {"Content-Type": "application/json", "x-razorpay-signature": sig, "x-razorpay-event-id": eid}
    return requests.post(f"{API}/billing/razorpay/webhook", data=raw, headers=h, timeout=60)


# ============================================================================
# Fixtures — throwaway tenants
# ============================================================================

@pytest.fixture(scope="module")
def link_tenant(sa, mongo):
    """Create a throwaway INR trial tenant used for the pay-link webhook flow."""
    body = {"slug": THROW_SLUG_LINK, "name": f"Iter143 Link QA {TS}",
            "owner_name": "QA Owner", "owner_email": OWNER_EMAIL, "trial_months": 3}
    r = sa.post(f"{API}/super-admin/tenants", json=body, timeout=30)
    assert r.status_code in (200, 201), f"create tenant failed: {r.status_code} {r.text[:400]}"
    tdoc = mongo.tenants.find_one({"slug": THROW_SLUG_LINK})
    assert tdoc, "throwaway tenant not found in mongo"
    tid = tdoc["id"]
    CREATED["tenant_ids"].append(tid)
    yield {"id": tid, "slug": THROW_SLUG_LINK}


# ============================================================================
# 1. Pay-link webhook flow — order.paid settles a pending pay link
# ============================================================================
class TestPayLinkWebhookSettle:
    def test_create_pay_link_and_attach_order(self, sa, link_tenant, mongo):
        # HQ creates a starter pay link for that tenant
        r = sa.post(f"{API}/super-admin/pay-links",
                    json={"tenant_id": link_tenant["id"], "plan": "half_year", "note": "iter143 QA"},
                    timeout=30)
        assert r.status_code == 200, r.text
        link = r.json()["link"]
        CREATED["pay_link_tokens"].append(link["token"])
        pytest.link_amount = float(link["amount"])
        pytest.link_token = link["token"]

        # Public → create real Razorpay order (no charge)
        r2 = requests.post(f"{API}/public/pay-link/{link['token']}/order", timeout=30)
        assert r2.status_code == 200, r2.text
        order_id = r2.json()["order_id"]
        assert order_id.startswith("order_")
        CREATED["order_ids"].append(order_id)
        pytest.link_order_id = order_id

    def test_signed_order_paid_settles_link(self, mongo, link_tenant):
        pay_id = f"pay_fakeXYZ{uuid.uuid4().hex[:8]}"
        CREATED["payment_ids"].append(pay_id)
        amount_paise = int(round(pytest.link_amount * 100))
        ev = {"event": "order.paid",
              "payload": {"payment": {"entity": {"id": pay_id, "order_id": pytest.link_order_id, "amount": amount_paise}}}}
        r = _post_webhook(ev, event_id=f"evt_link_{pytest.link_order_id}")
        assert r.status_code == 200, r.text
        assert r.json().get("result") == "pay_link_settled", r.json()
        # link status → paid, paid_via=webhook
        link = mongo.subscription_pay_links.find_one({"token": pytest.link_token})
        assert link["status"] == "paid" and link.get("paid_via") == "webhook", link
        # active subscription + subscription_invoices row
        sub = mongo.subscriptions.find_one({"tenant_id": link_tenant["id"], "status": "active"})
        assert sub and sub.get("end_date"), sub
        inv = mongo.subscription_invoices.find_one({"tenant_id": link_tenant["id"]})
        assert inv and abs(float(inv["amount"]) - pytest.link_amount) < 0.5, inv
        pytest.paid_pay_id = pay_id
        pytest.settled_sub_id = sub["id"]

    def test_duplicate_order_paid_is_no_duplicate(self, mongo, link_tenant):
        amount_paise = int(round(pytest.link_amount * 100))
        ev = {"event": "order.paid",
              "payload": {"payment": {"entity": {"id": pytest.paid_pay_id, "order_id": pytest.link_order_id, "amount": amount_paise}}}}
        r = _post_webhook(ev, event_id=f"evt_link_dup_{uuid.uuid4().hex[:6]}")
        assert r.status_code == 200, r.text
        # New event id — not a de-dupe short-circuit; the reconciler returns already_reconciled.
        assert r.json().get("result") == "already_reconciled", r.json()
        # Still exactly one subscription
        assert mongo.subscriptions.count_documents({"tenant_id": link_tenant["id"]}) == 1

    def test_signed_refund_processed_revokes(self, mongo, link_tenant):
        amount_paise = int(round(pytest.link_amount * 100))
        rfnd_id = f"rfnd_{uuid.uuid4().hex[:10]}"
        ev = {"event": "refund.processed",
              "payload": {"refund": {"entity": {"id": rfnd_id, "order_id": pytest.link_order_id,
                                                 "payment_id": pytest.paid_pay_id, "amount": amount_paise,
                                                 "status": "processed"}}}}
        r = _post_webhook(ev, event_id=f"evt_rfnd_{uuid.uuid4().hex[:6]}")
        assert r.status_code == 200, r.text
        assert r.json().get("result") == "refund_applied", r.json()
        sub = mongo.subscriptions.find_one({"id": pytest.settled_sub_id})
        assert sub["status"] == "refunded", sub
        t = mongo.tenants.find_one({"id": link_tenant["id"]})
        assert t["status"] == "trial", t
        link = mongo.subscription_pay_links.find_one({"token": pytest.link_token})
        assert link["status"] == "refunded", link


# ============================================================================
# 2. Bad/malformed signatures + unknown order
# ============================================================================
class TestWebhookErrors:
    def test_missing_signature(self):
        ev = {"event": "payment.captured", "payload": {"payment": {"entity": {"id": "pay_x", "order_id": "order_x", "amount": 100}}}}
        raw = json.dumps(ev).encode()
        r = requests.post(f"{API}/billing/razorpay/webhook", data=raw,
                          headers={"Content-Type": "application/json", "x-razorpay-event-id": f"evt_{uuid.uuid4().hex[:6]}"},
                          timeout=30)
        assert r.status_code == 400, r.text

    def test_bad_signature(self):
        ev = {"event": "payment.captured", "payload": {"payment": {"entity": {"id": "pay_x", "order_id": "order_x", "amount": 100}}}}
        r = _post_webhook(ev, sig="deadbeef" * 8)
        assert r.status_code == 400, r.text

    def test_malformed_json_with_valid_signature(self):
        raw = b"{not valid json"
        r = _post_webhook({}, raw_override=raw)
        assert r.status_code == 400, r.text

    def test_unknown_order_captured_no_crash(self):
        unknown = f"order_unknown{uuid.uuid4().hex[:10]}"
        CREATED["order_ids"].append(unknown)
        ev = {"event": "payment.captured",
              "payload": {"payment": {"entity": {"id": f"pay_u{uuid.uuid4().hex[:6]}", "order_id": unknown, "amount": 100, "status": "captured"}}}}
        r = _post_webhook(ev)
        assert r.status_code == 200, r.text
        assert r.json().get("result") == "already_reconciled", r.json()


# ============================================================================
# 3. /billing/razorpay/verify UNCHANGED — fake signature still 400s, no state change
# ============================================================================
class TestVerifyUnchanged:
    def test_verify_fake_signature_400(self, ta, mongo):
        # Snapshot tenant state
        t_before = mongo.tenants.find_one({"slug": TA_SLUG}, {"_id": 0})
        assert t_before, "miracurl-marathahalli tenant missing"

        r = ta.post(f"{API}/billing/razorpay/order", json={"plan": "half_year"}, timeout=30)
        assert r.status_code == 200, r.text
        order_id = r.json().get("order_id") or r.json().get("id")
        assert order_id
        CREATED["tenant_orders_verify"].append(order_id)

        r2 = ta.post(f"{API}/billing/razorpay/verify",
                     json={"plan": "half_year",
                           "razorpay_order_id": order_id,
                           "razorpay_payment_id": f"pay_fake{uuid.uuid4().hex[:8]}",
                           "razorpay_signature": "deadbeef" * 8},
                     timeout=30)
        assert r2.status_code == 400, r2.text
        assert "sign" in r2.text.lower(), r2.text

        t_after = mongo.tenants.find_one({"slug": TA_SLUG}, {"_id": 0})
        assert t_after.get("subscription_end_date") == t_before.get("subscription_end_date"), \
            (t_before.get("subscription_end_date"), t_after.get("subscription_end_date"))
        assert t_after.get("status") == t_before.get("status")
        pending = mongo.subscription_payments.find_one({"razorpay_order_id": order_id, "kind": "razorpay_pending"})
        assert pending and pending["status"] == "created", pending


# ============================================================================
# 4. Trial-offer settings CRUD + validation
# ============================================================================
class TestTrialOfferSettings:
    DEFAULTS = {"enabled": True, "kind": "percent", "percent": 10, "flat": 1000, "valid_hours": 48, "max_days": 1}

    def test_get_defaults(self, sa):
        r = sa.get(f"{API}/super-admin/trial-offer", timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        for k, v in self.DEFAULTS.items():
            assert j.get(k) == v, (k, j)

    def test_put_valid_flat(self, sa):
        r = sa.put(f"{API}/super-admin/trial-offer",
                   json={"kind": "flat", "flat": 1000, "valid_hours": 168, "enabled": True,
                         "percent": 10, "max_days": 1}, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["kind"] == "flat" and j["flat"] == 1000 and j["valid_hours"] == 168

    def test_put_percent_out_of_range_rejected(self, sa):
        r = sa.put(f"{API}/super-admin/trial-offer",
                   json={"kind": "percent", "percent": 80, "flat": 1000, "valid_hours": 48,
                         "enabled": True, "max_days": 1}, timeout=30)
        assert r.status_code == 422, (r.status_code, r.text)

    def test_put_bogus_kind_rejected(self, sa):
        r = sa.put(f"{API}/super-admin/trial-offer",
                   json={"kind": "bogus", "percent": 10, "flat": 1000, "valid_hours": 48,
                         "enabled": True, "max_days": 1}, timeout=30)
        assert r.status_code == 422, (r.status_code, r.text)

    def test_restore_defaults(self, sa):
        r = sa.put(f"{API}/super-admin/trial-offer", json=self.DEFAULTS, timeout=30)
        assert r.status_code == 200, r.text


# ============================================================================
# 5. Trial-offer baked into nudge pay link
# ============================================================================
@pytest.fixture(scope="module")
def trial_tenant(sa, mongo):
    """Throwaway trial tenant used for send-trial-nudge tests."""
    body = {"slug": THROW_SLUG_TRIAL, "name": f"Iter143 Trial QA {TS}",
            "owner_name": "Trial QA", "owner_email": OWNER_EMAIL, "trial_months": 3}
    r = sa.post(f"{API}/super-admin/tenants", json=body, timeout=30)
    assert r.status_code in (200, 201), f"{r.status_code} {r.text[:400]}"
    tdoc = mongo.tenants.find_one({"slug": THROW_SLUG_TRIAL})
    assert tdoc
    tid = tdoc["id"]
    CREATED["tenant_ids"].append(tid)
    now = datetime.now(timezone.utc)
    end = (now + timedelta(days=1)).isoformat()
    mongo.tenants.update_one({"id": tid}, {"$set": {"trial_end_date": end, "trial_ends_at": end}})
    return {"id": tid, "slug": THROW_SLUG_TRIAL}


class TestTrialOfferNudge:
    def test_nudge_days1_bakes_offer(self, sa, mongo, trial_tenant):
        # Ensure defaults
        sa.put(f"{API}/super-admin/trial-offer",
               json={"enabled": True, "kind": "percent", "percent": 10, "flat": 1000,
                     "valid_hours": 48, "max_days": 1}, timeout=30)
        r = sa.post(f"{API}/super-admin/renewals/{trial_tenant['id']}/send-trial-nudge",
                    json={"days": 1}, timeout=60)
        assert r.status_code == 200, r.text
        # Find latest link
        link = mongo.subscription_pay_links.find_one({"tenant_id": trial_tenant["id"]},
                                                     sort=[("created_at", -1)])
        assert link, "no pay link created by nudge"
        CREATED["pay_link_tokens"].append(link["token"])
        assert (link.get("discount") or 0) > 0, link
        assert float(link.get("original_amount") or 0) > float(link["amount"]), link
        assert "trial upgrade offer" in (link.get("offer_label") or "").lower(), link.get("offer_label")
        assert "limited-time" in (link.get("note") or "").lower(), link.get("note")
        # expires_at ~= now + 48h ± 5 min
        exp = datetime.fromisoformat(link["expires_at"].replace("Z", "+00:00"))
        delta = (exp - datetime.now(timezone.utc)).total_seconds()
        assert 47 * 3600 < delta < 49 * 3600, delta

        # Public endpoint exposes discount fields
        r2 = requests.get(f"{API}/public/pay-link/{link['token']}", timeout=30)
        assert r2.status_code == 200, r2.text
        pj = r2.json()
        assert pj.get("discount") and pj.get("original_amount") and pj.get("offer_label")

    def test_nudge_days7_no_discount(self, sa, mongo, trial_tenant):
        r = sa.post(f"{API}/super-admin/renewals/{trial_tenant['id']}/send-trial-nudge",
                    json={"days": 7}, timeout=60)
        assert r.status_code == 200, r.text
        link = mongo.subscription_pay_links.find_one({"tenant_id": trial_tenant["id"]},
                                                     sort=[("created_at", -1)])
        assert link
        CREATED["pay_link_tokens"].append(link["token"])
        assert not link.get("discount"), link
        assert not link.get("original_amount"), link
        assert not link.get("offer_label"), link

    def test_disabled_offer_days1_no_discount(self, sa, mongo, trial_tenant):
        sa.put(f"{API}/super-admin/trial-offer",
               json={"enabled": False, "kind": "percent", "percent": 10, "flat": 1000,
                     "valid_hours": 48, "max_days": 1}, timeout=30)
        try:
            r = sa.post(f"{API}/super-admin/renewals/{trial_tenant['id']}/send-trial-nudge",
                        json={"days": 1}, timeout=60)
            assert r.status_code == 200, r.text
            link = mongo.subscription_pay_links.find_one({"tenant_id": trial_tenant["id"]},
                                                         sort=[("created_at", -1)])
            assert link
            CREATED["pay_link_tokens"].append(link["token"])
            assert not link.get("discount"), link
        finally:
            # Restore
            sa.put(f"{API}/super-admin/trial-offer",
                   json={"enabled": True, "kind": "percent", "percent": 10, "flat": 1000,
                         "valid_hours": 48, "max_days": 1}, timeout=30)


# ============================================================================
# 6. Webhook health status endpoint
# ============================================================================
def test_webhook_status_endpoint(sa):
    r = sa.get(f"{API}/super-admin/razorpay/webhook-status", timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("configured") is True
    assert j.get("url", "").endswith("/api/billing/razorpay/webhook"), j.get("url")
    assert isinstance(j.get("recent"), list)


# ============================================================================
# CLEANUP
# ============================================================================
@pytest.fixture(scope="module", autouse=True)
def _cleanup(mongo):
    yield
    tids = list(set(CREATED["tenant_ids"]))
    orders = list(set(CREATED["order_ids"] + CREATED["tenant_orders_verify"]))
    pays = list(set(CREATED["payment_ids"]))
    eids = list(set(CREATED["event_ids"]))
    tokens = list(set(CREATED["pay_link_tokens"]))

    # tenant-keyed collections
    for c in ("tenants", "users", "uploads", "subscriptions", "subscription_payments",
              "subscription_invoices", "subscription_pay_links", "renewal_reminder_log",
              "trial_nudges", "hq_messages", "affiliate_referrals", "sms_credit_log",
              "sms_pack_payments"):
        mongo[c].delete_many({"tenant_id": {"$in": tids}})

    mongo.tenants.delete_many({"id": {"$in": tids}})
    mongo.subscription_pay_links.delete_many({"token": {"$in": tokens}})

    # webhook events + orders
    mongo.razorpay_webhook_events.delete_many({
        "$or": [{"event_id": {"$in": eids}}, {"order_id": {"$in": orders}},
                {"payment_id": {"$in": pays}}]})
    mongo.subscription_payments.delete_many({"razorpay_order_id": {"$in": orders}})

    # miracurl-marathahalli pending row created by verify test
    mongo.subscription_payments.delete_many(
        {"razorpay_order_id": {"$in": CREATED["tenant_orders_verify"]},
         "kind": "razorpay_pending"})

    # Restore trial-offer defaults just in case
    try:
        s = _login(SA_EMAIL, SA_PASS)
        s.put(f"{API}/super-admin/trial-offer",
              json={"enabled": True, "kind": "percent", "percent": 10, "flat": 1000,
                    "valid_hours": 48, "max_days": 1}, timeout=30)
    except Exception:
        pass
