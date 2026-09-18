"""Iteration 132 — Guest GST invoice PDF/email + settlement tracker."""
import os
from datetime import date

import fitz  # pymupdf
import pytest
import requests
import os as _os
import sys as _sys

_sys.path.insert(0, _os.path.dirname(__file__))
from _creds import password_for  # noqa: E402

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().rstrip("/")

SUPER = {"email": "super@miracurl.com", "password": "og9T@41Es#OQb6"}
ADMIN = {"email": "admin@miracurl.com", "password": password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD"), "slug": "miracurl-marathahalli"}
WHITE = {"slug": "miracurl-whitefield"}


def _login(s: requests.Session, email, password, slug=None):
    headers = {"X-Tenant-Slug": slug} if slug else {}
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, headers=headers)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    csrf = s.cookies.get("csrf_token")
    assert csrf
    s.headers.update({"X-CSRF-Token": csrf})
    if slug:
        s.headers.update({"X-Tenant-Slug": slug})
    return s


@pytest.fixture(scope="module")
def super_client():
    return _login(requests.Session(), SUPER["email"], SUPER["password"])


@pytest.fixture(scope="module")
def admin_client():
    return _login(requests.Session(), ADMIN["email"], ADMIN["password"], ADMIN["slug"])


@pytest.fixture(scope="module")
def paid_invoice_id(admin_client):
    r = admin_client.get(f"{BASE}/api/invoices")
    assert r.status_code == 200, r.text
    data = r.json()
    invs = data.get("invoices", data) if isinstance(data, dict) else data
    for inv in invs:
        if (inv.get("payment_status") or inv.get("status")) == "paid" or inv.get("paid"):
            return inv["id"]
    # fallback: any invoice
    if invs:
        return invs[0]["id"]
    pytest.skip("No invoices to test")


# ============== GUEST INVOICE PDF ==============
def test_guest_invoice_pdf_shape(admin_client, paid_invoice_id):
    r = admin_client.get(f"{BASE}/api/invoices/{paid_invoice_id}/pdf")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("application/pdf")
    assert r.content[:4] == b"%PDF"
    size = len(r.content)
    assert 50_000 <= size <= 3_000_000, f"PDF size {size} out of 50KB..3MB range"

    doc = fitz.open(stream=r.content, filetype="pdf")
    text = "\n".join(p.get_text() for p in doc)
    doc.close()
    for needle in ["TAX INVOICE", "GSTIN: 29ABCDE1234F1Z5", "CGST", "SGST", "Powered by Miracurl Suite", "In words:"]:
        assert needle in text, f"missing {needle!r} in PDF text (got {text[:400]!r})"


# ============== GUEST INVOICE EMAIL ==============
def test_invoice_email_delivered(admin_client, paid_invoice_id):
    r = admin_client.post(f"{BASE}/api/invoices/{paid_invoice_id}/email", json={"email": "delivered@resend.dev"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["ok"] is True
    assert "to" in j


def test_invoice_email_invalid(admin_client, paid_invoice_id):
    r = admin_client.post(f"{BASE}/api/invoices/{paid_invoice_id}/email", json={"email": "not-an-email"})
    assert r.status_code == 422, r.text


def test_invoice_email_unknown(admin_client):
    r = admin_client.post(f"{BASE}/api/invoices/00000000-0000-0000-0000-000000000000/email", json={"email": "delivered@resend.dev"})
    assert r.status_code == 404


# ============== SUBSCRIPTION PDFs BRANDED ==============
@pytest.fixture(scope="module")
def sub_invoice_id(super_client):
    r = super_client.get(f"{BASE}/api/super-admin/invoices")
    assert r.status_code == 200
    rows = r.json()["invoices"]
    if not rows:
        pytest.skip("no subscription invoices")
    return rows[0]["id"]


@pytest.mark.parametrize("kind,needle", [
    ("invoice", "MIRACURL SUITE"),
    ("receipt", "MIRACURL SUITE"),
    ("terms", "Terms & Conditions"),
])
def test_subscription_pdf_branded(super_client, sub_invoice_id, kind, needle):
    r = super_client.get(f"{BASE}/api/super-admin/invoices/{sub_invoice_id}/{kind}.pdf")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/pdf")
    assert len(r.content) < 3_000_000, f"{kind} PDF too big: {len(r.content)}"
    assert r.content[:4] == b"%PDF"
    doc = fitz.open(stream=r.content, filetype="pdf")
    text = "\n".join(p.get_text() for p in doc)
    doc.close()
    assert needle in text or needle.upper() in text.upper(), f"{kind}: missing {needle}"


# ============== SETTLEMENT TRACKER ==============
@pytest.fixture(scope="module")
def marathahalli_tid(super_client):
    r = super_client.get(f"{BASE}/api/super-admin/tenants")
    tenants = r.json().get("tenants", r.json()) if isinstance(r.json(), dict) else r.json()
    for t in tenants:
        if t.get("slug") == "miracurl-marathahalli":
            return t["id"]
    pytest.skip("marathahalli tenant missing")


@pytest.fixture(scope="module")
def whitefield_tid(super_client):
    r = super_client.get(f"{BASE}/api/super-admin/tenants")
    tenants = r.json().get("tenants", r.json()) if isinstance(r.json(), dict) else r.json()
    for t in tenants:
        if t.get("slug") == "miracurl-whitefield":
            return t["id"]
    return None


def test_settlements_list_shape(super_client, marathahalli_tid):
    r = super_client.get(f"{BASE}/api/super-admin/rewards-campaign/settlements")
    assert r.status_code == 200, r.text
    j = r.json()
    for k in ("rows", "summary", "payment_link", "campaign"):
        assert k in j
    sm = j["summary"]
    for k in ("outstanding", "collected", "pending_count", "overdue_count", "not_set_count", "salons"):
        assert k in sm
    slugs = {r_["slug"] for r_ in j["rows"]}
    assert "miracurl-marathahalli" in slugs


def test_settlement_put_overdue(super_client, marathahalli_tid):
    # past date -> overdue
    r = super_client.put(
        f"{BASE}/api/super-admin/rewards-campaign/settlements/{marathahalli_tid}",
        json={"amount": 4000, "due_date": "2026-09-01", "note": "2 Gold memberships redeemed"},
    )
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["ok"] is True
    assert j["status"] == "pending"
    # verify overdue
    r2 = super_client.get(f"{BASE}/api/super-admin/rewards-campaign/settlements")
    row = next(x for x in r2.json()["rows"] if x["tenant_id"] == marathahalli_tid)
    today = date.today().isoformat()
    if "2026-09-01" < today:
        assert row["status"] == "overdue"
    assert r2.json()["summary"]["outstanding"] >= 4000


def test_settlement_put_zero_not_set(super_client, whitefield_tid):
    if not whitefield_tid:
        pytest.skip("no whitefield tenant")
    r = super_client.put(
        f"{BASE}/api/super-admin/rewards-campaign/settlements/{whitefield_tid}",
        json={"amount": 0, "due_date": "", "note": ""},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "not_set"


def test_settlement_put_invalid_date(super_client, marathahalli_tid):
    r = super_client.put(
        f"{BASE}/api/super-admin/rewards-campaign/settlements/{marathahalli_tid}",
        json={"amount": 4000, "due_date": "abc", "note": ""},
    )
    assert r.status_code == 422


def test_remind_whatsapp(super_client, marathahalli_tid):
    r = super_client.post(
        f"{BASE}/api/super-admin/rewards-campaign/settlements/{marathahalli_tid}/remind",
        json={"channel": "whatsapp"},
    )
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["ok"] and j["channel"] == "whatsapp"
    assert 40 < len(j["text"]) < 900
    assert ("4,000" in j["text"]) or ("₹4,000" in j["text"]) or ("4000" in j["text"])
    assert j["whatsapp_url"].startswith("https://wa.me/91")
    assert "to" in j


def test_remind_email_no_notify(super_client, marathahalli_tid):
    # admin@miracurl.com is login-only, notify_email absent → 400
    r = super_client.post(
        f"{BASE}/api/super-admin/rewards-campaign/settlements/{marathahalli_tid}/remind",
        json={"channel": "email"},
    )
    assert r.status_code == 400, r.text


def test_remind_sms_invalid(super_client, marathahalli_tid):
    r = super_client.post(
        f"{BASE}/api/super-admin/rewards-campaign/settlements/{marathahalli_tid}/remind",
        json={"channel": "sms"},
    )
    assert r.status_code == 422


def test_reminders_grew(super_client, marathahalli_tid):
    r = super_client.get(f"{BASE}/api/super-admin/rewards-campaign/settlements")
    row = next(x for x in r.json()["rows"] if x["tenant_id"] == marathahalli_tid)
    assert len(row["reminders"]) >= 1


def test_mark_paid(super_client, marathahalli_tid):
    r = super_client.post(
        f"{BASE}/api/super-admin/rewards-campaign/settlements/{marathahalli_tid}/mark-paid",
        json={"method": "upi", "ref": "UTR123"},
    )
    assert r.status_code == 200
    r2 = super_client.get(f"{BASE}/api/super-admin/rewards-campaign/settlements")
    row = next(x for x in r2.json()["rows"] if x["tenant_id"] == marathahalli_tid)
    assert row["status"] == "paid"
    assert row["paid_method"] == "upi"
    assert row["paid_ref"] == "UTR123"
    assert r2.json()["summary"]["collected"] >= 4000


def test_remind_after_paid(super_client, marathahalli_tid):
    r = super_client.post(
        f"{BASE}/api/super-admin/rewards-campaign/settlements/{marathahalli_tid}/remind",
        json={"channel": "whatsapp"},
    )
    assert r.status_code == 400
    assert "paid" in r.text.lower()


def test_reopen(super_client, marathahalli_tid):
    r = super_client.post(f"{BASE}/api/super-admin/rewards-campaign/settlements/{marathahalli_tid}/reopen")
    assert r.status_code == 200
    r2 = super_client.get(f"{BASE}/api/super-admin/rewards-campaign/settlements")
    row = next(x for x in r2.json()["rows"] if x["tenant_id"] == marathahalli_tid)
    assert row["status"] in ("pending", "overdue")


def test_waive_then_restore(super_client, marathahalli_tid):
    r = super_client.post(f"{BASE}/api/super-admin/rewards-campaign/settlements/{marathahalli_tid}/waive")
    assert r.status_code == 200
    r2 = super_client.get(f"{BASE}/api/super-admin/rewards-campaign/settlements")
    row = next(x for x in r2.json()["rows"] if x["tenant_id"] == marathahalli_tid)
    assert row["status"] == "waived"
    # restore: reopen -> pending
    r3 = super_client.post(f"{BASE}/api/super-admin/rewards-campaign/settlements/{marathahalli_tid}/reopen")
    assert r3.status_code == 200


def test_mark_paid_no_amount(super_client, whitefield_tid):
    if not whitefield_tid:
        pytest.skip("no whitefield")
    r = super_client.post(
        f"{BASE}/api/super-admin/rewards-campaign/settlements/{whitefield_tid}/mark-paid",
        json={"method": "upi", "ref": ""},
    )
    assert r.status_code == 400


def test_unknown_tenant(super_client):
    r = super_client.put(
        f"{BASE}/api/super-admin/rewards-campaign/settlements/deadbeef-0000-0000-0000-000000000000",
        json={"amount": 100, "due_date": "", "note": ""},
    )
    assert r.status_code == 404


def test_tenant_view_settlement(admin_client):
    r = admin_client.get(f"{BASE}/api/settings/rewards-campaign")
    assert r.status_code == 200, r.text
    j = r.json()
    s = j.get("settlement")
    assert s is not None, "settlement should be present for marathahalli with amount set"
    assert s["amount"] == 4000
    assert s["status"] in ("pending", "overdue")


# ============== FINAL STATE cleanup: leave marathahalli pending 4000 ==============
def test_final_state_marathahalli_pending(super_client, marathahalli_tid):
    # ensure reopen (after waive->reopen) leaves it pending/overdue
    r = super_client.get(f"{BASE}/api/super-admin/rewards-campaign/settlements")
    row = next(x for x in r.json()["rows"] if x["tenant_id"] == marathahalli_tid)
    assert row["status"] in ("pending", "overdue")
    assert row["amount"] == 4000
