"""Iteration 92 — Desk QR check-in, half-day rule, registry +91 fix,
WA pitch (no DEMO_VIDEO_URL), SMS packs regression.

Prereqs: preview env, admin@miracurl.com / q6QY@tn3p#9DtL,
priya.staff@miracurl.com / Staff@5678 (see /app/memory/test_credentials.md).

The tests mutate Priya's shift_start & monthly_base_salary + inject a QR
check-in row for TODAY; a session-scoped fixture restores the original state
after the test run.
"""
import os
import time
import asyncio
import pytest
import requests
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
TENANT = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PW = "q6QY@tn3p#9DtL"
SUPER_EMAIL = "super@miracurl.com"
SUPER_PW = "og9T@41Es#OQb6"
STAFF_EMAIL = "priya.staff@miracurl.com"
STAFF_PW = "Staff@5678"

MONGO = AsyncIOMotorClient(os.environ["MONGO_URL"])
DB = MONGO[os.environ["DB_NAME"]]


def _login(email, pw, tenant_slug=None):
    s = requests.Session()
    h = {"Content-Type": "application/json"}
    if tenant_slug:
        h["X-Tenant-Slug"] = tenant_slug
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": email, "password": pw},
               headers=h)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    if tenant_slug:
        s.headers.update({"X-Tenant-Slug": tenant_slug})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN_EMAIL, ADMIN_PW, TENANT)


@pytest.fixture(scope="module")
def staff():
    return _login(STAFF_EMAIL, STAFF_PW, TENANT)


@pytest.fixture(scope="module")
def super_admin():
    return _login(SUPER_EMAIL, SUPER_PW)


@pytest.fixture(scope="module")
def tenant_row():
    async def _f():
        return await DB.tenants.find_one({"slug": TENANT}, {"_id": 0})
    return asyncio.get_event_loop().run_until_complete(_f())


# ═══════════════════════════════════════════════════════════════════
# 1) REGISTRY PUBLIC SEARCH — +91 bug fix
# ═══════════════════════════════════════════════════════════════════
class TestRegistryVerifyPhone:
    """Public /api/public/registry/search — batch 6 attempts (rate limit 10/600s)."""

    def test_a_plus91_prefix_returns_profile(self):
        # PRIORITY: this was the reported bug — do it FIRST.
        r = requests.get(f"{BASE}/api/public/registry/search",
                         params={"q": "+919012345678", "name": "verify"})
        assert r.status_code == 200, r.text[:300]
        j = r.json()
        assert (j.get("employee") or j).get("name", "").lower().startswith("verify"), j

    def test_b_919_prefix_returns_profile(self):
        r = requests.get(f"{BASE}/api/public/registry/search",
                         params={"q": "919012345678", "name": "verify"})
        assert r.status_code == 200, r.text[:300]
        j = r.json()
        assert (j.get("employee") or j).get("name", "").lower().startswith("verify")

    def test_c_bare_10digit_returns_profile(self):
        r = requests.get(f"{BASE}/api/public/registry/search",
                         params={"q": "9012345678", "name": "Verify"})
        assert r.status_code == 200, r.text[:300]

    def test_d_phone_without_name_asks_for_name(self):
        r = requests.get(f"{BASE}/api/public/registry/search",
                         params={"q": "9012345678"})
        assert r.status_code == 400, r.text[:200]

    def test_e_staffcode_with_name(self):
        r = requests.get(f"{BASE}/api/public/registry/search",
                         params={"q": "STF-00133", "name": "Verify"})
        assert r.status_code == 200, r.text[:300]

    def test_f_staffcode_wrong_name(self):
        r = requests.get(f"{BASE}/api/public/registry/search",
                         params={"q": "STF-00133", "name": "totallywrongname"})
        assert r.status_code == 400, r.text[:200]


# ═══════════════════════════════════════════════════════════════════
# 2) DESK QR endpoint (admin)
# ═══════════════════════════════════════════════════════════════════
class TestDeskQr:
    def test_returns_png(self, admin):
        r = admin.get(f"{BASE}/api/attendance/desk-qr")
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("image/png")
        assert r.content[:8] == b"\x89PNG\r\n\x1a\n"

    def test_forbidden_for_staff(self, staff):
        r = staff.get(f"{BASE}/api/attendance/desk-qr")
        assert r.status_code in (401, 403), r.status_code


# ═══════════════════════════════════════════════════════════════════
# 3) QR CHECK-IN + HALF-DAY on the CHECK-IN path
#    Mutates Priya then restores.
# ═══════════════════════════════════════════════════════════════════

@pytest.fixture(scope="module")
def priya_setup():
    """Snapshot Priya + clear today's attendance; restore after."""
    loop = asyncio.get_event_loop()

    async def _setup():
        p = await DB.staff.find_one({"user_id": {"$exists": True},
                                     "email": STAFF_EMAIL}, {"_id": 0})
        if not p:
            p = await DB.staff.find_one({"id": "3cdf66d1-ea58-4605-a4d7-333330a96e8a"}, {"_id": 0})
        assert p, "Priya not found"
        original = {"shift_start": p.get("shift_start"),
                    "monthly_base_salary": p.get("monthly_base_salary"),
                    "week_off_day": p.get("week_off_day")}
        today = datetime.now(timezone.utc).date().isoformat()
        await DB.staff.update_one({"id": p["id"]},
                                  {"$set": {"shift_start": "00:05",
                                            "monthly_base_salary": 20000.0,
                                            "week_off_day": None}})
        # clean today's row so check-in creates fresh
        await DB.attendance.delete_many({"staff_id": p["id"], "date": today})
        return p, original, today

    p, original, today = loop.run_until_complete(_setup())
    yield p, today

    async def _cleanup():
        await DB.staff.update_one({"id": p["id"]}, {"$set": original})
        await DB.attendance.delete_many({"staff_id": p["id"], "date": today})
    loop.run_until_complete(_cleanup())


class TestQrCheckInHalfDay:
    def test_check_in_with_qr_marks_halfday(self, staff, priya_setup, tenant_row):
        p, today = priya_setup
        token = tenant_row.get("attendance_qr_token")
        assert token, "tenant has no attendance_qr_token"
        r = staff.post(f"{BASE}/api/staff/me/check-in",
                       json={"qr_token": token})
        assert r.status_code == 200, r.text[:400]
        rec = r.json()
        assert rec["check_in_method"] == "qr", rec
        assert rec["half_day"] is True, rec
        assert abs(float(rec["half_day_deduction"]) - 333.33) < 0.02, rec
        assert float(rec.get("late_penalty") or 0) == 0.0, rec
        # GPS should be null (bypassed)
        assert rec.get("check_in_lat") is None
        assert rec.get("check_in_lng") is None

    def test_check_in_wrong_qr_no_gps_400(self, staff, priya_setup):
        p, today = priya_setup
        # Kill today's row so we hit the "location required" branch again.
        async def _clear():
            await DB.attendance.delete_many({"staff_id": p["id"], "date": today})
        asyncio.get_event_loop().run_until_complete(_clear())
        r = staff.post(f"{BASE}/api/staff/me/check-in",
                       json={"qr_token": "not-a-real-token"})
        assert r.status_code == 400, r.text[:300]
        assert "location" in r.text.lower() or "gps" in r.text.lower()

    def test_admin_roster_shows_halfday(self, admin, staff, priya_setup, tenant_row):
        p, today = priya_setup
        # Re-run the successful check-in (idempotent)
        staff.post(f"{BASE}/api/staff/me/check-in",
                   json={"qr_token": tenant_row["attendance_qr_token"]})
        r = admin.get(f"{BASE}/api/attendance/today", params={"date": today})
        assert r.status_code == 200, r.text[:200]
        rows = r.json().get("roster") or []
        me = next((x for x in rows if x.get("staff_id") == p["id"]), None)
        assert me, f"Priya not in roster: {rows[:2]}"
        assert me.get("half_day") is True, me
        assert abs(float(me.get("half_day_deduction") or 0) - 333.33) < 0.02
        assert me.get("check_in_method") == "qr"

    def test_payroll_includes_halfday_deduction(self, staff, priya_setup):
        # Salary slip for the current month should list half_day_deduction_total
        r = staff.get(f"{BASE}/api/staff/me/salary-slip")
        assert r.status_code == 200, r.text[:300]
        j = r.json()
        assert j.get("half_days", 0) >= 1, j
        assert abs(float(j.get("half_day_deduction_total") or 0) - 333.33) < 0.02, j
        # Deductions total should include it
        assert float(j["deductions_total"]) >= 333.33, j


# ═══════════════════════════════════════════════════════════════════
# 4) SMS PACKS regression
# ═══════════════════════════════════════════════════════════════════
class TestSmsPacks:
    def test_list_packs(self, admin):
        r = admin.get(f"{BASE}/api/sms-packs")
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        packs = j.get("packs") or j
        prices = sorted(int(p["price"]) for p in packs)
        assert prices == [199, 499, 999], packs
        assert "balance" in j or "sms_balance" in j

    def test_order_creation_returns_order_id(self, admin):
        # DO NOT complete payment (LIVE Razorpay keys)
        r = admin.post(f"{BASE}/api/sms-packs/order", json={"pack": "pack_199"})
        assert r.status_code == 200, r.text[:400]
        j = r.json()
        assert j.get("order_id"), j
        assert j.get("points") == 250


# ═══════════════════════════════════════════════════════════════════
# 5) WA PITCH — no DEMO_VIDEO_URL env → no video line
# ═══════════════════════════════════════════════════════════════════
class TestWaPitch:
    def test_wa_message_has_links_no_video(self, super_admin):
        lead = asyncio.get_event_loop().run_until_complete(
            DB.mira_leads.find_one({"phone": {"$regex": r"\d"}}, {"_id": 0, "id": 1}))
        assert lead, "no mira_leads with phone in DB"
        r = super_admin.get(f"{BASE}/api/super-admin/mira-leads/{lead['id']}/whatsapp")
        assert r.status_code == 200, r.text[:300]
        msg = r.json()["message"]
        # No video line since DEMO_VIDEO_URL is unset
        assert "walkthrough video" not in msg.lower(), msg
        assert "🎥" not in msg, msg
        # But all links present
        for expect in ("/demo", "/signup-salon", "/staff-registry", "/miracurl-screens-tour.pdf"):
            assert expect in msg, f"missing {expect} in message:\n{msg}"
