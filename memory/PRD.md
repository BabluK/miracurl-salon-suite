# Miracurl Salon Management — PRD

## Original Problem Statement
> "I want to build this saloon management system for my saloon — instead of Respark you should use Miracurl, please read and see all the image and build java 8 backend code and ui for react or react native — for DB oracle"

## User-confirmed Decisions
- **Live preview stack:** Python FastAPI + MongoDB + React (web).
- **Reference code package:** Java 8 + Spring Boot 2.7 + Oracle SQL schema (read-only).
- **Scope:** Full suite + Customer-facing public booking + Refer-a-friend.
- **Auth:** JWT (email + password), admin seeded on startup, role-based DELETE.
- **Brand:** Miracurl — dark luxury gold + blush aesthetic.

## Personas
1. **Salon Admin / Owner** – manages everything, only one allowed to delete master data.
2. **Front-Desk / Staff** – all read + create/update on operational data, no deletes.
3. **End Customer** – self-books at public `/book`, earns/uses referrals.

## Architecture
- **Backend (live):** FastAPI + MongoDB (motor). JWT via PyJWT + bcrypt. All endpoints under `/api`. Public (no-auth) endpoints under `/api/public/*`.
- **Frontend:** React 18 + Tailwind + Recharts + Sonner + Lucide + axios.
- **Reference backend:** `/app/java-reference/` — Spring Boot 2.7, JPA, JWT, ojdbc8 + Oracle DDL.

## Implemented Features
### Iteration 1 — MVP
Auth, Dashboard (KPIs+charts), Appointments, Customers CRM, Services, Staff, Inventory, POS/Billing, Reports, Java/Oracle reference package, seed data. 18/18 backend tests pass.

### Iteration 2 — Code review hardening
Backend variable shadowing fix; removed localStorage tokens → in-memory + httpOnly cookies; useCallback for all loads; stable map keys; lint clean.

### Iteration 3 — Public booking
Public `/book` 5-step luxe stepper, `/api/public/{salon,services,staff,book}` endpoints, Dashboard "Public Booking Link" widget. 25/25 backend.

### Iteration 4 — "Build All" hardening + Refer-a-friend
- ✅ **Rate-limit** (`8 req / 10min / IP`) on `/api/public/book`
- ✅ **Server-side validation:** phone regex (7-15 digits), future-date guard, IST business-hours (10:00–21:00)
- ✅ **Customer-update on phone match:** if existing customer, name/email get updated
- ✅ **Refer-a-friend:** each customer gets a 6-char `referral_code`. New customer entering a valid code → both parties get ₹100 `referral_credit`. Lookup endpoint `/api/public/referral/{code}`
- ✅ **POS invoice referral credit:** auto-applied as discount (before tax), credit decremented after use
- ✅ **Stock availability check:** invoice creation aggregates quantities per product, rejects with clear message if insufficient
- ✅ **Role-based authorization:** DELETE endpoints (customers, services, staff, products) require `role == admin`
- ✅ **POS Print + WhatsApp** invoice share buttons on receipt
- ✅ **Calendar Week View** for Appointments with prev/next week, today highlighted, click-to-filter
- ✅ **Public booking success:** "Share & earn ₹100" card with copy + WhatsApp share

**Tests:** 12/12 new iteration_3 tests pass, 3/3 frontend critical flows pass, lint clean.

## Backlog / Future
**P1**
- SMS/Email reminders (Twilio / SendGrid) — reduce no-shows.
- Move rate-limiter to Redis (current in-memory dict won't survive multi-worker / restart).
- Convert stock-check N+1 to single `$in` query.

**P2**
- Multi-branch support.
- Staff commission payouts report (already track `commission_pct`).
- Migrate FastAPI lifecycle `on_event` → lifespan; lock CORS for production.
- Captcha or signed link for `/public/book` if abuse spikes.

## File Map
- `/app/backend/server.py` — auth + 7 admin modules + reports + public booking + referral + seed.
- `/app/backend/.env` — MONGO_URL, DB_NAME, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD.
- `/app/frontend/src/App.js` — router (public `/book` outside auth).
- `/app/frontend/src/context/AuthContext.jsx` — in-memory token + cookies.
- `/app/frontend/src/components/AppLayout.jsx` — admin sidebar + top bar.
- `/app/frontend/src/pages/*.jsx` — Login, Dashboard, Customers, Services, Staff, Inventory, Appointments (list+week), POS (print+WA share), Reports, BookPublic (5-step + referral).
- `/app/java-reference/` — Java 8 + Spring Boot 2.7 + Oracle reference backend.
- `/app/memory/test_credentials.md`, `/app/auth_testing.md`
