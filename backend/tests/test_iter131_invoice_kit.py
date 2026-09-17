"""Iteration 131 — Subscription Invoice Kit backend regression."""
import os
import re
import time

import pytest
import requests
import sys as _sys; _sys.path.insert(0, __import__("os").path.dirname(__file__))
from _creds import password_for  # noqa: E402

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE = _load_backend_url()

SUPER = {"email": "super@miracurl.com", "password": "og9T@41Es#OQb6"}
OWNER = {"email": "owner@elegance.com", "password": "Owner@123", "slug": "elegance-koramangala"}
ADMIN = {"email": "admin@miracurl.com", "password": password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD"), "slug": "miracurl-marathahalli"}

INV_NUM_RE = re.compile(r"^MC-2026-\d{4}$")


# --- fixtures --------------------------------------------------------
def _login(session: requests.Session, email: str, password: str, slug: str | None = None):
    headers = {}
    if slug:
        headers["X-Tenant-Slug"] = slug
    r = session.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, headers=headers)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    csrf = session.cookies.get("csrf_token")
    assert csrf, "csrf_token cookie missing"
    session.headers.update({"X-CSRF-Token": csrf})
    if slug:
        session.headers.update({"X-Tenant-Slug": slug})
    return session


@pytest.fixture(scope="module")
def super_client():
    s = requests.Session()
    return _login(s, SUPER["email"], SUPER["password"])


@pytest.fixture(scope="module")
def owner_client():
    s = requests.Session()
    return _login(s, OWNER["email"], OWNER["password"], OWNER["slug"])


@pytest.fixture(scope="module")
def elegance_tenant_id(super_client):
    r = super_client.get(f"{BASE}/api/super-admin/tenants")
    assert r.status_code == 200
    data = r.json()
    tenants = data.get("tenants", data) if isinstance(data, dict) else data
    for t in tenants:
        if t.get("slug") == "elegance-koramangala":
            return t["id"]
    pytest.skip("elegance-koramangala tenant missing")


# --- Biller identity -------------------------------------------------
def test_billing_identity_get(super_client):
    r = super_client.get(f"{BASE}/api/super-admin/billing-identity")
    assert r.status_code == 200
    d = r.json()
    assert "legal_name" in d and "email" in d


def test_billing_identity_bad_gstin(super_client):
    r = super_client.put(f"{BASE}/api/super-admin/billing-identity", json={
        "legal_name": "Miracurl AI Salon Suite", "address": "Marathahalli, Bengaluru, Karnataka 560037, India",
        "gstin": "SHORT", "pan": "", "gst_rate": 18, "state_code": "29",
        "email": "billing@miracurl-suite.com", "phone": "+91 74068 69271", "signatory": "Authorised Signatory",
    })
    assert r.status_code == 400, r.text


def test_billing_identity_valid_gstin_sets_state_code(super_client):
    r = super_client.put(f"{BASE}/api/super-admin/billing-identity", json={
        "legal_name": "Miracurl AI Salon Suite", "address": "Test Address",
        "gstin": "07AABCU9603R1ZP", "pan": "AABCU9603R", "gst_rate": 18, "state_code": "29",
        "email": "billing@miracurl-suite.com", "phone": "+91 74068 69271", "signatory": "Authorised Signatory",
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["gstin"] == "07AABCU9603R1ZP"
    assert d["state_code"] == "07"


def test_billing_identity_restore(super_client):
    r = super_client.put(f"{BASE}/api/super-admin/billing-identity", json={
        "legal_name": "Miracurl AI Salon Suite",
        "address": "Marathahalli, Bengaluru, Karnataka 560037, India",
        "gstin": "", "pan": "", "gst_rate": 18, "state_code": "29",
        "email": "billing@miracurl-suite.com", "phone": "+91 74068 69271",
        "signatory": "Authorised Signatory",
    })
    assert r.status_code == 200
    d = r.json()
    assert d["gstin"] == ""
    assert d["legal_name"] == "Miracurl AI Salon Suite"


# --- Create subscription + invoice ---------------------------------
@pytest.fixture(scope="module")
def created_invoice_ids(super_client, elegance_tenant_id):
    ids = []
    numbers = []
    for i in range(2):
        ts = int(time.time() * 1000) + i
        r = super_client.post(f"{BASE}/api/super-admin/subscriptions", json={
            "tenant_id": elegance_tenant_id, "plan": "half_year",
            "payment_method": "upi", "payment_ref": f"TEST-{ts}", "notes": "test",
        })
        assert r.status_code in (200, 201), f"create sub: {r.status_code} {r.text}"
        j = r.json()
        assert "invoice" in j, f"no invoice in response: {j}"
        inv = j["invoice"]
        assert INV_NUM_RE.match(inv["number"]), inv["number"]
        assert "email" in inv
        numbers.append(inv["number"])
    # look up ids from HQ invoice list by number
    r = super_client.get(f"{BASE}/api/super-admin/invoices")
    assert r.status_code == 200
    by_num = {row["number"]: row["id"] for row in r.json()["invoices"]}
    ids = [by_num[n] for n in numbers]
    # sequential/unique
    assert numbers[0] != numbers[1]
    n0 = int(numbers[0].split("-")[-1])
    n1 = int(numbers[1].split("-")[-1])
    assert n1 == n0 + 1, f"non-sequential: {numbers}"
    return ids


def test_hq_invoices_list_contains(super_client, created_invoice_ids):
    r = super_client.get(f"{BASE}/api/super-admin/invoices")
    assert r.status_code == 200
    rows = r.json()["invoices"]
    ids = {r["id"] for r in rows}
    for iid in created_invoice_ids:
        assert iid in ids
    sample = next(r for r in rows if r["id"] == created_invoice_ids[0])
    for k in ("number", "tenant_name", "plan_label", "period_start", "period_end", "amount", "method", "txn_ref", "email"):
        assert k in sample, f"missing {k}: {list(sample.keys())}"
    assert sample["amount"] == 12000
    assert sample["method"] == "upi"
    assert "biller" not in sample  # never expose biller in list


# --- PDF downloads ---------------------------------------------------
@pytest.mark.parametrize("kind", ["invoice", "receipt", "terms"])
def test_hq_pdf_download(super_client, created_invoice_ids, kind):
    iid = created_invoice_ids[0]
    r = super_client.get(f"{BASE}/api/super-admin/invoices/{iid}/{kind}.pdf")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/pdf")
    assert "attachment" in r.headers.get("content-disposition", "")
    assert r.content[:4] == b"%PDF"


def test_hq_pdf_unknown_kind(super_client, created_invoice_ids):
    r = super_client.get(f"{BASE}/api/super-admin/invoices/{created_invoice_ids[0]}/foo.pdf")
    assert r.status_code == 404


def test_hq_pdf_unknown_id(super_client):
    r = super_client.get(f"{BASE}/api/super-admin/invoices/00000000-0000-0000-0000-000000000000/invoice.pdf")
    assert r.status_code == 404


# --- Resend + backfill ----------------------------------------------
def test_resend_invoice(super_client, created_invoice_ids):
    r = super_client.post(f"{BASE}/api/super-admin/invoices/{created_invoice_ids[0]}/resend")
    # 502 acceptable if email provider fails on non-allowlisted domain
    assert r.status_code in (200, 502), r.text
    if r.status_code == 200:
        j = r.json()
        assert j["ok"] is True
        assert "sent_to" in j
        assert "hq_to" in j
        hq_set = set(j["hq_to"])
        expected = {"billing@miracurl-suite.com", "booking@miracurl-suite.com", "payments@miracurl-suite.com"}
        assert expected.issubset(hq_set), f"missing: {expected - hq_set}"
    else:
        print(f"Resend returned 502 — email provider issue: {r.text}")


def test_backfill_idempotent(super_client):
    r1 = super_client.post(f"{BASE}/api/super-admin/invoices/backfill")
    assert r1.status_code == 200
    j1 = r1.json()
    assert j1["ok"] is True and "created" in j1
    r2 = super_client.post(f"{BASE}/api/super-admin/invoices/backfill")
    assert r2.status_code == 200
    assert r2.json()["created"] == 0, r2.json()


# --- Tenant side isolation ------------------------------------------
def test_tenant_lists_only_own(owner_client, elegance_tenant_id):
    r = owner_client.get(f"{BASE}/api/billing/invoices")
    assert r.status_code == 200
    j = r.json()
    assert "invoices" in j
    for inv in j["invoices"]:
        assert inv["tenant_id"] == elegance_tenant_id
        assert "biller" not in inv


def test_tenant_can_download_own_pdf(owner_client):
    r = owner_client.get(f"{BASE}/api/billing/invoices")
    invs = r.json()["invoices"]
    if not invs:
        pytest.skip("no tenant invoices")
    iid = invs[0]["id"]
    r2 = owner_client.get(f"{BASE}/api/billing/invoices/{iid}/invoice.pdf")
    assert r2.status_code == 200
    assert r2.content[:4] == b"%PDF"


def test_tenant_cannot_access_other_tenant_invoice(super_client, owner_client):
    # find any invoice belonging to miracurl-marathahalli
    r = super_client.get(f"{BASE}/api/super-admin/invoices")
    other = None
    for inv in r.json()["invoices"]:
        if inv.get("tenant_slug") == "miracurl-marathahalli":
            other = inv["id"]
            break
    if not other:
        pytest.skip("no marathahalli invoice available")
    r2 = owner_client.get(f"{BASE}/api/billing/invoices/{other}/invoice.pdf")
    assert r2.status_code == 404


def test_tenant_forbidden_super_admin_endpoint(owner_client):
    r = owner_client.get(f"{BASE}/api/super-admin/invoices")
    assert r.status_code in (401, 403), r.status_code
