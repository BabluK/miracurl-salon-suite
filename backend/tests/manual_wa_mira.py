import asyncio, os, sys, time
sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
os.environ["WHATSAPP_PHONE_NUMBER_ID"] = "TEST_PNID"
os.environ["WHATSAPP_DEFAULT_TENANT_SLUG"] = "miracurl-marathahalli"

import services.whatsapp_cloud as wc
import services.whatsapp_inbound as wi
sent = []
async def fake_send(to, body, tenant_id=None):
    sent.append((to, body, tenant_id)); return {"messages": [{"id": f"wamid.fake{len(sent)}"}]}
wc.send_text = fake_send

def payload(mid, text, frm="919876500001"):
    return {"object": "whatsapp_business_account", "entry": [{"id": "1", "changes": [{"field": "messages", "value": {
        "messaging_product": "whatsapp", "metadata": {"display_phone_number": "1555", "phone_number_id": "TEST_PNID"},
        "contacts": [{"profile": {"name": "Test Guest"}, "wa_id": frm}],
        "messages": [{"from": frm, "id": mid, "timestamp": str(int(time.time())), "type": "text", "text": {"body": text}}]}}]}]}

async def main():
    r1 = await wi.process_webhook_payload(payload(f"wamid.t{int(time.time())}a", "Hi"))
    r2 = await wi.process_webhook_payload(payload(f"wamid.t{int(time.time())}b", "price list"))
    print("counts", r1, r2)
    for to, body, tid in sent:
        print("--->", to, tid, "\n", body[:400], "\n")
    from database import _raw_db
    d = await _raw_db.whatsapp_messages.find_one({"wa_id": "919876500001", "status": "replied"}, {"_id": 0, "text": 1, "status": 1, "mira_reply": 1})
    print("stored:", d and {k: str(v)[:80] for k, v in d.items()})
asyncio.run(main())
