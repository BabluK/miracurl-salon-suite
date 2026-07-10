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
9. **"localStorage: TrialReminder/BookingChatWidget/branch.js"** — dismissed-banner timestamps, an
   anonymous chat session id, and the tenant slug. None are secrets; auth remains HTTPOnly cookies.
10. **"Nested ternaries / 9-dep hooks / oversized components"** — style preferences on stable,
   tested components. Splitting AppLayout/SuperAdmin/POS/BookingChatWidget is deliberately deferred
   to a dedicated refactor pass with full regression (see ROADMAP) — not done piecemeal after
   every scanner run.

## Legitimately fixed from past reports
- email_service report HTML builders → shared template helpers (part 77)
- registry `_registry_pii_fields` extraction (part 77)
- subscription_revenue + rzp_webhook decomposition, byte-identical output (part 83)
- 9 unused imports caught by make lint's first run (part 78)
- MiraStudio index-as-key on data rows → stable keys (phone/name for leads & staff,
  value-prefixed keys for AI string lists) (part 91)
- mira_autopilot autopilot_scheduler 5-level nesting → extracted _run_enabled_tenants() (part 92)

## Deliberately DEFERRED (need a dedicated UI regression pass)
- Large component splits (AppLayout, POS, SuperAdmin, MorningBriefing, BookingChatWidget)
- Nested ternary cleanup (246+ instances)
- TypeScript migration / test type hints
- rzp_verify & public_signup_salon further splitting (security-critical linear flows)

## Scanner report — Jul 9, 2026 (verified item by item)
**Fixed:**
1. Circular import mira_autopilot ↔ mira_studio — module-level imports in mira_autopilot
   converted to function-level lazy imports (both edges now lazy; import test passes).
2. promo_video `_build_scenes` (complexity 18) → split into `_owner_photo_scene`,
   `_express_scenes`, `_ai_scenes` + thin composer.
3. mira_autopilot `_create_daily_post` (complexity 14) → split into `_ensure_today_post`
   + `_publish_post_live` + thin composer.

**Verified FALSE POSITIVES (do not "fix"):**
4. "Hardcoded secret social_connect.py:30" — that line is `GOOGLE_SCOPE =
   "https://www.googleapis.com/auth/business.manage"`, a public OAuth scope URL.
   All real credentials come from env (`_meta_creds` / `_google_creds`).
5. "34 possibly undefined variables" — pyflakes 3.4 across routes/, services/ and all
   top-level backend modules reports ZERO undefined names.
6. "Login.jsx stores auth tokens in localStorage" — it stores the *email only* for
   "Remember my email" (REMEMBER_KEY). Auth is HTTPOnly-cookie JWT. branch.js stores a
   branch display preference; MorningBriefing stores dismissed-banner flags. None are secrets.
7. "Missing hook dependencies: api, URLSearchParams, localStorage, encodeURIComponent…" —
   module imports and browser globals are stable identities and do NOT belong in dependency
   arrays (per React docs). Adding them is a no-op; the flagged names prove scanner noise.
8. "Empty catch blocks" — every flagged catch carries an intent comment
   (`/* private mode */`, `/* session already invalid */`, `/* non-admin */`, `/* noop */`)
   for expected, non-actionable failures (Safari private-mode localStorage, best-effort logout).

**Still deliberately deferred** (dedicated regression pass, see ROADMAP):
large component splits (SuperAdmin/AppLayout/StaffPortal/MorningBriefing), nested ternaries,
public_signup_salon & registry/receipt_email decomposition (security-critical linear flows).

## Scanner report — Jul 10, 2026 (recurrence #4 — same findings re-verified)
Re-ran pyflakes + AST module-level import-cycle analysis + secret regex scan:
- "Hardcoded secret social_connect.py:30" → line is `GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"`
  (public OAuth endpoint URL; name contains "TOKEN" → scanner noise). Creds remain env-only.
- "Circular chains autopilot→social→studio→autopilot and promo_video↔promo_image" → AST proof:
  module-level route deps are acyclic {promo_image→promo_video, promo_video→mira_studio,
  offer_flyer→promo_video, id_cards→registry, mira_calendar→(studio,social)}. All reverse
  edges are intentional function-level lazy imports. `import server` succeeds.
- "34 undefined variables" → pyflakes: ZERO undefined names.
- "tests use `is` instead of `==`" → all occurrences are `is True / is False` on JSON booleans
  (bool singletons — strict check is intentional and reliable). No int/str `is` comparisons.
- "id_cards.hq_id_card complexity 14" → function has 4 branches / ~25 lines; metric is wrong.
- Complexity items (_compose_flyer, _compose_poster, public_signup_salon, _run_pipeline,
  _totals_rows, text_agent) → stable + tested linear flows; stay on the deferred ROADMAP pass.
Decision: no code changes applied; nothing in this report is a deployable risk.
