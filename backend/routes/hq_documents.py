"""HQ Documents Center — policy/overview PDFs generated on demand, plus combined platform earnings."""
import asyncio
import base64
import calendar
import html as html_lib
import logging
import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from pydantic import BaseModel, Field

from database import _raw_db
from email_service import _send_email
from security import public_base_url, public_rate_limit, require_super_admin

router = APIRouter()

from services.hq_docs import DOCS, _PDF_GOLD, _PDF_INK, _PDF_GREY, _doc_pdf, _pdf_doc_header, _pdf_doc_sections  # noqa: E402,F401


@router.get("/super-admin/documents")
async def list_documents(user=Depends(require_super_admin)):
    return {"documents": [
        {"key": k, "title": d["title"], "subtitle": d["subtitle"], "description": d["description"]}
        for k, d in DOCS.items()]}


@router.get("/super-admin/documents/{key}/pdf")
async def document_pdf(key: str, user=Depends(require_super_admin)):
    doc = DOCS.get(key)
    if not doc:
        raise HTTPException(404, "Document not found")
    pdf = await asyncio.to_thread(_doc_pdf, doc)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="miracurl-{key.replace("_", "-")}.pdf"'})


def _last_n_months(n: int) -> list:
    now = datetime.now(timezone.utc)
    months, y, m = [], now.year, now.month
    for _ in range(n):
        months.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    months.reverse()
    return months


async def _monthly_sums(coll, flt: dict, months: list) -> dict:
    """Sum `amount` per YYYY-MM (keyed on paid_at, falling back to created_at)."""
    sums = {mo: 0.0 for mo in months}
    async for rec in coll.find(flt, {"_id": 0, "amount": 1, "paid_at": 1, "created_at": 1}):
        mo = (rec.get("paid_at") or rec.get("created_at") or "")[:7]
        if mo in sums:
            sums[mo] += float(rec.get("amount") or 0)
    return sums


@router.get("/super-admin/earnings")
async def platform_earnings(user=Depends(require_super_admin)):
    """Combined platform income — subscriptions + placement fees, last 6 months."""
    months = _last_n_months(6)
    subs = await _monthly_sums(_raw_db.subscription_payments, {"status": {"$nin": ["created", "failed"]}}, months)
    fees = await _monthly_sums(_raw_db.placement_fees, {"status": "paid"}, months)
    series = [{"month": mo, "label": calendar.month_abbr[int(mo[5:7])],
               "subscriptions": round(subs[mo], 2), "placement_fees": round(fees[mo], 2)}
              for mo in months]
    due_fees = 0.0
    async for f in _raw_db.placement_fees.find({"status": "due"}, {"_id": 0, "amount": 1}):
        due_fees += float(f.get("amount") or 0)
    return {"series": series,
            "totals": {"subscriptions": round(sum(subs.values()), 2),
                       "placement_fees": round(sum(fees.values()), 2),
                       "combined": round(sum(subs.values()) + sum(fees.values()), 2),
                       "placement_fees_due": round(due_fees, 2)}}


@router.get("/public/brochure.pdf")
async def public_brochure_pdf(request: Request):
    """Public Suite brochure — linked from outreach emails instead of attaching PDFs."""
    await public_rate_limit(request, "public-brochure", limit=30, window_sec=600)
    from services.brochure import build_brochure_pdf
    pdf = await asyncio.to_thread(build_brochure_pdf, "salon")
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": 'inline; filename="miracurl-salon-suite.pdf"'})


def suite_overview_attachment() -> dict:
    """Resend attachment dict for the Suite Overview PDF (welcome-email brochure)."""
    pdf = _doc_pdf(DOCS["suite_overview"])
    return {"filename": "miracurl-suite-overview.pdf",
            "content": base64.b64encode(pdf).decode()}


def _all_doc_attachments(vertical: str = "salon") -> list:
    """TWO polished PDFs: the visual App Tour + the Onboarding & Policies handbook."""
    from services.brochure import build_tour_pdf, build_policies_pdf
    vert = "restaurant" if vertical == "restaurant" else "salon"
    return [
        {"filename": f"miracurl-{vert}-app-tour.pdf",
         "content": base64.b64encode(build_tour_pdf(vert)).decode()},
        {"filename": f"miracurl-{vert}-onboarding-policies.pdf",
         "content": base64.b64encode(build_policies_pdf(vert)).decode()},
    ]


async def _live_plans() -> list:
    from routes.subscriptions import load_plan_overrides, PLAN_CATALOG
    try:
        await load_plan_overrides()
        return [{"key": k, **v} for k, v in PLAN_CATALOG.items()]
    except Exception:
        return []


def _demo_note_block(note: str) -> str:
    if not note.strip():
        return ""
    return f"""
        <tr><td style="padding:0 36px 22px">
          <div style="background:#fdf8ec;border:1px solid #ecdcae;border-radius:12px;padding:16px 20px;font-size:14px;color:#5d5340;line-height:1.6">
            {html_lib.escape(note.strip())}
          </div>
        </td></tr>"""


def _demo_module(icon, title, desc):
    return f"""
        <td width="50%" valign="top" style="padding:10px 12px">
          <div style="font-size:22px;line-height:1">{icon}</div>
          <div style="font-family:Georgia,serif;font-size:15px;color:#1d1d24;margin-top:6px;font-weight:bold">{title}</div>
          <div style="font-size:12.5px;color:#6c6c78;line-height:1.55;margin-top:4px">{desc}</div>
        </td>"""


_DEMO_AGENTS = [
    ("🧠", "AI Orchestrator", "the central brain coordinating every agent"),
    ("📱", "Social Media Agent", "daily posts &amp; flyers, on autopilot"),
    ("🎥", "Video Creator Agent", "promo videos generated for you"),
    ("💬", "WhatsApp Agent", "confirmations, win-backs &amp; campaigns"),
    ("📧", "Email Marketing Agent", "birthday offers &amp; lapsed-client nudges"),
    ("🔍", "Lead Finder Agent", "captures &amp; qualifies new enquiries"),
    ("🌐", "SEO Agent", "your Google-indexed public salon page"),
    ("⭐", "Google Business Agent", "review replies, automatically"),
    ("👥", "Staff Verification Agent", "Aadhaar-verified registry &amp; ID cards"),
    ("📊", "Analytics Agent", "weekly &amp; monthly business digests"),
    ("💼", "Sales Agent", "answers your customers 24/7"),
    ("📝", "Content Writer Agent", "offers, captions &amp; descriptions"),
]


def _demo_agents_block() -> str:
    agent_rows = ""
    for i in range(0, len(_DEMO_AGENTS), 2):
        cells = ""
        for icon, title, desc in _DEMO_AGENTS[i:i + 2]:
            cells += f"""
            <td width="50%" valign="top" style="padding:7px 12px">
              <div style="font-size:13px;color:#f4f1e8"><span style="font-size:15px">{icon}</span>
                <b style="font-family:Georgia,serif;letter-spacing:.3px">&nbsp;{title}</b></div>
              <div style="font-size:11.5px;color:#a49d8e;line-height:1.5;margin-top:2px;padding-left:24px">{desc}</div>
            </td>"""
        agent_rows += f"<tr>{cells}</tr>"
    return f"""
  <tr><td style="padding:10px 24px 6px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#15151b;border-radius:14px">
      <tr><td style="padding:20px 14px 6px 24px">
        <div style="font-size:11px;letter-spacing:2px;color:#d4af37;font-weight:bold">MEET YOUR AI TEAM</div>
        <div style="font-family:Georgia,serif;font-size:17px;color:#f4f1e8;margin-top:5px">
          12 specialist AI agents, working for your salon around the clock</div>
      </td></tr>
      {agent_rows}
      <tr><td colspan="2" style="padding:8px 24px 18px">
        <div style="font-size:11.5px;color:#8f8798;line-height:1.5">Each agent quietly handles its own job — you simply run your salon, and Mira runs the rest.</div>
      </td></tr>
    </table>
  </td></tr>"""


def _demo_pricing_row(p: dict) -> str:
    months = max(1, round((p.get("duration_days") or 30) / 30))
    per_mo = (p.get("price") or 0) / months
    return f"""
        <tr>
          <td style="padding:10px 16px;border-top:1px solid #eee9dc;font-size:13.5px;color:#33333b"><b>{html_lib.escape(str(p.get('label', '')))}</b>
            <div style="font-size:11px;color:#9a948a">{months} month{'s' if months > 1 else ''} · up to {p.get('branches', 1)} branch{'es' if (p.get('branches') or 1) > 1 else ''}</div></td>
          <td align="right" style="padding:10px 16px;border-top:1px solid #eee9dc;font-size:15px;color:#1d1d24"><b>₹{round(p.get('price') or 0):,}</b>
            <div style="font-size:11px;color:#9a948a">≈ ₹{round(per_mo):,}/month</div></td>
        </tr>"""


_INTL_TLDS = {"uk", "ae", "us", "ca", "au", "nz", "sg", "ie", "de", "fr", "eu", "qa",
              "sa", "om", "bh", "kw", "hk", "my", "za", "ch", "nl", "it", "es"}


def _is_intl_email(email: str) -> bool:
    tld = (email or "").rsplit(".", 1)[-1].lower().strip()
    return tld in _INTL_TLDS


_INTL_TIER_FEATURES = {
    "starter": "Booking, CRM, POS, WhatsApp reminders",
    "professional": "+ Inventory, Payroll, Analytics, Multi-staff",
    "premium": "+ Mira AI, AI Marketing, Review Automation",
}


def _usd_tier_row(tier: str, key: str, usd: dict) -> str:
    mo = (usd.get(f"{key}_monthly") or {}).get("price")
    if not mo:
        return ""
    half = (usd.get(f"{key}_half") or {}).get("price")
    yr = (usd.get(f"{key}_annual") or {}).get("price")
    tier_key = "premium" if "Premium" in tier else tier.lower()
    return f"""
        <tr>
          <td style="padding:10px 16px;border-top:1px solid #eee9dc;font-size:13.5px;color:#33333b"><b>{tier}</b>
            <div style="font-size:11px;color:#9a948a">{_INTL_TIER_FEATURES.get(tier_key, '')}</div></td>
          <td align="right" style="padding:10px 16px;border-top:1px solid #eee9dc;font-size:15px;color:#1d1d24"><b>${round(mo):,}/mo</b>
            <div style="font-size:11px;color:#9a948a">6&nbsp;months ${round(half or mo * 6):,} · 1&nbsp;year ${round(yr or mo * 12):,}</div></td>
        </tr>"""


def _usd_pricing_rows(plans: list) -> str:
    usd = {p["key"]: p for p in plans if p.get("currency") == "USD"}
    rows = "".join(_usd_tier_row(tier, key, usd)
                   for tier, key in (("Starter", "intl_starter"), ("Professional", "intl_pro"), ("Premium AI", "intl_premium")))
    ent = (usd.get("intl_enterprise_monthly") or {}).get("price") or 499
    rows += f"""
        <tr>
          <td style="padding:10px 16px;border-top:1px solid #eee9dc;font-size:13.5px;color:#33333b"><b>Enterprise</b>
            <div style="font-size:11px;color:#9a948a">Multi-branch chains · custom contracts</div></td>
          <td align="right" style="padding:10px 16px;border-top:1px solid #eee9dc;font-size:15px;color:#1d1d24"><b>from ${round(ent):,}/mo</b></td>
        </tr>"""
    return rows


def _usd_resto_rows(plans: list) -> str:
    usd = {p["key"]: p for p in plans if p.get("currency") == "USD"}
    labels = (("3 Months", "resto_intl_quarter", ""), ("6 Months", "resto_intl_half", "Most popular"),
              ("1 Year", "resto_intl_annual", "First month FREE"))
    rows = ""
    for label, key, note in labels:
        price = (usd.get(key) or {}).get("price")
        if not price:
            continue
        rows += f"""
        <tr>
          <td style="padding:10px 16px;border-top:1px solid #eee9dc;font-size:13.5px;color:#33333b"><b>{label}</b>
            <div style="font-size:11px;color:#9a948a">{note}</div></td>
          <td align="right" style="padding:10px 16px;border-top:1px solid #eee9dc;font-size:15px;color:#1d1d24"><b>${round(price):,}</b></td>
        </tr>"""
    return rows


def _demo_pricing_rows_tail(plans: list, currency: str, vertical: str) -> tuple[str, str]:
    if currency == "USD":
        rows = _usd_resto_rows(plans) if vertical == "restaurant" else _usd_pricing_rows(plans)
        noun = "restaurants" if vertical == "restaurant" else "salons"
        return rows, f"All features included. Prices in USD for international {noun} — billed via secure payment link."
    show = [p for p in plans if (p.get("branches") or 1) == 1 and p.get("currency", "INR") == "INR"] or plans[:2]
    return "".join(_demo_pricing_row(p) for p in show), (
        "All features included in every plan — POS, bookings, CRM and the full 12-agent AI team. "
        "Multi-branch plans also available — ask us in the demo.")


def _demo_pricing_block(plans: list | None, currency: str = "INR", vertical: str = "salon", trial_days: int = 30) -> str:
    plans = [p for p in (plans or []) if (p.get("vertical") or "salon") == vertical]
    if not plans:
        return ""
    rows, tail = _demo_pricing_rows_tail(plans, currency, vertical)
    trial_txt = "FREE first month" if vertical == "restaurant" else f"{trial_days}-day free trial"
    return f"""
  <tr><td style="padding:14px 36px 4px">
    <div style="font-size:11px;letter-spacing:2px;color:#9a8f6d;font-weight:bold">SIMPLE, HONEST PRICING</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;background:#fdfcf8;border:1px solid #eee9dc;border-radius:12px;overflow:hidden">
      <tr><td colspan="2" style="padding:12px 16px;font-size:12.5px;color:#55555f;line-height:1.6">
        Start with a <b>{trial_txt}</b> — no card, no commitment. Then choose the plan that fits:</td></tr>
      {rows}
      <tr><td colspan="2" style="padding:10px 16px;border-top:1px solid #eee9dc;font-size:11px;color:#9a948a">{tail}</td></tr>
    </table>
  </td></tr>"""


def _demo_modules_block() -> str:
    m = _demo_module
    return f"""
  <tr><td style="padding:8px 24px 4px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>{m("📅", "Appointments &amp; 24/7 Online Booking", "Your own public booking page with Mira, the AI receptionist — customers book even while you sleep.")}
          {m("🧾", "Smart POS &amp; GST Billing", "Fast counter billing, e-receipts by email &amp; SMS, coupons, memberships and loyalty points.")}</tr>
      <tr>{m("✨", "Mira AI Marketing Studio", "Daily social posts, promo videos, flash offers and win-back campaigns — created for you, automatically.")}
          {m("👥", "Verified Staff &amp; Hiring", "Aadhaar-verified staff registry, QR ID cards and a curated hiring marketplace when you need talent.")}</tr>
      <tr>{m("📊", "Reports &amp; Weekly Digests", "Revenue analytics, staff leaderboards and business summaries delivered to your inbox.")}
          {m("🔐", "Secure &amp; Multi-branch", "Bank-grade security, per-salon data isolation, and every branch under one account.")}</tr>
    </table>
  </td></tr>"""


def _demo_footer_blocks(hq_email: str) -> str:
    return f"""
  <tr><td style="padding:22px 36px 6px">
    <div style="background:#f7f6f2;border-radius:12px;padding:16px 20px">
      <div style="font-size:12px;letter-spacing:1.5px;color:#9a8f6d;font-weight:bold">📎 ATTACHED FOR YOU</div>
      <div style="font-size:13px;color:#55555f;line-height:1.7;margin-top:6px">
        Complete Suite Overview &nbsp;·&nbsp; Sales Brochure with real app screenshots &nbsp;·&nbsp; Onboarding Policy &nbsp;·&nbsp; Hiring Policy &nbsp;·&nbsp; Terms &amp; Conditions —
        everything you need to review at leisure, before we ever speak.</div>
    </div>
  </td></tr>
  <tr><td style="padding:20px 36px 30px">
    <p style="font-size:14px;color:#55555f;line-height:1.7;margin:0">
      Thank you so much for your time — we'd be honoured to show you what Miracurl can do for your salon.</p>
    <p style="font-size:14px;color:#33333b;line-height:1.7;margin:12px 0 0">Warm regards,<br>
      <b style="font-family:Georgia,serif">The Miracurl Team</b><br>
      <span style="font-size:12px;color:#8f8798">miracurl-suite.com · {html_lib.escape(hq_email)}</span></p>
  </td></tr>
  <tr><td style="background:#15151b;padding:16px 36px;text-align:center">
    <div style="color:#6d675c;font-size:11px">© Miracurl Suite — sent with care from Miracurl HQ. If this isn't relevant, simply ignore this email.</div>
  </td></tr>"""


def _demo_email_links(hq_email: str, tracking: tuple) -> tuple:
    """(cta_href, signup_href, open-pixel) for a demo invite email."""
    track_base, invite_id = tracking
    mailto = (f"mailto:{hq_email}?subject=Demo%20request%20—%20Miracurl%20Suite"
              f"&body=Hi%20Miracurl%20team%2C%0A%0AI%27d%20love%20a%20demo%20of%20the%20Miracurl%20Salon%20Suite."
              f"%0AMy%20preferred%20time%3A%20%0AMy%20salon%3A%20%0APhone%3A%20%0A%0AThank%20you!")
    cta_href = f"{track_base}/api/public/demo-track/{invite_id}/click" if (track_base and invite_id) else mailto
    pixel = (f'<img src="{track_base}/api/public/demo-track/{invite_id}/open.png" width="1" height="1" '
             f'style="display:block;width:1px;height:1px;border:0" alt="">') if (track_base and invite_id) else ""
    return cta_href, "https://miracurl-suite.com/signup-salon", pixel


def _demo_subject(resto: bool, trial_days: int) -> str:
    return ("Your Restaurant's FREE First Month of Miracurl Suite 🍽️" if resto
            else f"Your Salon's {trial_days}-Day Free Trial of Miracurl Suite ✦")


def _demo_email_copy(resto: bool, trial_days: int = 30) -> tuple[str, str, str, str, str]:
    """(sub_brand, hero, intro, trial_line, cta_label) — vertical-specific wording."""
    if resto:
        return (
            "THE ALL-IN-ONE RESTAURANT SUITE",
            'Your restaurant&rsquo;s <span style="color:#d4af37">FREE first month</span><br>of Miracurl Suite.',
            "We'd love for you to experience the <b>Miracurl Restaurant Suite</b> — QR table ordering straight "
            "to the kitchen, live kitchen tickets, one-tap table-wise billing, reservations and Mira, your AI "
            "teammate that paints dish photos and runs your marketing.",
            "<b>Start your FREE first month today</b> — set up your restaurant yourself in under 5 minutes, "
            "no credit card needed, and take table orders tonight.",
            "Start my FREE first month ✦",
        )
    return (
        "THE ALL-IN-ONE SALON SUITE",
        f'Your salon&rsquo;s <span style="color:#d4af37">{trial_days}-day free trial</span><br>of Miracurl Suite.',
        "We'd love for you to experience the <b>Miracurl Salon Suite</b> — the all-in-one platform trusted by "
        "growing salons to manage bookings, billing, staff and marketing from a single elegant dashboard.",
        f"<b>Start your own {trial_days}-day free trial today</b> — set up your salon yourself in under 5 minutes, "
        "no credit card needed, and explore everything at your own pace.",
        f"Start my {trial_days}-day free trial ✦",
    )


@dataclass
class DemoEmailOpts:
    plans: list | None = None
    tracking: tuple = ("", "")
    currency: str = "INR"
    vertical: str = "salon"
    trial_days: int = 30


def _demo_email_html(recipient_name: str, salon_name: str, note: str, hq_email: str,
                     opts: DemoEmailOpts | None = None) -> str:
    opts = opts or DemoEmailOpts()
    resto = opts.vertical == "restaurant"
    name = html_lib.escape(recipient_name or "").strip()
    salon = html_lib.escape(salon_name or "").strip()
    greeting = f"Dear {name}," if name else ("Dear Restaurant Owner," if resto else "Dear Salon Owner,")
    salon_line = f" at <b>{salon}</b>" if salon else ""
    cta_href, signup_href, pixel = _demo_email_links(hq_email, opts.tracking)
    if resto:
        signup_href = signup_href.replace("signup-salon", "signup-restaurant")
    sub_brand, hero, intro, trial_line, cta_label = _demo_email_copy(resto, opts.trial_days)

    return f"""<!doctype html><html><body style="margin:0;padding:0;background:#f2f0eb">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0eb;padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,.08)">
  <tr><td style="background:#15151b;padding:34px 36px 30px">
    <div style="font-family:Georgia,serif;font-size:26px;letter-spacing:4px;color:#d4af37">MIRACURL</div>
    <div style="color:#b9b2a3;font-size:12px;letter-spacing:2.5px;margin-top:5px">{sub_brand}</div>
    <div style="height:2px;width:64px;background:#d4af37;margin-top:16px"></div>
    <div style="font-family:Georgia,serif;color:#f4f1e8;font-size:21px;margin-top:18px;line-height:1.4">
      {hero}</div>
  </td></tr>
  <tr><td style="padding:30px 36px 8px">
    <p style="font-size:15px;color:#33333b;line-height:1.7;margin:0 0 14px">{greeting}</p>
    <p style="font-size:14px;color:#55555f;line-height:1.75;margin:0 0 14px">
      We hope this message finds you and your team{salon_line} doing wonderfully.
      {intro}</p>
    <p style="font-size:14px;color:#55555f;line-height:1.75;margin:0">
      {trial_line}</p>
  </td></tr>
  {_demo_note_block(note)}
  {"" if resto else _demo_modules_block()}
  {"" if resto else _demo_agents_block()}
  {_demo_pricing_block(opts.plans, opts.currency, opts.vertical, opts.trial_days)}
  <tr><td align="center" style="padding:26px 36px 8px">
    <a href="{signup_href}" style="display:inline-block;background:#d4af37;color:#15151b;font-size:15px;font-weight:bold;
       text-decoration:none;padding:15px 42px;border-radius:999px;letter-spacing:.4px">{cta_label}</a>
    <div style="margin-top:16px">
      <a href="{cta_href}" style="display:inline-block;border:1.5px solid #d4af37;color:#8a6d1a;font-size:13px;font-weight:bold;
         text-decoration:none;padding:11px 30px;border-radius:999px;letter-spacing:.3px">Prefer a guided tour? Request a demo →</a>
    </div>
    <div style="font-size:12px;color:#8f8798;margin-top:12px">Or simply reply to this email with a day &amp; time that suits you — we'll fit around your schedule.</div>
  </td></tr>
  {_demo_footer_blocks(hq_email)}
</table>
</td></tr></table>{pixel}</body></html>"""


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class DemoRecipient(BaseModel):
    email: str = Field(..., max_length=120)
    name: str = Field(default="", max_length=80)
    salon_name: str = Field(default="", max_length=100)


class DemoCampaignIn(BaseModel):
    recipients: list[DemoRecipient] = Field(..., min_length=1, max_length=100)
    note: str = Field(default="", max_length=600)
    subject: str = Field(default="", max_length=140)
    currency: str = Field(default="auto")  # auto | INR | USD
    vertical: str = Field(default="salon", pattern="^(salon|restaurant)$")
    template: str = Field(default="demo", pattern="^(demo|founder)$")


# ── Founder's personal invitation (6 months free, sent worldwide by the super admin) ──
FOUNDER = {"name": "Bablu Kumar", "title": "Founder, Miracurl", "email": "admin@miracurl-suite.com",
           "phone": "+91 91802 61256", "site": "miracurl-suite.com", "url": "https://miracurl-suite.com"}
FOUNDER_INVITE_TRIAL_DAYS = 180
FOUNDER_SUBJECT = "A personal invitation from Miracurl’s founder"


def _first_name(name: str) -> str:
    n = (name or "").strip()
    return html_lib.escape(n.split(" ")[0]) if n else ""


def _greeting(name: str) -> str:
    first = _first_name(name)
    return f"Hi {first}," if first else "Hi there,"


def _tracking_bits(tracking: tuple) -> tuple[str, str]:
    """(open pixel html, click url) — falls back to the public site when no tracking id is known."""
    track_base, invite_id = tracking
    if not (track_base and invite_id):
        return "", FOUNDER["url"]
    pixel = (f'<img src="{track_base}/api/public/demo-track/{invite_id}/open.png" width="1" height="1" '
             f'style="display:block;width:1px;height:1px;border:0" alt="">')
    return pixel, f"{track_base}/api/public/demo-track/{invite_id}/click"


def _founder_note_html(note: str) -> str:
    if not (note or "").strip():
        return ""
    return (f'<tr><td style="padding:0 40px 18px"><div style="background:#fdf8ec;border-left:3px solid #d4af37;'
            f'border-radius:0 12px 12px 0;padding:14px 18px;font-size:14px;color:#5d5340;line-height:1.65;font-style:italic">'
            f'{html_lib.escape(note.strip())}</div></td></tr>')


def _founder_gift_block() -> str:
    """The 6-months-free gift card (static)."""
    return """  <tr><td style="padding:4px 40px 10px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#15151b;border-radius:16px;overflow:hidden">
      <tr><td style="padding:26px 28px;text-align:center">
        <div style="font-size:11px;letter-spacing:3px;color:#b9b2a3">🎁 &nbsp;A GIFT FOR YOUR SALON</div>
        <div style="font-family:Georgia,serif;font-size:34px;color:#d4af37;margin-top:10px;line-height:1.1">6 MONTHS</div>
        <div style="font-family:Georgia,serif;font-size:19px;color:#f4f1e8;margin-top:4px;letter-spacing:1px">COMPLETELY FREE</div>
        <div style="height:1px;width:72px;background:#d4af37;margin:16px auto"></div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto"><tr>
          <td style="color:#e8e2d3;font-size:12.5px;padding:0 10px">✓ No payment</td>
          <td style="color:#e8e2d3;font-size:12.5px;padding:0 10px">✓ No credit card</td>
          <td style="color:#e8e2d3;font-size:12.5px;padding:0 10px">✓ No obligation</td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>"""


def _founder_signature_block() -> str:
    tel = FOUNDER["phone"].replace(" ", "")
    return f"""  <tr><td style="padding:6px 40px 30px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td valign="top" style="padding-right:16px">
        <div style="width:54px;height:54px;border-radius:50%;background:#15151b;color:#d4af37;font-family:Georgia,serif;font-size:22px;line-height:54px;text-align:center">{FOUNDER["name"][0]}</div></td>
      <td valign="top">
        <div style="font-family:Georgia,serif;font-size:19px;color:#15151b">{FOUNDER["name"]}</div>
        <div style="font-size:12px;letter-spacing:1.5px;color:#9a8f6d;margin-top:2px">{FOUNDER["title"].upper()}</div>
        <div style="font-size:12.5px;color:#55555f;line-height:1.9;margin-top:8px">
          📧 <a href="mailto:{FOUNDER["email"]}" style="color:#55555f;text-decoration:none">{FOUNDER["email"]}</a><br>
          📱 <a href="tel:{tel}" style="color:#55555f;text-decoration:none">{FOUNDER["phone"]}</a><br>
          🌐 <a href="{FOUNDER["url"]}" style="color:#8a6d1a;text-decoration:none">{FOUNDER["site"]}</a></div></td>
    </tr></table>
  </td></tr>"""


_FOUNDER_LETTERHEAD = """  <tr><td style="background:#15151b;padding:26px 40px 22px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td><div style="font-family:Georgia,serif;font-size:22px;letter-spacing:4px;color:#d4af37">MIRACURL</div>
          <div style="color:#b9b2a3;font-size:11px;letter-spacing:2.5px;margin-top:4px">A NOTE FROM THE FOUNDER</div></td>
      <td align="right" valign="middle"><div style="display:inline-block;border:1px solid #d4af37;color:#d4af37;font-size:10.5px;letter-spacing:1.5px;padding:6px 12px;border-radius:999px">PERSONAL INVITATION</div></td>
    </tr></table>
  </td></tr>"""


def _founder_cta_and_signoff(explore: str, p: str) -> str:
    return f"""  <tr><td align="center" style="padding:10px 40px 8px">
    <a href="{explore}" style="display:inline-block;background:#d4af37;color:#15151b;font-size:15px;font-weight:bold;
       text-decoration:none;padding:15px 44px;border-radius:999px;letter-spacing:.4px">Explore Miracurl Suite ✦</a>
    <div style="font-size:12.5px;color:#7d7668;margin-top:14px;line-height:1.6">Or simply reply to this email, and I’ll personally arrange
      a quick demonstration at a time convenient for you.</div>
  </td></tr>
  <tr><td style="padding:22px 40px 8px">
    <p {p}>Thank you for taking the time to read my message. I genuinely appreciate it.</p>
    <p {p} style="margin-bottom:0">Warm regards,</p>
  </td></tr>
{_founder_signature_block()}
  <tr><td style="background:#15151b;padding:14px 40px;text-align:center">
    <div style="color:#6d675c;font-size:11px">© Miracurl Suite · Built in India, for salons everywhere. If this isn’t relevant, simply ignore this email.</div>
  </td></tr>"""


def _founder_email_html(recipient_name: str, salon_name: str, note: str, tracking: tuple = ("", "")) -> str:
    salon = html_lib.escape((salon_name or "").strip())
    greeting = _greeting(recipient_name)
    came_across = f"I came across <b>{salon}</b>" if salon else "I came across your salon"
    pixel, explore = _tracking_bits(tracking)
    note_html = _founder_note_html(note)
    p = 'style="font-size:15px;color:#3a3a42;line-height:1.8;margin:0 0 16px;font-family:Georgia,\'Times New Roman\',serif"'
    return f"""<!doctype html><html><body style="margin:0;padding:0;background:#efece5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efece5;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fffdf9;border-radius:20px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;box-shadow:0 6px 30px rgba(20,18,12,.10)">
{_FOUNDER_LETTERHEAD}
  <tr><td style="padding:34px 40px 6px">
    <p {p}>{greeting}</p>
    <p {p}>I hope you’re having a wonderful day. 😊</p>
    <p {p}>I’m <b>{FOUNDER["name"]}</b>, founder of <b>Miracurl</b>, an all-in-one salon management platform built in India.</p>
    <p {p}>{came_across} and wanted to reach out personally. We’re currently looking to work with a small group of
      salon owners and professionals around the world, and I would genuinely value the opportunity to have you experience
      Miracurl and tell me what you think.</p>
  </td></tr>
  {note_html}
  <tr><td style="padding:0 40px 6px">
    <p {p}>Miracurl brings <b>bookings, POS &amp; billing, CRM, staff management, marketing, analytics</b> and
      <b>AI-powered salon tools</b> together in one platform.</p>
    <p {p}>But honestly, at this stage my biggest goal isn’t simply selling software. It’s earning the trust of salon
      owners and learning from real businesses so we can make Miracurl better.</p>
    <p {p} style="margin-bottom:6px">So I’d like to offer your salon:</p>
  </td></tr>
{_founder_gift_block()}
  <tr><td style="padding:16px 40px 6px">
    <p {p}>You can use Miracurl with your team and decide for yourself whether it genuinely adds value to your salon.</p>
    <p {p}>I’d be especially grateful for your <b>honest feedback</b> — even if there are things you don’t like.
      As a founder, that feedback is incredibly valuable to me.</p>
    <p {p} style="margin-bottom:8px">Would you be open to taking a quick look?</p>
  </td></tr>
{_founder_cta_and_signoff(explore, p)}
</table>
</td></tr></table>{pixel}</body></html>"""


@router.get("/super-admin/demo-campaign/recipients")
async def demo_campaign_recipients(user=Depends(require_super_admin)):
    """Prospect pool only — existing tenants (already partners) are excluded."""
    tenant_emails = set(await _raw_db.tenants.distinct("owner_email"))
    leads = await _raw_db.tenant_inquiries.find(
        {"email": {"$exists": True, "$ne": ""}},
        {"_id": 0, "name": 1, "email": 1, "salon_name": 1, "status": 1}).sort("created_at", -1).to_list(500)
    return {
        "leads": [{"name": ld.get("name", ""), "email": ld["email"],
                   "salon_name": ld.get("salon_name", ""), "status": ld.get("status", "")}
                  for ld in leads if ld["email"].lower() not in tenant_emails],
    }


def _dedupe_recipients(recipients: list) -> list:
    seen, targets = set(), []
    for r in recipients:
        em = r.email.strip().lower()
        if not _EMAIL_RE.match(em):
            raise HTTPException(400, f"Invalid email address: {r.email}")
        if em not in seen:
            seen.add(em)
            targets.append((em, r.name.strip(), r.salon_name.strip()))
    return targets


@dataclass
class _DemoSendCtx:
    body: object
    hq_email: str
    subject: str
    attachments: list
    plans: dict
    track_base: str
    trial_days: int = 30


async def _send_demo_invite(em: str, name: str, salon: str, ctx: _DemoSendCtx) -> dict:
    existing = await _raw_db.demo_invites.find_one({"email": em}, {"_id": 0, "id": 1})
    iid = existing["id"] if existing else str(uuid.uuid4())
    template = getattr(ctx.body, "template", "demo")
    if template == "founder":
        html = _founder_email_html(name, salon, ctx.body.note, tracking=(ctx.track_base, iid))
        status = await _send_email([em], ctx.subject, html, reply_to=ctx.hq_email,
                                   from_name=f"{FOUNDER['name']} · Miracurl")
    else:
        mode = getattr(ctx.body, "currency", "auto") or "auto"
        currency = mode if mode in ("INR", "USD") else ("USD" if _is_intl_email(em) else "INR")
        html = _demo_email_html(name, salon, ctx.body.note, ctx.hq_email,
                                DemoEmailOpts(plans=ctx.plans, tracking=(ctx.track_base, iid), currency=currency,
                                              vertical=getattr(ctx.body, "vertical", "salon"),
                                              trial_days=ctx.trial_days))
        status = await _send_email([em], ctx.subject, html, attachments=ctx.attachments, reply_to=ctx.hq_email)
    if status.get("sent"):
        now_iso = datetime.now(timezone.utc).isoformat()
        await _raw_db.demo_invites.update_one(
            {"email": em},
            {"$set": {"id": iid, "name": name, "salon_name": salon, "first_sent_at": now_iso,
                      "vertical": getattr(ctx.body, "vertical", "salon"), "template": template,
                      "reminder_sent_at": None, "responded": False, "track_base": ctx.track_base,
                      "opened_at": None, "demo_requested_at": None,
                      "seen_by_hq_open": True, "seen_by_hq_req": True}},
            upsert=True)
    return {"email": em, "sent": status.get("sent", False), "error": status.get("error")}


@router.post("/super-admin/demo-campaign/send")
async def demo_campaign_send(body: DemoCampaignIn, request: Request, user=Depends(require_super_admin)):
    targets = _dedupe_recipients(body.recipients)
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    resto = body.vertical == "restaurant"
    founder = body.template == "founder"
    from routes.subscriptions import get_trial_days
    trial_days = await get_trial_days()
    subject = body.subject.strip() or (FOUNDER_SUBJECT if founder else _demo_subject(resto, trial_days))
    if founder:
        attachments = []  # a personal letter — no brochures, just the founder's words
    elif resto:
        attachments = await asyncio.to_thread(_all_doc_attachments, "restaurant")
    else:
        attachments = await asyncio.to_thread(_all_doc_attachments)
    tenant_emails = set(await _raw_db.tenants.distinct("owner_email"))
    plans = await _live_plans()
    track_base = public_base_url(request)
    ctx = _DemoSendCtx(body=body, hq_email=hq_email, subject=subject, attachments=attachments,
                       plans=plans, track_base=track_base, trial_days=trial_days)

    results = []
    for em, name, salon in targets:
        if em in tenant_emails:
            results.append({"email": em, "sent": False, "error": "Already a Miracurl partner — skipped"})
            continue
        results.append(await _send_demo_invite(em, name, salon, ctx))

    sent_count = sum(1 for r in results if r["sent"])
    await _raw_db.demo_campaigns.insert_one({
        "id": str(uuid.uuid4()), "sent_by": user.get("email", ""),
        "subject": subject, "note": body.note, "template": body.template,
        "recipient_count": len(results), "sent_count": sent_count,
        "results": results, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"sent": sent_count, "failed": len(results) - sent_count, "results": results}


@router.get("/super-admin/demo-campaign/history")
async def demo_campaign_history(user=Depends(require_super_admin)):
    items = await _raw_db.demo_campaigns.find({}, {"_id": 0, "results": 0}).sort("created_at", -1).to_list(20)
    return {"campaigns": items}


@router.get("/super-admin/demo-campaign/preview", response_class=HTMLResponse)
async def demo_campaign_preview(template: str = "demo", vertical: str = "salon", name: str = "Priya",
                                salon_name: str = "Glow Studio", note: str = "", user=Depends(require_super_admin)):
    """Render the exact email HTML the campaign would send — for the HQ preview pane."""
    if template == "founder":
        return _founder_email_html(name, salon_name, note)
    if template == "founder_followup":
        return _founder_followup_html(name, salon_name)
    if template == "founder_nudge":
        return _founder_nudge_html(name, salon_name, "glow-studio", "owner@example.com")
    if template == "founder_feedback":
        return _founder_feedback_html(name, salon_name, os.environ.get("APP_PUBLIC_URL", FOUNDER["url"]).rstrip("/"), "preview-token")
    if template == "founder_expiry":
        return _founder_expiry_html(name, salon_name, "04 March 2027", 4000, 20000, "glow-studio")
    from routes.subscriptions import get_trial_days
    vert = "restaurant" if vertical == "restaurant" else "salon"
    return _demo_email_html(name, salon_name, note, os.environ.get("HQ_EMAIL", "admin@miracurl.com"),
                            DemoEmailOpts(plans=await _live_plans(), vertical=vert, trial_days=await get_trial_days()))


def _reminder_email_html(recipient_name: str, salon_name: str, hq_email: str,
                         track_base: str = "", invite_id: str = "") -> str:
    name = html_lib.escape(recipient_name or "").strip()
    salon = html_lib.escape(salon_name or "").strip()
    greeting = f"Dear {name}," if name else "Dear Salon Owner,"
    salon_ref = f" at {salon}" if salon else ""
    mailto = (f"mailto:{hq_email}?subject=Demo%20request%20—%20Miracurl%20Suite"
              f"&body=Hi%20Miracurl%20team%2C%0A%0AYes%2C%20I%27d%20like%20a%20demo."
              f"%0AMy%20preferred%20time%3A%20%0APhone%3A%20%0A%0AThank%20you!")
    cta_href = f"{track_base}/api/public/demo-track/{invite_id}/click" if (track_base and invite_id) else mailto
    pixel = (f'<img src="{track_base}/api/public/demo-track/{invite_id}/open.png" width="1" height="1" '
             f'style="display:block;width:1px;height:1px;border:0" alt="">') if (track_base and invite_id) else ""
    return f"""<!doctype html><html><body style="margin:0;padding:0;background:#f2f0eb">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0eb;padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,.08)">
  <tr><td style="background:#15151b;padding:28px 36px 24px">
    <div style="font-family:Georgia,serif;font-size:24px;letter-spacing:4px;color:#d4af37">MIRACURL</div>
    <div style="height:2px;width:56px;background:#d4af37;margin-top:12px"></div>
    <div style="font-family:Georgia,serif;color:#f4f1e8;font-size:19px;margin-top:14px;line-height:1.45">
      Just a gentle note — your demo seat is still open ✦</div>
  </td></tr>
  <tr><td style="padding:28px 36px 10px">
    <p style="font-size:15px;color:#33333b;line-height:1.7;margin:0 0 14px">{greeting}</p>
    <p style="font-size:14px;color:#55555f;line-height:1.75;margin:0 0 14px">
      A few days ago we sent you an invitation to see the <b>Miracurl Salon Suite</b> — and we completely
      understand how busy things get{salon_ref}. This is just one friendly nudge, and we promise it's the only one.</p>
    <p style="font-size:14px;color:#55555f;line-height:1.75;margin:0 0 14px">
      The demo is <b>20 minutes</b>, at any time you choose — bookings, billing, staff and a team of
      <b>12 specialist AI agents</b> (social posts, promo videos, WhatsApp, review replies and more)
      all in one calm dashboard. Salons like yours typically save <b>2 hours a day</b> after switching.</p>
    <p style="font-size:14px;color:#55555f;line-height:1.75;margin:0">
      If now isn't the right moment, no reply is needed at all — we'll leave you in peace.
      But if you're curious, we'd love to show you around.</p>
  </td></tr>
  <tr><td align="center" style="padding:24px 36px 10px">
    <a href="{cta_href}" style="display:inline-block;background:#d4af37;color:#15151b;font-size:15px;font-weight:bold;
       text-decoration:none;padding:14px 40px;border-radius:999px;letter-spacing:.4px">Yes, book my 20-minute demo ✦</a>
    <div style="font-size:12px;color:#8f8798;margin-top:12px">Or simply reply to this email with a day &amp; time that suits you.</div>
  </td></tr>
  <tr><td style="padding:18px 36px 28px">
    <p style="font-size:14px;color:#33333b;line-height:1.7;margin:0">Warm regards,<br>
      <b style="font-family:Georgia,serif">The Miracurl Team</b><br>
      <span style="font-size:12px;color:#8f8798">miracurl-suite.com · {html_lib.escape(hq_email)}</span></p>
  </td></tr>
  <tr><td style="background:#15151b;padding:14px 36px;text-align:center">
    <div style="color:#6d675c;font-size:11px">© Miracurl Suite — this is our one and only reminder. Ignore to opt out.</div>
  </td></tr>
</table>
</td></tr></table>{pixel}</body></html>"""


FOLLOWUP_AFTER_DAYS = 5
FOUNDER_FOLLOWUP_AFTER_DAYS = 7


def _founder_followup_html(recipient_name: str, salon_name: str, tracking: tuple = ("", "")) -> str:
    """7-day nudge in Bablu's voice for founder-letter recipients who opened but never replied."""
    greeting = _greeting(recipient_name)
    salon = html_lib.escape((salon_name or "").strip())
    salon_ref = f" for <b>{salon}</b>" if salon else ""
    pixel, explore = _tracking_bits(tracking)
    p = 'style="font-size:15px;color:#3a3a42;line-height:1.8;margin:0 0 16px;font-family:Georgia,\'Times New Roman\',serif"'
    return f"""<!doctype html><html><body style="margin:0;padding:0;background:#efece5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efece5;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fffdf9;border-radius:20px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;box-shadow:0 6px 30px rgba(20,18,12,.10)">
  <tr><td style="background:#15151b;padding:22px 40px 20px">
    <div style="font-family:Georgia,serif;font-size:20px;letter-spacing:4px;color:#d4af37">MIRACURL</div>
    <div style="color:#b9b2a3;font-size:11px;letter-spacing:2.5px;margin-top:4px">A QUICK FOLLOW-UP FROM THE FOUNDER</div>
  </td></tr>
  <tr><td style="padding:32px 40px 6px">
    <p {p}>{greeting}</p>
    <p {p}>Bablu here again — I wrote to you last week about Miracurl and the <b>6 months completely free</b> I’d love to
      set up{salon_ref}. I know how full a salon owner’s day is, so this is just one gentle nudge — and I promise it’s the only one.</p>
    <p {p}>The offer is exactly as I described: no payment, no credit card, no obligation. Use it with your team, and simply
      tell me what works and what doesn’t. That honest feedback is what I’m really after.</p>
    <p {p} style="margin-bottom:8px">If now isn’t the right time, no problem at all — just reply “later” and I’ll leave it there.</p>
  </td></tr>
  <tr><td align="center" style="padding:10px 40px 8px">
    <a href="{explore}" style="display:inline-block;background:#d4af37;color:#15151b;font-size:15px;font-weight:bold;
       text-decoration:none;padding:14px 42px;border-radius:999px;letter-spacing:.4px">Take a quick look ✦</a>
    <div style="font-size:12.5px;color:#7d7668;margin-top:14px;line-height:1.6">Or reply to this email and I’ll personally set things up for you.</div>
  </td></tr>
  <tr><td style="padding:22px 40px 30px">
    <p {p} style="margin-bottom:4px">Warm regards,</p>
    <div style="font-family:Georgia,serif;font-size:18px;color:#15151b;margin-top:6px">{FOUNDER["name"]}</div>
    <div style="font-size:12px;letter-spacing:1.5px;color:#9a8f6d;margin-top:2px">{FOUNDER["title"].upper()}</div>
    <div style="font-size:12.5px;color:#55555f;line-height:1.9;margin-top:8px">📧 {FOUNDER["email"]} &nbsp;·&nbsp; 📱 {FOUNDER["phone"]} &nbsp;·&nbsp;
      <a href="{FOUNDER["url"]}" style="color:#8a6d1a;text-decoration:none">{FOUNDER["site"]}</a></div>
  </td></tr>
  <tr><td style="background:#15151b;padding:14px 40px;text-align:center">
    <div style="color:#6d675c;font-size:11px">© Miracurl Suite · If this isn’t relevant, simply ignore this email — you won’t hear from me again.</div>
  </td></tr>
</table>
</td></tr></table>{pixel}</body></html>"""


async def _run_founder_followups(hq_email: str, tenant_emails: set) -> tuple[int, int]:
    """Founder-letter recipients who OPENED but never replied get one nudge in Bablu's voice after 7 days."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=FOUNDER_FOLLOWUP_AFTER_DAYS)).isoformat()
    sent = failed = 0
    async for inv in _raw_db.demo_invites.find(
            {"template": "founder", "responded": False, "reminder_sent_at": None,
             "opened_at": {"$nin": [None, ""]}, "first_sent_at": {"$lte": cutoff}}, {"_id": 0}):
        if inv["email"] in tenant_emails:
            continue
        base = inv.get("track_base") or os.environ.get("APP_PUBLIC_URL", "").rstrip("/")
        html = _founder_followup_html(inv.get("name", ""), inv.get("salon_name", ""), tracking=(base, inv["id"]))
        status = await _send_email([inv["email"]], "Just checking in — Bablu from Miracurl", html,
                                   reply_to=hq_email, from_name=f"{FOUNDER['name']} · Miracurl")
        if status.get("sent"):
            sent += 1
            await _raw_db.demo_invites.update_one(
                {"id": inv["id"]}, {"$set": {"reminder_sent_at": datetime.now(timezone.utc).isoformat()}})
        else:
            failed += 1
    return sent, failed


async def run_demo_followups() -> dict:
    """One gentle reminder per invitee, 5+ days after the invite, unless replied/converted.
    Founder-letter recipients get their own 7-day nudge (only if they opened the letter)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=FOLLOWUP_AFTER_DAYS)).isoformat()
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    tenant_emails = set(await _raw_db.tenants.distinct("owner_email"))
    salon_attachments = await asyncio.to_thread(_all_doc_attachments, "salon")
    resto_attachments = await asyncio.to_thread(_all_doc_attachments, "restaurant")
    sent, failed = await _run_founder_followups(hq_email, tenant_emails)
    skipped = 0
    async for inv in _raw_db.demo_invites.find(
            {"template": {"$ne": "founder"}, "responded": False, "reminder_sent_at": None,
             "first_sent_at": {"$lte": cutoff}}, {"_id": 0}):
        if inv["email"] in tenant_emails:
            await _raw_db.demo_invites.update_one(
                {"id": inv["id"]}, {"$set": {"responded": True, "converted": True}})
            skipped += 1
            continue
        html = _reminder_email_html(inv.get("name", ""), inv.get("salon_name", ""), hq_email,
                                    track_base=inv.get("track_base") or os.environ.get("APP_PUBLIC_URL", "").rstrip("/"),
                                    invite_id=inv["id"])
        status = await _send_email([inv["email"]],
                                   "A gentle reminder — your Miracurl demo seat is still open ✦",
                                   html,
                                   attachments=resto_attachments if inv.get("vertical") == "restaurant" else salon_attachments,
                                   reply_to=hq_email)
        if status.get("sent"):
            sent += 1
            await _raw_db.demo_invites.update_one(
                {"id": inv["id"]}, {"$set": {"reminder_sent_at": datetime.now(timezone.utc).isoformat()}})
        else:
            failed += 1
    return {"sent": sent, "failed": failed, "converted_skipped": skipped}


async def _send_slot_picker_email(inv: dict, base: str) -> dict:
    link = f"{base}/demo-slot/{inv['id']}"
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    name = html_lib.escape(inv.get("name") or "there")
    salon = html_lib.escape(inv.get("salon_name") or "your salon")
    html = f"""
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fffdf8;border:1px solid #eee9dc;border-radius:14px;padding:34px">
      <div style="font-size:11px;letter-spacing:3px;color:#9a8f6d;font-weight:bold">MIRACURL SUITE ✦ DEMO</div>
      <h2 style="color:#1d1d24;margin:14px 0 8px">Pick a time that suits you, {name} ✦</h2>
      <p style="font-size:14px;color:#3a3a40;line-height:1.8">We'd love to show you how Miracurl runs bookings, billing and AI marketing for {salon} — a quick 20-minute walkthrough, no commitment.</p>
      <p style="text-align:center;margin:26px 0">
        <a href="{link}" style="display:inline-block;background:#c9a35c;color:#191921;font-size:14px;font-weight:bold;text-decoration:none;padding:14px 38px;border-radius:999px">Choose my demo time ✦</a>
      </p>
      <p style="font-size:12px;color:#9a948a">Times are shown in your local timezone on the booking page. Prefer email? Just reply with a day &amp; time — {hq_email}</p>
      <img src="{base}/api/public/demo-track/{inv['id']}/open.png" width="1" height="1" style="display:block" alt="" />
    </div>"""
    status = await _send_email([inv["email"]], f"Pick your Miracurl demo time, {inv.get('name') or 'friend'} ✦",
                               html, reply_to=hq_email)
    if status.get("sent"):
        await _raw_db.demo_invites.update_one(
            {"id": inv["id"]}, {"$set": {"slot_picker_sent_at": datetime.now(timezone.utc).isoformat()}})
    return {"sent": status.get("sent", False), "error": status.get("error"), "link": link}


@router.post("/super-admin/demo-campaign/{iid}/send-slot-picker")
async def send_slot_picker(iid: str, request: Request, user=Depends(require_super_admin)):
    """Short 'pick your demo time' email with the personalized slot-picker link."""
    inv = await _raw_db.demo_invites.find_one({"id": iid}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invite not found")
    base = inv.get("track_base") or public_base_url(request)
    return await _send_slot_picker_email(inv, base)


_PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")


@router.get("/public/demo-track/{iid}/open.png")
async def demo_track_open(iid: str, request: Request):
    await public_rate_limit(request, "demo-open", limit=60, window_sec=600)
    await _raw_db.demo_invites.update_one(
        {"id": iid, "opened_at": None},
        {"$set": {"opened_at": datetime.now(timezone.utc).isoformat(), "seen_by_hq_open": False}})
    return Response(content=_PIXEL_PNG, media_type="image/png",
                    headers={"Cache-Control": "no-store, no-cache, must-revalidate"})


@router.get("/public/demo-track/{iid}/click")
async def demo_track_click(iid: str, request: Request):
    await public_rate_limit(request, "demo-click", limit=30, window_sec=600)
    now_iso = datetime.now(timezone.utc).isoformat()
    await _raw_db.demo_invites.update_one(
        {"id": iid, "opened_at": None}, {"$set": {"opened_at": now_iso, "seen_by_hq_open": False}})
    # NOTE: link fetches are often email security scanners, not humans —
    # "demo requested" is only set when the slot form is actually submitted.
    await _raw_db.demo_invites.update_one(
        {"id": iid, "clicked_at": None}, {"$set": {"clicked_at": now_iso}})
    inv = await _raw_db.demo_invites.find_one({"id": iid}, {"_id": 0, "track_base": 1})
    base = (inv or {}).get("track_base") or public_base_url(request)
    return RedirectResponse(f"{base}/demo-slot/{iid}", status_code=302)


@router.post("/super-admin/demo-campaign/mark-seen")
async def demo_campaign_mark_seen(user=Depends(require_super_admin)):
    await _raw_db.demo_invites.update_many(
        {"$or": [{"seen_by_hq_open": False}, {"seen_by_hq_req": False}]},
        {"$set": {"seen_by_hq_open": True, "seen_by_hq_req": True}})
    return {"ok": True}


@router.get("/super-admin/demo-calendar")
async def demo_calendar(user=Depends(require_super_admin)):
    """All booked demo slots — upcoming first, plus the last 30 days of past demos."""
    now_ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    cutoff_past = (now_ist.date() - timedelta(days=30)).isoformat()
    upcoming, past = [], []
    async for inv in _raw_db.demo_invites.find({"preferred_slot": {"$ne": None}}, {"_id": 0}):
        slot = inv.get("preferred_slot") or {}
        if not slot.get("date"):
            continue
        item = {"id": inv["id"], "name": inv.get("name", ""), "salon_name": inv.get("salon_name", ""),
                "city": inv.get("city", ""), "email": inv.get("email", ""),
                "phone": slot.get("phone") or inv.get("phone", ""),
                "date": slot["date"], "time": slot.get("time", ""),
                "source": inv.get("source", "invite"), "booked_at": slot.get("booked_at", ""),
                "gcal": _gcal_link(slot["date"], slot.get("time") or "11:00"),
                "done": bool(inv.get("demo_done"))}
        slot_dt = f"{slot['date']}T{slot.get('time') or '00:00'}"
        if slot_dt >= now_ist.strftime("%Y-%m-%dT%H:%M"):
            upcoming.append(item)
        elif slot["date"] >= cutoff_past:
            past.append(item)
    upcoming.sort(key=lambda i: (i["date"], i["time"]))
    past.sort(key=lambda i: (i["date"], i["time"]), reverse=True)
    today = now_ist.date().isoformat()
    return {"upcoming": upcoming, "past": past, "today": today,
            "today_count": sum(1 for i in upcoming if i["date"] == today)}


@router.post("/super-admin/demo-calendar/{iid}/done")
async def demo_mark_done(iid: str, user=Depends(require_super_admin)):
    res = await _raw_db.demo_invites.update_one({"id": iid}, {"$set": {"demo_done": True}})
    if not res.matched_count:
        raise HTTPException(404, "Demo not found")
    return {"ok": True}


def _invite_status(i: dict, tenant_emails: set) -> str:
    if i["email"] in tenant_emails:
        return "converted"
    # Genuine demo request = they actually submitted the slot form
    # (bare link clicks are often email security scanners).
    if i.get("preferred_slot") or i.get("demo_requested_at"):
        return "demo_requested"
    if i.get("responded"):
        return "replied"
    if i.get("reminder_sent_at"):
        return "reminded"
    return "awaiting"


async def _signup_map() -> dict:
    """owner_email(lower) → tenant signup details, for trial-tracking on invites."""
    out = {}
    async for t in _raw_db.tenants.find(
            {"owner_email": {"$exists": True, "$ne": ""}},
            {"_id": 0, "owner_email": 1, "name": 1, "slug": 1, "status": 1, "plan": 1,
             "created_at": 1, "trial_end_date": 1, "founder_nudge_sent_at": 1, "founder_first_login_at": 1,
             "founder_feedback_sent_at": 1, "founder_feedback": 1}):
        out[str(t["owner_email"]).lower()] = t
    return out


# ── Founder setup nudge: 6-months-free owners who never logged in (3 days) get one note from Bablu ──
FOUNDER_NUDGE_AFTER_DAYS = 3


def _founder_nudge_html(owner_name: str, salon_name: str, slug: str, email: str) -> str:
    greeting = _greeting(owner_name)
    salon = html_lib.escape(salon_name or "your salon")
    login = f"{FOUNDER['url']}/login?tenant={slug}"
    p = 'style="font-size:15px;color:#3a3a42;line-height:1.8;margin:0 0 16px;font-family:Georgia,\'Times New Roman\',serif"'
    return f"""<!doctype html><html><body style="margin:0;padding:0;background:#efece5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efece5;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fffdf9;border-radius:20px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;box-shadow:0 6px 30px rgba(20,18,12,.10)">
  <tr><td style="background:#15151b;padding:22px 40px 20px">
    <div style="font-family:Georgia,serif;font-size:20px;letter-spacing:4px;color:#d4af37">MIRACURL</div>
    <div style="color:#b9b2a3;font-size:11px;letter-spacing:2.5px;margin-top:4px">YOUR 6 MONTHS ARE READY · A NOTE FROM BABLU</div>
  </td></tr>
  <tr><td style="padding:32px 40px 6px">
    <p {p}>{greeting}</p>
    <p {p}>Bablu here. A few days ago I set up <b>{salon}</b> on Miracurl with your <b>6 months completely free</b> — and I noticed
      you haven’t had a chance to log in yet. Totally understandable; salon days are long.</p>
    <p {p}>Everything is waiting for you: your booking page, POS &amp; billing, staff, CRM and Mira’s AI tools. Your login is
      <b>{html_lib.escape(email)}</b> and the one-time password was in the welcome email. Can’t find it? Just reply “password”
      and I’ll reset it for you personally.</p>
    <p {p} style="margin-bottom:8px">If you’d prefer, I’m happy to jump on a 15-minute call and set up your services and staff together.</p>
  </td></tr>
  <tr><td align="center" style="padding:10px 40px 8px">
    <a href="{login}" style="display:inline-block;background:#d4af37;color:#15151b;font-size:15px;font-weight:bold;
       text-decoration:none;padding:14px 42px;border-radius:999px;letter-spacing:.4px">Open my salon ✦</a>
    <div style="font-size:12.5px;color:#7d7668;margin-top:14px;line-height:1.6">Your booking page: <a href="{FOUNDER['url']}/book/{slug}" style="color:#8a6d1a;text-decoration:none">{FOUNDER['site']}/book/{slug}</a></div>
  </td></tr>
  <tr><td style="padding:22px 40px 30px">
    <p {p} style="margin-bottom:4px">Warm regards,</p>
    <div style="font-family:Georgia,serif;font-size:18px;color:#15151b;margin-top:6px">{FOUNDER["name"]}</div>
    <div style="font-size:12px;letter-spacing:1.5px;color:#9a8f6d;margin-top:2px">{FOUNDER["title"].upper()}</div>
    <div style="font-size:12.5px;color:#55555f;line-height:1.9;margin-top:8px">📧 {FOUNDER["email"]} &nbsp;·&nbsp; 📱 {FOUNDER["phone"]}</div>
  </td></tr>
  <tr><td style="background:#15151b;padding:14px 40px;text-align:center">
    <div style="color:#6d675c;font-size:11px">© Miracurl Suite · Sent once — you won’t be nagged.</div>
  </td></tr>
</table>
</td></tr></table></body></html>"""


async def _owner_has_logged_in(owner_email: str) -> bool:
    u = await _raw_db.users.find_one({"email": owner_email}, {"_id": 0, "id": 1, "must_change_password": 1})
    if not u:
        return False
    if await _raw_db.sessions.count_documents({"user_id": u["id"]}, limit=1):
        return True
    return not u.get("must_change_password", False)


async def run_founder_setup_nudges() -> dict:
    """Founder-offer salons created 3+ days ago whose owner never logged in → one nudge in Bablu's voice."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=FOUNDER_NUDGE_AFTER_DAYS)).isoformat()
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    sent = failed = logged_in = 0
    async for t in _raw_db.tenants.find(
            {"signup_offer": "founder_6m", "founder_nudge_sent_at": {"$exists": False},
             "founder_first_login_at": {"$exists": False}, "created_at": {"$lte": cutoff}}, {"_id": 0}):
        owner_email = str(t.get("owner_email") or "").lower()
        if not owner_email:
            continue
        if await _owner_has_logged_in(owner_email):
            await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"founder_first_login_at": datetime.now(timezone.utc).isoformat()}})
            logged_in += 1
            continue
        u = await _raw_db.users.find_one({"email": owner_email}, {"_id": 0, "name": 1})
        html = _founder_nudge_html((u or {}).get("name", ""), t.get("name", ""), t.get("slug", ""), owner_email)
        status = await _send_email([owner_email], f"Your 6 months at Miracurl are waiting, {((u or {}).get('name') or 'friend').split(' ')[0]} ✦",
                                   html, reply_to=hq_email, from_name=f"{FOUNDER['name']} · Miracurl")
        if status.get("sent"):
            sent += 1
            await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"founder_nudge_sent_at": datetime.now(timezone.utc).isoformat()}})
        else:
            failed += 1
    return {"sent": sent, "failed": failed, "already_logged_in": logged_in}


@router.post("/super-admin/founder-replies/nudges/run")
async def founder_nudges_run(user=Depends(require_super_admin)):
    return await run_founder_setup_nudges()


# ── Founder feedback ask: 30 days in, Bablu asks "how is it going?" with a one-tap 1–5 rating ──
FOUNDER_FEEDBACK_AFTER_DAYS = 30
_STARS = {1: "Not for us", 2: "Needs work", 3: "It's okay", 4: "Good", 5: "Love it"}


def _founder_feedback_html(owner_name: str, salon_name: str, base: str, token: str) -> str:
    greeting = _greeting(owner_name)
    salon = html_lib.escape(salon_name or "your salon")
    p = 'style="font-size:15px;color:#3a3a42;line-height:1.8;margin:0 0 16px;font-family:Georgia,\'Times New Roman\',serif"'
    stars = "".join(
        f'<td style="padding:0 4px"><a href="{base}/api/public/founder-feedback/{token}/{n}" '
        f'style="display:block;width:78px;padding:12px 0;text-align:center;background:#15151b;border:1px solid #d4af37;border-radius:12px;text-decoration:none">'
        f'<div style="font-size:22px;line-height:1;color:#d4af37">★<span style="font-size:15px;vertical-align:2px"> {n}</span></div>'
        f'<div style="font-size:10px;color:#b9b2a3;margin-top:6px;letter-spacing:.3px;white-space:nowrap">{label}</div></a></td>'
        for n, label in _STARS.items())
    return f"""<!doctype html><html><body style="margin:0;padding:0;background:#efece5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efece5;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fffdf9;border-radius:20px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;box-shadow:0 6px 30px rgba(20,18,12,.10)">
  <tr><td style="background:#15151b;padding:22px 40px 20px">
    <div style="font-family:Georgia,serif;font-size:20px;letter-spacing:4px;color:#d4af37">MIRACURL</div>
    <div style="color:#b9b2a3;font-size:11px;letter-spacing:2.5px;margin-top:4px">ONE MONTH IN · A NOTE FROM BABLU</div>
  </td></tr>
  <tr><td style="padding:32px 40px 6px">
    <p {p}>{greeting}</p>
    <p {p}>Bablu here. It’s been about a month since <b>{salon}</b> joined Miracurl on the 6-months-free offer, and I promised
      I’d come back to ask the only question that matters to me: <b>how is it going?</b></p>
    <p {p} style="margin-bottom:10px">One tap is enough — pick the stars that feel honest. You can add a line afterwards if you like.</p>
  </td></tr>
  <tr><td align="center" style="padding:6px 24px 10px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>{stars}</tr></table>
  </td></tr>
  <tr><td style="padding:14px 40px 6px">
    <p {p}>Whatever you pick, thank you. If something is missing or annoying, tell me — that’s exactly what I’m building from.
      And if it’s working for you, I’d love to hear which part your team uses most.</p>
  </td></tr>
  <tr><td style="padding:10px 40px 30px">
    <p {p} style="margin-bottom:4px">Warm regards,</p>
    <div style="font-family:Georgia,serif;font-size:18px;color:#15151b;margin-top:6px">{FOUNDER["name"]}</div>
    <div style="font-size:12px;letter-spacing:1.5px;color:#9a8f6d;margin-top:2px">{FOUNDER["title"].upper()}</div>
    <div style="font-size:12.5px;color:#55555f;line-height:1.9;margin-top:8px">📧 {FOUNDER["email"]} &nbsp;·&nbsp; 📱 {FOUNDER["phone"]}</div>
  </td></tr>
  <tr><td style="background:#15151b;padding:14px 40px;text-align:center">
    <div style="color:#6d675c;font-size:11px">© Miracurl Suite · Sent once, one month in. Reply any time — it reaches me.</div>
  </td></tr>
</table>
</td></tr></table></body></html>"""


async def run_founder_feedback_asks() -> dict:
    """Founder-offer salons 30+ days old → one 'how is it going?' note with one-tap rating links."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=FOUNDER_FEEDBACK_AFTER_DAYS)).isoformat()
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    base = os.environ.get("APP_PUBLIC_URL", FOUNDER["url"]).rstrip("/")
    sent = failed = 0
    async for t in _raw_db.tenants.find(
            {"signup_offer": "founder_6m", "founder_feedback_sent_at": {"$exists": False},
             "status": {"$nin": ["cancelled"]}, "created_at": {"$lte": cutoff}}, {"_id": 0}):
        owner_email = str(t.get("owner_email") or "").lower()
        if not owner_email:
            continue
        token = t.get("founder_feedback_token") or uuid.uuid4().hex
        u = await _raw_db.users.find_one({"email": owner_email}, {"_id": 0, "name": 1})
        first = ((u or {}).get("name") or "friend").split(" ")[0]
        html = _founder_feedback_html((u or {}).get("name", ""), t.get("name", ""), base, token)
        status = await _send_email([owner_email], f"One month in — how is it going, {first}?", html,
                                   reply_to=hq_email, from_name=f"{FOUNDER['name']} · Miracurl")
        if status.get("sent"):
            sent += 1
            await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {
                "founder_feedback_token": token, "founder_feedback_sent_at": datetime.now(timezone.utc).isoformat()}})
        else:
            failed += 1
    return {"sent": sent, "failed": failed}


async def _founder_invite_counts() -> dict:
    q = {"template": "founder"}
    return {"sent": await _raw_db.demo_invites.count_documents(q),
            "opened": await _raw_db.demo_invites.count_documents({**q, "opened_at": {"$nin": [None, ""]}}),
            "replied": await _raw_db.demo_invites.count_documents(
                {**q, "$or": [{"responded": True}, {"replied_at": {"$exists": True}}]})}


async def _mark_founder_first_logins(tenants: list) -> int:
    """Back-fill founder_first_login_at from the users collection; returns how many have logged in."""
    for t in tenants:
        if not t.get("founder_first_login_at") and await _owner_has_logged_in(str(t.get("owner_email") or "").lower()):
            await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"founder_first_login_at": datetime.now(timezone.utc).isoformat()}})
            t["founder_first_login_at"] = "now"
    return sum(bool(t.get("founder_first_login_at")) for t in tenants)


def _founder_salon_row(t: dict) -> dict:
    return {"name": t["name"], "slug": t["slug"], "status": t.get("status"), "trial_end_date": t.get("trial_end_date"),
            "logged_in": bool(t.get("founder_first_login_at")), "rating": (t.get("founder_feedback") or {}).get("rating")}


@router.get("/super-admin/founder-funnel")
async def founder_funnel(user=Depends(require_super_admin)):
    """Founder-offer funnel: letters sent → replied → live (6 months set up) → logged in → rated."""
    tenants = await _raw_db.tenants.find({"signup_offer": "founder_6m", "status": {"$ne": "cancelled"}},
                                         {"_id": 0, "id": 1, "name": 1, "slug": 1, "owner_email": 1, "status": 1,
                                          "founder_first_login_at": 1, "founder_feedback": 1, "trial_end_date": 1}).to_list(500)
    logged_in = await _mark_founder_first_logins(tenants)
    ratings = [int(t["founder_feedback"]["rating"]) for t in tenants if (t.get("founder_feedback") or {}).get("rating")]
    return {**await _founder_invite_counts(), "live": len(tenants), "logged_in": logged_in,
            "rated": len(ratings), "avg_rating": round(sum(ratings) / len(ratings), 1) if ratings else None,
            "paid": sum(1 for t in tenants if t.get("status") == "active"),
            "salons": [_founder_salon_row(t) for t in tenants]}


@router.post("/super-admin/founder-replies/feedback/run")
async def founder_feedback_run(user=Depends(require_super_admin)):
    return await run_founder_feedback_asks()


# ── Founder expiry offer: 30 days before the 6 months end, a founding-member discount to go paid ──
FOUNDER_EXPIRY_DAYS_BEFORE = 30
FOUNDING_MEMBER_DISCOUNT_PCT = 20


async def _founding_member_credit(t: dict) -> tuple[float, float, str]:
    """(credit ₹, annual price ₹, currency) — 20 % of the annual plan for this vertical."""
    plans = {p["key"]: p for p in await _live_plans()}
    key = "resto_annual" if t.get("business_type") == "restaurant" else "annual"
    price = float((plans.get(key) or {}).get("price") or 0)
    return round(price * FOUNDING_MEMBER_DISCOUNT_PCT / 100), price, (plans.get(key) or {}).get("currency", "INR")


def _founder_expiry_html(owner_name: str, salon_name: str, end_date: str, credit: float, price: float, slug: str) -> str:
    greeting = _greeting(owner_name)
    salon = html_lib.escape(salon_name or "your salon")
    pay = f"{FOUNDER['url']}/login?tenant={slug}&next=/settings%23subscription"
    p = 'style="font-size:15px;color:#3a3a42;line-height:1.8;margin:0 0 16px;font-family:Georgia,\'Times New Roman\',serif"'
    return f"""<!doctype html><html><body style="margin:0;padding:0;background:#efece5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efece5;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fffdf9;border-radius:20px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;box-shadow:0 6px 30px rgba(20,18,12,.10)">
  <tr><td style="background:#15151b;padding:22px 40px 20px">
    <div style="font-family:Georgia,serif;font-size:20px;letter-spacing:4px;color:#d4af37">MIRACURL</div>
    <div style="color:#b9b2a3;font-size:11px;letter-spacing:2.5px;margin-top:4px">FOUNDING MEMBER · A NOTE FROM BABLU</div>
  </td></tr>
  <tr><td style="padding:32px 40px 6px">
    <p {p}>{greeting}</p>
    <p {p}>Bablu here. Your 6 free months at Miracurl for <b>{salon}</b> come to an end on <b>{end_date}</b> — thank you for being
      one of the first salons to trust us. Your feedback shaped what Miracurl is today.</p>
    <p {p}>I’d love for you to stay, so I’ve added a <b>founding-member credit</b> to your account. It applies automatically at checkout —
      nothing to type, no coupon codes.</p>
  </td></tr>
  <tr><td style="padding:4px 40px 10px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#15151b;border-radius:16px;overflow:hidden">
      <tr><td style="padding:24px 28px;text-align:center">
        <div style="font-size:11px;letter-spacing:3px;color:#b9b2a3">🎖 FOUNDING MEMBER · {FOUNDING_MEMBER_DISCOUNT_PCT}% OFF</div>
        <div style="font-family:Georgia,serif;font-size:34px;color:#d4af37;margin-top:10px;line-height:1.1">₹{credit:,.0f} credit</div>
        <div style="font-size:13px;color:#f4f1e8;margin-top:6px">Annual plan ₹{price:,.0f} → <b>₹{max(price - credit, 0):,.0f}</b> for your first paid year</div>
        <div style="height:1px;width:72px;background:#d4af37;margin:14px auto"></div>
        <div style="color:#e8e2d3;font-size:12px">Already in your account · applied automatically · valid till {end_date}</div>
      </td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding:16px 40px 8px">
    <a href="{pay}" style="display:inline-block;background:#d4af37;color:#15151b;font-size:15px;font-weight:bold;
       text-decoration:none;padding:14px 42px;border-radius:999px;letter-spacing:.4px">Continue with Miracurl ✦</a>
    <div style="font-size:12.5px;color:#7d7668;margin-top:14px;line-height:1.6">Prefer to talk first? Just reply — I’ll call you personally.</div>
  </td></tr>
  <tr><td style="padding:18px 40px 30px">
    <p {p} style="margin-bottom:4px">With gratitude,</p>
    <div style="font-family:Georgia,serif;font-size:18px;color:#15151b;margin-top:6px">{FOUNDER["name"]}</div>
    <div style="font-size:12px;letter-spacing:1.5px;color:#9a8f6d;margin-top:2px">{FOUNDER["title"].upper()}</div>
    <div style="font-size:12.5px;color:#55555f;line-height:1.9;margin-top:8px">📧 {FOUNDER["email"]} &nbsp;·&nbsp; 📱 {FOUNDER["phone"]}</div>
  </td></tr>
  <tr><td style="background:#15151b;padding:14px 40px;text-align:center">
    <div style="color:#6d675c;font-size:11px">© Miracurl Suite · Sent once, a month before your free period ends.</div>
  </td></tr>
</table>
</td></tr></table></body></html>"""


async def run_founder_expiry_offers() -> dict:
    """Founder-offer salons whose free 6 months end within 30 days → founding-member credit + Bablu's note (once)."""
    today = datetime.now(timezone.utc).date().isoformat()
    horizon = (datetime.now(timezone.utc) + timedelta(days=FOUNDER_EXPIRY_DAYS_BEFORE)).date().isoformat()
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    sent = failed = 0
    async for t in _raw_db.tenants.find(
            {"signup_offer": "founder_6m", "status": "trial", "founder_expiry_offer_sent_at": {"$exists": False},
             "trial_end_date": {"$gte": today, "$lte": horizon}}, {"_id": 0}):
        owner_email = str(t.get("owner_email") or "").lower()
        credit, price, _cur = await _founding_member_credit(t)
        if not owner_email or credit <= 0:
            continue
        # Atomic claim first so a concurrent run (scheduler + HQ button) can never credit twice
        claimed = await _raw_db.tenants.find_one_and_update(
            {"id": t["id"], "founder_expiry_offer_sent_at": {"$exists": False}},
            {"$set": {"founder_expiry_offer_sent_at": datetime.now(timezone.utc).isoformat(),
                      "founder_offer_credit": credit, "founder_discount_pct": FOUNDING_MEMBER_DISCOUNT_PCT},
             "$inc": {"affiliate_credits": credit}})
        if not claimed:
            continue
        u = await _raw_db.users.find_one({"email": owner_email}, {"_id": 0, "name": 1})
        end_label = datetime.fromisoformat(t["trial_end_date"]).strftime("%d %B %Y")
        html = _founder_expiry_html((u or {}).get("name", ""), t.get("name", ""), end_label, credit, price, t.get("slug", ""))
        status = await _send_email([owner_email], f"A founding-member thank-you before your 6 months end, {((u or {}).get('name') or 'friend').split(' ')[0]} ✦",
                                   html, reply_to=hq_email, from_name=f"{FOUNDER['name']} · Miracurl")
        if status.get("sent"):
            sent += 1
        else:
            failed += 1
            await _raw_db.tenants.update_one({"id": t["id"]}, {  # roll back so tomorrow's run retries
                "$unset": {"founder_expiry_offer_sent_at": "", "founder_offer_credit": "", "founder_discount_pct": ""},
                "$inc": {"affiliate_credits": -credit}})
    return {"sent": sent, "failed": failed}


@router.post("/super-admin/founder-replies/expiry/run")
async def founder_expiry_run(user=Depends(require_super_admin)):
    return await run_founder_expiry_offers()


def _feedback_page(title: str, body: str, form: str = "") -> str:
    return f"""<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title></head>
<body style="margin:0;background:#efece5;font-family:Georgia,serif;color:#1d1d24">
<div style="max-width:520px;margin:48px auto;background:#fffdf9;border-radius:20px;padding:36px 32px;box-shadow:0 6px 30px rgba(20,18,12,.10);text-align:center">
  <div style="font-size:18px;letter-spacing:4px;color:#d4af37">MIRACURL</div>
  <h2 style="margin:18px 0 8px;font-weight:normal">{title}</h2>
  <p style="font-size:15px;line-height:1.7;color:#3a3a42">{body}</p>{form}
  <p style="font-size:12px;color:#9a948a;margin-top:22px">— {FOUNDER["name"]}, {FOUNDER["title"]}</p>
</div></body></html>"""


@router.get("/public/founder-feedback/{token}/{rating}", response_class=HTMLResponse)
async def founder_feedback_rate(token: str, rating: int, request: Request):
    """Landing page only — the rating is persisted by the confirm POST (a prefetching mail scanner can't rate)."""
    await public_rate_limit(request, "founder-feedback", limit=20, window_sec=600)
    t = await _raw_db.tenants.find_one({"founder_feedback_token": token}, {"_id": 0, "id": 1, "name": 1})
    if not t or not 1 <= rating <= 5:
        return _feedback_page("This link isn’t valid", "The feedback link may have expired — just reply to Bablu’s email instead.")
    form = (f'<form method="post" action="/api/public/founder-feedback/{token}" style="margin-top:18px">'
            f'<input type="hidden" name="rating" value="{rating}">'
            f'<textarea name="comment" maxlength="600" rows="3" placeholder="Anything you’d like Bablu to know? (optional)" '
            f'style="width:100%;box-sizing:border-box;border:1px solid #ddd3b8;border-radius:12px;padding:12px;font-family:inherit;font-size:14px"></textarea>'
            f'<button type="submit" style="margin-top:12px;background:#d4af37;border:0;border-radius:999px;padding:12px 32px;font-weight:bold;color:#15151b;cursor:pointer">Confirm {"★" * rating} &amp; send to Bablu ✦</button></form>')
    return _feedback_page(f"{'★' * rating} — “{_STARS[rating]}”", f"One more tap to confirm your {rating}/5 for <b>{html_lib.escape(t['name'])}</b>. Add a line if you like.", form)


@router.post("/public/founder-feedback/{token}", response_class=HTMLResponse)
async def founder_feedback_comment(token: str, request: Request):
    await public_rate_limit(request, "founder-feedback-comment", limit=10, window_sec=600)
    form = await request.form()
    comment = str(form.get("comment") or "").strip()[:600]
    try:
        rating = int(form.get("rating") or 0)
    except ValueError:
        rating = 0
    t = await _raw_db.tenants.find_one({"founder_feedback_token": token}, {"_id": 0, "id": 1, "name": 1, "founder_feedback": 1})
    if not t or not 1 <= rating <= 5:
        return _feedback_page("This link isn’t valid", "Just reply to Bablu’s email instead.")
    fb = {"rating": rating, "comment": comment, "at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"founder_feedback": fb}})
    from routes.lead_common import log_mira_event
    await log_mira_event("result", f"⭐ {t['name']} rated their first month {rating}/5 ({_STARS[rating]}) on Bablu's feedback ask.")
    if comment:
        await log_mira_event("alert", f"💬 {t['name']} wrote to Bablu: “{comment[:140]}”")
    return _feedback_page(f"{'★' * rating} — thank you!", f"Your {rating}/5 (“{_STARS[rating]}”) for <b>{html_lib.escape(t['name'])}</b> reached Bablu. He reads every one personally.")


def _annotate_signup(i: dict, su: dict | None) -> None:
    """Attach the tenant that signed up from this invite (if any) and promote status to trial_started."""
    if not su:
        return
    i["signup"] = {"salon": su.get("name"), "slug": su.get("slug"), "tenant_status": su.get("status"),
                   "plan": su.get("plan"), "signed_up_at": su.get("created_at"), "trial_end_date": su.get("trial_end_date")}
    if su.get("status") == "trial":
        i["status"] = "trial_started"


def _annotate_staleness(i: dict, has_signup: bool, stale_cutoff: str, purge_cutoff: str) -> None:
    """Engagement flags: resend suggestion, stale-no-reply, and purge candidates (never seen, never replied)."""
    waiting = i["status"] in ("awaiting", "reminded")
    first_sent = i.get("first_sent_at") or ""
    stale = first_sent <= stale_cutoff
    i["resend_suggested"] = waiting and not i["opened"] and stale
    i["stale_no_reply"] = waiting and i["opened"] and stale
    never_engaged = not i["opened"] and not i["clicked"] and not i.get("preferred_slot") and not has_signup
    i["stale_unseen"] = waiting and never_engaged and first_sent <= purge_cutoff


def _annotate_invite(i: dict, signups: dict, tenant_emails: set, stale_cutoff: str, purge_cutoff: str) -> None:
    """Derive status / engagement flags for one invite row (in place)."""
    i["status"] = _invite_status(i, tenant_emails)
    su = signups.get(i["email"])
    _annotate_signup(i, su)
    i["opened"] = bool(i.get("opened_at"))
    i["clicked"] = bool(i.get("clicked_at"))
    _annotate_staleness(i, bool(su), stale_cutoff, purge_cutoff)


@router.get("/super-admin/demo-campaign/invites")
async def demo_invites(user=Depends(require_super_admin)):
    signups = await _signup_map()
    items = await _raw_db.demo_invites.find({}, {"_id": 0}).sort("first_sent_at", -1).to_list(200)
    now = datetime.now(timezone.utc)
    stale_cutoff = (now - timedelta(days=FOLLOWUP_AFTER_DAYS)).isoformat()
    purge_cutoff = (now - timedelta(days=STALE_INVITE_DAYS)).isoformat()
    for i in items:
        _annotate_invite(i, signups, set(signups.keys()), stale_cutoff, purge_cutoff)
    return {"invites": items, "followup_after_days": FOLLOWUP_AFTER_DAYS,
            "stale_unseen": sum(1 for i in items if i.get("stale_unseen"))}


STALE_INVITE_DAYS = 15


def _stale_unseen_query() -> dict:
    """Invites older than 15 days that nobody ever engaged with — safe to purge to keep the DB lean."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=STALE_INVITE_DAYS)).isoformat()
    return {"first_sent_at": {"$lte": cutoff},
            "$and": [{"$or": [{"opened_at": None}, {"opened_at": {"$exists": False}}]},
                     {"$or": [{"clicked_at": None}, {"clicked_at": {"$exists": False}}]},
                     {"$or": [{"demo_requested_at": None}, {"demo_requested_at": {"$exists": False}}]},
                     {"$or": [{"preferred_slot": None}, {"preferred_slot": {"$exists": False}}]},
                     {"responded": {"$ne": True}}, {"demo_done": {"$ne": True}}]}


@router.delete("/super-admin/demo-campaign/invites-stale")
async def demo_invites_purge_stale(user=Depends(require_super_admin)):
    """Permanently delete never-seen invites older than 15 days (converted/signed-up owners are kept)."""
    tenant_emails = set(await _raw_db.tenants.distinct("owner_email"))
    q = _stale_unseen_query()
    if tenant_emails:
        q["email"] = {"$nin": list(tenant_emails)}
    res = await _raw_db.demo_invites.delete_many(q)
    return {"ok": True, "deleted": res.deleted_count}


@router.delete("/super-admin/demo-campaign/invites/{iid}")
async def demo_invite_delete(iid: str, user=Depends(require_super_admin)):
    res = await _raw_db.demo_invites.delete_one({"id": iid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Invite not found")
    return {"ok": True}


async def _send_invite_email(inv: dict, track_base: str, hq_email: str) -> dict:
    """Send the right template (founder letter vs demo invite) for an existing invite record."""
    if inv.get("template") == "founder":
        html = _founder_email_html(inv.get("name", ""), inv.get("salon_name", ""), "", tracking=(track_base, inv["id"]))
        return await _send_email([inv["email"]], FOUNDER_SUBJECT, html, reply_to=hq_email,
                                 from_name=f"{FOUNDER['name']} · Miracurl")
    from routes.subscriptions import get_trial_days
    inv_vert = inv.get("vertical") or "salon"
    trial_days = await get_trial_days()
    plans = await _live_plans()
    attachments = await asyncio.to_thread(_all_doc_attachments, inv_vert)
    html = _demo_email_html(inv.get("name", ""), inv.get("salon_name", ""), "", hq_email,
                            DemoEmailOpts(plans=plans, tracking=(track_base, inv["id"]),
                                          currency="USD" if _is_intl_email(inv["email"]) else "INR",
                                          vertical=inv_vert, trial_days=trial_days))
    return await _send_email([inv["email"]], _demo_subject(inv_vert == "restaurant", trial_days),
                             html, attachments=attachments, reply_to=hq_email)


@router.post("/super-admin/demo-campaign/invites/{iid}/resend")
async def demo_invite_resend(iid: str, request: Request, user=Depends(require_super_admin)):
    inv = await _raw_db.demo_invites.find_one({"id": iid}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invite not found")
    if inv["email"] in set(await _raw_db.tenants.distinct("owner_email")):
        raise HTTPException(400, "Already a Miracurl partner")
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    track_base = public_base_url(request) or inv.get("track_base") or ""
    status = await _send_invite_email(inv, track_base, hq_email)
    if not status.get("sent"):
        raise HTTPException(500, status.get("error") or "Send failed")
    now_iso = datetime.now(timezone.utc).isoformat()
    await _raw_db.demo_invites.update_one(
        {"id": iid},
        {"$set": {"first_sent_at": now_iso, "reminder_sent_at": None, "responded": False,
                  "opened_at": None, "demo_requested_at": None, "track_base": track_base,
                  "seen_by_hq_open": True, "seen_by_hq_req": True,
                  "resent_at": now_iso, "resend_count": (inv.get("resend_count") or 0) + 1}})
    return {"ok": True}


@router.post("/super-admin/demo-campaign/invites/{iid}/mark-replied")
async def demo_invite_mark_replied(iid: str, user=Depends(require_super_admin)):
    inv = await _raw_db.demo_invites.find_one({"id": iid}, {"_id": 0, "responded": 1})
    if not inv:
        raise HTTPException(404, "Invite not found")
    new_val = not inv.get("responded", False)
    await _raw_db.demo_invites.update_one({"id": iid}, {"$set": {"responded": new_val}})
    return {"responded": new_val}


@router.post("/super-admin/demo-campaign/followups/run")
async def demo_followups_run(user=Depends(require_super_admin)):
    return await run_demo_followups()


# ── Demo slot scheduling ─────────────────────────────────────────────────────

DEMO_SLOT_TIMES = ["11:00", "12:00", "13:00", "15:00", "16:00", "17:00", "18:00", "19:00"]


def _slot_utc(date_str: str, time_str: str):
    ist_start = datetime.fromisoformat(f"{date_str}T{time_str}:00")
    return ist_start - timedelta(hours=5, minutes=30)


def _gcal_link(date_str: str, time_str: str) -> str:
    from urllib.parse import urlencode
    start = _slot_utc(date_str, time_str)
    end = start + timedelta(minutes=30)
    fmt = "%Y%m%dT%H%M%SZ"
    return "https://calendar.google.com/calendar/render?" + urlencode({
        "action": "TEMPLATE",
        "text": "Miracurl Suite — Live Demo (20 min)",
        "dates": f"{start.strftime(fmt)}/{end.strftime(fmt)}",
        "details": "Your personalised walkthrough of the Miracurl Salon Suite — bookings, POS, staff and the 12-agent AI team. The Miracurl team will call/connect at this time.",
        "location": "Online / phone call",
    })


def _slot_ics(date_str: str, time_str: str, attendee_email: str) -> str:
    start = _slot_utc(date_str, time_str)
    end = start + timedelta(minutes=30)
    fmt = "%Y%m%dT%H%M%SZ"
    hq = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    return ("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Miracurl Suite//Demo//EN\r\nMETHOD:REQUEST\r\n"
            "BEGIN:VEVENT\r\n"
            f"UID:{uuid.uuid4()}@miracurl-suite.com\r\n"
            f"DTSTAMP:{datetime.now(timezone.utc).strftime(fmt)}\r\n"
            f"DTSTART:{start.strftime(fmt)}\r\nDTEND:{end.strftime(fmt)}\r\n"
            "SUMMARY:Miracurl Suite — Live Demo (20 min)\r\n"
            "DESCRIPTION:Your personalised walkthrough of the Miracurl Salon Suite.\r\n"
            f"ORGANIZER;CN=Miracurl Team:mailto:{hq}\r\n"
            f"ATTENDEE;CN=Prospect;RSVP=TRUE:mailto:{attendee_email}\r\n"
            "STATUS:CONFIRMED\r\nBEGIN:VALARM\r\nTRIGGER:-PT30M\r\nACTION:DISPLAY\r\n"
            "DESCRIPTION:Miracurl demo in 30 minutes\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n")


def _slot_confirm_email_html(name: str, date_str: str, time_str: str, gcal: str, hq_email: str) -> str:
    nm = html_lib.escape(name or "").strip()
    greeting = f"Dear {nm}," if nm else "Dear Salon Owner,"
    pretty = datetime.fromisoformat(date_str).strftime("%A, %d %B %Y")
    return f"""<!doctype html><html><body style="margin:0;padding:0;background:#f2f0eb">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0eb;padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,.08)">
  <tr><td style="background:#15151b;padding:30px 36px 26px">
    <div style="font-family:Georgia,serif;font-size:24px;letter-spacing:4px;color:#d4af37">MIRACURL</div>
    <div style="height:2px;width:56px;background:#d4af37;margin-top:12px"></div>
    <div style="font-family:Georgia,serif;color:#f4f1e8;font-size:20px;margin-top:14px;line-height:1.45">
      Your demo is booked — we can't wait to meet you ✦</div>
  </td></tr>
  <tr><td style="padding:28px 36px 8px">
    <p style="font-size:15px;color:#33333b;line-height:1.7;margin:0 0 14px">{greeting}</p>
    <p style="font-size:14px;color:#55555f;line-height:1.75;margin:0">
      Thank you for choosing a time — it's in our diary. Here are your demo details:</p>
  </td></tr>
  <tr><td style="padding:14px 36px 6px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8ec;border:1px solid #ecdcae;border-radius:14px">
      <tr><td style="padding:20px 24px">
        <div style="font-size:11px;letter-spacing:2px;color:#9a8f6d;font-weight:bold">YOUR DEMO SLOT</div>
        <div style="font-family:Georgia,serif;font-size:22px;color:#1d1d24;margin-top:8px">{pretty}</div>
        <div style="font-size:16px;color:#55555f;margin-top:4px"><b>{time_str} IST</b> · 20 minutes · online / phone</div>
      </td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding:22px 36px 6px">
    <a href="{gcal}" style="display:inline-block;background:#d4af37;color:#15151b;font-size:15px;font-weight:bold;
       text-decoration:none;padding:14px 38px;border-radius:999px;letter-spacing:.4px">📅 Add to Google Calendar</a>
    <div style="font-size:12px;color:#8f8798;margin-top:10px">A calendar invite (.ics) is also attached — open it to add the demo to any calendar app.</div>
  </td></tr>
  <tr><td style="padding:18px 36px 28px">
    <p style="font-size:13.5px;color:#55555f;line-height:1.7;margin:0 0 12px">
      Our team will reach out at your chosen time. Need to change the slot? Simply reply to this email — no trouble at all.</p>
    <p style="font-size:14px;color:#33333b;line-height:1.7;margin:0">Warm regards,<br>
      <b style="font-family:Georgia,serif">The Miracurl Team</b><br>
      <span style="font-size:12px;color:#8f8798">miracurl-suite.com · {html_lib.escape(hq_email)}</span></p>
  </td></tr>
  <tr><td style="background:#15151b;padding:14px 36px;text-align:center">
    <div style="color:#6d675c;font-size:11px">© Miracurl Suite — see you at the demo ✦</div>
  </td></tr>
</table>
</td></tr></table></body></html>"""


class DemoSlotIn(BaseModel):
    date: str = Field(..., max_length=10)
    time: str = Field(..., max_length=5)
    phone: str = Field(default="", max_length=20)
    tz: str = Field(default="", max_length=50)


def _slot_local_label(date_str: str, time_str: str, tz_name: str) -> str:
    """The IST slot expressed in the guest's own timezone, e.g. '9:30 AM EDT'."""
    try:
        from zoneinfo import ZoneInfo
        ist = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M").replace(tzinfo=ZoneInfo("Asia/Kolkata"))
        loc = ist.astimezone(ZoneInfo(tz_name))
        day = " (+1 day)" if loc.date() > ist.date() else (" (-1 day)" if loc.date() < ist.date() else "")
        return loc.strftime("%I:%M %p %Z").lstrip("0") + day
    except Exception:
        return ""


@router.get("/public/demo-slot/{iid}")
async def demo_slot_info(iid: str, request: Request):
    await public_rate_limit(request, "demo-slot-info", limit=30, window_sec=600)
    inv = await _raw_db.demo_invites.find_one(
        {"id": iid}, {"_id": 0, "name": 1, "salon_name": 1, "preferred_slot": 1})
    if not inv:
        raise HTTPException(404, "Invite not found")
    today = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date()
    days = [(today + timedelta(days=d)).isoformat() for d in range(1, 8)]
    return {"name": inv.get("name", ""), "salon_name": inv.get("salon_name", ""),
            "scheduled": inv.get("preferred_slot"), "dates": days, "times": DEMO_SLOT_TIMES}


def _validate_slot(date_s: str, time_s: str):
    try:
        d = datetime.fromisoformat(date_s).date()
    except ValueError:
        raise HTTPException(400, "Invalid date")
    today = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date()
    if not (today <= d <= today + timedelta(days=30)):
        raise HTTPException(400, "Pick a date within the next 30 days")
    if time_s not in DEMO_SLOT_TIMES:
        raise HTTPException(400, "Invalid time slot")


async def _send_slot_confirmations(email: str, name: str, salon_name: str,
                                   date_s: str, time_s: str, phone: str, city: str = "") -> str:
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    gcal = _gcal_link(date_s, time_s)
    ics = _slot_ics(date_s, time_s, email)
    ics_att = [{"filename": "miracurl-demo.ics", "content": base64.b64encode(ics.encode()).decode()}]
    await _send_email([email],
                      f"Your Miracurl demo is booked — {date_s} at {time_s} IST ✦",
                      _slot_confirm_email_html(name, date_s, time_s, gcal, hq_email),
                      attachments=ics_att, reply_to=hq_email)
    pretty = datetime.fromisoformat(date_s).strftime("%a, %d %b %Y")
    await _send_email([hq_email],
                      f"🔥 Demo booked: {name or email} — {pretty} {time_s} IST",
                      f"""<div style="font-family:Arial,sans-serif;font-size:14px;color:#33333b;line-height:1.7">
<p><b>{html_lib.escape(name or '')}</b> ({html_lib.escape(email)}) just booked a demo slot.</p>
<p>📅 <b>{pretty} at {time_s} IST</b> · 20 min<br>
📞 Phone: {html_lib.escape(phone.strip() or '—')}<br>
🏠 Salon: {html_lib.escape(salon_name or '—')}{f" · {html_lib.escape(city)}" if city else ""}</p>
<p><a href="{gcal}">Add to your Google Calendar</a> — the prospect received a confirmation with the same invite.</p></div>""",
                      attachments=ics_att)
    return gcal


@router.post("/public/demo-slot/{iid}")
async def demo_slot_book(iid: str, body: DemoSlotIn, request: Request):
    await public_rate_limit(request, "demo-slot-book", limit=10, window_sec=600)
    inv = await _raw_db.demo_invites.find_one({"id": iid}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invite not found")
    _validate_slot(body.date, body.time)

    now_iso = datetime.now(timezone.utc).isoformat()
    slot = {"date": body.date, "time": body.time, "phone": body.phone.strip(), "booked_at": now_iso}
    if body.tz and body.tz != "Asia/Kolkata":
        local = _slot_local_label(body.date, body.time, body.tz)
        if local:
            slot["tz"] = body.tz
            slot["local_time"] = local
    await _raw_db.demo_invites.update_one(
        {"id": iid},
        {"$set": {"preferred_slot": slot, "demo_requested_at": inv.get("demo_requested_at") or now_iso,
                  "opened_at": inv.get("opened_at") or now_iso,
                  "seen_by_hq_req": False, "responded": True}})
    gcal = await _send_slot_confirmations(inv["email"], inv.get("name", ""), inv.get("salon_name", ""),
                                          body.date, body.time, body.phone)
    return {"ok": True, "gcal": gcal, "slot": slot}


_DEMO_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


class PublicDemoIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    salon_name: str = Field("", max_length=100)
    city: str = Field("", max_length=60)
    email: str = Field(..., max_length=120)
    phone: str = Field("", max_length=20)
    date: str = Field(..., max_length=10)
    time: str = Field(..., max_length=5)
    tz: str = Field(default="", max_length=50)


@router.get("/public/demo/slots")
async def public_demo_slots(request: Request):
    await public_rate_limit(request, "demo-open-slots", limit=30, window_sec=600)
    today = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date()
    return {"dates": [(today + timedelta(days=d)).isoformat() for d in range(1, 8)],
            "times": DEMO_SLOT_TIMES}


def _demo_slot_dict(date_s: str, time_s: str, phone: str, tz: str, now_iso: str) -> dict:
    slot = {"date": date_s, "time": time_s, "phone": (phone or "").strip(), "booked_at": now_iso}
    if tz and tz != "Asia/Kolkata":
        local = _slot_local_label(date_s, time_s, tz)
        if local:
            slot["tz"] = tz
            slot["local_time"] = local
    return slot


async def _upsert_demo_invite(email: str, name: str, salon_name: str, city: str, slot: dict, now_iso: str):
    existing = await _raw_db.demo_invites.find_one({"email": email}, {"_id": 0, "id": 1})
    if existing:
        await _raw_db.demo_invites.update_one(
            {"id": existing["id"]},
            {"$set": {"preferred_slot": slot, "demo_requested_at": now_iso, "responded": True,
                      "seen_by_hq_req": False, "name": name, "salon_name": salon_name, "city": city}})
    else:
        await _raw_db.demo_invites.insert_one({
            "id": str(uuid.uuid4()), "email": email, "name": name,
            "salon_name": salon_name, "city": city,
            "source": "public_demo_page", "first_sent_at": now_iso, "opened_at": now_iso,
            "responded": True, "reminder_sent_at": None, "converted": False,
            "demo_requested_at": now_iso, "preferred_slot": slot, "seen_by_hq_req": False})


def _parse_demo_form(d: dict) -> tuple:
    """Validated (name, email) from the open-demo payload."""
    name = str(d.get("name") or "").strip()
    email = str(d.get("email") or "").strip().lower()
    if len(name) < 2:
        raise HTTPException(400, "Please share your name")
    if not _DEMO_EMAIL_RE.fullmatch(email):
        raise HTTPException(400, "Enter a valid email address")
    return name, email


async def _mark_lead_demo(email: str, slot: dict, now_iso: str) -> None:
    await _raw_db.mira_leads.update_many(
        {"email": email}, {"$set": {"demo_slot": slot, "demo_requested_at": now_iso}})
    await _raw_db.mira_leads.update_many(
        {"email": email, "status": {"$in": ["sent", "drafted", "no_email", "researched", "replied"]}},
        {"$set": {"status": "demo"}})


async def _book_open_demo(d: dict) -> dict:
    """Shared open-demo booking used by the /demo form AND Mira's demo chat.
    Expects keys: name, salon_name, city, email, phone, date, time, tz."""
    name, email = _parse_demo_form(d)
    salon_name, city = str(d.get("salon_name") or "").strip(), str(d.get("city") or "").strip()
    phone, date_s, time_s, tz = (str(d.get("phone") or ""), str(d.get("date") or ""),
                                 str(d.get("time") or ""), str(d.get("tz") or ""))
    _validate_slot(date_s, time_s)
    now_iso = datetime.now(timezone.utc).isoformat()
    slot = _demo_slot_dict(date_s, time_s, phone, tz, now_iso)
    await _upsert_demo_invite(email, name, salon_name, city, slot, now_iso)
    await _mark_lead_demo(email, slot, now_iso)
    gcal = await _send_slot_confirmations(email, name, salon_name, date_s, time_s, phone, city)
    return {"ok": True, "gcal": gcal, "slot": slot}


@router.post("/public/demo/book")
async def public_demo_book(body: PublicDemoIn, request: Request):
    await public_rate_limit(request, "demo-open-book", limit=5, window_sec=600)
    return await _book_open_demo(body.model_dump())


_DEMO_BOOK_MARKER = "[[DEMO_BOOK]]"


class DemoChatIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=800)
    session_id: str = Field(..., min_length=8, max_length=64)
    tz: str = Field(default="", max_length=50)


def _demo_chat_system(tz: str) -> str:
    today = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date()
    dates = [(today + timedelta(days=d)).isoformat() for d in range(1, 8)]
    date_lines = ", ".join(f"{d} ({datetime.fromisoformat(d).strftime('%A')})" for d in dates)
    tz_note = (f"The visitor's timezone is {tz}. Slot times are IST — when suggesting times, also mention their local time."
               if tz and tz != "Asia/Kolkata" else "The visitor appears to be in India (IST).")
    return (
        "You are Mira, the friendly AI demo concierge for Miracurl Salon Suite (all-in-one salon management with a 12-agent AI team). "
        "Your ONLY job: book the visitor a free 20-minute live demo. Be warm, human and brief (2-3 short sentences per reply). Speak English or Hindi/Hinglish matching them.\n"
        f"AVAILABLE DAYS (next 7): {date_lines}. AVAILABLE TIMES (IST): {', '.join(DEMO_SLOT_TIMES)}. {tz_note}\n"
        "Understand natural phrases: 'tomorrow' = first available date, 'day after' = second, weekday names map to the matching date above. Morning→11:00, afternoon→13:00/15:00, evening→17:00/18:00.\n"
        "COLLECT (conversationally, not like a form): name, email (required — confirmation goes there), salon name & city (nice to have), phone (optional), preferred day + time from the lists.\n"
        "Once you have AT LEAST name + valid email + day + time, DO NOT ask any more questions or re-confirm — book IMMEDIATELY: state the details in one line and end your reply with EXACTLY this machine line (valid JSON, double quotes):\n"
        f'{_DEMO_BOOK_MARKER}{{"name":"...","salon_name":"...","city":"...","email":"...","phone":"...","date":"YYYY-MM-DD","time":"HH:MM"}}\n'
        "Rules: never mention the marker/JSON; only emit it once, only with a real email the visitor gave; date must be one of the available days, time one of the available times. "
        "If they ask about Miracurl, answer briefly (bookings, POS billing, staff & attendance, inventory, AI marketing, WhatsApp receipts, starting with a free trial) and steer back to booking the demo.")


def _demo_booked_reply(reply: str, res: dict) -> str:
    """Append the human confirmation line to Mira's reply after a successful demo booking."""
    when = datetime.fromisoformat(res["slot"]["date"]).strftime("%A, %d %B")
    local = res["slot"].get("local_time")
    return (reply + f"\n\n✅ Done! Your demo is booked for {when} at {res['slot']['time']} IST"
            + (f" ({local} your time)" if local else "")
            + " — the confirmation and calendar invite are on their way to your inbox. See you there! ✦").strip()


async def _run_demo_chat_booking(reply: str, request: Request, tz: str) -> tuple:
    """Parse Mira's [[DEMO_BOOK]] marker and execute the booking. Returns (reply, booking, error)."""
    import json as _json
    text, _, payload = reply.partition(_DEMO_BOOK_MARKER)
    reply = text.strip()
    try:
        data = _json.loads(payload.strip().strip("`").strip())
        # Same strict cap as the manual form — Mira gets no special treatment (anti-flood).
        await public_rate_limit(request, "demo-open-book", limit=5, window_sec=600)
        res = await _book_open_demo({**data, "tz": tz})
        booking = {**res["slot"], "gcal": res["gcal"], "email": str(data.get("email") or "").lower()}
        return _demo_booked_reply(reply, res), booking, None
    except HTTPException as he:
        return (reply + f"\n\n⚠️ {he.detail}").strip(), None, he.detail
    except Exception as e:  # noqa: BLE001 — bad LLM JSON must not 500 the chat
        logging.error(f"demo chat booking parse error: {e}")
        err = "Couldn't complete the booking — please use the quick form below."
        return (reply + f"\n\n⚠️ {err}").strip(), None, err


@router.post("/public/demo-chat")
async def public_demo_chat(body: DemoChatIn, request: Request):
    """Mira books the live demo on the visitor's behalf, conversationally."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    await public_rate_limit(request, "demo-chat", limit=25, window_sec=600)
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "AI key not configured")
    sid = f"demochat-{body.session_id}"
    hist = await _raw_db.demo_chat_messages.find({"sid": sid}, {"_id": 0}).sort("created_at", 1).to_list(24)
    transcript = "".join(f"{'Visitor' if h['role'] == 'user' else 'Mira'}: {h['content']}\n" for h in hist)
    chat = LlmChat(api_key=key, session_id=f"{sid}-{uuid.uuid4().hex[:6]}",
                   system_message=_demo_chat_system(body.tz)).with_model("openai", "gpt-5.4-mini")
    try:
        reply = (await chat.send_message(UserMessage(
            text=f"{transcript}Visitor: {body.message}\nMira:"))).strip()
    except Exception as e:
        logging.error(f"demo chat LLM error: {e}")
        raise HTTPException(502, "Mira is momentarily unavailable — please use the quick form below.")

    booking, booking_error = None, None
    if _DEMO_BOOK_MARKER in reply:
        reply, booking, booking_error = await _run_demo_chat_booking(reply, request, body.tz)

    now = datetime.now(timezone.utc).isoformat()
    await _raw_db.demo_chat_messages.insert_many([
        {"sid": sid, "role": "user", "content": body.message, "created_at": now},
        {"sid": sid, "role": "assistant", "content": reply, "created_at": now}])
    return {"reply": reply, "booking": booking, "booking_error": booking_error}
