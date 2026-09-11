"""Iter 150 — Color try-on gender step + men/women sections + gender persistence."""
import os
import requests
import pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
SLUG = "miracurl-marathahalli"


def _get(path):
    return requests.get(f"{BASE}{path}", timeout=30)


def _post(path, json=None):
    return requests.post(f"{BASE}{path}", json=json, timeout=60)


class TestPublicCatalogueMenFlags:
    def test_catalog_men_flags(self):
        r = _get(f"/api/public/color/{SLUG}")
        assert r.status_code == 200, r.text
        colors = r.json()["colors"]
        by_id = {c["id"]: c for c in colors}
        assert by_id["natural-black"].get("men") is True
        assert by_id["dark-brown"].get("men") is True
        # pastel-pink: no men flag (falsy)
        assert not by_id["pastel-pink"].get("men")
        # custom shades should have men=True
        customs = [c for c in colors if c["id"].startswith("custom-")]
        for c in customs:
            assert c.get("men") is True, f"custom {c['id']} not men flagged"


class TestPickGender:
    def test_pick_men(self):
        r = _post(f"/api/public/color/{SLUG}/pick",
                  {"color_id": "dark-brown", "name": "TEST_QA_Gender_Men", "gender": "men"})
        assert r.status_code == 200, r.text
        code = r.json()["code"]
        # verify persistence — hit admin endpoint requires auth; use undocumented list via login
        # instead verify code non-empty and re-post women
        assert code

    def test_pick_women(self):
        r = _post(f"/api/public/color/{SLUG}/pick",
                  {"color_id": "pastel-pink", "name": "TEST_QA_Gender_Women", "gender": "women"})
        assert r.status_code == 200, r.text

    def test_pick_gender_invalid(self):
        r = _post(f"/api/public/color/{SLUG}/pick",
                  {"color_id": "dark-brown", "name": "TEST_QA_Bad", "gender": "other"})
        assert r.status_code == 422, r.text

    def test_pick_gender_empty_allowed(self):
        r = _post(f"/api/public/color/{SLUG}/pick",
                  {"color_id": "dark-brown", "name": "TEST_QA_NoGender"})
        assert r.status_code == 200, r.text


class TestPreviewValidation:
    def test_preview_tiny_selfie(self):
        r = _post(f"/api/public/color/{SLUG}/preview",
                  {"color_id": "dark-brown", "selfie_b64": "AAAA"})
        assert r.status_code == 400
        assert "small" in r.text.lower()

    def test_preview_unknown_color(self):
        big = "A" * 3000
        r = _post(f"/api/public/color/{SLUG}/preview",
                  {"color_id": "no-such-color", "selfie_b64": big})
        assert r.status_code == 404


class TestPersistedGender:
    """Verify persistence via authenticated color-picks list."""

    @pytest.fixture(scope="class")
    def auth(self):
        s = requests.Session()
        r = s.post(f"{BASE}/api/auth/login",
                   headers={"X-Tenant-Slug": SLUG, "Content-Type": "application/json"},
                   json={"email": "admin@miracurl.com", "password": "q6QY@tn3p#9DtL"})
        if r.status_code != 200:
            pytest.skip(f"login failed: {r.status_code} {r.text[:200]}")
        s.headers.update({"X-Tenant-Slug": SLUG})
        return s

    def test_gender_stored(self, auth):
        # create a fresh pick
        name = "TEST_QA_Persist_Men"
        r = _post(f"/api/public/color/{SLUG}/pick",
                  {"color_id": "dark-brown", "name": name, "gender": "men"})
        assert r.status_code == 200
        listing = auth.get(f"{BASE}/api/color-picks?limit=50")
        assert listing.status_code == 200, listing.text
        picks = listing.json()["picks"]
        match = [p for p in picks if p.get("name") == name]
        assert match, "pick not in list"
        assert match[0].get("gender") == "men"


class TestRegressionAdminCatalog:
    def test_admin_hair_colors(self):
        s = requests.Session()
        r = s.post(f"{BASE}/api/auth/login",
                   headers={"X-Tenant-Slug": SLUG, "Content-Type": "application/json"},
                   json={"email": "admin@miracurl.com", "password": "q6QY@tn3p#9DtL"})
        if r.status_code != 200:
            pytest.skip("login failed")
        s.headers.update({"X-Tenant-Slug": SLUG})
        r = s.get(f"{BASE}/api/hair-colors")
        assert r.status_code == 200
        assert "colors" in r.json()
        assert len(r.json()["colors"]) >= 18
