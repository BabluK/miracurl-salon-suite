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

# ---------------- AI Assistant (Mira) & Feedback Board ----------------
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

_assistant_sessions: dict = {}

class AssistantChatIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    session_id: str = Field(..., min_length=8, max_length=64)

async def _salon_context(user) -> str:
    today = datetime.now(timezone.utc).date().isoformat()
    month = today[:7]
    appts_today = await db.appointments.count_documents({"scheduled_at": {"$regex": f"^{today}"}})
    pending = await db.appointments.count_documents({"status": "scheduled"})
    customers = await db.customers.count_documents({"crm_status": {"$ne": "pending"}})
    invoices = await db.invoices.find({"created_at": {"$regex": f"^{month}"}}, {"_id": 0, "total": 1}).to_list(2000)
    revenue = sum(float(i.get("total") or 0) for i in invoices)
    low_stock = await db.products.count_documents({"$expr": {"$lte": ["$stock", "$low_stock_threshold"]}})
    services_count = await db.services.count_documents({"active": True})
    tenant = await db.tenants.find_one({"id": user.get("tenant_id")}, {"_id": 0})
    return (f"Salon: {(tenant or {}).get('name', 'the salon')}. Today: {today}. "
            f"Live stats — appointments today: {appts_today}, bookings awaiting approval: {pending}, "
            f"CRM customers: {customers}, revenue this month: ₹{revenue:.0f}, "
            f"low-stock products: {low_stock}, active services: {services_count}.")

@router.post("/assistant/chat")
async def assistant_chat(body: AssistantChatIn, user=Depends(require_tenant_admin)):
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    sid = f"{user.get('tenant_id', 't')}-{body.session_id}"
    chat = _assistant_sessions.get(sid)
    if chat is None:
        ctx = await _salon_context(user)
        try:
            from routes.tenant_mira import _revenue_report
            import json as _json
            ctx += " REVENUE REPORT by period (use these exact figures for last week/month questions, incl. top staff): " + _json.dumps(await _revenue_report())
        except Exception as e:
            logging.getLogger("assistant").error(f"revenue report ctx failed: {e}")
        chat = LlmChat(
            api_key=key, session_id=sid,
            system_message=(
                "You are Mira, the friendly AI assistant inside 'Miracurl Partner', a salon management app. "
                "Help salon owners/admins with their live stats, how to use features (Appointments has Day/Upcoming/Week views; "
                "confirming a booking opens WhatsApp to notify the client; CRM lists only customers who completed a service; "
                "Services/Customers/Inventory support CSV import-export; staff check-in/out & PDF salary slips; "
                "QR booking poster in Settings; Refer & Earn rewards), and practical salon business advice. "
                "You CANNOT change the app's code — tell users to log feature requests in the Feedback Board tab. "
                "Be concise and warm. Use ₹ for money. Salon context: " + ctx
            ),
        ).with_model("openai", "gpt-5.4")
        _assistant_sessions[sid] = chat
        if len(_assistant_sessions) > 200:
            _assistant_sessions.pop(next(iter(_assistant_sessions)))

    tid = user.get("tenant_id")
    now = datetime.now(timezone.utc).isoformat()
    await _raw_db.assistant_messages.insert_one(
        {"id": str(uuid.uuid4()), "tenant_id": tid, "session_id": body.session_id,
         "role": "user", "content": body.message, "created_at": now})

    async def gen():
        parts = []
        try:
            async for ev in chat.stream_message(UserMessage(text=body.message)):
                if isinstance(ev, TextDelta):
                    parts.append(ev.content)
                    yield ev.content
                elif isinstance(ev, StreamDone):
                    break
        except Exception as e:
            logging.getLogger("assistant").error(f"assistant stream error: {e}")
            yield "\n\n(Sorry, I hit a snag — please try again.)"
        if parts:
            await _raw_db.assistant_messages.insert_one(
                {"id": str(uuid.uuid4()), "tenant_id": tid, "session_id": body.session_id,
                 "role": "assistant", "content": "".join(parts),
                 "created_at": datetime.now(timezone.utc).isoformat()})

    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@router.get("/assistant/history")
async def assistant_history(session_id: str, user=Depends(require_tenant_admin)):
    rows = await _raw_db.assistant_messages.find(
        {"tenant_id": user.get("tenant_id"), "session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    return rows

class FeedbackIn(BaseModel):
    type: str = "enhancement"  # bug | enhancement
    title: str = Field(..., min_length=3, max_length=200)
    details: str = Field("", max_length=3000)
    priority: str = "medium"  # low | medium | high

@router.post("/feedback")
async def create_feedback(body: FeedbackIn, user=Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "status": "open",
           "by": user.get("email", ""), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.feedback.insert_one(doc)
    return _clean(doc)

@router.get("/feedback")
async def list_feedback(user=Depends(get_current_user)):
    return await db.feedback.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

@router.put("/feedback/{fid}")
async def update_feedback(fid: str, body: dict, user=Depends(require_admin)):
    allowed = {k: str(v)[:40] for k, v in body.items() if k in ("status", "priority") and isinstance(v, (str, int))}
    if allowed:
        await db.feedback.update_one({"id": fid}, {"$set": allowed})
    return await db.feedback.find_one({"id": fid}, {"_id": 0})

@router.delete("/feedback/{fid}")
async def delete_feedback(fid: str, user=Depends(require_admin)):
    await db.feedback.delete_one({"id": fid})
    return {"ok": True}

