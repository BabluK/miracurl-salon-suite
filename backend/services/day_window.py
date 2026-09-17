"""Tenant-local calendar-day helpers shared by reports, staff portal and WhatsApp campaigns (no route imports → no cycles)."""
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import HTTPException

from zoneinfo import ZoneInfo


def _tenant_tz(t: Optional[dict]):
    try:
        return ZoneInfo(((t or {}).get("timezone")) or "Asia/Kolkata")
    except Exception:
        return ZoneInfo("Asia/Kolkata")


def _local_day_window(tz, date_str: Optional[str] = None, default_yesterday: bool = True) -> tuple[str, str, str]:
    """(date, utc_start_iso, utc_end_iso) for one calendar day in the tenant's timezone."""
    now_local = datetime.now(tz)
    if date_str:
        try:
            day = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError as e:
            raise HTTPException(400, "Invalid date, must be YYYY-MM-DD") from e
    else:
        day = (now_local - timedelta(days=1)).date() if default_yesterday else now_local.date()
    start_local = datetime(day.year, day.month, day.day, tzinfo=tz)
    end_local = datetime(day.year, day.month, day.day, 23, 59, 59, tzinfo=tz)
    utc_start = start_local.astimezone(timezone.utc).replace(tzinfo=None).isoformat() + "Z"
    utc_end = end_local.astimezone(timezone.utc).replace(tzinfo=None).isoformat() + "Z"
    return day.isoformat(), utc_start, utc_end


def _payment_mode_buckets(invs: list) -> tuple:
    buckets = {"card": 0.0, "upi": 0.0, "cash": 0.0, "wallet": 0.0, "other": 0.0}
    total = 0.0
    for inv in invs:
        amt = float(inv.get("total") or 0)
        total += amt
        mode = str(inv.get("payment_mode") or "other").lower()
        buckets[mode if mode in buckets else "other"] += amt
    return buckets, total


# Back-compat aliases without the underscore
tenant_tz = _tenant_tz
local_day_window = _local_day_window
payment_mode_buckets = _payment_mode_buckets
