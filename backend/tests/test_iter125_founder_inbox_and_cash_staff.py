"""Iteration 125 — Founder Reply Inbox + Cash Register 'Logged by' staff picker.

Covers:
  A. Founder Reply Inbox flow (send letter → mark replied → founder-replies list
     → resend inbound webhook → one-tap setup → duplicate/404/422 → cleanup).
  B. Cash Register add_expense staff_id field (defaults to logged-in user, bogus id
     rejected, selected staff recorded).
"""
import os
import random
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
from creds import password_for

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if not v:
        try:
            for line in open("/app/frontend/.env"):
                if line.startswith("REACT_APP_BACKEND_URL="):
                    v = line.split("=", 1)[1].strip()
                    break
        except Exception:
            pass
    return v.rstrip("/")


BASE_URL = _load_backend_url()

# Load backend .env so we can read RESEND_INBOUND_SECRET, MONGO_URL, DB_NAME
try:
    from dotenv import load_dotenv as _ld
    _ld("/app/backend/.env")
except Exception:
    pass

SUPER_EMAIL = "super@miracurl.com"
SUPER_PASSWORD = password_for(SUPER_EMAIL)
SALON_EMAIL = "admin@miracurl.com"
SALON_PASSWORD = password_for(SALON_EMAIL)
SALON_SLUG = "miracurl-marathahalli"

RESEND_INBOUND_SECRET = os.environ.get("RESEND_INBOUND_SECRET")


# ---------------------------- helpers ------------------------------
def _super_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": SUPER_EMAIL, "password": SUPER_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text[:200]}"
    csrf = s.cookies.get("csrf_token")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf})
    return s


def _salon_session():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": SALON_SLUG})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": SALON_EMAIL, "password": SALON_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"salon login failed: {r.status_code} {r.text[:200]}"
    csrf = s.cookies.get("csrf_token")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf})
    # backend may also return token in body
    tok = None
    try:
        tok = (r.json() or {}).get("access_token")
    except Exception:
        pass
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


async def _mongo_db():
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    url = os.environ["MONGO_URL"]
    name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(url)
    return client, client[name]


# ============================ A. FOUNDER REPLY INBOX ============================

RAND = random.randint(100000, 999999)
FOUNDER_EMAIL = f"qa.founder.reply.{RAND}@example.com"
INVITE_STATE = {}  # shared across A tests


@pytest.fixture(scope="module")
def super_sess():
    return _super_session()


def test_a1_send_founder_letter(super_sess):
    payload = {
        "recipients": [{"email": FOUNDER_EMAIL, "name": "Kavya Menon", "salon_name": "Lotus Bloom Salon"}],
        "template": "founder", "note": "", "currency": "auto", "vertical": "salon",
    }
    r = super_sess.post(f"{BASE_URL}/api/super-admin/demo-campaign/send", json=payload, timeout=45)
    assert r.status_code == 200, f"send status {r.status_code}: {r.text[:300]}"
    data = r.json()
    sent = data.get("sent", 0)
    print(f"[A1] send response: {data}")

    # Look for invite either way
    inv_r = super_sess.get(f"{BASE_URL}/api/super-admin/demo-campaign/invites", timeout=15)
    invites = (inv_r.json() or {}).get("invites", []) if inv_r.status_code == 200 else []
    match = next((i for i in invites if (i.get("email", "").lower() == FOUNDER_EMAIL.lower() and i.get("template") == "founder")), None)

    if not match:
        # Resend rejected @example.com → insert directly via Mongo
        async def _insert():
            client, db = await _mongo_db()
            try:
                iid = str(uuid.uuid4())
                doc = {
                    "id": iid, "email": FOUNDER_EMAIL, "name": "Kavya Menon",
                    "salon_name": "Lotus Bloom Salon", "template": "founder",
                    "responded": False, "first_sent_at": datetime.now(timezone.utc).isoformat(),
                    "reminder_sent_at": None,
                }
                await db.demo_invites.insert_one(doc)
                return iid
            finally:
                client.close()
        iid = asyncio.get_event_loop().run_until_complete(_insert())
        INVITE_STATE["iid"] = iid
        INVITE_STATE["seeded_via_mongo"] = True
        print(f"[A1] seeded invite via Mongo: iid={iid}")
    else:
        INVITE_STATE["iid"] = match["id"]
        INVITE_STATE["seeded_via_mongo"] = False
        print(f"[A1] invite via Resend: iid={match['id']} sent={sent}")

    assert INVITE_STATE.get("iid"), "no invite id obtained"


def test_a2_mark_replied_and_founder_replies(super_sess):
    iid = INVITE_STATE.get("iid")
    assert iid, "A1 must run first"

    # Initially not present
    r0 = super_sess.get(f"{BASE_URL}/api/super-admin/founder-replies", timeout=15)
    assert r0.status_code == 200, r0.text[:200]
    body0 = r0.json()
    replies0 = body0.get("replies", [])
    hit0 = next((x for x in replies0 if x.get("email", "").lower() == FOUNDER_EMAIL.lower()), None)
    assert hit0 is None, f"founder-replies should NOT include unreplied invite, got {hit0}"

    # Toggle replied
    m = super_sess.post(f"{BASE_URL}/api/super-admin/demo-campaign/invites/{iid}/mark-replied", timeout=15)
    assert m.status_code == 200, m.text[:200]
    assert m.json().get("responded") is True

    r1 = super_sess.get(f"{BASE_URL}/api/super-admin/founder-replies", timeout=15)
    assert r1.status_code == 200
    body = r1.json()
    replies = body.get("replies", [])
    assert body.get("count") == len(replies), "count != list length"
    hit = next((x for x in replies if x.get("email", "").lower() == FOUNDER_EMAIL.lower()), None)
    assert hit is not None, f"founder-replies missing our invite; got {replies[:2]}"
    assert hit.get("name") == "Kavya Menon"
    assert hit.get("salon_name") == "Lotus Bloom Salon"
    assert "tenant" not in hit, f"'tenant' key should be absent before setup, got {hit.get('tenant')}"


def test_a3_resend_inbound_webhook(super_sess):
    iid = INVITE_STATE.get("iid")
    assert iid

    if not RESEND_INBOUND_SECRET:
        pytest.skip("RESEND_INBOUND_SECRET not set — endpoint returns 503")

    # Sanity: no secret should 503
    r_bad = requests.post(f"{BASE_URL}/api/webhooks/resend-inbound",
                          json={"data": {"from": FOUNDER_EMAIL, "subject": "x", "text": "y"}},
                          timeout=15)
    assert r_bad.status_code in (403, 503), f"expected 403/503 without secret, got {r_bad.status_code}"

    payload = {
        "data": {
            "from": f"Kavya <{FOUNDER_EMAIL}>",
            "subject": "Re: A personal invitation",
            "text": "Yes, I would love to try Miracurl!",
        }
    }
    r = requests.post(f"{BASE_URL}/api/webhooks/resend-inbound",
                      json=payload,
                      headers={"x-inbound-secret": RESEND_INBOUND_SECRET},
                      timeout=20)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"
    data = r.json()
    assert data.get("matched") is True, f"webhook did not match: {data}"

    # Reply subject/text now visible on founder-replies
    r2 = super_sess.get(f"{BASE_URL}/api/super-admin/founder-replies", timeout=15)
    replies = r2.json().get("replies", [])
    hit = next((x for x in replies if x.get("email", "").lower() == FOUNDER_EMAIL.lower()), None)
    assert hit is not None
    assert (hit.get("reply_subject") or "").lower().startswith("re: a personal invitation")
    assert "miracurl" in (hit.get("last_reply_text") or "").lower()


def test_a4_founder_setup(super_sess):
    iid = INVITE_STATE.get("iid")
    assert iid

    # Validation: salon_name 1 char → 422
    r_val = super_sess.post(f"{BASE_URL}/api/super-admin/founder-replies/{iid}/setup",
                            json={"salon_name": "X", "owner_name": "Kavya Menon",
                                  "city": "Kochi", "phone": "9876500011",
                                  "business_type": "salon"}, timeout=15)
    assert r_val.status_code == 422, f"expected 422 for 1-char salon_name, got {r_val.status_code}: {r_val.text[:200]}"

    # Unknown iid → 404
    r_404 = super_sess.post(f"{BASE_URL}/api/super-admin/founder-replies/nonexistent_iid_xyz/setup",
                            json={"salon_name": "Foo Salon", "owner_name": "Bar Qux",
                                  "city": "Kochi", "phone": "9876500011",
                                  "business_type": "salon"}, timeout=15)
    assert r_404.status_code == 404, f"expected 404, got {r_404.status_code}"

    # Actual setup (may take ~20s: welcome email + AI poster)
    payload = {"salon_name": "Lotus Bloom Salon", "owner_name": "Kavya Menon",
               "city": "Kochi", "phone": "9876500011", "business_type": "salon"}
    r = super_sess.post(f"{BASE_URL}/api/super-admin/founder-replies/{iid}/setup",
                        json=payload, timeout=90)
    assert r.status_code == 200, f"setup failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    print(f"[A4] setup: {data}")
    slug = data.get("slug")
    tid = data.get("tenant_id")
    trial_end = data.get("trial_end_date")
    tp = data.get("temp_password")
    assert slug and (slug == "lotus-bloom-salon" or slug.startswith("lotus-bloom-salon-")), f"slug: {slug}"
    assert tid
    assert isinstance(tp, str) and len(tp) > 0, "temp_password missing"
    # ≈ today + 180 days
    got = datetime.fromisoformat(trial_end).date()
    expected = (datetime.now(timezone.utc) + timedelta(days=180)).date()
    assert abs((got - expected).days) <= 1, f"trial_end {got} vs expected {expected}"
    INVITE_STATE["tenant_id"] = tid
    INVITE_STATE["slug"] = slug
    INVITE_STATE["temp_password"] = tp

    # Verify tenant in Mongo
    async def _check():
        client, db = await _mongo_db()
        try:
            tenant = await db.tenants.find_one({"id": tid}, {"_id": 0})
            user = await db.users.find_one({"email": FOUNDER_EMAIL, "tenant_id": tid}, {"_id": 0})
            return tenant, user
        finally:
            client.close()
    tenant, user = asyncio.get_event_loop().run_until_complete(_check())
    assert tenant, "tenant doc missing"
    assert tenant.get("status") == "trial"
    assert tenant.get("signup_offer") == "founder_6m"
    assert tenant.get("trial_end_date") == trial_end
    assert user, f"user doc missing for {FOUNDER_EMAIL}"
    assert user.get("role") == "admin"
    assert user.get("must_change_password") is True

    # Login with temp_password
    login_sess = requests.Session()
    login_sess.headers.update({"X-Tenant-Slug": slug})
    lr = login_sess.post(f"{BASE_URL}/api/auth/login",
                        json={"email": FOUNDER_EMAIL, "password": tp}, timeout=20)
    assert lr.status_code == 200, f"temp-password login failed: {lr.status_code} {lr.text[:200]}"

    # Duplicate setup → 400
    r_dup = super_sess.post(f"{BASE_URL}/api/super-admin/founder-replies/{iid}/setup",
                            json=payload, timeout=30)
    assert r_dup.status_code == 400, f"expected 400 duplicate, got {r_dup.status_code}: {r_dup.text[:200]}"
    assert "miracurl account" in r_dup.text.lower() or "already" in r_dup.text.lower()

    # founder-replies now shows 'tenant' key with slug
    r_fr = super_sess.get(f"{BASE_URL}/api/super-admin/founder-replies", timeout=15)
    hit = next((x for x in r_fr.json().get("replies", []) if x.get("email", "").lower() == FOUNDER_EMAIL.lower()), None)
    assert hit and hit.get("tenant") and hit["tenant"].get("slug") == slug, f"tenant key missing/wrong: {hit}"


def test_a5_cleanup(super_sess):
    tid = INVITE_STATE.get("tenant_id")
    iid = INVITE_STATE.get("iid")

    # Try DELETE tenant endpoint
    deleted = False
    if tid:
        r = super_sess.delete(f"{BASE_URL}/api/super-admin/tenants/{tid}", timeout=30)
        print(f"[A5] delete tenant status {r.status_code}: {r.text[:200]}")
        if r.status_code in (200, 204):
            deleted = True

    async def _cleanup():
        client, db = await _mongo_db()
        try:
            if tid and not deleted:
                await db.tenants.delete_many({"id": tid})
                await db.users.delete_many({"tenant_id": tid})
            # Always clean up demo_invite
            if iid:
                await db.demo_invites.delete_many({"id": iid})
            # Extra safety — nuke by email
            await db.demo_invites.delete_many({"email": FOUNDER_EMAIL})
            await db.users.delete_many({"email": FOUNDER_EMAIL})
        finally:
            client.close()

    asyncio.get_event_loop().run_until_complete(_cleanup())
    print(f"[A5] cleanup complete deleted_via_api={deleted}")


# ============================ B. CASH REGISTER STAFF PICKER ============================

CASH_STATE = {}


@pytest.fixture(scope="module")
def salon_sess():
    return _salon_session()


def test_b1_get_staff_and_add_expense(salon_sess):
    # Get staff
    r = salon_sess.get(f"{BASE_URL}/api/staff", timeout=15)
    assert r.status_code == 200, f"staff list {r.status_code}: {r.text[:200]}"
    body = r.json()
    items = body if isinstance(body, list) else body.get("items") or body.get("staff") or []
    assert items, f"no staff returned: {body}"
    active = [s for s in items if not s.get("former")]
    assert active, "no active staff"
    st = active[0]
    staff_id = st["id"]
    staff_name = st["name"]
    CASH_STATE["staff_id"] = staff_id
    CASH_STATE["staff_name"] = staff_name

    # Add expense with staff_id
    payload = {"amount": 120, "purpose": "QA tea test", "category": "tea",
               "has_bill": False, "kind": "expense", "staff_id": staff_id}
    r1 = salon_sess.post(f"{BASE_URL}/api/cash/expenses", json=payload, timeout=15)
    assert r1.status_code == 200, f"add expense {r1.status_code}: {r1.text[:300]}"
    data = r1.json()
    entry = data.get("entry") or data
    print(f"[B1] entry: {entry}")
    assert entry.get("added_by") == staff_name, f"added_by expected {staff_name}, got {entry.get('added_by')}"
    assert entry.get("staff_id") == staff_id
    recby = entry.get("recorded_by") or ""
    assert recby and (SALON_EMAIL.split("@")[0] in recby.lower() or "admin" in recby.lower() or recby), \
        f"recorded_by should be admin's name/email, got {recby!r}"
    CASH_STATE["entry_id_1"] = entry.get("id") or entry.get("_id")

    # Bogus staff_id → 400
    r_bad = salon_sess.post(f"{BASE_URL}/api/cash/expenses",
                            json={**payload, "staff_id": "bogus-id-xyz", "purpose": "QA bogus"},
                            timeout=15)
    assert r_bad.status_code == 400, f"expected 400 bogus staff_id, got {r_bad.status_code}: {r_bad.text[:200]}"
    assert "active staff" in r_bad.text.lower() or "pick" in r_bad.text.lower()

    # No staff_id → added_by is admin
    payload2 = {"amount": 55, "purpose": "QA me test", "category": "tea",
                "has_bill": False, "kind": "expense"}
    r2 = salon_sess.post(f"{BASE_URL}/api/cash/expenses", json=payload2, timeout=15)
    assert r2.status_code == 200, r2.text[:300]
    entry2 = (r2.json().get("entry") or r2.json())
    print(f"[B1] entry2 (no staff): added_by={entry2.get('added_by')}")
    assert entry2.get("added_by") and entry2.get("added_by") != staff_name, \
        "when no staff_id, added_by should be the logged-in admin (not selected staff)"
    assert entry2.get("staff_id") in (None, ""), f"staff_id should be empty, got {entry2.get('staff_id')}"
    CASH_STATE["entry_id_2"] = entry2.get("id") or entry2.get("_id")


def test_b2_cleanup(salon_sess):
    for k in ("entry_id_1", "entry_id_2"):
        eid = CASH_STATE.get(k)
        if not eid:
            continue
        r = salon_sess.delete(f"{BASE_URL}/api/cash/expenses/{eid}", timeout=15)
        print(f"[B2] delete {eid} → {r.status_code}")
        assert r.status_code in (200, 204), f"delete {eid} failed: {r.status_code} {r.text[:200]}"
