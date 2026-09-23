"""Iter 169 — CORS tightening + campaign results (delivered/read/booked).

NO real WhatsApp sends: only READ endpoints are exercised.
"""
import os
import requests
import os as _os
import sys as _sys

_sys.path.insert(0, _os.path.dirname(__file__))
from _creds import password_for  # noqa: E402
from _creds import pw

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
TENANT = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PW = password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD")


# ---------------- CORS ----------------
def test_cors_evil_origin_no_acao():
    r = requests.options(
        f"{BASE_URL}/api/auth/login",
        headers={
            "Origin": "https://evil.emergent.host",
            "Access-Control-Request-Method": "POST",
        },
    )
    # No Access-Control-Allow-Origin echoed for non-allowed origin
    assert "access-control-allow-origin" not in {k.lower() for k in r.headers}


def test_cors_miracurl_suite_allowed():
    r = requests.options(
        f"{BASE_URL}/api/auth/login",
        headers={
            "Origin": "https://miracurl-suite.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert r.headers.get("access-control-allow-origin") == "https://miracurl-suite.com"


def test_cors_preview_url_allowed_at_backend():
    # Directly hit ingress — same-origin proxy may strip ACAO. Backend still trusts it.
    r = requests.options(
        "http://localhost:8001/api/auth/login",
        headers={
            "Origin": BASE_URL,
            "Access-Control-Request-Method": "POST",
        },
    )
    assert r.headers.get("access-control-allow-origin") == BASE_URL


# ---------------- Auth ----------------
def _login():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PW},
        headers={"X-Tenant-Slug": TENANT},
    )
    assert r.status_code == 200, r.text
    return s


def test_admin_login_ok():
    s = _login()
    r = s.get(f"{BASE_URL}/api/auth/me", headers={"X-Tenant-Slug": TENANT})
    assert r.status_code == 200


def test_admin_login_wrong_password():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": "wrong-password"},
        headers={"X-Tenant-Slug": TENANT},
    )
    assert r.status_code in (400, 401, 403)


# ---------------- Campaign results ----------------
def test_campaigns_list_includes_delivered_read_booked():
    s = _login()
    r = s.get(
        f"{BASE_URL}/api/whatsapp-link/campaigns",
        headers={"X-Tenant-Slug": TENANT},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    # response may be list or dict; normalise
    items = data if isinstance(data, list) else (data.get("items") or data.get("campaigns") or [])
    assert isinstance(items, list) and len(items) > 0, f"no campaigns: {data}"

    # every campaign must have integer delivered / read / booked
    for c in items:
        for key in ("delivered", "read", "booked"):
            assert key in c, f"campaign {c.get('id')} missing {key}: {c}"
            assert isinstance(c[key], int), f"campaign {c.get('id')} {key} not int: {c[key]!r}"

    # find festive glow facial test
    festive = [c for c in items if "festive glow facial" in (c.get("name") or c.get("title") or "").lower()]
    assert festive, f"'Festive glow facial test' not found among {[c.get('name') or c.get('title') for c in items]}"
    fc = festive[0]
    sent = fc.get("sent") or fc.get("sent_count") or 0
    assert sent >= 1, f"expected sent>=1, got {fc}"
    assert fc["read"] >= 1, f"expected read>=1 for festive glow facial, got {fc}"


def test_staff_portal_login():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "priya.staff@miracurl.com", "password": pw("STAFF")},
        headers={"X-Tenant-Slug": TENANT},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    user = body.get("user") or body
    assert (user.get("role") or "").lower() == "staff"
