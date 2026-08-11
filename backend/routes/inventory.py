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
from schemas import Product, ProductIn

class VendorIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field("", max_length=20)
    contact_person: str = Field("", max_length=100)
    gst_number: str = Field("", max_length=15)
    address: str = Field("", max_length=300)
    notes: str = Field("", max_length=300)

    @field_validator("gst_number")
    @classmethod
    def _gst_format(cls, v: str) -> str:
        v = v.strip().upper()
        if v and not re.fullmatch(r"[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]", v):
            raise ValueError("GST number must be 15 characters, e.g. 29ABCDE1234F1Z5")
        return v

class LowStockMailIn(BaseModel):
    vendor_id: str = Field(..., max_length=64)


router = APIRouter()

from routes.briefings import LOW_STOCK_LIMIT

@router.get("/vendors")
async def list_vendors(user=Depends(get_current_user)):
    return await db.vendors.find({}, {"_id": 0}).sort("name", 1).to_list(100)


@router.post("/vendors")
async def create_vendor(body: VendorIn, user=Depends(require_tenant_admin)):
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.vendors.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/vendors/{vid}")
async def update_vendor(vid: str, body: VendorIn, user=Depends(require_tenant_admin)):
    res = await db.vendors.update_one({"id": vid}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Vendor not found")
    return await db.vendors.find_one({"id": vid}, {"_id": 0})


@router.delete("/vendors/{vid}")
async def delete_vendor(vid: str, user=Depends(require_tenant_admin)):
    await db.vendors.delete_one({"id": vid})
    return {"ok": True}


def _restock_rows(items: list) -> str:
    return "".join(
        f"<tr>"
        f"<td style='padding:12px 16px;border-bottom:1px solid #f1e8d8;color:#2b2b33;font-size:14px'>{p['name']}</td>"
        f"<td style='padding:12px 16px;border-bottom:1px solid #f1e8d8;color:#6b6b75;font-size:13px'>{p.get('brand') or '—'}</td>"
        f"<td style='padding:12px 16px;border-bottom:1px solid #f1e8d8;color:#6b6b75;font-size:13px;font-family:monospace'>{p.get('sku') or '—'}</td>"
        f"<td style='padding:12px 16px;border-bottom:1px solid #f1e8d8;text-align:center'>"
        f"<span style='display:inline-block;background:#fdecec;color:#dc2626;font-weight:bold;font-size:13px;padding:3px 12px;border-radius:999px'>{p['stock']} left</span></td></tr>"
        for p in items)


def _restock_email(vendor: dict, items: list, t: dict) -> tuple:
    img = os.environ.get("RESTOCK_IMAGE_URL", "")
    img_row = (f'<tr><td style="padding:0"><img src="{img}" alt="Restock Alert" width="600" '
               f'style="display:block;width:100%;border-radius:16px 16px 0 0"/></td></tr>') if img else ""
    rows = _restock_rows(items)
    html = f"""
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f14;padding:28px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;font-family:Georgia,'Times New Roman',serif;box-shadow:0 8px 40px rgba(212,175,55,.25)">
{img_row}
<tr><td style="background:linear-gradient(135deg,#17171f,#26202b);padding:26px 36px;text-align:center">
  <div style="color:#e6c66e;font-size:12px;letter-spacing:4px;text-transform:uppercase">✦ &nbsp;Inventory Alert&nbsp; ✦</div>
  <div style="color:#ffffff;font-size:26px;margin-top:8px">{t.get('name')}</div>
  <div style="color:#b9b0c4;font-size:13px;margin-top:6px;font-family:Arial,sans-serif">{len(items)} product{'s' if len(items) != 1 else ''} need restocking</div>
</td></tr>
<tr><td style="padding:30px 36px 8px">
  <p style="margin:0;color:#2b2b33;font-size:15px;font-family:Arial,sans-serif">Dear <b>{vendor.get('contact_person') or vendor['name']}</b>,</p>
  <p style="margin:12px 0 0;color:#55555f;font-size:14px;line-height:1.6;font-family:Arial,sans-serif">
    The following products are running low at our salon (below {LOW_STOCK_LIMIT} units).
    Kindly arrange a fresh supply at the earliest — details below:</p>
</td></tr>
<tr><td style="padding:18px 36px">
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f1e8d8;border-radius:12px;overflow:hidden">
    <tr style="background:#faf6ec">
      <th style="padding:12px 16px;text-align:left;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#a08a4b;font-family:Arial,sans-serif">Product</th>
      <th style="padding:12px 16px;text-align:left;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#a08a4b;font-family:Arial,sans-serif">Brand</th>
      <th style="padding:12px 16px;text-align:left;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#a08a4b;font-family:Arial,sans-serif">SKU</th>
      <th style="padding:12px 16px;text-align:center;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#a08a4b;font-family:Arial,sans-serif">Stock</th>
    </tr>
    {rows}
  </table>
</td></tr>
<tr><td style="padding:8px 36px 26px">
  <p style="margin:0;color:#55555f;font-size:14px;line-height:1.6;font-family:Arial,sans-serif">
    Please confirm availability and expected delivery timeline by replying to this email
    {f"or calling us at <b>{t.get('phone')}</b>" if t.get('phone') else ""}.</p>
</td></tr>
<tr><td style="background:#17171f;padding:22px 36px;text-align:center">
  <div style="color:#e6c66e;font-size:16px">✦ {t.get('name')} ✦</div>
  <div style="color:#8f8798;font-size:12px;margin-top:6px;font-family:Arial,sans-serif">{t.get('location') or ''}{(' · ' + t.get('phone')) if t.get('phone') else ''}</div>
  <div style="color:#5d5766;font-size:11px;margin-top:10px;font-family:Arial,sans-serif">Sent with ♥ by Mira — your salon's AI assistant</div>
</td></tr>
</table>
</td></tr></table>"""
    subject = f"✦ Restock request — {len(items)} products low at {t.get('name')}"
    return subject, html


def _vendor_items(low: list, vendor_id: str) -> list:
    """Vendor's tagged low items; if none are tagged to them, fall back to untagged items."""
    tagged = [p for p in low if p.get("vendor_id") == vendor_id]
    if tagged:
        return tagged
    return [p for p in low if not p.get("vendor_id")]


async def _low_stock_products() -> list:
    low = await db.products.find(
        {"$expr": {"$lte": ["$stock", {"$ifNull": ["$low_stock_threshold", 5]}]}},
        {"_id": 0, "name": 1, "brand": 1, "stock": 1, "sku": 1, "vendor_id": 1},
    ).sort("stock", 1).to_list(100)
    if not low:
        raise HTTPException(400, "No products are low on stock right now")
    return low


@router.post("/vendors/send-low-stock")
async def send_low_stock_email(body: LowStockMailIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    vendor = await db.vendors.find_one({"id": body.vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    low = await _low_stock_products()
    items = _vendor_items(low, body.vendor_id)
    if not items:
        raise HTTPException(400, f"No low-stock products are assigned to {vendor['name']} (all are tagged to other vendors)")
    subject, html = _restock_email(vendor, items, t)
    result = await _send_email([vendor["email"]], subject, html)
    if not result.get("sent"):
        raise HTTPException(400, result.get("error") or "Email failed")
    return {"ok": True, "sent_to": vendor["email"], "products": len(items)}


@router.post("/vendors/send-low-stock-all")
async def send_low_stock_all(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    """Email every vendor only THEIR tagged low-stock products in one click."""
    low = await _low_stock_products()
    vendors = await db.vendors.find({}, {"_id": 0}).to_list(100)
    if not vendors:
        raise HTTPException(400, "Add a vendor first")
    by_vendor = {v["id"]: v for v in vendors}
    sent, failed = [], []
    unassigned = sum(1 for p in low if not p.get("vendor_id") or p.get("vendor_id") not in by_vendor)
    for vid, vendor in by_vendor.items():
        items = [p for p in low if p.get("vendor_id") == vid]
        if not items:
            continue
        subject, html = _restock_email(vendor, items, t)
        result = await _send_email([vendor["email"]], subject, html)
        (sent if result.get("sent") else failed).append({"vendor": vendor["name"], "email": vendor["email"], "products": len(items)})
    if not sent and not failed:
        raise HTTPException(400, "No low-stock products are tagged to a vendor yet — set the Vendor field on products in Inventory")
    return {"ok": True, "sent": sent, "failed": failed, "unassigned_products": unassigned}


# ---------------- Products / Inventory ----------------

@router.get("/products")
async def list_products(user=Depends(get_current_user)):
    return await db.products.find({}, {"_id": 0}).to_list(500)

@router.post("/products")
async def create_product(body: ProductIn, user=Depends(get_current_user)):
    p = Product(**body.model_dump()).model_dump()
    await db.products.insert_one(p)
    return _clean(p)

@router.get("/products/export")
async def export_products_csv(user=Depends(require_tenant_admin)):
    rows = await db.products.find({}).sort("name", 1).to_list(2000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["name", "brand", "category", "sku", "price", "cost", "stock", "low_stock_threshold", "image_url", "product_type"])
    for r in rows:
        _csv_row(w, [
            r.get("name", ""), r.get("brand", "") or "", r.get("category", ""), r.get("sku", ""),
            r.get("price", 0), r.get("cost", 0), r.get("stock", 0), r.get("low_stock_threshold", 5),
            r.get("image_url", "") or "", r.get("product_type", "retail") or "retail",
        ])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=products.csv"})

def _parse_csv_numbers(row: dict) -> Optional[dict]:
    try:
        return {"price": float(row.get("price") or ""),
                "stock": int(float(row.get("stock") or 0)),
                "cost": float(row.get("cost") or 0),
                "low_stock_threshold": int(float(row.get("low_stock_threshold") or 5))}
    except ValueError:
        return None


def _product_doc_from_csv_row(raw: dict) -> Optional[dict]:
    """Parse one CSV row into a product doc. Returns None if the row is invalid."""
    row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
    name = row.get("name", "")
    nums = _parse_csv_numbers(row) if name else None
    if not nums:
        return None
    sku = row.get("sku") or f"SKU-{re.sub(r'[^A-Za-z0-9]', '', name)[:12].upper()}"
    ptype = (row.get("product_type") or "retail").lower()
    return {
        "name": name, "brand": row.get("brand", ""), "category": row.get("category") or "General",
        "sku": sku, "image_url": row.get("image_url", ""),
        "product_type": ptype if ptype in ("retail", "in_house") else "retail", **nums,
    }


@router.post("/products/import")
async def import_products_csv(file: UploadFile = File(...), user=Depends(require_tenant_admin)):
    content = await _read_csv_upload(file)
    reader = csv.DictReader(io.StringIO(content))
    fields = {(f or "").strip().lower() for f in (reader.fieldnames or [])}
    if not {"name", "category", "price", "stock"}.issubset(fields):
        raise HTTPException(400, "CSV needs columns: name, category, price, stock (optional: brand, sku, cost, low_stock_threshold, image_url)")
    added = updated = skipped = 0
    for raw in reader:
        doc = _product_doc_from_csv_row(raw)
        if doc is None:
            skipped += 1
            continue
        existing = await db.products.find_one({"$or": [{"sku": doc["sku"]}, {"name": doc["name"]}]})
        if existing:
            await db.products.update_one({"id": existing["id"]}, {"$set": doc})
            updated += 1
        else:
            await db.products.insert_one(Product(**doc).model_dump())
            added += 1
    return {"added": added, "updated": updated, "skipped": skipped}

@router.put("/products/{pid}")
async def update_product(pid: str, body: ProductIn, user=Depends(get_current_user)):
    await db.products.update_one({"id": pid}, {"$set": body.model_dump()})
    return await db.products.find_one({"id": pid}, {"_id": 0})


class ProductUseIn(BaseModel):
    qty: int = Field(..., ge=1, le=1000)
    note: str = Field("", max_length=200)


@router.post("/products/{pid}/use")
async def use_product_stock(pid: str, body: ProductUseIn, user=Depends(get_current_user)):
    """Deduct in-house/service consumption from stock (e.g. hair color tubes used today)."""
    p = await db.products.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Product not found")
    new_stock = max(0, int(p.get("stock") or 0) - body.qty)
    await db.products.update_one({"id": pid}, {"$set": {"stock": new_stock}})
    await db.product_usage.insert_one({
        "id": str(uuid.uuid4()), "product_id": pid, "product_name": p.get("name", ""),
        "qty": body.qty, "note": body.note.strip(),
        "used_by": user.get("email", ""), "used_at": datetime.now(timezone.utc).isoformat(),
        "stock_after": new_stock})
    low = new_stock <= int(p.get("low_stock_threshold") or 5)
    return {"ok": True, "stock": new_stock, "low_stock": low}


@router.get("/products/{pid}/usage")
async def product_usage_log(pid: str, user=Depends(get_current_user)):
    return [_clean(u) for u in await db.product_usage.find({"product_id": pid}, {"_id": 0}).sort("used_at", -1).to_list(50)]

@router.delete("/products/{pid}")
async def delete_product(pid: str, user=Depends(require_tenant_admin)):
    await db.products.delete_one({"id": pid})
    return {"ok": True}

