"""Iteration 219 - WA outreach HQ endpoints + landline check."""
import os
import pytest
import requests
import uuid
from datetime import datetime, timezone
from tests._creds import pw

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
SUPER_EMAIL = "admin@miracurl-suite.com"
SUPER_PASSWORD = pw("SUPER_ADMIN")


@pytest.fixture(scope="module")
def super_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    csrf = s.cookies.get("csrf_token")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf})
    return s


@pytest.fixture(scope="module")
def qa_lead_id(super_session):
    """Insert a QA landline lead directly into mongo via a helper endpoint; else fallback via mongo URL."""
    # Try via direct mongo
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url:
        # try reading backend/.env
        with open("/app/backend/.env") as f:
            for line in f:
                if line.startswith("MONGO_URL="):
                    mongo_url = line.split("=", 1)[1].strip().strip('"').strip("'")
                if line.startswith("DB_NAME="):
                    db_name = line.split("=", 1)[1].strip().strip('"').strip("'")
    client = MongoClient(mongo_url)
    db = client[db_name]
    lid = f"qa-test-{uuid.uuid4().hex[:8]}"
    db.mira_leads.insert_one({
        "id": lid,
        "name": "QA Landline Salon",
        "phone": "+442887767955",
        "status": "researched",
        "vertical": "salon",
        "city": "Test",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    yield lid
    # cleanup
    db.mira_leads.delete_one({"id": lid})
    db.mira_wa_outreach.delete_many({"lead_id": lid})


class TestUnauthed:
    def test_channel_unauthed(self):
        r = requests.get(f"{BASE_URL}/api/super-admin/wa-outreach/channel", timeout=15)
        assert r.status_code in (401, 403)

    def test_history_unauthed(self):
        r = requests.get(f"{BASE_URL}/api/super-admin/wa-outreach/history", timeout=15)
        assert r.status_code in (401, 403)


class TestChannel:
    def test_channel(self, super_session):
        r = super_session.get(f"{BASE_URL}/api/super-admin/wa-outreach/channel", timeout=30)
        assert r.status_code == 200
        data = r.json()
        print("channel:", {k: v for k, v in data.items() if k != "template_body"})
        assert "meta_ready" in data
        assert "template_status" in data
        assert "platform_number" in data
        # expectations from task:
        assert data.get("platform_number") == "919180379552", f"got {data.get('platform_number')}"
        assert data.get("template_status") == "APPROVED", f"got {data.get('template_status')}"
        assert data.get("meta_ready") is True
        assert data.get("template_body"), "template_body empty"


class TestCheck:
    def test_check_on_real_lead(self, super_session):
        r = super_session.get(f"{BASE_URL}/api/super-admin/mira-leads", timeout=30)
        assert r.status_code == 200, r.text[:200]
        payload = r.json()
        items = payload.get("items") if isinstance(payload, dict) else payload
        assert items and len(items) > 0, "no mira leads"
        lid = items[0]["id"]
        c = super_session.get(f"{BASE_URL}/api/super-admin/wa-outreach/check/{lid}", timeout=30)
        assert c.status_code == 200, c.text[:200]
        data = c.json()
        for k in ("phone", "valid", "type", "wa_likely", "label", "country"):
            assert k in data, f"missing {k}"

    def test_check_on_landline(self, super_session, qa_lead_id):
        c = super_session.get(f"{BASE_URL}/api/super-admin/wa-outreach/check/{qa_lead_id}", timeout=30)
        assert c.status_code == 200
        d = c.json()
        print("landline check:", d)
        assert d["type"] == "landline", f"got {d['type']}"
        assert d["wa_likely"] is False
        assert d["valid"] is True


class TestSendMetaLandline:
    def test_send_meta_landline_rejected(self, super_session, qa_lead_id):
        r = super_session.post(
            f"{BASE_URL}/api/super-admin/wa-outreach/{qa_lead_id}/send-meta",
            json={"force": False}, timeout=30)
        assert r.status_code == 409, f"expected 409, got {r.status_code}: {r.text[:200]}"
        assert "landline" in r.text.lower()


class TestManualAndHistory:
    def test_manual_sent_and_history_delete(self, super_session, qa_lead_id):
        r = super_session.post(f"{BASE_URL}/api/super-admin/wa-outreach/{qa_lead_id}/manual-sent", timeout=30)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert data["ok"] is True
        row = data["outreach"]
        assert row["channel"] == "manual"
        assert row["status"] == "sent_manually"
        oid = row["id"]

        # history contains it
        h = super_session.get(f"{BASE_URL}/api/super-admin/wa-outreach/history", timeout=30)
        assert h.status_code == 200
        hd = h.json()
        assert "items" in hd and "counts" in hd
        assert any(x["id"] == oid for x in hd["items"]), "manual row not in history"

        # filter manual
        hm = super_session.get(f"{BASE_URL}/api/super-admin/wa-outreach/history?channel=manual", timeout=30)
        assert hm.status_code == 200
        assert all(i["channel"] == "manual" for i in hm.json()["items"])

        # delete
        d = super_session.delete(f"{BASE_URL}/api/super-admin/wa-outreach/history/{oid}", timeout=30)
        assert d.status_code == 200

        # verify deletion
        h2 = super_session.get(f"{BASE_URL}/api/super-admin/wa-outreach/history", timeout=30)
        assert not any(x["id"] == oid for x in h2.json()["items"])

    def test_delete_missing(self, super_session):
        r = super_session.delete(f"{BASE_URL}/api/super-admin/wa-outreach/history/nonexistent-xyz", timeout=30)
        assert r.status_code == 404
