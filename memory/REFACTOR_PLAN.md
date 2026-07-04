# server.py Modular Refactor — Execution Plan
> Prepared Jul 4, 2026. Execute in a DEDICATED session with full context budget.
> server.py is ~6,250 lines, 60 Pydantic models, ~150 routes on a single `api` router.
> App is DEPLOYED TO PRODUCTION — zero-behavior-change refactor + full regression required.

## Target structure
```
/app/backend/
├── server.py            # slim: create app, CORS, security-headers middleware, include routers
├── config.py            # env access (MONGO_URL, DB_NAME, RESEND_*, EMERGENT_LLM_KEY, APP_PUBLIC_URL…)
├── database.py          # Mongo client, _raw_db, tenant-scoped `db` wrapper, _current_tenant_id contextvar, _clean()
├── models.py            # all 60 BaseModel classes (grep "^class .*(BaseModel)")
├── security.py          # jwt make/verify, hash_pw, get_current_user, require_* deps, _apply_tenant_context,
│                        #   _reject_if_token_predates_password_change, public_rate_limit, login lockout
├── email_service.py     # _send_email, _welcome_email_html, _monthly_report_html (self-contained; authored part 39/41)
├── services/
│   ├── ai.py            # LlmChat glue: Mira public chat, voice (TTS/STT), super-admin analyst (_super_platform_stats, _ai_safe)
│   ├── pdf.py           # reportlab: registry badge PDF, salary slip (_render_salary_slip_pdf)
│   ├── storage.py       # _put_object, upload endpoints helpers, _MIME, _MAX_UPLOAD_BYTES
│   └── stats.py         # _tenant_month_stats, _compute_invoice_totals + invoice helpers
└── routes/
    ├── auth.py          # /auth/* (login, refresh, logout, me, change-password, forgot/reset)
    ├── public.py        # /public/* (salon page, booking, ai-chat, registry search/pdf, signup)
    ├── customers.py     # /customers, CSV import
    ├── staff.py         # /staff, managers, attendance, salary, staff portal
    ├── catalog.py       # /services, /products, /plans (memberships/packages/coupons), gallery
    ├── appointments.py  # /appointments + status flow (uses _appt_confirmation_whatsapp, _crm_count_completed_appt)
    ├── billing.py       # /invoices, /reports/*, revenue
    ├── registry.py      # /registry/* owner-side cross-salon registry
    ├── tenant.py        # /tenants/current, /settings/*, branches, branding, contact-hq
    └── super_admin.py   # /super-admin/* (tenants CRUD, subscriptions+extend, plans, hq-messages,
                         #   profile, ai-chat, send-monthly-report, uploads/photo), Razorpay webhook
```

## Execution order (each step: move → import in server.py → restart → curl smoke)
1. `config.py` + `database.py` (foundation; everything imports db/_raw_db from here)
2. `models.py` — move all 60 classes; `from models import <explicit list>` (NO import *, lint blocks F403)
3. `security.py` — auth deps; verify login + refresh + act-as + rate limit after
4. `email_service.py`, `services/*` — leaf utilities
5. `routes/*` one file at a time, each with `router = APIRouter()`; server.py `api.include_router(...)`.
   KEEP route paths identical (all under /api prefix on the main `api` router).
6. Final: full testing_agent regression (backend focus: auth, invoices, appointments status flow,
   public booking + Mira, registry, super-admin act-as + delete guard, contact-hq, Razorpay config endpoint).

## Known gotchas from this codebase (bitten before — read carefully)
- search_replace edits on server.py occasionally DON'T PERSIST (hot-reload write race). After EVERY
  critical edit: grep-verify it landed. Consider `sudo supervisorctl stop backend` during bulk moves, restart after.
- Inserting a helper ABOVE a decorated route makes the @api decorator attach to the HELPER (broke
  PUT /appointments/{aid}/status once). Always `grep -B1 "async def"` after moving code near routes.
- File once got a duplicated EOF fragment (`return resp` + logging line) → syntax error. Check `python -m pyflakes` after each batch.
- .env: never heredoc; use search_replace/create_file.
- HTTPException(502) bodies get replaced by Cloudflare's HTML error page — app errors must use 400/4xx.
- Tenant scoping: `db` wrapper reads _current_tenant_id contextvar set in _apply_tenant_context —
  database.py must own BOTH or imports go circular. security.py imports database, never the reverse.
- The super-admin DELETE guard lives in _apply_tenant_context — don't lose it in the move.
- Frontend uses REACT_APP_BACKEND_URL + /api prefix — no frontend changes needed.

## Regression credentials
- see /app/memory/test_credentials.md (super/admin/manager + sandbox tenant test-trial-salon
  trialowner@test.com / TestPass@123 — safe for destructive tests)
