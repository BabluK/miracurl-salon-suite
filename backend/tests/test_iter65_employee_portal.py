"""Iter 65 — Employee Self-Service Portal + mark-left disables salon user login + regression."""
import os
import uuid
import hashlib
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

TENANT_SLUG = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PW = "q6QY@tn3p#9DtL"

EMP_PHONE = "9812345670"
EMP_AADHAAR = "123412341234"
EMP_PORTAL_PW = "NewPass@123"


# ------------------------- Employee Portal API tests -------------------------

class TestEmployeePortal:
    def test_reset_wrong_aadhaar(self):
        r = requests.post(f"{API}/employee/reset-password",
                          json={"phone": EMP_PHONE, "aadhaar": "999912341234",
                                "new_password": "TempWrong@123"})
        assert r.status_code == 403, r.text

    def test_reset_correct_aadhaar_then_restore(self):
        # reset to a temp
        r = requests.post(f"{API}/employee/reset-password",
                          json={"phone": EMP_PHONE, "aadhaar": EMP_AADHAAR,
                                "new_password": "TempRotate@123"})
        assert r.status_code == 200, r.text
        # verify login with new temp
        r2 = requests.post(f"{API}/employee/login",
                           json={"phone": EMP_PHONE, "password": "TempRotate@123"})
        assert r2.status_code == 200
        # restore back
        r3 = requests.post(f"{API}/employee/reset-password",
                           json={"phone": EMP_PHONE, "aadhaar": EMP_AADHAAR,
                                 "new_password": EMP_PORTAL_PW})
        assert r3.status_code == 200
        # confirm original works
        r4 = requests.post(f"{API}/employee/login",
                           json={"phone": EMP_PHONE, "password": EMP_PORTAL_PW})
        assert r4.status_code == 200

    def test_register_unregistered_phone(self):
        r = requests.post(f"{API}/employee/register",
                          json={"phone": "9812345671", "aadhaar": "123412341234",
                                "password": "Whatever@123"})
        assert r.status_code == 404
        assert "not registered" in r.json().get("detail", "").lower()

    def test_login_and_me_and_patch(self):
        s = requests.Session()
        r = s.post(f"{API}/employee/login",
                   json={"phone": EMP_PHONE, "password": EMP_PORTAL_PW})
        assert r.status_code == 200
        # /me
        r2 = s.get(f"{API}/employee/me")
        assert r2.status_code == 200
        data = r2.json()
        assert data["profile"]["staff_code"] == "MC-TEST-01"
        assert data["profile"]["name"]
        # patch city and verify
        new_city = f"TestCity-{uuid.uuid4().hex[:6]}"
        r3 = s.patch(f"{API}/employee/me", json={"city": new_city})
        assert r3.status_code == 200
        r4 = s.get(f"{API}/employee/me")
        assert r4.json()["profile"]["city"] == new_city
        # logout
        r5 = s.post(f"{API}/employee/logout")
        assert r5.status_code == 200
        r6 = s.get(f"{API}/employee/me")
        assert r6.status_code == 401


# ------------------------- Mark-left disables user login -------------------------

def _hash_pw_bcrypt(pw: str) -> str:
    import bcrypt
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def _aadhaar_fp(num: str) -> str:
    # matches routes/registry._aadhaar_fp using REGISTRY_PEPPER or jwt_secret
    pepper = os.environ.get("REGISTRY_PEPPER") or os.environ.get("JWT_SECRET") or ""
    return hashlib.sha256(f"aadhaar:{num}:{pepper}".encode()).hexdigest()


class TestMarkLeftDisablesLogin:
    @pytest.fixture(scope="class")
    def admin_session(self):
        s = requests.Session()
        s.headers.update({"X-Tenant-Slug": TENANT_SLUG})
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
        if r.status_code != 200:
            pytest.skip(f"admin login failed: {r.status_code} {r.text}")
        return s

    def test_mark_left_disables_user(self, admin_session):
        s = admin_session
        # tenant id
        me = s.get(f"{API}/auth/me").json()
        tenant_id = me.get("tenant_id") or me.get("tenant", {}).get("id")
        assert tenant_id, f"cannot find tenant_id in {me}"

        unique = uuid.uuid4().hex[:8]
        email = f"TEST_markleft_{unique}@example.com"
        staff_pw = "StaffPass@123"

        # ----- create a staff user directly via DB using an admin-only helper? Not available.
        # Fall back: create the registry employee with matching email, and create a user via
        # the users endpoint if available; otherwise use mongo through backend seed script.
        # We'll use a small backend admin API for user creation if it exists.

        # Create staff user directly in MongoDB (no public credential-issuing API for salon users)
        import bcrypt
        from pymongo import MongoClient
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "miracurl_db")
        mc = MongoClient(mongo_url)
        udb = mc[db_name]
        user_doc = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "email": email.lower(),
            "name": "TEST MarkLeft",
            "role": "staff",
            "password_hash": bcrypt.hashpw(staff_pw.encode(), bcrypt.gensalt()).decode(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        udb.users.insert_one(user_doc)
        created = ("mongo", user_doc)

        # Create registry employee via /registry/employees
        aad_unique = "1212" + str(uuid.uuid4().int)[:8]
        reg_body = {
            "name": "TEST MarkLeft",
            "aadhaar": aad_unique,
            "permanent_address": "Test Address",
            "current_address": "Test Address",
            "city": "Bengaluru",
            "email": email,
            "phone": "9999999998",
            "photo_url": "",
        }
        r = s.post(f"{API}/registry/employees", json=reg_body, headers={"X-Owner-Pin": "4321"})
        assert r.status_code in (200, 201), r.text
        eid = r.json()["id"]

        # Add employment
        emp_body = {
            "designation": "Stylist",
            "skills": [],
            "from_date": "2024-01-01",
            "to_date": None,
            "reason_for_leaving": "",
            "rating": None,
            "comment": "",
        }
        r = s.post(f"{API}/registry/employees/{eid}/employments", json=emp_body,
                   headers={"X-Owner-Pin": "4321"})
        assert r.status_code in (200, 201), r.text
        rid = r.json()["id"]

        # sanity: staff can log in currently
        login_s = requests.Session()
        login_s.headers.update({"X-Tenant-Slug": TENANT_SLUG})
        r = login_s.post(f"{API}/auth/login", json={"email": email, "password": staff_pw})
        assert r.status_code == 200, f"pre-mark-left staff login failed: {r.status_code} {r.text}"

        # mark-left
        r = s.put(f"{API}/registry/employments/{rid}/mark-left",
                  json={"reason_for_leaving": "Resigned", "to_date": "2026-01-15",
                        "comment": "test"},
                  headers={"X-Owner-Pin": "4321"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("login_disabled") == True, f"expected login_disabled=True, got {body}"

        # staff login now blocked
        login_s2 = requests.Session()
        login_s2.headers.update({"X-Tenant-Slug": TENANT_SLUG})
        r = login_s2.post(f"{API}/auth/login", json={"email": email, "password": staff_pw})
        assert r.status_code == 403, f"expected 403 disabled, got {r.status_code} {r.text}"
        assert "disabled" in r.text.lower()

        # cleanup
        s.delete(f"{API}/registry/employments/{rid}", headers={"X-Owner-Pin": "4321"})
        udb.users.delete_one({"id": user_doc["id"]})
        udb.registry_employees.delete_one({"id": eid})
        mc.close()


# ------------------------- Regression -------------------------

class TestRegression:
    def test_admin_login_still_works(self):
        s = requests.Session()
        s.headers.update({"X-Tenant-Slug": TENANT_SLUG})
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
        assert r.status_code == 200, r.text

    def test_public_salon_page(self):
        r = requests.get(f"{API}/public/salon-page/{TENANT_SLUG}")
        assert r.status_code == 200

    def test_winback_nudges(self):
        s = requests.Session()
        s.headers.update({"X-Tenant-Slug": TENANT_SLUG})
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
        assert r.status_code == 200
        r = s.get(f"{API}/winback/nudges")
        assert r.status_code == 200, r.text
