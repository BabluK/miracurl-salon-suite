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

## Session 2026-06 (fork) — Code review response
- FALSE POSITIVES (verified, no change): security.py:149 "hardcoded secret" is the CSRF domain-separation prefix ("csrf-v1:" + jwt_secret() from env); "67 undefined vars" and "283 `is` literal comparisons" — ruff F821/F632 report ZERO (matches were the English word "is" in AI prompt strings).
- APPLIED: refactored routes/lead_gen.py `_score` (complexity 16 → rule table _SCORE_RULES + _apply_signal) and `_followup_email` (complexity 21 → _FOLLOWUP_PLAN_KEYS/_FOLLOWUP_PITCH lookups + _followup_price_line). Equivalence-tested: byte-identical outputs vs old logic across 6 score profiles and 5 followup leads (incl. empty plans + intl/domestic + both verticals).
- DECLINED with rationale (production stability; blanket refactors previously declined per PRD): remaining complexity-12/13 functions, long-function splits, test-file type hints, import-count reduction — behavior-neutral churn on a live app.

## Session 2026-06 (fork) — Newly-opened lead visibility
- User's 300 production leads had no 🆕 tags (researched before new_business detection existed).
- MiraLeadAgent.jsx: added filter chip { key: "newbiz", label: "🆕 Newly opened" } (card tag already existed via lead.signal).
- server.py: one-time startup migration "lead-newbiz-backfill" (marker in app_migrations _id=mira-leads-newbiz-backfill) rescores ALL mira_leads via _score → sets new_business/signal/score/breakdown. Idempotent; will run on production automatically at next deploy.
- Verified: preview backfill flagged 6/11 leads; chip filters correctly (screenshot). release_notes → .161.

## Session 2026-06 (fork) — New-Salon Alert
- lead_gen.py: _alert_new_salon_discoveries(run_id, city, noun) — after every _run_pipeline completes, emails all super_admin users a digest of new_business leads found in that run (name/address/rating/score table + HQ CTA). Wrapped in try/except so alert failure never fails the run.
- Tested with synthetic run (2 fake leads) — real email delivered via Resend to super@miracurl.com; synthetic leads cleaned.
- release_notes → .162.

## Session 2026-06 (fork) — Test staff root cause + invite delete
- ROOT CAUSE of "test staff still in Late arrivals email": seeds.py SEED_STAFF (Priya Sharma/Rahul Verma/Anjali Mehta/Karan Singh) seeded into the DEFAULT tenant (= user's REAL production salon miracurl-marathahalli) whenever staff count==0 at startup — purges could be undone by reseed, and the cleanup tool only matched names with test/dummy.
- FIXES: (1) seeds.py seed_data() now guarded by permanent app_migrations marker "demo-seed-done" — demo data seeds only on a brand-new install, never again. (2) data_cleanup.py _test_staff now also matches seed staff by email/phone/exact name+role pair; purge also deletes linked user logins. (3) lead_gen.py DELETE /super-admin/wa-invite/{iid} + ✕ button on Recently-invited chips (WaQuickInvite.jsx).
- Verified: scan flags exactly the 4 seed staff for Marathahalli (AECS Desk & Bablu untouched); marker present; wa-invite delete works via API + chips show ✕ (screenshot).
- USER ACTION AFTER DEPLOY: Super Admin → Tenants → Marathahalli card → 🧹 cleanup → confirm purge (production).
- PREVIEW CAUTION: do NOT purge preview Marathahalli staff — Priya Sharma's staff-portal login (priya.staff@miracurl.com) is a test credential.
- release_notes → .163.

## Session 2026-06 (fork) — Auto City Watch
- lead_gen.py: city_watches collection + routes GET/POST /super-admin/city-watch, PUT .../toggle, DELETE (max 10 watches, dupe check, city normalized like manual runs). run_due_city_watches(): max ONE auto-run/day, oldest-due first, skips if a run is active, target 10, marks run auto_watch=True, stamps last_run_at, fires _run_pipeline (which already sends New-Salon Alert emails).
- schedulers.py: _city_watch_scheduler (daily ≥10:00 IST, system_flags key city_watch_auto) + registered in server.py import/create_task.
- frontend: components/superadmin/CityWatchCard.jsx rendered in MiraLeadAgent below WaQuickInvite (add city/vertical/frequency, rows with next-run estimate, pause toggle, delete).
- Tested: add + dupe-409 via curl; run_due_city_watches started a real run (stopped immediately to save budget); last_run_at stamped; UI card + row verified via screenshot. Bangalore/salon watch left active in preview.
- Also: DummyCleanupModal helper text now names the demo staff. NOTE answered: user saw "0 test staff" on PRODUCTION (old build) — preview flags 4; needs deploy of ≥.163.
- release_notes → .164.

## Session 2026-06 (fork) — Monthly report AI suggestion + late-arrival diagnosis
- Monthly business report ALREADY existed (auto 1st @9AM IST via _monthly_report_scheduler + super-admin send button). Added the missing piece: _monthly_tip() in super_admin_ops.py (gpt-5.4-mini via Emergent key, _rule_based_month_tip fallback) + tip block in _monthly_report_html (email_service.py, _weekly_tip_block now takes a label param). Tested: send-monthly-report → sent to owner inboxes with suggestion.
- Late-arrival "real staff missing" diagnosis: code includes ALL active staff (preview: Bablu real staff has late_alert). In production email the real staff are BELOW the seed dummies (insertion order). Resolution = deploy + user purges dummy staff via 🧹.
- release_notes → .165. Deployment requested by user.
