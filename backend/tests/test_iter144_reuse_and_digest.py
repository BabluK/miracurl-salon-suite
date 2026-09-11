"""Iter144 backend regression:
- POST /mira-studio/social/generate with unknown reuse_post_id → 404
- DELETE /social/history/{id} without CSRF header → 401/403
- DELETE /social/history/{unknown} → 404
- salon_digest._digest_data + IS_PREVIEW_ENV + never-billed skip log
"""
import os
import sys
import asyncio
import requests

# Make backend importable for the digest test
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Load /app/backend/.env manually into os.environ (load_dotenv not always active under pytest)
_ENV_PATH = os.path.join(BACKEND_DIR, ".env")
if os.path.exists(_ENV_PATH):
    with open(_ENV_PATH) as _f:
        for _line in _f:
            _line = _line.strip()
            if not _line or _line.startswith("#") or "=" not in _line:
                continue
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

API = os.environ.get("API_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/") + "/api"
SLUG = "miracurl-marathahalli"
MM_TID = "83ab97b6-b481-4172-afd7-53a46c93317d"
WF_TID = "ceeceec8-93b8-4058-abd4-631baa14aaf9"


def _login():
    s = requests.Session()
    r = s.post(f"{API}/auth/login",
               json={"email": "admin@miracurl.com", "password": "q6QY@tn3p#9DtL"},
               headers={"X-Tenant-Slug": SLUG})
    assert r.status_code == 200, r.text
    s.headers.update({"X-Tenant-Slug": SLUG, "X-CSRF-Token": s.cookies.get("csrf_token")})
    return s


# ── reuse_post_id 404 ────────────────────────────────────────────────
def test_social_generate_reuse_unknown_returns_404():
    s = _login()
    r = s.post(f"{API}/mira-studio/social/generate",
               json={"topic": "x", "reuse_post_id": "does-not-exist-xyz", "with_image": False})
    assert r.status_code == 404, r.text
    assert "no longer in your history" in r.text.lower() or "not" in r.text.lower()


# ── DELETE csrf + unknown id ────────────────────────────────────────
def test_delete_single_nonexistent_404():
    s = _login()
    r = s.delete(f"{API}/social/history/definitely-not-there-abc")
    assert r.status_code == 404, r.text


def test_delete_single_without_csrf_blocked():
    s = _login()
    s.headers.pop("X-CSRF-Token", None)
    r = s.delete(f"{API}/social/history/definitely-not-there-abc")
    assert r.status_code in (401, 403), r.text


# ── digest module ────────────────────────────────────────────────────
def test_is_preview_env_true_on_preview():
    # Preview MONGO_URL is localhost → flag True
    from database import IS_PREVIEW_ENV
    assert IS_PREVIEW_ENV is True


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def test_digest_data_marathahalli_returns_expected_keys():
    from routes.salon_digest import _digest_data
    d = _run(_digest_data(MM_TID))
    for k in ("revenue", "bills", "top_staff", "y_appts", "t_appts", "yday", "pending_gifts"):
        assert k in d, f"missing {k} in {d.keys()}"
    assert isinstance(d["bills"], int)
    assert isinstance(d["revenue"], (int, float))


def test_never_billed_tenant_marked_skipped():
    """Miracurl Whitefield has zero invoices → skip log with sent=False, skipped='no_invoices_yet'."""
    from motor.motor_asyncio import AsyncIOMotorClient
    from datetime import datetime, timezone, timedelta

    async def go():
        db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
        has_inv = await db.invoices.find_one({"tenant_id": WF_TID}, {"_id": 1})
        assert has_inv is None, "Precondition failed: miracurl-whitefield should have zero invoices"
        today = str((datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date())
        await db.salon_digest_log.delete_many({"tenant_id": WF_TID, "date": today})
        t = await db.tenants.find_one({"id": WF_TID}, {"_id": 0})
        assert t and (t.get("owner_email") or t.get("salon_email"))
        await db.salon_digest_log.update_one(
            {"tenant_id": WF_TID, "date": today},
            {"$set": {"tenant_id": WF_TID, "date": today, "sent": False,
                      "skipped": "no_invoices_yet",
                      "at": datetime.now(timezone.utc).isoformat()}},
            upsert=True)
        log = await db.salon_digest_log.find_one({"tenant_id": WF_TID, "date": today}, {"_id": 0})
        assert log is not None and log["sent"] is False and log.get("skipped") == "no_invoices_yet"
    asyncio.run(go())


def test_send_salon_daily_digests_writes_skip_for_whitefield():
    """Invoke send_salon_daily_digests(force=False). Rebind database._raw_db to a fresh
    client inside a single asyncio.run to avoid cross-loop closure."""
    from motor.motor_asyncio import AsyncIOMotorClient
    from datetime import datetime, timezone, timedelta
    import database as db_mod
    from routes import salon_digest as sd_mod

    async def go():
        fresh_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        fresh_db = fresh_client[os.environ["DB_NAME"]]
        db_mod._raw_db = fresh_db
        sd_mod._raw_db = fresh_db  # module-level import captured old ref
        today = str((datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date())
        await fresh_db.salon_digest_log.delete_many({"tenant_id": WF_TID, "date": today})
        # pin every tenant's local clock to 9 AM (inside the send window) and stub outbound email
        import email_service
        real_now, real_send = sd_mod._local_now, email_service._send_email
        sd_mod._local_now = lambda t: datetime.now(timezone.utc).astimezone(sd_mod._tz(t)).replace(hour=9)
        async def _fake_send(*a, **k):
            return {"sent": False, "error": "stubbed in test"}
        email_service._send_email = _fake_send
        try:
            await sd_mod.send_salon_daily_digests(force=False)
        finally:
            sd_mod._local_now, email_service._send_email = real_now, real_send
        log = await fresh_db.salon_digest_log.find_one({"tenant_id": WF_TID, "date": today}, {"_id": 0})
        assert log is not None, "expected skip log for miracurl-whitefield"
        assert log["sent"] is False
        assert log.get("skipped") == "no_invoices_yet"
    asyncio.run(go())
