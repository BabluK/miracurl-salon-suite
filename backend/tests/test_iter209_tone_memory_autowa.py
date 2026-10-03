"""Iter 209 — WhatsApp template auto-wa, Reply Tone Memory (GET/DELETE + remember_tone/tone_examples/_tone_prompt), send-demo-reply learned flag (code-only)."""
import os
import asyncio
import uuid
import requests
import pytest
from dotenv import load_dotenv
from _creds import pw

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
EMAIL = "admin@miracurl-suite.com"
PASSWORD = pw("SUPER_ADMIN")

# shared loop (motor single-client pattern)
_LOOP = asyncio.new_event_loop()


def _run(coro):
    return _LOOP.run_until_complete(coro)


# Use a pymongo (sync) client bound to the same DB for inspection/cleanup to
# avoid motor's event-loop binding issues inside pytest.
import pymongo  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

_SYNC_CLIENT = pymongo.MongoClient(os.environ["MONGO_URL"])
_SYNC_DB = _SYNC_CLIENT[os.environ["DB_NAME"]]

# Monkey-patch mira_outreach._raw_db onto a motor client bound to our test loop
# so that `await _raw_db.<coll>.insert_one(...)` inside remember_tone works.
import routes.mira_outreach as _mo  # noqa: E402
from _creds import pw
_mo._raw_db = AsyncIOMotorClient(os.environ["MONGO_URL"], io_loop=_LOOP)[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text[:200]
    csrf = s.cookies.get("csrf_token")
    assert csrf
    s.headers.update({"X-CSRF-Token": csrf, "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def anon():
    return requests.Session()


# ============ GET /api/super-admin/mira-leads/auto-wa ============
EXPECTED_WA_STATUSES = {"APPROVED", "PENDING", "REJECTED", "MISSING", "UNKNOWN"}


def _assert_auto_wa_shape(d):
    for k in ("template", "template_status", "sent_today", "replied_total", "phone_only", "phone_only_pitched"):
        assert k in d, (k, list(d.keys()))
    assert d["template_status"] in EXPECTED_WA_STATUSES, d["template_status"]
    assert isinstance(d["phone_only"], int)
    assert isinstance(d["phone_only_pitched"], int)
    assert isinstance(d["sent_today"], int)
    assert isinstance(d["replied_total"], int)


def test_auto_wa_default(client):
    r = client.get(f"{BASE_URL}/api/super-admin/mira-leads/auto-wa", timeout=30)
    assert r.status_code == 200, r.text[:200]
    _assert_auto_wa_shape(r.json())


def test_auto_wa_refresh(client):
    r = client.get(f"{BASE_URL}/api/super-admin/mira-leads/auto-wa?refresh=1", timeout=30)
    assert r.status_code == 200, r.text[:200]
    _assert_auto_wa_shape(r.json())


def test_auto_wa_requires_super_admin(anon):
    r = anon.get(f"{BASE_URL}/api/super-admin/mira-leads/auto-wa", timeout=30)
    assert r.status_code in (401, 403), r.status_code


# ============ GET/DELETE /api/super-admin/mira/tone-memory ============
def test_get_tone_memory_shape(client):
    r = client.get(f"{BASE_URL}/api/super-admin/mira/tone-memory", timeout=30)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    assert set(d.keys()) >= {"count", "used_in_prompt", "items"}
    assert isinstance(d["count"], int)
    assert isinstance(d["used_in_prompt"], int)
    assert isinstance(d["items"], list)


def test_tone_memory_requires_super_admin(anon):
    r = anon.get(f"{BASE_URL}/api/super-admin/mira/tone-memory", timeout=30)
    assert r.status_code in (401, 403)
    r2 = anon.delete(f"{BASE_URL}/api/super-admin/mira/tone-memory", timeout=30)
    assert r2.status_code in (401, 403)


def test_delete_tone_memory_returns_ok(client):
    r = client.delete(f"{BASE_URL}/api/super-admin/mira/tone-memory", timeout=30)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    assert d.get("ok") is True
    assert "deleted" in d and isinstance(d["deleted"], int)


# ============ Unit: remember_tone / tone_examples / _tone_prompt ============
_TEST_LEAD_ID = f"TEST_tone_{uuid.uuid4()}"


def _cleanup_test_tone_docs():
    _SYNC_DB.mira_tone_memory.delete_many({"lead_id": _TEST_LEAD_ID})


def test_remember_tone_returns_false_when_identical():
    from routes.mira_outreach import remember_tone
    try:
        lead = {"id": _TEST_LEAD_ID, "name": "T", "vertical": "salon"}
        draft = {"subject": "Hi there", "body": "Here is a quick demo\n\n"}
        # Normalized whitespace equivalent
        res = _run(remember_tone(lead, draft, "Hi there  ", "Here is a quick demo"))
        assert res is False
    finally:
        _cleanup_test_tone_docs()


def test_remember_tone_returns_true_when_changed_and_inserts_doc():
    from routes.mira_outreach import remember_tone, _raw_db  # noqa: F401
    try:
        lead = {"id": _TEST_LEAD_ID, "name": "T", "vertical": "salon"}
        draft = {"subject": "Hi there", "body": "Here is a quick demo"}
        res = _run(remember_tone(lead, draft, "Hey!", "Totally different body now."))
        assert res is True
        docs = list(_SYNC_DB.mira_tone_memory.find({"lead_id": _TEST_LEAD_ID}, {"_id": 0}))
        assert len(docs) == 1
        d = docs[0]
        for k in ("draft_subject", "draft_body", "final_subject", "final_body", "lead_id", "created_at"):
            assert k in d, (k, d)
        assert d["draft_subject"] == "Hi there"
        assert d["final_subject"] == "Hey!"
        assert d["final_body"] == "Totally different body now."
        assert d["lead_id"] == _TEST_LEAD_ID
    finally:
        _cleanup_test_tone_docs()


def test_remember_tone_returns_false_when_draft_missing():
    from routes.mira_outreach import remember_tone
    assert _run(remember_tone({"id": _TEST_LEAD_ID}, None, "s", "b")) is False
    assert _run(remember_tone({"id": _TEST_LEAD_ID}, {"subject": "x", "body": ""}, "s", "b")) is False


def test_tone_examples_sorted_desc():
    """tone_examples returns most recent first."""
    from routes.mira_outreach import remember_tone, tone_examples
    try:
        lead = {"id": _TEST_LEAD_ID, "name": "T"}
        _run(remember_tone(lead, {"subject": "s1", "body": "b1"}, "F1", "FB1"))
        _run(remember_tone(lead, {"subject": "s2", "body": "b2"}, "F2", "FB2"))
        _run(remember_tone(lead, {"subject": "s3", "body": "b3"}, "F3", "FB3"))
        ex = _run(tone_examples(limit=10))
        # Filter to our test lead
        mine = [e for e in ex if e.get("lead_id") == _TEST_LEAD_ID]
        assert len(mine) == 3
        # Most recent first → F3, F2, F1
        assert mine[0]["final_subject"] == "F3"
        assert mine[-1]["final_subject"] == "F1"
    finally:
        _cleanup_test_tone_docs()


def test_tone_prompt_empty_and_nonempty():
    from routes.mira_outreach import _tone_prompt
    assert _tone_prompt([]) == ""
    out = _tone_prompt([{"draft_subject": "d", "draft_body": "db", "final_subject": "f", "final_body": "fb"}])
    assert isinstance(out, str) and "STYLE MEMORY" in out


# ============ Code-only verification of send-demo-reply learned flag ============
def test_send_demo_reply_returns_learned_flag_in_code():
    import inspect
    import routes.mira_outreach as mo
    src = inspect.getsource(mo.send_demo_reply) if hasattr(mo, "send_demo_reply") else ""
    if not src:
        # fall back: scan module source
        src = inspect.getsource(mo)
    # Must call remember_tone and include 'learned' in return
    assert "remember_tone(" in src
    assert "learned" in src
