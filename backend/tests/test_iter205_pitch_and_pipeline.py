"""Iter 205 — Pitch Preview + Pipeline vertical filter + WA Bablu intro + email_source + IG unit helpers."""
import os
import re
import urllib.parse
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
SUPER_EMAIL = "admin@miracurl-suite.com"
SUPER_PASS = "og9T@41Es#OQb6"


@pytest.fixture(scope="module")
def sa_client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    csrf = s.cookies.get("csrf_token")
    s.headers.update({"X-CSRF-Token": csrf, "Origin": BASE_URL, "Content-Type": "application/json"})
    return s


# ---------------- Pitch preview ----------------

@pytest.mark.parametrize("vertical", ["restaurant", "salon"])
def test_pitch_preview_ok(sa_client, vertical):
    r = sa_client.post(f"{BASE_URL}/api/super-admin/mira/outreach/pitch-preview",
                       json={"vertical": vertical, "notes": "Mention GST billing early"}, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    for k in ("vertical", "is_sample", "notes", "lead", "subject", "body", "html"):
        assert k in data, f"missing {k}"
    assert data["vertical"] == vertical
    assert data["subject"].strip()
    assert data["body"].strip()
    assert data["body"][:40] in data["html"] or data["body"].split("\n")[0] in data["html"]
    assert data["lead"].get("name")


def test_pitch_preview_invalid_vertical(sa_client):
    r = sa_client.post(f"{BASE_URL}/api/super-admin/mira/outreach/pitch-preview",
                       json={"vertical": "spa"}, timeout=30)
    assert r.status_code == 422


# ---------------- Settings pitch_notes partial merge + truncation ----------------

def test_pitch_notes_partial_merge_and_truncate(sa_client):
    # Capture current settings
    r = sa_client.get(f"{BASE_URL}/api/super-admin/mira/outreach/summary", timeout=20)
    assert r.status_code == 200
    before = r.json()["settings"]

    # Partial update: only restaurant
    r = sa_client.put(f"{BASE_URL}/api/super-admin/mira/outreach/settings",
                      json={"pitch_notes": {"restaurant": "Mention GST billing early."}}, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["pitch_notes"] == {"salon": "", "restaurant": "Mention GST billing early."}
    # Other settings preserved
    for k in ("daily_email_limit", "per_cycle", "max_reviews", "include_luxury", "followup_days"):
        assert body.get(k) == before.get(k), f"{k} changed: {before.get(k)} -> {body.get(k)}"

    # GET summary reflects
    r2 = sa_client.get(f"{BASE_URL}/api/super-admin/mira/outreach/summary", timeout=20)
    assert r2.json()["settings"]["pitch_notes"]["restaurant"] == "Mention GST billing early."

    # Truncation
    big = "x" * 2000
    r3 = sa_client.put(f"{BASE_URL}/api/super-admin/mira/outreach/settings",
                       json={"pitch_notes": {"restaurant": big, "salon": big}}, timeout=20)
    assert r3.status_code == 200
    pn = r3.json()["pitch_notes"]
    assert len(pn["restaurant"]) == 1500
    assert len(pn["salon"]) == 1500

    # Reset
    r4 = sa_client.put(f"{BASE_URL}/api/super-admin/mira/outreach/settings",
                      json={"pitch_notes": {"salon": "", "restaurant": ""}}, timeout=20)
    assert r4.status_code == 200
    assert r4.json()["pitch_notes"] == {"salon": "", "restaurant": ""}


# ---------------- Pipeline totals + vertical filter + WA link ----------------

def _assert_wa(wa_link: str, vertical: str):
    assert wa_link.startswith("https://wa.me/")
    text = urllib.parse.unquote(wa_link.split("?text=", 1)[1])
    assert text.startswith("Hi"), text[:50]
    assert "I'm Bablu, Founder of *Miracurl Suite*" in text
    assert "30 days FREE" in text
    if vertical == "restaurant":
        assert "/signup-restaurant" in text
    else:
        assert "/signup-salon" in text
    assert "/demo" in text
    assert "90" not in text, "Must not contain '90' day offer"


def test_pipeline_all(sa_client):
    r = sa_client.get(f"{BASE_URL}/api/super-admin/mira/pipeline", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "columns" in d and "counts" in d and "totals" in d
    assert set(d["totals"].keys()) == {"salon", "restaurant"}
    assert d["vertical"] == "all"
    # Validate wa_link for any lead with phone
    found_wa = False
    for col in d["columns"]:
        for lead in col["leads"]:
            assert "vertical" in lead
            if lead.get("phone") and lead.get("wa_link"):
                _assert_wa(lead["wa_link"], lead.get("vertical") or "salon")
                found_wa = True
                break
        if found_wa:
            break
    # Not fatal if no phone leads exist in preview
    print(f"Pipeline totals: {d['totals']}, found_wa={found_wa}")


def test_pipeline_salon_filter(sa_client):
    r = sa_client.get(f"{BASE_URL}/api/super-admin/mira/pipeline?vertical=salon", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["vertical"] == "salon"
    for col in d["columns"]:
        for lead in col["leads"]:
            v = lead.get("vertical")
            assert v in ("salon", None, ""), f"non-salon leaked: {v}"


def test_pipeline_restaurant_filter(sa_client):
    r = sa_client.get(f"{BASE_URL}/api/super-admin/mira/pipeline?vertical=restaurant", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["vertical"] == "restaurant"
    for col in d["columns"]:
        for lead in col["leads"]:
            assert lead.get("vertical") == "restaurant"


# ---------------- WhatsApp endpoint ----------------

def test_whatsapp_bablu_intro(sa_client):
    # find a lead with phone
    r = sa_client.get(f"{BASE_URL}/api/super-admin/mira/pipeline", timeout=30)
    assert r.status_code == 200
    lid = None
    vert = "salon"
    for col in r.json()["columns"]:
        for lead in col["leads"]:
            if lead.get("phone"):
                lid = lead["id"]
                vert = lead.get("vertical") or "salon"
                break
        if lid:
            break
    if not lid:
        pytest.skip("No lead with phone available in pipeline")
    r2 = sa_client.get(f"{BASE_URL}/api/super-admin/mira-leads/{lid}/whatsapp", timeout=20)
    assert r2.status_code == 200, r2.text
    msg = r2.json()["message"]
    assert "30 days FREE" in msg
    assert "— Bablu" in msg and "Founder, Miracurl Suite" in msg
    assert "90" not in msg


# ---------------- Replies ----------------

def test_replies_source_keys(sa_client):
    r = sa_client.get(f"{BASE_URL}/api/super-admin/mira/replies", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert "replies" in d
    # Fields may be absent on old rows — spec says may be absent. Just validate shape.
    for row in d["replies"]:
        assert "channel" in row and row["channel"] in ("email", "whatsapp")


# ---------------- Edit lead sets email_source=manual ----------------

def test_edit_lead_sets_manual_source(sa_client):
    r = sa_client.get(f"{BASE_URL}/api/super-admin/mira-leads?limit=5", timeout=20)
    assert r.status_code == 200, r.text
    rows = r.json() if isinstance(r.json(), list) else (r.json().get("leads") or r.json().get("items") or [])
    if not rows:
        pytest.skip("No leads to edit")
    lid = rows[0]["id"]
    r2 = sa_client.put(f"{BASE_URL}/api/super-admin/mira-leads/{lid}",
                       json={"email": "owner.test@gmail.com"}, timeout=20)
    assert r2.status_code == 200, r2.text
    doc = r2.json()
    # Returned doc may be {lead:{...}} or flat
    lead = doc.get("lead", doc)
    assert lead.get("email_source") == "manual", lead
