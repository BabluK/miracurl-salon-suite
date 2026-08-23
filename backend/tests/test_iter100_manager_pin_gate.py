"""Iteration 100 — manager PIN-lock hardening.
- section-access: manager w/ no pin + tenant has pin -> ok:false, pin_required:true
- section-access: manager w/ correct pin -> ok:true; wrong pin -> 403
- require_owner_pin: manager w/o X-Owner-Pin (tenant has pin) -> 403 OWNER_PIN_REQUIRED
- require_owner_pin: manager w/ correct X-Owner-Pin -> 200
- require_owner_pin: manager on tenant with NO pin -> 403 OWNER_PIN_NOT_SET
  (uses temp tenant via direct mongo — restored)
- regression: admin login + activity-logs w/ pin still works
"""
from _creds import _PW_ADMIN, _PW_MANAGER
import os
import pytest
import requests

def _url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v: return v.rstrip("/")
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")

BASE = _url()
TENANT = "miracurl-marathahalli"
MGR = ("manager@miracurl.com", _PW_MANAGER)
ADMIN = ("admin@miracurl.com", _PW_ADMIN)
PIN = "4321"


def _login(email, pw):
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT, "Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def mgr(): return _login(*MGR)

@pytest.fixture(scope="module")
def adm(): return _login(*ADMIN)


class TestSectionAccess:
    def test_no_pin_returns_pin_required(self, mgr):
        r = mgr.post(f"{BASE}/api/manager/section-access", json={"section": "/attendance"})
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert d.get("ok") == False, f"expected ok:false got {d}"
        assert d.get("pin_required") == True, f"expected pin_required got {d}"

    def test_wrong_pin_403(self, mgr):
        r = mgr.post(f"{BASE}/api/manager/section-access", json={"section": "/attendance", "pin": "9999"})
        assert r.status_code == 403, f"{r.status_code} {r.text[:200]}"

    def test_correct_pin_ok(self, mgr):
        r = mgr.post(f"{BASE}/api/manager/section-access", json={"section": "/attendance", "pin": PIN})
        assert r.status_code == 200, r.text[:200]
        assert r.json().get("ok") == True


class TestRequireOwnerPin:
    def test_manager_no_header_403(self, mgr):
        r = mgr.get(f"{BASE}/api/manager/activity-logs")
        assert r.status_code == 403, f"{r.status_code} {r.text[:200]}"
        assert "OWNER_PIN_REQUIRED" in r.text or "OWNER_PIN" in r.text

    def test_manager_with_pin_header_200(self, mgr):
        r = mgr.get(f"{BASE}/api/manager/activity-logs", headers={"X-Owner-Pin": PIN})
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        assert "logs" in r.json()

    def test_admin_activity_logs_with_pin(self, adm):
        r = adm.get(f"{BASE}/api/manager/activity-logs", headers={"X-Owner-Pin": PIN})
        assert r.status_code == 200, r.text[:200]


class TestNoPinSetOnTenant:
    """Temporarily unset security_pin_hash on the tenant and verify managers get
    403 OWNER_PIN_NOT_SET (no silent access). ALWAYS restore afterwards."""
    def test_no_pin_set_blocks_manager(self, mgr, adm):
        import motor.motor_asyncio, asyncio
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        assert mongo_url and db_name, "MONGO_URL/DB_NAME not set"
        client = motor.motor_asyncio.AsyncIOMotorClient(mongo_url)
        db = client[db_name]

        async def get_ph():
            t = await db.tenants.find_one({"slug": TENANT})
            return t.get("security_pin_hash"), t.get("id")

        async def set_ph(v):
            await db.tenants.update_one({"slug": TENANT}, {"$set": {"security_pin_hash": v}} if v else {"$unset": {"security_pin_hash": ""}})

        async def clear_attempts(tid):
            await db.pin_attempts.delete_many({"tenant_id": tid})

        loop = asyncio.new_event_loop()
        try:
            original, tid = loop.run_until_complete(get_ph())
            assert original, "expected tenant to have a security_pin_hash before test"
            # Unset it
            loop.run_until_complete(set_ph(None))
            try:
                # Manager hitting require_owner_pin endpoint should now get 403 OWNER_PIN_NOT_SET
                r = mgr.get(f"{BASE}/api/manager/activity-logs")
                assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text[:200]}"
                assert "OWNER_PIN_NOT_SET" in r.text, f"expected OWNER_PIN_NOT_SET in body, got {r.text[:200]}"

                # section-access for manager with no pin & no tenant pin -> ok:false, pin_required:true, no_pin_set:true
                r2 = mgr.post(f"{BASE}/api/manager/section-access", json={"section": "/attendance"})
                assert r2.status_code == 200
                d = r2.json()
                assert d.get("ok") == False
                assert d.get("no_pin_set") == True, f"expected no_pin_set:true, got {d}"

                # Admin should still be able to open sections (no PIN set -> ok:true for admin)
                r3 = adm.post(f"{BASE}/api/manager/section-access", json={"section": "/attendance"})
                assert r3.status_code == 200
                assert r3.json().get("ok") == True
            finally:
                # RESTORE original hash
                loop.run_until_complete(set_ph(original))
                loop.run_until_complete(clear_attempts(tid))
        finally:
            loop.close()
            client.close()


class TestCleanup:
    def test_clear_pin_attempts(self, adm):
        """Cleanup any lockout state from wrong-pin tests."""
        import motor.motor_asyncio, asyncio
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        client = motor.motor_asyncio.AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        async def run():
            t = await db.tenants.find_one({"slug": TENANT})
            await db.pin_attempts.delete_many({"tenant_id": t["id"]})
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(run())
        finally:
            loop.close()
            client.close()
