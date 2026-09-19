"""Controlled E2E for auto-batch WhatsApp campaigns on the newbiz-ring-salon test tenant. Run: python tests/autobatch_e2e.py [cleanup]"""
import asyncio, os, sys, uuid, json
from datetime import datetime, timezone
import httpx
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
API = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0]
SLUG, EMAIL, PW = "newbiz-ring-salon", "ring.owner@test.com", "Ring@12345"
TAG = "AB-TEST"
N_FAKE = 1150


async def main(cleanup_only=False):
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    t = await db.tenants.find_one({"slug": SLUG}, {"_id": 0, "id": 1, "wa_points": 1, "sms_points": 1})
    tid = t["id"]
    if cleanup_only:
        r1 = await db.customers.delete_many({"tenant_id": tid, "source": TAG})
        r2 = await db.wa_campaigns.delete_many({"tenant_id": tid, "name": {"$regex": f"^{TAG}"}})
        print("cleanup", r1.deleted_count, "customers,", r2.deleted_count, "campaigns")
        return
    await db.customers.delete_many({"tenant_id": tid, "source": TAG})
    await db.wa_campaigns.delete_many({"tenant_id": tid, "name": {"$regex": f"^{TAG}"}})
    now = datetime.now(timezone.utc).isoformat()
    docs = [{"id": str(uuid.uuid4()), "tenant_id": tid, "name": f"{TAG} Guest {i}", "phone": f"+91{9000000000 + i}", "visits": 1,
             "crm_status": "active", "source": TAG, "created_at": now} for i in range(N_FAKE)]
    await db.customers.insert_many(docs)
    real = await db.customers.count_documents({"tenant_id": tid, "phone": {"$nin": [None, ""]}})
    orig_points = {"wa_points": t.get("wa_points") or 0, "sms_points": t.get("sms_points") or 0}
    await db.tenants.update_one({"id": tid}, {"$set": {"wa_points": 1, "sms_points": 0}})
    async with httpx.AsyncClient(base_url=API, timeout=60, headers={"X-Tenant-Slug": SLUG}) as c:
        r = await c.post("/api/auth/login", json={"email": EMAIL, "password": PW})
        assert r.status_code == 200, r.text
        csrf = c.cookies.get("csrf_token")
        h = {"X-CSRF-Token": csrf} if csrf else {}
        r = await c.get("/api/whatsapp-link/audience-counts")
        counts = r.json()
        print("audience-counts", counts)
        assert counts["all"] == 500 and counts["all_total"] == real and counts["per_send_limit"] == 500
        body = {"audience": "all", "auto_batch": True, "text": f"{TAG} Hi {{name}}, festive offer at Ring Salon!", "name": f"{TAG} Diwali blast", "offer_type": "festive"}
        r = await c.post("/api/whatsapp-link/campaigns", json=body, headers=h)
        # freeze the worker immediately: no credits + pause everything
        await db.tenants.update_one({"id": tid}, {"$set": {"wa_points": 0}})
        await db.wa_campaigns.update_many({"tenant_id": tid, "name": {"$regex": f"^{TAG}"}}, {"$set": {"status": "paused"}})
        print("create ->", r.status_code, {k: v for k, v in r.json().items() if k in ("id", "total", "auto_batches_scheduled", "status", "scheduled_at", "name")})
        assert r.status_code == 200, r.text
        res = r.json()
        exp_batches = -(-(real - 500) // 500)
        assert res["total"] == 500 and res["auto_batches_scheduled"] == exp_batches, (res["total"], res["auto_batches_scheduled"], exp_batches)
        rows = await db.wa_campaigns.find({"tenant_id": tid, "name": {"$regex": f"^{TAG}"}}, {"_id": 0, "id": 1, "name": 1, "scheduled_at": 1, "batch_no": 1, "batches_total": 1, "parent_id": 1, "total": 1, "recipients": 1}).sort("batch_no", 1).to_list(50)
        created = datetime.fromisoformat(res["created_at"])
        all_rcp = set()
        for row in rows:
            n = len(row["recipients"])
            ph = {x["phone"] for x in row["recipients"]}
            assert not (ph & all_rcp), "overlapping recipients between batches"
            all_rcp |= ph
            sched = row.get("scheduled_at")
            if row["batch_no"] == 1:
                assert sched is None and row["parent_id"] is None if "parent_id" in row else True
                assert row["batches_total"] == exp_batches + 1
            else:
                delta = (datetime.fromisoformat(sched) - created).total_seconds() / 3600
                assert abs(delta - (row["batch_no"] - 1)) < 0.01, delta
                assert row["parent_id"] == res["id"]
            print(f"  batch {row['batch_no']}: {row['name']!r} recipients={n} scheduled_at={sched}")
        assert len(all_rcp) == real, (len(all_rcp), real)
        # worker due-check: batches must NOT be due now, but ARE due after their scheduled time
        now_iso = datetime.now(timezone.utc).isoformat()
        due_now = await db.wa_campaigns.count_documents({"tenant_id": tid, "name": {"$regex": f"^{TAG}"}, "$or": [{"scheduled_at": None}, {"scheduled_at": {"$lte": now_iso}}]})
        assert due_now == 1, due_now
        b2 = rows[1]
        await db.wa_campaigns.update_one({"id": b2["id"]}, {"$set": {"scheduled_at": datetime.now(timezone.utc).isoformat()}})
        due_after = await db.wa_campaigns.count_documents({"tenant_id": tid, "name": {"$regex": f"^{TAG}"}, "$or": [{"scheduled_at": None}, {"scheduled_at": {"$lte": datetime.now(timezone.utc).isoformat()}}]})
        assert due_after == 2, due_after
        r = await c.get("/api/whatsapp-link/campaigns")
        names = [x["name"] for x in r.json()["campaigns"] if x["name"].startswith(TAG)]
        print("list shows", names)
        assert len(names) == exp_batches + 1
        # parent list entry shows batch meta
        r = await c.get(f"/api/whatsapp-link/campaigns/{res['id']}")
        assert r.json()["batch_no"] == 1 and r.json()["batches_total"] == exp_batches + 1
        # a 'later' schedule with auto_batch must NOT fan out
        body2 = {**body, "name": f"{TAG} later", "scheduled_at": "2030-01-01T10:00:00Z"}
        await db.tenants.update_one({"id": tid}, {"$set": {"wa_points": 1}})
        r = await c.post("/api/whatsapp-link/campaigns", json=body2, headers=h)
        await db.tenants.update_one({"id": tid}, {"$set": {"wa_points": 0}})
        assert r.status_code == 200 and r.json()["auto_batches_scheduled"] == 0, r.text
        print("scheduled-later + auto_batch -> no fan-out ✓")
    # worker ticked nothing (paused before any send)?
    sent = await db.wa_campaigns.aggregate([{"$match": {"tenant_id": tid, "name": {"$regex": f"^{TAG}"}}}, {"$group": {"_id": None, "s": {"$sum": "$sent"}, "f": {"$sum": "$failed"}}}]).to_list(1)
    print("worker sent/failed during test:", sent)
    await db.tenants.update_one({"id": tid}, {"$set": orig_points})
    await db.customers.delete_many({"tenant_id": tid, "source": TAG})
    await db.wa_campaigns.delete_many({"tenant_id": tid, "name": {"$regex": f"^{TAG}"}})
    print("ALL PASS — cleaned up; points restored", orig_points)


asyncio.run(main(cleanup_only=(len(sys.argv) > 1 and sys.argv[1] == "cleanup")))
