"""Price Change Alerts — tell existing international (USD) subscribers about the lower prices and offer a
one-click switch to the annual plan (Stripe Checkout via the tenant's renewal token)."""
import html
import os
import uuid
from datetime import datetime, timezone

from database import _raw_db
from services.plans import PLAN_CATALOG, plan_info

CAMPAIGN = "usd-price-drop-2026-10"


def _annual_key_for(plan_key: str, vertical: str) -> str:
    if vertical == "restaurant":
        return "resto_intl_annual"
    tier = (plan_info(plan_key).get("tier") or "professional")
    return f"intl_{tier}_annual" if f"intl_{tier}_annual" in PLAN_CATALOG else "intl_pro_annual"


def _monthly_key_for(annual_key: str) -> str:
    return annual_key.replace("_annual", "_monthly")


async def price_alert_audience() -> list[dict]:
    """USD tenants with an owner e-mail: current plan, what they were paying, new monthly/annual and the saving."""
    from email_service import _is_login_only
    tenants = await _raw_db.tenants.find({"currency": "USD", "owner_email": {"$nin": ["", None]}},
                                         {"_id": 0, "id": 1, "name": 1, "slug": 1, "owner_email": 1, "plan": 1, "vertical": 1,
                                          "subscription_end": 1, "renewal_pay_token": 1}).to_list(2000)
    sent = {d["tenant_id"] for d in await _raw_db.price_alert_log.find({"campaign": CAMPAIGN}, {"_id": 0, "tenant_id": 1}).to_list(5000)}
    out = []
    for t in tenants:
        if _is_login_only(t["owner_email"]):
            continue
        vertical = t.get("vertical") or "salon"
        annual_key = _annual_key_for(t.get("plan") or "", vertical)
        monthly_key = _monthly_key_for(annual_key)
        annual, monthly = PLAN_CATALOG.get(annual_key) or {}, PLAN_CATALOG.get(monthly_key) or {}
        sub = await _raw_db.subscriptions.find_one({"tenant_id": t["id"], "status": "active"}, {"_id": 0, "price": 1, "plan": 1})
        paying = float((sub or {}).get("price") or plan_info((sub or {}).get("plan") or t.get("plan")).get("price") or 0)
        cur_days = int(plan_info((sub or {}).get("plan") or t.get("plan")).get("duration_days") or 31)
        paying_monthly_equiv = round(paying / max(cur_days, 1) * 30.4, 2) if paying else None
        out.append({**{k: t.get(k) for k in ("id", "name", "slug", "owner_email", "plan", "subscription_end")}, "vertical": vertical,
                    "plan_label": plan_info(t.get("plan")).get("label") or t.get("plan") or "Trial",
                    "paying": paying, "paying_monthly_equiv": paying_monthly_equiv,
                    "new_monthly": float(monthly.get("price") or 0), "new_annual": float(annual.get("price") or 0),
                    "annual_key": annual_key, "annual_label": annual.get("label"),
                    "annual_saving": round(float(monthly.get("price") or 0) * 12 - float(annual.get("price") or 0), 2),
                    "already_sent": t["id"] in sent})
    return out


def price_alert_html(row: dict, switch_url: str) -> str:
    noun = "restaurant" if row["vertical"] == "restaurant" else "salon"
    name, plan_label = html.escape(str(row.get("name") or "")), html.escape(str(row.get("plan_label") or ""))
    was = (f"<p style='font-size:14px;color:#555'>You've been paying about <b>${row['paying_monthly_equiv']:,.2f}/month</b> on {plan_label}.</p>"
           if row.get("paying_monthly_equiv") else "")
    return f"""
    <div style="font-family:Georgia,serif;max-width:580px;margin:0 auto;color:#1c1c22">
      <div style="background:#1c1c22;color:#f3efe4;border-radius:14px;padding:22px 24px">
        <div style="font-size:11px;letter-spacing:2px;color:#e8c37f">MIRACURL SUITE · PRICE UPDATE</div>
        <h2 style="margin:8px 0 0;font-size:22px;color:#F0D9A5">Good news, {name} — your price just went down</h2>
      </div>
      <p style="font-size:15px;margin:18px 0 6px">We've lowered our international pricing for {noun}s. Nothing to do — your next renewal is already at the new rate:</p>
      {was}
      <table style="width:100%;border-collapse:collapse;margin:12px 0">
        <tr><td style="padding:12px;border:1px solid #eee;border-radius:10px"><div style="color:#888;font-size:12px">Monthly</div><div style="font-size:24px;font-weight:bold">${row['new_monthly']:,.0f}<span style="font-size:13px;color:#888">/mo</span></div></td>
            <td style="width:12px"></td>
            <td style="padding:12px;border:2px solid #d4af37;border-radius:10px;background:#fdf8ec"><div style="color:#9a7a1f;font-size:12px">Annual · one payment</div><div style="font-size:24px;font-weight:bold">${row['new_annual']:,.0f}<span style="font-size:13px;color:#888">/yr</span></div>
            <div style="color:#15803d;font-size:12px;font-weight:bold">Save ${row['annual_saving']:,.0f} a year — 2 months free</div></td></tr>
      </table>
      <p style="text-align:center;margin:20px 0"><a href="{switch_url}" style="background:linear-gradient(180deg,#F0D9A5,#C89B52);color:#15151b;text-decoration:none;font-weight:bold;padding:13px 26px;border-radius:999px;display:inline-block">Switch to annual in one click →</a></p>
      <p style="color:#888;font-size:12px;text-align:center">Secure Stripe checkout · your current plan runs to the end, then the annual year starts.</p>
      <p style="font-size:13px;color:#666;margin-top:24px">Questions? Just reply to this e-mail.<br>— Mira &amp; the Miracurl team</p>
    </div>"""


async def send_price_alerts(only_tenant_ids: list[str] | None = None) -> dict:
    from email_service import _send_email
    app_url = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    rows = [r for r in await price_alert_audience() if not r["already_sent"] and (not only_tenant_ids or r["id"] in only_tenant_ids)]
    sent, failed = 0, []
    for r in rows:
        token = (await _raw_db.tenants.find_one({"id": r["id"]}, {"_id": 0, "renewal_pay_token": 1}) or {}).get("renewal_pay_token")
        if not token:
            token = str(uuid.uuid4())
            await _raw_db.tenants.update_one({"id": r["id"]}, {"$set": {"renewal_pay_token": token}})
        url = f"{app_url}/api/public/renew/{token}?plan={r['annual_key']}"
        res = await _send_email([r["owner_email"]], f"Your Miracurl price just went down — switch to annual and save ${r['annual_saving']:,.0f}",
                                price_alert_html(r, url), from_name="Mira at Miracurl")
        if res.get("sent"):
            sent += 1
            await _raw_db.price_alert_log.insert_one({"id": str(uuid.uuid4()), "campaign": CAMPAIGN, "tenant_id": r["id"], "email": r["owner_email"],
                                                      "annual_key": r["annual_key"], "sent_at": datetime.now(timezone.utc).isoformat()})
        else:
            failed.append({"tenant": r["name"], "error": res.get("error")})
    return {"sent": sent, "failed": failed, "campaign": CAMPAIGN}
