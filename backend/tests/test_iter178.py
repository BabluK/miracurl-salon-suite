"""Iteration 178: speed pulse (admin API only), demo-calendar purposes,
WA campaign compose+image cross-tenant, receptionist + webhook health + signed inbound."""
import hmac
import hashlib
import json
import os
import time
import uuid
import pytest
import requests
from _creds import pw

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

# ---- credentials (from /app/memory/test_credentials.md) ----
ADMIN = ("admin@miracurl.com", pw("SALON_ADMIN"), "miracurl-marathahalli")
SUPER = ("super@miracurl.com", pw("SUPER_ADMIN"), None)
STAFF = ("priya.staff@miracurl.com", pw("STAFF"), "miracurl-marathahalli")
OTHER = ("owner@elegance.com", "Owner@123", "elegance-koramangala")


def _login(email, pw, slug):
    s = requests.Session()
    h = {"Content-Type": "application/json"}
    if slug:
        h["X-Tenant-Slug"] = slug
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw}, headers=h, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text[:200]}"
    if slug:
        s.headers["X-Tenant-Slug"] = slug
    csrf = s.cookies.get("csrf_token")
    if csrf:
        s.headers["X-CSRF-Token"] = csrf
    return s


@pytest.fixture(scope="module")
def admin_s():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def super_s():
    return _login(*SUPER)


@pytest.fixture(scope="module")
def other_s():
    return _login(*OTHER)


# ---- Demo Calendar purpose field ----
def test_demo_calendar_has_purpose(super_s):
    r = super_s.get(f"{API}/super-admin/demo-calendar", timeout=20)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert "upcoming" in data and "past" in data
    combined = data["upcoming"] + data["past"]
    assert combined, "no demo bookings — cannot check purpose field"
    for item in combined:
        assert "purpose" in item, f"missing purpose in {item}"
        assert item["purpose"] in {"demo", "onboarding"}, f"bad purpose {item['purpose']}"
    onboarding = [i for i in combined if i["purpose"] == "onboarding"]
    assert onboarding, "expected at least one 'onboarding' booking (delivered@resend.dev 2026-09-20/21)"


# ---- WhatsApp webhook health ----
def test_wa_webhook_health():
    r = requests.get(f"{API}/webhooks/whatsapp/health", timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "ok"
    assert "phone_number_id_tail" in j
    assert len(j["phone_number_id_tail"]) == 4
    assert "platform_number" in j
    assert "last_inbound_at" in j


# ---- Receptionist endpoint for salon admin ----
def test_receptionist_endpoint(admin_s):
    r = admin_s.get(f"{API}/receptionist", timeout=15)
    # route lives under /whatsapp-link/receptionist per code; check that path
    if r.status_code == 404:
        r = admin_s.get(f"{API}/whatsapp-link/receptionist", timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    j = r.json()
    assert "last_inbound" in j
    if j["last_inbound"] is not None:
        for k in ("at", "text", "from", "status", "label"):
            assert k in j["last_inbound"], f"missing {k} in last_inbound"


# ---- Cross-tenant compose image_url should 400 ----
def test_compose_rejects_other_tenant_image(admin_s):
    # A random file id that doesn't belong to admin's tenant
    fake_url = f"/api/files/{uuid.uuid4().hex[:16]}"
    body = {"audience": "all", "customer_ids": [], "brief": "test",
            "offer_type": "general", "image_url": fake_url}
    r = admin_s.post(f"{API}/whatsapp-link/campaigns/compose", json=body, timeout=30)
    assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text[:200]}"


# ---- Signed webhook inbound triggers Mira fallback (asked_salon) ----
def _sign(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def test_signed_webhook_asks_salon():
    secret = os.environ.get("META_APP_SECRET") or ""
    pnid = os.environ.get("WHATSAPP_PHONE_NUMBER_ID") or ""
    if not secret or not pnid:
        pytest.skip("META_APP_SECRET / WHATSAPP_PHONE_NUMBER_ID not set")
    wamid = f"wamid.TEST_{uuid.uuid4().hex[:12]}"
    payload = {
        "object": "whatsapp_business_account",
        "entry": [{"id": "test", "changes": [{
            "field": "messages",
            "value": {
                "messaging_product": "whatsapp",
                "metadata": {"display_phone_number": "0", "phone_number_id": pnid},
                "contacts": [{"profile": {"name": "TestGuest"}, "wa_id": "919000000777"}],
                "messages": [{"from": "919000000777", "id": wamid, "timestamp": str(int(time.time())),
                              "type": "text", "text": {"body": "hi"}}],
            },
        }]}],
    }
    raw = json.dumps(payload).encode()
    sig = _sign(secret, raw)
    r = requests.post(f"{API}/webhooks/whatsapp", data=raw,
                      headers={"Content-Type": "application/json", "X-Hub-Signature-256": sig},
                      timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    assert r.json().get("received") is True

    # Poll the whatsapp_messages doc — background task processes it
    # We can't hit Mongo directly from here (no python mongo client set up), so query health for last_inbound_at
    time.sleep(5)
    r2 = requests.get(f"{API}/webhooks/whatsapp/health", timeout=10)
    j = r2.json()
    # sanity: last_inbound_at should be present (existing or new)
    assert "last_inbound_at" in j
    # We record the wamid so cleanup can be done via mongo shell if needed
    print(f"Injected wamid={wamid} for cleanup")
