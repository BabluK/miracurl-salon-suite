"""E2E: owner-email change modes + login rename + GPS branch pick. Run: python3 tests/test_owner_email_flow.py"""
import os
import sys
import uuid

import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/backend/.env")
BASE = os.environ.get("TEST_BASE", "http://localhost:8001").rstrip("/") + "/api"
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
SUPER = ("super@miracurl.com", "og9T@41Es#OQb6")
TAG = uuid.uuid4().hex[:6]
E = lambda n: f"oe-{TAG}-{n}@example.com"  # noqa: E731


def session(email, pw, slug=None):
    s = requests.Session()
    h = {"X-Tenant-Slug": slug} if slug else {}
    r = s.post(f"{BASE}/auth/login", json={"email": email, "password": pw}, headers=h)
    assert r.status_code == 200, r.text
    s.headers.update({"X-CSRF-Token": s.cookies.get("csrf_token", ""), **h})
    return s


def seed():
    from security import hash_pw  # noqa: PLC0415
    tids = {n: str(uuid.uuid4()) for n in ("main", "branch2", "solo")}
    for n, tid in tids.items():
        db.tenants.insert_one({"id": tid, "slug": f"oe-{TAG}-{n}", "name": f"OE {n} {TAG}", "owner_email": E("owner") if n != "solo" else E("solo-owner"),
                               "status": "trial", "plan": "trial", "business_type": "salon", "location": "Marathahalli",
                               "latitude": 12.9569, "longitude": 77.7011,
                               "branches": [{"id": "b1", "name": "AECS Layout", "latitude": 12.9650, "longitude": 77.7150}] if n == "main" else []})
    users = [
        {"email": E("owner"), "role": "admin", "tenant_id": tids["main"], "tenant_ids": [tids["main"], tids["branch2"]], "name": "Shared Owner"},
        {"email": E("solo-owner"), "role": "admin", "tenant_id": tids["solo"], "name": "Solo Owner"},
        {"email": E("bablu"), "role": "staff", "tenant_id": tids["main"], "name": "Bablu", "status": "active"},
        {"email": E("aecs-mgr"), "role": "manager", "tenant_id": tids["main"], "name": "AECS Manager", "branch": "", "status": "active"},
    ]
    for u in users:
        db.users.insert_one({"id": str(uuid.uuid4()), "password_hash": hash_pw("Test@12345"), "status": "active", **u})
    return tids


def cleanup(tids):
    db.tenants.delete_many({"slug": {"$regex": f"^oe-{TAG}-"}})
    db.users.delete_many({"email": {"$regex": f"^oe-{TAG}-|real-{TAG}"}})
    db.audit_log.delete_many({"tenant_id": {"$in": list(tids.values())}})


def main():
    sys.path.insert(0, "/app/backend")
    tids = seed()
    ok = True
    try:
        sa = session(*SUPER)
        put = lambda tid, body: sa.put(f"{BASE}/super-admin/tenants/{tid}", json=body)  # noqa: E731

        # 1. conflict with a STAFF login → 409 email_in_use
        r = put(tids["main"], {"owner_email": E("bablu")})
        assert r.status_code == 409 and r.json()["detail"]["code"] == "email_in_use", r.text
        assert "staff" in r.json()["detail"]["message"], r.text
        print("1 conflict → 409 email_in_use OK")

        # 2. takeover: staff login becomes owner of main; shared owner keeps branch2 only
        r = put(tids["main"], {"owner_email": E("bablu"), "owner_email_takeover": True})
        assert r.status_code == 200, r.text
        ol = r.json()["owner_login"]
        assert ol["mode"] == "took_over_staff_login" and ol.get("detached_from") == E("owner"), ol
        bablu = db.users.find_one({"email": E("bablu")})
        assert bablu["role"] == "admin" and bablu["tenant_id"] == tids["main"], bablu
        shared = db.users.find_one({"email": E("owner")})
        assert shared["tenant_id"] == tids["branch2"] and tids["main"] not in shared.get("tenant_ids", []), shared
        assert db.tenants.find_one({"id": tids["main"]})["owner_email"] == E("bablu")
        print("2 takeover OK")

        # 3. rename manager login via HQ (placeholder → real), keeps role
        mgr = db.users.find_one({"email": E("aecs-mgr")})
        r = sa.put(f"{BASE}/super-admin/users/{mgr['id']}/email", json={"email": f"real-{TAG}@gmail.com"})
        assert r.status_code == 200, r.text
        m2 = db.users.find_one({"id": mgr["id"]})
        assert m2["email"] == f"real-{TAG}@gmail.com" and m2["role"] == "manager", m2
        r = sa.put(f"{BASE}/super-admin/users/{mgr['id']}/email", json={"email": E("bablu")})
        assert r.status_code == 400, r.text
        print("3 HQ rename manager OK (+ dup rejected)")

        # 4. logins list
        r = sa.get(f"{BASE}/super-admin/tenants/{tids['main']}/logins")
        rows = r.json()["logins"]
        assert rows[0]["is_owner"] and rows[0]["email"] == E("bablu"), rows
        assert any(x["role"] == "manager" for x in rows), rows
        print("4 logins list OK")

        # 5. link solo tenant to EXISTING owner (bablu) → solo-owner login removed (owned nothing)
        r = put(tids["solo"], {"owner_email": E("bablu")})
        assert r.status_code == 200, r.text
        ol = r.json()["owner_login"]
        assert ol["mode"] == "linked_existing_owner" and ol.get("removed_login") == E("solo-owner"), ol
        assert db.users.find_one({"email": E("solo-owner")}) is None
        assert tids["solo"] in db.users.find_one({"email": E("bablu")})["tenant_ids"]
        print("5 link to existing owner + placeholder removed OK")

        # 6. scope=this on a shared login → new separate login with temp password
        db.users.update_one({"email": E("bablu")}, {"$set": {"tenant_ids": [tids["main"], tids["solo"]]}})
        r = put(tids["solo"], {"owner_email": E("solo-new"), "owner_email_scope": "this"})
        assert r.status_code == 200, r.text
        ol = r.json()["owner_login"]
        assert ol["mode"] == "created_login" and ol.get("temp_password") and ol.get("detached_from") == E("bablu"), ol
        assert tids["solo"] not in db.users.find_one({"email": E("bablu")})["tenant_ids"]
        print("6 scope=this → separate login OK")

        # 7. scope=all rename on a plain single-tenant login
        r = put(tids["solo"], {"owner_email": E("solo-renamed")})
        assert r.status_code == 200 and r.json()["owner_login"]["mode"] == "renamed_login", r.text
        assert db.users.find_one({"email": E("solo-renamed")})["role"] == "admin"
        print("7 rename OK")

        # 8. owner changes manager email (tenant endpoint) + GPS locate/pick as manager
        own = session(E("bablu"), "Test@12345", f"oe-{TAG}-main")
        r = own.patch(f"{BASE}/managers/{mgr['id']}/email", json={"email": E("mgr-final")})
        assert r.status_code == 200, r.text
        mg = session(E("mgr-final"), "Test@12345", f"oe-{TAG}-main")
        r = mg.post(f"{BASE}/branch/locate", json={"latitude": 12.9651, "longitude": 77.7151, "accuracy_m": 12})
        assert r.status_code == 200, r.text
        d = r.json()
        by = {o["value"]: o for o in d["options"]}
        assert by["AECS Layout"]["within"] and not by["__main__"]["within"] and d["nearest"] == "AECS Layout", d
        r = mg.post(f"{BASE}/branch/pick", json={"branch": "AECS Layout", "distance_m": by["AECS Layout"]["distance_m"]})
        assert r.status_code == 200, r.text
        assert db.users.find_one({"id": mgr["id"]})["last_branch_pick"]["branch"] == "AECS Layout"
        r = mg.post(f"{BASE}/branch/pick", json={"branch": "Nope"})
        assert r.status_code == 400
        print("8 manager email change + GPS locate/pick OK", by["AECS Layout"]["distance_m"], "m /", by["__main__"]["distance_m"], "m")
    except AssertionError as e:
        ok = False
        print("FAIL:", e)
    finally:
        cleanup(tids)
    print("ALL PASS" if ok else "FAILED")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
