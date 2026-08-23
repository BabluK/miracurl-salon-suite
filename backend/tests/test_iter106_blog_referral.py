"""Iter106 — Blog CRUD + Referral free-month + Platform stats + Affiliate summary."""
from _creds import _PW_ADMIN, _PW_SUPER
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

SUPER_EMAIL = "super@miracurl.com"
SUPER_PW = _PW_SUPER
ADMIN_EMAIL = "admin@miracurl.com"
ADMIN_PW = _PW_ADMIN
TENANT_SLUG = "miracurl-marathahalli"
OWNER_PIN = "4321"


# ---------- shared sessions ----------
@pytest.fixture(scope="module")
def super_sess():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PW}, timeout=15)
    assert r.status_code == 200, f"super login failed {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin_sess():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT_SLUG})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW},
               headers={"X-Tenant-Slug": TENANT_SLUG}, timeout=15)
    assert r.status_code == 200, f"admin login failed {r.status_code} {r.text}"
    return s


# =====================================================================
# Platform stats
# =====================================================================
class TestPlatformStats:
    def test_public_platform_stats(self):
        r = requests.get(f"{API}/public/platform-stats", timeout=15)
        assert r.status_code == 200
        data = r.json()
        for k in ("salons", "cities", "bookings", "invoices"):
            assert k in data, f"missing key {k}"
            assert isinstance(data[k], int)
            assert data[k] >= 0
        # sanity: preview already has data seeded
        assert data["salons"] >= 1


# =====================================================================
# Public blog
# =====================================================================
class TestPublicBlog:
    def test_public_blog_list(self):
        r = requests.get(f"{API}/public/blog", timeout=15)
        assert r.status_code == 200
        posts = r.json().get("posts", [])
        slugs = {p["slug"] for p in posts}
        for expected in ("reduce-salon-no-shows-whatsapp-reminders",
                         "gst-billing-guide-salons-india",
                         "salon-memberships-repeat-customers"):
            assert expected in slugs, f"missing seed slug {expected}"

    def test_public_blog_detail(self):
        r = requests.get(f"{API}/public/blog/reduce-salon-no-shows-whatsapp-reminders", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["slug"] == "reduce-salon-no-shows-whatsapp-reminders"
        assert "content" in d and len(d["content"]) > 100
        assert d.get("published") == True

    def test_public_blog_unknown_slug_404(self):
        r = requests.get(f"{API}/public/blog/does-not-exist-xyz", timeout=15)
        assert r.status_code == 404


# =====================================================================
# Super-admin blog CRUD + auth
# =====================================================================
class TestBlogCRUD:
    _created_id = None

    def test_admin_blog_list_requires_super(self, admin_sess):
        # tenant admin (not super) must be blocked
        r = admin_sess.get(f"{API}/super-admin/blog", timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_admin_blog_list_anonymous(self):
        r = requests.get(f"{API}/super-admin/blog", timeout=15)
        assert r.status_code in (401, 403)

    def test_admin_blog_list_super(self, super_sess):
        r = super_sess.get(f"{API}/super-admin/blog", timeout=15)
        assert r.status_code == 200
        posts = r.json()
        assert isinstance(posts, list)
        assert len(posts) >= 3  # at least seeded

    def test_admin_blog_create_and_get(self, super_sess):
        title = f"TEST Article {uuid.uuid4().hex[:6]}"
        body = {"title": title, "excerpt": "TEST excerpt for iter106",
                "content": "This is a **TEST** article body. It has enough content to pass.\n\nSecond paragraph.",
                "tags": ["test"], "published": True}
        r = super_sess.post(f"{API}/super-admin/blog", json=body, timeout=15)
        assert r.status_code == 200, f"create failed {r.status_code} {r.text}"
        d = r.json()
        assert d["title"] == title
        assert d["slug"].startswith("test-article-")
        assert d["published"] == True
        assert "id" in d
        TestBlogCRUD._created_id = d["id"]
        TestBlogCRUD._created_slug = d["slug"]

        # verify visible in public list
        r2 = requests.get(f"{API}/public/blog/{d['slug']}", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["title"] == title

    def test_admin_blog_duplicate_slug_400(self, super_sess):
        assert TestBlogCRUD._created_id, "need created article first"
        r = super_sess.post(f"{API}/super-admin/blog",
                            json={"title": "another", "slug": TestBlogCRUD._created_slug,
                                  "content": "x" * 20, "excerpt": ""},
                            timeout=15)
        assert r.status_code == 400

    def test_admin_blog_update(self, super_sess):
        assert TestBlogCRUD._created_id
        new_title = "TEST Article UPDATED"
        r = super_sess.put(f"{API}/super-admin/blog/{TestBlogCRUD._created_id}",
                           json={"title": new_title, "excerpt": "e",
                                 "content": "updated body content long enough",
                                 "tags": [], "published": True},
                           timeout=15)
        assert r.status_code == 200
        # verify via public GET
        r2 = requests.get(f"{API}/public/blog/{TestBlogCRUD._created_slug}", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["title"] == new_title

    def test_admin_blog_delete(self, super_sess):
        assert TestBlogCRUD._created_id
        r = super_sess.delete(f"{API}/super-admin/blog/{TestBlogCRUD._created_id}", timeout=15)
        assert r.status_code == 200
        # verify gone
        r2 = requests.get(f"{API}/public/blog/{TestBlogCRUD._created_slug}", timeout=15)
        assert r2.status_code == 404
        # delete again -> 404
        r3 = super_sess.delete(f"{API}/super-admin/blog/{TestBlogCRUD._created_id}", timeout=15)
        assert r3.status_code == 404


# =====================================================================
# Affiliate summary
# =====================================================================
class TestAffiliateSummary:
    def test_affiliate_summary_requires_owner_pin(self, admin_sess):
        # No pin header — should fail (per require_owner_pin dep)
        r = admin_sess.get(f"{API}/settings/affiliate", timeout=15)
        assert r.status_code in (400, 401, 403), f"expected pin-required, got {r.status_code} {r.text}"

    def test_affiliate_summary_with_pin(self, admin_sess):
        r = admin_sess.get(f"{API}/settings/affiliate",
                           headers={"X-Owner-Pin": OWNER_PIN}, timeout=15)
        assert r.status_code == 200, f"got {r.status_code} {r.text}"
        d = r.json()
        for k in ("slug", "months_earned", "free_months_banked", "referrals", "reward"):
            assert k in d, f"missing {k}"
        assert d["reward"] == "1 free month per paying salon"
        assert isinstance(d["referrals"], list)
        assert isinstance(d["months_earned"], int)
        assert isinstance(d["free_months_banked"], int)


# =====================================================================
# Referral signup + reward release (DB simulation)
# =====================================================================
@pytest.fixture(scope="module")
def mongo_db():
    try:
        from pymongo import MongoClient
    except ImportError:
        pytest.skip("pymongo not installed")
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "miracurl_db")
    client = MongoClient(mongo_url)
    return client[db_name]


class TestReferralFlow:
    _created_email = None
    _created_slug = None
    _created_tid = None
    _referrer_tid = None

    def test_signup_with_ref_creates_pending_referral(self, mongo_db):
        # Look up referrer tenant id
        ref = mongo_db.tenants.find_one({"slug": TENANT_SLUG}, {"id": 1})
        assert ref, "referrer tenant not found"
        TestReferralFlow._referrer_tid = ref["id"]

        uniq = uuid.uuid4().hex[:8]
        email = f"TEST_ref_{uniq}@example.com"
        salon_name = f"TEST Salon Ref {uniq}"
        payload = {
            "salon_name": salon_name,
            "owner_name": "Test Owner",
            "owner_email": email,
            "password": "TestPass@1234",
            "phone": "+919876543210",
            "location": "Bengaluru",
            "ref": TENANT_SLUG,
        }
        r = requests.post(f"{API}/public/signup-salon", json=payload, timeout=20)
        # signup may be rate-limited (4/900s). If so, skip
        if r.status_code == 429:
            pytest.skip(f"signup rate limited: {r.text}")
        assert r.status_code == 200, f"signup failed {r.status_code} {r.text}"
        data = r.json()
        tenant = data.get("tenant") or {}
        TestReferralFlow._created_email = email
        TestReferralFlow._created_slug = tenant.get("slug")
        TestReferralFlow._created_tid = tenant.get("id")
        assert TestReferralFlow._created_tid

        # Verify affiliate_referrals doc exists with status=pending, reward=free_month
        ref_doc = mongo_db.affiliate_referrals.find_one(
            {"referred_tenant_id": TestReferralFlow._created_tid})
        assert ref_doc, "referral doc not created"
        assert ref_doc.get("status") == "pending"
        assert ref_doc.get("reward") == "free_month"
        assert ref_doc.get("referrer_tenant_id") == TestReferralFlow._referrer_tid

    def test_grant_free_month_banked_when_no_active_sub(self, mongo_db):
        """Simulate _grant_referral_free_month for a referrer WITHOUT active subscription."""
        # Create a synthetic referrer tenant with NO active subscription
        rid = str(uuid.uuid4())
        mongo_db.tenants.insert_one({
            "id": rid, "slug": f"TEST_refr_{uuid.uuid4().hex[:6]}",
            "name": "TEST Referrer NoSub", "status": "active",
            "referral_free_months": 0,
        })
        # Ensure no active subscription
        mongo_db.subscriptions.delete_many({"tenant_id": rid})

        # Import and run the helper
        import asyncio, sys
        sys.path.insert(0, "/app/backend")
        from routes.subscriptions import _grant_referral_free_month
        note = asyncio.get_event_loop().run_until_complete(_grant_referral_free_month(rid))
        assert "banked" in note.lower()
        t = mongo_db.tenants.find_one({"id": rid})
        assert int(t.get("referral_free_months") or 0) == 1

        # Cleanup
        mongo_db.tenants.delete_one({"id": rid})

    def test_grant_free_month_extends_active_sub(self, mongo_db):
        """Simulate _grant_referral_free_month for a referrer WITH active subscription."""
        rid = str(uuid.uuid4())
        sid = str(uuid.uuid4())
        end = (datetime.now(timezone.utc) + timedelta(days=10)).date().isoformat()
        mongo_db.tenants.insert_one({
            "id": rid, "slug": f"TEST_refrx_{uuid.uuid4().hex[:6]}",
            "name": "TEST Referrer WithSub", "status": "active",
            "referral_free_months": 0, "subscription_end_date": end,
        })
        mongo_db.subscriptions.insert_one({
            "id": sid, "tenant_id": rid, "status": "active", "end_date": end,
        })

        import asyncio, sys
        sys.path.insert(0, "/app/backend")
        from routes.subscriptions import _grant_referral_free_month
        note = asyncio.get_event_loop().run_until_complete(_grant_referral_free_month(rid))
        assert "extended" in note.lower()
        s = mongo_db.subscriptions.find_one({"id": sid})
        expected_end = (datetime.fromisoformat(end) + timedelta(days=30)).date().isoformat()
        assert s["end_date"] == expected_end
        t = mongo_db.tenants.find_one({"id": rid})
        assert t.get("subscription_end_date") == expected_end
        # banked should NOT be incremented
        assert int(t.get("referral_free_months") or 0) == 0

        # Cleanup
        mongo_db.subscriptions.delete_one({"id": sid})
        mongo_db.tenants.delete_one({"id": rid})

    def test_cleanup_created_signup(self, mongo_db):
        """Remove the TEST tenant we created via signup."""
        if TestReferralFlow._created_tid:
            mongo_db.tenants.delete_one({"id": TestReferralFlow._created_tid})
            mongo_db.users.delete_many({"tenant_id": TestReferralFlow._created_tid})
            mongo_db.affiliate_referrals.delete_many({"referred_tenant_id": TestReferralFlow._created_tid})


# =====================================================================
# Regression: testimonials still work
# =====================================================================
class TestRegression:
    def test_public_testimonials(self):
        r = requests.get(f"{API}/public/testimonials", timeout=15)
        assert r.status_code == 200
        d = r.json()
        # accepts either list or dict shape
        items = d if isinstance(d, list) else d.get("testimonials") or d.get("items") or []
        assert isinstance(items, list)

    def test_sitemap(self):
        r = requests.get(f"{BASE}/sitemap.xml", timeout=15)
        # sitemap may be served by frontend or backend — accept 200 XML
        if r.status_code == 200:
            assert "<urlset" in r.text or "<sitemap" in r.text or "<?xml" in r.text
