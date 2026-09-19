"""One-off: (1) miracurl_owner_guide (UTILITY, PDF header) and (2) MDM-specific campaign templates with a 'Call now' phone button."""
import os, httpx
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
TOK, WABA, APP = os.environ["WHATSAPP_ACCESS_TOKEN"], os.environ["WHATSAPP_BUSINESS_ACCOUNT_ID"], os.environ["META_APP_ID"]
G = "https://graph.facebook.com/v21.0"
MDM_PHONE = "+919608424704"


def upload(path, mime):
    data = open(path, "rb").read()
    s = httpx.post(f"{G}/{APP}/uploads", params={"file_length": len(data), "file_type": mime, "access_token": TOK}, timeout=30).json()
    u = httpx.post(f"{G}/{s['id']}", content=data, headers={"Authorization": f"OAuth {TOK}", "file_offset": "0", "Content-Type": "application/octet-stream"}, timeout=120).json()
    return u["h"]


def create(payload):
    r = httpx.post(f"{G}/{WABA}/message_templates", json=payload, params={"access_token": TOK}, timeout=60)
    print(payload["name"], r.status_code, r.json())


pdf_h = upload("/app/frontend/public/guides/mdm-whatsapp-campaign-guide.pdf", "application/pdf")
create({"name": "miracurl_owner_guide", "language": "en", "category": "UTILITY",
        "components": [
            {"type": "HEADER", "format": "DOCUMENT", "example": {"header_handle": [pdf_h]}},
            {"type": "BODY", "text": "Hi {{1}}, welcome to Miracurl Suite! 🎉\n\nAttached is your 5-step guide to send WhatsApp campaigns to all your guests from {{2}} — 500 per batch, nobody messaged twice, live delivered/read reports.\n\nNeed a hand? Reply here or call Miracurl support.",
             "example": {"body_text": [["Bablu", "MDM Luxury Salon"]]}},
            {"type": "FOOTER", "text": "Miracurl Suite · miracurl-suite.com"},
            {"type": "BUTTONS", "buttons": [{"type": "PHONE_NUMBER", "text": "Call Miracurl", "phone_number": "+919180379552"}]},
        ]})

img_h = upload("/tmp/mdm_campaign.jpg", "image/jpeg")
create({"name": "mdm_thank_you_call", "language": "en", "category": "MARKETING", "allow_category_change": True,
        "components": [
            {"type": "HEADER", "format": "IMAGE", "example": {"header_handle": [img_h]}},
            {"type": "BODY", "text": "Hi {{1}}! 🙏 A heartfelt thank you from {{2}}.\n\nYou are not just a client — you are a part of our journey. Every visit, every transformation, every smile in the mirror has made us who we are today.\n\n{{3}}\n\nTap Call now whenever you'd like to visit us again.",
             "example": {"body_text": [["Priya", "MDM Luxury Salon", "With gratitude — MDM Luxury Salon, Harmu, Ranchi ♡"]]}},
            {"type": "FOOTER", "text": "Reply STOP to opt out"},
            {"type": "BUTTONS", "buttons": [{"type": "PHONE_NUMBER", "text": "Call now", "phone_number": MDM_PHONE}, {"type": "QUICK_REPLY", "text": "Stop promotions"}]},
        ]})
create({"name": "mdm_festival_offer_call", "language": "en", "category": "MARKETING", "allow_category_change": True,
        "components": [
            {"type": "HEADER", "format": "IMAGE", "example": {"header_handle": [img_h]}},
            {"type": "BODY", "text": "Hi {{1}}! {{2}} wishes you and your family a very Happy {{3}} 🎉\n\nCelebrate with our festive treat: *{{4}}* — valid till {{5}}.\n\nTap Call now to reserve your slot.",
             "example": {"body_text": [["Priya", "MDM Luxury Salon", "Diwali", "Flat 20% off on all hair & skin services", "12 Nov"]]}},
            {"type": "FOOTER", "text": "Reply STOP to opt out"},
            {"type": "BUTTONS", "buttons": [{"type": "PHONE_NUMBER", "text": "Call now", "phone_number": MDM_PHONE}, {"type": "QUICK_REPLY", "text": "Stop promotions"}]},
        ]})
