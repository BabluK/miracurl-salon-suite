"""Startup seed data + legacy backfill (extracted from server.py)."""
import os  # noqa: F401
import uuid  # noqa: F401
import logging  # noqa: F401
from datetime import datetime, timezone  # noqa: F401

from database import db, _raw_db, _current_tenant_id, _clean  # noqa: F401
from security import hash_pw  # noqa: F401
from models import Tenant, Customer  # noqa: F401
from schemas import DEFAULT_TENANT_SLUG, Service, Staff, Product

# ---------------- Seed ----------------
SEED_SERVICES = [
    {"name": "Hair Cut - Women", "category": "Hair", "price": 600, "duration_min": 45, "trending": True,
     "image_url": "https://images.unsplash.com/photo-1634449571010-02389ed0f9b0?w=400"},
    {"name": "Hair Cut - Men", "category": "Hair", "price": 350, "duration_min": 30, "trending": True,
     "image_url": "https://images.unsplash.com/photo-1773863745081-582b4a9ec628?w=400"},
    {"name": "Hair Color - Global", "category": "Hair", "price": 2500, "duration_min": 120, "trending": False,
     "image_url": "https://images.unsplash.com/photo-1562322140-8baeececf3df?w=400"},
    {"name": "Keratin Treatment", "category": "Hair", "price": 4500, "duration_min": 180, "trending": True,
     "image_url": "https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=400"},
    {"name": "Classic Facial", "category": "Skin", "price": 1200, "duration_min": 60, "trending": False,
     "image_url": "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=400"},
    {"name": "Gold Facial", "category": "Skin", "price": 2200, "duration_min": 75, "trending": True,
     "image_url": "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=400"},
    {"name": "Manicure", "category": "Nails", "price": 500, "duration_min": 30, "trending": False,
     "image_url": "https://images.unsplash.com/photo-1632345031435-8727f6897d53?w=400"},
    {"name": "Pedicure Spa", "category": "Nails", "price": 900, "duration_min": 45, "trending": False,
     "image_url": "https://images.unsplash.com/photo-1610992015734-2ea4eea18cf6?w=400"},
    {"name": "Bridal Makeup", "category": "Makeup", "price": 8000, "duration_min": 120, "trending": True,
     "image_url": "https://images.unsplash.com/photo-1457972729786-0411a3b2b626?w=400"},
    {"name": "Threading", "category": "Threading", "price": 80, "duration_min": 10, "trending": False,
     "image_url": "https://images.unsplash.com/photo-1522337094846-8a818192de1f?w=400"},
]
SEED_STAFF = [
    {"name": "Priya Sharma", "role": "Senior Stylist", "phone": "9876500001", "email": "priya@miracurl.com",
     "specialties": ["Hair", "Color"], "commission_pct": 15,
     "image_url": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300"},
    {"name": "Rahul Verma", "role": "Barber", "phone": "9876500002", "email": "rahul@miracurl.com",
     "specialties": ["Hair", "Beard"], "commission_pct": 12,
     "image_url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300"},
    {"name": "Anjali Mehta", "role": "Beauty Therapist", "phone": "9876500003", "email": "anjali@miracurl.com",
     "specialties": ["Skin", "Makeup"], "commission_pct": 14,
     "image_url": "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=300"},
    {"name": "Karan Singh", "role": "Nail Artist", "phone": "9876500004", "email": "karan@miracurl.com",
     "specialties": ["Nails"], "commission_pct": 10,
     "image_url": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=300"},
]
SEED_PRODUCTS = [
    {"name": "Hydra Shampoo 500ml", "brand": "LOreal", "category": "Hair Care", "sku": "SH-001",
     "price": 850, "cost": 500, "stock": 24,
     "image_url": "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=300"},
    {"name": "Argan Oil Conditioner", "brand": "Moroccan", "category": "Hair Care", "sku": "CO-001",
     "price": 1100, "cost": 650, "stock": 18,
     "image_url": "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=300"},
    {"name": "Vitamin C Serum", "brand": "The Ordinary", "category": "Skin Care", "sku": "SR-001",
     "price": 1500, "cost": 800, "stock": 4,
     "image_url": "https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=300"},
    {"name": "Hair Spray Strong Hold", "brand": "Schwarzkopf", "category": "Styling", "sku": "ST-001",
     "price": 700, "cost": 400, "stock": 12,
     "image_url": "https://images.unsplash.com/photo-1631730486572-226d1f595b68?w=300"},
    {"name": "Nail Polish - Crimson", "brand": "OPI", "category": "Nails", "sku": "NP-001",
     "price": 450, "cost": 220, "stock": 30,
     "image_url": "https://images.unsplash.com/photo-1599948128020-9a44505b696d?w=300"},
    {"name": "Face Mask Sheet (10pk)", "brand": "Innisfree", "category": "Skin Care", "sku": "FM-001",
     "price": 600, "cost": 300, "stock": 3,
     "image_url": "https://images.unsplash.com/photo-1570554886111-e80fcca6a029?w=300"},
]
SEED_CUSTOMERS = [
    {"name": "Neha Kapoor", "phone": "9876123001", "email": "neha@example.com", "gender": "Female"},
    {"name": "Arjun Reddy", "phone": "9876123002", "email": "arjun@example.com", "gender": "Male"},
    {"name": "Meera Iyer", "phone": "9876123003", "email": "meera@example.com", "gender": "Female"},
    {"name": "Vikram Patel", "phone": "9876123004", "email": "vikram@example.com", "gender": "Male"},
    {"name": "Sneha Joshi", "phone": "9876123005", "email": "sneha@example.com", "gender": "Female"},
]

async def backfill_tenant_ids(tenant_id: str):
    """Assign tenant_id to legacy records that don't have one."""
    for coll_name in ("customers", "services", "staff", "products", "appointments", "invoices", "reviews"):
        coll = getattr(_raw_db, coll_name)
        r = await coll.update_many({"tenant_id": {"$exists": False}}, {"$set": {"tenant_id": tenant_id}})
        if r.modified_count:
            logging.info(f"Backfilled {r.modified_count} {coll_name} with tenant_id")
    # backfill users that have no tenant_id (legacy admin) — assign to default tenant
    await _raw_db.users.update_many(
        {"tenant_id": {"$exists": False}, "role": {"$ne": "super_admin"}},
        {"$set": {"tenant_id": tenant_id}},
    )

async def seed_super_admin():
    """Seed the super-admin ONCE from env. Never re-writes an existing hash so operators can rotate it."""
    email = os.environ.get("SUPER_ADMIN_EMAIL", "super@miracurl.com").lower()
    # Auto-heal: an older seed re-created the default super-admin after the real one was renamed
    # (e.g. → admin@miracurl-suite.com). Remove the never-used duplicate so only one HQ login exists.
    # Runs ONCE (guarded by app_migrations) — never a recurring destructive step at startup.
    if not await _raw_db.app_migrations.find_one({"key": "dedupe_default_super_admin_v1"}):
        admins = await db.users.find({"role": "super_admin"}, {"_id": 0, "id": 1, "email": 1, "must_change_password": 1, "last_login_at": 1}).to_list(10)
        if len(admins) > 1:
            for a in admins:
                if a.get("email") == email and a.get("must_change_password") and not a.get("last_login_at"):
                    await db.users.update_one({"id": a["id"]}, {"$set": {"role": "retired_seed", "retired_at": datetime.now(timezone.utc).isoformat()}})
                    logging.warning("[seed] retired duplicate default super-admin %s (renamed HQ login exists)", email)
        await _raw_db.app_migrations.insert_one({"key": "dedupe_default_super_admin_v1", "at": datetime.now(timezone.utc).isoformat()})
    existing = await db.users.find_one({"$or": [{"email": email}, {"role": "super_admin"}]})
    if existing:
        # Never touch an existing super-admin (it may have been renamed, e.g. admin@miracurl-suite.com,
        # or had its password rotated). Only auto-heal if the seeded email lost its role somehow.
        if existing.get("email") == email and existing.get("role") != "super_admin":
            await db.users.update_one({"email": email}, {"$set": {"role": "super_admin"}})
        return
    seed_pw = os.environ.get("SUPER_ADMIN_SEED_PASSWORD")
    if not seed_pw:
        # No seed configured — skip. Operator must create the super-admin manually or set the env var once.
        logging.warning("SUPER_ADMIN_SEED_PASSWORD is not set — skipping super-admin seed. Set it in .env for first-boot only.")
        return
    await db.users.insert_one({
        "id": str(uuid.uuid4()),
        "email": email,
        "name": "Super Admin",
        "role": "super_admin",
        "tenant_id": None,
        "password_hash": hash_pw(seed_pw),
        "must_change_password": True,   # force rotation on first login
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    logging.info("Seeded super-admin user (email=%s) — MUST rotate password on first login", email)

async def seed_default_tenant():
    """Ensure the default tenant exists. Returns the tenant dict."""
    t = await db.tenants.find_one({"slug": DEFAULT_TENANT_SLUG}, {"_id": 0})
    if not t:
        t = Tenant(
            slug=DEFAULT_TENANT_SLUG,
            name="Miracurl Unisex Family Salon",
            owner_email=os.environ["ADMIN_EMAIL"].lower(),
            location="Marathahalli, Bangalore",
            phone="+91 98765 00000",
            google_review_url=os.environ.get("GOOGLE_REVIEW_URL", ""),
            plan="enterprise",
            status="active",
        ).model_dump()
        await db.tenants.insert_one(t)
        logging.info("Seeded default tenant")
    return t

async def seed_admin():
    """Seed default salon admin ONCE. Never re-writes an existing hash so the owner can rotate it."""
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    default_tenant = await db.tenants.find_one({"slug": DEFAULT_TENANT_SLUG}, {"_id": 0})
    tenant_id = default_tenant["id"] if default_tenant else None
    existing = await db.users.find_one({"email": admin_email})
    if existing:
        # Only auto-heal missing tenant link. Do NOT overwrite the password.
        if not existing.get("tenant_id") and tenant_id:
            await db.users.update_one({"email": admin_email}, {"$set": {"tenant_id": tenant_id}})
        return
    seed_pw = os.environ.get("ADMIN_PASSWORD")
    if not seed_pw:
        logging.warning("ADMIN_PASSWORD is not set — skipping admin seed.")
        return
    await db.users.insert_one({
        "id": str(uuid.uuid4()),
        "email": admin_email,
        "name": "Salon Admin",
        "role": "admin",
        "tenant_id": tenant_id,
        "password_hash": hash_pw(seed_pw),
        "must_change_password": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    logging.info("Seeded admin user — MUST rotate password on first login")

async def seed_data():
    # Demo data seeds ONLY on a brand-new install — a permanent marker stops re-seeding
    # after the owner deletes demo staff/customers in production.
    from database import _raw_db
    if await _raw_db.app_migrations.find_one({"_id": "demo-seed-done"}):
        return
    # All seed inserts run with the default tenant context so tenant_id auto-injects
    if await db.services.count_documents({}) == 0:
        await db.services.insert_many([Service(**s).model_dump() for s in SEED_SERVICES])
    if await db.staff.count_documents({}) == 0:
        await db.staff.insert_many([Staff(**s).model_dump() for s in SEED_STAFF])
    if await db.products.count_documents({}) == 0:
        await db.products.insert_many([Product(**p).model_dump() for p in SEED_PRODUCTS])
    if await db.customers.count_documents({}) == 0:
        await db.customers.insert_many([Customer(**c).model_dump() for c in SEED_CUSTOMERS])
    await _raw_db.app_migrations.insert_one({"_id": "demo-seed-done"})

