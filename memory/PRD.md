# Miracurl Salon Management — PRD

## Original Problem Statement
> "I want to build this saloon management system for my saloon — instead of Respark you should use Miracurl, please read and see all the image and build java 8 backend code and ui for react or react native — for DB oracle"

## User-confirmed Decisions
- **Live preview stack:** Python FastAPI + MongoDB + React (web).
- **Reference code package:** Java 8 + Spring Boot 2.7 + Oracle SQL schema (read-only, runnable on user's own server).
- **Scope:** Full suite (Auth, Dashboard, Appointments, Customers/CRM, Staff, Services, Inventory, POS/Billing, Reports) + **Customer-facing public booking page**.
- **Auth:** JWT (email + password) with admin seeded on startup.
- **Brand & Design:** Miracurl (replacing Respark) — fresh modern dark luxury aesthetic (gold #D4AF37 + blush + onyx black, Playfair Display + Outfit fonts).

## Personas
1. **Salon Admin / Owner** – manages staff, services, inventory, reviews reports.
2. **Front-Desk / Stylist Staff** – books appointments, runs POS, manages customers.
3. **End Customer** – self-books via the public `/book` link (no signup needed).

## Architecture
- **Backend (live):** FastAPI (`/app/backend/server.py`) + MongoDB. JWT via PyJWT + bcrypt. All endpoints under `/api`. Public endpoints under `/api/public/*` (no auth).
- **Frontend:** React 18, React-Router, Tailwind CSS, Recharts, Sonner, Lucide-react, axios.
- **Reference backend:** `/app/java-reference/` — Spring Boot 2.7 + JWT + JPA + ojdbc8. Oracle DDL at `/app/java-reference/schema/oracle_schema.sql`.

## Implemented Features
### Iteration 1 (Jan 2026)
- Auth (login/register/logout/me/forgot/reset/lockout)
- Dashboard (KPIs, trend chart, top services, low-stock alerts, upcoming appts)
- Customers CRM (search, loyalty, full CRUD)
- Services (grouped by category, trending flag, full CRUD)
- Staff (cards with photo/specialties/commission, full CRUD)
- Inventory/Products (low-stock banner, full CRUD)
- Appointments (date filter, multi-service booking, status flow)
- POS/Billing (Services+Products cart, 4 payment modes, auto invoice no., loyalty + stock auto-update)
- Reports (date-range sales, payment-mode pie, recent invoices)
- Seed data + Java 8/Oracle reference package
- 18/18 backend pytest, 100% frontend flows pass

### Iteration 2 (Jan 2026) — Code review hardening
- Backend variable shadowing fix (`i` → `inv`/`offset`)
- Removed `localStorage` token → in-memory only
- `useCallback` for all `load()` functions
- Stable map keys in POS cart, receipt, Reports pie
- Lint clean (ruff + eslint on own code)

### Iteration 3 (Jan 2026) — Public Booking
- **Public booking page at `/book`** (no auth) — 5-step luxe stepper: Services → Stylist → Date & Time → Details → Review → Success
- Same dark luxury gold theme, sticky bottom nav, sparkle-tagged "Any Stylist" option
- Public backend endpoints: `/api/public/salon`, `/api/public/services`, `/api/public/staff`, `/api/public/book` (auto creates customer by phone)
- **Public Booking Link widget** on admin Dashboard with Copy + Open buttons
- Backend 25/25 pytest, 100% frontend public booking flows pass

## Backlog / Future
**P1**
- Rate-limit / captcha on `/api/public/book` to prevent bot abuse.
- Server-side validation: future-date check, phone regex, business-hours guard.
- Update customer name/email on /public/book when an existing phone matches.
- Print/Share invoice (WhatsApp/PDF) from POS receipt.
- Calendar grid (day/week) for admin Appointments.
- Stock availability check before invoice creation.
- Role-based authorization (admin-only deletes).

**P2**
- SMS/Email appointment reminders (Twilio / SendGrid).
- Multi-branch support, staff commission payouts report.
- Timezone-correct scheduling (currently UTC conversion can shift the date for late-night IST bookings).
- Migrate FastAPI `on_event` → lifespan; lock CORS for prod.

## File Map (key files)
- `/app/backend/server.py` — FastAPI app (auth, 7 admin modules, reports, public booking, seed).
- `/app/backend/.env` — MONGO_URL, DB_NAME, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD.
- `/app/frontend/src/App.js` — router (public `/book` outside protected layout).
- `/app/frontend/src/context/AuthContext.jsx` — in-memory access token + cookies.
- `/app/frontend/src/components/AppLayout.jsx` — admin sidebar + top bar.
- `/app/frontend/src/pages/Login.jsx` Dashboard.jsx Customers.jsx Services.jsx Staff.jsx Inventory.jsx Appointments.jsx POS.jsx Reports.jsx
- `/app/frontend/src/pages/BookPublic.jsx` — public 5-step booking flow.
- `/app/java-reference/` — Spring Boot + Oracle backend (read-only reference).
- `/app/memory/test_credentials.md`, `/app/auth_testing.md`
