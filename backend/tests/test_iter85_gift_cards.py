"""Iter 85 — Gift Cards feature (public purchase, UPI/Razorpay, admin confirm, POS redeem)."""
import os
import time
from datetime import date, timedelta

import pytest
import requests

from creds import password_for

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
SLUG = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
OWNER_PIN = "4321"


@pytest.fixture(scope="module")
def public_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "X-Tenant-Slug": SLUG,
        "X-Owner-Pin": OWNER_PIN,
    })
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": password_for(ADMIN_EMAIL)},
               headers={"X-Tenant-Slug": SLUG})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    return s


# -------- config --------

def test_public_config_default(public_client):
    r = public_client.get(f"{BASE_URL}/api/public/gift-cards/{SLUG}/config")
    assert r.status_code == 200
    d = r.json()
    assert d["enabled"] == True
    assert len(d["occasions"]) == 12
    assert d["salon"]["name"]
    assert d["payment"]["razorpay"] == True, "HQ Razorpay fallback should enable razorpay for main tenant"
    assert isinstance(d["amounts"], list) and len(d["amounts"]) >= 1


# -------- settings PUT/GET (admin) --------

def test_admin_set_upi_and_masked_secret(admin_client, public_client):
    # First GET current
    r = admin_client.get(f"{BASE_URL}/api/gift-cards/settings")
    assert r.status_code == 200
    cur = r.json()
    payload = {
        "enabled": True,
        "razorpay_key_id": cur.get("razorpay_key_id", ""),
        "razorpay_key_secret": "••••••",  # keep existing
        "upi_id": "testsalon@upi",
        "validity_days": cur.get("validity_days") or 180,
        "amounts": cur.get("amounts") or [500, 1000, 2000, 5000],
    }
    r = admin_client.put(f"{BASE_URL}/api/gift-cards/settings", json=payload)
    assert r.status_code == 200 and r.json().get("ok")

    r = admin_client.get(f"{BASE_URL}/api/gift-cards/settings")
    assert r.status_code == 200
    d = r.json()
    assert d["upi_id"] == "testsalon@upi"
    # If a secret exists it should be masked; if empty, blank ok
    assert d["razorpay_key_secret"] in ("••••••", "")

    # Public config now reflects UPI
    d2 = public_client.get(f"{BASE_URL}/api/public/gift-cards/{SLUG}/config").json()
    assert d2["payment"]["upi"] == True
    assert d2["payment"]["upi_id"] == "testsalon@upi"


# -------- UPI purchase full flow --------

@pytest.fixture(scope="module")
def upi_order(public_client, admin_client):
    body = {
        "occasion": "birthday",
        "amount": 1000,
        "buyer_name": "Buyer Test",
        "buyer_email": "buyer.test@gmail.com",
        "buyer_phone": "9998887777",
        "recipient_name": "Recipient Test",
        "recipient_email": "recip.test@gmail.com",
        "message": "Happy Birthday!",
        "send_on": "",
        "pay_method": "upi",
    }
    r = public_client.post(f"{BASE_URL}/api/public/gift-cards/{SLUG}/order", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_upi_order_returns_upi_link(upi_order):
    assert "upi_id" in upi_order and upi_order["upi_id"] == "testsalon@upi"
    assert upi_order["upi_link"].startswith("upi://pay?")
    assert "gift_card_id" in upi_order


def test_upi_paid_and_admin_confirm(public_client, admin_client, upi_order):
    gcid = upi_order["gift_card_id"]
    r = public_client.post(f"{BASE_URL}/api/public/gift-cards/{gcid}/upi-paid",
                           json={"upi_ref": "UPIREF12345"})
    assert r.status_code == 200
    assert r.json().get("status") == "awaiting_confirmation"

    # admin listing
    r = admin_client.get(f"{BASE_URL}/api/gift-cards")
    assert r.status_code == 200
    d = r.json()
    assert d["stats"]["awaiting"] >= 1
    assert any(x["id"] == gcid for x in d["items"])

    # confirm
    r = admin_client.post(f"{BASE_URL}/api/gift-cards/{gcid}/confirm")
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "active"
    assert d["code"].startswith("GC-") and len(d["code"]) == 12
    assert d["expires_at"]
    # ~180 days out
    exp = date.fromisoformat(d["expires_at"])
    days = (exp - date.today()).days
    assert 170 <= days <= 185, f"expires_at ~180d expected, got {days}"

    pytest.gc_code = d["code"]
    pytest.gc_id = gcid


# -------- Razorpay order path --------

def test_razorpay_order_path(public_client):
    body = {
        "occasion": "anniversary",
        "amount": 500,
        "buyer_name": "Rzp Buyer",
        "buyer_email": "rzp.buyer@gmail.com",
        "recipient_name": "Rzp Recip",
        "recipient_email": "rzp.recip@gmail.com",
        "pay_method": "razorpay",
    }
    r = public_client.post(f"{BASE_URL}/api/public/gift-cards/{SLUG}/order", json=body)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["order_id"].startswith("order_")
    assert d["key_id"].startswith("rzp_")
    assert d["amount"] == 50000  # paise


def test_razorpay_verify_wrong_signature(public_client):
    body = {
        "occasion": "birthday",
        "amount": 500,
        "buyer_name": "Sig Buyer",
        "buyer_email": "sig.buyer@gmail.com",
        "recipient_name": "Sig Recip",
        "recipient_email": "sig.recip@gmail.com",
        "pay_method": "razorpay",
    }
    r = public_client.post(f"{BASE_URL}/api/public/gift-cards/{SLUG}/order", json=body)
    order_id = r.json()["order_id"]
    r = public_client.post(f"{BASE_URL}/api/public/gift-cards/verify", json={
        "razorpay_order_id": order_id,
        "razorpay_payment_id": "pay_FAKE",
        "razorpay_signature": "BADSIGNATURE",
    })
    assert r.status_code == 400
    assert "sig" in r.text.lower() or "fail" in r.text.lower()


# -------- Scheduled delivery --------

def test_scheduled_delivery(public_client, admin_client):
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    body = {
        "occasion": "just-because",
        "amount": 700,
        "buyer_name": "Sched Buyer",
        "buyer_email": "sched.buyer@gmail.com",
        "recipient_name": "Sched Recip",
        "recipient_email": "sched.recip@gmail.com",
        "send_on": tomorrow,
        "pay_method": "upi",
    }
    r = public_client.post(f"{BASE_URL}/api/public/gift-cards/{SLUG}/order", json=body)
    assert r.status_code == 200
    gcid = r.json()["gift_card_id"]
    r = public_client.post(f"{BASE_URL}/api/public/gift-cards/{gcid}/upi-paid", json={"upi_ref": "SCH1"})
    assert r.status_code == 200
    r = admin_client.post(f"{BASE_URL}/api/gift-cards/{gcid}/confirm")
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "scheduled"
    assert d["code"] == ""  # code hidden until send date
    assert d["send_on"] == tomorrow


# -------- Validation --------

def test_validation_bad_email(public_client):
    body = {"occasion": "birthday", "amount": 500, "buyer_name": "AB",
            "buyer_email": "not-an-email", "recipient_name": "CD",
            "recipient_email": "cd@gmail.com", "pay_method": "upi"}
    r = public_client.post(f"{BASE_URL}/api/public/gift-cards/{SLUG}/order", json=body)
    assert r.status_code == 400


def test_validation_unknown_occasion(public_client):
    body = {"occasion": "bogus", "amount": 500, "buyer_name": "AB",
            "buyer_email": "ab@gmail.com", "recipient_name": "CD",
            "recipient_email": "cd@gmail.com", "pay_method": "upi"}
    r = public_client.post(f"{BASE_URL}/api/public/gift-cards/{SLUG}/order", json=body)
    assert r.status_code == 400


def test_validation_amount_zero(public_client):
    body = {"occasion": "birthday", "amount": 0, "buyer_name": "AB",
            "buyer_email": "ab@gmail.com", "recipient_name": "CD",
            "recipient_email": "cd@gmail.com", "pay_method": "upi"}
    r = public_client.post(f"{BASE_URL}/api/public/gift-cards/{SLUG}/order", json=body)
    assert r.status_code == 422


# -------- POS redemption --------

def test_pos_check_and_redeem(admin_client):
    code = getattr(pytest, "gc_code", None)
    assert code, "prior test must have produced code"
    r = admin_client.post(f"{BASE_URL}/api/gift-cards/check", json={"code": code})
    assert r.status_code == 200
    d = r.json()
    assert d["valid"] == True
    assert d["balance"] == 1000

    # Get a customer + a service
    cust = admin_client.get(f"{BASE_URL}/api/customers").json()
    cust_id = cust["items"][0]["id"] if isinstance(cust, dict) and "items" in cust else cust[0]["id"]
    svcs = admin_client.get(f"{BASE_URL}/api/services").json()
    svc = (svcs["items"] if isinstance(svcs, dict) and "items" in svcs else svcs)[0]

    inv_body = {
        "customer_id": cust_id,
        "items": [{"type": "service", "ref_id": svc["id"], "name": svc["name"],
                   "price": 400, "qty": 1}],
        "payment_mode": "cash",
        "gift_card_code": code,
    }
    r = admin_client.post(f"{BASE_URL}/api/invoices", json=inv_body)
    assert r.status_code == 200, r.text
    inv = r.json()
    assert inv.get("gift_card_applied", 0) > 0
    assert inv.get("gift_card_balance_left") is not None
    applied = inv["gift_card_applied"]
    left = inv["gift_card_balance_left"]

    # Recheck balance
    r = admin_client.post(f"{BASE_URL}/api/gift-cards/check", json={"code": code})
    d = r.json()
    assert d["valid"] == True
    assert abs(d["balance"] - left) < 0.01
    assert d["balance"] < 1000  # reduced


# -------- Cancel flow --------

def test_cancel_makes_code_invalid(admin_client, public_client):
    # Create a fresh card via UPI + confirm
    body = {"occasion": "thank-you", "amount": 300, "buyer_name": "Cx",
            "buyer_email": "cx@gmail.com", "recipient_name": "Cy",
            "recipient_email": "cy@gmail.com", "pay_method": "upi"}
    r = public_client.post(f"{BASE_URL}/api/public/gift-cards/{SLUG}/order", json=body)
    gcid = r.json()["gift_card_id"]
    public_client.post(f"{BASE_URL}/api/public/gift-cards/{gcid}/upi-paid", json={"upi_ref": "X"})
    r = admin_client.post(f"{BASE_URL}/api/gift-cards/{gcid}/confirm")
    code = r.json()["code"]

    r = admin_client.post(f"{BASE_URL}/api/gift-cards/{gcid}/cancel")
    assert r.status_code == 200

    r = admin_client.post(f"{BASE_URL}/api/gift-cards/check", json={"code": code})
    d = r.json()
    assert d["valid"] == False
