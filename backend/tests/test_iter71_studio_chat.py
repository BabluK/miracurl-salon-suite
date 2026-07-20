"""Iteration 71 — Mira Studio: image upload, analyze (security/review), background refine,
   github-export with bad token, and status transition refining→live.
"""
import io
import os
import time
import uuid

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
STUDIO_EMAIL = "wtest7802@example.com"
STUDIO_PASS = "TestPass@123"
SUPER_EMAIL = "super@miracurl.com"
SUPER_PASS = "og9T@41Es#OQb6"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def studio_token():
    r = requests.post(f"{BASE}/api/public/mira-studio/login",
                      json={"email": STUDIO_EMAIL, "password": STUDIO_PASS}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"], r.json()["user"]["credits"]


@pytest.fixture(scope="module")
def super_cookies():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": SUPER_EMAIL, "password": SUPER_PASS}, timeout=15)
    assert r.status_code == 200, f"super login failed: {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def studio_user_id(super_cookies):
    r = super_cookies.get(f"{BASE}/api/super-admin/studio/users", timeout=15)
    assert r.status_code == 200
    for u in r.json()["users"]:
        if u["email"] == STUDIO_EMAIL:
            return u["id"], int(u["credits"])
    pytest.skip("studio user not found by super admin")


@pytest.fixture(scope="module")
def topped_up_token(studio_token, super_cookies, studio_user_id):
    token, _ = studio_token
    uid, credits = studio_user_id
    # Ensure we have >= 60 credits (build 20 + refine 5 + buffer)
    if credits < 60:
        r = super_cookies.post(f"{BASE}/api/super-admin/studio/users/{uid}/gift",
                               json={"credits": 100, "note": "iter71 test"}, timeout=20)
        assert r.status_code == 200, r.text[:200]
    # re-login for a fresh session snapshot
    r = requests.post(f"{BASE}/api/public/mira-studio/login",
                      json={"email": STUDIO_EMAIL, "password": STUDIO_PASS}, timeout=20)
    return r.json()["token"]


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


# ---------- 1. Image upload ----------
def test_upload_image(topped_up_token):
    # Minimal 1x1 PNG
    png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
           b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8"
           b"\xcf\xc0\x00\x00\x00\x03\x00\x01\x5b\xd8\xa5\x63\x00\x00\x00\x00IEND\xaeB`\x82")
    files = {"file": ("test.png", io.BytesIO(png), "image/png")}
    r = requests.post(f"{BASE}/api/public/mira-builder/upload-image",
                      files=files, headers=_hdr(topped_up_token), timeout=30)
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    assert data["ok"]
    assert data["url"].startswith("/api/files/")
    # Verify file serves
    r2 = requests.get(f"{BASE}{data['url']}", timeout=15)
    assert r2.status_code == 200
    assert r2.headers.get("content-type", "").startswith("image/")


def test_upload_rejects_non_image(topped_up_token):
    files = {"file": ("bad.txt", io.BytesIO(b"hello"), "text/plain")}
    r = requests.post(f"{BASE}/api/public/mira-builder/upload-image",
                      files=files, headers=_hdr(topped_up_token), timeout=15)
    assert r.status_code == 400


# ---------- 2. Build a website, then test analyze + refine ----------
@pytest.fixture(scope="module")
def live_project(topped_up_token):
    r = requests.post(f"{BASE}/api/public/mira-builder/start",
                      json={"kind": "website", "prompt": "Build a small bakery website in Delhi with cake menu"},
                      headers=_hdr(topped_up_token), timeout=30)
    assert r.status_code == 200, r.text[:300]
    pid = r.json()["project_id"]
    # Poll up to 180s
    for _ in range(72):
        time.sleep(2.5)
        s = requests.get(f"{BASE}/api/public/mira-builder/status/{pid}", timeout=15)
        assert s.status_code == 200
        st = s.json().get("status")
        if st == "live":
            return pid
        if st == "failed":
            pytest.fail(f"build failed: {s.json().get('error')}")
    pytest.fail("build did not go live in 180s")


def test_analyze_security(topped_up_token, live_project):
    r = requests.post(f"{BASE}/api/public/mira-builder/analyze",
                      json={"project_id": live_project, "kind": "security"},
                      headers=_hdr(topped_up_token), timeout=90)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert d["ok"]
    assert d["kind"] == "security"
    assert "VERDICT" in d["report"].upper()


def test_analyze_review(topped_up_token, live_project):
    r = requests.post(f"{BASE}/api/public/mira-builder/analyze",
                      json={"project_id": live_project, "kind": "review"},
                      headers=_hdr(topped_up_token), timeout=90)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert d["kind"] == "review"
    assert len(d["report"]) > 30


def test_refine_returns_queued_immediately_and_completes(topped_up_token, live_project):
    t0 = time.time()
    r = requests.post(f"{BASE}/api/public/mira-builder/refine",
                      json={"project_id": live_project, "prompt": "make the header background dark brown"},
                      headers=_hdr(topped_up_token), timeout=15)
    elapsed = time.time() - t0
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert d.get("queued")
    # Must return quickly (background) — under 5s is generous
    assert elapsed < 5, f"refine took {elapsed:.1f}s (should return immediately)"

    # Status should be refining first, then live
    saw_refining = False
    for _ in range(48):  # ~120s
        time.sleep(2.5)
        s = requests.get(f"{BASE}/api/public/mira-builder/status/{live_project}", timeout=15)
        st = s.json().get("status")
        if st == "refining":
            saw_refining = True
        if st == "live" and s.json().get("refine_result"):
            rr = s.json()["refine_result"]
            assert "at" in rr
            return
    pytest.fail(f"refine didn't complete; saw_refining={saw_refining}")


# ---------- 3. GitHub export bad token ----------
def test_github_export_bad_token(topped_up_token, live_project):
    r = requests.post(f"{BASE}/api/public/mira-builder/github-export",
                      json={"project_id": live_project,
                            "token": "ghp_invalidtoken12345678aaaa",
                            "repo_name": f"mira-test-{uuid.uuid4().hex[:6]}",
                            "private": True},
                      headers=_hdr(topped_up_token), timeout=45)
    assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text[:200]}"
    detail = r.json().get("detail", "")
    assert "token" in detail.lower() or "invalid" in detail.lower()


# ---------- 4. Regression: super-admin studio users ----------
def test_super_admin_studio_users_list(super_cookies):
    r = super_cookies.get(f"{BASE}/api/super-admin/studio/users", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "users" in d and "stats" in d
    assert d["stats"]["total"] >= 1
