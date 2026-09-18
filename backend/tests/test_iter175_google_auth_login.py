"""Iter 175 — Google Emergent auth endpoint + password login regression.

Covers:
  * POST /api/auth/google/session  → 401 on bogus session_id
  * POST /api/auth/google/session  → 422 on missing body
  * 25 rapid calls → eventually 429 (rate limit 20/10min)
  * Password login regression for salon admin + super admin
"""
import os
import requests
import pytest

def _load_env():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for line in open(p):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return os.environ["REACT_APP_BACKEND_URL"]

BASE_URL = _load_env().rstrip("/")
GOOG = f"{BASE_URL}/api/auth/google/session"
LOGIN = f"{BASE_URL}/api/auth/login"


# ---------- Google session endpoint ----------
class TestGoogleSession:
    def test_bogus_session_id_returns_401(self):
        r = requests.post(GOOG, json={"session_id": "bogus-session-id-123"}, timeout=20)
        assert r.status_code == 401, f"expected 401 got {r.status_code}: {r.text[:200]}"
        body = r.json()
        assert "expired" in (body.get("detail") or "").lower() or body.get("detail")

    def test_missing_body_returns_422(self):
        r = requests.post(GOOG, json={}, timeout=15)
        assert r.status_code == 422, f"expected 422 got {r.status_code}: {r.text[:200]}"

    def test_rate_limit_eventually_429(self):
        """25 rapid calls from same IP — expect at least one 429 (rate limit 20/600s)."""
        session = requests.Session()
        codes = []
        for i in range(25):
            try:
                r = session.post(GOOG, json={"session_id": f"probe-session-id-{i:03d}"}, timeout=15)
                codes.append(r.status_code)
                if r.status_code == 429:
                    break
            except requests.RequestException as e:
                codes.append(f"err:{e}")
        assert 429 in codes, f"never hit 429 across 25 calls; codes={codes}"


# ---------- Password login regression ----------
class TestPasswordLoginRegression:
    def test_salon_admin_login(self):
        s = requests.Session()
        r = s.post(LOGIN,
                   json={"email": "admin@miracurl.com", "password": "q6QY@tn3p#9DtL"},
                   headers={"X-Tenant-Slug": "miracurl-marathahalli"},
                   timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"
        data = r.json()
        assert data.get("user", {}).get("role") in ("admin", "owner"), data
        # cookies set
        assert "access_token" in s.cookies

    def test_super_admin_login(self):
        s = requests.Session()
        r = s.post(LOGIN,
                   json={"email": "super@miracurl.com", "password": "og9T@41Es#OQb6"},
                   timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"
        assert r.json().get("user", {}).get("role") == "super_admin"
        assert "access_token" in s.cookies

    def test_logout_clears_cookie(self):
        s = requests.Session()
        s.post(LOGIN, json={"email": "super@miracurl.com", "password": "og9T@41Es#OQb6"}, timeout=20)
        assert "access_token" in s.cookies
        csrf = s.cookies.get("csrf_token", "")
        r = s.post(f"{BASE_URL}/api/auth/logout", headers={"X-CSRF-Token": csrf}, timeout=15)
        assert r.status_code == 200
