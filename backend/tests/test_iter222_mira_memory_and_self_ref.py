"""Iter 222 — Mira Memory Panel CRUD + /public/visit self-ref filter."""
import os
import secrets
import time

import pytest
import requests
from tests._creds import pw

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
SUPER_EMAIL = "admin@miracurl-suite.com"
SUPER_PW = pw("SUPER_ADMIN")


@pytest.fixture(scope="module")
def super_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PW}, timeout=15)
    assert r.status_code == 200, r.text
    # CSRF token echoed from cookie
    csrf = s.cookies.get("csrf_token")
    assert csrf, "csrf_token cookie must be set"
    s.headers.update({"X-CSRF-Token": csrf, "Content-Type": "application/json"})
    yield s


# ----- Mira Memory CRUD -----
class TestMiraMemory:
    created_id = None

    def test_list(self, super_session):
        r = super_session.get(f"{BASE_URL}/api/super-admin/mira/memory", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json().get("items"), list)

    def test_create(self, super_session):
        payload = {"category": "goals", "text": "TEST_iter222 memo " + secrets.token_hex(3)}
        r = super_session.post(f"{BASE_URL}/api/super-admin/mira/memory", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["text"] == payload["text"]
        assert d["category"] == "goals"
        assert "id" in d
        TestMiraMemory.created_id = d["id"]
        # Verify persistence via GET
        r2 = super_session.get(f"{BASE_URL}/api/super-admin/mira/memory", timeout=15)
        ids = [m["id"] for m in r2.json()["items"]]
        assert d["id"] in ids

    def test_edit(self, super_session):
        assert TestMiraMemory.created_id
        new_text = "TEST_iter222 edited " + secrets.token_hex(2)
        r = super_session.put(
            f"{BASE_URL}/api/super-admin/mira/memory/{TestMiraMemory.created_id}",
            json={"category": "goals", "text": new_text}, timeout=15)
        assert r.status_code == 200, r.text
        r2 = super_session.get(f"{BASE_URL}/api/super-admin/mira/memory", timeout=15)
        row = next((m for m in r2.json()["items"] if m["id"] == TestMiraMemory.created_id), None)
        assert row and row["text"] == new_text

    def test_delete(self, super_session):
        assert TestMiraMemory.created_id
        r = super_session.delete(
            f"{BASE_URL}/api/super-admin/mira/memory/{TestMiraMemory.created_id}", timeout=15)
        assert r.status_code == 200
        r2 = super_session.get(f"{BASE_URL}/api/super-admin/mira/memory", timeout=15)
        ids = [m["id"] for m in r2.json()["items"]]
        assert TestMiraMemory.created_id not in ids

    def test_edit_404(self, super_session):
        r = super_session.put(
            f"{BASE_URL}/api/super-admin/mira/memory/nope-{secrets.token_hex(4)}",
            json={"category": "general", "text": "doesn't exist"}, timeout=15)
        assert r.status_code == 404


# ----- /public/visit self-ref filter -----
class TestPublicVisitSelfRef:
    def test_self_ref_app_emergent_sh_is_ignored(self, super_session):
        before = super_session.get(f"{BASE_URL}/api/super-admin/traffic-conversion", timeout=20).json()
        before_v = before["current"]["visitors"]
        vid = secrets.token_urlsafe(9)[:12]
        r = requests.post(f"{BASE_URL}/api/public/visit",
                          json={"vid": vid, "path": "/pricing", "ref": "app.emergent.sh"}, timeout=15)
        assert r.status_code == 204
        time.sleep(1.5)
        after = super_session.get(f"{BASE_URL}/api/super-admin/traffic-conversion", timeout=20).json()
        assert after["current"]["visitors"] == before_v, "self-ref visit must NOT increment visitor count"

    def test_self_ref_emergentagent_com_subdomain_ignored(self, super_session):
        before = super_session.get(f"{BASE_URL}/api/super-admin/traffic-conversion", timeout=20).json()
        before_v = before["current"]["visitors"]
        vid = secrets.token_urlsafe(9)[:12]
        r = requests.post(f"{BASE_URL}/api/public/visit",
                          json={"vid": vid, "path": "/pricing", "ref": "hair-hub-system.preview.emergentagent.com"}, timeout=15)
        assert r.status_code == 204
        time.sleep(1.5)
        after = super_session.get(f"{BASE_URL}/api/super-admin/traffic-conversion", timeout=20).json()
        assert after["current"]["visitors"] == before_v

    def test_normal_ref_increments(self, super_session):
        before = super_session.get(f"{BASE_URL}/api/super-admin/traffic-conversion", timeout=20).json()
        before_v = before["current"]["visitors"]
        vid = "T" + secrets.token_urlsafe(9)[:11]
        r = requests.post(f"{BASE_URL}/api/public/visit",
                          json={"vid": vid, "path": "/pricing", "ref": "google.com"}, timeout=15)
        assert r.status_code == 204
        time.sleep(1.5)
        after = super_session.get(f"{BASE_URL}/api/super-admin/traffic-conversion", timeout=20).json()
        assert after["current"]["visitors"] == before_v + 1, "normal ref MUST increment visitor count"
