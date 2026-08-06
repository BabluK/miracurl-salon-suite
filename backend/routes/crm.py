# Extracted from server.py — domain route module (auto-split refactor)
import os  # noqa: F401
import re  # noqa: F401
import io  # noqa: F401
import csv  # noqa: F401
import math  # noqa: F401
import uuid  # noqa: F401
import hmac  # noqa: F401
import hashlib  # noqa: F401
import asyncio  # noqa: F401
import base64  # noqa: F401
import secrets  # noqa: F401
import logging  # noqa: F401
import html as html_lib  # noqa: F401
from datetime import datetime, timezone, timedelta  # noqa: F401
from typing import Dict, List, Optional  # noqa: F401
from urllib.parse import quote, urlparse  # noqa: F401

import requests  # noqa: F401
from fastapi import (  # noqa: F401
    APIRouter, HTTPException, Depends, Request, Response, Query, UploadFile, File, Form,
)
from starlette.responses import StreamingResponse  # noqa: F401
from pydantic import BaseModel, Field, EmailStr, field_validator  # noqa: F401

from database import client, _raw_db, db, _current_tenant_id, _clean  # noqa: F401
from security import (  # noqa: F401
    hash_pw, verify_pw, get_current_user, require_admin, public_rate_limit,
    durable_rate_limit, ai_daily_quota, require_super_admin, require_tenant_admin,
    current_tenant, require_owner_pin, _pin_attempt_guard, _pin_attempt_fail, _pin_attempt_clear,
)
from models import (  # noqa: F401
    Tenant, Customer, Appointment, REVIEW_REWARD_CREDITS, MAX_CUSTOMER_CREDIT,
    REFERRAL_REWARD_REFERRER, REFERRAL_REWARD_REFERRED,
)
from email_service import (  # noqa: F401
    _send_email, _welcome_email_html, _credentials_email_html, _monthly_report_html,
    _weekly_report_html, _birthday_email_html, _platform_digest_html,
)
from services.storage import _put_object, _get_object, _MIME, APP_NAME, validate_image_bytes  # noqa: F401
from services.pdf import _render_salary_slip_pdf, _render_resume_pdf  # noqa: F401
from services.billing import (  # noqa: F401
    _validate_coupon, _consume_coupon, _coupon_discount, _active_membership, _loyalty_rules,
)
from utils import _csv_cell, _csv_row, _read_csv_upload, MAX_CSV_BYTES  # noqa: F401

router = APIRouter()


# ---------------- Post-visit "Rate your visit" review requests ----------------
_REVIEW_REQ_DELAY_H = 3
_REVIEW_REQ_WINDOW_H = 48


def _review_request_email_html(salon_name: str, customer_name: str, review_url: str) -> str:
    import html as _h
    nm = _h.escape(customer_name or "there")
    sn = _h.escape(salon_name or "your salon")
    return f"""<!doctype html><html><body style="margin:0;padding:0;background:#f2f0eb">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0eb;padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,.08)">
  <tr><td style="background:#15151b;padding:26px 32px 22px;text-align:center">
    <div style="font-family:Georgia,serif;font-size:20px;letter-spacing:3px;color:#d4af37">{sn.upper()}</div>
    <div style="font-size:26px;margin-top:14px;letter-spacing:6px">⭐⭐⭐⭐⭐</div>
    <div style="font-family:Georgia,serif;color:#f4f1e8;font-size:20px;margin-top:10px">How was your visit, {nm}?</div>
  </td></tr>
  <tr><td style="padding:26px 32px 8px;text-align:center">
    <p style="font-size:14px;color:#55555f;line-height:1.75;margin:0">
      Thank you for visiting us today — it was a pleasure having you.
      Would you take <b>20 seconds</b> to rate your experience? It means the world to our team.</p>
  </td></tr>
  <tr><td align="center" style="padding:20px 32px 8px">
    <a href="{review_url}" style="display:inline-block;background:#d4af37;color:#15151b;font-size:15px;font-weight:bold;
       text-decoration:none;padding:14px 40px;border-radius:999px;letter-spacing:.4px">Rate my visit ✦</a>
    <div style="font-size:11px;color:#8f8798;margin-top:10px">Leave a 4★+ review and a small thank-you reward may be waiting for you 🎁</div>
  </td></tr>
  <tr><td style="padding:16px 32px 26px;text-align:center">
    <p style="font-size:13px;color:#33333b;margin:0">With gratitude,<br><b style="font-family:Georgia,serif">{sn}</b></p>
  </td></tr>
</table>
<div style="font-size:10px;color:#a9a294;margin-top:10px">Powered by Miracurl Suite</div>
</td></tr></table></body></html>"""


async def _review_request_candidates(tenant_id: str):
    now = datetime.now(timezone.utc)
    lo = (now - timedelta(hours=_REVIEW_REQ_WINDOW_H)).isoformat()
    hi = (now - timedelta(hours=_REVIEW_REQ_DELAY_H)).isoformat()
    appts = await _raw_db.appointments.find(
        {"tenant_id": tenant_id, "status": "completed",
         "scheduled_at": {"$gte": lo, "$lte": hi},
         "review_request_sent_at": {"$exists": False}},
        {"_id": 0, "id": 1, "customer_id": 1, "customer_name": 1, "scheduled_at": 1}).to_list(200)
    out = []
    for a in appts:
        if await _raw_db.reviews.find_one({"appointment_id": a["id"]}, {"_id": 1}):
            continue
        c = await _raw_db.customers.find_one(
            {"tenant_id": tenant_id, "id": a.get("customer_id")}, {"_id": 0, "email": 1, "phone": 1})
        out.append({**a, "email": (c or {}).get("email") or "", "phone": (c or {}).get("phone") or ""})
    return out


async def _run_review_requests(tenant_id: Optional[str] = None) -> dict:
    flt = {"id": tenant_id} if tenant_id else {"status": {"$in": ["active", "trial"]}}
    tenants = await _raw_db.tenants.find(flt, {"_id": 0, "id": 1, "name": 1, "slug": 1, "review_requests_enabled": 1}).to_list(500)
    app_url = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    sent = failed = 0
    for t in tenants:
        if t.get("review_requests_enabled") is False:
            continue
        for a in await _review_request_candidates(t["id"]):
            if not a["email"]:
                continue
            status = await _send_email(
                [a["email"]],
                f"⭐ How was your visit to {t.get('name', 'the salon')}?",
                _review_request_email_html(t.get("name", ""), a.get("customer_name", ""),
                                           f"{app_url}/review/{a['id']}"))
            if status.get("sent"):
                sent += 1
                await _raw_db.appointments.update_one(
                    {"id": a["id"]},
                    {"$set": {"review_request_sent_at": datetime.now(timezone.utc).isoformat()}})
            else:
                failed += 1
    return {"sent": sent, "failed": failed}


@router.get("/settings/review-requests")
async def get_review_requests_setting(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return {"enabled": t.get("review_requests_enabled", True), "delay_hours": _REVIEW_REQ_DELAY_H}


@router.put("/settings/review-requests")
async def set_review_requests_setting(body: dict, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    enabled = bool(body.get("enabled", True))
    await db.tenants.update_one({"id": t["id"]}, {"$set": {"review_requests_enabled": enabled}})
    return {"enabled": enabled}


@router.get("/reviews/pending-requests")
async def reviews_pending_requests(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Completed visits (last 48h) still without a review — for one-tap WhatsApp asks."""
    app_url = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    items = []
    for a in await _review_request_candidates(t["id"]):
        url = f"{app_url}/review/{a['id']}"
        msg = (f"Hi {a.get('customer_name', '')}! Thank you for visiting {t.get('name', 'us')} 💇 "
               f"We'd love to hear how it went — it takes 20 seconds: {url}")
        items.append({"appointment_id": a["id"], "customer_name": a.get("customer_name", ""),
                      "scheduled_at": a.get("scheduled_at"), "email": a["email"], "phone": a["phone"],
                      "wa_link": f"https://wa.me/{re.sub(r'[^0-9]', '', a['phone'])}?text={quote(msg)}" if a["phone"] else None,
                      "sms_link": f"sms:{a['phone']}?&body={quote(msg)}" if a["phone"] else None})
    return {"items": items}


@router.post("/reviews/request-now")
async def reviews_request_now(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return await _run_review_requests(t["id"])


DEFAULT_BIRTHDAY_OFFER = "Free Hair Spa this week 🎂"


def _member_birthday_html(t: dict, name: str, member: dict, offer: str, book_url: str) -> str:
    """Golden birthday email for premium members — perks + one-tap booking link."""
    import html as _h
    nm, sn = _h.escape((name or "there").split(" ")[0]), _h.escape(t.get("name") or "your salon")
    tier = _h.escape((member.get("tier") or "member").capitalize())
    benefits = member.get("benefits") or []
    perk = "Birthday Offer" if "Birthday Offer" in benefits else (benefits[0] if benefits else "a special member treat")
    chips = "".join(
        f"<span style='display:inline-block;background:#faf3dd;border:1px solid #e6d9a8;color:#8a6d1a;"
        f"border-radius:14px;padding:3px 10px;font-size:11px;margin:2px'>{_h.escape(b)}</span>" for b in benefits)
    return f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#333">
    <div style="background:#15151b;border-radius:18px 18px 0 0;padding:26px 30px;text-align:center">
      <div style="color:#d4af37;letter-spacing:3px;font-size:18px">{sn.upper()}</div>
      <div style="font-size:34px;margin-top:10px">🎂✨</div>
      <div style="color:#f4f1e8;font-size:22px;margin-top:8px">Happy Birthday, {nm}!</div>
      <div style="color:#d4af37;font-size:12px;letter-spacing:2px;margin-top:6px">{tier.upper()} MEMBER · {_h.escape(member.get('member_id') or '')}</div>
    </div>
    <div style="background:#fff;border:1px solid #eee;border-top:0;border-radius:0 0 18px 18px;padding:26px 30px">
      <p>As one of our <b>{tier}</b> members, your <b>{_h.escape(perk)}</b> is waiting for you — plus {_h.escape(offer or 'a little birthday pampering on us')}.</p>
      {f"<div style='margin:12px 0'>{chips}</div>" if chips else ""}
      <p style="text-align:center;margin:24px 0">
        <a href="{book_url}" style="background:linear-gradient(120deg,#d4af37,#b45309);color:#fff;text-decoration:none;
           font-weight:bold;padding:14px 36px;border-radius:30px;display:inline-block">Book my birthday visit →</a></p>
      <p style="font-size:12px;color:#888;text-align:center">Show your Member ID {_h.escape(member.get('member_id') or '')} at the salon to claim your treat.</p>
      <p>With love,<br/><b>{sn}</b> 💛</p>
    </div></div>"""


async def _run_birthday_emails(tenant_id: Optional[str] = None) -> dict:
    """Email birthday + anniversary wishes to guests whose special day is today (IST).
    Used by the daily scheduler AND the admin 'send now' button."""
    ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    mmdd = ist.strftime("%m-%d")
    flt = {"id": tenant_id} if tenant_id else {"status": {"$in": ["active", "trial"]}}
    tenants = await _raw_db.tenants.find(flt, {"_id": 0}).to_list(500)
    app_url = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    results = []
    for t in tenants:
        if not tenant_id and t.get("birthday_emails_enabled") is False:
            continue
        offer = t.get("birthday_offer_text") or DEFAULT_BIRTHDAY_OFFER
        book_url = f"{app_url}/book/{t.get('slug', '')}"
        occasions = [
            ("dob", f"🎂 Happy Birthday {{name}} — from {t.get('name', 'your salon')} ✦"),
            ("anniversary", f"💞 Happy Anniversary {{name}} — from {t.get('name', 'your salon')} ✦"),
        ]
        for field, subject_tpl in occasions:
            custs = await _raw_db.customers.find(
                {"tenant_id": t["id"], field: {"$regex": f"-{mmdd}$"},
                 "email": {"$exists": True, "$nin": [None, ""]}},
                {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(200)
            for c in custs:
                member = None
                if field == "dob":
                    member = await _raw_db.customer_memberships.find_one(
                        {"tenant_id": t["id"], "customer_id": c["id"],
                         "member_id": {"$exists": True, "$ne": ""},
                         "expires_at": {"$gt": datetime.now(timezone.utc).isoformat()}}, {"_id": 0})
                if member:
                    subject = f"🎂 Happy Birthday {c['name']} — your member treat awaits ✦"
                    html = _member_birthday_html(t, c["name"], member, offer, book_url)
                else:
                    subject = subject_tpl.format(name=c["name"])
                    html = _birthday_email_html(t, c["name"], offer, book_url)
                status = await _send_email([c["email"]], subject, html, book_url=book_url)
                results.append({"tenant": t["name"], "customer": c["name"], "email": c["email"],
                                "occasion": "member_birthday" if member else field,
                                "sent": status.get("sent", False), "error": status.get("error")})
    sent = sum(1 for r in results if r["sent"])
    return {"date": ist.strftime("%Y-%m-%d"), "sent": sent, "failed": len(results) - sent, "results": results}


@router.get("/crm/celebrations-today")
async def celebrations_today(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Today's birthdays & anniversaries with one-tap WhatsApp / SMS links."""
    ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    mmdd = ist.strftime("%m-%d")
    app_url = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    offer = t.get("birthday_offer_text") or DEFAULT_BIRTHDAY_OFFER
    book_url = f"{app_url}/book/{t.get('slug', '')}"
    out = {"offer_text": offer, "birthdays": [], "anniversaries": []}
    for field, key, emoji, word in (("dob", "birthdays", "🎂", "Birthday"), ("anniversary", "anniversaries", "💞", "Anniversary")):
        custs = await db.customers.find(
            {field: {"$regex": f"-{mmdd}$"}},
            {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1}).to_list(100)
        for c in custs:
            msg = (f"{emoji} Happy {word} {c['name']}! Team {t.get('name', 'your salon')} wishes you a wonderful day. "
                   f"Our gift to you: {offer} — book here: {book_url}")
            digits = re.sub(r"[^0-9]", "", c.get("phone") or "")
            out[key].append({**c,
                             "wa_link": f"https://wa.me/{digits}?text={quote(msg)}" if digits else None,
                             "sms_link": f"sms:{c.get('phone')}?&body={quote(msg)}" if digits else None})
    return out


@router.post("/crm/send-birthday-wishes")
async def send_birthday_wishes(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Admin manually triggers today's birthday emails for their salon."""
    out = await _run_birthday_emails(t["id"])
    if not out["results"]:
        return {**out, "message": "No guests with a birthday today (or missing email on their profile)."}
    return out
