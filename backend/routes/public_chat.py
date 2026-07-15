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
from schemas import resolve_tenant_from_slug

router = APIRouter()

from emergentintegrations.llm.chat import LlmChat, UserMessage
from routes.public_site import (
    PublicBookingIn, _resolve_staff, _resolve_or_create_customer,
    _create_public_appointment, _SLOT_TIMES,
)
from routes.briefings import _tts_cached_speech

# ---------------- Public AI Beauty Advisor (recommends + books) ----------------
_BOOK_MARKER = "[[BOOK]]"

class PublicAIChatIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    session_id: str = Field(..., min_length=8, max_length=64)

async def _booking_catalog(t) -> str:
    today_iso = datetime.now(timezone(timedelta(hours=5, minutes=30))).date().isoformat()
    services, staff, coupons, pkgs, mems, products, leaves = await asyncio.gather(
        db.services.find({"active": True}, {"_id": 0}).to_list(200),
        db.staff.find({"active": True}, {"_id": 0, "id": 1, "name": 1, "role": 1, "tags": 1}).to_list(50),
        db.coupons.find({"active": True}, {"_id": 0}).to_list(50),
        db.packages.find({"active": True}, {"_id": 0}).to_list(50),
        db.memberships.find({"active": True}, {"_id": 0}).to_list(50),
        db.products.find({}, {"_id": 0, "name": 1, "category": 1, "price": 1, "stock": 1}).to_list(100),
        db.leave_requests.find(
            {"status": "approved", "from_date": {"$lte": today_iso}, "to_date": {"$gte": today_iso}},
            {"_id": 0, "staff_name": 1, "to_date": 1}).to_list(50),
    )
    svc_lines = "\n".join(
        f"- id={s['id']} | {s['name']} | {s.get('category', '')} | ₹{s['price']} | {s['duration_min']}min"
        for s in services) or "(no services listed)"
    staff_lines = "\n".join(
        f"- {s['name']} (id={s['id']}) — {s.get('role') or 'Stylist'}"
        + (f" | specialties: {', '.join(s['tags'])}" if s.get("tags") else "")
        for s in staff) or "- any available stylist"
    on_leave = {(lv.get("staff_name") or "").strip() for lv in leaves if lv.get("staff_name")}
    leave_line = (
        "STAFF ON LEAVE TODAY (do NOT offer them for today's bookings; they're back after their leave): "
        + ", ".join(f"{lv['staff_name']} (till {lv['to_date']})" for lv in leaves)
        if on_leave else "STAFF ON LEAVE TODAY: none — full team available.")
    today = datetime.now(timezone.utc).date().isoformat()
    live_coupons = [c for c in coupons
                    if (not c.get("expires_at") or c["expires_at"] >= today)
                    and (not c.get("max_uses") or int(c.get("used_count") or 0) < int(c["max_uses"]))]
    offer_lines = "\n".join(
        f"- Code {c['code']}: {int(c['value'])}% off" if c["type"] == "percent" else f"- Code {c['code']}: ₹{int(c['value'])} off"
        for c in live_coupons) or "(none currently)"
    pkg_lines = "\n".join(
        f"- {p['name']}: {p['sessions']}× {p.get('service_name', '')} for ₹{int(p['price'])} (valid {p.get('validity_days', 365)} days)"
        for p in pkgs) or "(none currently)"
    mem_lines = "\n".join(
        f"- {m['name']}: {int(m['discount_pct'])}% off all services for ₹{int(m['price'])} ({m.get('validity_days', 180)} days)"
        for m in mems) or "(none currently)"
    prod_lines = "\n".join(
        f"- {p['name']}{' (' + p['category'] + ')' if p.get('category') else ''} — ₹{int(p.get('price') or 0)}"
        + (" | in stock" if int(p.get("stock") or 0) > 0 else " | currently out of stock")
        for p in products) or "(no retail products listed)"
    ist_now = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    # Slot availability for the next 3 days so Mira never offers a full time.
    days = [(ist_now + timedelta(days=d)).date().isoformat() for d in range(3)]
    free_lists = await asyncio.gather(*[_free_slots_for(d) for d in days])
    avail_lines = "\n".join(
        f"- {d}: {', '.join(fl) if fl else 'FULLY BOOKED — do not offer this day'}"
        for d, fl in zip(days, free_lists))
    return (f"Salon: {t.get('name')}{', ' + t['location'] if t.get('location') else ''}. Hours: {t.get('hours')}. "
            f"Phone: {t.get('phone') or 'ask at the salon'}. "
            f"Current date & time (IST): {ist_now.strftime('%A %Y-%m-%d %H:%M')}.\n"
            f"SERVICE MENU:\n{svc_lines}\nOUR TEAM OF EXPERTS:\n{staff_lines}\n{leave_line}\n"
            f"OPEN TIME SLOTS (only ever offer/confirm a time from this list — others are full):\n{avail_lines}\n"
            f"CURRENT OFFERS (coupon codes customers can apply):\n{offer_lines}\n"
            f"PACKAGES (bought at the salon):\n{pkg_lines}\nMEMBERSHIPS (bought at the salon):\n{mem_lines}\n"
            f"RETAIL PRODUCTS (guests can buy these at the salon — recommend when relevant to their concern):\n{prod_lines}")

async def _ai_execute_booking(payload: str):
    """Parse the AI's booking JSON and create a real appointment.
    Returns (booking, error, requested_date)."""
    import json as _json
    req_date = None
    try:
        data = _json.loads(payload.strip().strip("`").strip())
        req_date = data.get("date")
        scheduled_at = f"{data['date']}T{data['time']}:00+05:30"
        bk = PublicBookingIn(
            customer_name=data["customer_name"], customer_phone=data["customer_phone"],
            gender=data.get("gender"), service_ids=data["service_ids"],
            staff_id=data.get("staff_id") or None, scheduled_at=scheduled_at,
            notes="Booked via AI advisor chat")
    except Exception as e:
        msg = str(e)
        if hasattr(e, "errors"):
            try:
                msg = "; ".join(err.get("msg", "") for err in e.errors())
            except Exception:
                pass
        return None, msg, req_date
    services = await db.services.find({"id": {"$in": bk.service_ids}, "active": True}, {"_id": 0}).to_list(50)
    if not services:
        return None, "Selected services were not found on the menu", req_date
    try:
        staff = await _resolve_staff(bk.staff_id, bk.scheduled_at, sum(s["duration_min"] for s in services) or 30)
        cust, _ = await _resolve_or_create_customer(bk)
        appt, total, duration = await _create_public_appointment(cust, staff, services, bk)
    except HTTPException as e:
        return None, str(e.detail), req_date
    return {"customer_name": cust["name"], "staff_name": staff["name"],
            "service_names": [s["name"] for s in services], "total": total,
            "duration_min": duration, "scheduled_at": bk.scheduled_at}, None, req_date

async def _free_slots_for(date: str) -> list[str]:
    """Return the list of 'HH:MM' slots still open on a given YYYY-MM-DD (IST)."""
    if not date or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        return []
    staff_count = await db.staff.count_documents({"active": True}) or 1
    appts = await db.appointments.find(
        {"scheduled_at": {"$regex": f"^{date}"}, "status": {"$nin": ["cancelled", "no_show"]}},
        {"_id": 0, "scheduled_at": 1, "duration_min": 1}).to_list(500)
    parsed = []
    for a in appts:
        try:
            ast = datetime.fromisoformat(a["scheduled_at"])
            if ast.tzinfo is None:
                ast = ast.replace(tzinfo=timezone.utc)
            parsed.append((ast, ast + timedelta(minutes=int(a.get("duration_min") or 30))))
        except ValueError:
            continue
    free = []
    for hhmm in _SLOT_TIMES:
        s = datetime.fromisoformat(f"{date}T{hhmm}:00+05:30")
        e = s + timedelta(minutes=30)
        if sum(1 for ast, aen in parsed if ast < e and aen > s) < staff_count:
            free.append(hhmm)
    return free

async def _public_ai_reply(t, session_id: str, message: str):
    """Shared Mira pipeline for text + voice. Returns (reply, booking, booking_error)."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    sid = f"pub-{t['id']}-{session_id}"
    hist = await _raw_db.public_ai_messages.find({"sid": sid}, {"_id": 0}).sort("created_at", 1).to_list(40)
    catalog = await _booking_catalog(t)
    chat = LlmChat(
        api_key=key, session_id=f"{sid}-{uuid.uuid4().hex[:8]}",
        system_message=(
            f"You are Mira, the expert AI beauty consultant on the online booking page of '{t.get('name', 'the salon')}'. "
            "You are warm, gracious and extremely polite — like the most caring senior beautician who treats every guest like a VIP.\n\n"
            "LANGUAGE RULE (VERY IMPORTANT): detect the language of each customer message and ALWAYS reply in that SAME language and script — "
            "English, Hindi (देवनागरी), Kannada (ಕನ್ನಡ), Tamil, Telugu, Malayalam, Marathi, Bengali, Urdu (اردو), or Hinglish/Kanglish in Latin script. "
            "If they switch languages mid-chat, switch with them instantly. Keep service names from the menu as-is but explain around them in their language.\n"
            "GREETING FLOW: at the very start of a conversation, warmly ask (in the customer's language): 'May I know your name, please?'. "
            f"When the customer tells you their name, reply: 'Welcome to Mira chat bot, [Name]! 💖 Thank you for choosing {t.get('name', 'our salon')}. How may I help you today?' and then assist them. "
            "Use their name naturally afterwards. Never repeat the welcome once given. "
            "ASK FOR THE NAME AT MOST ONCE — if their reply contains anything that could plausibly be a name (any language/script), accept it warmly and move on; NEVER ask for the name a second time.\n"
            "1) EXPERT BEAUTY ADVICE — give specific, detailed, professional recommendations for ANY beauty question: "
            "skin tone (fair, wheatish, dusky, deep), skin type (oily/dry/combination/sensitive), hair type (straight/wavy/curly, thin/thick), "
            "concerns (acne, tanning, pigmentation, dandruff, hair fall, frizz, dullness, aging), ingredients (vitamin C, niacinamide, hyaluronic acid, keratin, argan oil), "
            "aftercare routines, and product guidance. Explain WHY a treatment suits them in 1-2 lines. Ask 1-2 short questions if you need more info.\n"
            "2) MENU MATCHING — when recommending treatments, first check the SERVICE MENU below and quote exact ₹ prices. "
            "NEVER say 'we don't have that' bluntly. If something isn't listed yet, still give full expert advice about it, "
            "then gracefully suggest the CLOSEST service we do offer, and politely add they can tap the 'Message Salon' tab to ask the owner directly.\n"
            "3) OFFERS & PACKAGES — if the customer asks about offers, discounts, packages or memberships: share the CURRENT OFFERS / PACKAGES / MEMBERSHIPS listed below if any exist. "
            "If none exist, say warmly: 'I'm so sorry, currently we are not running any offers — but we will make sure to create a special package for you once you visit our salon 😊'. "
            "If a coupon code exists, tell them the code and that they can apply it while booking.\n"
            "4) SALON QUESTIONS — answer anything about the salon (timings, location, phone, stylists, prices) using the details below, always politely. "
            "If you genuinely don't know something, warmly direct them to the 'Message Salon' tab or the salon phone — never guess facts about the salon.\n"
            "5) BOOK APPOINTMENTS — you can book directly. Collect: full name, phone number (7-15 digits), chosen service(s) from the menu, "
            "preferred date and time (salon is open 10:00–21:00 IST; suggest tomorrow if they're unsure). "
            "When you have ALL details, show a one-line summary (services, total ₹, date, time) and ask them to confirm.\n"
            "6) SMART UPSELL — when the customer has chosen their service(s) and BEFORE asking for final confirmation, suggest exactly ONE complementary add-on from the menu "
            "(e.g. 'Would you like to add a Pedicure for just ₹500 more? ✨'). Suggest it only ONCE — if they decline or ignore it, proceed graciously without repeating.\n"
            "7) EXPERT SELECTION — OUR TEAM OF EXPERTS (with their specialties) is listed below. While booking, ask warmly: "
            "'Which of our experts would you like for your service?' and mention the experts by name whose specialty matches "
            "(e.g. nails → the nail expert, hair → the hair expert). If the guest is new or unsure, say something like "
            "'Since it's your first time, I'd suggest [Name] — our [specialty] expert, you'll be in great hands! ✨'. "
            "Put the chosen expert's id in staff_id in the booking JSON; if they truly have no preference, use null. Never invent staff names.\n"
            "CRITICAL MEMORY RULE: carefully re-read the conversation history before replying and NEVER re-ask for anything the customer already told you "
            "(chosen services, name, phone, date, time, skin/hair details). If earlier they picked services and now send name+phone+time, go straight to the summary + confirmation.\n"
            f"ONLY after the customer explicitly confirms, end your reply with one line in EXACTLY this format (double quotes, valid JSON):\n"
            f'{_BOOK_MARKER}{{"customer_name":"...","customer_phone":"...","gender":"Female","service_ids":["<id from menu>"],"staff_id":null,"date":"YYYY-MM-DD","time":"HH:MM"}}\n'
            "Rules: never mention the marker or JSON (it is machine-read); never invent service ids; time is 24h format; "
            "keep replies short, warm and mobile-friendly (short paragraphs or dash lists; you may use **bold** for service names and prices, no other markdown); use ₹ for prices; sprinkle a tasteful emoji occasionally (✨💆‍♀️); "
            "never be dismissive — every reply should leave the guest feeling cared for.\n\n" + catalog
        ),
    ).with_model("openai", "gpt-5.4-mini")
    if hist:
        transcript = "\n".join(f"{'Customer' if h['role'] == 'user' else 'Mira'}: {h['content']}" for h in hist[-24:])
        prompt_text = (f"CONVERSATION SO FAR (remember every detail the customer already shared — do NOT re-ask):\n{transcript}\n\n"
                       f"Customer's new message: {message}")
    else:
        prompt_text = message
    try:
        resp = await chat.send_message(UserMessage(text=prompt_text))
        reply = resp if isinstance(resp, str) else str(resp)
    except Exception as e:
        logging.getLogger("public_ai").error(f"public ai chat error: {e}")
        raise HTTPException(400, "Mira is unavailable right now — please try again in a moment.")

    booking, booking_error = None, None
    if _BOOK_MARKER in reply:
        text, _, payload = reply.partition(_BOOK_MARKER)
        booking, booking_error, req_date = await _ai_execute_booking(payload)
        text = text.strip()
        if booking:
            reply = (text + "\n\n✅ Done — your appointment is booked! The salon will confirm shortly.").strip()
        else:
            # Booking FAILED — never keep the model's premature "confirmed" text.
            # Apologise and, if the slot was full, offer the times that are actually free.
            free = await _free_slots_for(req_date) if req_date else []
            if free:
                shown = ", ".join(free[:8])
                reply = (f"I'm so sorry — that time slot just got fully booked 🙏\n\n"
                         f"Here are the open times for {req_date}: {shown}.\n"
                         f"Which one shall I book for you? ✨")
            else:
                reply = (f"I'm so sorry — I couldn't complete that booking ({booking_error}). "
                         f"Could we try a different date or time? I'll get you in as soon as possible 💖")
    now = datetime.now(timezone.utc).isoformat()
    await _raw_db.public_ai_messages.insert_many([
        {"id": str(uuid.uuid4()), "sid": sid, "tenant_id": t["id"], "role": "user", "content": message, "created_at": now},
        {"id": str(uuid.uuid4()), "sid": sid, "tenant_id": t["id"], "role": "assistant",
         "content": reply + (" [Appointment booked]" if booking else ""), "created_at": datetime.now(timezone.utc).isoformat()},
    ])
    return reply, booking, booking_error

@router.post("/public/ai-chat/{slug}")
async def public_ai_chat(slug: str, body: PublicAIChatIn, request: Request):
    t = await resolve_tenant_from_slug(slug)
    public_rate_limit(request, key_suffix=f"aichat:{slug}", limit=40, window_sec=600)
    await durable_rate_limit(request, f"aichat:{slug}", limit=40, window_sec=600)
    await ai_daily_quota(t["id"], "public_ai_chat", 400)
    reply, booking, booking_error = await _public_ai_reply(t, body.session_id, body.message)
    return {"reply": reply, "booking": booking, "booking_error": booking_error}

@router.post("/public/ai-voice/{slug}")
async def public_ai_voice(slug: str, request: Request, audio: UploadFile = File(...), session_id: str = Form(..., min_length=8, max_length=64)):
    from emergentintegrations.llm.openai import OpenAISpeechToText
    t = await resolve_tenant_from_slug(slug)
    public_rate_limit(request, key_suffix=f"aivoice:{slug}", limit=30, window_sec=600)
    await durable_rate_limit(request, f"aivoice:{slug}", limit=30, window_sec=600)
    await ai_daily_quota(t["id"], "public_ai_voice", 150)
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    data = await audio.read()
    if not data:
        raise HTTPException(400, "Empty audio")
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(413, "Audio too large — keep it under a minute")
    buf = io.BytesIO(data)
    ext = (audio.filename or "voice.webm").rsplit(".", 1)[-1].lower()
    buf.name = f"voice.{ext if ext in ('webm', 'mp3', 'mp4', 'wav', 'm4a', 'mpeg', 'mpga') else 'webm'}"
    stt = OpenAISpeechToText(api_key=key)
    try:
        # Bias prompt helps Whisper with Indian multilingual salon vocabulary (auto language detect).
        tr = await stt.transcribe(
            file=buf, model="whisper-1", response_format="json",
            prompt="Indian salon booking call. ग्राहक हिंदी या English में बोलते हैं: हेयरकट, फेशियल, कीमत, बुकिंग. Beauty terms: haircut, facial, keratin, mehendi, pedicure.")
        transcript = (tr.text or "").strip()
    except Exception as e:
        logging.getLogger("public_ai").error(f"stt error: {e}")
        raise HTTPException(400, "Sorry, I couldn't hear that — please try again.")
    if not transcript:
        raise HTTPException(400, "I couldn't hear anything — please speak again.")
    reply, booking, booking_error = await _public_ai_reply(t, session_id, transcript)
    audio_b64 = None
    try:
        speech_text = re.sub(r"\*\*|✨|💖|💆‍♀️|✅|⚠️|📞|🙏", "", reply)[:4000]
        audio_b64 = await _tts_cached_speech(speech_text, voice="shimmer", speed=1.0)
    except Exception as e:
        logging.getLogger("public_ai").error(f"tts error: {e}")
    return {"transcript": transcript, "reply": reply, "booking": booking,
            "booking_error": booking_error, "audio_b64": audio_b64}

# ---------------- Customer ↔ Salon Owner Chat ----------------
class ChatStartIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    phone: str
    # SEC-001: a client-owned secret binds a chat thread to the device that created it,
    # so history is NOT retrievable by merely knowing a victim's phone number.
    session_key: str = Field(..., min_length=16, max_length=64)

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        cleaned = "".join(c for c in v if c.isdigit())
        if not re.fullmatch(r"\d{7,15}", cleaned):
            raise ValueError("Enter a valid phone number (7-15 digits)")
        return cleaned

    @field_validator("session_key")
    @classmethod
    def _skey(cls, v):
        if not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", v):
            raise ValueError("Invalid session key")
        return v

class ChatSendIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)

async def _append_chat_message(thread_id: str, sender: str, text: str) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    msg = {"id": str(uuid.uuid4()), "thread_id": thread_id, "sender": sender, "text": text, "created_at": now}
    await db.chat_messages.insert_one(msg)
    unread_field = "unread_admin" if sender == "customer" else "unread_customer"
    await db.chat_threads.update_one(
        {"id": thread_id},
        {"$set": {"last_message": text[:120], "last_at": now}, "$inc": {unread_field: 1}})
    return _clean(msg)

@router.post("/public/chat/{slug}/start")
async def public_chat_start(slug: str, body: ChatStartIn, request: Request):
    await resolve_tenant_from_slug(slug)
    public_rate_limit(request, key_suffix=f"chatstart:{slug}", limit=10, window_sec=600)
    # SEC-001: look up the thread by the caller's secret session_key, NOT by phone.
    # An attacker entering a victim's phone gets a fresh empty thread (their own key),
    # never the victim's history. The owner still sees every thread in the admin panel.
    th = await db.chat_threads.find_one({"session_key": body.session_key}, {"_id": 0})
    if not th:
        now = datetime.now(timezone.utc).isoformat()
        th = {"id": str(uuid.uuid4()), "session_key": body.session_key,
              "customer_name": body.name.strip(), "customer_phone": body.phone,
              "last_message": "", "last_at": now, "unread_admin": 0, "unread_customer": 0, "created_at": now}
        await db.chat_threads.insert_one(th)
        th.pop("_id", None)
    else:
        upd = {}
        if body.name.strip() and body.name.strip() != th.get("customer_name"):
            upd["customer_name"] = body.name.strip()
        if body.phone != th.get("customer_phone"):
            upd["customer_phone"] = body.phone
        if upd:
            await db.chat_threads.update_one({"id": th["id"]}, {"$set": upd})
            th.update(upd)
    msgs = await db.chat_messages.find({"thread_id": th["id"]}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return {"thread_id": th["id"], "customer_name": th["customer_name"], "messages": msgs}

@router.get("/public/chat/{slug}/{thread_id}")
async def public_chat_poll(slug: str, thread_id: str, k: str = ""):
    await resolve_tenant_from_slug(slug)
    th = await db.chat_threads.find_one({"id": thread_id}, {"_id": 0})
    if not th:
        raise HTTPException(404, "Chat not found")
    # SEC: thread id alone is a capability URL — require the device session_key when the thread has one
    if th.get("session_key") and th["session_key"] != k:
        raise HTTPException(403, "This chat belongs to another device")
    await db.chat_threads.update_one({"id": thread_id}, {"$set": {"unread_customer": 0}})
    msgs = await db.chat_messages.find({"thread_id": thread_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return {"messages": msgs}

@router.post("/public/chat/{slug}/{thread_id}/send")
async def public_chat_send(slug: str, thread_id: str, body: ChatSendIn, request: Request, k: str = ""):
    await resolve_tenant_from_slug(slug)
    public_rate_limit(request, key_suffix=f"chatsend:{slug}", limit=30, window_sec=600)
    th = await db.chat_threads.find_one({"id": thread_id}, {"_id": 0})
    if th and th.get("session_key") and th["session_key"] != k:
        raise HTTPException(403, "This chat belongs to another device")
    if not th:
        raise HTTPException(404, "Chat not found")
    return await _append_chat_message(thread_id, "customer", body.message.strip())

@router.get("/owner-chats")
async def owner_chats(user=Depends(require_tenant_admin)):
    return await db.chat_threads.find({}, {"_id": 0, "session_key": 0}).sort("last_at", -1).to_list(200)

@router.get("/owner-chats/unread-count")
async def owner_chats_unread(user=Depends(require_tenant_admin)):
    rows = await db.chat_threads.find({"unread_admin": {"$gt": 0}}, {"_id": 0, "unread_admin": 1}).to_list(500)
    return {"unread": sum(int(r.get("unread_admin") or 0) for r in rows)}

@router.get("/owner-chats/{thread_id}/messages")
async def owner_chat_messages(thread_id: str, user=Depends(require_tenant_admin)):
    th = await db.chat_threads.find_one({"id": thread_id}, {"_id": 0, "session_key": 0})
    if not th:
        raise HTTPException(404, "Chat not found")
    await db.chat_threads.update_one({"id": thread_id}, {"$set": {"unread_admin": 0}})
    msgs = await db.chat_messages.find({"thread_id": thread_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return {"thread": th, "messages": msgs}

@router.post("/owner-chats/{thread_id}/reply")
async def owner_chat_reply(thread_id: str, body: ChatSendIn, user=Depends(require_tenant_admin)):
    th = await db.chat_threads.find_one({"id": thread_id}, {"_id": 0})
    if not th:
        raise HTTPException(404, "Chat not found")
    return await _append_chat_message(thread_id, "owner", body.message.strip())


