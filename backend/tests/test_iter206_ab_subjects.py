"""Iteration 206 — A/B subject-line test + restaurant pitch preview."""
import os
import sys
import pytest
import requests
from datetime import datetime, timezone

def _load_base_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    # fallback: read from frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except OSError:
        pass
    return ""


BASE_URL = _load_base_url()
SUPER_EMAIL = "admin@miracurl-suite.com"
SUPER_PASS = "og9T@41Es#OQb6"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def super_client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": SUPER_EMAIL, "password": SUPER_PASS},
               timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    csrf = s.cookies.get("csrf_token")
    assert csrf, "csrf cookie not set"
    s.headers.update({"X-CSRF-Token": csrf})
    return s


@pytest.fixture(scope="module")
def mongo_db():
    # Load env from /app/backend/.env and connect
    sys.path.insert(0, "/app/backend")
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    return db


# ---------- pick_subject unit tests ----------
class TestPickSubject:
    def test_pick_subject_variants(self):
        sys.path.insert(0, "/app/backend")
        from routes.lead_gen import pick_subject
        # id ends in '1' → odd → B
        assert pick_subject({"id": "x1", "email_subject": "A", "email_subject_b": "B"}) == ("B", "B")
        # id ends in '2' → even → A
        assert pick_subject({"id": "x2", "email_subject": "A", "email_subject_b": "B"}) == ("A", "A")
        # ab disabled → always A
        assert pick_subject({"id": "x1", "email_subject": "A", "email_subject_b": "B"}, ab_enabled=False) == ("A", "A")
        # no subject_b
        assert pick_subject({"id": "x1", "email_subject": "A"}) == ("A", "")
        # no subjects at all
        assert pick_subject({"id": "x1"}) == ("Miracurl Suite — free demo", "")


# ---------- AB stats endpoint ----------
class TestAbStats:
    def test_ab_stats_with_fake_leads(self, super_client, mongo_db):
        import asyncio
        now = datetime.now(timezone.utc).isoformat()
        fake_rows = []
        # 6 A, 3 of them replied
        for i in range(6):
            fake_rows.append({
                "id": f"qa-ab-A-{i}", "vertical": "salon", "status": "sent",
                "subject_variant": "A", "subject_sent": f"Subject A #{i}",
                "name": f"QA Salon A{i}", "sent_at": now,
                "replied_at": now if i < 3 else None,
            })
        # 6 B, none replied
        for i in range(6):
            fake_rows.append({
                "id": f"qa-ab-B-{i}", "vertical": "salon", "status": "sent",
                "subject_variant": "B", "subject_sent": f"Subject B #{i}",
                "name": f"QA Salon B{i}", "sent_at": now,
            })

        async def insert():
            await mongo_db.mira_leads.insert_many(fake_rows)

        async def cleanup():
            await mongo_db.mira_leads.delete_many({"id": {"$regex": "^qa-ab-"}})

        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(insert())
            r = super_client.get(f"{BASE_URL}/api/super-admin/mira/outreach/ab-stats", timeout=15)
            assert r.status_code == 200, r.text
            data = r.json()
            assert "enabled" in data
            assert "verticals" in data
            salon = data["verticals"]["salon"]
            assert salon["A"]["sent"] >= 6
            assert salon["B"]["sent"] >= 6
            assert salon["A"]["replied"] >= 3
            # reply rate = 3/6 = 50.0 (assuming no other A sends in salon; may be higher with existing data)
            # We'll check our contribution: just ensure A reply_rate > 0 and winner likely A
            assert salon["A"]["reply_rate"] > 0
            assert len(salon["recent"]) <= 8
            assert "restaurant" in data["verticals"]
            assert "note" in data
        finally:
            loop.run_until_complete(cleanup())
            loop.close()


# ---------- settings toggle ----------
class TestSettingsAbToggle:
    def test_toggle_ab_off_and_on(self, super_client):
        # Toggle off
        r = super_client.put(f"{BASE_URL}/api/super-admin/mira/outreach/settings",
                             json={"ab_test": False}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ab_test") is False

        # Summary reflects off
        r2 = super_client.get(f"{BASE_URL}/api/super-admin/mira/outreach/summary", timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("settings", {}).get("ab_test") is False

        # ab-stats enabled: false
        r3 = super_client.get(f"{BASE_URL}/api/super-admin/mira/outreach/ab-stats", timeout=15)
        assert r3.status_code == 200
        assert r3.json().get("enabled") is False

        # Toggle back on
        r4 = super_client.put(f"{BASE_URL}/api/super-admin/mira/outreach/settings",
                              json={"ab_test": True}, timeout=15)
        assert r4.status_code == 200
        assert r4.json().get("ab_test") is True


# ---------- pitch preview ----------
class TestPitchPreview:
    def test_restaurant_pitch_preview_is_real(self, super_client):
        r = super_client.post(f"{BASE_URL}/api/super-admin/mira/outreach/pitch-preview",
                              json={"vertical": "restaurant"}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["is_sample"] is False, f"expected real restaurant lead, got sample: {d.get('lead')}"
        assert d["lead"]["name"] != "Spice Garden Family Restaurant"
        assert d["subject"] and d["subject_b"]
        assert d["subject"] != d["subject_b"], f"A and B must differ: {d['subject']!r} vs {d['subject_b']!r}"

    def test_salon_pitch_preview_has_subject_b(self, super_client):
        r = super_client.post(f"{BASE_URL}/api/super-admin/mira/outreach/pitch-preview",
                              json={"vertical": "salon"}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["subject"], "subject A must be non-empty"
        assert d["subject_b"], "subject B must be non-empty"


# ---------- mira-leads restaurant count ----------
class TestMiraLeads:
    def test_restaurant_leads_count_and_sources(self, super_client):
        r = super_client.get(f"{BASE_URL}/api/super-admin/mira-leads", timeout=20)
        assert r.status_code == 200, r.text
        payload = r.json()
        # payload could be a list or dict; find a list
        leads = payload if isinstance(payload, list) else payload.get("leads") or payload.get("items") or []
        rest = [l for l in leads if (l.get("vertical") == "restaurant")]
        assert len(rest) >= 10, f"expected ≥10 restaurant leads, got {len(rest)}"
        # Drafted ones have proper sources
        drafted = [l for l in rest if l.get("status") in ("drafted", "sent") and l.get("email")]
        for l in drafted:
            es = l.get("email_source")
            if es is not None and es != "":
                assert es in ("website", "contact_page", "instagram", "google"), f"bad email_source {es!r}"
            if l.get("phone"):
                ps = l.get("phone_source")
                if ps:
                    assert ps in ("google", "website", "contact_page"), f"bad phone_source {ps!r}"
