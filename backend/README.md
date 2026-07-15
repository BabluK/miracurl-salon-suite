# Miracurl ✦ Salon Suite

> **Multi-tenant SaaS for Indian salons** — online bookings, POS billing, per-stylist commissions, loyalty rewards, WhatsApp reminders, referral program, and Razorpay subscription billing.

🌐 **Live:** [miracurl-suite.com](https://miracurl-suite.com)
📱 **Support WhatsApp:** +91 82170 72523
📸 **Instagram:** [@miracurl_unisex_salon](https://www.instagram.com/miracurl_unisex_salon/)

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + Tailwind + shadcn/ui + Lucide icons |
| Backend | Python 3.12 + FastAPI + Motor (async MongoDB) |
| DB | MongoDB (multi-tenant via `TenantCollection` proxy + `ContextVar`) |
| Auth | Custom JWT + HttpOnly refresh cookie + bcrypt |
| Payments | Razorpay (card / UPI / NetBanking) |
| Deploy | Emergent (`hair-hub-system.emergent.host`) → custom domain via Entri |

## Project layout

```
backend/
├── server.py            # All FastAPI routes + models + tenant proxy (~2500 lines)
├── requirements.txt
├── tests/               # pytest suites — iter15+ regression pack
├── scripts/
│   └── build_og_image.py   # generates public/og-image.png (Pillow)
└── docs/
    ├── PRD.md              # full product-requirements doc — iter-by-iter history
    └── INFRA_BACKUP.md     # env vars + restore-from-scratch playbook

frontend/
├── src/
│   ├── pages/           # Landing, Dashboard, POS, Settings, SuperAdmin, BookPublic, etc.
│   ├── components/      # AppLayout, BrandMark, ChatButton, ReviewBlastModal, ui/*
│   ├── context/         # AuthContext
│   └── lib/             # api.js (axios instance + 401 interceptor), share.js
├── public/
│   ├── index.html       # OG meta + favicon + manifest
│   ├── og-image.png     # 1200x630 branded share card
│   └── favicon.svg
└── package.json
```

## Local dev

```bash
# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# create .env from docs/INFRA_BACKUP.md template
uvicorn server:app --reload --host 0.0.0.0 --port 8001

# Frontend
cd frontend
yarn install
# create .env with REACT_APP_BACKEND_URL=http://localhost:8001
yarn start
```

Then visit `http://localhost:3000`.

## Key features

- 🏠 **Marketing Landing** at `/` — 7-day free-trial CTA, feature grid, Refer-a-salon banner
- 📅 **Public booking wizard** at `/book/<slug>` — 5-step, no login
- 💳 **POS** with per-stylist line items, typeahead guest search, optional GST tax
- 👨‍👩‍👧 **Customers** with loyalty points, referral codes, bulk vCard import
- 💇 **Staff + services + inventory + reports** (per-stylist commissions, revenue charts)
- 🎯 **Refer-a-Salon** — every signup with `?ref=<slug>` credits ₹1,000 to the referrer
- 🚨 **Renewal reminder banner** — auto-shows when subscription ends in ≤7 days
- 📊 **Super-Admin console** — Tenants · Billing · Top Referrers · Renewals due · Revenue (MRR/ARR/churn) · CSV export
- 🔒 **Multi-tenant isolation** via `TenantCollection` proxy + `ContextVar` scoping
- 💬 **Instagram + WhatsApp + Phone** icons on every public salon page
- 💸 **Razorpay checkout** for tenant self-serve subscription renewal (auto-applies affiliate credits)

## Environment variables

See [`backend/docs/INFRA_BACKUP.md`](backend/docs/INFRA_BACKUP.md) — copy the template into `backend/.env` and fill in real values.

## License

Copyright © Bablu K · All rights reserved.
