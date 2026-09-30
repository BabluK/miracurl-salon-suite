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
    meta_id, meta_secret = _meta_creds()
    g_id, g_secret = _google_creds()
    own = cx.own_channel(tdoc)
    wa_pts, sms_pts = int(tdoc.get("wa_points") or 0), int(tdoc.get("sms_points") or 0)

    if not feats.get("whatsapp", True):
        wa = {"state": "unavailable", "line": "WhatsApp isn't part of your plan yet — ask HQ to enable it.", "action": "contact_hq"}
    elif own:
        wa = {"state": "ok", "line": f"✓ Sending from your own number {own.get('display_phone_number') or ''} · {wa_pts} credits for Mira's official templates.", "action": None}
    elif wa_pts > 0:
        wa = {"state": "ok", "line": f"✓ Ready via Miracurl's official WhatsApp · {wa_pts} credits left" + ("" if auto["whatsapp"] else " · auto-receipts are OFF"), "action": None if auto["whatsapp"] else "receipts"}
    else:
        wa = {"state": "off", "line": "No WhatsApp credits — buy a pack (or connect your own WhatsApp Business number) to send receipts & reminders.", "action": "buy_whatsapp"}

    if not sms_configured():
        sms = {"state": "unavailable", "line": "SMS gateway is being configured by HQ — WhatsApp & email work meanwhile.", "action": None}
    elif not feats.get("sms", True):
        sms = {"state": "unavailable", "line": "SMS isn't part of your plan yet — ask HQ to enable it.", "action": "contact_hq"}
    elif sms_pts > 0:
        sms = {"state": "ok", "line": f"✓ Ready · {sms_pts} SMS credits left" + ("" if auto["sms"] else " · auto-receipts are OFF"), "action": None if auto["sms"] else "receipts"}
    else:
        sms = {"state": "off", "line": "No SMS credits — buy a pack to send bill receipts & OTPs by SMS.", "action": "buy_sms"}

    email = ({"state": "ok", "line": "✓ Invoices, reminders & reports go out from Miracurl automatically" + ("" if auto["email"] else " · auto-receipts are OFF"), "action": None if auto["email"] else "receipts"}
             if os.environ.get("RESEND_API_KEY") else {"state": "unavailable", "line": "Email is being configured by HQ.", "action": None})

    fb = social.get("facebook")
    if fb:
        ig = social.get("instagram") or {}
        meta = {"state": "ok", "line": f"✓ {fb.get('page_name')}" + (f" · @{ig.get('username')}" if ig.get("username") else " · no Instagram linked to this Page"), "action": None}
    elif not (meta_id and meta_secret):
        meta = {"state": "unavailable", "line": "Coming soon — HQ is finishing Meta setup.", "action": None}
    elif social.get("meta_pages"):
        meta = {"state": "pending", "line": "Almost there — pick your Facebook Page below the Connected Accounts card.", "action": "social"}
    else:
        meta = {"state": "off", "line": "Not connected — connect so Mira Studio can auto-post promos.", "action": "connect_meta"}

    channels = [
        {"key": "whatsapp", "title": "WhatsApp", **wa},
        {"key": "sms", "title": "SMS", **sms},
        {"key": "email", "title": "Email", **email},
        {"key": "meta", "title": "Instagram + Facebook", **meta},
        {"key": "google", **_google_status(social.get("google_business"), bool(g_id and g_secret))},
    ]
    ready = sum(1 for c in channels if c["state"] == "ok")
    return {"channels": channels, "ready": ready, "total": len(channels), "receipt_auto": auto}
