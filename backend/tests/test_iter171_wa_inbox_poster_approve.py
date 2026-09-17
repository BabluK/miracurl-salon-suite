"""Iter 171 backend tests: poster text overlay, replies inbox, draft approve/cancel 409 paths.

Constraints:
- Poster paint endpoint is PAID → call at most ONCE total across suite.
- NEVER approve a real draft; only test 404/409 validation paths.
- NEVER POST a valid /campaigns or /test-send payload.
"""
import io
import os
import re
import pytest
import requests
from PIL import Image

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
TENANT = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = "q6QY@tn3p#9DtL"


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT, "Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:200]}"
    csrf = r.json().get("csrf") or r.cookies.get("csrf_token")
    if csrf:
        s.headers["X-CSRF-Token"] = csrf
    return s


# -------- Replies inbox --------
def test_inbox_default_7_days(admin):
    r = admin.get(f"{BASE}/api/whatsapp-link/inbox")
    assert r.status_code == 200, r.text[:300]
    j = r.json()
    assert j.get("linked") is True
    assert "replies" in j and isinstance(j["replies"], list)
    assert "unread" in j and isinstance(j["unread"], int)
    salon_last10 = "8217072523"[-10:]
    for rep in j["replies"]:
        p = rep.get("phone", "")
        assert p and p.isdigit() and len(p) <= 15, f"Bad phone: {rep}"
        assert rep.get("body") and isinstance(rep["body"], str) and rep["body"].strip()
        assert "name" in rep
        assert "at" in rep
        assert p[-10:] != salon_last10, f"Salon's own phone leaked in replies: {rep}"


def test_inbox_days_1(admin):
    r = admin.get(f"{BASE}/api/whatsapp-link/inbox?days=1")
    assert r.status_code == 200, r.text[:300]
    j = r.json()
    assert j.get("linked") is True
    assert isinstance(j.get("replies"), list)


# -------- Approve / Cancel 409 paths (no real draft touched) --------
def test_approve_nonexistent_returns_409(admin):
    r = admin.post(f"{BASE}/api/whatsapp-link/campaigns/does-not-exist-xyz-123/approve")
    assert r.status_code == 409, f"Expected 409, got {r.status_code}: {r.text[:200]}"
    detail = (r.json().get("detail") or "").lower()
    assert "not a pending draft" in detail or "draft" in detail, r.text[:200]


def test_approve_done_campaign_returns_409(admin):
    # Find the 'Festive glow facial test' campaign (created iter169) — should NOT be a draft
    hist = admin.get(f"{BASE}/api/whatsapp-link/campaigns")
    assert hist.status_code == 200, hist.text[:200]
    items = hist.json().get("campaigns") or []
    target = None
    if isinstance(items, list):
        for c in items:
            if "festive glow facial test" in (c.get("name") or c.get("title") or "").lower():
                target = c
                break
    if not target:
        pytest.skip("'Festive glow facial test' campaign not present in history")
    cid = target.get("id")
    assert cid
    assert (target.get("status") or "").lower() != "draft"
    r = admin.post(f"{BASE}/api/whatsapp-link/campaigns/{cid}/approve")
    assert r.status_code == 409, f"Expected 409 on non-draft approve, got {r.status_code}: {r.text[:200]}"


def test_cancel_nonexistent_returns_409(admin):
    r = admin.post(f"{BASE}/api/whatsapp-link/campaigns/does-not-exist-xyz-456/cancel")
    assert r.status_code == 409, f"Expected 409, got {r.status_code}: {r.text[:200]}"


# -------- Poster (PAID - single call) --------
# Skip if UI test is planned to cover it. Controlled via env var POSTER_SKIP=1
@pytest.mark.skipif(os.environ.get("POSTER_SKIP") == "1", reason="Poster covered via UI")
def test_poster_paints_with_real_text(admin):
    r = admin.post(f"{BASE}/api/whatsapp-link/campaigns/poster",
                   json={"offer_type": "discount", "discount_pct": 25, "headline": "Monsoon Glow Sale"},
                   timeout=120)
    assert r.status_code == 200, f"poster failed: {r.status_code} {r.text[:300]}"
    j = r.json()
    url = j.get("url") or ""
    assert url.startswith("/api/files/"), f"Bad url: {url}"
    # Download file and validate size + Pillow
    dl = requests.get(f"{BASE}{url}", timeout=30)
    assert dl.status_code == 200, f"file dl {dl.status_code}"
    data = dl.content
    assert len(data) > 30 * 1024, f"Poster too small: {len(data)}B"
    img = Image.open(io.BytesIO(data))
    img.verify()  # valid image
    print(f"Poster OK: {len(data)}B, format={img.format}, size={img.size}")
