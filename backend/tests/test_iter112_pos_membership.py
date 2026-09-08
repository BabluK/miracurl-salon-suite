"""Iter 112 — POS membership sale flow + regressions.

Covers:
* REGRESSION: service-only invoice completes; memberships_issued empty
* REGRESSION: gift_card POS line still returns gift_cards_issued populated
* NEW: POS invoice with a `membership` item returns memberships_issued[0] with
       member_id (MC-...), plan_name, tier, purchased_at, expires_at,
       discount_pct, cashback_pct, email_sent and creates a customer_memberships doc
* NEW: POST /premium-membership/members/{cmid}/send-card
       -> 200 (real gmail-ish address) OR 502 acceptable if Resend rejects,
       -> 422 on invalid email,
       -> 404 on unknown id
* REGRESSION: /pos/member-lookup/{mid} returns the newly issued member (guest+membership)
"""
from _creds import _PW_ADMIN
import os
import re
import uuid
import pytest
import requests
from pathlib import Path


def _load_frontend_env():
    p = Path("/app/frontend/.env")
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            os.environ.setdefault("REACT_APP_BACKEND_URL", line.split("=", 1)[1].strip())


_load_frontend_env()
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
TENANT = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASSWORD = _PW_ADMIN


# ---------- shared session (cookie jar auto) ----------
@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT, "Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    s.headers.update({"X-Owner-Pin": "4321"})
    return s


@pytest.fixture(scope="module")
def throwaway_customer(sess):
    tag = uuid.uuid4().hex[:6]
    phone10 = "9" + "".join(c for c in tag if c.isdigit()).ljust(9, "0")[:9]
    payload = {
        "name": f"TEST Membership {tag}",
        "phone": phone10,
        "email": f"test.mem.{tag}@example.com",
        "gender": "Male",
    }
    r = sess.post(f"{BASE_URL}/api/customers", json=payload)
    assert r.status_code in (200, 201), r.text
    cust = r.json()
    yield cust
    # teardown: remove the invoices, customer_memberships, wallet_txns, and the customer
    try:
        sess.delete(f"{BASE_URL}/api/customers/{cust['id']}")
    except Exception:
        pass


@pytest.fixture(scope="module")
def any_service(sess):
    r = sess.get(f"{BASE_URL}/api/services")
    assert r.status_code == 200
    svcs = r.json()
    assert svcs, "no services seeded"
    return svcs[0]


@pytest.fixture(scope="module")
def silver_membership(sess):
    r = sess.get(f"{BASE_URL}/api/memberships")
    assert r.status_code == 200, r.text
    plans = r.json()
    # prefer Silver 5000 else first non-custom
    pick = next((p for p in plans if p.get("tier") == "silver"), None) \
        or next((p for p in plans if not p.get("custom")), None) \
        or (plans[0] if plans else None)
    assert pick, "no membership plan available"
    return pick


# ---------------- REGRESSION: service-only invoice ----------------
class TestServiceOnlyInvoice:
    def test_service_only_no_memberships_issued(self, sess, throwaway_customer, any_service):
        body = {
            "customer_id": throwaway_customer["id"],
            "items": [{
                "type": "service", "ref_id": any_service["id"],
                "name": any_service["name"], "qty": 1,
                "price": float(any_service["price"]),
            }],
            "payment_mode": "cash",
            "status": "completed",
            "force_duplicate": True,
        }
        r = sess.post(f"{BASE_URL}/api/invoices", json=body)
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv.get("invoice_no", "").startswith("INV-"), inv
        assert inv.get("total", 0) >= float(any_service["price"])  # + optional GST
        # memberships_issued must be absent or empty
        assert not inv.get("memberships_issued"), inv.get("memberships_issued")


# ---------------- NEW: membership POS sale ----------------
class TestMembershipSale:
    inv_id = None

    def test_pos_membership_sale_returns_memberships_issued(self, sess, throwaway_customer, silver_membership):
        body = {
            "customer_id": throwaway_customer["id"],
            "items": [{
                "type": "membership", "ref_id": silver_membership["id"],
                "name": silver_membership["name"], "qty": 1,
                "price": float(silver_membership["price"]),
            }],
            "payment_mode": "cash",
            "status": "completed",
            "force_duplicate": True,
        }
        r = sess.post(f"{BASE_URL}/api/invoices", json=body)
        assert r.status_code == 200, r.text
        inv = r.json()
        TestMembershipSale.inv_id = inv.get("id")
        issued = inv.get("memberships_issued") or []
        assert issued, f"memberships_issued missing: {inv}"
        m = issued[0]
        for k in ("customer_membership_id", "member_id", "plan_name",
                  "tier", "purchased_at", "expires_at", "discount_pct",
                  "cashback_pct", "email_sent"):
            assert k in m, f"missing {k} in {m}"
        assert re.match(r"^MC-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$", m["member_id"]), m["member_id"]
        assert m["plan_name"] == silver_membership["name"]
        assert m["tier"] == (silver_membership.get("tier") or "custom")
        assert float(m["discount_pct"]) == float(silver_membership["discount_pct"])
        # persist cmid for follow-up tests
        TestMembershipSale.cmid = m["customer_membership_id"]
        TestMembershipSale.mid = m["member_id"]

    def test_customer_memberships_doc_created_with_source_pos(self, sess, throwaway_customer):
        # via admin members list
        r = sess.get(f"{BASE_URL}/api/premium-membership/members")
        assert r.status_code == 200, r.text
        rows = r.json().get("members", [])
        me = next((x for x in rows if x.get("member_id") == TestMembershipSale.mid), None)
        assert me, f"newly issued member not in list: {TestMembershipSale.mid}"
        assert me.get("source") == "pos"

    def test_pos_member_lookup(self, sess):
        r = sess.get(f"{BASE_URL}/api/pos/member-lookup/{TestMembershipSale.mid}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["membership"]["member_id"] == TestMembershipSale.mid
        assert d["membership"]["status"] == "active"


# ---------------- NEW: send-card endpoint ----------------
class TestSendCard:
    def test_invalid_email_422(self, sess):
        cmid = TestMembershipSale.cmid
        r = sess.post(f"{BASE_URL}/api/premium-membership/members/{cmid}/send-card",
                      json={"email": "not-an-email"})
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"

    def test_unknown_cmid_404(self, sess):
        r = sess.post(f"{BASE_URL}/api/premium-membership/members/deadbeef-0000-0000-0000-000000000000/send-card",
                      json={"email": "someone@gmail.com"})
        assert r.status_code == 404, r.text

    def test_send_card_success_or_bounce(self, sess):
        cmid = TestMembershipSale.cmid
        r = sess.post(f"{BASE_URL}/api/premium-membership/members/{cmid}/send-card",
                      json={"email": "delivered@resend.dev"})
        # Resend can also return 502 with a clear error if it rejects test recipients
        assert r.status_code in (200, 502), f"unexpected {r.status_code}: {r.text}"
        if r.status_code == 200:
            j = r.json()
            assert j.get("ok") is True
            assert j.get("sent_to") == "delivered@resend.dev"
        else:
            # 502 must include the error detail
            assert r.json().get("detail"), r.text


# ---------------- REGRESSION: gift-card POS line ----------------
class TestGiftCardStillWorks:
    def test_gift_card_purchase_still_returns_issued(self, sess, throwaway_customer):
        body = {
            "customer_id": throwaway_customer["id"],
            "items": [{
                "type": "gift_card", "ref_id": "custom-gc",
                "name": "Gift Card ₹500", "qty": 1, "price": 500.0,
                "gift_meta": {
                    "occasion": "birthday",
                    "recipient_name": "TEST Recipient",
                    "recipient_email": "recipient@example.com",
                    "message": "Enjoy!",
                },
            }],
            "payment_mode": "cash",
            "status": "completed",
            "force_duplicate": True,
        }
        r = sess.post(f"{BASE_URL}/api/invoices", json=body)
        assert r.status_code == 200, r.text
        inv = r.json()
        issued = inv.get("gift_cards_issued") or []
        assert issued, f"gift_cards_issued missing: {inv}"
        assert issued[0].get("amount") == 500.0
        # memberships_issued must be empty for a gift-card-only bill
        assert not inv.get("memberships_issued")
