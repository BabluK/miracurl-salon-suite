"""Iteration 70 — Mira AI Studio (B2C standalone builder) backend tests.

Endpoints under test (actual paths from /app/backend/routes/mira_builder.py):
  POST /api/public/mira-studio/register    (50 free credits)
  POST /api/public/mira-studio/login
  GET  /api/mira-studio/me
  GET  /api/public/mira-studio/plans
  POST /api/mira-studio/buy                (Razorpay order)
  POST /api/public/mira-builder/start      {kind: website|app}
  GET  /api/public/mira-builder/status/{pid}
  GET  /api/site/{slug}                    (live URL serves HTML)
  GET  /api/public/mira-builder/download/{pid}

Also light regression on salon SaaS auth + public booking page.
"""
from _creds import _PW_ADMIN
import os
import time
import uuid

import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    # fall back to /app/frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE = _load_backend_url()
API = f"{BASE}/api"

# ---- shared fixtures ---------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers["Content-Type"] = "application/json"
    return s


@pytest.fixture(scope="module")
def studio_user(client):
    """Register a fresh studio user, return {token, email, password, user}."""
    unique = uuid.uuid4().hex[:8]
    email = f"test_studio_{unique}@example.com"
    password = f"Tp@{uuid.uuid4().hex[:10]}"  # random per-run, nothing hardcoded
    payload = {
        "name": "Studio Tester",
        "email": email,
        "phone": "9876543210",
        "password": password,
    }
    r = client.post(f"{API}/public/mira-studio/register", json=payload)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and data["token"]
    assert data["user"]["email"] == email
    assert data["user"]["credits"] == 50, f"Expected 50 free credits, got {data['user']['credits']}"
    return {"token": data["token"], "email": email, "password": password, "user": data["user"]}


@pytest.fixture(scope="module")
def auth_headers(studio_user):
    return {"Authorization": f"Bearer {studio_user['token']}", "Content-Type": "application/json"}


# ---- 1. Registration & Login -------------------------------------------------

class TestStudioAuth:
    def test_register_creates_user_with_50_credits(self, studio_user):
        assert studio_user["user"]["credits"] == 50

    def test_duplicate_register_rejected(self, client, studio_user):
        r = client.post(f"{API}/public/mira-studio/register", json={
            "name": "Dup", "email": studio_user["email"], "phone": "9876543210",
            "password": "AnyPass@123",
        })
        assert r.status_code == 400

    def test_login_returns_token_and_credits(self, client, studio_user):
        r = client.post(f"{API}/public/mira-studio/login", json={
            "email": studio_user["email"], "password": studio_user["password"],
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["token"]
        assert data["user"]["credits"] == 50
        assert data["costs"] == {"website": 20, "app": 30, "refine": 5}

    def test_login_wrong_password(self, client, studio_user):
        r = client.post(f"{API}/public/mira-studio/login", json={
            "email": studio_user["email"], "password": "WrongPass@123",
        })
        assert r.status_code == 401

    def test_me_returns_user(self, client, auth_headers):
        r = client.get(f"{API}/mira-studio/me", headers=auth_headers)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["credits"] >= 0

    def test_me_requires_auth(self, client):
        r = client.get(f"{API}/mira-studio/me")
        assert r.status_code == 401


# ---- 2. Plans & Razorpay order ----------------------------------------------

class TestStudioBilling:
    def test_plans_public(self, client):
        r = client.get(f"{API}/public/mira-studio/plans")
        assert r.status_code == 200
        data = r.json()
        assert data["free_credits"] == 50
        assert len(data["plans"]) >= 3

    def test_buy_creates_razorpay_order(self, client, auth_headers):
        r = client.post(f"{API}/mira-studio/buy", headers=auth_headers, json={"plan": "plan_100"})
        # 200 if Razorpay keys valid; 503 if not configured
        if r.status_code == 503:
            pytest.skip("Razorpay not configured on preview")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["order_id"].startswith("order_")
        assert data["amount"] == 100000  # ₹1000 * 100 paise
        assert data["credits"] == 100
        assert data["key_id"]

    def test_buy_unknown_plan(self, client, auth_headers):
        r = client.post(f"{API}/mira-studio/buy", headers=auth_headers, json={"plan": "plan_bogus"})
        assert r.status_code == 400


# ---- 3. Build website (full AI pipeline, may take 30-90s) --------------------

class TestBuildWebsite:
    def test_build_website_end_to_end(self, client, auth_headers):
        # snapshot credits
        me = client.get(f"{API}/mira-studio/me", headers=auth_headers).json()
        before = me["user"]["credits"]

        r = client.post(f"{API}/public/mira-builder/start", headers=auth_headers, json={
            "kind": "website",
            "prompt": "A modern one-page website for a Bangalore hair salon called Aura, elegant gold theme",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        pid = data["project_id"]
        assert data["cost"] == 20
        assert data["credits"] == before - 20

        # poll status
        deadline = time.time() + 180  # up to 3 min
        final = None
        while time.time() < deadline:
            s = client.get(f"{API}/public/mira-builder/status/{pid}")
            assert s.status_code == 200
            doc = s.json()
            if doc["status"] in ("live", "failed"):
                final = doc
                break
            time.sleep(3)
        assert final is not None, "Build did not finish within timeout"
        assert final["status"] == "live", f"Build failed: {final.get('error')}"
        slug = final["slug"]

        # live URL serves HTML
        live = client.get(f"{BASE}/api/site/{slug}")
        assert live.status_code == 200
        assert "<!doctype" in live.text.lower() or "<!DOCTYPE" in live.text
        assert "</html>" in live.text.lower()

        # download zip
        dl = client.get(f"{API}/public/mira-builder/download/{pid}")
        assert dl.status_code == 200
        assert dl.headers.get("content-type", "").startswith("application/zip")
        assert len(dl.content) > 1000

        # store for insufficient-credits test
        TestBuildWebsite._pid = pid


# ---- 4. Insufficient credits -------------------------------------------------

class TestInsufficientCredits:
    def test_402_when_not_enough_credits(self, client):
        # fresh user, drain credits by requesting an "app" build (cost 30) twice — first ok, second must fail (only 50 - 30 = 20 left < 30)
        unique = uuid.uuid4().hex[:8]
        email = f"test_broke_{unique}@example.com"
        reg = client.post(f"{API}/public/mira-studio/register", json={
            "name": "Broke", "email": email, "phone": "9876543210", "password": "TestPass@123",
        })
        assert reg.status_code == 200
        hdr = {"Authorization": f"Bearer {reg.json()['token']}", "Content-Type": "application/json"}

        # first app build: succeeds in deducting credits (may then fail internally which refunds — so we
        # instead do 2 sequential website builds where the SECOND drains and THIRD must 402)
        # actually simpler: user has 50, request an "app" (30) — leaves 20, then request another "app" (30) -> 402
        r1 = client.post(f"{API}/public/mira-builder/start", headers=hdr, json={
            "kind": "app", "prompt": "small toy CRM for a car wash",
        })
        assert r1.status_code == 200, r1.text
        assert r1.json()["credits"] == 20

        r2 = client.post(f"{API}/public/mira-builder/start", headers=hdr, json={
            "kind": "app", "prompt": "another crm",
        })
        assert r2.status_code == 402, r2.text

        # verify credits not negative
        me = client.get(f"{API}/mira-studio/me", headers=hdr).json()
        assert me["user"]["credits"] >= 0


# ---- 5. Salon SaaS regression -----------------------------------------------

class TestSalonRegression:
    def test_salon_admin_login(self, client):
        r = requests.post(f"{API}/auth/login",
                          headers={"X-Tenant-Slug": "miracurl-marathahalli", "Content-Type": "application/json"},
                          json={"email": "admin@miracurl.com", "password": _PW_ADMIN})
        assert r.status_code == 200, r.text
        assert "access_token" in r.json() or r.cookies

    def test_public_booking_page_loads(self):
        # HTML frontend route — just verify it 200s
        r = requests.get(f"{BASE}/book/hair-hub-system", allow_redirects=True, timeout=15)
        assert r.status_code == 200
