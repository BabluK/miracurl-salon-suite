"""Iteration 157 — HQ tenant features (SMS/WhatsApp/Campaign), onboarding, HQ guardrails, agreement consents, gating."""
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests
import os as _os
import sys as _sys

_sys.path.insert(0, _os.path.dirname(__file__))
from _creds import password_for  # noqa: E402
from _creds import pw

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")

TENANT_EMAIL = "admin@miracurl.com"
TENANT_PW = password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD")
TENANT_SLUG = "miracurl-marathahalli"
SUPER_EMAIL = "super@miracurl.com"
SUPER_PW = pw("SUPER_ADMIN")


def _login(email, pw, slug=None):
    s = requests.Session()
    h = {"Content-Type": "application/json"}
    if slug:
        h["X-Tenant-Slug"] = slug
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw}, headers=h)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text[:200]}"
    csrf = s.cookies.get("csrf_token") or ""
    s.headers.update({"X-CSRF-Token": csrf})
    if slug:
        s.headers.update({"X-Tenant-Slug": slug})
    return s


@pytest.fixture(scope="module")
def hq():
    return _login(SUPER_EMAIL, SUPER_PW)


@pytest.fixture(scope="module")
def owner():
    return _login(TENANT_EMAIL, TENANT_PW, TENANT_SLUG)


@pytest.fixture(scope="module")
def mira_tid(hq):
    r = hq.get(f"{BASE}/api/super-admin/tenants")
    assert r.status_code == 200
    body = r.json()
    rows = body if isinstance(body, list) else body.get("tenants") or body.get("rows") or body.get("items") or []
    tid = next((t["id"] for t in rows if t.get("slug") == TENANT_SLUG), None)
    assert tid, f"tenant {TENANT_SLUG} not found; rows sample: {rows[:2]}"
    return tid


# ---------------- 1. Super Admin Features (sms/whatsapp/campaign) ----------------
class TestSaFeatures:
    def test_get_features_shape(self, hq, mira_tid):
        r = hq.get(f"{BASE}/api/super-admin/tenants/{mira_tid}/features")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("sms", "whatsapp", "support_access", "campaign", "agreement", "onboarding"):
            assert k in d, f"missing {k}"
        for k in ("on", "manual", "plan_ok"):
            assert k in d["campaign"], f"campaign missing {k}"

    def test_toggle_sms_flip_and_audit(self, hq, owner, mira_tid):
        # OFF
        r = hq.put(f"{BASE}/api/super-admin/tenants/{mira_tid}/features", json={"sms": False})
        assert r.status_code == 200, r.text
        assert r.json()["sms"] is False
        # ON
        r = hq.put(f"{BASE}/api/super-admin/tenants/{mira_tid}/features", json={"sms": True})
        assert r.status_code == 200
        assert r.json()["sms"] is True
        # audit log has hq_features rows
        al = owner.get(f"{BASE}/api/settings/audit-log")
        assert al.status_code == 200
        rows = al.json() if isinstance(al.json(), list) else al.json().get("rows") or al.json().get("items") or []
        assert any(r.get("action") == "hq_features" for r in rows), f"no hq_features audit row; sample: {rows[:3]}"


# ---------------- 2. Onboarding ----------------
class TestOnboarding:
    def test_full_cycle_end_live(self, hq, owner, mira_tid):
        call_at = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%dT%H:%M")
        # schedule
        r = hq.put(f"{BASE}/api/super-admin/rewards-campaign/onboarding/{mira_tid}",
                   json={"action": "schedule", "call_at": call_at, "notes": "test"})
        assert r.status_code == 200, r.text
        assert r.json()["onboarding"]["status"] == "call_scheduled"
        # call_done
        r = hq.put(f"{BASE}/api/super-admin/rewards-campaign/onboarding/{mira_tid}", json={"action": "call_done"})
        assert r.status_code == 200
        assert r.json()["onboarding"]["status"] == "call_done"
        # pause
        r = hq.put(f"{BASE}/api/super-admin/rewards-campaign/onboarding/{mira_tid}", json={"action": "pause"})
        assert r.status_code == 200
        assert r.json()["onboarding"]["live"] is False
        # while paused → poster forbidden
        r = owner.get(f"{BASE}/api/settings/rewards-qr-poster.png")
        assert r.status_code == 403, f"expected 403 while paused, got {r.status_code}"
        # go_live
        r = hq.put(f"{BASE}/api/super-admin/rewards-campaign/onboarding/{mira_tid}", json={"action": "go_live"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["onboarding"]["live"] is True
        # poster now 200
        r = owner.get(f"{BASE}/api/settings/rewards-qr-poster.png")
        assert r.status_code == 200, f"expected 200 when live, got {r.status_code} {r.text[:200]}"

    def test_onboarding_list(self, hq, mira_tid):
        r = hq.get(f"{BASE}/api/super-admin/rewards-campaign/onboarding")
        assert r.status_code == 200
        items = r.json()["items"]
        m = next((x for x in items if x["tenant_id"] == mira_tid), None)
        assert m is not None
        assert m.get("tenant", {}).get("slug") == TENANT_SLUG
        assert "acceptance" in m


# ---------------- 3. Agreement consents ----------------
class TestAgreementConsents:
    def test_missing_share_consent_rejected(self, owner):
        # tenant already accepted → server should still reject missing consents OR "already accepted"
        r = owner.post(f"{BASE}/api/settings/rewards-campaign/agreement/accept",
                       json={"full_name": "Ravi Kumar", "designation": "Owner",
                             "agree": True, "agree_share": False, "agree_visibility": True})
        assert r.status_code == 400, r.text
        msg = r.text.lower()
        assert "consent" in msg or "already accepted" in msg, r.text

    def test_agreement_includes_onboarding(self, owner):
        r = owner.get(f"{BASE}/api/settings/rewards-campaign/agreement")
        assert r.status_code == 200
        d = r.json()
        assert "onboarding" in d
        assert d["onboarding"].get("live") in (True, False)  # exact value asserted in TestOnboarding


# ---------------- 4. Campaign flag flow on a DIFFERENT tenant ----------------
class TestCampaignFlagFlow:
    def test_campaign_on_off_cycle(self, hq):
        r = hq.get(f"{BASE}/api/super-admin/tenants")
        rows = r.json() if isinstance(r.json(), list) else r.json().get("tenants") or r.json().get("rows") or []
        target = None
        for t in rows:
            if t.get("slug") == TENANT_SLUG:
                continue
            f = hq.get(f"{BASE}/api/super-admin/tenants/{t['id']}/features")
            if f.status_code != 200:
                continue
            d = f.json()
            if not d["campaign"]["on"] and d["campaign"]["plan_ok"]:
                target = (t["id"], t.get("slug"))
                break
        if not target:
            pytest.skip("no eligible non-campaign tenant available")
        tid, slug = target
        # ON
        r = hq.put(f"{BASE}/api/super-admin/tenants/{tid}/features", json={"campaign": "on"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("invite") is not None, "expected invite payload when flipping ON"
        assert d["onboarding"]["status"] == "invited"
        # OFF
        r = hq.put(f"{BASE}/api/super-admin/tenants/{tid}/features", json={"campaign": "off"})
        assert r.status_code == 200
        assert r.json()["onboarding"]["status"] == "off"
        # restore auto
        r = hq.put(f"{BASE}/api/super-admin/tenants/{tid}/features", json={"campaign": "auto"})
        assert r.status_code == 200


# ---------------- 5. HQ Guardrails (support_access, X-Tenant-Slug) ----------------
class TestHqGuardrails:
    def test_guard_403_when_owner_disables(self, hq, owner):
        # owner disable
        r = owner.put(f"{BASE}/api/settings/support-access", json={"enabled": False})
        assert r.status_code == 200, r.text
        assert r.json()["support_access"] is False
        # HQ tries tenant-scoped call with slug header → 403
        r = hq.get(f"{BASE}/api/tenants/current", headers={"X-Tenant-Slug": TENANT_SLUG})
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text[:200]}"
        assert "support" in r.text.lower() or "access" in r.text.lower()
        # re-enable
        r = owner.put(f"{BASE}/api/settings/support-access", json={"enabled": True})
        assert r.status_code == 200 and r.json()["support_access"] is True

    def test_hq_write_logs_audit_and_notice(self, hq, owner):
        since = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        # HQ GET (must succeed with support on)
        r = hq.get(f"{BASE}/api/tenants/current", headers={"X-Tenant-Slug": TENANT_SLUG})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "features" in d or "support_access" in d
        # HQ PUT tenant-scoped (harmless: wa-auto-reply)
        r = hq.put(f"{BASE}/api/sms-packs/wa-auto-reply",
                   headers={"X-Tenant-Slug": TENANT_SLUG},
                   json={"enabled": True})
        # accept 200 or 404 (endpoint may vary) but not 5xx
        assert r.status_code < 500, r.text
        time.sleep(1)
        # audit log has hq_edit / Miracurl Support actor
        al = owner.get(f"{BASE}/api/settings/audit-log")
        rows = al.json() if isinstance(al.json(), list) else al.json().get("rows") or al.json().get("items") or []
        hq_rows = [x for x in rows if x.get("action") == "hq_edit" or (x.get("actor") or "").lower().startswith("miracurl support")]
        assert hq_rows, f"no hq_edit row; sample: {rows[:5]}"
        # bell hq_access
        n = owner.get(f"{BASE}/api/notifications/new-bookings", params={"since": since})
        assert n.status_code == 200, n.text
        notes = n.json() if isinstance(n.json(), list) else n.json().get("notices") or n.json().get("items") or n.json().get("notifications") or []
        assert any((x.get("kind") == "hq_access") for x in notes), f"no hq_access notice; sample: {notes[:3]}"


# ---------------- 6. Gating shape ----------------
class TestGating:
    def test_sms_packs_includes_features(self, owner):
        r = owner.get(f"{BASE}/api/sms-packs", params={"channel": "whatsapp"})
        assert r.status_code == 200, r.text
        d = r.json()
        f = d.get("features") or {}
        assert f.get("sms") is True
        assert f.get("whatsapp") is True

    def test_tenants_current_includes_features(self, owner):
        r = owner.get(f"{BASE}/api/tenants/current")
        assert r.status_code == 200
        d = r.json()
        assert "features" in d
        assert "support_access" in d
