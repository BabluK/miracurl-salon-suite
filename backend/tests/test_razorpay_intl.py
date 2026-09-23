"""Backend tests: Razorpay INR + International (USD) order creation, csrf, cleanup.

Covers review request:
- POST /api/billing/razorpay/order with intl_starter_monthly (USD, $39)
- POST with intl_pro_annual ($790) -> 400 with 'international per-transaction limit'
- POST with half_year (INR, GST 18%) -> 200 amount 1416000
"""
import os
import pytest
import requests

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
SALON_PASSWORD = "q6QY@tn3p#9DtL"
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
    # Refresh cookie CSRF if applicable
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


def test_intl_starter_monthly_creates_usd_order(salon_session, created_order_ids):
    r = salon_session.post(f"{API}/billing/razorpay/order",
                           json={"plan": "intl_starter_monthly"})
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    d = r.json()
    assert d["currency"] == "USD"
    assert d["amount"] == 3900, f"expected 3900 cents, got {d['amount']}"
    assert isinstance(d["order_id"], str) and d["order_id"].startswith("order_")
    created_order_ids.append(d["order_id"])


def test_intl_pro_annual_rejected_with_friendly_400(salon_session):
    r = salon_session.post(f"{API}/billing/razorpay/order",
                           json={"plan": "intl_pro_annual"})
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:300]}"
    detail = (r.json().get("detail") or "").lower()
    assert "international per-transaction limit" in detail, f"detail was: {detail}"


def test_inr_half_year_regression_gst_applied(salon_session, created_order_ids):
    r = salon_session.post(f"{API}/billing/razorpay/order",
                           json={"plan": "half_year"})
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    d = r.json()
    assert d["currency"] == "INR"
    # 12000 * 6 = ... Expected total amount in paise = 1,416,000 (₹14,160 = ₹12,000 + 18% GST)
    assert d["amount"] == 1416000, f"expected 1416000 paise, got {d['amount']}"
    created_order_ids.append(d["order_id"])


def test_zzz_cleanup(created_order_ids):
    """Runs last (alphabetical) to remove pending docs we created."""
    _cleanup(created_order_ids)
