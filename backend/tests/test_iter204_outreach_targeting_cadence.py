"""Iter 204 — Mira Outreach Autopilot targeting (growing + luxury 3:1) & reminder cadence [7,7,16,90]."""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
API = BASE_URL + "/api"

SUPER_EMAIL = "admin@miracurl-suite.com"
SUPER_PASS = "og9T@41Es#OQb6"

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")


def _login(sess, email, password):
    headers = {"Content-Type": "application/json", "Origin": BASE_URL}
    r = sess.post(f"{API}/auth/login", json={"email": email, "password": password}, headers=headers)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    csrf = sess.cookies.get("csrf_token")
    assert csrf
    sess.headers.update({"X-CSRF-Token": csrf, "Origin": BASE_URL})
    return csrf


@pytest.fixture(scope="module")
def super_sess():
    s = requests.Session()
    _login(s, SUPER_EMAIL, SUPER_PASS)
    return s


@pytest.fixture(scope="module")
def mdb():
    # Load /app/backend/.env if MONGO_URL not set in env
    global MONGO_URL, DB_NAME
    if not MONGO_URL or not DB_NAME:
        env = {}
        with open("/app/backend/.env") as f:
            for line in f:
                if "=" in line and not line.strip().startswith("#"):
                    k, _, v = line.strip().partition("=")
                    env[k] = v.strip('"').strip("'")
        MONGO_URL = MONGO_URL or env.get("MONGO_URL")
        DB_NAME = DB_NAME or env.get("DB_NAME")
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


def _iso_days_ago(n):
    return (datetime.now(timezone.utc) - timedelta(days=n)).isoformat()


# ============ Summary settings shape ============
class TestSummarySettings:
    def test_summary_has_new_settings_keys(self, super_sess):
        r = super_sess.get(f"{API}/super-admin/mira/outreach/summary")
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        s = d.get("settings", {})
        assert s.get("max_reviews") == 300, f"max_reviews={s.get('max_reviews')}"
        assert s.get("include_luxury") is True
        assert s.get("followup_days") == [7, 7, 16, 90], f"followup_days={s.get('followup_days')}"
        # min_score default is 30 but is operator-mutable; accept anything in range
        assert isinstance(s.get("min_score"), int) and 0 <= s["min_score"] <= 100
        today = d.get("today", {})
        for key in ("emails", "new", "reminders", "salon", "restaurant", "whatsapp", "conversions", "replies"):
            assert key in today, f"today missing {key}"


# ============ Settings PUT: echo, validation, clamping ============
class TestSettingsPut:
    def test_put_echoes_and_restores(self, super_sess):
        r = super_sess.put(f"{API}/super-admin/mira/outreach/settings",
                           json={"max_reviews": 250, "include_luxury": False, "followup_days": [5, 5, 10, 60]})
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d.get("max_reviews") == 250
        assert d.get("include_luxury") is False
        assert d.get("followup_days") == [5, 5, 10, 60]

        # Restore
        r2 = super_sess.put(f"{API}/super-admin/mira/outreach/settings",
                            json={"max_reviews": 300, "include_luxury": True, "followup_days": [7, 7, 16, 90]})
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2.get("max_reviews") == 300
        assert d2.get("include_luxury") is True
        assert d2.get("followup_days") == [7, 7, 16, 90]

    def test_max_reviews_min_validation(self, super_sess):
        r = super_sess.put(f"{API}/super-admin/mira/outreach/settings", json={"max_reviews": 5})
        assert r.status_code == 422, f"expected 422 got {r.status_code} {r.text[:200]}"

    def test_followup_days_clamped(self, super_sess):
        r = super_sess.put(f"{API}/super-admin/mira/outreach/settings", json={"followup_days": [0, 500]})
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d.get("followup_days") == [1, 365], f"got {d.get('followup_days')}"
        # Restore
        super_sess.put(f"{API}/super-admin/mira/outreach/settings",
                       json={"followup_days": [7, 7, 16, 90]})


# ============ run-now dry_run: candidates only segment growing|luxury, unsent only ============
class TestRunNowDryRun:
    def test_dry_run_shape_and_segments(self, super_sess, mdb):
        r = super_sess.post(f"{API}/super-admin/mira/outreach/run-now?dry_run=true")
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        assert d.get("dry_run") is True
        assert isinstance(d.get("would_email"), list)
        assert isinstance(d.get("would_remind"), list)
        assert "budget_left_today" in d
        for row in d["would_email"]:
            assert row.get("segment") in ("growing", "luxury"), f"bad segment {row.get('segment')} in {row}"
            # verify never emailed via mongo
            email = row.get("email")
            if email:
                lead = mdb.mira_leads.find_one({"email": email}, {"_id": 0, "status": 1, "sent_at": 1})
                if lead:
                    assert lead.get("status") in ("drafted", "researched"), f"lead status={lead.get('status')}"
                    assert not lead.get("sent_at"), f"lead has sent_at={lead.get('sent_at')}"
            for k in ("name", "vertical", "city", "score", "reviews", "stage"):
                assert k in row


# ============ Reminder cadence unit behavior via mongo-fixture lead ============
class TestReminderCadence:
    LEAD_ID = "qa-cadence-1"
    EMAIL = "qa.cadence.test@gmail.com"

    def _find_row(self, dry_run_data, lead_id):
        for r in dry_run_data.get("would_remind", []):
            # would_remind rows use email as identity — cross-ref by email since lead_id isn't returned
            pass
        return None

    def _in_remind(self, dry_run_data):
        for r in dry_run_data.get("would_remind", []):
            if r.get("email") == self.EMAIL:
                return r
        return None

    def test_cadence_flow(self, super_sess, mdb):
        # Cleanup any prior residue
        mdb.mira_leads.delete_one({"id": self.LEAD_ID})
        # Bump per_cycle so reminders get budget after candidates; restore in finally
        pre = super_sess.get(f"{API}/super-admin/mira/outreach/summary").json()["settings"]
        orig_pc = int(pre.get("per_cycle") or 10)
        super_sess.put(f"{API}/super-admin/mira/outreach/settings", json={"per_cycle": 50})
        base_lead = {
            "id": self.LEAD_ID, "status": "sent", "sent_via": "email", "email": self.EMAIL,
            "sent_at": _iso_days_ago(8), "vertical": "salon", "name": "QA Cadence Salon",
            "city": "Pune", "score": 60, "reviews": 50, "created_at": _iso_days_ago(10),
            "unsubscribed": False,
        }
        mdb.mira_leads.insert_one({**base_lead})
        try:
            # 1) Stage 0, sent 8 days ago → should appear with stage 0
            r = super_sess.post(f"{API}/super-admin/mira/outreach/run-now?dry_run=true")
            assert r.status_code == 200, r.text[:300]
            row = self._in_remind(r.json())
            assert row is not None, "Stage 0 lead (sent 8d ago) missing from would_remind"
            assert row.get("stage") == 0, f"expected stage 0 got {row.get('stage')}"

            # 2) last_followup_at 3 days ago, stage 1 → NOT due (wait 7d)
            mdb.mira_leads.update_one({"id": self.LEAD_ID},
                                      {"$set": {"last_followup_at": _iso_days_ago(3), "followup_stage": 1}})
            r = super_sess.post(f"{API}/super-admin/mira/outreach/run-now?dry_run=true")
            assert self._in_remind(r.json()) is None, "Stage 1 but 3d ago should NOT be due"

            # 3) last_followup_at 8 days ago, stage 1 → present with stage 1
            mdb.mira_leads.update_one({"id": self.LEAD_ID},
                                      {"$set": {"last_followup_at": _iso_days_ago(8), "followup_stage": 1}})
            r = super_sess.post(f"{API}/super-admin/mira/outreach/run-now?dry_run=true")
            row = self._in_remind(r.json())
            assert row is not None, "Stage 1 8d ago should be due"
            assert row.get("stage") == 1

            # 4) stage 3, last 60 days ago → NOT due (wait 90)
            mdb.mira_leads.update_one({"id": self.LEAD_ID},
                                      {"$set": {"followup_stage": 3, "last_followup_at": _iso_days_ago(60)}})
            r = super_sess.post(f"{API}/super-admin/mira/outreach/run-now?dry_run=true")
            assert self._in_remind(r.json()) is None, "Stage 3 60d ago should NOT be due"

            # 5) stage 3, last 91 days ago → due
            mdb.mira_leads.update_one({"id": self.LEAD_ID},
                                      {"$set": {"followup_stage": 3, "last_followup_at": _iso_days_ago(91)}})
            r = super_sess.post(f"{API}/super-admin/mira/outreach/run-now?dry_run=true")
            row = self._in_remind(r.json())
            assert row is not None, "Stage 3 91d ago should be due"

            # 6) replied_at set → never appears
            mdb.mira_leads.update_one({"id": self.LEAD_ID},
                                      {"$set": {"replied_at": _iso_days_ago(1)}})
            r = super_sess.post(f"{API}/super-admin/mira/outreach/run-now?dry_run=true")
            assert self._in_remind(r.json()) is None, "Replied lead must NEVER appear in would_remind"
        finally:
            mdb.mira_leads.delete_one({"id": self.LEAD_ID})
            super_sess.put(f"{API}/super-admin/mira/outreach/settings", json={"per_cycle": orig_pc})


# ============ History endpoint smoke ============
class TestHistorySmoke:
    def test_history_ok_optional_kind_segment(self, super_sess):
        r = super_sess.get(f"{API}/super-admin/mira/outreach/history")
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert isinstance(d.get("items"), list)
        assert isinstance(d.get("days"), list)
        # items may include kind and segment on new rows — just ensure keys are permissible strings if present
        for it in d["items"][:20]:
            if "kind" in it:
                assert isinstance(it["kind"], str)
            if "segment" in it:
                assert it["segment"] in ("growing", "luxury", "other", None) or isinstance(it["segment"], str)
