# Extracted from server.py — domain route module (auto-split refactor)
import re
import io
import csv
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

from fastapi import (
    APIRouter, HTTPException, Depends, Response, UploadFile, File,
)
from pydantic import BaseModel, Field

from database import db, _clean
from security import (
    get_current_user, require_admin, current_tenant,
)
from models import (
    Customer,
)
from utils import _csv_row, _read_csv_upload, normalize_customer_row
from schemas import CustomerIn

router = APIRouter()

# ---------------- Generic CRUD helpers ----------------

# ---------------- Customers ----------------
_IST = timezone(timedelta(hours=5, minutes=30))


def _ist_day(iso: str) -> str:
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone(_IST).date().isoformat()
    except ValueError:
        return str(iso)[:10]


async def _spend_from_bills(customer_id: Optional[str]) -> tuple[Dict[str, float], Dict[str, set]]:
    """Lifetime spend + distinct visit days per customer from real (non-voided, completed) bills."""
    q: dict = {"status": {"$nin": ["voided", "open"]}}
    if customer_id:
        q["customer_id"] = customer_id
    spent: Dict[str, float] = {}
    days: Dict[str, set] = {}
    async for inv in db.invoices.find(q, {"_id": 0, "customer_id": 1, "total": 1, "created_at": 1}):
        cid = inv.get("customer_id")
        if cid:
            spent[cid] = spent.get(cid, 0.0) + float(inv.get("total") or 0)
            days.setdefault(cid, set()).add(_ist_day(inv.get("created_at", "")))
    return spent, days


async def _add_unbilled_appointments(spent: Dict[str, float], days: Dict[str, set], customer_id: Optional[str]) -> None:
    """Completed appointments count as a visit (and their value) only on days without a bill."""
    q: dict = {"status": "completed", "crm_counted": True}
    if customer_id:
        q["customer_id"] = customer_id
    async for a in db.appointments.find(q, {"_id": 0, "customer_id": 1, "scheduled_at": 1, "total": 1}):
        cid = a.get("customer_id")
        if not cid:
            continue
        d = _ist_day(a.get("scheduled_at", ""))
        if d not in days.setdefault(cid, set()):
            days[cid].add(d)
            spent[cid] = spent.get(cid, 0.0) + float(a.get("total") or 0)


@router.post("/customers/resync-stats")
async def resync_customer_stats(customer_id: Optional[str] = None, user=Depends(require_admin)):
    """Recompute Spent / Visits from real bills (+ unbilled completed appointments).
    One click fixes any CRM drift so it matches Reports."""
    spent, days = await _spend_from_bills(customer_id)
    await _add_unbilled_appointments(spent, days, customer_id)
    flt = {"id": customer_id} if customer_id else {}
    custs = await db.customers.find(flt, {"_id": 0, "id": 1, "total_spent": 1, "visits": 1}).to_list(20000)
    changed = 0
    for c in custs:
        new_spent, new_visits = round(spent.get(c["id"], 0.0), 2), len(days.get(c["id"], set()))
        if abs(float(c.get("total_spent") or 0) - new_spent) > 0.009 or int(c.get("visits") or 0) != new_visits:
            await db.customers.update_one({"id": c["id"]}, {"$set": {"total_spent": new_spent, "visits": new_visits}})
            changed += 1
    return {"ok": True, "checked": len(custs), "corrected": changed}


# Staff bill at POS but must not harvest the client book: only what billing needs.
_STAFF_CUSTOMER_FIELDS = {"_id": 0, "id": 1, "name": 1, "phone": 1, "gender": 1, "loyalty_points": 1,
                          "wallet_balance": 1, "referral_code": 1, "visits": 1, "crm_status": 1, "created_at": 1}


def _customer_projection(user: dict) -> dict:
    return _STAFF_CUSTOMER_FIELDS if user.get("role") == "staff" else {"_id": 0}


@router.get("/customers")
async def list_customers(q: Optional[str] = None, user=Depends(get_current_user)):
    # CRM shows only customers who completed a service (or were added manually) —
    # public bookings stay "pending" until their appointment is marked completed.
    flt = {"crm_status": {"$ne": "pending"}}
    if q:
        # SEC-P3 fix: escape user input so `q` cannot inject a $regex DoS pattern.
        safe_q = re.escape(q)
        flt["$or"] = [{"name": {"$regex": safe_q, "$options": "i"}}, {"phone": {"$regex": safe_q}}]
    proj = _customer_projection(user)
    docs = await db.customers.find(flt, proj).sort("created_at", -1).to_list(500)
    digits = re.sub(r"\D", "", q or "")
    if q and len(digits) >= 4:
        # also match normalized digits so formatted numbers ('+91 98765 …') are found
        seen = {d["id"] for d in docs}
        extra = await db.customers.find({"crm_status": {"$ne": "pending"}}, proj).to_list(10000)
        docs += [c for c in extra if c["id"] not in seen and digits in re.sub(r"\D", "", c.get("phone") or "")]
    for d in docs:
        d.pop("_id", None)
    return docs

async def _find_by_phone(digits: str, exclude_id: str | None = None):
    """Match on normalized digits so '+91 98765 43210' and '9876543210' are the same number."""
    last10 = digits[-10:]
    docs = await db.customers.find({}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(10000)
    for c in docs:
        if exclude_id and c["id"] == exclude_id:
            continue
        if re.sub(r"\D", "", c.get("phone") or "")[-10:] == last10:
            return c
    return None


@router.post("/customers")
async def create_customer(body: CustomerIn, user=Depends(get_current_user)):
    digits = re.sub(r"\D", "", body.phone or "")
    if len(digits) < 10:
        raise HTTPException(400, "Guest phone number is required (10 digits) — it's used for WhatsApp confirmations")
    existing = await _find_by_phone(digits)
    if existing:
        raise HTTPException(409, {"code": "PHONE_EXISTS", "customer": existing})
    c = Customer(**body.model_dump()).model_dump()
    await db.customers.insert_one(c)
    return _clean(c)


class DineinGuestIn(BaseModel):
    phone: Optional[str] = Field(None, max_length=20)
    name: Optional[str] = Field(None, max_length=80)


@router.post("/customers/dinein-guest")
async def dinein_guest(body: Optional[DineinGuestIn] = None, user=Depends(get_current_user)):
    """Walk-in guest for QR table bills — real customer when the diner shared a
    phone number (repeat-visit tracking), otherwise the reusable placeholder."""
    digits = re.sub(r"\D", "", (body.phone if body else None) or "")
    if len(digits) >= 10:
        existing = await _find_by_phone(digits)
        if existing:
            return _clean(existing)
        c = Customer(name=((body.name or "").strip()[:80] if body else "") or "Dine-in Guest",
                     phone=digits).model_dump()
        await db.customers.insert_one(c)
        return _clean(c)
    existing = await _find_by_phone("0000000000")
    if existing:
        return _clean(existing)
    c = Customer(name="Dine-in Guest", phone="0000000000").model_dump()
    await db.customers.insert_one(c)
    return _clean(c)


@router.get("/customers/search-phone")
async def search_phone(q: str, user=Depends(get_current_user)):
    """Live lookup while typing a number — matches normalized digits anywhere in the phone."""
    digits = re.sub(r"\D", "", q or "")
    if len(digits) < 4:
        return []
    docs = await db.customers.find(
        {}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "country_code": 1, "visits": 1}).to_list(10000)
    out = [c for c in docs if digits in re.sub(r"\D", "", c.get("phone") or "")]
    out.sort(key=lambda c: -(c.get("visits") or 0))
    return out[:6]


@router.get("/customers/duplicates")
async def customer_duplicates(user=Depends(require_admin)):
    """Groups of CRM records sharing the same phone number (last 10 digits)."""
    docs = await db.customers.find(
        {}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "visits": 1, "total_spent": 1,
             "loyalty_points": 1, "wallet_balance": 1, "created_at": 1, "crm_status": 1}).to_list(3000)
    groups: Dict[str, list] = {}
    for c in docs:
        digits = re.sub(r"\D", "", c.get("phone") or "")[-10:]
        if len(digits) < 7:
            continue
        groups.setdefault(digits, []).append(c)
    dup = [{"phone": k, "customers": sorted(v, key=lambda x: x.get("created_at") or "")}
           for k, v in groups.items() if len(v) > 1]
    dup.sort(key=lambda g: -len(g["customers"]))
    return dup


class MergeIn(BaseModel):
    primary_id: str
    duplicate_ids: List[str]


def _summed_customer_stats(primary: dict, dupes: list) -> dict:
    def _isum(f: str) -> int:
        return int(primary.get(f) or 0) + sum(int(d.get(f) or 0) for d in dupes)

    def _fsum(f: str) -> float:
        return round(float(primary.get(f) or 0) + sum(float(d.get(f) or 0) for d in dupes), 2)

    return {"visits": _isum("visits"), "loyalty_points": _isum("loyalty_points"),
            "total_spent": _fsum("total_spent"), "wallet_balance": _fsum("wallet_balance"),
            "referral_credit": _fsum("referral_credit")}


def _backfilled_profile_fields(primary: dict, dupes: list) -> dict:
    out: dict = {}
    for f in ("email", "dob", "anniversary", "address", "notes", "gender"):
        if primary.get(f):
            continue
        v = next((d.get(f) for d in dupes if d.get(f)), None)
        if v:
            out[f] = v
    return out


def _merged_customer_fields(primary: dict, dupes: list) -> dict:
    """Summed stats + backfilled profile fields for the surviving record."""
    upd = {**_summed_customer_stats(primary, dupes), **_backfilled_profile_fields(primary, dupes)}
    lv = [x for x in [primary.get("last_visited")] + [d.get("last_visited") for d in dupes] if x]
    if lv:
        upd["last_visited"] = max(lv)
    if primary.get("crm_status") == "pending" and any(d.get("crm_status") != "pending" for d in dupes):
        upd["crm_status"] = "active"
    return upd


async def _repoint_customer_refs(dup_ids: list, primary_id: str, primary_name: str) -> None:
    """Re-point historical documents from duplicates to the primary customer."""
    for coll in ("invoices", "appointments", "reviews", "wallet_txns",
                 "customer_memberships", "complaints"):
        await getattr(db, coll).update_many({"customer_id": {"$in": dup_ids}}, {"$set": {"customer_id": primary_id}})
    for coll in ("invoices", "appointments"):
        await getattr(db, coll).update_many({"customer_id": primary_id}, {"$set": {"customer_name": primary_name}})


@router.post("/customers/merge")
async def merge_customers(body: MergeIn, user=Depends(require_admin)):
    """Merge duplicate CRM records into one: bills/appointments/wallet history are re-pointed
    to the primary so every past payment stays trackable; stats are summed; dupes deleted."""
    primary = await db.customers.find_one({"id": body.primary_id}, {"_id": 0})
    if not primary:
        raise HTTPException(404, "Primary customer not found")
    dup_ids = [d for d in set(body.duplicate_ids) if d != body.primary_id]
    dupes = await db.customers.find({"id": {"$in": dup_ids}}, {"_id": 0}).to_list(50)
    if not dupes:
        raise HTTPException(400, "No duplicate records to merge")
    dup_ids = [d["id"] for d in dupes]
    await _repoint_customer_refs(dup_ids, body.primary_id, primary["name"])
    await db.customers.update_one({"id": body.primary_id}, {"$set": _merged_customer_fields(primary, dupes)})
    await db.customers.delete_many({"id": {"$in": dup_ids}})
    return {"ok": True, "merged": len(dupes),
            "customer": await db.customers.find_one({"id": body.primary_id}, {"_id": 0})}


@router.get("/customers/{cid}/history")
async def customer_history(cid: str, user=Depends(require_admin)):
    """Date-wise service history: every non-voided bill with items, staff and amounts."""
    invs = await db.invoices.find(
        {"customer_id": cid, "status": {"$ne": "voided"}},
        {"_id": 0, "invoice_no": 1, "created_at": 1, "items": 1, "total": 1,
         "payment_mode": 1, "status": 1, "tip": 1, "discount": 1},
    ).sort("created_at", -1).to_list(200)
    staff_map = {s["id"]: s.get("name") for s in await db.staff.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(200)}
    for inv in invs:
        for it in inv.get("items", []):
            if not it.get("staff_name") and it.get("staff_id"):
                it["staff_name"] = staff_map.get(it["staff_id"])
    return invs


class PhoneIn(BaseModel):
    phone: str


@router.put("/customers/{cid}/phone")
async def set_customer_phone(cid: str, body: PhoneIn, user=Depends(get_current_user)):
    """Quick phone fix during booking — updates ONLY the phone field."""
    if len(re.sub(r"\D", "", body.phone or "")) < 10:
        raise HTTPException(400, "Enter a valid 10-digit phone number")
    res = await db.customers.update_one({"id": cid}, {"$set": {"phone": body.phone.strip()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Customer not found")
    return {"ok": True, "phone": body.phone.strip()}

@router.get("/customers/export")
async def export_customers_csv(user=Depends(require_admin), t=Depends(current_tenant)):
    from security import log_audit
    rows = await db.customers.find({}).sort("name", 1).to_list(5000)
    await log_audit(t["id"], user, "export", f"Exported customers CSV ({len(rows)} records)")
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

def _customer_row_doc(raw: dict) -> Optional[dict]:
    """Normalize one CSV row → customer doc, or None when name/phone missing."""
    row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
    name, phone = row.get("name", ""), re.sub(r"[^\d+]", "", row.get("phone", ""))
    if not name or not phone:
        return None
    doc = {"name": name, "phone": phone}
    for f in ("email", "gender", "dob", "address", "notes"):
        if row.get(f):
            doc[f] = row[f]
    return doc


async def _upsert_customer(doc: dict) -> str:
    """Insert or update by phone. Returns 'added' | 'updated'."""
    existing = await db.customers.find_one({"phone": doc["phone"]})
    if existing:
        await db.customers.update_one({"id": existing["id"]}, {"$set": doc})
        return "updated"
    await db.customers.insert_one(Customer(**doc).model_dump())
    return "added"


@router.post("/customers/import")
async def import_customers_csv(file: UploadFile = File(...), user=Depends(require_admin)):
    content = await _read_csv_upload(file)
    reader = csv.DictReader(io.StringIO(content))
    rows = [normalize_customer_row(r) for r in reader]
    if not rows or not any(r.get("name") and r.get("phone") for r in rows):
        raise HTTPException(400, "Sheet needs a Name (or First/Last Name) column and a Phone/Mobile column (optional: Email, Gender, DOB, Address, Notes)")
    counts = {"added": 0, "updated": 0, "skipped": 0}
    for raw in rows:
        doc = _customer_row_doc(raw)
        if doc is None:
            counts["skipped"] += 1
            continue
        counts[await _upsert_customer(doc)] += 1
    return counts

@router.get("/customers/{cid}")
async def get_customer(cid: str, user=Depends(get_current_user)):
    c = await db.customers.find_one({"id": cid}, _customer_projection(user))
    if not c:
        raise HTTPException(404, "Not found")
    c.pop("_id", None)
    return c

@router.put("/customers/{cid}")
async def update_customer(cid: str, body: CustomerIn, user=Depends(require_admin)):
    digits = re.sub(r"\D", "", body.phone or "")
    if len(digits) >= 10:
        existing = await _find_by_phone(digits, exclude_id=cid)
        if existing:
            raise HTTPException(409, {"code": "PHONE_EXISTS", "customer": existing})
    await db.customers.update_one({"id": cid}, {"$set": body.model_dump()})
    return await db.customers.find_one({"id": cid}, {"_id": 0})

@router.delete("/customers/{cid}")
async def delete_customer(cid: str, user=Depends(require_admin)):
    await db.customers.delete_one({"id": cid})
    return {"ok": True}

# ---------------- Uploads (staff / service / product images) ----------------


# ---------------- CRM import (CSV parsed client-side → JSON rows) ----------------
class ImportRow(BaseModel):
    name: str = Field("", max_length=120)
    phone: str = Field("", max_length=24)
    email: Optional[str] = Field(None, max_length=120)
    gender: Optional[str] = Field(None, max_length=20)


class ImportIn(BaseModel):
    rows: List[ImportRow] = Field(..., max_length=5000)
    update_existing: bool = True


def _norm_gender(g: Optional[str]) -> str:
    v = (g or "").strip().lower()
    if v in ("m", "male", "man", "men", "gent", "gents"):
        return "Male"
    if v in ("f", "female", "woman", "women", "lady", "ladies"):
        return "Female"
    return "Other"


def _import_row_fields(r) -> tuple[str, str, str | None]:
    """Normalise one import row → (10-digit phone or '', clean name, valid email or None)."""
    digits = re.sub(r"\D", "", r.phone or "")
    if len(digits) > 10 and digits.startswith("91"):
        digits = digits[-10:]
    name = re.sub(r"\s+", " ", (r.name or "")).strip()[:120]
    email = (r.email or "").strip().lower() or None
    if email and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        email = None
    return (digits if len(digits) == 10 else ""), name, email


async def _import_fill_existing(existing: dict, r, name: str, email: str | None) -> bool:
    """Fill only blank fields on an existing guest; returns True when something changed."""
    patch = {k: v for k, v in (("email", email), ("gender", _norm_gender(r.gender) if r.gender else None)) if v and not existing.get(k)}
    if not existing.get("name") and name:
        patch["name"] = name
    if not patch:
        return False
    await db.customers.update_one({"id": existing["id"]}, {"$set": patch})
    return True


async def _import_new_customer(r, digits: str, name: str, email: str | None) -> None:
    c = Customer(name=name, phone=digits, email=email, gender=_norm_gender(r.gender)).model_dump()
    c["source"] = "import"
    c["crm_status"] = "active"
    await db.customers.insert_one(c)


@router.post("/customers/import-rows")
async def import_customers(body: ImportIn, user=Depends(require_admin)):
    """Bulk add/update guests by phone. Existing guests only get blank fields filled (never overwrite spend/points)."""
    out = {"added": 0, "updated": 0, "skipped": 0, "errors": []}
    seen: set = set()
    for i, r in enumerate(body.rows):
        digits, name, email = _import_row_fields(r)
        if not digits or not name:
            out["skipped"] += 1
            if len(out["errors"]) < 20:
                out["errors"].append({"row": i + 1, "reason": "needs a name and a 10-digit number"})
            continue
        if digits in seen:
            out["skipped"] += 1
            continue
        seen.add(digits)
        existing = await _find_by_phone(digits)
        if existing:
            if body.update_existing and await _import_fill_existing(existing, r, name, email):
                out["updated"] += 1
            else:
                out["skipped"] += 1
            continue
        await _import_new_customer(r, digits, name, email)
        out["added"] += 1
    return out
