"""Iteration 222 — WhatsApp demo invite (send-demo-whatsapp) + reply projection.

Covers:
- POST /api/super-admin/mira-leads/{lid}/send-demo-whatsapp:
  * unauthed → 401/403
  * non-existent id → 404
  * lead without phone → 400 'No usable phone'
  * body shorter than 10 chars → 422
  * lead with unreachable UK landline → 502 Meta send failed
- GET /api/super-admin/mira/replies → each reply item has keys 'phone' and 'vertical'
- Pure helpers _wa_caption and _hq_contact_block
"""
import os
import re
import sys
import uuid
import asyncio
import pytest
import requests
from dotenv import load_dotenv
from tests._creds import pw
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
SA_EMAIL = "admin@miracurl-suite.com"
SA_PASSWORD = pw("SUPER_ADMIN")

sys.path.insert(0, "/app/backend")


# --- Fixtures ---------------------------------------------------------------

@pytest.fixture(scope="module")
def sa_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": SA_EMAIL, "password": SA_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"super-admin login failed: {r.status_code} {r.text[:200]}"
    csrf = s.cookies.get("csrf_token")
    assert csrf, "csrf_token cookie missing after login"
    s.headers.update({"X-CSRF-Token": csrf, "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def mongo_db():
    from motor.motor_asyncio import AsyncIOMotorClient
    url = os.environ.get("MONGO_URL") or open("/app/backend/.env").read().split("MONGO_URL=")[1].split("\n")[0].strip().strip('"')
    db_name = os.environ.get("DB_NAME") or open("/app/backend/.env").read().split("DB_NAME=")[1].split("\n")[0].strip().strip('"')
    client = AsyncIOMotorClient(url)
    return client[db_name]


@pytest.fixture()
def no_phone_lead(mongo_db):
    lid = str(uuid.uuid4())
    doc = {"id": lid, "name": "QA NoPhone", "status": "replied", "vertical": "salon",
           "city": "Ranchi", "replied_at": "2026-01-01T00:00:00Z",
           "last_reply_text": "test"}
    asyncio.get_event_loop().run_until_complete(mongo_db.mira_leads.insert_one(doc))
    yield lid
    loop = asyncio.get_event_loop()
    loop.run_until_complete(mongo_db.mira_leads.delete_one({"id": lid}))
    loop.run_until_complete(mongo_db.mira_outreach_log.delete_many({"lead_id": lid}))
    loop.run_until_complete(mongo_db.mira_wa_outreach.delete_many({"lead_id": lid}))


@pytest.fixture()
def uk_landline_lead(mongo_db):
    lid = str(uuid.uuid4())
    doc = {"id": lid, "name": "QA UKLand", "status": "replied", "vertical": "salon",
           "city": "Ranchi", "phone": "+442887767955",
           "replied_at": "2026-01-01T00:00:00Z", "last_reply_text": "test"}
    asyncio.get_event_loop().run_until_complete(mongo_db.mira_leads.insert_one(doc))
    yield lid
    loop = asyncio.get_event_loop()
    loop.run_until_complete(mongo_db.mira_leads.delete_one({"id": lid}))
    loop.run_until_complete(mongo_db.mira_outreach_log.delete_many({"lead_id": lid}))
    loop.run_until_complete(mongo_db.mira_wa_outreach.delete_many({"lead_id": lid}))


# --- HTTP tests -------------------------------------------------------------

class TestSendDemoWhatsApp:
    def test_unauthed(self):
        r = requests.post(f"{BASE_URL}/api/super-admin/mira-leads/does-not-exist/send-demo-whatsapp",
                          json={"body": "hello hello"}, timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_not_found(self, sa_session):
        r = sa_session.post(f"{BASE_URL}/api/super-admin/mira-leads/does-not-exist-xxx/send-demo-whatsapp",
                            json={"body": "hello hello hello"}, timeout=15)
        assert r.status_code == 404, f"expected 404 got {r.status_code} {r.text[:200]}"

    def test_body_too_short(self, sa_session, no_phone_lead):
        r = sa_session.post(f"{BASE_URL}/api/super-admin/mira-leads/{no_phone_lead}/send-demo-whatsapp",
                            json={"body": "short"}, timeout=15)
        assert r.status_code == 422, f"expected 422 got {r.status_code} {r.text[:200]}"

    def test_no_usable_phone(self, sa_session, no_phone_lead):
        r = sa_session.post(f"{BASE_URL}/api/super-admin/mira-leads/{no_phone_lead}/send-demo-whatsapp",
                            json={"body": "This body is long enough to pass pydantic validator."}, timeout=15)
        assert r.status_code == 400, f"expected 400 got {r.status_code} {r.text[:200]}"
        assert "phone" in r.text.lower()

    def test_uk_landline_meta_rejects(self, sa_session, uk_landline_lead):
        r = sa_session.post(f"{BASE_URL}/api/super-admin/mira-leads/{uk_landline_lead}/send-demo-whatsapp",
                            json={"body": "This body is long enough to pass pydantic validator."}, timeout=45)
        # Expect 502 'Meta send failed' because UK landline can't receive WA.
        assert r.status_code == 502, f"expected 502 got {r.status_code} {r.text[:400]}"
        assert "Meta send failed" in r.text or "meta" in r.text.lower()


class TestMiraRepliesProjection:
    def test_replies_include_phone_and_vertical(self, sa_session):
        r = sa_session.get(f"{BASE_URL}/api/super-admin/mira/replies", timeout=20)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        data = r.json()
        assert "replies" in data
        if not data["replies"]:
            pytest.skip("No replies in inbox — projection check skipped")
        for row in data["replies"][:5]:
            assert "phone" in row, f"missing 'phone' key in {row.keys()}"
            assert "vertical" in row, f"missing 'vertical' key in {row.keys()}"


# --- Pure helpers -----------------------------------------------------------

class TestHelpers:
    def test_wa_caption_strips_urls_and_has_signature(self):
        from routes.mira_outreach import _wa_caption
        out = _wa_caption("Pick a slot here: https://x.y/demo\n\nMira & the Miracurl team", "BLOCK")
        assert "https://" not in out, f"URL leaked: {out!r}"
        assert "BLOCK" in out
        assert out.rstrip().endswith("Mira & the Miracurl team ✦")
        # "here:" dangling should be fixed to "."
        assert "here:" not in out

    def test_hq_contact_block_india_restaurant(self):
        from routes.mira_outreach import _hq_contact_block
        out = asyncio.get_event_loop().run_until_complete(
            _hq_contact_block({"city": "Ranchi", "vertical": "restaurant"}))
        assert "/signup-restaurant-india" in out, out
        assert "admin@miracurl-suite.com" in out, out
        assert "+919180261256" in out, out
        assert "instagram.com/miracurl.ai" in out.lower() or "instagram" in out.lower(), out
        assert "/demo" in out, out

    def test_hq_contact_block_us_restaurant(self):
        from routes.mira_outreach import _hq_contact_block
        out = asyncio.get_event_loop().run_until_complete(
            _hq_contact_block({"city": "Austin", "vertical": "restaurant"}))
        assert "/signup-restaurant-us" in out, out
