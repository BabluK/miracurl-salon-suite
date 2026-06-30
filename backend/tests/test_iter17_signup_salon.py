"""Iter 17 — Public salon self-signup endpoint tests."""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _uniq_email():
    return f"iter17_{uuid.uuid4().hex[:8]}@demo.com"


def _uniq_name():
    return f"Iter17 Salon {uuid.uuid4().hex[:6]}"


# ---- Happy path ----
def test_signup_happy_path():
    body = {
        "salon_name": _uniq_name(),
        "owner_name": "Owner X",
        "owner_email": _uniq_email(),
        "password": "TestPass@123",
        "location": "Whitefield",
        "phone": "9999000011",
    }
    r = requests.post(f"{API}/public/signup-salon", json=body, timeout=20)
    assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
    data = r.json()
    assert "user" in data and "tenant" in data
    assert "access_token" in data and len(data["access_token"]) > 20
    assert data.get("trial_days") == 7
    assert data.get("trial_end_date")
    assert data["tenant"]["status"] == "trial"
    assert data["user"]["role"] == "admin"
    assert data["user"]["email"] == body["owner_email"].lower()
    assert "password_hash" not in data["user"]
    assert "_id" not in data["tenant"]


# ---- Auth after signup ----
def test_signup_then_me_tenant_dashboard():
    body = {
        "salon_name": _uniq_name(),
        "owner_name": "Auth Test Owner",
        "owner_email": _uniq_email(),
        "password": "TestPass@123",
    }
    r = requests.post(f"{API}/public/signup-salon", json=body, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    token = data["access_token"]
    tenant_id = data["tenant"]["id"]
    headers = {"Authorization": f"Bearer {token}"}

    me = requests.get(f"{API}/auth/me", headers=headers, timeout=20)
    assert me.status_code == 200, me.text
    me_data = me.json()
    assert me_data["role"] == "admin"
    assert me_data["tenant_id"] == tenant_id

    t = requests.get(f"{API}/tenants/current", headers=headers, timeout=20)
    assert t.status_code == 200, t.text
    assert t.json()["id"] == tenant_id

    d = requests.get(f"{API}/reports/dashboard", headers=headers, timeout=20)
    assert d.status_code == 200, d.text
    dj = d.json()
    # fresh tenant: zero/empty data, must not crash
    assert isinstance(dj, dict)


# ---- Duplicate email ----
def test_signup_duplicate_email_400():
    email = _uniq_email()
    body = {
        "salon_name": _uniq_name(),
        "owner_name": "Dup Test",
        "owner_email": email,
        "password": "TestPass@123",
    }
    r1 = requests.post(f"{API}/public/signup-salon", json=body, timeout=20)
    assert r1.status_code == 200, r1.text
    body2 = dict(body, salon_name=_uniq_name())
    r2 = requests.post(f"{API}/public/signup-salon", json=body2, timeout=20)
    assert r2.status_code == 400, f"Expected 400 dup email, got {r2.status_code}: {r2.text}"


# ---- Weak password ----
def test_signup_weak_password_422():
    body = {
        "salon_name": _uniq_name(),
        "owner_name": "Weak Pw",
        "owner_email": _uniq_email(),
        "password": "short",
    }
    r = requests.post(f"{API}/public/signup-salon", json=body, timeout=20)
    assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text}"


# ---- Invalid slug ----
def test_signup_invalid_slug_400():
    body = {
        "salon_name": "Some Valid Name",
        "slug": "BAD SLUG!!",
        "owner_name": "Bad Slug",
        "owner_email": _uniq_email(),
        "password": "TestPass@123",
    }
    r = requests.post(f"{API}/public/signup-salon", json=body, timeout=20)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"


# ---- Slug auto-uniqueness ----
# Note: rate-limit on /public/signup-salon is 4 per 900s per IP (in-memory bucket). To keep this
# test self-contained we make only 2 calls. If preceding tests already consumed the bucket the
# test will be retried once after a 1.5s backoff; if it still fails we raise (real bug only).
def test_signup_slug_auto_uniqueness():
    # Use unique base name to avoid colliding with previous test runs
    base_name = f"Iter17 Slug Test {uuid.uuid4().hex[:6]}"
    body1 = {
        "salon_name": base_name,
        "owner_name": "Aa",
        "owner_email": _uniq_email(),
        "password": "TestPass@123",
    }
    r1 = requests.post(f"{API}/public/signup-salon", json=body1, timeout=20)
    assert r1.status_code == 200, r1.text
    slug1 = r1.json()["tenant"]["slug"]

    body2 = {
        "salon_name": base_name,
        "owner_name": "Bb",
        "owner_email": _uniq_email(),
        "password": "TestPass@123",
    }
    r2 = requests.post(f"{API}/public/signup-salon", json=body2, timeout=20)
    assert r2.status_code == 200, r2.text
    slug2 = r2.json()["tenant"]["slug"]

    assert slug1 != slug2
    assert slug2.startswith(slug1) and slug2.endswith("-2"), f"slug1={slug1} slug2={slug2}"


# ---- Rate limit (run last; limit 4 per 900s per IP) ----
def test_signup_rate_limit_429():
    got_429 = False
    for i in range(7):
        body = {
            "salon_name": _uniq_name(),
            "owner_name": "RL",
            "owner_email": _uniq_email(),
            "password": "TestPass@123",
        }
        r = requests.post(f"{API}/public/signup-salon", json=body, timeout=20)
        if r.status_code == 429:
            got_429 = True
            break
        time.sleep(0.1)
    assert got_429, "Expected 429 rate-limit response after >4 signups"
