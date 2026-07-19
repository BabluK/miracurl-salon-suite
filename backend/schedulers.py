"""Background schedulers (extracted from server.py). Registered in server.on_startup."""
import asyncio  # noqa: F401
import logging  # noqa: F401
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
    while True:
        try:
            if 7 <= datetime.now(IST_TZ).hour <= 20:
                out = await _run_late_alerts()
                if out.get("late_emails") or out.get("owner_summaries"):
                    logging.info(f"late alerts run: {out}")
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
