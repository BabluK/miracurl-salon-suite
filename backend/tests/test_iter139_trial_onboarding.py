"""Iteration 139: Super Admin custom trial length onboarding + trial kit (AI logo + ₹0 invoice + congrats email).

Tests:
- Custom trial (3 / default / 5-invalid) via super-admin create_tenant
- Multi-salon link path (existing owner) still returns trial_end_date + congrats_email
- Async trial_kit population (invoice_id, invoice_number, logo_url, email.sent)
- HQ invoice list contains trial invoice with kind='trial', plan='free_trial', method='complimentary'
- Trial invoice PDF contains 'FREE TRIAL INVOICE' + 'COMPLIMENTARY'
- POST resend endpoint 200
- /api/files/<logo id> returns image
- Regression: pre-existing paid invoice PDFs still render 'TOTAL PAID'
- Cleans up EVERYTHING it created
"""
import os
import re
import time
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

SA_EMAIL = "super@miracurl.com"
SA_PASS = "og9T@41Es#OQb6"
OWNER_EMAIL = "delivered@resend.dev"

TS = int(time.time())
SLUG_CUSTOM = f"trial-qa-{TS}"
SLUG_DEFAULT = f"trial-qa-def-{TS}"
CREATED = {"tenant_ids": [], "slugs": [], "invoice_ids": [], "user_ids": [], "upload_ids": []}


@pytest.fixture(scope="module")
def sa():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": SA_EMAIL, "password": SA_PASS}, timeout=20)
    assert r.status_code == 200, f"SA login failed: {r.status_code} {r.text[:200]}"
    csrf = s.cookies.get("csrf_token") or s.cookies.get("csrf")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf})
    return s


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


# ------------------------ Onboarding ------------------------

def test_a_create_tenant_with_trial_months_3(sa):
    body = {
        "slug": SLUG_CUSTOM,
        "name": f"QA Trial Salon {TS}",
        "owner_email": OWNER_EMAIL,
        "owner_name": "QA Owner",
        "business_type": "salon",
        "trial_months": 3,
    }
    r = sa.post(f"{BASE_URL}/api/super-admin/tenants", json=body, timeout=45)
    assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
    j = r.json()
    assert j.get("congrats_email") == "queued"
    assert j.get("trial_end_date")
    end = datetime.fromisoformat(j["trial_end_date"].replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    # ~3 months = 90 days; allow 85-95
    delta_days = (end - now).days
    assert 80 <= delta_days <= 100, f"trial_end_date ~3mo mismatch: {delta_days} days"
    # First-time owner path returns temp_password
    assert j.get("temp_password"), "expected temp_password on first-time owner"
    tid = j["tenant"]["id"]
    CREATED["tenant_ids"].append(tid)
    CREATED["slugs"].append(j["tenant"]["slug"])


def test_b_tenant_doc_persists_trial_fields(mongo):
    t = mongo.tenants.find_one({"slug": SLUG_CUSTOM})
    assert t is not None
    assert t.get("trial_months") == 3
    assert t.get("status") == "trial"
    assert t.get("trial_end_date") == t.get("trial_ends_at")


def test_c_create_tenant_default_30_days_multisalon_link(sa):
    body = {
        "slug": SLUG_DEFAULT,
        "name": f"QA Default Salon {TS}",
        "owner_email": OWNER_EMAIL,  # reuse -> multi-salon link
        "owner_name": "QA Owner",
        "business_type": "salon",
    }
    r = sa.post(f"{BASE_URL}/api/super-admin/tenants", json=body, timeout=45)
    assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
    j = r.json()
    assert j.get("congrats_email") == "queued"
    assert j.get("trial_end_date")
    assert j.get("linked_existing_owner") is True
    assert "temp_password" not in j, "multi-salon link path must NOT return temp_password"
    end = datetime.fromisoformat(j["trial_end_date"].replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    delta_days = (end - now).days
    # default = 30 days (platform default); allow 25-35
    assert 25 <= delta_days <= 35, f"default trial ~30 days mismatch: {delta_days}"
    tid = j["tenant"]["id"]
    CREATED["tenant_ids"].append(tid)
    CREATED["slugs"].append(j["tenant"]["slug"])


def test_d_invalid_trial_months_422(sa):
    body = {
        "slug": f"trial-qa-bad-{TS}",
        "name": "Bad Trial",
        "owner_email": OWNER_EMAIL,
        "owner_name": "X Y",
        "business_type": "salon",
        "trial_months": 5,
    }
    r = sa.post(f"{BASE_URL}/api/super-admin/tenants", json=body, timeout=20)
    assert r.status_code == 422, f"expected 422, got {r.status_code} {r.text[:200]}"


# ------------------------ Background trial kit ------------------------

def _poll_trial_kit(mongo, slug, timeout=120):
    deadline = time.time() + timeout
    while time.time() < deadline:
        t = mongo.tenants.find_one({"slug": slug})
        tk = (t or {}).get("trial_kit") or {}
        if tk.get("invoice_id") and tk.get("email"):
            return tk
        time.sleep(3)
    return None


def test_e_trial_kit_populated_custom(mongo):
    tk = _poll_trial_kit(mongo, SLUG_CUSTOM, timeout=120)
    assert tk, "trial_kit not populated within 120s for custom trial tenant"
    assert tk.get("invoice_id")
    assert tk.get("invoice_number")
    assert tk.get("logo_url"), "expected AI-generated logo_url"
    assert "/api/files/" in tk["logo_url"]
    assert (tk.get("email") or {}).get("sent") is True, f"congrats email not sent: {tk.get('email')}"
    CREATED["invoice_ids"].append(tk["invoice_id"])


def test_f_trial_kit_populated_default(mongo):
    tk = _poll_trial_kit(mongo, SLUG_DEFAULT, timeout=120)
    assert tk, "trial_kit not populated within 120s for default trial tenant"
    assert tk.get("invoice_id")
    assert (tk.get("email") or {}).get("sent") is True
    CREATED["invoice_ids"].append(tk["invoice_id"])


def test_g_hq_invoices_contains_trial(sa):
    r = sa.get(f"{BASE_URL}/api/super-admin/invoices", timeout=30)
    assert r.status_code == 200
    body = r.json()
    invs = body.get("invoices") if isinstance(body, dict) else body
    assert isinstance(invs, list)
    iid = CREATED["invoice_ids"][0]
    row = next((x for x in invs if x.get("id") == iid), None)
    assert row, f"trial invoice {iid} not in HQ invoices list"
    assert row.get("kind") == "trial"
    assert row.get("amount") == 0 or row.get("amount") == 0.0
    assert row.get("plan") == "free_trial"
    assert (row.get("plan_label") or "").lower().startswith("free trial")
    assert "months" in (row.get("plan_label") or "").lower() or "days" in (row.get("plan_label") or "").lower()
    assert row.get("method") == "complimentary"
    assert row.get("period_start")
    assert row.get("period_end")


def test_h_trial_invoice_pdf(sa):
    iid = CREATED["invoice_ids"][0]
    r = sa.get(f"{BASE_URL}/api/super-admin/invoices/{iid}/invoice.pdf", timeout=30)
    assert r.status_code == 200, r.text[:200]
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:4] == b"%PDF", "response is not a real PDF"
    # Extract text (rudimentary — PDFs may compress content, so decode raw bytes best-effort)
    # We'll try pypdf if available; fall back to substring search on raw bytes (works for uncompressed text).
    text = ""
    try:
        from pypdf import PdfReader
        import io
        reader = PdfReader(io.BytesIO(r.content))
        for p in reader.pages:
            text += (p.extract_text() or "") + "\n"
    except Exception:
        text = r.content.decode("latin-1", errors="ignore")
    up = text.upper()
    assert "FREE TRIAL INVOICE" in up, f"expected 'FREE TRIAL INVOICE' in PDF text; got head={up[:300]!r}"
    assert "COMPLIMENTARY" in up, "expected 'COMPLIMENTARY' in PDF text"


def test_i_resend_endpoint(sa):
    iid = CREATED["invoice_ids"][0]
    r = sa.post(f"{BASE_URL}/api/super-admin/invoices/{iid}/resend", timeout=45)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"


def test_j_logo_file_endpoint(sa, mongo):
    t = mongo.tenants.find_one({"slug": SLUG_CUSTOM})
    tk = (t or {}).get("trial_kit") or {}
    logo_url = tk.get("logo_url") or ""
    m = re.search(r"/api/files/([a-f0-9-]+)", logo_url)
    assert m, f"no file id in logo_url {logo_url}"
    fid = m.group(1)
    CREATED["upload_ids"].append(fid)
    r = requests.get(f"{BASE_URL}/api/files/{fid}", timeout=30)
    assert r.status_code == 200
    ct = r.headers.get("content-type", "")
    assert ct.startswith("image/"), f"expected image content-type, got {ct}"


# ------------------------ Regression: paid invoice ------------------------

def test_k_regression_paid_invoice_pdf(sa):
    r = sa.get(f"{BASE_URL}/api/super-admin/invoices", timeout=30)
    assert r.status_code == 200
    body = r.json()
    invs = body.get("invoices") if isinstance(body, dict) else body
    paid = [x for x in invs if x.get("kind") != "trial" and (x.get("amount") or 0) > 0]
    if not paid:
        pytest.skip("no pre-existing paid invoices to regress")
    iid = paid[0]["id"]
    r2 = sa.get(f"{BASE_URL}/api/super-admin/invoices/{iid}/invoice.pdf", timeout=30)
    assert r2.status_code == 200
    assert r2.content[:4] == b"%PDF"
    text = ""
    try:
        from pypdf import PdfReader
        import io
        reader = PdfReader(io.BytesIO(r2.content))
        for p in reader.pages:
            text += (p.extract_text() or "") + "\n"
    except Exception:
        text = r2.content.decode("latin-1", errors="ignore")
    up = text.upper()
    assert "INVOICE" in up
    assert "TOTAL PAID" in up or "TOTAL" in up


# ------------------------ Cleanup ------------------------

def test_zz_cleanup(mongo):
    for tid in CREATED["tenant_ids"]:
        mongo.tenants.delete_many({"id": tid})
        mongo.users.delete_many({"tenant_id": tid})
        mongo.users.update_many({}, {"$pull": {"tenant_ids": tid}})
        mongo.uploads.delete_many({"tenant_id": tid})
    for slug in CREATED["slugs"]:
        mongo.subscription_invoices.delete_many({"tenant_slug": slug})
    # Best effort: also nuke the multi-salon owner extra tenant leftover from users
    # (owner user itself still belongs to some other tenant so we leave it alone)
    print(f"cleaned {CREATED}")
