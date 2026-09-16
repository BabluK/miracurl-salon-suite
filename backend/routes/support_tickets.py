"""Owner "Ask Miracurl to fix this" tickets → HQ Inbox with one-click Open into the salon workspace."""
import html as html_lib
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from database import _raw_db
from email_service import _send_email
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
    if t.get("support_access") is False:
        raise HTTPException(400, "Turn on 'Miracurl support access' in Settings first so HQ can open your workspace and fix it")
    no = await _next_ticket_no()
    page = _clean_page(body.page)
    subject = f"Fix request · {body.page_title or page}"
    doc = {"id": str(uuid.uuid4()), "tenant_id": t["id"], "tenant_name": t.get("name"), "tenant_slug": t.get("slug"),
           "from_email": user.get("email"), "from_name": user.get("name"), "subject": subject, "message": body.issue.strip(),
           "kind": "fix_request", "ticket_no": no, "status": "open", "page": page, "page_title": body.page_title,
           "attachments": [], "read": False, "created_at": _now()}
    await _raw_db.hq_messages.insert_one(dict(doc))
    base = os.environ.get("APP_PUBLIC_URL", "").rstrip("/")
    try:
        await _send_email([os.environ.get("HQ_EMAIL", "admin@miracurl.com")],
                          f"🛠 Fix request #{no} — {t.get('name')} · {body.page_title or page}",
                          f"<p><b>{html_lib.escape(t.get('name') or '')}</b> ({t.get('slug')}) asks Miracurl to fix something on <b>{html_lib.escape(page)}</b>.</p>"
                          f"<div style='background:#f8f7fc;border:1px solid #e6e3f2;border-radius:10px;padding:14px;font-size:14px'>{html_lib.escape(body.issue).replace(chr(10), '<br/>')}</div>"
                          f"<p>Open it in Super Admin → HQ Inbox → <b>Open workspace</b> ({base}/super-admin).</p>")
    except Exception:  # noqa: BLE001 — ticket is stored regardless
        pass
    await notify_tenant(t["id"], "fix_request", f"Fix request #{no} sent to Miracurl",
                        "HQ will open your workspace and sort it — you'll be notified when it's done.", "/settings", f"fix_request:{no}")
    return {"ok": True, "ticket_no": no, "id": doc["id"]}


@router.get("/support/fix-requests")
async def my_fix_requests(user=Depends(require_admin), t=Depends(current_tenant)):
    rows = await _raw_db.hq_messages.find({"tenant_id": t["id"], "kind": "fix_request"},
                                          {"_id": 0, "id": 1, "ticket_no": 1, "subject": 1, "message": 1, "status": 1, "page": 1,
                                           "page_title": 1, "created_at": 1, "resolved_at": 1, "hq_note": 1}).sort("created_at", -1).to_list(20)
    return {"items": rows}


class HqNoteIn(BaseModel):
    note: Optional[str] = Field(None, max_length=600)


@router.patch("/super-admin/hq-messages/{mid}/note")
async def hq_ticket_note(mid: str, body: HqNoteIn, user=Depends(require_super_admin)):
    r = await _raw_db.hq_messages.update_one({"id": mid}, {"$set": {"hq_note": (body.note or "").strip(), "hq_note_by": user.get("email")}})
    if not r.matched_count:
        raise HTTPException(404, "Message not found")
    return {"ok": True}
