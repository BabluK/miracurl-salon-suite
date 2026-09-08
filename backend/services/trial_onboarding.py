"""Custom free-trial onboarding kit — ₹0 trial invoice + branded 'Congratulations' email (HQ-onboarded tenants)."""
import asyncio
import base64
import html as html_lib
import logging
import os
import uuid
from datetime import datetime, timezone

from dateutil.relativedelta import relativedelta

from database import _raw_db
from email_service import _send_email
from services.pdf_brand import image_bytes_from_url, platform_logo_bytes
from services.storage import APP_NAME, _put_object
from services.subscription_invoice import (
    _app_url, build_invoice_pdf, build_terms_pdf, get_biller, next_invoice_number,
)

log = logging.getLogger("trial_onboarding")
TRIAL_MONTH_OPTIONS = (3, 6, 9, 12)


def trial_end(start: datetime, months: int | None, default_days: int) -> datetime:
    if months in TRIAL_MONTH_OPTIONS:
        return start + relativedelta(months=months)
    return start + relativedelta(days=default_days)


def trial_label(months: int | None, default_days: int) -> str:
    if months == 12:
        return "1 year"
    return f"{months} months" if months in TRIAL_MONTH_OPTIONS else f"{default_days} days"


def _abs(url: str | None) -> str:
    if not url:
        return ""
    return url if url.startswith("http") else f"{_app_url()}{url}"


def _nice(iso: str) -> str:
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%d %b %Y")
    except (ValueError, AttributeError):
        return (iso or "")[:10]


async def _ai_logo(t: dict) -> str | None:
    """Generate a logo with AI when the super-admin didn't upload one. Returns /api/files/<id> or None."""
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        return None
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
    from routes.mira_common import paint_offloop
    name = t.get("name") or "the business"
    if t.get("business_type") == "restaurant":
        prompt = (f"A premium circular logo emblem for a restaurant named '{name}'. Style: luxury gold minimal. "
                  "Flat vector emblem, centered composition, elegant typography featuring the restaurant name, "
                  "chef hat, fork or flame motif, solid deep charcoal background, gold accent palette, "
                  "high contrast, crisp edges, logo design only — no photo, no watermark, no mockup.")
    else:
        prompt = (f"A premium circular logo emblem for a beauty salon named '{name}'. Style: luxury gold minimal. "
                  "Flat vector emblem, centered composition, elegant typography featuring the salon name, "
                  "scissors or beauty motif, solid deep charcoal background, gold accent palette, "
                  "high contrast, crisp edges, logo design only — no photo, no watermark, no mockup.")
    images = await paint_offloop(OpenAIImageGeneration(api_key=key), prompt=prompt)
    if not images:
        return None
    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/tenants/{t['id']}/logo/{file_id}.png"
    result = await asyncio.to_thread(_put_object, storage_path, images[0], "image/png")
    await _raw_db.uploads.insert_one({
        "id": file_id, "tenant_id": t["id"], "kind": "logo",
        "storage_path": result.get("path", storage_path),
        "original_filename": f"{file_id}.png", "content_type": "image/png",
        "size": len(images[0]), "uploaded_by": "system", "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    url = f"/api/files/{file_id}"
    await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"logo_url": url, "logo_source": "ai_onboarding"}})
    return url


def congrats_email_html(inv: dict, t: dict) -> str:
    e = html_lib.escape
    resto = t.get("business_type") == "restaurant"
    noun = "restaurant" if resto else "salon"
    logo = _abs(inv.get("tenant_logo_url"))
    poster = _abs(t.get("welcome_poster_url"))
    row = lambda k, v: f"<tr><td style='padding:7px 0;color:#777;font-size:13px'>{k}</td><td style='padding:7px 0;text-align:right;font-weight:bold;font-size:13px'>{v}</td></tr>"
    logo_html = (f"<img src='{e(logo)}' alt='{e(t.get('name') or '')} logo' width='96' height='96' "
                 "style='width:96px;height:96px;border-radius:50%;object-fit:cover;border:3px solid #d4af37;background:#fff;display:block;margin:0 auto 14px'/>"
                 if logo else "")
    poster_html = f"<img src='{e(poster)}' alt='Welcome' style='width:100%;display:block;border-radius:12px;margin:18px 0'/>" if poster else ""
    return f"""
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #eee;border-radius:16px;overflow:hidden">
      <div style="background:#1c1c22;padding:30px 30px 26px;text-align:center">
        {logo_html}
        <div style="color:#fff;font-size:24px;font-weight:bold">{e(t.get('name') or '')}</div>
        <div style="color:#d4af37;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin-top:6px">Powered by Miracurl Suite</div>
      </div>
      <div style="padding:28px 30px;color:#333">
        <h2 style="margin:0 0 10px;font-size:22px;color:#1c1c22">Congratulations 🎉</h2>
        <p style="line-height:1.7;margin:0 0 14px">Your {noun} <b>{e(t.get('name') or '')}</b> is now live on Miracurl with a
        <b>complimentary {e(inv['trial_label'])} free trial</b> — every feature unlocked, nothing to pay.</p>
        <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #eadfc0;border-radius:12px;padding:6px 16px;margin:18px 0">
          {row("Free trial", e(inv['trial_label']))}
          {row("Starts on", e(_nice(inv['period_start'])))}
          {row("Ends on", e(_nice(inv['period_end'])))}
          {row("Invoice", e(inv['number']))}
          {row("Amount", "₹0.00 — complimentary")}
        </table>
        {poster_html}
        <div style="background:#faf6ec;border:1px solid #eadfc0;border-radius:12px;padding:14px 18px;font-size:13px;font-family:Arial,sans-serif;line-height:1.9">
          <b>📎 Attached</b><br/>
          1. <b>Free Trial Invoice</b> — {e(inv['number'])}.pdf (₹0, for your records)<br/>
          2. <b>Account Profile</b> — every detail we have on file for your {noun}, owner contacts, trial dates &amp; how to reach HQ<br/>
          3. <b>Terms &amp; Conditions</b>
        </div>
        <p style="font-size:13px;line-height:1.7;margin-top:18px">Your login details were sent in a separate email. We'll remind you before the trial ends so your {noun} never loses access.</p>
        <p style="font-size:12px;color:#888;margin-top:18px">
          <a href="{_app_url()}/terms" style="color:#b08d3f">Terms</a> · <a href="{_app_url()}/privacy" style="color:#b08d3f">Privacy</a><br/>
          Need help? Just reply to this email.
        </p>
      </div>
    </div>"""


async def send_trial_congrats(inv: dict, resend: bool = False) -> dict:
    t = await _raw_db.tenants.find_one({"id": inv["tenant_id"]}, {"_id": 0}) or {}
    to = [x for x in dict.fromkeys([inv.get("owner_email") or "", t.get("salon_email") or ""]) if x]
    inv["_logo"] = await platform_logo_bytes()
    inv["_tenant_logo"] = await image_bytes_from_url(inv.get("tenant_logo_url"))
    safe = inv["number"].replace("/", "-")
    from services.tenant_profile_pdf import render_tenant_profile
    profile_pdf = await render_tenant_profile(t)
    attachments = await asyncio.to_thread(lambda: [
        {"filename": f"Miracurl-Free-Trial-Invoice-{safe}.pdf", "content": base64.b64encode(build_invoice_pdf(inv)).decode()},
        {"filename": f"Miracurl-Account-Profile-{t.get('slug', '')}.pdf", "content": base64.b64encode(profile_pdf).decode()},
        {"filename": "Miracurl-Terms-and-Conditions.pdf", "content": base64.b64encode(build_terms_pdf(inv["_logo"])).decode()},
    ])
    subject = f"{'[Resent] ' if resend else ''}🎉 Congratulations {t.get('name') or ''} — your {inv['trial_label']} free trial is live"
    status = await _send_email(to, subject, congrats_email_html(inv, t), attachments=attachments,
                               book_url=f"{_app_url()}/login", book_label="Open your dashboard ✦")
    rec = {"sent": bool(status.get("sent")), "to": to[0] if to else "", "id": status.get("id"),
           "error": status.get("error"), "at": datetime.now(timezone.utc).isoformat()}
    await _raw_db.subscription_invoices.update_one({"id": inv["id"]}, {"$set": {"email": rec}})
    return rec


async def issue_trial_kit(tenant_id: str, months: int | None, default_days: int) -> dict | None:
    """Background: ensure a logo (upload or AI), create the ₹0 trial invoice, email the congratulations. Never raises."""
    try:
        t = await _raw_db.tenants.find_one({"id": tenant_id}, {"_id": 0})
        if not t:
            return None
        logo_url = t.get("logo_url")
        if not logo_url:
            try:
                logo_url = await _ai_logo(t)
            except Exception as e:  # noqa: BLE001 — logo is decorative, never block the kit
                log.warning("AI logo failed for %s: %s", t["slug"], e)
        now = datetime.now(timezone.utc)
        start = t.get("created_at") or now.isoformat()
        end = t.get("trial_end_date") or t.get("trial_ends_at") or now.isoformat()
        inv = {
            "id": str(uuid.uuid4()), "number": await next_invoice_number(now.year), "kind": "trial",
            "issued_on": now.strftime("%d %b %Y"), "created_at": now.isoformat(),
            "tenant_id": t["id"], "tenant_name": t.get("name") or t["slug"], "tenant_slug": t["slug"],
            "tenant_location": t.get("location") or "", "tenant_phone": t.get("phone") or "",
            "owner_email": t.get("owner_email") or "", "notify_email": t.get("notify_email") or "",
            "buyer_gstin": (t.get("gst_number") or "").upper(), "tenant_logo_url": logo_url or "",
            "subscription_id": None, "payment_id": None,
            "plan": "free_trial", "plan_label": f"Free Trial · {trial_label(months, default_days)}",
            "trial_label": trial_label(months, default_days), "trial_months": months,
            "duration_days": max(1, (datetime.fromisoformat(end.replace("Z", "+00:00")) - datetime.fromisoformat(start.replace("Z", "+00:00"))).days),
            "branches": 1, "period_start": start[:10], "period_end": end[:10], "referral_bonus_days": 0,
            "amount": 0.0, "currency": "INR", "credits_applied": 0.0,
            "method": "complimentary", "txn_ref": "", "paid_at": now.date().isoformat(),
            "biller": await get_biller(), "email": None,
        }
        await _raw_db.subscription_invoices.insert_one(dict(inv))
        inv["email"] = await send_trial_congrats(inv)
        kit = {"invoice_id": inv["id"], "invoice_number": inv["number"], "logo_url": logo_url or "",
               "email": inv["email"], "at": now.isoformat()}
        await _raw_db.tenants.update_one({"id": t["id"]}, {"$set": {"trial_kit": kit}})
        return kit
    except Exception as e:  # noqa: BLE001 — onboarding must never fail because of the kit
        log.exception("trial kit failed for %s: %s", tenant_id, e)
        await _raw_db.tenants.update_one({"id": tenant_id}, {"$set": {"trial_kit": {"error": str(e)[:300]}}})
        return None
