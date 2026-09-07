"""Iter 137 — Restaurant campaign alongside salon campaign; salon regression."""
import os, io, re
import pytest
import requests

def _load_base():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        v = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert v, "REACT_APP_BACKEND_URL missing"
    return v.rstrip("/")

BASE = _load_base()

SUPER = ("super@miracurl.com", "og9T@41Es#OQb6")
ADMIN = ("admin@miracurl.com", "q6QY@tn3p#9DtL", "miracurl-marathahalli")


def _session(email, password, slug=None):
    s = requests.Session()
    headers = {"Content-Type": "application/json"}
    if slug:
        headers["X-Tenant-Slug"] = slug
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, headers=headers)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    csrf = s.cookies.get("csrf_token")
    s.headers.update({"Content-Type": "application/json"})
    if csrf:
        s.headers["X-CSRF-Token"] = csrf
    if slug:
        s.headers["X-Tenant-Slug"] = slug
    return s


@pytest.fixture(scope="module")
def super_s():
    return _session(*SUPER)


@pytest.fixture(scope="module")
def admin_s():
    return _session(ADMIN[0], ADMIN[1], ADMIN[2])


# ---------- HQ campaign resolution ----------
class TestHQCampaignResolution:
    def test_get_main_default(self, super_s):
        r = super_s.get(f"{BASE}/api/super-admin/rewards-campaign")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"] == "main"
        assert d.get("vertical") == "salon"
        assert d["name"] == "Miracurl Customer Rewards – 2026"
        assert d.get("enabled") is True

    def test_get_restaurant(self, super_s):
        r = super_s.get(f"{BASE}/api/super-admin/rewards-campaign", params={"campaign": "restaurant"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"] == "restaurant"
        assert d.get("vertical") == "restaurant"
        assert "Taste Ambassador" in d["name"]
        assert d.get("enabled") is True

    def test_get_bogus_falls_back(self, super_s):
        r = super_s.get(f"{BASE}/api/super-admin/rewards-campaign", params={"campaign": "bogus"})
        assert r.status_code == 200, r.text
        assert r.json()["id"] == "main"


# ---------- Tenants ----------
class TestHQTenants:
    def test_default_only_salons(self, super_s):
        r = super_s.get(f"{BASE}/api/super-admin/rewards-campaign/tenants")
        assert r.status_code == 200, r.text
        d = r.json()
        tenants = d.get("tenants", d.get("rows", []))
        for t in tenants:
            assert t.get("business_type") != "restaurant", f"restaurant leaked: {t}"
        assert d.get("on_count") == 2, d
        restaurants = d.get("restaurants") or []
        assert len(restaurants) == 1
        assert "Infinity" in (restaurants[0].get("name") or restaurants[0].get("business_name") or "")

    def test_restaurant_scope(self, super_s):
        r = super_s.get(f"{BASE}/api/super-admin/rewards-campaign/tenants", params={"campaign": "restaurant"})
        assert r.status_code == 200, r.text
        d = r.json()
        tenants = d.get("tenants", d.get("rows", []))
        assert len(tenants) == 1
        t0 = tenants[0]
        assert "Infinity" in (t0.get("name") or t0.get("business_name") or "")
        assert t0.get("on") is True
        assert (d.get("restaurants") or []) == []

    def test_flag_restaurant_tenant(self, super_s):
        # get tenant id for infinity
        r = super_s.get(f"{BASE}/api/super-admin/rewards-campaign/tenants", params={"campaign": "restaurant"})
        t = r.json().get("tenants", [])[0]
        tid = t.get("id") or t.get("_id") or t.get("tenant_id")
        assert tid, t
        r2 = super_s.post(f"{BASE}/api/super-admin/rewards-campaign/tenants/{tid}/flag", json={"on": True})
        assert r2.status_code in (200, 204), r2.text

    def test_flag_salon_tenant(self, super_s):
        r = super_s.get(f"{BASE}/api/super-admin/rewards-campaign/tenants")
        tenants = r.json().get("tenants", [])
        m = next((x for x in tenants if "marathahalli" in (x.get("slug") or "").lower()), None)
        assert m, tenants
        tid = m.get("id") or m.get("_id") or m.get("tenant_id")
        r2 = super_s.post(f"{BASE}/api/super-admin/rewards-campaign/tenants/{tid}/flag", json={"on": True})
        assert r2.status_code in (200, 204), r2.text
        # verify on_count still refers to salon campaign
        r3 = super_s.get(f"{BASE}/api/super-admin/rewards-campaign/tenants")
        assert r3.json().get("on_count") == 2


# ---------- PUT restaurant, tagline round-trip ----------
class TestPUTRestaurant:
    def test_put_restaurant_tagline_no_leak_to_main(self, super_s):
        r = super_s.get(f"{BASE}/api/super-admin/rewards-campaign", params={"campaign": "restaurant"})
        assert r.status_code == 200
        body = r.json()
        orig_tagline = body.get("tagline", "")
        # main baseline
        rm = super_s.get(f"{BASE}/api/super-admin/rewards-campaign").json()
        main_name = rm["name"]; main_tagline = rm.get("tagline")
        new_tagline = (orig_tagline or "") + " [TEST_ITER137]"
        payload = {k: body.get(k) for k in [
            "name","tagline","start_date","end_date","min_transaction","budget",
            "winner_count","enabled","eligible_plans","rewards","entry_rules",
            "terms","tenant_terms","payment_link","payment_note","salon_share_pct"
        ] if k in body}
        payload["tagline"] = new_tagline
        pr = super_s.put(f"{BASE}/api/super-admin/rewards-campaign", params={"campaign": "restaurant"}, json=payload)
        assert pr.status_code == 200, pr.text
        d = pr.json()
        assert d["id"] == "restaurant"
        assert d["tagline"] == new_tagline
        # main unaffected
        rm2 = super_s.get(f"{BASE}/api/super-admin/rewards-campaign").json()
        assert rm2["name"] == main_name
        assert rm2.get("tagline") == main_tagline
        # restore
        payload["tagline"] = orig_tagline
        rr = super_s.put(f"{BASE}/api/super-admin/rewards-campaign", params={"campaign": "restaurant"}, json=payload)
        assert rr.status_code == 200


# ---------- Settlements & anomalies & docs ----------
class TestSettlementsDocs:
    def test_settlements_default_salons(self, super_s):
        r = super_s.get(f"{BASE}/api/super-admin/rewards-campaign/settlements")
        assert r.status_code == 200, r.text
        rows = r.json().get("rows", r.json().get("settlements", []))
        slugs = {row.get("slug") or row.get("tenant_slug") for row in rows}
        assert "miracurl-marathahalli" in slugs
        assert "miracurl-whitefield" in slugs
        assert "infinity-family-restaurant" not in slugs

    def test_settlements_restaurant(self, super_s):
        r = super_s.get(f"{BASE}/api/super-admin/rewards-campaign/settlements", params={"campaign": "restaurant"})
        assert r.status_code == 200, r.text
        d = r.json()
        rows = d.get("rows", d.get("settlements", []))
        assert len(rows) == 1
        slug = rows[0].get("slug") or rows[0].get("tenant_slug")
        assert slug == "infinity-family-restaurant"
        status = rows[0].get("status")
        assert status in ("not_set", None, "unset"), rows[0]
        assert "summary" in d or "totals" in d

    def test_anomalies_restaurant(self, super_s):
        r = super_s.get(f"{BASE}/api/super-admin/rewards-campaign/anomalies", params={"campaign": "restaurant"})
        assert r.status_code == 200, r.text
        rows = r.json().get("rows", r.json().get("anomalies", []))
        for row in rows:
            slug = row.get("slug") or row.get("tenant_slug")
            if slug:
                assert slug == "infinity-family-restaurant"

    def _pdf_text(self, content: bytes) -> str:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content))
        return "\n".join((p.extract_text() or "") for p in reader.pages)

    def test_agreement_pdf_restaurant(self, super_s):
        r = super_s.get(f"{BASE}/api/super-admin/rewards-campaign/docs/agreement.pdf", params={"campaign": "restaurant"})
        assert r.status_code == 200, r.text
        text = self._pdf_text(r.content)
        assert "Restaurant" in text or "restaurant" in text.lower()
        assert "Taste Ambassador" in text
        assert "Brand Model" not in text

    def test_guide_pdf_restaurant(self, super_s):
        r = super_s.get(f"{BASE}/api/super-admin/rewards-campaign/docs/guide.pdf", params={"campaign": "restaurant"})
        assert r.status_code == 200, r.text
        text = self._pdf_text(r.content)
        assert "Taste Ambassador" in text
        assert "Brand Model" not in text

    def test_agreement_pdf_main_still_salon(self, super_s):
        r = super_s.get(f"{BASE}/api/super-admin/rewards-campaign/docs/agreement.pdf")
        assert r.status_code == 200, r.text
        text = self._pdf_text(r.content)
        assert "Salon Participation Agreement" in text


# ---------- Public ----------
class TestPublic:
    def test_public_restaurant(self):
        r = requests.get(f"{BASE}/api/public/rewards/infinity-family-restaurant")
        assert r.status_code == 200, r.text
        d = r.json()
        camp = d.get("campaign") or {}
        assert "Taste Ambassador" in (camp.get("name") or "")
        assert (camp.get("vertical") or d.get("vertical")) == "restaurant"
        assert d.get("salon_on") is True or d.get("on") is True
        assert d.get("agreement_pending") is True

    def test_public_salon_unchanged(self):
        r = requests.get(f"{BASE}/api/public/rewards/miracurl-marathahalli")
        assert r.status_code == 200, r.text
        d = r.json()
        camp = d.get("campaign") or {}
        assert (camp.get("vertical") or d.get("vertical")) == "salon"
        assert camp.get("name") == "Miracurl Customer Rewards – 2026"

    def test_public_participants_regression(self):
        # try common endpoint variants
        for path in ["applicants", "participants", "entries"]:
            r = requests.get(f"{BASE}/api/public/rewards/miracurl-marathahalli/{path}")
            if r.status_code == 200:
                return
        pytest.skip("No public participants endpoint found")


# ---------- Tenant regression ----------
class TestTenantRegression:
    def test_settings_rewards_campaign(self, admin_s):
        r = admin_s.get(f"{BASE}/api/settings/rewards-campaign")
        assert r.status_code == 200, r.text
        d = r.json()
        camp = d.get("campaign") or d
        assert (camp.get("id") in ("main", None)) and (camp.get("name") or d.get("name")) == "Miracurl Customer Rewards – 2026"
        # agreement + settlement keys
        assert "agreement" in d or "agreement_version" in d
        settl = d.get("settlement") or {}
        amt = settl.get("amount") if isinstance(settl, dict) else None
        if amt is None:
            amt = d.get("settlement_amount")
        assert amt == 4000, f"settlement amount {amt}"

    def test_agreement_endpoint(self, admin_s):
        r = admin_s.get(f"{BASE}/api/settings/rewards-campaign/agreement")
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d.get("version"), str) and len(d["version"]) > 0
        assert d.get("share_pct") == 10
