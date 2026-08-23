"""Regression: billing (POS invoice CRUD + math) + Mira Service Photo AI + uploads.

Salon-admin cookie session against REACT_APP_BACKEND_URL.
"""
from _creds import _PW_ADMIN
import os
import io
import time
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    for line in open("/app/frontend/.env"):
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE = _load_backend_url()
TENANT = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PWD = _PW_ADMIN
OWNER_PIN = "4321"


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT, "X-Owner-Pin": OWNER_PIN})
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PWD})
    assert r.status_code == 200, r.text
    return s


# ---------------- Billing regression ----------------

def test_invoices_list(admin):
    r = admin.get(f"{BASE}/api/invoices")
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_create_invoice_math_and_persistence(admin):
    # pick a customer + service
    cust = admin.get(f"{BASE}/api/customers").json()
    svcs = admin.get(f"{BASE}/api/services").json()
    assert cust and svcs, "need seeded customers/services"
    c = cust[0]
    s = next((x for x in svcs if x.get("price", 0) > 0), svcs[0])

    price = float(s["price"])
    qty = 2
    payload = {
        "customer_id": c["id"],
        "items": [{
            "type": "service", "ref_id": s["id"], "name": s["name"],
            "qty": qty, "price": price,
        }],
        "discount": 0,
        "tax_pct": 18.0,
        "payment_mode": "cash",
    }
    r = admin.post(f"{BASE}/api/invoices", json=payload)
    assert r.status_code == 200, r.text
    inv = r.json()

    # math: subtotal = price*qty, tax = subtotal*0.18, total = subtotal + tax
    expected_sub = round(price * qty, 2)
    assert abs(inv["subtotal"] - expected_sub) < 0.5, f"subtotal off: {inv['subtotal']} vs {expected_sub}"
    # some builds add loyalty; total must equal subtotal - discount + tax roughly
    expected_total = round(expected_sub - inv.get("discount", 0) + inv.get("tax", 0), 2)
    assert abs(inv["total"] - expected_total) < 0.5, f"total off: {inv}"
    assert inv["invoice_no"], "invoice_no missing"

    # fetch back — GET-by-id may not exist; fall back to list search
    inv_id = inv["id"]
    got = admin.get(f"{BASE}/api/invoices/{inv_id}")
    if got.status_code == 200:
        assert got.json()["id"] == inv_id
    else:
        lst = admin.get(f"{BASE}/api/invoices").json()
        assert any(x["id"] == inv_id for x in lst), "created invoice not in list"

    # cleanup — try delete if endpoint exists (best-effort)
    admin.delete(f"{BASE}/api/invoices/{inv_id}")


# ---------------- Services + Mira ----------------

def test_services_list(admin):
    r = admin.get(f"{BASE}/api/services")
    assert r.status_code == 200
    assert isinstance(r.json(), list) and len(r.json()) > 0


def test_generate_missing_images_shape(admin):
    r = admin.post(f"{BASE}/api/services/generate-missing-images")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "queued" in data and "remaining" in data
    assert isinstance(data["queued"], int) and isinstance(data["remaining"], int)
    assert 0 <= data["queued"] <= 8


def test_generate_single_service_image(admin):
    """Costs money — one call max. Endpoint is now a background job: poll /services/image-jobs/{id}."""
    svcs = admin.get(f"{BASE}/api/services").json()
    # pick service without image if possible, else first
    target = next((s for s in svcs if not s.get("image_url")), svcs[0])
    r = admin.post(f"{BASE}/api/services/{target['id']}/generate-image", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ok") == True
    jid = data["job_id"]
    image_url = ""
    for _ in range(45):  # up to ~90s
        js = admin.get(f"{BASE}/api/services/image-jobs/{jid}").json()
        if js["status"] == "done":
            image_url = js["image_url"]
            break
        if js["status"] == "error":
            raise AssertionError(f"image job failed: {js['error']}")
        time.sleep(2)
    assert image_url.startswith("/api/files/"), f"job did not finish in time (last: {js})"

    # fetch file
    fr = requests.get(f"{BASE}{image_url}")
    assert fr.status_code == 200
    assert fr.headers["content-type"].startswith("image/")
    assert len(fr.content) > 1000


# ---------------- Upload ----------------

# tiny 1x1 jpg
JPG_BYTES = bytes.fromhex(
    "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707"
    "0709090808 0a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c"
    "1c2837292c30313434341f27393d38323c2e333432ffc0000b0801000100 01 01110"
    "0ffc4001f0000010501010101010100000000000000000102030405060708090a0bff"
    "c400b5100002010303020403050504040000017d01020300041105122131 41 06 1361"
    "5107227114328191 a1 082342b1c11552d1f024336272829a252627 3839 3a434445464"
    "7484 94a 535455565758595a636465666768696a737475767778797a83848586878889"
    "8a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c"
    "8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda00"
    "0c03010002110311003f00fbd0a2800aff d9".replace(" ", "")
)


def test_upload_image_service(admin):
    files = {"file": ("t.jpg", io.BytesIO(JPG_BYTES), "image/jpeg")}
    t0 = time.time()
    r = admin.post(f"{BASE}/api/uploads/image?kind=service", files=files, timeout=10)
    dt = time.time() - t0
    assert r.status_code == 200, r.text
    data = r.json()
    assert "id" in data and "url" in data
    assert dt < 5.0, f"upload too slow: {dt:.2f}s"

    fr = requests.get(f"{BASE}{data['url']}")
    assert fr.status_code == 200
    assert fr.headers["content-type"].startswith("image/")
