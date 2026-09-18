"""Iter 168 — WhatsApp Campaign page: audience-counts, compose validation, campaigns scheduled_at, no queue on invalid.

CRITICAL: Do NOT POST valid campaigns (would send real messages).
"""
import os
import pytest
import requests
import os as _os
import sys as _sys

_sys.path.insert(0, _os.path.dirname(__file__))
from _creds import password_for  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
TENANT = "miracurl-marathahalli"
EMAIL = "admin@miracurl.com"
PASSWORD = password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    csrf = r.json().get("csrf_token") or s.cookies.get("csrf_token")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf})
    s.headers.update({"X-Owner-Pin": "4321"})
    return s


# --- audience-counts ---
def test_audience_counts_shape(client):
    r = client.get(f"{BASE_URL}/api/whatsapp-link/audience-counts", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert isinstance(d.get("all"), int) and d["all"] > 0
    assert isinstance(d.get("loyal"), int) and d["loyal"] >= 0


# --- compose validation ---
def test_compose_loyal_returns_text_with_name_placeholder(client):
    r = client.post(f"{BASE_URL}/api/whatsapp-link/campaigns/compose",
                    json={"audience": "loyal", "customer_ids": [],
                          "brief": "Loyalty thank-you perk", "offer_type": "general"},
                    timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "{name}" in (d.get("text") or ""), f"text missing {{name}}: {d.get('text')!r}"


def test_compose_selected_empty_400(client):
    r = client.post(f"{BASE_URL}/api/whatsapp-link/campaigns/compose",
                    json={"audience": "selected", "customer_ids": []},
                    timeout=15)
    assert r.status_code == 400
    assert "Pick at least one guest" in r.text


def test_compose_bad_audience_422(client):
    r = client.post(f"{BASE_URL}/api/whatsapp-link/campaigns/compose",
                    json={"audience": "vip", "customer_ids": []},
                    timeout=15)
    assert r.status_code == 422


# --- campaigns validation (must NOT queue anything) ---
def _campaigns_count(client):
    r = client.get(f"{BASE_URL}/api/whatsapp-link/campaigns", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    lst = d if isinstance(d, list) else (d.get("campaigns") or d.get("items") or [])
    return len(lst)


def test_campaigns_selected_empty_400_no_queue(client):
    before = _campaigns_count(client)
    r = client.post(f"{BASE_URL}/api/whatsapp-link/campaigns",
                    json={"audience": "selected", "customer_ids": [], "text": "hello there friends"},
                    timeout=15)
    assert r.status_code == 400, r.text
    after = _campaigns_count(client)
    assert after == before, f"campaign got created despite 400: {before}->{after}"


def test_campaigns_bad_schedule_no_queue(client):
    before = _campaigns_count(client)
    r = client.post(f"{BASE_URL}/api/whatsapp-link/campaigns",
                    json={"audience": "selected", "customer_ids": [],
                          "text": "hello there friends", "scheduled_at": "not-a-date"},
                    timeout=15)
    # 400 before schedule parsing (empty ids) is acceptable, or 400 for bad schedule
    assert r.status_code in (400, 422), r.text
    after = _campaigns_count(client)
    assert after == before, f"campaign got created despite error: {before}->{after}"
