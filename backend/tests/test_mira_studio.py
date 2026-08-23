"""Mira Studio backend tests — multi-agent marketing suite."""
from _creds import _PW_ADMIN
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
TENANT_SLUG = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = _PW_ADMIN

LLM_TIMEOUT = 60


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT_SLUG, "Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    return s


# ── Auth guard ─────────────────────────────────────────────
def test_agents_unauthenticated_returns_401_or_403():
    r = requests.get(f"{BASE_URL}/api/mira-studio/agents",
                     headers={"X-Tenant-Slug": TENANT_SLUG}, timeout=10)
    assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"


# ── Agents registry ────────────────────────────────────────
def test_agents_list(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/mira-studio/agents", timeout=15)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert "agents" in data and "connections" in data
    agents = data["agents"]
    assert len(agents) == 12, f"expected 12 agents (incl orchestrator), got {len(agents)}"
    by_key = {a["key"]: a for a in agents}
    # needs-connection agents should be connect_account (no social connections seeded)
    for k in ("social", "whatsapp", "google"):
        assert by_key[k]["status"] == "connect_account", f"{k} status={by_key[k]['status']}"
    # non-connection agents should be active
    for k in ("content", "email", "seo", "sales", "video", "analytics", "leadfinder", "staff_verify"):
        assert by_key[k]["status"] == "active", f"{k} status={by_key[k]['status']}"


# ── Orchestrator ───────────────────────────────────────────
def test_orchestrate_email_route(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/mira-studio/orchestrate",
                           json={"message": "write an email campaign for diwali offers"},
                           timeout=LLM_TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert d.get("agent") == "email", f"agent={d.get('agent')}"
    assert d.get("topic") and d.get("reply")
    assert d.get("agent_meta", {}).get("key") == "email"


def test_orchestrate_empty_message_400(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/mira-studio/orchestrate",
                           json={"message": "  "}, timeout=15)
    assert r.status_code == 400


# ── Text agents ────────────────────────────────────────────
def test_generate_content_agent(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/mira-studio/generate",
                           json={"agent": "content", "topic": "keratin treatment offer"},
                           timeout=LLM_TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert d["agent"] == "content"
    res = d["result"]
    for k in ("title", "body", "cta"):
        assert k in res and res[k], f"missing {k}"


def test_generate_seo_agent(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/mira-studio/generate",
                           json={"agent": "seo", "topic": "salon near marathahalli"},
                           timeout=LLM_TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    res = r.json()["result"]
    assert isinstance(res.get("keywords"), list) and res["keywords"]
    assert res.get("meta_description")
    assert res.get("gmb_post")


def test_generate_sales_agent(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/mira-studio/generate",
                           json={"agent": "sales", "topic": "hair spa upsell"},
                           timeout=LLM_TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    res = r.json()["result"]
    assert res.get("pitch")
    assert isinstance(res.get("upsells"), list)


def test_generate_invalid_agent_400(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/mira-studio/generate",
                           json={"agent": "analytics", "topic": "foo"}, timeout=15)
    assert r.status_code == 400


# ── Social agent ───────────────────────────────────────────
def test_social_generate_no_image(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/mira-studio/social/generate",
                           json={"topic": "monsoon hair spa",
                                 "platforms": ["instagram", "facebook"],
                                 "with_image": False},
                           timeout=LLM_TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert d["image_url"] == ""
    posts = d["posts"]
    for plat in ("instagram", "facebook"):
        assert plat in posts, f"missing {plat}"
        assert posts[plat].get("caption")
        assert isinstance(posts[plat].get("hashtags"), list)


# ── Data agents ────────────────────────────────────────────
def test_analytics(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/mira-studio/analytics", timeout=LLM_TIMEOUT)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    stats = d["stats"]
    for k in ("month_revenue", "all_time_revenue", "total_bills", "customers", "appointments"):
        assert k in stats
    assert d.get("summary")


def test_leads(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/mira-studio/leads", timeout=20)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert "winback_leads" in d and isinstance(d["winback_leads"], list)
    assert "count" in d


def test_staff_verification(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/mira-studio/staff-verification", timeout=20)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert "staff" in d and isinstance(d["staff"], list)
    assert "total" in d and "verified" in d
    for s in d["staff"]:
        assert "in_registry" in s
