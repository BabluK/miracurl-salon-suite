"""Background schedulers (extracted from server.py). Registered in server.on_startup."""
import asyncio  # noqa: F401
import logging  # noqa: F401
import os
from datetime import datetime, timezone, timedelta  # noqa: F401

from database import db, _raw_db, _current_tenant_id  # noqa: F401
from email_service import _send_email  # noqa: F401
from routes.crm import _run_birthday_emails, _run_review_requests
from routes.staff_portal import IST_TZ, _run_late_alerts
from routes.super_admin_ops import _run_monthly_reports, _run_weekly_reports, _run_platform_digest

async def _monthly_report_scheduler() -> None:
    """On the 1st of each month (after 09:00 IST) auto-email every active salon
    owner their previous month's business report. Idempotent via system_flags."""
    while True:
        try:
            ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
            if ist_now.day == 1 and ist_now.hour >= 9:
                period = ist_now.strftime("%Y-%m")
                flag = await _raw_db.system_flags.find_one({"key": "monthly_report_auto"})
                if not flag or flag.get("value") != period:
                    out = await _run_monthly_reports(None)
                    await _raw_db.system_flags.update_one(
                        {"key": "monthly_report_auto"},
                        {"$set": {"value": period, "ran_at": datetime.now(timezone.utc).isoformat(),
                                  "sent": out.get("sent", 0), "failed": out.get("failed", 0)}},
                        upsert=True)
                    logging.info(f"Auto monthly reports for {period}: sent={out.get('sent')} failed={out.get('failed')}")
        except Exception as e:
            logging.error(f"monthly report scheduler error: {e}")
        await asyncio.sleep(3600)

async def _sms_reminder_scheduler() -> None:
    """Every 30 min: SMS a 24h reminder for tomorrow's appointments at every salon
    (burns 1 sms_point per SMS). Marks sms_reminder_sent to stay idempotent."""
    from datetime import datetime, timedelta, timezone as _tzmod
    from sms_service import send_tenant_sms, sms_configured
    from database import _raw_db
    while True:
        try:
            if sms_configured():
                intl = {t["id"]: t async for t in _raw_db.tenants.find(
                    {}, {"_id": 0, "id": 1, "name": 1})}
                if intl:
                    now = datetime.now(_tzmod.utc)
                    lo = (now + timedelta(hours=23, minutes=30)).isoformat()
                    hi = (now + timedelta(hours=24, minutes=30)).isoformat()
                    rows = await _raw_db.appointments.find(
                        {"tenant_id": {"$in": list(intl)}, "status": {"$in": ["scheduled", "confirmed"]},
                         "scheduled_at": {"$gte": lo, "$lte": hi}, "sms_reminder_sent": {"$ne": True}},
                        {"_id": 0}).to_list(200)
                    for a in rows:
                        cust = await _raw_db.customers.find_one({"id": a.get("customer_id")}, {"_id": 0, "phone": 1})
                        if cust and cust.get("phone"):
                            t = intl[a["tenant_id"]]
                            when = a["scheduled_at"][:16].replace("T", " at ")
                            await send_tenant_sms(a["tenant_id"], cust["phone"],
                                           f"Reminder from {t.get('name') or 'your salon'}: "
                                           f"{', '.join(a.get('service_names') or ['your appointment'])} tomorrow, {when}. Reply/call to reschedule.",
                                           kind="reminder")
                        await _raw_db.appointments.update_one({"id": a["id"]}, {"$set": {"sms_reminder_sent": True}})
                # Low-balance alert: email HQ once per tenant per day when points dip under 20
                today = datetime.now(_tzmod.utc).date().isoformat()
                low = await _raw_db.tenants.find(
                    {"sms_points": {"$lt": 20}, "sms_low_alert_date": {"$ne": today}},
                    {"_id": 0, "id": 1, "name": 1, "sms_points": 1}).to_list(50)
                alerts = []
                for t in low:
                    if await _raw_db.sms_log.count_documents({"tenant_id": t["id"]}, limit=1):
                        alerts.append(t)
                    await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"sms_low_alert_date": today}})
                hq = os.environ.get("HQ_EMAIL")
                if alerts and hq:
                    from email_service import _send_email
                    rows_html = "".join(
                        f"<tr><td style='padding:6px 16px 6px 0'>{t.get('name') or t['id']}</td>"
                        f"<td><b>{int(t.get('sms_points') or 0)} points left</b></td></tr>" for t in alerts)
                    await _send_email(
                        [hq], f"⚠️ SMS balance running low — {len(alerts)} salon(s) under 20 points",
                        f"""<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;color:#333">
                        <h3 style="color:#1c1c22">SMS points running low</h3>
                        <table style="font-size:14px;border-collapse:collapse">{rows_html}</table>
                        <p style="font-size:13px;color:#555;margin-top:12px">Top up in Super Admin → the 💬 button
                        on each salon row, so booking confirmations, receipts and reminders keep reaching customers.</p></div>""")
        except Exception as e:
            logging.error(f"sms reminder scheduler error: {e}")
        await asyncio.sleep(1800)


async def _staff_exit_scheduler() -> None:
    """Every 6h: close out staff whose last working day has passed (former list,
    login block, registry employment exit date). Idempotent."""
    from routes.staff_admin import auto_close_departed_staff
    while True:
        try:
            out = await auto_close_departed_staff()
            if out.get("closed"):
                logging.info(f"staff exit sweep: closed={out['closed']}")
        except Exception as e:
            logging.error(f"staff exit scheduler error: {e}")
        await asyncio.sleep(6 * 3600)


async def _temp_transfer_scheduler() -> None:
    """Every 15 min: activate due temporary staff transfers and auto-return finished ones (IST dates)."""
    from routes.staff_admin import run_temp_transfer_sweep
    while True:
        try:
            out = await run_temp_transfer_sweep()
            if out.get("activated") or out.get("returned"):
                logging.info(f"temp transfer sweep: {out}")
        except Exception as e:
            logging.error(f"temp transfer scheduler error: {e}")
        await asyncio.sleep(900)


async def _weekly_report_scheduler() -> None:
    """Every Monday (after 09:00 IST) auto-email each active salon owner last
    week's business snapshot. Idempotent via system_flags."""
    while True:
        try:
            ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
            if ist_now.weekday() == 0 and ist_now.hour >= 9:
                period = (ist_now - timedelta(days=7)).strftime("%Y-%m-%d")  # last week's Monday
                flag = await _raw_db.system_flags.find_one({"key": "weekly_report_auto"})
                if not flag or flag.get("value") != period:
                    out = await _run_weekly_reports(None)
                    digest = await _run_platform_digest()
                    await _raw_db.system_flags.update_one(
                        {"key": "weekly_report_auto"},
                        {"$set": {"value": period, "ran_at": datetime.now(timezone.utc).isoformat(),
                                  "sent": out.get("sent", 0), "failed": out.get("failed", 0),
                                  "digest_sent": digest.get("sent", 0)}},
                        upsert=True)
                    logging.info(f"Auto weekly reports for week of {period}: sent={out.get('sent')} failed={out.get('failed')}")
        except Exception as e:
            logging.error(f"weekly report scheduler error: {e}")
        await asyncio.sleep(3600)


async def _birthday_scheduler() -> None:
    """Daily (after 09:00 IST) auto-email birthday wishes to guests. Idempotent via system_flags."""
    while True:
        try:
            ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
            if ist_now.hour >= 9:
                period = ist_now.strftime("%Y-%m-%d")
                flag = await _raw_db.system_flags.find_one({"key": "birthday_email_auto"})
                if not flag or flag.get("value") != period:
                    out = await _run_birthday_emails(None)
                    await _raw_db.system_flags.update_one(
                        {"key": "birthday_email_auto"},
                        {"$set": {"value": period, "ran_at": datetime.now(timezone.utc).isoformat(),
                                  "sent": out.get("sent", 0), "failed": out.get("failed", 0)}},
                        upsert=True)
                    if out.get("sent") or out.get("failed"):
                        logging.info(f"Auto birthday emails {period}: sent={out.get('sent')} failed={out.get('failed')}")
        except Exception as e:
            logging.error(f"birthday scheduler error: {e}")
        await asyncio.sleep(1800)


async def _cctv_poll_scheduler() -> None:
    """Every 2 min, poll enabled snapshot-URL cameras (business hours, per-tenant interval)."""
    from routes.cctv import poll_cctv_once
    while True:
        try:
            await poll_cctv_once()
        except Exception as e:
            logging.error(f"cctv poll scheduler error: {e}")
        await asyncio.sleep(120)


async def _renewal_reminder_scheduler() -> None:
    """Daily (after 10:00 IST) auto-email renewal reminders 15/7/1 days before
    subscription/trial expiry. Idempotent via system_flags + per-reminder log."""
    from routes.subscriptions import run_renewal_reminders
    while True:
        try:
            ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
            if ist_now.hour >= 10:
                period = ist_now.strftime("%Y-%m-%d")
                flag = await _raw_db.system_flags.find_one({"key": "renewal_reminder_auto"})
                if not flag or flag.get("value") != period:
                    out = await run_renewal_reminders()
                    await _raw_db.system_flags.update_one(
                        {"key": "renewal_reminder_auto"},
                        {"$set": {"value": period, "ran_at": datetime.now(timezone.utc).isoformat(),
                                  "sent": out.get("sent", 0), "failed": out.get("failed", 0)}},
                        upsert=True)
                    if out.get("sent") or out.get("failed"):
                        logging.info(f"Auto renewal reminders {period}: sent={out.get('sent')} failed={out.get('failed')}")
        except Exception as e:
            logging.error(f"renewal reminder scheduler error: {e}")
        await asyncio.sleep(1800)


async def _review_request_scheduler() -> None:
    """Every 30 min: email 'Rate your visit' to customers ~3h after completed
    appointments. Idempotent via review_request_sent_at marker on appointments."""
    while True:
        try:
            out = await _run_review_requests()
            if out.get("sent") or out.get("failed"):
                logging.info(f"Review requests: {out}")
        except Exception as e:
            logging.error(f"review request scheduler error: {e}")
        await asyncio.sleep(1800)


async def _demo_followup_scheduler() -> None:
    """Daily (after 10:00 IST) one-time gentle reminder to demo invitees who
    haven't replied within 5 days. Idempotent via system_flags."""
    from routes.hq_documents import run_demo_followups
    while True:
        try:
            ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
            if ist_now.hour >= 10:
                period = ist_now.strftime("%Y-%m-%d")
                flag = await _raw_db.system_flags.find_one({"key": "demo_followup_auto"})
                if not flag or flag.get("value") != period:
                    out = await run_demo_followups()
                    await _raw_db.system_flags.update_one(
                        {"key": "demo_followup_auto"},
                        {"$set": {"value": period, "ran_at": datetime.now(timezone.utc).isoformat(),
                                  "sent": out.get("sent", 0), "failed": out.get("failed", 0)}},
                        upsert=True)
                    if out.get("sent") or out.get("failed"):
                        logging.info(f"Demo follow-up nudges {period}: {out}")
        except Exception as e:
            logging.error(f"demo followup scheduler error: {e}")
        await asyncio.sleep(1800)


async def _lead_followup_scheduler() -> None:
    """Daily (after 10:00 IST) one-time follow-up to Mira leads still unanswered after 5 days.
    Idempotent via system_flags."""
    from routes.lead_gen import run_lead_followups
    while True:
        try:
            ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
            if ist_now.hour >= 10:
                period = ist_now.strftime("%Y-%m-%d")
                flag = await _raw_db.system_flags.find_one({"key": "lead_followup_auto"})
                if not flag or flag.get("value") != period:
                    out = await run_lead_followups()
                    await _raw_db.system_flags.update_one(
                        {"key": "lead_followup_auto"},
                        {"$set": {"value": period, "ran_at": datetime.now(timezone.utc).isoformat(),
                                  "sent": out.get("sent", 0), "failed": out.get("failed", 0)}},
                        upsert=True)
                    if out.get("sent") or out.get("failed"):
                        logging.info(f"Mira lead follow-ups {period}: {out}")
        except Exception as e:
            logging.error(f"lead followup scheduler error: {e}")
        await asyncio.sleep(1800)


async def _late_alert_scheduler() -> None:
    from routes.staff_portal import run_half_day_noshow_marker
    while True:
        try:
            if 7 <= datetime.now(IST_TZ).hour <= 20:
                out = await _run_late_alerts()
                if out.get("late_emails") or out.get("owner_summaries"):
                    logging.info(f"late alerts run: {out}")
                marked = await run_half_day_noshow_marker()
                if marked:
                    logging.info(f"half-day no-show marker: marked {marked} staff")
        except Exception as e:
            logging.error(f"late alert scheduler error: {e}")
        await asyncio.sleep(300)


async def _weekly_package_scheduler() -> None:
    """Every Monday (after 10:00 IST) Mira auto-drafts a fresh package suggestion for tenants
    whose last package expired — owner approves before publish. Idempotent via system_flags."""
    from routes.packages import run_monday_package_suggestions
    while True:
        try:
            ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
            if ist_now.weekday() == 0 and ist_now.hour >= 10:
                period = ist_now.strftime("%Y-%m-%d")
                flag = await _raw_db.system_flags.find_one({"key": "weekly_package_auto"})
                if not flag or flag.get("value") != period:
                    out = await run_monday_package_suggestions()
                    await _raw_db.system_flags.update_one(
                        {"key": "weekly_package_auto"},
                        {"$set": {"value": period, "ran_at": datetime.now(timezone.utc).isoformat(),
                                  "suggested": out.get("suggested", 0), "failed": out.get("failed", 0)}},
                        upsert=True)
                    if out.get("suggested") or out.get("failed"):
                        logging.info(f"Monday auto-package suggestions {period}: {out}")
        except Exception as e:
            logging.error(f"weekly package scheduler error: {e}")
        await asyncio.sleep(1800)


async def _gift_card_scheduler() -> None:
    """Hourly: deliver scheduled gift cards, expire stale ones, expiry nudges, occasion campaigns."""
    from routes.gift_cards import (deliver_scheduled_gift_cards, send_expiry_reminders,
                                   send_occasion_campaigns)
    from routes.pay_links import send_pay_link_reminders, send_renewal_nudges, run_trial_nudges
    while True:
        try:
            sent = await deliver_scheduled_gift_cards()
            if sent:
                logging.info(f"gift card scheduler: delivered {sent} scheduled cards")
            nudges = await send_expiry_reminders()
            if nudges:
                logging.info(f"gift card scheduler: sent {nudges} expiry reminders")
            promos = await send_occasion_campaigns()
            if promos:
                logging.info(f"gift card scheduler: sent {promos} occasion campaign emails")
            pl = await send_pay_link_reminders()
            if pl:
                logging.info(f"pay-link reminders: nudged {pl} owners about expiring links")
            rn = await send_renewal_nudges()
            if rn:
                logging.info(f"renewal nudges: emailed {rn} owners with a renewal pay link")
            tn = await run_trial_nudges()
            if tn:
                logging.info(f"trial nudges: emailed {tn} trial owners with usage stats + pay link")
        except Exception as e:
            logging.error(f"gift card scheduler error: {e}")
        await asyncio.sleep(3600)


async def _mira_auto_call_scheduler() -> None:
    """Every 10 min: Mira auto-calls hot leads discovered in the last 24h (if enabled)."""
    from routes.mira_calls import auto_call_hot_leads
    while True:
        try:
            await auto_call_hot_leads()
        except Exception as e:
            logging.error(f"mira auto-call scheduler error: {e}")
        await asyncio.sleep(600)


async def _mira_digest_scheduler() -> None:
    """Every 15 min: send Mira's evening digest once daily after 7 PM IST."""
    from routes.mira_calls import send_daily_digest
    while True:
        try:
            if await send_daily_digest():
                logging.info("mira daily digest sent")
        except Exception as e:
            logging.error(f"mira digest scheduler error: {e}")
        await asyncio.sleep(900)


async def _feedback_reminder_scheduler() -> None:
    """Every 6h: nudge salon owners who haven't answered their feedback link after 3 days."""
    from routes.feedback import send_feedback_reminders
    while True:
        try:
            n = await send_feedback_reminders()
            if n:
                logging.info(f"feedback reminders sent: {n}")
        except Exception as e:
            logging.error(f"feedback reminder scheduler error: {e}")
        await asyncio.sleep(6 * 3600)


async def _salon_digest_scheduler() -> None:
    """Every 15 min: after 8 AM IST send each salon owner their morning digest (once per day)."""
    from routes.salon_digest import send_salon_daily_digests
    while True:
        try:
            ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
            if 8 <= ist_now.hour < 12:
                n = await send_salon_daily_digests()
                if n:
                    logging.info(f"salon daily digests sent: {n}")
        except Exception as e:
            logging.error(f"salon digest scheduler error: {e}")
        await asyncio.sleep(900)


async def _db_health_scheduler() -> None:
    """Every 12h: run the weekly orphan-record audit if the last one is older than 7 days."""
    from routes.platform_tools import run_db_health_audit
    while True:
        try:
            flag = await _raw_db.system_flags.find_one({"key": "db_health"})
            last = (flag or {}).get("checked_at") or ""
            week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
            if not last or last < week_ago:
                out = await run_db_health_audit()
                logging.info(f"db health audit: {out}")
        except Exception as e:
            logging.error(f"db health scheduler error: {e}")
        await asyncio.sleep(12 * 3600)


async def _lead_heat_scheduler() -> None:
    """Every Sunday (after 08:00 IST) refresh Google data + re-score all Mira leads. Idempotent per week."""
    from routes.lead_gen import run_lead_heat_refresh
    while True:
        try:
            ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
            if ist_now.weekday() == 6 and ist_now.hour >= 8:
                period = ist_now.strftime("%Y-W%W")
                flag = await _raw_db.system_flags.find_one({"key": "lead_heat_refresh"})
                if not flag or flag.get("value") != period:
                    out = await run_lead_heat_refresh()
                    await _raw_db.system_flags.update_one(
                        {"key": "lead_heat_refresh"},
                        {"$set": {"value": period, "ran_at": datetime.now(timezone.utc).isoformat(), **out}},
                        upsert=True)
                    logging.info(f"lead heat refresh {period}: {out}")
        except Exception as e:
            logging.error(f"lead heat scheduler error: {e}")
        await asyncio.sleep(3600)


async def _callback_redial_scheduler() -> None:
    """Every 15 min: dial due timed callbacks and morning redials — each gated by the LEAD's local hours."""
    from routes.mira_calls import run_callback_redials, run_timed_callbacks
    while True:
        try:
            timed = await run_timed_callbacks()
            if timed:
                logging.info(f"timed callbacks dialed: {timed}")
            n = await run_callback_redials()
            if n:
                logging.info(f"callback redials (lead-local morning): {n}")
        except Exception as e:
            logging.error(f"callback redial scheduler error: {e}")
        await asyncio.sleep(900)


async def _phone_backfill_task() -> None:
    """One-shot on startup: convert national lead phone numbers to international format (idempotent via flag)."""
    from routes.lead_gen import run_phone_backfill
    try:
        await asyncio.sleep(20)
        flag = await _raw_db.system_flags.find_one({"key": "phone_intl_backfill"})
        if flag and flag.get("value") == "done":
            return
        out = await run_phone_backfill()
        await _raw_db.system_flags.update_one(
            {"key": "phone_intl_backfill"},
            {"$set": {"value": "done", "ran_at": datetime.now(timezone.utc).isoformat(), **out}}, upsert=True)
        logging.info(f"phone intl backfill: {out}")
    except Exception as e:
        logging.error(f"phone backfill error: {e}")


async def _weekly_win_scheduler() -> None:
    """Monday ≥ 09:00 IST: email Mira's Weekly Win Report (idempotent per ISO week)."""
    from routes.mira_calls import send_weekly_win_report
    while True:
        try:
            if await send_weekly_win_report():
                logging.info("weekly win report sent")
        except Exception as e:
            logging.error(f"weekly win scheduler error: {e}")
        await asyncio.sleep(1800)
