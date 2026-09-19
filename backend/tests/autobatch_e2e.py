"""Controlled E2E for auto-batch WhatsApp campaigns (hourly / daily / manual) on the newbiz-ring-salon test tenant.
Run: python tests/autobatch_e2e.py [cleanup]. Worker is frozen (wa_points=0 + pause) so nothing is ever sent."""
import asyncio, os, sys, uuid
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import httpx
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
API = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0]
SLUG, EMAIL, PW = "newbiz-ring-salon", "ring.owner@test.com", "Ring@12345"
TAG, N_FAKE = "AB-TEST", 1150
DUE_Q = lambda now: {"$or": [{"scheduled_at": None}, {"scheduled_at": {"$lte": now}}]}


async def run_mode(db, c, h, tid, real, mode, btime="23:00"):
    body = {"audience": "all", "auto_batch": True, "batch_mode": mode, "batch_time": btime, "text": f"{TAG} Hi {{name}}, festive offer!",
            "name": f"{TAG} {mode} blast", "offer_type": "festive"}
    await db.tenants.update_one({"id": tid}, {"$set": {"wa_points": 1}})
    r = await c.post("/api/whatsapp-link/campaigns", json=body, headers=h)
    await db.tenants.update_one({"id": tid}, {"$set": {"wa_points": 0}})
    await db.wa_campaigns.update_many({"tenant_id": tid, "name": {"$regex": f"^{TAG} {mode}"}, "status": {"$ne": "paused"}}, {"$set": {"status": "paused"}})
    assert r.status_code == 200, r.text
    res = r.json()
    exp = -(-(real - 500) // 500)
    assert res["total"] == 500 and res["auto_batches_scheduled"] == exp and res["batch_mode"] == mode, res
    rows = await db.wa_campaigns.find({"tenant_id": tid, "name": {"$regex": f"^{TAG} {mode}"}}, {"_id": 0, "recipients.phone": 1, "id": 1, "name": 1, "scheduled_at": 1,
                                       "batch_no": 1, "batches_total": 1, "parent_id": 1, "manual": 1, "status": 1, "batch_mode": 1}).sort("batch_no", 1).to_list(50)
    created = datetime.fromisoformat(res["created_at"])
    seen = set()
    for row in rows:
        ph = {x["phone"] for x in row["recipients"]}
        assert not (ph & seen); seen |= ph
        assert row["batches_total"] == exp + 1 and row["batch_mode"] == mode
        n, sched = row["batch_no"], row.get("scheduled_at")
        if n == 1:
            assert sched is None
        elif mode == "hourly":
            assert abs((datetime.fromisoformat(sched) - created).total_seconds() / 3600 - (n - 1)) < 0.01
        elif mode == "daily":
            loc = datetime.fromisoformat(sched).astimezone(ZoneInfo("Asia/Kolkata"))
            assert loc.strftime("%H:%M") == btime, loc
            first = created.astimezone(ZoneInfo("Asia/Kolkata")).replace(hour=int(btime[:2]), minute=int(btime[3:]), second=0, microsecond=0)
            if first <= created.astimezone(ZoneInfo("Asia/Kolkata")):
                first += timedelta(days=1)
            assert loc.date() == (first + timedelta(days=n - 2)).date(), (loc, first, n)
        else:
            assert sched is None and row["manual"] is True and row["status"] == "paused", row
        print(f"  [{mode}] batch {n}: {row['name']!r} n={len(ph)} status={row['status']} scheduled_at={sched}")
    assert len(seen) == real
    if mode == "manual":
        b2 = rows[1]
        r = await c.post(f"/api/whatsapp-link/campaigns/{b2['id']}/resume", headers=h)
        await db.wa_campaigns.update_one({"id": b2["id"]}, {"$set": {"status": "paused"}})
        assert r.status_code == 200, r.text
        d = await db.wa_campaigns.find_one({"id": b2["id"]}, {"_id": 0, "released_by": 1, "released_at": 1})
        assert d.get("released_by") and d.get("released_at"), d
        print("  [manual] release → released_by =", d["released_by"])
    else:
        due = await db.wa_campaigns.count_documents({"tenant_id": tid, "name": {"$regex": f"^{TAG} {mode}"}, **DUE_Q(datetime.now(timezone.utc).isoformat())})
        assert due == 1, due
    print(f"{mode} ✓")


async def main(cleanup_only=False):
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    t = await db.tenants.find_one({"slug": SLUG}, {"_id": 0, "id": 1, "wa_points": 1, "sms_points": 1, "wa_batch_mode": 1, "wa_batch_time": 1})
    tid = t["id"]
    async def cleanup():
        r1 = await db.customers.delete_many({"tenant_id": tid, "source": TAG})
        r2 = await db.wa_campaigns.delete_many({"tenant_id": tid, "name": {"$regex": f"^{TAG}"}})
        print("cleanup", r1.deleted_count, "customers,", r2.deleted_count, "campaigns")
    if cleanup_only:
        return await cleanup()
    await cleanup()
    now = datetime.now(timezone.utc).isoformat()
    await db.customers.insert_many([{"id": str(uuid.uuid4()), "tenant_id": tid, "name": f"{TAG} Guest {i}", "phone": f"+91{9000000000 + i}", "visits": 1,
                                     "crm_status": "active", "source": TAG, "created_at": now} for i in range(N_FAKE)])
    real = await db.customers.count_documents({"tenant_id": tid, "phone": {"$nin": [None, ""]}})
    orig = {k: t.get(k) for k in ("wa_points", "sms_points", "wa_batch_mode", "wa_batch_time")}
    await db.tenants.update_one({"id": tid}, {"$set": {"sms_points": 0}})
    try:
        async with httpx.AsyncClient(base_url=API, timeout=60, headers={"X-Tenant-Slug": SLUG}) as c:
            r = await c.post("/api/auth/login", json={"email": EMAIL, "password": PW}); assert r.status_code == 200, r.text
            csrf = c.cookies.get("csrf_token"); h = {"X-CSRF-Token": csrf} if csrf else {}
            counts = (await c.get("/api/whatsapp-link/audience-counts")).json()
            assert counts["all"] == 500 and counts["all_total"] == real
            for mode in ("hourly", "daily", "manual"):
                await run_mode(db, c, h, tid, real, mode)
            bs = (await c.get("/api/whatsapp-link/batch-settings")).json()
            assert bs["batch_mode"] == "manual" and bs["batch_time"] == "23:00" and bs["timezone"], bs
            print("batch-settings persisted ✓", bs)
            # 'later' + auto_batch must not fan out
            await db.tenants.update_one({"id": tid}, {"$set": {"wa_points": 1}})
            r = await c.post("/api/whatsapp-link/campaigns", json={"audience": "all", "auto_batch": True, "text": f"{TAG} later msg", "name": f"{TAG} later", "scheduled_at": "2030-01-01T10:00:00Z"}, headers=h)
            await db.tenants.update_one({"id": tid}, {"$set": {"wa_points": 0}})
            assert r.status_code == 200 and r.json()["auto_batches_scheduled"] == 0, r.text
            print("scheduled-later + auto_batch → no fan-out ✓")
        agg = await db.wa_campaigns.aggregate([{"$match": {"tenant_id": tid, "name": {"$regex": f"^{TAG}"}}}, {"$group": {"_id": None, "s": {"$sum": "$sent"}, "f": {"$sum": "$failed"}}}]).to_list(1)
        assert agg and agg[0]["s"] == 0 and agg[0]["f"] == 0, agg
        print("worker sent/failed during test: 0/0 ✓")
    finally:
        await db.tenants.update_one({"id": tid}, {"$set": {k: v for k, v in orig.items() if v is not None}, "$unset": {k: "" for k, v in orig.items() if v is None}})
        await cleanup()
    print("ALL PASS")


asyncio.run(main(cleanup_only=(len(sys.argv) > 1 and sys.argv[1] == "cleanup")))
