"""Iter 64 — Super Admin notifications feed + public per-salon SEO page + sitemap."""
import os
import requests
import pytest

from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def super_session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={
        "email": "super@miracurl.com", "password": "og9T@41Es#OQb6"
    })
    assert r.status_code == 200, f"Super login failed: {r.status_code} {r.text}"
    return s


# ── Notifications feed ──────────────────────────────────────────
class TestNotifications:
    def test_requires_auth(self):
        r = requests.get(f"{BASE}/api/super-admin/notifications")
        assert r.status_code in (401, 403)

    def test_feed_shape(self, super_session):
        r = super_session.get(f"{BASE}/api/super-admin/notifications")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and "unread" in data
        assert isinstance(data["items"], list)
        assert isinstance(data["unread"], int)
        assert data["unread"] >= 0
        # If any items present, verify item shape
        allowed_types = {"hiring", "inbox", "lead", "renewal", "signup"}
        for it in data["items"][:5]:
            for k in ("id", "type", "icon", "title", "tab", "unread"):
                assert k in it, f"missing key {k} in {it}"
            assert it["type"] in allowed_types, f"unexpected type {it['type']}"


# ── Public per-salon SEO page ───────────────────────────────────
class TestPublicSalonPage:
    def test_valid_slug_no_auth(self):
        r = requests.get(f"{BASE}/api/public/salon-page/miracurl-marathahalli")
        assert r.status_code == 200
        d = r.json()
        assert d["name"] and d["slug"] == "miracurl-marathahalli"
        assert "avg_rating" in d and "reviews_count" in d
        assert isinstance(d["services"], list)
        assert isinstance(d["reviews"], list)
        assert d["book_url"] == "/book/miracurl-marathahalli"
        # services must not leak _id
        for sv in d["services"]:
            assert "_id" not in sv

    def test_unknown_slug_404(self):
        r = requests.get(f"{BASE}/api/public/salon-page/does-not-exist-xyz")
        assert r.status_code == 404


# ── Sitemap ─────────────────────────────────────────────────────
class TestSitemap:
    def test_sitemap_xml(self):
        r = requests.get(f"{BASE}/api/public/sitemap-salons.xml")
        assert r.status_code == 200
        assert "xml" in r.headers.get("content-type", "").lower()
        body = r.text
        assert "<urlset" in body and "</urlset>" in body
        # At least one active tenant should be present
        assert "/salon/" in body
