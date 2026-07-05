# Miracurl — Salon Management Suite

A multi-tenant SaaS platform for salon & parlour management: online bookings, POS billing, staff HR (geo-fenced attendance, salaries, resumes), AI marketing tools, subscription billing and a Super-Admin command console.

- **Production:** https://miracurlunisexsaloon.com
- **Architecture:** React SPA + FastAPI REST API + MongoDB (single repo, `frontend/` + `backend/`)

---

## Tech Stack Overview

| Layer      | Technology                                   | Version   |
|------------|----------------------------------------------|-----------|
| Backend    | Python / FastAPI                             | Python 3.11 · FastAPI 0.110 |
| API server | Uvicorn (ASGI)                               | 0.25      |
| Database   | MongoDB (async via Motor)                    | Motor 3.3 / PyMongo 4.6 |
| Frontend   | React (Create React App + CRACO)             | React 19  |
| Routing    | react-router-dom                             | 7.x       |
| Styling    | Tailwind CSS + shadcn/ui (Radix primitives)  | —         |
| HTTP client| axios                                        | 1.x       |
| Node       | Node.js + Yarn                               | Node 20   |
| Process mgr| supervisord (backend :8001, frontend :3000)  | —         |

---

## Backend (`/backend`)

**Language:** Python 3.11 · **Framework:** FastAPI · **Validation:** Pydantic v2

### Module layout
```
backend/
├── server.py          # All API routes (prefixed /api)
├── database.py        # Mongo connection + tenant-scoped collection wrapper (contextvars)
├── security.py        # JWT (httpOnly cookies), bcrypt hashing, role guards, rate limiting
├── storage.py         # Object-storage uploads (magic-byte validated)
├── email_service.py   # Resend transactional emails (welcome / expiry / monthly reports)
├── services/
│   └── pdf.py         # ReportLab PDFs: salary slips, staff resumes, registry reports
├── scripts/           # One-off utilities (OG image builder, seeds)
└── tests/             # API test suites (test_iter*.py)
```

### Key libraries
`fastapi`, `uvicorn`, `motor`, `pydantic`, `PyJWT`, `bcrypt`/`passlib`, `razorpay`, `resend`, `emergentintegrations` (LLM/AI), `reportlab`, `qrcode`, `Pillow`.

### Auth & roles
- JWT stored in **httpOnly cookies** (no tokens in localStorage).
- Roles: `super_admin` → `admin` (salon owner) → `manager` → `staff`.
- Public endpoints under `/api/public/*` (booking, AI chat, reviews, staff registry) are rate-limited.

### Environment variables (`backend/.env`)
> Never commit real values. All config is env-driven.

| Variable | Purpose |
|---|---|
| `MONGO_URL` | MongoDB connection string |
| `DB_NAME` | Database name |
| `CORS_ORIGINS` | Allowed origins |
| `JWT_SECRET` | Cookie/JWT signing secret |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First tenant-admin seed |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_SEED_PASSWORD` | Super-admin seed |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Payments (LIVE) |
| `RESEND_API_KEY` / `SENDER_EMAIL` / `HQ_EMAIL` | Transactional email |
| `EMERGENT_LLM_KEY` | AI chat (GPT), image generation (gpt-image-1), voice |
| `FRONTEND_URL` / `APP_PUBLIC_URL` | Absolute links in emails/QRs |
| `GOOGLE_REVIEW_URL` / `WELCOME_IMAGE_URL` | Branding defaults |

### Run locally
```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
# (in the hosted environment: sudo supervisorctl restart backend)
```

---

## Database (MongoDB)

- **Engine:** MongoDB, accessed asynchronously with **Motor**.
- **Multi-tenancy:** every business collection is wrapped by `TenantCollection` (`database.py`) which injects `tenant_id` filters automatically from a request-scoped contextvar — salons can never read each other's data.
- **IDs:** application-level UUID4 strings in an `id` field (Mongo `_id` is excluded from API responses).
- **Timestamps:** ISO-8601 UTC strings.

### Main collections
| Collection | Contents |
|---|---|
| `tenants` | Salons: slug, branding, branches (with GPS), plan/status |
| `users` | Logins for all roles (bcrypt password hashes) |
| `customers` | CRM: guests, visit history, loyalty |
| `services` / `products` | Service menu & retail inventory |
| `appointments` | Bookings (staff, slot, status) |
| `invoices` | POS bills: line items, payment mode, GST |
| `staff` | Employees: commission, shifts, branch tag, bank details, Aadhaar (hashed) |
| `attendance` | Geo-fenced daily check-ins, late fines, overtime |
| `advances` | Salary advances (monthly capped) |
| `staff_resumes` | Staff-built resume data (PDF export) |
| `reviews` | Customer ratings + Google-review funnel |
| `subscriptions` / `payments` | Razorpay orders, webhooks, renewals |
| `affiliates` / `referrals` | Refer-&-earn credits |
| `uploads` | Object-storage file metadata (logos, photos, posters) |
| `hq_messages` / `tickets` | Owner ↔ HQ inbox, engineer tickets |

---

## Frontend (`/frontend`)

**Framework:** React 19 (CRA + CRACO) · **Styling:** Tailwind CSS + shadcn/ui (Radix) · **Icons:** lucide-react · **Toasts:** sonner · **PWA:** installable booking & business apps (service worker).

### Structure
```
frontend/src/
├── App.js                 # Routes (role-gated)
├── pages/                 # Dashboard, Appointments, POS, Staff, Attendance,
│                          # Reports, Settings, OffersStudio, StaffPortal,
│                          # StaffBankDetails, StaffResume, SuperAdmin, Booking…
├── components/
│   ├── ui/                # shadcn/ui primitives
│   ├── settings/          # Settings page cards (Branding, Tax, Razorpay…)
│   ├── staff/             # StaffCard, StaffFormModal, ResumeBuilder…
│   ├── superadmin/        # OnboardingStudio, Leaderboard/Revenue panels
│   └── pos/               # Receipt & checkout modals
├── hooks/                 # useVoiceRecording (VAD mic capture)
├── context/AuthContext.jsx
└── lib/                   # api.js (axios + cookies), branch.js, share.js
```

### Environment variables (`frontend/.env`)
| Variable | Purpose |
|---|---|
| `REACT_APP_BACKEND_URL` | Absolute backend origin — **all API calls use `${REACT_APP_BACKEND_URL}/api/...`** |
| `WDS_SOCKET_PORT` | Dev-server websocket port |

### Run locally
```bash
cd frontend
yarn install
yarn start        # http://localhost:3000
```

---

## Application Modules — Role by Role

### 1. Super Admin Portal (`/super-admin`) — platform owner (Miracurl HQ)
| Section | Description |
|---|---|
| **Tenants** | Create/onboard salons (auto-generates owner credentials + welcome email), pause/resume/cancel/reactivate subscriptions, act-as-salon login, CSV data import per salon, trial management |
| **Billing & Subscriptions** | Razorpay payment history, plan status of every salon, expiry tracking, manual plan extension, fine waivers |
| **Top Referrers** | Refer-&-earn leaderboard, renewal-reminder queue with WhatsApp nudges |
| **Revenue** | Platform-wide revenue analytics across all salons |
| **AI Insights** | "Miracurl HQ Analyst" — natural-language questions over platform data (collections per salon, expiring subscriptions, top earners) |
| **HQ Inbox** | Messages from salon owners (Contact HQ), unread badge, replies |
| **AI Engineer** | Internal ticket tracker (open / in-progress / done / won't-fix) with priorities |
| **Onboarding Image** | AI-generated "Welcome Onboard — {Salon}" 9:16 poster (salon logo + gpt-image-1 background) for WhatsApp status |
| **Monthly Reports** | One-click email of last month's business report to every active salon owner |

### 2. Admin Portal — salon owner (per tenant)
| Section | Description |
|---|---|
| **Dashboard** | Today's revenue, bookings, top services/staff, branch filter, daily-report banner |
| **Appointments** | Calendar of bookings (online + walk-in), status flow, staff assignment |
| **CRM** | Customer directory, visit history, spend, loyalty, CSV import |
| **Staff** | Team profiles (photo, commission %, base salary, shift times, overtime rate, branch tag, Aadhaar, notice period), staff logins with temp passwords, salary advances, **Staff Bank Details** table, Managers (restricted logins) |
| **Staff Registry** | Aadhaar-verified industry-wide employment registry — verify a candidate's history & hire-worthiness before hiring |
| **Attendance** | Geo-fenced check-ins per branch (200 m fence), late fines with grace period, overtime, fine waivers, date filter, CSV export, salary slips |
| **Services** | Service menu by category/gender with prices & durations, CSV import |
| **Inventory** | Retail products, stock levels, low-stock alerts, CSV import |
| **POS / Billing** | Touch-POS invoicing (services + products), packages & benefit redemption, GST, split payment modes, WhatsApp/print receipts |
| **Reviews** | Customer ratings; 4★+ guests get one-tap Google-review funnel |
| **Offers & Plans** | Membership/package plans customers can buy |
| **Offer Maker** | Canvas poster studio: 120 seasonal templates, per-service offer pricing with auto-discounts, Mira AI banner, Instagram/WhatsApp formats |
| **Refer & Earn** | Affiliate link — ₹1,000 credit per referred salon signup |
| **Reports** | Sales, staff performance (day/week/month), staff commission, daily report |
| **Settings** | Profile-completeness meter, booking QR poster, branches (with GPS pins), password change, Contact HQ, salon branding (review link, Maps, hours, hero image, socials), GST/tax config, subscription renewal via Razorpay |
| **Logo Studio** | AI logo generation (gpt-image-1) + upload |

### 3. Staff Portal — employee self-service login
| Section | Description |
|---|---|
| **My Dashboard** | Geo-fenced check-in/check-out (fenced to assigned branch GPS), live shift timer, late-fine visibility, month summary (days, hours, overtime), salary slip PDF download (if owner allows), profile-photo upload (syncs to admin portal & booking page) |
| **Appointments** | Their own bookings for the day/week |
| **Bank Details** | Bank name, IFSC, account-holder name — visible to salon admin for payouts |
| **Build Your Resume** | Resume builder: experience, addresses, multi-select designations (Beauty/Nail/Hair Expert, Manager, Chemical Expert) with auto-written responsibility paragraphs, past salons with verification phones, achievements/hobbies/awards → professional PDF with circular photo |

### 4. Tenant Public Side — the salon's customer-facing pages (`/book/{slug}`)
| Section | Description |
|---|---|
| **Booking page** | Branded 5-step wizard: services (by gender/category) → stylist → date & time slots → details → confirm; hero image, hours, phone, Instagram/WhatsApp links, locations with "Get Directions" |
| **Mira AI chat** | 24/7 AI beauty advisor (text + voice with hands-free mode): suggests services by skin tone/hair type and books appointments in-chat |
| **PWA install** | "Miracurl Book" installable app prompt for repeat self-booking |
| **Reviews page** | Post-visit rating link; high ratings funnel to Google reviews |
| **Staff verify page** | Public Aadhaar-based staff-history verification with hire-worthiness verdict (PII redacted) |
| **Find a salon** | Directory of salons on the platform |

---



## Conventions & Notes

- **Every backend route is prefixed `/api`** (ingress routes `/api/*` → :8001, everything else → :3000).
- Frontend never hardcodes URLs — always `process.env.REACT_APP_BACKEND_URL`.
- Auth cookies are httpOnly + SameSite; frontend sends `withCredentials: true`.
- File uploads are validated by magic bytes and stored in object storage; served back via `/api/files/{id}`.
- PDFs (salary slips, resumes, registry reports) are generated server-side with ReportLab.
- AI features (Mira chatbot, logo & poster generation, voice) run through the Emergent integrations library.
- Tests live in `backend/tests/` and `test_reports/` holds QA iteration results.

## Deployment
- Preview/dev runs under supervisord (hot reload on both services).
- Production is deployed via the Emergent platform to **https://miracurlunisexsaloon.com** — after merging changes, redeploy from the platform to go live.
