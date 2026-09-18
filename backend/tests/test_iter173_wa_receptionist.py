"""Iter 173 — Mira WhatsApp Receptionist (simulator + threads + human takeover)."""
import os
import re
import time
import pytest
import requests
import asyncio
from datetime import date, timedelta

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

SALON_SLUG = "miracurl-marathahalli"
SALON_EMAIL = "admin@miracurl.com"
SALON_PWD = "q6QY@tn3p#9DtL"

RESTO_SLUG = "infinity-family-restaurant"
RESTO_EMAIL = "infinity.admin@miracurl.com"
RESTO_PWD = "Infinity@2026"


def _login(slug, email, pwd):
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": slug})
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pwd}, timeout=20)
    assert r.status_code == 200, r.text
    csrf = r.json().get("csrf_token") or s.cookies.get("csrf_token")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf})
    s.headers.update({"X-Owner-Pin": "4321"})
    return s


@pytest.fixture(scope="module")
def salon():
    return _login(SALON_SLUG, SALON_EMAIL, SALON_PWD)


@pytest.fixture(scope="module")
def resto():
    return _login(RESTO_SLUG, RESTO_EMAIL, RESTO_PWD)


# ---------- Status ----------
def test_receptionist_status(salon):
    r = salon.get(f"{BASE}/api/whatsapp-link/receptionist", timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "enabled" in d
    assert d.get("feature_on") is True
    assert d.get("channel_ready") is True
    assert d.get("platform_number") == "919180261256"
    assert "wa.me/919180261256" in d.get("invite_link", "")
    inv = d.get("invite_link", "")
    assert (f"#{SALON_SLUG}" in inv) or (f"%23{SALON_SLUG}" in inv)
    assert isinstance(d.get("credits"), int)
    assert d.get("business_type") in ("salon", "restaurant")
    stats = d.get("stats") or {}
    for k in ("messages", "replied", "booked", "guests", "handoffs"):
        assert k in stats, f"missing stat {k}"
    threads = d.get("threads")
    assert isinstance(threads, list)
    for t in threads:
        assert re.fullmatch(r"\d{7,15}", t.get("wa_id", "")), f"bad wa_id {t.get('wa_id')}"


def test_receptionist_qr_png(salon):
    r = salon.get(f"{BASE}/api/whatsapp-link/receptionist/qr.png", timeout=15)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("image/png")
    assert len(r.content) > 200


# ---------- Simulator (Salon full booking flow) ----------
def test_sim_salon_booking_flow(salon):
    session = "regsim1"
    # reset first
    salon.delete(f"{BASE}/api/whatsapp-link/receptionist/simulate/{session}", timeout=15)

    r1 = salon.post(f"{BASE}/api/whatsapp-link/receptionist/simulate",
                    json={"text": "Hi #miracurl-marathahalli are you open? haircut price?", "session": session},
                    timeout=90)
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert d1.get("reply"), "empty reply"
    assert d1.get("booked") is False
    wa_id = d1.get("wa_id")
    assert re.fullmatch(r"\d{7,15}", wa_id)

    r2 = salon.post(f"{BASE}/api/whatsapp-link/receptionist/simulate",
                    json={"text": "I am Rahul, phone 9811122233, book Hair Cut - Men tomorrow 4 pm, any stylist",
                          "session": session}, timeout=90)
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2.get("reply")
    # not yet booked (needs confirm)
    r3 = salon.post(f"{BASE}/api/whatsapp-link/receptionist/simulate",
                    json={"text": "yes confirm", "session": session}, timeout=90)
    assert r3.status_code == 200, r3.text
    d3 = r3.json()
    booking = d3.get("booking") or {}
    assert d3.get("booked") is True, f"not booked: {d3}"
    names = booking.get("service_names") or booking.get("services") or []
    joined = " ".join(names) if isinstance(names, list) else str(names)
    assert "Hair Cut" in joined, f"service_names missing Hair Cut: {booking}"

    # Verify appointment exists tomorrow
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    apr = salon.get(f"{BASE}/api/appointments", params={"date": tomorrow}, timeout=20)
    assert apr.status_code == 200
    appts = apr.json() if isinstance(apr.json(), list) else apr.json().get("appointments", [])
    found = [a for a in appts if "Booked via AI advisor chat" in (a.get("notes") or "")]
    assert found, f"AI advisor booking not found for {tomorrow}"

    # Cleanup — delete appointments + customer
    for a in found:
        aid = a.get("id")
        if aid:
            salon.delete(f"{BASE}/api/appointments/{aid}", timeout=15)
    # Delete customer by phone
    cr = salon.get(f"{BASE}/api/customers", params={"q": "9811122233"}, timeout=15)
    if cr.status_code == 200:
        rows = cr.json() if isinstance(cr.json(), list) else cr.json().get("customers", [])
        for c in rows:
            if re.sub(r"\D", "", c.get("phone", ""))[-10:] == "9811122233":
                salon.delete(f"{BASE}/api/customers/{c['id']}", timeout=15)
    # Reset sim
    salon.delete(f"{BASE}/api/whatsapp-link/receptionist/simulate/{session}", timeout=15)


# ---------- Simulator (Restaurant) ----------
def test_sim_restaurant_reservation_flow(resto):
    session = "regresto1"
    resto.delete(f"{BASE}/api/whatsapp-link/receptionist/simulate/{session}", timeout=15)
    r1 = resto.post(f"{BASE}/api/whatsapp-link/receptionist/simulate",
                    json={"text": "table for 4 tomorrow at 8 pm, name Anil, phone 9822233344, indoor",
                          "session": session}, timeout=90)
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert d1.get("reply")
    r2 = resto.post(f"{BASE}/api/whatsapp-link/receptionist/simulate",
                    json={"text": "yes confirm", "session": session}, timeout=90)
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2.get("booked") is True, f"reservation not booked: {d2}"
    booking = d2.get("booking") or {}
    assert booking.get("party_size") == 4, f"party_size mismatch: {booking}"
    assert "table for 4 is reserved" in (d2.get("reply") or "").lower(), d2.get("reply")

    # Cleanup - best-effort
    cr = resto.get(f"{BASE}/api/customers", params={"q": "9822233344"}, timeout=15)
    if cr.status_code == 200:
        rows = cr.json() if isinstance(cr.json(), list) else cr.json().get("customers", [])
        for c in rows:
            if re.sub(r"\D", "", c.get("phone", ""))[-10:] == "9822233344":
                resto.delete(f"{BASE}/api/customers/{c['id']}", timeout=15)
    resto.delete(f"{BASE}/api/whatsapp-link/receptionist/simulate/{session}", timeout=15)


# ---------- Reset clears history ----------
def test_simulate_reset_clears_history(salon):
    session = "regreset1"
    salon.delete(f"{BASE}/api/whatsapp-link/receptionist/simulate/{session}", timeout=15)
    salon.post(f"{BASE}/api/whatsapp-link/receptionist/simulate",
               json={"text": "book haircut tomorrow 5pm, name Test, phone 9800011122", "session": session}, timeout=90)
    r = salon.delete(f"{BASE}/api/whatsapp-link/receptionist/simulate/{session}", timeout=15)
    assert r.status_code == 200 and r.json().get("ok") is True
    # Fresh session — Mira should ask for name again
    r2 = salon.post(f"{BASE}/api/whatsapp-link/receptionist/simulate",
                    json={"text": "book haircut tomorrow", "session": session}, timeout=90)
    reply = (r2.json().get("reply") or "").lower()
    assert "name" in reply or "phone" in reply, f"expected fresh Mira asking name: {reply}"
    salon.delete(f"{BASE}/api/whatsapp-link/receptionist/simulate/{session}", timeout=15)


# ---------- Thread validation ----------
def test_thread_bad_wa_id_400(salon):
    r = salon.get(f"{BASE}/api/whatsapp-link/receptionist/threads/abc@c.us", timeout=15)
    assert r.status_code == 400


def _db():
    from motor.motor_asyncio import AsyncIOMotorClient
    return AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _seed_thread(wa_id, slug):
    async def _go():
        db = _db()
        t = await db.tenants.find_one({"slug": slug}, {"id": 1})
        await db.whatsapp_messages.insert_one({"direction": "inbound", "message_id": f"wamid.test.{wa_id}", "wa_id": wa_id,
                                               "type": "text", "text": "test", "tenant_id": t["id"], "status": "received",
                                               "created_at": "2026-09-18T00:00:00+00:00"})
    _run(_go())


def _clean_thread(wa_id):
    async def _go():
        db = _db()
        await db.whatsapp_messages.delete_many({"wa_id": wa_id, "message_id": {"$regex": "^wamid.test"}})
        await db.wa_sessions.delete_many({"wa_id": wa_id})
    _run(_go())


def test_thread_human_toggle_and_cleanup(salon):
    wa_id = "919000055555"
    _seed_thread(wa_id, SALON_SLUG)
    try:
        r = salon.put(f"{BASE}/api/whatsapp-link/receptionist/threads/{wa_id}/human", json={"on": True}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("human_until"), "human_until not set"
        r2 = salon.put(f"{BASE}/api/whatsapp-link/receptionist/threads/{wa_id}/human", json={"on": False}, timeout=15)
        assert r2.status_code == 200 and r2.json().get("human_until") is None
    finally:
        _clean_thread(wa_id)


# ---------- SEC-001: a tenant cannot act on another tenant's guest (BOLA) ----------
def test_thread_bola_other_tenant_404(salon, resto):
    wa_id = "919000066666"
    _seed_thread(wa_id, SALON_SLUG)
    try:
        assert resto.get(f"{BASE}/api/whatsapp-link/receptionist/threads/{wa_id}", timeout=15).status_code == 404
        assert resto.put(f"{BASE}/api/whatsapp-link/receptionist/threads/{wa_id}/human", json={"on": True}, timeout=15).status_code == 404
        assert resto.post(f"{BASE}/api/whatsapp-link/receptionist/threads/{wa_id}/reply", json={"text": "hi"}, timeout=15).status_code == 404
        # session must not have been rebound
        async def _sess():
            return await _db().wa_sessions.find_one({"wa_id": wa_id})
        assert _run(_sess()) is None
        assert salon.get(f"{BASE}/api/whatsapp-link/receptionist/threads/{wa_id}", timeout=15).status_code == 200
    finally:
        _clean_thread(wa_id)


# ---------- Staff reply — expect 502 (no live Meta) or 409 (no credits), never 500; credits refunded ----------
def test_reply_meta_failure_not_500(salon):
    wa_id = "919000055555"
    _seed_thread(wa_id, SALON_SLUG)
    try:
        before = salon.get(f"{BASE}/api/whatsapp-link/receptionist", timeout=15).json().get("credits", 0)
        r = salon.post(f"{BASE}/api/whatsapp-link/receptionist/threads/{wa_id}/reply", json={"text": "hi from staff"}, timeout=25)
        assert r.status_code in (502, 409), f"expected 502/409, got {r.status_code} body={r.text[:200]}"
        after = salon.get(f"{BASE}/api/whatsapp-link/receptionist", timeout=15).json().get("credits", 0)
        assert after == before, f"credits changed on failure: {before} -> {after}"
    finally:
        _clean_thread(wa_id)


# ---------- Webhook routing unit test ----------
def test_resolve_inbound_tenant_and_sticky_session():
    import sys
    sys.path.insert(0, "/app/backend")
    from services import wa_receptionist as rec
    from database import _raw_db

    wa_id = "919000077777"
    pn_id = os.environ["WHATSAPP_PHONE_NUMBER_ID"]

    async def _run():
        # Clean first
        await _raw_db.wa_sessions.delete_many({"wa_id": wa_id})
        t1 = await rec.resolve_inbound_tenant(
            {"wa_id": wa_id, "text": "Hi #miracurl-marathahalli", "phone_number_id": pn_id}, None)
        assert t1 is not None and t1.get("slug") == "miracurl-marathahalli"
        # Sticky: no #slug
        t2 = await rec.resolve_inbound_tenant(
            {"wa_id": wa_id, "text": "hello", "phone_number_id": pn_id}, None)
        assert t2 is not None and t2.get("slug") == "miracurl-marathahalli"
        # Cleanup
        await _raw_db.wa_sessions.delete_many({"wa_id": wa_id})

    asyncio.get_event_loop().run_until_complete(_run())


# ---------- Regression: public web chat ----------
def test_public_web_chat_regression():
    r = requests.post(f"{BASE}/api/public/ai-chat/miracurl-marathahalli",
                      json={"message": "hi", "session_id": "regress12345"}, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert (d.get("reply") or d.get("text") or "").strip(), f"empty reply: {d}"
