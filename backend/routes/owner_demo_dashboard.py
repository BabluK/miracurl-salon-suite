"""Temporary owner-only showcase dashboard (single branch) with fixed, illustrative figures.
Not connected to invoices/appointments. Opened with its own PIN; the owner deletes it from Settings."""
import random
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import _raw_db
from security import require_tenant_admin, current_tenant
from services.day_window import _tenant_tz
from datetime import datetime

router = APIRouter(prefix="/owner-dashboard", tags=["owner-dashboard"])

DEMO_PIN = "3642"
LAST_MONTH_TOTAL = 417270
THIS_MONTH_TOTAL = 292240
BRANCH = {"slug": "aecs", "name": "Miracurl Unisex Family Salon - AECS", "location": "AECS Layout, Brookefield, Bengaluru", "active": True}
STYLISTS = ["Anil Kumar", "Stela Rodrigues", "Priya Sharma", "Rahul Verma", "Meena Joseph"]
_DOW_W = {0: 0.82, 1: 0.9, 2: 0.95, 3: 1.0, 4: 1.15, 5: 1.5, 6: 1.38}


class PinIn(BaseModel):
    pin: str = Field(min_length=4, max_length=8)


def _check(t, body: PinIn):
    if t.get("owner_demo_dashboard_deleted"):
        raise HTTPException(404, "This dashboard has been removed")
    if body.pin.strip() != DEMO_PIN:
        raise HTTPException(403, "Incorrect PIN")


def _spread(total: int, days: list[date], seed: int) -> dict:
    rng = random.Random(seed)
    w = [_DOW_W[d.weekday()] * rng.uniform(0.86, 1.14) for d in days]
    s = sum(w)
    vals = [int(round(total * x / s / 10.0)) * 10 for x in w]
    vals[-1] += total - sum(vals)
    return dict(zip(days, vals))


def _period(name: str, label: str, days: list[date], by_day: dict, seed: int) -> dict:
    rng = random.Random(seed)
    rev = sum(by_day.get(d, 0) for d in days)
    avg_bill = rng.randint(860, 960)
    bills = max(0, int(round(rev / avg_bill))) if rev else 0
    bookings = bills + int(round(bills * rng.uniform(0.08, 0.16)))
    cash = int(rev * 0.0878 / 10.0) * 10
    card = int(round(rev * 0.20 / 10.0)) * 10
    upi = max(0, rev - cash - card)
    top_name = STYLISTS[rng.randrange(len(STYLISTS))] if rev else None
    top = {"name": top_name, "revenue": int(round(rev * rng.uniform(0.24, 0.31) / 10.0)) * 10,
           "services": int(round(bills * rng.uniform(0.28, 0.36)))} if top_name else None
    branch = {**BRANCH, "today": rev, "cash": cash, "upi": upi, "card": card,
              "appointments_today": bookings, "invoices_today": bills, "top_stylist": top}
    return {
        "key": name, "label": label,
        "range": {"from": days[0].isoformat(), "to": days[-1].isoformat()},
        "total": rev, "total_cash": cash, "total_upi": upi, "total_card": card,
        "total_bookings": bookings, "total_bills": bills, "top_stylist": top,
        "days": [{"date": d.isoformat(), "revenue": by_day.get(d, 0)} for d in days],
        "salons": [branch],
    }


def _build(today: date) -> dict:
    first = today.replace(day=1)
    last_month_end = first - timedelta(days=1)
    last_first = last_month_end.replace(day=1)
    this_days = [first + timedelta(days=i) for i in range((today - first).days + 1)]
    last_days = [last_first + timedelta(days=i) for i in range((last_month_end - last_first).days + 1)]
    by_day = {**_spread(LAST_MONTH_TOTAL, last_days, 4172), **_spread(THIS_MONTH_TOTAL, this_days, 2922)}
    # earlier days (for a last-week that reaches before last month) — small filler
    filler_days = [last_first - timedelta(days=i) for i in range(1, 15)]
    by_day.update(_spread(int(LAST_MONTH_TOTAL * 14 / 30), filler_days, 1414))
    monday = today - timedelta(days=today.weekday())
    prev_monday = monday - timedelta(days=7)
    yday = today - timedelta(days=1)
    periods = [
        _period("today", "Today", [today], by_day, 1),
        _period("yesterday", "Yesterday", [yday], by_day, 2),
        _period("week", "This week", [monday + timedelta(days=i) for i in range((today - monday).days + 1)], by_day, 3),
        _period("last_week", "Last week", [prev_monday + timedelta(days=i) for i in range(7)], by_day, 4),
        _period("month", "This month", this_days, by_day, 5),
        _period("last_month", "Last month", last_days, by_day, 6),
    ]
    return {"date": today.isoformat(), "branch": BRANCH, "periods": periods}


@router.get("/status")
async def status(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return {"available": not bool(t.get("owner_demo_dashboard_deleted"))}


@router.post("/unlock")
async def unlock(body: PinIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    _check(t, body)
    today = datetime.now(_tenant_tz(t)).date()
    return _build(today)


@router.post("/delete")
async def delete(body: PinIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    _check(t, body)
    await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"owner_demo_dashboard_deleted": True}})
    return {"ok": True}
