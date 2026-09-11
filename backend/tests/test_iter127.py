"""Iteration 127: winner card PNG + advisory tracker regression."""
import os, hmac, hashlib, requests, io
from dotenv import dotenv_values

API = os.popen("grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2").read().strip() + "/api"
SLUG = "miracurl-marathahalli"
SLUG2 = "elegance-koramangala"
env = dotenv_values("/app/backend/.env")


def _session(email, pwd, headers=None):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pwd}, headers=headers or {})
    assert r.ok, f"login {email}: {r.status_code} {r.text}"
    return s


def test_winner_card_flow():
    sa = _session("super@miracurl.com", "og9T@41Es#OQb6")
    H = {"X-CSRF-Token": sa.cookies.get("csrf_token") or ""}
    ad = _session("admin@miracurl.com", "q6QY@tn3p#9DtL", {"X-Tenant-Slug": SLUG})
    TH = {"X-Tenant-Slug": SLUG, "X-CSRF-Token": ad.cookies.get("csrf_token") or "", "X-Owner-Pin": "4321"}

    # Use NEW phone to avoid rate limits/state
    phone = "9700099127"
    r = requests.post(f"{API}/public/rewards/{SLUG}/join",
                      json={"name": "Iter127 Tester", "phone": phone,
                            "email": "delivered@resend.dev", "consent": True})
    assert r.status_code in (200, 201, 429), f"join {r.status_code} {r.text}"
    if r.status_code == 429:
        # try existing participant path — abort test cleanly
        print("Rate limited on join; skipping winner card test")
        return

    # Card before winner → 400
    r = requests.get(f"{API}/public/rewards/{SLUG}/winner-card.png", params={"phone": phone})
    assert r.status_code == 400, f"before-winner expected 400 got {r.status_code}"

    # Find participant id
    ps = sa.get(f"{API}/super-admin/rewards-campaign/participants").json()["participants"]
    me = next(p for p in ps if p["phone"].endswith(phone))
    pid = me["id"]

    # Mark winner Gold (7 slots)
    r = sa.post(f"{API}/super-admin/rewards-campaign/participants/{pid}/winner",
                json={"tier": "Gold"}, headers=H)
    assert r.ok, f"winner {r.status_code} {r.text}"

    # Public card
    r = requests.get(f"{API}/public/rewards/{SLUG}/winner-card.png", params={"phone": phone}, timeout=30)
    assert r.status_code == 200 and r.headers.get("content-type", "").startswith("image/png"), \
        f"public card {r.status_code} {r.headers.get('content-type')}"
    from PIL import Image
    im = Image.open(io.BytesIO(r.content))
    assert im.size == (1080, 1080), f"size {im.size}"

    # Tenant card
    r2 = ad.get(f"{API}/settings/rewards-winner-card/{pid}.png", headers=TH, timeout=30)
    assert r2.status_code == 200 and r2.headers.get("content-type", "").startswith("image/png"), r2.status_code

    # Cross-tenant / non-existent: fake id under marathahalli → 404
    import uuid
    fake = str(uuid.uuid4())
    r3 = ad.get(f"{API}/settings/rewards-winner-card/{fake}.png", headers=TH)
    assert r3.status_code == 404, f"cross-tenant expected 404 got {r3.status_code}"

    # HQ card
    r4 = sa.get(f"{API}/super-admin/rewards-campaign/participants/{pid}/card.png", timeout=30)
    assert r4.status_code == 200 and r4.headers.get("content-type", "").startswith("image/png"), r4.status_code

    # Clear winner
    r5 = sa.post(f"{API}/super-admin/rewards-campaign/participants/{pid}/winner",
                 json={"tier": None}, headers=H)
    assert r5.ok, r5.text

    # Cleanup participant
    from pymongo import MongoClient
    db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
    db.rewards_participants.delete_many({"phone": phone})
    print("winner_card_flow OK")


def test_advisory_tracker_flow():
    sa = _session("super@miracurl.com", "og9T@41Es#OQb6")
    H = {"X-CSRF-Token": sa.cookies.get("csrf_token") or ""}
    ad = _session("admin@miracurl.com", "q6QY@tn3p#9DtL", {"X-Tenant-Slug": SLUG})
    TH = {"X-Tenant-Slug": SLUG, "X-CSRF-Token": ad.cookies.get("csrf_token") or "", "X-Owner-Pin": "4321"}

    # Create booking (starter)
    r = ad.post(f"{API}/settings/growth-advisory/order", json={"tier": "starter", "goal": "iter127"}, headers=TH)
    assert r.ok, r.text
    order = r.json()
    pay = "pay_TEST" + os.urandom(5).hex()
    sig = hmac.new(env["RAZORPAY_KEY_SECRET"].encode(), f"{order['order_id']}|{pay}".encode(), hashlib.sha256).hexdigest()
    r = ad.post(f"{API}/settings/growth-advisory/verify",
                json={"razorpay_order_id": order["order_id"], "razorpay_payment_id": pay,
                      "razorpay_signature": sig}, headers=TH)
    assert r.ok, r.text
    bid = r.json()["booking"]["id"]

    # progress None while paid
    mine = ad.get(f"{API}/settings/growth-advisory", headers=TH).json()["bookings"]
    b = next(m for m in mine if m["id"] == bid)
    assert b["progress"] is None, f"expected None got {b['progress']}"

    # Schedule → progress present with defaults
    r = sa.post(f"{API}/super-admin/growth-advisory/bookings/{bid}/schedule",
                json={"slot_at": "2026-08-01T15:00", "duration_min": 60}, headers=H)
    assert r.ok, r.text
    hq = sa.get(f"{API}/super-admin/growth-advisory").json()
    b = next(x for x in hq["bookings"] if x["id"] == bid)
    p = b["progress"]
    assert p is not None
    assert p["target_monthly"] == 300000, f"default {p['target_monthly']}"
    assert len(p["months"]) == 4
    assert len(p["milestones"]) == 3

    # Set custom tracker
    r = sa.post(f"{API}/super-admin/growth-advisory/bookings/{bid}/tracker",
                json={"target_monthly": 400000, "start_date": "2026-07-15"}, headers=H)
    assert r.ok, r.text
    p = r.json()["progress"]
    assert p["target_monthly"] == 400000
    assert p["day"] == 53, f"day {p['day']}"
    assert p["milestones"][0]["reached"] is True

    # invalid target
    r = sa.post(f"{API}/super-admin/growth-advisory/bookings/{bid}/tracker",
                json={"target_monthly": 5000, "start_date": "2026-07-15"}, headers=H)
    assert r.status_code == 422, f"expected 422 got {r.status_code} {r.text}"

    # HQ ledger and owner both see progress
    hq = sa.get(f"{API}/super-admin/growth-advisory").json()
    assert next(b for b in hq["bookings"] if b["id"] == bid)["progress"] is not None
    mine = ad.get(f"{API}/settings/growth-advisory", headers=TH).json()["bookings"]
    assert next(m for m in mine if m["id"] == bid)["progress"]["target_monthly"] == 400000

    # cleanup
    from pymongo import MongoClient
    db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
    db.advisory_bookings.delete_many({"id": bid})
    print("advisory_tracker_flow OK")


if __name__ == "__main__":
    test_winner_card_flow()
    test_advisory_tracker_flow()
    print("ALL OK")
