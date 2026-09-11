"""Iteration 133 — Razorpay auto pay-link + trusted badge + salon_share_pct."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
SUPER_EMAIL = "super@miracurl.com"
SUPER_PW = "og9T@41Es#OQb6"
TENANT_EMAIL = "admin@miracurl.com"
TENANT_PW = "q6QY@tn3p#9DtL"
TENANT_SLUG = "miracurl-marathahalli"


def _login(session, email, password, tenant_slug=None):
    headers = {"Content-Type": "application/json"}
    if tenant_slug:
        headers["X-Tenant-Slug"] = tenant_slug
    r = session.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, headers=headers)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:200]}"
    csrf = session.cookies.get("csrf_token") or ""
    session.headers.update({"X-CSRF-Token": csrf})
    if tenant_slug:
        session.headers.update({"X-Tenant-Slug": tenant_slug})
    return session


@pytest.fixture(scope="module")
def sa():
    s = requests.Session()
    return _login(s, SUPER_EMAIL, SUPER_PW)


@pytest.fixture(scope="module")
def tenant_sess():
    s = requests.Session()
    return _login(s, TENANT_EMAIL, TENANT_PW, TENANT_SLUG)


@pytest.fixture(scope="module")
def marathahalli_id(sa):
    r = sa.get(f"{BASE_URL}/api/super-admin/rewards-campaign/settlements")
    assert r.status_code == 200
    for row in r.json()["rows"]:
        if row["slug"] == TENANT_SLUG:
            return row["tenant_id"]
    pytest.skip("marathahalli tenant not found in settlements")


class TestSettlementsList:
    def test_list_has_rzp_and_share_pct(self, sa):
        r = sa.get(f"{BASE_URL}/api/super-admin/rewards-campaign/settlements")
        assert r.status_code == 200
        data = r.json()
        assert data["rzp_enabled"] is True
        assert data["rzp_key"].startswith("rzp_"), data["rzp_key"]
        assert data["salon_share_pct"] == 10
        assert isinstance(data["rows"], list) and len(data["rows"]) > 0
        row = data["rows"][0]
        for k in ["email", "public_url", "suggested", "pay_url", "trusted"]:
            assert k in row, f"missing {k}"
        assert row["public_url"].endswith(f"/rewards/{row['slug']}")
        sug = row["suggested"]
        for k in ["amount", "pct", "revenue", "bills", "eligible_bills", "breakdown"]:
            assert k in sug
        assert sug["pct"] == 10


class TestSettlementPutRzpLink:
    def test_put_creates_link_and_reuses(self, sa, marathahalli_id):
        body = {"amount": 4000, "due_date": "2026-09-30", "note": "10% of campaign earnings"}
        r = sa.put(f"{BASE_URL}/api/super-admin/rewards-campaign/settlements/{marathahalli_id}", json=body)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ok"] and j["status"] == "pending"
        assert j["pay_url"].startswith("https://rzp.io/"), j
        first_url = j["pay_url"]

        # list should reflect same URL
        lst = sa.get(f"{BASE_URL}/api/super-admin/rewards-campaign/settlements").json()
        row = next(x for x in lst["rows"] if x["tenant_id"] == marathahalli_id)
        assert row["pay_url"] == first_url

        # Second identical PUT → reuse
        r2 = sa.put(f"{BASE_URL}/api/super-admin/rewards-campaign/settlements/{marathahalli_id}", json=body)
        assert r2.status_code == 200
        assert r2.json()["pay_url"] == first_url, "pay link should be reused for same amount"

    def test_invalid_payment_link_422(self, sa):
        # Get current campaign
        c = sa.get(f"{BASE_URL}/api/super-admin/rewards-campaign").json()
        body = dict(c)
        # remove read-only extras that may not be in schema
        for k in ["rzp_enabled", "rzp_key", "id", "created_at", "updated_at"]:
            body.pop(k, None)
        body["payment_link"] = "rzp_live_abc"
        r = sa.put(f"{BASE_URL}/api/super-admin/rewards-campaign", json=body)
        assert r.status_code == 422, f"expected 422 for non-URL payment_link, got {r.status_code} {r.text[:200]}"


class TestCampaignSharePct:
    def test_get_campaign_has_rzp_and_share_pct(self, sa):
        r = sa.get(f"{BASE_URL}/api/super-admin/rewards-campaign")
        assert r.status_code == 200
        j = r.json()
        assert j.get("rzp_enabled") is True
        assert j.get("rzp_key", "").startswith("rzp_")
        assert j.get("salon_share_pct") == 10

    def test_update_share_pct_and_revert(self, sa):
        c = sa.get(f"{BASE_URL}/api/super-admin/rewards-campaign").json()
        body = {k: v for k, v in c.items() if k not in ("rzp_enabled", "rzp_key", "id", "created_at", "updated_at")}
        body["salon_share_pct"] = 12
        r = sa.put(f"{BASE_URL}/api/super-admin/rewards-campaign", json=body)
        assert r.status_code == 200, r.text

        s = sa.get(f"{BASE_URL}/api/super-admin/rewards-campaign/settlements").json()
        assert s["salon_share_pct"] == 12
        assert all(row["suggested"]["pct"] == 12 for row in s["rows"])

        # revert
        body["salon_share_pct"] = 10
        r = sa.put(f"{BASE_URL}/api/super-admin/rewards-campaign", json=body)
        assert r.status_code == 200


class TestMarkPaidTrustedBadge:
    def test_mark_paid_sets_trusted_and_public_shows_it(self, sa, marathahalli_id):
        r = sa.post(f"{BASE_URL}/api/super-admin/rewards-campaign/settlements/{marathahalli_id}/mark-paid",
                    json={"method": "upi", "ref": "T1"})
        assert r.status_code == 200
        j = r.json()
        assert j["ok"] and j["trusted"] is True

        # Public salon page
        pub = requests.get(f"{BASE_URL}/api/public/salon/{TENANT_SLUG}")
        assert pub.status_code == 200
        tb = pub.json().get("trusted_badge")
        assert tb is not None
        assert tb.get("label") == "Trusted by Miracurl"
        assert "campaign_id" in tb and "since" in tb

        # Partners list
        pr = requests.get(f"{BASE_URL}/api/public/partners")
        assert pr.status_code == 200
        partners = pr.json() if isinstance(pr.json(), list) else pr.json().get("partners") or pr.json().get("items") or []
        mc = [p for p in partners if "Miracurl Unisex Family" in (p.get("name") or "") or p.get("slug") == TENANT_SLUG]
        assert mc, f"marathahalli not in partners: {[p.get('name') for p in partners][:8]}"
        assert mc[0].get("trusted") is True

        # Public salons search
        sr = requests.get(f"{BASE_URL}/api/public/salons", params={"q": "miracurl"})
        assert sr.status_code == 200
        data = sr.json()
        salons = data if isinstance(data, list) else data.get("salons") or data.get("items") or []
        found = [s for s in salons if s.get("slug") == TENANT_SLUG]
        assert found and found[0].get("trusted_badge"), "trusted_badge missing in /api/public/salons"

    def test_reopen_removes_trusted(self, sa, marathahalli_id):
        r = sa.post(f"{BASE_URL}/api/super-admin/rewards-campaign/settlements/{marathahalli_id}/reopen")
        assert r.status_code == 200 and r.json()["ok"]
        pub = requests.get(f"{BASE_URL}/api/public/salon/{TENANT_SLUG}").json()
        assert pub.get("trusted_badge") in (None, {}, "")

    def test_leave_pending_final_state(self, sa, marathahalli_id):
        # Re-PUT to ensure pending 4000 stays
        body = {"amount": 4000, "due_date": "2026-09-30", "note": "10% of campaign earnings"}
        r = sa.put(f"{BASE_URL}/api/super-admin/rewards-campaign/settlements/{marathahalli_id}", json=body)
        assert r.status_code == 200
        assert r.json()["status"] == "pending"


class TestTenantSettlement:
    def test_tenant_sees_pay_url(self, tenant_sess):
        r = tenant_sess.get(f"{BASE_URL}/api/settings/rewards-campaign")
        assert r.status_code == 200, r.text
        j = r.json()
        s = j.get("settlement") or {}
        assert s.get("pay_url", "").startswith("https://rzp.io/"), f"expected rzp.io pay_url, got {s}"
        assert s.get("trusted") is False
