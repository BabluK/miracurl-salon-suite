"""Brand Model campaign — per-salon settlement tracker (HQ) with Mira email / WhatsApp nudges."""
import html as html_lib
import logging
import os
import re
import uuid
from datetime import date, datetime, timezone
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import _raw_db
from email_service import _send_email
from routes.rewards_campaign import _tenant_eligible, get_campaign
from security import require_super_admin

router = APIRouter()
log = logging.getLogger("rewards_settlements")
_T_FIELDS = {"_id": 0, "id": 1, "name": 1, "slug": 1, "plan": 1, "status": 1, "location": 1, "logo_url": 1,
             "owner_email": 1, "notify_email": 1, "phone": 1, "owner_phone": 1}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _app_url() -> str:
    return os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")


async def _settlement_rows(c: dict) -> list:
    ts = await _raw_db.tenants.find({"status": {"$ne": "deleted"}}, _T_FIELDS).to_list(1000)
    docs = {d["tenant_id"]: d for d in await _raw_db.rewards_settlements.find({"campaign_id": c["id"]}, {"_id": 0}).to_list(1000)}
    agg = await _raw_db.rewards_participants.aggregate([{"$group": {
        "_id": "$tenant_id", "n": {"$sum": 1},
        "winners": {"$sum": {"$cond": [{"$ifNull": ["$winner_tier", False]}, 1, 0]}}}}]).to_list(1000)
    counts = {r["_id"]: r for r in agg}
    today = date.today().isoformat()
    out = []
    for t in ts:
        d = docs.get(t["id"])
        if not (_tenant_eligible(c, t) or d):
            continue
        d = d or {}
        status = d.get("status") or "not_set"
        overdue = status == "pending" and bool(d.get("due_date")) and d["due_date"] < today
        out.append({
            "tenant_id": t["id"], "name": t.get("name"), "slug": t.get("slug"), "location": t.get("location"),
            "plan": t.get("plan"), "logo_url": t.get("logo_url"),
            "email": t.get("notify_email") or t.get("owner_email") or "", "phone": t.get("owner_phone") or t.get("phone") or "",
            "participants": counts.get(t["id"], {}).get("n", 0), "winners": counts.get(t["id"], {}).get("winners", 0),
            "amount": float(d.get("amount") or 0), "due_date": d.get("due_date") or "", "note": d.get("note") or "",
            "status": "overdue" if overdue else status, "paid_at": d.get("paid_at"), "paid_method": d.get("paid_method"),
            "paid_ref": d.get("paid_ref"), "reminders": d.get("reminders") or [], "updated_at": d.get("updated_at"),
        })
    order = {"overdue": 0, "pending": 1, "not_set": 2, "paid": 3, "waived": 4}
    out.sort(key=lambda r: (order.get(r["status"], 9), -r["amount"], (r["name"] or "").lower()))
    return out


def _summary(rows: list) -> dict:
    return {
        "salons": len(rows),
        "total_billed": round(sum(r["amount"] for r in rows if r["status"] != "waived"), 2),
        "collected": round(sum(r["amount"] for r in rows if r["status"] == "paid"), 2),
        "outstanding": round(sum(r["amount"] for r in rows if r["status"] in ("pending", "overdue")), 2),
        "pending_count": sum(1 for r in rows if r["status"] in ("pending", "overdue")),
        "overdue_count": sum(1 for r in rows if r["status"] == "overdue"),
        "not_set_count": sum(1 for r in rows if r["status"] == "not_set"),
    }


@router.get("/super-admin/rewards-campaign/settlements")
async def sa_settlements(user=Depends(require_super_admin)):
    c = await get_campaign()
    rows = await _settlement_rows(c)
    return {"rows": rows, "summary": _summary(rows), "payment_link": c.get("payment_link") or "",
            "campaign": {"name": c["name"], "end_date": c["end_date"]}}


class SettlementIn(BaseModel):
    amount: float = Field(..., ge=0, le=10_000_000)
    due_date: str = Field("", pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    note: str = Field("", max_length=400)


async def _tenant_or_404(tenant_id: str) -> dict:
    t = await _raw_db.tenants.find_one({"id": tenant_id}, _T_FIELDS)
    if not t:
        raise HTTPException(404, "Tenant not found")
    return t


@router.put("/super-admin/rewards-campaign/settlements/{tenant_id}")
async def sa_settlement_put(tenant_id: str, body: SettlementIn, user=Depends(require_super_admin)):
    await _tenant_or_404(tenant_id)
    c = await get_campaign()
    cur = await _raw_db.rewards_settlements.find_one({"campaign_id": c["id"], "tenant_id": tenant_id}, {"_id": 0, "status": 1})
    status = cur["status"] if cur and cur.get("status") in ("paid", "waived") else ("pending" if body.amount > 0 else "not_set")
    await _raw_db.rewards_settlements.update_one(
        {"campaign_id": c["id"], "tenant_id": tenant_id},
        {"$set": {"amount": body.amount, "due_date": body.due_date, "note": body.note.strip(), "status": status,
                  "updated_at": _now(), "updated_by": user.get("email")},
         "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": _now(), "reminders": []}}, upsert=True)
    return {"ok": True, "status": status}


class MarkPaidIn(BaseModel):
    method: str = Field("upi", max_length=30)
    ref: str = Field("", max_length=120)


@router.post("/super-admin/rewards-campaign/settlements/{tenant_id}/mark-paid")
async def sa_settlement_paid(tenant_id: str, body: MarkPaidIn, user=Depends(require_super_admin)):
    await _tenant_or_404(tenant_id)
    c = await get_campaign()
    r = await _raw_db.rewards_settlements.update_one(
        {"campaign_id": c["id"], "tenant_id": tenant_id, "amount": {"$gt": 0}},
        {"$set": {"status": "paid", "paid_at": _now(), "paid_method": body.method, "paid_ref": body.ref.strip(),
                  "updated_at": _now(), "updated_by": user.get("email")}})
    if not r.matched_count:
        raise HTTPException(400, "Set the settlement amount first")
    return {"ok": True}


@router.post("/super-admin/rewards-campaign/settlements/{tenant_id}/reopen")
async def sa_settlement_reopen(tenant_id: str, user=Depends(require_super_admin)):
    c = await get_campaign()
    r = await _raw_db.rewards_settlements.update_one(
        {"campaign_id": c["id"], "tenant_id": tenant_id},
        {"$set": {"status": "pending", "updated_at": _now()}, "$unset": {"paid_at": "", "paid_method": "", "paid_ref": ""}})
    if not r.matched_count:
        raise HTTPException(404, "No settlement yet")
    return {"ok": True}


@router.post("/super-admin/rewards-campaign/settlements/{tenant_id}/waive")
async def sa_settlement_waive(tenant_id: str, user=Depends(require_super_admin)):
    c = await get_campaign()
    r = await _raw_db.rewards_settlements.update_one(
        {"campaign_id": c["id"], "tenant_id": tenant_id},
        {"$set": {"status": "waived", "updated_at": _now(), "updated_by": user.get("email")}})
    if not r.matched_count:
        raise HTTPException(404, "No settlement yet")
    return {"ok": True}


def _fmt_inr(v: float) -> str:
    return f"₹{v:,.0f}"


def _fallback_nudge(name: str, c: dict, d: dict, link: str, overdue: bool) -> str:
    due = f" by {d['due_date']}" if d.get("due_date") else ""
    lead = (f"a gentle reminder that the {_fmt_inr(d['amount'])} settlement for {c['name']} was due on {d['due_date']}"
            if overdue else f"the {c['name']} has wrapped up — your settlement share of {_fmt_inr(d['amount'])} is ready to pay{due}")
    note = f" {d['note'].rstrip('.')}." if d.get("note") else ""
    return (f"Hi {name} team 👋 This is Mira from Miracurl. Just {lead}.{note} "
            f"It covers the Brand Model memberships your winners are enjoying at your salon. "
            + (f"Pay securely here: {link} " if link else "")
            + "Reply to this message if you'd like a breakdown or a different date — happy to help! ✨")


async def _mira_nudge(name: str, c: dict, d: dict, link: str, overdue: bool) -> str:
    try:
        from routes.mira_common import _ask
        txt = await _ask(
            "You are Mira, the warm and professional AI assistant of Miracurl Suite (a salon SaaS). Write a short, friendly "
            "payment reminder message (max 90 words, WhatsApp style, 1-2 emojis, no subject line, no placeholders, no markdown).",
            f"Salon: {name}. Campaign: {c['name']} (ended {c['end_date']}). Settlement amount: {_fmt_inr(d['amount'])}. "
            f"Due date: {d.get('due_date') or 'not specified'}. {'OVERDUE — be gentle but clear.' if overdue else 'First reminder.'} "
            f"Context: the amount is the salon's share of the Brand Model winner memberships redeemed at their outlet. "
            f"Note from HQ: {d.get('note') or 'none'}. Payment link to include verbatim: {link or 'none'}. Sign off as Mira from Miracurl.")
        txt = re.sub(r"\*\*|__", "", txt).strip()
        if 40 < len(txt) < 900:
            return txt
    except Exception as e:  # noqa: BLE001 — never block a nudge on the LLM
        log.warning("mira nudge fallback: %s", str(e)[:120])
    return _fallback_nudge(name, c, d, link, overdue)


class RemindIn(BaseModel):
    channel: str = Field("email", pattern=r"^(email|whatsapp)$")


@router.post("/super-admin/rewards-campaign/settlements/{tenant_id}/remind")
async def sa_settlement_remind(tenant_id: str, body: RemindIn, user=Depends(require_super_admin)):
    t = await _tenant_or_404(tenant_id)
    c = await get_campaign()
    d = await _raw_db.rewards_settlements.find_one({"campaign_id": c["id"], "tenant_id": tenant_id}, {"_id": 0})
    if not d or not d.get("amount"):
        raise HTTPException(400, "Set the settlement amount first")
    if d.get("status") in ("paid", "waived"):
        raise HTTPException(400, f"Settlement already {d['status']}")
    link = c.get("payment_link") or ""
    overdue = bool(d.get("due_date")) and d["due_date"] < date.today().isoformat()
    name = t.get("name") or t.get("slug")
    text = await _mira_nudge(name, c, d, link, overdue)
    out: dict = {"ok": True, "channel": body.channel, "text": text}
    if body.channel == "email":
        to = t.get("notify_email") or t.get("owner_email")
        if not to:
            raise HTTPException(400, "Salon has no notification email")
        paras = "".join(f"<p style='line-height:1.7'>{html_lib.escape(p)}</p>" for p in text.split("\n") if p.strip())
        html = f"""
        <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #eee;border-radius:16px;overflow:hidden">
          <div style="background:#1c1c22;padding:22px 28px"><div style="color:#d4af37;font-size:20px;font-weight:bold">Miracurl ✦ Brand Model</div>
          <div style="color:#999;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:4px">Campaign settlement · {html_lib.escape(name)}</div></div>
          <div style="padding:24px 28px;color:#333;font-size:14px">{paras}
          <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #eadfc0;border-radius:12px;margin:16px 0;font-size:13px">
            <tr><td style="padding:8px 14px;color:#777">Amount due</td><td style="padding:8px 14px;text-align:right;font-weight:bold">{_fmt_inr(d['amount'])}</td></tr>
            <tr><td style="padding:8px 14px;color:#777">Due date</td><td style="padding:8px 14px;text-align:right;font-weight:bold">{html_lib.escape(d.get('due_date') or '—')}</td></tr>
            <tr><td style="padding:8px 14px;color:#777">Status</td><td style="padding:8px 14px;text-align:right;font-weight:bold;color:{'#c0392b' if overdue else '#b08d3f'}">{'Overdue' if overdue else 'Pending'}</td></tr>
          </table>
          <p style="font-size:12px;color:#888">You can also see this under Settings → Miracurl Updates in your dashboard.</p></div></div>"""
        subject = f"{'⏰ Overdue: ' if overdue else ''}Brand Model settlement — {_fmt_inr(d['amount'])} for {name}"
        res = await _send_email([to], subject, html, book_url=link or f"{_app_url()}/settings", book_label="Pay settlement ✦" if link else "Open dashboard ✦")
        if not res.get("sent"):
            err = res.get("error") or "Email failed"
            raise HTTPException(400, "Salon has no real notification email on file — ask them to add one in Settings" if err == "no_real_recipient" else err)
        out["to"] = to
    else:
        digits = re.sub(r"\D", "", t.get("owner_phone") or t.get("phone") or "")
        if not digits:
            raise HTTPException(400, "Salon has no phone number")
        if len(digits) == 10:
            digits = "91" + digits
        out["whatsapp_url"] = f"https://wa.me/{digits}?text={quote(text)}"
        out["to"] = f"+{digits}"
    await _raw_db.rewards_settlements.update_one(
        {"campaign_id": c["id"], "tenant_id": tenant_id},
        {"$push": {"reminders": {"at": _now(), "channel": body.channel, "to": out["to"], "by": user.get("email"), "overdue": overdue}}})
    return out


async def tenant_settlement(tenant_id: str, campaign_id: str) -> Optional[dict]:
    d = await _raw_db.rewards_settlements.find_one({"campaign_id": campaign_id, "tenant_id": tenant_id}, {"_id": 0})
    if not d or not d.get("amount"):
        return None
    return {k: d.get(k) for k in ("amount", "due_date", "note", "status", "paid_at")}
