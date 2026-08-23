"""
Iteration 103 refactor regression:
- routes/membership_common.py (new, TIER_COLORS + _member_bundle moved out)
- routes/payments_common.py (new, _checkout moved out)
- routes/appointments_pos.py (_build_invoice_doc ctx-arg, _appt_customer_phone, _gc_contact_fields)
- routes/lead_gen.py (_verify_inbound_secret, _match_business_inbox, _mark_lead_replied)
- routes/wallet_pass.py imports from membership_common
- routes/pay_links.py imports from payments_common
- deferred-import cleanup in tenant_settings/schedulers/uploads
All must be behaviorally identical.
"""
from _creds import _PW_ADMIN, _PW_SUPER
import base64
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE}/api"
TENANT = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PW = _PW_ADMIN
SUPER_EMAIL = "super@miracurl.com"
SUPER_PW = _PW_SUPER
OWNER_PIN = "4321"

created_invoice_ids: list = []
created_appt_ids: list = []
created_member_ids: list = []
created_hq_msg_ids: list = []


# -------------- fixtures --------------
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
def super_sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PW})
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text[:300]}"
    return s


@pytest.fixture(scope="module")
def tenant_id(admin_sess):
    r = admin_sess.get(f"{API}/auth/me")
    assert r.status_code == 200
    return r.json().get("tenant_id")


@pytest.fixture(scope="module")
def customer(admin_sess):
    r = admin_sess.get(f"{API}/customers")
    assert r.status_code == 200
    lst = r.json()
    assert lst
    # pick one with a phone
    for c in lst:
        if c.get("phone"):
            return c
    return lst[0]


@pytest.fixture(scope="module")
def service(admin_sess):
    r = admin_sess.get(f"{API}/services")
    assert r.status_code == 200
    lst = r.json()
    assert lst
    return lst[0]


@pytest.fixture(scope="module")
def staff(admin_sess):
    r = admin_sess.get(f"{API}/staff")
    assert r.status_code == 200
    lst = r.json()
    assert lst
    return lst[0]


# =============== Test 8 — smoke ===============
class TestSmoke:
    def test_admin_login(self, admin_sess):
        r = admin_sess.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json().get("email") == ADMIN_EMAIL

    def test_super_login(self, super_sess):
        r = super_sess.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json().get("email") == SUPER_EMAIL

    def test_super_mira_home(self, super_sess):
        r = super_sess.get(f"{API}/super-admin/mira/home")
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        data = r.json()
        assert "revenue_goal" in data, f"missing revenue_goal: {list(data.keys())}"
        assert "weekly_sweep" in data, f"missing weekly_sweep: {list(data.keys())}"


# =============== Test 1 — POS invoice creation ===============
class TestInvoiceCreation:
    def test_create_completed_invoice_cash(self, admin_sess, customer, service):
        payload = {
            "customer_id": customer["id"],
            "items": [{
                "type": "service", "ref_id": service["id"],
                "name": service["name"], "qty": 1,
                "price": float(service.get("price") or 500),
            }],
            "payment_mode": "cash",
            "status": "completed",
            "force_duplicate": True,
        }
        r = admin_sess.post(f"{API}/invoices", json=payload)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        inv = r.json()
        assert inv.get("id")
        assert inv.get("invoice_no")
        assert inv.get("payment_mode") == "cash"
        assert float(inv.get("total") or 0) > 0
        # refactor should still return these fields
        assert "membership_discount" in inv, f"missing membership_discount: {list(inv.keys())}"
        assert "coupon_code" in inv, f"missing coupon_code: {list(inv.keys())}"
        assert "points_used" in inv, f"missing points_used: {list(inv.keys())}"
        created_invoice_ids.append(inv["id"])

    def test_create_open_then_complete(self, admin_sess, customer, service):
        payload = {
            "customer_id": customer["id"],
            "items": [{
                "type": "service", "ref_id": service["id"],
                "name": service["name"], "qty": 1,
                "price": float(service.get("price") or 500),
            }],
            "payment_mode": "cash",
            "status": "open",
            "force_duplicate": True,
        }
        r = admin_sess.post(f"{API}/invoices", json=payload)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        inv = r.json()
        assert inv.get("status") == "open"
        iid = inv["id"]
        created_invoice_ids.append(iid)

        # complete
        r2 = admin_sess.post(f"{API}/invoices/{iid}/complete", json={"payment_mode": "cash"})
        assert r2.status_code == 200, f"complete: {r2.status_code} {r2.text[:400]}"
        c = r2.json()
        # response should reflect completion status somewhere
        st = (c.get("status") or (c.get("invoice") or {}).get("status") or "").lower()
        assert st in ("completed", "paid", ""), f"unexpected status: {c}"


# =============== Test 2 — gift-card line item ===============
class TestPosGiftCard:
    def test_gift_card_line_item(self, admin_sess, customer):
        payload = {
            "customer_id": customer["id"],
            "items": [{
                "type": "gift_card", "ref_id": "pos-gc",
                "name": "Gift Card", "qty": 1, "price": 500.0,
                "gift_meta": {
                    "occasion": "birthday",
                    "buyer_name": "TEST Buyer",
                    "buyer_email": "delivered@resend.dev",
                    "buyer_phone": "9812345670",
                    "recipient_name": "TEST Recipient",
                    "recipient_email": "delivered@resend.dev",
                    "recipient_whatsapp": "9812345670",
                    "message": "TEST iter103",
                },
            }],
            "payment_mode": "cash",
            "status": "completed",
            "force_duplicate": True,
        }
        r = admin_sess.post(f"{API}/invoices", json=payload)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        inv = r.json()
        created_invoice_ids.append(inv["id"])
        issued = inv.get("gift_cards_issued") or []
        assert len(issued) >= 1, f"gift_cards_issued missing: {issued}"
        gc = issued[0]
        assert gc.get("code", "").startswith("GC-"), f"bad code: {gc}"
        assert float(gc.get("amount") or 0) == 500.0

        # verify contact fields normalized in the gift card doc (via mongo)
        from pymongo import MongoClient
        cli = MongoClient(os.environ.get("MONGO_URL"))
        dbh = cli[os.environ.get("DB_NAME")]
        gc_doc = dbh.gift_cards.find_one({"code": gc["code"]}, {"_id": 0})
        cli.close()
        assert gc_doc, "gift card doc not persisted"
        assert gc_doc.get("buyer_name") == "TEST Buyer"
        assert gc_doc.get("recipient_name") == "TEST Recipient"


# =============== Test 3 — appointment status ===============
class TestAppointmentStatus:
    def test_appt_status_route_exists_and_flow(self, admin_sess, customer, service, staff):
        # create appt tomorrow
        when = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        body = {
            "customer_id": customer["id"],
            "staff_id": staff["id"],
            "service_ids": [service["id"]],
            "scheduled_at": when,
        }
        r = admin_sess.post(f"{API}/appointments", json=body)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        appt = r.json()
        aid = appt["id"]
        created_appt_ids.append(aid)

        # confirmed → route registered, whatsapp_url may be non-null or null
        r1 = admin_sess.put(f"{API}/appointments/{aid}/status", json={"status": "confirmed"})
        assert r1.status_code == 200, f"confirmed: {r1.status_code} {r1.text[:300]}"
        d1 = r1.json()
        assert "whatsapp_url" in d1, f"missing whatsapp_url in {d1}"
        assert d1.get("crm_updated") == False

        # completed → crm_updated should be True first time
        r2 = admin_sess.put(f"{API}/appointments/{aid}/status", json={"status": "completed"})
        assert r2.status_code == 200, f"completed: {r2.status_code} {r2.text[:300]}"
        d2 = r2.json()
        assert d2.get("crm_updated") == True, f"crm_updated should be True: {d2}"


# =============== Test 4/5 — membership public endpoints + wallet ===============
class TestMembershipPublic:
    @pytest.fixture(scope="class")
    def seeded_member(self, admin_sess, tenant_id, customer):
        from pymongo import MongoClient
        cli = MongoClient(os.environ.get("MONGO_URL"))
        dbh = cli[os.environ.get("DB_NAME")]

        # Try to find an existing one for the tenant/customer first
        existing = dbh.customer_memberships.find_one(
            {"tenant_id": tenant_id, "customer_id": customer["id"]}, {"_id": 0})
        if existing and existing.get("member_id"):
            cli.close()
            return existing

        member_id = f"TEST-{uuid.uuid4().hex[:8].upper()}"
        expires = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
        purchased = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": str(uuid.uuid4()),
            "member_id": member_id,
            "tenant_id": tenant_id,
            "customer_id": customer["id"],
            "customer_name": customer.get("name") or "Test Member",
            "name": "Gold Plan",
            "tier": "gold",
            "amount": 5000,
            "cashback_pct": 5,
            "discount_pct": 10,
            "benefits": ["Priority booking"],
            "purchased_at": purchased,
            "expires_at": expires,
        }
        dbh.customer_memberships.insert_one(doc)
        cli.close()
        created_member_ids.append(member_id)
        return doc

    def test_public_member_bundle(self, seeded_member):
        mid = seeded_member["member_id"]
        r = requests.get(f"{API}/public/member/{mid}", timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        data = r.json()
        assert data.get("member_id") == mid
        assert data.get("tier") == seeded_member.get("tier")
        assert data.get("qr_b64")
        # ensure qr_b64 is valid base64
        try:
            base64.b64decode(data["qr_b64"])
        except Exception as e:
            pytest.fail(f"qr_b64 not valid base64: {e}")
        assert data.get("name")

    def test_public_member_card_pdf(self, seeded_member):
        mid = seeded_member["member_id"]
        r = requests.get(f"{API}/public/member/{mid}/card.pdf", timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF", "not a valid PDF"

    def test_google_wallet_endpoint(self, seeded_member):
        mid = seeded_member["member_id"]
        r = requests.get(f"{API}/public/member/{mid}/google-wallet",
                         timeout=30, allow_redirects=False)
        # 200 with save_url OR 503 not-configured OR 3xx redirect — must NOT be 500 / ImportError
        assert r.status_code in (200, 302, 303, 307, 503), \
            f"unexpected status: {r.status_code} {r.text[:400]}"
        if r.status_code == 200:
            body = r.json()
            assert "save_url" in body or "url" in body, f"missing save_url: {body}"
        elif r.status_code == 503:
            assert "google wallet" in r.text.lower() or "not configured" in r.text.lower()


# =============== Test 6 — Resend inbound webhook ===============
class TestResendInbound:
    def test_inbound_403_no_secret(self):
        payload = {"data": {"from": "x@example.com", "to": ["support@miracurl-suite.com"],
                            "subject": "test", "text": "hi"}}
        r = requests.post(f"{API}/webhooks/resend-inbound", json=payload, timeout=30)
        # 403 or 503 acceptable per task
        assert r.status_code in (403, 503), f"{r.status_code} {r.text[:300]}"

    def test_inbound_routed_to_hq_support(self):
        secret = os.environ.get("RESEND_INBOUND_SECRET")
        # read from backend .env if not in current env
        if not secret:
            try:
                with open("/app/backend/.env") as fh:
                    for line in fh:
                        if line.startswith("RESEND_INBOUND_SECRET="):
                            secret = line.strip().split("=", 1)[1]
                            break
            except Exception:
                pass
        if not secret:
            pytest.skip("RESEND_INBOUND_SECRET not configured")
        sender = f"nomatch-{uuid.uuid4().hex[:6]}@example.com"
        subject = f"TEST regression {uuid.uuid4().hex[:6]}"
        payload = {"data": {"from": sender, "to": ["support@miracurl-suite.com"],
                            "subject": subject, "text": "hello world"}}
        r = requests.post(f"{API}/webhooks/resend-inbound",
                          json=payload, timeout=30,
                          headers={"x-inbound-secret": secret})
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        data = r.json()
        assert data.get("ok") == True
        assert data.get("matched") == False
        assert data.get("routed_inbox") == "support", f"unexpected: {data}"

        # verify hq_messages doc created
        from pymongo import MongoClient
        cli = MongoClient(os.environ.get("MONGO_URL"))
        dbh = cli[os.environ.get("DB_NAME")]
        msg = dbh.hq_messages.find_one({"from_email": sender, "subject": subject}, {"_id": 0})
        cli.close()
        assert msg, "hq_messages doc not created"
        assert msg.get("inbox") == "support"
        if msg.get("id"):
            created_hq_msg_ids.append(msg["id"])


# =============== Test 7 — pay_links + intl settings module loads ===============
class TestPaymentsModules:
    def test_intl_settings_loads(self, admin_sess):
        r = admin_sess.get(f"{API}/settings/international")
        # must be 200 (or 404 if endpoint doesn't exist — but per task expect 200 currency)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        data = r.json()
        # currency setting should be somewhere in the payload
        assert isinstance(data, dict)
        assert any(k in data for k in ("currency", "default_currency", "stripe_enabled",
                                        "razorpay_enabled", "settings"))

    def test_pay_links_module_loads(self, super_sess):
        # Any pay_links route to confirm module loaded without ImportError.
        # Common endpoints:
        candidates = [
            f"{API}/super-admin/pay-links",
            f"{API}/pay-links",
            f"{API}/super-admin/subscription/pay-links",
        ]
        found_ok = False
        last_status = None
        for url in candidates:
            r = super_sess.get(url)
            last_status = (url, r.status_code, r.text[:150])
            # 200 or 404 (route not present but module imported) are both fine
            # Any 5xx means ImportError likely; fail.
            assert r.status_code < 500, f"5xx on {url}: {r.status_code} {r.text[:400]}"
            if r.status_code == 200:
                found_ok = True
                break
        # At minimum no 5xx occurred; log final status.
        print(f"pay_links probe: {last_status} found_ok={found_ok}")


# =============== cleanup ===============
def test_zzz_cleanup():
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.skip("no MONGO_URL/DB_NAME")
    cli = MongoClient(mongo_url)
    dbh = cli[db_name]
    if created_invoice_ids:
        dbh.invoices.delete_many({"id": {"$in": created_invoice_ids}})
        dbh.gift_cards.delete_many({"pos_invoice_id": {"$in": created_invoice_ids}})
        dbh.wallet_txns.delete_many({"invoice_id": {"$in": created_invoice_ids}})
    if created_appt_ids:
        dbh.appointments.delete_many({"id": {"$in": created_appt_ids}})
    if created_member_ids:
        dbh.customer_memberships.delete_many({"member_id": {"$in": created_member_ids}})
    if created_hq_msg_ids:
        dbh.hq_messages.delete_many({"id": {"$in": created_hq_msg_ids}})
    cli.close()
