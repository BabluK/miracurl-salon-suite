"""Iter 40: Cross-Salon Staff History Registry - backend tests."""
import os
import re
import pytest
import requests
import time
from datetime import date, timedelta

_RUN = str(int(time.time()))[-4:]

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")

ADMIN_MIRA = ("admin@miracurl.com", "Miracurl@123")
ADMIN_ELEG = ("owner@elegance.com", "Owner@123")
MANAGER = ("manager@miracurl.com", "Manager@Miracurl123")
STAFF = ("priya.staff@miracurl.com", "Priya@Miracurl123")


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def mira():
    return _login(*ADMIN_MIRA)


@pytest.fixture(scope="module")
def eleg():
    return _login(*ADMIN_ELEG)


# Track created ids for cleanup
_created_employees = []
_created_employments = []


def teardown_module(module):
    # Try clean up via API delete (only owners can delete their own employment rows)
    pass


# ---- Employee creation ----
class TestEmployeeCreation:
    def test_create_employee_success(self, mira):
        aad = f"6{_RUN}0000{_RUN}"[:12].ljust(12, "0")
        payload = {
            "name": "TEST Reg One",
            "aadhaar": aad,
            "phone": "9990001001",
            "email": "test1@example.com",
            "permanent_address": "123 Test St",
            "city": "Bangalore",
        }
        r = mira.post(f"{BASE}/api/registry/employees", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert re.match(r"^STF-\d{5}$", data["staff_code"])
        _created_employees.append({"id": data["id"], "code": data["staff_code"], "aadhaar": aad, "phone": payload["phone"]})

    def test_duplicate_aadhaar_returns_409(self, mira):
        emp = _created_employees[0]
        r = mira.post(f"{BASE}/api/registry/employees", json={
            "name": "TEST Dup", "aadhaar": emp["aadhaar"], "phone": "9990009999",
            "permanent_address": "12345 test addr", "city": "X",
        }, timeout=15)
        assert r.status_code == 409
        assert emp["code"] in r.text

    def test_invalid_aadhaar_400(self, mira):
        r = mira.post(f"{BASE}/api/registry/employees", json={
            "name": "TEST Bad", "aadhaar": "123", "phone": "9990001111",
            "permanent_address": "12345 test addr",
        }, timeout=15)
        assert r.status_code in (400, 422)

    def test_list_employees(self, mira):
        r = mira.get(f"{BASE}/api/registry/employees", timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        # None should leak full aadhaar or aadhaar_hash
        for r_ in rows:
            for k in r_.keys():
                assert k != "aadhaar_hash"
            assert "aadhaar_masked" in r_
            assert r_["aadhaar_masked"].startswith("XXXX-XXXX-")


# ---- Employment records + Badge math ----
def _add_emp(session, eid, from_date, to_date, rating=None):
    body = {
        "designation": "Stylist", "skills": ["cut"],
        "from_date": from_date, "reason_for_leaving": "Working" if to_date is None else "Resigned",
        "comment": "test",
    }
    if to_date:
        body["to_date"] = to_date
        body["reason_for_leaving"] = "Resigned"
    if rating is not None:
        body["rating"] = rating
    r = session.post(f"{BASE}/api/registry/employees/{eid}/employments", json=body, timeout=15)
    assert r.status_code == 200, r.text
    _created_employments.append(r.json()["id"])
    return r.json()["id"]


def _profile(session, code):
    r = session.get(f"{BASE}/api/public/registry/search?q={code}", timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


class TestBadgeMath:
    def _create_emp(self, mira, tag, aadhaar):
        r = mira.post(f"{BASE}/api/registry/employees", json={
            "name": f"TEST Badge {tag}", "aadhaar": aadhaar,
            "phone": f"999000{aadhaar[-4:]}", "permanent_address": "12345 test addr", "city": "X",
        }, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        _created_employees.append({"id": d["id"], "code": d["staff_code"], "aadhaar": aadhaar})
        return d

    def test_good_tier(self, mira):
        # 2 yrs total, rating 4 => GOOD
        emp = self._create_emp(mira, "G", f"6{_RUN}100{_RUN}00"[:12].ljust(12, "0"))
        today = date.today()
        _add_emp(mira, emp["id"], (today - timedelta(days=730)).isoformat(),
                 (today - timedelta(days=1)).isoformat(), rating=4)
        p = _profile(mira, emp["staff_code"])
        assert p["badge"] == "GOOD", p

    def test_excellent_tier(self, mira):
        emp = self._create_emp(mira, "E", f"6{_RUN}200{_RUN}00"[:12].ljust(12, "0"))
        today = date.today()
        _add_emp(mira, emp["id"], (today - timedelta(days=int(365.25*4))).isoformat(),
                 (today - timedelta(days=1)).isoformat(), rating=5)
        p = _profile(mira, emp["staff_code"])
        assert p["badge"] == "EXCELLENT"

    def test_extraordinary_tier(self, mira):
        emp = self._create_emp(mira, "X", f"6{_RUN}300{_RUN}00"[:12].ljust(12, "0"))
        today = date.today()
        _add_emp(mira, emp["id"], (today - timedelta(days=int(365.25*6))).isoformat(),
                 (today - timedelta(days=1)).isoformat(), rating=5)
        p = _profile(mira, emp["staff_code"])
        assert p["badge"] == "EXTRAORDINARY"

    def test_downgrade_low_rating(self, mira):
        # 4 yrs -> EXCELLENT, rating 2.5 => downgrade to GOOD
        emp = self._create_emp(mira, "D", f"6{_RUN}400{_RUN}00"[:12].ljust(12, "0"))
        today = date.today()
        _add_emp(mira, emp["id"], (today - timedelta(days=int(365.25*4))).isoformat(),
                 (today - timedelta(days=1)).isoformat(), rating=2.5)
        p = _profile(mira, emp["staff_code"])
        assert p["badge"] == "GOOD", p

    def test_bad_tier(self, mira):
        emp = self._create_emp(mira, "B", f"6{_RUN}500{_RUN}00"[:12].ljust(12, "0"))
        today = date.today()
        _add_emp(mira, emp["id"], (today - timedelta(days=int(365.25*4))).isoformat(),
                 (today - timedelta(days=1)).isoformat(), rating=1)
        p = _profile(mira, emp["staff_code"])
        assert p["badge"] == "BAD"


# ---- Cross-tenant ----
class TestCrossTenant:
    def test_elegance_cannot_edit_or_delete_miracurl_records(self, mira, eleg):
        # create employee + employment as Miracurl
        r = mira.post(f"{BASE}/api/registry/employees", json={
            "name": "TEST CrossT", "aadhaar": f"7000{_RUN}1234"[:12].ljust(12, "0"),
            "phone": f"7788{_RUN}5566"[:12], "permanent_address": "12345 test addr", "city": "X",
        }, timeout=15)
        assert r.status_code == 200, r.text
        emp = r.json()
        _created_employees.append({"id": emp["id"], "code": emp["staff_code"]})
        today = date.today()
        rid = _add_emp(mira, emp["id"], (today - timedelta(days=200)).isoformat(), None, rating=4)

        # Elegance PUT
        r2 = eleg.put(f"{BASE}/api/registry/employments/{rid}", json={
            "designation": "Hack", "from_date": (today - timedelta(days=200)).isoformat(),
            "reason_for_leaving": "Working", "rating": 5, "comment": "x", "skills": [],
        }, timeout=15)
        assert r2.status_code == 404

        # Elegance DELETE
        r3 = eleg.delete(f"{BASE}/api/registry/employments/{rid}", timeout=15)
        assert r3.status_code == 404

    def test_elegance_can_search_and_add_own_employment(self, mira, eleg):
        # Use existing Ravi Test Kumar STF-00001
        r = eleg.get(f"{BASE}/api/registry/employees?q=STF-00001", timeout=15)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert any(x["staff_code"] == "STF-00001" for x in rows), rows
        eid = next(x["id"] for x in rows if x["staff_code"] == "STF-00001")
        today = date.today()
        r2 = eleg.post(f"{BASE}/api/registry/employees/{eid}/employments", json={
            "designation": "Senior Stylist", "skills": ["color"],
            "from_date": (today - timedelta(days=90)).isoformat(),
            "reason_for_leaving": "Working", "rating": 5, "comment": "TEST elegance record",
        }, timeout=15)
        assert r2.status_code == 200, r2.text
        rid = r2.json()["id"]
        # cleanup: elegance deletes its own
        r3 = eleg.delete(f"{BASE}/api/registry/employments/{rid}", timeout=15)
        assert r3.status_code == 200


# ---- Public search ----
class TestPublicRegistry:
    def test_public_search_by_code(self):
        r = requests.get(f"{BASE}/api/public/registry/search?q=STF-00001", timeout=15)
        assert r.status_code == 200
        p = r.json()
        assert p["staff_code"] == "STF-00001"
        assert p["aadhaar_masked"].startswith("XXXX-XXXX-")
        # aadhaar must NOT be full
        assert "aadhaar" not in p or (isinstance(p.get("aadhaar"), (str, type(None))) is False)
        for k in p.keys():
            assert k != "aadhaar_hash"
        assert p.get("badge") in ("NEW", "GOOD", "EXCELLENT", "EXTRAORDINARY", "BAD")

    def test_public_search_by_phone(self):
        r = requests.get(f"{BASE}/api/public/registry/search?q=9998887776", timeout=15)
        assert r.status_code == 200
        assert r.json()["staff_code"] == "STF-00001"

    def test_public_search_unknown(self):
        r = requests.get(f"{BASE}/api/public/registry/search?q=STF-99999", timeout=15)
        assert r.status_code == 404

    def test_pdf_download(self):
        r = requests.get(f"{BASE}/api/public/registry/STF-00001/pdf", timeout=30)
        assert r.status_code == 200
        assert "application/pdf" in r.headers.get("content-type", "")
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 1000


# ---- RBAC ----
class TestRBAC:
    def test_manager_blocked(self):
        s = _login(*MANAGER)
        r = s.get(f"{BASE}/api/registry/employees", timeout=15)
        assert r.status_code == 403, r.status_code

    def test_staff_blocked(self):
        s = _login(*STAFF)
        r = s.get(f"{BASE}/api/registry/employees", timeout=15)
        assert r.status_code == 403


# ---- Regression ----
class TestRegression:
    def test_staff_page_loads(self, mira):
        r = mira.get(f"{BASE}/api/staff", timeout=15)
        assert r.status_code == 200

    def test_appointments_loads(self, mira):
        r = mira.get(f"{BASE}/api/appointments", timeout=15)
        assert r.status_code == 200
