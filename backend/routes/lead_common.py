"""Shared lead-outreach helpers (pricing + email templates).
Extracted from lead_gen.py so mira_calls.py can import them without a circular dependency."""
import os
import re
import html as _html


async def _live_plans() -> dict:
    from routes.subscriptions import load_plan_overrides, PLAN_CATALOG
    try:
        await load_plan_overrides()
    except Exception:
        pass
    return {k: dict(v) for k, v in PLAN_CATALOG.items()}


def _lead_intl(city: str) -> bool:
    """True when the lead's city is outside India (e.g. 'London, UK', 'New York, US')."""
    m = re.search(r",\s*([A-Za-z]{2,3})$", (city or "").strip())
    return bool(m and m.group(1).upper() not in ("IN", "IND"))


def _plans_for(plans: dict, intl: bool, vertical: str = "salon") -> dict:
    """USD plans for international leads, INR for Indian — filtered to the lead's business vertical."""
    return {k: v for k, v in plans.items()
            if (v.get("currency") == "USD") == intl and (v.get("vertical") or "salon") == vertical}


def _pricing_lines(plans: dict) -> str:
    return "\n".join(
        (f"- {v['label']}: ${v['price']:,.0f}" if v.get("currency") == "USD"
         else f"- {v['label']}: Rs.{int(v['price']):,}")
        for v in plans.values())


def _pricing_table_html(plans: dict) -> str:
    rows = ""
    for k, v in plans.items():
        annual = "annual" in k
        style = "background:#faf6ec;font-weight:bold" if annual else ""
        badge = ' <span style="background:#d4af37;color:#fff;font-size:10px;padding:2px 7px;border-radius:8px;vertical-align:middle">BEST VALUE</span>' if annual else ""
        price = f"${v['price']:,.0f}" if v.get("currency") == "USD" else f"₹{int(v['price']):,}"
        rows += (f'<tr style="{style}"><td style="padding:8px 14px;border-bottom:1px solid #eee">{v["label"]}{badge}</td>'
                 f'<td style="padding:8px 14px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">{price}</td></tr>')
    intl = any(v.get("currency") == "USD" for v in plans.values())
    foot = ('💳 Billed in USD via a secure international payment link.' if intl
            else '💡 Multi-branch discounts available — the more branches, the more you save. Full details in the attached brochure.')
    return (
        '<div style="margin:22px 0">'
        '<div style="font-size:15px;font-weight:bold;color:#1c1c22;margin-bottom:8px">Miracurl Suite — Plans &amp; Pricing</div>'
        '<table style="border-collapse:collapse;width:100%;max-width:480px;font-size:14px;color:#333;border:1px solid #eee;border-radius:10px">'
        f'{rows}</table>'
        f'<div style="font-size:12px;color:#777;margin-top:8px">{foot}</div>'
        '</div>')


_OUTREACH_FOOTER_LINKS = (("", "🌐 Website"), ("/features", "Features"), ("/pricing", "Pricing"),
                          ("/about-us", "About Us"), ("/contact-us", "Contact"))


def _outreach_tracking_pixel(base: str, lead_id: str) -> str:
    if not lead_id:
        return ""
    return (f'<img src="{base}/api/public/lead-track/{lead_id}/open.png" '
            'width="1" height="1" style="display:block;width:1px;height:1px" alt="" />')


def _outreach_paragraphs(body: str) -> str:
    return "".join(f'<p style="font-size:14px;color:#3a3a40;line-height:1.8;margin:0 0 15px">{_html.escape(p)}</p>'
                   for p in body.split("\n") if p.strip())


def _outreach_footer_html(base: str, vert: str) -> str:
    links = "".join(f'<a href="{base}{path}" style="color:#b08d3f;text-decoration:none;font-size:12px;margin:0 9px">{label}</a>'
                    for path, label in _OUTREACH_FOOTER_LINKS)
    return f"""
        <div style="border-top:1px solid #e6ddc8;padding:14px 34px;text-align:center;background:#f7f2e7">{links}</div>
        <div style="background:#1c1c22;padding:16px 34px;text-align:center">
          <a href="{base}" style="text-decoration:none"><span style="color:#e8c37f;font-size:15px;letter-spacing:2px">MIRACURL ✦ SUITE</span></a>
          <div style="color:#8a8a92;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin-top:3px">Mira — your AI {vert} partner</div>
          <div style="margin-top:6px"><a href="{base}" style="color:#b08d3f;font-size:11px;text-decoration:none">miracurl-suite.com</a></div>
        </div>"""


def _outreach_email_html(lead: dict, plans: dict) -> str:
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    lead_id = lead.get("id", "")
    vert = "restaurant" if (lead.get("vertical") or "salon") == "restaurant" else "salon"
    hero = "mira-outreach-hero-restaurant.png" if vert == "restaurant" else "mira-outreach-hero.png"
    brochure = "brochure-restaurant" if vert == "restaurant" else "brochure"
    pricing = _pricing_table_html(_plans_for(plans, _lead_intl(lead.get("city")), vert))
    return f"""
    <div style="background:#efe9dc;padding:28px 12px;font-family:Georgia,serif">
      <div style="max-width:600px;margin:0 auto;background:#fdfbf7;border:1px solid #e6ddc8;border-radius:18px;overflow:hidden;box-shadow:0 10px 34px rgba(28,28,34,.14)">
        <img src="{base}/assets/{hero}" alt="Miracurl Suite — Mira, your AI {vert} partner" width="600" style="width:100%;display:block" />
        <div style="height:3px;background:linear-gradient(90deg,#b08d3f,#e8c37f,#b08d3f)"></div>
        <div style="padding:30px 34px 4px">{_outreach_paragraphs(lead.get("email_body") or "")}</div>
        <div style="padding:0 34px">{pricing}</div>
        <div style="padding:2px 34px 20px">
          <a href="{base}/demo" style="display:inline-block;background:#1c1c22;color:#e8c37f;text-decoration:none;padding:13px 32px;border-radius:999px;font-size:14px;letter-spacing:.6px">Book a free live demo ✦</a>
          <p style="font-size:12px;color:#8a8474;margin:16px 0 0">📖 <a href="{base}/api/public/{brochure}.pdf" style="color:#b08d3f">View the full brochure</a> — it covers every module of Miracurl Suite.</p>
        </div>{_outreach_footer_html(base, vert)}
      </div>
      {_outreach_tracking_pixel(base, lead_id)}
      {_unsub_footer(lead_id)}
    </div>"""


def _lead_reply_to() -> str | None:
    """Replies land on the Resend inbound domain so the webhook can flag 🔥 Replied."""
    return os.environ.get("LEAD_REPLY_INBOX") or None


def _unsub_url(lead_id: str) -> str:
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    return f"{base}/api/public/lead-unsubscribe/{lead_id}"


def _lead_headers(lead_id: str) -> dict:
    """One-click unsubscribe headers (RFC 8058) — required by Gmail/Yahoo bulk-sender rules."""
    return {"List-Unsubscribe": f"<{_unsub_url(lead_id)}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"}


def _unsub_footer(lead_id: str) -> str:
    addr = os.environ.get("BUSINESS_POSTAL_ADDR", "Miracurl · Marathahalli, Bengaluru, KA, India")
    return (f'<p style="font-size:11px;color:#9a9aa2;text-align:center;margin:14px 0 0;font-family:Georgia,serif">'
            f'{_html.escape(addr)} · '
            f'<a href="{_unsub_url(lead_id)}" style="color:#9a9aa2">Unsubscribe</a></p>')


async def log_mira_event(kind: str, text: str) -> None:
    """Append to Mira's Memory Timeline (shown on Mira Home). Best-effort."""
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz
    from database import _raw_db as _db
    try:
        await _db.mira_timeline.insert_one({
            "id": str(_uuid.uuid4()), "kind": kind, "text": text[:300],
            "created_at": _dt.now(_tz.utc).isoformat()})
    except Exception:
        pass


# ---------------- shared by lead_gen + mira_outreach (keeps the import graph one-directional) ----------------
OUTREACH_SETTINGS_KEY = "mira_outreach"
HOOKS: dict = {}  # mira_outreach registers "auto_reply" here; lead_gen calls it without importing mira_outreach

OUTREACH_DEFAULTS = {"enabled": True, "daily_email_limit": 100, "per_cycle": 10, "min_score": 30,
             "verticals": ["salon", "restaurant"], "wa_countries": ["91"], "auto_hunt": True, "hunts_per_day": 2,
             "hunt_countries": ["IN", "AE", "UK", "US", "SG", "AU", "CA"], "start_hour": 9, "end_hour": 18,
             # targeting: growing businesses (recently opened, < max_reviews Google reviews) + luxury salons
             "max_reviews": 300, "include_luxury": True,
             # reminder cadence for leads that never replied: day 7 → day 14 → day 30 → every 90 days
             "followup_days": [7, 7, 16, 90],
             # Boss's wording instructions per vertical — appended to Mira's pitch prompt
             "pitch_notes": {"salon": "", "restaurant": ""},
             # A/B subject-line test: each drafted pitch carries two subjects; sends split 50/50 by lead id
             "ab_test": True,
             # Mira answers lead replies herself (demo invite) instead of waiting for the Boss to tap Send
             "auto_reply": True}


async def outreach_settings() -> dict:
    from database import _raw_db
    doc = await _raw_db.platform_settings.find_one({"key": OUTREACH_SETTINGS_KEY}, {"_id": 0}) or {}
    return {k: doc.get(k, v) for k, v in OUTREACH_DEFAULTS.items()}


_LUXURY_RE = re.compile(r"\b(luxury|luxe|premium|royal|elite|signature|prestige|boutique|spa|lounge|couture|imperial|platinum|grand)\b", re.I)


def is_luxury(lead: dict) -> bool:
    text = f"{lead.get('name') or ''} {lead.get('category') or ''} {lead.get('summary') or ''}"
    return bool(_LUXURY_RE.search(text)) or (float(lead.get("rating") or 0) >= 4.8 and int(lead.get("reviews") or 0) >= 1000)


def segment_of(lead: dict, max_reviews: int) -> str:
    if int(lead.get("reviews") or 0) < max_reviews:
        return "growing"
    return "luxury" if is_luxury(lead) else "other"


async def ensure_subject_b(lead: dict) -> dict:
    """Older drafts have only one subject — ask Mira for the alternate-angle variant once and store it."""
    if lead.get("email_subject_b") or not lead.get("email_subject") or not lead.get("id"):
        return lead
    from routes.mira_common import _ask_json
    from database import _raw_db
    noun = "restaurant" if (lead.get("vertical") or "salon") == "restaurant" else "salon"
    try:
        out = await _ask_json(
            "You write scroll-stopping B2B email subject lines.",
            f"{noun.capitalize()}: {lead.get('name')} ({lead.get('city')}), rating {lead.get('rating')}, {lead.get('reviews')} reviews. "
            f"Current subject (variant A): {lead['email_subject']}\nWrite variant B with a DIFFERENT angle (money/time/FOMO if A is a "
            'compliment, or vice versa), personalized, exactly ONE emoji, max 60 chars. Return JSON: {"subject_b": "..."}')
        b = str(out.get("subject_b") or "").strip()[:120]
    except Exception:  # noqa: BLE001 — A/B is a nice-to-have, never block a send
        b = ""
    if b and b != lead["email_subject"]:
        lead["email_subject_b"] = b
        await _raw_db.mira_leads.update_one({"id": lead["id"]}, {"$set": {"email_subject_b": b}})
    return lead


def pick_subject(lead: dict, ab_enabled: bool = True) -> tuple[str, str]:
    """(subject, variant). Deterministic 50/50 split on the lead id so retries keep the same variant."""
    a = lead.get("email_subject") or "Miracurl Suite — free demo"
    b = lead.get("email_subject_b") or ""
    if not ab_enabled or not b:
        return a, "A" if b else ""
    try:
        odd = int(str(lead.get("id") or "0")[-1], 16) % 2 == 1
    except ValueError:
        odd = False
    return (b, "B") if odd else (a, "A")


def _has_real_inbox(email: str) -> bool:
    """False when follow-ups would be skipped: no email, login-only @miracurl.com, or a placeholder domain."""
    from email_service import _is_login_only
    e = (email or "").strip().lower()
    if not e or "@" not in e or _is_login_only(e):
        return False
    return e.rpartition("@")[2] not in ("example.com", "example.org", "test.com", "email.com", "domain.com")
