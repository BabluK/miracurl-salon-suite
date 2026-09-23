"""iter151 — salary payroll rule changes:
  1. Service commission (commission_pct) paid ONLY when monthly_target > 0 AND gross >= monthly_target
     otherwise commission_amount == 0 and commission_withheld == True
  2. Target bonus (target_commission_pct on FULL gross) paid only when target reached
  3. Product commission unchanged
  4. Overtime pro-rata (unit tested elsewhere) — still 0 when overtime_rate=0
  5. HQ employee token 12h → 15h; attendance record has overtime_hours/overtime_pay

Also regression: /api/hair-colors, /api/public/color/miracurl-marathahalli
"""
import os
import io
import pytest
import requests
import os as _os
import sys as _sys

_sys.path.insert(0, _os.path.dirname(__file__))
from _creds import password_for  # noqa: E402
from _creds import pw

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
SLUG = "miracurl-marathahalli"
ADMIN = {"email": "admin@miracurl.com", "password": password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD")}
STAFF = {"email": "priya.staff@miracurl.com", "password": pw("STAFF")}
MONTH = "2026-08"


def _csrf_headers(sess: requests.Session, extra=None):
    h = {"X-Owner-Pin": "4321"}
    csrf = sess.cookies.get("csrf_token") or ""
    if csrf:
        h["X-CSRF-Token"] = csrf
    if extra:
        h.update(extra)
    return h


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
        pytest.skip(f"Staff login failed: {r.status_code} {r.text[:200]}")
    return s


@pytest.fixture(scope="module")
def priya(admin_sess):
    r = admin_sess.get(f"{BASE}/api/staff")
    assert r.status_code == 200, r.text
    p = next((s for s in r.json() if "priya" in (s.get("name") or "").lower()), None)
    assert p, "Priya not found"
    return p


@pytest.fixture(scope="module")
def original_values(priya):
    return {
        "commission_pct": priya.get("commission_pct", 10.0),
        "monthly_target": priya.get("monthly_target", 0.0),
        "target_commission_pct": priya.get("target_commission_pct", 0.0),
        "monthly_base_salary": priya.get("monthly_base_salary", 0.0),
    }


def _put_priya(admin_sess, priya, overrides):
    """Full-body PUT (StaffIn requires name/role/phone) with overrides applied."""
    body = {k: v for k, v in priya.items() if k in {
        "name", "role", "phone", "email", "personal_email", "blood_group",
        "specialties", "commission_pct", "active", "image_url",
        "monthly_base_salary", "salary_visible", "shift_start", "shift_end",
        "week_off_day", "overtime_rate", "max_advance", "notice_period_days",
        "serving_notice", "notice_start_date", "monthly_target",
        "target_commission_pct", "last_working_day", "joining_date", "branch",
    }}
    body.update(overrides)
    r = admin_sess.put(f"{BASE}/api/staff/{priya['id']}", json=body,
                      headers=_csrf_headers(admin_sess))
    assert r.status_code == 200, f"PUT staff failed: {r.status_code} {r.text[:300]}"
    return r.json()


def _get_slip(staff_sess, month=MONTH):
    r = staff_sess.get(f"{BASE}/api/staff/me/salary-slip", params={"month": month})
    assert r.status_code == 200, r.text
    return r.json()


# ---- Cleanup: restore Priya at the very end ----
@pytest.fixture(scope="module", autouse=True)
def _restore(admin_sess, priya, original_values):
    yield
    try:
        _put_priya(admin_sess, priya, original_values)
        print(f"Restored Priya: {original_values}")
    except Exception as e:
        print(f"WARN: restore failed: {e}")


# ---------- Scenario A: monthly_target = 0 → commission withheld ----------
def test_A_commission_withheld_when_target_zero(admin_sess, staff_sess, priya):
    _put_priya(admin_sess, priya, {
        "commission_pct": 10, "monthly_target": 0,
        "target_commission_pct": 5, "monthly_base_salary": 25000,
    })
    slip = _get_slip(staff_sess)
    assert slip["commission_amount"] == 0, slip
    assert slip["commission_withheld"] is True, slip
    assert slip["target_bonus"] == 0, slip
    assert slip["target_achieved"] is False, slip
    # Net = base + product_commission + overtime + review_bonus - deductions
    expected_net = round(
        slip["monthly_base_salary"]
        + slip.get("product_commission_amount", 0)
        + slip.get("overtime_total", 0)
        + slip.get("review_bonus_total", 0)
        - slip.get("deductions_total", 0), 2)
    assert abs(slip["net_payable"] - expected_net) < 0.02, (slip["net_payable"], expected_net)
    print(f"A: commission_amount=0, withheld=True, target_bonus=0, net={slip['net_payable']}")


# ---------- Scenario B: tiny target reached ----------
def test_B_target_reached_pays_both(admin_sess, staff_sess, priya):
    _put_priya(admin_sess, priya, {
        "commission_pct": 10, "monthly_target": 1,
        "target_commission_pct": 5, "monthly_base_salary": 25000,
    })
    slip = _get_slip(staff_sess)
    if slip["gross_earnings"] <= 0:
        pytest.skip(f"No invoices in {MONTH} for Priya — cannot verify target-reached path")
    assert slip["target_achieved"] is True, slip
    assert slip["commission_withheld"] is False, slip
    expected_comm = round(slip["service_gross"] * 0.10, 2)
    assert abs(slip["commission_amount"] - expected_comm) < 0.05, slip
    expected_bonus = round(slip["gross_earnings"] * 0.05, 2)
    assert abs(slip["target_bonus"] - expected_bonus) < 0.05, slip
    print(f"B: commission={slip['commission_amount']} bonus={slip['target_bonus']} gross={slip['gross_earnings']}")


# ---------- Scenario C: pct=0, target reached → commission=0 not-withheld, bonus>0 ----------
def test_C_zero_commission_pct_not_withheld(admin_sess, staff_sess, priya):
    _put_priya(admin_sess, priya, {
        "commission_pct": 0, "monthly_target": 1,
        "target_commission_pct": 5, "monthly_base_salary": 25000,
    })
    slip = _get_slip(staff_sess)
    assert slip["commission_amount"] == 0, slip
    # withheld semantics: withheld is only True when pct>0 and target not reached
    assert slip["commission_withheld"] is False, slip
    if slip["gross_earnings"] > 0:
        assert slip["target_bonus"] > 0, slip
        assert slip["target_achieved"] is True, slip
    print(f"C: pct=0, withheld=False, bonus={slip['target_bonus']}")


# ---------- Scenario D: huge target → not reached → commission withheld, bonus=0 ----------
def test_D_huge_target_withheld(admin_sess, staff_sess, priya):
    _put_priya(admin_sess, priya, {
        "commission_pct": 10, "monthly_target": 1_000_000_000,
        "target_commission_pct": 5, "monthly_base_salary": 25000,
    })
    slip = _get_slip(staff_sess)
    assert slip["commission_amount"] == 0, slip
    assert slip["commission_withheld"] is True, slip
    assert slip["target_bonus"] == 0, slip
    assert slip["target_achieved"] is False, slip
    print("D: huge target — withheld=True, bonus=0")


# ---------- Scenario E: PDF download for withheld case ----------
def test_E_salary_pdf_withheld_200(admin_sess, priya):
    # State from D still applies (or ensure withheld again)
    _put_priya(admin_sess, priya, {
        "commission_pct": 10, "monthly_target": 1_000_000_000,
        "target_commission_pct": 5, "monthly_base_salary": 25000,
    })
    r = admin_sess.get(f"{BASE}/api/staff/{priya['id']}/salary-slip.pdf",
                      params={"month": MONTH})
    assert r.status_code == 200, r.text[:300]
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert len(r.content) > 500
    # Try text extract for "withheld" label (per spec: slip shows "withheld — monthly target ... not reached")
    try:
        try:
            from pypdf import PdfReader
        except ImportError:
            from PyPDF2 import PdfReader
        text = "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(r.content)).pages)
        print(f"PDF snippet: {text[:400]}")
        assert "withheld" in text.lower() or "not reached" in text.lower(), \
            f"Slip PDF should mention 'withheld' or 'not reached'. text={text[:600]}"
    except ImportError:
        print("pypdf not installed — skipping text assertion")


# ---------- Attendance: staff check-in / check-out fields ----------
def test_F_attendance_has_overtime_fields(staff_sess):
    # Try to check in (may be blocked by geo-fence — report but don't fail)
    r = staff_sess.post(f"{BASE}/api/staff/me/check-in",
                        json={"lat": 12.9573, "lng": 77.7011},
                        headers=_csrf_headers(staff_sess))
    print(f"check-in status={r.status_code} body={r.text[:200]}")
    checked_in = r.status_code == 200
    if checked_in:
        r2 = staff_sess.post(f"{BASE}/api/staff/me/check-out",
                             json={"lat": 12.9573, "lng": 77.7011},
                             headers=_csrf_headers(staff_sess))
        print(f"check-out status={r2.status_code}")
        if r2.status_code == 200:
            rec = r2.json()
            assert "overtime_hours" in rec, rec
            assert "overtime_pay" in rec, rec
            assert rec.get("overtime_pay") in (0, 0.0), rec
            return
    # Fallback: verify existing attendance records expose overtime fields
    rl = staff_sess.get(f"{BASE}/api/staff/me/attendance")
    assert rl.status_code == 200
    body = rl.json()
    records = body.get("records") if isinstance(body, dict) else body
    if not records:
        pytest.skip("No attendance records to inspect (geo-fence blocked check-in in preview)")
    # Any record with a check_in should have overtime fields
    with_checkin = [r for r in records if r.get("check_in_at")]
    if not with_checkin:
        pytest.skip(f"Geo-fence blocked check-in ({r.status_code}) and no historical records to inspect")
    rec = with_checkin[0]
    assert "overtime_hours" in rec and "overtime_pay" in rec, rec
    print(f"Historical record has OT fields: hours={rec.get('overtime_hours')} pay={rec.get('overtime_pay')}")


# ---------- Regression ----------
def test_R_hair_colors_200(admin_sess):
    r = admin_sess.get(f"{BASE}/api/hair-colors")
    assert r.status_code == 200, r.text[:200]
    j = r.json()
    assert isinstance(j, dict) and "colors" in j, j


def test_R_public_color_200():
    r = requests.get(f"{BASE}/api/public/color/{SLUG}")
    assert r.status_code == 200, r.text[:200]
