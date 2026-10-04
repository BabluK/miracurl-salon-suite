"""Mira's brain: one place for the model she thinks with and the memory she carries into every prompt.
Memory = Boss-approved notes (mira_memory) + auto-learned outcomes (replies, conversions, what worked) + recent Boss instructions."""
import logging
import os
import uuid
from datetime import datetime, timezone

from database import _raw_db

log = logging.getLogger("mira_brain")

# Strongest reasoning model for drafting/decisions; fast sibling for bulk classification.
MODEL = os.environ.get("MIRA_MODEL", "gpt-5.6-terra")
FAST_MODEL = os.environ.get("MIRA_FAST_MODEL", "gpt-5.4-mini")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def learn(category: str, text: str, source: str = "auto", lead_id: str | None = None) -> bool:
    """Remember something durable. Deduped on (category, text); auto notes are capped so Boss notes always win."""
    text = " ".join((text or "").split())[:400]
    if not text:
        return False
    if await _raw_db.mira_memory.find_one({"category": category, "text": text}, {"_id": 1}):
        return False
    await _raw_db.mira_memory.insert_one({"id": str(uuid.uuid4()), "category": category, "text": text, "source": source,
                                         "lead_id": lead_id, "created_at": _now()})
    auto = await _raw_db.mira_memory.count_documents({"source": "auto"})
    if auto > 300:
        async for old in _raw_db.mira_memory.find({"source": "auto"}).sort("created_at", 1).limit(auto - 300):
            await _raw_db.mira_memory.delete_one({"_id": old["_id"]})
    return True


async def _outcome_stats() -> str:
    """What has actually worked so far — by vertical, country and channel — so Mira adapts instead of guessing."""
    pipe = [{"$match": {"status": {"$in": ["replied", "demo", "customer"]}}},
            {"$group": {"_id": {"v": {"$ifNull": ["$vertical", "salon"]}, "c": {"$ifNull": ["$city", "?"]}, "via": {"$ifNull": ["$sent_via", "email"]}}, "n": {"$sum": 1}}},
            {"$sort": {"n": -1}}, {"$limit": 8}]
    rows = await _raw_db.mira_leads.aggregate(pipe).to_list(8)
    if not rows:
        return ""
    wins = ", ".join(f"{r['_id']['v']}s in {r['_id']['c']} via {r['_id']['via']} ({r['n']})" for r in rows)
    sent = await _raw_db.mira_leads.count_documents({"status": {"$in": ["sent", "emailed", "followup_sent", "replied", "demo", "customer"]}})
    won = await _raw_db.mira_leads.count_documents({"status": {"$in": ["replied", "demo", "customer"]}})
    return f"Outreach so far: {sent} contacted → {won} engaged ({(won / sent * 100) if sent else 0:.1f}%). Best responders: {wins}."


async def brain_prompt(limit: int = 60) -> str:
    """Memory block for every Mira prompt (HQ chat, lead emails, WhatsApp blast, discovery)."""
    rows = await _raw_db.mira_memory.find({}, {"_id": 0, "category": 1, "text": 1, "source": 1}).sort("created_at", -1).to_list(limit)
    boss = [r for r in rows if r.get("source") != "auto"]
    learned = [r for r in rows if r.get("source") == "auto"][:25]
    parts = []
    if boss:
        parts.append("BOSS'S STANDING INSTRUCTIONS & FACTS (always obey, never contradict):\n" + "\n".join(f"- [{r['category']}] {r['text']}" for r in boss))
    if learned:
        parts.append("WHAT I'VE LEARNED FROM PAST OUTREACH:\n" + "\n".join(f"- {r['text']}" for r in learned))
    stats = await _outcome_stats()
    if stats:
        parts.append(stats)
    if not parts:
        return ""
    return "\n\nMIRA MEMORY — you remember everything below across sessions; use it when relevant:\n" + "\n\n".join(parts) + "\n"


async def remember_reply(lead: dict, text: str, channel: str) -> None:
    await learn("outcome", f"{lead.get('name')} ({lead.get('vertical') or 'salon'}, {lead.get('city') or '?'}) replied on {channel}: \"{text[:140]}\"",
                lead_id=lead.get("id"))


async def remember_conversion(lead: dict, kind: str) -> None:
    await learn("outcome", f"{kind.upper()}: {lead.get('name')} ({lead.get('vertical') or 'salon'}, {lead.get('city') or '?'}) — "
                f"found via {lead.get('source') or 'google maps'}, pitched via {lead.get('sent_via') or 'email'}.", lead_id=lead.get("id"))
