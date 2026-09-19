"""One-off: Thank-You v2 templates with the owner-approved wording (platform + MDM 'Call now' variant)."""
import os
import httpx
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
G = "https://graph.facebook.com/v21.0"
TOK, WABA, APP = os.environ["WHATSAPP_ACCESS_TOKEN"], os.environ["WHATSAPP_BUSINESS_ACCOUNT_ID"], os.environ["META_APP_ID"]

data = open("/tmp/mdm_campaign.jpg", "rb").read()
s = httpx.post(f"{G}/{APP}/uploads", params={"file_length": len(data), "file_type": "image/jpeg", "access_token": TOK}, timeout=30).json()
u = httpx.post(f"{G}/{s['id']}", content=data, headers={"Authorization": f"OAuth {TOK}", "file_offset": "0", "Content-Type": "application/octet-stream"}, timeout=120).json()
handle = u["h"]

BODY = ("Hi {{1}}! \u2764\ufe0f To our wonderful {{2}} family, thank you for your trust, love and continued support. "
        "Every visit means so much to us. \u2728\n\nWith gratitude,\n{{3}} \u2661")
EX = [["Bablu", "MDM Luxury Salon", "MDM Luxury Salon, Ranchi"]]


def create(name, buttons):
    payload = {"name": name, "language": "en", "category": "MARKETING", "components": [
        {"type": "HEADER", "format": "IMAGE", "example": {"header_handle": [handle]}},
        {"type": "BODY", "text": BODY, "example": {"body_text": EX}},
        {"type": "FOOTER", "text": "Reply STOP to opt out"},
        {"type": "BUTTONS", "buttons": buttons},
    ]}
    r = httpx.post(f"{G}/{WABA}/message_templates", json=payload, params={"access_token": TOK}, timeout=60)
    print(name, r.status_code, r.json())


create("miracurl_thank_you_v2", [
    {"type": "URL", "text": "Book Now", "url": "https://miracurl-suite.com/book/{{1}}", "example": ["https://miracurl-suite.com/book/mdm-luxury-salon"]},
    {"type": "QUICK_REPLY", "text": "Stop promotions"},
])
create("mdm_thank_you_call_v2", [
    {"type": "PHONE_NUMBER", "text": "Call now", "phone_number": "+919608424704"},
    {"type": "QUICK_REPLY", "text": "Stop promotions"},
])
