"""Google Wallet — Add membership card to Google Wallet via signed Save JWT."""
import os
import re
import time
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request

from routes.premium_membership import _member_bundle, TIER_COLORS
from security import public_rate_limit

router = APIRouter()

_SIGNER = None


def _signer():
    global _SIGNER
    if _SIGNER is None:
        from google.auth import crypt
        sa_file = os.environ.get("GOOGLE_WALLET_SA_FILE")
        if not sa_file or not os.path.exists(sa_file):
            raise HTTPException(503, "Google Wallet is not configured yet")
        _SIGNER = crypt.RSASigner.from_service_account_file(sa_file)
    return _SIGNER


def _safe_id(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]", "_", s or "")


@router.get("/public/member/{member_id}/google-wallet")
async def member_google_wallet(member_id: str, request: Request):
    """Returns a 'Save to Google Wallet' URL for this membership."""
    public_rate_limit(request, "member-gwallet", limit=15, window_sec=600)
    issuer = os.environ.get("GOOGLE_WALLET_ISSUER_ID")
    if not issuer:
        raise HTTPException(503, "Google Wallet is not configured yet")
    cm, cust, t = await _member_bundle(member_id)

    base = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    tier = (cm.get("tier") or "custom").lower()
    tier_hex = TIER_COLORS.get(tier, "#d4af37")
    try:
        thru = datetime.fromisoformat(cm["expires_at"]).strftime("%m/%Y")
    except (ValueError, TypeError, KeyError):
        thru = ""
    logo_url = t.get("logo_url") or ""
    if logo_url.startswith("/api/"):
        logo_url = f"{base}{logo_url}"
    if not logo_url:
        logo_url = f"{base}/assets/logo/google-wallet-logo.png"

    class_id = f"{issuer}.miracurl_membership"
    object_id = f"{issuer}.mem_{_safe_id(cm['member_id'])}"
    obj = {
        "id": object_id,
        "classId": class_id,
        "state": "ACTIVE",
        "cardTitle": {"defaultValue": {"language": "en", "value": t.get("name") or "Miracurl Suite"}},
        "subheader": {"defaultValue": {"language": "en", "value": f"{tier.upper()} MEMBER"}},
        "header": {"defaultValue": {"language": "en", "value": cust.get("name") or "Member"}},
        "logo": {"sourceUri": {"uri": logo_url},
                 "contentDescription": {"defaultValue": {"language": "en", "value": "Salon logo"}}},
        "hexBackgroundColor": tier_hex,
        "barcode": {"type": "QR_CODE", "value": cm["member_id"], "alternateText": cm["member_id"]},
        "heroImage": {"sourceUri": {"uri": f"{base}/assets/logo/wallet-hero.png"},
                      "contentDescription": {"defaultValue": {"language": "en", "value": "Membership"}}},
        "textModulesData": [
            {"id": "member_id", "header": "MEMBER ID", "body": cm["member_id"]},
            {"id": "valid_thru", "header": "VALID THRU", "body": thru or "—"},
            {"id": "cashback", "header": "CASHBACK", "body": f"{cm.get('cashback_pct') or 0:g}% on every bill"},
        ],
        "linksModuleData": {"uris": [
            {"uri": f"{base}/member/{cm['member_id']}", "description": "View live card & balance", "id": "card_link"},
        ]},
    }
    claims = {
        "iss": "miracurl-wallet@miracurl-suite.iam.gserviceaccount.com",
        "aud": "google",
        "typ": "savetowallet",
        "iat": int(time.time()),
        "origins": [
            "https://miracurl-suite.com",
            "https://www.miracurl-suite.com",
            "https://hair-hub-system.preview.emergentagent.com",
        ],
        "payload": {"genericClasses": [{"id": class_id}], "genericObjects": [obj]},
    }
    from google.auth import jwt as gjwt
    token = gjwt.encode(_signer(), claims).decode()
    return {"save_url": f"https://pay.google.com/gp/v/save/{token}"}
