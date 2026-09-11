"""Post History delete/clear endpoints + tenant-logo stamp."""
import os
import io
import asyncio

import requests
from PIL import Image
from motor.motor_asyncio import AsyncIOMotorClient

API = os.environ.get("API_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/") + "/api"
SLUG = "miracurl-marathahalli"


def _env():
    env = {}
    with open(os.path.join(os.path.dirname(__file__), "..", ".env")) as f:
        for line in f:
            if "=" in line and not line.startswith("#"):
                k, v = line.strip().split("=", 1)
                env[k] = v.strip('"').strip("'")
    return env


def _login():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "admin@miracurl.com", "password": "q6QY@tn3p#9DtL"},
               headers={"X-Tenant-Slug": SLUG})
    assert r.status_code == 200, r.text
    s.headers.update({"X-Tenant-Slug": SLUG, "X-CSRF-Token": s.cookies.get("csrf_token")})
    return s


def _db():
    env = _env()
    return AsyncIOMotorClient(env["MONGO_URL"])[env["DB_NAME"]]


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def test_delete_single_and_isolation():
    s = _login()

    async def seed():
        db = _db()
        t = await db.tenants.find_one({"slug": SLUG}, {"id": 1})
        other = await db.tenants.find_one({"slug": {"$ne": SLUG}}, {"id": 1})
        await db.social_posts.delete_many({"id": {"$in": ["t144-own", "t144-other"]}})
        await db.social_posts.insert_many([
            {"id": "t144-own", "tenant_id": t["id"], "caption": "tmp", "platforms": ["instagram"], "results": {}, "created_at": "2026-06-30T00:00:00"},
            {"id": "t144-other", "tenant_id": other["id"], "caption": "tmp", "platforms": ["instagram"], "results": {}, "created_at": "2026-06-30T00:00:00"},
        ])
    _run(seed())

    assert s.delete(f"{API}/social/history/t144-own").status_code == 200
    assert s.delete(f"{API}/social/history/t144-own").status_code == 404
    # cross-tenant delete must not succeed
    assert s.delete(f"{API}/social/history/t144-other").status_code == 404

    async def check():
        db = _db()
        assert await db.social_posts.find_one({"id": "t144-other"}) is not None
        await db.social_posts.delete_many({"id": "t144-other"})
    _run(check())


def test_clear_all_requires_csrf():
    s = _login()
    s.headers.pop("X-CSRF-Token")
    r = s.delete(f"{API}/social/history")
    assert r.status_code in (401, 403), r.text


def test_tenant_logo_stamp():
    from routes.promo_common import stamp_monogram_bytes
    base = Image.new("RGB", (512, 512), (20, 20, 20))
    buf = io.BytesIO(); base.save(buf, "PNG")
    logo = Image.new("RGBA", (200, 200), (255, 0, 0, 255))
    lb = io.BytesIO(); logo.save(lb, "PNG")
    out = Image.open(io.BytesIO(stamp_monogram_bytes(buf.getvalue(), lb.getvalue()))).convert("RGB")
    # bottom-right region should now contain the red logo
    px = out.getpixel((512 - 16 - 28, 512 - 16 - 28))
    assert px[0] > 200 and px[1] < 60, px
    # fallback without logo still returns a valid image
    assert Image.open(io.BytesIO(stamp_monogram_bytes(buf.getvalue(), None))).size == (512, 512)
