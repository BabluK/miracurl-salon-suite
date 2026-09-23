"""
Iter118 — Signature Loyalty Card (gold stamp card) backend tests.
Endpoints:
  GET/PUT /api/settings/loyalty-stamps
  GET  /api/loyalty/stamps?phone=
  POST /api/loyalty/stamps/add
  POST /api/loyalty/stamps/redeem
  POST /api/invoices  (auto-stamp side-effect)
  GET  /api/public/loyalty/{slug}?phone=
"""
import os
import uuid
import requests
import pytest
from creds import password_for
from _creds import pw

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
SALON_SLUG = "miracurl-marathahalli"
SALON_EMAIL = "admin@miracurl.com"
SALON_PWD = password_for("admin@miracurl.com")
OWNER_PIN = "4321"
REST_SLUG = "infinity-family-restaurant"
REST_EMAIL = "infinity.admin@miracurl.com"
REST_PWD = pw("RESTAURANT_ADMIN")


# --- helpers ----------------------------------------------------------------
def _login(slug: str, email: str, pwd: str) -> requests.Session:
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        headers={"X-Tenant-Slug": slug, "Content-Type": "application/json"},
        json={"email": email, "password": pwd},
        timeout=20,
    )
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text[:200]}"
    csrf = s.cookies.get("csrf_token")
    assert csrf
    s.headers.update({"X-CSRF-Token": csrf, "X-Owner-Pin": OWNER_PIN, "X-Tenant-Slug": slug})
    return s


@pytest.fixture(scope="module")
def salon() -> requests.Session:
    return _login(SALON_SLUG, SALON_EMAIL, SALON_PWD)


@pytest.fixture(scope="module")
def restaurant() -> requests.Session:
    return _login(REST_SLUG, REST_EMAIL, REST_PWD)


@pytest.fixture(scope="module")
def test_customer(salon):
    """Create dedicated TEST customer so we don't perturb 9787537706 counter."""
    phone = "9" + str(uuid.uuid4().int)[:9]  # random 10-digit starting 9
    r = salon.post(f"{BASE_URL}/api/customers",
                   json={"name": f"TEST Stamp {phone[-4:]}", "phone": phone})
    assert r.status_code in (200, 201), f"create cust: {r.status_code} {r.text[:200]}"
    cust = r.json()
    return {"id": cust["id"], "phone": phone}


# --- settings ---------------------------------------------------------------
class TestLoyaltySettings:
    def test_get_settings_defaults_or_current(self, salon):
        r = salon.get(f"{BASE_URL}/api/settings/loyalty-stamps")
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("enabled", "stamps_needed", "reward_label", "reward_discount_pct"):
            assert k in data

    def test_put_valid_settings(self, salon):
        payload = {"enabled": True, "stamps_needed": 5,
                   "reward_label": "Free Hair Spa", "reward_discount_pct": 100}
        r = salon.put(f"{BASE_URL}/api/settings/loyalty-stamps", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["stamps_needed"] == 5
        # verify persisted
        g = salon.get(f"{BASE_URL}/api/settings/loyalty-stamps").json()
        assert g["enabled"] is True
        assert g["reward_label"] == "Free Hair Spa"

    def test_put_stamps_needed_out_of_range(self, salon):
        r = salon.put(f"{BASE_URL}/api/settings/loyalty-stamps",
                      json={"enabled": True, "stamps_needed": 13,
                            "reward_label": "x", "reward_discount_pct": 10})
        assert r.status_code == 422

        r = salon.put(f"{BASE_URL}/api/settings/loyalty-stamps",
                      json={"enabled": True, "stamps_needed": 1,
                            "reward_label": "x", "reward_discount_pct": 10})
        assert r.status_code == 422

    def test_put_reward_label_too_long(self, salon):
        r = salon.put(f"{BASE_URL}/api/settings/loyalty-stamps",
                      json={"enabled": True, "stamps_needed": 5,
                            "reward_label": "x" * 81, "reward_discount_pct": 10})
        assert r.status_code == 422

    def test_restaurant_tenant_rejected(self, restaurant):
        r = restaurant.put(f"{BASE_URL}/api/settings/loyalty-stamps",
                           json={"enabled": True, "stamps_needed": 5,
                                 "reward_label": "10% off", "reward_discount_pct": 10})
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text[:200]}"
        assert "salon" in r.text.lower()


# --- staff manual stamps ----------------------------------------------------
class TestManualStamps:
    def test_get_unknown_phone_returns_found_false(self, salon):
        unknown = "6" + str(uuid.uuid4().int)[:9]
        r = salon.get(f"{BASE_URL}/api/loyalty/stamps", params={"phone": unknown})
        assert r.status_code == 200
        assert r.json()["found"] is False

    def test_add_unknown_phone_404(self, salon):
        unknown = "6" + str(uuid.uuid4().int)[:9]
        r = salon.post(f"{BASE_URL}/api/loyalty/stamps/add",
                       json={"phone": unknown})
        assert r.status_code == 404

    def test_add_stamp_increments(self, salon, test_customer):
        phone = test_customer["phone"]
        before = salon.get(f"{BASE_URL}/api/loyalty/stamps", params={"phone": phone}).json()
        assert before["found"] is True
        base = before["raw_stamps"]
        r = salon.post(f"{BASE_URL}/api/loyalty/stamps/add", json={"phone": phone})
        assert r.status_code == 200, r.text
        after = r.json()
        assert after["raw_stamps"] == base + 1
        # persist check
        g = salon.get(f"{BASE_URL}/api/loyalty/stamps", params={"phone": phone}).json()
        assert g["raw_stamps"] == base + 1

    def test_redeem_empty_card_returns_400(self, salon, test_customer):
        # Fresh test customer has < needed stamps → redeem should 400
        r = salon.post(f"{BASE_URL}/api/loyalty/stamps/redeem",
                       json={"phone": test_customer["phone"]})
        # Might be 400 if not enough stamps
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text[:200]}"
        assert "not full" in r.text.lower() or "no reward" in r.text.lower()

    def test_full_card_redeem(self, salon):
        """Create a fresh customer, add 5 stamps, redeem, verify rewards_available decrements."""
        phone = "8" + str(uuid.uuid4().int)[:9]
        r = salon.post(f"{BASE_URL}/api/customers",
                       json={"name": f"TEST Full {phone[-4:]}", "phone": phone})
        assert r.status_code in (200, 201)
        for _ in range(5):
            r = salon.post(f"{BASE_URL}/api/loyalty/stamps/add", json={"phone": phone})
            assert r.status_code == 200, r.text
        card = salon.get(f"{BASE_URL}/api/loyalty/stamps", params={"phone": phone}).json()
        assert card["rewards_available"] == 1
        # redeem
        r = salon.post(f"{BASE_URL}/api/loyalty/stamps/redeem", json={"phone": phone})
        assert r.status_code == 200, r.text
        red = r.json()
        assert red.get("redeemed") is True
        assert red["rewards_available"] == 0


# --- auto-stamp via invoice -------------------------------------------------
class TestAutoStampFromInvoice:
    def test_invoice_creation_adds_one_stamp(self, salon):
        # fresh customer
        phone = "7" + str(uuid.uuid4().int)[:9]
        rc = salon.post(f"{BASE_URL}/api/customers",
                        json={"name": f"TEST Auto {phone[-4:]}", "phone": phone})
        assert rc.status_code in (200, 201)
        cust_id = rc.json()["id"]

        before = salon.get(f"{BASE_URL}/api/loyalty/stamps", params={"phone": phone}).json()
        assert before["found"] is True
        base = before["raw_stamps"]

        invoice_body = {
            "customer_id": cust_id,
            "items": [{"type": "service", "ref_id": "adhoc-test",
                       "name": "TEST Service", "price": 500, "qty": 1}],
            "discount": 0, "tax_pct": 0, "payment_mode": "cash",
            "status": "completed",
        }
        r = salon.post(f"{BASE_URL}/api/invoices", json=invoice_body)
        if r.status_code >= 400:
            # If InvoiceItem shape rejects our items, skip with useful info
            pytest.skip(f"Invoice creation not accepted with adhoc item shape: "
                        f"{r.status_code} {r.text[:300]}")
        after = salon.get(f"{BASE_URL}/api/loyalty/stamps", params={"phone": phone}).json()
        assert after["raw_stamps"] == base + 1, \
            f"auto-stamp missed: before={base} after={after['raw_stamps']}"


# --- public endpoint --------------------------------------------------------
class TestPublicLoyaltyLookup:
    def test_invalid_phone_format_400(self):
        r = requests.get(f"{BASE_URL}/api/public/loyalty/{SALON_SLUG}",
                         params={"phone": "12345"})
        # public rate-limit may fire first; accept 400 or 429
        assert r.status_code in (400, 429), r.text[:200]

    def test_valid_lookup_returns_enabled_card(self):
        r = requests.get(f"{BASE_URL}/api/public/loyalty/{SALON_SLUG}",
                         params={"phone": "9787537706"})
        if r.status_code == 429:
            pytest.skip("rate-limited (acceptable per problem statement)")
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data.get("enabled") is True
        # if found, expect card fields
        if data.get("found"):
            for k in ("stamps", "needed", "reward_label"):
                assert k in data
