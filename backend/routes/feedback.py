"""Miracurl Feedback: HQ sends a feedback link after resolving a salon's ticket;
happy responses (4★+) auto-publish to the public landing page testimonials."""
import os
import uuid
import html as html_lib
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from database import _raw_db
from security import require_super_admin, public_rate_limit

log = logging.getLogger("feedback")
router = APIRouter()


async def send_feedback_reminders() -> int:
    """Nudge owners who haven't answered their feedback link after 3 days (one reminder only)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    rows = await _raw_db.feedback_requests.find(
        {"status": "sent", "created_at": {"$lt": cutoff}, "reminded_at": {"$exists": False}},
        {"_id": 0}).to_list(50)
    if not rows:
        return 0
    from email_service import _send_email
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    sent = 0
    for fr in rows:
        await _raw_db.feedback_requests.update_one(
            {"id": fr["id"]}, {"$set": {"reminded_at": datetime.now(timezone.utc).isoformat()}})
        if not fr.get("owner_email"):
            continue
        salon = html_lib.escape(fr.get("tenant_name") or "your salon")
        link = f"{base}/feedback/{fr['id']}"
        res = await _send_email(
            [fr["owner_email"]], "Quick reminder — 30 seconds of feedback? 💛 (Miracurl Suite)",
            f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#333">
            <h2 style="color:#1a1a2e">We'd still love your feedback ⭐</h2>
            <p>Hi! A few days ago we resolved your request for <b>{salon}</b>. If you have 30 seconds,
            your rating helps us serve you better.</p>
            <p style="margin-top:18px"><a href="{link}" style="background:#1a1a2e;color:#f5c542;text-decoration:none;
            font-weight:bold;padding:13px 26px;border-radius:26px;display:inline-block">⭐ Share your feedback</a></p>
            <p style="font-size:12px;color:#888;margin-top:14px">This is the only reminder we'll send — promise 💛</p>
            </div>""")
        if res.get("sent"):
            sent += 1
    return sent


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
    rows = await _raw_db.feedback_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    rated = [r for r in rows if r.get("rating")]
    stats = {
        "total": len(rows),
        "submitted": len(rated),
        "avg_rating": round(sum(r["rating"] for r in rated) / len(rated), 2) if rated else 0,
        "published": len([r for r in rated if r["rating"] >= 4 and (r.get("comment") or "").strip()]),
        "unhappy": len([r for r in rated if r["rating"] <= 3]),
        "pending_followup": len([r for r in rated if r["rating"] <= 3 and not r.get("followed_up")]),
    }
    return {"items": rows, "stats": stats}


@router.post("/super-admin/feedback-requests/{fid}/follow-up")
async def feedback_follow_up(fid: str, user=Depends(require_super_admin)):
    """Check-in email to an unhappy salon owner + mark followed up."""
    fr = await _raw_db.feedback_requests.find_one({"id": fid}, {"_id": 0})
    if not fr:
        raise HTTPException(404, "Feedback not found")
    to = fr.get("owner_email")
    sent = False
    if to:
        from email_service import _send_email
        salon = html_lib.escape(fr.get("tenant_name") or "your salon")
        res = await _send_email(
            [to], "We hear you — let's make it right 💛 (Miracurl Suite)",
            f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#333">
            <h2 style="color:#1a1a2e">Thank you for your honest feedback</h2>
            <p>Hi! You rated your recent support experience for <b>{salon}</b> {fr.get('rating')}★ — that's not
            the standard we hold ourselves to. Our team is personally reviewing what went wrong and will reach out
            within 24 hours to make it right.</p>
            <p style="font-size:12px;color:#888;margin-top:14px">— The Miracurl HQ team</p></div>""")
        sent = bool(res.get("sent"))
    await _raw_db.feedback_requests.update_one(
        {"id": fid}, {"$set": {"followed_up": True,
                               "followed_up_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "email_sent": sent}


@router.get("/public/feedback/{token}")
async def feedback_page_info(token: str, request: Request):
    await public_rate_limit(request, "feedback-info", limit=30, window_sec=600)
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
    await public_rate_limit(request, "feedback-submit", limit=10, window_sec=600)
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
