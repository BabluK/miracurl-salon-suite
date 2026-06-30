# Miracurl Salon Management — PRD

## Original Problem Statement
> Build Miracurl salon-management system as a sellable multi-tenant SaaS.

## User-confirmed Decisions
- **Live preview stack:** Python FastAPI + MongoDB + React.
- **Reference code:** Java 8 + Spring Boot 2.7 + Oracle (read-only at `/app/java-reference/`).
- **Tenancy model:** Subdomain per tenant in production; path-prefix fallback (`/book/{slug}`) in preview.
- **Onboarding:** Super-Admin creates tenants manually (B2B, no public signup).
- **Billing:** Razorpay subscriptions (deferred — keys not yet provided).
- **Public booking URL pattern:** `yourdomain.com/book/{salon-slug}`.
- **Branding:** Shared "Miracurl" master brand (franchise model).

## Personas
1. **Super-Admin / SaaS Owner** – manages all tenants from `/super-admin` (HQ console).
2. **Salon Owner / Admin** – manages their own salon's data, can delete master data.
3. **Front-Desk / Staff** – operational read+create+update; no master deletes.
4. **End Customer** – books at `/book/{slug}`, leaves reviews at `/review/{token}`, earns credits.

## Architecture
- **Multi-tenancy:** `TenantCollection` proxy + Python `contextvars._current_tenant_id`. Every read/write auto-scoped to the user's tenant. Super-admin can switch context via `X-Tenant-Slug` header.
- **Auth:** JWT (PyJWT + bcrypt). 3 roles: `super_admin`, `admin`, `staff`. Admin DELETE requires `admin` or `super_admin`.
- **Backend:** FastAPI + MongoDB (motor). All endpoints under `/api`. Public (no-auth) under `/api/public/*`. In-memory rate-limit dict per endpoint key.
- **Frontend:** React 18 + Tailwind + Recharts + Sonner + Lucide + axios. Axios interceptor injects `X-Tenant-Slug` header. Tenant slug bootstrapped from subdomain → localStorage → `?tenant=` query.
- **Reference backend:** `/app/java-reference/` Spring Boot 2.7 + JPA + Oracle.

## Implemented (Iteration history)
| # | Feature batch |
|---|---|
| 1 | MVP: Auth, Dashboard, Appointments, Customers, Services, Staff, Inventory, POS, Reports, Java/Oracle refs, seed data |
| 2 | Code-review hardening: variable shadowing fix, in-memory token, useCallback, stable keys |
| 3 | Public booking `/book` (5-step luxe stepper) + Dashboard booking-link widget |
| 4a | Rate-limit + server-side validators + customer-update + refer-a-friend (₹100 mutual credit) + POS Print/WhatsApp + Appointments week view + stock check + role-based DELETE |
| 4b | Rate-Your-Visit ⭐ — public `/review/{token}`, ₹50 reward for 4★+, admin Reviews moderation page, Dashboard rating widget, featured reviews on `/book`, send-review buttons on Appointments+POS |
| 4c | Google Review link CTA on `/review` success (4★+) + `/book` footer |
| **5** | **Multi-tenant SaaS conversion** ✦ |
| **6** | **P0 security/code-quality hardening (Feb 2026)** — XSS fix in POS print (window.open + document.write → hidden iframe with srcdoc + HTML-escaped dynamic values), removed orphaned dead-code body + duplicate `backfill_tenant_ids` in server.py, stable-key fix in BookPublic featured reviews (idx → r.id). Razorpay subscription billing **deferred** — no API keys provided yet. |

## Iteration 5 — Multi-tenant SaaS
- ✅ **`Tenant` model** with slug, name, owner_email, plan (starter/pro/enterprise), status (trial/active/suspended/cancelled), trial_ends_at, razorpay_subscription_id (placeholder).
- ✅ **`TenantCollection` proxy** auto-scopes every Motor operation via Python contextvars — existing CRUD endpoints needed ZERO changes.
- ✅ **`super_admin` role** + seeded user (`super@miracurl.com` / `Super@Miracurl123`). `admin` is per-tenant.
- ✅ **`/super-admin` console** — tenant list, KPI cards, "New Tenant" modal (slug regex, plan select, owner creds), suspend/activate/cancel actions, per-tenant `/book/{slug}` link.
- ✅ **Public booking** now slug-scoped: `/api/public/{salon,services,staff,referral,book,reviews/featured}/{slug}` (+ legacy aliases to default tenant for backwards compat).
- ✅ **Frontend `/book/:slug`** route — tenant-specific hero, fallback to default. Invalid slug → "Salon not found".
- ✅ **Tenant isolation verified:** new tenant sees 0 records; original admin still sees 5 customers; cross-tenant access returns 403.
- ✅ **Slug regex** validation (`[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?`), slug+owner_email uniqueness checks.
- ✅ **Suspension blocks** public booking + new tenant logins.
- ✅ **Default-tenant backfill** migration runs on startup — existing data assigned to `miracurl-marathahalli`.
- ✅ **Dropped legacy `products.sku_1` unique index**, added composite `(tenant_id, sku)`.
- ✅ **ObjectId leak in create_tenant** (returned via response) — fixed.

**Testing:** Backend 23/24 ✓ (1 documented skip about super-admin no-header behaviour). Frontend Playwright 100% on iter5 critical flows.

## Deferred (next iteration — needs your keys)
- **Razorpay subscriptions** — please provide `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (from https://dashboard.razorpay.com/ → Account & Settings → API Keys). Once provided I'll wire: plan creation, subscribe-tenant flow, webhook handler (subscription.activated/charged/cancelled), and a "Billing" page in the salon admin app.

## Backlog
**P1**
- Razorpay subscriptions (above).
- SMS/Email reminders + 2h-post-appointment review nudges (Twilio / SendGrid).
- Move rate-limiter + login_attempts to Redis.
- Auto-revoke JWT on tenant suspension/cancel (currently the JWT keeps working until expiry).

**P2**
- Hard-fail-closed `TenantCollection` for super-admin without explicit `X-Tenant-Slug`.
- N+1 stock-check → single `$in` lookup.
- Customer self-serve signup (currently super-admin-only).
- Production deployment + custom-domain wildcard DNS setup (see support_agent answer).

## Production deployment notes (from support_agent)
- Emergent deploys via the **"Deploy"** button (top-right of the workspace). MongoDB hosting in prod = **MongoDB Atlas** managed.
- For custom domain: buy from any registrar (GoDaddy/Namecheap/Cloudflare) → add `CNAME` to Emergent's provided host → for wildcard subdomain pattern (`*.miracurl.com`) you need wildcard CNAME + Let's Encrypt wildcard cert. Emergent support: support@emergent.sh.

## Test credentials
- Super Admin: `super@miracurl.com` / `Super@Miracurl123` (`role=super_admin`, `tenant_id=null`)
- Default Admin: `admin@miracurl.com` / `Miracurl@123` (tenant `miracurl-marathahalli`)
- Test tenant 2: `owner@elegance.com` / `Owner@123` (tenant `elegance-koramangala`)

## File Map
- `/app/backend/server.py` — auth + tenants + 7 modules + reports + public booking + referral + reviews + seed.
- `/app/frontend/src/{App.js, lib/api.js, context/AuthContext.jsx, components/AppLayout.jsx, pages/*}`
- `/app/frontend/src/pages/SuperAdmin.jsx` — HQ console (iter 5).
- `/app/java-reference/` — Java 8 + Spring Boot reference.
- `/app/memory/PRD.md`, `/app/memory/test_credentials.md`, `/app/auth_testing.md`.
