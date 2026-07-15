# Extracted from server.py — domain route module (auto-split refactor)
import os  # noqa: F401
import re  # noqa: F401
import io  # noqa: F401
import csv  # noqa: F401
import math  # noqa: F401
import uuid  # noqa: F401
import hmac  # noqa: F401
import hashlib  # noqa: F401
import asyncio  # noqa: F401
import base64  # noqa: F401
import secrets  # noqa: F401
import logging  # noqa: F401
import html as html_lib  # noqa: F401
from datetime import datetime, timezone, timedelta  # noqa: F401
from typing import Dict, List, Optional  # noqa: F401
from urllib.parse import quote, urlparse  # noqa: F401

import requests  # noqa: F401
from fastapi import (  # noqa: F401
    APIRouter, HTTPException, Depends, Request, Response, Query, UploadFile, File, Form,
)
from starlette.responses import StreamingResponse  # noqa: F401
from pydantic import BaseModel, Field, EmailStr, field_validator  # noqa: F401

from database import client, _raw_db, db, _current_tenant_id, _clean  # noqa: F401
from security import (  # noqa: F401
    hash_pw, verify_pw, get_current_user, require_admin, public_rate_limit,
    durable_rate_limit, ai_daily_quota, require_super_admin, require_tenant_admin,
    current_tenant, require_owner_pin, _pin_attempt_guard, _pin_attempt_fail, _pin_attempt_clear,
)
from models import (  # noqa: F401
    Tenant, Customer, Appointment, REVIEW_REWARD_CREDITS, MAX_CUSTOMER_CREDIT,
    REFERRAL_REWARD_REFERRER, REFERRAL_REWARD_REFERRED,
)
from email_service import (  # noqa: F401
    _send_email, _welcome_email_html, _credentials_email_html, _monthly_report_html,
    _weekly_report_html, _birthday_email_html, _platform_digest_html,
)
from services.storage import _put_object, _get_object, _MIME, APP_NAME, validate_image_bytes  # noqa: F401
from services.pdf import _render_salary_slip_pdf, _render_resume_pdf  # noqa: F401
from services.billing import (  # noqa: F401
    _validate_coupon, _consume_coupon, _coupon_discount, _active_membership, _loyalty_rules,
)
from utils import _csv_cell, _csv_row, _read_csv_upload, MAX_CSV_BYTES  # noqa: F401
from schemas import CustomerIn

router = APIRouter()

# ---------------- Generic CRUD helpers ----------------

# ---------------- Customers ----------------
@router.get("/customers")
async def list_customers(q: Optional[str] = None, user=Depends(require_admin)):
    # CRM shows only customers who completed a service (or were added manually) —
    # public bookings stay "pending" until their appointment is marked completed.
    flt = {"crm_status": {"$ne": "pending"}}
    if q:
        # SEC-P3 fix: escape user input so `q` cannot inject a $regex DoS pattern.
        safe_q = re.escape(q)
        flt["$or"] = [{"name": {"$regex": safe_q, "$options": "i"}}, {"phone": {"$regex": safe_q}}]
    docs = await db.customers.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs

@router.post("/customers")
async def create_customer(body: CustomerIn, user=Depends(get_current_user)):
    c = Customer(**body.model_dump()).model_dump()
    await db.customers.insert_one(c)
    return _clean(c)

@router.get("/customers/export")
async def export_customers_csv(user=Depends(require_admin)):
    rows = await db.customers.find({}).sort("name", 1).to_list(5000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["name", "phone", "email", "gender", "dob", "address", "notes", "loyalty_points", "total_spent", "visits"])
    for r in rows:
        _csv_row(w, [
            r.get("name", ""), r.get("phone", ""), r.get("email", "") or "", r.get("gender", "") or "",
            r.get("dob", "") or "", r.get("address", "") or "", r.get("notes", "") or "",
            r.get("loyalty_points", 0), r.get("total_spent", 0), r.get("visits", 0),
        ])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=customers.csv"})

@router.post("/customers/import")
async def import_customers_csv(file: UploadFile = File(...), user=Depends(require_admin)):
    content = await _read_csv_upload(file)
    reader = csv.DictReader(io.StringIO(content))
    fields = {(f or "").strip().lower() for f in (reader.fieldnames or [])}
    if not {"name", "phone"}.issubset(fields):
        raise HTTPException(400, "CSV needs columns: name, phone (optional: email, gender, dob, address, notes)")
    added = updated = skipped = 0
    for raw in reader:
        row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
        name, phone = row.get("name", ""), re.sub(r"[^\d+]", "", row.get("phone", ""))
        if not name or not phone:
            skipped += 1
            continue
        doc = {"name": name, "phone": phone}
        for f in ("email", "gender", "dob", "address", "notes"):
            if row.get(f):
                doc[f] = row[f]
        existing = await db.customers.find_one({"phone": phone})
        if existing:
            await db.customers.update_one({"id": existing["id"]}, {"$set": doc})
            updated += 1
        else:
            await db.customers.insert_one(Customer(**doc).model_dump())
            added += 1
    return {"added": added, "updated": updated, "skipped": skipped}

@router.get("/customers/{cid}")
async def get_customer(cid: str, user=Depends(get_current_user)):
    c = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Not found")
    return c

@router.put("/customers/{cid}")
async def update_customer(cid: str, body: CustomerIn, user=Depends(require_admin)):
    await db.customers.update_one({"id": cid}, {"$set": body.model_dump()})
    return await db.customers.find_one({"id": cid}, {"_id": 0})

@router.delete("/customers/{cid}")
async def delete_customer(cid: str, user=Depends(require_admin)):
    await db.customers.delete_one({"id": cid})
    return {"ok": True}

# ---------------- Uploads (staff / service / product images) ----------------
