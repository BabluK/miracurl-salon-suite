"""Sales Mira: landing-page product chat + tenant inquiries (super-admin CRM)."""
import asyncio
import logging
import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field, field_validator
from emergentintegrations.llm.chat import LlmChat, UserMessage

from database import _raw_db
from security import public_rate_limit, require_super_admin
from email_service import _send_email, _lead_alert_email_html

router = APIRouter()

_SALES_SESSIONS: dict = {}

_SALES_SYSTEM_PROMPT = (
    "You are Mira, the friendly AI sales assistant on the Miracurl Salon Suite website "
    "(miracurl-suite.com). You help salon owners understand the product and choose a plan. "
    "PRODUCT KNOWLEDGE — Miracurl is an all-in-one salon management suite built for Indian salons: "
    "• Appointments & 24/7 online booking page (each salon gets its own /book link + QR poster) "
    "• POS billing with GST invoices, thermal-printer receipts with Google-review QR codes, packages, memberships "
    "• Customer CRM with loyalty points, birthday tracking + automatic birthday emails, WhatsApp confirmations "
    "• Staff management: geo-fenced attendance check-in/out, PDF salary slips, commission tracking, leave approval workflow "
    "• Cross-salon Staff Registry: free Aadhaar-verified staff history verification "
    "• Inventory with low-stock alerts and one-click vendor restock emails "
    "• AI tools: Mira voice briefings (English + Hindi), AI logo & poster studio, AI review replies, business reports emailed weekly & monthly "
    "• Multi-branch support, PWA mobile apps, Reviews→₹credits, Refer & Earn. "
    "PRICING (INR, no per-booking fees or commissions): Free Trial ₹0 for 7 days (all features, up to 50 customers, no credit card); "
    "6-Month Plan ₹12,000; Annual Plan ₹20,000 (save ₹4,000); Multi-Branch (5+ branches) ₹45,000 for 6 months or ₹70,000 per year. "
    "SIGNUP: 'Start free trial' button on the site → live in under 90 seconds. "
    "CONTACT: WhatsApp +91 82170 72523. "
    "RULES: Only discuss Miracurl — politely decline unrelated topics. Never invent features or prices. "
    "Be warm, concise (2-4 short sentences), use ₹ for money. Plain text only — no markdown, no asterisks, no bullet lists. Always nudge toward the free trial. "
    "The visitor's contact details are already saved — our team will reach out; you don't need to ask for them again."
)


class SalesChatStartIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    email: str = Field(..., max_length=120)
    phone: str = Field(..., max_length=20)

    @field_validator("email")
    @classmethod
    def _v_email(cls, v):
        v = (v or "").strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]{2,}", v):
            raise ValueError("Enter a valid email address")
        return v

    @field_validator("phone")
    @classmethod
    def _v_phone(cls, v):
        digits = re.sub(r"\D", "", v or "")
        if len(digits) < 10:
            raise ValueError("Enter a valid phone number")
        return digits


class SalesChatMsgIn(BaseModel):
    inquiry_id: str = Field(..., min_length=8, max_length=64)
    message: str = Field(..., min_length=1, max_length=1000)


class InquiryStatusIn(BaseModel):
    status: str = Field(..., pattern=r"^(new|contacted|converted)$")


async def _send_lead_alert(inq: dict, question: str):
    """Fire-and-forget hot-lead alert to HQ the moment a prospect asks their first question."""
    hq = os.environ.get("HQ_EMAIL")
    if not hq:
        return
    try:
        status = await _send_email(
            [hq],
            f"🔥 Hot lead: {inq.get('name', 'A prospect')} is asking about Miracurl right now",
            _lead_alert_email_html(inq, question))
        if not status.get("sent"):
            logging.warning(f"lead alert email failed: {status.get('error')}")
    except Exception as e:
        logging.error(f"lead alert error: {e}")


@router.post("/public/sales-chat/start")
async def sales_chat_start(body: SalesChatStartIn, request: Request):
    public_rate_limit(request, "sales-start", limit=5, window_sec=600)
    now = datetime.now(timezone.utc).isoformat()
    first = body.name.strip().split()[0].title()
    greeting = (f"Lovely to meet you, {first} ✦ I'm Mira — I know everything about Miracurl Salon Suite. "
                f"Ask me about features, pricing, the free trial, or how salons like yours use it day-to-day!")
    doc = {
        "id": str(uuid.uuid4()), "name": body.name.strip(), "email": body.email,
        "phone": body.phone, "status": "new", "source": "landing_chat",
        "messages": [{"role": "assistant", "content": greeting, "at": now}],
        "created_at": now, "last_message_at": now,
    }
    await _raw_db.tenant_inquiries.insert_one(doc)
    return {"inquiry_id": doc["id"], "reply": greeting}


@router.post("/public/sales-chat/message")
async def sales_chat_message(body: SalesChatMsgIn, request: Request):
    public_rate_limit(request, "sales-msg", limit=30, window_sec=600)
    inq = await _raw_db.tenant_inquiries.find_one(
        {"id": body.inquiry_id}, {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1, "alerted": 1})
    if not inq:
        raise HTTPException(404, "Chat session not found — please start again")
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    chat = _SALES_SESSIONS.get(body.inquiry_id)
    if chat is None:
        chat = LlmChat(
            api_key=key, session_id=f"sales-{body.inquiry_id}",
            system_message=_SALES_SYSTEM_PROMPT + f" The visitor's name is {inq.get('name', 'there')}.",
        ).with_model("openai", "gpt-5.4")
        _SALES_SESSIONS[body.inquiry_id] = chat
        if len(_SALES_SESSIONS) > 300:
            _SALES_SESSIONS.pop(next(iter(_SALES_SESSIONS)))
    try:
        resp = await chat.send_message(UserMessage(text=body.message))
        reply = (resp or "").strip() or "I didn't quite catch that — could you rephrase?"
    except Exception as e:
        logging.error(f"sales chat LLM error: {e}")
        raise HTTPException(400, "Mira is momentarily unavailable — please try again in a minute")
    now = datetime.now(timezone.utc).isoformat()
    await _raw_db.tenant_inquiries.update_one(
        {"id": body.inquiry_id},
        {"$push": {"messages": {"$each": [
            {"role": "user", "content": body.message, "at": now},
            {"role": "assistant", "content": reply, "at": now}]}},
         "$set": {"last_message_at": now}})
    if not inq.get("alerted"):
        await _raw_db.tenant_inquiries.update_one({"id": body.inquiry_id}, {"$set": {"alerted": True}})
        asyncio.create_task(_send_lead_alert(inq, body.message))
    return {"reply": reply}


@router.get("/super-admin/inquiries")
async def list_tenant_inquiries(user=Depends(require_super_admin)):
    items = await _raw_db.tenant_inquiries.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    return {"items": items, "new_count": sum(1 for i in items if i.get("status") == "new")}


@router.patch("/super-admin/inquiries/{iid}")
async def update_tenant_inquiry(iid: str, body: InquiryStatusIn, user=Depends(require_super_admin)):
    res = await _raw_db.tenant_inquiries.update_one({"id": iid}, {"$set": {"status": body.status}})
    if res.matched_count == 0:
        raise HTTPException(404, "Inquiry not found")
    return {"ok": True, "status": body.status}


@router.delete("/super-admin/inquiries/{iid}")
async def delete_tenant_inquiry(iid: str, user=Depends(require_super_admin)):
    await _raw_db.tenant_inquiries.delete_one({"id": iid})
    _SALES_SESSIONS.pop(iid, None)
    return {"ok": True}


# ── Partner landing page leads + HQ follow-up tools ─────────────────────────
class PartnerInquiryIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=120)
    phone: str = Field(min_length=10, max_length=15)
    salon_name: str = Field(default="", max_length=100)
    preferred_time: str = Field(default="", max_length=120)
    message: str = Field(default="", max_length=500)

    @field_validator("email")
    @classmethod
    def _email_ok(cls, v):
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v.strip()):
            raise ValueError("Invalid email")
        return v.strip().lower()

    @field_validator("phone")
    @classmethod
    def _phone_ok(cls, v):
        digits = re.sub(r"\D", "", v)
        if len(digits) < 10:
            raise ValueError("Invalid phone")
        return digits[-10:]


@router.post("/public/partner-inquiry")
async def partner_inquiry(body: PartnerInquiryIn, request: Request):
    public_rate_limit(request, "partner-inq", limit=5, window_sec=600)
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()), "name": body.name.strip(), "email": body.email,
        "phone": body.phone, "salon_name": body.salon_name.strip(),
        "preferred_time": body.preferred_time.strip(), "status": "new",
        "source": "partner_page",
        "messages": ([{"role": "user", "content": body.message.strip(), "at": now}] if body.message.strip() else []),
        "created_at": now, "last_message_at": now,
    }
    await _raw_db.tenant_inquiries.insert_one(doc)
    asyncio.create_task(_send_lead_alert(doc, body.message.strip() or f"Demo request — prefers: {body.preferred_time or 'any time'}"))
    return {"ok": True}


@router.post("/super-admin/inquiries/{iid}/send-thankyou")
async def inquiry_send_thankyou(iid: str, user=Depends(require_super_admin)):
    import base64
    from services.brochure import build_brochure_pdf
    from email_service import marketing_email_html
    inq = await _raw_db.tenant_inquiries.find_one({"id": iid}, {"_id": 0})
    if not inq:
        raise HTTPException(404, "Inquiry not found")
    if not inq.get("email"):
        raise HTTPException(400, "This lead has no email address")
    last = inq.get("thankyou_sent_at")
    if last and (datetime.now(timezone.utc) - datetime.fromisoformat(last)).total_seconds() < 300:
        raise HTTPException(429, "Brochure was sent moments ago — wait a few minutes before resending")
    first = inq["name"].split()[0].title()
    hq_email = os.environ.get("HQ_EMAIL", "")
    hq_phone = os.environ.get("HQ_PHONE", "")
    contact = " · ".join(x for x in (hq_phone, hq_email) if x)
    body_text = (
        f"Dear {first},\n"
        "Thank you for reaching out to us — it truly means a lot! We've attached a quick tour of "
        "Miracurl Salon Suite so you can see exactly how it runs bookings, billing, staff and marketing for salons like yours.\n"
        "Our favourite part? The Staff Verification Portal — hire trusted, background-verified staff with one search. "
        "And Mira, your AI marketing agent, promotes your salon every single day on autopilot.\n"
        f"We'd love to walk you through it on a quick Google Meet call. Just reply with a time that suits you!\n"
        f"Warm regards,\nMiracurl Family{chr(10) + contact if contact else ''}")
    html = marketing_email_html("Miracurl Salon Suite", body_text,
                                os.environ.get("APP_PUBLIC_URL", ""), cta_label="Explore Miracurl ✦")
    pdf = build_brochure_pdf()
    res = await _send_email([inq["email"]], f"Thank you for reaching out, {first} ✦ Miracurl Salon Suite",
                            html, attachments=[{"filename": "Miracurl-Salon-Suite.pdf",
                                                "content": base64.b64encode(pdf).decode()}])
    if not res.get("sent"):
        raise HTTPException(400, f"Email failed: {res.get('error')}")
    updates = {"thankyou_sent_at": datetime.now(timezone.utc).isoformat()}
    if inq.get("status") == "new":
        updates["status"] = "contacted"
    await _raw_db.tenant_inquiries.update_one({"id": iid}, {"$set": updates})
    return {"ok": True}


class MeetInviteIn(BaseModel):
    date: str = Field(min_length=10, max_length=10)  # YYYY-MM-DD
    time: str = Field(min_length=5, max_length=5)    # HH:MM (IST)
    duration_min: int = Field(default=30, ge=15, le=120)
    meet_link: str = Field(default="", max_length=200)


def _build_ics(uid: str, start_utc: datetime, end_utc: datetime, summary: str,
               description: str, organizer: str, attendee: str) -> str:
    fmt = "%Y%m%dT%H%M%SZ"
    return (
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Miracurl//Salon Suite//EN\r\nMETHOD:REQUEST\r\n"
        "BEGIN:VEVENT\r\n"
        f"UID:{uid}@miracurl\r\nDTSTAMP:{datetime.now(timezone.utc).strftime(fmt)}\r\n"
        f"DTSTART:{start_utc.strftime(fmt)}\r\nDTEND:{end_utc.strftime(fmt)}\r\n"
        f"SUMMARY:{summary}\r\nDESCRIPTION:{description}\r\n"
        f"ORGANIZER;CN=Miracurl Family:mailto:{organizer}\r\n"
        f"ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:{attendee}\r\n"
        "STATUS:CONFIRMED\r\nBEGIN:VALARM\r\nTRIGGER:-PT15M\r\nACTION:DISPLAY\r\nDESCRIPTION:Reminder\r\nEND:VALARM\r\n"
        "END:VEVENT\r\nEND:VCALENDAR\r\n")


@router.post("/super-admin/inquiries/{iid}/send-invite")
async def inquiry_send_invite(iid: str, body: MeetInviteIn, user=Depends(require_super_admin)):
    import base64
    from datetime import timedelta
    from email_service import marketing_email_html
    inq = await _raw_db.tenant_inquiries.find_one({"id": iid}, {"_id": 0})
    if not inq:
        raise HTTPException(404, "Inquiry not found")
    if not inq.get("email"):
        raise HTTPException(400, "This lead has no email address")
    try:
        ist_dt = datetime.strptime(f"{body.date} {body.time}", "%Y-%m-%d %H:%M")
    except ValueError:
        raise HTTPException(400, "Invalid date/time")
    start_utc = (ist_dt - timedelta(hours=5, minutes=30)).replace(tzinfo=timezone.utc)
    end_utc = start_utc + timedelta(minutes=body.duration_min)
    first = inq["name"].split()[0].title()
    hq_email = os.environ.get("HQ_EMAIL", "hello@miracurl.com")
    pretty = ist_dt.strftime("%A, %d %B %Y at %I:%M %p IST")
    link_line = f"\nJoin here: {body.meet_link}" if body.meet_link else ""
    ics = _build_ics(iid, start_utc, end_utc, f"Miracurl Salon Suite demo — {inq['name']}",
                     f"Google Meet demo of Miracurl Salon Suite.{link_line}".replace("\n", "\\n"),
                     hq_email, inq["email"])
    body_text = (
        f"Dear {first},\n"
        f"Your Miracurl Salon Suite demo is confirmed for {pretty} ({body.duration_min} minutes).\n"
        + (f"Google Meet link: {body.meet_link}\n" if body.meet_link else "The meeting link is in the attached calendar invite.\n")
        + "The invite is attached — open it to add the meeting to your calendar automatically.\n"
        "See you there!\nWarm regards,\nMiracurl Family")
    html = marketing_email_html("Miracurl Salon Suite", body_text,
                                body.meet_link or os.environ.get("APP_PUBLIC_URL", ""),
                                cta_label="Join the meeting ✦" if body.meet_link else "Explore Miracurl ✦")
    res = await _send_email([inq["email"]], f"Your Miracurl demo is confirmed — {pretty}",
                            html, attachments=[{"filename": "miracurl-demo.ics",
                                                "content": base64.b64encode(ics.encode()).decode()}])
    if not res.get("sent"):
        raise HTTPException(400, f"Email failed: {res.get('error')}")
    await _raw_db.tenant_inquiries.update_one({"id": iid}, {"$set": {
        "status": "meeting_scheduled",
        "meeting": {"at_ist": f"{body.date} {body.time}", "duration_min": body.duration_min,
                    "meet_link": body.meet_link, "sent_at": datetime.now(timezone.utc).isoformat()}}})
    return {"ok": True, "when": pretty}
