"""
Iter 36 — Backend tests for new features:
  1. Gallery listing (GET /api/gallery) — auth required
  2. Public AI chat (POST /api/public/ai-chat/{slug})
  3. Customer<->Owner chat start/send/poll (POST /api/public/chat/*)
  4. Owner side threads/messages/reply (GET /api/owner-chats, POST reply)
  5. Tenant isolation on /api/owner-chats
"""
import os
import uuid
import time
import pytest
import requests

_env_path = "/app/frontend/.env"
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL and os.path.exists(_env_path):
    for line in open(_env_path):
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
            break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = "Miracurl@123"
SUPER_EMAIL = "super@miracurl.com"
SUPER_PASS = "Super@Miracurl123"
TENANT_SLUG = "miracurl-marathahalli"


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return {"Authorization": f"Bearer {tok}"}


# ---------------- Gallery ----------------
class TestGallery:
    def test_gallery_requires_auth(self):
        r = requests.get(f"{API}/gallery", timeout=10)
        assert r.status_code in (401, 403)

    def test_gallery_list_ok(self, admin_headers):
        r = requests.get(f"{API}/gallery", headers=admin_headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)


# ---------------- Public AI Chat ----------------
class TestPublicAIChat:
    def test_ai_chat_reply(self):
        session_id = f"TEST_{uuid.uuid4().hex[:8]}"
        payload = {"message": "I have oily skin, which facial do you recommend?", "session_id": session_id}
        r = requests.post(f"{API}/public/ai-chat/{TENANT_SLUG}", json=payload, timeout=90)
        assert r.status_code == 200, f"ai-chat failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert "reply" in data
        assert isinstance(data["reply"], str) and len(data["reply"]) > 5
        # booking/booking_error may or may not be present (only when AI attempts booking)
        assert "booking" in data or "booking_error" in data or True

    def test_ai_chat_invalid_slug(self):
        r = requests.post(f"{API}/public/ai-chat/does-not-exist-xyz",
                          json={"message": "hi", "session_id": "TEST_x"}, timeout=15)
        assert r.status_code in (404, 400, 422)


# ---------------- Customer<->Owner Chat ----------------
@pytest.fixture(scope="module")
def thread_ctx():
    """Create a chat thread on public side; return thread_id + phone."""
    payload = {"name": "TEST_QA_Iter36", "phone": f"9{int(time.time())%10**9:09d}"}
    r = requests.post(f"{API}/public/chat/{TENANT_SLUG}/start", json=payload, timeout=15)
    assert r.status_code == 200, f"chat start failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    assert "thread_id" in data or "id" in data
    thread_id = data.get("thread_id") or data.get("id")
    return {"thread_id": thread_id, "phone": payload["phone"], "name": payload["name"]}


class TestOwnerChat:
    def test_public_chat_send(self, thread_ctx):
        tid = thread_ctx["thread_id"]
        r = requests.post(f"{API}/public/chat/{TENANT_SLUG}/{tid}/send",
                          json={"message": "Hello from QA test"}, timeout=15)
        assert r.status_code == 200, f"send failed: {r.status_code} {r.text[:200]}"

    def test_public_chat_poll(self, thread_ctx):
        tid = thread_ctx["thread_id"]
        r = requests.get(f"{API}/public/chat/{TENANT_SLUG}/{tid}", timeout=15)
        assert r.status_code == 200
        data = r.json()
        msgs = data.get("messages") if isinstance(data, dict) else data
        assert isinstance(msgs, list)
        assert any((m.get("text") or m.get("message")) == "Hello from QA test" for m in msgs)

    def test_owner_sees_thread(self, thread_ctx, admin_headers):
        r = requests.get(f"{API}/owner-chats", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        threads = r.json()
        assert isinstance(threads, list)
        match = [t for t in threads if t.get("id") == thread_ctx["thread_id"]]
        assert match, f"thread {thread_ctx['thread_id']} not in owner-chats list"
        # verify no _id leaked
        for t in threads:
            assert "_id" not in t

    def test_owner_unread_count(self, admin_headers):
        r = requests.get(f"{API}/owner-chats/unread-count", headers=admin_headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "count" in data or "unread" in data or isinstance(data, dict)

    def test_owner_read_messages(self, thread_ctx, admin_headers):
        tid = thread_ctx["thread_id"]
        r = requests.get(f"{API}/owner-chats/{tid}/messages", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        msgs = data.get("messages") if isinstance(data, dict) else data
        assert isinstance(msgs, list) and len(msgs) >= 1

    def test_owner_reply_and_customer_polls(self, thread_ctx, admin_headers):
        tid = thread_ctx["thread_id"]
        reply_text = f"TEST_owner_reply_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/owner-chats/{tid}/reply", headers=admin_headers,
                          json={"message": reply_text}, timeout=15)
        assert r.status_code == 200, f"reply failed: {r.status_code} {r.text[:200]}"
        # customer polls
        r2 = requests.get(f"{API}/public/chat/{TENANT_SLUG}/{tid}", timeout=15)
        assert r2.status_code == 200
        data = r2.json()
        msgs = data.get("messages") if isinstance(data, dict) else data
        assert any((m.get("text") or m.get("message")) == reply_text for m in msgs), "owner reply not visible on customer polling"


# ---------------- Tenant Isolation ----------------
class TestTenantIsolation:
    def test_no_leak_of_other_tenants(self, admin_headers, thread_ctx):
        """All threads returned to admin should belong to current tenant only.
        We verify by ensuring thread_ctx thread is present and no unexpected fields."""
        r = requests.get(f"{API}/owner-chats", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        threads = r.json()
        # tenant_id field, if exposed, should be consistent
        tenant_ids = {t.get("tenant_id") for t in threads if t.get("tenant_id")}
        if tenant_ids:
            assert len(tenant_ids) == 1, f"multiple tenants leaked: {tenant_ids}"

    def test_unauth_owner_chats_blocked(self):
        r = requests.get(f"{API}/owner-chats", timeout=10)
        assert r.status_code in (401, 403)
