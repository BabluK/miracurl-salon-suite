"""Regression test for POST /api/gallery/generate - branded flyer with post_caption."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
TENANT_SLUG = "miracurl-marathahalli"
EMAIL = "admin@miracurl.com"
PASSWORD = "q6QY@tn3p#9DtL"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT_SLUG})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


def test_gallery_generate_branded_flyer(session):
    r = session.post(
        f"{BASE_URL}/api/gallery/generate",
        json={"prompt": "Weekend special - 30% off keratin treatment"},
        timeout=240,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text[:500]}"
    data = r.json()
    assert "id" in data
    assert "url" in data and data["url"].startswith("/")
    assert "post_caption" in data and isinstance(data["post_caption"], str)
    pc = data["post_caption"]
    assert len(pc) >= 20, f"post_caption too short: {pc}"
    # should read like a social caption - most likely has emoji/hashtag
    assert ("#" in pc) or ("!" in pc) or ("✂" in pc) or ("✨" in pc), f"caption doesn't look social: {pc}"
    print("post_caption:", pc)
    print("url:", data["url"])
