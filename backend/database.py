"""Mongo foundation: client, tenant-scoped collection proxy, contextvars.

`db` auto-applies the current tenant filter (set per-request in security deps).
`_raw_db` is unscoped — for global collections (tenants, users) and super-admin flows.
"""
import os
from typing import Any, Optional
from contextvars import ContextVar
from motor.motor_asyncio import AsyncIOMotorClient

# ---------------- DB ----------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
_raw_db = client[os.environ['DB_NAME']]

# Preview pods use a local Mongo; production uses Atlas. Owner-facing scheduled
# emails must only leave the production environment (override: OWNER_SCHEDULED_EMAILS=on|off).
_flag = os.environ.get("OWNER_SCHEDULED_EMAILS", "").lower()
IS_PREVIEW_ENV = (_flag == "off") if _flag in ("on", "off") else ("localhost" in mongo_url or "127.0.0.1" in mongo_url)

# ---------------- Tenant-aware DB wrapper ----------------
_current_tenant_id: ContextVar[Optional[str]] = ContextVar("current_tenant_id", default=None)
# When True, TenantCollection allows unscoped global reads. Set by super_admin
# routes that legitimately need cross-tenant data (revenue dashboards, etc.).
_super_admin_ok: ContextVar[bool] = ContextVar("super_admin_ok", default=False)

class TenantCollection:
    """Motor collection proxy that auto-applies tenant_id filter and injects tenant_id on insert."""
    def __init__(self, coll: Any, scoped: bool = True) -> None:
        self._coll = coll
        self._scoped = scoped

    def _scope(self, q: Optional[dict]) -> dict:
        if not self._scoped:
            return q if q is not None else {}
        tid = _current_tenant_id.get()
        if tid is None:
            # Global (unscoped) reads are allowed ONLY for super_admin flows
            # that explicitly set _super_admin_ok. Otherwise, we force a filter
            # that matches nothing so a mis-configured request never leaks data.
            if _super_admin_ok.get():
                return q if q is not None else {}
            merged = dict(q) if q else {}
            merged["tenant_id"] = "__NO_TENANT_CONTEXT__"
            return merged
        merged = dict(q) if q else {}
        if "tenant_id" not in merged:
            merged["tenant_id"] = tid
        return merged

    def find(self, q: Optional[dict] = None, *a: Any, **kw: Any) -> Any: return self._coll.find(self._scope(q), *a, **kw)
    async def find_one(self, q: Optional[dict] = None, *a: Any, **kw: Any) -> Optional[dict]: return await self._coll.find_one(self._scope(q), *a, **kw)
    async def insert_one(self, doc: dict, *a: Any, **kw: Any) -> Any:
        if self._scoped:
            tid = _current_tenant_id.get()
            if tid is not None and "tenant_id" not in doc:
                doc["tenant_id"] = tid
        return await self._coll.insert_one(doc, *a, **kw)
    async def insert_many(self, docs: list, *a: Any, **kw: Any) -> Any:
        if self._scoped:
            tid = _current_tenant_id.get()
            if tid is not None:
                for d in docs:
                    if "tenant_id" not in d:
                        d["tenant_id"] = tid
        return await self._coll.insert_many(docs, *a, **kw)
    async def update_one(self, q: dict, *a: Any, **kw: Any) -> Any: return await self._coll.update_one(self._scope(q), *a, **kw)
    async def find_one_and_update(self, q: dict, *a: Any, **kw: Any) -> Optional[dict]: return await self._coll.find_one_and_update(self._scope(q), *a, **kw)
    async def update_many(self, q: dict, *a: Any, **kw: Any) -> Any: return await self._coll.update_many(self._scope(q), *a, **kw)
    async def delete_one(self, q: dict, *a: Any, **kw: Any) -> Any: return await self._coll.delete_one(self._scope(q), *a, **kw)
    async def delete_many(self, q: dict, *a: Any, **kw: Any) -> Any: return await self._coll.delete_many(self._scope(q), *a, **kw)
    async def count_documents(self, q: Optional[dict] = None, *a: Any, **kw: Any) -> int: return await self._coll.count_documents(self._scope(q or {}), *a, **kw)
    def aggregate(self, pipeline: list, *a: Any, **kw: Any) -> Any:
        if self._scoped:
            tid = _current_tenant_id.get()
            if tid is not None:
                pipeline = [{"$match": {"tenant_id": tid}}] + list(pipeline)
            elif not _super_admin_ok.get():
                # Fail closed: no tenant context and not a super-admin flow -> match nothing.
                pipeline = [{"$match": {"tenant_id": "__NO_TENANT_CONTEXT__"}}] + list(pipeline)
        return self._coll.aggregate(pipeline, *a, **kw)
    def create_index(self, *a: Any, **kw: Any) -> Any: return self._coll.create_index(*a, **kw)

class _DB:
    # global (unscoped) collections
    tenants = _raw_db.tenants
    users = _raw_db.users
    login_attempts = _raw_db.login_attempts
    login_otps = _raw_db.login_otps
    password_reset_tokens = _raw_db.password_reset_tokens
    revoked_tokens = _raw_db.revoked_tokens
    subscriptions = _raw_db.subscriptions
    subscription_payments = _raw_db.subscription_payments
    affiliate_referrals = _raw_db.affiliate_referrals
    grace_requests = _raw_db.grace_requests
    audit_log = _raw_db.audit_log
    # tenant-scoped collections
    customers = TenantCollection(_raw_db.customers)
    services = TenantCollection(_raw_db.services)
    staff = TenantCollection(_raw_db.staff)
    products = TenantCollection(_raw_db.products)
    appointments = TenantCollection(_raw_db.appointments)
    invoices = TenantCollection(_raw_db.invoices)
    invoice_edits = TenantCollection(_raw_db.invoice_edits)
    product_usage = TenantCollection(_raw_db.product_usage)
    reviews = TenantCollection(_raw_db.reviews)
    attendance = TenantCollection(_raw_db.attendance)
    feedback = TenantCollection(_raw_db.feedback)
    gallery = TenantCollection(_raw_db.gallery)
    chat_threads = TenantCollection(_raw_db.chat_threads)
    chat_messages = TenantCollection(_raw_db.chat_messages)
    whatsapp_requests = TenantCollection(_raw_db.whatsapp_requests)
    table_orders = TenantCollection(_raw_db.table_orders)
    table_calls = TenantCollection(_raw_db.table_calls)
    category_specials = TenantCollection(_raw_db.category_specials)
    packages = TenantCollection(_raw_db.packages)
    memberships = TenantCollection(_raw_db.memberships)
    customer_packages = TenantCollection(_raw_db.customer_packages)
    customer_memberships = TenantCollection(_raw_db.customer_memberships)
    coupons = TenantCollection(_raw_db.coupons)
    advances = TenantCollection(_raw_db.advances)
    vendors = TenantCollection(_raw_db.vendors)
    staff_resumes = TenantCollection(_raw_db.staff_resumes)
    leave_requests = TenantCollection(_raw_db.leave_requests)
    week_off_requests = TenantCollection(_raw_db.week_off_requests)
    branch_switch_requests = TenantCollection(_raw_db.branch_switch_requests)
    sms_pack_payments = TenantCollection(_raw_db.sms_pack_payments)
    entertainment_playlists = TenantCollection(_raw_db.entertainment_playlists)
    wallet_plans = TenantCollection(_raw_db.wallet_plans)
    wallet_txns = TenantCollection(_raw_db.wallet_txns)
    complaints = TenantCollection(_raw_db.complaints)
    service_categories = TenantCollection(_raw_db.service_categories)
    service_category_order = TenantCollection(_raw_db.service_category_order)

db = _DB()


def _clean(doc):
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc
