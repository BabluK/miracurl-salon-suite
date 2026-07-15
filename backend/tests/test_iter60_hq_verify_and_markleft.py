"""Iter60 — HQ staff verification (super-admin) + mark-left flow + public HQ badge."""
import os
import time
import requests
import pytest

def _load_base():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL missing")

BASE = _load_base()

SUPER_EMAIL = "super@miracurl.com"
SUPER_PASS = "og9T@41Es#OQb6"
TENANT_SLUG = "miracurl-marathahalli"
TENANT_EMAIL = "admin@miracurl.com"
TENANT_PASS = "q6QY@tn3p#9DtL"
OWNER_PIN = "4321"


@pytest.fixture(scope="module")
def super_sess():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def tenant_sess():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": TENANT_EMAIL, "password": TENANT_PASS},
               headers={"X-Tenant-Slug": TENANT_SLUG},
               timeout=15)
    assert r.status_code == 200, r.text
    s.headers.update({"X-Tenant-Slug": TENANT_SLUG, "X-Owner-Pin": OWNER_PIN})
    return s


# ---------- HQ staff verification (super-admin) ----------
class TestHQVerify:
    def test_non_super_forbidden(self, tenant_sess):
        r = tenant_sess.post(f"{BASE}/api/super/registry/staff",
                             json={"name": "Nope", "phone": "9999999999", "salon_name": "X"},
                             timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_create_list_delete(self, super_sess):
        phone = "9" + str(int(time.time()))[-9:]
        payload = {
            "name": "TEST_iter60 HQ",
            "phone": phone,
            "salon_name": "TEST_iter60 Salon",
            "role": "Stylist",
            "years_worked": 3,
            "city": "Bengaluru",
            "owner_comment": "Trusted for 3 years",
        }
        r = super_sess.post(f"{BASE}/api/super/registry/staff", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("ok")
        assert j.get("staff_code", "").startswith("STF-")
        code = j["staff_code"]

        # List
        r = super_sess.get(f"{BASE}/api/super/registry/staff", timeout=15)
        assert r.status_code == 200
        recs = r.json()["records"]
        mine = [x for x in recs if x.get("staff", {}).get("staff_code") == code]
        assert len(mine) >= 1
        rid = mine[0]["id"]
        assert mine[0]["hq_verified"]

        # Delete
        r = super_sess.delete(f"{BASE}/api/super/registry/staff/{rid}", timeout=15)
        assert r.status_code == 200

        # Delete again -> 404
        r = super_sess.delete(f"{BASE}/api/super/registry/staff/{rid}", timeout=15)
        assert r.status_code == 404


# ---------- Mark-left (tenant admin) ----------
class TestMarkLeft:
    def test_mark_left_flow(self, tenant_sess):
        # Create a fresh staff + open employment via public/tenant registry create
        aadhaar = str(int(time.time() * 1000))[-12:].rjust(12, "1")
        phone = "8" + str(int(time.time()))[-9:]
        body = {
            "name": "TEST_iter60 ML",
            "phone": phone,
            "aadhaar": aadhaar,
            "permanent_address": "TEST_iter60 addr Bengaluru",
            "current_address": "TEST_iter60 addr Bengaluru",
            "city": "Bengaluru",
            "email": "",
        }
        r = tenant_sess.post(f"{BASE}/api/registry/employees", json=body, timeout=15)
        assert r.status_code == 200, r.text
        eid = r.json()["id"]
        # Add open employment
        emp_body = {
            "designation": "Stylist",
            "skills": [],
            "from_date": "2024-01-01",
            "to_date": None,
            "rating": None,
            "reason_for_leaving": "Working",
            "comment": "TEST_iter60",
        }
        r = tenant_sess.post(f"{BASE}/api/registry/employees/{eid}/employments", json=emp_body, timeout=15)
        assert r.status_code == 200, r.text
        rid = r.json()["id"]

        # Invalid reason -> 422
        bad = tenant_sess.put(f"{BASE}/api/registry/employments/{rid}/mark-left",
                              json={"reason_for_leaving": "Working"}, timeout=15)
        assert bad.status_code == 422, bad.text

        # Success
        ok = tenant_sess.put(f"{BASE}/api/registry/employments/{rid}/mark-left",
                             json={"reason_for_leaving": "Resigned", "rating": 4,
                                   "comment": "TEST_iter60 left OK"}, timeout=15)
        assert ok.status_code == 200, ok.text
        assert ok.json().get("to_date")

        # Repeat -> 400
        again = tenant_sess.put(f"{BASE}/api/registry/employments/{rid}/mark-left",
                                json={"reason_for_leaving": "Resigned"}, timeout=15)
        assert again.status_code == 400, again.text

        # Another tenant slug -> 404
        s2 = requests.Session()
        r2 = s2.post(f"{BASE}/api/auth/login",
                     json={"email": "owner@elegance.com", "password": "Owner@123"},
                     headers={"X-Tenant-Slug": "elegance-koramangala"}, timeout=15)
        if r2.status_code == 200:
            s2.headers.update({"X-Tenant-Slug": "elegance-koramangala", "X-Owner-Pin": "4321"})
            other = s2.put(f"{BASE}/api/registry/employments/{rid}/mark-left",
                           json={"reason_for_leaving": "Resigned"}, timeout=15)
            assert other.status_code == 404


# ---------- Public HQ badge (rate-limit sensitive) ----------
class TestPublicHQBadge:
    def test_public_search_returns_hq_verified(self):
        # Use the pre-existing STF-00098 Ravi Kumar 9898989811
        r = requests.get(f"{BASE}/api/public/registry/search",
                         params={"q": "9898989811"}, timeout=15)
        if r.status_code == 429:
            pytest.skip("Public search rate limited")
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("hq_verified")
        assert any(e.get("hq_verified") for e in j.get("employments", []))
