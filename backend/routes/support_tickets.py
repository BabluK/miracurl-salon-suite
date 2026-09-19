"""Owner "Ask Miracurl to fix this" tickets → HQ Inbox with one-click Open into the salon workspace."""
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from database import _raw_db
from email_service import hq_inbox, _send_email
from security import current_tenant, public_rate_limit, require_admin, require_super_admin
from services.tenant_notices import notify_tenant

router = APIRouter()
_now = lambda: datetime.now(timezone.utc).isoformat()  # noqa: E731


class FixRequestIn(BaseModel):
    issue: str = Field(..., min_length=5, max_length=2000)
    page: str = Field("/dashboard", max_length=200)
    page_title: str = Field("", max_length=120)


def _clean_page(p: str) -> str:
    p = (p or "/dashboard").strip()
    return p if p.startswith("/") and "//" not in p else "/dashboard"


@router.post("/support/fix-request")
async def create_fix_request(body: FixRequestIn, request: Request, user=Depends(require_admin), t=Depends(current_tenant)):
    await public_rate_limit(request, key_suffix=f"fix-{t['id']}", limit=10, window_sec=3600)
    from routes.lead_gen import _next_ticket_no
    no = await _next_ticket_no()
    page = _clean_page(body.page)
    subject = f"Fix request · {body.page_title or page}"
    doc = {"id": str(uuid.uuid4()), "tenant_id": t["id"], "tenant_name": t.get("name"), "tenant_slug": t.get("slug"),
           "from_email": user.get("email"), "from_name": user.get("name"), "subject": subject, "message": body.issue.strip(),
           "kind": "fix_request", "ticket_no": no, "status": "open", "page": page, "page_title": body.page_title,
           "attachments": [], "read": False, "created_at": _now()}
    await _raw_db.hq_messages.insert_one(dict(doc))
    base = os.environ.get("APP_PUBLIC_URL", "").rstrip("/")
    from services.hq_emails import fix_request_hq_email, fix_request_owner_email
    try:
        subj, html = fix_request_hq_email(t, no, page, body.page_title, body.issue, user.get("email") or "")
        await _send_email([hq_inbox("support")], subj, html, book_url=f"{base}/super-admin", book_label="Open Super Admin ✦",
                          reply_to=user.get("email"))
        from routes.rewards_settlements import _real_email
        em = await _real_email(t)
        if em:
            subj2, html2 = fix_request_owner_email(t, no, body.page_title or page, body.issue)
            await _send_email([em], subj2, html2, book_url=f"{base}/settings", book_label="Open Miracurl ✦")
    except Exception:  # noqa: BLE001 — ticket is stored regardless
        pass
    await notify_tenant(t["id"], "fix_request", f"Fix request #{no} sent to Miracurl",
                        "HQ will open your workspace and sort it — you'll be notified when it's done.", "/settings", f"fix_request:{no}")
    return {"ok": True, "ticket_no": no, "id": doc["id"]}


@router.get("/support/fix-requests")
async def my_fix_requests(user=Depends(require_admin), t=Depends(current_tenant)):
    rows = await _raw_db.hq_messages.find({"tenant_id": t["id"], "kind": "fix_request"},
                                          {"_id": 0, "id": 1, "ticket_no": 1, "subject": 1, "message": 1, "status": 1, "page": 1,
                                           "page_title": 1, "created_at": 1, "in_progress_at": 1, "resolved_at": 1, "hq_note": 1, "hq_note_at": 1}).sort("created_at", -1).to_list(20)
    return {"items": rows, "active": sum(1 for r in rows if r.get("status") != "resolved")}


class HqNoteIn(BaseModel):
    note: Optional[str] = Field(None, max_length=600)


@router.patch("/super-admin/hq-messages/{mid}/note")
async def hq_ticket_note(mid: str, body: HqNoteIn, user=Depends(require_super_admin)):
    r = await _raw_db.hq_messages.update_one({"id": mid}, {"$set": {"hq_note": (body.note or "").strip(), "hq_note_by": user.get("email")}})
    if not r.matched_count:
        raise HTTPException(404, "Message not found")
    return {"ok": True}
