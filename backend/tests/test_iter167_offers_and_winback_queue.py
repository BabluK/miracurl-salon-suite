"""Iter 167: winback blast preview/queue own_number path, campaign compose offer_type/service_ids/discount_pct guardrails.
NO real sends triggered — dry_run only + compose is LLM-only."""
import os
import requests
import pytest
import os as _os
import sys as _sys

_sys.path.insert(0, _os.path.dirname(__file__))
from _creds import password_for  # noqa: E402

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PW = password_for("admin@miracurl.com", "TEST_ADMIN_PASSWORD")
TENANT = "miracurl-marathahalli"


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT, "Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert r.status_code == 200, r.text
    csrf = s.cookies.get("csrf_token") or s.cookies.get("csrf")
    if csrf:
        s.headers["X-CSRF-Token"] = csrf
    s.headers["X-Owner-Pin"] = "4321"
    return s


# ---- winback blast preview ----
def test_winback_preview_own_number_true(sess):
    r = sess.get(f"{BASE}/api/winback/blast/preview?days=45")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["own_number"] is True, d
    assert d["whatsapp_enabled"] is True, d
    assert d["eligible"] > 0, d


def test_winback_blast_dry_run_no_queue(sess):
    # Snapshot campaigns count
    before = sess.get(f"{BASE}/api/whatsapp-link/campaigns").json()["campaigns"]
    r = sess.post(f"{BASE}/api/winback/blast", json={"days": 45, "limit": 100, "dry_run": True})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["dry_run"] is True
    assert d["sent"] == 0
    # Verify NO new campaign was created
    after = sess.get(f"{BASE}/api/whatsapp-link/campaigns").json()["campaigns"]
    assert len(after) == len(before), f"dry_run should not queue campaign, before={len(before)} after={len(after)}"


# ---- compose offer_type / service_ids / discount_pct guardrails ----
@pytest.fixture(scope="module")
def sample_ids(sess):
    custs = sess.get(f"{BASE}/api/customers?limit=1").json()
    if isinstance(custs, dict):
        custs = custs.get("customers") or custs.get("items") or []
    assert custs, "no customers"
    cid = custs[0]["id"]
    svcs = sess.get(f"{BASE}/api/services").json()
    if isinstance(svcs, dict):
        svcs = svcs.get("services") or svcs.get("items") or []
    assert svcs, "no services"
    return cid, svcs[0]["id"], svcs[0]["name"]


def test_compose_festive_includes_service_name(sess, sample_ids):
    cid, sid, sname = sample_ids
    r = sess.post(f"{BASE}/api/whatsapp-link/campaigns/compose",
                  json={"customer_ids": [cid], "brief": "", "offer_type": "festive", "service_ids": [sid]})
    assert r.status_code == 200, r.text
    text = r.json().get("text", "")
    assert text, "empty text"
    # service name should appear
    assert sname.split()[0].lower() in text.lower(), f"service name '{sname}' not in text: {text[:400]}"


def test_compose_discount_20pct_in_text(sess, sample_ids):
    cid, sid, _ = sample_ids
    r = sess.post(f"{BASE}/api/whatsapp-link/campaigns/compose",
                  json={"customer_ids": [cid], "brief": "", "offer_type": "discount",
                        "discount_pct": 20, "service_ids": [sid]})
    assert r.status_code == 200, r.text
    text = r.json().get("text", "")
    assert "20" in text, f"20% not in text: {text[:400]}"


def test_compose_bogus_offer_type_422(sess, sample_ids):
    cid, _, _ = sample_ids
    r = sess.post(f"{BASE}/api/whatsapp-link/campaigns/compose",
                  json={"customer_ids": [cid], "brief": "", "offer_type": "bogus"})
    assert r.status_code == 422, r.text


def test_compose_discount_too_low_422(sess, sample_ids):
    cid, _, _ = sample_ids
    r = sess.post(f"{BASE}/api/whatsapp-link/campaigns/compose",
                  json={"customer_ids": [cid], "brief": "", "offer_type": "discount", "discount_pct": 3})
    assert r.status_code == 422, r.text
