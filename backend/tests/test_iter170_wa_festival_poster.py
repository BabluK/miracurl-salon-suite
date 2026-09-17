"""Iter 170: WA link — festivals radar, poster paint, compose (gpt-5.4), test-send validation."""
import os
import re
import pytest
import requests
import sys as _sys; _sys.path.insert(0, __import__("os").path.dirname(__file__))
from _creds import password_for  # noqa: E402

def _load_base_url():
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
    assert v, "REACT_APP_BACKEND_URL not set"
    return v.rstrip("/")


BASE_URL = _load_base_url()
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PW = password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD")
TENANT = "miracurl-marathahalli"


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=20)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    csrf = r.json().get("csrf") or r.cookies.get("csrf_token")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf})
    s.headers.update({"X-Owner-Pin": "4321"})
    return s


# ---------- festivals radar ----------
def test_festivals_radar_shape(admin_client):
    r = admin_client.get(f"{BASE_URL}/api/whatsapp-link/festivals", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "today" in data and "next" in data and "upcoming" in data
    assert data["today"] is None or isinstance(data["today"], dict)
    assert data["next"] is None or isinstance(data["next"], dict)
    assert isinstance(data["upcoming"], list)
    assert len(data["upcoming"]) <= 4
    for f in data["upcoming"]:
        for k in ("name", "emoji", "date", "days_away"):
            assert k in f, f"missing {k} in upcoming festival {f}"
        assert isinstance(f["days_away"], int) and f["days_away"] > 0


# ---------- test-send validation (NO real send) ----------
def test_test_send_rejects_invalid_phone(admin_client):
    r = admin_client.post(
        f"{BASE_URL}/api/whatsapp-link/test-send",
        json={"phone": "12", "text": "x", "image_url": "/api/files/x"},
        timeout=15,
    )
    assert r.status_code in (400, 422), f"expected validation, got {r.status_code} {r.text[:200]}"


# ---------- poster validation guard ----------
def test_poster_bogus_offer_type_returns_422(admin_client):
    r = admin_client.post(
        f"{BASE_URL}/api/whatsapp-link/campaigns/poster",
        json={"offer_type": "bogus", "discount_pct": 20},
        timeout=15,
    )
    assert r.status_code == 422, f"expected 422 got {r.status_code} {r.text[:200]}"


# ---------- poster paint (paid — one call) ----------
def test_poster_paint_festive(admin_client):
    r = admin_client.post(
        f"{BASE_URL}/api/whatsapp-link/campaigns/poster",
        json={"offer_type": "festive", "discount_pct": 20},
        timeout=90,
    )
    assert r.status_code == 200, f"poster failed {r.status_code} {r.text[:400]}"
    data = r.json()
    assert isinstance(data.get("id"), str) and data["id"].startswith("mira:"), data
    assert isinstance(data.get("label"), str) and data["label"]
    assert isinstance(data.get("url"), str) and data["url"].startswith("/api/files/"), data
    assert "festival" in data
    # Fetch the image
    g = admin_client.get(f"{BASE_URL}{data['url']}", timeout=30)
    assert g.status_code == 200, f"image fetch failed {g.status_code}"
    ctype = g.headers.get("content-type", "")
    assert "image/" in ctype, f"unexpected content-type {ctype}"
    assert len(g.content) > 10_000, f"image too small {len(g.content)} bytes"


# ---------- compose (gpt-5.4) ----------
def test_compose_loyal_festive(admin_client):
    r = admin_client.post(
        f"{BASE_URL}/api/whatsapp-link/campaigns/compose",
        json={
            "audience": "loyal",
            "customer_ids": [],
            "brief": "x — festival: Navratri",
            "offer_type": "festive",
            "discount_pct": 20,
        },
        timeout=90,
    )
    assert r.status_code == 200, f"compose failed {r.status_code} {r.text[:400]}"
    data = r.json()
    text = data.get("text") or ""
    assert "{name}" in text, f"missing {{name}} placeholder in: {text}"
    low = text.lower()
    assert ("navratri" in low) or ("festive" in low) or ("festival" in low), f"festive theme missing: {text}"
