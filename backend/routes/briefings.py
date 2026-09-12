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

_TTS_CACHE: dict = {}  # (tenant_id, user_id) -> (date_str, payload) — 1 OpenAI call/user/day (SEC-003)

def _revenue_sentence(yesterday: float, last_week: float) -> str:
    if yesterday <= 0:
        return "Yesterday was quiet on the billing front — today is a fresh chance to shine. "
    s = f"Yesterday you brought in {_speak_amount(yesterday)} in revenue — great work! "
    if last_week > 0:
        pct = round((yesterday - last_week) / last_week * 100)
        if pct >= 5:
            s += f"That's {pct} percent up from the same day last week — you're on a roll! "
        elif pct <= -5:
            s += f"That's {abs(pct)} percent below the same day last week — let's bounce back today! "
    return s


async def _staff_today_status(day: str) -> dict:
    staff_list = await db.staff.find({"active": {"$ne": False}}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
    att = await db.attendance.find({"date": day}, {"_id": 0, "staff_id": 1}).to_list(300)
    checked = {a["staff_id"] for a in att}
    leaves = await db.leave_requests.find(
        {"status": "approved", "from_date": {"$lte": day}, "to_date": {"$gte": day}},
        {"_id": 0, "staff_id": 1}).to_list(100)
    on_leave = {lv["staff_id"] for lv in leaves}
    return {
        "checked_in": [s["name"] for s in staff_list if s["id"] in checked],
        "on_leave": [s["name"] for s in staff_list if s["id"] in on_leave and s["id"] not in checked],
        "not_checked_in": [s["name"] for s in staff_list if s["id"] not in checked and s["id"] not in on_leave],
    }


async def _briefing_notifications(today_str: str) -> dict:
    pend = await db.leave_requests.find(
        {"status": "pending"}, {"_id": 0, "staff_name": 1, "from_date": 1, "to_date": 1, "days": 1},
    ).sort("created_at", -1).to_list(20)
    new_bookings = await db.appointments.count_documents({"created_at": {"$regex": f"^{today_str}"}})
    new_reviews = await db.reviews.count_documents({"created_at": {"$regex": f"^{today_str}"}})
    return {"pending_leaves": pend, "new_bookings_today": new_bookings, "new_reviews_today": new_reviews}


def _joined(names: list, lang: str) -> str:
    if len(names) == 1:
        return names[0]
    sep = " और " if lang == "hi" else " and "
    return f"{', '.join(names[:-1])}{sep}{names[-1]}"


def _staff_sentence_hi(ci: int, ni: int, ol: list) -> str:
    s = ""
    if ci:
        s += f"{ci} स्टाफ चेक-इन कर चुके हैं" + (f", {ni} अभी बाकी हैं। " if ni else "। ")
    elif ni:
        s += "टीम ने अभी चेक-इन नहीं किया है। "
    if ol:
        s += f"{_joined(ol, 'hi')} आज छुट्टी पर हैं। "
    return s


def _staff_sentence_en(ci: int, ni: int, ol: list) -> str:
    s = ""
    if ci:
        s += f"{ci} of your team {'have' if ci != 1 else 'has'} checked in"
        s += f", {ni} {'are' if ni != 1 else 'is'} yet to arrive. " if ni else ". "
    elif ni:
        s += "None of your team has checked in yet. "
    if ol:
        s += f"{_joined(ol, 'en')} {'are' if len(ol) > 1 else 'is'} on approved leave today — plan the roster accordingly. "
    return s


def _staff_sentence(staff_st: dict, lang: str) -> str:
    ci, ni, ol = len(staff_st["checked_in"]), len(staff_st["not_checked_in"]), staff_st["on_leave"]
    return _staff_sentence_hi(ci, ni, ol) if lang == "hi" else _staff_sentence_en(ci, ni, ol)


def _notif_sentence_hi(notif: dict, names: list) -> str:
    s = ""
    if notif["pending_leaves"]:
        s += f"{len(notif['pending_leaves'])} छुट्टी की अर्ज़ी आपकी मंज़ूरी का इंतज़ार कर रही है — {_joined(names[:3], 'hi')} की तरफ़ से। "
    if notif["new_bookings_today"]:
        s += f"आज {notif['new_bookings_today']} नई बुकिंग आई हैं। "
    if notif["new_reviews_today"]:
        s += f"और {notif['new_reviews_today']} नया रिव्यू भी मिला है। "
    return s


def _notif_sentence_en(notif: dict, names: list) -> str:
    s = ""
    pend = notif["pending_leaves"]
    if pend:
        s += f"You have {len(pend)} leave request{'s' if len(pend) != 1 else ''} waiting for your approval — from {_joined(names[:3], 'en')}. "
    if notif["new_bookings_today"]:
        s += f"{notif['new_bookings_today']} new booking{'s' if notif['new_bookings_today'] != 1 else ''} came in today. "
    if notif["new_reviews_today"]:
        s += f"And you received {notif['new_reviews_today']} new review{'s' if notif['new_reviews_today'] != 1 else ''}. "
    return s


def _notif_sentence(notif: dict, lang: str) -> str:
    names = [p["staff_name"] for p in notif["pending_leaves"] if p.get("staff_name")]
    return _notif_sentence_hi(notif, names) if lang == "hi" else _notif_sentence_en(notif, names)


def _lowstock_sentence(low_count: int, has_vendor: bool, lang: str) -> str:
    if not low_count:
        return ""
    if lang == "hi":
        s = f"ध्यान दें — {low_count} प्रोडक्ट का स्टॉक कम हो रहा है। "
        if has_vendor:
            s += "क्या मैं रीस्टॉक लिस्ट वेंडर को मेल करूं या व्हाट्सएप पर भेजूं? बस बोलिए — मेल या व्हाट्सएप। "
        return s
    s = f"Heads up — {low_count} product{'s are' if low_count != 1 else ' is'} running low on stock. "
    if has_vendor:
        s += "Should I send the restock list to your vendor by mail, or on WhatsApp? Just say mail or WhatsApp. "
    return s


def _revenue_sentence_hi(rev: float, lastweek: float) -> str:
    if rev <= 0:
        return "कल बिलिंग शांत रही — आज एक नया मौका है। "
    s = f"कल आपने {int(round(rev))} रुपये की कमाई की — बहुत बढ़िया! "
    if lastweek > 0:
        pct = round((rev - lastweek) / lastweek * 100)
        if pct >= 5:
            s += f"यह पिछले हफ्ते के इसी दिन से {pct} प्रतिशत ज़्यादा है — शानदार! "
        elif pct <= -5:
            s += f"यह पिछले हफ्ते से {abs(pct)} प्रतिशत कम है — आज वापसी करते हैं! "
    return s


def _greeting_hi(ctx: dict) -> str:
    ist = ctx["ist"]
    hello = "सुप्रभात" if ist.hour < 12 else ("नमस्ते" if ist.hour < 17 else "शुभ संध्या")
    text = f"{hello} {ctx['name']} जी! {ctx['salon']} में आपका स्वागत है। "
    text += _revenue_sentence_hi(ctx["rev"], ctx["lastweek"])
    text += f"आज आपके पास {ctx['appts']} अपॉइंटमेंट हैं। " if ctx["appts"] else "आज कैलेंडर खाली है — वॉक-इन के लिए अच्छा दिन है। "
    text += _staff_sentence(ctx["staff_st"], "hi")
    text += _notif_sentence(ctx["notif"], "hi")
    text += _lowstock_sentence(ctx["low_count"], ctx["has_vendor"], "hi")
    if ist.hour < 12:
        text += "क्या मैं दिन की शुभ शुरुआत के लिए 30 मिनट भक्ति संगीत चला दूं? बस एंटरटेनमेंट टैब खोलिए। "
    return text + "आपका दिन शुभ हो!"


def _greeting_en(ctx: dict) -> str:
    ist = ctx["ist"]
    salutation = "Good morning" if ist.hour < 12 else ("Good afternoon" if ist.hour < 17 else "Good evening")
    text = f"Hey, {salutation} {ctx['name']}! Welcome back to {ctx['salon']}. "
    text += _revenue_sentence(ctx["rev"], ctx["lastweek"])
    appts = ctx["appts"]
    text += f"You have {appts} appointment{'s' if appts != 1 else ''} today. " if appts else "Your calendar is open today — a great day to bring in walk-ins. "
    text += _staff_sentence(ctx["staff_st"], "en")
    text += _notif_sentence(ctx["notif"], "en")
    text += _lowstock_sentence(ctx["low_count"], ctx["has_vendor"], "en")
    if ist.hour < 12:
        text += "Shall I play soothing Bhakti songs for 30 minutes to start the day on a divine note? Just open the Entertainment tab. "
    return text + "Have a wonderful day ahead!"


_LOW_STOCK_Q = {"$expr": {"$lte": ["$stock", {"$ifNull": ["$low_stock_threshold", 5]}]}}


async def _build_greeting_text(user: dict, t: dict, ist: datetime, today_str: str, lang: str = "en") -> tuple:
    low_count = await db.products.count_documents(_LOW_STOCK_Q)
    appts = await db.appointments.count_documents({"scheduled_at": {"$regex": f"^{today_str}"}, "status": {"$ne": "cancelled"}})
    has_vendor = await db.vendors.count_documents({}) > 0
    staff_st = await _staff_today_status(today_str)
    notif = await _briefing_notifications(today_str)
    yesterday = await _revenue_for_day((ist - timedelta(days=1)).strftime("%Y-%m-%d"))
    last_week = await _revenue_for_day((ist - timedelta(days=8)).strftime("%Y-%m-%d"))
    ctx = {"ist": ist, "name": user.get("name") or "there", "salon": t.get("name") or "your salon",
           "rev": yesterday, "lastweek": last_week, "appts": appts, "staff_st": staff_st,
           "notif": notif, "low_count": low_count, "has_vendor": has_vendor}
    builder = _greeting_hi if lang == "hi" else _greeting_en
    return builder(ctx), bool(low_count and has_vendor)


async def _tts_cache_get(cache_key: tuple, today_str: str):
    """Two-tier TTS cache: in-memory, then Mongo (survives restarts)."""
    cached = _TTS_CACHE.get(cache_key)
    if cached and cached[0] == today_str:
        return cached[1]
    doc = await _raw_db.tts_cache.find_one(
        {"key": ":".join(cache_key), "date": today_str}, {"_id": 0, "payload": 1})
    if doc:
        _TTS_CACHE[cache_key] = (today_str, doc["payload"])
        return doc["payload"]
    return None


async def _tts_cache_put(cache_key: tuple, today_str: str, payload: dict):
    if len(_TTS_CACHE) > 2000:
        _TTS_CACHE.clear()
    _TTS_CACHE[cache_key] = (today_str, payload)
    await _raw_db.tts_cache.update_one(
        {"key": ":".join(cache_key)},
        {"$set": {"date": today_str, "payload": payload, "created_at": datetime.now(timezone.utc)}},
        upsert=True)


async def _tts_cached_speech(speech_text: str, *, voice: str = "shimmer", speed: float = 1.0) -> str:
    """Content-hash TTS cache in Mongo: identical spoken text is generated ONCE,
    then replayed free. TTL refresh on hit keeps popular clips alive."""
    from emergentintegrations.llm.openai import OpenAITextToSpeech
    h = hashlib.sha256(f"{voice}|{speed}|{speech_text}".encode()).hexdigest()
    key = f"speech:{h}"
    now = datetime.now(timezone.utc)
    doc = await _raw_db.tts_cache.find_one({"key": key}, {"_id": 0, "payload": 1})
    if doc:
        await _raw_db.tts_cache.update_one({"key": key}, {"$set": {"created_at": now}})
        return doc["payload"]["audio_b64"]
    tts = OpenAITextToSpeech(api_key=os.environ["EMERGENT_LLM_KEY"])
    audio_b64 = await tts.generate_speech_base64(text=speech_text, model="tts-1", voice=voice, speed=speed)
    await _raw_db.tts_cache.update_one(
        {"key": key},
        {"$set": {"payload": {"audio_b64": audio_b64}, "created_at": now}}, upsert=True)
    return audio_b64


@router.get("/reports/morning-briefing/audio")
async def morning_briefing_audio(lang: str = "en", user=Depends(get_current_user), t=Depends(current_tenant)):
    """Mira speaks the greeting aloud (OpenAI TTS, shimmer voice). lang: en | hi."""
    from emergentintegrations.llm.openai import OpenAITextToSpeech
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    lang = "hi" if lang == "hi" else "en"
    ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    today_str = ist.strftime("%Y-%m-%d")
    cache_key = (t["id"], user["id"], lang)
    hit = await _tts_cache_get(cache_key, today_str)
    if hit:
        return hit
    text, ask_restock = await _build_greeting_text(user, t, ist, today_str, lang)
    try:
        tts = OpenAITextToSpeech(api_key=key)
        audio_b64 = await tts.generate_speech_base64(text=text, model="tts-1", voice="shimmer", speed=0.97)
    except Exception as e:
        raise HTTPException(400, f"Voice generation failed: {e}")
    payload = {"audio_b64": audio_b64, "text": text, "ask_restock": ask_restock, "lang": lang}
    await _tts_cache_put(cache_key, today_str, payload)
    return payload


LOW_STOCK_LIMIT = 3


def _evening_en(ctx: dict) -> str:
    text = f"Good evening {ctx['name']}! The day at {ctx['salon']} is winding down. "
    if ctx["rev_today"] > 0:
        text += f"Today you served {ctx['bills']} bill{'s' if ctx['bills'] != 1 else ''} and brought in {_speak_amount(ctx['rev_today'])}. "
        if ctx["rev_yest"] > 0:
            text += ("That's ahead of yesterday — wonderful momentum! " if ctx["rev_today"] >= ctx["rev_yest"]
                     else f"Yesterday was {_speak_amount(ctx['rev_yest'])}, so tomorrow is a fresh chance to top it. ")
    else:
        text += "It was a quiet day on billing — tomorrow is a brand new canvas. "
    if ctx["top_staff"]:
        text += f"Today's star performer was {ctx['top_staff']} — do pass on a word of appreciation. "
    if ctx["tomorrow_appts"]:
        text += f"You already have {ctx['tomorrow_appts']} appointment{'s' if ctx['tomorrow_appts'] != 1 else ''} booked for tomorrow. "
    return text + "Great work today. Rest well — Mira will see you in the morning!"


def _evening_hi(ctx: dict) -> str:
    text = f"शुभ संध्या {ctx['name']} जी! {ctx['salon']} में आज का दिन पूरा होने वाला है। "
    if ctx["rev_today"] > 0:
        text += f"आज आपने {ctx['bills']} बिल बनाए और {_speak_amount(ctx['rev_today'])} की कमाई की। "
        if ctx["rev_yest"] > 0:
            text += ("यह कल से बेहतर है — शानदार! " if ctx["rev_today"] >= ctx["rev_yest"]
                     else "कल थोड़ा ज़्यादा था — कल फिर से मौका है। ")
    else:
        text += "आज बिलिंग शांत रही — कल एक नई शुरुआत है। "
    if ctx["top_staff"]:
        text += f"आज के स्टार परफ़ॉर्मर रहे {ctx['top_staff']} — उन्हें शाबाशी ज़रूर दें। "
    if ctx["tomorrow_appts"]:
        text += f"कल के लिए {ctx['tomorrow_appts']} अपॉइंटमेंट पहले से बुक हैं। "
    return text + "आज बहुत अच्छा काम किया। आराम कीजिए — मीरा सुबह फिर मिलेगी!"


async def _build_evening_text(user: dict, t: dict, ist: datetime, lang: str) -> str:
    today_str = ist.strftime("%Y-%m-%d")
    invs = await db.invoices.find({"created_at": {"$regex": f"^{today_str}"}}, {"_id": 0, "total": 1, "staff_name": 1}).to_list(2000)
    by_staff = {}
    for i in invs:
        if i.get("staff_name"):
            by_staff[i["staff_name"]] = by_staff.get(i["staff_name"], 0) + float(i.get("total") or 0)
    ctx = {
        "name": user.get("name") or "there",
        "salon": t.get("name") or "your salon",
        "rev_today": round(sum(float(i.get("total") or 0) for i in invs), 2),
        "rev_yest": await _revenue_for_day((ist - timedelta(days=1)).strftime("%Y-%m-%d")),
        "bills": len(invs),
        "top_staff": max(by_staff, key=by_staff.get) if by_staff else "",
        "tomorrow_appts": await db.appointments.count_documents({"date": (ist + timedelta(days=1)).strftime("%Y-%m-%d")}),
    }
    return _evening_hi(ctx) if lang == "hi" else _evening_en(ctx)


@router.get("/reports/evening-briefing/audio")
async def evening_briefing_audio(lang: str = "en", user=Depends(get_current_user), t=Depends(current_tenant)):
    """Evening Mira — closing-time reflection spoken aloud. lang: en | hi."""
    from emergentintegrations.llm.openai import OpenAITextToSpeech
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    lang = "hi" if lang == "hi" else "en"
    ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    today_str = ist.strftime("%Y-%m-%d")
    cache_key = (t["id"], user["id"], lang, "eve")
    hit = await _tts_cache_get(cache_key, today_str)
    if hit:
        return hit
    text = await _build_evening_text(user, t, ist, lang)
    try:
        tts = OpenAITextToSpeech(api_key=key)
        audio_b64 = await tts.generate_speech_base64(text=text, model="tts-1", voice="shimmer", speed=0.97)
    except Exception as e:
        raise HTTPException(400, f"Voice generation failed: {e}")
    payload = {"audio_b64": audio_b64, "text": text, "ask_restock": False, "lang": lang}
    await _tts_cache_put(cache_key, today_str, payload)
    return payload


async def _revenue_for_day(day_str: str) -> float:
    rows = await db.invoices.find({"created_at": {"$regex": f"^{day_str}"}}, {"_id": 0, "total": 1}).to_list(2000)
    return round(sum(float(r.get("total") or 0) for r in rows), 2)


def _speak_amount(amount: float) -> str:
    n = int(round(amount))
    if n >= 100000:
        lakhs = n / 100000
        return f"{lakhs:.1f}".rstrip("0").rstrip(".") + " lakh rupees"
    if n >= 1000:
        thousands = n / 1000
        return f"{thousands:.1f}".rstrip("0").rstrip(".") + " thousand rupees"
    return f"{n} rupees"


@router.get("/reports/morning-briefing")
async def morning_briefing(user=Depends(get_current_user), t=Depends(current_tenant)):
    """Mira's login greeting: time-of-day salutation + low-stock products (< 3)."""
    ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    salutation = "Good Morning" if ist.hour < 12 else ("Good Afternoon" if ist.hour < 17 else "Good Evening")
    low = await db.products.find(
        _LOW_STOCK_Q, {"_id": 0, "id": 1, "name": 1, "brand": 1, "stock": 1, "sku": 1, "low_stock_threshold": 1},
    ).sort("stock", 1).to_list(100)
    vendors = await db.vendors.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    today_appts = await db.appointments.count_documents({"scheduled_at": {"$regex": f"^{ist.strftime('%Y-%m-%d')}"}, "status": {"$ne": "cancelled"}})
    yesterday_revenue = await _revenue_for_day((ist - timedelta(days=1)).strftime("%Y-%m-%d"))
    today_str = ist.strftime("%Y-%m-%d")
    staff_today = await _staff_today_status(today_str)
    notifications = await _briefing_notifications(today_str)
    return {
        "salutation": salutation,
        "yesterday_revenue": yesterday_revenue,
        "staff_today": staff_today,
        "notifications": notifications,
        "name": user.get("name") or t.get("name") or "there",
        "date_label": ist.strftime("%A, %d %B %Y"),
        "low_stock": low,
        "low_stock_limit": LOW_STOCK_LIMIT,
        "vendors": vendors,
        "today_appointments": today_appts,
        "voice_greeting_enabled": bool(t.get("voice_greeting_enabled")),
    }


