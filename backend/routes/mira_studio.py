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

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from emergentintegrations.llm.chat import LlmChat, UserMessage

from database import _raw_db
from security import require_tenant_admin, current_tenant
from services.storage import _put_object, APP_NAME

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


def _key():
    k = os.environ.get("EMERGENT_LLM_KEY")
    if not k:
        raise HTTPException(500, "AI key not configured")
    return k


async def _ask(system: str, prompt: str, *, model: str = "gpt-4o-mini", session: str = "") -> str:
    chat = LlmChat(
        api_key=_key(),
        session_id=session or f"mira-studio-{uuid.uuid4().hex[:10]}",
        system_message=system,
    ).with_model("openai", model)
    resp = await chat.send_message(UserMessage(text=prompt))
    return (resp or "").strip()


async def _ask_json(system: str, prompt: str) -> dict:
    raw = await _ask(system + " Reply with ONLY valid minified JSON, no markdown, no prose.", prompt)
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start >= 0 and end > start:
            return json.loads(raw[start:end + 1])
        raise HTTPException(400, "AI returned an unexpected format — please try again")


async def _gen_image(prompt: str, t: dict, kind: str) -> str:
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
    gen = OpenAIImageGeneration(api_key=_key())
    try:
        images = await gen.generate_images(prompt=prompt, model="gpt-image-1", number_of_images=1)
    except Exception as e:
        log.error("image gen failed: %s", e)
        return ""
    if not images:
        return ""
    fid = str(uuid.uuid4())
    path = f"{APP_NAME}/{t['id']}/mira-studio/{kind}/{fid}.png"
    try:
        result = _put_object(path, images[0], "image/png")
    except Exception as e:
        log.error("storage failed: %s", e)
        return ""
    await _raw_db.uploads.insert_one({
        "id": fid, "tenant_id": t["id"], "kind": f"mira_studio_{kind}",
        "storage_path": result.get("path", path), "original_filename": f"{fid}.png",
        "content_type": "image/png", "size": len(images[0]), "uploaded_by": "mira_studio",
        "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return f"/api/files/{fid}"


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
    "analytics (explain business numbers), sales (upsell scripts), leadfinder (win-back from customer data), "
    "whatsapp (broadcast message). "
    "Return JSON: {\"agent\":\"<key>\",\"topic\":\"<short subject the user wants, e.g. 'hair spa monsoon offer'>\","
    "\"reply\":\"<one warm sentence to the owner about what you'll do>\"}."
)


@router.post("/mira-studio/orchestrate")
async def orchestrate(body: OrchestrateIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    msg = (body.message or "").strip()
    if not msg:
        raise HTTPException(400, "Tell Mira what you'd like to create")
    plan = await _ask_json(_ROUTER_SYS, f"Salon: {t.get('name')}. Owner request: {msg}")
    agent = plan.get("agent") if plan.get("agent") in _AGENT_KEYS else "content"
    topic = plan.get("topic") or msg
    return {
        "agent": agent,
        "topic": topic,
        "reply": plan.get("reply") or "On it! Here's what I've prepared for you ✦",
        "agent_meta": next((a for a in AGENTS if a["key"] == agent), None),
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
           "and strong local + service hashtags. Keep captions punchy.")
    plat_rules = {
        "instagram": "Instagram caption: hook first line, 3-4 short lines, 8-12 hashtags mixing niche + local.",
        "facebook": "Facebook post: slightly longer, friendly, 1 clear call-to-action, 3-5 hashtags, include phone-booking nudge.",
        "google": "Google Business post: 1500 char max, informative + keyword-rich for local SEO, end with 'Book now', 0-2 hashtags.",
    }
    want = [p for p in body.platforms if p in plat_rules] or ["instagram"]
    schema = ", ".join(f'"{p}":{{"caption":"...","hashtags":["#..."]}}' for p in want)
    posts = await _ask_json(
        sys, f"Topic: {body.topic}. Create posts for these platforms with their rules:\n"
             + "\n".join(f"- {p}: {plat_rules[p]}" for p in want)
             + f'\nReturn JSON: {{{schema}}}')
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
    return {"topic": body.topic, "posts": posts, "image_url": image_url, "platforms": want}


# ── Content Writer / Sales / SEO / Video / Email (text agents) ──────────────
class TextAgentIn(BaseModel):
    agent: str
    topic: str


@router.post("/mira-studio/generate")
async def text_agent(body: TextAgentIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    name = t.get("name", "our salon")
    loc = t.get("location") or "your city"
    topic = body.topic.strip()
    if body.agent == "content":
        sys = f"Content Writer for '{name}', a premium Indian salon in {loc}. Write warm, brand-voice content."
        out = await _ask_json(sys, f"Topic: {topic}. Return JSON: {{\"title\":\"...\",\"body\":\"<3-5 short paragraphs>\",\"cta\":\"...\"}}")
    elif body.agent == "sales":
        sys = f"Sales Agent for '{name}'. Write practical upsell/package pitch scripts staff can say aloud."
        out = await _ask_json(sys, f"Topic: {topic}. Return JSON: {{\"pitch\":\"<what staff says>\",\"upsells\":[\"...\"],\"objection_handling\":[{{\"objection\":\"...\",\"response\":\"...\"}}]}}")
    elif body.agent == "seo":
        sys = f"Local SEO Agent for '{name}' in {loc}. Optimise for 'salon near me' style local search."
        out = await _ask_json(sys, f"Topic: {topic}. Return JSON: {{\"keywords\":[\"...\"],\"meta_description\":\"<155 chars>\",\"gmb_post\":\"...\",\"tips\":[\"...\"]}}")
    elif body.agent == "video":
        sys = f"Video Creator Agent for '{name}'. Design short vertical reels for beauty services."
        out = await _ask_json(sys, f"Topic: {topic}. Return JSON: {{\"hook\":\"<first 3s line>\",\"script\":[\"<scene 1>\",\"...\"],\"shot_list\":[\"...\"],\"caption\":\"...\",\"audio_idea\":\"...\"}}")
    elif body.agent == "email":
        sys = f"Email Marketing Agent for '{name}', a salon in {loc}. Write engaging campaign emails."
        out = await _ask_json(sys, f"Topic: {topic}. Return JSON: {{\"subject\":\"...\",\"preview_text\":\"...\",\"body\":\"<friendly email, plain text with line breaks>\",\"cta\":\"...\"}}")
    else:
        raise HTTPException(400, f"'{body.agent}' is not a text agent")
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
    from routes.mira_autopilot import _find_winback_leads
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
