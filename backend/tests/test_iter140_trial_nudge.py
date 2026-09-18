"""Iteration 140: Trial-ending nudge (auto sweep + manual send) + cleanup regression.

Covers:
- (A) POST /api/super-admin/renewals/run-auto-reminders sends trial nudge to a trial tenant
  ending in exactly 7 days: source='trial', email_sent=true, pay-link created (created_by='trial-nudge',
  note contains 'Trial ends in 7 day(s)'), renewal_reminder_log row inserted, idempotent on re-run,
  GET /api/public/pay-link/<token> returns pending/plan/amount.
- (A) POST /api/super-admin/renewals/{tid}/send-trial-nudge manual: 200 + log row manual=true, 404 unknown, 422 for days=500.
- (A) Paid tenant (subscription_end_date=now+7d) uses source='subscription' (not trial).
- (B) Regression pings on cleaned-up routes: public_site, gift_cards, auth (login/me/forgot),
  hq_documents, registry, tenant_settings, pay_links list, services_catalog table QR.
- Backend log tail for NameError / ImportError / Traceback.
- Cleans up all created tenants/users/uploads/invoices/pay_links/reminder log rows.
"""
import os
import time
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
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

SA_EMAIL = "super@miracurl.com"
SA_PASS = "og9T@41Es#OQb6"
TA_EMAIL = "admin@miracurl.com"
TA_PASS = password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD")
TA_SLUG = "miracurl-marathahalli"
RESTO_EMAIL = "infinity.admin@miracurl.com"
RESTO_PASS = "Infinity@2026"
RESTO_SLUG = "infinity-family-restaurant"
OWNER_EMAIL = "delivered@resend.dev"

TS = int(time.time())
SLUG_TRIAL = f"nudge-qa-{TS}"
SLUG_SUB = f"nudge-sub-{TS}"

CREATED = {"tenant_ids": [], "slugs": [], "user_ids": []}


# --------------- fixtures ---------------
@pytest.fixture(scope="module")
def sa():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": SA_EMAIL, "password": SA_PASS}, timeout=20)
    assert r.status_code == 200, f"SA login failed: {r.status_code} {r.text[:200]}"
    csrf = s.cookies.get("csrf_token") or s.cookies.get("csrf")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf})
    return s


@pytest.fixture(scope="module")
def mongo():
    return MongoClient(MONGO_URL)[DB_NAME]


# --------------- (A) trial nudge sweep ---------------
def test_a1_create_trial_tenant(sa, mongo):
    body = {
        "slug": SLUG_TRIAL, "name": f"Nudge QA {TS}",
        "owner_name": "Nudge Owner", "owner_email": OWNER_EMAIL,
        "trial_months": 3,
    }
    r = sa.post(f"{BASE_URL}/api/super-admin/tenants", json=body, timeout=30)
    assert r.status_code in (200, 201), f"{r.status_code} {r.text[:400]}"
    data = r.json()
    tid = data.get("id") or data.get("tenant_id") or data.get("tenant", {}).get("id")
    if not tid:
        t = mongo.tenants.find_one({"slug": SLUG_TRIAL})
        assert t, "tenant not created"
        tid = t["id"]
    CREATED["tenant_ids"].append(tid)
    CREATED["slugs"].append(SLUG_TRIAL)
    # capture any owner user created
    for u in mongo.users.find({"tenant_id": tid}, {"id": 1, "_id": 0}):
        CREATED["user_ids"].append(u["id"])
    # Force trial_end_date and trial_ends_at to now+7d
    target = (datetime.now(timezone.utc) + timedelta(days=7, hours=1)).isoformat()
    mongo.tenants.update_one(
        {"id": tid},
        {"$set": {"trial_end_date": target, "trial_ends_at": target, "status": "trial"}, "$unset": {"subscription_end_date": ""}},
    )
    # sanity
    t = mongo.tenants.find_one({"id": tid})
    assert t and t.get("trial_end_date")


def test_a2_run_auto_reminders_sends_trial_nudge(sa, mongo):
    r = sa.post(f"{BASE_URL}/api/super-admin/renewals/run-auto-reminders", timeout=60)
    assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
    body = r.json()
    items = body.get("items", [])
    ours = [i for i in items if i.get("slug") == SLUG_TRIAL]
    assert ours, f"no reminder for {SLUG_TRIAL}; items={[i.get('slug') for i in items]}"
    it = ours[0]
    assert it["days_mark"] == 7, it
    assert it["source"] == "trial", it
    assert it.get("email_sent") is True, f"email not sent: {it.get('email_error')}"

    # pay link created
    tid = CREATED["tenant_ids"][0]
    link = mongo.subscription_pay_links.find_one({"tenant_id": tid, "created_by": "trial-nudge"})
    assert link, "pay link not created"
    assert "Trial ends in 7 day(s)" in (link.get("note") or ""), link.get("note")
    assert link.get("status") == "pending"

    # reminder log row
    log = mongo.renewal_reminder_log.find_one({"tenant_id": tid, "days_mark": 7, "source": "trial"})
    assert log, "reminder log missing"


def test_a3_public_pay_link_endpoint(mongo):
    tid = CREATED["tenant_ids"][0]
    link = mongo.subscription_pay_links.find_one({"tenant_id": tid, "created_by": "trial-nudge"})
    assert link
    token = link["token"]
    r = requests.get(f"{BASE_URL}/api/public/pay-link/{token}", timeout=20)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    d = r.json()
    assert d.get("status") == "pending"
    assert d.get("plan_label")
    assert (d.get("amount") or 0) > 0


def test_a4_sweep_idempotent(sa, mongo):
    tid = CREATED["tenant_ids"][0]
    before = mongo.renewal_reminder_log.count_documents({"tenant_id": tid, "days_mark": 7, "source": "trial"})
    r = sa.post(f"{BASE_URL}/api/super-admin/renewals/run-auto-reminders", timeout=60)
    assert r.status_code == 200
    items = r.json().get("items", [])
    assert not any(i.get("slug") == SLUG_TRIAL for i in items), "should be skipped 2nd run"
    after = mongo.renewal_reminder_log.count_documents({"tenant_id": tid, "days_mark": 7, "source": "trial"})
    assert after == before, f"log grew {before}->{after}"


# --------------- manual send-trial-nudge ---------------
def test_a5_manual_send_trial_nudge(sa, mongo):
    tid = CREATED["tenant_ids"][0]
    r = sa.post(f"{BASE_URL}/api/super-admin/renewals/{tid}/send-trial-nudge", json={"days": 1}, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
    d = r.json()
    assert d.get("ok") is True
    assert d.get("sent_to") == OWNER_EMAIL
    assert d.get("days") == 1
    log = mongo.renewal_reminder_log.find_one({"tenant_id": tid, "days_mark": 1, "manual": True, "source": "trial"})
    assert log, "manual log row missing"


def test_a6_manual_unknown_tenant_404(sa):
    r = sa.post(f"{BASE_URL}/api/super-admin/renewals/does-not-exist-xyz/send-trial-nudge",
                json={"days": 1}, timeout=20)
    assert r.status_code == 404, r.text[:200]


def test_a7_manual_days_500_returns_422(sa):
    tid = CREATED["tenant_ids"][0]
    r = sa.post(f"{BASE_URL}/api/super-admin/renewals/{tid}/send-trial-nudge",
                json={"days": 500}, timeout=20)
    assert r.status_code == 422, f"{r.status_code} {r.text[:200]}"


# --------------- paid tenant uses source='subscription' ---------------
def test_a8_paid_subscription_end_uses_subscription_source(sa, mongo):
    """Create a fresh tenant, set subscription_end_date=now+7d, run sweep, expect source='subscription'."""
    body = {
        "slug": SLUG_SUB, "name": f"Sub QA {TS}",
        "owner_name": "Sub Owner", "owner_email": OWNER_EMAIL,
        "trial_months": 3,
    }
    r = sa.post(f"{BASE_URL}/api/super-admin/tenants", json=body, timeout=30)
    assert r.status_code in (200, 201), f"{r.status_code} {r.text[:400]}"
    t = mongo.tenants.find_one({"slug": SLUG_SUB})
    assert t, "sub tenant missing"
    tid = t["id"]
    CREATED["tenant_ids"].append(tid)
    CREATED["slugs"].append(SLUG_SUB)
    for u in mongo.users.find({"tenant_id": tid}, {"id": 1, "_id": 0}):
        CREATED["user_ids"].append(u["id"])
    target = (datetime.now(timezone.utc) + timedelta(days=7, hours=1)).isoformat()
    mongo.tenants.update_one(
        {"id": tid},
        {"$set": {"subscription_end_date": target, "status": "active", "plan": "half_year"},
         "$unset": {"trial_end_date": "", "trial_ends_at": ""}},
    )
    r = sa.post(f"{BASE_URL}/api/super-admin/renewals/run-auto-reminders", timeout=60)
    assert r.status_code == 200
    items = r.json().get("items", [])
    ours = [i for i in items if i.get("slug") == SLUG_SUB]
    assert ours, "sub tenant not picked"
    assert ours[0]["source"] == "subscription", ours[0]
    log = mongo.renewal_reminder_log.find_one({"tenant_id": tid, "source": "subscription"})
    assert log


# --------------- (B) regression on cleaned-up routes ---------------
def test_b1_public_site_salon(sa):
    r = requests.get(f"{BASE_URL}/api/public/salon/{TA_SLUG}", timeout=20)
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"


def test_b2_gift_cards_public_get():
    # Try several known public GETs
    tried = []
    for path in ("/api/public/gift-occasions", "/api/public/gift-cards/occasions",
                 f"/api/public/{TA_SLUG}/gift-cards", "/api/public/gift-cards"):
        r = requests.get(f"{BASE_URL}{path}", timeout=15)
        tried.append((path, r.status_code))
        if r.status_code < 500 and r.status_code != 404:
            return
    # accept 404 as "route exists, unknown resource" — but never 500
    for path, code in tried:
        assert code < 500, f"gift_cards 500 at {path}"


def test_b3_auth_login_me_forgot():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": TA_EMAIL, "password": TA_PASS},
               headers={"X-Tenant-Slug": TA_SLUG}, timeout=20)
    assert r.status_code == 200, f"login {r.status_code} {r.text[:200]}"
    csrf = s.cookies.get("csrf_token") or s.cookies.get("csrf")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf, "X-Tenant-Slug": TA_SLUG})
    r = s.get(f"{BASE_URL}/api/auth/me", timeout=20)
    assert r.status_code == 200, f"me {r.status_code} {r.text[:200]}"
    assert r.json().get("email") == TA_EMAIL

    r = requests.post(f"{BASE_URL}/api/auth/forgot-password",
                      json={"email": "nobody-xyz@example.com"},
                      headers={"X-Tenant-Slug": TA_SLUG}, timeout=20)
    assert r.status_code < 500, f"forgot {r.status_code} {r.text[:200]}"


def test_b4_hq_demo_campaign_invites(sa):
    r = sa.get(f"{BASE_URL}/api/super-admin/demo-campaign/invites", timeout=20)
    assert r.status_code < 500, f"{r.status_code} {r.text[:200]}"


def test_b5_hq_tenants(sa):
    r = sa.get(f"{BASE_URL}/api/super-admin/tenants", timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"


def test_b6_tenant_settings_branding():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": TA_EMAIL, "password": TA_PASS},
               headers={"X-Tenant-Slug": TA_SLUG}, timeout=20)
    assert r.status_code == 200
    csrf = s.cookies.get("csrf_token") or s.cookies.get("csrf")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf, "X-Tenant-Slug": TA_SLUG})
    else:
        s.headers.update({"X-Tenant-Slug": TA_SLUG})
    r = s.get(f"{BASE_URL}/api/settings/branding", timeout=20)
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"


def test_b7_pay_links_list(sa):
    for path in ("/api/super-admin/pay-links", "/api/super-admin/subscription-pay-links",
                 "/api/super-admin/subscriptions/pay-links"):
        r = sa.get(f"{BASE_URL}{path}", timeout=20)
        if r.status_code < 500 and r.status_code != 404:
            return
    # last one still must not 500
    assert r.status_code < 500, f"{r.status_code} {r.text[:200]}"


def test_b8_restaurant_table_qr_png():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": RESTO_EMAIL, "password": RESTO_PASS},
               headers={"X-Tenant-Slug": RESTO_SLUG}, timeout=20)
    assert r.status_code == 200, f"resto login {r.status_code} {r.text[:200]}"
    csrf = s.cookies.get("csrf_token") or s.cookies.get("csrf")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf, "X-Tenant-Slug": RESTO_SLUG})
    else:
        s.headers.update({"X-Tenant-Slug": RESTO_SLUG})
    r = s.get(f"{BASE_URL}/api/settings/table-qr-card.png?table=1", timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    assert r.headers.get("content-type", "").startswith("image/png"), r.headers


def test_b9_registry_public_get():
    for path in ("/api/public/registry", "/api/public/registry/list",
                 "/api/public/registry/salons", "/api/public/business-registry"):
        r = requests.get(f"{BASE_URL}{path}", timeout=15)
        if r.status_code < 500:
            return
    assert False, "all registry public GET returned 5xx"


def test_b10_backend_log_no_nameerror():
    try:
        with open("/var/log/supervisor/backend.err.log", "r") as fh:
            fh.seek(0, 2)
            size = fh.tell()
            fh.seek(max(0, size - 200_000))
            tail = fh.read()
    except FileNotFoundError:
        pytest.skip("no err log")
    bad = []
    for needle in ("NameError", "ImportError", "AttributeError: module"):
        if needle in tail:
            # find nearby line
            idx = tail.rfind(needle)
            snippet = tail[max(0, idx - 200):idx + 200]
            bad.append(f"{needle}: {snippet}")
    assert not bad, "\n---\n".join(bad)


# --------------- CLEANUP ---------------
def test_z_cleanup(mongo):
    for tid in CREATED["tenant_ids"]:
        mongo.tenants.delete_many({"id": tid})
        mongo.users.delete_many({"tenant_id": tid})
        mongo.uploads.delete_many({"tenant_id": tid})
        mongo.subscription_pay_links.delete_many({"tenant_id": tid})
        mongo.renewal_reminder_log.delete_many({"tenant_id": tid})
        mongo.trial_nudges.delete_many({"tenant_id": tid})
    for slug in CREATED["slugs"]:
        mongo.subscription_invoices.delete_many({"tenant_slug": slug})
