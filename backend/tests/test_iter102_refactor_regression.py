"""
Iteration 102 regression tests: verifies pure-refactor changes to
- routes/auth.py (_subscription_gate/_subscription_deadline)
- routes/appointments_pos.py (create_invoice + helpers)
- routes/gift_cards.py (moved helpers to services.gift_card_service)
- routes/premium_membership.py (updated import)
- routes/eod_digests.py (_run_late_arrival_digests split)
- routes/crm.py (_run_birthday_emails split)
- routes/wallet_pass.py (unchanged; still imports premium_membership)

All flows must remain behaviorally identical to before refactor.
"""
import os
import uuid
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE}/api"
TENANT = "miracurl-marathahalli"
TENANT_ID = "83ab97b6-b481-4172-afd7-53a46c93317d"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PW = "q6QY@tn3p#9DtL"
MANAGER_EMAIL = "manager@miracurl.com"
MANAGER_PW = "Manager@1234"
OWNER_PIN = "4321"

created_invoice_ids: list = []
created_gift_card_ids: list = []


# ------------- fixtures -------------
@pytest.fixture(scope="module")
def admin_sess():
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "X-Tenant-Slug": TENANT,
        "X-Owner-Pin": OWNER_PIN,
    })
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:300]}"
    return s


@pytest.fixture(scope="module")
def manager_sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-Slug": TENANT})
    r = s.post(f"{API}/auth/login", json={"email": MANAGER_EMAIL, "password": MANAGER_PW})
    assert r.status_code == 200, f"manager login failed: {r.status_code} {r.text[:300]}"
    return s


@pytest.fixture(scope="module")
def customer(admin_sess):
    r = admin_sess.get(f"{API}/customers")
    assert r.status_code == 200
    lst = r.json()
    assert lst, "no customers found in tenant"
    # Pick a customer without huge wallet_balance ideally
    return lst[0]


@pytest.fixture(scope="module")
def service(admin_sess):
    r = admin_sess.get(f"{API}/services")
    assert r.status_code == 200
    lst = r.json()
    assert lst, "no services found in tenant"
    return lst[0]


# ------------- AUTH / subscription gate -------------
class TestAuthSubscriptionGate:
    def test_admin_login(self, admin_sess):
        r = admin_sess.get(f"{API}/auth/me")
        assert r.status_code == 200, r.text[:300]
        u = r.json()
        assert u.get("email") == ADMIN_EMAIL

    def test_manager_login(self, manager_sess):
        r = manager_sess.get(f"{API}/auth/me")
        assert r.status_code == 200, r.text[:300]
        u = r.json()
        assert u.get("email") == MANAGER_EMAIL


# ------------- INVOICE CREATION -------------
class TestInvoiceCreation:
    def test_create_completed_invoice_cash(self, admin_sess, customer, service):
        payload = {
            "customer_id": customer["id"],
            "items": [{
                "type": "service", "ref_id": service["id"],
                "name": service["name"], "qty": 1,
                "price": float(service.get("price") or 100),
            }],
            "payment_mode": "cash",
        }
        r = admin_sess.post(f"{API}/invoices", json=payload)
        assert r.status_code == 200, f"create invoice failed: {r.status_code} {r.text[:400]}"
        inv = r.json()
        assert inv.get("id")
        assert inv.get("invoice_no")
        assert inv.get("status") != "open"  # default completed (may be absent or 'completed')
        assert inv.get("payment_mode") == "cash"
        assert float(inv.get("total") or 0) > 0
        assert isinstance(inv.get("items"), list)
        created_invoice_ids.append(inv["id"])

    def test_create_open_invoice(self, admin_sess, customer, service):
        payload = {
            "customer_id": customer["id"],
            "items": [{
                "type": "service", "ref_id": service["id"],
                "name": service["name"], "qty": 1,
                "price": float(service.get("price") or 100),
            }],
            "payment_mode": "cash",
            "status": "open",
        }
        r = admin_sess.post(f"{API}/invoices", json=payload)
        assert r.status_code == 200, f"open invoice: {r.status_code} {r.text[:400]}"
        inv = r.json()
        assert inv.get("status") == "open"
        assert inv.get("id")
        created_invoice_ids.append(inv["id"])

    def test_invalid_customer_id_returns_400(self, admin_sess, service):
        payload = {
            "customer_id": f"nonexistent-{uuid.uuid4()}",
            "items": [{
                "type": "service", "ref_id": service["id"],
                "name": service["name"], "qty": 1,
                "price": 100.0,
            }],
            "payment_mode": "cash",
        }
        r = admin_sess.post(f"{API}/invoices", json=payload)
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text[:200]}"

    def test_wallet_apply_exceeds_balance(self, admin_sess, service):
        # Find a customer with known small wallet_balance (or 0)
        r = admin_sess.get(f"{API}/customers")
        assert r.status_code == 200
        cust = next(
            (c for c in r.json() if float(c.get("wallet_balance") or 0) < 5000),
            None,
        )
        assert cust, "no low-wallet customer available"
        bal = float(cust.get("wallet_balance") or 0)
        payload = {
            "customer_id": cust["id"],
            "items": [{
                "type": "service", "ref_id": service["id"],
                "name": service["name"], "qty": 1,
                "price": float(service.get("price") or 500),
            }],
            "payment_mode": "cash",
            "wallet_apply": bal + 10000,
        }
        r = admin_sess.post(f"{API}/invoices", json=payload)
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text[:300]}"
        detail = (r.json().get("detail") or "").lower()
        assert "wallet has only" in detail, f"unexpected error text: {detail}"


# ------------- POS GIFT CARD ISSUE -------------
class TestPosGiftCard:
    def test_issue_gift_card_via_pos_invoice(self, admin_sess, customer):
        payload = {
            "customer_id": customer["id"],
            "items": [{
                "type": "gift_card", "ref_id": "pos-gc",
                "name": "POS Gift Card", "qty": 1, "price": 500.0,
                "gift_meta": {
                    "occasion": "birthday",
                    "buyer_name": "TEST Buyer",
                    "buyer_email": "delivered@resend.dev",
                    "buyer_phone": "9812345670",
                    "recipient_name": "TEST Recipient",
                    "recipient_email": "delivered@resend.dev",
                    "recipient_whatsapp": "9812345670",
                    "message": "TEST regression",
                },
            }],
            "payment_mode": "cash",
        }
        r = admin_sess.post(f"{API}/invoices", json=payload)
        assert r.status_code == 200, f"pos gc invoice: {r.status_code} {r.text[:400]}"
        inv = r.json()
        created_invoice_ids.append(inv["id"])
        issued = inv.get("gift_cards_issued") or []
        assert len(issued) >= 1, f"no gift cards issued: {issued}"
        code = issued[0].get("code") or ""
        assert code.startswith("GC-"), f"unexpected gc code: {code!r}"


# ------------- GIFT CARD PUBLIC ENDPOINTS -------------
class TestGiftCardPublic:
    def test_config(self):
        r = requests.get(f"{API}/public/gift-cards/{TENANT}/config", timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        data = r.json()
        assert "amounts" in data or "amount_options" in data or data  # basic shape
        # Ensure at least one of the payment-related keys is present
        assert any(k in data for k in ("upi", "razorpay", "payment", "currency", "amounts"))

    def test_preview_email(self):
        r = requests.get(
            f"{API}/public/gift-cards/{TENANT}/preview-email",
            params={"occasion": "birthday", "amount": 1000},
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        data = r.json()
        assert "html" in data
        assert "GC-••••-••••" in data["html"], "masked GC code missing from preview"


# ------------- MEMBERSHIP PUBLIC CONFIG -------------
class TestMembershipPublicConfig:
    def test_config(self):
        r = requests.get(f"{API}/public/membership/{TENANT}/config", timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        data = r.json()
        assert isinstance(data, dict)


# ------------- LATE ARRIVAL DIGEST -------------
class TestLateArrivalDigest:
    def test_send_now_no_500(self, admin_sess):
        r = admin_sess.post(f"{API}/reports/late-arrival-digest/send-now")
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        data = r.json()
        assert "sent" in data and "failed" in data


# ------------- BIRTHDAY EMAILS -------------
class TestBirthdayEmails:
    def test_send_birthday_wishes(self, admin_sess):
        r = admin_sess.post(f"{API}/crm/send-birthday-wishes")
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        data = r.json()
        # After refactor should return sent/failed/results (or 0-guest message)
        # Any of: sent/failed keys OR message when nobody has birthday today.
        assert ("sent" in data) or ("message" in data), f"unexpected payload: {data}"


# ------------- WALLET PASS -------------
class TestWalletPass:
    def test_unknown_member_wallet_pass(self):
        # Endpoint pattern per wallet_pass.py: /public/member/{member_id}/google-wallet
        r = requests.get(f"{API}/public/member/nonexistent-xyz/google-wallet",
                         timeout=30, allow_redirects=False)
        # 404 or 400 acceptable; must NOT 500
        assert r.status_code < 500, f"5xx from wallet-pass: {r.status_code} {r.text[:200]}"


# ------------- cleanup -------------
def test_zzz_cleanup(admin_sess):
    """Delete test invoices + gift_cards created above."""
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.skip("MONGO_URL/DB_NAME not available; skip cleanup")
    cli = MongoClient(mongo_url)
    dbh = cli[db_name]
    # Remove invoices and any gift_cards created via pos_invoice_id
    if created_invoice_ids:
        dbh.invoices.delete_many({"id": {"$in": created_invoice_ids}})
        dbh.gift_cards.delete_many({"pos_invoice_id": {"$in": created_invoice_ids}})
        # wallet txns tied to those invoices
        dbh.wallet_txns.delete_many({"invoice_id": {"$in": created_invoice_ids}})
    cli.close()
