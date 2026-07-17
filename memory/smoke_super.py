import asyncio, os, re, json
import requests
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
import sys
sys.path.insert(0, '/app/backend')
from server import app

API = None
for line in open('/app/frontend/.env'):
    if line.startswith('REACT_APP_BACKEND_URL='):
        API = line.split('=', 1)[1].strip()

s = requests.Session()
r = s.post(f"{API}/api/auth/login", json={"email": "super@miracurl.com", "password": "og9T@41Es#OQb6"})
print("super login:", r.status_code)

get_routes = []
for rt in app.routes:
    if not hasattr(rt, 'methods'):
        continue
    if 'GET' in rt.methods and ('/super-admin' in rt.path or rt.path.startswith('/api/super/')):
        get_routes.append(rt.path)

print(f"{len(get_routes)} super-admin GET routes found")
bad = []
for path in sorted(get_routes):
    url = path
    # fill path params with dummies
    url = re.sub(r'\{[^}]+\}', 'smoke-test-dummy', url)
    try:
        resp = s.get(f"{API}{url}", timeout=25)
        code = resp.status_code
    except Exception as e:
        code = f"EXC {e}"
    ok = code in (200, 404, 400, 422)  # 404/400/422 acceptable for dummy params
    status = "OK " if ok else "BAD"
    if not ok:
        bad.append((path, code))
    print(f"{status} {code} {path}")

print("\n==== RESULT ====")
if bad:
    for p, c in bad:
        print("FAILING:", c, p)
else:
    print("All super-admin GET endpoints healthy (200 or expected 4xx for dummy IDs)")
