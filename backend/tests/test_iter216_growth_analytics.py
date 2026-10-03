"""Iter 216 — growth analytics: /api/public/visit, /api/super-admin/traffic-conversion, /api/super-admin/signup-qr.

Covers:
- Visit beacon stores valid marketing paths with vid, ignores non-marketing & invalid vids.
- signup_page flag true for /signup-* paths.
- Traffic/Conversion endpoint auth + shape + clarity_url contains project id.
- Signup QR list + PNG endpoints (and 404 on unknown key).
"""
import io
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

_BE = dotenv_values("/app/backend/.env")
_FE = dotenv_values("/app/frontend/.env")
BASE_URL = (_FE.get("REACT_APP_BACKEND_URL") or os.environ["REACT_APP_BACKEND_URL"]).rstrip("/")
MONGO_URL = _BE.get("MONGO_URL") or os.environ["MONGO_URL"]
DB_NAME = _BE.get("DB_NAME") or os.environ["DB_NAME"]

SUPER_EMAIL = "admin@miracurl-suite.com"
SUPER_PASS = "og9T@41Es#OQb6"


@pytest.fixture(scope="module")
def mongo_db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def super_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS}, timeout=15)
    assert r.status_code == 200, f"super admin login failed: {r.status_code} {r.text[:200]}"
    return s


# --- Visit beacon ----------------------------------------------------------

class TestVisitBeacon:
    def test_valid_marketing_visit_stored(self, mongo_db):
        vid = "testvid" + uuid.uuid4().hex[:8]
        r = requests.post(f"{BASE_URL}/api/public/visit",
                          json={"vid": vid, "path": "/pricing", "ref": "instagram.com",
                                "region": "in", "utm_source": "qr"}, timeout=10)
        assert r.status_code == 204, r.text
        time.sleep(0.4)
        doc = mongo_db.site_visits.find_one({"vid": vid})
        assert doc is not None, "visit not stored"
        assert doc["path"] == "/pricing"
        assert doc["signup_page"] is False
        assert doc["ref"] == "instagram.com"
        assert doc["utm_source"] == "qr"
        mongo_db.site_visits.delete_many({"vid": vid})

    def test_non_marketing_path_not_stored(self, mongo_db):
        vid = "testvid" + uuid.uuid4().hex[:8]
        r = requests.post(f"{BASE_URL}/api/public/visit",
                          json={"vid": vid, "path": "/dashboard"}, timeout=10)
        assert r.status_code == 204
        time.sleep(0.3)
        assert mongo_db.site_visits.find_one({"vid": vid}) is None

        vid2 = "testvid" + uuid.uuid4().hex[:8]
        r2 = requests.post(f"{BASE_URL}/api/public/visit",
                           json={"vid": vid2, "path": "/book/xyz"}, timeout=10)
        assert r2.status_code == 204
        time.sleep(0.3)
        assert mongo_db.site_visits.find_one({"vid": vid2}) is None

    def test_invalid_vid_not_stored(self, mongo_db):
        r = requests.post(f"{BASE_URL}/api/public/visit",
                          json={"vid": "short", "path": "/pricing"}, timeout=10)
        # pydantic will 422; endpoint explicitly also handles non-matching regex → 204
        assert r.status_code in (204, 422)
        if r.status_code == 204:
            time.sleep(0.3)
            assert mongo_db.site_visits.find_one({"vid": "short"}) is None

    def test_signup_page_flag_true(self, mongo_db):
        vid = "testvid" + uuid.uuid4().hex[:8]
        r = requests.post(f"{BASE_URL}/api/public/visit",
                          json={"vid": vid, "path": "/signup-salon-us", "region": "intl"}, timeout=10)
        assert r.status_code == 204
        time.sleep(0.4)
        doc = mongo_db.site_visits.find_one({"vid": vid})
        assert doc is not None
        assert doc["signup_page"] is True
        mongo_db.site_visits.delete_many({"vid": vid})


# --- Traffic / Conversion -------------------------------------------------

class TestTrafficConversion:
    def test_unauthed_denied(self):
        r = requests.get(f"{BASE_URL}/api/super-admin/traffic-conversion", timeout=10)
        assert r.status_code in (401, 403)

    def test_shape(self, super_session):
        r = super_session.get(f"{BASE_URL}/api/super-admin/traffic-conversion", timeout=15)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        for k in ("month", "current", "previous", "projected_visitors", "verdict",
                  "daily", "top_referrers", "top_sources", "ga4_url", "clarity_url"):
            assert k in d, f"missing key {k}"
        for k in ("views", "visitors", "signup_visitors", "signups", "conversion_pct", "signup_page_rate_pct"):
            assert k in d["current"], f"missing current.{k}"
            assert k in d["previous"], f"missing previous.{k}"
        assert "yrwbxjqzwq" in d["clarity_url"], d["clarity_url"]
        assert d["verdict"]["kind"] in ("traffic", "conversion", "healthy")
        # given tiny visit counts in preview DB expected verdict is 'traffic'
        assert d["verdict"]["kind"] == "traffic", f"expected traffic verdict, got {d['verdict']}"
        assert isinstance(d["daily"], list)
        assert isinstance(d["top_referrers"], list)


# --- Signup QR ------------------------------------------------------------

class TestSignupQr:
    def test_unauthed_denied(self):
        r = requests.get(f"{BASE_URL}/api/super-admin/signup-qr", timeout=10)
        assert r.status_code in (401, 403)
        r2 = requests.get(f"{BASE_URL}/api/super-admin/signup-qr/salon-india.png", timeout=10)
        assert r2.status_code in (401, 403)

    def test_list(self, super_session):
        r = super_session.get(f"{BASE_URL}/api/super-admin/signup-qr", timeout=10)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert "base" in d and isinstance(d["cards"], list)
        assert len(d["cards"]) == 4
        keys = {c["key"] for c in d["cards"]}
        assert keys == {"salon-india", "salon-us", "restaurant-india", "restaurant-us"}
        for c in d["cards"]:
            assert c["url"].endswith("?utm_source=qr&utm_medium=print"), c["url"]
            assert c["path"].startswith("/signup-")

    def test_png_valid(self, super_session):
        r = super_session.get(f"{BASE_URL}/api/super-admin/signup-qr/salon-india.png", timeout=15)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/png")
        assert r.content[:8] == b"\x89PNG\r\n\x1a\n"
        # decodable as image
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(r.content))
            assert img.size[0] > 50 and img.size[1] > 50
        except ImportError:
            pass

    def test_png_unknown_key(self, super_session):
        r = super_session.get(f"{BASE_URL}/api/super-admin/signup-qr/bogus-key.png", timeout=10)
        assert r.status_code == 404
