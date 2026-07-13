"""Iter 62 — What's New, Renewals auto-reminders, Referrals, Day Offers, CCTV.
Uses HTTPOnly cookie auth via /api/auth/login. Non-destructive.
"""
import base64
import os
import re
from pathlib import Path

import pytest
import requests

from creds import password_for

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
TENANT = "miracurl-marathahalli"
SALON_ADMIN = "admin@miracurl.com"
SUPER_ADMIN = "super@miracurl.com"


def _login(email: str, tenant: str | None = None) -> requests.Session:
    s = requests.Session()
    headers = {"Content-Type": "application/json"}
    if tenant:
        headers["X-Tenant-Slug"] = tenant
        s.headers["X-Tenant-Slug"] = tenant
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password_for(email)}, headers=headers)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin_session():
    return _login(SALON_ADMIN, TENANT)


@pytest.fixture(scope="module")
def super_session():
    return _login(SUPER_ADMIN)


# --- 1. What's New ---
class TestWhatsNew:
    def test_returns_build_date_highlights(self, admin_session):
        r = admin_session.get(f"{BASE}/api/whats-new")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "build" in data and "date" in data and "highlights" in data
        assert isinstance(data["highlights"], list) and len(data["highlights"]) >= 1
        # No internal prefixes
        for h in data["highlights"]:
            for prefix in ("Super Admin:", "Deployments:", "Platform:", "Miracurl Team:"):
                assert not h.startswith(prefix), f"leaked internal item: {h}"

    def test_requires_auth(self):
        r = requests.get(f"{BASE}/api/whats-new", headers={"X-Tenant-Slug": TENANT})
        assert r.status_code in (401, 403)


# --- 2. Renewal reminders ---
class TestRenewals:
    def test_run_auto_reminders_returns_stats(self, super_session):
        r = super_session.post(f"{BASE}/api/super-admin/renewals/run-auto-reminders")
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("checked", "sent", "skipped", "failed", "items"):
            assert k in data, f"missing {k} in {data}"
        assert isinstance(data["items"], list)

    def test_run_auto_reminders_idempotent(self, super_session):
        # second run should skip already-sent tenants for the same day-mark
        r = super_session.post(f"{BASE}/api/super-admin/renewals/run-auto-reminders")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["skipped"] >= 1, f"expected idempotent skip>=1, got {data}"

    def test_reminder_log(self, super_session):
        r = super_session.get(f"{BASE}/api/super-admin/renewals/reminder-log")
        assert r.status_code == 200, r.text
        data = r.json()
        rows = data.get("items") or data.get("log") or data.get("entries") or (data if isinstance(data, list) else [])
        if isinstance(data, dict) and not rows:
            # try common keys
            for k in data:
                if isinstance(data[k], list):
                    rows = data[k]; break
        assert isinstance(rows, list) and len(rows) >= 1, f"no reminder log rows: {data}"
        sample = rows[0]
        assert "days_mark" in sample or "days" in sample, f"log missing days_mark: {sample}"
        assert "email_sent" in sample, f"log missing email_sent: {sample}"
        assert "wa_link" in sample, f"log missing wa_link: {sample}"

    def test_rejects_salon_admin(self, admin_session):
        r = admin_session.post(f"{BASE}/api/super-admin/renewals/run-auto-reminders")
        assert r.status_code in (401, 403), f"salon admin got {r.status_code}"
        r2 = admin_session.get(f"{BASE}/api/super-admin/renewals/reminder-log")
        assert r2.status_code in (401, 403)


# --- 3. Referrals ---
class TestReferrals:
    def test_referrals_listing(self, super_session):
        r = super_session.get(f"{BASE}/api/super-admin/affiliates/referrals")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data and "stats" in data, data
        for k in ("total", "pending", "credited", "credited_inr"):
            assert k in data["stats"], f"stats missing {k}: {data['stats']}"
        names = [i.get("referred_salon_name") or i.get("referred_name") or i.get("name") or "" for i in data["items"]]
        assert any("Test Referred Salon" in n for n in names), f"seeded referral missing: {names}"

    def test_rejects_salon_admin(self, admin_session):
        r = admin_session.get(f"{BASE}/api/super-admin/affiliates/referrals")
        assert r.status_code in (401, 403)


# --- 4. Day Offers ---
class TestDayOffers:
    def test_today(self, admin_session):
        r = admin_session.get(f"{BASE}/api/day-offers/today")
        assert r.status_code == 200, r.text
        data = r.json()
        # An accepted offer already exists per handoff
        assert data.get("already_accepted") in (True, False) or "offer" in data or "title" in data
        # Look for flyer_url either at root or inside offer
        offer = data.get("offer") or data
        assert offer.get("flyer_url") or offer.get("flyerUrl"), f"today's accepted offer missing flyer_url: {data}"

    def test_suggest_returns_already_accepted(self, admin_session):
        r = admin_session.post(f"{BASE}/api/day-offers/suggest", json={})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("already_accepted") == True, f"expected already_accepted=True, got {data}"
        offer = data.get("offer") or data
        assert offer.get("title"), f"missing title: {data}"
        assert offer.get("services") or offer.get("service_names"), f"missing services: {data}"

    def test_suggest_another(self, admin_session):
        r = admin_session.post(f"{BASE}/api/day-offers/suggest-another", json={})
        # This bypasses the accepted lock and generates a new suggestion via LLM
        assert r.status_code == 200, r.text
        data = r.json()
        offer = data.get("offer") or data
        assert offer.get("title"), f"missing title in suggest-another: {data}"
        # Verify services present and non-empty
        svcs = offer.get("services") or offer.get("service_names") or []
        assert svcs, f"no services suggested: {data}"

    def test_requires_auth(self):
        for path in ("/api/day-offers/today", "/api/day-offers/suggest"):
            method = requests.get if "today" in path else requests.post
            r = method(f"{BASE}{path}", json={}, headers={"X-Tenant-Slug": TENANT})
            assert r.status_code in (401, 403), f"{path} unauth got {r.status_code}"


# --- 5. CCTV ---
def _load_test_image_b64() -> str:
    p = Path("/tmp/salon_b64.txt")
    if p.exists():
        return p.read_text().strip()
    # Generate on the fly
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (800, 600))
    px = img.load()
    for x in range(800):
        for y in range(600):
            px[x, y] = ((x * 3 + y) % 255, (y * 7) % 255, ((x + y) * 5) % 255)
    d = ImageDraw.Draw(img)
    for i, xoff in enumerate([50, 250, 450]):
        d.rectangle([xoff, 50, xoff + 150, 300], fill="brown")
    d.ellipse([100, 350, 180, 430], fill="pink")
    tmp = "/tmp/salon.jpg"
    img.save(tmp, "JPEG", quality=80)
    return base64.b64encode(open(tmp, "rb").read()).decode()


class TestCCTV:
    def test_get_config(self, admin_session):
        r = admin_session.get(f"{BASE}/api/cctv/config")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), dict)

    def test_put_config(self, admin_session):
        payload = {"mode": "device", "interval_min": 10}
        r = admin_session.put(f"{BASE}/api/cctv/config", json=payload)
        assert r.status_code == 200, r.text
        # verify persisted
        got = admin_session.get(f"{BASE}/api/cctv/config").json()
        assert got.get("mode") == "device"
        assert int(got.get("interval_min", 0)) == 10

    def test_analyze_frame(self, admin_session):
        b64 = _load_test_image_b64()
        # Try both raw b64 and data-uri form
        payloads = [
            {"image_b64": b64},
            {"image": f"data:image/jpeg;base64,{b64}"},
            {"image_base64": b64},
        ]
        last = None
        for payload in payloads:
            r = admin_session.post(f"{BASE}/api/cctv/analyze-frame", json=payload, timeout=120)
            last = r
            if r.status_code == 200:
                break
        assert last.status_code == 200, f"analyze-frame failed: {last.status_code} {last.text[:400]}"
        data = last.json()
        obs = data.get("observation") or data
        # Expected fields
        for k in ("waiting_customers", "chairs_empty", "queue_length", "staff_idle"):
            assert k in obs, f"observation missing {k}: {obs}"

    def test_latest(self, admin_session):
        r = admin_session.get(f"{BASE}/api/cctv/latest")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("observation") or data.get("last_observation"), f"no observation in latest: {list(data.keys())}"
        assert "trend" in data or "hourly" in data, f"no trend: {list(data.keys())}"
        assert data.get("last_frame_b64") or data.get("frame_b64") or data.get("last_frame"), f"no frame: {list(data.keys())}"

    def test_requires_auth(self):
        for path in ("/api/cctv/config", "/api/cctv/latest"):
            r = requests.get(f"{BASE}{path}", headers={"X-Tenant-Slug": TENANT})
            assert r.status_code in (401, 403), f"{path} unauth got {r.status_code}"
