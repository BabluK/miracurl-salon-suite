# Miracurl CHANGELOG (append new session entries here; PRD.md >700 lines is frozen history)

## Session 2026-06 (fork) — Win-back improvements (option c: improve existing)
- User sends win-back WhatsApps manually via wa.me links; chose NOT to add auto-SMS or WA Business API.
- winback.py: _nudge_message() — warmer copy (name, exact days away, 15% gift, booking link, restaurant variant); _winback_wins() — guests with an invoice AFTER their first nudge (channels email/whatsapp/dashboard_contacted, 90d window) → wins list + wins_count + wins_revenue in GET /winback/nudges.
- WinbackNudges.jsx: green "came back" banner (winback-wins-banner) with per-guest chips, prominent labelled auto-toggle switch, card renders when wins exist even with 0 nudges, currency via tenant.currency.
- Tested: curl (copy + booking link), synthetic win seeded → wins_count=1/₹1250 verified in API + dashboard screenshot → synthetic data cleaned (customers/lead_outreach/invoices deleted).
- release_notes BUILD → 2026-09-01.159 (3 lines appended to today's entry).

## Session 2026-06 (fork) — Security audit + fixes (all applied, user approved "fix everything")
- Audit verdict: CONDITIONAL PASS. 1 MEDIUM (SEC-001 mass-signup abuse burning paid AI poster/email) + P3 hardening. No cross-tenant/auth/payment issues; all prior fixes verified intact.
- FIXES:
  1. security.py: public_rate_limit is now ASYNC = in-memory fast path + durable_rate_limit (Mongo, survives restarts). ALL ~87 call sites sed-updated to `await public_rate_limit(`. NOTE FOR FUTURE AGENTS: any new call site must be awaited.
  2. security.py: new global_daily_cap(kind, limit) — platform-wide (not per-IP) daily counter in rate_limits collection (_id "global:{kind}:{day}"). Signup capped at 50/day.
  3. auth.py: AI welcome poster deferred — signup sets tenant.welcome_poster_pending=True, welcome email goes out without poster; _deferred_welcome_poster(tid) fires on the owner's first admin login (flag cleared first, idempotent).
  4. subscriptions.py _record_partner_commission: skips self-referral (referrer==referred) and same-owner-email pairs.
- TESTED: 5x signup → 429 on 5th; restart → still 429 (durable). Global counter increments. Same-owner commission blocked / diff-owner earns (synthetic, cleaned). Public endpoints regression: brochure.pdf 200, feedback 404, plans 200.
- release_notes BUILD → 2026-09-01.160.
