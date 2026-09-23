"""Iter-188: Verify new international USD pricing (no salon _half keys) and plan validation."""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().rstrip("/")

TENANT = "miracurl-marathahalli"
OWNER_EMAIL = "admin@miracurl.com"
OWNER_PWD = "q6QY@tn3p#9DtL"


# --------- Public plans ---------
def test_public_plans_intl_new_pricing():
    r = requests.get(f"{BASE}/api/public/plans", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    # data may be dict {key: {...}} or list; normalize
    if isinstance(data, dict):
        plans = data
    else:
        plans = {p.get("key") or p.get("plan"): p for p in data}
    # Required new intl keys with prices
    expected = {
        "intl_starter_monthly": 39,
        "intl_starter_annual": 390,
        "intl_pro_monthly": 79,
        "intl_pro_annual": 790,
        "intl_premium_monthly": 149,
        "intl_premium_annual": 1490,
        "intl_enterprise_monthly": 399,
    }
    for k, price in expected.items():
        assert k in plans, f"missing plan {k}"
        assert float(plans[k]["price"]) == float(price), f"{k} price {plans[k]['price']} != {price}"

    # Removed salon intl half keys
    for removed in ("intl_starter_half", "intl_pro_half", "intl_premium_half"):
        assert removed not in plans, f"{removed} should be removed"

    # INR & resto keys intact
    assert "half_year" in plans and float(plans["half_year"]["price"]) == 12000
    assert "annual" in plans and float(plans["annual"]["price"]) == 20000
    assert "resto_intl_half" in plans and float(plans["resto_intl_half"]["price"]) == 549


# --------- Import smoke ---------
def test_python_imports_smoke():
    import subprocess
    env = dict(os.environ)
    with open("/app/backend/.env") as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k] = v.strip().strip('"').strip("'")
    r = subprocess.run(
        ["python", "-c", "import routes.hq_documents, routes.lead_gen, routes.auth"],
        cwd="/app/backend", capture_output=True, text=True, timeout=30, env=env)
    assert r.returncode == 0, f"stdout={r.stdout} stderr={r.stderr}"


# --------- Subscription checkout plan validation ---------
@pytest.fixture(scope="module")
def owner_session():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT})
    # get csrf
    r = s.get(f"{BASE}/api/csrf", timeout=15)
    if r.status_code != 200:
        # maybe /csrf endpoint different; try login without and read cookie
        pass
    csrf = s.cookies.get("csrf_token")
    if csrf:
        s.headers["X-CSRF-Token"] = csrf
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": OWNER_EMAIL, "password": OWNER_PWD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    # refresh csrf after login
    csrf = s.cookies.get("csrf_token")
    if csrf:
        s.headers["X-CSRF-Token"] = csrf
    return s


def test_checkout_rejects_intl_pro_half(owner_session):
    r = owner_session.post(f"{BASE}/api/billing/stripe/checkout",
                           json={"plan": "intl_pro_half",
                                 "origin_url": "https://example.com"}, timeout=15)
    assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
    body = r.text.lower()
    assert "unknown plan" in body or "unknown" in body, f"expected 'Unknown plan' message: {r.text}"


def test_checkout_accepts_intl_pro_annual_validation(owner_session):
    """We only test validation passes plan lookup — do not complete Stripe payment.
    A valid plan should NOT return 400 'Unknown plan'. It may 200 (checkout url) or
    5xx if Stripe key missing, but not the 'Unknown plan' 400."""
    r = owner_session.post(f"{BASE}/api/billing/stripe/checkout",
                           json={"plan": "intl_pro_annual",
                                 "origin_url": "https://example.com"}, timeout=20)
    # Must not be 'Unknown plan' 400
    if r.status_code == 400:
        assert "unknown plan" not in r.text.lower(), \
            f"intl_pro_annual should be accepted: {r.text}"
    # Acceptable outcomes: 200 (checkout url), 402/5xx (stripe/env), or 400 for reasons other than unknown plan
    assert r.status_code in (200, 400, 402, 403, 500, 502, 503), r.status_code
