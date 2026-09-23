"""Iter-187 — Owner Dashboard (temporary illustrative, single branch, its own PIN 3642)."""
import os
import requests
import pytest
from _creds import pw


def _get_base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip()
                    break
    assert url
    return url.rstrip("/") + "/api"


BASE = _get_base()
SLUG_MAIN = "miracurl-marathahalli"
SLUG_ELEG = "elegance-koramangala"
OWNER = ("admin@miracurl.com", pw("SALON_ADMIN"), SLUG_MAIN)
MGR = ("manager@miracurl.com", pw("MANAGER"), SLUG_MAIN)
ELEG_OWNER = ("owner@elegance.com", "Owner@123", SLUG_ELEG)
PIN = "3642"


def _login(email, password, slug):
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": slug})
    r = s.post(f"{BASE}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    csrf = s.cookies.get("csrf_token")
    if csrf:
        s.headers["X-CSRF-Token"] = csrf
    return s


# ---------- Owner (miracurl) ----------
@pytest.fixture(scope="module")
def owner():
    return _login(*OWNER)


@pytest.fixture(scope="module")
def manager():
    return _login(*MGR)


def _mongo():
    import motor.motor_asyncio
    mongo_url = None
    db_name = None
    with open("/app/backend/.env") as f:
        for line in f:
            line = line.strip()
            if line.startswith("MONGO_URL="):
                mongo_url = line.split("=", 1)[1].strip().strip('"')
            if line.startswith("DB_NAME="):
                db_name = line.split("=", 1)[1].strip().strip('"')
    return motor.motor_asyncio.AsyncIOMotorClient(mongo_url), db_name


@pytest.fixture(scope="module")
def eleg_owner():
    # Extend trial for elegance so we can login (will be restored to original at end)
    import asyncio
    from datetime import datetime, timezone, timedelta

    async def _prep():
        cli, dbn = _mongo()
        t = await cli[dbn].tenants.find_one({"slug": SLUG_ELEG})
        orig = t.get("trial_ends_at")
        new = datetime.now(timezone.utc) + timedelta(days=30)
        await cli[dbn].tenants.update_one({"slug": SLUG_ELEG}, {"$set": {"trial_ends_at": new}})
        cli.close()
        return orig

    orig = asyncio.run(_prep())
    sess = _login(*ELEG_OWNER)
    sess._orig_trial = orig  # stash for teardown
    yield sess

    async def _restore():
        cli, dbn = _mongo()
        await cli[dbn].tenants.update_one(
            {"slug": SLUG_ELEG},
            {"$set": {"trial_ends_at": orig}, "$unset": {"owner_demo_dashboard_deleted": ""}},
        )
        cli.close()

    asyncio.run(_restore())


def test_status_owner_available(owner):
    r = owner.get(f"{BASE}/owner-dashboard/status")
    assert r.status_code == 200
    assert r.json() == {"available": True}


def test_unlock_wrong_pin(owner):
    r = owner.post(f"{BASE}/owner-dashboard/unlock", json={"pin": "0000"})
    assert r.status_code == 403
    assert r.json().get("detail") == "Incorrect PIN"


def test_unlock_correct_pin_shape_and_totals(owner):
    r = owner.post(f"{BASE}/owner-dashboard/unlock", json={"pin": PIN})
    assert r.status_code == 200, r.text
    data = r.json()
    # branch
    b = data["branch"]
    assert b["slug"] == "aecs"
    assert b["name"] == "Miracurl Unisex Family Salon - AECS"
    assert b["location"]
    # periods
    periods = data["periods"]
    assert len(periods) == 6
    keys = [p["key"] for p in periods]
    assert keys == ["today", "yesterday", "week", "last_week", "month", "last_month"]

    by_key = {p["key"]: p for p in periods}
    assert by_key["month"]["total"] == 292240
    assert by_key["last_month"]["total"] == 417270

    # totals arithmetic & salons[0].today == total
    for p in periods:
        assert p["total_cash"] + p["total_upi"] + p["total_card"] == p["total"], f"{p['key']} sum mismatch"
        assert p["salons"][0]["today"] == p["total"], f"{p['key']} salon today mismatch"

    # Ranges
    from datetime import date, timedelta
    today = date.fromisoformat(data["date"])
    assert by_key["today"]["range"]["from"] == today.isoformat()
    assert by_key["today"]["range"]["to"] == today.isoformat()
    monday = today - timedelta(days=today.weekday())
    assert by_key["week"]["range"]["from"] == monday.isoformat()
    assert by_key["week"]["range"]["to"] == today.isoformat()
    prev_monday = monday - timedelta(days=7)
    prev_sunday = prev_monday + timedelta(days=6)
    assert by_key["last_week"]["range"]["from"] == prev_monday.isoformat()
    assert by_key["last_week"]["range"]["to"] == prev_sunday.isoformat()
    first = today.replace(day=1)
    assert by_key["month"]["range"]["from"] == first.isoformat()
    last_month_end = first - timedelta(days=1)
    last_first = last_month_end.replace(day=1)
    assert by_key["last_month"]["range"]["from"] == last_first.isoformat()
    assert by_key["last_month"]["range"]["to"] == last_month_end.isoformat()


def test_manager_forbidden(manager):
    r = manager.get(f"{BASE}/owner-dashboard/status")
    assert r.status_code == 403


def test_unauthenticated_401():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": SLUG_MAIN})
    r = s.get(f"{BASE}/owner-dashboard/status")
    assert r.status_code == 401


# ---------- Delete flow on second tenant only ----------
def test_eleg_delete_wrong_pin(eleg_owner):
    r = eleg_owner.post(f"{BASE}/owner-dashboard/delete", json={"pin": "0000"})
    assert r.status_code == 403


def test_eleg_delete_correct_pin_then_status_and_unlock(eleg_owner):
    r = eleg_owner.post(f"{BASE}/owner-dashboard/delete", json={"pin": PIN})
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    # status now unavailable
    r2 = eleg_owner.get(f"{BASE}/owner-dashboard/status")
    assert r2.status_code == 200
    assert r2.json() == {"available": False}
    # unlock returns 404
    r3 = eleg_owner.post(f"{BASE}/owner-dashboard/unlock", json={"pin": PIN})
    assert r3.status_code == 404
    assert "removed" in (r3.json().get("detail") or "").lower()


def test_zz_restore_eleg_tenant():
    """Belt-and-braces restore: ensure the flag is unset (fixture teardown also does this)."""
    import asyncio

    async def _restore():
        cli, dbn = _mongo()
        res = await cli[dbn].tenants.update_one(
            {"slug": SLUG_ELEG},
            {"$unset": {"owner_demo_dashboard_deleted": ""}},
        )
        cli.close()
        return res.matched_count

    matched = asyncio.run(_restore())
    assert matched == 1
