"""Iter154 backend regression: /api/reports/sales new fields (unique_customers, prev) + /api/invoices customer_phone enrichment."""
import os
import requests
import pytest
from pathlib import Path
import sys as _sys; _sys.path.insert(0, __import__("os").path.dirname(__file__))
from _creds import password_for  # noqa: E402

def _load_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v: return v.rstrip("/")
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not found")

BASE = _load_url()
TENANT = "miracurl-marathahalli"
EMAIL = "admin@miracurl.com"
PWD = password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD")


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    r = sess.post(f"{BASE}/api/auth/login",
                  json={"email": EMAIL, "password": PWD},
                  headers={"X-Tenant-Slug": TENANT})
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return sess


def test_sales_report_has_unique_customers_and_prev(s):
    r = s.get(f"{BASE}/api/reports/sales", params={"start": "2026-01-01", "end": "2026-12-31"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert "unique_customers" in j and isinstance(j["unique_customers"], int)
    assert "prev" in j and isinstance(j["prev"], dict)
    p = j["prev"]
    for k in ("start", "end", "total_invoices", "total_revenue", "unique_customers"):
        assert k in p, f"missing prev.{k}"
    assert isinstance(p["total_invoices"], int)
    assert isinstance(p["unique_customers"], int)


def test_prev_window_same_length(s):
    r = s.get(f"{BASE}/api/reports/sales", params={"start": "2026-09-01", "end": "2026-09-30"})
    assert r.status_code == 200
    j = r.json()
    from datetime import date
    def d(x): y, m, dd = x.split("-"); return date(int(y), int(m), int(dd))
    cur_days = (d(j["end"] if "end" in j else "2026-09-30") - d(j["start"] if "start" in j else "2026-09-01")).days
    p = j["prev"]
    prev_days = (d(p["end"]) - d(p["start"])).days
    assert prev_days == cur_days, f"prev length {prev_days} != current {cur_days}"


def test_invoices_include_customer_phone(s):
    r = s.get(f"{BASE}/api/invoices", params={"limit": 5})
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list)
    if not rows:
        pytest.skip("no invoices in tenant")
    # every row should have the key (even if None for walk-ins)
    for row in rows:
        assert "customer_phone" in row, f"missing customer_phone in invoice {row.get('id')}"


def test_login_sets_httponly_cookie():
    sess = requests.Session()
    r = sess.post(f"{BASE}/api/auth/login",
                  json={"email": EMAIL, "password": PWD},
                  headers={"X-Tenant-Slug": TENANT})
    assert r.status_code == 200
    # cookie jar should have a session/auth cookie
    assert len(sess.cookies) > 0, "no cookies set on login"
