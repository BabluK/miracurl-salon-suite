"""Test auto-checkout after 12h open shift by inserting stale attendance doc."""
import os
import uuid
import datetime as dt
from datetime import timezone, timedelta
import requests

from creds import password_for
from pymongo import MongoClient

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "miracurl_db")
TENANT_ID = "83ab97b6-b481-4172-afd7-53a46c93317d"
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PASS = password_for("admin@miracurl.com")


def test_auto_checkout_stale_attendance():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    coll = db["attendance"]
    # Use a probe attendance id
    aid = f"TEST_autoclose_{uuid.uuid4()}"
    check_in = dt.datetime.now(timezone.utc) - timedelta(hours=15)
    doc = {
        "id": aid,
        "tenant_id": TENANT_ID,
        "staff_id": "TEST_AUTO_STAFF",
        "check_in_at": check_in.isoformat(),
        "check_out_at": None,
        "date": check_in.date().isoformat(),
        "hours_worked": 0,
        "late_minutes": 0,
        "late_penalty": 0,
        "overtime_hours": 0,
        "overtime_pay": 0,
        "auto_checked_out": False,
    }
    coll.insert_one(doc)
    try:
        s = requests.Session()
        r = s.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
        assert r.status_code == 200
        tok = r.cookies.get("access_token") or r.json().get("token")
        s.headers.update({"Authorization": f"Bearer {tok}"})
        # Hitting /attendance/today should trigger _auto_close_stale_attendance
        r = s.get(f"{BASE}/api/attendance/today", timeout=15)
        assert r.status_code == 200

        updated = coll.find_one({"id": aid})
        assert updated is not None
        assert updated.get("check_out_at") is not None, f"check_out_at not set: {updated}"
        assert updated.get("auto_checked_out"), f"auto_checked_out flag not set: {updated}"
        assert abs(float(updated.get("hours_worked", 0)) - 12.0) < 0.01, f"hours_worked expected 12, got {updated.get('hours_worked')}"
    finally:
        coll.delete_one({"id": aid})
        client.close()
