# Iter 28 — White-label branding: /api/public/review-info/{token} must return salon_name + salon_location
# derived from the appointment's tenant. Verify both tenants (miracurl-marathahalli and elegance-koramangala)
# return the correct salon_name in the enriched public review-info payload.
import os
import pytest
import requests
from creds import password_for

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback: read from /app/frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

CREDS = {
    "miracurl": {"email": "admin@miracurl.com", "password": password_for("admin@miracurl.com"), "expected_name_contains": "Miracurl"},
    "elegance": {"email": "owner@elegance.com", "password": "Owner@123", "expected_name_contains": "Elegance"},
}


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.cookies["access_token"], r.json()["user"]["tenant_id"]


def _get_tenant_info(token):
    r = requests.get(f"{BASE_URL}/api/tenants/current", headers={"Authorization": f"Bearer {token}"}, timeout=15)
    assert r.status_code == 200, f"tenant/current: {r.status_code} {r.text}"
    return r.json()


def _get_any_appointment(token):
    r = requests.get(f"{BASE_URL}/api/appointments", headers={"Authorization": f"Bearer {token}"}, timeout=15)
    assert r.status_code == 200, f"appointments: {r.status_code} {r.text}"
    data = r.json()
    return data[0] if data else None


def _create_appointment(token):
    # Get first service + staff + a customer to build an appointment
    h = {"Authorization": f"Bearer {token}"}
    svcs = requests.get(f"{BASE_URL}/api/services", headers=h, timeout=15).json()
    staff = requests.get(f"{BASE_URL}/api/staff", headers=h, timeout=15).json()
    custs = requests.get(f"{BASE_URL}/api/customers", headers=h, timeout=15).json()
    if not svcs:
        r = requests.post(f"{BASE_URL}/api/services", headers=h, json={
            "name": "TEST_Service", "price": 500, "duration_min": 30, "category": "Hair"
        }, timeout=15)
        assert r.status_code in (200, 201), f"create service: {r.status_code} {r.text}"
        svcs = [r.json()]
    if not staff:
        r = requests.post(f"{BASE_URL}/api/staff", headers=h, json={
            "name": "TEST_Stylist", "role": "Stylist", "phone": "9999911111", "active": True
        }, timeout=15)
        assert r.status_code in (200, 201), f"create staff: {r.status_code} {r.text}"
        staff = [r.json()]
    if not custs:
        c = requests.post(f"{BASE_URL}/api/customers", headers=h, json={
            "name": "TEST_WhiteLabel", "phone": "9999900000"
        }, timeout=15)
        assert c.status_code in (200, 201), c.text
        cust = c.json()
    else:
        cust = custs[0]
    payload = {
        "customer_id": cust["id"],
        "service_ids": [svcs[0]["id"]],
        "staff_id": staff[0]["id"],
        "scheduled_at": "2026-07-01T10:00:00+00:00",
    }
    r = requests.post(f"{BASE_URL}/api/appointments", headers=h, json=payload, timeout=15)
    assert r.status_code in (200, 201), f"create appt: {r.status_code} {r.text}"
    return r.json()


@pytest.mark.parametrize("tenant_key", ["miracurl", "elegance"])
def test_review_info_returns_salon_name_and_location(tenant_key):
    creds = CREDS[tenant_key]
    token, tenant_id = _login(creds["email"], creds["password"])
    tenant = _get_tenant_info(token)
    expected_name = tenant.get("name")
    expected_location = tenant.get("location")
    assert expected_name, f"tenant.name missing for {tenant_key}: {tenant}"

    appt = _get_any_appointment(token)
    if not appt:
        appt = _create_appointment(token)

    appt_id = appt["id"]

    # Public endpoint — no auth
    r = requests.get(f"{BASE_URL}/api/public/review-info/{appt_id}", timeout=15)
    assert r.status_code == 200, f"review-info: {r.status_code} {r.text}"
    data = r.json()

    # New fields present
    assert "salon_name" in data, f"salon_name missing from response: {data}"
    assert "salon_location" in data, f"salon_location missing from response: {data}"

    # Values match tenant record
    assert data["salon_name"] == expected_name, (
        f"salon_name mismatch: got {data['salon_name']!r}, expected {expected_name!r}"
    )
    assert data["salon_location"] == expected_location, (
        f"salon_location mismatch: got {data['salon_location']!r}, expected {expected_location!r}"
    )

    # Sanity: brand keyword matches
    assert creds["expected_name_contains"].lower() in data["salon_name"].lower(), (
        f"expected {creds['expected_name_contains']!r} inside salon_name={data['salon_name']!r}"
    )


def test_review_info_invalid_token_returns_404():
    r = requests.get(f"{BASE_URL}/api/public/review-info/nonexistent-token-xyz", timeout=15)
    assert r.status_code == 404


def test_review_info_response_shape_stable():
    """Ensure adding salon_name/location did NOT drop pre-existing keys."""
    token, _ = _login(CREDS["miracurl"]["email"], CREDS["miracurl"]["password"])
    appt = _get_any_appointment(token) or _create_appointment(token)
    r = requests.get(f"{BASE_URL}/api/public/review-info/{appt['id']}", timeout=15)
    assert r.status_code == 200
    data = r.json()
    for k in ("customer_name", "staff_name", "service_names", "scheduled_at",
              "already_submitted", "existing_rating", "salon_name", "salon_location"):
        assert k in data, f"missing key {k} in response: {list(data.keys())}"
