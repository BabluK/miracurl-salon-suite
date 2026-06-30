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
| **6** | **P0 security/code-quality hardening (Feb 2026)** — XSS fix in POS print (window.open + document.write → hidden iframe with srcdoc + HTML-escaped dynamic values), removed orphaned dead-code body + duplicate `backfill_tenant_ids` in server.py, stable-key fix in BookPublic featured reviews (idx → r.id). |
| **7** | **Iter 7 — Refactor pass + Login redesign + Bulk Customer Import (Feb 2026)** — Backend: extracted helpers from `public_book` (`_resolve_staff`, `_resolve_or_create_customer`, `_apply_referral_credit`, `_create_public_appointment`), from `create_invoice` (`_check_stock_or_400`, `_compute_invoice_totals`), and from `get_current_user` (`_extract_bearer_token`, `_decode_access_token`, `_apply_tenant_context`) — cyclomatic complexity halved. Frontend: BookPublic 549→235 lines via new `BookPublic.steps.jsx` companion (FeaturedReviews, ServicesStep, StaffStep, DateTimeStep, DetailsStep, ConfirmStep, SuccessStep). AuthContext refactored with `useCallback` + `useMemo` and service-layer helpers, empty catches now log. Dashboard inline chart props lifted to module constants. NEW feature: Super-Admin Bulk Customer Import (POST `/api/super-admin/tenants/{tid}/customers/import`) accepting WhatsApp vCard (.vcf) or pasted text (Name, Phone) — phone-normalised, dedupes existing, auto-assigns referral code to every new customer (`ImportCustomersModal.jsx` triggered from Upload-icon on each tenant row in SuperAdmin). Login page completely redesigned to match Respark visual reference: white card, "Welcome Back" heading, light-blue inputs with circular icon prefixes, blue Login button, "Forgot Password" link, gradient pink/purple blobs in background corners, MIRACURL logo top-left. Razorpay subscription billing **still deferred** — no API keys provided yet (only payment-page link). |
| **8** | **Iter 8 — WhatsApp share fix + POS Respark redesign + Add Guest (Feb 2026)** — Bug fix: `/book` success page WhatsApp share button now uses `https://api.whatsapp.com/send?text=…` (was `wa.me/?text=…` which silently failed on iOS Safari / most mobile in-app browsers). Centralised in new util `/app/frontend/src/lib/share.js` with `shareText()` (Web Share API preferred) and `openWhatsApp()` (api.whatsapp.com fallback). POS page **fully redesigned** to match the Respark POS reference: light theme (`bg-slate-50`), top tabs `Add Service / Add Product / Add Package / Add GiftCard / Add Membership` (last three disabled placeholders), left column category cards auto-generated from services, service-with-price tiles, right column Invoice card with Guest dropdown + Stylist select + **Add Guest** inline modal (creates new customer with auto-referral-code via existing POST `/api/customers`), items table with Name / Qty (±) / Price / Sub Total / per-line Disc% / Tax / Total, Order Instruction textarea, Payment Details (Cash / Card / GPay / Phone Pay), Clear / Create / Create & Complete footer buttons. Print uses safe iframe srcdoc; share now uses api.whatsapp.com/send. |
| **9** | **Iter 9 — Dashboard Respark light-theme restyle (Feb 2026)** — Dashboard.jsx fully rewritten in light theme to match Login + POS visual language: `bg-slate-50` wrapper, sky-to-blue gradient hero banner with the Public Booking Link widget on the right (Copy / Open), 4 white KPI tiles with coloured icon tiles (emerald / sky / amber / rose) per STAT_ACCENTS, white chart cards with sky-blue accent line/bars (chart-tooltip / dot constants updated to light theme), light rating widget with amber stars + count, light upcoming-appointments list, amber-tinted Stock Alerts list. All previous data-testids preserved so iter1–iter8 regression scripts keep working. Backend untouched. Tested: 17/17 backend regression GREEN + 100% on Dashboard visual + smoke check of POS / public booking. |
| **10** | **Iter 10 — Full admin-page restyle + Review-Request Blast feature (Feb 2026)** — Restyled all 8 admin pages (Appointments, Customers, Staff, Services, Inventory, Reviews, Reports, SuperAdmin) in the Respark light theme via batched sed migration: `card-luxe → card-light`, `btn-gold → btn-blue`, `btn-ghost → btn-slate`, `input-luxe → input-light`, `label-luxe → label-light`, `luxe-table → luxe-table-light`, plus colour swaps (gold → sky-blue/amber, ink-* → slate-*, bg-bg-base → bg-slate-50). Each page wrapped with the standard `bg-slate-50` shell. Reports.jsx donut palette swapped to sky-blue/violet/amber/emerald. New light utility classes added to `index.css` while keeping the dark variants intact for the customer-facing BookPublic. NEW Review-Request Blast feature: backend `GET /api/reviews/blast-targets` returns completed appointments in the last 14 days that don't yet have a review (joined with `customers.phone`); Dashboard shows a "Send review-request blast" button under the Pending-Reviews widget that opens `ReviewBlastModal.jsx` listing each candidate with a one-click WhatsApp Send button (api.whatsapp.com/send pre-filled with personalised `Hi <name>… please review at /review/<id>… 4★+ earns ₹50 credit`) plus a Send-to-all-10 bulk button. Tested: 20/20 backend (17 iter7 regression + 3 new); 100% frontend on every iter10 flow incl. end-to-end Review Blast (booking → completed → blast → WhatsApp URL fires correctly). |
| 11-18 | **Animated BrandMark, mocked Paytm/subscription billing, POS autofill fix, per-line stylist tracking + per-stylist commission report, bulk customer import via vCard, public Salon Signup wizard `/signup-salon`, Marketing Landing page draft.** Tested across iter6-iter18 reports. |
| **19** | **Iter 19 — Tax/GST opt-in + POS guest typeahead + Landing root route (Feb 2026)** — **(1) Tax now optional and tenant-scoped.** New fields on `Tenant`: `tax_enabled` (default false), `gst_number`, `gst_legal_name`, `tax_pct`. New endpoints `GET /api/settings/tax` and `PUT /api/settings/tax` (tenant_admin only) — validation requires a 15-char Indian GSTIN regex (`[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]`) and `tax_pct>0` to enable. `create_invoice` overrides client-sent `tax_pct` and uses tenant settings so invoices ALWAYS have tax=0 when the owner hasn't opted in. New `/settings` admin page (Settings.jsx) with toggle, GSTIN, legal-name and rate inputs + info banner; sidebar nav-settings item. **(2) POS Guest typeahead.** Replaced the customer `<select>` (which dumped all guests on focus) with an actual search input — the dropdown is only mounted when `guestQuery.trim()` is non-empty. Matches by name or phone, max 8 results, with "Add new guest" fallback inline. data-testids: pos-guest-search, pos-guest-dropdown, pos-guest-option-<id>, pos-guest-clear, pos-guest-chip. **(3) POS tax-column conditional.** Tax column header, per-line tax cell, and footer "Tax (n%)" line are now rendered only when `taxEnabled` is true. Receipt modal, printed HTML, and WhatsApp share also hide the Tax line when `invoice.tax==0`. **(4) Landing root.** `App.js` now has a `RootRoute` component — guests at `/` see the marketing Landing page; admins are sent to `/dashboard`; super-admins to `/super-admin`. Tested: 20/20 (9 backend pytest + 11 Playwright) — see `/app/test_reports/iteration_19.json`. Also cleaned 80 stale `TEST_`-prefixed customers + 29 orphan invoices from prior iterations. Deployment-readiness scan: PASS. |
| **20** | **Iter 20 — Affiliate Refer-a-salon program (Feb 2026)** — Word-of-mouth funnel that rewards existing salon owners for bringing in new tenants. **Backend:** new fields on `Tenant` (`affiliate_credits: float = 0`, `referred_by_tenant_id`); new collection `affiliate_referrals` (referrer_tenant_id, referrer_slug, referred_tenant_id, referred_slug, referred_salon_name, credit_amount, created_at); `SalonSignupIn` accepts optional `ref` slug; `POST /api/public/signup-salon` validates the referrer (exists + status in {trial,active} + not self-ref), creates the referral record, and `$inc`-s the referrer's `affiliate_credits` by `AFFILIATE_REWARD_INR = 1000.0`. Invalid/self/missing refs are silently ignored so signup never breaks. New endpoint `GET /api/settings/affiliate` returns `{slug, credits, reward_per_signup, referrals[], count}` for the current tenant. **Frontend:** Landing.jsx captures `?ref=<slug>` from the URL, stores it in `localStorage['miracurl_ref']`, and renders an amber `landing-ref-banner` ("Referred by xyz — they'll earn ₹1,000 when you sign up"). SignupSalon.jsx reads the stored ref, sends it with the signup payload, and clears localStorage on success. Settings.jsx grew a new "Refer & Earn ₹1,000" card with the salon's personal link (`{origin}/?ref={slug}`), Copy + Share buttons (native Web Share API → WhatsApp fallback), a "Your balance" tile, count of referred salons, and a table of recent signups. Tested end-to-end via curl: ₹0 → signup w/ ref → ₹1,000 credited + record appears; invalid ref → silent no-credit; self-ref guard works. |
| **21** | **Iter 21 — Production launch polish: custom domain, OG image, salon profile editor, WhatsApp reminders, referrer leaderboard (Feb 2026)** — App deployed to **https://miracurlunisexsaloon.com**. **(1) Branding/SEO:** `public/index.html` now has the full Miracurl SEO stack — `<title>` "Miracurl ✦ Salon Suite — The salon software that pays for itself", OG + Twitter Card tags pointing to a custom-branded 1200×630 PNG at `/og-image.png`, inline-SVG favicon (pink-fuchsia scissor pill), PWA `manifest.json`, theme-color `#ec4899`. The OG image is generated by `/app/scripts/build_og_image.py` (Pillow) — Unsplash salon hero + brand gradient overlay + serif tagline + white "free trial · ₹0 setup · 90 sec go-live" pill + domain in bottom-right corner. **(2) Salon Profile editor** — new `BrandingIn` Pydantic model + `GET/PUT /api/settings/branding` (admin only). Settings.jsx grew a "Salon profile" card (data-testid `settings-branding-card`) above the Tax card with editable Google review URL (https:// only, validated), working hours, phone, location, hero image. **(3) Tomorrow's appointments reminder widget** — `GET /api/dashboard/reminders` returns appointments scheduled in next 26h with `status ∈ {scheduled, booked, confirmed}` joined with customer phone; `POST /api/dashboard/reminders/{aid}/mark-sent` flips `reminder_sent_at`. Dashboard.jsx renders a `RemindersWidget` only when pending items exist; each row has a one-tap WhatsApp button that opens `api.whatsapp.com/send?phone=...&text=...` (personalised) and marks the reminder sent in parallel. **(4) Top Referrers leaderboard** — `GET /api/super-admin/affiliates/leaderboard` returns top tenants by `affiliate_credits` with referral counts joined via a single `$group` aggregate. SuperAdmin.jsx adds a 3rd tab ("super-tab-leaderboard") rendering `LeaderboardPanel` with medal emojis and empty-state CTA. Tested: 23/23 (13 backend pytest + 10 Playwright) — see `/app/test_reports/iteration_21.json`. Cleaned 57 leftover test customers + 136 stale test appointments. |

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

## Tax / GST behaviour (iter 19)
- **Default:** every new tenant starts with `tax_enabled=false` and `tax_pct=0`. Invoices show only Subtotal, Discount and Total — no GST anywhere.
- **Owner opt-in:** salon admin goes to `/settings`, toggles tax ON, enters a valid 15-char GSTIN (e.g. `29ABCDE1234F1Z5`), legal name, and rate (typically 18%) → POS Tax column, footer "Tax (18%)" line, receipt modal & printed HTML start showing GST.
- **Server enforcement:** `POST /api/invoices` always reads `tenant.tax_enabled` and computes tax from `tenant.tax_pct` — the client-sent `tax_pct` is ignored. This protects every owner who hasn't registered for GST from accidentally over-billing customers.

## File Map
- `/app/backend/server.py` — auth + tenants + 7 modules + reports + public booking + referral + reviews + seed.
- `/app/frontend/src/{App.js, lib/api.js, context/AuthContext.jsx, components/AppLayout.jsx, pages/*}`
- `/app/frontend/src/pages/SuperAdmin.jsx` — HQ console (iter 5).
- `/app/java-reference/` — Java 8 + Spring Boot reference.
- `/app/memory/PRD.md`, `/app/memory/test_credentials.md`, `/app/auth_testing.md`.
