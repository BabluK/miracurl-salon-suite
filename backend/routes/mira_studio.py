"""Mira Studio — a multi-agent marketing suite coordinated by an AI Orchestrator.

Architecture: one Orchestrator classifies a natural-language request and routes it
to a specialized agent. AI-native agents (content, social, SEO, video script, email,
review replies) work immediately via the Emergent LLM key. Action agents that touch
third-party platforms (Instagram/Facebook posting, Google Business, WhatsApp send,
Gmail) return generated, ready-to-use content and stay in "draft" mode until the
tenant connects the relevant account — real publishing is gated on OAuth/API access.
"""
import os
import uuid
import json
import asyncio
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel

from database import _raw_db
from security import require_tenant_admin, current_tenant
from routes.mira_common import _ask, _ask_json, _gen_image

router = APIRouter()
log = logging.getLogger("mira_studio")

# ── Agent registry ─────────────────────────────────────────────────────────
# needs_connection = requires an external account/API before it can ACT (it can
# still generate drafts). kind drives the frontend icon + routing.
AGENTS = [
    {"key": "orchestrator", "name": "AI Orchestrator", "emoji": "🧠", "kind": "brain",
     "desc": "Understands your request and delegates to the right specialist agent.", "needs_connection": False},
    {"key": "content", "name": "Content Writer Agent", "emoji": "📝", "kind": "ai",
     "desc": "Captions, blogs, offer copy, festival greetings — in your brand voice.", "needs_connection": False},
    {"key": "social", "name": "Social Media Agent", "emoji": "📱", "kind": "ai",
     "desc": "Platform-ready posts + hashtags + an AI promo image for each channel.", "needs_connection": True,
     "connect": ["instagram", "facebook"]},
    {"key": "video", "name": "Video Creator Agent", "emoji": "🎥", "kind": "ai",
     "desc": "Reel scripts, shot lists and a thumbnail concept for your services.", "needs_connection": False},
    {"key": "whatsapp", "name": "WhatsApp Agent", "emoji": "💬", "kind": "action",
     "desc": "Broadcast offers & status updates to your customer list.", "needs_connection": True,
     "connect": ["whatsapp"]},
    {"key": "email", "name": "Email Marketing Agent", "emoji": "📧", "kind": "ai",
     "desc": "Campaign subject lines + HTML newsletters for offers and re-engagement.", "needs_connection": False},
    {"key": "leadfinder", "name": "Lead Finder Agent", "emoji": "🔍", "kind": "data",
     "desc": "Spots win-back opportunities and hot leads from your own customer data.", "needs_connection": False},
    {"key": "seo", "name": "SEO Agent", "emoji": "🌐", "kind": "ai",
     "desc": "Keywords, meta descriptions and Google Business posts to rank locally.", "needs_connection": False},
    {"key": "google", "name": "Google Business Agent", "emoji": "⭐", "kind": "action",
     "desc": "Drafts warm replies to every Google review; auto-reply once connected.", "needs_connection": True,
     "connect": ["google_business"]},
    {"key": "staff_verify", "name": "Staff Verification Agent", "emoji": "👥", "kind": "data",
     "desc": "Checks new hires against the trusted staff registry before you onboard.", "needs_connection": False},
    {"key": "analytics", "name": "Analytics Agent", "emoji": "📊", "kind": "data",
     "desc": "Explains your numbers in plain language and flags what needs attention.", "needs_connection": False},
    {"key": "sales", "name": "Sales Agent", "emoji": "💼", "kind": "ai",
     "desc": "Upsell scripts, package pitches and objection handling for your team.", "needs_connection": False},
]
_AGENT_KEYS = {a["key"] for a in AGENTS}


# ── Connection status ──────────────────────────────────────────────────────
async def _connections(tid: str) -> dict:
    doc = await _raw_db.social_connections.find_one({"tenant_id": tid}, {"_id": 0}) or {}
    return {k: bool(doc.get(k)) for k in ("instagram", "facebook", "whatsapp", "google_business", "gmail")}


@router.get("/mira-studio/agents")
async def list_agents(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    conns = await _connections(t["id"])
    agents = []
    for a in AGENTS:
        needed = a.get("connect", [])
        connected = all(conns.get(c) for c in needed) if needed else True
        agents.append({**a, "connected": connected,
                       "status": "active" if (not a["needs_connection"] or connected) else "connect_account"})
    return {"agents": agents, "connections": conns}


# ── Orchestrator ───────────────────────────────────────────────────────────
class OrchestrateIn(BaseModel):
    message: str
    session_id: str | None = None


_ROUTER_SYS = (
    "You are the Orchestrator for a salon marketing AI. Given the owner's request, choose the single best "
    "specialist agent to handle it. Valid agents: content (captions/copy/greetings), social (instagram/facebook post + image), "
    "video (reel script), email (newsletter campaign), seo (google ranking/keywords), google (reply to reviews), "
    "google_post (user wants Mira to actually POST or publish an offer/post on Google Business, e.g. 'post this on google', 'publish offer to google business'), "
    "analytics (explain business numbers), sales (upsell scripts), leadfinder (win-back from customer data), "
    "whatsapp (broadcast message). "
    "Return JSON: {\"agent\":\"<key>\",\"topic\":\"<short subject the user wants, e.g. 'hair spa monsoon offer'>\","
    "\"reply\":\"<one warm sentence to the owner about what you'll do>\"}."
)

_VALID_ROUTES = _AGENT_KEYS | {"google_post"}


@router.post("/mira-studio/orchestrate")
async def orchestrate(body: OrchestrateIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    msg = (body.message or "").strip()
    if not msg:
        raise HTTPException(400, "Tell Mira what you'd like to create")
    plan = await _ask_json(_ROUTER_SYS, f"Salon: {t.get('name')}. Owner request: {msg}")
    agent = plan.get("agent") if plan.get("agent") in _VALID_ROUTES else "content"
    topic = plan.get("topic") or msg
    return {
        "agent": agent,
        "topic": topic,
        "reply": plan.get("reply") or "On it! Here's what I've prepared for you ✦",
        "agent_meta": next((a for a in AGENTS if a["key"] == agent), None),
    }


# ── Social memory (last 3 days of posts) ───────────────────────────────────
def _post_snippet(p: dict) -> str:
    return (p.get("caption") or "")[:120]


async def _social_context(tid: str) -> dict:
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=3)).isoformat()
    recent = await _raw_db.social_posts.find(
        {"tenant_id": tid, "created_at": {"$gte": cutoff}}, {"_id": 0}
    ).sort("created_at", -1).to_list(30)
    today = now.date().isoformat()
    posted_today = {}
    for p in recent:
        if not (p.get("created_at") or "").startswith(today):
            continue
        results = p.get("results") or {}
        for plat in p.get("platforms", []):
            if (results.get(plat) or {}).get("ok") and plat not in posted_today:
                posted_today[plat] = _post_snippet(p)
    last = await _raw_db.social_posts.find_one(
        {"tenant_id": tid}, {"_id": 0, "created_at": 1}, sort=[("created_at", -1)])
    history = await _raw_db.social_posts.find(
        {"tenant_id": tid}, {"_id": 0, "caption": 1, "platforms": 1, "created_at": 1}
    ).sort("created_at", -1).to_list(10)
    days_since = None
    if last:
        try:
            dt = datetime.fromisoformat(last["created_at"])
            days_since = max(0, (now - dt).days)
        except ValueError:
            pass
    return {"recent": recent, "posted_today": posted_today,
            "days_since_last_post": days_since, "history": history}


@router.get("/mira-studio/social/context")
async def social_context(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    ctx = await _social_context(t["id"])
    days = ctx["days_since_last_post"]
    nudge = None
    if days is None:
        nudge = ("Hey Admin team — your salon hasn't posted on Google / social media yet. "
                 "Would you like me to suggest an offer, a package, or something specific to post?")
    elif days >= 3:
        nudge = (f"Hey Admin team — no activity found on your Google / social media in the past {days} days. "
                 "Would you like me to suggest an offer, a package, or something specific to post?")
    return {
        "posted_today": ctx["posted_today"],
        "days_since_last_post": days,
        "nudge": nudge,
        "recent": [{
            "platforms": p.get("platforms", []), "caption": _post_snippet(p),
            "created_at": p.get("created_at"), "kind": p.get("kind", "post"),
        } for p in ctx["recent"]],
    }


# ── Social Media Agent ─────────────────────────────────────────────────────
class SocialIn(BaseModel):
    topic: str
    platforms: list[str] = ["instagram", "facebook", "google"]
    with_image: bool = True
    image_style: str = "luxury"


@router.post("/mira-studio/social/generate")
async def social_generate(body: SocialIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    name = t.get("name", "our salon")
    loc = t.get("location") or "your city"
    sys = (f"You are the Social Media Agent for '{name}', a premium Indian unisex salon in {loc}. "
           "Write scroll-stopping, warm, on-brand social copy. Use Indian salon context, tasteful emojis, "
           "and strong local + service hashtags. Keep captions punchy. "
           "When the topic is an offer/discount/package, structure every caption as: catchy hook line, "
           "offer details (service + discount or price), validity line, clear booking call-to-action.")
    plat_rules = {
        "instagram": "Instagram caption: hook first line, 3-4 short lines, 8-12 hashtags mixing niche + local.",
        "facebook": "Facebook post: slightly longer, friendly, 1 clear call-to-action, 3-5 hashtags, include phone-booking nudge.",
        "google": ("Google Business OFFER post: line 1 is a catchy offer headline, then 2-3 short lines of offer "
                   "details (service + discount/price), one validity line, end with 'Book now'. Max 1400 chars, "
                   "keyword-rich for local SEO, 0-2 hashtags."),
    }
    want = [p for p in body.platforms if p in plat_rules] or ["instagram"]
    ctx = await _social_context(t["id"])
    history = ""
    if ctx["history"]:
        lines = [f"- [{(p.get('created_at') or '')[:10]}] ({', '.join(p.get('platforms', []))}) {_post_snippet(p)}"
                 for p in ctx["history"]]
        history = ("\n\nMemory — this salon's most recent posts (do NOT repeat these themes, "
                   "offers or wording; create something clearly fresh and different):\n" + "\n".join(lines))
    schema = ", ".join(f'"{p}":{{"caption":"...","hashtags":["#..."]}}' for p in want)
    posts = await _ask_json(
        sys, f"Topic: {body.topic}. Create posts for these platforms with their rules:\n"
             + "\n".join(f"- {p}: {plat_rules[p]}" for p in want)
             + history
             + f'\nReturn JSON: {{{schema}}}')
    posts = _clean_newlines(posts)
    image_url = ""
    if body.with_image:
        styles = {
            "luxury": "opulent dark luxury salon, warm golden bokeh, marble & brass",
            "bright": "bright airy modern salon, soft daylight, pastel tones",
            "festive": "festive Indian salon scene, marigold & fairy-light glow, celebratory",
            "bold": "bold vibrant beauty editorial, high-contrast colour pop",
        }
        img_prompt = (f"Professional social-media promo image for an Indian salon about '{body.topic}'. "
                      f"{styles.get(body.image_style, styles['luxury'])}. Square 1:1, premium beauty-brand aesthetic, "
                      f"cinematic lighting. Absolutely NO text, NO letters, NO logos, NO watermarks, no distorted faces.")
        image_url = await _gen_image(img_prompt, t, "social")
    posted_today = {p: v for p, v in ctx["posted_today"].items() if p in want}
    return {"topic": body.topic, "posts": posts, "image_url": image_url,
            "platforms": want, "posted_today": posted_today}


# ── Google Business auto-posting (generate + publish, with same-day memory) ──
class GooglePostIn(BaseModel):
    topic: str
    caption: str | None = None
    offer_title: str | None = None
    image_url: str | None = None
    with_image: bool = True
    confirm: bool = False


@router.post("/mira-studio/google/post")
async def google_auto_post(body: GooglePostIn, request: Request,
                           admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    from routes.social_connect import publish_google_post, _base
    name = t.get("name", "our salon")
    ctx = await _social_context(t["id"])
    caption, title, image_url = body.caption, body.offer_title, body.image_url
    if not caption:
        out = _clean_newlines(await _ask_json(
            f"You are the Google Business posting agent for '{name}', a premium Indian salon in "
            f"{t.get('location') or 'your city'}. Write a properly formatted Google Business OFFER post.",
            f"Topic: {body.topic}. Structure the post as: catchy offer headline line, 2-3 short lines of offer "
            "details (service + discount/price), one validity line (today only unless the topic says otherwise), "
            "end with 'Book now'. Max 1400 chars, local-SEO keyword rich, no markdown. Return JSON: "
            '{"offer_title":"<max 55 chars>","caption":"<the full post text with line breaks>"}'))
        caption = out.get("caption") or ""
        title = out.get("offer_title") or body.topic[:55]
        if not caption:
            raise HTTPException(400, "Couldn't generate the offer — please try again")
        if body.with_image:
            image_url = await _gen_image(
                f"Professional Google Business promo image for an Indian salon offer about '{body.topic}'. "
                "Premium beauty-brand aesthetic, warm cinematic lighting, square 1:1. "
                "Absolutely NO text, NO letters, NO logos, NO watermarks.", t, "google")
    already = ctx["posted_today"].get("google")
    who = (admin or {}).get("name") or "Salon admin"
    draft = {"caption": caption, "offer_title": title, "image_url": image_url}
    if already and not body.confirm:
        return {"needs_confirmation": True, "posted": False, "draft": draft,
                "question": (f"Hey {who} — we already posted an offer on Google today "
                             f"(“{already[:80]}”). Would you like to post this one as well?")}
    image_abs = None
    if image_url:
        image_abs = image_url if image_url.startswith("http") else f"{_base(request)}{image_url}"
    result = await publish_google_post(t["id"], caption, image_abs, title)
    return {"needs_confirmation": False, "posted": bool(result.get("ok")),
            "result": result, "draft": draft}


# ── Content Writer / Sales / SEO / Video / Email (text agents) ──────────────
class TextAgentIn(BaseModel):
    agent: str
    topic: str


_TEXT_AGENTS = {
    "content": (
        "Content Writer for '{name}', a premium Indian salon in {loc}. Write warm, brand-voice content.",
        '{{"title":"...","body":"<3-5 short paragraphs>","cta":"..."}}'),
    "sales": (
        "Sales Agent for '{name}'. Write practical upsell/package pitch scripts staff can say aloud.",
        '{{"pitch":"<what staff says>","upsells":["..."],"objection_handling":[{{"objection":"...","response":"..."}}]}}'),
    "seo": (
        "Local SEO Agent for '{name}' in {loc}. Optimise for 'salon near me' style local search.",
        '{{"keywords":["..."],"meta_description":"<155 chars>","gmb_post":"...","tips":["..."]}}'),
    "video": (
        "Video Creator Agent for '{name}'. Design short vertical reels for beauty services.",
        '{{"hook":"<first 3s line>","script":["<scene 1>","..."],"shot_list":["..."],"caption":"...","audio_idea":"..."}}'),
    "email": (
        "Email Marketing Agent for '{name}', a salon in {loc}. Write engaging campaign emails.",
        '{{"subject":"...","preview_text":"...","body":"<friendly email, plain text with line breaks>","cta":"..."}}'),
}


@router.post("/mira-studio/generate")
async def text_agent(body: TextAgentIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    name = t.get("name", "our salon")
    loc = t.get("location") or "your city"
    topic = body.topic.strip()
    if body.agent not in _TEXT_AGENTS:
        raise HTTPException(400, f"'{body.agent}' is not a text agent")
    sys_tpl, shape = _TEXT_AGENTS[body.agent]
    out = await _ask_json(sys_tpl.format(name=name, loc=loc),
                          f"Topic: {topic}. Return JSON: {shape.format()}")
    return {"agent": body.agent, "topic": topic, "result": _clean_newlines(out)}


def _clean_newlines(obj):
    """LLMs sometimes emit literal backslash-n sequences inside JSON strings."""
    if isinstance(obj, str):
        return obj.replace("\\n", "\n")
    if isinstance(obj, list):
        return [_clean_newlines(v) for v in obj]
    if isinstance(obj, dict):
        return {k: _clean_newlines(v) for k, v in obj.items()}
    return obj


# ── Email campaigns (branded template + real sending via Resend) ────────────
class CampaignPreviewIn(BaseModel):
    body: str


@router.post("/mira-studio/email-campaign/preview")
async def campaign_preview(body: CampaignPreviewIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    from email_service import marketing_email_html
    cta_url = f"{os.environ.get('APP_PUBLIC_URL', '')}/book/{t.get('slug', '')}"
    return {"html": marketing_email_html(t.get("name", "Our Salon"), _clean_newlines(body.body), cta_url)}


class CampaignSendIn(BaseModel):
    subject: str
    body: str
    audience: str = "all"  # all | winback


@router.post("/mira-studio/email-campaign/send")
async def campaign_send(body: CampaignSendIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    from email_service import marketing_email_html, _send_email
    from routes.mira_autopilot import _find_winback_leads  # runtime import: autopilot pulls email_service at module load
    if not body.subject.strip() or not body.body.strip():
        raise HTTPException(400, "Subject and body are required")
    if body.audience == "winback":
        recipients = [{"id": lead["id"], "name": lead["name"], "email": lead["email"]}
                      for lead in await _find_winback_leads(t["id"], 45) if lead["email"]]
    else:
        recipients = [{"id": c["id"], "name": c.get("name", "Guest"), "email": c["email"].strip()}
                      async for c in _raw_db.customers.find(
                          {"tenant_id": t["id"], "email": {"$nin": [None, ""]}}, {"_id": 0})]
    cooldown = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    recent = {r["customer_id"] for r in await _raw_db.lead_outreach.find(
        {"tenant_id": t["id"], "channel": "campaign", "created_at": {"$gte": cooldown}},
        {"customer_id": 1}).to_list(5000)}
    recipients = [r for r in recipients if r["id"] not in recent][:100]
    if not recipients:
        return {"sent": 0, "skipped": 0, "note": "No eligible recipients (all contacted within 7 days or no emails on file)"}

    cta_url = f"{os.environ.get('APP_PUBLIC_URL', '')}/book/{t.get('slug', '')}"
    clean_body = _clean_newlines(body.body)
    sent, failed = 0, 0
    now = datetime.now(timezone.utc).isoformat()
    for r in recipients:
        first = (r["name"] or "Guest").split()[0]
        html = marketing_email_html(t.get("name", "Our Salon"),
                                    clean_body.replace("{name}", first), cta_url)
        await asyncio.sleep(0.6)  # Resend rate limit: 2 req/s
        res = await _send_email([r["email"]], body.subject.replace("{name}", first), html)
        if res.get("sent"):
            sent += 1
            await _raw_db.lead_outreach.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": t["id"], "customer_id": r["id"],
                "name": r["name"], "channel": "campaign", "to": r["email"], "created_at": now})
        else:
            failed += 1
    return {"sent": sent, "failed": failed, "audience": body.audience}


# ── Data agents (from the salon's own data) ─────────────────────────────────
@router.get("/mira-studio/analytics")
async def analytics_agent(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    tid = t["id"]
    now = datetime.now(timezone.utc)
    month = now.strftime("%Y-%m")
    invs = await _raw_db.invoices.find({"tenant_id": tid}, {"_id": 0, "total": 1, "created_at": 1}).to_list(3000)
    month_rev = round(sum(float(i.get("total") or 0) for i in invs if (i.get("created_at") or "").startswith(month)), 2)
    total_rev = round(sum(float(i.get("total") or 0) for i in invs), 2)
    cust = await _raw_db.customers.count_documents({"tenant_id": tid})
    appts = await _raw_db.appointments.count_documents({"tenant_id": tid})
    stats = {"month_revenue": month_rev, "all_time_revenue": total_rev, "total_bills": len(invs),
             "customers": cust, "appointments": appts}
    summary = await _ask(
        f"Analytics Agent for a salon '{t.get('name')}'. Explain these numbers to a non-technical owner in 3 short, "
        "encouraging bullet points and 1 clear action to grow next month. Use ₹.",
        json.dumps(stats))
    return {"stats": stats, "summary": summary}


@router.get("/mira-studio/leads")
async def lead_finder_agent(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    tid = t["id"]
    now = datetime.now(timezone.utc)
    custs = await _raw_db.customers.find(
        {"tenant_id": tid}, {"_id": 0, "name": 1, "phone": 1, "last_visit": 1, "visits": 1, "total_spent": 1}
    ).to_list(2000)
    winback = []
    for c in custs:
        lv = c.get("last_visit") or ""
        try:
            days = (now - datetime.fromisoformat(lv.replace("Z", "+00:00"))).days if lv else 999
        except (ValueError, TypeError):
            days = 999
        if 45 <= days <= 400 and (c.get("visits") or 0) >= 1:
            winback.append({"name": c.get("name"), "phone": c.get("phone"), "days_since": days,
                            "total_spent": round(float(c.get("total_spent") or 0), 0)})
    winback.sort(key=lambda x: x["total_spent"], reverse=True)
    return {"winback_leads": winback[:20], "count": len(winback)}


@router.get("/mira-studio/staff-verification")
async def staff_verification_agent(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    tid = t["id"]
    staff = await _raw_db.staff.find({"tenant_id": tid}, {"_id": 0, "name": 1, "phone": 1, "staff_code": 1}).to_list(200)
    checked = []
    for s in staff:
        reg = None
        if s.get("phone"):
            reg = await _raw_db.registry_employees.find_one({"phone": s["phone"]}, {"_id": 0, "staff_code": 1})
        checked.append({"name": s.get("name"), "phone": s.get("phone"),
                        "in_registry": bool(reg), "registry_code": reg.get("staff_code") if reg else None})
    return {"staff": checked, "total": len(checked), "verified": sum(1 for c in checked if c["in_registry"])}
