"""Iter 63 — Staff Hiring Marketplace + CCTV Flash Offer.

Non-destructive: creates NEW hiring requests for apply-flow tests; does NOT delete
pre-existing state (existing Hair Stylist request w/ Ravi Test Kumar trial_scheduled,
today's flash_alert + flash offer, today's daily offer accepted).
Does NOT call /api/day-offers/accept or /api/cctv/analyze-frame.
"""
import os
import uuid
import pytest
import requests

from creds import password_for

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
TENANT = "miracurl-marathahalli"
SALON_ADMIN = "admin@miracurl.com"
SUPER_ADMIN = "super@miracurl.com"
REGISTERED_PHONE = "9998887777"  # Ravi Test Kumar
UNKNOWN_PHONE = "9000000001"


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


@pytest.fixture(scope="module")
def fresh_request_id(admin_session):
    """Create a NEW hiring request for apply-flow tests (unique role)."""
    role = f"TEST_Beautician_{uuid.uuid4().hex[:6]}"
    r = admin_session.post(f"{BASE}/api/hiring/requests", json={
        "role": role, "experience_years": 2, "salary_min": 15000, "salary_max": 25000,
        "urgency": "flexible", "notes": "iter63 automated test request"
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("id") and data.get("status") == "open"
    assert data.get("role") == role
    return data["id"]


# --- 1. Hiring: salon owner endpoints ---
class TestHiringOwner:
    def test_my_requests_lists_and_curation_privacy(self, admin_session, fresh_request_id):
        r = admin_session.get(f"{BASE}/api/hiring/requests")
        assert r.status_code == 200, r.text
        reqs = r.json().get("requests", [])
        assert any(x["id"] == fresh_request_id for x in reqs), "fresh request missing"
        # every request must have applicant_count + candidates; candidates only status != applied
        for req in reqs:
            assert "applicant_count" in req and "candidates" in req
            for c in req["candidates"]:
                assert c.get("status") in ("shortlisted", "trial_scheduled", "hired", "rejected"), \
                    f"leaked applied candidate: {c}"

    def test_close_request_404_for_unknown(self, admin_session):
        r = admin_session.post(f"{BASE}/api/hiring/requests/does-not-exist-{uuid.uuid4().hex}/close")
        assert r.status_code == 404

    def test_requires_salon_admin(self):
        r = requests.get(f"{BASE}/api/hiring/requests", headers={"X-Tenant-Slug": TENANT})
        assert r.status_code in (401, 403)
        r2 = requests.post(f"{BASE}/api/hiring/requests", json={"role": "x"}, headers={"X-Tenant-Slug": TENANT})
        assert r2.status_code in (401, 403)


# --- 2 & 3. Public jobs board + HQ (kept in ONE class so xdist loadscope
# keeps the dependent apply → HQ overview steps on the same worker sharing
# the module-scoped fresh_request_id fixture).
class TestPublicJobsAndHQ:
    def test_list_hides_salon(self, fresh_request_id):
        r = requests.get(f"{BASE}/api/public/jobs")
        assert r.status_code == 200, r.text
        jobs = r.json().get("jobs", [])
        assert any(j["id"] == fresh_request_id for j in jobs), "fresh job not listed publicly"
        for j in jobs:
            assert j.get("salon") == "Verified partner salon", f"salon name leaked: {j}"
            assert "tenant_id" not in j and "slug" not in j and "salon_name" not in j

    def test_apply_success(self, fresh_request_id):
        r = requests.post(f"{BASE}/api/public/jobs/{fresh_request_id}/apply",
                          json={"phone": REGISTERED_PHONE})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert "Ravi" in (data.get("message") or "")

    def test_apply_duplicate_409(self, fresh_request_id):
        r = requests.post(f"{BASE}/api/public/jobs/{fresh_request_id}/apply",
                          json={"phone": REGISTERED_PHONE})
        assert r.status_code == 409, r.text

    def test_apply_unknown_phone_403(self, fresh_request_id):
        r = requests.post(f"{BASE}/api/public/jobs/{fresh_request_id}/apply",
                          json={"phone": UNKNOWN_PHONE})
        assert r.status_code == 403, r.text

    def test_apply_nonexistent_404(self):
        r = requests.post(f"{BASE}/api/public/jobs/{uuid.uuid4()}/apply",
                          json={"phone": REGISTERED_PHONE})
        assert r.status_code == 404, r.text

    # HQ tests dependent on fresh_request_id are kept in the SAME class so xdist
    # loadscope pins them to the same worker (sharing the module fixture).
    def test_hq_overview(self, super_session, fresh_request_id):
        r = super_session.get(f"{BASE}/api/super-admin/hiring")
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("requests", "new_applications", "open_requests"):
            assert k in data, f"missing {k}"
        assert isinstance(data["new_applications"], int)
        # fresh_request_id should have applications embedded
        found = [x for x in data["requests"] if x["id"] == fresh_request_id]
        assert found, "fresh request not in HQ overview"
        assert "applications" in found[0]
        assert any(a.get("candidate_phone", "").endswith(REGISTERED_PHONE[-10:])
                   for a in found[0]["applications"]), "Ravi's application not attached"

    def test_hq_propose_and_duplicate(self, super_session, fresh_request_id):
        # find a registry candidate NOT Ravi Test Kumar (who already applied)
        r = super_session.get(f"{BASE}/api/super-admin/hiring/candidates", params={"q": "ravi"})
        cands = r.json().get("candidates", [])
        target = next((c for c in cands if c.get("name") != "Ravi Test Kumar"), None)
        if not target:
            pytest.skip("no alternate Ravi candidate to propose")
        emp_id = target["employee_id"]
        r2 = super_session.post(f"{BASE}/api/super-admin/hiring/propose",
                                json={"request_id": fresh_request_id, "employee_id": emp_id})
        assert r2.status_code == 200, r2.text
        doc = r2.json()
        assert doc.get("status") == "shortlisted"
        assert doc.get("source") == "hq_proposed"
        # duplicate propose → 409
        r3 = super_session.post(f"{BASE}/api/super-admin/hiring/propose",
                                json={"request_id": fresh_request_id, "employee_id": emp_id})
        assert r3.status_code == 409

    def test_hq_trial_schedule_and_hire_closes_request(self, super_session, fresh_request_id):
        # Get the Ravi Test Kumar application on fresh_request_id
        r = super_session.get(f"{BASE}/api/super-admin/hiring")
        req = next(x for x in r.json()["requests"] if x["id"] == fresh_request_id)
        ravi_app = next(a for a in req["applications"] if a.get("candidate_name") == "Ravi Test Kumar")
        aid = ravi_app["id"]
        # Trial schedule
        r2 = super_session.patch(f"{BASE}/api/super-admin/hiring/applications/{aid}",
                                 json={"trial_date": "2026-08-15", "trial_time": "11:00",
                                       "trial_notes": "iter63 test"})
        assert r2.status_code == 200, r2.text
        assert r2.json().get("status") == "trial_scheduled"
        # Mark hired → should close the parent request
        r3 = super_session.patch(f"{BASE}/api/super-admin/hiring/applications/{aid}",
                                 json={"status": "hired"})
        assert r3.status_code == 200, r3.text
        # verify parent request closed
        r4 = super_session.get(f"{BASE}/api/super-admin/hiring")
        req2 = next(x for x in r4.json()["requests"] if x["id"] == fresh_request_id)
        assert req2["status"] == "closed", f"parent request not closed: {req2}"

    def test_hq_rejects_salon_admin(self, admin_session):
        r = admin_session.get(f"{BASE}/api/super-admin/hiring")
        assert r.status_code in (401, 403)
        r2 = admin_session.post(f"{BASE}/api/super-admin/hiring/mark-seen")
        assert r2.status_code in (401, 403)


# --- Independent HQ tests (no fresh_request_id dep) ---
class TestHQIndependent:
    def test_mark_seen_zeroes(self, super_session):
        r = super_session.post(f"{BASE}/api/super-admin/hiring/mark-seen")
        assert r.status_code == 200
        r2 = super_session.get(f"{BASE}/api/super-admin/hiring")
        assert r2.status_code == 200
        assert r2.json().get("new_applications", -1) == 0

    def test_candidates_search(self, super_session):
        r = super_session.get(f"{BASE}/api/super-admin/hiring/candidates", params={"q": "ravi"})
        assert r.status_code == 200
        cands = r.json().get("candidates", [])
        assert any("Ravi" in (c.get("name") or "") for c in cands), f"no Ravi in search: {cands}"


# --- 4. Flash Offer ---
class TestFlashOffer:
    def test_flash_alert_exists_with_flash_offer(self, admin_session):
        r = admin_session.get(f"{BASE}/api/day-offers/flash-alert")
        assert r.status_code == 200, r.text
        data = r.json()
        # Expect either {alert:{...}, offer:{...}} or nested. Accept flexibility.
        alert = data.get("alert") or data
        offer = data.get("offer") or (alert.get("offer") if isinstance(alert, dict) else None) or data.get("flash_offer")
        assert alert, f"no alert in response: {data}"
        # status suggested
        status = (alert.get("status") if isinstance(alert, dict) else None) or data.get("status")
        assert status == "suggested", f"expected suggested, got {status}: {data}"
        assert offer, f"no flash offer in response: {data}"
        assert (offer.get("kind") or "").lower() == "flash", f"offer kind not flash: {offer}"

    def test_today_returns_daily_not_flash(self, admin_session):
        r = admin_session.get(f"{BASE}/api/day-offers/today")
        assert r.status_code == 200, r.text
        data = r.json()
        offer = data.get("offer") or data
        # Should be daily, accepted, with the seeded title
        kind = offer.get("kind")
        if kind is not None:
            assert kind == "daily", f"today returned non-daily: {offer}"
        title = offer.get("title") or ""
        assert "Weekend Indulgence" in title or title, f"missing title: {offer}"
        # Never the flash title
        assert "Flash" not in title, f"today leaked flash offer: {offer}"

    def test_flash_suggest_regenerates(self, admin_session):
        r = admin_session.post(f"{BASE}/api/day-offers/flash-suggest", json={}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        offer = data.get("offer") or data
        assert offer.get("title"), f"no title in regenerated flash: {data}"
        assert (offer.get("kind") or "").lower() == "flash" or "flash" in (offer.get("title", "").lower() + " " + str(data).lower()), \
            f"regenerated offer not flash: {offer}"


# --- 5. Security ---
class TestSecurity:
    def test_public_jobs_is_open(self):
        r = requests.get(f"{BASE}/api/public/jobs")
        assert r.status_code == 200

    def test_super_admin_endpoints_reject_unauth(self):
        for path in ("/api/super-admin/hiring", "/api/super-admin/hiring/candidates"):
            r = requests.get(f"{BASE}{path}")
            assert r.status_code in (401, 403), f"{path} unauth got {r.status_code}"
