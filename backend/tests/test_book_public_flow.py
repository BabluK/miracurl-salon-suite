"""Backend tests for Miracurl public booking + registry (iteration 41).

Covers:
- Public gallery / salon / services / staff endpoints for slug
- Availability endpoint
- Full booking POST /api/public/book/{slug}
- Registry current_address field
- Registry PDF (fetched at most ONCE due to 10/10min rate limit)
"""
import os
import time
import datetime as dt
import requests
import pytest

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
SLUG = "miracurl-marathahalli"


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Public storefront endpoints ----------

def test_public_salon(sess):
    r = sess.get(f"{BASE_URL}/api/public/salon/{SLUG}")
    assert r.status_code == 200
    d = r.json()
    assert d.get("name")
    assert d.get("location")


def test_public_services(sess):
    r = sess.get(f"{BASE_URL}/api/public/services/{SLUG}")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) > 0
    s0 = data[0]
    assert "id" in s0 and "price" in s0 and "category" in s0


def test_public_staff(sess):
    r = sess.get(f"{BASE_URL}/api/public/staff/{SLUG}")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_public_gallery(sess):
    r = sess.get(f"{BASE_URL}/api/public/gallery/{SLUG}")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    if data:
        assert "url" in data[0]


def test_public_gallery_no_auth_needed(sess):
    # Ensure no cookies + still 200
    r = requests.get(f"{BASE_URL}/api/public/gallery/{SLUG}")
    assert r.status_code == 200


def test_public_availability(sess):
    tomorrow = (dt.date.today() + dt.timedelta(days=1)).isoformat()
    r = sess.get(f"{BASE_URL}/api/public/availability/{SLUG}?date={tomorrow}")
    assert r.status_code == 200
    d = r.json()
    assert "slots" in d


# ---------- Full booking flow ----------

def test_full_booking_flow(sess):
    services = sess.get(f"{BASE_URL}/api/public/services/{SLUG}").json()
    assert services, "need at least one service"
    svc = services[0]

    # Pick a date 2 days out to avoid same-day full-slot issues
    date = (dt.date.today() + dt.timedelta(days=2)).isoformat()
    avail = sess.get(f"{BASE_URL}/api/public/availability/{SLUG}?date={date}").json()
    slots = avail.get("slots", {})
    open_time = next((t for t, ok in slots.items() if ok), "11:00")

    payload = {
        "customer_name": "TEST_AutoBooker",
        "customer_phone": "9998887777",
        "customer_email": None,
        "gender": "Female",
        "service_ids": [svc["id"]],
        "staff_id": None,
        "scheduled_at": f"{date}T{open_time}:00+05:30",
        "notes": "auto-test",
        "referral_code": None,
        "coupon_code": None,
    }
    r = sess.post(f"{BASE_URL}/api/public/book/{SLUG}", json=payload)
    assert r.status_code == 200, f"booking failed: {r.status_code} {r.text[:400]}"
    d = r.json()
    assert "summary" in d
    s = d["summary"]
    assert s["customer_name"] == "TEST_AutoBooker"
    assert svc["name"] in s["service_names"]
    assert s.get("customer_referral_code")


# ---------- Registry ----------

def test_registry_public_profile_has_current_address(sess):
    r = sess.get(f"{BASE_URL}/api/public/registry/search?q=STF-00001")
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    # field should be present in schema (may be empty string / null)
    assert "current_address" in d, f"current_address missing from public profile keys={list(d.keys())}"


def test_registry_pdf_once(sess):
    # Fetch PDF only ONCE (rate limit 10/10min)
    r = sess.get(f"{BASE_URL}/api/public/registry/STF-00001/pdf")
    assert r.status_code == 200, f"pdf status={r.status_code} body={r.text[:200]}"
    assert r.headers.get("content-type", "").startswith("application/pdf")
    body = r.content
    assert body[:4] == b"%PDF", "response is not a valid PDF"
    assert len(body) > 1000
