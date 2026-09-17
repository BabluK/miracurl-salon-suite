"""Backend tests for Mira Follow-Up Blast + dashboard.inactive_customers_30d (iteration 161)."""
import os
import requests
import pytest
import sys as _sys; _sys.path.insert(0, __import__("os").path.dirname(__file__))
from _creds import password_for  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
TENANT_SLUG = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD")
MGR_EMAIL = "manager@miracurl.com"
MGR_PASS = "Manager@1234"


def _login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-Slug": TENANT_SLUG})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    data = r.json()
    csrf = data.get("csrf_token") or data.get("csrf") or s.cookies.get("csrf_token")
    if csrf:
        s.headers["X-CSRF-Token"] = csrf
    return s


@pytest.fixture(scope="module")
def owner():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def manager():
    return _login(MGR_EMAIL, MGR_PASS)


def test_winback_blast_preview_owner(owner):
    r = owner.get(f"{BASE_URL}/api/winback/blast/preview?days=30", timeout=30)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    for key in ["eligible", "credits", "whatsapp_enabled", "template", "sample_message", "guests"]:
        assert key in d, f"missing {key}"
    assert isinstance(d["eligible"], int) and d["eligible"] >= 0
    assert isinstance(d["credits"], int) and d["credits"] >= 0
    assert isinstance(d["whatsapp_enabled"], bool)
    assert isinstance(d["template"], bool)
    assert isinstance(d["sample_message"], str) and len(d["sample_message"]) > 5
    # salon name check
    assert "miracurl" in d["sample_message"].lower() or "salon" in d["sample_message"].lower()
    assert isinstance(d["guests"], list) and len(d["guests"]) <= 8


def test_winback_blast_dry_run_owner(owner):
    r = owner.post(f"{BASE_URL}/api/winback/blast", json={"days": 30, "limit": 5, "dry_run": True}, timeout=30)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert d.get("dry_run") is True
    assert d.get("sent") == 0
    assert isinstance(d.get("eligible"), int) and d["eligible"] <= 5


def test_winback_blast_preview_manager_forbidden(manager):
    r = manager.get(f"{BASE_URL}/api/winback/blast/preview?days=30", timeout=30)
    assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}: {r.text[:200]}"


def test_dashboard_has_inactive_customers_30d(owner):
    r = owner.get(f"{BASE_URL}/api/reports/dashboard", timeout=30)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert "inactive_customers_30d" in d
    assert isinstance(d["inactive_customers_30d"], int)
    assert d["inactive_customers_30d"] >= 0


def test_whatsapp_requests_pending_owner(owner):
    r = owner.get(f"{BASE_URL}/api/whatsapp-requests?status=pending", timeout=30)
    assert r.status_code == 200, r.text[:300]
    assert isinstance(r.json(), list)
