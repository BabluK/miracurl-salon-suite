"""Iteration 128: Model voting public endpoints for miracurl-marathahalli."""
import os
import secrets
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].splitlines()[0]).rstrip("/")
SLUG = "miracurl-marathahalli"
SESSION = requests.Session()
SESSION.headers.update({"Content-Type": "application/json"})


def _applicants(voter=""):
    r = SESSION.get(f"{BASE_URL}/api/public/rewards/{SLUG}/applicants", params={"voter": voter} if voter else None)
    assert r.status_code == 200, r.text
    return r.json()


def test_applicants_list_shape():
    data = _applicants()
    assert "applicants" in data and "total_votes" in data
    apps = data["applicants"]
    assert len(apps) >= 1
    a = apps[0]
    for k in ("id", "name", "photo_url", "votes", "voted", "rank"):
        assert k in a, f"missing {k}"
    # Abbreviated name like "Ananya R."
    assert "." in a["name"] or " " in a["name"]
    assert data["total_votes"] >= 2  # existing votes preserved


def test_applicants_with_voter_shows_voted():
    data = _applicants(voter="9811100001")
    voted_any = any(a["voted"] for a in data["applicants"])
    assert voted_any, "expected existing voter 9811100001 to show voted=true on at least one applicant"


def test_vote_self_forbidden():
    apps = _applicants()["applicants"]
    ananya = next((a for a in apps if a["name"].startswith("Ananya")), apps[0])
    r = SESSION.post(f"{BASE_URL}/api/public/rewards/{SLUG}/vote",
                     json={"participant_id": ananya["id"], "phone": "9700011299"})
    assert r.status_code == 400
    assert "yourself" in r.text.lower()


def test_vote_unknown_participant():
    r = SESSION.post(f"{BASE_URL}/api/public/rewards/{SLUG}/vote",
                     json={"participant_id": "does-not-exist-1234", "phone": "9812345678"})
    assert r.status_code == 404


def test_vote_invalid_phone():
    apps = _applicants()["applicants"]
    r = SESSION.post(f"{BASE_URL}/api/public/rewards/{SLUG}/vote",
                     json={"participant_id": apps[0]["id"], "phone": "123"})
    assert r.status_code in (400, 422)


def test_vote_toggle_new_phone():
    apps = _applicants()["applicants"]
    ananya = next((a for a in apps if a["name"].startswith("Ananya")), apps[0])
    before = ananya["votes"]
    # Fresh phone (avoid clashing with existing 9811100001/2)
    ph = f"981110{(1000 + secrets.randbelow(9000))}"
    r1 = SESSION.post(f"{BASE_URL}/api/public/rewards/{SLUG}/vote",
                      json={"participant_id": ananya["id"], "phone": ph})
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert d1["voted"] is True
    assert d1["votes"] == before + 1
    # Toggle off
    r2 = SESSION.post(f"{BASE_URL}/api/public/rewards/{SLUG}/vote",
                      json={"participant_id": ananya["id"], "phone": ph})
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2["voted"] is False
    assert d2["votes"] == before


def test_me_includes_vote_count_and_id():
    r = SESSION.get(f"{BASE_URL}/api/public/rewards/{SLUG}/me", params={"phone": "9700011299"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert "id" in j
    assert "entries" in j
    assert "vote_count" in j["entries"]
    # And matches applicant votes for ananya
    apps = _applicants()["applicants"]
    ananya = next((a for a in apps if a["id"] == j["id"]), None)
    assert ananya is not None
    assert j["entries"]["vote_count"] == ananya["votes"]


def test_public_campaign_events_and_winners():
    r = SESSION.get(f"{BASE_URL}/api/public/rewards/{SLUG}")
    assert r.status_code == 200, r.text
    j = r.json()
    assert "campaign" in j
    assert "winners" in j
    events = j["campaign"].get("events") or []
    assert len(events) == 4, f"expected 4 events, got {len(events)}: {events}"
    labels = " ".join(str(e) for e in events).lower()
    assert "casting closes" in labels or "closes" in labels
    assert "announced" in labels or "brand model" in labels
