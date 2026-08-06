"""Reports & dashboards: staff performance, sales, daily, commissions, review blast targets."""
import asyncio
import os
import re
import uuid
from pydantic import BaseModel, Field
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from database import db, _raw_db
from security import get_current_user, require_admin, require_tenant_admin, require_owner_pin, current_tenant, branch_lock

router = APIRouter()


@router.get("/reports/weekly-digest")
async def weekly_digest(user=Depends(require_admin), t=Depends(current_tenant)):
    """Last week's business digest + a WhatsApp-ready share text for the owner."""
    from routes.super_admin_ops import _tenant_week_stats, _rule_based_tip
    ist = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    monday_this = (ist - timedelta(days=ist.weekday())).date()
    start = (monday_this - timedelta(days=7)).isoformat()
    end = monday_this.isoformat()
    stats = await _tenant_week_stats(t["id"], start, end)
    tip = _rule_based_tip(stats)
    trend = "📈" if stats["revenue"] >= stats.get("prev_revenue", 0) else "📉"
    top = "\n".join(f"  {i + 1}. {n} — ₹{v:,.0f}" for i, (n, v) in enumerate(stats.get("top_services") or []))
    week_label = f"{start} → {(monday_this - timedelta(days=1)).isoformat()}"
    wa_text = (f"✦ {t.get('name')} — Weekly Digest ({week_label})\n\n"
               f"{trend} Revenue: ₹{stats['revenue']:,.0f} (previous week ₹{stats.get('prev_revenue', 0):,.0f})\n"
               f"🧾 Bills: {stats['invoices']} · Avg bill ₹{stats['avg_bill']:,.0f}\n"
               f"✨ New guests: {stats['new_customers']}\n"
               + (f"🏆 Top services:\n{top}\n" if top else "")
               + f"\n💡 Tip: {tip}\n\n— Mira, Miracurl Suite ✦")
    return {"week_label": week_label,
            "revenue": stats["revenue"], "prev_revenue": stats.get("prev_revenue", 0),
            "invoices": stats["invoices"], "avg_bill": stats["avg_bill"],
            "new_customers": stats["new_customers"],
            "top_services": stats.get("top_services") or [], "tip": tip, "wa_text": wa_text}

async def _dashboard_top_services(limit: int = 5) -> list:
    pipeline = [
        {"$unwind": "$service_names"},
        {"$group": {"_id": "$service_names", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}, {"$limit": limit},
    ]
    rows = await db.appointments.aggregate(pipeline).to_list(limit)
    return [{"name": t["_id"], "count": t["count"]} for t in rows]


async def _dashboard_review_stats() -> dict:
    all_reviews = await db.reviews.find({}, {"_id": 0, "rating": 1}).to_list(2000)
    count = len(all_reviews)
    avg = round(sum(r["rating"] for r in all_reviews) / count, 2) if count else 0
    # Pending = the same list the "review blast" sends to: recent completed visits with a
    # real, still-existing customer — not an all-time count that ghosts can inflate.
    pending = len(await _blast_targets())
    return {"avg_rating": avg, "review_count": count, "pending_reviews": pending}


async def _dashboard_revenue_trend(days: int = 7) -> list:
    trend = []
    for offset in range(days - 1, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=offset)).date().isoformat()
        rows = await db.invoices.find(
            {"created_at": {"$regex": f"^{d}"}, "status": {"$nin": ["voided", "open"]}},
            {"_id": 0, "total": 1}).to_list(500)
        trend.append({"date": d, "revenue": round(sum(r["total"] for r in rows), 2)})
    return trend


def _invoice_staff_buckets(inv: dict) -> dict:
    """Per-staff {revenue, services, sname} buckets for one invoice's items."""
    buckets = {}
    for it in (inv.get("items") or []):
        sid = it.get("staff_id") or inv.get("staff_id") or "unassigned"
        b = buckets.setdefault(sid, {"revenue": 0.0, "services": 0, "sname": it.get("staff_name")})
        b["revenue"] += (it.get("qty") or 1) * (it.get("price") or 0)
        b["services"] += (it.get("qty") or 1)
    return buckets


def _parse_invoice_created_ist(inv: dict, ist) -> Optional[datetime]:
    try:
        created = datetime.fromisoformat(inv["created_at"])
    except (ValueError, TypeError, KeyError):
        return None
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return created.astimezone(ist)


@router.get("/reports/staff-performance")
async def staff_performance(user=Depends(get_current_user)):
    """Revenue per stylist for today / this week / this month / last month (IST)."""
    ist = timezone(timedelta(hours=5, minutes=30))
    now = datetime.now(ist)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)
    last_month_start = (month_start - timedelta(days=1)).replace(day=1)
    periods = {
        "today": (today_start, None),
        "week": (week_start, None),
        "month": (month_start, None),
        "last_month": (last_month_start, month_start),
    }
    since_utc = last_month_start.astimezone(timezone.utc).isoformat()
    invoices, staff_docs = await asyncio.gather(
        db.invoices.find({"created_at": {"$gte": since_utc}, "status": {"$nin": ["voided", "open"]}},
                         {"_id": 0, "items": 1, "staff_id": 1, "staff_name": 1, "created_at": 1}).to_list(5000),
        db.staff.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(100),
    )
    names = {s["id"]: s["name"] for s in staff_docs}
    out = {k: {} for k in periods}
    for inv in invoices:
        c_ist = _parse_invoice_created_ist(inv, ist)
        if c_ist is None:
            continue
        buckets = _invoice_staff_buckets(inv)
        for key, (start, end) in periods.items():
            if c_ist >= start and (end is None or c_ist < end):
                for sid, b in buckets.items():
                    rec = out[key].setdefault(sid, {
                        "staff_id": sid,
                        "name": names.get(sid) or b.get("sname") or inv.get("staff_name") or "Unassigned",
                        "revenue": 0.0, "bills": 0, "services": 0})
                    rec["revenue"] += b["revenue"]
                    rec["services"] += b["services"]
                    rec["bills"] += 1
    result = {k: sorted(v.values(), key=lambda r: -r["revenue"]) for k, v in out.items()}
    last_month_end = month_start - timedelta(days=1)
    result["ranges"] = {
        "today": {"start": today_start.date().isoformat(), "end": now.date().isoformat()},
        "week": {"start": week_start.date().isoformat(), "end": now.date().isoformat()},
        "month": {"start": month_start.date().isoformat(), "end": now.date().isoformat()},
        "last_month": {"start": last_month_start.date().isoformat(), "end": last_month_end.date().isoformat()},
    }
    return result


def _branch_query(branch, tenant=None):
    if branch == "__main__":
        # Main salon = every record NOT tagged to a configured branch.
        # (Real-world data carries legacy/free-form names, so an "empty only"
        # filter silently blanks out dashboards — see prod RCA 2026-08-02.)
        names = [b.get("name") for b in ((tenant or {}).get("branches") or []) if b.get("name")]
        return {"branch_name": {"$nin": names}} if names else {}
    if not branch:
        return {}
    ors = [{"branch_name": {"$regex": f"^\\s*{re.escape(branch.strip())}\\s*$", "$options": "i"}}]
    b = next((x for x in ((tenant or {}).get("branches") or [])
              if (x.get("name") or "").strip().casefold() == branch.strip().casefold()), None)
    if b and b.get("id"):
        ors.append({"branch_id": b["id"]})
    return {"$or": ors}


@router.get("/reports/dashboard")
async def dashboard(branch: Optional[str] = None, user=Depends(require_admin), t=Depends(current_tenant)):
    branch = branch_lock(user, branch)
    today = datetime.now(timezone.utc).date().isoformat()
    month_prefix = datetime.now(timezone.utc).strftime("%Y-%m")
    branch_flt = {**_branch_query(branch, t), "status": {"$nin": ["voided", "open"]}}
    invoices_today = await db.invoices.find({"created_at": {"$regex": f"^{today}"}, **branch_flt}, {"_id": 0}).to_list(500)
    invoices_month = await db.invoices.find({"created_at": {"$regex": f"^{month_prefix}"}, **branch_flt}, {"_id": 0}).to_list(2000)
    appts_today = await db.appointments.find({"scheduled_at": {"$regex": f"^{today}"}}, {"_id": 0}).to_list(500)
    low_stock = await db.products.find({"$expr": {"$lte": ["$stock", "$low_stock_threshold"]}}, {"_id": 0}).to_list(50)
    review_stats = await _dashboard_review_stats()
    return {
        "today_revenue": round(sum(inv["total"] for inv in invoices_today), 2),
        "today_bookings": len(appts_today),
        "today_invoices": len(invoices_today),
        "month_revenue": round(sum(inv["total"] for inv in invoices_month), 2),
        "total_customers": await db.customers.count_documents({"crm_status": {"$ne": "pending"}}),
        "active_staff": await db.staff.count_documents({"active": True}),
        "low_stock_count": len(low_stock),
        "low_stock_items": low_stock[:10],
        "top_services": await _dashboard_top_services(),
        "revenue_trend": await _dashboard_revenue_trend(),
        "upcoming_appointments": appts_today[:5],
        **review_stats,
    }

# India Standard Time offset — reports are anchored to the salon's local day, not UTC.
IST_OFFSET = timedelta(hours=5, minutes=30)


def _ist_day_window(date_str: Optional[str] = None) -> tuple[str, str, str]:
    """Return (date_yyyy_mm_dd, utc_start_iso, utc_end_iso) for an IST calendar day.
    Default: yesterday in IST. Used by the daily report so a 10 PM IST invoice
    counts on the correct business day."""
    now_ist = datetime.now(timezone.utc) + IST_OFFSET
    if date_str:
        try:
            day = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError as e:
            raise HTTPException(400, "Invalid date, must be YYYY-MM-DD") from e
    else:
        day = (now_ist - timedelta(days=1)).date()
    ist_start = datetime(day.year, day.month, day.day, 0, 0, 0)
    ist_end = datetime(day.year, day.month, day.day, 23, 59, 59)
    utc_start = (ist_start - IST_OFFSET).isoformat() + "Z"
    utc_end = (ist_end - IST_OFFSET).isoformat() + "Z"
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


def _daily_staff_agg(invs: list) -> dict:
    """staff_id -> {gross, invoice_ids}; item-level staff_id wins over invoice's."""
    staff_agg: dict = {}
    for inv in invs:
        inv_staff = inv.get("staff_id")
        assigned_line = False
        for it in inv.get("items", []):
            sid = it.get("staff_id") or inv_staff
            if not sid:
                continue
            price = float(it.get("price") or 0) * int(it.get("qty") or 1)
            row = staff_agg.setdefault(sid, {"gross": 0.0, "invoice_ids": set()})
            row["gross"] += price
            row["invoice_ids"].add(inv.get("id"))
            assigned_line = True
        if not assigned_line and inv_staff:
            row = staff_agg.setdefault(inv_staff, {"gross": 0.0, "invoice_ids": set()})
            row["invoice_ids"].add(inv.get("id"))
    return staff_agg


@router.get("/reports/daily")
async def daily_report(date: Optional[str] = None, user=Depends(require_tenant_admin)):
    """One-day revenue summary anchored to IST. Powers the 'Yesterday's Report'
    notification that greets the salon owner on login.

    Query params:
      date  — YYYY-MM-DD (IST). Defaults to yesterday.

    Returns totals split by payment mode (card / upi / cash / wallet / other),
    invoice count, new-guest count, and per-staff gross revenue.
    """
    day, utc_start, utc_end = _ist_day_window(date)
    flt = {"created_at": {"$gte": utc_start, "$lte": utc_end}, "status": {"$nin": ["voided", "open"]}}
    invs = await db.invoices.find(flt, {"_id": 0}).to_list(2000)

    buckets, total = _payment_mode_buckets(invs)
    staff_agg = _daily_staff_agg(invs)
    staff_docs = await db.staff.find(
        {"id": {"$in": list(staff_agg.keys())}}, {"_id": 0, "id": 1, "name": 1},
    ).to_list(200) if staff_agg else []
    smap = {s["id"]: s["name"] for s in staff_docs}
    staff_rows = [
        {
            "staff_id": sid,
            "staff_name": smap.get(sid, "(removed)"),
            "gross": round(row["gross"], 2),
            "invoices": len(row["invoice_ids"]),
        }
        for sid, row in staff_agg.items()
    ]
    staff_rows.sort(key=lambda r: r["gross"], reverse=True)

    # New guests = customers whose first record landed on this IST day.
    new_guests = await db.customers.count_documents(
        {"created_at": {"$gte": utc_start, "$lte": utc_end}},
    )

    day_dt = datetime.strptime(day, "%Y-%m-%d")
    return {
        "date": day,
        "date_label": day_dt.strftime("%a, %d %b %Y"),
        "revenue": {"total": round(total, 2), **{k: round(v, 2) for k, v in buckets.items()}},
        "invoices": len(invs),
        "new_guests": new_guests,
        "staff": staff_rows,
        "is_empty": len(invs) == 0,
    }


@router.get("/reports/sales")
async def sales_report(start: Optional[str] = None, end: Optional[str] = None,
                       branch: Optional[str] = None, user=Depends(require_admin), t=Depends(current_tenant)):
    branch = branch_lock(user, branch)
    flt = {"status": {"$nin": ["voided", "open"]}, **_branch_query(branch, t)}
    if start and end:
        flt["created_at"] = {"$gte": start, "$lte": end + "T23:59:59Z"}
    invs = await db.invoices.find(flt, {"_id": 0}).to_list(2000)
    reviews = await db.reviews.find(flt, {"_id": 0, "rating": 1}).to_list(2000)
    avg_rating = round(sum(r.get("rating", 0) for r in reviews) / len(reviews), 1) if reviews else None
    by_mode = {}
    by_branch = {}
    by_month = {}
    total_revenue = 0.0
    for inv in invs:
        by_mode[inv["payment_mode"]] = by_mode.get(inv["payment_mode"], 0) + inv["total"]
        b = by_branch.setdefault(inv.get("branch_name") or "Main", {"revenue": 0.0, "invoices": 0})
        b["revenue"] += inv["total"]
        b["invoices"] += 1
        m = by_month.setdefault((inv.get("created_at") or "")[:7], {"revenue": 0.0, "invoices": 0})
        m["revenue"] += inv["total"]
        m["invoices"] += 1
        total_revenue += inv["total"]
    return {
        "total_invoices": len(invs),
        "total_revenue": round(total_revenue, 2),
        "avg_rating": avg_rating,
        "review_count": len(reviews),
        "by_payment_mode": [{"mode": k, "amount": round(v, 2)} for k, v in by_mode.items()],
        "by_branch": sorted(
            [{"branch": k, "revenue": round(v["revenue"], 2), "invoices": v["invoices"]} for k, v in by_branch.items()],
            key=lambda x: -x["revenue"]),
        "by_month": sorted(
            [{"month": k, "revenue": round(v["revenue"], 2), "invoices": v["invoices"]} for k, v in by_month.items() if k],
            key=lambda x: x["month"], reverse=True),
        "invoices": invs[:200],
    }


def _commission_agg(invs: list) -> tuple:
    """(staff_id -> {gross,items,services,products}, unassigned bucket)."""
    agg: dict = {}
    unassigned = {"gross": 0.0, "items": 0, "services": 0, "products": 0}
    for inv in invs:
        invoice_staff = inv.get("staff_id")
        for it in inv.get("items", []):
            sid = it.get("staff_id") or invoice_staff
            qty = int(it.get("qty") or 1)
            line_total = qty * float(it.get("price") or 0)
            kind = "services" if it.get("type") == "service" else "products"
            row = agg.setdefault(sid, {"gross": 0.0, "items": 0, "services": 0, "products": 0}) if sid else unassigned
            row["gross"] += line_total
            row["items"] += qty
            row[kind] += qty
    return agg, unassigned


@router.get("/reports/staff-commission")
async def staff_commission_report(
    start: Optional[str] = None,
    end: Optional[str] = None,
    pct: float = 0.0,
    user=Depends(require_admin),
    _pin=Depends(require_owner_pin),
):
    """Per-stylist gross revenue + commission for invoices in [start, end].
    Item-level staff_id wins; falls back to invoice.staff_id if a line has none.
    `pct` is the commission percentage (default 30%).
    Returns rows sorted desc by gross_revenue."""
    if pct < 0 or pct > 100:
        raise HTTPException(400, "pct must be between 0 and 100")
    flt = {"status": {"$nin": ["voided", "open"]}}
    if start and end:
        flt["created_at"] = {"$gte": start, "$lte": end + "T23:59:59Z"}
    invs = await db.invoices.find(flt, {"_id": 0}).to_list(5000)

    agg, unassigned = _commission_agg(invs)

    # Join with staff
    staff_docs = await db.staff.find(
        {"id": {"$in": list(agg.keys())}}, {"_id": 0, "id": 1, "name": 1, "role": 1},
    ).to_list(200) if agg else []
    smap = {s["id"]: s for s in staff_docs}
    rows = []
    for sid, row in agg.items():
        s = smap.get(sid, {"name": "(removed)", "role": ""})
        rows.append({
            "staff_id": sid,
            "staff_name": s["name"],
            "role": s.get("role"),
            "gross_revenue": round(row["gross"], 2),
            "commission_pct": round(pct, 2),
            "commission_amount": round(row["gross"] * pct / 100, 2),
            "item_count": row["items"],
            "service_count": row["services"],
            "product_count": row["products"],
        })
    rows.sort(key=lambda r: r["gross_revenue"], reverse=True)
    total_gross = round(sum(r["gross_revenue"] for r in rows) + unassigned["gross"], 2)
    return {
        "from": start, "to": end, "pct": round(pct, 2),
        "rows": rows,
        "unassigned": {
            "gross_revenue": round(unassigned["gross"], 2),
            "item_count": unassigned["items"],
            "service_count": unassigned["services"],
            "product_count": unassigned["products"],
        },
        "total_invoices": len(invs),
        "total_gross": total_gross,
        "total_commission": round(sum(r["commission_amount"] for r in rows), 2),
    }


@router.get("/reports/staff-tips")
async def staff_tips_report(start: Optional[str] = None, end: Optional[str] = None, user=Depends(require_admin)):
    """Per-stylist tips collected at billing in [start, end], split into pending vs paid-out."""
    flt = {"tip": {"$gt": 0}}
    if start and end:
        flt["created_at"] = {"$gte": start, "$lte": end + "T23:59:59Z"}
    invs = await db.invoices.find(
        flt, {"_id": 0, "tip": 1, "tip_staff_id": 1, "tip_staff_name": 1, "tip_paid_at": 1}).to_list(5000)
    agg = {}
    unassigned = {"total": 0.0, "count": 0}
    for inv in invs:
        sid = inv.get("tip_staff_id")
        tip = float(inv["tip"])
        if not sid:
            unassigned["total"] += tip
            unassigned["count"] += 1
            continue
        row = agg.setdefault(sid, {"name": inv.get("tip_staff_name") or "(removed)",
                                   "total": 0.0, "count": 0, "pending": 0.0, "pending_count": 0, "paid": 0.0})
        row["total"] += tip
        row["count"] += 1
        if inv.get("tip_paid_at"):
            row["paid"] += tip
        else:
            row["pending"] += tip
            row["pending_count"] += 1
    rows = [{"staff_id": sid, "staff_name": r["name"], "tips_total": round(r["total"], 2),
             "tip_count": r["count"], "avg_tip": round(r["total"] / r["count"], 2),
             "pending_total": round(r["pending"], 2), "pending_count": r["pending_count"],
             "paid_total": round(r["paid"], 2)} for sid, r in agg.items()]
    rows.sort(key=lambda r: r["tips_total"], reverse=True)
    return {"from": start, "to": end, "rows": rows,
            "unassigned_total": round(unassigned["total"], 2), "unassigned_count": unassigned["count"],
            "total_tips": round(sum(r["tips_total"] for r in rows) + unassigned["total"], 2),
            "total_pending": round(sum(r["pending_total"] for r in rows), 2)}


@router.post("/reports/staff-tips/{staff_id}/mark-paid")
async def mark_tips_paid(staff_id: str, user=Depends(require_admin)):
    """Owner hands tips over (EOD / weekly / monthly — their choice) and marks all pending as paid."""
    now = datetime.now(timezone.utc).isoformat()
    pending = await db.invoices.find(
        {"tip_staff_id": staff_id, "tip": {"$gt": 0}, "tip_paid_at": {"$exists": False}},
        {"_id": 0, "id": 1, "tip": 1, "tip_staff_name": 1}).to_list(2000)
    if not pending:
        return {"ok": True, "amount": 0, "count": 0}
    amount = round(sum(float(p["tip"]) for p in pending), 2)
    await db.invoices.update_many(
        {"tip_staff_id": staff_id, "tip": {"$gt": 0}, "tip_paid_at": {"$exists": False}},
        {"$set": {"tip_paid_at": now}})
    await _raw_db.tip_payouts.insert_one({
        "id": str(uuid.uuid4()), "staff_id": staff_id,
        "staff_name": pending[0].get("tip_staff_name"), "amount": amount,
        "invoice_count": len(pending), "paid_at": now, "paid_by": user.get("email")})
    return {"ok": True, "amount": amount, "count": len(pending)}


async def _blast_targets() -> list:
    """Completed appointments (last 14 days) without a review, joined with a still-existing
    customer that has a phone. Shared by the blast endpoint and the Dashboard pending count."""
    since = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    completed = await db.appointments.find(
        {"status": "completed", "scheduled_at": {"$gte": since}}, {"_id": 0},
    ).sort("scheduled_at", -1).to_list(200)
    # POS walk-in bills count as completed visits too (many salons never use appointments).
    invoices = await db.invoices.find(
        {"created_at": {"$gte": since}, "status": {"$ne": "voided"}, "is_voided": {"$ne": True},
         "customer_id": {"$nin": [None, ""]}},
        {"_id": 0, "id": 1, "customer_id": 1, "items": 1, "staff_name": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(300)
    seen_cust = {a["customer_id"] for a in completed}
    for inv in invoices:
        if inv["customer_id"] in seen_cust:
            continue  # one ask per customer per fortnight
        seen_cust.add(inv["customer_id"])
        completed.append({
            "id": inv["id"], "customer_id": inv["customer_id"],
            "service_names": [i.get("name") for i in (inv.get("items") or []) if i.get("name")][:4],
            "staff_name": inv.get("staff_name"), "scheduled_at": inv["created_at"],
        })
    reviewed_ids = {
        r["appointment_id"]
        async for r in db.reviews.find({"appointment_id": {"$exists": True}}, {"_id": 0, "appointment_id": 1})
    }
    cust_ids = list({a["customer_id"] for a in completed})
    cust_map = {
        c["id"]: c for c in
        await db.customers.find({"id": {"$in": cust_ids}},
                                {"_id": 0, "id": 1, "phone": 1, "name": 1, "email": 1}).to_list(600)
    }
    targets = []
    for a in completed:
        if a["id"] in reviewed_ids:
            continue
        cust = cust_map.get(a["customer_id"])
        if not cust or not cust.get("phone"):
            continue
        targets.append({
            "appointment_id": a["id"],
            "customer_id": cust["id"],
            "customer_name": cust["name"],
            "phone": cust["phone"],
            "email": cust.get("email") or "",
            "service_names": a.get("service_names", []),
            "staff_name": a.get("staff_name"),
            "scheduled_at": a["scheduled_at"],
        })
    return targets


@router.get("/reviews/blast-targets")
async def reviews_blast_targets(user=Depends(get_current_user)):
    """Completed visits (appointments + POS bills) without a review yet — used by the review blast."""
    targets = await _blast_targets()
    return {"count": len(targets), "targets": targets}


class BlastSendIn(BaseModel):
    target_id: str = Field(..., max_length=64)
    channel: str = Field(..., pattern="^(sms|email)$")


@router.post("/reviews/blast-send")
async def reviews_blast_send(body: BlastSendIn, user=Depends(get_current_user), t=Depends(current_tenant)):
    """Send one review request by SMS or email. Managers: SMS only. Admin/owner: SMS + email
    (WhatsApp opens client-side for admins)."""
    if body.channel == "email" and user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(403, "Managers can send review requests by SMS only")
    target = next((x for x in await _blast_targets() if x["appointment_id"] == body.target_id), None)
    if not target:
        raise HTTPException(404, "This visit is no longer pending a review")
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    link = f"{base}/review/{target['appointment_id']}"
    first = (target["customer_name"] or "there").split(" ")[0]
    if body.channel == "sms":
        from sms_service import send_sms
        res = await send_sms(target["phone"],
                             f"Hi {first}! Thanks for visiting {t.get('name', 'us')} 💇 "
                             f"We'd love your quick rating: {link}")
        if not res.get("sent"):
            raise HTTPException(502, res.get("error") or "SMS could not be sent")
        return {"ok": True, "channel": "sms", "points_left": res.get("points_left")}
    if not target.get("email"):
        raise HTTPException(400, f"{target['customer_name']} has no email on file")
    from email_service import _send_email
    from routes.crm import _review_request_email_html
    res = await _send_email([target["email"]],
                            f"⭐ How was your visit to {t.get('name', 'the salon')}?",
                            _review_request_email_html(t.get("name", ""), target["customer_name"], link))
    if not res.get("sent"):
        raise HTTPException(502, res.get("error") or "Email could not be sent")
    return {"ok": True, "channel": "email"}



# ---------------- Owner-PIN protected: verify + billing data erase (fresh setup) ----------------
from pydantic import BaseModel, Field  # noqa: E402


@router.post("/settings/verify-owner-pin", dependencies=[Depends(require_owner_pin)])
async def verify_owner_pin_only(user=Depends(require_admin)):
    """No-op endpoint used by the UI to unlock PIN-gated controls (e.g. commission rate)."""
    return {"ok": True}


class EraseBillingIn(BaseModel):
    scope: str = Field(..., pattern="^(last_month|all)$")


@router.post("/reports/billing-data/erase", dependencies=[Depends(require_owner_pin)])
async def erase_billing_data(body: EraseBillingIn, user=Depends(require_tenant_admin)):
    """Owner-only fresh-setup tool: wipe test/old invoices (drives revenue & commission reports)."""
    flt = {}
    if body.scope == "last_month":
        now = datetime.now(timezone.utc)
        first_this = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_month_end = first_this - timedelta(seconds=1)
        first_last = last_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        flt = {"created_at": {"$gte": first_last.isoformat(), "$lt": first_this.isoformat()}}
    res = await db.invoices.delete_many(flt)
    return {"ok": True, "scope": body.scope, "invoices_deleted": res.deleted_count}
