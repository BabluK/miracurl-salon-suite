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

## Session 2026-06 (fork) — Staff email policy + deductions card + notice-period gate + report cleanup
- POLICY (user-defined): staff @miracurl.com IDs are placeholders (Resend suppresses them). Personal email used ONLY for: forgot-password (already handled by _staff_reset_recipient), first-time credentials, relieving letter. Routine staff emails REMOVED: late-nag email in staff_portal._run_late_alerts (kept late_alerts insert + owner digest) and _send_staff_late_digests call in eod_digests (function retained, uncalled).
- staff_portal.py: staff_notify_email(s) helper (personal first, rejects @miracurl.com) — used by relieving letter + transfer notice + fallback in staff_admin. NEW GET /staff/me/deductions (late fines from attendance.late_penalty, half-day from half_day_deduction, advances by month) → StaffPortal.jsx DeductionsCard (red card under salary, data-testid deductions-card/-total), respects month selector.
- staff_admin.py: relieving letter gate — letter_type excellent/standard + notice_period_days>0 requires body.notice_served=True else 400. PreviousStaffCard.jsx: 'Notice period fully served' checkbox for those types.
- super_admin_ops.py: _demo_staff_names() — monthly + weekly report by_staff excludes seed staff names (user's Aug report showed Priya/Rahul as stars; NOTE that email was my PREVIEW test send).
- Verified: helper unit checks, month stats exclude demo staff, staff portal screenshot (card shows late fine/half-day/advance + total, late toast still works). Test seeds cleaned.
- release_notes → .166. NOTE: deploy queued earlier was .165 — user must deploy again for these.

## Session 2026-06 (fork) — Week-off check-in block
- staff_portal.py check-in: hard 403 on week-off day (removed week_off_confirmed self-approval path; GeoIn field retained but ignored). /staff/me/late-status returns week_off:true and late:false on week-off day.
- StaffPortal.jsx: removed confirm flow + unused confirmAsync import; isWeekOffToday computed from profile.week_off_day; teal staff-weekoff-banner; check-in-btn disabled with 'Week off 🌴' label; late banner suppressed on week-off.
- Week-off day source = Staff section (StaffFormModal staff-week-off-select — already existed; StaffCard shows off:day badge). Staff can still request a change via week-off request flow (admin approves).
- Tested: API 403 with friendly message, late-status week_off:true, screenshot of banner + disabled button; Priya's week_off restored to monday.
- release_notes → .167.

## Session 2026-06 (fork) — Credentials email routing (final @miracurl.com sweep)
- Swept ALL _send_email call sites: only staff-facing sends remaining were _send_staff_welcome (give-login + reset-login) which emailed the @miracurl.com login itself. Now: personal_email preferred, @miracurl.com never emailed; if no personal email → {'sent': False, error: 'share credentials on screen / add personal email'} (creds are always shown in-app). Manager flows use owner-typed real emails (guard still applies).
- Verified: placeholder-only → blocked with friendly error. release_notes → .168.
- POLICY RECAP (user): @miracurl.com = system login IDs only, NEVER email them. Personal email = forgot-password, one-time credentials, relieving letter (relieving only with notice_served confirmation). Routine staff notices = staff dashboard only.

## Session 2026-06 (fork) — Filter empty-state + 90-day invite copier
- User's "No all salons." = filter INTERSECTION (Salons + 30-day trial both active; only trial30 tenant is a restaurant). Not a bug — UX fixed: SuperAdmin.jsx empty state (tenants-empty-state) now names the stacked filters + 'Clear all filters' button (clear-tenant-filters-btn).
- 🎁 copy-newbiz-link-btn in Tenants header copies `${origin}/signup-salon?offer=newbiz` — clipboard.writeText wrapped in try/catch with execCommand textarea fallback (NotAllowedError crashed dev overlay in permission-denied contexts).
- SignupSalon.jsx bottom stats strip shows "90 days" when newbiz (3 variants).
- Verified via screenshots: copy toast w/o error overlay, empty state + clear restores 4 rows. release_notes → .169.

## Session 2026-06 (fork) — Configurable trial + newly-opened self-serve + billing crash fixes
- subscriptions.py: get_trial_days() (platform_settings key trial_days, default 30, clamp 1-120) + PUT /super-admin/trial-days; /public/plans now includes trial_days int key.
- auth.py: signup trial = get_trial_days() for BOTH verticals; newly_opened bool + opening_date (ISO, past/future) in SalonSignupIn → is_newbiz (offer=newbiz OR newly_opened) → 90 days + tenant.signup_offer/new_business/opening_date. TRIAL_DAYS const now legacy.
- SignupSalon.jsx: trialDays from catalog; "Is your salon newly opened?" Yes/No cards in step 1; gold PartyPopper modal (newbiz-offer-modal) w/ opening-date-input + claim-newbiz-btn → 90-day badge/strips flip; payload sends newly_opened/opening_date.
- BillingPanel.jsx: trial-days-editor card in Plan Catalog (input+save w/ confirm). SuperAdmin.jsx 🌱 badge shows 📅 opening date.
- BUGS FIXED (pre-existing, exposed by plan-less subscription docs): list_subscriptions s["plan"] KeyError, _mrr_and_plan_distribution s["plan"] KeyError, BillingPanel toLocaleString on undefined price/value (3 spots). Orphan subscriptions (tenant deleted) purged from preview DB.
- Verified: PUT trial-days→public plans reflects; signup control=30d, newly_opened=90d+opening_date stored; signup UI modal flow screenshot; Billing panel renders w/ trial editor value 30. Probe tenants deleted.
- release_notes → .170. Needs deploy (production currently ≤.169 pipeline).

## Session 2026-06 (fork) — New-Biz Plan Email
- email_service.py: newbiz_plan_email_html(tenant, trial_end, plans) — gold gradient header, 90-day gift block w/ opening date, live plan table (₹/$ by plan currency).
- auth.py: _send_newbiz_plan_email(tenant, owner_email, trial_end) — pulls live PLAN_CATALOG (region/vertical keys same as _followup_email), fired via create_task in signup when is_newbiz.
- Tested: direct send to delivered@resend.dev succeeded (no warnings). release_notes → .171.

## Session 2026-06 (fork) — Invite tracker + assisted onboarding + modal fields
- Newbiz modal (SignupSalon.jsx) now collects: opening date + salon/restaurant name + booking URL slug (synced to main form; slug auto-suggests from name). Slug + assist inputs use inline white bg (global CSS painted inputs dark — inline style beats it; user reported black background twice).
- lead_gen.py: POST /public/newbiz-offer-visit (opens counter in offer_link_stats _id=newbiz, 1/session via sessionStorage), POST /public/newbiz-assist (assist_requests collection + instant HQ email to super admins, rate-limited 5/15min), GET /super-admin/newbiz-offer-stats (opens/signups=tenants signup_offer=newbiz/assists + recent list).
- SuperAdmin.jsx: emerald stats chip (newbiz-offer-stats testid) next to the 🎁 copy button.
- BUG CAUGHT: SignupSalon has NO `api` import (uses raw axios + BACKEND_URL) — my first attempt threw ReferenceError inside the ref/offer capture try-block. Fixed with axios. LESSON: check the file's http client before adding calls.
- Verified E2E in browser: open ping counts, assist submits + thanks message + HQ email, stats endpoint accurate. Test records cleaned, opens reset to 0.
- release_notes → .172.

## Session 2026-06 (fork) — Day-60 New-Biz follow-up
- schedulers.py: run_newbiz_followups() — tenants with signup_offer=newbiz, status=trial, ≥60 days since created_at, no newbiz_followup_sent_at → Mira check-in email (setup help + subscribe nudge, "subscribing early doesn't cut free days") to owner_email, stamps newbiz_followup_sent_at. _newbiz_followup_scheduler daily ≥11:00 IST (system_flags newbiz_followup_auto), registered in server.py.
- Tested: synthetic 61-day tenant → sent=1, re-run sent=0 (idempotent), flag stamped, cleaned. release_notes → .173.

## Session 2026-06 (fork) — Assist Request Queue
- lead_gen.py: GET /super-admin/assist-requests + PUT /super-admin/assist-requests/{id}/status (new|contacted|done).
- components/superadmin/AssistQueueCard.jsx — mounted in SuperAdmin Tenants tab under header (assist-queue-card): rows w/ 📞 tel: + 💬 wa.me (auto-set contacted), Done/Reopen, show-completed toggle, "N waiting" badge; hidden when no requests.
- Verified: API list/status via curl + full UI screenshot (row, call/wa/done buttons). Seed cleaned. release_notes → .174 (needs next deploy — .173 deploy was queued earlier).

## 2026-09-18 — Mira WhatsApp Receptionist (iter 173)
- NEW page `/receptionist` (nav "Mira Receptionist", AdminOnly). Components: `components/receptionist/{ReceptionistHero,ReceptionistSim,ReceptionistThreads}.jsx`.
- Backend `services/wa_receptionist.py`: tenant routing for inbound WA on the shared platform number — own phone_number_id → `#slug` in message → sticky `wa_sessions` (wa_id→tenant_id) → last outbound tenant (campaign replies) → WHATSAPP_DEFAULT_TENANT_SLUG. Human takeover (`human_until` 2h): Mira stays silent, inbound marked `human_queue`, bell notice `wa_human_msg`/`wa_handoff`.
- `services/whatsapp_mira.py` rewired to the resolver; `[HANDOFF]` from Mira now sets human mode + notifies owner.
- `routes/public_chat.py`: restaurants can now RESERVE via chat — resto prompt emits `[[BOOK]]` with `party_size`/`seating`, `_ai_execute_booking(payload, t)` accepts empty service_ids for restaurants; localized `reserve` confirmation (en/hi/kn).
- Endpoints (`/api/whatsapp-link/receptionist*`): GET status+stats+threads, GET qr.png, POST simulate {text,session} (exact pipeline, no Meta/credits, wa_id `999…` derived via sha1), DELETE simulate/{session}, GET threads/{wa_id}, POST threads/{wa_id}/reply (send_text, 1 credit, sets human mode), PUT threads/{wa_id}/human.
- `.env`: `WHATSAPP_PLATFORM_NUMBER=919180261256` (invite link `wa.me/<num>?text=Hi <name>! #<slug>`).
- Note: handoff only triggers inside business hours (existing OUTSIDE-HOURS rule) — out of hours Mira takes a request instead.
- Tests: `/app/backend/tests/test_iter173_wa_receptionist.py` (10 pass) + Playwright UI pass — `/app/test_reports/iteration_173.json`. BUILD 2026-09-18.279.
- Still BLOCKED: Meta phone OTP registration (+91 91802 61256) — user will say "send code"; MSG91_FLOW_ID not available yet.

## 2026-09-18 — Security audit + code-review fixes (pre-deploy)
- SEC-001 (HIGH, BOLA): receptionist threads/{wa_id} GET/human/reply now require `wa_receptionist.tenant_owns_thread` (session tenant == caller, or caller has messages with that wa_id) → 404 otherwise. Test `test_thread_bola_other_tenant_404`.
- SEC-002: staff reply deducts credit atomically (`wa_points >= 1` guard) and refunds on Meta failure. Simulate has `ai_daily_quota(wa_receptionist_sim, 150)`.
- Circular imports broken: `services/whatsapp_inbound.py` now owns handle_inbound_message/handle_status_update/process_webhook_payload (cloud ⇄ mira cycle gone); `rewards_settlements` imports from `services.rewards_core` directly.
- Complexity refactors (behaviour-preserving, curl-verified): customers.import_customers (→ _import_row_fields/_import_fill_existing/_import_new_customer), appointments_pos.list_invoices (→ _invoice_period_filter/_invoice_search_filter/_attach_customer_phones), hq_notifications._public_page_payload (→ _fields/_public_page_links), email_service.trial_ending_email_html (→ _trial_ending_vars), id_cards.team_id_card (→ _read_asset/_opt/_hq_card_data).
- False positives from the review tool (verified with ruff F821/F632: 0 findings): "92 undefined variables", "`is` literal comparisons", "security.py:232 hardcoded secret" (it's a comment; CSRF key derives from JWT_SECRET env).
- Deferred (too risky pre-deploy, no behaviour value): splitting lead_gen.py / hair_colors.py / auth.py by import count.
- Sender label in /whatsapp-link/status now derives from WHATSAPP_PLATFORM_NUMBER. WA number +91 91802 61256 DEREGISTERED from Cloud API on user request (kept for WhatsApp Business app / lead gen); new SIM pending for Mira.
- Pre-existing test-infra failures (not regressions): test_iter140 expects PNG for table QR (endpoint serves JPEG since a later iteration); test_invoice_edits imports `_PW_ADMIN` removed from tests/_creds.py.

## 2026-09-18 — Bring-your-own WhatsApp (Meta Coexistence) — iter 175
- `services/wa_coexist.py` + `routes/wa_coexist.py` (`/api/whatsapp-own/status|connect|disconnect|refresh`, `/hq/webhook-fields`). Tenant doc: `own_whatsapp{status,waba_id,phone_number_id,display_phone_number,verified_name,token_enc(Fernet from JWT_SECRET),syncs,templates}`, plus `whatsapp_phone_number_id` (existing inbound routing hook) and `features.whatsapp=true`.
- `whatsapp_cloud.channel_for(tenant_id)` → own phone/token when connected else platform; used by send_text/send_template/whatsapp_official.send. Own-number sends never deduct wa_points (Meta bills tenant). Mira auto-reply skips credit reserve for own-number tenants.
- Inbound: `smb_message_echoes` mirrored as outbound `sent_by:"app"` + sets human mode 2h; `history`/`smb_app_state_sync`/`account_update` archived in whatsapp_events. Meta app subscription now: messages,account_update,history,smb_app_state_sync,smb_message_echoes (callback → production).
- Templates: on connect, background clone of our APPROVED `miracurl_*` templates to the tenant WABA (status shown in card; Refresh re-syncs).
- Frontend: `components/settings/OwnWhatsAppCard.jsx` (FB JS SDK lazy-load, FB.login config_id + featureType whatsapp_business_app_onboarding, sessionInfoVersion 3, posts code+waba_id+phone_number_id). Disabled with HQ note until `META_LOGIN_CONFIG_ID` is set in backend/.env (NO Graph API exists to create it — must be done in App Dashboard → Facebook Login for Business → Configurations).
- Receptionist invite link uses the tenant's own number (no #slug) when connected.
- Tests: tests/test_iter175_wa_coexist.py (4) + mocked-Graph e2e script verified connect→route→reply(0 credits)→echo→disconnect. BUILD 2026-09-18.280.
- TODO when user provides config id: set META_LOGIN_CONFIG_ID, restart, test with a real WhatsApp Business app number (must be on app v2.24.17+).

## 2026-09-18 — Mira number switch, coexistence enabled, tap-to-pick slots, Meta App Review (iter 175b)
- NEW platform number **+91 91803 79552** (phone id 1418273554691693) VERIFIED+REGISTERED (PIN in .env), profile set. `.env`: WHATSAPP_PHONE_NUMBER_ID=1418273554691693, WHATSAPP_PLATFORM_NUMBER=919180379552. Old 91802 61256 deregistered (DISCONNECTED, still listed in WABA — user must delete in WA Manager if the Business app refuses); it stays the HQ/lead-gen number.
- `META_LOGIN_CONFIG_ID=1568586817925807` set → Settings "Connect my WhatsApp Business number" is live (FB SDK preloaded on mount so FB.login runs synchronously in click → no popup blocking). App domains: miracurl-suite.com + preview; privacy/terms URLs, app icon (public/assets/brand/meta-app-icon-1024.png) set. App still needs PUBLISH (Live) — user doing it. Standard access only → own-business numbers only until App Review approves Advanced access (submission prepared: descriptions, data handling, processors; screencast at frontend/public/review/miracurl-app-review.mp4, generated by /tmp/record_meta_video.py with Playwright video + imageio-ffmpeg).
- Tap-to-pick slots: `_WA_ADDENDUM` appended to Mira prompt for `wa-*` sessions → `[[SLOTS]]{"date"}` / `[[CONFIRM]]` markers; `wa_receptionist.split_ui_markers` + `deliver_reply` send WhatsApp interactive list (≤30 slots) / reply buttons (✅ Confirm, ✏️ Change time) via `whatsapp_cloud.send_interactive`; falls back to text. Simulator returns `slots`, `slots_date`, `buttons`; ReceptionistSim renders tappable chips (data-testid sim-tap-option). Verified e2e via simulator (list → 11:30 → buttons → Confirm → booked).
- Test data cleaned (Kavya/Meera bookings).
- 2026-09-18 (later): Receptionist page redesigned to user mockup (hero w/ Mira 3D avatar /assets/mira/mira-receptionist.png + capability chips, dark-green live band with link/Copy/Try/QR/Active toggle, QR card + "How it works" 4 steps, stat tiles w/ sparkline, brand footer). Status endpoint adds own_number/display_number. Login page compacted to fit one screen (card sticky, badge visible).

## 2026-09-18 — Landing+Login page, Google login, Email-OTP fallback (iter 175/176)
- Login page = landing: `components/LandingBits.jsx` (LandingNav w/ Features·Industries(/who-can-use)·Pricing·Success Stories·Support(/contact-us), Get Started→/signup-salon, WhatsApp demo btn → wa.me/919180261256; LandingFooter w/ About/Features/Pricing/Success Stories/Contact + IG/LinkedIn/YouTube/FB/WA icons; WhatsAppFloat; GoogleButton; SparkleLogo using /assets/brand/ms-logo-dark.png with CSS sparkle `.ms-logo-sparkle` in index.css). Explore CTAs in LoginShowcase panels. FB https://www.facebook.com/profile.php?id=61593610030812, IG https://www.instagram.com/miracurl.ai/ (LinkedIn/YouTube URLs are placeholders — confirm with user).
- Google login (Emergent-managed): `POST /api/auth/google/session` (auth.py) exchanges session_id → matches EXISTING users by email only (no auto-create; 403 otherwise) → `_issue_session`. Frontend: `components/GoogleAuthCallback.jsx` (startGoogleLogin → auth.emergentagent.com redirect=/dashboard; callback parses #session_id, App.js TenantKeyedRoutes renders it; AuthContext.googleLogin + skips /auth/me when hash has session_id). /app/auth_testing.md documents flow.
- Email OTP fallback: `POST /api/auth/otp/request` (always 200, 6-digit code hashed w/ bcrypt in `login_otps`, 10-min expiry, rate limits ip 10/10m + email 4/10m, sent via Resend from "Miracurl Security") and `POST /api/auth/otp/verify` (5 attempts, single-use) → session. UI `components/EmailOtpLogin.jsx` appears under the "Invalid email or password" error. database.py: added `login_otps`.
- Tests: iteration_175.json (landing links, Google endpoint, login regression) all pass; OTP verified by curl (planted code → session → /auth/me OK, reuse rejected).
- Coexistence connect for 8217072523: needs the user's Facebook login — instructions given; not yet done.
- 2026-09-18 Passkeys: ROOT CAUSE FIX — routes/passkeys.py `_rp()` used Origin/host which the ingress rewrites to the internal cluster host (hair-hub-system.cluster-2…emergentcf.cloud) → browser SecurityError "RP ID not a registrable domain suffix", so fingerprint/Face ID never enrolled (and Login.jsx marked pk_declined forever). Now prefers X-Forwarded-Host, then Referer/Origin. Login.jsx only sets pk_declined on NotAllowedError. New `components/PasskeyNudge.jsx` (mounted in AppLayout) shows once after OTP/Google login (sessionStorage pk_nudge) → "Enable now" registers passkey. Verified with Chrome virtual authenticator (CDP WebAuthn): nudge → enrol → logout → "Login with Fingerprint / Face ID" → dashboard.
