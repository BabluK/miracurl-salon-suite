"""Iteration 120 backend tests — Dashboard perf, invoice search/edit (customer sync),
Today's Collection math, WhatsApp approve-all/reject-all bulk endpoints."""
import os
import re
import time
import uuid
import pytest
import requests
from datetime import datetime

from _creds import _PW_ADMIN

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
TENANT = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
PIN = "4321"


def _csrf_header(sess: requests.Session) -> dict:
    t = sess.cookies.get("csrf_token")
    return {"X-CSRF-Token": t} if t else {}


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT, "Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": _PW_ADMIN})
    assert r.status_code == 200, f"Login failed {r.status_code}: {r.text}"
    # Merge CSRF into default headers so every POST/PUT/DELETE inherits it
    tok = s.cookies.get("csrf_token")
    if tok:
        s.headers["X-CSRF-Token"] = tok
    return s


# ---------------- Dashboard ------------------
class TestDashboard:
    def test_dashboard_perf_and_shape(self, sess):
        t0 = time.time()
        r = sess.get(f"{BASE}/api/reports/dashboard")
        dur = time.time() - t0
        assert r.status_code == 200, r.text
        assert dur < 3.0, f"Dashboard too slow: {dur:.2f}s"
        d = r.json()
        for k in ["today_revenue", "today_invoices", "revenue_trend",
                  "month_revenue", "total_customers", "active_staff",
                  "top_services", "avg_rating", "pending_reviews"]:
            assert k in d, f"Missing dashboard key: {k}"
        trend = d["revenue_trend"]
        assert isinstance(trend, list) and len(trend) == 7, f"Trend len={len(trend)}"
        dates = [t["date"] for t in trend]
        assert dates == sorted(dates), "Trend dates not ascending"


# ---------------- Invoice creation → Today's Collection math ----
@pytest.fixture(scope="module")
def service_id(sess):
    r = sess.get(f"{BASE}/api/services")
    assert r.status_code == 200
    services = r.json()
    assert services, "No services"
    return services[0]


@pytest.fixture(scope="module")
def bag():
    return {"invoice_id": None, "customer_id": None, "wa_ids": []}


class TestInvoicesAndCollection:
    def test_today_collection_math(self, sess, service_id, bag):
        r0 = sess.get(f"{BASE}/api/reports/dashboard")
        base_rev = float(r0.json()["today_revenue"])
        base_cnt = int(r0.json()["today_invoices"])

        cust_payload = {"name": f"TEST_Coll_{uuid.uuid4().hex[:5]}",
                        "phone": f"9{uuid.uuid4().int % 1000000000:09d}"[:10]}
        rc = sess.post(f"{BASE}/api/customers", json=cust_payload)
        assert rc.status_code in (200, 201), rc.text
        bag["customer_id"] = rc.json()["id"]

        svc = service_id
        price = float(svc.get("price") or 500)
        inv_payload = {
            "customer_id": bag["customer_id"],
            "items": [{"type": "service", "ref_id": svc["id"],
                       "name": svc["name"], "qty": 1, "price": price}],
            "payment_mode": "cash",
        }
        ri = sess.post(f"{BASE}/api/invoices", json=inv_payload)
        assert ri.status_code in (200, 201), ri.text
        inv = ri.json()
        bag["invoice_id"] = inv["id"]
        inv_total = float(inv["total"])

        time.sleep(0.5)
        r1 = sess.get(f"{BASE}/api/reports/dashboard")
        d = r1.json()
        assert abs(float(d["today_revenue"]) - (base_rev + inv_total)) < 0.5, \
            f"Revenue math off: was {base_rev}, +{inv_total}, now {d['today_revenue']}"
        assert int(d["today_invoices"]) == base_cnt + 1

    def test_invoice_search_by_no_name_phone_date(self, sess, bag):
        inv_id = bag["invoice_id"]
        # fetch invoice to get invoice_no + customer name/phone
        r = sess.get(f"{BASE}/api/invoices?limit=50")
        assert r.status_code == 200
        rows = r.json()
        me = next((x for x in rows if x["id"] == inv_id), None)
        assert me, "Just-created invoice not returned by list"
        inv_no = me["invoice_no"]

        # q = invoice_no
        r1 = sess.get(f"{BASE}/api/invoices?q={inv_no}")
        assert r1.status_code == 200
        assert any(x["id"] == inv_id for x in r1.json())

        # q = customer name substring
        name = me.get("customer_name") or ""
        if name:
            r2 = sess.get(f"{BASE}/api/invoices?q={name[:6]}")
            assert r2.status_code == 200
            assert any(x["id"] == inv_id for x in r2.json())

        # q = phone (10 digits)
        cust = sess.get(f"{BASE}/api/customers/{bag['customer_id']}").json()
        phone = re.sub(r"[^0-9]", "", cust.get("phone", ""))
        if len(phone) >= 4:
            r3 = sess.get(f"{BASE}/api/invoices?q={phone}")
            assert r3.status_code == 200
            assert any(x["id"] == inv_id for x in r3.json()), \
                "Phone search did not match created invoice"

        # date=today
        today = datetime.now().astimezone().date().isoformat()
        r4 = sess.get(f"{BASE}/api/invoices?date={today}&limit=200")
        assert r4.status_code == 200
        assert any(x["id"] == inv_id for x in r4.json())

        # limit respected
        r5 = sess.get(f"{BASE}/api/invoices?limit=2")
        assert r5.status_code == 200
        assert len(r5.json()) <= 2

    def test_edit_invoice_with_customer_sync(self, sess, bag, service_id):
        inv_id = bag["invoice_id"]
        # baseline
        cust_before = sess.get(f"{BASE}/api/customers/{bag['customer_id']}").json()
        spend_before = float(cust_before.get("total_spent") or 0)

        svc = service_id
        new_price = float(svc.get("price") or 500) + 111.0
        new_name = f"TEST_Renamed_{uuid.uuid4().hex[:4]}"
        new_phone = f"9998{uuid.uuid4().int % 1000000:06d}"

        body = {
            "editor_name": "Tester",
            "payment_mode": "upi",
            "items": [{"type": "service", "ref_id": svc["id"],
                       "name": svc["name"], "qty": 1, "price": new_price}],
            "manual_discount": 0,
            "customer_name": new_name,
            "customer_phone": new_phone,
        }
        r = sess.put(f"{BASE}/api/invoices/{inv_id}", json=body,
                     headers={"X-Owner-Pin": PIN})
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv["payment_mode"] == "upi"
        assert inv["customer_name"] == new_name
        assert inv["last_edited_by"] == "Tester"
        # customer synced
        cust_after = sess.get(f"{BASE}/api/customers/{bag['customer_id']}").json()
        assert cust_after["name"] == new_name
        got_phone = re.sub(r"[^0-9]", "", cust_after.get("phone", ""))
        assert got_phone.endswith(new_phone[-6:]), got_phone
        spend_after = float(cust_after.get("total_spent") or 0)
        # total_spent should reflect the delta (approx)
        # note: initial invoice creation likely already bumped total_spent; edit adds delta
        assert spend_after > spend_before - 0.01, \
            f"total_spent went down: {spend_before}->{spend_after}"

        # audit row exists
        edits = sess.get(f"{BASE}/api/invoice-edits",
                         headers={"X-Owner-Pin": PIN}).json()
        assert any(e.get("invoice_id") == inv_id and e.get("editor_name") == "Tester"
                   for e in edits), "Audit entry missing"


# ---------------- WhatsApp bulk endpoints -------------
class TestWhatsAppBulk:
    def _seed_pending(self, sess, n=3):
        ids = []
        for i in range(n):
            body = {
                "client_name": f"TEST_WA_{uuid.uuid4().hex[:5]}",
                "client_phone": f"98{uuid.uuid4().int % 100000000:08d}",
                "message": f"Hi, this is a test message {i}",
                "kind": "confirmation",
            }
            r = sess.post(f"{BASE}/api/whatsapp-requests", json=body)
            assert r.status_code in (200, 201), r.text
            ids.append(r.json()["id"])
        return ids

    def test_approve_all(self, sess, bag):
        # reject any pre-existing pending to isolate
        sess.post(f"{BASE}/api/whatsapp-requests/reject-all")
        ids = self._seed_pending(sess, 3)
        bag["wa_ids"].extend(ids)

        r = sess.post(f"{BASE}/api/whatsapp-requests/approve-all")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["approved"] >= 3
        assert isinstance(data.get("items"), list) and len(data["items"]) >= 3
        for it in data["items"]:
            assert "wa_url" in it and it["wa_url"].startswith("https://wa.me/")

        # verify docs approved via list endpoint
        got = sess.get(f"{BASE}/api/whatsapp-requests?status=approved").json()
        got_ids = {x["id"] for x in got}
        assert all(i in got_ids for i in ids), "Not all seeded WA requests marked approved"

    def test_reject_all(self, sess, bag):
        sess.post(f"{BASE}/api/whatsapp-requests/reject-all")  # clear
        ids = self._seed_pending(sess, 2)
        bag["wa_ids"].extend(ids)

        r = sess.post(f"{BASE}/api/whatsapp-requests/reject-all")
        assert r.status_code == 200, r.text
        assert r.json()["rejected"] >= 2

        got = sess.get(f"{BASE}/api/whatsapp-requests?status=rejected").json()
        got_ids = {x["id"] for x in got}
        assert all(i in got_ids for i in ids), "Not all seeded WA requests marked rejected"

    def test_single_approve_reject_still_work(self, sess, bag):
        sess.post(f"{BASE}/api/whatsapp-requests/reject-all")
        ids = self._seed_pending(sess, 2)
        bag["wa_ids"].extend(ids)
        r1 = sess.post(f"{BASE}/api/whatsapp-requests/{ids[0]}/approve")
        assert r1.status_code == 200 and "wa_url" in r1.json()
        r2 = sess.post(f"{BASE}/api/whatsapp-requests/{ids[1]}/reject")
        assert r2.status_code == 200


# ---------------- Cleanup ----------------
def test_zz_cleanup(sess, bag):
    if bag.get("invoice_id"):
        sess.delete(f"{BASE}/api/invoices/{bag['invoice_id']}",
                    headers={"X-Owner-Pin": PIN})
    if bag.get("customer_id"):
        sess.delete(f"{BASE}/api/customers/{bag['customer_id']}",
                    headers={"X-Owner-Pin": PIN})
    # clear whatsapp queue
    sess.post(f"{BASE}/api/whatsapp-requests/reject-all")
