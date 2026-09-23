"""Iter-192 backend tests:
1) DELETE /api/week-off-requests/{id} — deletes decided records, blocks pending, 404 second time.
2) POST /api/super-admin/tenants with module_locks — invalid modules dropped, features endpoint shows locks,
   owner login → MODULE_LOCKED enforcement on /cctv/config; /appointments still 200.
3) Cleanup: delete created tenant + leftover 'qa-lock-salon-x1'.
"""
import os, uuid, requests
from datetime import datetime, timezone
import pymongo
import pytest
from _creds import pw

def _load_env():
    for p in ("/app/frontend/.env", "/app/backend/.env"):
        try:
            for line in open(p):
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))
        except FileNotFoundError:
            pass
_load_env()

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = BASE + "/api"
MONGO = pymongo.MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
DB = MONGO[os.environ.get("DB_NAME", "miracurl_db")]

SA_EMAIL = "admin@miracurl-suite.com"
SA_PWD = pw("SUPER_ADMIN")
INR_EMAIL = "admin@miracurl.com"
INR_PWD = pw("SALON_ADMIN")
INR_SLUG = "miracurl-marathahalli"

QA_SLUG = "qa-onboard-locks-2"
LEFT_OVER_SLUG = "qa-lock-salon-x1"
LEFT_OVER_ID = "afdeb54d-310c-4a65-bfd0-eb2903cdd166"


def login(email, password, slug=None):
    s = requests.Session()
    h = {"Content-Type": "application/json"}
    if slug:
        h["X-Tenant-Slug"] = slug
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, headers=h)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    csrf = s.cookies.get("csrf_token")
    s.headers.update({"X-CSRF-Token": csrf} if csrf else {})
    if slug:
        s.headers["X-Tenant-Slug"] = slug
    return s


@pytest.fixture(scope="module")
def sa():
    return login(SA_EMAIL, SA_PWD)


@pytest.fixture(scope="module")
def inr_owner():
    return login(INR_EMAIL, INR_PWD, INR_SLUG)


# ---------------- 1) Week-off delete ----------------
class TestWeekOffDelete:
    def test_seed_and_delete_decided(self, inr_owner):
        tenant = DB.tenants.find_one({"slug": INR_SLUG}, {"_id": 0, "id": 1})
        assert tenant
        rid = f"TEST-{uuid.uuid4()}"
        DB.week_off_requests.insert_one({
            "id": rid, "tenant_id": tenant["id"],
            "staff_id": "test-staff", "staff_name": "QA Stylist",
            "current_day": "monday", "requested_day": "tuesday",
            "status": "approved",
            "requested_at": datetime.now(timezone.utc).isoformat(),
            "decided_at": datetime.now(timezone.utc).isoformat(),
        })
        # GET list
        r = inr_owner.get(f"{API}/week-off-requests?status=all")
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert rid in ids, f"seeded record missing from list; got {len(ids)} items"

        # DELETE
        r = inr_owner.delete(f"{API}/week-off-requests/{rid}")
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}

        # Second DELETE → 404
        r2 = inr_owner.delete(f"{API}/week-off-requests/{rid}")
        assert r2.status_code == 404, r2.text

    def test_delete_pending_400(self, inr_owner):
        tenant = DB.tenants.find_one({"slug": INR_SLUG}, {"_id": 0, "id": 1})
        rid = f"TEST-{uuid.uuid4()}"
        DB.week_off_requests.insert_one({
            "id": rid, "tenant_id": tenant["id"],
            "staff_id": "test-staff", "staff_name": "QA Stylist",
            "current_day": "monday", "requested_day": "tuesday",
            "status": "pending",
            "requested_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            r = inr_owner.delete(f"{API}/week-off-requests/{rid}")
            assert r.status_code == 400, f"expected 400 for pending, got {r.status_code} {r.text}"
        finally:
            DB.week_off_requests.delete_one({"id": rid})


# ---------------- 2) Onboarding module_locks ----------------
class TestOnboardingLocks:
    tid = None
    temp_pw = None

    def test_create_tenant_with_locks(self, sa):
        # Clean up first if exists
        existing = DB.tenants.find_one({"slug": QA_SLUG}, {"_id": 0, "id": 1})
        if existing:
            DB.tenants.delete_one({"id": existing["id"]})
            DB.users.delete_many({"tenant_id": existing["id"]})
        DB.users.delete_many({"email": "qa.onboard.locks2@gmail.com"})

        body = {
            "slug": QA_SLUG, "name": "QA Onboard Locks",
            "owner_email": "qa.onboard.locks2@gmail.com", "owner_name": "QA Owner",
            "plan": "starter", "business_type": "salon",
            "module_locks": ["cctv", "reports", "not-a-module"],
        }
        r = sa.post(f"{API}/super-admin/tenants", json=body)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        TestOnboardingLocks.tid = data["tenant"]["id"]
        TestOnboardingLocks.temp_pw = data.get("temp_password")
        assert TestOnboardingLocks.temp_pw, f"expected temp_password in response; got keys: {list(data.keys())}"

    def test_features_endpoint_drops_bogus(self, sa):
        assert TestOnboardingLocks.tid
        r = sa.get(f"{API}/super-admin/tenants/{TestOnboardingLocks.tid}/features")
        assert r.status_code == 200, r.text
        d = r.json()
        ent = d.get("entitlements", {})
        locked = ent.get("locked", []) or d.get("locked", [])
        assert sorted(ent.get("module_locks", [])) == ["cctv", "reports"], f"got {ent.get('module_locks')}"
        assert "cctv" in locked and "reports" in locked, f"locked={locked}"
        assert ent.get("grandfathered") is False

    def test_owner_login_and_module_gate(self):
        assert TestOnboardingLocks.temp_pw
        owner = login("qa.onboard.locks2@gmail.com", TestOnboardingLocks.temp_pw, QA_SLUG)
        # Owner must change password before accessing gated endpoints
        new_pw = "QaOwner@Test1234!"
        r_ch = owner.post(f"{API}/super-admin/auth/change-password",
                          json={"current_password": TestOnboardingLocks.temp_pw, "new_password": new_pw})
        # Endpoint is registered under /super-admin router but works for any authed user
        if r_ch.status_code != 200:
            # Try tenant-scoped change-password path
            r_ch = owner.post(f"{API}/auth/change-password",
                              json={"current_password": TestOnboardingLocks.temp_pw, "new_password": new_pw})
        assert r_ch.status_code == 200, f"change-password failed: {r_ch.status_code} {r_ch.text}"
        # Re-login with new password to refresh session
        owner = login("qa.onboard.locks2@gmail.com", new_pw, QA_SLUG)

        r = owner.get(f"{API}/cctv/config")
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"
        body = r.json()
        assert body.get("detail") == "MODULE_LOCKED", body
        assert body.get("module") == "cctv", body

        # Re-authenticate fresh for the non-locked endpoint
        owner = login("qa.onboard.locks2@gmail.com", new_pw, QA_SLUG)
        r2 = owner.get(f"{API}/appointments")
        assert r2.status_code == 200, r2.text

    def test_cleanup_qa_tenant(self, sa):
        # Try soft first, then hard-delete both QA slug + leftover slug
        for tid, slug in [(TestOnboardingLocks.tid, QA_SLUG), (LEFT_OVER_ID, LEFT_OVER_SLUG)]:
            if not tid:
                continue
            # verify existence via mongo (leftover may not exist)
            exists = DB.tenants.find_one({"id": tid}, {"_id": 0, "id": 1, "slug": 1})
            if not exists:
                continue
            r = sa.delete(f"{API}/super-admin/tenants/{tid}/permanent", params={"confirm": slug})
            assert r.status_code == 200, f"hard-delete {slug} failed: {r.status_code} {r.text}"
        # sanity — QA tenant gone
        assert DB.tenants.find_one({"slug": QA_SLUG}) is None
