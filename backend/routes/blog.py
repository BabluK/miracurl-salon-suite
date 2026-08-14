"""Public SEO blog: how-to articles for salon owners. Super-admin managed, seeded with starter posts."""
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import _raw_db
from security import require_super_admin

router = APIRouter()

_SEED_POSTS = [
    {
        "slug": "reduce-salon-no-shows-whatsapp-reminders",
        "title": "How to Cut Salon No-Shows by 60% with WhatsApp Reminders",
        "excerpt": "No-shows silently eat 10–20% of a salon's monthly revenue. Here's the exact reminder system that fixes it — without hiring anyone.",
        "tags": ["whatsapp", "bookings", "revenue"],
        "content": (
            "Every empty chair is money you already spent — the stylist is paid, the lights are on, the slot is gone. "
            "For most Indian salons, 1 in 6 bookings never walks in. The good news: no-shows are mostly a reminder problem, not a customer problem.\n\n"
            "## Why clients no-show (it's rarely on purpose)\n"
            "- They booked 4–5 days ago and simply forgot\n"
            "- They aren't sure of the exact time and feel awkward calling\n"
            "- Something came up and cancelling felt like too much effort\n\n"
            "## The 3-message system that works\n"
            "1. **Instant confirmation** the moment they book — date, time, service, stylist name. This alone makes the booking feel 'real'.\n"
            "2. **Reminder 24 hours before** with a one-tap way to confirm or reschedule. Rescheduling saves the revenue; a silent no-show doesn't.\n"
            "3. **A 'we're ready for you' message 2 hours before** — short, warm, with your salon location link.\n\n"
            "## Make it automatic\n"
            "Doing this manually for 20 bookings a day is impossible. Salon software like Miracurl Suite sends all three messages automatically on WhatsApp "
            "the moment a booking is created — and lets the client confirm or move the slot without calling you.\n\n"
            "## What salons see after 30 days\n"
            "- No-shows typically drop 50–60%\n"
            "- Front-desk calls drop because clients self-confirm\n"
            "- Clients rate the salon as 'more professional' — reminders are a service, not spam\n\n"
            "Start with the 24-hour reminder if you change only one thing this week. It has the highest impact per rupee — exactly zero."
        ),
    },
    {
        "slug": "gst-billing-guide-salons-india",
        "title": "GST Billing for Salons in India: A Simple, Practical Guide",
        "excerpt": "When do you need GST, what rate applies to salon services, and how to make every bill compliant without a CA on speed dial.",
        "tags": ["gst", "billing", "compliance"],
        "content": (
            "GST confuses more salon owners than any other topic — so here is the practical version, minus the jargon.\n\n"
            "## Do you even need GST registration?\n"
            "If your annual turnover crosses ₹20 lakh (₹10 lakh in special-category states), registration is mandatory. "
            "Below that it's optional — but many salons register anyway because corporate clients and marketplaces ask for GST invoices.\n\n"
            "## What rate applies?\n"
            "Salon and beauty services are taxed at **18% GST**. Product sales (shampoos, serums you retail) carry the GST rate of each product — usually 18% or 28%.\n\n"
            "## What a compliant salon invoice must show\n"
            "- Your GSTIN and salon name & address\n"
            "- Invoice number and date (sequential, never reused)\n"
            "- Service description, taxable value, CGST + SGST split (9% + 9% for intra-state)\n"
            "- Total in words and the customer's name for B2B bills\n\n"
            "## The mistakes that trigger notices\n"
            "1. Charging GST without being registered\n"
            "2. Skipping bills for cash customers (turnover mismatch with UPI records)\n"
            "3. Wrong CGST/SGST vs IGST split\n\n"
            "## Let the software do the math\n"
            "A POS built for salons — like Miracurl Suite — generates GST-ready invoices automatically: correct splits, sequential numbering, "
            "and a monthly report your CA can file from directly. You focus on clients; the bill formats itself."
        ),
    },
    {
        "slug": "salon-memberships-repeat-customers",
        "title": "How Memberships Turn One-Time Visitors into Salon Regulars",
        "excerpt": "Acquiring a new client costs 5x more than keeping one. Memberships and loyalty points are the highest-ROI move a salon can make.",
        "tags": ["memberships", "loyalty", "growth"],
        "content": (
            "Most salons obsess over new footfall. The profitable ones obsess over the second visit — because a client who comes back "
            "three times is worth more than five one-timers.\n\n"
            "## Why memberships work in salons specifically\n"
            "Hair and beauty are repeat-by-nature services. A membership doesn't create demand — it just makes sure that demand comes back to YOU, "
            "not the salon that opened across the road.\n\n"
            "## Three membership models that work in India\n"
            "1. **Prepaid value packs** — pay ₹5,000, get ₹6,000 of services. You get cash upfront; the client gets an obvious deal.\n"
            "2. **Tier memberships** — Silver/Gold/Platinum with better discounts and priority slots. Great for premium salons.\n"
            "3. **Loyalty points** — every ₹100 spent earns points redeemable on the next visit. Zero commitment, works for walk-ins.\n\n"
            "## The rules that make or break it\n"
            "- Keep the maths simple enough to explain in one sentence at the billing desk\n"
            "- Remind members before expiry — an expiring balance is the strongest reason to book again\n"
            "- Track it in software, not a notebook. Manual tracking dies within a month\n\n"
            "## Measure one number\n"
            "Repeat-visit rate. If 100 clients visited this month, how many had visited before? Salons running memberships on "
            "Miracurl Suite typically move this from ~30% to 50%+ within a quarter — and that difference is almost pure profit."
        ),
    },
]


async def _ensure_seeded():
    if await _raw_db.blog_posts.count_documents({}) == 0:
        now = datetime.now(timezone.utc).isoformat()
        await _raw_db.blog_posts.insert_many([
            {**p, "id": str(uuid.uuid4()), "published": True, "author": "Team Miracurl",
             "created_at": now, "updated_at": now} for p in _SEED_POSTS])


@router.get("/public/blog")
async def public_blog_list():
    await _ensure_seeded()
    posts = await _raw_db.blog_posts.find(
        {"published": True},
        {"_id": 0, "slug": 1, "title": 1, "excerpt": 1, "tags": 1, "author": 1, "created_at": 1}
    ).sort("created_at", -1).to_list(100)
    return {"posts": posts}


@router.get("/public/blog/{slug}")
async def public_blog_post(slug: str):
    await _ensure_seeded()
    post = await _raw_db.blog_posts.find_one({"slug": slug, "published": True}, {"_id": 0})
    if not post:
        raise HTTPException(404, "Article not found")
    return post


class BlogPostIn(BaseModel):
    title: str = Field(..., max_length=180)
    excerpt: str = Field("", max_length=400)
    content: str = Field(..., max_length=40000)
    tags: list[str] = []
    slug: Optional[str] = None
    published: bool = True


def _slugify(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:80]


@router.get("/super-admin/blog")
async def admin_blog_list(user=Depends(require_super_admin)):
    await _ensure_seeded()
    return await _raw_db.blog_posts.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


@router.post("/super-admin/blog")
async def admin_blog_create(body: BlogPostIn, user=Depends(require_super_admin)):
    slug = _slugify(body.slug or body.title)
    if await _raw_db.blog_posts.find_one({"slug": slug}, {"_id": 0, "id": 1}):
        raise HTTPException(400, f"An article with slug '{slug}' already exists")
    now = datetime.now(timezone.utc).isoformat()
    doc = {"id": str(uuid.uuid4()), "slug": slug, "title": body.title.strip(),
           "excerpt": body.excerpt.strip(), "content": body.content, "tags": body.tags,
           "published": body.published, "author": "Team Miracurl", "created_at": now, "updated_at": now}
    await _raw_db.blog_posts.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/super-admin/blog/{pid}")
async def admin_blog_update(pid: str, body: BlogPostIn, user=Depends(require_super_admin)):
    res = await _raw_db.blog_posts.update_one({"id": pid}, {"$set": {
        "title": body.title.strip(), "excerpt": body.excerpt.strip(), "content": body.content,
        "tags": body.tags, "published": body.published,
        "updated_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Article not found")
    return {"ok": True}


@router.delete("/super-admin/blog/{pid}")
async def admin_blog_delete(pid: str, user=Depends(require_super_admin)):
    res = await _raw_db.blog_posts.delete_one({"id": pid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Article not found")
    return {"deleted": 1}


class AIDraftIn(BaseModel):
    topic: str = Field(..., max_length=200)


async def _generate_ai_draft(topic: str) -> dict:
    import json as _json
    import os
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    chat = LlmChat(
        api_key=key, session_id=f"blog-draft-{uuid.uuid4().hex[:8]}",
        system_message=(
            "You write SEO blog articles for Miracurl Suite (miracurl-suite.com), an all-in-one salon "
            "management software for Indian salon owners (online bookings, WhatsApp automation, GST billing, "
            "memberships, staff attendance & payroll). Audience: Indian salon and parlour owners. "
            "Tone: practical, no-fluff, warm; short paragraphs; concrete numbers and examples. "
            "FORMAT the content field as plain-text blocks separated by BLANK lines: paragraphs, "
            "'## ' section headings, '- ' bullet lists; **bold** allowed. 500-750 words. "
            "Mention Miracurl Suite naturally once or twice — helpful, never salesy. "
            'Respond ONLY with valid JSON, no markdown fences: '
            '{"title":"SEO title, max 90 chars","excerpt":"one compelling line, max 200 chars",'
            '"tags":["3-4","lowercase","tags"],"content":"the full article"}'
        )).with_model("openai", "gpt-4o-mini")
    reply = await chat.send_message(UserMessage(text=f"Write the article. Topic: {topic.strip()}"))
    raw = str(reply).strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw[raw.index("{"):raw.rindex("}") + 1]
    try:
        data = _json.loads(raw)
    except ValueError:
        raise HTTPException(502, "Mira's draft came back malformed — please try again")
    return {"title": str(data.get("title") or "")[:180], "excerpt": str(data.get("excerpt") or "")[:400],
            "tags": [str(t)[:30] for t in (data.get("tags") or [])][:5],
            "content": str(data.get("content") or "")[:40000]}


@router.post("/super-admin/blog/ai-draft")
async def admin_blog_ai_draft(body: AIDraftIn, user=Depends(require_super_admin)):
    """Mira drafts a ready-to-publish SEO article from a topic line."""
    return await _generate_ai_draft(body.topic)


_WEEKLY_TOPICS = [
    "How salons can use Instagram Reels to get more bookings",
    "5 front-desk mistakes that quietly lose salon customers",
    "How to price salon services right in a competitive Indian market",
    "Staff attendance and payroll: ending the register-notebook era",
    "How WhatsApp broadcast offers fill empty weekday slots",
    "Why every salon needs an online booking link in its Instagram bio",
    "Turning one-time bridal clients into year-round regulars",
    "Salon hygiene standards that clients actually notice (and pay for)",
    "How to handle negative Google reviews the professional way",
    "Festival season playbook: preparing your salon for Diwali rush",
    "Gift cards: the most underused revenue tool in Indian salons",
    "How to reduce staff attrition in salons without raising salaries",
]


async def run_weekly_auto_draft() -> dict:
    """Mira drafts one article a week (published=False) for the super admin to approve."""
    used = {p["slug"] for p in await _raw_db.blog_posts.find({}, {"_id": 0, "slug": 1}).to_list(500)}
    topic = next((t for t in _WEEKLY_TOPICS if _slugify(t) not in used), None)
    if not topic:
        return {"skipped": "all rotation topics already drafted"}
    data = await _generate_ai_draft(topic)
    now = datetime.now(timezone.utc).isoformat()
    doc = {"id": str(uuid.uuid4()), "slug": _slugify(data["title"]) or _slugify(topic),
           "title": data["title"], "excerpt": data["excerpt"], "content": data["content"],
           "tags": data["tags"], "published": False, "auto_draft": True,
           "author": "Mira (AI draft)", "created_at": now, "updated_at": now}
    if doc["slug"] in used:
        doc["slug"] = f"{doc['slug']}-{uuid.uuid4().hex[:4]}"
    await _raw_db.blog_posts.insert_one(doc)
    return {"drafted": doc["title"], "slug": doc["slug"]}


@router.post("/super-admin/blog/{pid}/publish")
async def admin_blog_publish(pid: str, user=Depends(require_super_admin)):
    res = await _raw_db.blog_posts.update_one(
        {"id": pid}, {"$set": {"published": True, "updated_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Article not found")
    return {"ok": True, "published": True}
