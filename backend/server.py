from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import asyncio
import logging
from datetime import datetime, timezone

from fastapi import FastAPI, APIRouter, Request
from starlette.middleware.cors import CORSMiddleware

from database import client, _raw_db, db, _current_tenant_id  # noqa: F401

# ---------------- App ----------------
app = FastAPI(title="Miracurl Salon Management API")
api = APIRouter(prefix="/api")

from services.storage import _init_storage  # noqa: E402

@app.on_event("startup")
async def _boot_storage():
    try:
        _init_storage()
    except Exception as e:  # noqa: BLE001 — startup diagnostic
        logging.getLogger("storage").warning("Storage init deferred: %s", e)

# ---------------- Health ----------------
@api.get("/")
async def root():
    return {"app": "Miracurl Salon Management API", "status": "ok"}

# ---------------- Routers (registration order preserved from the monolith) ----------------
from routes.auth import router as auth_router  # noqa: E402
from routes.customers import router as customers_router  # noqa: E402
from routes.uploads import router as uploads_router  # noqa: E402
from routes.services_catalog import router as services_catalog_router  # noqa: E402
from routes.security_settings import router as security_settings_router  # noqa: E402
from routes.staff_admin import router as staff_admin_router  # noqa: E402
from routes.staff_portal import router as staff_portal_router, IST_TZ  # noqa: E402
from routes.gallery import router as gallery_router  # noqa: E402
from routes.inventory import router as inventory_router  # noqa: E402
from routes.tenant_settings import router as tenant_settings_router  # noqa: E402
from routes.crm import router as crm_router  # noqa: E402
from routes.briefings import router as briefings_router  # noqa: E402
from routes.reviews import router as reviews_router  # noqa: E402
from routes.reports import router as reports_router  # noqa: E402
from routes.public_site import router as public_site_router  # noqa: E402
from routes.super_admin import router as super_admin_router  # noqa: E402
from routes.data_cleanup import router as data_cleanup_router  # noqa: E402
from routes.super_admin_ops import router as super_admin_ops_router, _run_monthly_reports  # noqa: E402
from routes.assistant import router as assistant_router  # noqa: E402
from routes.offers import router as offers_router  # noqa: E402
from routes.public_chat import router as public_chat_router  # noqa: E402
from routes.sales import router as sales_router  # noqa: E402
from routes.registry import router as registry_router  # noqa: E402
from routes.appointments_pos import router as appointments_pos_router  # noqa: E402
from routes.mira_studio import router as mira_studio_router  # noqa: E402
from routes.social_connect import router as social_connect_router  # noqa: E402
from routes.mira_calendar import router as mira_calendar_router  # noqa: E402
from routes.mira_autopilot import router as mira_autopilot_router, autopilot_scheduler  # noqa: E402
from routes.promo_video import router as promo_video_router, weekly_promo_scheduler  # noqa: E402
from routes.platform_tools import router as platform_tools_router  # noqa: E402
from routes.promo_image import router as promo_image_router  # noqa: E402
from routes.offer_flyer import router as offer_flyer_router  # noqa: E402
from routes.packages import router as packages_router  # noqa: E402
from routes.wallet import router as wallet_router  # noqa: E402
from routes.id_cards import router as id_cards_router  # noqa: E402
from routes.releases import router as releases_router  # noqa: E402
from routes.testimonials import router as testimonials_router  # noqa: E402
from routes.diagnostics import router as diagnostics_router  # noqa: E402
from routes.subscriptions import router as subscriptions_router  # noqa: E402
from routes.day_offers import router as day_offers_router  # noqa: E402
from routes.cctv import router as cctv_router  # noqa: E402
from routes.hiring import router as hiring_router  # noqa: E402
from routes.hq_notifications import router as hq_notifications_router  # noqa: E402
from routes.winback import router as winback_router  # noqa: E402
from routes.employee_portal import router as employee_portal_router  # noqa: E402
from routes.hq_documents import router as hq_documents_router  # noqa: E402
from routes.mira_builder import router as mira_builder_router  # noqa: E402

from seeds import backfill_tenant_ids, seed_super_admin, seed_default_tenant, seed_admin, seed_data  # noqa: E402
from schedulers import (  # noqa: E402
    _monthly_report_scheduler, _weekly_report_scheduler, _birthday_scheduler,
    _cctv_poll_scheduler, _renewal_reminder_scheduler, _review_request_scheduler,
    _demo_followup_scheduler, _late_alert_scheduler, _weekly_package_scheduler,
)

for _r in (
    auth_router, customers_router, uploads_router, services_catalog_router,
    security_settings_router, staff_admin_router, staff_portal_router, gallery_router,
    inventory_router, tenant_settings_router, crm_router, briefings_router,
    reviews_router, reports_router, public_site_router, super_admin_router,
    data_cleanup_router, super_admin_ops_router, assistant_router, offers_router,
    public_chat_router, sales_router, registry_router, appointments_pos_router,
    mira_studio_router, social_connect_router, mira_calendar_router, mira_autopilot_router,
    promo_video_router, platform_tools_router, promo_image_router, offer_flyer_router,
    packages_router, wallet_router, id_cards_router, releases_router,
    testimonials_router, diagnostics_router, subscriptions_router, day_offers_router,
    cctv_router, hiring_router, hq_notifications_router, winback_router,
    employee_portal_router, hq_documents_router, mira_builder_router,
):
    api.include_router(_r)

@app.on_event("startup")
async def on_startup():
    asyncio.get_event_loop().create_task(_weekly_package_scheduler())
    asyncio.get_event_loop().create_task(_late_alert_scheduler())
    asyncio.get_event_loop().create_task(_renewal_reminder_scheduler())
    asyncio.get_event_loop().create_task(_demo_followup_scheduler())
    asyncio.get_event_loop().create_task(_review_request_scheduler())
    asyncio.get_event_loop().create_task(_cctv_poll_scheduler())
    asyncio.get_event_loop().create_task(_monthly_report_scheduler())
    asyncio.get_event_loop().create_task(_weekly_report_scheduler())
    asyncio.get_event_loop().create_task(_birthday_scheduler())
    asyncio.get_event_loop().create_task(autopilot_scheduler())
    asyncio.get_event_loop().create_task(weekly_promo_scheduler())

    async def _ensure_indexes():
        await db.users.create_index("email", unique=True)
        await db.tenants.create_index("slug", unique=True)
        # Drop legacy single-field unique sku index if present (multi-tenancy needs composite)
        try:
            existing_indexes = await _raw_db.products.index_information()
            if "sku_1" in existing_indexes:
                await _raw_db.products.drop_index("sku_1")
                logging.info("Dropped legacy products.sku_1 unique index")
        except Exception as e:
            logging.warning(f"Could not drop legacy index: {e}")
        await _raw_db.customers.create_index([("tenant_id", 1), ("phone", 1)])
        await _raw_db.services.create_index([("tenant_id", 1), ("category", 1)])
        await _raw_db.products.create_index([("tenant_id", 1), ("sku", 1)], unique=True)
        await _raw_db.appointments.create_index([("tenant_id", 1), ("scheduled_at", 1)])
        await _raw_db.invoices.create_index([("tenant_id", 1), ("created_at", -1)])
        await db.login_attempts.create_index("identifier")
        await _raw_db.revoked_tokens.create_index("jti", unique=True)
        await _raw_db.revoked_tokens.create_index("expires_at", expireAfterSeconds=0)
        await _raw_db.tts_cache.create_index("key", unique=True)
        await _raw_db.tts_cache.create_index("created_at", expireAfterSeconds=172800)
        await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=3600)

    async def _run_migrations():
        # One-time migration: booking-created leads (0 visits, never completed a service)
        # move out of CRM until their appointment is marked completed.
        if not await _raw_db.meta.find_one({"key": "crm_pending_migration_v1"}):
            res = await _raw_db.customers.update_many(
                {"visits": {"$in": [0, None]}, "total_spent": {"$in": [0, 0.0, None]},
                 "crm_status": {"$exists": False},
                 "id": {"$in": await _raw_db.appointments.distinct(
                     "customer_id", {"status": {"$nin": ["completed"]}})}},
                {"$set": {"crm_status": "pending"}},
            )
            await _raw_db.meta.insert_one({"key": "crm_pending_migration_v1", "modified": res.modified_count,
                                           "at": datetime.now(timezone.utc).isoformat()})
            logging.info(f"CRM pending migration: {res.modified_count} lead customers hidden until service completion")

    async def _run_seeds():
        default_tenant = await seed_default_tenant()
        await backfill_tenant_ids(default_tenant["id"])
        await seed_super_admin()
        await seed_admin()
        # Set context to default tenant for seed_data inserts
        _current_tenant_id.set(default_tenant["id"])
        await seed_data()
        _current_tenant_id.set(None)

    async def _db_prep():
        # Runs in the BACKGROUND so the pod passes its readiness probe immediately.
        # Any single failure (e.g. index option conflicts / duplicate keys on the
        # production Atlas data) is logged and skipped instead of crash-looping the pod.
        for name, step in (("indexes", _ensure_indexes), ("migrations", _run_migrations), ("seeds", _run_seeds)):
            try:
                await step()
                logging.info("startup db-prep step '%s' done", name)
            except Exception as e:  # noqa: BLE001 — deployment resilience
                logging.getLogger("startup").error("db-prep step '%s' failed (non-fatal): %s", name, e)

    asyncio.create_task(_db_prep())

    # Auto monthly business reports — emailed to every owner on the 1st (9 AM IST onwards).
    async def _monthly_report_loop():
        while True:
            try:
                now_ist = datetime.now(IST_TZ)
                if now_ist.day == 1 and now_ist.hour >= 9:
                    key = now_ist.strftime("%Y-%m")
                    if not await _raw_db.monthly_report_runs.find_one({"month": key}):
                        await _raw_db.monthly_report_runs.insert_one(
                            {"month": key, "started_at": datetime.now(timezone.utc).isoformat()})
                        out = await _run_monthly_reports(None)
                        await _raw_db.monthly_report_runs.update_one(
                            {"month": key},
                            {"$set": {"sent": out["sent"], "failed": out["failed"],
                                      "finished_at": datetime.now(timezone.utc).isoformat()}})
                        logging.info(f"Auto monthly reports for {out['month']}: {out['sent']} sent, {out['failed']} failed")
            except Exception as e:
                logging.getLogger("monthly_report").error(f"auto report loop error: {e}")
            await asyncio.sleep(3600)
    asyncio.create_task(_monthly_report_loop())

@app.on_event("shutdown")
async def on_shutdown():
    client.close()



app.include_router(api)

_cors_env = os.environ.get(
    "CORS_ORIGINS",
    "https://miracurl-suite.com,https://miracurl.com,https://miracurl-suite.com,https://hair-hub-system.preview.emergentagent.com",
).strip()
_cors_origins = (["*"] if _cors_env == "*" or not _cors_env
                 else [o.strip() for o in _cors_env.split(",") if o.strip()])
# SEC: never combine wildcard origins with credentials (cookie theft vector)
_cors_credentials = _cors_origins != ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_credentials=_cors_credentials,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gzip large JSON responses — 8-10x smaller payloads = much faster on mobile networks
from starlette.middleware.gzip import GZipMiddleware  # noqa: E402
app.add_middleware(GZipMiddleware, minimum_size=1500)


# ---------------- Security Headers (SEC-P3) ----------------
# Adds the standard defensive HTTP headers on every API response so a browser
# refuses to iframe, MIME-sniff, or downgrade the connection. CSP is scoped
# to the API side only — the frontend is a separate build.
@app.middleware("http")
async def _security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
    return resp

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')