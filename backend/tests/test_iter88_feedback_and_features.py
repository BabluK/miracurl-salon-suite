"""Iteration 88: Feedback flow, HQ notifications sort, Salon Mira catalog, regression."""
from _creds import _PW_ADMIN, _PW_SUPER
import os
import re
import pytest
import requests

from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://hair-hub-system.preview.emergentagent.com').rstrip('/')
SUPER_EMAIL = "super@miracurl.com"
SUPER_PASS = _PW_SUPER
SALON_EMAIL = "admin@miracurl.com"
SALON_PASS = _PW_ADMIN
TENANT_SLUG = "miracurl-marathahalli"


@pytest.fixture(scope="module")
def super_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS})
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def salon_session():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT_SLUG})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": SALON_EMAIL, "password": SALON_PASS},
               headers={"X-Tenant-Slug": TENANT_SLUG})
    assert r.status_code == 200, f"salon login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def tenant_id(super_session):
    r = super_session.get(f"{BASE_URL}/api/super-admin/tenants")
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else (data.get("items") or data.get("tenants") or [])
    for t in items:
        if t.get("slug") == TENANT_SLUG:
            return t["id"]
    pytest.skip("miracurl-marathahalli tenant not found")


# ---------- FEEDBACK FLOW ----------
class TestFeedbackFlow:
    def test_create_and_submit_5star_publishes(self, super_session, tenant_id):
        r = super_session.post(f"{BASE_URL}/api/super-admin/feedback-requests",
                               json={"tenant_id": tenant_id, "context": "billing issue"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") == True
        assert "link" in d
        assert "email_sent" in d
        m = re.search(r"/feedback/([0-9a-f]+)", d["link"])
        assert m, f"bad link {d['link']}"
        token = m.group(1)

        # public info
        r2 = requests.get(f"{BASE_URL}/api/public/feedback/{token}")
        assert r2.status_code == 200
        info = r2.json()
        assert info["submitted"] == False
        assert "salon_name" in info

        # submit 5-star with comment
        payload = {"rating": 5, "comment": "Great support fixing our billing", "name": "Test Owner"}
        r3 = requests.post(f"{BASE_URL}/api/public/feedback/{token}", json=payload)
        assert r3.status_code == 200, r3.text
        d3 = r3.json()
        assert d3.get("ok") == True
        assert d3.get("published") == True

        # check testimonial appears
        r4 = requests.get(f"{BASE_URL}/api/public/testimonials")
        assert r4.status_code == 200
        tdata = r4.json()
        items = tdata.get("testimonials") or tdata.get("items") or (tdata if isinstance(tdata, list) else [])
        quotes = [x.get("quote") for x in items]
        assert any("Great support fixing our billing" in (q or "") for q in quotes), f"testimonial not published: {quotes[:3]}"

        # duplicate submit
        r5 = requests.post(f"{BASE_URL}/api/public/feedback/{token}", json=payload)
        assert r5.status_code == 200
        assert r5.json().get("already") == True

    def test_invalid_token_404(self):
        r = requests.get(f"{BASE_URL}/api/public/feedback/deadbeefdeadbeefdeadbeefdeadbeef")
        assert r.status_code == 404
        r2 = requests.post(f"{BASE_URL}/api/public/feedback/deadbeefdeadbeefdeadbeefdeadbeef",
                           json={"rating": 5, "comment": "x", "name": "y"})
        assert r2.status_code == 404

    def test_low_rating_not_published(self, super_session, tenant_id):
        r = super_session.post(f"{BASE_URL}/api/super-admin/feedback-requests",
                               json={"tenant_id": tenant_id, "context": "low rating test"})
        assert r.status_code == 200
        token = re.search(r"/feedback/([0-9a-f]+)", r.json()["link"]).group(1)
        r3 = requests.post(f"{BASE_URL}/api/public/feedback/{token}",
                           json={"rating": 2, "comment": "This 2-star comment MUST NOT appear XYZ12345", "name": "Sad"})
        assert r3.status_code == 200
        assert r3.json().get("published") == False
        # confirm absent
        r4 = requests.get(f"{BASE_URL}/api/public/testimonials")
        tdata = r4.json()
        items = tdata.get("testimonials") or tdata.get("items") or (tdata if isinstance(tdata, list) else [])
        assert not any("XYZ12345" in (x.get("quote") or "") for x in items)


# ---------- NOTIFICATIONS SORT ----------
class TestNotifications:
    def test_unread_first_and_picker_sent_field(self, super_session):
        r = super_session.get(f"{BASE_URL}/api/super-admin/notifications")
        assert r.status_code == 200, r.text
        d = r.json()
        items = d.get("items", [])
        # ordering: after first read=True, no unread=True allowed
        seen_read = False
        for it in items:
            if not it.get("unread"):
                seen_read = True
            elif seen_read:
                pytest.fail(f"unread item after read item: {it}")
        # demo items should carry picker_sent field
        demo_items = [i for i in items if i.get("type") == "demo"]
        for di in demo_items:
            assert "picker_sent" in di, f"demo item missing picker_sent: {di}"


# ---------- SALON MIRA CATALOG ----------
class TestSalonMiraCatalog:
    def test_mira_ask_knows_services(self, salon_session):
        r = salon_session.post(f"{BASE_URL}/api/tenant/mira/ask",
                               json={"question": "What services do we offer and who is on my team?"})
        assert r.status_code == 200, r.text
        # get salon's services for context check
        rs = salon_session.get(f"{BASE_URL}/api/services")
        assert rs.status_code == 200
        svcs = rs.json()
        svc_list = svcs if isinstance(svcs, list) else (svcs.get("items") or [])
        service_names = [s.get("name", "") for s in svc_list][:15]
        answer = (r.json().get("answer") or r.json().get("text") or "").lower()
        assert len(answer) > 5, f"empty answer: {r.json()}"
        # At least one service name should be mentioned
        matched = [n for n in service_names if n and n.lower() in answer]
        assert matched or len(service_names) == 0, f"no service names in answer. services={service_names[:5]} answer={answer[:300]}"


# ---------- REGRESSION ----------
class TestRegression:
    def test_services_list(self, salon_session):
        r = salon_session.get(f"{BASE_URL}/api/services")
        assert r.status_code == 200

    def test_branches_limit(self, salon_session):
        r = salon_session.get(f"{BASE_URL}/api/branches/limit")
        assert r.status_code == 200
        d = r.json()
        assert "limit" in d and "used" in d

    def test_manager_section_access_pin_required(self, salon_session):
        r = salon_session.post(f"{BASE_URL}/api/manager/section-access", json={"section": "/settings"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") == False
        assert d.get("pin_required") == True

    def test_service_categories_order_roundtrip(self, salon_session):
        rg = salon_session.get(f"{BASE_URL}/api/service-categories")
        assert rg.status_code == 200
        cats = rg.json()
        items = cats.get("items") or cats if isinstance(cats, list) else cats.get("items", [])
        if not items:
            pytest.skip("no categories to reorder")
        ids = [c["id"] for c in items]
        r = salon_session.put(f"{BASE_URL}/api/service-categories/order",
                              json={"order": ids},
                              headers={"X-Owner-Pin": "4321"})
        assert r.status_code == 200, r.text
