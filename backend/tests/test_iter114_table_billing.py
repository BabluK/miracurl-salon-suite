"""Iter 114 — Restaurant table-wise billing & tenant isolation tests."""
import os
import pytest
import requests
from creds import password_for
from _creds import pw

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    # fallback to frontend .env
    with open("/app/frontend/.env") as f:
        for l in f:
            if l.startswith("REACT_APP_BACKEND_URL"):
                BASE = l.split("=", 1)[1].strip().rstrip("/")

RESTO_SLUG = "infinity-family-restaurant"
RESTO_EMAIL = "infinity.admin@miracurl.com"
RESTO_PASS = pw("RESTAURANT_ADMIN")

SALON_SLUG = "miracurl-marathahalli"
SALON_EMAIL = "admin@miracurl.com"
SALON_PASS = password_for("admin@miracurl.com")


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


# ---------- public menu / order creation ----------

def test_public_menu_has_items():
    r = requests.get(f"{BASE}/api/public/salon/{RESTO_SLUG}")
    assert r.status_code == 200
    data = r.json()
    assert data.get("business_type") == "restaurant"


def test_create_table_order_two_dishes():
    # get menu
    r = requests.get(f"{BASE}/api/public/services/{RESTO_SLUG}")
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 2
    order = {
        "table_no": 4,
        "customer_name": "TEST_diner",
        "items": [{"id": items[0]["id"], "qty": 2}, {"id": items[1]["id"], "qty": 1}],
    }
    r = requests.post(f"{BASE}/api/public/table-order/{RESTO_SLUG}", json=order)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["order"]["table_no"] == 4
    assert body["order"]["status"] == "new"
    assert len(body["order"]["items"]) == 2


def test_public_table_order_rejects_for_salon():
    r = requests.get(f"{BASE}/api/public/services/{SALON_SLUG}")
    ids = [i["id"] for i in r.json()][:1]
    if not ids:
        pytest.skip("no salon services")
    r = requests.post(f"{BASE}/api/public/table-order/{SALON_SLUG}",
                      json={"table_no": 1, "items": [{"id": ids[0], "qty": 1}]})
    assert r.status_code == 400


# ---------- auth list ----------

def test_list_table_orders_auth(resto):
    r = resto.get(f"{BASE}/api/table-orders")
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list)
    assert all(row.get("tenant_id") for row in rows)


def test_list_table_orders_unauth():
    r = requests.get(f"{BASE}/api/table-orders")
    assert r.status_code in (401, 403)


# ---------- mark billed ----------

def test_mark_billed_empty_ids_rejected(resto):
    r = resto.put(f"{BASE}/api/table-orders/mark-billed", json={"ids": []})
    assert r.status_code == 400


def test_mark_billed_happy_path_and_reset(resto):
    # create a fresh order to bill
    services = requests.get(f"{BASE}/api/public/services/{RESTO_SLUG}").json()
    r = requests.post(f"{BASE}/api/public/table-order/{RESTO_SLUG}",
                     json={"table_no": 9, "customer_name": "TEST_bill",
                           "items": [{"id": services[0]["id"], "qty": 1}]})
    oid = r.json()["order"]["id"]

    r = resto.put(f"{BASE}/api/table-orders/mark-billed", json={"ids": [oid]})
    assert r.status_code == 200
    assert r.json().get("billed") == 1

    # verify it is now 'billed'
    rows = resto.get(f"{BASE}/api/table-orders").json()
    match = [x for x in rows if x["id"] == oid]
    assert match and match[0]["status"] == "billed"


def test_new_order_after_billing_is_fresh(resto):
    services = requests.get(f"{BASE}/api/public/services/{RESTO_SLUG}").json()
    r = requests.post(f"{BASE}/api/public/table-order/{RESTO_SLUG}",
                     json={"table_no": 9, "items": [{"id": services[0]["id"], "qty": 1}]})
    assert r.status_code == 200
    assert r.json()["order"]["status"] == "new"


# ---------- tenant isolation ----------

def test_salon_cannot_bill_restaurant_orders(resto, salon):
    # create a resto order
    services = requests.get(f"{BASE}/api/public/services/{RESTO_SLUG}").json()
    r = requests.post(f"{BASE}/api/public/table-order/{RESTO_SLUG}",
                     json={"table_no": 11, "items": [{"id": services[0]["id"], "qty": 1}]})
    oid = r.json()["order"]["id"]

    # salon tries to bill it — since db is tenant-scoped, modified_count should be 0
    rs = salon.put(f"{BASE}/api/table-orders/mark-billed", json={"ids": [oid]})
    # either 200 with billed=0, or forbidden — both are acceptable isolation outcomes
    assert rs.status_code in (200, 403, 404)
    if rs.status_code == 200:
        assert rs.json().get("billed", 0) == 0

    # verify resto still sees it as 'new'
    rows = resto.get(f"{BASE}/api/table-orders").json()
    match = [x for x in rows if x["id"] == oid]
    assert match and match[0]["status"] == "new", "salon admin billed a restaurant order!"

    # cleanup — resto bills it
    resto.put(f"{BASE}/api/table-orders/mark-billed", json={"ids": [oid]})


def test_salon_listing_excludes_restaurant_orders(salon):
    rows = salon.get(f"{BASE}/api/table-orders").json()
    resto_tid = "821532fe-cb97-4043-9075-a8420cf7d65e"
    assert not any(r.get("tenant_id") == resto_tid for r in rows)


# ---------- AI image endpoint existence (no generation) ----------

def test_generate_service_image_endpoint_exists(resto):
    # POST without body must not 404 — should give 400/422 (validation) confirming the route exists
    r = resto.post(f"{BASE}/api/services/generate-image", json={})
    assert r.status_code != 404, "AI image generator endpoint missing"
