"""Daily Cash Register — staff/manager log petty-cash expenses; owner gets an EOD email.
closing = opening (yesterday's closing) + today's cash collection − expenses − cash handed over."""
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import _raw_db, db
from security import get_current_user, require_tenant_admin, current_tenant
from email_service import _send_email

router = APIRouter()
IST = timezone(timedelta(hours=5, minutes=30))
CATEGORIES = ["tea", "salon", "cleaning", "travel", "repair", "other"]


def _today() -> str:
    return datetime.now(IST).date().isoformat()


def _utc_bounds(day: str) -> tuple[str, str]:
    d0 = datetime.fromisoformat(day).replace(tzinfo=IST)
    return d0.astimezone(timezone.utc).isoformat(), (d0 + timedelta(days=1)).astimezone(timezone.utc).isoformat()


class ExpenseIn(BaseModel):
    amount: float = Field(gt=0, le=500000)
    purpose: str = Field(min_length=2, max_length=120)
    category: str = "other"
    has_bill: bool = False
    kind: str = "expense"  # expense | handover (cash given to owner / bank)
    date: Optional[str] = None


async def _cash_collected(tenant_id: str, day: str) -> tuple[float, int]:
    lo, hi = _utc_bounds(day)
    row = await _raw_db.invoices.aggregate([
        {"$match": {"tenant_id": tenant_id, "created_at": {"$gte": lo, "$lt": hi},
                    "payment_mode": {"$regex": "^cash$", "$options": "i"}, "status": {"$nin": ["voided", "open"]}}},
        {"$group": {"_id": None, "total": {"$sum": {"$toDouble": {"$ifNull": ["$total", 0]}}}, "n": {"$sum": 1}}}]).to_list(1)
    return (round(row[0]["total"], 2), row[0]["n"]) if row else (0.0, 0)


async def _opening_for(tenant_id: str, day: str) -> tuple[float, Optional[str]]:
    """Yesterday's (most recent earlier) closing cash — carried forward as today's opening."""
    prev = await _raw_db.cash_days.find_one({"tenant_id": tenant_id, "date": {"$lt": day}}, {"_id": 0}, sort=[("date", -1)])
    if prev:
        return float(prev.get("closing") or 0), prev["date"]
    return 0.0, None


async def day_summary(tenant_id: str, day: str) -> dict:
    opening, opening_from = await _opening_for(tenant_id, day)
    cash_in, bills = await _cash_collected(tenant_id, day)
    entries = await _raw_db.cash_expenses.find({"tenant_id": tenant_id, "date": day}, {"_id": 0}).sort("created_at", 1).to_list(500)
    expenses = round(sum(e["amount"] for e in entries if e.get("kind", "expense") == "expense"), 2)
    handover = round(sum(e["amount"] for e in entries if e.get("kind") == "handover"), 2)
    closing = round(opening + cash_in - expenses - handover, 2)
    return {"date": day, "opening": opening, "opening_from": opening_from, "cash_in": cash_in, "cash_bills": bills,
            "expenses": expenses, "handover": handover, "closing": closing, "entries": entries,
            "bills_kept": sum(1 for e in entries if e.get("has_bill")),
            "short": closing < 0}


async def _snapshot(tenant_id: str, day: str, by: str = "system") -> dict:
    """Persist the day's closing so tomorrow's opening carries forward (called on EOD mail + every change)."""
    s = await day_summary(tenant_id, day)
    await _raw_db.cash_days.update_one(
        {"tenant_id": tenant_id, "date": day},
        {"$set": {"tenant_id": tenant_id, "date": day, "opening": s["opening"], "cash_in": s["cash_in"],
                  "expenses": s["expenses"], "handover": s["handover"], "closing": s["closing"],
                  "updated_by": by, "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return s


@router.get("/cash/day")
async def get_cash_day(date: Optional[str] = None, user=Depends(get_current_user), t=Depends(current_tenant)):
    day = date or _today()
    if len(day) != 10:
        raise HTTPException(400, "date must be YYYY-MM-DD")
    s = await day_summary(t["id"], day)
    s["categories"] = CATEGORIES
    s["can_delete"] = user.get("role") in ("admin", "manager")
    return s


@router.get("/cash/history")
async def cash_history(days: int = 14, user=Depends(get_current_user), t=Depends(current_tenant)):
    rows = await _raw_db.cash_days.find({"tenant_id": t["id"]}, {"_id": 0}).sort("date", -1).to_list(max(1, min(days, 90)))
    return {"days": rows}


@router.post("/cash/expenses")
async def add_expense(body: ExpenseIn, user=Depends(get_current_user), t=Depends(current_tenant)):
    day = body.date or _today()
    if day > _today():
        raise HTTPException(400, "Can't log expenses for a future day")
    if user.get("role") not in ("admin", "manager") and day != _today():
        raise HTTPException(403, "Staff can only log today's expenses")
    if body.kind not in ("expense", "handover"):
        raise HTTPException(400, "kind must be expense or handover")
    doc = {
        "id": str(uuid.uuid4()), "tenant_id": t["id"], "date": day, "amount": round(float(body.amount), 2),
        "purpose": body.purpose.strip(), "category": body.category if body.category in CATEGORIES else "other",
        "has_bill": bool(body.has_bill), "kind": body.kind,
        "added_by": user.get("name") or user.get("email", "").split("@")[0], "added_by_role": user.get("role"),
        "added_by_id": user.get("id"), "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _raw_db.cash_expenses.insert_one(doc)
    doc.pop("_id", None)
    s = await _snapshot(t["id"], day, doc["added_by"])
    return {"entry": doc, "summary": {k: v for k, v in s.items() if k != "entries"}}


@router.delete("/cash/expenses/{eid}")
async def delete_expense(eid: str, user=Depends(get_current_user), t=Depends(current_tenant)):
    e = await _raw_db.cash_expenses.find_one({"id": eid, "tenant_id": t["id"]}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Entry not found")
    if user.get("role") not in ("admin", "manager") and e.get("added_by_id") != user.get("id"):
        raise HTTPException(403, "Only a manager/owner can remove someone else's entry")
    await _raw_db.cash_expenses.delete_one({"id": eid})
    await _snapshot(t["id"], e["date"], user.get("name") or "user")
    return {"ok": True}


# ---------------- owner EOD email ----------------

def _inr(v: float) -> str:
    return f"₹{v:,.0f}"


def cash_report_html(t: dict, s: dict) -> str:
    rows = ""
    for e in s["entries"]:
        kind = "🏦 Handed over" if e.get("kind") == "handover" else (e.get("category") or "other").title()
        bill = ('<span style="background:#e8f7ee;color:#1f7a45;border-radius:999px;padding:2px 9px;font-size:11px;font-weight:bold">Bill ✓ at counter</span>'
                if e.get("has_bill") else '<span style="color:#b0b0b8;font-size:11px">no bill</span>')
        rows += f"""<tr>
          <td style="padding:8px 6px;border-bottom:1px solid #f0ece2;font-size:13px;color:#1c1c22">{e.get('purpose','')}<div style="font-size:11px;color:#999">{kind} · by {e.get('added_by','')}</div></td>
          <td style="padding:8px 6px;border-bottom:1px solid #f0ece2;text-align:center">{bill}</td>
          <td style="padding:8px 6px;border-bottom:1px solid #f0ece2;text-align:right;font-weight:bold;color:{'#1f7a45' if e.get('kind')=='handover' else '#c0392b'}">−{_inr(e['amount'])}</td></tr>"""
    if not rows:
        rows = '<tr><td colspan="3" style="padding:14px 6px;color:#999;font-size:13px;text-align:center">No expenses logged today</td></tr>'
    open_note = f"carried from {s['opening_from']}" if s.get("opening_from") else "no earlier balance"
    short = ('<p style="margin:12px 0 0;padding:10px 12px;background:#fdeaea;border:1px solid #f5c6c6;border-radius:10px;color:#c0392b;font-size:13px">⚠️ Cash is short — expenses exceed the cash available. Please check with the counter.</p>'
             if s["short"] else "")
    day_label = datetime.fromisoformat(s["date"]).strftime("%A, %d %B %Y")
    return f"""<div style="font-family:Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #ece7db;border-radius:16px;padding:26px">
      <p style="margin:0;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#a89f8a;font-weight:bold">{t.get('name','')}</p>
      <h2 style="margin:6px 0 0;font-size:20px;color:#1c1c22">Daily Cash Register</h2>
      <p style="margin:3px 0 0;color:#999;font-size:12px">{day_label}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:18px">
        <tr>
          <td style="padding:12px;background:#f7f4ec;border-radius:12px;width:33%"><div style="font-size:11px;color:#8a8a94">Opening cash</div><div style="font-size:18px;font-weight:bold;color:#1c1c22">{_inr(s['opening'])}</div><div style="font-size:10px;color:#aaa">{open_note}</div></td>
          <td style="width:6px"></td>
          <td style="padding:12px;background:#e8f7ee;border-radius:12px;width:33%"><div style="font-size:11px;color:#1f7a45">Today's cash collection</div><div style="font-size:18px;font-weight:bold;color:#1f7a45">+{_inr(s['cash_in'])}</div><div style="font-size:10px;color:#6aa97f">{s['cash_bills']} cash bill{'s' if s['cash_bills']!=1 else ''}</div></td>
          <td style="width:6px"></td>
          <td style="padding:12px;background:#fdeaea;border-radius:12px;width:33%"><div style="font-size:11px;color:#c0392b">Expenses{' · handed over' if s['handover'] else ''}</div><div style="font-size:18px;font-weight:bold;color:#c0392b">−{_inr(s['expenses'] + s['handover'])}</div><div style="font-size:10px;color:#d08a8a">{s['bills_kept']} bill{'s' if s['bills_kept']!=1 else ''} kept at counter</div></td>
        </tr>
      </table>
      <div style="margin-top:14px;padding:14px 16px;background:#1c1c22;border-radius:12px;color:#fff;display:flex;justify-content:space-between">
        <span style="font-size:13px;opacity:.75">Cash in hand at close</span><span style="font-size:22px;font-weight:bold;float:right">{_inr(s['closing'])}</span>
      </div>
      {short}
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:18px">
        <tr><th align="left" style="font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#8a8a94;padding:0 6px 6px">Expense</th><th style="font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#8a8a94;padding:0 6px 6px">Bill</th><th align="right" style="font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#8a8a94;padding:0 6px 6px">Amount</th></tr>
        {rows}
      </table>
      <p style="color:#999;font-size:11.5px;margin:18px 0 0;border-top:1px solid #f0ece2;padding-top:12px">
        Logged by your team in Miracurl → Cash Register. Bills marked ✓ are kept at the counter for you to check. Tomorrow opens with {_inr(s['closing'])}.</p>
    </div>"""


async def _run_cash_reports(tenant_id: Optional[str] = None, day: Optional[str] = None) -> dict:
    day = day or _today()
    flt = {"id": tenant_id} if tenant_id else {"status": {"$in": ["active", "trial"]}}
    sent = failed = skipped = 0
    async for t in _raw_db.tenants.find(flt, {"_id": 0, "id": 1, "name": 1, "owner_email": 1, "salon_email": 1}):
        s = await _snapshot(t["id"], day)
        if not s["entries"] and not s["cash_in"] and not tenant_id:
            skipped += 1  # nothing happened today — don't spam
            continue
        rcpt = [e for e in {t.get("owner_email"), t.get("salon_email")} if e]
        if not rcpt:
            continue
        subj = f"💵 Cash register {day} · {t.get('name')} — {_inr(s['closing'])} in hand" + (" ⚠️ SHORT" if s["short"] else "")
        try:
            r = await _send_email(rcpt, subj, cash_report_html(t, s))
            sent += 1 if r.get("sent") else 0
            failed += 0 if r.get("sent") else 1
        except Exception as e:
            logging.warning(f"cash report failed for {t.get('name')}: {e}")
            failed += 1
    return {"sent": sent, "failed": failed, "skipped": skipped}


@router.post("/cash/send-report")
async def send_cash_report_now(date: Optional[str] = None, user=Depends(get_current_user), t=Depends(current_tenant)):
    if user.get("role") not in ("admin", "manager"):
        raise HTTPException(403, "Manager or owner only")
    return await _run_cash_reports(t["id"], date or _today())
