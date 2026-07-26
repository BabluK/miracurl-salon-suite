"""Salon Daily Digest — every morning each salon owner gets yesterday's numbers,
today's bookings and staff highlights. Idempotent per day via salon_digest_log."""
import os
import html as html_lib
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends

from database import _raw_db
from security import require_super_admin

log = logging.getLogger("salon_digest")
router = APIRouter()

IST = timedelta(hours=5, minutes=30)


def _ist_now() -> datetime:
    return datetime.now(timezone.utc) + IST


def _utc_window_for_ist_day(day) -> tuple:
    start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc) - IST
    return start.isoformat(), (start + timedelta(days=1)).isoformat()


async def _digest_data(tid: str) -> dict:
    today = _ist_now().date()
    yday = today - timedelta(days=1)
    ys, ye = _utc_window_for_ist_day(yday)
    ts, te = _utc_window_for_ist_day(today)
    invs = await _raw_db.invoices.find(
        {"tenant_id": tid, "created_at": {"$gte": ys, "$lt": ye}},
        {"_id": 0, "total": 1, "staff_name": 1}).to_list(500)
    revenue = sum(i.get("total") or 0 for i in invs)
    by_staff = {}
    for i in invs:
        if i.get("staff_name"):
            by_staff[i["staff_name"]] = by_staff.get(i["staff_name"], 0) + (i.get("total") or 0)
    top_staff = max(by_staff.items(), key=lambda kv: kv[1]) if by_staff else None
    lw = yday - timedelta(days=7)
    ls, le = _utc_window_for_ist_day(lw)
    lw_invs = await _raw_db.invoices.find(
        {"tenant_id": tid, "created_at": {"$gte": ls, "$lt": le}}, {"_id": 0, "total": 1}).to_list(500)
    lw_revenue = sum(i.get("total") or 0 for i in lw_invs)
    y_appts = await _raw_db.appointments.count_documents(
        {"tenant_id": tid, "scheduled_at": {"$gte": ys, "$lt": ye}, "status": {"$ne": "cancelled"}})
    t_appts = await _raw_db.appointments.find(
        {"tenant_id": tid, "scheduled_at": {"$gte": ts, "$lt": te}, "status": {"$ne": "cancelled"}},
        {"_id": 0, "scheduled_at": 1, "customer_name": 1, "service_names": 1, "staff_name": 1}
    ).sort("scheduled_at", 1).to_list(30)
    pending_gifts = await _raw_db.gift_cards.count_documents(
        {"tenant_id": tid, "status": "awaiting_confirmation"})
    return {"yday": str(yday), "revenue": revenue, "bills": len(invs), "y_appts": y_appts,
            "lw_revenue": lw_revenue,
            "top_staff": top_staff, "t_appts": t_appts, "pending_gifts": pending_gifts}


def _trend_badge(revenue: float, lw_revenue: float) -> str:
    """▲/▼ vs the same day last week."""
    if lw_revenue <= 0:
        return ('<span style="font-size:11px;color:#0e7490;font-weight:bold">✦ new</span>'
                if revenue > 0 else "")
    pct = round((revenue - lw_revenue) / lw_revenue * 100)
    if pct >= 0:
        return f'<span style="font-size:11px;color:#059669;font-weight:bold">▲ {pct}% vs last week</span>'
    return f'<span style="font-size:11px;color:#dc2626;font-weight:bold">▼ {abs(pct)}% vs last week</span>'


def _digest_html(t: dict, d: dict) -> str:
    cur = "₹" if (t.get("currency") or "INR") == "INR" else "$"
    rows = ""
    for a in d["t_appts"][:12]:
        hhmm = ""
        try:
            hhmm = (datetime.fromisoformat(a["scheduled_at"].replace("Z", "+00:00")) + IST).strftime("%I:%M %p")
        except Exception:
            pass
        svcs = ", ".join((a.get("service_names") or [])[:2])
        rows += (f"<tr><td style='padding:5px 8px;font-size:12px'>{hhmm}</td>"
                 f"<td style='padding:5px 8px;font-size:12px'><b>{html_lib.escape(a.get('customer_name') or '')}</b></td>"
                 f"<td style='padding:5px 8px;font-size:12px;color:#666'>{html_lib.escape(svcs)}</td>"
                 f"<td style='padding:5px 8px;font-size:12px;color:#666'>{html_lib.escape(a.get('staff_name') or '—')}</td></tr>")
    staff_line = (f"🏆 Star of the day: <b>{html_lib.escape(d['top_staff'][0])}</b> brought in "
                  f"{cur}{d['top_staff'][1]:g} yesterday!" if d["top_staff"] else
                  "Tip: assign staff on invoices to see who's your daily star ✨")
    gifts = (f"<p style='font-size:13px;color:#b45309'>⏳ {d['pending_gifts']} gift card payment(s) awaiting your "
             f"confirmation — check Settings → Gift Cards.</p>" if d["pending_gifts"] else "")
    return f"""<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#333">
    <h2 style="color:#1a1a2e">☀️ Good morning, {html_lib.escape(t.get('owner_name') or t.get('name') or '')}!</h2>
    <p style="font-size:13px;color:#666">Your daily snapshot for <b>{html_lib.escape(t.get('name') or '')}</b></p>
    <table width="100%" cellspacing="8"><tr>
      <td style="background:#f8f6f1;border-radius:12px;padding:14px;text-align:center">
        <div style="font-size:22px;font-weight:bold;color:#1a1a2e">{cur}{d['revenue']:g}</div>
        <div style="font-size:11px;color:#888">Yesterday's revenue · {d['bills']} bills</div>
        <div style="margin-top:2px">{_trend_badge(d['revenue'], d.get('lw_revenue') or 0)}</div></td>
      <td style="background:#f8f6f1;border-radius:12px;padding:14px;text-align:center">
        <div style="font-size:22px;font-weight:bold;color:#1a1a2e">{d['y_appts']}</div>
        <div style="font-size:11px;color:#888">Bookings served yesterday</div></td>
      <td style="background:#f8f6f1;border-radius:12px;padding:14px;text-align:center">
        <div style="font-size:22px;font-weight:bold;color:#0e7490">{len(d['t_appts'])}</div>
        <div style="font-size:11px;color:#888">Bookings today</div></td>
    </tr></table>
    <p style="font-size:13px">{staff_line}</p>
    {gifts}
    {f'<h3 style="font-size:14px;color:#1a1a2e;margin-bottom:4px">📅 Today&#39;s schedule</h3><table width="100%" style="border-collapse:collapse;background:#fafafa;border-radius:10px">{rows}</table>' if rows else '<p style="font-size:13px;color:#888">No bookings yet today — a perfect morning to post an offer or ask Mira for a promo idea 💡</p>'}
    <p style="font-size:11px;color:#aaa;margin-top:16px">Sent every morning by Mira · Miracurl Suite</p></div>"""


async def send_salon_daily_digests(force: bool = False) -> int:
    """Send once per tenant per IST day. Returns number sent."""
    today = str(_ist_now().date())
    sent = 0
    async for t in _raw_db.tenants.find(
            {"status": {"$ne": "suspended"}}, {"_id": 0}):
        to = t.get("owner_email") or t.get("salon_email")
        if not to:
            continue
        already = await _raw_db.salon_digest_log.find_one({"tenant_id": t["id"], "date": today})
        if already and not force:
            continue
        try:
            d = await _digest_data(t["id"])
            from email_service import _send_email
            res = await _send_email(
                [to], f"☀️ {t.get('name')} — your morning digest ({today})", _digest_html(t, d))
            await _raw_db.salon_digest_log.update_one(
                {"tenant_id": t["id"], "date": today},
                {"$set": {"tenant_id": t["id"], "date": today, "sent": bool(res.get("sent")),
                          "at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
            if res.get("sent"):
                sent += 1
        except Exception as e:
            log.error(f"salon digest failed for {t.get('slug')}: {e}")
    return sent


@router.post("/super-admin/salon-digest/run")
async def run_salon_digest_now(force: bool = False, user=Depends(require_super_admin)):
    n = await send_salon_daily_digests(force=force)
    return {"ok": True, "sent": n}
