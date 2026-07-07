"""Iter 10 – Review-request blast endpoint regression.

Covers GET /api/reviews/blast-targets:
- 401 unauthenticated
- Tenant-scoped (admin login works, shape contract)
- Populates after creating a completed appointment without a review
"""
import os
import uuid
import requests
import pytest
from datetime import datetime, timezone
from creds import password_for

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL",
                          "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
TENANT_SLUG = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = password_for("admin@miracurl.com")


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-Slug": TENANT_SLUG})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"login failed: {r.text}"
    token = r.cookies.get("access_token") or r.json().get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


class TestBlastTargetsAuth:
    def test_unauth_401(self):
        r = requests.get(f"{BASE_URL}/api/reviews/blast-targets")
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}: {r.text[:200]}"


class TestBlastTargetsShape:
    def test_authenticated_returns_contract(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/reviews/blast-targets")
        assert r.status_code == 200, f"status {r.status_code}: {r.text[:200]}"
        body = r.json()
        assert isinstance(body, dict)
        assert "count" in body and isinstance(body["count"], int)
        assert "targets" in body and isinstance(body["targets"], list)
        assert body["count"] == len(body["targets"])
        # Validate row shape if any rows present
        for t in body["targets"]:
            for k in ("appointment_id", "customer_id", "customer_name",
                      "phone", "service_names", "scheduled_at"):
                assert k in t, f"missing key {k} in target row"
            assert isinstance(t["service_names"], list)
            assert t["phone"], "phone must be non-empty"


class TestBlastTargetsPopulation:
    """Create a booking → mark completed → ensure it appears in blast-targets."""

    def test_completed_appt_appears(self, admin_session):
        # 1. Public booking to create customer+appointment
        # Discover a service id
        sv = admin_session.get(f"{BASE_URL}/api/services").json()
        if not sv:
            pytest.skip("no services to book")
        svc_id = sv[0]["id"]
        phone_digits = "9000" + str(uuid.uuid4().int)[:6]
        booking_payload = {
            "customer_name": f"TEST_Blast_{uuid.uuid4().hex[:6]}",
            "customer_phone": phone_digits,
            "service_ids": [svc_id],
            "scheduled_at": datetime.now(timezone.utc).isoformat(),
        }
        r = requests.post(f"{BASE_URL}/api/public/book/{TENANT_SLUG}", json=booking_payload)
        if r.status_code in (409, 429):
            pytest.skip(f"public endpoint saturated: {r.status_code} {r.text[:120]}")
        assert r.status_code in (200, 201), f"booking failed {r.status_code}: {r.text[:300]}"
        body = r.json()
        appt_id = (body.get("appointment_id")
                   or body.get("id")
                   or (body.get("appointment") or {}).get("id"))
        assert appt_id, f"no appointment id in response: {body}"

        # 2. Mark completed via PUT /api/appointments/{id}
        upd = admin_session.put(f"{BASE_URL}/api/appointments/{appt_id}/status",
                                json={"status": "completed"})
        assert upd.status_code in (200, 204), f"status update failed {upd.status_code}: {upd.text[:200]}"

        # 3. Blast-targets should include it
        r = admin_session.get(f"{BASE_URL}/api/reviews/blast-targets")
        assert r.status_code == 200
        ids = [t["appointment_id"] for t in r.json()["targets"]]
        assert appt_id in ids, f"appointment {appt_id} missing from blast-targets (got {len(ids)} targets)"
        row = next(t for t in r.json()["targets"] if t["appointment_id"] == appt_id)
        assert row["phone"]  # came through customer join
        assert row["customer_name"].startswith("TEST_Blast_")
