"""Google Wallet — Add membership & gift cards to Google Wallet via signed Save JWTs."""
import os
import re
import time
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request

from database import _raw_db
from security import public_rate_limit

router = APIRouter()

_SIGNER = None
_ORIGINS = [
    "https://miracurl-suite.com",
    "https://www.miracurl-suite.com",
    "https://hair-hub-system.preview.emergentagent.com",
]


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


def _base() -> str:
    return os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")


def _tenant_logo(t: dict) -> str:
    logo_url = t.get("logo_url") or ""
    if logo_url.startswith("/api/"):
        logo_url = f"{_base()}{logo_url}"
    return logo_url or f"{_base()}/assets/logo/google-wallet-logo.png"


def _sign_save_url(class_id: str, obj: dict) -> str:
    claims = {
        "iss": "miracurl-wallet@miracurl-suite.iam.gserviceaccount.com",
        "aud": "google",
        "typ": "savetowallet",
        "iat": int(time.time()),
        "origins": _ORIGINS,
        "payload": {"genericClasses": [{"id": class_id}], "genericObjects": [obj]},
    }
    from google.auth import jwt as gjwt
    token = gjwt.encode(_signer(), claims).decode()
    return f"https://pay.google.com/gp/v/save/{token}"


def build_membership_save_url(cm: dict, cust: dict, t: dict) -> str:
    from routes.premium_membership import TIER_COLORS
    issuer = os.environ.get("GOOGLE_WALLET_ISSUER_ID")
    if not issuer:
        raise HTTPException(503, "Google Wallet is not configured yet")
    tier = (cm.get("tier") or "custom").lower()
    try:
        thru = datetime.fromisoformat(cm["expires_at"]).strftime("%m/%Y")
    except (ValueError, TypeError, KeyError):
        thru = ""
    class_id = f"{issuer}.miracurl_membership"
    obj = {
        "id": f"{issuer}.mem_{_safe_id(cm['member_id'])}",
        "classId": class_id,
        "state": "ACTIVE",
        "cardTitle": {"defaultValue": {"language": "en", "value": t.get("name") or "Miracurl Suite"}},
        "subheader": {"defaultValue": {"language": "en", "value": f"{tier.upper()} MEMBER"}},
        "header": {"defaultValue": {"language": "en", "value": cust.get("name") or "Member"}},
        "logo": {"sourceUri": {"uri": _tenant_logo(t)},
                 "contentDescription": {"defaultValue": {"language": "en", "value": "Salon logo"}}},
        "hexBackgroundColor": TIER_COLORS.get(tier, "#d4af37"),
        "barcode": {"type": "QR_CODE", "value": cm["member_id"], "alternateText": cm["member_id"]},
        "heroImage": {"sourceUri": {"uri": f"{_base()}/assets/logo/wallet-hero.png"},
                      "contentDescription": {"defaultValue": {"language": "en", "value": "Membership"}}},
        "textModulesData": [
            {"id": "member_id", "header": "MEMBER ID", "body": cm["member_id"]},
            {"id": "valid_thru", "header": "VALID THRU", "body": thru or "—"},
            {"id": "cashback", "header": "CASHBACK", "body": f"{cm.get('cashback_pct') or 0:g}% on every bill"},
        ],
        "linksModuleData": {"uris": [
            {"uri": f"{_base()}/member/{cm['member_id']}", "description": "View live card & balance", "id": "card_link"},
        ]},
    }
    return _sign_save_url(class_id, obj)


def build_gift_card_save_url(gc: dict, t: dict) -> str:
    issuer = os.environ.get("GOOGLE_WALLET_ISSUER_ID")
    if not issuer:
        raise HTTPException(503, "Google Wallet is not configured yet")
    cur = "₹" if (t.get("currency") or "INR") == "INR" else (t.get("currency") or "₹")
    class_id = f"{issuer}.miracurl_gift_card"
    obj = {
        "id": f"{issuer}.gc_{_safe_id(gc['code'])}",
        "classId": class_id,
        "state": "ACTIVE",
        "cardTitle": {"defaultValue": {"language": "en", "value": t.get("name") or "Miracurl Suite"}},
        "subheader": {"defaultValue": {"language": "en", "value": "GIFT CARD"}},
        "header": {"defaultValue": {"language": "en", "value": gc.get("recipient_name") or "Gift Card"}},
        "logo": {"sourceUri": {"uri": _tenant_logo(t)},
                 "contentDescription": {"defaultValue": {"language": "en", "value": "Salon logo"}}},
        "hexBackgroundColor": "#b45309",
        "barcode": {"type": "QR_CODE", "value": gc["code"], "alternateText": gc["code"]},
        "heroImage": {"sourceUri": {"uri": f"{_base()}/assets/logo/wallet-hero.png"},
                      "contentDescription": {"defaultValue": {"language": "en", "value": "Gift card"}}},
        "textModulesData": [
            {"id": "code", "header": "GIFT CARD CODE", "body": gc["code"]},
            {"id": "value", "header": "CARD VALUE", "body": f"{cur}{float(gc.get('amount') or 0):g}"},
            {"id": "from", "header": "FROM", "body": gc.get("buyer_name") or "—"},
            {"id": "expires", "header": "VALID TILL", "body": str(gc.get("expires_at") or "—")[:10]},
        ],
        "linksModuleData": {"uris": [
            {"uri": f"{_base()}/book/{gc.get('tenant_slug') or t.get('slug') or ''}",
             "description": "Book your visit", "id": "book_link"},
        ]},
    }
    return _sign_save_url(class_id, obj)


@router.get("/public/member/{member_id}/google-wallet")
async def member_google_wallet(member_id: str, request: Request):
    from routes.premium_membership import _member_bundle
    public_rate_limit(request, "member-gwallet", limit=15, window_sec=600)
    cm, cust, t = await _member_bundle(member_id)
    return {"save_url": build_membership_save_url(cm, cust, t)}


@router.get("/public/gift-card/{code}/google-wallet")
async def gift_card_google_wallet(code: str, request: Request):
    public_rate_limit(request, "gc-gwallet", limit=15, window_sec=600)
    gc = await _raw_db.gift_cards.find_one(
        {"code": code.strip().upper(), "status": {"$in": ["active", "scheduled"]}}, {"_id": 0})
    if not gc:
        raise HTTPException(404, "Gift card not found")
    t = await _raw_db.tenants.find_one({"id": gc["tenant_id"]}, {"_id": 0}) or {}
    return {"save_url": build_gift_card_save_url(gc, t)}


def wallet_email_button(save_url: str) -> str:
    """Inline-styled 'Add to Google Wallet' button for HTML emails."""
    return (f'<p style="text-align:center;margin:14px 0 4px"><a href="{save_url}" '
            f'style="background:#000;color:#fff;text-decoration:none;font-weight:bold;'
            f'font-family:Arial,sans-serif;font-size:14px;padding:12px 26px;border-radius:26px;'
            f'display:inline-block;border:1px solid #444">&#9645; &nbsp;Add to Google Wallet</a></p>')
