# Extracted from server.py — domain route module (auto-split refactor)
import os
import uuid
import logging
from datetime import datetime, timezone

from fastapi import (
    APIRouter, HTTPException, Depends,
)
from starlette.responses import StreamingResponse
from pydantic import BaseModel, Field

from database import _raw_db, db, _clean
from security import (
    get_current_user, require_admin, require_tenant_admin,
)

router = APIRouter()

# ---------------- AI Assistant (Mira) & Feedback Board ----------------
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

_assistant_sessions: dict = {}

class AssistantChatIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    session_id: str = Field(..., min_length=8, max_length=64)

async def _salon_context(user) -> tuple:
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
    is_resto = (tenant or {}).get("business_type") == "restaurant"
    biz = "Restaurant" if is_resto else "Salon"
    ctx = (f"{biz}: {(tenant or {}).get('name', 'the business')}. Today: {today}. "
           f"Live stats — {'reservations' if is_resto else 'appointments'} today: {appts_today}, bookings awaiting approval: {pending}, "
           f"CRM customers: {customers}, revenue this month: ₹{revenue:.0f}, "
           f"low-stock products: {low_stock}, active {'menu items' if is_resto else 'services'}: {services_count}.")
    return ctx, is_resto

async def _create_chat(sid: str, key: str, user: dict) -> "LlmChat":
    ctx, is_resto = await _salon_context(user)
    try:
        from routes.tenant_mira import _revenue_report
        import json as _json
        ctx += " REVENUE REPORT by period (use these exact figures for last week/month questions, incl. top staff): " + _json.dumps(await _revenue_report())
    except Exception as e:
        logging.getLogger("assistant").error(f"revenue report ctx failed: {e}")
    return LlmChat(
        api_key=key, session_id=sid,
        system_message=(
            ("You are Mira, the friendly AI assistant inside 'Miracurl Partner', dedicated to THIS restaurant. "
             "Help the restaurant owner with live stats, menu management (Menu page), table reservations (Reservations page), "
             "QR table ordering & kitchen tickets (Kitchen page — printable table QRs, Category Specials for day-wise discounts), "
             "POS billing, inventory, staff and practical restaurant business advice (menu pricing, table turnover, peak hours). "
             if is_resto else
             "You are Mira, the friendly AI assistant inside 'Miracurl Partner', a salon management app. "
             "Help salon owners/admins with their live stats, how to use features (Appointments has Day/Upcoming/Week views; "
             "confirming a booking opens WhatsApp to notify the client; CRM lists only customers who completed a service; "
             "Services/Customers/Inventory support CSV import-export; staff check-in/out & PDF salary slips; "
             "QR booking poster in Settings; Refer & Earn rewards), and practical salon business advice. ")
            + "You CANNOT change the app's code — tell users to log feature requests in the Feedback Board tab. "
            "Be concise and warm. Use ₹ for money. Business context: " + ctx
        ),
    ).with_model("openai", "gpt-5.4")


@router.post("/assistant/chat")
async def assistant_chat(body: AssistantChatIn, user=Depends(require_tenant_admin)):
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    sid = f"{user.get('tenant_id', 't')}-{body.session_id}"
    chat = _assistant_sessions.get(sid)
    if chat is None:
        chat = _assistant_sessions[sid] = await _create_chat(sid, key, user)
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

