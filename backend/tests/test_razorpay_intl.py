"""Backend tests: Razorpay INR + International (USD) order creation with instalments.

Covers iteration 197 review request:
- POST /api/billing/razorpay/order with intl_starter_monthly (USD $39) -> installments 1, amount 3900
- POST with intl_pro_annual ($790) -> 200, installments 2, amount 39500 (cents), payable 395,
  installment_note non-empty. Mongo pending doc has installments=2, currency=USD.
- POST with half_year (INR, GST 18%) -> 200 currency INR, amount 1416000 (paise)
- Cleanup: deletes pending docs (status 'created') created during this run
"""
import os
import pytest
import requests
from _creds import pw


def _load_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        try:
            for line in open("/app/frontend/.env"):
                if line.startswith("REACT_APP_BACKEND_URL="):
                    v = line.split("=", 1)[1].strip()
                    break
        except FileNotFoundError:
            pass
    assert v, "REACT_APP_BACKEND_URL missing"
    return v.rstrip("/")


BASE_URL = _load_url()
API = f"{BASE_URL}/api"

SALON_EMAIL = "admin@miracurl.com"
SALON_PASSWORD = pw("SALON_ADMIN")
SALON_SLUG = "miracurl-marathahalli"
OWNER_PIN = "4321"


@pytest.fixture(scope="module")
def salon_session():
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Origin": BASE_URL,
        "X-Tenant-Slug": SALON_SLUG,
        "X-Owner-Pin": OWNER_PIN,
    })
    r = s.post(f"{API}/auth/login",
               json={"email": SALON_EMAIL, "password": SALON_PASSWORD},
               headers={"X-Tenant-Slug": SALON_SLUG, "Origin": BASE_URL})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def created_order_ids():
    return []


def _cleanup(order_ids):
    if not order_ids:
        return
    try:
        import sys
        sys.path.insert(0, "/app/backend")
        from pymongo import MongoClient
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")
        client = MongoClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        res = db.subscription_payments.delete_many({
            "razorpay_order_id": {"$in": order_ids},
            "kind": "razorpay_pending",
            "status": "created",
        })
        print(f"cleanup: deleted {res.deleted_count} pending payment docs")
    except Exception as e:
        print(f"cleanup failed: {e}")


# ---------------- USD monthly (<= $500) — no instalments ----------------
def test_intl_starter_monthly_full_amount(salon_session, created_order_ids):
    r = salon_session.post(f"{API}/billing/razorpay/order",
                           json={"plan": "intl_starter_monthly"})
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    d = r.json()
    assert d["currency"] == "USD"
    assert d["amount"] == 3900, f"expected 3900 cents, got {d['amount']}"
    assert d["installments"] == 1
    assert d.get("installment_note") in (None, "", False)
    assert d["order_id"].startswith("order_")
    created_order_ids.append(d["order_id"])


# ---------------- USD annual (> $500) — 2 instalments of half price ----------------
def test_intl_pro_annual_two_installments(salon_session, created_order_ids):
    r = salon_session.post(f"{API}/billing/razorpay/order",
                           json={"plan": "intl_pro_annual"})
    assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:300]}"
    d = r.json()
    assert d["currency"] == "USD"
    assert d["installments"] == 2, f"expected 2 installments, got {d.get('installments')}"
    assert d["amount"] == 39500, f"expected 39500 cents (half of $790), got {d['amount']}"
    assert d["payable"] == 395, f"expected payable=395, got {d.get('payable')}"
    note = d.get("installment_note") or ""
    assert note.strip(), "installment_note should be non-empty"
    assert d["order_id"].startswith("order_")
    created_order_ids.append(d["order_id"])

    # Verify Mongo pending doc
    import sys
    sys.path.insert(0, "/app/backend")
    from pymongo import MongoClient
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    client = MongoClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    doc = db.subscription_payments.find_one({"razorpay_order_id": d["order_id"]})
    assert doc is not None, "pending payment doc not found"
    assert doc.get("installments") == 2, f"mongo installments={doc.get('installments')}"
    assert doc.get("currency") == "USD"
    assert doc.get("kind") == "razorpay_pending"
    assert doc.get("status") == "created"


# ---------------- INR half_year regression: still INR + GST ----------------
def test_inr_half_year_regression_gst_applied(salon_session, created_order_ids):
    r = salon_session.post(f"{API}/billing/razorpay/order",
                           json={"plan": "half_year"})
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    d = r.json()
    assert d["currency"] == "INR"
    assert d["amount"] == 1416000, f"expected 1416000 paise, got {d['amount']}"
    created_order_ids.append(d["order_id"])


def test_zzz_cleanup(created_order_ids):
    """Runs last (alphabetical) to remove pending docs we created."""
    _cleanup(created_order_ids)
