"""Iter 115 — Waiter Call, Weekly Insights, Dine-in Guest, Photo Upload."""
import os
import io
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    with open("/app/frontend/.env") as f:
        for l in f:
            if l.startswith("REACT_APP_BACKEND_URL"):
                BASE = l.split("=", 1)[1].strip().rstrip("/")

RESTO_SLUG = "infinity-family-restaurant"
RESTO_EMAIL = "infinity.admin@miracurl.com"
RESTO_PASS = "Infinity@2026"
SALON_SLUG = "miracurl-marathahalli"
SALON_EMAIL = "admin@miracurl.com"
SALON_PASS = "q6QY@tn3p#9DtL"


def _login(email, password, slug):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password},
               headers={"X-Tenant-Slug": slug})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def resto():
    return _login(RESTO_EMAIL, RESTO_PASS, RESTO_SLUG)


@pytest.fixture(scope="module")
def salon():
    return _login(SALON_EMAIL, SALON_PASS, SALON_SLUG)


# ---------- Table Calls ----------

def test_table_call_create_and_dedupe(resto):
    # Use unusual table_no to avoid noise
    r1 = requests.post(f"{BASE}/api/public/table-call/{RESTO_SLUG}",
                       json={"table_no": 77, "kind": "waiter"})
    assert r1.status_code == 200, r1.text
    b1 = r1.json()
    assert b1["ok"] is True
    # Either queued fresh, or an earlier dup exists — force a done first
    if not b1.get("queued"):
        # Resolve existing to reset
        calls = resto.get(f"{BASE}/api/table-calls").json()
        for c in calls:
            if c.get("table_no") == 77 and c.get("kind") == "waiter":
                resto.put(f"{BASE}/api/table-calls/{c['id']}/done")
        r1 = requests.post(f"{BASE}/api/public/table-call/{RESTO_SLUG}",
                           json={"table_no": 77, "kind": "waiter"})
        assert r1.json().get("queued") is True

    # Immediate duplicate should NOT queue
    r2 = requests.post(f"{BASE}/api/public/table-call/{RESTO_SLUG}",
                       json={"table_no": 77, "kind": "waiter"})
    assert r2.status_code == 200
    assert r2.json().get("queued") is False, "dedupe within 3 min failed"


def test_table_call_salon_rejected():
    r = requests.post(f"{BASE}/api/public/table-call/{SALON_SLUG}",
                      json={"table_no": 1, "kind": "waiter"})
    assert r.status_code == 400


def test_table_calls_list_requires_auth():
    r = requests.get(f"{BASE}/api/table-calls")
    assert r.status_code in (401, 403)


def test_table_calls_list_and_done(resto):
    # Ensure at least one open call for table 77
    requests.post(f"{BASE}/api/public/table-call/{RESTO_SLUG}",
                  json={"table_no": 78, "kind": "water"})
    calls = resto.get(f"{BASE}/api/table-calls").json()
    assert isinstance(calls, list)
    ours = [c for c in calls if c.get("table_no") in (77, 78)]
    assert ours, "expected our created calls in the list"

    # Resolve one
    cid = ours[0]["id"]
    r = resto.put(f"{BASE}/api/table-calls/{cid}/done")
    assert r.status_code == 200
    # Verify it's gone from list
    calls2 = resto.get(f"{BASE}/api/table-calls").json()
    assert not any(c["id"] == cid for c in calls2), "resolved call still open"


def test_table_calls_done_unknown_404(resto):
    r = resto.put(f"{BASE}/api/table-calls/does-not-exist-999/done")
    assert r.status_code == 404


def test_table_calls_tenant_isolation(resto, salon):
    # Create a call under resto slug
    requests.post(f"{BASE}/api/public/table-call/{RESTO_SLUG}",
                  json={"table_no": 79, "kind": "waiter"})
    # Salon admin's list should not include table 79 (resto tenant)
    rows = salon.get(f"{BASE}/api/table-calls")
    if rows.status_code == 200:
        assert not any(c.get("table_no") == 79 for c in rows.json())
    # cleanup — resolve any table 79 open for resto
    for c in resto.get(f"{BASE}/api/table-calls").json():
        if c.get("table_no") in (77, 78, 79):
            resto.put(f"{BASE}/api/table-calls/{c['id']}/done")


# ---------- Restaurant Insights ----------

def test_restaurant_insights_shape(resto):
    r = resto.get(f"{BASE}/api/restaurant/insights")
    assert r.status_code == 200
    data = r.json()
    assert data["days"] == 7
    assert isinstance(data["orders"], int)
    assert isinstance(data["revenue"], (int, float))
    assert isinstance(data["top_dishes"], list)
    assert isinstance(data["busy_tables"], list)
    # Sorting checks
    qtys = [d["qty"] for d in data["top_dishes"]]
    assert qtys == sorted(qtys, reverse=True), "top_dishes not sorted by qty desc"
    orders_counts = [t["orders"] for t in data["busy_tables"]]
    assert orders_counts == sorted(orders_counts, reverse=True), "busy_tables not sorted by orders desc"


def test_restaurant_insights_auth_required():
    r = requests.get(f"{BASE}/api/restaurant/insights")
    assert r.status_code in (401, 403)


# ---------- Dine-in Guest ----------

def test_dinein_guest_idempotent(resto):
    r1 = resto.post(f"{BASE}/api/customers/dinein-guest")
    assert r1.status_code == 200, r1.text
    g1 = r1.json()
    assert g1["phone"] == "0000000000"
    assert g1["name"] == "Dine-in Guest"

    r2 = resto.post(f"{BASE}/api/customers/dinein-guest")
    assert r2.status_code == 200
    g2 = r2.json()
    assert g2["id"] == g1["id"], "dinein-guest not idempotent"


def test_dinein_guest_tenant_scoped(resto, salon):
    gr = resto.post(f"{BASE}/api/customers/dinein-guest").json()
    gs = salon.post(f"{BASE}/api/customers/dinein-guest").json()
    assert gr["id"] != gs["id"], "dinein-guest leaked across tenants"


# ---------- Photo upload path ----------

def _tiny_png_bytes():
    # 1x1 red PNG
    import base64
    return base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    )


def test_upload_service_image_and_attach(resto):
    # Get a service
    services = requests.get(f"{BASE}/api/public/services/{RESTO_SLUG}").json()
    assert services, "no services to test"
    sid = services[0]["id"]
    orig_url = services[0].get("image_url")

    png = _tiny_png_bytes()
    files = {"file": ("test.png", io.BytesIO(png), "image/png")}
    r = resto.post(f"{BASE}/api/uploads/image?kind=service", files=files)
    assert r.status_code == 200, r.text
    body = r.json()
    url = body.get("url") or body.get("image_url") or body.get("path")
    assert url, f"no url in upload response: {body}"

    # PUT it onto the service (full doc, matches frontend quickPhoto behavior)
    full = services[0]
    r = resto.put(f"{BASE}/api/services/{sid}", json={**full, "image_url": url})
    assert r.status_code == 200, r.text

    # Verify on public menu
    pub = requests.get(f"{BASE}/api/public/services/{RESTO_SLUG}").json()
    hit = next((s for s in pub if s["id"] == sid), None)
    assert hit and hit.get("image_url") == url

    # Reset back to original (or empty) — leave demo clean
    resto.put(f"{BASE}/api/services/{sid}", json={**full, "image_url": orig_url or ""})
