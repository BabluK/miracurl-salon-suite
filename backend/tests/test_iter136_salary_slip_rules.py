"""iter136 — salary slip rules fixes:
 - service commission always paid (never withheld)
 - overtime paid only if overtime_rate > 0
 - month-wise PDF download for owner (/api/staff/{sid}/salary-slip.pdf?month=YYYY-MM)
 - staff portal /api/staff/me/salary-slip JSON parity
"""
import io
import os
import re
import pytest
import requests
import os as _os
import sys as _sys

_sys.path.insert(0, _os.path.dirname(__file__))
from _creds import password_for  # noqa: E402

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = {"email": "admin@miracurl.com", "password": password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD")}
SLUG = "miracurl-marathahalli"
STAFF = {"email": "priya.staff@miracurl.com", "password": "Staff@5678"}
MONTH = "2026-08"


@pytest.fixture(scope="module")
def admin_sess():
    s = requests.Session()
    s.headers["X-Tenant-Slug"] = SLUG
    r = s.post(f"{BASE}/api/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def staff_sess():
    s = requests.Session()
    s.headers["X-Tenant-Slug"] = SLUG
    r = s.post(f"{BASE}/api/auth/login", json=STAFF)
    if r.status_code != 200:
        pytest.skip(f"Staff portal login failed: {r.status_code} {r.text[:200]}")
    return s


def _pdf_text(data: bytes) -> str:
    """Extract text from small reportlab PDF for regex assertions."""
    try:
        from pypdf import PdfReader
    except ImportError:
        from PyPDF2 import PdfReader
    reader = PdfReader(io.BytesIO(data))
    return "\n".join(p.extract_text() or "" for p in reader.pages)


def test_staff_list(admin_sess):
    r = admin_sess.get(f"{BASE}/api/staff")
    assert r.status_code == 200
    staff = r.json()
    assert isinstance(staff, list) and len(staff) > 0


def test_priya_slip_pdf_and_rules(admin_sess):
    staff = admin_sess.get(f"{BASE}/api/staff").json()
    priya = next((s for s in staff if "priya" in (s.get("name") or "").lower()), None)
    assert priya, "Priya Sharma not found"
    sid = priya["id"]
    r = admin_sess.get(f"{BASE}/api/staff/{sid}/salary-slip.pdf", params={"month": MONTH})
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("application/pdf")
    text = _pdf_text(r.content)
    print("PDF text sample:", text[:800])
    # Compute expected commission from JSON summary endpoint (admin uses staff/me endpoint via staff, but we can use PDF-only assertions)
    # Rule 1: service commission never withheld
    assert "withheld" not in text.lower(), "'withheld' should not appear in slip"
    pct = float(priya.get("commission_pct") or 0)
    # PDF format uses "Service commission (10.0%)" — pct is rendered with decimal from _compute_salary_for_month
    m = re.search(r"Service commission \(([\d.]+)%\)\s*Rs\.\s*([\d,]+\.\d{2})", text)
    assert m, f"Service commission line missing. text={text[:1000]}"
    slip_pct = float(m.group(1))
    slip_amt = float(m.group(2).replace(",", ""))
    assert abs(slip_pct - pct) < 0.05
    # find service gross line
    sg = re.search(r"Service gross for the month:\s*Rs\.\s*([\d,]+\.\d{2})", text)
    assert sg, "Service gross footer missing"
    service_gross = float(sg.group(1).replace(",", ""))
    expected = round(service_gross * pct / 100, 2)
    assert abs(slip_amt - expected) < 0.05, f"commission={slip_amt} expected~{expected} (sg={service_gross}, pct={pct})"
    # required labels present
    assert "Gross earnings" in text
    assert "Net payable" in text
    # Rule 2: overtime line only if overtime_rate > 0
    ot_rate = float(priya.get("overtime_rate") or 0)
    if ot_rate <= 0:
        assert "Overtime" not in text, "Overtime line should be hidden when overtime_rate=0"


def test_unknown_staff_404(admin_sess):
    r = admin_sess.get(f"{BASE}/api/staff/does-not-exist-xyz/salary-slip.pdf", params={"month": MONTH})
    assert r.status_code == 404


def test_invalid_month_400_or_fallback(admin_sess):
    staff = admin_sess.get(f"{BASE}/api/staff").json()
    sid = staff[0]["id"]
    r = admin_sess.get(f"{BASE}/api/staff/{sid}/salary-slip.pdf", params={"month": "abc"})
    # spec: "falls back or 400 (report behaviour, not a bug unless 500)"
    assert r.status_code in (200, 400), f"unexpected {r.status_code}: {r.text[:200]}"


def test_staff_portal_salary_slip_json(staff_sess):
    r = staff_sess.get(f"{BASE}/api/staff/me/salary-slip", params={"month": MONTH})
    assert r.status_code == 200, r.text
    j = r.json()
    pct = float(j["commission_pct"])
    sg = float(j["service_gross"])
    expected = round(sg * pct / 100, 2)
    assert abs(j["commission_amount"] - expected) < 0.05
    assert j["commission_withheld"] is False
    # Overtime rule check
    profile = staff_sess.get(f"{BASE}/api/staff/me/profile").json()
    if float(profile.get("overtime_rate") or 0) <= 0:
        assert j["overtime_total"] == 0
        assert j["overtime_hours_total"] == 0
    # Net payable equation
    computed = round(
        j["monthly_base_salary"]
        + j["commission_amount"]
        + j.get("product_commission_amount", 0)
        + j.get("target_bonus", 0)
        + j.get("review_bonus_total", 0)
        + j.get("overtime_total", 0)
        - j.get("deductions_total", 0),
        2,
    )
    assert abs(computed - j["net_payable"]) < 0.02, f"net payable {j['net_payable']} vs {computed}"


# ---- Regression ----

def test_attendance_month_list(admin_sess):
    r = admin_sess.get(f"{BASE}/api/attendance/today")
    assert r.status_code == 200


def test_staff_get_and_put_no_change(admin_sess):
    staff = admin_sess.get(f"{BASE}/api/staff").json()
    priya = next((s for s in staff if "priya" in (s.get("name") or "").lower()), staff[0])
    sid = priya["id"]
    # GET /api/staff/{sid} isn't exposed — use list payload; PUT with same data
    payload = {k: v for k, v in priya.items() if k not in ("_id", "id", "tenant_id", "created_at", "updated_at", "user_id", "aadhaar_last4", "temp_transfer", "away")}
    csrf = admin_sess.cookies.get("csrf_token") or admin_sess.cookies.get("csrf") or ""
    headers = {"X-Owner-Pin": "4321"}
    if csrf:
        headers["X-CSRF-Token"] = csrf
    r2 = admin_sess.put(f"{BASE}/api/staff/{sid}", json=payload, headers=headers)
    assert r2.status_code == 200, r2.text
