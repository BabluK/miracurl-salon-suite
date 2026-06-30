from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import secrets
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, field_validator

# ---------------- DB ----------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---------------- App ----------------
app = FastAPI(title="Miracurl Salon Management API")
api = APIRouter(prefix="/api")

# ---------------- JWT helpers ----------------
JWT_ALG = "HS256"
def jwt_secret(): return os.environ["JWT_SECRET"]

def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_pw(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False

def make_access(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(hours=8),
               "type": "access"}
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALG)

def make_refresh(user_id: str) -> str:
    payload = {"sub": user_id,
               "exp": datetime.now(timezone.utc) + timedelta(days=7),
               "type": "refresh"}
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALG)

def set_auth_cookies(resp: Response, access: str, refresh: str):
    resp.set_cookie("access_token", access, httponly=True, secure=False, samesite="lax", max_age=28800, path="/")
    resp.set_cookie("refresh_token", refresh, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, jwt_secret(), algorithms=[JWT_ALG])
        if payload.get("type") != "access":
            raise HTTPException(401, "Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(401, "User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

async def require_admin(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin role required")
    return user

# ---- In-memory rate limit for public booking ----
_RATE_BUCKET: dict = {}
def public_rate_limit(request: Request, key_suffix: str = "", limit: int = 8, window_sec: int = 600):
    """Allow `limit` requests per IP per `window_sec` seconds."""
    ip = request.client.host if request.client else "anon"
    key = f"{ip}:{key_suffix}"
    now = datetime.now(timezone.utc).timestamp()
    bucket = [t for t in _RATE_BUCKET.get(key, []) if now - t < window_sec]
    if len(bucket) >= limit:
        raise HTTPException(429, "Too many requests. Please wait a few minutes and try again.")
    bucket.append(now)
    _RATE_BUCKET[key] = bucket

# ---------------- Models ----------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class ForgotIn(BaseModel):
    email: EmailStr

class ResetIn(BaseModel):
    token: str
    new_password: str

class Customer(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: str
    email: Optional[str] = None
    gender: Optional[str] = "Other"
    dob: Optional[str] = None
    address: Optional[str] = None
    loyalty_points: int = 0
    total_spent: float = 0.0
    visits: int = 0
    notes: Optional[str] = None
    referral_code: str = Field(default_factory=lambda: secrets.token_urlsafe(4).upper().replace("_", "X").replace("-", "Y")[:6])
    referred_by: Optional[str] = None
    referral_credit: float = 0.0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class CustomerIn(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    gender: Optional[str] = "Other"
    dob: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None

class Service(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: str
    price: float
    duration_min: int
    description: Optional[str] = None
    image_url: Optional[str] = None
    trending: bool = False
    active: bool = True

class ServiceIn(BaseModel):
    name: str
    category: str
    price: float
    duration_min: int
    description: Optional[str] = None
    image_url: Optional[str] = None
    trending: bool = False
    active: bool = True

class Staff(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    role: str
    phone: str
    email: Optional[str] = None
    specialties: List[str] = []
    commission_pct: float = 10.0
    active: bool = True
    image_url: Optional[str] = None
    joining_date: str = Field(default_factory=lambda: datetime.now(timezone.utc).date().isoformat())

class StaffIn(BaseModel):
    name: str
    role: str
    phone: str
    email: Optional[str] = None
    specialties: List[str] = []
    commission_pct: float = 10.0
    active: bool = True
    image_url: Optional[str] = None

class Product(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    brand: Optional[str] = None
    category: str
    sku: str
    price: float
    cost: float
    stock: int
    low_stock_threshold: int = 5
    image_url: Optional[str] = None

class ProductIn(BaseModel):
    name: str
    brand: Optional[str] = None
    category: str
    sku: str
    price: float
    cost: float
    stock: int
    low_stock_threshold: int = 5
    image_url: Optional[str] = None

class Appointment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str
    customer_name: str
    staff_id: str
    staff_name: str
    service_ids: List[str]
    service_names: List[str]
    scheduled_at: str  # ISO datetime
    duration_min: int
    status: str = "scheduled"  # scheduled | completed | cancelled | no_show
    notes: Optional[str] = None
    total: float = 0.0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class AppointmentIn(BaseModel):
    customer_id: str
    staff_id: str
    service_ids: List[str]
    scheduled_at: str
    notes: Optional[str] = None

class AppointmentStatusIn(BaseModel):
    status: str

class InvoiceItem(BaseModel):
    type: str  # service | product
    ref_id: str
    name: str
    qty: int = 1
    price: float

class Invoice(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_no: str
    customer_id: str
    customer_name: str
    staff_id: Optional[str] = None
    staff_name: Optional[str] = None
    items: List[InvoiceItem]
    subtotal: float
    discount: float = 0
    tax: float = 0
    total: float
    payment_mode: str  # cash | card | upi | wallet
    paid: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class InvoiceIn(BaseModel):
    customer_id: str
    staff_id: Optional[str] = None
    items: List[InvoiceItem]
    discount: float = 0
    tax_pct: float = 18.0
    payment_mode: str = "cash"

class Review(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    appointment_id: str
    customer_id: str
    customer_name: str
    staff_id: Optional[str] = None
    staff_name: Optional[str] = None
    rating: int  # 1-5
    comment: Optional[str] = None
    public: bool = True  # show on public booking page
    reward_code: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ReviewIn(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = Field(None, max_length=600)

class ReviewModerateIn(BaseModel):
    public: bool

REVIEW_REWARD_CREDIT = 50.0  # ₹ credit for 4★+ reviews

# ---------------- Auth Endpoints ----------------
@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.name,
        "role": "staff",
        "password_hash": hash_pw(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    access = make_access(user["id"], email)
    refresh = make_refresh(user["id"])
    set_auth_cookies(response, access, refresh)
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"user": user, "access_token": access}

@api.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower()
    ident = f"{request.client.host}:{email}"
    rec = await db.login_attempts.find_one({"identifier": ident})
    now = datetime.now(timezone.utc)
    if rec and rec.get("count", 0) >= 5:
        locked_until = rec.get("locked_until")
        if locked_until and datetime.fromisoformat(locked_until) > now:
            raise HTTPException(423, "Too many attempts. Try again later.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_pw(body.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": ident},
            {"$inc": {"count": 1},
             "$set": {"last_attempt": now.isoformat(),
                      "locked_until": (now + timedelta(minutes=15)).isoformat()}},
            upsert=True,
        )
        raise HTTPException(401, "Invalid email or password")
    await db.login_attempts.delete_one({"identifier": ident})
    access = make_access(user["id"], email)
    refresh = make_refresh(user["id"])
    set_auth_cookies(response, access, refresh)
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"user": user, "access_token": access}

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user

@api.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "No refresh token")
    try:
        payload = jwt.decode(token, jwt_secret(), algorithms=[JWT_ALG])
        if payload.get("type") != "refresh":
            raise HTTPException(401, "Invalid type")
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(401, "User not found")
        access = make_access(user["id"], user["email"])
        response.set_cookie("access_token", access, httponly=True, secure=False, samesite="lax", max_age=28800, path="/")
        return {"ok": True}
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid refresh token")

@api.post("/auth/forgot-password")
async def forgot(body: ForgotIn):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if user:
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({
            "token": token,
            "user_id": user["id"],
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "used": False,
        })
        logging.info(f"[Miracurl] Password reset for {email}: token={token}")
    return {"message": "If that email exists, a reset link was sent."}

@api.post("/auth/reset-password")
async def reset(body: ResetIn):
    rec = await db.password_reset_tokens.find_one({"token": body.token})
    if not rec or rec.get("used"):
        raise HTTPException(400, "Invalid or used token")
    if datetime.fromisoformat(rec["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(400, "Token expired")
    await db.users.update_one({"id": rec["user_id"]}, {"$set": {"password_hash": hash_pw(body.new_password)}})
    await db.password_reset_tokens.update_one({"token": body.token}, {"$set": {"used": True}})
    return {"ok": True}

# ---------------- Generic CRUD helpers ----------------
def _clean(doc):
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc

# ---------------- Customers ----------------
@api.get("/customers")
async def list_customers(q: Optional[str] = None, user=Depends(get_current_user)):
    flt = {}
    if q:
        flt = {"$or": [{"name": {"$regex": q, "$options": "i"}}, {"phone": {"$regex": q}}]}
    docs = await db.customers.find(flt, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs

@api.post("/customers")
async def create_customer(body: CustomerIn, user=Depends(get_current_user)):
    c = Customer(**body.model_dump()).model_dump()
    await db.customers.insert_one(c)
    return _clean(c)

@api.get("/customers/{cid}")
async def get_customer(cid: str, user=Depends(get_current_user)):
    c = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Not found")
    return c

@api.put("/customers/{cid}")
async def update_customer(cid: str, body: CustomerIn, user=Depends(get_current_user)):
    await db.customers.update_one({"id": cid}, {"$set": body.model_dump()})
    return await db.customers.find_one({"id": cid}, {"_id": 0})

@api.delete("/customers/{cid}")
async def delete_customer(cid: str, user=Depends(require_admin)):
    await db.customers.delete_one({"id": cid})
    return {"ok": True}

# ---------------- Services ----------------
@api.get("/services")
async def list_services(user=Depends(get_current_user)):
    return await db.services.find({}, {"_id": 0}).sort("category", 1).to_list(500)

@api.post("/services")
async def create_service(body: ServiceIn, user=Depends(get_current_user)):
    s = Service(**body.model_dump()).model_dump()
    await db.services.insert_one(s)
    return _clean(s)

@api.put("/services/{sid}")
async def update_service(sid: str, body: ServiceIn, user=Depends(get_current_user)):
    await db.services.update_one({"id": sid}, {"$set": body.model_dump()})
    return await db.services.find_one({"id": sid}, {"_id": 0})

@api.delete("/services/{sid}")
async def delete_service(sid: str, user=Depends(require_admin)):
    await db.services.delete_one({"id": sid})
    return {"ok": True}

# ---------------- Staff ----------------
@api.get("/staff")
async def list_staff(user=Depends(get_current_user)):
    return await db.staff.find({}, {"_id": 0}).to_list(500)

@api.post("/staff")
async def create_staff(body: StaffIn, user=Depends(get_current_user)):
    s = Staff(**body.model_dump()).model_dump()
    await db.staff.insert_one(s)
    return _clean(s)

@api.put("/staff/{sid}")
async def update_staff(sid: str, body: StaffIn, user=Depends(get_current_user)):
    await db.staff.update_one({"id": sid}, {"$set": body.model_dump()})
    return await db.staff.find_one({"id": sid}, {"_id": 0})

@api.delete("/staff/{sid}")
async def delete_staff(sid: str, user=Depends(require_admin)):
    await db.staff.delete_one({"id": sid})
    return {"ok": True}

# ---------------- Products / Inventory ----------------
@api.get("/products")
async def list_products(user=Depends(get_current_user)):
    return await db.products.find({}, {"_id": 0}).to_list(500)

@api.post("/products")
async def create_product(body: ProductIn, user=Depends(get_current_user)):
    p = Product(**body.model_dump()).model_dump()
    await db.products.insert_one(p)
    return _clean(p)

@api.put("/products/{pid}")
async def update_product(pid: str, body: ProductIn, user=Depends(get_current_user)):
    await db.products.update_one({"id": pid}, {"$set": body.model_dump()})
    return await db.products.find_one({"id": pid}, {"_id": 0})

@api.delete("/products/{pid}")
async def delete_product(pid: str, user=Depends(require_admin)):
    await db.products.delete_one({"id": pid})
    return {"ok": True}

# ---------------- Appointments ----------------
@api.get("/appointments")
async def list_appointments(date: Optional[str] = None, user=Depends(get_current_user)):
    flt = {}
    if date:
        flt = {"scheduled_at": {"$regex": f"^{date}"}}
    return await db.appointments.find(flt, {"_id": 0}).sort("scheduled_at", 1).to_list(500)

@api.post("/appointments")
async def create_appointment(body: AppointmentIn, user=Depends(get_current_user)):
    cust = await db.customers.find_one({"id": body.customer_id}, {"_id": 0})
    staff = await db.staff.find_one({"id": body.staff_id}, {"_id": 0})
    if not cust or not staff:
        raise HTTPException(400, "Invalid customer or staff")
    services = await db.services.find({"id": {"$in": body.service_ids}}, {"_id": 0}).to_list(50)
    total = sum(s["price"] for s in services)
    duration = sum(s["duration_min"] for s in services) or 30
    a = Appointment(
        customer_id=cust["id"], customer_name=cust["name"],
        staff_id=staff["id"], staff_name=staff["name"],
        service_ids=[s["id"] for s in services],
        service_names=[s["name"] for s in services],
        scheduled_at=body.scheduled_at, duration_min=duration,
        notes=body.notes, total=total,
    ).model_dump()
    await db.appointments.insert_one(a)
    return _clean(a)

@api.put("/appointments/{aid}/status")
async def update_appt_status(aid: str, body: AppointmentStatusIn, user=Depends(get_current_user)):
    await db.appointments.update_one({"id": aid}, {"$set": {"status": body.status}})
    return await db.appointments.find_one({"id": aid}, {"_id": 0})

@api.delete("/appointments/{aid}")
async def del_appointment(aid: str, user=Depends(get_current_user)):
    await db.appointments.delete_one({"id": aid})
    return {"ok": True}

# ---------------- Invoices / POS ----------------
async def _gen_invoice_no():
    count = await db.invoices.count_documents({}) + 1
    return f"INV-{datetime.now(timezone.utc).strftime('%Y%m')}-{count:04d}"

@api.get("/invoices")
async def list_invoices(user=Depends(get_current_user)):
    return await db.invoices.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)

@api.post("/invoices")
async def create_invoice(body: InvoiceIn, user=Depends(get_current_user)):
    cust = await db.customers.find_one({"id": body.customer_id}, {"_id": 0})
    if not cust:
        raise HTTPException(400, "Invalid customer")
    staff = await db.staff.find_one({"id": body.staff_id}, {"_id": 0}) if body.staff_id else None

    # Stock availability check (aggregated by product ref_id to handle duplicates)
    needed = {}
    for it in body.items:
        if it.type == "product":
            needed[it.ref_id] = needed.get(it.ref_id, 0) + it.qty
    for pid, qty in needed.items():
        prod = await db.products.find_one({"id": pid}, {"_id": 0, "name": 1, "stock": 1})
        if not prod:
            raise HTTPException(400, f"Product not found: {pid}")
        if prod["stock"] < qty:
            raise HTTPException(400, f"Insufficient stock for '{prod['name']}' — {prod['stock']} left, {qty} requested")

    # Apply referral credit (capped at total) BEFORE tax
    raw_subtotal = sum(it.qty * it.price for it in body.items)
    referral_credit_available = float(cust.get("referral_credit") or 0)
    referral_credit_used = min(referral_credit_available, raw_subtotal)
    discount = (body.discount or 0) + referral_credit_used
    taxable = max(0, raw_subtotal - discount)
    tax = taxable * (body.tax_pct or 0) / 100
    total = taxable + tax

    inv = Invoice(
        invoice_no=await _gen_invoice_no(),
        customer_id=cust["id"], customer_name=cust["name"],
        staff_id=staff["id"] if staff else None,
        staff_name=staff["name"] if staff else None,
        items=body.items, subtotal=raw_subtotal, discount=discount,
        tax=tax, total=total, payment_mode=body.payment_mode,
    ).model_dump()
    await db.invoices.insert_one(inv)

    # Update customer stats and consume referral credit
    cust_inc = {"total_spent": total, "visits": 1, "loyalty_points": int(total // 100)}
    if referral_credit_used > 0:
        cust_inc["referral_credit"] = -referral_credit_used
    await db.customers.update_one({"id": cust["id"]}, {"$inc": cust_inc})

    # Decrement product stock
    for pid, qty in needed.items():
        await db.products.update_one({"id": pid}, {"$inc": {"stock": -qty}})
    return _clean(inv)

# ---------------- Reviews ----------------
@api.get("/reviews")
async def list_reviews(user=Depends(get_current_user)):
    return await db.reviews.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)

@api.put("/reviews/{rid}/moderate")
async def moderate_review(rid: str, body: ReviewModerateIn, user=Depends(require_admin)):
    await db.reviews.update_one({"id": rid}, {"$set": {"public": body.public}})
    return await db.reviews.find_one({"id": rid}, {"_id": 0})

@api.delete("/reviews/{rid}")
async def delete_review(rid: str, user=Depends(require_admin)):
    await db.reviews.delete_one({"id": rid})
    return {"ok": True}

@api.get("/public/review-info/{token}")
async def public_review_info(token: str):
    """Token = appointment_id. Returns appointment summary so the customer can confirm."""
    appt = await db.appointments.find_one({"id": token}, {"_id": 0})
    if not appt:
        raise HTTPException(404, "Invalid review link")
    if appt.get("status") not in ("completed", "scheduled"):
        # Allow rating even if appointment isn't marked complete (some salons forget to mark)
        pass
    existing = await db.reviews.find_one({"appointment_id": token}, {"_id": 0})
    return {
        "customer_name": appt["customer_name"],
        "staff_name": appt.get("staff_name"),
        "service_names": appt.get("service_names", []),
        "scheduled_at": appt["scheduled_at"],
        "already_submitted": existing is not None,
        "existing_rating": existing.get("rating") if existing else None,
    }

@api.post("/public/review/{token}")
async def public_review(token: str, body: ReviewIn, request: Request):
    public_rate_limit(request, key_suffix="review", limit=10, window_sec=600)
    appt = await db.appointments.find_one({"id": token}, {"_id": 0})
    if not appt:
        raise HTTPException(404, "Invalid review link")
    if await db.reviews.find_one({"appointment_id": token}):
        raise HTTPException(400, "Review already submitted for this visit")

    reward_code = None
    if body.rating >= 4:
        reward_code = f"THANKS-{secrets.token_urlsafe(3).upper().replace('_', 'X').replace('-', 'Y')[:5]}"
        await db.customers.update_one(
            {"id": appt["customer_id"]},
            {"$inc": {"referral_credit": REVIEW_REWARD_CREDIT}},
        )

    review = Review(
        appointment_id=token,
        customer_id=appt["customer_id"],
        customer_name=appt["customer_name"],
        staff_id=appt.get("staff_id"),
        staff_name=appt.get("staff_name"),
        rating=body.rating,
        comment=(body.comment or "").strip() or None,
        public=body.rating >= 4,  # auto-public for 4★+, admin can change
        reward_code=reward_code,
    ).model_dump()
    await db.reviews.insert_one(review)
    return {
        "ok": True,
        "review": _clean(review),
        "reward": {
            "code": reward_code,
            "credit": REVIEW_REWARD_CREDIT if reward_code else 0,
        } if reward_code else None,
    }

@api.get("/public/reviews/featured")
async def public_featured_reviews(limit: int = 6):
    docs = await db.reviews.find(
        {"public": True, "rating": {"$gte": 4}},
        {"_id": 0, "customer_id": 0, "appointment_id": 0, "staff_id": 0, "reward_code": 0}
    ).sort("created_at", -1).to_list(limit)
    return docs

# ---------------- Reports / Dashboard ----------------
@api.get("/reports/dashboard")
async def dashboard(user=Depends(get_current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    month_prefix = datetime.now(timezone.utc).strftime("%Y-%m")
    invoices_today = await db.invoices.find({"created_at": {"$regex": f"^{today}"}}, {"_id": 0}).to_list(500)
    invoices_month = await db.invoices.find({"created_at": {"$regex": f"^{month_prefix}"}}, {"_id": 0}).to_list(2000)
    appts_today = await db.appointments.find({"scheduled_at": {"$regex": f"^{today}"}}, {"_id": 0}).to_list(500)
    total_customers = await db.customers.count_documents({})
    total_staff = await db.staff.count_documents({"active": True})
    low_stock = await db.products.find({"$expr": {"$lte": ["$stock", "$low_stock_threshold"]}}, {"_id": 0}).to_list(50)
    # service popularity
    pipeline = [
        {"$unwind": "$service_names"},
        {"$group": {"_id": "$service_names", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}, {"$limit": 5},
    ]
    top_services = await db.appointments.aggregate(pipeline).to_list(5)
    # review stats
    all_reviews = await db.reviews.find({}, {"_id": 0, "rating": 1}).to_list(2000)
    review_count = len(all_reviews)
    avg_rating = round(sum(r["rating"] for r in all_reviews) / review_count, 2) if review_count else 0
    pending_reviews = await db.appointments.count_documents({"status": "completed"}) - review_count
    # revenue trend last 7 days
    trend = []
    for offset in range(6, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=offset)).date().isoformat()
        day_invoices = await db.invoices.find(
            {"created_at": {"$regex": f"^{d}"}}, {"_id": 0, "total": 1}).to_list(500)
        day_revenue = sum(inv["total"] for inv in day_invoices)
        trend.append({"date": d, "revenue": round(day_revenue, 2)})
    return {
        "today_revenue": round(sum(inv["total"] for inv in invoices_today), 2),
        "today_bookings": len(appts_today),
        "today_invoices": len(invoices_today),
        "month_revenue": round(sum(inv["total"] for inv in invoices_month), 2),
        "total_customers": total_customers,
        "active_staff": total_staff,
        "low_stock_count": len(low_stock),
        "low_stock_items": low_stock[:10],
        "top_services": [{"name": t["_id"], "count": t["count"]} for t in top_services],
        "revenue_trend": trend,
        "upcoming_appointments": appts_today[:5],
        "avg_rating": avg_rating,
        "review_count": review_count,
        "pending_reviews": max(0, pending_reviews),
    }

@api.get("/reports/sales")
async def sales_report(start: Optional[str] = None, end: Optional[str] = None, user=Depends(get_current_user)):
    flt = {}
    if start and end:
        flt = {"created_at": {"$gte": start, "$lte": end + "T23:59:59Z"}}
    invs = await db.invoices.find(flt, {"_id": 0}).to_list(2000)
    by_mode = {}
    for inv in invs:
        by_mode[inv["payment_mode"]] = by_mode.get(inv["payment_mode"], 0) + inv["total"]
    return {
        "total_invoices": len(invs),
        "total_revenue": round(sum(inv["total"] for inv in invs), 2),
        "by_payment_mode": [{"mode": k, "amount": round(v, 2)} for k, v in by_mode.items()],
        "invoices": invs[:200],
    }

# ---------------- Public (no auth) - Customer-facing booking ----------------
import re

REFERRAL_REWARD_REFERRER = 100.0  # ₹ credit to referrer
REFERRAL_REWARD_REFERRED = 100.0  # ₹ credit to new customer

class PublicBookingIn(BaseModel):
    customer_name: str = Field(..., min_length=2, max_length=80)
    customer_phone: str
    customer_email: Optional[EmailStr] = None
    service_ids: List[str] = Field(..., min_length=1)
    staff_id: Optional[str] = None
    scheduled_at: str
    notes: Optional[str] = Field(None, max_length=500)
    referral_code: Optional[str] = None

    @field_validator("customer_phone")
    @classmethod
    def _phone(cls, v):
        cleaned = "".join(c for c in v if c.isdigit())
        if not re.fullmatch(r"\d{7,15}", cleaned):
            raise ValueError("Enter a valid phone number (7-15 digits)")
        return cleaned

    @field_validator("scheduled_at")
    @classmethod
    def _when(cls, v):
        try:
            dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
        except Exception:
            raise ValueError("Invalid scheduled_at, must be ISO 8601")
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if dt < datetime.now(timezone.utc) - timedelta(minutes=5):
            raise ValueError("Pick a future time")
        # Business hours guard (local 10:00 – 21:00 — approximate; UTC-store assumed IST)
        ist = dt.astimezone(timezone(timedelta(hours=5, minutes=30)))
        if ist.hour < 10 or ist.hour >= 21:
            raise ValueError("Pick a slot between 10:00 AM and 9:00 PM")
        return dt.isoformat()

@api.get("/public/salon")
async def public_salon():
    return {
        "name": "Miracurl Unisex Family Salon",
        "tagline": "Where elegance meets every strand",
        "location": "Marathahalli, Bangalore",
        "phone": "+91 98765 00000",
        "hours": "Mon–Sun · 10:00 AM – 9:00 PM",
        "hero_image": "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1600",
        "referral_reward": REFERRAL_REWARD_REFERRER,
    }

@api.get("/public/services")
async def public_services():
    return await db.services.find({"active": True}, {"_id": 0}).sort("category", 1).to_list(500)

@api.get("/public/staff")
async def public_staff():
    return await db.staff.find({"active": True}, {"_id": 0, "email": 0, "phone": 0, "commission_pct": 0}).to_list(500)

@api.get("/public/referral/{code}")
async def public_referral(code: str):
    code = code.strip().upper()
    referrer = await db.customers.find_one({"referral_code": code}, {"_id": 0, "name": 1, "referral_code": 1})
    if not referrer:
        raise HTTPException(404, "Invalid referral code")
    return {
        "valid": True,
        "referrer_name": referrer["name"],
        "reward_referred": REFERRAL_REWARD_REFERRED,
        "reward_referrer": REFERRAL_REWARD_REFERRER,
    }

@api.post("/public/book")
async def public_book(body: PublicBookingIn, request: Request):
    public_rate_limit(request, key_suffix="book", limit=8, window_sec=600)

    services = await db.services.find({"id": {"$in": body.service_ids}, "active": True}, {"_id": 0}).to_list(50)
    if not services:
        raise HTTPException(400, "Invalid services")

    staff = None
    if body.staff_id:
        staff = await db.staff.find_one({"id": body.staff_id, "active": True}, {"_id": 0})
    if not staff:
        staff = await db.staff.find_one({"active": True}, {"_id": 0})
    if not staff:
        raise HTTPException(400, "No stylist available")

    # ----- find or create customer by phone -----
    cust = await db.customers.find_one({"phone": body.customer_phone}, {"_id": 0})
    is_new_customer = cust is None
    if is_new_customer:
        cust_doc = Customer(
            name=body.customer_name, phone=body.customer_phone, email=body.customer_email
        ).model_dump()
        await db.customers.insert_one(cust_doc)
        cust = cust_doc
    else:
        # Update name/email if user provided new info
        updates = {}
        if body.customer_name and body.customer_name.strip() and body.customer_name.strip() != cust.get("name"):
            updates["name"] = body.customer_name.strip()
        if body.customer_email and body.customer_email != cust.get("email"):
            updates["email"] = body.customer_email
        if updates:
            await db.customers.update_one({"id": cust["id"]}, {"$set": updates})
            cust.update(updates)
        # Ensure existing customer has a referral_code (back-fill)
        if not cust.get("referral_code"):
            new_code = secrets.token_urlsafe(4).upper().replace("_", "X").replace("-", "Y")[:6]
            await db.customers.update_one({"id": cust["id"]}, {"$set": {"referral_code": new_code}})
            cust["referral_code"] = new_code
    cust.pop("_id", None)

    # ----- referral processing (only for brand-new customers) -----
    referral_applied = None
    if is_new_customer and body.referral_code:
        code = body.referral_code.strip().upper()
        if code != cust.get("referral_code"):  # can't refer yourself
            referrer = await db.customers.find_one({"referral_code": code}, {"_id": 0})
            if referrer:
                await db.customers.update_one(
                    {"id": referrer["id"]},
                    {"$inc": {"referral_credit": REFERRAL_REWARD_REFERRER}},
                )
                await db.customers.update_one(
                    {"id": cust["id"]},
                    {"$set": {"referred_by": referrer["id"]},
                     "$inc": {"referral_credit": REFERRAL_REWARD_REFERRED}},
                )
                cust["referral_credit"] = (cust.get("referral_credit") or 0) + REFERRAL_REWARD_REFERRED
                referral_applied = {
                    "referrer_name": referrer["name"],
                    "credit_added": REFERRAL_REWARD_REFERRED,
                }

    total = sum(s["price"] for s in services)
    duration = sum(s["duration_min"] for s in services) or 30
    appt = Appointment(
        customer_id=cust["id"], customer_name=cust["name"],
        staff_id=staff["id"], staff_name=staff["name"],
        service_ids=[s["id"] for s in services],
        service_names=[s["name"] for s in services],
        scheduled_at=body.scheduled_at, duration_min=duration,
        notes=body.notes, total=total,
    ).model_dump()
    await db.appointments.insert_one(appt)
    appt.pop("_id", None)
    return {
        "appointment": appt,
        "summary": {
            "customer_name": cust["name"],
            "customer_referral_code": cust.get("referral_code"),
            "referral_credit": cust.get("referral_credit", 0),
            "staff_name": staff["name"],
            "service_names": [s["name"] for s in services],
            "total": total,
            "duration_min": duration,
            "scheduled_at": body.scheduled_at,
        },
        "referral_applied": referral_applied,
        "is_new_customer": is_new_customer,
    }

# ---------------- Health ----------------
@api.get("/")
async def root():
    return {"app": "Miracurl Salon Management API", "status": "ok"}

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

async def seed_admin():
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_pw = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": "Salon Admin",
            "role": "admin",
            "password_hash": hash_pw(admin_pw),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logging.info("Seeded admin user")
    elif not verify_pw(admin_pw, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_pw(admin_pw)}})
        logging.info("Updated admin password from env")

async def seed_data():
    if await db.services.count_documents({}) == 0:
        await db.services.insert_many([Service(**s).model_dump() for s in SEED_SERVICES])
    if await db.staff.count_documents({}) == 0:
        await db.staff.insert_many([Staff(**s).model_dump() for s in SEED_STAFF])
    if await db.products.count_documents({}) == 0:
        await db.products.insert_many([Product(**p).model_dump() for p in SEED_PRODUCTS])
    if await db.customers.count_documents({}) == 0:
        await db.customers.insert_many([Customer(**c).model_dump() for c in SEED_CUSTOMERS])

@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.customers.create_index("phone")
    await db.services.create_index("category")
    await db.products.create_index("sku", unique=True)
    await db.appointments.create_index("scheduled_at")
    await db.invoices.create_index("created_at")
    await db.login_attempts.create_index("identifier")
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=3600)
    await seed_admin()
    await seed_data()

@app.on_event("shutdown")
async def on_shutdown():
    client.close()

# include router
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
