"""End-of-day open-bill alerts + weekly manager access reports (emailed to owners)."""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends

from database import _raw_db
from security import require_tenant_admin, current_tenant
from email_service import _send_email

router = APIRouter()
IST = timezone(timedelta(hours=5, minutes=30))
_TENANT_FIELDS = {"_id": 0, "id": 1, "name": 1, "owner_email": 1, "salon_email": 1}


def _owner_emails(t: dict) -> list:
    return [e for e in {t.get("owner_email"), t.get("salon_email")} if e]


def _fmt_ist(iso) -> str:
    try:
        dt = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return dt.astimezone(IST).strftime("%d %b, %I:%M %p")
    except (ValueError, TypeError):
        return str(iso or "")


async def _target_tenants(tenant_id: Optional[str]) -> list:
    flt = {"id": tenant_id} if tenant_id else {"status": {"$in": ["active", "trial"]}}
    return await _raw_db.tenants.find(flt, _TENANT_FIELDS).to_list(500)


async def _dispatch(tenants: list, make_email) -> dict:
    """For each tenant, make_email(t) -> (recipients, subject, html) or None; send and tally."""
    sent = failed = 0
    for t in tenants:
        made = await make_email(t)
        if not made:
            continue
        recipients, subject, html = made
        status = await _send_email(recipients, subject, html)
        sent += 1 if status.get("sent") else 0
        failed += 0 if status.get("sent") else 1
    return {"sent": sent, "failed": failed}


# ---------------- open bill alerts ----------------

def _open_bills_html(t: dict, bills: list, total: float) -> str:
    rows = "".join(
        f"<tr><td style='padding:6px 14px 6px 0;font-family:monospace;font-size:12px'>{b['invoice_no']}</td>"
        f"<td style='padding:6px 14px 6px 0'>{b.get('customer_name') or ''}</td>"
        f"<td style='padding:6px 14px 6px 0;color:#888;font-size:12px'>{_fmt_ist(b.get('created_at'))}</td>"
        f"<td style='padding:6px 0;text-align:right;font-weight:bold'>₹{float(b.get('total') or 0):,.0f}</td></tr>"
        for b in bills)
    n = len(bills)
    return f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#333">
    <h2 style="color:#1c1c22">📋 {n} open bill{'s' if n != 1 else ''} still unpaid today</h2>
    <p>Before you close the day at <b>{t.get('name') or 'your salon'}</b> — these bills were created but never completed (payment not collected):</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:14px 0">{rows}</table>
    <p style="font-size:15px"><b>Total pending: ₹{total:,.0f}</b></p>
    <p style="font-size:13px;color:#555">Open <b>POS → Open bills</b> to collect payment, or review them under <b>Reports → Unbilled / Not Paid</b> — you can complete or delete wrongly-created bills there.</p>
    <p style="font-size:12px;color:#888">— Miracurl Suite · daily end-of-day check</p></div>"""


async def _make_open_bill_email(t: dict):
    bills = await _raw_db.invoices.find(
        {"tenant_id": t["id"], "status": "open"},
        {"_id": 0, "invoice_no": 1, "customer_name": 1, "total": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(100)
    recipients = _owner_emails(t)
    if not bills or not recipients:
        return None
    total = sum(float(b.get("total") or 0) for b in bills)
    n = len(bills)
    subject = f"📋 {n} unpaid open bill{'s' if n != 1 else ''} — ₹{total:,.0f} pending ({t.get('name')})"
    return recipients, subject, _open_bills_html(t, bills, total)


async def _run_open_bill_alerts(tenant_id: Optional[str] = None) -> dict:
    """Email each owner the bills still OPEN (created but payment never collected)."""
    return await _dispatch(await _target_tenants(tenant_id), _make_open_bill_email)


# ---------------- weekly manager access reports ----------------

def _aggregate_access_logs(logs: list) -> dict:
    agg = {}
    for r in logs:
        key = (r.get("name") or "Manager", r.get("section") or "?")
        a = agg.setdefault(key, {"attempted": 0, "unlocked": 0, "denied": 0})
        act = r.get("action") or ""
        if act.startswith("denied"):
            a["denied"] += 1
        elif act.startswith("unlocked"):
            a["unlocked"] += 1
        else:
            a["attempted"] += 1
    return agg


def _access_report_html(t: dict, agg: dict) -> str:
    rows = "".join(
        f"<tr><td style='padding:6px 14px 6px 0'>{name}</td><td style='padding:6px 14px 6px 0'>{section}</td>"
        f"<td style='padding:6px 14px 6px 0;text-align:center'>{v['attempted']}</td>"
        f"<td style='padding:6px 14px 6px 0;text-align:center;color:#059669'>{v['unlocked']}</td>"
        f"<td style='padding:6px 0;text-align:center;color:#dc2626;font-weight:bold'>{v['denied']}</td></tr>"
        for (name, section), v in sorted(agg.items()))
    denied_total = sum(v["denied"] for v in agg.values())
    warn = (f'<p style="color:#dc2626;font-size:14px"><b>⚠ {denied_total} wrong-PIN attempt'
            f'{"s" if denied_total != 1 else ""}</b> — someone tried to open a locked section without your PIN.</p>'
            if denied_total else
            '<p style="color:#059669;font-size:13px">No wrong-PIN attempts this week ✓</p>')
    return f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#333">
    <h2 style="color:#1c1c22">🔐 Weekly manager access report — {t.get('name') or 'your salon'}</h2>
    <p>Every time a manager opened (or tried to open) a PIN-locked section in the last 7 days:</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin:14px 0">
      <tr style="color:#888;font-size:11px;text-transform:uppercase"><td>Manager</td><td>Section</td><td style="text-align:center">Visited</td><td style="text-align:center">Unlocked</td><td style="text-align:center">Wrong PIN</td></tr>
      {rows}</table>
    {warn}
    <p style="font-size:12px;color:#888">Full log: Staff Activities section in your app. — Miracurl Suite · weekly security digest</p></div>"""


async def _make_access_report_email(t: dict):
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    logs = await _raw_db.manager_activity_logs.find(
        {"tenant_id": t["id"], "role": "manager", "at": {"$gte": since}},
        {"_id": 0, "name": 1, "section": 1, "action": 1},
    ).to_list(2000)
    recipients = _owner_emails(t)
    if not logs or not recipients:
        return None
    agg = _aggregate_access_logs(logs)
    subject = f"🔐 Manager access report — {t.get('name')} (last 7 days)"
    return recipients, subject, _access_report_html(t, agg)


async def _run_manager_access_reports(tenant_id: Optional[str] = None) -> dict:
    """Weekly per-tenant digest of manager attempts on PIN-locked sections."""
    return await _dispatch(await _target_tenants(tenant_id), _make_access_report_email)


# ---------------- weekly late arrival digest ----------------

def _late_digest_html(t: dict, rows: list, total_fines: float, star: Optional[dict] = None) -> str:
    star_html = ""
    if star:
        star_html = (f"<div style='background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;"
                     f"padding:12px 16px;margin:14px 0;font-size:14px'>🏆 <b>Punctuality Star of the week: "
                     f"{star['name']}</b> — on time all {star['days']} day{'s' if star['days'] != 1 else ''} they worked. "
                     f"A little shout-out goes a long way! 💛</div>")
    body = "".join(
        f"<tr><td style='padding:6px 14px 6px 0'>{r['name']}</td>"
        f"<td style='padding:6px 14px 6px 0;text-align:center'>{r['days']}</td>"
        f"<td style='padding:6px 14px 6px 0;text-align:center'>{r['minutes']} min</td>"
        f"<td style='padding:6px 0;text-align:right;color:#dc2626;font-weight:bold'>₹{r['fines']:,.0f}</td></tr>"
        for r in rows)
    return f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#333">
    <h2 style="color:#1c1c22">⏰ Weekly late arrival report — {t.get('name') or 'your salon'}</h2>
    <p>Staff who arrived late in the last 7 days (10-min grace applies Mon–Fri only):</p>
    {star_html}
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin:14px 0">
      <tr style="color:#888;font-size:11px;text-transform:uppercase"><td>Staff</td><td style="text-align:center">Late days</td><td style="text-align:center">Total late</td><td style="text-align:right">Fines</td></tr>
      {body}</table>
    <p style="font-size:15px"><b>Total fines this week: ₹{total_fines:,.0f}</b> — deducted automatically in the monthly salary slips.</p>
    <p style="font-size:12px;color:#888">— Miracurl Suite · weekly attendance digest</p></div>"""


def _staff_late_html(t: dict, s: dict, days: list, week_fine: float, month_fine: float) -> str:
    rows = "".join(
        f"<tr><td style='padding:5px 14px 5px 0'>{d['date']}</td>"
        f"<td style='padding:5px 14px 5px 0;text-align:center'>{d['late_minutes']} min late</td>"
        f"<td style='padding:5px 0;text-align:right;color:#dc2626'>₹{float(d.get('late_penalty') or 0):,.0f}</td></tr>"
        for d in days)
    base = float(s.get("monthly_base_salary") or 0)
    salary_line = (f"<p style='font-size:13px'>Monthly base salary: <b>₹{base:,.0f}</b> · "
                   f"fines this month so far: <b style='color:#dc2626'>₹{month_fine:,.0f}</b> — "
                   f"these are deducted in your salary slip.</p>" if base else
                   f"<p style='font-size:13px'>Fines this month so far: <b style='color:#dc2626'>₹{month_fine:,.0f}</b> — deducted in your salary slip.</p>")
    return f"""<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;color:#333">
    <h2 style="color:#1c1c22">⏰ Your late arrivals this week</h2>
    <p>Hi {(s.get('name') or '').split(' ')[0]}, here's your punctuality summary at <b>{t.get('name')}</b>:</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0">{rows}</table>
    <p style="font-size:14px"><b>This week's fines: ₹{week_fine:,.0f}</b></p>
    {salary_line}
    <p style="font-size:12px;color:#888">Tip: the 10-minute grace applies Monday–Friday only — weekends have no grace. — {t.get('name')}</p></div>"""


def _aggregate_late(recs: list) -> dict:
    agg = {}
    for r in recs:
        a = agg.setdefault(r["staff_id"], {"name": r.get("staff_name") or "Staff", "days": 0, "minutes": 0, "fines": 0.0, "recs": []})
        a["days"] += 1
        a["minutes"] += int(r.get("late_minutes") or 0)
        a["fines"] += float(r.get("late_penalty") or 0)
        a["recs"].append(r)
    return agg


async def _find_punctuality_star(tenant_id: str, since_date: str, agg: dict) -> Optional[dict]:
    """Staff member with attendance this week and zero late records; most days worked wins."""
    all_recs = await _raw_db.attendance.find(
        {"tenant_id": tenant_id, "date": {"$gte": since_date}},
        {"_id": 0, "staff_id": 1, "staff_name": 1},
    ).to_list(2000)
    worked = {}
    for r in all_recs:
        w = worked.setdefault(r["staff_id"], {"name": r.get("staff_name") or "Staff", "days": 0})
        w["days"] += 1
    punctual = [w for sid, w in worked.items() if sid not in agg and w["days"] > 0]
    return max(punctual, key=lambda x: x["days"]) if punctual else None


async def _send_owner_late_digest(t: dict, agg: dict, star: Optional[dict]) -> tuple[int, int]:
    rows = sorted(agg.values(), key=lambda x: -x["fines"])
    total = sum(r["fines"] for r in rows)
    recipients = _owner_emails(t)
    if not recipients:
        return 0, 0
    status = await _send_email(recipients, f"⏰ Late arrivals this week — ₹{total:,.0f} in fines ({t.get('name')})",
                               _late_digest_html(t, rows, total, star))
    return (1, 0) if status.get("sent") else (0, 1)


async def _send_staff_late_digests(t: dict, agg: dict, month_start: str) -> tuple[int, int]:
    sent = failed = 0
    for sid, a in agg.items():
        s = await _raw_db.staff.find_one({"id": sid}, {"_id": 0, "name": 1, "email": 1, "monthly_base_salary": 1})
        if not s or not s.get("email"):
            continue
        month_recs = await _raw_db.attendance.find(
            {"tenant_id": t["id"], "staff_id": sid, "date": {"$gte": month_start}, "late_penalty": {"$gt": 0}},
            {"_id": 0, "late_penalty": 1}).to_list(100)
        month_fine = sum(float(x.get("late_penalty") or 0) for x in month_recs)
        status = await _send_email([s["email"]], f"⏰ Your late arrivals this week — ₹{a['fines']:,.0f} in fines",
                                   _staff_late_html(t, s, sorted(a["recs"], key=lambda x: x["date"]), a["fines"], month_fine))
        sent += 1 if status.get("sent") else 0
        failed += 0 if status.get("sent") else 1
    return sent, failed


async def _run_late_arrival_digests(tenant_id: Optional[str] = None) -> dict:
    since_date = (datetime.now(IST) - timedelta(days=7)).strftime("%Y-%m-%d")
    month_start = datetime.now(IST).strftime("%Y-%m") + "-01"
    sent = failed = 0
    for t in await _target_tenants(tenant_id):
        recs = await _raw_db.attendance.find(
            {"tenant_id": t["id"], "date": {"$gte": since_date}, "late_minutes": {"$gt": 0}},
            {"_id": 0, "staff_id": 1, "staff_name": 1, "date": 1, "late_minutes": 1, "late_penalty": 1},
        ).to_list(1000)
        if not recs:
            continue
        agg = _aggregate_late(recs)
        star = await _find_punctuality_star(t["id"], since_date, agg)
        s1, f1 = await _send_owner_late_digest(t, agg, star)
        s2, f2 = await _send_staff_late_digests(t, agg, month_start)
        sent += s1 + s2
        failed += f1 + f2
    return {"sent": sent, "failed": failed}


@router.post("/reports/open-bill-alert/send-now")
async def trigger_open_bill_alert(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Owner can trigger their own EOD open-bill email on demand (also used for testing)."""
    return await _run_open_bill_alerts(t["id"])


@router.post("/reports/manager-access-report/send-now")
async def trigger_manager_access_report(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return await _run_manager_access_reports(t["id"])


@router.post("/reports/late-arrival-digest/send-now")
async def trigger_late_arrival_digest(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return await _run_late_arrival_digests(t["id"])
