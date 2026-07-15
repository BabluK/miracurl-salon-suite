"""Mira Auto-Pilot — autonomous daily marketing per tenant.

Every day (after 10:00 IST) for each tenant with autopilot enabled:
1. Creates today's social post (caption + hashtags + AI image), festival-aware.
   Auto-publishes to Instagram/Facebook when connected; otherwise it waits in
   the studio with manual-share buttons.
2. Lead Machine: finds win-back leads (no visit in N days), emails a personalized
   offer to those with an email (Resend, capped/day, 30-day cooldown) and queues
   one-tap WhatsApp messages for the rest.
3. Logs everything to autopilot_log for the owner's activity feed.
"""
import os
import uuid
import asyncio
import logging
from datetime import datetime, timezone, timedelta, date

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import _raw_db
from security import require_tenant_admin, current_tenant
from email_service import _send_email, marketing_email_html
from routes.mira_common import _ask_json, _gen_image
from routes.social_connect import _conn, publish_content

router = APIRouter()
log = logging.getLogger("mira_autopilot")

DEFAULTS = {"enabled": False, "daily_post": True, "winback_emails": True,
            "email_daily_cap": 15, "winback_days": 45}


async def _settings(tid: str) -> dict:
    doc = await _raw_db.autopilot_settings.find_one({"tenant_id": tid}, {"_id": 0}) or {}
    return {**DEFAULTS, **doc, "tenant_id": tid}


# ── Settings endpoints ──────────────────────────────────────────────────────
@router.get("/mira-studio/autopilot")
async def get_autopilot(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return await _settings(t["id"])


class AutopilotIn(BaseModel):
    enabled: bool | None = None
    daily_post: bool | None = None
    winback_emails: bool | None = None
    email_daily_cap: int | None = None
    winback_days: int | None = None


@router.put("/mira-studio/autopilot")
async def update_autopilot(body: AutopilotIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nothing to update")
    if "email_daily_cap" in updates:
        updates["email_daily_cap"] = max(1, min(50, updates["email_daily_cap"]))
    if "winback_days" in updates:
        updates["winback_days"] = max(7, min(365, updates["winback_days"]))
    await _raw_db.autopilot_settings.update_one(
        {"tenant_id": t["id"]}, {"$set": updates}, upsert=True)
    return await _settings(t["id"])


# ── Lead discovery ──────────────────────────────────────────────────────────
async def _find_winback_leads(tid: str, days: int) -> list[dict]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    last_visit = {r["_id"]: r["last"] for r in await _raw_db.invoices.aggregate([
        {"$match": {"tenant_id": tid}},
        {"$group": {"_id": "$customer_id", "last": {"$max": "$created_at"}}},
    ]).to_list(5000)}
    cooldown = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    contacted = {r["customer_id"] for r in await _raw_db.lead_outreach.find(
        {"tenant_id": tid, "created_at": {"$gte": cooldown}}, {"customer_id": 1}).to_list(5000)}
    leads = []
    async for c in _raw_db.customers.find({"tenant_id": tid}, {"_id": 0}):
        if c["id"] in contacted:
            continue
        last = last_visit.get(c["id"]) or c.get("created_at", "")
        if last and last < cutoff:
            leads.append({"id": c["id"], "name": c.get("name", "Guest"), "phone": c.get("phone", ""),
                          "email": (c.get("email") or "").strip(), "last_visit": last[:10]})
    leads.sort(key=lambda x: x["last_visit"])
    return leads


# ── The daily cycle ─────────────────────────────────────────────────────────
async def run_autopilot_for_tenant(t: dict, force: bool = False) -> dict:
    tid = t["id"]
    cfg = await _settings(tid)
    today = date.today().isoformat()
    existing = await _raw_db.autopilot_log.find_one({"tenant_id": tid, "date": today})
    if existing and not force:
        return {"skipped": "already ran today", **{k: existing.get(k) for k in ("post_created", "posted_live", "emails_sent", "wa_leads")}}

    summary = {"post_created": False, "posted_live": False, "emails_sent": 0, "wa_leads": 0, "errors": []}
    conn = await _conn(tid)
    connected = [p for p in ("instagram", "facebook") if conn.get(p)]

    # 1) today's post
    if cfg["daily_post"]:
        try:
            summary.update(await _create_daily_post(t, today, connected))
        except Exception as e:
            log.error("autopilot daily post failed (%s): %s", tid, e)
            summary["errors"].append(f"post: {str(e)[:120]}")

    # 2) lead machine
    wa_queue = []
    if cfg["winback_emails"]:
        try:
            emails_sent, wa_queue = await _run_lead_machine(t, cfg)
            summary["emails_sent"] = emails_sent
            summary["wa_leads"] = len(wa_queue)
        except Exception as e:
            log.error("autopilot lead machine failed (%s): %s", tid, e)
            summary["errors"].append(f"leads: {str(e)[:120]}")

    await _raw_db.autopilot_log.update_one(
        {"tenant_id": tid, "date": today},
        {"$set": {**summary, "wa_queue": wa_queue, "ran_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True)
    return summary


async def _ensure_today_post(t: dict, today: str) -> dict:
    """Return today's calendar post, creating one via LLM + image gen if missing."""
    existing = await _raw_db.content_calendar.find_one(
        {"tenant_id": t["id"], "date": today, "status": {"$in": ["approved", "posted"]}}, {"_id": 0})
    if existing:
        return existing
    plan = await _ask_json(
        f"You are Mira, marketing agent for '{t.get('name')}', a premium Indian unisex salon. "
        f"Today is {today} — check for real Indian festivals or international days on this date.",
        'Create ONE Instagram post for today. Return JSON: {"post_type":"offer|festival|tip|spotlight",'
        '"topic":"<short>","caption":"<ready-to-post, with emojis>","hashtags":["#..."]}')
    if not plan.get("caption"):
        raise RuntimeError("LLM returned no caption")
    image_url = await _gen_image(
        f"Professional Instagram promo image for an Indian premium salon about '{plan.get('topic')}'. "
        "Cinematic lighting, luxury beauty aesthetic, square. NO text, NO letters, NO logos.", t, "autopilot")
    item = {"id": str(uuid.uuid4()), "tenant_id": t["id"], "date": today,
            "post_type": plan.get("post_type", "post"), "platform": "instagram",
            "topic": plan.get("topic", ""), "caption": plan.get("caption", ""),
            "hashtags": plan.get("hashtags") or [], "status": "approved",
            "image_url": image_url or "", "auto": True,
            "created_at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.content_calendar.insert_one({**item})
    item.pop("_id", None)
    return item


async def _publish_post_live(t: dict, item: dict, connected: list[str]) -> bool:
    """Push the post to the connected Meta pages; returns True if any platform accepted it."""
    base = os.environ.get("APP_PUBLIC_URL", "")
    image_abs = item["image_url"] if item["image_url"].startswith("http") else f"{base}{item['image_url']}"
    caption = f"{item['caption']}\n\n{' '.join(item.get('hashtags') or [])}".strip()
    results = await publish_content(t["id"], caption, image_abs, connected)
    posted = any(r.get("ok") for r in results.values())
    await _raw_db.content_calendar.update_one(
        {"id": item["id"], "tenant_id": t["id"]},
        {"$set": {"status": "posted" if posted else "approved", "publish_results": results,
                  "posted_at": datetime.now(timezone.utc).isoformat() if posted else None}})
    return posted


async def _create_daily_post(t: dict, today: str, connected: list[str]) -> dict:
    item = await _ensure_today_post(t, today)
    out = {"post_created": True, "posted_live": False, "post": {k: item.get(k) for k in ("id", "topic", "caption", "hashtags", "image_url")}}
    if connected and item.get("image_url") and item.get("status") != "posted":
        out["posted_live"] = await _publish_post_live(t, item, connected)
    return out


async def _winback_templates(t: dict) -> tuple[str, str, str]:
    tpl = await _ask_json(
        f"You are Mira, writing a warm win-back offer for '{t.get('name')}', a premium Indian salon. "
        "Use {name} as a placeholder for the guest's first name.",
        'Write a short win-back email (we miss you + a compelling 20% comeback offer, 3 short paragraphs, '
        'warm & personal, use {name}). Also a WhatsApp version — use WhatsApp formatting: *bold* for the '
        'offer, _italics_ for warmth, tasteful emojis, 4-5 short lines each on its own line, use {name}. '
        'Return JSON: {"subject":"<subject with {name}>","email_body":"<paragraphs separated by newlines>","whatsapp":"<formatted msg with line breaks>"}')
    return (tpl.get("subject") or "We miss you at {name}'s favourite salon ✦",
            tpl.get("email_body") or "Dear {name}, we miss you! Enjoy 20% off your next visit.",
            tpl.get("whatsapp") or "Hi {name}! We miss you at the salon — enjoy 20% off your comeback visit ✦")


async def _send_winback_email(t: dict, lead: dict, first: str, subject_t: str, body_t: str, book_url: str) -> bool:
    await asyncio.sleep(0.6)  # Resend rate limit: 2 req/s
    res = await _send_email([lead["email"]],
                            subject_t.replace("{name}", first),
                            marketing_email_html(t.get("name", "Our Salon"),
                                                 body_t.replace("{name}", first), book_url))
    if not res.get("sent"):
        return False
    await _raw_db.lead_outreach.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": t["id"], "customer_id": lead["id"],
        "name": lead["name"], "channel": "email", "to": lead["email"],
        "last_visit": lead["last_visit"], "created_at": datetime.now(timezone.utc).isoformat()})
    return True


async def _run_lead_machine(t: dict, cfg: dict) -> tuple[int, list[dict]]:
    leads = await _find_winback_leads(t["id"], cfg["winback_days"])
    if not leads:
        return 0, []
    subject_t, body_t, wa_t = await _winback_templates(t)
    book_url = f"{os.environ.get('APP_PUBLIC_URL', '')}/book/{t.get('slug', '')}"

    sent, wa_queue = 0, []
    for lead in leads:
        first = (lead["name"] or "Guest").split()[0]
        if lead["email"] and sent < cfg["email_daily_cap"]:
            if await _send_winback_email(t, lead, first, subject_t, body_t, book_url):
                sent += 1
        elif lead["phone"] and len(wa_queue) < 20:
            wa_msg = f"{wa_t.replace('{name}', first)}\n\n📅 *Book now:* {book_url}"
            wa_queue.append({"customer_id": lead["id"], "name": lead["name"], "phone": lead["phone"],
                             "last_visit": lead["last_visit"],
                             "message": wa_msg})
    return sent, wa_queue


# ── Run now + activity ──────────────────────────────────────────────────────
@router.post("/mira-studio/autopilot/run-now")
async def run_now(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    return await run_autopilot_for_tenant(t, force=True)


@router.get("/mira-studio/autopilot/activity")
async def activity(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    logs = await _raw_db.autopilot_log.find(
        {"tenant_id": t["id"]}, {"_id": 0}).sort("date", -1).to_list(14)
    outreach = await _raw_db.lead_outreach.find(
        {"tenant_id": t["id"]}, {"_id": 0}).sort("created_at", -1).to_list(30)
    return {"runs": logs, "outreach": outreach}


class WaSentIn(BaseModel):
    customer_id: str


@router.post("/mira-studio/autopilot/wa-sent")
async def mark_wa_sent(body: WaSentIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    today = date.today().isoformat()
    doc = await _raw_db.autopilot_log.find_one({"tenant_id": t["id"], "date": today})
    lead = next((w for w in (doc or {}).get("wa_queue", []) if w["customer_id"] == body.customer_id), None)
    if lead:
        await _raw_db.autopilot_log.update_one(
            {"tenant_id": t["id"], "date": today},
            {"$pull": {"wa_queue": {"customer_id": body.customer_id}}})
        await _raw_db.lead_outreach.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": t["id"], "customer_id": body.customer_id,
            "name": lead["name"], "channel": "whatsapp", "to": lead["phone"],
            "last_visit": lead.get("last_visit"), "created_at": datetime.now(timezone.utc).isoformat()})
    return {"ok": True}


# ── Scheduler ───────────────────────────────────────────────────────────────
async def _run_enabled_tenants():
    async for cfg in _raw_db.autopilot_settings.find({"enabled": True}):
        t = await _raw_db.tenants.find_one({"id": cfg["tenant_id"]}, {"_id": 0})
        if not t or t.get("status") == "deleted":
            continue
        try:
            out = await run_autopilot_for_tenant(t)
            if not out.get("skipped"):
                log.info("autopilot ran for %s: %s", t.get("slug"), out)
        except Exception as e:
            log.error("autopilot tenant %s failed: %s", cfg["tenant_id"], e)


async def autopilot_scheduler():
    """Daily (after 10:00 IST) run for every tenant with autopilot enabled. Idempotent per date."""
    while True:
        try:
            ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
            if ist_now.hour >= 10:
                await _run_enabled_tenants()
        except Exception as e:
            log.error("autopilot scheduler error: %s", e)
        await asyncio.sleep(1800)
