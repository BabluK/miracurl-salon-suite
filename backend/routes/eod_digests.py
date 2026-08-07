"""End-of-day open-bill alerts + weekly manager access reports (emailed to owners)."""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends

from database import _raw_db
from security import require_tenant_admin, current_tenant
from email_service import _send_email

router = APIRouter()
IST = timezone(timedelta(hours=5, minutes=30))


def _owner_emails(t: dict) -> list:
    return [e for e in {t.get("owner_email"), t.get("salon_email")} if e]


def _fmt_ist(iso) -> str:
    try:
        dt = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return dt.astimezone(IST).strftime("%d %b, %I:%M %p")
    except (ValueError, TypeError):
        return str(iso or "")


async def _run_open_bill_alerts(tenant_id: Optional[str] = None) -> dict:
    """Email each owner the bills still OPEN (created but payment never collected)."""
    flt = {"id": tenant_id} if tenant_id else {"status": {"$in": ["active", "trial"]}}
    tenants = await _raw_db.tenants.find(
        flt, {"_id": 0, "id": 1, "name": 1, "owner_email": 1, "salon_email": 1}).to_list(500)
    sent = failed = 0
    for t in tenants:
        bills = await _raw_db.invoices.find(
            {"tenant_id": t["id"], "status": "open"},
            {"_id": 0, "invoice_no": 1, "customer_name": 1, "total": 1, "created_at": 1},
        ).sort("created_at", -1).to_list(100)
        recipients = _owner_emails(t)
        if not bills or not recipients:
            continue
        total = sum(float(b.get("total") or 0) for b in bills)
        rows = "".join(
            f"<tr><td style='padding:6px 14px 6px 0;font-family:monospace;font-size:12px'>{b['invoice_no']}</td>"
            f"<td style='padding:6px 14px 6px 0'>{b.get('customer_name') or ''}</td>"
            f"<td style='padding:6px 14px 6px 0;color:#888;font-size:12px'>{_fmt_ist(b.get('created_at'))}</td>"
            f"<td style='padding:6px 0;text-align:right;font-weight:bold'>₹{float(b.get('total') or 0):,.0f}</td></tr>"
            for b in bills)
        n = len(bills)
        html = f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#333">
        <h2 style="color:#1c1c22">📋 {n} open bill{'s' if n != 1 else ''} still unpaid today</h2>
        <p>Before you close the day at <b>{t.get('name') or 'your salon'}</b> — these bills were created but never completed (payment not collected):</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:14px 0">{rows}</table>
        <p style="font-size:15px"><b>Total pending: ₹{total:,.0f}</b></p>
        <p style="font-size:13px;color:#555">Open <b>POS → Open bills</b> to collect payment, or review them under <b>Reports → Unbilled / Not Paid</b> — you can complete or delete wrongly-created bills there.</p>
        <p style="font-size:12px;color:#888">— Miracurl Suite · daily end-of-day check</p></div>"""
        status = await _send_email(
            recipients,
            f"📋 {n} unpaid open bill{'s' if n != 1 else ''} — ₹{total:,.0f} pending ({t.get('name')})",
            html)
        sent += 1 if status.get("sent") else 0
        failed += 0 if status.get("sent") else 1
    return {"sent": sent, "failed": failed}


async def _run_manager_access_reports(tenant_id: Optional[str] = None) -> dict:
    """Weekly per-tenant digest of manager attempts on PIN-locked sections."""
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    flt = {"id": tenant_id} if tenant_id else {"status": {"$in": ["active", "trial"]}}
    tenants = await _raw_db.tenants.find(
        flt, {"_id": 0, "id": 1, "name": 1, "owner_email": 1, "salon_email": 1}).to_list(500)
    sent = failed = 0
    for t in tenants:
        logs = await _raw_db.manager_activity_logs.find(
            {"tenant_id": t["id"], "role": "manager", "at": {"$gte": since}},
            {"_id": 0, "name": 1, "section": 1, "action": 1},
        ).to_list(2000)
        recipients = _owner_emails(t)
        if not logs or not recipients:
            continue
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
        html = f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#333">
        <h2 style="color:#1c1c22">🔐 Weekly manager access report — {t.get('name') or 'your salon'}</h2>
        <p>Every time a manager opened (or tried to open) a PIN-locked section in the last 7 days:</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin:14px 0">
          <tr style="color:#888;font-size:11px;text-transform:uppercase"><td>Manager</td><td>Section</td><td style="text-align:center">Visited</td><td style="text-align:center">Unlocked</td><td style="text-align:center">Wrong PIN</td></tr>
          {rows}</table>
        {warn}
        <p style="font-size:12px;color:#888">Full log: Staff Activities section in your app. — Miracurl Suite · weekly security digest</p></div>"""
        status = await _send_email(recipients, f"🔐 Manager access report — {t.get('name')} (last 7 days)", html)
        sent += 1 if status.get("sent") else 0
        failed += 0 if status.get("sent") else 1
    return {"sent": sent, "failed": failed}


@router.post("/reports/open-bill-alert/send-now")
async def trigger_open_bill_alert(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Owner can trigger their own EOD open-bill email on demand (also used for testing)."""
    return await _run_open_bill_alerts(t["id"])


@router.post("/reports/manager-access-report/send-now")
async def trigger_manager_access_report(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return await _run_manager_access_reports(t["id"])
