"""Iteration 111 - Subscription blocking (trial/paid), audit-log retention/clear, product-order fields."""
import os
import uuid
import bcrypt
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "miracurl_db")

ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PW = "q6QY@tn3p#9DtL"
TENANT_SLUG = "miracurl-marathahalli"
SUPER_EMAIL = "super@miracurl.com"
SUPER_PW = "og9T@41Es#OQb6"


@pytest.fixture(scope="module")
def mongo():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def super_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PW})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT_SLUG})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert r.status_code == 200, r.text
    return s


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def _mk_tenant(mongo, **fields):
    tid = str(uuid.uuid4())
    slug = f"throwaway-{tid[:8]}"
    tenant = {"id": tid, "slug": slug, "name": f"Throwaway {slug}",
              "owner_email": f"{slug}@test.com", "plan": "trial", "status": "trial",
              **fields}
    mongo.tenants.insert_one(tenant)
    user = {"id": str(uuid.uuid4()), "email": f"{slug}@test.com", "name": "TW",
            "role": "admin", "tenant_id": tid, "password_hash": _hash("Test@1234"),
            "created_at": datetime.now(timezone.utc).isoformat()}
    mongo.users.insert_one(user)
    return tenant, user


@pytest.fixture
def throwaways(mongo):
    created = {"tenant_ids": [], "user_emails": []}
    yield created
    if created["tenant_ids"]:
        mongo.tenants.delete_many({"id": {"$in": created["tenant_ids"]}})
        mongo.users.delete_many({"email": {"$in": created["user_emails"]}})
        mongo.grace_requests.delete_many({"tenant_id": {"$in": created["tenant_ids"]}})


def _track(throwaways, tenant, user):
    throwaways["tenant_ids"].append(tenant["id"])
    throwaways["user_emails"].append(user["email"])


# ============ 1. Regression: healthy tenants login OK ============
def test_normal_admin_login_still_works():
    r = requests.post(f"{API}/auth/login",
                      headers={"X-Tenant-Slug": TENANT_SLUG},
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["email"] == ADMIN_EMAIL


def test_super_admin_login_still_works():
    r = requests.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PW})
    assert r.status_code == 200, r.text


# ============ 2. Trial expired -> 403 with trial_expired ============
def test_expired_trial_blocked(mongo, throwaways):
    yesterday = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    tenant, user = _mk_tenant(mongo, status="trial", trial_end_date=yesterday)
    _track(throwaways, tenant, user)
    r = requests.post(f"{API}/auth/login", json={"email": user["email"], "password": "Test@1234"})
    assert r.status_code == 403, r.text
    detail = r.json()["detail"]
    assert isinstance(detail, dict)
    assert detail["code"] == "trial_expired"
    assert detail["end_date"] == yesterday
    assert "message" in detail


# ============ 3a. Subscription expired beyond grace -> blocked ============
def test_subscription_expired_beyond_grace_blocked(mongo, throwaways):
    long_ago = (datetime.now(timezone.utc).date() - timedelta(days=100)).isoformat()
    tenant, user = _mk_tenant(mongo, status="active", plan="annual",
                              subscription_end_date=long_ago)
    _track(throwaways, tenant, user)
    r = requests.post(f"{API}/auth/login", json={"email": user["email"], "password": "Test@1234"})
    assert r.status_code == 403, r.text
    detail = r.json()["detail"]
    assert detail["code"] == "subscription_expired"


# ============ 3b. Same expired tenant with grace_until tomorrow -> 200 ============
def test_subscription_expired_with_explicit_grace_succeeds(mongo, throwaways):
    long_ago = (datetime.now(timezone.utc).date() - timedelta(days=100)).isoformat()
    tomorrow = (datetime.now(timezone.utc).date() + timedelta(days=1)).isoformat()
    tenant, user = _mk_tenant(mongo, status="active", plan="annual",
                              subscription_end_date=long_ago, grace_until=tomorrow)
    _track(throwaways, tenant, user)
    r = requests.post(f"{API}/auth/login", json={"email": user["email"], "password": "Test@1234"})
    assert r.status_code == 200, r.text


# ============ 4. In-grace paid tenant: login + subscription-status + grace-request ============
def test_in_grace_paid_flow(mongo, throwaways, super_session):
    five_days_ago = (datetime.now(timezone.utc).date() - timedelta(days=5)).isoformat()
    tenant, user = _mk_tenant(mongo, status="active", plan="annual",
                              subscription_end_date=five_days_ago)
    _track(throwaways, tenant, user)

    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": tenant["slug"]})
    r = s.post(f"{API}/auth/login", json={"email": user["email"], "password": "Test@1234"})
    assert r.status_code == 200, r.text

    # subscription-status
    r = s.get(f"{API}/billing/subscription-status")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["days_remaining"] is not None and data["days_remaining"] < 0
    assert data["grace_request_pending"] is False

    # first grace-request -> ok, not already
    r = s.post(f"{API}/billing/grace-request")
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True
    assert r.json().get("already_requested") is False

    # second -> already_requested True
    r = s.post(f"{API}/billing/grace-request")
    assert r.status_code == 200
    assert r.json().get("already_requested") is True

    # Super admin sees pending
    r = super_session.get(f"{API}/super-admin/grace-requests")
    assert r.status_code == 200
    items = r.json()["items"]
    matching = [i for i in items if i.get("tenant_id") == tenant["id"] and i.get("status") == "pending"]
    assert matching, "Expected pending grace request for our throwaway tenant"
    rid = matching[0]["id"]

    # decide approve 10 days
    r = super_session.post(f"{API}/super-admin/grace-requests/{rid}/decide",
                           json={"approve": True, "days": 10})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "approved"
    assert body["grace_until"]
    # verify tenant persisted
    fresh = mongo.tenants.find_one({"id": tenant["id"]}, {"_id": 0, "grace_until": 1})
    assert fresh["grace_until"] == body["grace_until"]


# ============ 5. Audit log: get/delete + 7-day retention ============
def test_audit_log_get_delete_and_retention(mongo, admin_session):
    # Insert a stale (10 days old) log entry
    tenant = mongo.tenants.find_one({"slug": TENANT_SLUG}, {"_id": 0, "id": 1})
    assert tenant
    old_id = str(uuid.uuid4())
    old_at = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
    mongo.audit_log.insert_one({"id": old_id, "tenant_id": tenant["id"],
                                "at": old_at, "action": "TEST_STALE"})
    fresh_id = str(uuid.uuid4())
    fresh_at = datetime.now(timezone.utc).isoformat()
    mongo.audit_log.insert_one({"id": fresh_id, "tenant_id": tenant["id"],
                                "at": fresh_at, "action": "TEST_FRESH"})

    r = admin_session.get(f"{API}/settings/audit-log")
    assert r.status_code == 200, r.text
    ids = [i.get("id") for i in r.json()["items"]]
    assert old_id not in ids, "10-day-old entry should be purged on GET"
    assert fresh_id in ids

    # Verify stale doc removed from DB
    assert mongo.audit_log.find_one({"id": old_id}) is None

    # DELETE clears
    r = admin_session.delete(f"{API}/settings/audit-log")
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True
    assert mongo.audit_log.count_documents({"tenant_id": tenant["id"]}) == 0


# ============ 6. Product order requires new fields ============
def test_product_order_missing_email_422(super_session, mongo):
    # ensure available
    prev = mongo.platform_settings.find_one({"key": "products"}, {"_id": 0}) or {}
    prev_available = prev.get("available", False)
    prev_link = prev.get("razorpay_link", "")

    r = super_session.put(f"{API}/super-admin/products-config",
                          json={"available": True, "razorpay_link": ""})
    assert r.status_code == 200, r.text
    try:
        # Missing email
        r = requests.post(f"{API}/public/product-orders", json={
            "name": "Test User", "phone": "9876543210",
            "address": "123 Somewhere Street, City",
            "pincode": "560037",
            "items": [{"id": "shampoo", "qty": 1, "price": 400}],
            "total": 400,
        })
        assert r.status_code == 422, r.text

        # Valid full submission
        r = requests.post(f"{API}/public/product-orders", json={
            "name": "Test User", "phone": "9876543210",
            "email": "test@example.com",
            "address": "123 Somewhere Street, City",
            "pincode": "560037",
            "items": [{"id": "shampoo", "qty": 1, "price": 400}],
            "total": 400,
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert data.get("order_id")
        # cleanup order
        mongo.product_orders.delete_one({"id": data["order_id"]})

        # bad pincode (5 digits)
        r = requests.post(f"{API}/public/product-orders", json={
            "name": "Test User", "phone": "9876543210",
            "email": "test@example.com",
            "address": "123 Somewhere Street, City",
            "pincode": "56003",
            "items": [{"id": "shampoo", "qty": 1, "price": 400}],
            "total": 400,
        })
        assert r.status_code == 422
    finally:
        # restore previous config
        super_session.put(f"{API}/super-admin/products-config",
                          json={"available": prev_available, "razorpay_link": prev_link})
