# Miracurl Salon Management — PRD

## Original Problem Statement
> "I want to build this saloon management system for my saloon — instead of Respark you should use Miracurl, please read and see all the image and build java 8 backend code and ui for react or react native — for DB oracle"

## User-confirmed Decisions
- **Live preview stack:** Python FastAPI + MongoDB + React (web).
- **Reference code package:** Java 8 + Spring Boot 2.7 + Oracle SQL schema (read-only, runnable on user's own server).
- **Scope:** Full suite (Auth, Dashboard, Appointments, Customers/CRM, Staff, Services, Inventory, POS/Billing, Reports).
- **Auth:** JWT (email + password) with admin seeded on startup.
- **Brand & Design:** Miracurl (replacing Respark) — fresh modern dark luxury aesthetic (gold #D4AF37 + blush + onyx black, Playfair Display + Outfit fonts).

## Personas
1. **Salon Admin / Owner** – manages staff, services, inventory, reviews reports, full access.
2. **Front-Desk / Stylist Staff** – books appointments, runs POS, manages customers.

## Architecture
- **Backend (live):** FastAPI (`/app/backend/server.py`) + MongoDB (motor). JWT via PyJWT + bcrypt. All endpoints under `/api`.
- **Frontend:** React 18, React-Router, Tailwind CSS, Recharts (charts), Sonner (toasts), Lucide-react (icons), axios.
- **Reference backend:** `/app/java-reference/` — Spring Boot 2.7, Spring Security + JWT (jjwt 0.11), JPA + ojdbc8. Oracle schema in `/app/java-reference/schema/oracle_schema.sql`.

## Implemented Features (Iteration 1 — Jan 2026)
- ✅ **Auth:** login, register, logout, me, forgot-password, reset-password, account lockout after 5 fails.
- ✅ **Layout:** persistent sidebar nav + top bar with date, salon name, profile menu.
- ✅ **Dashboard:** KPI cards (today/month revenue, bookings, customers), 7-day revenue trend (LineChart), top services (BarChart), upcoming appointments, low-stock alerts.
- ✅ **Customers (CRM):** list with search, add/edit/delete, loyalty points, total spent, visits stats.
- ✅ **Services:** grouped by category with images, trending flag, price & duration, full CRUD.
- ✅ **Staff:** card grid with photo, role, specialties, commission %, full CRUD.
- ✅ **Inventory:** table with stock, SKU, low-stock banner, full CRUD.
- ✅ **Appointments:** date-filtered list, new booking modal (customer + staff + multi-service + datetime), status transitions (complete/cancel/no-show).
- ✅ **POS / Billing:** services & products tabs, search, cart with qty controls, customer + stylist selectors, discount, 18% tax, 4 payment modes (cash/card/UPI/wallet), invoice receipt modal with auto invoice number (`INV-YYYYMM-####`). Customer loyalty/visits/total_spent and product stock are auto-updated.
- ✅ **Reports:** date-range sales view with revenue total, payment-mode pie chart, recent invoices.
- ✅ **Seed data:** 10 services, 4 staff, 6 products (2 low-stock), 5 customers — appears on first boot.
- ✅ **Java/Oracle reference package** with controllers, entities, JPA repos, JWT filter, full Oracle DDL.

## Testing
- Backend pytest: **18/18 passing** (auth, all CRUD modules, invoice flow, reports).
- Frontend (testing agent): **100% of reviewed flows pass** — login, dashboard, customers CRUD, POS end-to-end checkout, logout/auth-guard, data-testid coverage solid.

## Backlog / Future
**P1**
- Role-based authorization (only admin can delete staff/services/products).
- Stock-availability check before invoice creation (avoid negative stock).
- Printable invoice / WhatsApp share invoice link.
- Calendar view for appointments (day/week grid).

**P2**
- Staff performance reports + commission payouts.
- SMS/Email reminders for appointments (Twilio / SendGrid).
- Customer-facing booking widget.
- Multi-branch support.
- Migrate FastAPI lifecycle from `on_event` to lifespan handler; explicit CORS origins for prod.

## File Map
- `/app/backend/server.py` — FastAPI app (auth + 7 modules + reports + seed).
- `/app/backend/.env` — MONGO_URL, DB_NAME, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD.
- `/app/frontend/src/App.js` — router + protected routes.
- `/app/frontend/src/context/AuthContext.jsx` — auth state, login/logout.
- `/app/frontend/src/components/AppLayout.jsx` — sidebar + top bar.
- `/app/frontend/src/pages/*.jsx` — Login, Dashboard, Customers, Services, Staff, Inventory, Appointments, POS, Reports.
- `/app/java-reference/` — Spring Boot + Oracle backend (read-only reference).
- `/app/auth_testing.md` — auth playbook.
- `/app/memory/test_credentials.md` — test credentials.
