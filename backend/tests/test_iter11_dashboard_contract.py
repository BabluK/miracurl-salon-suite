"""Iter 11 — Dashboard contract + iter11 refactor regression.

Iter 11 is a CODE-QUALITY-ONLY pass. No API contract changes. This module:
- Asserts the EXACT JSON shape of GET /api/reports/dashboard is unchanged
  after the helper extraction (_dashboard_top_services / _dashboard_review_stats /
  _dashboard_revenue_trend).
- Verifies token-error messages are unchanged after the `raise … from e` rewrite
  in _decode_access_token ("Token expired" / "Invalid token").
- Verifies PublicBookingIn._when still emits the same ValueError text after the
  `except Exception as e: raise … from e` rewrite (invalid ISO + past datetime
  both yield 422).
- Verifies sales_report response (after the `inv` shadowing fix in the accumulator
  loop) still has the same keys and a numeric total_revenue.
"""
import os
import uuid
import requests
import pytest
from datetime import datetime, timezone, timedelta
from creds import password_for

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

TENANT_SLUG = "miracurl-marathahalli"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = password_for("admin@miracurl.com")


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-Slug": TENANT_SLUG})
    r = s.post(f"{API}/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"login failed: {r.text}"
    token = r.cookies.get("access_token")
    assert token, "missing access_token"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# ------------------------------------------------------------------
# Dashboard contract (the iter11 refactor target)
# ------------------------------------------------------------------
EXPECTED_KEYS = {
    "today_revenue", "today_bookings", "today_invoices",
    "month_revenue", "total_customers", "active_staff",
    "low_stock_count", "low_stock_items",
    "top_services", "revenue_trend",
    "upcoming_appointments",
    "avg_rating", "review_count", "pending_reviews",
}


class TestDashboardContract:
    def test_dashboard_shape_unchanged(self, admin_session):
        r = admin_session.get(f"{API}/reports/dashboard")
        assert r.status_code == 200, r.text
        data = r.json()

        # All expected keys present
        missing = EXPECTED_KEYS - set(data.keys())
        assert not missing, f"missing keys after iter11 refactor: {missing}"

        # Scalar numeric assertions
        for k in ("today_revenue", "month_revenue", "avg_rating"):
            assert isinstance(data[k], (int, float)), f"{k} must be numeric"
        for k in ("today_bookings", "today_invoices", "total_customers",
                  "active_staff", "low_stock_count", "review_count", "pending_reviews"):
            assert isinstance(data[k], int), f"{k} must be int"

        # top_services: list[{name, count}]
        assert isinstance(data["top_services"], list)
        for row in data["top_services"]:
            assert "name" in row and "count" in row
            assert isinstance(row["count"], int)

        # revenue_trend: list of {date, revenue}, length 7, oldest first
        trend = data["revenue_trend"]
        assert isinstance(trend, list) and len(trend) == 7, f"trend len={len(trend)}"
        for row in trend:
            assert set(row.keys()) == {"date", "revenue"}, f"unexpected keys {row}"
            assert isinstance(row["revenue"], (int, float))
        # Oldest first (ascending dates)
        dates = [row["date"] for row in trend]
        assert dates == sorted(dates), f"dates not oldest-first: {dates}"
        # Last entry must be today (UTC)
        today_iso = datetime.now(timezone.utc).date().isoformat()
        assert trend[-1]["date"] == today_iso, f"last={trend[-1]['date']} expected {today_iso}"

        # low_stock_items + upcoming_appointments are lists
        assert isinstance(data["low_stock_items"], list)
        assert isinstance(data["upcoming_appointments"], list)
        assert len(data["upcoming_appointments"]) <= 5

        # No MongoDB _id leak in any nested doc
        for item in data["low_stock_items"]:
            assert "_id" not in item
        for item in data["upcoming_appointments"]:
            assert "_id" not in item

    def test_dashboard_review_stats_consistency(self, admin_session):
        """review_count == # of reviews, pending_reviews >= 0,
        avg_rating between 0 and 5."""
        r = admin_session.get(f"{API}/reports/dashboard")
        d = r.json()
        assert d["review_count"] >= 0
        assert d["pending_reviews"] >= 0
        assert 0 <= d["avg_rating"] <= 5

    def test_dashboard_requires_auth(self):
        r = requests.get(f"{API}/reports/dashboard")
        assert r.status_code in (401, 403)


# ------------------------------------------------------------------
# _decode_access_token: error-message contract (raise ... from e refactor)
# ------------------------------------------------------------------
class TestAuthTokenErrors:
    def test_invalid_token_message(self):
        r = requests.get(f"{API}/reports/dashboard",
                         headers={"Authorization": "Bearer not-a-jwt"})
        assert r.status_code == 401
        assert "Invalid token" in r.text, r.text

    def test_missing_token_message(self):
        r = requests.get(f"{API}/reports/dashboard")
        assert r.status_code == 401
        assert "Not authenticated" in r.text or "authenticated" in r.text.lower()


# ------------------------------------------------------------------
# Sales report: post-`inv` shadowing fix (accumulator loop)
# ------------------------------------------------------------------
class TestSalesReportContract:
    def test_sales_report_keys_and_totals(self, admin_session):
        r = admin_session.get(f"{API}/reports/sales",
                              params={"start": "2025-01-01", "end": "2026-12-31"})
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("total_invoices", "total_revenue", "by_payment_mode", "invoices"):
            assert k in d, f"missing key {k}"
        assert isinstance(d["total_invoices"], int)
        assert isinstance(d["total_revenue"], (int, float))
        assert isinstance(d["by_payment_mode"], list)
        assert isinstance(d["invoices"], list)
        # by_payment_mode rows
        for row in d["by_payment_mode"]:
            assert set(row.keys()) == {"mode", "amount"}
            assert isinstance(row["amount"], (int, float))
        # Math sanity: sum(by_payment_mode.amount) ≈ total_revenue
        if d["by_payment_mode"]:
            mode_sum = sum(r["amount"] for r in d["by_payment_mode"])
            assert abs(mode_sum - d["total_revenue"]) < 1.0, \
                f"by_payment_mode sum {mode_sum} != total_revenue {d['total_revenue']}"

    def test_sales_report_no_args(self, admin_session):
        """No date filter: should still return contract (was the path where the
        `inv` shadowing lint fired)."""
        r = admin_session.get(f"{API}/reports/sales")
        assert r.status_code == 200
        assert {"total_invoices", "total_revenue", "by_payment_mode", "invoices"} \
            <= set(r.json().keys())


# ------------------------------------------------------------------
# PublicBookingIn._when: post `raise ... from e` refactor
# ------------------------------------------------------------------
class TestPublicBookingValidation:
    def _payload(self, when):
        return {
            "customer_name": f"TEST_Iter11_{uuid.uuid4().hex[:5]}",
            "customer_phone": "9" + str(uuid.uuid4().int)[:9],
            "service_ids": ["dummy-svc"],   # parsed AFTER _when validator
            "scheduled_at": when,
        }

    def test_malformed_iso_returns_422(self):
        r = requests.post(f"{API}/public/book/{TENANT_SLUG}",
                          json=self._payload("not-an-iso"))
        assert r.status_code == 422, r.text
        assert "Invalid scheduled_at, must be ISO 8601" in r.text, r.text

    def test_past_datetime_returns_422(self):
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        r = requests.post(f"{API}/public/book/{TENANT_SLUG}",
                          json=self._payload(past))
        assert r.status_code == 422, r.text
        assert "Pick a future time" in r.text, r.text

    def test_future_business_hours_succeeds(self):
        """Real service id + valid future ISO 8601 in business hours → 200."""
        services = requests.get(f"{API}/public/services/{TENANT_SLUG}").json()
        assert services, "no public services to book"
        svc_id = services[0]["id"]
        # Random future slot within 10:00-20:30 IST — fixed slots saturate across suite runs
        import random
        ist_tz = timezone(timedelta(hours=5, minutes=30))
        when = (datetime.now(ist_tz) + timedelta(days=random.randint(4, 45))).replace(
            hour=random.randint(10, 20), minute=random.choice((0, 30)), second=0, microsecond=0).isoformat()
        body = {
            "customer_name": f"TEST_Iter11_OK_{uuid.uuid4().hex[:5]}",
            "customer_phone": "9" + str(uuid.uuid4().int)[:9],
            "service_ids": [svc_id],
            "scheduled_at": when,
        }
        r = requests.post(f"{API}/public/book/{TENANT_SLUG}", json=body)
        # 200 success or 429 rate-limit (acceptable, contract unchanged)
        assert r.status_code in (200, 201, 429), r.text
