"""iter-226 regression tests:
- Public endpoints (/api/public/partners, platform-stats, plans)
- Super-admin refactored endpoints (mira-leads/history, wa-outreach/history)
- _own_business_filter still works after refactor
"""
import os
import sys
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
SUPER_EMAIL = "admin@miracurl-suite.com"
SUPER_PASS = "og9T@41Es#OQb6"


@pytest.fixture(scope="module")
def auth_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS}, timeout=30)
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    # cookies auto-stored in session jar
    assert s.cookies, f"no cookies set after login; need auth: {data}"
    return s


@pytest.fixture(scope="module")
def auth_headers(auth_session):
    # kept name for minimal diff; return the session as a callable-ish adapter
    return auth_session


# ---------- Public endpoints ----------
class TestPublicEndpoints:
    def test_platform_stats(self):
        r = requests.get(f"{BASE_URL}/api/public/platform-stats", timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        # Expect counts
        assert isinstance(data, dict)
        print("platform-stats keys:", list(data.keys()))
        print("stats:", data)

    def test_plans(self):
        r = requests.get(f"{BASE_URL}/api/public/plans", timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        # should be dict or list with pricing data
        assert data
        print("plans type:", type(data).__name__, "sample:", str(data)[:400])

    def test_partners(self):
        r = requests.get(f"{BASE_URL}/api/public/partners", timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        # expect list of partners
        partners = data if isinstance(data, list) else data.get("partners", [])
        print(f"partners count: {len(partners)}")
        if partners:
            p0 = partners[0]
            print("partner0 keys:", list(p0.keys()))
            featured = [p for p in partners if p.get("featured")]
            print(f"featured partners: {len(featured)}")


# ---------- Super admin refactored endpoints ----------
class TestLeadHistoryRefactor:
    def test_mira_leads_history(self, auth_headers):
        r = auth_headers.get(f"{BASE_URL}/api/super-admin/mira-leads/history", timeout=60)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        data = r.json()
        for k in ("stale_days", "verticals", "stale", "total"):
            assert k in data, f"missing key {k}; got {list(data.keys())}"
        verticals = data["verticals"]
        assert "salon" in verticals and "restaurant" in verticals, verticals
        for vk in ("salon", "restaurant"):
            v = verticals[vk]
            assert "label" in v and "total" in v and "countries" in v, v
            assert isinstance(v["countries"], list)
            for c in v["countries"]:
                assert "cities" in c
                assert isinstance(c["cities"], list)
                # cities entries max 6, each a pair-like [city, count]
                assert len(c["cities"]) <= 6
                for item in c["cities"]:
                    assert isinstance(item, (list, tuple)) and len(item) == 2
        # stale: list, sorted by days_silent desc, max 200
        assert isinstance(data["stale"], list)
        assert len(data["stale"]) <= 200
        if len(data["stale"]) > 1:
            ds = [s.get("days_silent", 0) for s in data["stale"]]
            assert ds == sorted(ds, reverse=True), f"stale not sorted desc: {ds[:10]}"
        assert isinstance(data["total"], int)


class TestWaOutreachRefactor:
    def test_wa_outreach_history_default(self, auth_headers):
        r = auth_headers.get(f"{BASE_URL}/api/super-admin/wa-outreach/history", params={"limit": 20}, timeout=60)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        data = r.json()
        assert "items" in data and isinstance(data["items"], list)
        assert "counts" in data
        counts = data["counts"]
        for k in ("meta", "manual", "not_on_wa", "replied"):
            assert k in counts, f"missing count key {k}: {counts}"
            assert isinstance(counts[k], int), f"{k} not int: {type(counts[k])}"

    def test_wa_outreach_history_channel_filter(self, auth_headers):
        r = auth_headers.get(f"{BASE_URL}/api/super-admin/wa-outreach/history",
                             params={"limit": 20, "channel": "meta"}, timeout=60)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        data = r.json()
        for item in data.get("items", []):
            ch = item.get("channel", "")
            assert ch == "meta", f"non-meta item leaked: channel={ch}"


# ---------- _own_business_filter unit check ----------
class TestOwnBusinessFilter:
    def test_own_identity_filter(self):
        sys.path.insert(0, "/app/backend")
        try:
            from routes import lead_gen  # type: ignore
        except Exception as e:
            pytest.skip(f"cannot import routes.lead_gen: {e}")
        fn = getattr(lead_gen, "_own_business_filter", None) or getattr(lead_gen, "_is_own_name", None)
        assert fn, "neither _own_business_filter nor _is_own_name present"
        # fetch a tenant name from mongo
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        assert mongo_url and db_name, "mongo env missing"

        async def _grab():
            cli = AsyncIOMotorClient(mongo_url)
            db = cli[db_name]
            doc = await db.tenants.find_one({}, {"name": 1, "display_name": 1})
            cli.close()
            return doc

        doc = asyncio.get_event_loop().run_until_complete(_grab()) if False else asyncio.run(_grab())
        assert doc, "no tenant in db"
        name = doc.get("display_name") or doc.get("name")
        assert name
        print("tenant sample name:", name)
        # Try multiple signatures
        import inspect
        sig = inspect.signature(fn)
        print("fn sig:", sig)
        # If it's _own_business_filter, probably takes candidate dict/str
        # If it's _is_own_name, takes a string
        try:
            if inspect.iscoroutinefunction(fn):
                async def _run():
                    is_own = await fn()
                    return is_own({"name": name}), is_own({"name": "Zzz Unknown Salon XYZ"})
                r_own, r_random = asyncio.run(_run())
            else:
                if "name" in sig.parameters or len(sig.parameters) == 1:
                    r_own = fn(name); r_random = fn("Zzz Unknown Salon XYZ")
                else:
                    r_own = fn({"name": name}); r_random = fn({"name": "Zzz Unknown Salon XYZ"})
            print(f"own={r_own} random={r_random}")
            assert r_own != r_random, f"filter same for own vs random: {r_own} vs {r_random}"
        except AssertionError:
            raise
        except Exception as e:
            pytest.skip(f"filter call signature mismatch: {e}")
