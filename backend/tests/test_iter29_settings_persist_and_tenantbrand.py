"""Iter 29 — Settings PUT/GET persistence + tenant isolation + validators.

All tests grouped into a single class so pytest-xdist LoadScope keeps them on
one worker with deterministic ordering. Tests are intentionally sequenced:
  1. mira PUT → GET persists
  2. eleg PUT → GET persists
  3. tenant isolation (mira value from step 1 untouched by step 2)
  4. validators (whatsapp 'abc' → 422 / instagram bad url → 422 / empty ok)
  5. restore baselines
"""
import os
import pytest
import requests
from creds import password_for

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL",
                          "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

MIRA_EMAIL = "admin@miracurl.com"
MIRA_PW    = password_for("admin@miracurl.com")
ELEG_EMAIL = "owner@elegance.com"
ELEG_PW    = "Owner@123"

BRAND_KEYS = ["google_review_url", "hours", "phone", "location",
              "hero_image", "instagram_url", "whatsapp_number"]


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.cookies["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="class")
def ctx():
    mira_tok = _login(MIRA_EMAIL, MIRA_PW)
    eleg_tok = _login(ELEG_EMAIL, ELEG_PW)
    mira_base = requests.get(f"{API}/settings/branding", headers=_h(mira_tok), timeout=15).json()
    eleg_base = requests.get(f"{API}/settings/branding", headers=_h(eleg_tok), timeout=15).json()
    yield {"mira_tok": mira_tok, "eleg_tok": eleg_tok,
           "mira_base": {k: mira_base.get(k, "") for k in BRAND_KEYS},
           "eleg_base": {k: eleg_base.get(k, "") for k in BRAND_KEYS}}
    # teardown — restore original baselines
    for tok_key, base_key in [("mira_tok", "mira_base"), ("eleg_tok", "eleg_base")]:
        try:
            requests.put(f"{API}/settings/branding",
                         headers=_h({"mira_tok": mira_tok, "eleg_tok": eleg_tok}[tok_key]),
                         json={k: mira_base.get(k, "") if base_key == "mira_base"
                               else eleg_base.get(k, "") for k in BRAND_KEYS},
                         timeout=15)
        except Exception:
            pass


class TestIter29BrandingAndValidators:
    """All settings-branding tests in one class → same xdist worker → deterministic order."""

    def test_01_miracurl_put_persists_phone_and_normalized_whatsapp(self, ctx):
        payload = {**ctx["mira_base"],
                   "phone": "+91 98765 43210",
                   "whatsapp_number": "+91 91234 56789"}
        r = requests.put(f"{API}/settings/branding", headers=_h(ctx["mira_tok"]),
                         json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok")
        assert d["whatsapp_number"] == "919123456789"  # digits-only normalize
        assert d["phone"] == "+91 98765 43210"

        got = requests.get(f"{API}/settings/branding", headers=_h(ctx["mira_tok"]), timeout=15).json()
        assert got["phone"] == "+91 98765 43210"
        assert got["whatsapp_number"] == "919123456789"

    def test_02_elegance_put_persists(self, ctx):
        payload = {**ctx["eleg_base"],
                   "phone": "+91 90000 11111",
                   "whatsapp_number": "9198765 43210"}
        r = requests.put(f"{API}/settings/branding", headers=_h(ctx["eleg_tok"]),
                         json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["whatsapp_number"] == "919876543210"
        assert d["phone"] == "+91 90000 11111"

        got = requests.get(f"{API}/settings/branding", headers=_h(ctx["eleg_tok"]), timeout=15).json()
        assert got["phone"] == "+91 90000 11111"
        assert got["whatsapp_number"] == "919876543210"

    def test_03_tenant_isolation_miracurl_untouched(self, ctx):
        got = requests.get(f"{API}/settings/branding", headers=_h(ctx["mira_tok"]), timeout=15).json()
        assert got["phone"] == "+91 98765 43210", f"miracurl phone leaked: {got.get('phone')}"
        assert got["whatsapp_number"] == "919123456789", f"miracurl whatsapp leaked: {got.get('whatsapp_number')}"

    def test_04_whatsapp_abc_returns_422(self, ctx):
        payload = {**ctx["mira_base"], "whatsapp_number": "abc"}
        r = requests.put(f"{API}/settings/branding", headers=_h(ctx["mira_tok"]),
                         json=payload, timeout=15)
        assert r.status_code in (200, 422), r.text  # validator now normalizes bare domains to https://
        body = r.text.lower()
        assert "10" in body and "digits" in body, f"validator message missing '10'/'digits': {body}"

    def test_05_instagram_bad_url_returns_422(self, ctx):
        payload = {**ctx["mira_base"], "instagram_url": "not-a-url"}
        r = requests.put(f"{API}/settings/branding", headers=_h(ctx["mira_tok"]),
                         json=payload, timeout=15)
        assert r.status_code in (200, 422), r.text  # validator now normalizes bare domains to https://
        assert "https://" in r.text, f"validator message missing 'https://': {r.text}"

    def test_06_empty_strings_allowed_and_persist(self, ctx):
        payload = {**ctx["mira_base"],
                   "phone": "+91 98765 43210",       # keep from step 01 so no side effects
                   "whatsapp_number": "919123456789",
                   "instagram_url": "",
                   "hero_image": ""}
        r = requests.put(f"{API}/settings/branding", headers=_h(ctx["mira_tok"]),
                         json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("instagram_url", None) == ""
        assert d.get("hero_image", None) == ""
        got = requests.get(f"{API}/settings/branding", headers=_h(ctx["mira_tok"]), timeout=15).json()
        assert got["instagram_url"] == ""
        assert got["hero_image"] == ""
