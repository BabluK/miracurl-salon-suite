"""Backend tests for invoice edit + audit trail feature (iteration 82)."""
from _creds import _PW_ADMIN
import os
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
TENANT = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PW = _PW_ADMIN
PIN = "4321"


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT, "Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def service_id(sess):
    r = sess.get(f"{BASE}/api/services")
    assert r.status_code == 200
    services = r.json()
    assert services, "No services in tenant"
    return services[0]


@pytest.fixture(scope="module")
def customer_id(sess):
    payload = {"name": f"TEST_EditCust_{uuid.uuid4().hex[:6]}", "phone": f"98{uuid.uuid4().int % 100000000:08d}"}
    r = sess.post(f"{BASE}/api/customers", json=payload)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


@pytest.fixture(scope="module")
def invoice(sess, service_id, customer_id):
    svc = service_id
    payload = {
        "customer_id": customer_id,
        "items": [{"type": "service", "ref_id": svc["id"], "name": svc["name"], "qty": 1, "price": float(svc.get("price", 500))}],
        "payment_mode": "cash",
    }
    r = sess.post(f"{BASE}/api/invoices", json=payload)
    assert r.status_code in (200, 201), r.text
    return r.json()


@pytest.fixture(scope="module")
def created_ids():
    return {"invoice": None, "customer": None, "edits": []}


class TestInvoiceEdit:
    def test_01_edit_invoice_success(self, sess, invoice, service_id, created_ids):
        created_ids["invoice"] = invoice["id"]
        svc = service_id
        body = {
            "editor_name": "Test Editor",
            "payment_mode": "card",
            "items": [{"type": "service", "ref_id": svc["id"], "name": svc["name"], "qty": 2, "price": float(svc.get("price", 500))}],
            "manual_discount": 50,
        }
        r = sess.put(f"{BASE}/api/invoices/{invoice['id']}", json=body, headers={"X-Owner-Pin": PIN})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["payment_mode"] == "card"
        assert data["last_edited_by"] == "Test Editor"
        assert data["edit_count"] == 1
        # subtotal = 2 * price
        expected_sub = 2 * float(svc.get("price", 500))
        assert abs(data["subtotal"] - expected_sub) < 0.5
        assert data["discount"] >= 50

    def test_02_edit_without_pin(self, sess, invoice):
        body = {"editor_name": "NoPin", "payment_mode": "cash"}
        r = sess.put(f"{BASE}/api/invoices/{invoice['id']}", json=body)
        assert r.status_code == 403
        assert "OWNER_PIN_REQUIRED" in r.text

    def test_03_edit_wrong_pin(self, sess, invoice):
        body = {"editor_name": "WrongPin", "payment_mode": "cash"}
        r = sess.put(f"{BASE}/api/invoices/{invoice['id']}", json=body, headers={"X-Owner-Pin": "0000"})
        assert r.status_code == 403
        assert "OWNER_PIN_REQUIRED" in r.text

    def test_04_validation_short_editor(self, sess, invoice):
        body = {"editor_name": "A", "payment_mode": "cash"}
        r = sess.put(f"{BASE}/api/invoices/{invoice['id']}", json=body, headers={"X-Owner-Pin": PIN})
        assert r.status_code == 422

    def test_05_validation_missing_editor(self, sess, invoice):
        body = {"payment_mode": "cash"}
        r = sess.put(f"{BASE}/api/invoices/{invoice['id']}", json=body, headers={"X-Owner-Pin": PIN})
        assert r.status_code == 422

    def test_06_validation_bad_payment_mode(self, sess, invoice):
        body = {"editor_name": "Test Editor", "payment_mode": "wallet"}
        r = sess.put(f"{BASE}/api/invoices/{invoice['id']}", json=body, headers={"X-Owner-Pin": PIN})
        assert r.status_code == 400

    def test_07_validation_empty_items(self, sess, invoice):
        body = {"editor_name": "Test Editor", "items": []}
        r = sess.put(f"{BASE}/api/invoices/{invoice['id']}", json=body, headers={"X-Owner-Pin": PIN})
        assert r.status_code == 400


class TestInvoiceEditsAudit:
    def test_08_list_edits_without_pin(self, sess):
        r = sess.get(f"{BASE}/api/invoice-edits")
        assert r.status_code == 403

    def test_09_list_edits_with_pin(self, sess, invoice, created_ids):
        r = sess.get(f"{BASE}/api/invoice-edits", headers={"X-Owner-Pin": PIN})
        assert r.status_code == 200
        edits = r.json()
        mine = [e for e in edits if e.get("invoice_id") == invoice["id"]]
        assert mine, "Audit entry not found for our invoice"
        e = mine[0]
        assert e["editor_name"] == "Test Editor"
        assert e["edited_by_account"] == ADMIN_EMAIL
        assert "before" in e and "after" in e
        assert e["before"]["total"] != e["after"]["total"] or e["before"]["payment_mode"] != e["after"]["payment_mode"]
        created_ids["edits"].append(e["id"])

    def test_10_bulk_delete_bogus_scope(self, sess):
        r = sess.delete(f"{BASE}/api/invoice-edits/bulk?scope=bogus", headers={"X-Owner-Pin": PIN})
        assert r.status_code == 400

    def test_11_bulk_delete_older_than_30d(self, sess, invoice):
        r = sess.delete(f"{BASE}/api/invoice-edits/bulk?scope=older_than_30d", headers={"X-Owner-Pin": PIN})
        assert r.status_code == 200
        assert r.json()["deleted"] == 0
        # Confirm still there
        r2 = sess.get(f"{BASE}/api/invoice-edits", headers={"X-Owner-Pin": PIN})
        assert any(e.get("invoice_id") == invoice["id"] for e in r2.json())

    def test_12_bulk_delete_all(self, sess, invoice):
        r = sess.delete(f"{BASE}/api/invoice-edits/bulk?scope=all", headers={"X-Owner-Pin": PIN})
        assert r.status_code == 200
        assert r.json()["deleted"] >= 1
        r2 = sess.get(f"{BASE}/api/invoice-edits", headers={"X-Owner-Pin": PIN})
        assert not any(e.get("invoice_id") == invoice["id"] for e in r2.json())


def test_99_cleanup(sess, created_ids, customer_id):
    inv_id = created_ids.get("invoice")
    if inv_id:
        sess.delete(f"{BASE}/api/invoices/{inv_id}", headers={"X-Owner-Pin": PIN})
    sess.delete(f"{BASE}/api/customers/{customer_id}", headers={"X-Owner-Pin": PIN})
