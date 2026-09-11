"""Seed QA Link Guest colour bookings for UI testing."""
import requests, os, sys
from datetime import datetime, timedelta, timezone

BASE = "https://hair-hub-system.preview.emergentagent.com"
SLUG = "miracurl-marathahalli"

s = requests.Session()
r = s.post(f"{BASE}/api/auth/login", json={"email":"admin@miracurl.com","password":"q6QY@tn3p#9DtL"}, headers={"X-Tenant-Slug": SLUG})
assert r.status_code == 200, r.text
csrf = s.cookies.get("csrf_token")
s.headers.update({"X-Tenant-Slug": SLUG, "X-CSRF-Token": csrf})

# Find Hair Color - Global service
svcs = s.get(f"{BASE}/api/services").json()
if isinstance(svcs, dict): svcs = svcs.get("services") or []
color_svc = next(x for x in svcs if x["name"] == "Hair Color - Global")

# Link burgundy
r = s.put(f"{BASE}/api/hair-colors/burgundy/service", json={"service_id": color_svc["id"]})
print("link burgundy:", r.status_code, r.json())

# public services
ps = requests.get(f"{BASE}/api/public/services/{SLUG}").json()
if isinstance(ps, dict): ps = ps.get("services") or []
non_color = next(x for x in ps if "color" not in x["name"].lower())
print("non-color svc:", non_color["name"])

tz = timezone(timedelta(hours=5, minutes=30))

# Booking 1: burgundy (linked)
pr = requests.post(f"{BASE}/api/public/color/{SLUG}/pick", json={"color_id":"burgundy","name":"QA Link Guest","phone":"9000000088"}).json()
sched = (datetime.now(tz) + timedelta(days=3)).replace(hour=12,minute=30,second=0,microsecond=0).isoformat()
br = requests.post(f"{BASE}/api/public/book/{SLUG}", json={
    "customer_name":"QA Link Guest","customer_phone":"9000000088",
    "service_ids":[non_color["id"]],"scheduled_at":sched,"color_code":pr["code"]
})
print("book1:", br.status_code)
appt1 = (br.json().get("appointment") or br.json())
print("appt1 id:", appt1["id"], "services:", appt1["service_names"])

# Unlink burgundy, then copper-brown booking
s.put(f"{BASE}/api/hair-colors/burgundy/service", json={"service_id": None})
pr = requests.post(f"{BASE}/api/public/color/{SLUG}/pick", json={"color_id":"copper-brown","name":"QA Link Guest","phone":"9000000088"}).json()
sched2 = (datetime.now(tz) + timedelta(days=4)).replace(hour=13,minute=0,second=0,microsecond=0).isoformat()
br2 = requests.post(f"{BASE}/api/public/book/{SLUG}", json={
    "customer_name":"QA Link Guest","customer_phone":"9000000088",
    "service_ids":[non_color["id"]],"scheduled_at":sched2,"color_code":pr["code"]
})
appt2 = (br2.json().get("appointment") or br2.json())
print("appt2:", appt2["id"], appt2["service_names"])

# Re-link burgundy for UI test of public page price badge
r = s.put(f"{BASE}/api/hair-colors/burgundy/service", json={"service_id": color_svc["id"]})
print("relink burgundy:", r.status_code)
print("CUSTOMER_ID:", appt1["customer_id"])
