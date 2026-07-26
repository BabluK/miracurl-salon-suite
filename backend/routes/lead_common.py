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


def _plans_for(plans: dict, intl: bool) -> dict:
    """USD plans for international leads, INR plans for Indian leads."""
    return {k: v for k, v in plans.items() if (v.get("currency") == "USD") == intl}


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


def _outreach_email_html(lead: dict, plans: dict) -> str:
    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    pixel = (f'<img src="{base}/api/public/lead-track/{lead.get("id", "")}/open.png" '
             'width="1" height="1" style="display:block;width:1px;height:1px" alt="" />') if lead.get("id") else ""
    paras = "".join(f'<p style="font-size:14px;color:#3a3a40;line-height:1.8;margin:0 0 15px">{_html.escape(p)}</p>'
                    for p in (lead.get("email_body") or "").split("\n") if p.strip())
    return f"""
    <div style="background:#efe9dc;padding:28px 12px;font-family:Georgia,serif">
      <div style="max-width:600px;margin:0 auto;background:#fdfbf7;border:1px solid #e6ddc8;border-radius:18px;overflow:hidden;box-shadow:0 10px 34px rgba(28,28,34,.14)">
        <img src="{base}/assets/mira-outreach-hero.png" alt="Miracurl Suite — Mira, your AI salon partner" width="600" style="width:100%;display:block" />
        <div style="height:3px;background:linear-gradient(90deg,#b08d3f,#e8c37f,#b08d3f)"></div>
        <div style="padding:30px 34px 4px">{paras}</div>
        <div style="padding:0 34px">{_pricing_table_html(_plans_for(plans, _lead_intl(lead.get("city"))))}</div>
        <div style="padding:2px 34px 28px">
          <a href="{base}/demo" style="display:inline-block;background:#1c1c22;color:#e8c37f;text-decoration:none;padding:13px 32px;border-radius:999px;font-size:14px;letter-spacing:.6px">Book a free live demo ✦</a>
          <p style="font-size:12px;color:#8a8474;margin:16px 0 0">📎 The attached brochure covers every module of Miracurl Suite.</p>
        </div>
        <div style="background:#1c1c22;padding:16px 34px;text-align:center">
          <span style="color:#e8c37f;font-size:15px;letter-spacing:2px">MIRACURL ✦ SUITE</span>
          <div style="color:#8a8a92;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin-top:3px">Mira — your AI salon partner</div>
        </div>
      </div>
      {pixel}
    </div>"""


def _lead_reply_to() -> str | None:
    """Replies land on the Resend inbound domain so the webhook can flag 🔥 Replied."""
    return os.environ.get("LEAD_REPLY_INBOX") or None
