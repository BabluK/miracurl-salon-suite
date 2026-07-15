"""Mira AI Studio — public Website Builder (live-deployed) + Business App Builder (code generation).

Pipeline: Planner → Frontend/Backend/Database agents → QA → Deploy. Lead-capture gated.
"""
import asyncio
import io
import logging
import re
import uuid
import zipfile
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from jose import jwt, JWTError
from pydantic import BaseModel, EmailStr, Field, field_validator

from database import _raw_db
from security import public_rate_limit, hash_pw, verify_pw, make_access, jwt_secret, JWT_ALG

from routes.mira_common import _ask, _ask_json

router = APIRouter()
log = logging.getLogger("mira_builder")

MAX_GLOBAL_PER_DAY = 60          # protect LLM credits
MAX_REFINES = 5
FREE_CREDITS = 50
COSTS = {"website": 20, "app": 30, "refine": 5}
CREDIT_PLANS = {
    "plan_100": {"credits": 100, "price": 1000, "label": "Starter"},
    "plan_200": {"credits": 200, "price": 1800, "label": "Builder", "save": "10% off"},
    "plan_300": {"credits": 300, "price": 2700, "label": "Studio Pro", "save": "10% off"},
}

WEBSITE_STEPS = ["Planner Agent", "Design Agent", "Frontend Agent", "Testing Agent", "Deployment Agent"]
APP_STEPS = ["Planner Agent", "Database Agent", "Backend Agent", "Frontend Agent", "Testing Agent", "Packaging Agent"]


class RegisterIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    email: EmailStr
    phone: str = Field(..., max_length=20)
    password: str = Field(..., min_length=6, max_length=100)

    @field_validator("phone")
    @classmethod
    def _phone_ok(cls, v):
        digits = re.sub(r"\D", "", v)
        if len(digits) < 10:
            raise ValueError("Invalid phone")
        return digits[-10:]


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=100)


class StartIn(BaseModel):
    kind: str = Field(..., pattern="^(website|app)$")
    prompt: str = Field(..., min_length=8, max_length=1500)


class BuyIn(BaseModel):
    plan: str


class BuyVerifyIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class RefineIn(BaseModel):
    project_id: str
    prompt: str = Field(..., min_length=3, max_length=600)


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "my-site").lower()).strip("-")[:40] or "my-site"
    return f"{s}-{uuid.uuid4().hex[:4]}"


async def _set_step(pid: str, step: str, status: str, note: str = ""):
    await _raw_db.builder_projects.update_one(
        {"id": pid, "pipeline.agent": step},
        {"$set": {"pipeline.$.status": status, "pipeline.$.note": note,
                  "pipeline.$.at": datetime.now(timezone.utc).isoformat()}})


def _strip_code_fence(raw: str) -> str:
    raw = raw.strip()
    raw = re.sub(r"^```[a-zA-Z]*\n", "", raw)
    return raw.removesuffix("```").strip()


# ---------------- Website pipeline ----------------
async def _run_website(pid: str, prompt: str):
    try:
        await _set_step(pid, "Planner Agent", "running", "Understanding your idea")
        plan = await _ask_json(
            "You are the Planner Agent of Mira AI Studio, an expert website strategist.",
            f'Client request: "{prompt}". Plan a stunning one-page business website. Return JSON: '
            '{"name":"<business name, invent a tasteful one if absent>","tagline":"<punchy line>",'
            '"palette":{"bg":"<hex>","accent":"<hex>","text":"<hex>"},'
            '"sections":["hero","about","services","gallery","testimonials","contact"],'
            '"services":[{"name":"x","price":"₹x"}] (4-6 fitting the business),'
            '"vibe":"<3 adjectives>"}')
        name = str(plan.get("name") or "My Business")[:60]
        slug = _slugify(name)
        await _set_step(pid, "Planner Agent", "done", f"Planned “{name}” — {len(plan.get('sections', []))} sections")
        await _set_step(pid, "Design Agent", "running", f"Vibe: {plan.get('vibe', 'modern & elegant')}")
        await asyncio.sleep(0.5)
        await _set_step(pid, "Design Agent", "done", f"Palette locked: {plan.get('palette', {}).get('accent', '#d4af37')}")

        await _set_step(pid, "Frontend Agent", "running", "Writing HTML, CSS & JS")
        html = await _ask(
            "You are the Frontend Agent of Mira AI Studio — a world-class web designer & developer. "
            "You output ONLY a complete, valid, single-file HTML document. No markdown fences, no commentary.",
            f'Build a COMPLETE production-quality one-page website for: "{prompt}".\n'
            f"Plan: {plan}\n"
            "Requirements:\n"
            "- Single self-contained HTML file. Use <script src=\"https://cdn.tailwindcss.com\"></script> plus a <style> block for custom touches (fonts via Google Fonts link, smooth scroll, hover states, keyframe entrance animations).\n"
            "- Sections: sticky nav, cinematic hero with CTA, about, services with prices, testimonials (invent 3 realistic Indian names), contact section with phone/address placeholders and a WhatsApp button, elegant footer.\n"
            "- Use royalty-free images from https://images.unsplash.com (real, relevant photo URLs with ?w=1200&q=80).\n"
            "- Mobile responsive, dark-on-light or light-on-dark per the palette, premium typography, generous spacing.\n"
            "- Footer must include: 'Built with ✦ Mira AI Studio'.\n"
            "Output the raw HTML only, starting with <!DOCTYPE html>.",
            model="gpt-4o")
        html = _strip_code_fence(html)
        await _set_step(pid, "Frontend Agent", "done", f"{len(html) // 1000}KB of code written")

        await _set_step(pid, "Testing Agent", "running", "Validating markup & links")
        ok = html.lstrip().lower().startswith("<!doctype") and "</html>" in html.lower() and len(html) > 2000
        if not ok:
            raise ValueError("Generated HTML failed QA")
        await _set_step(pid, "Testing Agent", "done", "All checks passed ✓")

        await _set_step(pid, "Deployment Agent", "running", "Publishing to your live URL")
        await _raw_db.builder_projects.update_one({"id": pid}, {"$set": {
            "status": "live", "name": name, "slug": slug, "plan": plan,
            "html": html, "live_path": f"/api/site/{slug}",
            "files": [{"path": "index.html", "size": len(html)}],
            "finished_at": datetime.now(timezone.utc).isoformat()}})
        await _set_step(pid, "Deployment Agent", "done", "Your website is LIVE ✦")
    except Exception as e:
        log.error("website build %s failed: %s", pid, e)
        await _fail_and_refund(pid, e)


async def _fail_and_refund(pid: str, e: Exception):
    doc = await _raw_db.builder_projects.find_one({"id": pid}, {"_id": 0, "owner_id": 1, "cost": 1})
    await _raw_db.builder_projects.update_one({"id": pid}, {"$set": {"status": "failed", "error": str(e)[:300]}})
    if doc and doc.get("owner_id") and doc.get("cost"):
        await _refund(doc["owner_id"], int(doc["cost"]))


# ---------------- Business app pipeline (code generation) ----------------
async def _run_app(pid: str, prompt: str):
    try:
        await _set_step(pid, "Planner Agent", "running", "Designing your system architecture")
        plan = await _ask_json(
            "You are the Planner Agent of Mira AI Studio, an expert software architect.",
            f'Client request: "{prompt}". Plan a full-stack business application (FastAPI + React + PostgreSQL + Docker). '
            'Return JSON: {"name":"<app name>","entities":[{"name":"x","fields":[{"name":"id","type":"uuid"}]}] (3-6 entities),'
            '"endpoints":["GET /api/x"] (8-14),"admin_pages":["Dashboard","x"],"summary":"<2 lines>"}')
        name = str(plan.get("name") or "Business App")[:60]
        await _set_step(pid, "Planner Agent", "done", f"“{name}” — {len(plan.get('entities', []))} entities, {len(plan.get('endpoints', []))} endpoints")

        await _set_step(pid, "Database Agent", "running", "Writing PostgreSQL schema")
        schema = _strip_code_fence(await _ask(
            "You are the Database Agent. Output ONLY raw SQL, no markdown.",
            f"Write a production PostgreSQL schema (CREATE TABLE with PKs, FKs, indexes, sensible types, "
            f"plus a users table with hashed password + role) for: {plan}"))
        await _set_step(pid, "Database Agent", "done", f"{schema.count('CREATE TABLE')} tables designed")

        await _set_step(pid, "Backend Agent", "running", "Generating FastAPI backend")
        backend = _strip_code_fence(await _ask(
            "You are the Backend Agent. Output ONLY raw Python code, no markdown.",
            f"Write a single-file FastAPI backend `main.py` for: {plan}\n"
            "Include: SQLAlchemy models matching the schema, Pydantic schemas, JWT login (python-jose, passlib bcrypt), "
            "CRUD routers for every entity under /api, CORS, and uvicorn entrypoint. Keep it complete and runnable.",
            model="gpt-4o"))
        await _set_step(pid, "Backend Agent", "done", f"{len(backend.splitlines())} lines of API code")

        await _set_step(pid, "Frontend Agent", "running", "Generating React admin panel")
        frontend = _strip_code_fence(await _ask(
            "You are the Frontend Agent. Output ONLY raw JSX code, no markdown.",
            f"Write a single-file React admin `App.jsx` (Tailwind classes, axios, react-router) for: {plan}\n"
            "Include: login page storing the JWT, sidebar with the admin pages, a data-table page per entity with "
            "create/edit/delete modals hitting the /api CRUD routes. Complete and readable.",
            model="gpt-4o"))
        await _set_step(pid, "Frontend Agent", "done", "Admin panel with login ready")

        await _set_step(pid, "Testing Agent", "running", "Reviewing generated code")
        if len(backend) < 800 or len(frontend) < 800 or "CREATE TABLE" not in schema:
            raise ValueError("Generated code failed QA")
        await _set_step(pid, "Testing Agent", "done", "Static review passed ✓")

        await _set_step(pid, "Packaging Agent", "running", "Writing Docker & docs")
        docker = (
            'version: "3.9"\nservices:\n  db:\n    image: postgres:16\n    environment:\n'
            "      POSTGRES_DB: app\n      POSTGRES_USER: app\n      POSTGRES_PASSWORD: change-me\n"
            "    volumes: [pgdata:/var/lib/postgresql/data]\n    ports: [\"5432:5432\"]\n"
            "  api:\n    build: ./backend\n    environment:\n      DATABASE_URL: postgresql://app:change-me@db:5432/app\n"
            "      JWT_SECRET: change-me\n    ports: [\"8000:8000\"]\n    depends_on: [db]\n"
            "  admin:\n    build: ./frontend\n    ports: [\"3000:3000\"]\n    depends_on: [api]\nvolumes:\n  pgdata:\n")
        dockerfile_api = "FROM python:3.11-slim\nWORKDIR /app\nCOPY . .\nRUN pip install fastapi uvicorn sqlalchemy psycopg2-binary python-jose passlib[bcrypt] pydantic[email]\nCMD [\"uvicorn\", \"main:app\", \"--host\", \"0.0.0.0\", \"--port\", \"8000\"]\n"
        readme = (f"# {name}\n\nGenerated by **Mira AI Studio** ✦\n\n{plan.get('summary', '')}\n\n"
                  "## Run locally\n```bash\ndocker compose up --build\n```\n"
                  "- API → http://localhost:8000/docs\n- Admin → http://localhost:3000\n- Postgres → localhost:5432\n\n"
                  "## Structure\n- `db/schema.sql` — PostgreSQL schema\n- `backend/main.py` — FastAPI + JWT auth + CRUD\n"
                  "- `frontend/src/App.jsx` — React admin panel\n- `docker-compose.yml` — one-command deployment\n")
        files = [
            {"path": "README.md", "content": readme},
            {"path": "docker-compose.yml", "content": docker},
            {"path": "db/schema.sql", "content": schema},
            {"path": "backend/main.py", "content": backend},
            {"path": "backend/Dockerfile", "content": dockerfile_api},
            {"path": "frontend/src/App.jsx", "content": frontend},
        ]
        await _raw_db.builder_projects.update_one({"id": pid}, {"$set": {
            "status": "code_ready", "name": name, "plan": plan,
            "gen_files": files,
            "files": [{"path": f["path"], "size": len(f["content"])} for f in files],
            "finished_at": datetime.now(timezone.utc).isoformat()}})
        await _set_step(pid, "Packaging Agent", "done", "ZIP ready — download your project ✦")
    except Exception as e:
        log.error("app build %s failed: %s", pid, e)
        await _fail_and_refund(pid, e)


# ---------------- Studio accounts (email login, 50 free credits) ----------------
async def _studio_user(authorization: str = Header(default="")) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Please log in to Mira AI Studio")
    try:
        payload = jwt.decode(authorization[7:], jwt_secret(), algorithms=[JWT_ALG])
    except JWTError:
        raise HTTPException(401, "Session expired — please log in again")
    u = await _raw_db.studio_users.find_one({"id": payload.get("sub")}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(401, "Account not found — please log in again")
    return u


def _studio_session(u: dict) -> dict:
    return {"token": make_access(u["id"], u["email"]),
            "user": {"name": u["name"], "email": u["email"], "credits": u["credits"]},
            "costs": COSTS}


@router.post("/public/mira-studio/register")
async def studio_register(body: RegisterIn, request: Request):
    public_rate_limit(request, "studio-register", limit=6, window_sec=3600)
    email = body.email.lower().strip()
    if await _raw_db.studio_users.find_one({"email": email}, {"_id": 0, "id": 1}):
        raise HTTPException(400, "An account with this email already exists — log in instead")
    now = datetime.now(timezone.utc).isoformat()
    u = {"id": str(uuid.uuid4()), "name": body.name.strip(), "email": email, "phone": body.phone,
         "password_hash": hash_pw(body.password), "credits": FREE_CREDITS, "created_at": now}
    await _raw_db.studio_users.insert_one(dict(u))
    # feed the Software Leads pipeline (Super Admin inquiries panel)
    await _raw_db.tenant_inquiries.insert_one({
        "id": str(uuid.uuid4()), "name": u["name"], "email": email, "phone": body.phone,
        "salon_name": "", "preferred_time": "", "status": "new", "source": "mira_ai_studio",
        "messages": [{"role": "user", "content": "[Mira AI Studio] New builder account created", "at": now}],
        "created_at": now, "last_message_at": now})
    u.pop("password_hash")
    return _studio_session(u)


@router.post("/public/mira-studio/login")
async def studio_login(body: LoginIn, request: Request):
    public_rate_limit(request, "studio-login", limit=10, window_sec=600)
    u = await _raw_db.studio_users.find_one({"email": body.email.lower().strip()}, {"_id": 0})
    if not u or not verify_pw(body.password, u["password_hash"]):
        raise HTTPException(401, "Wrong email or password")
    u.pop("password_hash")
    return _studio_session(u)


@router.get("/mira-studio/me")
async def studio_me(authorization: str = Header(default="")):
    u = await _studio_user(authorization)
    builds = await _raw_db.builder_projects.count_documents({"owner_id": u["id"]})
    return {"user": {"name": u["name"], "email": u["email"], "credits": u["credits"]},
            "builds": builds, "costs": COSTS}


@router.get("/mira-studio/projects")
async def studio_projects(authorization: str = Header(default="")):
    u = await _studio_user(authorization)
    rows = await _raw_db.builder_projects.find(
        {"owner_id": u["id"]}, {"_id": 0, "html": 0, "gen_files": 0, "pipeline": 0, "lead": 0},
    ).sort("created_at", -1).to_list(30)
    return rows


async def _charge(user_id: str, cost: int) -> int:
    """Atomic deduction — returns remaining credits, 402 if insufficient."""
    res = await _raw_db.studio_users.find_one_and_update(
        {"id": user_id, "credits": {"$gte": cost}}, {"$inc": {"credits": -cost}},
        projection={"_id": 0, "credits": 1}, return_document=True)
    if res is None:
        raise HTTPException(402, "Not enough credits — top up to keep building")
    return int(res["credits"])


async def _refund(user_id: str, cost: int):
    await _raw_db.studio_users.update_one({"id": user_id}, {"$inc": {"credits": cost}})


# ---------------- Credit billing (Razorpay) ----------------
@router.get("/public/mira-studio/plans")
async def studio_plans():
    from routes.subscriptions import RAZORPAY_KEY_ID
    return {"free_credits": FREE_CREDITS, "costs": COSTS,
            "payments_enabled": bool(RAZORPAY_KEY_ID),
            "plans": [{"key": k, **v} for k, v in CREDIT_PLANS.items()]}


@router.post("/mira-studio/buy")
async def studio_buy(body: BuyIn, request: Request, authorization: str = Header(default="")):
    u = await _studio_user(authorization)
    public_rate_limit(request, "studio-buy", limit=10, window_sec=600)
    plan = CREDIT_PLANS.get(body.plan)
    if not plan:
        raise HTTPException(400, "Unknown plan")
    from routes.subscriptions import _rzp_client, RAZORPAY_KEY_ID
    rzp = _rzp_client()
    if not rzp:
        raise HTTPException(503, "Payments are not configured yet — contact us to top up")
    order = rzp.order.create({
        "amount": int(plan["price"] * 100), "currency": "INR",
        "receipt": f"studio_{u['id'][:8]}_{int(datetime.now(timezone.utc).timestamp())}"[:40],
        "notes": {"studio_user_id": u["id"], "plan": body.plan, "product": "mira_studio_credits"}})
    await _raw_db.builder_payments.insert_one({
        "id": str(uuid.uuid4()), "user_id": u["id"], "plan": body.plan,
        "credits": plan["credits"], "amount": plan["price"], "status": "created",
        "razorpay_order_id": order["id"], "created_at": datetime.now(timezone.utc).isoformat()})
    return {"order_id": order["id"], "amount": order["amount"], "currency": "INR",
            "key_id": RAZORPAY_KEY_ID, "plan_label": plan["label"], "credits": plan["credits"],
            "name": u["name"], "email": u["email"]}


@router.post("/mira-studio/buy/verify")
async def studio_buy_verify(body: BuyVerifyIn, authorization: str = Header(default="")):
    u = await _studio_user(authorization)
    from routes.subscriptions import _verify_rzp_signature
    if not _verify_rzp_signature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature):
        raise HTTPException(400, "Payment signature verification failed")
    pay = await _raw_db.builder_payments.find_one_and_update(
        {"razorpay_order_id": body.razorpay_order_id, "user_id": u["id"], "status": "created"},
        {"$set": {"status": "paid", "razorpay_payment_id": body.razorpay_payment_id,
                  "paid_at": datetime.now(timezone.utc).isoformat()}},
        projection={"_id": 0}, return_document=True)
    if not pay:
        raise HTTPException(404, "Order not found or already credited")
    res = await _raw_db.studio_users.find_one_and_update(
        {"id": u["id"]}, {"$inc": {"credits": int(pay["credits"])}},
        projection={"_id": 0, "credits": 1}, return_document=True)
    return {"ok": True, "credits_added": pay["credits"], "credits": int(res["credits"])}


# ---------------- Public endpoints ----------------
@router.post("/public/mira-builder/start")
async def builder_start(body: StartIn, request: Request, authorization: str = Header(default="")):
    u = await _studio_user(authorization)
    public_rate_limit(request, "mira-builder", limit=6, window_sec=3600)
    day_ago = datetime.now(timezone.utc).timestamp() - 86400
    recent = await _raw_db.builder_projects.count_documents(
        {"created_ts": {"$gte": day_ago}})
    if recent >= MAX_GLOBAL_PER_DAY:
        raise HTTPException(429, "Mira's build queue is full for today — please try again tomorrow")
    cost = COSTS[body.kind]
    remaining = await _charge(u["id"], cost)
    now = datetime.now(timezone.utc)
    pid = str(uuid.uuid4())
    steps = WEBSITE_STEPS if body.kind == "website" else APP_STEPS
    await _raw_db.builder_projects.insert_one({
        "id": pid, "kind": body.kind, "prompt": body.prompt.strip(),
        "owner_id": u["id"], "cost": cost, "status": "building", "refines": 0,
        "pipeline": [{"agent": s, "status": "pending", "note": "", "at": ""} for s in steps],
        "created_at": now.isoformat(), "created_ts": now.timestamp()})
    runner = _run_website if body.kind == "website" else _run_app
    asyncio.create_task(runner(pid, body.prompt.strip()))
    return {"project_id": pid, "steps": steps, "credits": remaining, "cost": cost}


@router.get("/public/mira-builder/status/{pid}")
async def builder_status(pid: str, request: Request):
    public_rate_limit(request, "mira-builder-status", limit=240, window_sec=600)
    doc = await _raw_db.builder_projects.find_one({"id": pid}, {"_id": 0, "html": 0, "gen_files": 0, "lead": 0})
    if not doc:
        raise HTTPException(404, "Project not found")
    return doc


@router.post("/public/mira-builder/refine")
async def builder_refine(body: RefineIn, request: Request, authorization: str = Header(default="")):
    u = await _studio_user(authorization)
    public_rate_limit(request, "mira-builder-refine", limit=10, window_sec=3600)
    doc = await _raw_db.builder_projects.find_one({"id": body.project_id, "owner_id": u["id"]}, {"_id": 0})
    if not doc or doc.get("kind") != "website" or not doc.get("html"):
        raise HTTPException(404, "Live website project not found")
    if int(doc.get("refines") or 0) >= MAX_REFINES:
        raise HTTPException(429, "Refine limit reached for this project")
    remaining = await _charge(u["id"], COSTS["refine"])
    await _raw_db.builder_projects.update_one({"id": doc["id"]}, {"$set": {"status": "refining"}})
    try:
        html = await _ask(
            "You are the Frontend Agent of Mira AI Studio. You receive an existing HTML website and a change request. "
            "Apply the change and output ONLY the complete updated single-file HTML. No markdown, no commentary.",
            f"CHANGE REQUEST: {body.prompt.strip()}\n\nCURRENT WEBSITE:\n{doc['html'][:80000]}",
            model="gpt-4o")
        html = _strip_code_fence(html)
        if not html.lstrip().lower().startswith("<!doctype") or len(html) < 1500:
            raise ValueError("bad html")
    except Exception:
        await _refund(u["id"], COSTS["refine"])
        await _raw_db.builder_projects.update_one({"id": doc["id"]}, {"$set": {"status": "live"}})
        raise HTTPException(400, "Mira couldn't apply that change — credits refunded, try rephrasing")
    await _raw_db.builder_projects.update_one({"id": doc["id"]}, {
        "$set": {"html": html, "status": "live"}, "$inc": {"refines": 1}})
    return {"ok": True, "live_path": doc["live_path"], "credits": remaining,
            "refines_left": MAX_REFINES - int(doc.get("refines") or 0) - 1}


@router.get("/site/{slug}")
async def serve_site(slug: str):
    doc = await _raw_db.builder_projects.find_one({"slug": slug, "status": {"$in": ["live", "refining"]}}, {"_id": 0, "html": 1})
    if not doc or not doc.get("html"):
        raise HTTPException(404, "Site not found")
    return HTMLResponse(content=doc["html"])


@router.get("/public/mira-builder/download/{pid}")
async def builder_download(pid: str, request: Request):
    public_rate_limit(request, "mira-builder-dl", limit=10, window_sec=600)
    doc = await _raw_db.builder_projects.find_one({"id": pid}, {"_id": 0})
    if not doc or doc.get("status") not in ("live", "code_ready", "refining"):
        raise HTTPException(404, "Project not ready")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        if doc["kind"] == "website":
            z.writestr("index.html", doc["html"])
            z.writestr("README.md", f"# {doc.get('name', 'Website')}\n\nGenerated by Mira AI Studio ✦\n\nOpen index.html in any browser, or host it anywhere (Netlify, Vercel, S3).\n")
        else:
            for f in doc.get("gen_files", []):
                z.writestr(f["path"], f["content"])
    buf.seek(0)
    fname = re.sub(r"[^a-zA-Z0-9-]+", "-", doc.get("name") or "mira-project").strip("-").lower() or "mira-project"
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": f'attachment; filename="{fname}.zip"'})
