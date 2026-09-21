"""Backend tests for iter-182: Missed-bill nudge + Gift-card breakage revenue.

Covers:
- GET /api/appointments/unbilled-recent — seeded appt appears; older/non-completed/billed excluded.
- POST /api/appointments/{aid}/dismiss-unbilled — removes appt from nudge; 404 for unknown.
- Creating an invoice with appointment_id removes appt from nudge.
- GET /api/gift-cards stats.breakage=350, expired_count>=1; GC-TEST-BRK1 status expired.
- GET /api/gift-cards/analytics months[] contain breakage_amount.
- GET /api/reports/sales & /api/reports/daily include gift_card_breakage / gift_cards_expired.
- PUT /api/gift-cards/settings accepts validity_days=7, rejects 6.
- POST /api/invoices with gift_meta.validity_days=7 → new gift card carries validity_days=7 and expires_at=today+7;
  invalid (3) falls back to salon default.
"""
import os
import uuid
import asyncio
from datetime import datetime, timedelta, timezone

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

from _creds import password_for

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
TENANT_SLUG = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
OWNER_PIN = "4321"
IST = timezone(timedelta(hours=5, minutes=30))
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "miracurl_db")
SEEDED_APPT_ID = "test-unbilled-94142c"
SEEDED_GC_CODE = "GC-TEST-BRK1"


def _today_ist_date():
    return datetime.now(IST).date()


def _today_utc_date():
    return datetime.now(timezone.utc).date()


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT_SLUG, "Content-Type": "application/json"})
    pwd = password_for(ADMIN_EMAIL)
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": pwd})
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    csrf = s.cookies.get("csrf_token")
    assert csrf
    s.headers.update({"X-CSRF-Token": csrf, "X-Owner-Pin": OWNER_PIN})
    return s


@pytest.fixture(scope="module")
def mongo():
    return AsyncIOMotorClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def tenant_id(mongo):
    async def _get():
        t = await mongo.tenants.find_one({"slug": TENANT_SLUG}, {"_id": 0, "id": 1})
        return t["id"]
    return asyncio.get_event_loop().run_until_complete(_get())


@pytest.fixture(scope="module")
def customer_id(api):
    r = api.get(f"{BASE_URL}/api/customers?limit=5")
    assert r.status_code == 200
    rows = r.json() if isinstance(r.json(), list) else r.json().get("customers") or r.json().get("items") or []
    assert rows
    return rows[0]["id"]


@pytest.fixture(scope="module")
def service_item(api):
    r = api.get(f"{BASE_URL}/api/services")
    assert r.status_code == 200
    svcs = r.json() if isinstance(r.json(), list) else r.json().get("services") or []
    assert svcs
    s = svcs[0]
    return {"type": "service", "ref_id": s["id"], "name": s["name"], "qty": 1, "price": float(s["price"])}


# ---------- Unbilled recent ----------

class TestUnbilledRecent:
    def test_seeded_appt_appears(self, api):
        r = api.get(f"{BASE_URL}/api/appointments/unbilled-recent")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("days") == 2
        ids = [it["id"] for it in data["items"]]
        assert SEEDED_APPT_ID in ids, f"seeded appt missing; got {ids}"
        row = next(it for it in data["items"] if it["id"] == SEEDED_APPT_ID)
        # Required fields
        for f in ("customer_id", "customer_name", "staff_name", "service_names",
                  "scheduled_at", "total", "bill_date", "time_label"):
            assert f in row, f"missing {f}"
        # bill_date must be YYYY-MM-DD
        assert len(row["bill_date"]) == 10 and row["bill_date"][4] == "-"
        # Should be yesterday IST
        yday = (_today_ist_date() - timedelta(days=1)).isoformat()
        assert row["bill_date"] == yday, f"bill_date {row['bill_date']} != {yday}"

    def test_older_than_2_days_excluded(self, api, mongo, tenant_id):
        """Insert a 3-day-old completed appt and confirm it does NOT appear."""
        aid = f"TEST_old_{uuid.uuid4().hex[:8]}"
        old_dt = datetime.now(IST) - timedelta(days=3)
        old_utc = old_dt.astimezone(timezone.utc).replace(tzinfo=None).isoformat() + "+00:00"

        async def insert():
            await mongo.appointments.insert_one({
                "id": aid, "tenant_id": tenant_id, "status": "completed",
                "customer_id": "test-cust", "customer_name": "TEST Old",
                "staff_name": "S", "service_names": ["X"], "total": 100,
                "scheduled_at": old_utc, "created_at": old_utc,
            })
        asyncio.get_event_loop().run_until_complete(insert())
        try:
            r = api.get(f"{BASE_URL}/api/appointments/unbilled-recent")
            ids = [it["id"] for it in r.json()["items"]]
            assert aid not in ids
        finally:
            asyncio.get_event_loop().run_until_complete(mongo.appointments.delete_one({"id": aid}))

    def test_non_completed_excluded(self, api, mongo, tenant_id):
        aid = f"TEST_open_{uuid.uuid4().hex[:8]}"
        dt = (datetime.now(IST) - timedelta(days=1)).astimezone(timezone.utc).replace(tzinfo=None).isoformat() + "+00:00"

        async def insert():
            await mongo.appointments.insert_one({
                "id": aid, "tenant_id": tenant_id, "status": "confirmed",
                "customer_id": "c", "customer_name": "TEST Open", "staff_name": "S",
                "service_names": ["X"], "total": 100, "scheduled_at": dt,
            })
        asyncio.get_event_loop().run_until_complete(insert())
        try:
            r = api.get(f"{BASE_URL}/api/appointments/unbilled-recent")
            ids = [it["id"] for it in r.json()["items"]]
            assert aid not in ids
        finally:
            asyncio.get_event_loop().run_until_complete(mongo.appointments.delete_one({"id": aid}))

    def test_already_billed_excluded(self, api, mongo, tenant_id, customer_id, service_item):
        aid = f"TEST_billed_{uuid.uuid4().hex[:8]}"
        dt_local = datetime.now(IST) - timedelta(days=1)
        dt = dt_local.astimezone(timezone.utc).replace(tzinfo=None).isoformat() + "+00:00"

        async def insert():
            await mongo.appointments.insert_one({
                "id": aid, "tenant_id": tenant_id, "status": "completed",
                "customer_id": customer_id, "customer_name": "TEST Billed",
                "staff_name": "S", "service_names": ["X"], "total": 100,
                "scheduled_at": dt,
            })
        asyncio.get_event_loop().run_until_complete(insert())

        # Verify present first
        r = api.get(f"{BASE_URL}/api/appointments/unbilled-recent")
        assert aid in [it["id"] for it in r.json()["items"]]

        # Bill it — appointment_id + open status
        y = (_today_ist_date() - timedelta(days=1)).isoformat()
        r = api.post(f"{BASE_URL}/api/invoices", json={
            "customer_id": customer_id, "items": [service_item],
            "payment_mode": "cash", "status": "open",
            "appointment_id": aid, "bill_date": y, "force_duplicate": True,
        })
        assert r.status_code == 200, r.text
        inv_id = r.json()["id"]
        try:
            # Now excluded
            r2 = api.get(f"{BASE_URL}/api/appointments/unbilled-recent")
            assert aid not in [it["id"] for it in r2.json()["items"]]
        finally:
            api.delete(f"{BASE_URL}/api/invoices/{inv_id}")
            asyncio.get_event_loop().run_until_complete(mongo.appointments.delete_one({"id": aid}))


# ---------- Dismiss ----------

class TestDismissUnbilled:
    def test_dismiss_removes_from_nudge(self, api, mongo, tenant_id):
        aid = f"TEST_dismiss_{uuid.uuid4().hex[:8]}"
        dt = (datetime.now(IST) - timedelta(days=1)).astimezone(timezone.utc).replace(tzinfo=None).isoformat() + "+00:00"

        async def insert():
            await mongo.appointments.insert_one({
                "id": aid, "tenant_id": tenant_id, "status": "completed",
                "customer_id": "c", "customer_name": "TEST Dismiss", "staff_name": "S",
                "service_names": ["X"], "total": 100, "scheduled_at": dt,
            })
        asyncio.get_event_loop().run_until_complete(insert())
        try:
            r = api.get(f"{BASE_URL}/api/appointments/unbilled-recent")
            assert aid in [it["id"] for it in r.json()["items"]]

            r2 = api.post(f"{BASE_URL}/api/appointments/{aid}/dismiss-unbilled")
            assert r2.status_code == 200, r2.text
            assert r2.json().get("ok") is True

            r3 = api.get(f"{BASE_URL}/api/appointments/unbilled-recent")
            assert aid not in [it["id"] for it in r3.json()["items"]]
        finally:
            asyncio.get_event_loop().run_until_complete(mongo.appointments.delete_one({"id": aid}))

    def test_dismiss_unknown_returns_404(self, api):
        r = api.post(f"{BASE_URL}/api/appointments/does-not-exist-xyz/dismiss-unbilled")
        assert r.status_code == 404


# ---------- Gift-card breakage ----------

class TestGiftCardBreakage:
    def test_list_stats_include_breakage(self, api):
        r = api.get(f"{BASE_URL}/api/gift-cards")
        assert r.status_code == 200, r.text
        data = r.json()
        stats = data.get("stats") or {}
        assert stats.get("breakage") is not None
        assert float(stats["breakage"]) >= 350.0, f"breakage={stats.get('breakage')}"
        assert (stats.get("expired_count") or 0) >= 1
        # Seeded card
        card = next((c for c in data.get("items", []) if c.get("code") == SEEDED_GC_CODE), None)
        assert card is not None, "GC-TEST-BRK1 not found"
        assert card["status"] == "expired"
        assert float(card.get("breakage_amount") or 0) == 350.0
        assert card.get("expired_at"), "expired_at missing"

    def test_analytics_months_include_breakage(self, api):
        r = api.get(f"{BASE_URL}/api/gift-cards/analytics")
        assert r.status_code == 200, r.text
        data = r.json()
        months = data.get("months") or []
        assert months, "no months"
        for m in months:
            assert "breakage_amount" in m
        cur_key = _today_utc_date().strftime("%Y-%m")
        cur = next((m for m in months if m.get("key") == cur_key or m.get("month") == cur_key), None)
        assert cur is not None, f"current month {cur_key} missing"
        assert float(cur["breakage_amount"]) >= 350.0

    def test_reports_sales_gift_breakage(self, api):
        start = _today_utc_date().replace(day=1).isoformat()
        end = _today_utc_date().isoformat()
        r = api.get(f"{BASE_URL}/api/reports/sales", params={"start": start, "end": end})
        assert r.status_code == 200, r.text
        d = r.json()
        assert float(d.get("gift_card_breakage") or 0) >= 350.0
        assert int(d.get("gift_cards_expired") or 0) >= 1

    def test_reports_daily_gift_breakage_today(self, api):
        # Seeded GC-TEST-BRK1 expired_at is today UTC
        today = _today_utc_date().isoformat()
        r = api.get(f"{BASE_URL}/api/reports/daily", params={"date": today})
        assert r.status_code == 200, r.text
        d = r.json()
        assert float(d.get("gift_card_breakage") or 0) >= 350.0


# ---------- Gift-card settings validity ----------

class TestGiftCardSettingsValidity:
    def test_validity_7_accepted_6_rejected(self, api):
        # GET current
        g = api.get(f"{BASE_URL}/api/gift-cards/settings")
        assert g.status_code == 200, g.text
        settings = g.json()
        original_validity = settings.get("validity_days", 90)

        payload = dict(settings)
        payload["validity_days"] = 7
        r_ok = api.put(f"{BASE_URL}/api/gift-cards/settings", json=payload)
        assert r_ok.status_code == 200, f"7 rejected: {r_ok.status_code} {r_ok.text}"

        payload["validity_days"] = 6
        r_bad = api.put(f"{BASE_URL}/api/gift-cards/settings", json=payload)
        assert r_bad.status_code == 422, f"6 not rejected: {r_bad.status_code}"

        # Restore
        payload["validity_days"] = int(original_validity)
        api.put(f"{BASE_URL}/api/gift-cards/settings", json=payload)


# ---------- POS gift-card with custom validity ----------

class TestPosGiftCardCustomValidity:
    def test_validity_7_persisted(self, api, customer_id):
        gm = {"occasion": "birthday", "recipient_name": "Val Test",
              "recipient_email": "", "recipient_whatsapp": "", "message": "",
              "validity_days": 7}
        payload = {
            "customer_id": customer_id, "status": "completed", "payment_mode": "cash",
            "items": [{"type": "gift_card", "ref_id": "gift_card", "name": "Gift Card",
                       "qty": 1, "price": 500, "gift_meta": gm}],
            "force_duplicate": True,
        }
        r = api.post(f"{BASE_URL}/api/invoices", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        issued = d.get("gift_cards_issued") or []
        assert issued, "no gift cards issued"
        code = issued[0]["code"]

        gc_list = api.get(f"{BASE_URL}/api/gift-cards").json().get("items", [])
        card = next((c for c in gc_list if c.get("code") == code), None)
        assert card is not None, f"issued card {code} not listed"
        assert int(card.get("validity_days") or 0) == 7
        expected = (_today_utc_date() + timedelta(days=7)).isoformat()
        assert card.get("expires_at") == expected, f"expires_at {card.get('expires_at')} != {expected}"

    def test_invalid_validity_falls_back_to_default(self, api, customer_id):
        # Fetch salon default validity
        s = api.get(f"{BASE_URL}/api/gift-cards/settings").json()
        default_v = int(s.get("validity_days") or 90)

        gm = {"occasion": "birthday", "recipient_name": "Val Fallback",
              "recipient_email": "", "recipient_whatsapp": "", "message": "",
              "validity_days": 3}
        payload = {
            "customer_id": customer_id, "status": "completed", "payment_mode": "cash",
            "items": [{"type": "gift_card", "ref_id": "gift_card", "name": "Gift Card",
                       "qty": 1, "price": 500, "gift_meta": gm}],
            "force_duplicate": True,
        }
        r = api.post(f"{BASE_URL}/api/invoices", json=payload)
        assert r.status_code == 200, r.text
        code = r.json()["gift_cards_issued"][0]["code"]
        gc_list = api.get(f"{BASE_URL}/api/gift-cards").json().get("items", [])
        card = next((c for c in gc_list if c.get("code") == code), None)
        assert card is not None
        assert int(card.get("validity_days") or 0) == default_v, \
            f"expected fallback {default_v}, got {card.get('validity_days')}"
