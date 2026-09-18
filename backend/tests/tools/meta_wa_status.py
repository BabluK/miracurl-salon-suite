"""Meta WhatsApp account snapshot — quota tier, this month's conversations & billing status."""
import json
import os
import time

import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
tok = os.environ["WHATSAPP_ACCESS_TOKEN"]
waba = os.environ["WHATSAPP_BUSINESS_ACCOUNT_ID"]
pid = os.environ["WHATSAPP_PHONE_NUMBER_ID"]
H = {"Authorization": f"Bearer {tok}"}
G = "https://graph.facebook.com/v22.0"


def get(path, fields):
    return requests.get(f"{G}/{path}", params={"fields": fields}, headers=H, timeout=25).json()


print("WABA:", json.dumps(get(waba, "name,account_review_status,currency,timezone_id,ownership_type,primary_funding_id"))[:500])
print("LIMIT:", json.dumps(get(pid, "messaging_limit_tier")))
print("PHONE:", json.dumps(get(pid, "display_phone_number,verified_name,quality_rating,messaging_limit_tier,status,name_status,throughput"))[:500])
end = int(time.time())
start = end - 30 * 86400
print("CONV:", json.dumps(get(waba, f"conversation_analytics.start({start}).end({end}).granularity(DAILY).dimensions(CONVERSATION_CATEGORY)"))[:1500])
print("PRICING:", json.dumps(get(waba, f"pricing_analytics.start({start}).end({end}).granularity(DAILY).dimensions(PRICING_CATEGORY)"))[:1500])
fid = get(waba, "primary_funding_id").get("primary_funding_id")
if fid:
    print("FUNDING:", json.dumps(get(fid, "id,funding_source_details,spend_cap,amount_spent,balance,is_prepay_account,currency"))[:600])
else:
    print("FUNDING: no primary_funding_id on WABA")
