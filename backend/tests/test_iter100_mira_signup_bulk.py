"""Iteration 100 — Mira lead intent + password policy + CRM bulk delete."""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")

SA_EMAIL = "admin@miracurl-suite.com"
SA_PASS = "og9T@41Es#OQb6"
SALON_EMAIL = "admin@miracurl.com"
SALON_PASS = "q6QY@tn3p#9DtL"
SALON_SLUG = "miracurl-marathahalli"
T2_EMAIL = "owner@elegance.com"
T2_PASS = "Owner@123"
T2_SLUG = "elegance-koramangala"


def _login(email, password, slug=None):
    s = requests.Session()
    h = {"Content-Type": "application/json"}
    if slug:
        h["X-Tenant-Slug"] = slug
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, headers=h, timeout=20)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    csrf = s.cookies.get("csrf_token")
    s.headers.update({"X-CSRF-Token": csrf or "", "Content-Type": "application/json"})
    if slug:
        s.headers["X-Tenant-Slug"] = slug
    return s


# ---------- Mira lead intent ----------
class TestMiraLeadIntent:
    def test_rescore_intent(self):
        s = _login(SA_EMAIL, SA_PASS)
        r = s.post(f"{BASE}/api/super-admin/mira-leads/rescore-intent", timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        counts = d.get("counts") or {}
        for k in ("HOT", "WARM", "COLD"):
            assert k in counts
            assert isinstance(counts[k], int)

    def test_leads_have_profile(self):
        s = _login(SA_EMAIL, SA_PASS)
        r = s.get(f"{BASE}/api/super-admin/mira-leads?limit=200", timeout=30)
        assert r.status_code == 200
        leads = r.json()
        if isinstance(leads, dict):
            leads = leads.get("leads") or leads.get("items") or []
        assert isinstance(leads, list) and len(leads) > 0, "need at least one lead"
        bad = []
        for ld in leads[:50]:
            if ld.get("intent") not in ("HOT", "WARM", "COLD"):
                bad.append(("intent", ld.get("id"), ld.get("intent")))
            if not isinstance(ld.get("intent_reasons"), list):
                bad.append(("intent_reasons", ld.get("id")))
            if not isinstance(ld.get("current_software"), str):
                bad.append(("current_software", ld.get("id"), type(ld.get("current_software")).__name__))
            if not isinstance(ld.get("locations_count"), int) or ld["locations_count"] < 1:
                bad.append(("locations_count", ld.get("id"), ld.get("locations_count")))
            if not isinstance(ld.get("team_size"), int) or ld["team_size"] < 0:
                bad.append(("team_size", ld.get("id"), ld.get("team_size")))
            for f in ("whatsapp", "public_email", "country"):
                if not isinstance(ld.get(f), str):
                    bad.append((f, ld.get("id"), type(ld.get(f)).__name__))
        assert not bad, f"profile fields invalid: {bad[:10]}"


# ---------- Password policy ----------
class TestPasswordPolicy:
    def test_signup_weak_password(self):
        r = requests.post(f"{BASE}/api/public/signup-salon", json={
            "salon_name": "TEST_WeakPW Salon",
            "owner_name": "Test",
            "owner_email": "TEST_weakpw_check@example.com",
            "password": "weakpassword",
        }, timeout=20)
        assert r.status_code == 400, f"got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        assert detail.startswith("Password needs"), f"detail={detail}"

    def test_reset_weak_password(self):
        r = requests.post(f"{BASE}/api/auth/reset-password",
                          json={"token": "x", "new_password": "weak"}, timeout=20)
        assert r.status_code == 400
        detail = r.json().get("detail", "")
        assert detail.startswith("Password needs"), f"detail={detail}"

    def test_reset_strong_bad_token(self):
        r = requests.post(f"{BASE}/api/auth/reset-password",
                          json={"token": "nonexistent-token-xyz", "new_password": "Strong#Pass1"}, timeout=20)
        assert r.status_code == 400
        detail = r.json().get("detail", "")
        assert "Invalid" in detail or "used" in detail, f"detail={detail}"


# ---------- CRM bulk delete ----------
class TestBulkDelete:
    def test_bulk_delete_scoped(self):
        s1 = _login(SALON_EMAIL, SALON_PASS, SALON_SLUG)
        # create two throwaway customers
        ids = []
        for i in range(2):
            # unique phones to avoid dedupe
            phone = f"98{i}5551{(os.getpid() % 10000):04d}"
            r = s1.post(f"{BASE}/api/customers",
                        json={"name": f"TEST_bulk_{i}", "phone": phone},
                        timeout=20)
            assert r.status_code in (200, 201), f"create {i}: {r.status_code} {r.text}"
            ids.append(r.json()["id"])

        # tenant 2 attempts shouldn't delete our ids
        s2 = _login(T2_EMAIL, T2_PASS, T2_SLUG)
        r2 = s2.post(f"{BASE}/api/customers/bulk-delete", json={"ids": ids}, timeout=20)
        assert r2.status_code == 200, r2.text
        assert r2.json().get("deleted", -1) == 0, f"cross-tenant deleted: {r2.json()}"

        # own tenant should delete both
        r = s1.post(f"{BASE}/api/customers/bulk-delete", json={"ids": ids}, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        assert d.get("deleted") == 2, f"expected 2 deleted got {d}"

        # verify gone
        for cid in ids:
            g = s1.get(f"{BASE}/api/customers/{cid}", timeout=20)
            assert g.status_code == 404, f"customer {cid} still exists"

    def test_bulk_delete_empty_422(self):
        s1 = _login(SALON_EMAIL, SALON_PASS, SALON_SLUG)
        r = s1.post(f"{BASE}/api/customers/bulk-delete", json={"ids": []}, timeout=20)
        assert r.status_code == 422, f"expected 422 got {r.status_code}: {r.text}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
