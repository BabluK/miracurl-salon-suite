"""Miracurl Feedback: HQ sends a feedback link after resolving a salon's ticket;
happy responses (4★+) auto-publish to the public landing page testimonials."""
import os
import uuid
import html as html_lib
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from database import _raw_db
from security import require_super_admin, public_rate_limit

log = logging.getLogger("feedback")
router = APIRouter()


class FeedbackRequestIn(BaseModel):
    tenant_id: str = Field(..., min_length=6)
    context: str = Field("", max_length=200)


@router.post("/super-admin/feedback-requests")
async def send_feedback_request(body: FeedbackRequestIn, user=Depends(require_super_admin)):
    t = await _raw_db.tenants.find_one({"id": body.tenant_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Salon not found")
    to = t.get("owner_email") or t.get("salon_email")
    if not to:
        raise HTTPException(400, "This salon has no owner email on file")
    token = uuid.uuid4().hex
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    link = f"{base}/feedback/{token}"
    await _raw_db.feedback_requests.insert_one({
        "id": token, "tenant_id": t["id"], "tenant_name": t.get("name") or "",
        "owner_email": t.get("owner_email") or "", "context": body.context.strip()[:200],
        "status": "sent", "rating": None, "comment": "", "responder_name": "",
        "created_at": datetime.now(timezone.utc).isoformat()})
    from email_service import _send_email
    salon = html_lib.escape(t.get("name") or "your salon")
    res = await _send_email(
        [to], "💛 How did we do? — Miracurl Suite",
        f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#333">
        <h2 style="color:#1a1a2e">Your issue is resolved ✓</h2>
        <p>Hi! We recently resolved your request for <b>{salon}</b>{(' (' + html_lib.escape(body.context) + ')') if body.context.strip() else ''}.
        We'd love to hear how it went — it takes 30 seconds.</p>
        <p style="margin-top:18px"><a href="{link}" style="background:#1a1a2e;color:#f5c542;text-decoration:none;
        font-weight:bold;padding:13px 26px;border-radius:26px;display:inline-block">⭐ Share your feedback</a></p>
        <p style="font-size:12px;color:#888;margin-top:14px">Loved the support? Your kind words may be featured on miracurl-suite.com 💛</p>
        </div>""")
    return {"ok": True, "link": link, "email_sent": bool(res.get("sent"))}


@router.get("/super-admin/feedback-requests")
async def list_feedback_requests(user=Depends(require_super_admin)):
    rows = await _raw_db.feedback_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"items": rows}


@router.get("/public/feedback/{token}")
async def feedback_page_info(token: str, request: Request):
    public_rate_limit(request, "feedback-info", limit=30, window_sec=600)
    fr = await _raw_db.feedback_requests.find_one({"id": token}, {"_id": 0})
    if not fr:
        raise HTTPException(404, "Feedback link not found or expired")
    return {"salon_name": fr["tenant_name"], "context": fr.get("context") or "",
            "submitted": fr["status"] == "submitted"}


class FeedbackIn(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: str = Field("", max_length=400)
    name: str = Field("", max_length=80)


@router.post("/public/feedback/{token}")
async def submit_feedback(token: str, body: FeedbackIn, request: Request):
    public_rate_limit(request, "feedback-submit", limit=10, window_sec=600)
    fr = await _raw_db.feedback_requests.find_one({"id": token}, {"_id": 0})
    if not fr:
        raise HTTPException(404, "Feedback link not found or expired")
    if fr["status"] == "submitted":
        return {"ok": True, "already": True}
    await _raw_db.feedback_requests.update_one({"id": token}, {"$set": {
        "status": "submitted", "rating": body.rating, "comment": body.comment.strip()[:400],
        "responder_name": body.name.strip()[:80],
        "submitted_at": datetime.now(timezone.utc).isoformat()}})
    published = False
    if body.rating >= 4 and body.comment.strip():
        t = await _raw_db.tenants.find_one({"id": fr["tenant_id"]}, {"_id": 0}) or {}
        await _raw_db.partner_testimonials.insert_one({
            "id": str(uuid.uuid4()), "order": 99, "visible": True,
            "salon_name": fr["tenant_name"] or t.get("name") or "A Miracurl salon",
            "owner_name": body.name.strip()[:80] or f"Owner — {fr['tenant_name']}",
            "city": t.get("location") or "", "quote": body.comment.strip()[:400],
            "photo_url": "", "source": "feedback", "rating": body.rating,
            "created_at": datetime.now(timezone.utc).isoformat()})
        published = True
    return {"ok": True, "published": published}
