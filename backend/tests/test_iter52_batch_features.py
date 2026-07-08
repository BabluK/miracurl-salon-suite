"""Iter 52 — batch features regression:
- POST /api/invoices email/sms receipts (Resend configured, Twilio NOT configured)
- GET/PUT /api/settings/late-fines
- POST /api/super-admin/tenants/{tid}/sms-points
- GET /api/reports/morning-briefing/audio (regression)
"""
import os
import time
import pytest
import requests

from creds import password_for
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = password_for("admin@miracurl.com")
SUPER_EMAIL = "super@miracurl.com"
SUPER_PASS = password_for("super@miracurl.com")
TENANT_ID = "83ab97b6-b481-4172-afd7-53a46c93317d"  # miracurl-marathahalli


def _sess(email, pwd):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=20)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return s


# --- Late fines settings ---

class TestLateFines:
    def test_get_put_late_fines_persist(self):
        s = _sess(ADMIN_EMAIL, ADMIN_PASS)
        r = s.get(f"{API}/settings/late-fines")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("grace_minutes", "fine_5", "fine_10", "fine_15", "fine_30"):
            assert k in d, f"missing key {k}: {d}"

        payload = {"grace_minutes": 7, "fine_5": 55, "fine_10": 110, "fine_15": 165, "fine_30": 320}
        r = s.put(f"{API}/settings/late-fines", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["fine_10"] == 110

        # re-GET → persisted
        r2 = s.get(f"{API}/settings/late-fines").json()
        assert r2["grace_minutes"] == 7
        assert r2["fine_5"] == 55
        assert r2["fine_30"] == 320

    def test_late_fines_requires_tenant_admin(self):
        # anonymous
        r = requests.get(f"{API}/settings/late-fines")
        assert r.status_code in (401, 403), f"Expected 401/403 for anonymous, got {r.status_code}"


# --- Super-admin sms points ---

class TestSmsPointsCredit:
    def test_credit_sms_points_super_admin(self):
        s = _sess(SUPER_EMAIL, SUPER_PASS)
        # baseline
        ovr = s.get(f"{API}/super-admin/tenants").json()
        tenants = ovr if isinstance(ovr, list) else ovr.get("tenants") or ovr.get("items") or []
        row = next((x for x in tenants if x.get("id") == TENANT_ID), None)
        # if not found, we just trust the POST to return new balance
        before = int((row or {}).get("sms_points") or 0)

        r = s.post(f"{API}/super-admin/tenants/{TENANT_ID}/sms-points", json={"points": 7})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok")
        assert isinstance(d.get("sms_points"), int)
        assert d["sms_points"] >= before + 7

    def test_credit_sms_points_forbidden_for_tenant_admin(self):
        s = _sess(ADMIN_EMAIL, ADMIN_PASS)
        r = s.post(f"{API}/super-admin/tenants/{TENANT_ID}/sms-points", json={"points": 5})
        assert r.status_code in (401, 403), f"Expected 401/403 for tenant admin, got {r.status_code} {r.text}"


# --- Billing receipts (email sent, SMS graceful skip w/ refund) ---

class TestBillingReceipts:
    def _svc(self, s):
        r = s.get(f"{API}/services")
        assert r.status_code == 200, r.text
        svcs = r.json()
        assert svcs, "No services in tenant"
        return svcs[0]

    def _create_customer(self, s, name, email=None, phone=None):
        payload = {"name": name}
        if email:
            payload["email"] = email
        if phone:
            payload["phone"] = phone
        r = s.post(f"{API}/customers", json=payload)
        assert r.status_code in (200, 201), r.text
        return r.json()

    def _create_invoice(self, s, cust, svc):
        body = {
            "customer_id": cust["id"],
            "items": [{
                "type": "service",
                "ref_id": svc["id"],
                "name": svc["name"],
                "price": float(svc.get("price") or 500),
                "qty": 1,
            }],
            "payment_mode": "cash",
            "discount": 0,
        }
        r = s.post(f"{API}/invoices", json=body)
        assert r.status_code in (200, 201), r.text
        return r.json()

    def test_invoice_with_email_and_phone_email_sent_sms_not_configured(self):
        s = _sess(ADMIN_EMAIL, ADMIN_PASS)
        # Baseline sms_points via a super-admin credit +5 so we always have some
        sup = _sess(SUPER_EMAIL, SUPER_PASS)
        sup.post(f"{API}/super-admin/tenants/{TENANT_ID}/sms-points", json={"points": 5})
        before_bal = sup.get(f"{API}/super-admin/tenants").json()
        rows = before_bal if isinstance(before_bal, list) else (before_bal.get("tenants") or before_bal.get("items") or [])
        row = next((x for x in rows if x.get("id") == TENANT_ID), None)
        before_pts = int((row or {}).get("sms_points") or 0)

        svc = self._svc(s)
        cust = self._create_customer(
            s,
            name=f"TEST_iter52_{int(time.time())}",
            email="delivered@resend.dev",
            phone="+919999999999",
        )
        inv = self._create_invoice(s, cust, svc)
        assert "receipts" in inv, f"No receipts in invoice: {inv}"
        rec = inv["receipts"]

        # Email should be sent
        assert rec.get("email"), f"email missing: {rec}"
        if rec["email"].get("sent") is not True and any(w in str(rec["email"].get("error", "")).lower() for w in ("quota", "too many", "rate")):
            pytest.skip(f"Resend quota/rate limited: {rec['email']}")
        assert rec["email"].get("sent"), f"email.sent expected True: {rec['email']}"

        # SMS should be skipped with not_configured (Twilio not set), point refunded
        assert rec.get("sms"), f"sms missing: {rec}"
        assert not rec["sms"].get("sent")
        err = rec["sms"].get("error", "")
        # Twilio may be unconfigured (not_configured) or configured-but-undeliverable for the
        # fake test number (trial verification / daily cap). Either way checkout must not break.
        assert err, f"expected an sms error for undeliverable test number, got: {rec['sms']}"

        # Point should have been refunded → balance unchanged
        after = sup.get(f"{API}/super-admin/tenants").json()
        rows2 = after if isinstance(after, list) else (after.get("tenants") or after.get("items") or [])
        row2 = next((x for x in rows2 if x.get("id") == TENANT_ID), None)
        after_pts = int((row2 or {}).get("sms_points") or 0)
        assert after_pts == before_pts, f"sms_points changed: before={before_pts} after={after_pts} (should have been refunded)"

        # If response embeds points_left, must equal current balance
        pl = rec["sms"].get("points_left")
        if pl is not None:
            assert int(pl) == after_pts, f"points_left mismatch pl={pl} after={after_pts}"

    def test_invoice_without_email_returns_no_email_error(self):
        s = _sess(ADMIN_EMAIL, ADMIN_PASS)
        svc = self._svc(s)
        cust = self._create_customer(s, name=f"TEST_iter52_noemail_{int(time.time())}", phone="+919888877777")
        inv = self._create_invoice(s, cust, svc)
        rec = inv.get("receipts") or {}
        assert rec.get("email"), f"email missing: {rec}"
        assert not rec["email"].get("sent")
        assert rec["email"].get("error") == "no_email", f"expected no_email got {rec['email']}"


# --- Morning briefing audio regression ---

class TestMorningBriefingAudio:
    def test_audio_endpoint_returns_text(self):
        s = _sess(ADMIN_EMAIL, ADMIN_PASS)
        r = s.get(f"{API}/reports/morning-briefing/audio")
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d, dict)
        # response must include text
        text = d.get("text") or d.get("transcript") or ""
        assert isinstance(text, str) and len(text) > 0, f"no text in response: {d}"

        # If IST hour is morning (< 12), assert Bhakti/Entertainment mention
        ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
        if ist.hour < 12:
            low = text.lower()
            assert ("bhakti" in low) or ("entertainment" in low), \
                f"expected Bhakti/Entertainment mention in morning briefing: {text[:400]}"
