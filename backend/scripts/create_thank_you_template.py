"""One-off: create the Meta template miracurl_thank_you (MARKETING, image header, 3 body vars, Book Now URL button)."""
import os, sys, httpx
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
TOK, WABA, APP = os.environ["WHATSAPP_ACCESS_TOKEN"], os.environ["WHATSAPP_BUSINESS_ACCOUNT_ID"], os.environ["META_APP_ID"]
G = "https://graph.facebook.com/v21.0"
SAMPLE = sys.argv[1] if len(sys.argv) > 1 else "/tmp/mdm_campaign.jpg"

data = open(SAMPLE, "rb").read()
s = httpx.post(f"{G}/{APP}/uploads", params={"file_length": len(data), "file_type": "image/jpeg", "access_token": TOK}, timeout=30).json()
print("upload session", s)
u = httpx.post(f"{G}/{s['id']}", content=data, headers={"Authorization": f"OAuth {TOK}", "file_offset": "0", "Content-Type": "application/octet-stream"}, timeout=120).json()
print("handle", u)
handle = u["h"]

body = ("Hi {{1}}! 🙏 A heartfelt thank you from {{2}}.\n\n"
        "You are not just a client — you are a part of our journey. Every visit, every transformation, every smile in the mirror has made us who we are today.\n\n"
        "{{3}}\n\n"
        "Tap Book Now whenever you'd like to visit us again.")
payload = {
    "name": "miracurl_thank_you", "language": "en", "category": "MARKETING", "allow_category_change": True,
    "components": [
        {"type": "HEADER", "format": "IMAGE", "example": {"header_handle": [handle]}},
        {"type": "BODY", "text": body, "example": {"body_text": [["Priya", "MDM Luxury Salon", "With gratitude — MDM Luxury Salon, Harmu, Ranchi ♡"]]}},
        {"type": "FOOTER", "text": "Reply STOP to opt out"},
        {"type": "BUTTONS", "buttons": [
            {"type": "URL", "text": "Book Now", "url": "https://miracurl-suite.com/book/{{1}}", "example": ["https://miracurl-suite.com/book/mdm-luxury-salon"]},
            {"type": "QUICK_REPLY", "text": "Stop promotions"}]},
    ],
}
r = httpx.post(f"{G}/{WABA}/message_templates", json=payload, params={"access_token": TOK}, timeout=60)
print(r.status_code, r.json())
