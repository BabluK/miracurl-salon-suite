"""Connections Hub — one call that tells a tenant, in plain words, which messaging & social channels are ready
(WhatsApp, SMS, Email, Instagram+Facebook, Google Business Profile) and the single next step for each."""
import os

from fastapi import APIRouter, Depends

from database import _raw_db
from security import require_tenant_admin, current_tenant

router = APIRouter()


def _google_status(gb: dict | None, configured: bool) -> dict:
    if not configured:
        return {"state": "unavailable", "title": "Google Business Profile", "line": "Coming soon — HQ is finishing Google setup.", "action": None}
    if not gb:
        return {"state": "off", "title": "Google Business Profile", "line": "Not connected — connect to let Mira reply to your Google reviews.", "action": "connect_google"}
    if gb.get("api_ready"):
        return {"state": "ok", "title": "Google Business Profile", "line": f"✓ {gb.get('location_title') or 'Connected'} — review replies enabled.", "action": None}
    err = gb.get("api_error") or "api_not_approved"
    lines = {
        "api_not_approved": "Your Google login is done ✓. Google still has to switch on review access for the Miracurl app — that's an HQ step, nothing for you to do. Mira re-checks daily.",
        "no_business_profile": "This Google account doesn't manage a Business Profile. Disconnect and connect with the Google account that owns your listing.",
        "no_location": "Your Google account has no business location yet — add your business on Google Maps first, then tap Check again.",
        "error": "Google didn't respond just now — tap Check again in a minute.",
    }
    return {"state": "pending", "title": "Google Business Profile", "line": lines.get(err, lines["error"]), "action": "recheck_google", "error": err}


def _whatsapp_status(feats: dict, own: dict | None, pts: int, auto_on: bool) -> dict:
    if not feats.get("whatsapp", True):
        return {"state": "unavailable", "line": "WhatsApp isn't part of your plan yet — ask HQ to enable it.", "action": "contact_hq"}
    if own:
        return {"state": "ok", "line": f"✓ Sending from your own number {own.get('display_phone_number') or ''} · {pts} credits for Mira's official templates.", "action": None}
    if pts > 0:
        return _ready_line(f"✓ Ready via Miracurl's official WhatsApp · {pts} credits left", auto_on)
    return {"state": "off", "line": "No WhatsApp credits — buy a pack (or connect your own WhatsApp Business number) to send receipts & reminders.", "action": "buy_whatsapp"}


def _sms_status(feats: dict, configured: bool, pts: int, auto_on: bool) -> dict:
    if not configured:
        return {"state": "unavailable", "line": "SMS gateway is being configured by HQ — WhatsApp & email work meanwhile.", "action": None}
    if not feats.get("sms", True):
        return {"state": "unavailable", "line": "SMS isn't part of your plan yet — ask HQ to enable it.", "action": "contact_hq"}
    if pts > 0:
        return _ready_line(f"✓ Ready · {pts} SMS credits left", auto_on)
    return {"state": "off", "line": "No SMS credits — buy a pack to send bill receipts & OTPs by SMS.", "action": "buy_sms"}


def _email_status(configured: bool, auto_on: bool) -> dict:
    if not configured:
        return {"state": "unavailable", "line": "Email is being configured by HQ.", "action": None}
    return _ready_line("✓ Invoices, reminders & reports go out from Miracurl automatically", auto_on)


def _meta_status(social: dict, configured: bool) -> dict:
    fb = social.get("facebook")
    if fb:
        ig = social.get("instagram") or {}
        tail = f" · @{ig.get('username')}" if ig.get("username") else " · no Instagram linked to this Page"
        return {"state": "ok", "line": f"✓ {fb.get('page_name')}{tail}", "action": None}
    if not configured:
        return {"state": "unavailable", "line": "Coming soon — HQ is finishing Meta setup.", "action": None}
    if social.get("meta_pages"):
        return {"state": "pending", "line": "Almost there — pick your Facebook Page below the Connected Accounts card.", "action": "social"}
    return {"state": "off", "line": "Not connected — connect so Mira Studio can auto-post promos.", "action": "connect_meta"}


def _ready_line(line: str, auto_on: bool) -> dict:
    """A working channel whose auto-receipts toggle is still off gets a gentle one-tap nudge."""
    if auto_on:
        return {"state": "ok", "line": line, "action": None}
    return {"state": "ok", "line": f"{line} · auto-receipts are OFF", "action": "receipts"}


@router.get("/settings/connections-hub")
async def connections_hub(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    from services import wa_coexist as cx
    from services.tenant_features import features_of
    from sms_service import sms_configured
    from routes.social_connect import _conn, _meta_creds, _google_creds

    tdoc = await _raw_db.tenants.find_one({"id": t["id"]}, {"_id": 0}) or {}
    feats = features_of(tdoc)
    auto = {"email": False, "sms": False, "whatsapp": False, **(tdoc.get("receipt_auto") or {})}
    social = await _conn(t["id"])
    channels = [
        {"key": "whatsapp", "title": "WhatsApp", **_whatsapp_status(feats, cx.own_channel(tdoc), int(tdoc.get("wa_points") or 0), auto["whatsapp"])},
        {"key": "sms", "title": "SMS", **_sms_status(feats, sms_configured(), int(tdoc.get("sms_points") or 0), auto["sms"])},
        {"key": "email", "title": "Email", **_email_status(bool(os.environ.get("RESEND_API_KEY")), auto["email"])},
        {"key": "meta", "title": "Instagram + Facebook", **_meta_status(social, all(_meta_creds()))},
        {"key": "google", **_google_status(social.get("google_business"), all(_google_creds()))},
    ]
    ready = sum(1 for c in channels if c["state"] == "ok")
    return {"channels": channels, "ready": ready, "total": len(channels), "receipt_auto": auto}
