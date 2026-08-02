"""Backend tests for Mira call recordings, retry-failed, and map briefing (iteration 86)."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
SUPER_EMAIL = "super@miracurl.com"
SUPER_PW = "og9T@41Es#OQb6"
SEEDED_FAILED_LEAD_ID = "96cfda24-572c-4058-bc0c-eea507bc1e35"


@pytest.fixture(scope="module")
def sa_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PW}, timeout=20)
    assert r.status_code == 200, f"super-admin login failed: {r.status_code} {r.text[:200]}"
    return s


# --- Map briefing ---
class TestMapBriefing:
    def test_briefing_shape_and_text(self, sa_session):
        r = sa_session.get(f"{BASE_URL}/api/super-admin/mira/map-briefing", timeout=20)
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        assert "text" in j and "data" in j
        assert j["text"].startswith("Hey Miracurl!"), j["text"][:120]
        d = j["data"]
        for k in ("leads_today", "calls_today", "interested_today", "failed_today", "bookings_today", "callable_hot"):
            assert k in d, f"missing {k} in data"
        # When leads_today == 0, text should mention 'no new leads found so far today'
        if d["leads_today"] == 0:
            assert "no new leads found so far today" in j["text"], j["text"]
        assert "Please give me a command" in j["text"]


# --- List calls ---
class TestListCalls:
    def test_list_calls_stats_and_error_friendly(self, sa_session):
        r = sa_session.get(f"{BASE_URL}/api/super-admin/mira-calls", timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert "items" in j and "stats" in j
        assert isinstance(j["items"], list)
        assert "failed" in j["stats"]
        # Seeded failed row should have error_friendly
        failed_items = [i for i in j["items"] if i.get("status") == "failed"]
        assert len(failed_items) >= 1, "expected at least 1 seeded failed call"
        assert any(i.get("error_friendly") for i in failed_items), "expected error_friendly on failed items"


# --- Retry failed ---
class TestRetryFailed:
    def test_retry_failed_queues(self, sa_session):
        r = sa_session.post(f"{BASE_URL}/api/super-admin/mira-calls/retry-failed", timeout=30)
        assert r.status_code == 200, r.text[:300]
        j = r.json()
        assert j.get("ok")
        assert j.get("queued", 0) >= 1, f"expected queued >= 1, got {j}"

    def test_retry_failed_idempotent(self, sa_session):
        import time
        time.sleep(5)  # let previous dial attempts settle into new failed logs
        r = sa_session.post(f"{BASE_URL}/api/super-admin/mira-calls/retry-failed", timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert j.get("ok")
        # New failed logs from last retry should still show up as failed latest → still callable
        assert j.get("queued", 0) >= 1, f"expected retry to still find failed calls, got {j}"


# --- Recording endpoints ---
class TestRecording:
    def test_recording_404_for_fake_id(self, sa_session):
        r = sa_session.get(f"{BASE_URL}/api/super-admin/mira-calls/fake-id-xyz-not-real/recording", timeout=20)
        assert r.status_code == 404
        assert "No recording" in r.text

    def test_recording_webhook_updates_log(self, sa_session):
        # find a failed call for the seeded lead
        r = sa_session.get(f"{BASE_URL}/api/super-admin/mira-calls", timeout=20)
        assert r.status_code == 200
        items = r.json()["items"]
        target = next((i for i in items if i.get("lead_id") == SEEDED_FAILED_LEAD_ID), None) or next(
            (i for i in items if i.get("status") == "failed"), None)
        assert target, "no failed call found for webhook test"
        call_id = target["id"]

        # public webhook — no auth
        fake_url = "https://api.twilio.com/2010-04-01/Accounts/ACfake/Recordings/REfake"
        wh = requests.post(
            f"{BASE_URL}/api/webhooks/twilio/voice/{call_id}/recording",
            data={"RecordingUrl": fake_url, "RecordingSid": "REfake", "RecordingDuration": "12"},
            timeout=20,
        )
        assert wh.status_code == 200, wh.text[:200]
        assert wh.json().get("ok")

        # verify saved
        r2 = sa_session.get(f"{BASE_URL}/api/super-admin/mira-calls", timeout=20)
        item = next((i for i in r2.json()["items"] if i["id"] == call_id), None)
        assert item is not None
        assert item.get("recording_url") == fake_url, f"recording_url not saved: {item.get('recording_url')}"
