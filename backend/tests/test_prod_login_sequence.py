"""Dry-run of the production login clean-up on throwaway tenants (mirrors prod shape):
A (main): owner X (2 salons), staff Bablu, junk test logins, garbage admin. B (aecs): owner placeholder, X also admin.
Target: Bablu = owner of A+B; X = manager of A+B (GPS/salon picker); placeholder + junk gone.
Run: TEST_BASE=<preview url> python3 tests/test_prod_login_sequence.py"""
import os
import sys
import uuid

import requests
from dotenv import load_dotenv
from pymongo import MongoClient
from _creds import pw

load_dotenv("/app/backend/.env")
BASE = os.environ["TEST_BASE"].rstrip("/")
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
tag = uuid.uuid4().hex[:6]
SA = ("super@miracurl.com", pw("SUPER_ADMIN"))


def sa():
    s = requests.Session()
    assert s.post(f"{BASE}/api/auth/login", json={"email": SA[0], "password": SA[1]}).status_code == 200
    s.headers.update({"X-CSRF-Token": s.cookies.get("csrf_token", "")})
    return s


def seed():
    from security import hash_pw
    A, B = str(uuid.uuid4()), str(uuid.uuid4())
    X, PL = f"x-{tag}@example.com", f"aecs-{tag}@miracurl.com"
    BAB = f"bablu-{tag}@example.com"
    db.tenants.insert_many([
        {"id": A, "slug": f"seq-a-{tag}", "name": f"Seq Main {tag}", "owner_email": X, "status": "active", "plan": "annual", "branches": [], "latitude": 12.9569, "longitude": 77.7011},
        {"id": B, "slug": f"seq-b-{tag}", "name": f"Seq AECS {tag}", "owner_email": PL, "status": "active", "plan": "annual", "branches": [], "latitude": 12.9650, "longitude": 77.7150},
    ])
    pw = hash_pw("Seq@12345")
    ux, ub = str(uuid.uuid4()), str(uuid.uuid4())
    db.users.insert_many([
        {"id": ux, "email": X, "name": "Salon Admin", "role": "admin", "tenant_id": A, "tenant_ids": [A, B], "status": "active", "password_hash": pw},
        {"id": str(uuid.uuid4()), "email": PL, "name": "Bablu", "role": "admin", "tenant_id": B, "tenant_ids": [B], "status": "active", "password_hash": pw},
        {"id": ub, "email": BAB, "name": "Bablu", "role": "staff", "tenant_id": A, "status": "active", "password_hash": pw},
        {"id": str(uuid.uuid4()), "email": f"fcbbnuq{tag}", "name": "Salon Admin", "role": "admin", "tenant_id": A, "status": "active", "password_hash": pw},
        {"id": str(uuid.uuid4()), "email": f"test_user_{tag}@test.com", "name": "Test", "role": "staff", "tenant_id": A, "status": "active", "password_hash": pw},
        {"id": str(uuid.uuid4()), "email": f"staff_rev_{tag}@test.com", "name": "StaffRev", "role": "staff", "tenant_id": A, "status": "active", "password_hash": pw},
    ])
    db.staff.insert_one({"id": str(uuid.uuid4()), "tenant_id": A, "name": "Test Staff", "email": f"test_user_{tag}@test.com", "active": True})
    return A, B, X, PL, BAB, ux


def cleanup(A, B):
    db.tenants.delete_many({"id": {"$in": [A, B]}})
    db.users.delete_many({"$or": [{"tenant_id": {"$in": [A, B]}}, {"tenant_ids": {"$in": [A, B]}}]})
    db.staff.delete_many({"tenant_id": {"$in": [A, B]}})
    db.branch_logins.delete_many({"tenant_id": {"$in": [A, B]}})


def logins(s, tid):
    return {u["email"]: u for u in s.get(f"{BASE}/api/super-admin/tenants/{tid}/logins").json()["logins"]}


def main():
    sys.path.insert(0, "/app/backend")
    A, B, X, PL, BAB, ux = seed()
    s = sa()
    ok = True
    try:
        # 1. purge junk on A
        r = s.delete(f"{BASE}/api/super-admin/tenants/{A}/test-logins").json()
        assert r["removed"] == 2 and r["staff_removed"] == 1, r
        print("1 purge test logins OK", r)
        # 2. A owner -> Bablu (takeover of staff login)
        r = s.put(f"{BASE}/api/super-admin/tenants/{A}", json={"owner_email": BAB, "owner_email_takeover": True})
        assert r.status_code == 200 and r.json()["owner_login"]["mode"] == "took_over_staff_login", r.text
        print("2 A owner takeover OK", r.json()["owner_login"])
        # 3. B owner -> Bablu (existing admin -> link; placeholder deleted)
        r = s.put(f"{BASE}/api/super-admin/tenants/{B}", json={"owner_email": BAB})
        ol = r.json().get("owner_login", {})
        assert r.status_code == 200 and ol["mode"] == "linked_existing_owner" and ol.get("removed_login") == PL, r.text
        print("3 B owner linked, placeholder removed OK", ol)
        # 4. X admin -> manager across A+B
        r = s.put(f"{BASE}/api/super-admin/users/{ux}/role", json={"role": "manager", "tenant_ids": [A, B]})
        assert r.status_code == 200 and r.json()["role"] == "manager" and set(r.json()["tenant_ids"]) == {A, B}, r.text
        print("4 X -> manager of A+B OK")
        # 5. state
        la, lb = logins(s, A), logins(s, B)
        assert la[BAB]["role"] == "admin" and la[BAB]["is_owner"] and la[BAB]["salon_count"] == 2
        assert lb[BAB]["is_owner"] and la[X]["role"] == "manager" and lb[X]["role"] == "manager"
        assert PL not in lb and not any(e.endswith("@test.com") for e in la)
        print("5 final state OK:", sorted((e, u["role"]) for e, u in la.items()))
        # 6. manager X logs in and sees both salons, GPS gate lists the other salon, pick switches
        m = requests.Session()
        r = m.post(f"{BASE}/api/auth/login", json={"email": X, "password": "Seq@12345"}, headers={"X-Tenant-Slug": f"seq-a-{tag}"})
        assert r.status_code == 200 and len(r.json()["user"].get("salons", [])) == 2, r.text[:200]
        m.headers.update({"X-CSRF-Token": m.cookies.get("csrf_token", ""), "X-Tenant-Slug": f"seq-a-{tag}"})
        loc = m.post(f"{BASE}/api/branch/locate", json={"latitude": 12.9651, "longitude": 77.7151}).json()
        sal = [o for o in loc["options"] if o["value"].startswith("salon:")]
        assert sal and sal[0]["within"] and not loc["options"][0]["within"], loc
        r = m.post(f"{BASE}/api/branch/pick", json={"branch": sal[0]["value"], "distance_m": sal[0]["distance_m"], "gps_verified": True}).json()
        assert r["switched"]["id"] == B, r
        me = m.get(f"{BASE}/api/auth/me", headers={"X-Tenant-Slug": f"seq-b-{tag}"}).json()
        assert me["tenant_id"] == B and me["role"] == "manager", me
        print("6 manager multi-salon login + GPS salon switch OK")
        # 7. garbage admin still there? (left for manual — must not be auto-deleted)
        assert f"fcbbnuq{tag}" in la
        print("7 unrelated admin untouched OK")
    except AssertionError as e:
        ok = False
        print("FAIL:", e)
    finally:
        cleanup(A, B)
    print("ALL PASS" if ok else "FAILED")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
