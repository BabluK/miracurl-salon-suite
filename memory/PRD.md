# Miracurl Salon Management — PRD

## Original Problem Statement
> "I want to build this saloon management system for my saloon — instead of Respark you should use Miracurl, please read and see all the image and build java 8 backend code and ui for react or react native — for DB oracle"

## User-confirmed Decisions
- **Live preview stack:** Python FastAPI + MongoDB + React (web).
- **Reference code package:** Java 8 + Spring Boot 2.7 + Oracle SQL schema (read-only).
- **Scope:** Full admin suite + Public booking + Refer-a-friend + Rate-Your-Visit review system.
- **Auth:** JWT (email + password), admin seeded, role-based DELETE.
- **Brand:** Miracurl — dark luxury gold + blush.

## Personas
1. **Salon Admin / Owner** – manages everything; only admin can delete master data and moderate reviews.
2. **Front-Desk / Staff** – operational read+create+update; no master data deletes.
3. **End Customer** – self-books at `/book`, leaves reviews at `/review/{token}`, earns referral + review credits.

## Architecture
- **Backend (live):** FastAPI + MongoDB. JWT (PyJWT + bcrypt). All endpoints under `/api`. Public (no-auth) under `/api/public/*`. In-memory rate-limit dict per endpoint key.
- **Frontend:** React 18 + Tailwind + Recharts + Sonner + Lucide + axios.
- **Reference backend:** `/app/java-reference/` — Spring Boot 2.7 + JPA + JWT + ojdbc8 + Oracle DDL.

## Implemented Features
### Iteration 1 — MVP
Auth, Dashboard (KPIs+charts), Appointments, Customers CRM, Services, Staff, Inventory, POS/Billing, Reports, Java/Oracle reference package, seed data. 18/18 backend tests.

### Iteration 2 — Code review hardening
Backend variable shadowing fix; removed localStorage tokens → in-memory + httpOnly cookies; useCallback for loads; stable map keys; lint clean.

### Iteration 3 — Public booking
Public `/book` 5-step luxe stepper, `/api/public/{salon,services,staff,book}` endpoints, Dashboard "Public Booking Link" widget. 25/25 backend.

### Iteration 4a — "Build All" hardening + Refer-a-friend
Rate-limit (8/10min/IP) on `/public/book`; phone regex; future-date guard; IST business-hours guard; customer-update on phone match; refer-a-friend with auto-generated codes + ₹100 mutual credit; stock-availability check; role-based admin DELETE; POS invoice Print + WhatsApp share; Appointments List ↔ Week view toggle.

### Iteration 4b — Rate-Your-Visit ⭐ Review System
- ✅ **Public review page** `/review/{appointment_id}` — heart icon, personalized greeting, 5-tap stars with hover glow, microcopy varies by rating, 4★+ ₹50 credit incentive
- ✅ **Reward coupon system** — 4★+ auto-generates `THANKS-XXXXX` code, adds ₹50 to customer's `referral_credit` (auto-applied at next POS checkout)
- ✅ **Public endpoints:** `GET /api/public/review-info/{token}`, `POST /api/public/review/{token}` (rate-limit 10/10min/IP), `GET /api/public/reviews/featured` (rating≥4, public=true, PII-stripped)
- ✅ **Already-submitted guard** — second visit shows the original rating, no duplicate submit
- ✅ **Auto-public for 4★+**, hidden for ≤3 (admin can override per review)
- ✅ **Admin Reviews page** (`/reviews`) — avg-rating widget, 5-bar rating distribution, filter tabs (All / 5★ / 4★ / Needs Attention ≤3), per-review Public/Hidden toggle, Delete (admin only)
- ✅ **Dashboard widgets:** Customer Rating (5-star), Pending Review Requests counter
- ✅ **Featured reviews strip** on public `/book` page above the stepper (social proof)
- ✅ **"Send Review Link" buttons** on completed Appointments rows + POS invoice receipt → opens WhatsApp with customer's phone pre-filled

**Tests:** Backend 12/12 new Iter4 review tests pass (47/48 full suite, single flake pre-existing). Frontend 6/6 critical review flows pass. Lint clean.

## Backlog / Future
**P1**
- SMS/Email reminders + auto-send review link 2h after appointment ends (Twilio / SendGrid).
- Convert in-memory rate-limit + login-attempts to Redis (won't survive multi-worker / restart).
- Convert stock-check N+1 query to single `$in` lookup.

**P2**
- Public reviews page (e.g. `/reviews-public`) embeddable on the salon's marketing site.
- Multi-branch support.
- Staff commission payouts report (already tracked via `commission_pct`).
- Captcha on `/public/book` and `/public/review/{token}` if abuse spikes.
- Migrate FastAPI `on_event` → lifespan; lock CORS for production.
- Customer name PII review on `/api/reviews` list if compliance is required.

## File Map
- `/app/backend/server.py` — auth + 7 admin modules + reports + public booking + referral + reviews + seed.
- `/app/backend/.env` — MONGO_URL, DB_NAME, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD.
- `/app/frontend/src/App.js` — router with public `/book`, `/review/:token` outside auth.
- `/app/frontend/src/context/AuthContext.jsx`
- `/app/frontend/src/components/AppLayout.jsx` — sidebar (Dashboard, Appointments, CRM, Staff, Services, Inventory, POS, Reviews, Reports).
- `/app/frontend/src/pages/` — Login, Dashboard (with rating widget), Appointments (list+week, send-review on completed), Customers, Services, Staff, Inventory, POS (print+WA+review link), Reports, Reviews (admin moderation), BookPublic (5-step + referral + featured-reviews), ReviewPublic (5-star + reward).
- `/app/java-reference/` — Java 8 + Spring Boot 2.7 + Oracle reference backend.
- `/app/memory/test_credentials.md`, `/app/auth_testing.md`
