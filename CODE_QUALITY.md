# Code Quality — Ground Truth

Run `make lint` from `/app` for the verified baseline (~30s):
- ruff on backend (undefined vars, syntax, unused imports)
- ruff on tests (relaxed)
- pylint undefined-variable checks (currently 10.00/10)
- eslint on frontend (react-hooks/exhaustive-deps + no-empty)

`make test` runs the full backend pytest suite (500+ tests, run serially with `-n 0` if flaky).

## Known FALSE POSITIVES in external code-review reports
These keep being re-flagged. Verified stale on Jul 8, 2026 — re-verify with `make lint` before acting.

1. **"28-34 possibly undefined variables (backend)"** — pylint E0601/E0602/E0606 = 10/10, ruff F821 = 0.
2. **"150+ missing React hook dependencies"** — eslint exhaustive-deps = 0 warnings. The report's tool
   wrongly counts module-level imports (`api`) and globals (`encodeURIComponent`, `localStorage`)
   as required dependencies. They are not.
3. **"Sensitive data in localStorage"** — auth uses HTTPOnly cookies. localStorage holds only:
   opt-in remembered email (Login), tenant slug (routing), UI prefs/dismissed-banner flags.
4. **"Empty catch blocks"** — all cited catches are intentional graceful degradation with an
   explanatory comment (private-mode localStorage, disconnected thermal printer, already-invalid session).
5. **"`is` instead of `==` comparisons"** — every cited backend/service line is `is None` / `is not None`
   (the correct idiom). Test files' `is True/False` were already converted to truthy asserts (part 77).
6. **"Hardcoded secret in routes/social_connect.py:30"** — that line is `META_SCOPES`, a public OAuth
   permission-scope list. Actual secrets (META_APP_SECRET, GOOGLE_OAUTH_CLIENT_SECRET, MSG91_AUTHKEY)
   are read from env only.
7. **"Console statements in production"** — index.js deliberately no-ops console.log/debug/info in prod
   builds; lib/log.js is a dev-gated logger. This is the cleanup, not the violation.
8. **"Expensive operations in render (MiraStudio:114 etc.)"** — `.filter()` over ≤12-item static arrays;
   memoization would cost more than it saves.

## Legitimately fixed from past reports
- email_service report HTML builders → shared template helpers (part 77)
- registry `_registry_pii_fields` extraction (part 77)
- subscription_revenue + rzp_webhook decomposition, byte-identical output (part 83)
- 9 unused imports caught by make lint's first run (part 78)
- MiraStudio index-as-key on data rows → stable keys (phone/name for leads & staff,
  value-prefixed keys for AI string lists) (part 91)

## Deliberately DEFERRED (need a dedicated UI regression pass)
- Large component splits (AppLayout, POS, SuperAdmin, MorningBriefing, BookingChatWidget)
- Nested ternary cleanup (246+ instances)
- TypeScript migration / test type hints
- rzp_verify & public_signup_salon further splitting (security-critical linear flows)
