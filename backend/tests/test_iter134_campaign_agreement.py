"""Iteration 134 — Brand Model Campaign agreement docs & e-acceptance (tenant + HQ)."""
import io
import os
import pytest
import requests
from pypdf import PdfReader
import sys as _sys; _sys.path.insert(0, __import__("os").path.dirname(__file__))
from _creds import password_for  # noqa: E402


def _pdf_text(b: bytes) -> str:
    r = PdfReader(io.BytesIO(b))
    return "\n".join((p.extract_text() or "") for p in r.pages)

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

TENANT_EMAIL = "admin@miracurl.com"
TENANT_PW = password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD")
TENANT_SLUG = "miracurl-marathahalli"
SUPER_EMAIL = "super@miracurl.com"
SUPER_PW = "og9T@41Es#OQb6"


def _login(email, pw, slug=None):
    s = requests.Session()
    h = {"Content-Type": "application/json"}
    if slug:
        h["X-Tenant-Slug"] = slug
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw}, headers=h)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    csrf = s.cookies.get("csrf_token") or ""
    s.headers.update({"X-CSRF-Token": csrf})
    if slug:
        s.headers.update({"X-Tenant-Slug": slug})
    return s


@pytest.fixture(scope="module")
def tenant():
    return _login(TENANT_EMAIL, TENANT_PW, TENANT_SLUG)


@pytest.fixture(scope="module")
def hq():
    return _login(SUPER_EMAIL, SUPER_PW)


# ---------------- tenant ----------------
class TestTenantAgreement:
    def test_get_agreement_shape(self, tenant):
        r = tenant.get(f"{BASE}/api/settings/rewards-campaign/agreement")
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d["version"], str) and len(d["version"]) == 10
        assert d["share_pct"] == 10
        assert d["campaign"]
        assert d["eligible"] is True
        assert d["enabled"] is True
        # main agent may have run frontend accept first; accepted expected True
        assert d["accepted"] in (True, False)
        assert d["needs_reaccept"] is False

    def test_docs_pdfs(self, tenant):
        for kind in ("guide", "agreement", "terms"):
            r = tenant.get(f"{BASE}/api/settings/rewards-campaign/docs/{kind}.pdf")
            assert r.status_code == 200, f"{kind}: {r.status_code}"
            assert r.headers["content-type"] == "application/pdf"
            assert 0 < len(r.content) < 3 * 1024 * 1024
        # unknown
        r = tenant.get(f"{BASE}/api/settings/rewards-campaign/docs/foo.pdf")
        assert r.status_code == 404

    def test_agreement_text_contains(self, tenant):
        r = tenant.get(f"{BASE}/api/settings/rewards-campaign/docs/agreement.pdf")
        assert r.status_code == 200
        body = r.content
        # PDF is compressed; use string search of decoded raw bytes (reportlab writes text as (...) segments)
        raw = _pdf_text(body)
        assert "Salon Participation Agreement" in raw
        assert "Settlement Share" in raw
        assert "ACCEPTANCE & SIGNATURE RECORD" in raw
        assert "10%" in raw or "10 per cent" in raw

    def test_guide_text_contains(self, tenant):
        r = tenant.get(f"{BASE}/api/settings/rewards-campaign/docs/guide.pdf")
        raw = _pdf_text(r.content).lower()
        assert "step 1" in raw
        assert "settlement" in raw

    def test_accept_validation_and_state(self, tenant):
        # agree=false
        r = tenant.post(f"{BASE}/api/settings/rewards-campaign/agreement/accept",
                        json={"full_name": "Ravi Kumar", "designation": "Proprietor", "agree": False})
        assert r.status_code == 400
        # short name → 422
        r = tenant.post(f"{BASE}/api/settings/rewards-campaign/agreement/accept",
                        json={"full_name": "Ra", "designation": "Proprietor", "agree": True})
        assert r.status_code == 422

        # accepted state (frontend already accepted with Ravi Kumar earlier in this iteration)
        state = tenant.get(f"{BASE}/api/settings/rewards-campaign/agreement").json()
        if not state["accepted"]:
            r = tenant.post(f"{BASE}/api/settings/rewards-campaign/agreement/accept",
                            json={"full_name": "Ravi Kumar", "designation": "Proprietor", "agree": True})
            assert r.status_code == 200
            d = r.json()
            assert d["ok"] is True
            assert d["acceptance"]["full_name"] == "Ravi Kumar"
            assert d["acceptance"]["version"]
            assert "emailed" in d
        # re-accept → 400 already
        r = tenant.post(f"{BASE}/api/settings/rewards-campaign/agreement/accept",
                        json={"full_name": "Ravi Kumar", "designation": "Proprietor", "agree": True})
        assert r.status_code == 400
        assert "already accepted" in r.text.lower()

        # GET reflects accepted
        d = tenant.get(f"{BASE}/api/settings/rewards-campaign/agreement").json()
        assert d["accepted"] is True
        assert d["acceptance"]["full_name"] == "Ravi Kumar"

    def test_signed_pdf_filename_and_text(self, tenant):
        r = tenant.get(f"{BASE}/api/settings/rewards-campaign/docs/agreement.pdf")
        assert r.status_code == 200
        cd = r.headers.get("content-disposition", "")
        assert "SIGNED" in cd
        raw = _pdf_text(r.content)
        assert "Ravi Kumar" in raw
        assert "ELECTRONICALLY ACCEPTED" in raw
        assert "UNSIGNED" not in raw

    def test_rewards_campaign_agreement_flag(self, tenant):
        r = tenant.get(f"{BASE}/api/settings/rewards-campaign")
        assert r.status_code == 200
        d = r.json()
        assert d["agreement"]["accepted"] is True


# ---------------- HQ ----------------
class TestHqCampaignDocs:
    def test_hq_templates(self, hq):
        r = hq.get(f"{BASE}/api/super-admin/rewards-campaign/docs/guide.pdf")
        assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
        r = hq.get(f"{BASE}/api/super-admin/rewards-campaign/docs/agreement.pdf")
        assert r.status_code == 200
        assert "[Salon name]" in _pdf_text(r.content)

    def test_hq_signed_copy_marathahalli(self, hq):
        # find tenant id
        ts = hq.get(f"{BASE}/api/super-admin/tenants").json()
        rows = ts if isinstance(ts, list) else ts.get("tenants") or ts.get("rows") or []
        tid = next(t["id"] for t in rows if t.get("slug") == TENANT_SLUG)
        r = hq.get(f"{BASE}/api/super-admin/rewards-campaign/docs/agreement/{tid}.pdf")
        assert r.status_code == 200
        assert "Ravi Kumar" in _pdf_text(r.content)
        assert "SIGNED" in r.headers.get("content-disposition", "")

    def test_hq_agreements_list(self, hq):
        r = hq.get(f"{BASE}/api/super-admin/rewards-campaign/agreements")
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d["version"], str)
        assert any(a.get("full_name") == "Ravi Kumar" for a in d["agreements"])
        # no user_agent leaked
        for a in d["agreements"]:
            assert "user_agent" not in a
            assert "ip" in a
            assert "tenant_id" in a

    def test_hq_settlements_has_agreement_status(self, hq):
        r = hq.get(f"{BASE}/api/super-admin/rewards-campaign/settlements")
        assert r.status_code == 200
        d = r.json()
        assert "agreement_version" in d
        rows = d["rows"]
        m = next(x for x in rows if x["slug"] == TENANT_SLUG)
        assert m["agreement"]["status"] == "accepted"
        assert m["agreement"]["by"] == "Ravi Kumar"
        assert m["agreement"].get("at")
        w = next(x for x in rows if x["slug"] == "miracurl-whitefield")
        assert w["agreement"]["status"] == "pending"

    def test_hq_send_pack_no_email(self, hq):
        ts = hq.get(f"{BASE}/api/super-admin/tenants").json()
        rows = ts if isinstance(ts, list) else ts.get("tenants") or ts.get("rows") or []
        tid = next(t["id"] for t in rows if t.get("slug") == TENANT_SLUG)
        r = hq.post(f"{BASE}/api/super-admin/rewards-campaign/docs/send/{tid}")
        assert r.status_code == 400
        # unknown tid → 404
        r = hq.post(f"{BASE}/api/super-admin/rewards-campaign/docs/send/does-not-exist")
        assert r.status_code == 404

    def test_hq_send_all(self, hq):
        r = hq.post(f"{BASE}/api/super-admin/rewards-campaign/docs/send-all")
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True
        assert isinstance(d["sent"], list)
        assert isinstance(d["skipped"], list)
