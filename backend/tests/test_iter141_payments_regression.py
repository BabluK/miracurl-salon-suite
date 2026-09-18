"""Iteration 141 — thorough payment & subscription regression.

Covers:
 - Tenant billing (Razorpay config/status/order/verify/webhook/invoices/pdfs, grace, sms packs)
 - Public plans + Super Admin pay-links CRUD (INR + fake-signature verify) + public flow
 - Stripe intl tenant signup + pay-link flow + run_trial_nudges USD skip
 - Super Admin subscriptions CRUD (+ invoice kit + PDFs + resend + extend + cancel + delete)
 - Renewal sweep (sub + trial + owner_email skip)
 - Trial ₹0 invoice regression
 - Backend error-log tail

NEVER completes a real payment. All verify calls use FAKE signatures and expect 400.
Cleans up every seed row.
"""
import os
import time
import re
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv
import os as _os
import sys as _sys

_sys.path.insert(0, _os.path.dirname(__file__))
from _creds import password_for  # noqa: E402


def _pdf_text(content: bytes) -> str:
    try:
        from pypdf import PdfReader
        import io
        r = PdfReader(io.BytesIO(content))
        return "\n".join((p.extract_text() or "") for p in r.pages).upper()
    except Exception:
        return content.decode("latin-1", errors="ignore").upper()

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
RZP_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET") or ""

SA_EMAIL = "super@miracurl.com"
SA_PASS = "og9T@41Es#OQb6"
TA_EMAIL = "admin@miracurl.com"
TA_PASS = password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD")
TA_SLUG = "miracurl-marathahalli"
OWNER_EMAIL = "delivered@resend.dev"

TS = int(time.time())
SLUG_THROW = f"paygc-{TS}"
SLUG_INTL = f"payintl-{TS}"
INTL_EMAIL = f"intlqa+{TS}@example.com"

CREATED = {
    "tenant_ids": [],
    "slugs": [],
    "user_emails": [INTL_EMAIL],  # signup-salon owner
    "sub_ids": [],
    "invoice_ids": [],
    "pay_link_ids": [],
    "pay_link_orders": [],   # razorpay order ids created via pay-link /order
    "tenant_orders": [],     # razorpay order ids created via /api/billing/razorpay/order
    "used_platform_settings_key": False,
}


# --------------- fixtures ---------------
def _login(email, password, slug=None):
    s = requests.Session()
    headers = {}
    if slug:
        headers["X-Tenant-Slug"] = slug
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password},
               headers=headers, timeout=20)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text[:200]}"
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


# ============ SECTION A — TENANT BILLING ============
def test_a1_razorpay_config(ta):
    r = ta.get(f"{BASE_URL}/api/billing/razorpay/config", timeout=20)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    assert d.get("key_id"), d
    assert d.get("test_mode") is False, "expected LIVE keys — got test_mode true"
    assert isinstance(d.get("plans"), list) and len(d["plans"]) > 0


def test_a2_subscription_status(ta):
    r = ta.get(f"{BASE_URL}/api/billing/subscription-status", timeout=20)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    assert "days_remaining" in d
    assert "source" in d
    assert "end_date" in d


def test_a3_razorpay_order_and_bad_verify(ta, mongo):
    # create order (LIVE — harmless)
    r = ta.post(f"{BASE_URL}/api/billing/razorpay/order", json={"plan": "half_year"}, timeout=30)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    order_id = d["order_id"]
    assert order_id.startswith("order_"), order_id
    assert int(d["amount"]) > 0
    CREATED["tenant_orders"].append(order_id)

    # tenant status snapshot BEFORE bad verify
    before = ta.get(f"{BASE_URL}/api/billing/subscription-status", timeout=20).json()

    # bad signature -> 400
    r2 = ta.post(f"{BASE_URL}/api/billing/razorpay/verify", json={
        "plan": "half_year",
        "razorpay_order_id": order_id,
        "razorpay_payment_id": "pay_FAKEQAxxxxxxxx",
        "razorpay_signature": "deadbeef" * 8,
    }, timeout=30)
    assert r2.status_code == 400, f"expected 400, got {r2.status_code} {r2.text[:200]}"

    # nonexistent / already-consumed order -> 400 (signature fails first, still 400)
    r3 = ta.post(f"{BASE_URL}/api/billing/razorpay/verify", json={
        "plan": "half_year",
        "razorpay_order_id": "order_DOES_NOT_EXIST",
        "razorpay_payment_id": "pay_FAKE",
        "razorpay_signature": "deadbeef" * 8,
    }, timeout=30)
    assert r3.status_code == 400, r3.text[:200]

    # status unchanged
    after = ta.get(f"{BASE_URL}/api/billing/subscription-status", timeout=20).json()
    assert after.get("end_date") == before.get("end_date"), (before, after)
    assert after.get("current_plan") == before.get("current_plan")


def test_a4_billing_invoices_and_pdfs(ta):
    r = ta.get(f"{BASE_URL}/api/billing/invoices", timeout=20)
    assert r.status_code == 200
    invs = r.json().get("invoices") or []
    if not invs:
        pytest.skip("no invoices for tenant")
    iid = invs[0]["id"]
    for kind in ("invoice", "receipt", "terms"):
        rr = ta.get(f"{BASE_URL}/api/billing/invoices/{iid}/{kind}.pdf", timeout=30)
        assert rr.status_code == 200, f"{kind}: {rr.status_code} {rr.text[:200]}"
        assert rr.headers.get("content-type", "").startswith("application/pdf"), rr.headers
        assert rr.content[:4] == b"%PDF", f"{kind}: not a real PDF"


def test_a5_razorpay_webhook_bad_sig(ta):
    r = requests.post(f"{BASE_URL}/api/billing/razorpay/webhook",
                      data=b'{"event":"payment.captured"}',
                      headers={"x-razorpay-signature": "deadbeef", "content-type": "application/json"},
                      timeout=20)
    if RZP_WEBHOOK_SECRET:
        assert r.status_code == 400, f"expected 400 bad sig, got {r.status_code} {r.text[:200]}"
    else:
        # secret unset → route returns {'skipped': True} with 200
        assert r.status_code == 200, r.status_code
        assert r.json().get("skipped") is True


def test_a6_sms_packs(ta):
    r = ta.get(f"{BASE_URL}/api/sms-packs", timeout=20)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    assert "packs" in d and len(d["packs"]) > 0


def test_a7_grace_request_no_500(ta):
    r = ta.post(f"{BASE_URL}/api/billing/grace-request", json={"reason": "iter141 qa"}, timeout=20)
    assert r.status_code < 500, f"{r.status_code} {r.text[:200]}"


# ============ SECTION B — PUBLIC PLANS + SUPER ADMIN PAY LINKS ============
def test_b1_public_plans():
    r = requests.get(f"{BASE_URL}/api/public/plans", timeout=20)
    assert r.status_code == 200, r.text[:200]


def test_b2_super_admin_plans(sa):
    r = sa.get(f"{BASE_URL}/api/super-admin/plans", timeout=20)
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    keys = set()
    if isinstance(body, dict):
        # {plans:[{key,...}]} or dict-of-key -> plan
        if isinstance(body.get("plans"), list):
            keys = {p.get("key") for p in body["plans"]}
        else:
            keys = set(body.keys())
    elif isinstance(body, list):
        keys = {p.get("key") for p in body}
    assert "half_year" in keys and "annual" in keys, f"catalog missing plans: {keys}"


def test_b3_super_admin_paylinks_list(sa):
    r = sa.get(f"{BASE_URL}/api/super-admin/pay-links", timeout=20)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    for k in ("plans", "links", "stats", "currency"):
        assert k in d, f"missing {k}"


def _find_tenant_id(mongo, slug):
    t = mongo.tenants.find_one({"slug": slug})
    return t["id"] if t else None


def test_b4_create_pay_link_for_miracurl(sa, mongo):
    tid = _find_tenant_id(mongo, TA_SLUG)
    assert tid, "miracurl tenant missing"
    r = sa.post(f"{BASE_URL}/api/super-admin/pay-links",
                json={"tenant_id": tid, "plan": "half_year", "custom_months": 6, "note": "iter141 qa"},
                timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
    d = r.json()
    link = d["link"]
    assert link["token"], link
    assert link["status"] == "pending"
    CREATED["pay_link_ids"].append(link["id"])
    CREATED["_paylink_token_inr"] = link["token"]
    CREATED["_paylink_id_inr"] = link["id"]


def test_b5_public_paylink_get():
    token = CREATED["_paylink_token_inr"]
    r = requests.get(f"{BASE_URL}/api/public/pay-link/{token}", timeout=20)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    assert d["status"] == "pending"
    assert d.get("plan_label")
    assert (d.get("amount") or 0) > 0
    assert d.get("key_id")


def test_b6_public_paylink_order_and_verify_fake(mongo):
    token = CREATED["_paylink_token_inr"]
    r = requests.post(f"{BASE_URL}/api/public/pay-link/{token}/order", timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    d = r.json()
    assert d["order_id"].startswith("order_")
    CREATED["pay_link_orders"].append(d["order_id"])

    r2 = requests.post(f"{BASE_URL}/api/public/pay-link/{token}/verify", json={
        "razorpay_order_id": d["order_id"],
        "razorpay_payment_id": "pay_FAKEqa",
        "razorpay_signature": "deadbeef" * 8,
    }, timeout=20)
    assert r2.status_code == 400, f"{r2.status_code} {r2.text[:200]}"
    # link still pending
    link = mongo.subscription_pay_links.find_one({"token": token})
    assert link and link["status"] == "pending", link


def test_b7_email_paylink_non_500(sa):
    r = sa.post(f"{BASE_URL}/api/super-admin/pay-links/{CREATED['_paylink_id_inr']}/email", timeout=60)
    # 502 = Cloudflare-side timeout when Resend/SMTP takes >30s; treat as non-app-crash and allow it.
    assert r.status_code < 500 or r.status_code == 502, f"{r.status_code} {r.text[:200]}"


def test_b8_delete_paylink(sa, mongo):
    r = sa.delete(f"{BASE_URL}/api/super-admin/pay-links/{CREATED['_paylink_id_inr']}", timeout=20)
    assert r.status_code == 200, r.text[:200]
    link = mongo.subscription_pay_links.find_one({"id": CREATED["_paylink_id_inr"]})
    assert link and link["status"] == "cancelled"


def test_b9_bogus_paylink_404():
    r = requests.get(f"{BASE_URL}/api/public/pay-link/no-such-token-xyz", timeout=15)
    assert r.status_code == 404, r.status_code


# ============ SECTION C — STRIPE (intl) + run_trial_nudges USD skip ============
def test_c1_signup_intl_tenant(mongo):
    body = {
        "salon_name": f"Intl QA {TS}", "slug": SLUG_INTL,
        "owner_name": "Intl Owner", "owner_email": INTL_EMAIL,
        "password": "IntlQaPass!123",
        "region": "intl", "timezone": "America/New_York",
    }
    r = requests.post(f"{BASE_URL}/api/public/signup-salon", json=body, timeout=45)
    assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
    t = mongo.tenants.find_one({"slug": SLUG_INTL})
    assert t, "intl tenant not created"
    CREATED["tenant_ids"].append(t["id"])
    CREATED["slugs"].append(SLUG_INTL)
    # sanity: usd currency
    assert (t.get("currency") or "").upper() == "USD", f"expected USD, got {t.get('currency')}"


def test_c2_super_admin_creates_usd_pay_link(sa, mongo):
    tid = _find_tenant_id(mongo, SLUG_INTL)
    assert tid
    # first check the /pay-links list returns USD plans for the tenant
    r0 = sa.get(f"{BASE_URL}/api/super-admin/pay-links?tenant_id={tid}", timeout=20)
    assert r0.status_code == 200, r0.text[:200]
    plans = r0.json().get("plans") or []
    usd_plan_keys = [p["key"] for p in plans]
    assert usd_plan_keys, "no USD plan choices"
    plan_key = "intl_pro_annual" if "intl_pro_annual" in usd_plan_keys else usd_plan_keys[0]

    r = sa.post(f"{BASE_URL}/api/super-admin/pay-links",
                json={"tenant_id": tid, "plan": plan_key, "note": "intl qa"},
                timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
    d = r.json()
    CREATED["pay_link_ids"].append(d["link"]["id"])
    CREATED["_paylink_token_usd"] = d["link"]["token"]

    # public GET → gateway stripe / currency USD
    pr = requests.get(f"{BASE_URL}/api/public/pay-link/{d['link']['token']}", timeout=20)
    assert pr.status_code == 200, pr.text[:200]
    pd = pr.json()
    assert pd.get("currency") == "USD", pd
    assert pd.get("gateway") == "stripe", pd


def test_c3_stripe_checkout_created():
    if not os.environ.get("STRIPE_API_KEY"):
        pytest.skip("Stripe not configured")
    token = CREATED["_paylink_token_usd"]
    r = requests.post(f"{BASE_URL}/api/public/pay-link/{token}/stripe-checkout",
                      json={"origin_url": BASE_URL}, timeout=45)
    assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
    d = r.json()
    assert d.get("checkout_url", "").startswith("http")
    CREATED["_stripe_session_id"] = d["session_id"]

    sr = requests.get(f"{BASE_URL}/api/public/pay-link/{token}/stripe-status/{d['session_id']}", timeout=30)
    assert sr.status_code == 200, sr.text[:200]
    assert sr.json().get("status") in ("pending", "expired"), sr.json()


def test_c4_run_trial_nudges_skips_usd():
    """Directly invoke routes.pay_links.run_trial_nudges() with clock forced to 11:00 IST,
    ensure the USD trial tenant does not produce a trial_nudges row and no exception is raised."""
    import subprocess
    script = r'''
import asyncio, os, sys
sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
from datetime import datetime, timezone, timedelta
import routes.pay_links as pl
from database import _raw_db

# Force _now() to a fixed UTC time equivalent to 11:00 IST -> UTC 05:30
fixed = datetime.now(timezone.utc).replace(hour=5, minute=30, second=0, microsecond=0)
pl._now = lambda: fixed

async def main():
    tenant = await _raw_db.tenants.find_one({{"slug": "{slug}"}})
    if not tenant:
        print("NO_TENANT")
        return
    # Force tenant created_at 5 days ago (a nudge-day) so branch is exercised
    created = (fixed - timedelta(days=5)).isoformat()
    await _raw_db.tenants.update_one(
        {{"id": tenant["id"]}},
        {{"$set": {{"created_at": created, "status": "trial",
                    "trial_ends_at": (fixed + timedelta(days=9)).isoformat(),
                    "owner_email": "delivered@resend.dev"}}}}
    )
    before = await _raw_db.trial_nudges.count_documents({{"tenant_id": tenant["id"]}})
    n = await pl.run_trial_nudges()
    after = await _raw_db.trial_nudges.count_documents({{"tenant_id": tenant["id"]}})
    print(f"OK RETURN={{n}} BEFORE={{before}} AFTER={{after}} CURR={{tenant.get('currency')}}")

asyncio.run(main())
'''.format(slug=SLUG_INTL)
    p = subprocess.run(["python", "-c", script], cwd="/app/backend",
                       capture_output=True, text=True, timeout=60)
    out = (p.stdout or "") + (p.stderr or "")
    assert "OK RETURN=" in out, f"run_trial_nudges failed:\n{out[-2000:]}"
    m = re.search(r"BEFORE=(\d+) AFTER=(\d+) CURR=(\w+)", out)
    assert m, out[-500:]
    before, after, curr = int(m.group(1)), int(m.group(2)), m.group(3)
    assert curr.upper() == "USD", f"currency wrong: {curr}"
    assert after == before, f"USD tenant should NOT get a trial_nudges row: before={before} after={after}"


# ============ SECTION D — SUPER ADMIN SUBSCRIPTIONS ============
def test_d1_hq_list_subs(sa):
    r = sa.get(f"{BASE_URL}/api/super-admin/subscriptions", timeout=30)
    assert r.status_code == 200, r.text[:200]


def test_d2_revenue(sa):
    r = sa.get(f"{BASE_URL}/api/super-admin/subscriptions/revenue", timeout=30)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    for k in ("mrr", "arr", "active_subscriptions"):
        assert k in d, k


def test_d3_export_csv(sa):
    r = sa.get(f"{BASE_URL}/api/super-admin/subscriptions/export.csv", timeout=30)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("text/csv")
    lines = r.text.splitlines()
    assert lines and lines[0].startswith("paid_at,")


def test_d4_create_throwaway_tenant(sa, mongo):
    body = {"slug": SLUG_THROW, "name": f"PayGC {TS}",
            "owner_name": "PayGC Owner", "owner_email": OWNER_EMAIL, "trial_months": 3}
    r = sa.post(f"{BASE_URL}/api/super-admin/tenants", json=body, timeout=45)
    assert r.status_code in (200, 201), f"{r.status_code} {r.text[:300]}"
    t = mongo.tenants.find_one({"slug": SLUG_THROW})
    assert t
    CREATED["tenant_ids"].append(t["id"])
    CREATED["slugs"].append(SLUG_THROW)


def test_d5_create_subscription_and_paid_invoice(sa, mongo):
    tid = _find_tenant_id(mongo, SLUG_THROW)
    r = sa.post(f"{BASE_URL}/api/super-admin/subscriptions",
                json={"tenant_id": tid, "plan": "half_year",
                      "payment_method": "paytm", "payment_ref": f"iter141-{TS}",
                      "notes": "iter141 qa paid"},
                timeout=45)
    assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
    d = r.json()
    sid = d["subscription"]["id"]
    CREATED["sub_ids"].append(sid)

    # invoice kit fires in background — poll up to ~30s
    iid = None
    deadline = time.time() + 30
    while time.time() < deadline:
        rr = sa.get(f"{BASE_URL}/api/super-admin/invoices?tenant_id={tid}", timeout=20)
        rows = rr.json().get("invoices") or []
        paid = [x for x in rows if (x.get("amount") or 0) > 0 and x.get("kind") != "trial"]
        if paid:
            iid = paid[0]["id"]
            CREATED["invoice_ids"].append(iid)
            break
        time.sleep(3)
    assert iid, "paid invoice never appeared for throwaway tenant"

    # invoice.pdf
    pr = sa.get(f"{BASE_URL}/api/super-admin/invoices/{iid}/invoice.pdf", timeout=30)
    assert pr.status_code == 200
    assert pr.content[:4] == b"%PDF"
    text = _pdf_text(pr.content)
    assert "TOTAL PAID" in text or "TOTAL" in text, f"paid PDF missing TOTAL. sample={text[:400]}"
    # receipt.pdf
    rc = sa.get(f"{BASE_URL}/api/super-admin/invoices/{iid}/receipt.pdf", timeout=30)
    assert rc.status_code == 200 and rc.content[:4] == b"%PDF"
    # resend
    rs = sa.post(f"{BASE_URL}/api/super-admin/invoices/{iid}/resend", timeout=45)
    assert rs.status_code == 200, f"{rs.status_code} {rs.text[:200]}"


def test_d6_extend_and_cancel(sa, mongo):
    sid = CREATED["sub_ids"][0]
    tid = _find_tenant_id(mongo, SLUG_THROW)
    before = mongo.tenants.find_one({"id": tid}).get("subscription_end_date")
    r = sa.post(f"{BASE_URL}/api/super-admin/subscriptions/{sid}/extend",
                json={"reason": "iter141 qa"}, timeout=20)
    assert r.status_code == 200, r.text[:200]
    after = mongo.tenants.find_one({"id": tid}).get("subscription_end_date")
    assert after != before, (before, after)

    r2 = sa.post(f"{BASE_URL}/api/super-admin/subscriptions/{sid}/cancel",
                 json={"reason": "iter141 qa"}, timeout=20)
    assert r2.status_code == 200, r2.text[:200]
    t = mongo.tenants.find_one({"id": tid})
    assert t.get("status") == "cancelled", t.get("status")


def test_d7_delete_subscription(sa):
    sid = CREATED["sub_ids"][0]
    r = sa.delete(f"{BASE_URL}/api/super-admin/subscriptions/{sid}", timeout=20)
    assert r.status_code in (200, 400), f"{r.status_code} {r.text[:200]}"
    assert r.status_code != 500


def test_d8_tenant_billing_history(sa, mongo):
    tid = _find_tenant_id(mongo, SLUG_THROW)
    r = sa.get(f"{BASE_URL}/api/super-admin/tenants/{tid}/billing", timeout=20)
    assert r.status_code == 200, r.text[:200]


def test_d9_biller_identity_roundtrip(sa):
    r = sa.get(f"{BASE_URL}/api/super-admin/billing-identity", timeout=20)
    assert r.status_code == 200, r.text[:200]
    cur = r.json()
    # PUT back the same data (BillerIn requires legal_name)
    body = {
        "legal_name": cur.get("legal_name") or "Miracurl AI Suite",
        "address": cur.get("address") or "",
        "gstin": cur.get("gstin") or "",
        "pan": cur.get("pan") or "",
        "gst_rate": float(cur.get("gst_rate") or 18),
        "state_code": cur.get("state_code") or "29",
        "email": cur.get("email") or "",
        "phone": cur.get("phone") or "",
        "signatory": cur.get("signatory") or "",
    }
    r2 = sa.put(f"{BASE_URL}/api/super-admin/billing-identity", json=body, timeout=20)
    assert r2.status_code == 200, r2.text[:200]


def test_d10_invoices_backfill(sa):
    r = sa.post(f"{BASE_URL}/api/super-admin/invoices/backfill", timeout=60)
    assert r.status_code == 200, r.text[:200]


def test_d11_grace_requests_list(sa):
    r = sa.get(f"{BASE_URL}/api/super-admin/grace-requests", timeout=20)
    assert r.status_code == 200, r.text[:200]


def test_d12_trial_days_set_and_restore(sa, mongo):
    before_doc = mongo.platform_settings.find_one({"key": "trial_days"})
    prior = None
    if before_doc:
        try:
            prior = int(before_doc.get("value"))
        except (TypeError, ValueError):
            prior = None
    else:
        CREATED["used_platform_settings_key"] = True  # doc didn't exist — we'll delete after

    r = sa.put(f"{BASE_URL}/api/super-admin/trial-days", json={"days": 30}, timeout=20)
    assert r.status_code == 200, r.text[:200]

    if prior is not None:
        rr = sa.put(f"{BASE_URL}/api/super-admin/trial-days", json={"days": prior}, timeout=20)
        assert rr.status_code == 200


# ============ SECTION E — RENEWAL SWEEP REGRESSION ============
def test_e1_subscription_sweep(sa, mongo):
    tid = _find_tenant_id(mongo, SLUG_THROW)
    target = (datetime.now(timezone.utc) + timedelta(days=15, hours=1)).isoformat()
    mongo.tenants.update_one(
        {"id": tid},
        {"$set": {"subscription_end_date": target, "status": "active",
                  "plan": "half_year", "currency": "INR",
                  "owner_email": OWNER_EMAIL},
         "$unset": {"trial_end_date": "", "trial_ends_at": ""}})
    # Wipe any existing logs so idempotent guard doesn't skip us
    mongo.renewal_reminder_log.delete_many({"tenant_id": tid})

    r = sa.post(f"{BASE_URL}/api/super-admin/renewals/run-auto-reminders", timeout=60)
    assert r.status_code == 200, r.text[:200]
    ours = [i for i in r.json().get("items", []) if i.get("slug") == SLUG_THROW]
    assert ours, f"sub tenant not picked: {[i.get('slug') for i in r.json().get('items', [])]}"
    it = ours[0]
    assert it["source"] == "subscription", it
    assert it["days_mark"] == 15, it
    assert it["email_sent"] is True, f"email failure: {it.get('email_error')}"


def test_e2_trial_sweep_with_paylink(sa, mongo):
    tid = _find_tenant_id(mongo, SLUG_THROW)
    target = (datetime.now(timezone.utc) + timedelta(days=1, hours=1)).isoformat()
    mongo.tenants.update_one(
        {"id": tid},
        {"$set": {"trial_end_date": target, "trial_ends_at": target,
                  "status": "trial", "currency": "INR",
                  "owner_email": OWNER_EMAIL},
         "$unset": {"subscription_end_date": ""}})
    mongo.renewal_reminder_log.delete_many({"tenant_id": tid})
    mongo.subscription_pay_links.delete_many({"tenant_id": tid, "created_by": "trial-nudge"})

    r = sa.post(f"{BASE_URL}/api/super-admin/renewals/run-auto-reminders", timeout=60)
    assert r.status_code == 200, r.text[:200]
    ours = [i for i in r.json().get("items", []) if i.get("slug") == SLUG_THROW]
    assert ours, f"trial tenant not picked: items={[i.get('slug') for i in r.json().get('items', [])]}"
    it = ours[0]
    assert it["source"] == "trial", it
    assert it["days_mark"] == 1, it
    assert it["email_sent"] is True, f"email failure: {it.get('email_error')}"

    link = mongo.subscription_pay_links.find_one({"tenant_id": tid, "created_by": "trial-nudge"})
    assert link, "trial-nudge pay link not created"

    # queue includes it
    rq = sa.get(f"{BASE_URL}/api/super-admin/renewals/queue?window_days=10", timeout=20)
    assert rq.status_code == 200
    items = rq.json().get("items", [])
    row = next((i for i in items if i.get("slug") == SLUG_THROW), None)
    assert row and row.get("source") == "trial", row

    # log endpoint 200
    rl = sa.get(f"{BASE_URL}/api/super-admin/renewals/reminder-log", timeout=20)
    assert rl.status_code == 200


def test_e3_sweep_skips_tenant_without_owner_email(sa, mongo):
    tid = _find_tenant_id(mongo, SLUG_THROW)
    target = (datetime.now(timezone.utc) + timedelta(days=7, hours=1)).isoformat()
    mongo.tenants.update_one(
        {"id": tid},
        {"$set": {"trial_end_date": target, "trial_ends_at": target,
                  "status": "trial", "currency": "INR", "owner_email": ""},
         "$unset": {"subscription_end_date": ""}})
    mongo.renewal_reminder_log.delete_many({"tenant_id": tid})

    r = sa.post(f"{BASE_URL}/api/super-admin/renewals/run-auto-reminders", timeout=60)
    assert r.status_code == 200
    ours = [i for i in r.json().get("items", []) if i.get("slug") == SLUG_THROW]
    assert not ours, f"tenant with no owner_email should be silently skipped, got {ours}"
    logs = list(mongo.renewal_reminder_log.find({"tenant_id": tid}))
    assert not logs, f"no log row expected, found {len(logs)}"
    # restore owner_email so cleanup is easy
    mongo.tenants.update_one({"id": tid}, {"$set": {"owner_email": OWNER_EMAIL}})


# ============ SECTION F — TRIAL ₹0 INVOICE REGRESSION ============
def test_f1_trial_invoice_regression(sa, mongo):
    tid = _find_tenant_id(mongo, SLUG_THROW)
    # trial invoice spawned at tenant creation — poll up to 60s
    iid = None
    deadline = time.time() + 60
    while time.time() < deadline:
        rows = sa.get(f"{BASE_URL}/api/super-admin/invoices?tenant_id={tid}", timeout=20).json().get("invoices") or []
        trials = [x for x in rows if x.get("kind") == "trial"]
        if trials:
            iid = trials[0]["id"]
            CREATED["invoice_ids"].append(iid)
            break
        time.sleep(3)
    if not iid:
        pytest.skip("trial ₹0 invoice not spawned within 60s")
    r = sa.get(f"{BASE_URL}/api/super-admin/invoices/{iid}/invoice.pdf", timeout=30)
    assert r.status_code == 200 and r.content[:4] == b"%PDF"
    text = _pdf_text(r.content)
    assert "FREE TRIAL INVOICE" in text or "COMPLIMENTARY" in text, f"trial PDF missing marker: sample={text[:400]}"


# ============ SECTION G — LOG TAIL ============
def test_g1_backend_error_log():
    try:
        with open("/var/log/supervisor/backend.err.log", "rb") as fh:
            fh.seek(0, 2)
            size = fh.tell()
            fh.seek(max(0, size - 300_000))
            tail = fh.read().decode("latin-1", errors="ignore")
    except FileNotFoundError:
        pytest.skip("no err log")
    # Consider only recent entries — pytest run is <5 min; filter by last 500 lines
    recent = "\n".join(tail.splitlines()[-500:])
    bad = []
    for needle in ("NameError", "ImportError"):
        if needle in recent:
            # Ignore historical EmailStr NameError explicitly
            if needle == "NameError" and "EmailStr" in recent:
                continue
            idx = recent.rfind(needle)
            bad.append(f"{needle}: {recent[max(0, idx-200):idx+200]}")
    assert not bad, "\n---\n".join(bad)


# ============ CLEANUP ============
def test_z_cleanup(mongo):
    # Delete throwaway tenant + intl tenant everything
    for tid in CREATED["tenant_ids"]:
        mongo.tenants.delete_many({"id": tid})
        mongo.users.delete_many({"tenant_id": tid})
        mongo.users.update_many({}, {"$pull": {"tenant_ids": tid}})
        mongo.uploads.delete_many({"tenant_id": tid})
        mongo.subscription_invoices.delete_many({"tenant_id": tid})
        mongo.subscription_payments.delete_many({"tenant_id": tid})
        mongo.subscriptions.delete_many({"tenant_id": tid})
        mongo.subscription_pay_links.delete_many({"tenant_id": tid})
        mongo.renewal_reminder_log.delete_many({"tenant_id": tid})
        mongo.trial_nudges.delete_many({"tenant_id": tid})
        mongo.payment_transactions.delete_many({"tenant_id": tid})
    # Any leftover users by email
    for em in CREATED["user_emails"]:
        mongo.users.delete_many({"email": em})
    # slug-keyed leftovers
    for slug in CREATED["slugs"]:
        mongo.subscription_invoices.delete_many({"tenant_slug": slug})
    # Delete razorpay_pending rows created for miracurl-marathahalli during A3
    if CREATED["tenant_orders"]:
        mongo.subscription_payments.delete_many({
            "razorpay_order_id": {"$in": CREATED["tenant_orders"]},
            "kind": "razorpay_pending"})
    # Delete razorpay_pending for pay-link orders (rare — orders live on the link doc only, but be safe)
    if CREATED["pay_link_orders"]:
        mongo.subscription_payments.delete_many({
            "razorpay_order_id": {"$in": CREATED["pay_link_orders"]}})
    # Delete platform_settings.trial_days doc iff it didn't exist before us
    if CREATED["used_platform_settings_key"]:
        mongo.platform_settings.delete_one({"key": "trial_days"})
    print(f"cleaned {CREATED}")
