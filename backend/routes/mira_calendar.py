"""Mira Studio Content Calendar — AI plans a week of posts, owner approves & publishes."""
import uuid
import logging
from datetime import datetime, timezone, timedelta, date

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel

from database import _raw_db
from security import require_tenant_admin, current_tenant
from routes.mira_studio import _ask_json, _gen_image
from routes.social_connect import publish_content, _base, _conn

router = APIRouter()
log = logging.getLogger("mira_calendar")


class PlanIn(BaseModel):
    start_date: str | None = None
    focus: str | None = None


def _calendar_items(days: list, dates: list, tid: str) -> list:
    now = datetime.now(timezone.utc).isoformat()
    return [{
        "id": str(uuid.uuid4()), "tenant_id": tid,
        "date": d.get("date"), "post_type": d.get("post_type", "post"),
        "platform": d.get("platform", "instagram"), "topic": d.get("topic", ""),
        "caption": d.get("caption", ""), "hashtags": d.get("hashtags") or [],
        "status": "suggested", "image_url": "", "created_at": now,
    } for d in days if d.get("date") in dates]


@router.post("/mira-studio/calendar/plan")
async def plan_week(body: PlanIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    try:
        start = date.fromisoformat(body.start_date) if body.start_date else date.today()
    except ValueError:
        raise HTTPException(400, "Invalid start_date")
    dates = [(start + timedelta(days=i)).isoformat() for i in range(7)]
    focus = f" Owner's focus this week: {body.focus}." if body.focus else ""
    sys = (f"You are Mira, the marketing planner for '{t.get('name')}', a premium Indian unisex salon in "
           f"{t.get('location') or 'India'}. Plan one social post per day. Mix content types: offers, "
           "service spotlights, reels, tips, festival/special-day greetings (check real Indian festivals & "
           "international days falling on these exact dates), staff highlights, before/after ideas.")
    plan = await _ask_json(
        sys,
        f"Dates: {', '.join(dates)}.{focus} For EACH date return an entry. "
        'Return JSON: {"days":[{"date":"YYYY-MM-DD","post_type":"offer|reel|festival|tip|spotlight",'
        '"platform":"instagram","topic":"<short>","caption":"<ready-to-post caption with emojis>",'
        '"hashtags":["#..."]}]}')
    days = plan.get("days") or []
    if not days:
        raise HTTPException(400, "Mira couldn't plan the week — try again")
    await _raw_db.content_calendar.delete_many(
        {"tenant_id": t["id"], "date": {"$in": dates}, "status": "suggested"})
    items = _calendar_items(days, dates, t["id"])
    if items:
        await _raw_db.content_calendar.insert_many(items)
    for i in items:
        i.pop("_id", None)
    return {"items": items, "count": len(items)}


@router.get("/mira-studio/calendar")
async def get_calendar(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    start = (date.today() - timedelta(days=1)).isoformat()
    end = (date.today() + timedelta(days=14)).isoformat()
    items = await _raw_db.content_calendar.find(
        {"tenant_id": t["id"], "date": {"$gte": start, "$lte": end}}, {"_id": 0}
    ).sort("date", 1).to_list(50)
    return {"items": items}


class CalendarUpdateIn(BaseModel):
    status: str | None = None
    caption: str | None = None
    topic: str | None = None


@router.put("/mira-studio/calendar/{item_id}")
async def update_calendar_item(item_id: str, body: CalendarUpdateIn,
                               admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if body.status and body.status not in ("suggested", "approved", "skipped", "posted"):
        raise HTTPException(400, "Invalid status")
    if not updates:
        raise HTTPException(400, "Nothing to update")
    res = await _raw_db.content_calendar.update_one(
        {"id": item_id, "tenant_id": t["id"]}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Calendar item not found")
    return {"ok": True}


@router.delete("/mira-studio/calendar/{item_id}")
async def delete_calendar_item(item_id: str, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    await _raw_db.content_calendar.delete_one({"id": item_id, "tenant_id": t["id"]})
    return {"ok": True}


async def _ensure_calendar_image(item: dict, item_id: str, t: dict) -> str:
    image_url = item.get("image_url")
    if image_url:
        return image_url
    image_url = await _gen_image(
        f"Professional social-media promo image for an Indian salon about '{item['topic']}'. "
        "Premium beauty-brand aesthetic, cinematic lighting, square 1:1. "
        "Absolutely NO text, NO letters, NO logos, no distorted faces.", t, "calendar")
    if not image_url:
        raise HTTPException(500, "Image generation failed — try again")
    await _raw_db.content_calendar.update_one(
        {"id": item_id, "tenant_id": t["id"]}, {"$set": {"image_url": image_url}})
    return image_url


@router.post("/mira-studio/calendar/{item_id}/publish")
async def publish_calendar_item(item_id: str, request: Request,
                                admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    item = await _raw_db.content_calendar.find_one({"id": item_id, "tenant_id": t["id"]}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Calendar item not found")
    conn = await _conn(t["id"])
    platforms = [p for p in ("instagram", "facebook") if conn.get(p)]
    if not platforms:
        raise HTTPException(400, "Connect Instagram/Facebook in Settings before auto-posting")
    image_url = await _ensure_calendar_image(item, item_id, t)
    caption = f"{item['caption']}\n\n{' '.join(item.get('hashtags') or [])}".strip()
    image_abs = image_url if image_url.startswith("http") else f"{_base(request)}{image_url}"
    results = await publish_content(t["id"], caption, image_abs, platforms)
    posted = any(r.get("ok") for r in results.values())
    await _raw_db.content_calendar.update_one(
        {"id": item_id, "tenant_id": t["id"]},
        {"$set": {"status": "posted" if posted else "approved",
                  "posted_at": datetime.now(timezone.utc).isoformat() if posted else None,
                  "publish_results": results}})
    return {"results": results, "posted": posted, "image_url": image_url}
