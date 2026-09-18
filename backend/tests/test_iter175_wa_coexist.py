"""Iter 175 — Bring-your-own WhatsApp (Meta coexistence) endpoints + channel routing."""
import os
import asyncio
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


def _login(slug, email, pwd):
    s = requests.Session(); s.headers.update({"X-Tenant-Slug": slug, "X-Owner-Pin": "4321"})
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pwd}, timeout=20); assert r.status_code == 200, r.text
    s.headers.update({"X-CSRF-Token": s.cookies.get("csrf_token", "")}); return s


@pytest.fixture(scope="module")
def salon():
    return _login("miracurl-marathahalli", "admin@miracurl.com", "q6QY@tn3p#9DtL")


def test_status_shape(salon):
    d = salon.get(f"{BASE}/api/whatsapp-own/status", timeout=15).json()
    assert set(d) >= {"available", "app_id", "config_id", "connected", "own"} and d["connected"] is False
    assert "token_enc" not in str(d)


def test_connect_requires_config_or_valid_payload(salon):
    r = salon.post(f"{BASE}/api/whatsapp-own/connect", json={"code": "abcdefghijkl", "waba_id": "123456", "phone_number_id": "654321"}, timeout=20)
    assert r.status_code in (503, 400), r.text
    assert salon.post(f"{BASE}/api/whatsapp-own/connect", json={"code": "x", "waba_id": "abc", "phone_number_id": "1"}, timeout=20).status_code == 422


def test_refresh_without_connection_404(salon):
    assert salon.post(f"{BASE}/api/whatsapp-own/refresh", timeout=15).status_code == 404


def test_channel_and_features_service_level():
    import sys; sys.path.insert(0, "/app/backend")
    from database import _raw_db
    from services.whatsapp_cloud import channel_for
    from services.wa_coexist import encrypt_token, own_channel
    from services.tenant_features import features_of

    async def _run():
        t = await _raw_db.tenants.find_one({"slug": "miracurl-marathahalli"}, {"_id": 0, "id": 1})
        ch = await channel_for(t["id"]); assert ch["own"] is False and ch["phone_number_id"] == os.environ["WHATSAPP_PHONE_NUMBER_ID"]
        fake = {"own_whatsapp": {"status": "connected", "phone_number_id": "1", "token_enc": encrypt_token("tok")}}
        assert own_channel(fake) and features_of(fake)["whatsapp"] is True
        assert own_channel({"own_whatsapp": {"status": "disconnected"}}) is None
    asyncio.get_event_loop().run_until_complete(_run())
