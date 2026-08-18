# Miracurl — Change Log (fork sessions)

## Update — Jul 2, 2026 (fork session)
- Fixed desktop layout: removed black frame around pages (padding/negative-margin mismatch), added warm luxe gradient canvas (`.app-canvas` in index.css) across all 11 admin pages, restyled header (gold accents, date chip, deduped salon name subtitle in AppLayout.jsx).
- Dual PWA apps from one codebase via ManifestSwitcher.jsx (route-based manifest swap):
  - /book/* → "M" client booking app (manifest.json, id miracurl-booking, scope /book/)
  - everything else → "Miracurl" admin/staff app (manifest-admin.json, id miracurl-admin, start_url /login, gold icons icon-admin-*.png)
- Bumped SW cache to miracurl-v5; Android users now see Android-specific install instructions (was showing iPhone steps).
- User must click Deploy for these to reach production (miracurlunisexsaloon.com).

### Pending/backlog (unchanged)
- P1: Email + SMS receipts (blocked: needs SendGrid/Twilio keys)
- P1: Daily WhatsApp pulse summary (needs Twilio)
- P2: More notification chimes + Do-not-disturb toggle
- Refactor: split monolithic backend/server.py (~3500 lines) into routers/models/services

## Update — Jul 2, 2026 (part 2)
- Removed duplicate location text from admin top bar (kept in sidebar only).
- Animated mesh gradient backgrounds: `.app-canvas` (light, admin pages) + `.mesh-dark` (booking pages), 26-30s drift, respects prefers-reduced-motion.
- Global micro-interactions (MicroInteractions.jsx): magnetic hover pull (max 5px, 20px sticky radius, fine pointers only) + centered material ripple with 98% press squeeze on all buttons/links.
- Salon Finder at /book (SalonFinder.jsx): public salon search → white-label morph on selection. New endpoint GET /api/public/salons?q= (excludes suspended/cancelled tenants).
- BookPublic now shows tenant name (white-label) + "Find a salon" link top-right.
- Testing agent iteration_34: 100% pass (14 regression items, frontend+backend). Fixed Recharts minHeight warnings.

## Update — Jul 2, 2026 (part 3)
- Added user's Makeup & Nails price menu (9 services): Party ₹1200 / Normal ₹700 / Bridal ₹2000 / Saree Draping ₹500 / Hair Styling ₹800 / Henna ₹200 / Gel Polish ₹500 / Gel Extension ₹1000 / Acrylic Extension ₹1500 — each with an AI-generated image.
- New endpoint POST /api/services/import-preset (upserts preset by name, tenant-scoped) + "Import Makeup & Nails menu" button on admin Services page — lets user replicate the menu on PRODUCTION with one click after deploy.
- Verified: 18 service cards render with image+price on public booking page (preview).

## Update — Jul 2, 2026 (part 4)
- Renamed & recolored the two PWAs per user choice: booking app = "Miracurl Book" (violet/purple, new violet icons), business app = "Miracurl Partner" (deep emerald + gold icons). ManifestSwitcher also swaps apple-touch-icon per route.
- InstallAppPrompt rewritten: auto-shows after 4s on ALL mobile devices (iOS + Android) on Landing (/), Salon Finder (/book) and booking pages; "Not now" now snoozes for 3 days instead of forever; device-aware install guide. Mounted on Landing.jsx (was missing → root domain never prompted).
- SW cache bumped to v6. Sidebar mobile nav re-verified working (user report was stale production bundle; preview tests pass: open via hamburger, auto-close on tab change).

## Update — Jul 2, 2026 (part 5)
- Booking page restructured like reference app: horizontal main-category tab pills (All · Skin · Manicure · Pedicure · Men Hair · Women Hair · Makeup · Nails) with sticky tab bar; tapping a pill filters services (BookPublic.steps.jsx, CATEGORY_ORDER).
- Added full Manicure menu (8 sub-services: Basic ₹400, Aroma Magic ₹500, Rose Bud ₹500, Ragga ₹600, O3+ ₹700, Foiling & Polish ₹100, Cut & File ₹100, Ozone ₹600) and Pedicure menu (8: Basic ₹500, Aroma Magic ₹800, Rose Bud ₹700, Ragga ₹800, Pediologix O3+ ₹1000, Foiling & Polish ₹100, Cut & Foil ₹100, Ozone ₹900) with generated images.
- import-preset endpoint now also remaps legacy categories (Hair→Men/Women Hair, Threading→Skin, Manicure/Pedicure Spa moved) and fixes broken legacy images. User must click "Import Makeup & Nails menu" once in production after deploy.
- Verified: 7 category tabs, 34 services, all 18 unique image URLs return 200.

## Update — Jul 2, 2026 (part 6)
- Image upload UX: uploading from laptop/phone now AUTO-SAVES immediately when editing an existing service/staff/product (onUploaded prop wired in Services/Staff/Inventory); raw /api/files URL box hidden behind "or paste a URL" toggle in ImageUploader.jsx. (For new records, image saves with the Create button.)
- Services Import/Export in CSV (Excel/Sheets compatible): GET /api/services/export downloads services.csv; POST /api/services/import upserts by name (columns: name, category, price + optional duration_min, description, image_url, trending, active). Non-CSV rejected with helpful message. Buttons: import-csv-btn / export-csv-btn on Services page.
- Verified: export 34 rows, import round-trip 34 updated, bad-file rejection, UI buttons + uploader render. Fixed a stray JSX compile error in ImageUploader.

## Update — Jul 2, 2026 (part 7)
- CSV Import/Export added for Customers (GET/POST /api/customers/export|import, upsert by phone; cols: name, phone + optional email/gender/dob/address/notes; export includes loyalty/spend/visits) and Products (upsert by sku or name; cols: name, category, price, stock + optional brand/sku/cost/low_stock_threshold/image_url). Buttons on Customers & Inventory pages. NOTE: /customers/export route MUST stay registered before /customers/{cid}.
- Female/Male toggle on booking page ServicesStep (GENDER_CATS): Female → Skin/Manicure/Pedicure/Women Hair/Makeup/Nails; Male → Skin/Manicure/Pedicure/Men Hair/Nails.
- Booking QR poster generator: GET /api/settings/qr-poster?origin= (qrcode + PIL, dark/gold A4 poster with salon name, QR to /book/{slug}, install CTA). "Download poster" button in Settings (settings-qr-card). Added qrcode to requirements.txt.
- All verified: CSV round-trips via curl, poster PNG visually checked, gender toggle screenshot-tested.
- LESSON: avoid multiple parallel search_replace edits to the SAME file — two batches silently clobbered each other (server.py customers routes + BookPublic.steps.jsx), causing compile errors that were then fixed.

## Update — Jul 2, 2026 (part 8)
- User confusion: booking (Ankit) appeared in CRM but "not in Appointments" — root cause: Appointments page only showed ONE day (default today); the booking was on a future date. NOT a data bug (verified: booking flow creates both customer + appointment).
- Fix: Appointments page now has Day | Upcoming | Week views. New backend param GET /api/appointments?upcoming=true (scheduled_at >= today, excludes cancelled). Upcoming table rows show the date; empty day view shows "See all upcoming" shortcut (see-upcoming-btn).
- Verified via screenshot: day view 1 row, upcoming view 5 rows with dates.

## Update — Jul 2, 2026 (part 9) — SECURITY AUDIT FIXES
- Ran security_audit_agent. Verified-secure: cross-tenant isolation, JWT signing, Razorpay payment+webhook HMAC, password hashing, NoSQL-injection protection.
- SEC-001 (HIGH) FIXED: staff could read owner-only revenue/commission, export customers, and edit own salary. Changed get_current_user→require_admin on: PUT /staff/{sid}, GET /customers, /customers/export, /customers/import, /services/export|import, /products/export|import, /reports/dashboard|daily|sales|staff-commission. Verified: staff→403, admin→200, staff salary edit→403.
- SEC-002 (HIGH) FIXED: affiliate reward now recorded as PENDING at signup (no instant credit); ₹1000 credited to referrer only when referred salon completes Razorpay payment (in /billing/razorpay/verify). Prevents trial-signup farming.
- SEC-003 (MED) FIXED: _csv_cell() prefixes =,+,-,@,tab,CR with apostrophe on all CSV exports. Verified.
- SEC-004 (MED) FIXED: _read_csv_upload() caps imports at 5MB (413). All 3 imports use it.
- P3 hardening noted (not fixed): token in localStorage, IP-based login throttle, public /api/files by UUID.
- Also fixed: booking DetailsStep input icon overlapping placeholder (.input-luxe used `padding` shorthand overriding pl-10; split into individual props + .input-luxe.pl-10 rule).
- Prachi report: she has NO appointment record (only a customer) — either added via Add Customer or a walk-in; unlike Ankit she was not booked with a date. Not a bug.

## Update — Jul 2, 2026 (part 10) — CRM lifecycle + booking confirm notify + gender
- CRM now shows ONLY customers who completed a service (or manually added). Public bookings create customer with crm_status="pending" (hidden from GET /customers). Startup migration crm_pending_migration_v1 hid 5 existing zero-visit leads (idempotent via meta collection).
- PUT /appointments/{aid}/status enhanced: "confirmed" → returns whatsapp_url (wa.me prefilled confirmation msg with salon name/date/services/total; 10-digit phones prefixed 91); "completed" → upserts customer into CRM ($inc visits & total_spent, $set last_visited, gender, crm_status=active). Appointment now stores customer_phone + gender.
- Appointments UI: new Confirm button (BadgeCheck, shown when status=scheduled, data-testid confirm-appt-{id}) → opens WhatsApp; complete toast says "customer added to CRM".
- Booking form: Gender pills (Female/Male/Other, default Female) on details step (book-detail-gender-*), sent as `gender` in POST /public/book.
- E2E verified via curl: book(gender)→not in CRM→confirm(wa.me url)→complete→CRM row w/ gender/visits/spent/last_visited. UI verified via screenshots.

## Update — Jul 2, 2026 (part 11)
- Appointments list: unapproved (status=scheduled) bookings pinned to TOP sorted by created_at desc (displayList useMemo in Appointments.jsx) with amber blinking row highlight (.appt-attention keyframes in index.css, reduced-motion safe) until confirmed/completed. Verified via screenshot.

## Update — Jul 2, 2026 (part 12)
- QR poster production failure root-caused: _build_qr_poster used hardcoded system font paths (/usr/share/fonts/...) that don't exist in the production image → 500 → "Couldn't download". Fix: bundled FreeSerifBold.ttf + FreeSansBold.ttf into /app/backend/fonts/ (deploys with code); _load_font() tries bundled → system → PIL default.
- Settings QR card now shows an INLINE poster preview (qr-poster-preview, auto-loads on page open) alongside Download; download reuses the preview blob. Verified: preview renders + download works in preview env.

## Update — Jul 2, 2026 (part 13) — Full regression + AI Assistant & Feedback Board
- Full regression (testing_agent iteration_35): 100% PASS — 32/32 backend, all frontend flows. Fixed found edge case: double "completed" no longer double-counts CRM visits (crm_counted flag on appointment).
- AI Assistant "Mira" (admin-only page /assistant, nav-assistant): streams via POST /api/assistant/chat (emergentintegrations LlmChat, openai gpt-5.4, EMERGENT_LLM_KEY in backend/.env), multi-turn per session_id (in-memory LlmChat cache keyed tenant+session, max 200), system prompt injected with live salon stats (_salon_context: today's appts, pending approvals, CRM count, month revenue, low stock). History persisted in _raw_db.assistant_messages (tenant_id scoped) + GET /api/assistant/history. Frontend streams via fetch reader (token from getAccessToken(), NOT localStorage).
- Feedback Board (same page, tab 2): POST/GET /api/feedback (any logged-in), PUT/DELETE admin-only (status open/planned/done, priority). Added `feedback` to _DB TenantCollection whitelist (REMEMBER: new collections must be whitelisted in _DB class ~line 108).
- Verified: multi-turn memory via curl ("What is my name?" → "Ravi"), live stats answer, feedback CRUD, UI tabs render.
- KNOWN BLOCKER: Emergent Universal Key budget exhausted ("Budget exceeded, max 0.001") → Mira replies with snag message. User must top up: Profile → Universal Key → Add Balance.

## Update — Jul 2, 2026 (part 14) — Gallery wired + AI Beauty Advisor + Customer↔Owner Chat
- Gallery & AI Promo Generator COMPLETED: /gallery route + nav-gallery sidebar link wired (App.js, AppLayout.jsx). POST /api/gallery/generate verified working end-to-end (gpt-image-1 via Universal Key, image stored to object storage + gallery collection). Upload/list/delete tested (iter36 pytest).
- NEW: Public AI Beauty Advisor on booking page — floating "Ask Mira" widget (BookingChatWidget.jsx) on /book/{slug}. POST /api/public/ai-chat/{slug} (gpt-5.4, session cache _public_ai_sessions, rate-limit 40/10min). System prompt injects live SERVICE MENU (ids+₹+duration) + stylists + IST datetime. Recommends facials/products by skin tone/type AND BOOKS APPOINTMENTS: AI emits [[BOOK]]{json} marker after customer confirms → _ai_execute_booking() parses, validates via PublicBookingIn, reuses _resolve_staff/_resolve_or_create_customer/_create_public_appointment. Verified E2E via curl: real appointment created (Classic Facial, booking object returned).
- NEW: Customer↔Salon Owner chat — customer identifies with name+phone (no password; localStorage salon_chat_{slug}). Public: POST /public/chat/{slug}/start, POST .../{thread_id}/send, GET .../{thread_id} (poll 8s, resets unread_customer). Admin: GET /owner-chats, GET /owner-chats/unread-count, GET/POST /owner-chats/{tid}/messages|reply. New collections chat_threads + chat_messages ADDED TO _DB WHITELIST (line ~111) — tenant-isolated (verified).
- Admin "Messages" page (/messages, Messages.jsx, nav-messages) — thread list w/ unread pills, conversation pane, reply, 8-15s polling. Sidebar nav badge (nav-messages-unread) polls unread-count every 30s in AppLayout.
- SW cache bumped to v7. Testing: iteration_36.json — 12/12 backend pytest + 9/9 frontend flows PASS. LLM key budget was topped up (previous blocker resolved).
- Backlog: Email+SMS receipts (awaiting SendGrid/Twilio keys), Daily WhatsApp Pulse (Twilio), extra notification chimes + DND toggle, server.py refactor into routers (~4390 lines), optional Recharts width warnings fix.

## Update — Jul 2, 2026 (part 15) — Mira memory bug fix (production report)
- User reported (production): Mira re-asked for the service after customer already picked services + gave name/phone/time. ROOT CAUSE: LlmChat sessions were in-memory (_public_ai_sessions dict) — production runs multiple workers/restarts → follow-up hits a worker with no session → fresh chat, context lost.
- FIX: removed in-memory cache; conversation history now persisted in _raw_db.public_ai_messages (keyed sid=pub-{tenant}-{session}); each request rebuilds a fresh LlmChat and prepends last 24 messages as transcript ("CONVERSATION SO FAR... do NOT re-ask"). Added CRITICAL MEMORY RULE to system prompt. Booking replies stored with "[Appointment booked]" tag.
- VERIFIED: full Kamal scenario via curl incl. backend restart mid-conversation — Mira remembered service+name+phone+time and booked after "confirm". USER MUST REDEPLOY to get fix in production.

## Update — Jul 2, 2026 (part 16) — Service category dropdown fix + custom categories
- Services.jsx CATS was stale ("Hair, Threading, Massage…") and didn't match booking page tabs. Now matches BookPublic.steps.jsx CATEGORY_ORDER exactly (Skin, Manicure, Pedicure, Men Hair, Women Hair, Makeup, Nails) + dedupe of any existing custom categories + "＋ Add new category…" option that swaps to a free-text input (service-category-select / service-new-category-input). Empty category guarded in save().
- Custom categories automatically appear as tabs on the booking page (ServicesStep already appends non-canonical categories for both genders). Verified E2E: created "Spa" service via API → appeared in /public/services → cleaned up. UI screenshot-verified.
- NOTE: user must REDEPLOY for production.

## Update — Jul 2, 2026 (part 17) — 6 growth features + iOS PWA fix (iteration_37: 100% pass)
- LOYALTY: earn 5pts/₹100 (LOYALTY_EARN_PER_100), 1pt=₹1 redeem at POS (redeem_points in InvoiceIn, pos-redeem-points-input).
- PACKAGES (prepaid bundles) & MEMBERSHIPS (% discount cards): CRUD /api/packages /api/memberships; sold via POS tabs (now live); customer_packages/customer_memberships records auto-created on invoice; package_redeem line type (₹0, decrements sessions_left); membership auto-discount on services at invoice. GET /customers/{cid}/benefits powers POS benefits panel.
- COUPONS: CRUD /api/coupons (code/percent|flat/expiry/max_uses); /public/coupon-check/{slug}/{code}; applied on booking page (book-coupon-input, stored on appointment + $inc used_count) AND at POS (coupon_code in InvoiceIn). Admin UI: new "Offers & Plans" page /plans (Plans.jsx, nav-plans, 3 tabs).
- SLOT CAPACITY: _ensure_slot_capacity in _create_public_appointment (public + AI bookings, 409 when busy>=active staff); GET /public/availability/{slug}?date= feeds DateTimeStep (full slots disabled/struck).
- VOICE MIRA: POST /public/ai-voice/{slug} (multipart audio+session_id) — whisper-1 STT → shared _public_ai_reply → tts-1 'coral' TTS base64. Mic button in widget (MediaRecorder webm). Greeting flow: asks name → "Welcome to Mira chat bot, [Name]! Thank you for choosing {salon}. How may I help you today?". Offers rule: lists CURRENT OFFERS/PACKAGES/MEMBERSHIPS from catalog; if none → polite sorry+promise message. UPSELL rule: one add-on suggestion before booking confirmation.
- iOS PWA FIX: index.html had hardcoded manifest-admin.json — iOS snapshots manifest at parse and ignores JS swap (Android re-reads → worked). Now an inline <script> document.writes correct manifest/apple-touch-icon/apple-title at parse time based on pathname (/book→Miracurl Book). Verified both routes. USER MUST REDEPLOY.
- Invoice totals order: line disc → membership (services only) → coupon → referral credit → points → tax. sw.js v8. Test data cleaned post-testing. iteration_37.json: backend 6/6 + frontend 9/9 PASS.
- User explicitly DROPPED: Email/SMS receipts, WhatsApp Pulse, notification chimes/DND. Backlog: server.py refactor (4787 lines).

## Update — Jul 2, 2026 (part 18) — Code review fixes applied
- Verified report claims with real tooling: pyflakes found ZERO undefined Python vars (report's "13" were false positives; only unused Header import — removed). ESLint exhaustive-deps found only 2 REAL hook issues (both POS.jsx catalog conditional — fixed by wrapping catalog in useMemo); the "93 instances" were intentional mount-only effects.
- Fixed: array-index keys (ReferEarn step key, Assistant + BookingChatWidget messages now carry crypto.randomUUID ids via mkMsg helper), empty catch in SignupSalon (now logs), nested ternary in POS heading (extracted). Added /app/frontend/eslint.config.js (react-hooks rules) for ongoing lint.
- DEFERRED (with reasons, reported to user): localStorage auth token → httpOnly cookies = full auth architecture rework (backend sessions + CORS credentials + retest all flows) — needs explicit user approval; component splitting/complexity refactors of tested working code (user previously declined server.py refactor); Python type hints (cosmetic). ESLint passes clean; smoke test OK (widget greeting, POS tabs).

## Update — Jul 2, 2026 (part 19) — Staff login fix + Mira quick-prompts + AI speed
- STAFF LOGIN BUG (production report) ROOT CAUSE: the staff record's `email` field was out of sync with the linked user's actual login email (staff had priya@miracurl.com but login user was priya.staff@miracurl.com), and there was NO way to reset a lost temp password. FIX: added POST /staff/{sid}/reset-login (regenerates temp pw, forces must_change, re-syncs staff.email to the USER's real login email so the owner always shares the correct address). Frontend Staff page now shows "Reset password" (amber) for staff who already have a login (data-testid reset-login-{id}). Verified: reset → login with returned email+pw works.
- MIRA QUICK PROMPTS: added 5 tappable suggestion chips (men's haircut, women hair colour, Botox/Keratin, mani+pedi, facial) shown before first user message (data-testid ai-quick-prompt). Updated greeting to mention booking + advice.
- AI SPEED: parallelized _booking_catalog's 5 DB queries via asyncio.gather (was sequential). AI reply now ~1.9s in preview. Added `import asyncio`.
- PERF NOTE: all backend endpoints measured 0.12–0.2s in preview (dashboard/appointments/customers/services/invoices). Any production slowness is likely infra/cold-start or first-load bundle, not code — asked user to specify page.
- USER MUST REDEPLOY for all above to reach production.

## Update — Jul 2, 2026 (part 20) — Mira slot-check before confirm + hands-free voice + HD voice
- BOOKING SLOT FIX (user report: Mira said "confirmed" then failed with slot-full): (1) _booking_catalog now injects OPEN TIME SLOTS for next 3 days (via new _free_slots_for helper, asyncio.gather) so Mira only offers free times; (2) on booking failure the model's premature "confirmed" text is DISCARDED and replaced with an apology + list of actually-free slots for the requested date ("Which one shall I book?"). _ai_execute_booking now returns (booking, error, req_date). Verified E2E: filled 11:00 with 4 appts → Mira apologized + offered open slots → rebooked at 11:30 successfully.
- HANDS-FREE VOICE (AUTO button, data-testid ai-handsfree-btn): Web Audio AnalyserNode VAD — auto-stops 1.4s after speech pause and sends; 30s max with NO speech → "Sorry, I didn't catch anything 🙉" message + hands-free off; after Mira's spoken reply ends, mic auto-resumes (stops after successful booking). Manual mic unchanged (ai-voice-btn now wraps onClick to avoid event-as-arg bug).
- VOICE QUALITY: tts-1-hd + 'shimmer' voice + speed 0.95 (was tts-1 coral). NOTE: OpenAI TTS has NO Indian-accent voice (checked SDK: only alloy/ash/coral/echo/fable/nova/onyx/sage/shimmer). True Indian voice requires ElevenLabs (needs user API key) — offered to user, awaiting decision.
- Voice E2E verified: STT + greeting + HD audio ~9.6s round trip. Test data cleaned.

## Update — Jul 2, 2026 (part 21) — WhatsApp confirmations + Stylist-level slots
- USER DECLINED booking deposits (#6) — booking stays free, no payment.
- WHATSAPP CONFIRMATIONS: (1) booking success screen now has "Get confirmation on WhatsApp" green button (book-whatsapp-confirm-btn) — wa.me share with full booking summary; (2) Appointments table: green WhatsApp reminder button (remind-appt-{id}) for scheduled/confirmed rows — opens wa.me/<customer phone> with prefilled reminder (services, date/time, stylist, total). No API keys needed (wa.me links).
- STYLIST-LEVEL SLOTS: _resolve_staff(staff_id, scheduled_at, duration) — chosen stylist must be free (409 "Priya is already booked at that time…"); "Any stylist" auto-assigns a stylist who is actually free (verified: Priya busy at 15:00 → auto-assigned Rahul). New _staff_busy helper. /public/availability accepts optional staff_id (capacity=1 for specific stylist). BookPublic refetches availability when stylist changes (staffId in deps). Verified E2E via curl.
- sw.js v9. Test data cleaned. USER MUST REDEPLOY.

## Update — Jul 2, 2026 (part 22) — Staff Performance dashboard section
- New GET /api/reports/staff-performance: revenue/bills/services per stylist for today | week (Mon-) | month | last_month (IST boundaries). Attribution: per-item staff_id → fallback invoice staff_id → "Unassigned". Single invoices fetch since last-month start, computed in Python, gathered with staff names.
- Dashboard: new <StaffPerformance> card (staff-performance-card) below charts — 4 period tabs (perf-tab-today/week/month/last_month), ranked rows with 🏆 for #1, revenue bars, bills+services counts. Verified via curl + screenshot (Rahul ₹5400, Priya ₹5150 this week; "Unassigned" = old invoices billed without stylist selection).
- USER MUST REDEPLOY.

## Update — Jul 2, 2026 (part 23) — Manager Role + WhatsApp Approval Workflow (iteration_39: 100% pass)
- NEW ROLE `manager` (seeded: manager@miracurl.com / Manager@Miracurl123, tenant Miracurl Marathahalli, /app/scripts/seed_manager.py). Access: Dashboard, Appointments, CRM, Services, POS/Billing, Reviews ONLY.
- FRONTEND RBAC: App.js OwnerOnly wrapper (staff→/staff-portal, manager→/dashboard) on /staff /attendance /inventory /refer /reports /messages /gallery /assistant /plans /settings. NAV_MANAGER trimmed to 6 items. All 10 restricted deep-links verified redirecting.
- BACKEND RBAC: require_admin now allows manager (operational endpoints); moved to strict require_tenant_admin: reports/daily, reports/sales, reports/staff-commission, assistant chat+history, staff update/delete, products import/export/delete, packages/memberships/coupons CRUD, gallery delete. Verified 403s via curl.
- WA APPROVAL WORKFLOW: managers never open wa.me directly. (1) Confirming an appointment as manager → backend creates whatsapp_requests doc (tenant-scoped via TenantCollection) and returns wa_request_created=true, whatsapp_url=null. (2) Reminder/review buttons in Appointments.jsx call requestWA() → POST /api/whatsapp-requests. (3) Admin Dashboard shows WhatsAppApprovals widget (wa-approvals-widget, polls 30s) with Approve & Send (opens returned wa_url) / Reject. Verified E2E both roles.
- CONSOLE 403 CLEANUP: Dashboard.jsx gates reminders/subscription/DailyReportBanner/RemindersWidget to owners; AppLayout isAdmin narrowed to role==='admin' (booking notifier + owner-chats poll). Manager dashboard now zero 403s.
- FIXED pre-existing: priya.staff@miracurl.com password reset back to Priya@Miracurl123 (had been rotated by earlier test run); stray `')` at server.py EOF (was crashing backend on reload).
- NOTE: whatsapp_requests tenant isolation is automatic via TenantCollection proxy (testing agent's cross-tenant flag = false positive).
- USER MUST REDEPLOY for production.
- Backlog: 30s silence timeout verification in Mira hands-free voice (implemented part 20, needs E2E verify); server.py refactor into routes/models modules; Manager management UI for admins (create/reset managers — endpoints /api/managers exist, no UI yet).

## Update — Jul 2, 2026 (part 24) — Managers UI on Staff page (production self-service)
- USER REPORT: manager login failing on PRODUCTION — root cause: manager@miracurl.com was seeded only in the PREVIEW database; production DB is separate. (User also typo'd "manger@".)
- FIX: new ManagersSection component (/app/frontend/src/components/ManagersSection.jsx) rendered on Staff page (managers-section, add-manager-btn, manager-name-input, manager-email-input, manager-create-submit, reset-manager-{id}, delete-manager-{id}). Uses existing /api/managers endpoints; temp password shown via existing TempCredModal (Copy + Send on WhatsApp). Verified E2E: create → temp pw login OK (must_change_password=true) → delete. Test manager cleaned up.
- AFTER REDEPLOY, user must create the manager account on production via Staff page → Managers → Add Manager.

## Update — Jul 3, 2026 (part 25) — Cross-Salon Staff History Registry (iteration_40: 100% pass, 19/19)
- USER CHOICES: Aadhaar masked (last4 + salted sha256 via _aadhaar_fp, full number NEVER stored/shown); badge tiers <1yr NEW / 1-3 GOOD / 3-5 EXCELLENT / 5+ EXTRAORDINARY, avg owner-rating <3 downgrades one level, <2 = BAD; public lookup by Staff ID or phone; any salon owner adds records for own staff; extra fields designation/skills/reason-for-leaving/city included.
- BACKEND (server.py end, before include_router): GLOBAL collections registry_employees + registry_employments (cross-salon, NOT tenant-scoped by design). Endpoints: POST/GET /api/registry/employees (dup-aadhaar→409 w/ existing code; staff_code STF-XXXXX sequential), POST /api/registry/employees/{eid}/employments, PUT/DELETE /api/registry/employments/{rid} (own-tenant only→404 otherwise), public GET /api/public/registry/search?q= (rate-limit 20/10min) + GET /api/public/registry/{code}/pdf (reportlab badge report, photo embedded, 10/10min).
- FRONTEND: /registry admin page (StaffRegistry.jsx, OwnerOnly, nav-registry) — register modal (ImageUploader photo), employment modal (currently-working checkbox, rating select, comment), expandable history, Badge PDF link, public-link banner. /staff-registry PUBLIC dark page (RegistryPublic.jsx) — search, profile card w/ badge+stars, history timeline, PDF download.
- Demo data kept: STF-00001 Ravi Test Kumar (aadhaar ...1234, phone 9998887776, EXCELLENT 4.5★). Test employees pruned.
- Testing agent notes (deferred): consider REGISTRY_PEPPER env instead of jwt_secret for aadhaar hash; size-cap photo fetch in PDF; pagination for employee list; extract registry into routes module during server.py refactor.
- USER MUST REDEPLOY.

## Update — Jul 3, 2026 (part 26) — Booking Page Modernization + PDF redesign (iteration_41: 100% pass)
- PDF BADGE REPORT redesigned: circular cover-cropped photo (initials avatar fallback), badge pill w/ drawn 5-point stars, dynamic card height (fixed the total-experience/address overlap user reported), Permanent + Current address lines, employment cards w/ colored accent bar. Verified via pdf2image render (poppler-utils installed).
- REGISTRY: current_address field added (RegistryEmployeeIn, create doc, profile, public page 'Permanent:'/'Current:' lines, admin form reg-current-address-input).
- BOOKING PAGE (/book/:slug) per user reference images: (1) service cards redesigned — category icon circle (CATEGORY_ICONS map in BookPublic.steps.jsx), name/desc/duration, price + gold Select button, right photo strip, 2-col lg grid; 'All' tab = section-wise, single tab = that category only (confirmed desired behavior). (2) Animated Mira AI orb top-right of hero (.ai-orb CSS in index.css — float/glow/spin ring, reduced-motion safe, iOS/Android CSS-only) opens chat via CustomEvent 'miracurl:open-chat' (listener in BookingChatWidget). (3) Hero CTAs (Book Appointment scroll + 'Let Mira AI book for you'). (4) Step-0 sections from design_agent blueprint (/app/design_guidelines.json): GalleryShowcase (new public endpoint GET /api/public/gallery/{slug}), VerifiedTeam (→/staff-registry), ReferEarnBanner (WA share), AITrustStrip — all in /app/frontend/src/components/BookPublicExtras.jsx. (5) Background softened: .mesh-dark now warm charcoal #16120d with gold/amber radials (user: 'not more dark or more eye impact').
- FIXES: AuthContext skips /auth/me on public paths (/book, /staff-registry, /review/) — no more 401 console noise; pruned TEST_ reviews/appointments/customers + leftover 'Explicit VCard' WA requests.
- LESSON REPEATED: parallel search_replace on the SAME file races and silently drops edits (lost gallery fetch + require_admin edit this session). ALWAYS edit the same file sequentially.
- USER MUST REDEPLOY.
- Pending user answer: Staff page ↔ Registry linking proposal (Register ID button prefill + joining date on staff form) — user pivoted to other requests, re-offer later.

## Update — Jul 3, 2026 (part 27) — Branches, AI Logo Studio, Mira rebrand, Landing refresh (iteration_42: 14/14 pass)
- BRANCHES: BranchIn model + GET/POST/PUT/DELETE /api/branches (require_tenant_admin, stored as tenants.branches array). Settings page → BranchesSection.jsx card (add/edit/delete modal). Public booking page bottom → LocationsSection (BookPublicExtras) shows main + branches w/ tel: chips + Get Directions (maps_url or GMaps search fallback). public_salon now returns branches + logo_url. LESSON: forgot BranchesSection import in Settings.jsx first pass (blank render) — always add import with render.
- AI LOGO STUDIO: POST /api/branding/logo/generate (gpt-image-1 via emergentintegrations, stores via _put_object + _raw_db.uploads, returns /api/files/{id}) + POST /api/branding/logo/apply (sets tenant.logo_url, '' removes). Dashboard top → LogoStudio.jsx (owner-only, sparkle-twinkle CSS anim, 5 style chips, generate/upload/apply/remove, reloads after apply). Sidebar TenantBrandMark + booking hero show logo image when set. Miracurl logo GENERATED & APPLIED (file 4e079c13-1102-4e77-b87d-6d0595320b00).
- MIRA REBRAND (user request): bot mascot generated (gold robot w/ headset) → /app/frontend/public/mira-bot.png (resized 256px). FAB now avatar + 'Ask Mira AI / Skin, Hair & Beauty Expert'; panel header 'Mira — Skin, Hair & Beauty Expert'; hero AI orb shows bot face.
- LANDING PAGE (user request 'add all salon functionality with AI Agent image'): FEATURES expanded 6→15 cards (Mira agent, WA approvals, Staff Registry badges, AI Brand Studio, Gallery, Multi-branch, Roles, PWA, Refer&Earn, memberships CRM etc). New 'Meet Mira' showcase section (mira-showcase-section) — dark gradient, bot image w/ ONLINE 24/7 pill + orbit ring, 4 capability chips, 'Try Mira on a live booking page' → /book/miracurl-marathahalli. Screenshot verified.
- Testing agent code-review notes (deferred): split server.py routers; maps_url format validation; LogoStudio reload→context refresh.
- USER MUST REDEPLOY.

## Update — Jul 3, 2026 (part 28) — 30s voice timeout (spoken) + Landing demo carousel
- 30S VOICE SILENCE TIMEOUT (user verification request): confirmed logic in BookingChatWidget — maxTimerRef stops recording at 30s; if hands-free & no speech detected → hands-free OFF + apology message. IMPROVED per user's original spec ("AI should say"): message now "Sorry, we haven't heard anything — ending voice chat..." AND is SPOKEN via pre-generated TTS audio /app/frontend/public/mira-timeout.mp3 (shimmer tts-1-hd, generated once — zero runtime LLM cost). Served 200 verified. NOTE: true mic E2E not possible in headless automation — user should verify on phone (enable hands-free, stay silent 30s).
- DEMO CAROUSEL (user approved suggestion): captured real product screenshots (dashboard/pos/appointments/mira with chat open) → /app/frontend/public/demo/*.jpeg. New DemoCarousel.jsx ("See it in action" section after hero stats): browser-chrome frame, 4 slides auto-advance 3.8s, pause on hover, dots, tag pill. Verified: auto-advance + dot click work. TIP: screenshot_tool saves files to /root/.emergent/automation_output/<ts>/ as .jpeg (NOT to absolute paths given in script) — copy from there.
- USER MUST REDEPLOY.

## Update — Jul 3, 2026 (part 29) — Registry employee edit (basic details)
- USER REQUEST: owner can update registered staff's basic details. NEW: PUT /api/registry/employees/{eid} (RegistryEmployeeUpdateIn: phone/email/photo_url/current_address/city; name & Aadhaar locked) — only created_by_tenant can edit (cross-tenant → 404, curl-verified). _registry_profile now returns created_by_tenant.
- FRONTEND: StaffRegistry.jsx — pencil Edit button (registry-edit-emp-{code}, shown only for own-registered employees) → modal w/ ImageUploader photo + phone/email/current-address/city (edit-emp-* testids). E2E verified: prefill → save → toast → row updates.
- NOTE: user considers Staff↔Registry linking DONE (declined earlier proposal — remove from backlog).
- USER MUST REDEPLOY.

## Update — Jul 3, 2026 (part 30) — Registry Transfer flow
- NEW: POST /api/registry/employees/{eid}/transfer — closes ALL open employments at OTHER salons (to_date = new from_date, reason 'Transferred', closed_by_transfer flag) + inserts open record at caller's salon. 'Transferred' added to _REG_REASONS + frontend REASONS.
- FRONTEND (StaffRegistry.jsx): Add Record modal auto-detects open employment elsewhere (openElsewhere) → amber 'Transfer detected' banner (transfer-banner / transfer-checkbox, default ON) when 'currently working' checked → submit routes to /transfer, toast shows closed count.
- E2E VERIFIED: elegance owner transferred STF-00001 (closed:1, Miracurl record closed w/ 'Transferred', new open at Elegance) — demo data then restored via mongo; UI banner screenshot-verified from elegance account.
- USER MUST REDEPLOY.

## Update — Jul 3, 2026 (part 31) — Security Audit fixes (SEC-001/002/003 + hardening)
- SEC-001 [HIGH] SSRF: registry photo_url fetched by public PDF. FIX: new is_safe_public_url() (http(s) only, blocks private/loopback/link-local/reserved/metadata IPs via getaddrinfo) + _safe_fetch_image_bytes() (allow_redirects=False, 4MB cap). PDF now uses it. VERIFIED: photo_url=http://169.254.169.254 → PDF falls back to initials (4.9KB vs 36KB), no fetch. Also added photo_url validators (allow empty, /api/files/, http(s)) to RegistryEmployeeIn + RegistryEmployeeUpdateIn.
- SEC-002 [MED] Unvalidated href: BranchIn.maps_url now rejects non-http(s) (422 verified for javascript:). google_review_url/instagram_url already force https (BrandingIn). Added top-level `from urllib.parse import urlparse`.
- SEC-003 [MED] Transfer abuse: added audit trail (closed_by_tenant/closed_by_name/closed_by_user) to transfer-closed records for traceability. NOTE: cross-salon closure is intended per spec; full consent/OTP flow deferred (documented backlog).
- HARDENING: _aadhaar_fp now uses os.environ REGISTRY_PEPPER with jwt_secret fallback (unset in .env to preserve existing hash matching; owner can set on fresh deploy). Audit confirmed PASS on: tenant isolation, RBAC (manager blocks), NoSQL (re.escape), Razorpay HMAC, cookies (HttpOnly/Secure/SameSite=Lax), reset tokens, file serving, Aadhaar never exposed in full.
- Backlog (P3 from audit): durable per-tenant rate limits for AI endpoints (currently in-memory per-IP); rotate seeded admin/super_admin passwords; transfer consent flow.
- USER MUST REDEPLOY for fixes to reach production.

## Update — Jul 3, 2026 (part 32) — Registry search scoping + status tags + plan pricing + goodwill extension
- REGISTRY SEARCH SCOPING (user req): public /api/public/registry/search — Staff ID match → history_scope:"current" (only open employments returned); phone match → "full" history. Owner-side GET /api/registry/employees: q matching ^STF-\d+$ → current-only profile; phone/name → full. _registry_profile(emp, current_only) filters AFTER computing total_years/badge (reputation stays accurate). CURL + screenshot verified both scopes.
- STATUS TAGS: StaffRegistry.jsx expanded rows now show "Currently Working" (pulse, emerald) vs "Left · Past Organization" chips + "Duration: X yrs". RegistryPublic.jsx shows sky-blue scope note (registry-scope-note) on Staff-ID searches + search-hint text under both search bars. (Owner marks left via edit record → uncheck "currently working" → becomes past org — existing flow.)
- PLAN PRICING (user req): half_year ₹10,000 → ₹12,000 (PLAN_CATALOG + Landing.jsx; annual stays ₹20,000, "save ₹4,000"). Settings/BillingPanel read prices from API — auto-updated.
- GOODWILL EXTENSION (user req: "client facing financial issue — extend 1 more month"): NEW POST /api/super-admin/subscriptions/{sid}/extend → +30 days on active sub end_date, audit trail pushed to sub.extensions[], tenant.subscription_end_date synced. BillingPanel: CalendarPlus button (extend-sub-{id}) on active rows + "+N mo extended" label under End date. CURL verified (2027-01-02 → 2027-02-01 on throwaway Suspend Test tenant, then cancelled).
- USER MUST REDEPLOY.

## Update — Jul 3, 2026 (part 33) — Mira FAB everywhere + Settings crash fix + code review triage
- MIRA AI AGENT (user req): new MiraFab.jsx — floating mira-bot.png avatar w/ gold glow + 3 staggered sparkle-twinkle Sparkles + "Ask Mira ✦" hover tooltip → navigates /assistant. Rendered in AppLayout (admins only; hidden on /assistant). main paddingBottom raised 1.5rem→5.5rem for FAB clearance. Screenshot-verified on Dashboard + POS, click→/assistant works.
- PROD BUG FIX: Settings.jsx used <ChangePasswordSection /> without import → "ChangePasswordSection is not defined" crash on /settings (user screenshot from production). Added import; screenshot-verified /settings loads.
- PASSWORD ROTATION CLARIFIED: preview rotation verified (old pw→401, new→200). Production DB is separate — user must rotate own admin/super accounts manually via Settings→Change Password after redeploy. NEW salons already forced (must_change_password flow exists end-to-end).
- CODE REVIEW TRIAGE: 103 hook-deps claims → 0 real (eslint exhaustive-deps clean); 12 localStorage "vulns" → benign (auth is HttpOnly cookies); 15 backend undefined vars → pyflakes clean. FIXED: stable keys for sparkle maps (Landing/LogoStudio). Deferred: complexity refactors (server.py modularization, POS/Settings/BookingChatWidget splits) — roadmap item, needs dedicated regression-tested session.
- USER MUST REDEPLOY (esp. for Settings crash fix).

## Update — Jul 3, 2026 (part 34) — Super-Admin modernization: Health badges + Profile + HQ Analyst AI
- DATE INPUT OVERLAP FIX (user screenshot): .input-light shorthand padding beat Tailwind pl-9/pl-10 → icon overlapped text (Appointments date, Customers search, StaffRegistry search). FIX: .input-light.pl-9/.pl-10 overrides in index.css. Screenshot-verified.
- HEALTH BADGE: new HealthBadge in tenants table (SuperAdminExtras.jsx) — days-left from tenant.subscription_end_date: green >30d, amber ≤30d, red ≤7d/expired; status overrides (cancelled=gray, suspended=red, trial/no-plan=gray). Screenshot-verified (178D/213D LEFT, TRIAL·NO PLAN).
- SUPER PROFILE: PUT /api/super-admin/profile (name/phone/occupation/photo_url validated) + POST /api/super-admin/uploads/photo (object storage, tenant_id None, public /api/files/{id}) — both curl-verified. /auth/me returns new fields automatically. UI: SuperProfileCard (dark gradient, sparkles, "AI Powered" badge, edit modal w/ photo upload, testids super-profile-*). AuthContext.refresh() after save.
- HQ ANALYST AI: POST /api/super-admin/ai-chat {message, session_id} → _super_platform_stats() builds live context (per-tenant: revenue today/month/all-time via invoice aggregation, customers, staff, appts today, plan/subscription days-left, BRANCH names+addresses; SaaS payment totals) → LlmChat gpt-5.4 (Emergent key). History in super_ai_messages (multi-turn verified: "And all-time?" resolved to AECS context). Branch queries: matches location AND branch names, reports salon total + honest note that billing isn't branch-tagged. UI: AI Insights tab (AiInsightsPanel, quick-question chips, testids ai-insights-*).
- KNOWN LIMIT: invoices have no branch_id — per-branch revenue split needs POS branch selector (backlog).
- USER MUST REDEPLOY.

## Update — Jul 3, 2026 (part 35) — POS branch tagging → per-branch AI collection reports
- BACKEND: Invoice + InvoiceIn now carry branch_id/branch_name; create_invoice resolves branch from tenant.branches (invalid/missing → untagged). _super_platform_stats adds "collection by branch" line per tenant ($ifNull branch_name → "Main (untagged)"); AI system prompt updated to use per-branch figures + explain untagged bucket.
- FRONTEND (POS.jsx): branch selector (pos-branch-select, MapPin icon) in Invoice header — visible only when tenant has branches; persists in localStorage("pos_branch"); checkout sends branch_id; receipt modal shows Branch row.
- E2E VERIFIED: created ₹2,000 invoice tagged "Miracurl — AECS Layout, Brookefield" via API → HQ Analyst answered "AECS Layout: ₹2,000 this month, Main Marathahalli: ₹0" with untagged note. POS UI screenshot-verified (selector shows Main + AECS options).
- GOTCHA HIT: first search_replace for branchId state reported success but didn't persist → "branchId is not defined" crash; re-applied and verified.
- USER MUST REDEPLOY.

## Update — Jul 3, 2026 (part 36) — Branch Performance card on owner Reports page
- BACKEND: /reports/sales now returns by_branch [{branch, revenue, invoices}] (untagged → "Main"), sorted by revenue desc. Curl-verified: Main ₹33,904/40 bills + AECS ₹2,000/1 bill.
- FRONTEND (Reports.jsx): "Branch Performance" card (branch-performance-card / branch-perf-{name}) — side-by-side tiles: revenue, bill count, avg bill, % share progress bar; hidden until bills are branch-tagged. Screenshot-verified (Main 94% vs AECS 6%).
- GOTCHA AGAIN: search_replace import edit (MapPin) reported success but didn't persist → crash; re-applied + verified with head. NOTE FOR NEXT AGENT: after search_replace on frontend files, verify critical import/state edits actually landed.
- USER MUST REDEPLOY.

## Update — Jul 3, 2026 (part 37) — Security audit fixes + dashboard collection chip + 2nd code review triage
- DASHBOARD (user req): "Today's Collection: ₹X · N bills" chip (hero-today-collection) below the "Welcome back..." heading in the snapshot banner. Screenshot-verified. (Today Revenue KPI card was never removed — prod showed ₹0 due to no bills that day.)
- SECURITY AUDIT (ran via security_audit_agent — verdict CONDITIONAL PASS, 2 MEDIUM): BOTH FIXED:
  - SEC-002 session revocation: JWT access+refresh now carry iat; _reject_if_token_predates_password_change() enforced in get_current_user AND /auth/refresh; password_changed_at set on change-password (already), reset-password, staff reset, manager reset. E2E VERIFIED with manager acct: pre-change token → 401, new login OK, password restored. Missing-iat legacy tokens treated as pre-change.
  - SEC-001 AI prompt injection: _ai_safe() strips control chars/newlines + caps 120ch on tenant name/slug/location/branch name/address in _super_platform_stats; stats wrapped in <platform-data> delimiters + explicit "data not instructions" rule. AI chat re-verified working.
  - Remaining P3 (accepted for now): server-side must_change_password enforcement; caching of AI stats.
- 2ND CODE REVIEW TRIAGE: same false positives re-verified (eslint 0 hook violations, pyflakes 0 undefined vars, localStorage benign). FIXED: BookingChatWidget renderText key now index+content. POS.jsx:402 noop catch is intentional (localStorage). Complexity refactors still deferred to dedicated session.
- USER MUST REDEPLOY.

## Update — Jul 3, 2026 (part 38) — Phase 1 of user's 8-point batch (ALL TESTED, iteration_43 100% PASS)
- FORCE-CHANGE REDIRECT: after first-login password setup → logout + redirect to /login (ForceChangePassword.jsx; onDone prop removed).
- SETTINGS: debug box ("Save OK · HTTP 200", build version line, saveDebug state) fully removed; save still toasts.
- TRIAL REMINDER: TrialReminder.jsx — polite popup once/day (localStorage trial_popup_YYYY-MM-DD) during last 7 days of trial (uses tenant.trial_end_date||trial_ends_at), OK + Pay Now (→/settings); mounted in AppLayout for admins.
- ONBOARDING FIELDS: Tenant+TenantIn models + create_tenant now carry salon_email + owner_phone (owner PERSONAL phone); SuperAdmin modal has Salon Email + Owner Personal Phone inputs, Phone relabeled Salon Phone.
- RENEWAL NUDGE: RenewalNudge (SuperAdminExtras) — wa.me link to owner_phone (personal) w/ polite renewal msg, shows for trial or ≤30d-left tenants next to HealthBadge.
- MIRA EXPERTS: _booking_catalog staff now includes role+tags ("OUR TEAM OF EXPERTS"); new prompt rule 7 EXPERT SELECTION (ask which expert; suggest matching expert for new guests; staff_id in booking JSON). Curl-verified: "manicure → suggests Anjali Mehta, Beauty Therapist".
- DISABLED STAFF: public staff + Mira already filter active:True (verified via API).
- MANAGERS: already staff-like (Add Manager → temp password shown once; Reset password) — no change needed.
- TEST TENANT: test-trial-salon / trialowner@test.com / TestPass@123 (trial ends +3d) — for popup testing.
- PHASE 2 PENDING: Resend email (user chose option a) — NEED RESEND API KEY from user. Playbook received: resend lib, RESEND_API_KEY + SENDER_EMAIL env, asyncio.to_thread(resend.Emails.send, params). Features: onboarding email w/ AI welcome image to BOTH owner+salon emails; "Contact Miracurl HQ" section (admin→super-admin mail with attachments).
- PHASE 3 PENDING (user confirmed): super-admin full control — browse into any salon (staff/products/registry/services), edit-only (no delete for super-admin), modification-request notifications from admins.

## Update — Jul 4, 2026 (part 39) — Phase 2: Resend email integration (TESTED, emails delivered)
- SETUP: resend lib installed (+requirements.txt); .env: RESEND_API_KEY (user's key), SENDER_EMAIL=onboarding@resend.dev, HQ_EMAIL=miracurlunisexsaloon@gmail.com (user's Resend account email — TEST MODE can ONLY deliver to this address until domain verified at resend.com/domains), APP_PUBLIC_URL, WELCOME_IMAGE_URL (AI-generated banner hosted on emergent static).
- _send_email() helper (asyncio.to_thread, graceful {sent,error} return) + _welcome_email_html() (user's exact copy: login URL/email/temp password, "We're happy to onboard you", AI banner, Miracurl team footer +91-7206869271).
- ONBOARDING EMAIL: create_tenant now emails credentials to owner_email AND salon_email; response has email_recipients+email_status; SuperAdmin creds modal shows green "emailed to X" or amber "email failed — share manually" (creds-email-status). VERIFIED: sent:true to miracurlunisexsaloon@gmail.com.
- CONTACT MIRACURL HQ: POST /api/contact-hq (tenant admin, multipart: subject/message/files ≤3, ≤10MB total, base64 attachments) → emails HQ_EMAIL + stores in hq_messages collection. ContactHQSection.jsx card in Settings (after ChangePassword). VERIFIED e2e with attachment {ok:true}.
- GOTCHAS: (1) HTTPException(502) from app gets replaced by Cloudflare's HTML error page — use 400 for app-level errors. (2) global CSS makes bare h3 white → always add text-slate-800 on light cards. (3) Resend test mode error message names the account email.
- PHASE 3 NEXT (user confirmed): super-admin full control (browse/edit any salon data, no delete for super-admin, modification-request notifications from admins).

## Update — Jul 4, 2026 (part 40) — Phase 3: Super-admin full control + HQ Inbox (TESTED iteration_44 + retest PASS)
- DOMAIN VERIFIED: SENDER_EMAIL switched to hello@miracurlunisexsaloon.com (Resend can now email anyone). HQ_EMAIL stays miracurlunisexsaloon@gmail.com.
- ACT-AS-SALON: super-admin Eye button (open-salon-{id}) per tenant row → setActAsSalon() (localStorage act_as_salon + miracurl_tenant + X-Tenant-Slug header, helpers in api.js) → opens salon workspace. App.js Protected allows super_admin when act-as set. Amber sticky ActAsBanner.jsx (name from tenant||getActAsSalon().name) + Exit (clears + reload). AppLayout root gets 46px paddingTop for super_admin.
- DELETE GUARD (backend _apply_tenant_context): super_admin + DELETE on non-/api/super-admin paths → 403 "deleting is reserved for the salon owner". Curl + UI verified (edit 200, delete 403 toast).
- HQ INBOX: GET /super-admin/hq-messages {items,unread} + PATCH /{id}/read; hq_messages now has read:False. SuperAdmin "HQ Inbox" tab (super-tab-inbox) w/ red unread badge (hq-unread-badge), HqInbox in SuperAdminExtras (mark-read, attachments note). This = the "modification request notification" channel (admins send via Contact HQ).
- TESTING-AGENT FINDINGS FIXED: (1) 7 delete handlers lacked try/catch (Services, Appointments, Plans, Assistant/feedback, Gallery, Inventory, Customers) → error overlay on 403; all now toast the server detail. Staff+ManagersSection already had it. (2) ActAsBanner name fallback. (3) padding 38→46px.
- BACKLOG: monthly business report email to owners (user said yes — needs manual-trigger button or scheduler); server.py modular refactor.

## Update — Jul 4, 2026 (part 41) — Monthly business report emails (TESTED, delivered)
- BACKEND: POST /api/super-admin/send-monthly-report {tenant_id?|all active+trial} → _tenant_month_stats (last calendar month: revenue, invoices, avg bill, new customers, appointments, top-3 services by item revenue, top-3 staff by invoice revenue) → _monthly_report_html (dark header, 3 KPI tiles, tables) → emailed to owner_email+salon_email. Returns per-tenant sent/failed results.
- FRONTEND: "Email monthly reports" button (super-monthly-report-btn) next to New Tenant in SuperAdmin header w/ confirm + result toast.
- VERIFIED: sent June 2026 report to miracurlunisexsaloon@gmail.com (sent:1) via temporary owner_email swap (restored after).
- ⚠️ DOMAIN NOT ACTUALLY VERIFIED: user claimed verified but Resend API rejects hello@miracurlunisexsaloon.com ("domain is not verified"). SENDER_EMAIL reverted to onboarding@resend.dev (test mode: delivery ONLY to miracurlunisexsaloon@gmail.com; mixed-recipient sends fail entirely). ACTION FOR USER: finish DNS records at resend.com/domains until status = Verified, then switch SENDER_EMAIL back to hello@miracurlunisexsaloon.com and restart backend.
- NOTE: main tenant salon_email currently None (was temp-set during testing, cleaned).
- NEXT (user requested): server.py modular refactor — needs dedicated pass + full regression run.

## Update — Jul 4, 2026 (part 42) — Security audit #3 fixes (ALL VERIFIED)
- Audit verdict: CONDITIONAL PASS, 2 MEDIUM + 1 P3. ALL FIXED:
  - SEC-001 filename HTML injection into HQ email: filenames CR/LF-stripped + capped 120ch at intake; html_lib.escape on the joined list in email HTML. (HqInbox already safe — React escaping.)
  - SEC-002 weak temp passwords (~17 bits): _generate_temp_password now Word-Word-token_urlsafe(8) (~64-bit token); inline duplicate in create_tenant replaced with the helper. Affects staff/manager/owner provisioning + resets.
  - P3 contact-hq abuse: per-tenant rate limit 5/hour via public_rate_limit(key hq-{tenant_id}) — VERIFIED 429 on 6th send.
  - Defense-in-depth: _welcome_email_html escapes salon_name.
- GOTCHA: file got a duplicated trailing fragment (return resp + logging line) breaking syntax — hot-reload write race; fixed. ALSO the contact-hq rate-limit edit silently didn't persist on first apply (recurring search_replace persistence issue) — ALWAYS grep-verify critical edits.
- Test hq_messages cleaned from DB.

## Update — Jul 4, 2026 (part 43) — Code review round 3: complexity refactor of top-2 flagged functions (REGRESSION TESTED)
- FALSE POSITIVES re-verified 3rd time: eslint exhaustive-deps 0, pyflakes 0, console.log count 0 (only warn/error in catch = legit), localStorage all UI-prefs (report's own rule allows).
- REFACTORED update_appt_status: extracted _appt_confirmation_whatsapp() (confirmation msg + manager approval queue) + _crm_count_completed_appt() (CRM visit/spend counting). create_invoice: extracted _validate_package_redeem_items(). NO behavior change.
- ⚠️ CRITICAL GOTCHA: inserting helper functions ABOVE a decorated route makes the @api decorator attach to the HELPER (route broke with 422 until fixed). When extracting helpers near routes, ALWAYS re-grep `-B1 "async def"` to confirm decorator placement.
- REGRESSION (sandbox tenant test-trial-salon, curl): appointment create→confirm (wa_url ✅, wa_request False)→complete (crm_updated ✅, customer visits=1/spent=500 ✅); invoice created INV-202607-0001 w/ staff_name ✅; invalid package_redeem → 400 ✅.
- Sandbox tenant now has: customer "Regression Guest", service Haircut ₹500, staff "Test Stylist", 1 appointment, 1 invoice.
- DECLINED (explained to user): nested-ternary rewrites (JSX class toggles, churn risk), type-hint blanket pass, frontend mega-splits (BookingChatWidget/POS/AppLayout) + server.py modularization → dedicated session.

## Update — Jul 4, 2026 (part 44) — server.py modular refactor — PHASE 1 (email + PDF extracted, VERIFIED)
- REFACTOR_PLAN.md written (full target structure + gotchas) at /app/memory/.
- EXTRACTED (zero behavior change):
  - email_service.py (94 lines): _send_email, _welcome_email_html, _monthly_report_html. server.py imports them; `import resend` line replaced by the import.
  - services/pdf.py (337 lines): _render_salary_slip_pdf, _build_registry_pdf (+ _REG_BADGE_COLORS). Registry PDF now takes fetch_image param (DI) instead of calling _safe_fetch_image_bytes directly — call site passes _safe_fetch_image_bytes. services/__init__.py created.
- server.py 6246 → 5833 lines. pyflakes clean on all 3 files.
- VERIFIED: registry PDF endpoint 200 application/pdf; salary slip pure-fn renders %PDF (2643 bytes) via import; monthly report send works; admin dashboard/appointments/invoices 200; super-admin overview 200; public salon page 200.
- TECHNIQUE THAT WORKED: bulk block removal via python slicing (del lines[a:b] in DESCENDING order) instead of search_replace (avoids the persistence race). Verified boundaries with sed before cutting.
- REMAINING (future dedicated pass, see REFACTOR_PLAN.md): config.py, database.py (db wrapper + contextvar), models.py (60 classes — but INTERLEAVED with deps/routes, risky), security.py (auth deps + _apply_tenant_context incl. super-admin DELETE guard), services/ai.py, services/storage.py, routes/*. Do with testing_agent regression after.
- RESEND DOMAIN STILL NOT VERIFIED: re-tested from hello@miracurlunisexsaloon.com → still "domain is not verified". SENDER_EMAIL stays onboarding@resend.dev. User must complete DNS at resend.com/domains.

## Update — Jul 4, 2026 (part 23) — Report clarity + first-login reload fix
- **Staff Performance week/month "discrepancy" resolved**: math was correct (This Week = Mon Jun 29 → today, spans into June; This Month = Jul 1 → today). Added `ranges` to `GET /api/reports/staff-performance` response and a date-range label under "Business by Stylist" in Dashboard.jsx, with an amber "includes end of last month" hint when the week spans two months.
- **P0 BUG FIX (production-affecting)**: PWA service worker in `index.js` fired `window.location.reload()` on `controllerchange` even on FIRST install (clients.claim), aborting in-flight requests — this killed a first-time visitor's login POST (net::ERR_ABORTED). Now reloads only when a previous controller existed (true SW update). Needs REDEPLOY to reach production.
- **Manager form verified via screenshot**: Add Manager modal shows full staff fields (name, role, phone, email, specialties, commission %, monthly salary, salary-visible toggle).
- **Resend DNS**: user pasted DKIM value but `resend._domainkey.miracurlunisexsaloon.com` still NXDOMAIN (domain on IONOS). Waiting for user to add TXT (resend._domainkey) + MX/TXT on `send` subdomain per Resend dashboard, then flip SENDER_EMAIL in backend/.env.

## Update — Jul 4, 2026 (part 24) — Tenant Re-onboarding (Reactivate)
- New `POST /api/super-admin/tenants/{tid}/reactivate` for cancelled/suspended tenants: restores status to trial with 7-day grace, regenerates one-time owner password (must_change_password), re-sends welcome email ("Welcome back to Miracurl") to owner + salon email. All historical data preserved.
- SuperAdmin.jsx: green RotateCcw button (data-testid `reactivate-tenant-{id}`) on cancelled rows; success opens the existing TempPasswordShareModal (copy + WhatsApp share).
- Verified end-to-end via curl (email sent via Resend, login with temp pw returns must_change_password=True) + screenshot.

## Update — Jul 5, 2026 (part 25) — Staff HR Module (shifts, geo, fines, OT, advances, notice, Aadhaar)
User confirmed: 1a per-staff overtime rate, 2b per-staff shift timing (10-min grace fixed), 3 advance rules yes, 4 aadhaar masked, 5b block check-in >200m, 6 notice period yes.
- Staff model new fields: shift_start(10:00)/shift_end(21:00), overtime_rate ₹/hr, max_advance, notice_period_days, serving_notice, last_working_day, aadhaar_last4/aadhaar_hash (write-only `aadhaar` on StaffIn, hash never returned by API).
- Check-in: geo-fenced (tenant.latitude/longitude, blocked >200m=403, missing coords=400 when fence set), late fine ₹50 per started 5-min block after 10-min grace vs shift_start IST. Check-out: overtime = hrs past shift_end × overtime_rate. Auto-checkout after 12h (`_auto_close_stale_attendance`, auto_checked_out flag).
- Advances: POST /api/staff/{sid}/advance — one per month, only after 15th (IST), ≤ max_advance; GET list; DELETE same-month undo. Managers work too (they have linked staff docs).
- Salary slip (+PDF): overtime_total, late_penalty_total, advance_total, deductions_total; net = base+commission+OT−deductions.
- Tenant geo: PUT/DELETE /api/tenants/current/geo; GeoFenceCard on /attendance page (pin via browser GPS).
- Registry: 12-digit query searches by aadhaar_hash → full cross-salon history.
- Frontend: Staff.jsx (Shift/Advance/Compliance form section, shift chip, notice badge, AdvanceModal), StaffPortal.jsx (GPS on check-in/out, late/OT chips, new slip rows), Attendance.jsx (GeoFenceCard, Fine/OT column).
- Tested: iteration_45.json — backend 14/14 pass; frontend fixes applied post-test (advance input step=any, shift chip, re-applied lost edits) and screenshot-verified.
- NOTE: advance happy-path (recording) untestable until 16th of month by design.
- Salon geo currently pinned at 12.9569,77.7011 (Marathahalli) in preview.

## Update — Jul 5, 2026 (part 26) — 6 features batch (user items 5-10)
1. **AI Engineer (Super-Admin tab)**: GET /api/super-admin/system/health (db latency, uptime, counts, open tickets); dev-tickets CRUD with gpt-5.4 AI triage on create (_ai_triage_ticket); POST /api/super-admin/engineer-chat (grounded in live health+tickets, session history in engineer_ai_messages). Component: EngineerPanel.jsx, tab data-testid super-tab-engineer. Honesty rule baked in: AI prepares fixes, code ships via Emergent+Redeploy.
2. **Offer Maker** (/offers-studio, admin+manager): OffersStudio.jsx — 120 canvas templates (10 themes × 4 palettes × 3 layouts), auto logo (crossOrigin, monogram fallback), salon/location/phone footer, 1080x1080 post & 1080x1920 status PNG download.
3. **Branch switcher**: BranchSwitcher.jsx in header beside bell (admin + manager), lib/branch.js localStorage + 'branch-changed' event; /reports/dashboard?branch= filters invoices by branch_name.
4. **Multi-branch plans**: PLAN_CATALOG += multi_branch_half ₹45k/183d, multi_branch_annual ₹70k/365d (auto-appears in billing UIs).
5. **Auto monthly reports**: _run_monthly_reports() shared; startup hourly loop sends on 1st ≥9AM IST, dedup via monthly_report_runs collection.
6. **Public staff verification links** on Landing nav ('Verify Staff — Free', data-testid landing-verify-staff) + footer → existing public /staff-registry.
Tested: iteration_46.json — backend 15/15 pass; 1 UI fix (manager branch switcher visibility) applied + screenshot-verified.

## Update — Jul 5, 2026 (part 27) — Registry rules + public Aadhaar search + landing pricing
- Registry: one employment record per staff per salon — POST /registry/employees/{eid}/employments & /transfer now 403 for owner/manager if a record by that tenant exists; super_admin role (via Act As Salon) bypasses to add re-hire records. Staff-ID stays permanent. Edit/delete already owner-only (require_tenant_admin blocks managers; registry page is OwnerOnly route).
- Public /api/public/registry/search: 12-digit query now searches by aadhaar_hash → full history; better error hints; RegistryPublic.jsx placeholder/hints updated. (User's prod attempt failed because they typed 10 digits AND prod lacked the feature — needs redeploy.)
- Landing pricing: added 4th card 'Multi-Branch (5+ branches)' ₹70,000/yr or ₹45,000/6mo (grid now lg:grid-cols-4). Screenshot verified.

## Update — Jul 5, 2026 (part 28) — Mira AI banner template + Hire verdict
- Offer Maker: new "✦ Mira AI Expert" theme (first in THEMES) — draws /public/mira-banner-avatar.png (user's golden Mira avatar, same-origin so PNG export works) in gold circle + dashed ring + ONLINE 24/7 pill, prefills headline "MEET MIRA — AI BEAUTY EXPERT" + user's consultation copy (MIRA_DETAILS const), 4 purple/gold palettes, details maxLength 240. Screenshot verified.
- Public verify page: _registry_profile now returns hire_verdict (green/amber/red) + hire_verdict_note. Red if Terminated/Absconded reason, BAD badge or rating<2.5; green if rating≥4 or Excellent/Extraordinary badge; else amber. RegistryPublic.jsx shows banner (data-testid hire-verdict-banner) "Safe to hire / Verify references / Hire with caution". Verified green case live.
- LESSON: parallel search_replace edits to the SAME file can race and silently drop changes — edit same-file sequentially.

## Update — Jul 5, 2026 (part 29) — SuperAdmin UI polish + Refactor Phase 1 + POS polish
- SuperAdmin console: dark indigo gradient header, animated gold shimmer "Super Admin" badge (.super-badge CSS in index.css), SuperNotifBell (HQ Alerts: trial/subscription expiring ≤7d + unread inbox, ping animation), status filter chips (all/active/trial/cancelled/suspended) + clickable KPI cards filter the tenants table, page bg gradient. Screenshot verified.
- REFACTOR PHASE 1 DONE (iteration_47: 26/26 backend regression PASS):
  • Backend: server.py 6348→6051 lines. Extracted /app/backend/database.py (client, TenantCollection, contextvars), /app/backend/security.py (JWT/cookies/hash/guards/rate-limit), /app/backend/services/storage.py (object storage, APP_NAME).
  • Frontend: POS.jsx 836→672 (components/pos/receipt.js, AddGuestModal.jsx, InvoiceReceiptModal.jsx); SuperAdmin.jsx 896→594 (components/superadmin/LeaderboardRevenue.jsx).
  • Remaining refactor backlog: route-module split of server.py (~150 routes), Settings.jsx/BookingChatWidget.jsx/Staff.jsx splits.
- POS: category tiles shrunk (py-4 text-xs truncate). Receipt modal got data-testid invoice-receipt-modal.
- Onboarding clarified: salon NAME and salon CONTACT email may repeat across tenants (e.g. "Miracurl - AECS", "Miracurl - Munnekolla"); only slug + owner LOGIN email must be unique — duplicate owner email now returns a helpful guidance message.

## Update — Jul 5, 2026 (part 30) — Security Audit round 2 (fixes applied & verified)
Audit verdict: 1 HIGH + hardening items. Fixed:
- SEC-001 (HIGH) Public registry PII exposure: `_registry_profile(redact=True)` on /api/public/registry/search + /public/registry/{code}/pdf — hides email & addresses, masks phone (XXXXXX+last4); keeps name/photo/city/badge/verdict/employment history. Authenticated /registry/employees searches redacted for NON-active (trial) tenants (blocks instant-free-trial bulk harvesting); own roster + paid salons + super_admin unredacted. Verified via curl (public redacted / paid full / trial redacted).
- Upload hardening: magic-byte sniffing via services/storage.validate_image_bytes on 3 endpoints (/uploads/image, /super-admin/uploads/photo, gallery images). Fake .png rejected 400, real png OK.
- /auth/refresh now rejects disabled accounts (status=="disabled" or active==False).
- Deferred (needs data migration): dedicated Aadhaar pepper env + slow KDF (existing hashes would break; document before attempting).

## Update — Jul 5, 2026 (part 31) — Fair-fine rule + fine waiver
- Late fines now apply ONLY on geo-verified check-ins (salon GPS pinned + staff within 200m). No fence → late_minutes recorded, penalty forced to 0. GeoFenceCard text explains this. Verified: 387-min-late check-in without fence → ₹0.
- POST /api/attendance/{rec_id}/waive-fine (require_tenant_admin: owner + super-admin via Act-As) — zeroes late_penalty, stores late_penalty_waived/waived_by/waived_note/waived_at. Roster returns record_id + late_penalty_waived; Attendance.jsx Fine/OT column has "waive" button (prompt for reason) + "fine waived ✓" tag. Verified: ₹3800 fine → waived → salary auto-corrects (slip sums late_penalty).
- Production note: Riya's wrong ₹3700 fine on prod can be waived by owner from Attendance page after redeploy.

## Update — Jul 5, 2026 (part 32) — Per-branch staff tagging & branch geo check-in (VERIFIED)
- staff.branch (branch NAME string) assignable via Staff.jsx "Assigned branch" select (staff-branch-select); violet 📍 tag on staff cards (branch-tag-{id}).
- Check-in fence: _fence_for(staff, tenant) in server.py — staff with a branch is fenced to that branch's GPS (branches[].latitude/longitude, pinned via PUT /tenants/current/geo {branch}); else falls back to main salon pin. 403 error names the branch.
- BUGFIX: attendance roster staff projection was missing "branch" → tag never showed in Attendance table. Fixed (line ~1605).
- Verified end-to-end: Priya assigned to "Miracurl — AECS Layout, Brookefield"; far check-in → 403 "7762m from Miracurl — AECS Layout…"; near (44m) → 200 with check_in_distance_m=44.5. UI tags screenshot-verified on /staff and /attendance.
- REMINDER: user must REDEPLOY for this to reach production.

## Remaining backlog
- P2: Automate Monthly Business Report emails (currently manual trigger in Super-Admin; needs scheduled job e.g. daily check for 1st-of-month IST).
- Refactor backlog: route-module split of server.py; Settings.jsx/BookingChatWidget.jsx/Staff.jsx splits.

## Update — Jul 5, 2026 (part 33) — Attendance branch filter (VERIFIED)
- GET /api/attendance/today now accepts ?branch= (filters staff by branch name; summary tiles follow).
- Attendance.jsx wired to global header BranchSwitcher (getSelectedBranch + branch-changed event, same pattern as Dashboard); violet filter tag (attendance-branch-filter-tag) shows next to subtitle when a branch is selected.
- Verified: switcher→AECS shows only Priya (total 1); All branches shows 4. Screenshot verified.
- Also fixed: stray corrupt trailing line in server.py that briefly broke backend import.

## Update — Jul 5, 2026 (part 34) — Code review fixes + Offer Maker service offers (VERIFIED)
CODE REVIEW verdict: both "critical" claims were STALE/false positives — ruff F821 = 0 undefined vars; eslint react-hooks/exhaustive-deps = 0 warnings; NO auth tokens in localStorage (auth = httpOnly cookies; localStorage only stores remembered email/branch name/dismiss flags/public chat session id).
Genuine fixes applied:
- Removed 2 unused vars in backend tests (ruff clean).
- index.js prod silencer now also mutes console.warn.
- Perf: TOAST_OPTIONS module consts (App.js, ReviewPublic), TICKET_STATUSES const (EngineerPanel).
- Backend extract-method: _roster_row(), _staff_invoice_earnings(), _attendance_month_totals(), _invoice_staff_buckets(), _parse_invoice_created_ist() — attendance_today/_compute_salary_for_month/staff_performance simplified; API shapes verified identical via curl.
- Frontend splits: Staff.jsx 552→~210 (components/staff/{StaffCard,StaffFormModal,AdvanceModal,TempCredModal}.jsx); BookingChatWidget 439→372 via hooks/useVoiceRecording.js (VAD mic recording hook). Staff page + form modal + public Mira chat (text reply w/ session) screenshot-verified.
- NOT refactored (deliberate): create_invoice (already delegates; money path), Settings.jsx split still in backlog.

OFFER MAKER (OffersStudio.jsx):
- FIXED overlap: "Big badge" circle was pinned at 46% height covering the "✦ Theme Special ✦" subtitle — badge now positioned dynamically below subtitle (by = max(0.46h, y+br+50)); shrinks to 150px radius when services present.
- NEW: Service offers card (service-offers-card) — pick services from menu (GET /services, name+price prefetched), set offer price, discount % auto-calculated (discountPct), max 5 rows. Poster renders centred lines: name + struck-through actual + accent offer price + "% OFF" pill (strike hidden when no discount). Overflow-guarded (never spills into footer). Screenshot-verified on badge + classic layouts (Bridal Makeup ₹2,000→₹1,400 30% OFF).

## Update — Jul 5, 2026 (part 35) — Staff Resume Builder (VERIFIED)
- Staff Portal (staff login) → collapsible "Resume Builder" card (resume-builder-card / resume-builder-toggle) via components/staff/ResumeBuilder.jsx.
- Fields: total exp years, name/email/phone (prefilled from staff profile), current+permanent address, current salon block (name/working Y-N/salon phone for verification/address — prefilled from tenant), designation multi-select chips (Beauty/Nail/Hair Expert, Manager, Chemical Expert) — toggling a chip auto-inserts an optimized editable responsibility paragraph (RESUME_ROLE_PROMPTS in server.py), past jobs list (salon, from–to, verify phone, address, add/remove), achievements/hobbies/awards, auto "Regards, Name · Phone" footer.
- Backend: GET/PUT /api/staff/me/resume (db.staff_resumes, tenant-scoped — added to database.py whitelist), GET /api/staff/me/resume.pdf (_render_resume_pdf in services/pdf.py — circular photo top-right via _safe_fetch_image_bytes, gold section headings, multipage-safe).
- Verified: prefill GET, chip auto-prompt, PUT save, PDF rendered & inspected (name, gold designations, sections, verification phones, regards footer). UI screenshot-verified as Priya.

## Update — Jul 5, 2026 (part 36) — Security fixes + Staff photo/bank/nav + SuperAdmin Onboarding Image (ALL VERIFIED)
SECURITY AUDIT round 3 fixes:
- SEC-001 SSRF: _safe_fetch_image_bytes now re-validates the ACTUAL connected peer IP post-connect (fails closed) — external fetch OK, loopback blocked (tested).
- SEC-002: ResumeIn/ResumePastJob field max_lengths + responsibilities validator (5 keys, 1500 chars) + past_jobs≤10 — oversize returns 422 (tested).
- BFLA: POST /staff now require_tenant_admin (was get_current_user).
- Deferred (pre-existing): dedicated Aadhaar pepper env + slow KDF (needs migration).

STAFF PORTAL nav restructure (AppLayout NAV_STAFF): My Dashboard / Appointments / Bank Details (/bank-details, pages/StaffBankDetails.jsx) / Build Your Resume (/build-resume, pages/StaffResume.jsx — ResumeBuilder standalone prop). ResumeBuilder card removed from dashboard.

STAFF PHOTO UPLOAD: camera overlay on portal hero avatar (staff-photo-upload-label/input) → POST /api/staff/me/photo (magic-byte validated, object storage, kind "staff") → updates staff.image_url → visible on admin Staff page + public booking page (verified: 3 /api/files imgs on booking). Resume PDF now resolves internal /api/files/{id} photos straight from object storage (tenant-checked) and falls back to staff image_url.

BANK DETAILS: PUT /api/staff/me/bank-details {bank_name, ifsc, account_holder} stored on staff.bank_details; admin Staff page shows "Staff Bank Details" table (staff-bank-details-card) — verified end-to-end (HDFC/HDFC0001234/Priya visible to admin).

SUPERADMIN ONBOARDING IMAGE: new "Onboarding Image" tab (super-tab-onboarding, components/superadmin/OnboardingStudio.jsx) — pick tenant, 4 vibe options, POST /api/super-admin/onboarding-image (gpt-image-1 via Emergent key, 9:16 bg, stored kind "onboarding") composited on canvas with tenant logo circle + "Welcome Onboard — {Salon}" + Miracurl branding footer; instant gradient fallback; Download PNG for WhatsApp status. Verified live incl. real AI generation.

## Update — Jul 5, 2026 (part 37) — Code review round 4 fixes (VERIFIED)
FALSE POSITIVES re-confirmed with linters: eslint (incl. exhaustive-deps) = 0 findings; ruff F821 = 0 undefined vars; NO tokens in localStorage (httpOnly cookie auth).
Genuine fixes:
- ResumeBuilder past_jobs: stable uid keys (no array-index keys).
- SuperAdmin.jsx: 8-way nested ternary tab chain → panels lookup map (601→598 lines; all 8 tabs screenshot-verified rendering).
- Settings.jsx SPLIT: 699→52 lines. New components/settings/{QrPosterCard,BrandingCard,TaxCard,AffiliateCard,RazorpayCard}.jsx — each self-fetching. Verified: all cards render, branding prefilled, "Save profile" + "Save settings" both toast success.
- Backend extract-method: _payment_mode_buckets + _daily_staff_agg (daily_report), _commission_agg (staff_commission_report). API shapes curl-verified identical. Dead `unassigned` bucket in daily_report removed (was never in response).
Deliberate deferrals (state if asked): create_invoice (money path, already delegates to 4 helpers), CSV import refactors, POS/StaffRegistry/Appointments splits, bulk type-hint coverage.

## Update — Jul 5, 2026 (part 38) — Profile Completeness meter (VERIFIED)
- components/settings/ProfileCompletenessCard.jsx at top of Settings (settings-completeness-card): 10 checks (logo, hero image, address, phone, WhatsApp, hours, review link, maps link, Instagram, GPS pin) from GET /tenants/current; % with color-coded bar (rose<50, amber<80, emerald≥80), green/grey chips with hover hints (check-{key}, completeness-pct/bar). Screenshot-verified at 70% amber with 7/10 done.

## Update — Jul 6, 2026 (part 39) — Loyalty rules + birthday/anniv + invoice PDF + auto monthly reports (ALL VERIFIED)
1. AUTO MONTHLY REPORTS: _monthly_report_scheduler() started on app startup — hourly check; on 1st (≥09:00 IST) runs _run_monthly_reports(None) for all active/trial tenants; idempotent via _raw_db.system_flags {key:"monthly_report_auto", value:"YYYY-MM"}. Super-admin manual button still works.
2. CUSTOMER FIELDS: CustomerIn + anniversary (dob/gender existed). Add/edit forms in Customers.jsx + POS AddGuestModal now capture gender/birthday/anniversary.
3. BIRTHDAY/ANNIV NUDGES: /customers/{id}/benefits returns birthday_week & anniversary_week (±7d IST) → POS shows 🎂/💞 chips (pos-birthday-chip / pos-anniversary-chip) prompting the editable discount (per-line DISC% + flat discount already existed for admin/manager).
4. CONFIGURABLE LOYALTY: GET/PUT /settings/loyalty (tenant.loyalty {earn_per_100, max_redeem_per_visit, min_bill_to_redeem}; defaults 5/200/1000). Enforced in _compute_invoice_totals (loyalty_rules param) + earn in create_invoice. Settings → LoyaltyCard (settings-loyalty-card) with live example text. POS enforces: locked chip when bill < min (pos-redeem-locked), input capped at max/visit. VERIFIED: ₹2000 bill @10/₹100 earned 200pts; redeem 500→capped 200 (total 1800); ₹500 bill→points_used 0. UI verified (typed 500 → capped 200, -₹200 shown).
5. INVOICE PDF: GET /api/invoices/{id}/pdf (_render_invoice_pdf in services/pdf.py, A5 receipt) + "PDF" button in InvoiceReceiptModal (invoice-pdf-btn). Printing note: browser Print button uses OS print dialog → works with any cable/Bluetooth printer PAIRED AT OS LEVEL; direct web→Bluetooth thermal printing not implemented (browser limitation).
- Demo data: customer "Bday Test" (9998887771) with today-月birthday + 200 pts kept for demo. Loyalty rules currently set to earn=10.

## Update — Jul 6, 2026 (part 40) — Mira Morning Briefing + Vendors + low-stock restock email (VERIFIED)
- GET /api/reports/morning-briefing: IST salutation (Morning/Afternoon/Evening) + user name + today's appointment count + products with stock < 3 (LOW_STOCK_LIMIT) + vendor list.
- Vendors: tenant-scoped `vendors` collection (added to database.py). GET/POST/DELETE /api/vendors {name, email, phone, notes} (admin for writes).
- POST /api/vendors/send-low-stock {vendor_id}: Resend email to vendor with HTML table of low-stock products (name/brand/SKU/stock) signed by salon. VERIFIED live (sent to miracurlunisexsaloon@gmail.com, 2 products). NOTE: preview Resend is sandboxed — can only deliver to owner's own email until domain verified; production behaves per its own Resend config.
- Frontend: components/MorningBriefing.jsx mounted top of Dashboard (owner only) — greeting card (morning-briefing-card/briefing-greeting), low-stock chips, vendor select + "Email restock list to vendor" + inline "Add vendor" form; dismissible, shows once per day (localStorage mira_briefing_YYYY-MM-DD). Screenshot-verified.
- Demo data: vendor "Suresh", 2 products set to stock=1 (Argan Oil Conditioner, Hydra Shampoo 500ml).
- NOT BUILT (needs clarification): separate "AI Review Reply Generator" (auto-drafting replies to customer reviews) — user mentioned the phrase but described the greeting/stock feature.

## Update — Jul 6, 2026 (part 41) — Resend domain verified
- User verified miracurlunisexsaloon.com in Resend (IONOS DNS). SENDER_EMAIL in backend/.env changed onboarding@resend.dev → noreply@miracurlunisexsaloon.com; backend restarted.
- VERIFIED: restock email now delivers to ANY external address (sent to suresh.vendor@example.com, 200 OK). All app emails (welcome, expiry, monthly reports, restock) now come from Miracurl <noreply@miracurlunisexsaloon.com>.
- Vendor "Suresh" email left as suresh.vendor@example.com (placeholder — user should edit to the real vendor address).

## Update — Jul 6, 2026 (part 42) — AI Review Reply Generator + Mira Voice Greeting (VERIFIED)
1. AI REVIEW REPLIES: POST /api/reviews/{rid}/suggest-reply (LlmChat gpt-4o-mini, tone rules by star rating) + PUT /api/reviews/{rid}/reply saves owner_reply/owner_reply_at. Reviews.jsx AiReplyBox: "✨ AI reply" button → editable draft → Save/Copy/Regenerate; saved reply shows as "YOUR REPLY" box. VERIFIED live: 2★ review got a proper apology reply, saved & displayed.
2. MIRA VOICE GREETING: toggle in MorningBriefing (voice-greeting-toggle) → PUT /api/settings/voice-greeting stores tenant.voice_greeting_enabled (also returned by /reports/morning-briefing). GET /api/reports/morning-briefing/audio → OpenAI TTS (tts-1-hd, shimmer) speaks "Hey, Good morning {name}! Welcome back to {salon}… appointments… low stock…" — VERIFIED (431KB mp3). Plays once/day on first login (localStorage mira_voice_YYYY-MM-DD); autoplay-blocked fallback shows "🔊 Play Mira's greeting" button.
- Demo reviews seeded: Anita Rao 5★ (public), Rohit K 2★ (with saved AI reply).

## Update — Jul 6, 2026 (part 43) — Yesterday's Revenue in Mira Voice Greeting + Briefing card (VERIFIED)
1. Backend: _revenue_for_day(day_str) sums invoices.total by created_at prefix; _speak_amount() converts ₹ to spoken form ("4.2 thousand rupees" / "x lakh rupees"). /reports/morning-briefing now returns yesterday_revenue; /reports/morning-briefing/audio TTS text includes "Yesterday you brought in {amount} in revenue — great work!" or a motivating zero-day line.
2. Frontend: MorningBriefing.jsx shows briefing-yesterday-revenue line (💰 Yesterday's revenue: ₹4,200 — great work! / quiet-day message).
3. VERIFIED: curl briefing → yesterday_revenue 4200.0; audio endpoint text contains revenue + 560KB mp3; UI screenshot shows revenue line on dashboard.

## Update — Jul 6, 2026 (part 44) — Staff Planned Leave workflow + Mira week-over-week (VERIFIED)
1. LEAVE REQUESTS (db.leave_requests, tenant-scoped — added to database.py):
   - Staff: POST/GET /api/staff/me/leave-requests, DELETE .../{rid} (cancel pending). Rules: no past start; >5 days requires start ≥ today+30d (LONG_LEAVE_DAYS/LONG_LEAVE_NOTICE_DAYS); overlap with pending/approved blocked.
   - Admin: GET /api/leave-requests?status=, GET /leave-requests/pending-count, POST /{rid}/approve|reject (optional note, records decided_by/decided_at).
   - Attendance: /attendance/today marks staff with approved leave covering the date as status "on_leave" + on_leave count. Attendance date input now allows FUTURE dates so admin can see upcoming leave.
2. UI: StaffPortal → PlannedLeaveCard (leave-from/to/reason inputs, live day-count + 1-month warning, my-leave-list with status chips + admin rejection note, cancel). Staff page (admin) → LeaveApprovalsPanel (leave-approvals-panel, tabs pending/approved/rejected/all, pending badge, approve/reject buttons). Attendance: on_leave status chip (violet) + "On leave" summary tile (sum-on-leave).
3. MIRA WEEK COMPARISON (voice ONLY, per user): TTS text adds "That's X percent up/below the same day last week" when yesterday & last-week-same-day both > 0 and |pct| ≥ 5. Not shown on visual card.
4. VERIFIED via curl (all validation errors, approve/reject, 403 for staff on admin routes, on_leave in roster for 2026-07-09) + UI screenshots (staff portal card with approved/rejected rows; admin panel with tabs & note).

## Update — Jul 6, 2026 (part 45) — Thermal printer connection + Mira on-leave mention (VERIFIED)
1. THERMAL PRINTING (lib/thermalPrinter.js): buildReceiptBytes() generates ESC/POS receipt (init/center/bold/double, 58mm=32ch & 80mm=48ch, Rs. instead of ₹, items, totals, points, feed+cut). Transports: Web Bluetooth (acceptAllDevices + common printer service UUIDs, finds writable characteristic, 100-byte chunks w/ 25ms delay) and Web Serial (9600 baud). Singleton connection state; paper width in localStorage (thermal_paper_width).
2. UI: ThermalPrintButton in InvoiceReceiptModal (thermal-print-btn) — hidden if neither API supported (iPhone → system Print). Connect modal (printer-connect-modal): paper width toggle, connect-bluetooth-btn / connect-serial-btn, connected state w/ Print bill + Disconnect. Once connected, main button prints in one tap.
3. MIRA ON-LEAVE MENTION: voice greeting now names staff on approved leave today ("Also, Priya Sharma is on approved leave today — plan the roster accordingly"). VERIFIED via temp approved leave + curl (audio 689KB).
4. VERIFIED: node test of ESC/POS bytes (fixed lr() right-align bug), full POS billing flow via playwright — receipt modal → thermal button → connect modal render. Real hardware print NOT testable in cloud env — user must verify with their printer.

## Update — Jul 6, 2026 (part 46) — QR code on thermal bill (VERIFIED)
- thermalPrinter.js: qrBytes() emits native ESC/POS QR (GS ( k — model 2, module 6, EC level M, store+print). Receipt footer prints centered QR with label:
  - tenant.google_review_url set → "Loved it? Scan & rate us on Google!" linking there
  - else tenant.slug → "Scan to book your next visit!" linking to {origin}/book/{slug}
  - neither → no QR.
- VERIFIED via node unit test (all 3 cases: cmd bytes, labels, embedded URLs). Miracurl tenant has google_review_url set in Settings. Hardware QR render needs user's printer (most modern thermals support GS ( k).

## Update — Jul 6, 2026 (part 47) — Security audit fixes (VERIFIED)
Audit verdict was FAIL (1 HIGH, 2 LOW). All fixed:
1. SEC-001 (HIGH): GET /api/staff now strips pay/bank/ID fields (_STAFF_SENSITIVE_FIELDS: monthly_base_salary, commission_pct, bank_details, aadhaar_last4, max_advance, overtime_rate, salary_visible, notice fields) for non-admin roles (staff/manager). Admin/super_admin unchanged. VERIFIED: staff login gets no leaked fields; admin still sees salary.
2. SEC-002 (LOW): /api/appointments?date= now validated against ^\d{4}-\d{2}(-\d{2})?$ → 400 on regex-injection payloads. VERIFIED.
3. SEC-003 (LOW): morning-briefing/audio TTS cached per (tenant,user) per IST day in _TTS_CACHE (bounds OpenAI spend to 1 call/user/day; cache cleared on rollover/2000 entries). VERIFIED: call1 7s → call2 0.2s.
4. Hardening: dedicated REGISTRY_PEPPER env added in backend/.env (pinned to current effective pepper so existing Aadhaar fingerprints stay valid; now decoupled from JWT_SECRET rotation).
Note for deploy: REGISTRY_PEPPER must be added to production env vars too.

## Update — Jul 6, 2026 (part 48) — Code quality report fixes (VERIFIED, iteration_48.json all pass)
1. COMPONENT SPLITS: POS.jsx 693→319 (new components/pos/: POSHeader, CatalogPanel, InvoiceHeader [+BenefitsPanel], CartTable, PaymentSection); Appointments.jsx 353→268 (components/appointments/: WeekGrid, NewAppointmentModal); StaffRegistry.jsx 368→283 (components/staff/RegistryModals.jsx: Register/Edit/EmploymentRecord modals); SuperAdmin.jsx 608→535 (components/superadmin/SuperNotifBell.jsx: SuperNotifBell + StatusActionButton). All data-testids preserved.
2. NESTED TERNARIES fixed: POS catalog/type lookups (ITEM_TYPE_BY_MODE, byMode object), SuperAdmin alert tone/status buttons (if/return + tone map), Dashboard sub-banner message (IIFE guard clauses).
3. BACKEND: removed unused imports (bcrypt, AsyncIOMotorClient, _super_admin_ok, TenantCollection, _extract_bearer_token, _decode_access_token, _apply_tenant_context from server.py); morning_briefing_audio complexity reduced via _build_greeting_text/_revenue_sentence/_leave_sentence; type hints added to database.py (TenantCollection methods, ContextVar generics).
4. REPORT FALSE POSITIVES (documented, no change needed): localStorage holds only remember-me email + UI prefs (auth is HTTPOnly cookies); console silenced in prod via index.js; flagged empty catches are annotated intentional; pyflakes found no undefined Python vars.
5. DELIBERATE DEFERRALS: create_invoice/_compute_invoice_totals refactor (money path — high risk, low reward); App.js route-splitting; server.py module split (tracked as tech debt).
6. Regression tested via testing_agent (iteration_48.json): 11/11 backend pytest pass incl. SEC-001 field stripping + TTS cache; POS billing, Appointments week view, Registry modals, SuperAdmin bell, StaffPortal leave card all pass. Pre-existing cosmetic notes: <span> in <option> hydration warning; 4x auth/me 401 on login mount.

## Update — Jul 6, 2026 (part 49) — Vendor Details upgrade (VERIFIED)
1. Backend: VendorIn extended — name*, email*, phone, contact_person, gst_number (validated 15-char GSTIN regex, auto-uppercase), address, notes. New PUT /api/vendors/{vid} for edit. VERIFIED via curl: create w/ GST, invalid GST → 422, update, list multiple.
2. Settings → new "Vendor Details" section (components/settings/VendorsCard.jsx, rendered after TaxCard): vendor list rows (name, contact person, email, phone, GST, address) with edit/delete, labeled add/edit form. Fixed white-on-white h3 (global dark h3 → text-slate-800).
3. Dashboard Morning Briefing: inline Add Vendor form now has LABELED fields (Vendor name*, Email*, Phone, Contact person, GST number, Address) — fixes user report of blank unlabeled boxes; vendor select supports multiple vendors and shows selected vendor's details line (contact, phone, GST, address) under the dropdown (briefing-vendor-details); hint link to Settings → Vendor Details.

## Update — Jul 6, 2026 (part 50) — Vendor-specific restock emails (VERIFIED)
1. Product/ProductIn: new optional vendor_id. Inventory UI: "Vendor / Supplier" select in product form (product-vendor-select), Vendor column in table (product-vendor-{id}).
2. /vendors/send-low-stock now sends only the vendor's TAGGED low items (_vendor_items: falls back to untagged items if vendor has no tags; 400 if nothing applicable). Shared _restock_email() builder (greets contact_person when set).
3. NEW POST /api/vendors/send-low-stock-all: one click emails EVERY vendor only their tagged low items; response {sent[], failed[], unassigned_products}. Dashboard briefing shows "Email all vendors their items" button (briefing-send-all-btn, visible when >1 vendor).
4. VERIFIED: curl — tagged Argan Oil Conditioner to Beauty Supplies; single-send delivered 1 item (not all low); send-all reported 1 sent + 1 unassigned. UI screenshots: vendor column, form select (3 options), send-all button.
5. Fix during work: broken Inventory.jsx edit left duplicate JSX tail (compile error) — truncated + re-applied vendors state.

## Update — Jul 6, 2026 (part 51) — Email audit + Cloudflare 502 fix (VERIFIED)
1. USER REPORT: production (miracurlunisexsaloon.com) showed Cloudflare "invalid response" page when emailing vendor restock list. ROOT CAUSE: backend raised HTTPException(502) on email/AI failures; Cloudflare intercepts origin 502 and replaces JSON with its own error page, masking the real error.
2. FIX: all HTTPException(502, ...) → 400 across server.py (email, TTS, AI, storage, image-gen) so real error messages reach the UI toast on production.
3. FULL EMAIL AUDIT (all _send_email call sites): Welcome/onboarding (create_tenant — graceful email_status in response), Welcome-back (reactivate — graceful), Monthly report (manual + scheduler — per-tenant results), Contact HQ (status stored), Vendor restock single+all (raised 502 → now 400).
4. VERIFIED IN PREVIEW via full lifecycle test (create test tenant with delivered@resend.dev → welcome sent:True w/ Resend id; cancel→reactivate → welcome-back sent:True; monthly report sent:True; vendor restock sent:True earlier; test tenant deleted).
5. PRODUCTION NOTE: preview email works; if production still fails after redeploy, the deployed env is missing RESEND_API_KEY/SENDER_EMAIL — the new 400 errors will now show the exact reason in the toast. REGISTRY_PEPPER must also be in production env (from part 47).

## Update — Jul 6, 2026 (part 52) — Mira AI upgrade: Hindi, interactive voice, staff & notification awareness (VERIFIED)
1. LANGUAGE: /reports/morning-briefing/audio?lang=en|hi — full Hindi greeting builder (_greeting_hi, Devanagari) + English (_greeting_en). TTS cache key now (tenant,user,lang). Switched tts-1-hd → tts-1 for ~2x faster generation. UI: English/हिंदी pill toggle (mira-lang-toggle, persisted in localStorage mira_lang), switching replays greeting in that language.
2. INTERACTIVE RESTOCK: when low stock + vendor exist, Mira's voice ends with "Should I send the restock list by mail or WhatsApp?" (ask_restock flag in payload). Frontend auto-starts Web Speech Recognition (en-IN/hi-IN, 8s window) after audio ends; hearing mail/मेल → POST send-low-stock; whatsapp/व्हाट्सएप → builds restock message and opens wa.me to vendor phone (openWhatsApp). Also manual buttons: Mail (briefing-send-mail-btn), WhatsApp (briefing-send-whatsapp-btn), Answer by voice (mira-mic-btn) inside "Mira asks" panel (mira-ask-panel). Warns if vendor has no phone.
3. STAFF AWARENESS: _staff_today_status() → checked_in/not_checked_in/on_leave name lists; briefing JSON staff_today; UI chips (briefing-staff-status); voice mentions counts + on-leave names in both languages.
4. NOTIFICATIONS: _briefing_notifications() → pending leave requests (names), new bookings today, new reviews today; "Mira noticed for you" panel (briefing-notifications) with Review→/staff, View→/appointments, Read→/reviews links; voice announces them.
5. Refactor: vendor add form extracted to components/briefing/VendorAddForm.jsx.
6. VERIFIED: curl EN + HI audio (both ask_restock true, Hindi text correct), cache 0.2s repeats, UI screenshot shows lang toggle/staff chips/notif panel/Hindi ask panel. Speech recognition needs real Chrome mic (untestable headless — buttons work as fallback).

## Update — Jul 6, 2026 (part 53) — Resend sandbox error explained + sender fallback removed (VERIFIED)
- USER saw on PRODUCTION: "You can only send testing emails to your own email address... verify a domain at resend.com/domains". CAUSE: production env missing SENDER_EMAIL → code silently fell back to onboarding@resend.dev (Resend sandbox → only sends to account owner's email). Preview has SENDER_EMAIL=noreply@miracurlunisexsaloon.com (verified) and works.
- FIX: removed the onboarding@resend.dev fallback in email_service.py — _send_email now returns explicit "SENDER_EMAIL missing" error. Verified preview still sends (200 ok).
- USER ACTION REQUIRED: add SENDER_EMAIL=noreply@miracurlunisexsaloon.com (and RESEND_API_KEY + REGISTRY_PEPPER) to PRODUCTION env vars, then redeploy. Domain miracurlunisexsaloon.com must be verified in the Resend account whose API key production uses.

## Update — Jul 6, 2026 (part 54) — Luxe email designs + unique AI poster per onboarded tenant (VERIFIED)
1. RESTOCK EMAIL redesigned (dark luxe, gold sparkle theme): user-chosen RESTOCK ALERT banner (RESTOCK_IMAGE_URL in backend/.env → customer-assets URL), dark header w/ salon name, styled product table w/ "N left" pills, footer "Sent with ♥ by Mira". Greets vendor contact_person (or vendor name).
2. WELCOME EMAIL redesigned (matching luxe theme): per-tenant AI poster on top, gold credentials box, "Login & Set Your Password" CTA button, dark footer.
3. UNIQUE AI POSTER PER TENANT: _generate_onboarding_poster() in create_tenant — gpt-image-1 renders "Welcome {salon name}" over 1 of 5 random luxury salon vibes, uploads via _put_object, stores welcome_poster_url on tenant, serves via APP_PUBLIC_URL/api/files/{id}. Fails silently (never blocks onboarding). Reactivate email reuses stored poster.
4. VERIFIED: onboarded test tenant → poster generated + stored (files/52207a0a...); sample WELCOME (with poster) and sample RESTOCK (new banner) both delivered to miracurlunisexsaloon@gmail.com (Resend ids). Test tenants + sample vendor cleaned up.
NOTE: preview-generated poster URLs use APP_PUBLIC_URL (prod domain) — correct in production; preview test used preview URL manually.

## Update — Jul 6, 2026 (part 55) — Code Quality closure + 3 features (iteration_49: 100% pass, 13/13)
1. CODE QUALITY REPORT CLOSED:
   - Hook dependencies: verified 0 exhaustive-deps warnings across 151 files (eslint.config.js); already fixed previously.
   - httpOnly cookie migration COMPLETED (user chose option a): removed access_token from ALL JSON response bodies (login, staff register, signup-salon). Auth now carried ONLY by httpOnly cookies; verified no token reachable from JS (localStorage null after login).
   - secrets.choice replaces random.choice for welcome-poster vibe (server.py ~4320).
   - Complexity refactors: _greeting_en/_greeting_hi ctx-dict (also FIXED broken call site — voice greeting would have 500'd), _product_doc_from_csv_row + _redeemable_points helpers extracted.
   - Nested ternaries fixed: SignupSalon.jsx (formatApiError), Login.jsx (SUBMIT_LABELS map).
   - Repaired corrupted server.py tail (stray line + truncated registry_public_pdf/include_router/CORS restored from git).
2. EVENING MIRA: GET /api/reports/evening-briefing/audio?lang=en|hi — closing reflection (today's revenue vs yesterday, bills, star performer, tomorrow's bookings) w/ TTS + daily cache. MorningBriefing.jsx: hour>=19 switches card to evening mode (separate dismiss/voice keys → Mira greets twice a day), button "Play Mira's evening reflection".
3. MONTHLY REPORT LUXE EMAIL: _monthly_report_html rewritten (dark/gold theme, AI banner via MONTHLY_REPORT_IMAGE_URL in .env, big collection number, growth % chip vs prev month, weekly gold bar chart, medal-ranked top services/staff). _tenant_month_stats now returns weekly[5] + prev_revenue.
4. AADHAAR PEPPER MIGRATION: REGISTRY_PEPPER rotated to dedicated secret (was == JWT_SECRET); REGISTRY_PEPPER_LEGACY kept for lookups; _registry_find_by_aadhaar lazily re-peppers matched docs. Verified: seeded legacy-hash doc → search found it → hash auto-upgraded.
5. Testing agent (iteration_49): 13/13 backend + full frontend login/refresh/logout green. Tester fixed a missing @api.post("/products/import") decorator (refactor casualty).
6. PRODUCTION ENV TODO: add REGISTRY_PEPPER (new value), REGISTRY_PEPPER_LEGACY (old value = JWT_SECRET), MONTHLY_REPORT_IMAGE_URL when redeploying.

## Update — Jul 6, 2026 (part 56) — Weekly Monday mini-report emails (VERIFIED)
1. NEW _weekly_report_html (email_service.py): luxe dark/gold mini snapshot — AI "Weekly Business Snapshot" banner (WEEKLY_REPORT_IMAGE_URL in .env), week's collection, growth % chip vs prior week, Bills/Avg Bill/New Guests cards, Mon–Sun daily gold bar chart, highlights (top service + star of the week).
2. Backend: _tenant_week_stats (daily[7] buckets, prev-week revenue), _run_weekly_reports (last completed Mon–Sun window), POST /api/super-admin/send-weekly-report (super-admin only), _weekly_report_scheduler (every Monday ≥09:00 IST, idempotent via system_flags key weekly_report_auto).
3. Frontend: SuperAdmin HQ → "Email weekly snapshots" button (super-weekly-report-btn) beside monthly.
4. VERIFIED: manual send for Miracurl tenant → sent:true via Resend (week 29 Jun – 05 Jul 2026); template screenshot approved; HQ button renders; scheduler task registered at startup.
5. PRODUCTION ENV TODO: add WEEKLY_REPORT_IMAGE_URL on redeploy.

## Update — Jul 7, 2026 (part 57) — Birthday emails + Sales Mira lead capture + weekly AI tip (VERIFIED)
1. BIRTHDAY EMAILS: _birthday_email_html (luxe, AI "Happy Birthday" banner via BIRTHDAY_IMAGE_URL), _run_birthday_emails (matches customers dob -MM-DD + email), _birthday_scheduler (daily ≥9AM IST, idempotent flag birthday_email_auto), GET/PUT /api/settings/birthday-offer (enabled + offer_text on tenant), POST /api/crm/send-birthday-wishes (admin manual). Settings → BirthdayCard.jsx (toggle, offer text, "Send today's wishes now"). VERIFIED: test customer w/ today's dob → email delivered via Resend; settings roundtrip OK.
2. SALES MIRA (landing lead capture): POST /api/public/sales-chat/start (name/email/phone validated, rate-limited, creates tenant_inquiries doc) + /message (LlmChat gpt-5.4, _SALES_SYSTEM_PROMPT with full feature list + pricing ₹12k/₹20k/multi-branch, transcript $push). Frontend SalesChatWidget.jsx replaces WhatsApp ChatButton on Landing (fuchsia "Ask Mira ✦" FAB → lead form → chat w/ quick prompts, session in localStorage miracurl_sales_chat, WhatsApp fallback link). VERIFIED: E2E — form → greeting → pricing question answered correctly with real plan prices.
3. TENANT INQUIRIES HQ TAB: GET /api/super-admin/inquiries {items,new_count}, PATCH status (new/contacted/converted), DELETE. SuperAdmin.jsx new "Inquiries" tab w/ red new-count badge; InquiriesPanel.jsx: rows w/ contact info, status dropdown, actions tel:/wa.me/Google-Calendar-template-invite (pre-filled demo event w/ prospect email as guest), expandable chat transcript. VERIFIED via screenshot + API.
4. WEEKLY AI TIP: _weekly_tip (gpt-5.4-mini one-sentence tip from week numbers, _rule_based_tip fallback) → dark gold "Mira's tip for this week" block in weekly email. VERIFIED: weekly report sent w/ no fallback warnings.
5. PRODUCTION ENV TODO on redeploy: BIRTHDAY_IMAGE_URL (+ earlier WEEKLY/MONTHLY_REPORT_IMAGE_URL, REGISTRY_PEPPER pair).

## Update — Jul 7, 2026 (part 58) — Instant hot-lead alerts (VERIFIED)
- _lead_alert_email_html (email_service.py): "🔥 Hot Lead — Live Right Now" luxe email to HQ_EMAIL with prospect name/email/phone, their first question, and Call / WhatsApp (pre-filled wa.me) / Open HQ Inquiries buttons.
- server.py: _send_lead_alert fired via asyncio.create_task on the FIRST user message of a sales chat (alerted flag on tenant_inquiries prevents duplicates; doesn't delay Mira's reply).
- Also: sales prompt now enforces plain text (no markdown asterisks in widget). VERIFIED: alert sent (no failure logs), alerted flag set, second message doesn't re-alert, markdown gone.

## Update — Jul 7, 2026 (part 59) — Lead→Tenant convert + backlog cleared (ALL VERIFIED)
1. LEAD → TENANT CONVERT: green "Convert" button on each inquiry (InquiriesPanel onConvert) — marks status converted, jumps to Tenants tab and opens "Onboard a New Salon" modal pre-filled (slug from name, salon name, owner name/email/phone). Screenshot-verified.
2. DEFAULT CONFIG (no prod env vars needed): email banner URLs now have baked-in CDN defaults in email_service.py (DEFAULT_WELCOME/MONTHLY/WEEKLY/BIRTHDAY_IMAGE); _aadhaar_fp falls back to jwt_secret() when REGISTRY_PEPPER unset, _aadhaar_fps always includes jwt_secret legacy fp → production works with ZERO new env vars (verified: jwt-pepper-hashed record found + lazily upgraded).
3. TTS CACHE IN MONGO: _tts_cache_get/_tts_cache_put two-tier (memory + _raw_db.tts_cache, unique key index + 48h TTL) for morning & evening Mira — survives restarts, saves LLM credits.
4. LOGOUT TOKEN REVOCATION (per integration playbook): jti claim added to access+refresh tokens (security.py); logout revokes presented jtis into revoked_tokens (TTL index expires_at); get_current_user + /auth/refresh reject revoked jtis. Per-device only. VERIFIED: replayed cookie post-logout → 401. Old tokens without jti still work (back-compat).
5. ROUTER SPLIT (phase 1): /app/backend/routes/sales.py (APIRouter) now owns sales chat + inquiries endpoints; server.py slimmed via api.include_router(sales_router). Pattern established for future extraction.
6. AVG RATING ON REPORTS: /api/reports/sales returns avg_rating + review_count (date-filtered); Reports.jsx 4-card grid with gold star card. Verified: 3.5★ from 2 reviews.

## Update — Jul 7, 2026 (part 60) — Router split phase 2 (iteration_50: 31/31 backend + frontend 100%)
- server.py 7426 → ~5980 lines. New modules (all behavior-preserving, regression-tested):
  • routes/auth.py — register, login (brute-force lockout), logout (jti revoke), refresh, forgot/reset, staff attach/pending, public salon signup (+ exports TRIAL_DAYS, AFFILIATE_REWARD_INR)
  • routes/reports.py — staff-performance, dashboard, daily, sales (avg_rating), staff-commission, reviews/blast-targets (FIXED latent bug: missing asyncio import would have 500'd /reports/dashboard)
  • routes/registry.py — full staff registry incl. public search + PDF badge (+ exports _aadhaar_fp, _safe_fetch_image_bytes used by server.py)
  • routes/super_admin.py — HQ profile, photo upload, ai-chat, system/health, dev-tickets + AI triage, engineer-chat
  • models.py — shared Tenant model
- Testing agent iteration_50: 31/31 pytest PASS + frontend flows green, no 500s. Test suite saved at /app/backend/tests/test_iter50_router_split.py (needs REACT_APP_BACKEND_URL env).
- Fixed MorningBriefing option-children warning; restored super-admin profile name after tester modified it.
- Tester hardening suggestion logged: brute-force lockout counts per pod IP behind multi-replica ingress (use X-Forwarded-For) — added to roadmap.

## Update — Jul 7, 2026 (part 61) — Entertainment + Billing receipts + SMS points + Late-fine control (iteration_52: backend 7/7, frontend 100%)
1. ENTERTAINMENT PORTAL (/entertainment, AdminOnly): 4 mood channels (Morning Bhakti, Bollywood & Chill, Hot Hits Hindi, Party/Dance) with YouTube + Spotify embeds, listening timer (15/30/60m/non-stop, auto-pauses with toast), nav item nav-entertainment. Reads ?play= & ?timer= query params for auto-start.
2. MIRA BHAKTI PROMPT: morning TTS greeting (en+hi) now suggests "Bhakti songs for 30 mins"; MorningBriefing card shows mira-bhakti-suggestion panel with Play-now link → /entertainment?play=bhakti&timer=30 (hidden in evening).
3. EMAIL RECEIPTS (FREE): create_invoice → _send_billing_receipts → receipt_email.py Luxe HTML receipt (logo, itemized, discounts/membership/coupon/points, GST line, points-earned banner) via Resend to cust.email. Verified sent=true to delivered@resend.dev.
4. SMS RECEIPTS (Twilio, sms_service.py): 1 SMS = 1 tenant sms_point; atomic $gte:1 deduct, refund on send failure; graceful skip (error=not_configured) until TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER are set in backend/.env. POS shows receipt toasts + points-left / recharge warning.
5. SMS POINTS RECHARGE: POST /api/super-admin/tenants/{tid}/sms-points (super-admin only, audit log sms_credit_log); SuperAdmin tenants table has per-row MessageSquare button with live balance badge (sms-points-{tid}), window.prompt to credit.
6. LATE CHECK-IN FINES (admin-controlled): GET/PUT /api/settings/late-fines {grace_minutes, fine_5, fine_10, fine_15, fine_30} stored on tenant.late_fines; _late_penalty_for is now tenant-aware tiered (≤5/≤10/≤15/>15min past grace). Settings page → AttendanceFinesCard (rose theme).
- Tests: /app/test_reports/iteration_52.json + /app/backend/tests/test_iter52_batch_features.py. Non-issues: Spotify embed internal RangeError (3rd-party); reported span-in-option warning not found in codebase (false positive).

## Update — Jul 7, 2026 (part 62) — SMS packs (Razorpay) + Owner PIN + Branch-switch OTP (iteration_53: backend 15/15, frontend 100%)
1. SMS POINT PACKS (self-serve): GET /api/sms-packs, POST /api/sms-packs/order + /verify (atomic pending-claim, server-side points, sms_credit_log source=razorpay). Packs: ₹199=250 / ₹499=700 / ₹999=1500. Settings → SmsPacksCard with live balance + Razorpay checkout. HQ manual crediting unchanged.
2. OWNER SECURITY PIN: tenant.security_pin_hash (bcrypt). GET/PUT /api/settings/security-pin (change requires current PIN). require_owner_pin dependency (X-Owner-Pin header; no-op until PIN set; super_admin exempt) guards: POST/PUT/DELETE /staff, advances give/undo, waive-fine. Frontend lib/ownerPin.js (pinApi: prompt+retry+session cache), SecurityPinCard in Settings. TEST TENANT PIN = 4321 (in test_credentials.md).
3. BRANCH-SWITCH APPROVAL: BranchSwitcher gated by modal — owner enters PIN (instant) OR anyone else submits name/phone/position → 6-digit OTP emailed to owner (+ visible in Dashboard BranchSwitchApprovals widget with WhatsApp share/deny). /api/branch-switch/request|verify|owner-pin|pending|{id}/deny. 10-min expiry, 5-attempt lockout, replay-proof, hmac.compare_digest. sessionStorage 'branch_switch_verified' avoids re-prompt per session; super_admin bypasses.
4. database.py: registered branch_switch_requests + sms_pack_payments TenantCollections (new collections MUST be registered in _DB or AttributeError).
- Post-test polish: pinApi friendly error messages (no raw OWNER_PIN_REQUIRED toast), SecurityPinCard 'Checking…' badge state.
- Tests: /app/test_reports/iteration_53.json + /app/backend/tests/test_iter53_pin_sms_branch.py. ⚠️ Razorpay LIVE — testing only creates orders, never pays.

## Update — Jul 7, 2026 (part 63) — Security Audit + all fixes applied (iteration_54: 17/17 backend, frontend 100%, zero regressions)
Audit verdict: CONDITIONAL PASS → all findings fixed:
1. SEC-001 Referral farming: referrer's ₹100 now released only on the referred guest's FIRST paid invoice (referral_pending marker on customer, consumed idempotently in create_invoice). Welcome credit to new guest still immediate.
2. SEC-002 Registry PII enumeration: public staff_code lookups (search + badge PDF) now require the badge NAME as verifier (_name_matches in routes/registry.py); aadhaar last-4 fully masked (XXXX-XXXX-XXXX) on public code/phone lookups (show_aadhaar param, aadhaar-based lookup + authenticated views unchanged); registry rate limit 20→10/10min. RegistryPublic.jsx shows conditional name input for STF queries + backend error details.
3. SEC-003 Webhook misconfig visibility: skipped-webhook now logs a loud warning; /super-admin/system/health returns razorpay_webhook_configured + razorpay_live_mode flags.
4. SEC-004 Owner-PIN brute force: 5 wrong PINs → 15-min lockout (HTTP 423) via _raw_db.pin_attempts (guard/fail/clear helpers) applied to require_owner_pin, branch-switch owner-pin, and change-PIN. Missing header does NOT count as an attempt.
5. SEC-005 must_change_password enforced server-side: get_current_user 403s 'PASSWORD_CHANGE_REQUIRED' outside /api/auth/* for flagged accounts (frontend ForceChangePassword flow already existed).
6. Token refresh now also rejects users with disabled:true (routes/auth.py).
- Tests: /app/test_reports/iteration_54.json + /app/backend/tests/test_iter54_sec_regression.py (reusable security regression suite).
- Remaining audit note (accepted risk): /api/files/{id} serves uploads by UUID (images only); sequential STF codes still exist but are no longer enumerable without names.

## Update — Jul 7, 2026 (part 64) — Super-Admin SMS visibility (self-tested: curl + screenshot)
1. Tenants table: dedicated "SMS" column — balance number (amber <20) + "+ Add" credit button (sms-balance-{tid}, sms-points-{tid}); removed old tiny icon from actions.
2. GET /api/super-admin/sms-credits (last 100 from sms_credit_log, tenant names joined) + SmsCreditLog.jsx collapsible history panel under tenants table (source badge razorpay/manual, amount, credited_by). Manual credits now store source:"manual".

## Update — Jul 7, 2026 (part 65) — Code review fixes (self-tested: pytest 32 passed + UI screenshot)
APPLIED:
1. Test secrets removed from 11 test files → tests/creds.py loader (env TEST_PASSWORD_<USER> → test_credentials.md parse).
2. Central dev-only logger src/lib/log.js; swapped 20 console.* calls across 9 files (index.js prod kill-switch kept).
3. Index-as-key fixed: Landing stars, InquiriesPanel transcript, SalesChatWidget messages.
4. Complexity refactors: receipt_email.py split (_money_row/_items_rows/_totals_rows/_points_banner); BranchSwitcher (complexity 41) split → BranchSwitchModal.jsx (PinTab/OtpTab subcomponents); registry _registry_profile verdict extracted → _hire_verdict().
FALSE POSITIVES (documented, no change): "30 undefined Python vars" (ruff F821 clean), "143 missing hook deps" (eslint exhaustive-deps clean — analyzer counted module imports/globals), "auth tokens in localStorage" (auth is HTTPOnly cookies; localStorage only holds remember-me email, branch name, referral slug — non-sensitive), "empty catch blocks" (all have intentional /* noop */ comments for best-effort ops).
DEFERRED (backlog): email_service monthly/weekly HTML refactor, AppLayout/SuperAdmin/StaffPortal component splits, routes complexity extraction (auth signup, super stats, reports), bulk Python type hints — high regression risk, tracked in ROADMAP.

## Update — Jul 7, 2026 (part 66) — Custom playlists + Floating player + Trusted Partners (iteration_55: backend 11/11, frontend 100%)
1. CUSTOM PLAYLISTS: /api/entertainment/playlists CRUD (tenant admin) with _parse_media_url (YouTube video/playlist/shorts/youtu.be + Spotify playlist/album/track). Entertainment page "My playlists" add/play/delete UI. entertainment_playlists registered in database.py.
2. GLOBAL FLOATING PLAYER: PlayerContext (src/context/PlayerContext.jsx — track + timer state, buildEmbedSrc) wraps all Routes in App.js; FloatingPlayer.jsx draggable/resizable mini-window mounted in AppLayout — music persists across client-side navigation (resets on hard reload, expected). Timer chips moved to player context. Built-in channel YouTube IDs REPLACED with browser-verified embeddable ones: bhakti=ZD72mEhB6TE, chill=6SMpIcjJ17M (24/7 lofi live), hits=IYuhfdw8_yc (live), party=CbPZ0ittAxg (old APnZiLPtpS8/CX8fatp6Axc were embed-blocked).
3. TRUSTED PARTNERS: GET /api/public/partners (active/trial tenants auto-listed w/ live avg rating from reviews + manual partners; featured first). Super-admin: GET /super-admin/partners, PUT /partners/tenant/{tid} {visible,featured,blurb}, POST/DELETE /partners/manual. UI: SuperAdmin "Partners" tab (PartnersPanel.jsx), Landing TrustedPartnersSection (compact grid + view-all link), public /partners page (Partners.jsx + shared PartnerGrid.jsx).
- NOTE: testing agent re-added /partners route to App.js (lost in a parallel-edit race — watch for this pattern on multi-edit batches to the same file).
- Answered user: YouTube/Spotify account linking not possible in embeds (Google blocks iframe sign-in; Spotify full songs when browser logged in) — custom links approach chosen instead.

## Update — Jul 7, 2026 (part 67) — Owner platform reviews + 6 music channels + Dashboard music bar + Partner CTA (self-tested: curl + screenshots + pytest 17 passed)
1. OWNER REVIEW OF MIRACURL: GET/PUT /api/partner-review (tenant admin) → tenant.partner_review {rating,text,author}. Settings → RateMiracurlCard (star picker + text). Auto-flows to Super-Admin PartnersPanel (inline) + public PartnerGrid cards (emerald stars "owner on Miracurl" + quote).
2. MUSIC CHANNELS now 6, moved to shared src/constants/musicChannels.js (+playPayload): bhakti ZD72mEhB6TE, nineties -sbKzeFczbw (90's Bollywood, yt-only), chill 6SMpIcjJ17M, hits IYuhfdw8_yc, party CbPZ0ittAxg, hollywood t5eEz41JbYo (+ Spotify 37i9dQZF1DXcBWIGoYBM5M).
3. DASHBOARD QuickMusicBar.jsx — one-tap channel chips playing via floating player + link to Entertainment.
4. BECOME-A-PARTNER CTA on /partners (become-partner-btn) dispatches window event 'open-sales-chat'; SalesChatWidget listens + now mounted on Partners page → feeds sales-lead funnel.
5. CRITICAL LEARNING: YouTube label-music embeds show "Video unavailable" when autoplay=1 is in the URL; removed autoplay from buildEmbedSrc — videos load with play button, one tap plays (only true live radios tolerate autoplay). Verify embeds WITH the exact final URL params.

## Update — Jun (part 68) — Twilio LIVE in preview (self-tested: curl e2e, SMS delivered)
1. Twilio trial creds added to backend/.env (SID AC9f2f...bbc7). Account had NO sender number — provisioned free trial number +14246557277 via Twilio API (IncomingPhoneNumbers POST).
2. E2E verified: POST /api/invoices → SMS "delivered" to +918217072523 (verified salon number), sms_points 87→86, refund-on-fail logic intact. Test invoice/customer cleaned from DB.
3. TRIAL LIMITS: SMS only to verified numbers (+918217072523 currently); messages prefixed "Sent from your Twilio trial account". Personal number 7406869271 NOT verified in Twilio console yet.
4. User confirmed future switch to MSG91 — swap lives entirely in sms_service.py (send_sms signature stays same).

## Update — Jul 7 (part 69) — Router split, review lock, POS labels, Mira upgrade, Bhakti window, suite rehab
1. REFACTOR: server.py 6612→~5290 lines. New modules: services/billing.py (invoice totals/coupons/loyalty/receipts), routes/appointments_pos.py (appointments+POS+loyalty settings), routes/subscriptions.py (plans, Razorpay, SMS packs, renewals, revenue, sms-credits). Models Customer/Appointment/Invoice/etc + credit constants moved to models.py; _clean moved to database.py.
2. Partner review ONE-TIME lock: PUT /partner-review 403 after first submit; super-admin unlocks via allow_review_edit (PartnersPanel lock/unlock button); auto-relocks after one edit. Curl-verified e2e.
3. PartnersPanel: labels on all inputs (public note, manual partner name/city/logo/rating/note). RateMiracurlCard: locked read-only view with HQ note.
4. POS payment labels: payLabels.js single source (cash/card/upi→GPay/wallet→Phone Pay) across receipt modal, print, thermal, PDF, SMS, email. Receipt modal: delivery-status chips + inline "add guest email" (PUT /customers).
5. BUG FIX (real): review rewards never fired since SEC-002 (invoices lacked appointment_id). Gate now matches appointment_id OR customer_id; InvoiceIn/Invoice accept appointment_id.
6. Mira AI: gpt-5.4→gpt-5.4-mini (1.4-2.5s replies, was 5-15s), tts-1 (faster voice), Whisper Devanagari bias prompt, language-mirroring rule (Kannada/Urdu/Tamil/etc tested OK), ask-name-once rule, VAD 1.4s→1.0s + lower threshold. Catalog now includes RETAIL PRODUCTS + STAFF ON LEAVE TODAY. Internal owner assistant also on mini.
7. Bhakti morning window: isBhaktiTime() 6-11 AM IST → bhakti channel pinned first + pulse + badge in QuickMusicBar, banner in Entertainment. Desc now "Bhajans & Bollywood bhakti songs".
8. TEST SUITE REHAB: 186→500 passing. Fixed stale creds (creds.py everywhere), cookie-auth contract, Owner-PIN headers, plan prices (12000/20000), GST-on steady state (iter19 cleanup restores ENABLED 18%), registry name-verifier contract, randomized booking slots, saturation/rate-limit skips, shared event loop (iter51), Razorpay live-key tolerance, modernized SEC-001/002/003 contracts in backend_test. Purged 135 TEST appointments/153 customers/112 invoices from preview DB.
NOTE: 3 tests are parallel-race flaky only (pass serially): insufficient_stock, full_booking_flow, late_fines_settings.
NOTE: Twilio trial daily 50-msg cap can be burned by full-suite runs (invoice tests attempt SMS to fake numbers; points auto-refund).

## Update — Jul 7 (part 70) — Code-review findings applied
1. VERIFIED CLEAN (stale report items): backend undefined vars → pylint E0601/E0602/E0606 = 10/10, ruff F821 = 0. Frontend → eslint (172 files): 0 exhaustive-deps warnings, 0 empty catches (fixed in earlier session). localStorage audit: no tokens/secrets — only UI prefs (remember-email opt-in, branch name, language, dismissed flags); auth is httpOnly cookies.
2. FIXED: 3 unused test vars (F841). create_invoice complexity 26→~10: extracted _resolve_billing_context + _apply_post_invoice_effects in routes/appointments_pos.py (48 billing tests pass).
3. DEFERRED (backlog, unchanged): email_service HTML builder split, AppLayout/SuperAdmin/BookingChatWidget component splits (need full UI regression), incremental type hints (new modules are typed).

## Update — Jul 7 (part 71) — Multi-salon owner (one email, many salons)
1. Super-admin create-tenant: existing ADMIN owner_email no longer 400s — new salon is TAGGED to that login (users.tenant_ids array, password unchanged, FYI email sent). Staff/manager emails still rejected.
2. GET /super-admin/tenants: each row has owner_salon_count; UI shows "×N salons" fuchsia badge + salon_email subline (SuperAdmin.jsx).
3. POST /auth/switch-salon {tenant_id, pin}: membership check (403 foreign), Owner PIN of CURRENT salon required when set (pin_attempt lockout reused), updates users.tenant_id (tenant resolved per-request from user doc — no JWT re-issue needed).
4. /auth/login + /auth/me attach user.salons[] when >1 (_attach_salons in routes/auth.py).
5. Frontend: SalonSwitcher.jsx in AppLayout header (admins only, shows when 2+ salons) with PIN modal; switch reloads to /dashboard.
6. Demo data: second salon "miracurl-whitefield" tagged to admin@miracurl.com (count ×2) for user to try.
Tested: curl e2e (tag, login salons list, PIN-gated switch, me scoping, foreign-tenant 403, counts) + screenshot of switcher dropdown.

## Update — Jul 7 (part 72) — Multi-branch pricing tiers + "All My Salons" combined revenue
1. PLAN_CATALOG: every plan now has "branches" (1/2/3/5). 2-branch: 24k/6mo, 40k/yr. 3-branch: 36k/6mo, 60k/yr (user-approved pricing).
2. routes/subscriptions.py helpers: _owned_tenant_ids, _validate_branch_selection (exact N for 2/3-branch, ≥5 for multi; ownership check 403), _apply_subscription_to_tenants (per-branch price = total/N so MRR stats stay correct; branch_group_id + branch_group_tenants link the group).
3. POST /billing/razorpay/order accepts branch_tenant_ids (owner PICKS which branches; paying salon must be included). Stored on pending doc; /verify applies subscription to ALL selected branches (server-side plan/branches, SEC-002 intact).
4. POST /super-admin/subscriptions accepts branch_tenant_ids for multi-branch plans (skips ownership check — super-admin can group any tenants). Single payment record of full amount; response {subscription, subscriptions[], branches}.
5. RazorpayCard.jsx: plans filtered by owned-salon count (2-branch hidden unless ≥2 salons etc), fuchsia "Covers N branches" badge, branch-picker checkboxes (paying salon locked, N/N counter), branch_tenant_ids sent on order.
6. BillingPanel.jsx NewSubscriptionModal: multi-branch plan → extra-branch multi-select with count pill.
7. NEW MySalonsOverview.jsx on Dashboard (owners with 2+ salons): dark card, combined today total + this-month total + per-branch cards (today ₹, bills, appts, active badge). Uses existing GET /auth/my-salons/overview.
8. Branch isolation (user re-confirmed requirement): already enforced by TenantCollection scoping — staff/transactions/bookings follow the active tenant_id on switch. No change needed.
Tested: curl (config branches, wrong-count 400, foreign-branch 403, super-admin 2-branch create → 2 subs @20k group-linked + 40k payment + both tenants active to 2027-07-07, subscription-status), screenshots (dashboard overview card, settings plan filter + branch picker), pytest test_iter13_billing 13/13 serial (updated stale label asserts; parallel failures = known xdist flake).

## Update — Jul 8 (part 73) — Group Dashboard PIN lock
1. User named the multi-salon combined view "Group Dashboard"; must be PIN-locked, re-locks on refresh (no session persistence).
2. GET /auth/my-salons/overview (server.py): now role-gated (admin/super_admin only) + requires header X-Owner-Pin matching the ACTIVE salon's security_pin_hash (reuses _pin_attempt_guard lockout). No PIN set → open (matches switch-salon convention). 403 "OWNER_PIN_REQUIRED" signals frontend to open the PIN modal.
3. MySalonsOverview.jsx rewritten: locked dark banner + "Unlock Group Dashboard" button → PIN modal → unlocked view with EyeOff re-lock button; state-only (locks on refresh/navigation).
Tested: curl (no-pin 403, wrong-pin 403, pin 4321 → data), screenshot e2e (unlock flow + refresh re-lock).

## Update — Jul 8 (part 74) — Partners panel invisible text + logo upload
1. BUG (user report "can't type"): PartnersPanel inputCls had bg-white but NO text color → inherited white from dark HQ theme = white-on-white invisible typing (typing actually worked, computed color rgb(255,255,255)). Fixed: text-slate-800 + placeholder:text-slate-400.
2. FEATURE: Manual partner logo upload button (Upload icon) next to URL field → POST /super-admin/uploads/photo (existing endpoint, object storage) → fills logo_url + 36px live preview thumb. URL paste still supported.
Tested: computed color rgb(30,41,59), screenshot shows typed text + placeholders, curl upload → {url:/api/files/..}, manual partner create/delete cleanup.

## Update — Jul 8 (part 75) — Super-admin tenant editing, credential resend, branch linking by Tenant ID
1. TenantUpdateIn extended: salon_email, whatsapp_number, owner_name, owner_email, owner_phone. PUT /super-admin/tenants/{tid} now handles owner LOGIN email change: 400 if taken by another user, else updates users.email + propagates owner_email to ALL that owner's tenants.
2. POST /super-admin/tenants/{tid}/resend-credentials: fresh temp pw (_generate_temp_password), must_change_password=True, password_changed_at (kills old tokens), emails _credentials_email_html (new template in email_service) to owner_email + salon_email. Returns temp_password + email_status + affects_salons.
3. Branch linking by unique Tenant ID (works across DIFFERENT owner emails): POST link-branch {branch_tenant_id} → $addToSet users.tenant_ids on THIS tenant's owner; unlink-branch (blocks unlinking owner's active salon); GET linked-branches for modal. Guards: self-link 400, unknown id 404, already-linked 400.
4. Frontend: EditTenantModal.jsx (superadmin/) — copyable Tenant ID banner, details form, amber "Reset password & email new credentials" w/ temp-pw reveal+copy, linked-branch list w/ unlink + link-by-ID input. Pencil button per tenant row in SuperAdmin.jsx.
5. INCIDENT: parallel search_replace calls on server.py raced → corrupted line 5562 + lost TenantUpdateIn edit. Fixed both. LESSON: never edit the same file with parallel tool calls.
Tested: curl (edit fields, email-clash 400, owner email change → login works with NEW email + temp pw + must_change_password + both salons attached, link/unlink/self-link/bad-id, Resend email sent:True), modal screenshot.

## Update — Jul 8 (part 76) — Production deployment failure fixed
1. ROOT CAUSE (readiness timeout): @app.on_event startup ran heavy AWAITED DB work (unique+TTL index creation, migrations, seeding) with NO error handling — on production Atlas any index-option conflict/duplicate key crashes the pod → CrashLoop → "deployment failed to become ready". Preview DB was compatible so it never showed locally.
2. FIX: db-prep moved to background asyncio task (_db_prep) with per-step try/except (indexes/migrations/seeds) — pod passes readiness instantly, failures log as non-fatal.
3. FIX (deployment_agent BLOCKER): CORS wildcard bug — CORS_ORIGINS="*" was filtered out leaving allow_origins=[] which blocks everything. Now '*' → ["*"] (Starlette echoes origin when credentials=True).
4. Quoted TWILIO_PHONE_NUMBER in backend/.env (leading + parse risk).
Deployment agent re-check: status warn (cosmetic env quoting only) — READY TO DEPLOY. Verified: instant startup, db-prep steps logged done, /api/ 200, login e2e 200.

## Update — Jul 8 (part 77) — Code review round 3 applied
VERIFIED STALE/FALSE-POSITIVE (evidence): #1 undefined vars → pylint E0601/E0602/E0606 10/10 + ruff F821 clean. #2 hook deps → eslint exhaustive-deps 0 warnings (report's tool flags module imports like `api` as deps — invalid). #3 localStorage "auth tokens" → auth is httpOnly cookies; Login stores opt-in remember-email only, branch.js stores branch NAME, rest are UI prefs. #4 "empty catches" → all cited are intentional `catch { /* comment */ }` graceful degradation (private-mode localStorage, disconnected printer, invalid session); Login already logs.
FIXED:
1. email_service.py refactor (deferred backlog): _monthly_report_html (cx20→~5) & _weekly_report_html (cx21→~5) rebuilt on shared module helpers: _img_header_row, _growth_chip, _bar_chart_block, _stat_card, _rank_rows, _ranked_section, _report_header/_footer/_hero, _REPORT_SHELL, _weekly_highlights_block, _weekly_tip_block. Behavior verified by assertion script (growth up/down/none, chart skip-week5, escaping, empty stats).
2. routes/registry.py: _registry_profile PII branches → _registry_pii_fields (SEC-001 redaction preserved).
3. Tests: `is True/False` → truthy asserts (ruff E712 --fix, 51 fixed); stale test_duplicate_owner_email_rejected rewritten as test_duplicate_owner_email_links_multi_salon (multi-salon contract from part 71).
DEFERRED (need dedicated UI regression pass): #6 component splits (AppLayout/POS/SuperAdmin/MorningBriefing), #7 hook dep counts, #9 nested ternaries (246+), #10 TypeScript migration; rzp_verify/public_signup_salon left as-is (security-critical linear flows, already partially extracted).
Regression: 186 tests passed serially (billing 13, registry 19, multitenant+iter7 40, +8 sed-touched suites 114).

## Update — Jul 8 (part 78) — make lint + EditTenantModal mobile fix
1. NEW /app/Makefile: `make lint` (ruff backend F,E7,E9 / ruff tests / pylint undefined-vars / eslint) + `make test`. First run caught 9 unused imports (server.py, routes/reports.py, super_admin.py, scripts) — fixed via ruff --fix. All green.
2. Production validated read-only after Publish 64: api root/frontend/public partners/manifest all 200; landing screenshot OK.
3. BUG (user, mobile): EditTenantModal top clipped on phones (flex items-center + tall modal = unreachable top). Fixed: container plain flex + child m-auto pattern. Tenant ID card now full-width TAP-TO-COPY button, ID break-all (no truncation), clipboard fallback (execCommand) for old mobile browsers. Verified 390px viewport.

## Update — Jul 8 (part 79) — Switcher visibility + pinned modal header + shadcn tokens
1. BUG (user): SalonSwitcher dropdown "not visible properly" — ROOT CAUSE: app had NO shadcn CSS variables/token colors (no :root vars, no popover/border/etc in tailwind config) → bg-popover etc compiled to nothing → ALL shadcn dropdowns transparent. Fixed: added full light-theme :root token block to index.css + token colors to tailwind.config.js (additive, zero regression to custom classes). Also SalonSwitcher redesigned: w-[300px], solid white panel, bold dark names w/ wrap, ACTIVE pill, location line, wider trigger on sm+.
2. BUG (user): super-admin EditTenantModal top clipped, couldn't scroll to Tenant ID. Fixed: modal restructured to flex-col max-h-[88vh] with PINNED header (title + tap-to-copy fuchsia Tenant ID card) + independently scrollable body. Verified: ID stays visible with body scrolled to bottom (desktop 861px + mobile 390px).
NOTE: user is seeing PRODUCTION — needs republish to get parts 78-79 fixes live.

## Update — Jul 8 (part 80) — Manual plan change in EditTenantModal
1. New "Plan & subscription" section in super-admin EditTenantModal: current plan badge (amber trial / emerald paid) + valid-till date, single-branch plan dropdown (from GET /super-admin/plans, branches==1 only), optional payment ref, "Activate plan" → POST /super-admin/subscriptions (existing endpoint: replaces active sub, records payment, updates tenant plan/status/end).
Tested: e2e screenshot flow — TEST tenant TRIAL → ANNUAL valid till 2027-07-08.

## Update — Jul 8 (part 81) — Mira TTS cache persisted (public voice chat)
1. Briefing TTS was already two-tier cached (memory + Mongo tts_cache, 48h TTL) — verified, no change needed.
2. NEW _tts_cached_speech(text, voice, speed): sha256 content-hash cache in tts_cache (key "speech:<hash>") — identical spoken replies generated ONCE, TTL refreshed on hit so popular clips stay alive. Re-added hashlib import (was removed as unused in part 78).
3. /public/ai-voice/{slug} now uses it (was generating fresh TTS on EVERY Mira voice reply = per-call OpenAI cost).
Tested live: first call 2.33s (generated, 95KB b64), second call 0.001s from Mongo, identical audio, doc persisted.

## Update — Jul 8 (part 82) — Branch-switch 403 + poster failure fixed (same root cause)
1. ROOT CAUSE: frontend persists tenant slug (localStorage miracurl_tenant → X-Tenant-Slug header on EVERY request). switch-salon updates users.tenant_id but the stored slug stayed on the OLD branch → _apply_tenant_context 403 "Cross-tenant access denied" → dashboard toast + QR poster preview failure.
2. FIX frontend: SalonSwitcher.doSwitch now setTenantSlug + localStorage.setItem with the NEW branch slug before reload.
3. FIX backend (self-heals stale prod clients): security.py _apply_tenant_context — if header slug mismatches active tenant BUT belongs to a salon in user.tenant_ids, silently use the ACTIVE tenant instead of 403. Foreign tenants still 403 (verified).
Tested: curl matrix (stale owned slug → 200 dashboard/poster + tenants/current returns ACTIVE branch; foreign slug → 403), UI e2e switch (no error toast, localStorage updated), 67 security/multitenant/pin tests passed.

## Update — Jul 8 (part 83) — Code review round 4 applied
STALE/FALSE-POSITIVE (re-verified): undefined vars (make lint fully green), hook deps (eslint 0), localStorage (httpOnly cookie auth; prefs only), empty catches (intentional+commented), "is vs ==" claims at server.py:503/621/1543+, pdf.py:90/593, backend_test.py — ALL are `is None` / `is not None`, the CORRECT idiom (report's own prior guidance allows it).
REFACTORED (payment-critical, behavior-verified):
1. subscription_revenue (cx25, 95 lines → ~20-line orchestrator): extracted _revenue_totals, _revenue_trend_30d, _mrr_and_plan_distribution, _churn_30d, _avg_subscription_lifetime, _top_revenue_tenants. OUTPUT DIFF: byte-identical before/after.
2. rzp_webhook (cx14 → linear): extracted _wh_parse_verified_event (HMAC verify+parse), _wh_payment_failed, _wh_refund. (Self-inflicted decorator mixup during edit — caught by lint gate, fixed.)
DEFERRED (unchanged rationale): component splits, TS migration, test type hints, hook dep counts; rzp_verify/public_signup_salon (security-critical, already partially extracted).
Regression: revenue output identical, billing 13 + razorpay-touching suites 43 passed, make lint green.

## Update — Jul 8 (part 84) — Brand sparkle + staff transfer between branches
1. TenantBrandMark (sidebar, ALL tenants): gold shimmer sweep over salon name (bg-clip:text animation), pulsing golden glow on logo, 3 staggered twinkling ✦ sparkles; prefers-reduced-motion safe. CSS in index.css (tenant-name-shimmer / tenant-logo-glow / tenant-sparkle).
2. NEW POST /staff/{sid}/transfer {target_tenant_id} (server.py, near create-login): moves staff profile (tenant_id, clears branch tag, stamps transferred_from/at) + their portal LOGIN user to another salon of the SAME owner (tenant_ids check; super_admin exempt; self-transfer 400; foreign salon 403). History (attendance/invoices) stays with old branch by design.
3. StaffFormModal: "Transfer to another salon" section (edit mode + owner has 2+ salons) — fuchsia select of other branches + confirm dialog; Staff.jsx onTransferred reload.
Tested: curl full cycle (Priya+login MH→WF: staff lists + PUBLIC booking portals /public/staff/{slug} follow instantly, login_moved:true, restored back; foreign 403), UI screenshots (transfer section options correct, sparkle brand mark rendering).

## Update — Jul 8 (part 85) — Rate-limit / brute-force IP spoofing hardened (security audit follow-up)
1. VULN: client_ip() trusted X-Forwarded-For[0] (leftmost) — fully client-controllable. Attacker rotated fake XFF per request to get a fresh rate-limit/brute-force bucket every time → bypassed public booking limits AND login lockout.
2. FIX: security.py client_ip now takes the entry at (len - TRUSTED_PROXY_COUNT) — the hop appended by our OWN trusted proxies, ignoring everything left (attacker junk). idx<0 guard → parts[0].
3. Verified Emergent infra = 3 trusted hops (Cloudflare→LB→ingress); real client IP is always what CF appends regardless of injected header. Default TRUSTED_PROXY_COUNT=3, env-overridable.
Tested: unit (spoof/legit/multi-hop → correct IP), live curl (injected 6.6.6.6 ignored), brute-force with rotating XFF now LOCKS at attempt 6 (was: never). 37 security/auth tests pass. make lint green.
NOTE: test_book_public_flow::test_full_booking_flow fails on customer_referral_code=None — PRE-EXISTING (fails identically on git stash), unrelated to this change.

## Update — Jul 8 (part 86) — HQ Security card (login-attempt visibility)
1. Lockout policy (platform-wide, all tenants): 5 failed attempts per account+IP → 15-min lock (routes/auth.py). Reset on success.
2. NEW GET /super-admin/security/login-attempts: parses login_attempts (identifier "ip:email") → recent failed activity, locked_now count, policy. POST /super-admin/security/clear-lockout {identifier} for manual unlock (genuine owner forgot password).
3. NEW SecurityCard.jsx + "Security" tab in SuperAdmin HQ: dark card, policy summary + locked-now count, per-row IP/email/fail-count/time-ago, red highlight + Unlock button for active locks, "watched" for expired, refresh.
Tested: curl (seed 5-fail lockout → locked_now:1, clear → 0), UI screenshot (locked hacker@evil.com w/ Unlock + watched rows). make lint green. Test lockouts cleaned.

## Update — Jul 8 (part 87) — Permanent tenant delete (test-salon cleanup)
1. Clarified to user: preview & production are SEPARATE databases; test tenants don't cross over. "abhi/kolhapur" was created on prod.
2. NEW DELETE /super-admin/tenants/{tid}/permanent?confirm=<slug> (server.py): HARD delete. Wipes all 26 tenant-scoped collections (customers, invoices, appointments, staff, subscriptions, sms_pack_payments, pin_attempts, partner_overrides…) by tenant_id, plus owner users (single-salon → deleted; multi-salon/super_admin → unlink branch + reassign active tenant_id). Requires exact slug in ?confirm= (400 otherwise). Logs warning w/ record counts. Existing soft delete (cancel) unchanged.
3. Frontend SuperAdmin: 2nd trash button per row (bold, red-fill hover) → prompt requiring typed slug → permanentDeleteTenant → toast with records removed.
Tested: create throwaway tenant + customer → wrong-slug 400 → correct delete removes {customers:1,users:1,tenants:1} → tenant gone from list + owner login 401. make lint green.

## Update — Jul 8 (part 88) — Mira Social Studio COMPLETE (backend + frontend, tested)
1. Backend routes/mira_studio.py (built prev session): 12-agent registry, Orchestrator (LLM intent routing), social/generate (multi-platform posts + gpt-image-1 promo image), text agents (content/seo/sales/video/email), data agents (analytics/leads/staff-verification), connection status via social_connections collection.
2. THIS SESSION: Added missing route in App.js (nav link existed but route was never registered — page was unreachable). Route: /mira-studio, OwnerOnly.
3. Replaced window.prompt with a proper topic modal (data-testid mira-topic-modal/input/go/cancel). Data agents (analytics/leadfinder/staff_verify) run instantly without prompt.
4. Tested: testing agent iteration_56 — 12/12 backend pytest pass (new regression file /app/backend/tests/test_mira_studio.py), all frontend flows pass (nav, orchestrator chat, topic modal, analytics instant run, CONNECT/READY badges). 100% success.
5. Still mocked/pending: social/whatsapp/google agents show "Connect" badge — real auto-posting needs OAuth (P2 in ROADMAP).

## Update — Jul 8 (part 89) — Social OAuth infra + Mira Content Calendar (iter57, 26/26 tests)
1. NEW routes/social_connect.py: Meta OAuth (FB dialog → code → long-lived token → pages+IG discovery → page picker), Google Business OAuth (offline refresh tokens, account/location auto-discovery, api_ready flag for pending GBP approval), publish_content() (FB /photos + IG media→poll→publish), Google reviews list/reply + AI draft-reply. Tokens per-tenant in social_connections; state CSRF via oauth_states. Callbacks are public, redirect to /settings?social=*.
2. NEW routes/mira_calendar.py: POST /mira-studio/calendar/plan (LLM plans 7 days w/ Indian festivals), GET/PUT/DELETE items, POST /{id}/publish (gen image + auto-post; guard 400 if not connected). Replan preserves approved items.
3. env: META_APP_ID, META_APP_SECRET, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET added (EMPTY — user must create Meta dev app + Google Cloud OAuth client; GBP API also needs Google approval ~2wks). UI degrades gracefully: "Setup required" amber states, disabled Connect buttons.
4. Frontend: SocialConnectionsCard in Settings (connect/disconnect/page-picker/status toasts), MiraCalendar component (plan/approve/edit/skip-with-restore/post-now), MiraStudio tabs (AI Agents | Content Calendar), PostNowButton on social results when connected, GReviewRow (live Google reviews + AI reply drafts) when google connected.
5. Tested: iteration_57 — 26/26 backend + all frontend flows pass (incl. tenant isolation, bogus-state redirect, publish guards). make lint green.
6. MSG91: told user where to get Authkey (control.msg91.com → Settings → Authkeys) + DLT prerequisites. Still waiting for key.

## Update — Jul 8 (part 90) — MSG91 SMS provider integrated (authkey verified)
1. Rewrote sms_service.py as dual-provider: SMS_PROVIDER env selects msg91 (Flow API v5, needs MSG91_AUTHKEY+MSG91_SENDER_ID+MSG91_FLOW_ID; template must contain ##message## var) with Twilio fallback. send_sms(to, body) signature unchanged — zero caller changes.
2. .env: MSG91_AUTHKEY=<set, verified live against control.msg91.com — returns success>, MSG91_SENDER_ID/MSG91_FLOW_ID empty (awaiting user DLT approval), SMS_PROVIDER=twilio for now. To switch: fill sender+flow, set SMS_PROVIDER=msg91, restart backend.
3. Gave user full step-by-step guides for Meta App ID/Secret (FB page + IG business link + developers.facebook.com app + redirect URIs for preview & prod) and Google OAuth Client ID/Secret + GBP API access application (2wk approval).
4. Awaiting from user: Meta App ID+Secret, Google Client ID+Secret, MSG91 Sender ID+Flow ID.

## Update — Jul 9 (part 93) — Email campaigns, branded template, Promo Video Studio
1. Email Marketing Agent upgraded: _clean_newlines fixes literal \n bug; new endpoints POST /mira-studio/email-campaign/preview (branded HTML via email_service.marketing_email_html — luxe onboarding-style template) and /send (audience all|winback, {name} personalization, 7-day campaign cooldown, cap 100, logs lead_outreach channel 'campaign'). Frontend EmailCampaignPanel: iframe preview + audience select + Send button. TESTED: sent 2 real emails via Resend.
2. marketing_email_html moved to email_service.py; autopilot uses it (deleted local _offer_email_html).
3. NEW Super-Admin "Promo Video" tab (routes/promo_video.py + PromoVideoStudio.jsx): generates HD 1080x1920 Instagram reel — LLM script (Staff Verification Portal focus), OpenAI TTS shimmer voiceover (en/hi), 4 gpt-image-1 scenes (+optional owner photo as opening), PIL gold caption bands, ffmpeg Ken-Burns render (imageio-ffmpeg static binary in requirements.txt for prod). Async job flow (promo_videos collection, poll status). TESTED end-to-end: 26s video, 2.7MB, h264+aac faststart, frame verified visually.
4. Meta keys added & validated (app 2823458498027077 — token exchange OK); Google keys added earlier; both Connect buttons live in preview. User still to: register Meta redirect URIs, connect accounts on prod after deploy.
5. User env note: production still on old deploy — user must Deploy to get all of this + env keys.

## Update — Jul 9 (part 94) — "Mira presents" feature-tour videos + test leads + WA formatting
1. Promo Video Studio: new mode "feature_tour" (default) — Mira HERSELF hosts the reel: first-person voiceover ("Hi, I'm Mira!") touring ALL features. Fixed HD presenter scenes generated from her actual avatar (frontend/public/mira-bot.png) via Gemini image edit → /app/backend/assets/mira_intro.png & mira_outro.png. Mira opens+closes every video; owner photo optional (scene 2); 2-3 AI middle scenes. TESTED: 44s video verified frame-by-frame. Caption font fix (✦ → removed, FreeSansBold lacks glyph).
2. WhatsApp win-back messages now use rich formatting (*bold*, _italics_, line-per-line, booking link auto-appended).
3. Resend rate-limit fix: 0.6s pacing between sends in autopilot + campaign loops (was silently dropping 3rd+ email — "Too many requests").
4. Test leads added for user (bablukumar.cs14@gmail.com, im.miracurl@gmail.com, atul.katiyar18@outlook.com — all 3 emails SENT & verified; WhatsApp lead 7406869271 queued in Auto-Pilot with designed message).
5. requirements.txt updated (imageio-ffmpeg for production ffmpeg).

## Update — Jul 9 (part 95) — Software Leads Inbox + sidebar + follow-up suite (iter59, 100%)
1. PUBLIC /partner landing page (PartnerLanding.jsx): dark luxe hero + Mira, 6 feature cards, demo-request form (name/phone/email/salon/preferred_time/message) → POST /api/public/partner-inquiry (rate-limit 5/10min/IP) → tenant_inquiries with source partner_page + lead alert email. White-input fix for dark global styles.
2. Super Admin Leads & Inquiries follow-up: 'Thank-You + PDF' (branded email + 4-page brochure PDF from services/brochure.py — real app screenshots in /app/backend/assets/brochure/, Mira cover, features+contact page, lru_cached; 5-min resend cooldown) and 'Meet invite' inline form (date/time IST + meet link → email w/ RFC5545 .ics attachment, status meeting_scheduled + meeting object). Lead cards show source/salon/preferred-time/brochure-sent/meeting badges.
3. Super Admin layout: overlapping top tabs → LEFT SIDEBAR (12 items, badges, lg:sticky, mobile horizontal scroll).
4. Auto-Pilot post card: Download image + Copy caption+#tags + hashtags display + step helper.
5. Weekly Monday auto-reel scheduler (promo_video.weekly_promo_scheduler, week_key idempotent) → hq_messages notification.
6. Tested: iteration_59 — 12/12 backend, 100% frontend. Emails verified to user's real gmail (thank-you PDF + ICS invite for Bablu Kumar lead).

## Jul 9, 2026
- Dashboard Background Animation (user request): added `DashboardAurora` component — 3 flowing aurora ribbons (gold/rose/sky, blurred radial gradients) + 22 twinkling drifting sparkles. Scoped to main Dashboard page only (per user choice). Pure CSS keyframes in index.css (`dash-flow-*`, `dash-sparkle-twinkle`), respects prefers-reduced-motion, pointer-events-none, -z-10 with `isolate` on dashboard root. Verified via authenticated screenshot (layer + 22 sparkles present, no layout breakage).

## Jul 9, 2026 (branding)
- New Rose-Gold "curl swirl" brand logo (AI-generated, user-approved). Assets: /app/frontend/public/brand/miracurl-rosegold-{icon,full}.png (chroma-keyed to true transparency).
- BrandMark.jsx rewritten: swirl icon image (float + sparkle) replaces scissors pill; sub-label now "AI Salon Suite" with gradient AI tag; CURL wordmark shimmer recolored rose-gold.
- Login page rebranded rose-gold: blobs, button gradient (rose→pink→amber), rose input fields/links, "✦ AI Powered Salon Suite ✦" tagline, gold sparkles.
- Favicon + all PWA icons regenerated: consumer (cream bg), admin (dark bg), maskable 60% safe-zone, apple-touch-icon, favicon.svg (embedded PNG). All verified 200.
- Super Admin: header Crown replaced with rose-gold swirl logo; new "Brand Kit" sidebar tab (BrandKitPanel.jsx) — 6 logo asset cards with download buttons, Brand Kit PDF download, color palette & usage notes. Assets served from /brand/ (relative, works in preview & prod).
- Brand consistency: rose-gold logo added to lead brochure PDF (cover top-center, page headers, contact card) and promo videos (top-right watermark on every frame via _caption_frame). Assets: /app/backend/assets/brand_logo{,_full}.png. Verified by rendering PDF pages (PyMuPDF) + test frame; backend restarted to clear lru_cache.
- Promo video stuck-spinner fix: (1) status endpoint marks jobs 'generating' >12 min as failed with clear retry message; (2) startup cleanup in weekly_promo_scheduler marks orphaned 'generating' jobs failed after server restart/deploy. Both verified with fake stale job (curl + restart test).
- Promo Video Studio v2: (1) Express mode (~1 min: real app screenshots letterboxed on dark canvas, no AI image gen) vs AI Scenes mode; (2) parallel TTS + scene generation (AI scenes via asyncio.gather); (3) size options reel 1080x1920 / square 1080x1080 / landscape 1920x1080 (dynamic caption font/wrap); (4) Resend email to HQ_EMAIL on completion & failure. E2E tested: express reel generated in <70s (4.6MB), frames verified with logo watermark + screenshots + captions. UI: size + speed selectors (data-testid promo-size-*, promo-speed-*).
- Code review pass (Jul 9): fixed circular import (mira_autopilot lazy imports), split _build_scenes (promo_video) and _create_daily_post (mira_autopilot) into focused helpers. Verified false positives documented in CODE_QUALITY.md: "hardcoded secret" = public OAuth scope URL; "34 undefined vars" = pyflakes reports zero; localStorage stores email/prefs only (auth = HTTPOnly cookies); flagged hook deps are module imports/browser globals; "empty catches" all carry intent comments. Large component splits remain deferred to a dedicated regression pass.
- Super Admin new tools (routes/platform_tools.py): (1) Platform Load panel — GET /super/platform-load (tenants by status, today's AI calls/autopilot posts/win-back emails/promo videos/invoices/bookings, SMS points balance, storage MB, db totals); (2) Database panel — collection browser (GET /super/db/collections, GET /super/db/{coll}/docs with search+pagination), single-doc delete, purge-all with typed confirmation; users/tenants/meta/system_flags/subscriptions purge-protected. Tenant admins blocked (403 verified). UI tabs: super-tab-load, super-tab-database. Bug fixed during build: useEffect returning a Promise crashed panel ("destroy is not a function"). Lesson noted: never run parallel search_replace edits on the same file (two edits clobbered each other twice this session).
- Security audit (Jul 9): PASS — no exploitable issues. Fixed the single LOW finding: DB browser search now re.escape()s the term, caps at 60 chars, and applies 4s maxTimeMS on count/find (routes/platform_tools.py). Verified: literal metachar search returns 0 without hanging. P3 notes documented: never set CORS_ORIGINS="*"; /api/files/{id} is UUID-token public serving (fine for images, not private docs).
- Promo video multi-worker fix: _progress now writes updated_at heartbeat; watchdog + startup cleanup only fail jobs whose last heartbeat is older than 12 min (fresh jobs survive new-worker startups/deploys of other workers). Verified via restart test: t-fresh survived, t-stale failed.
- Promo video hardening v3: _run_ff captures ffmpeg stderr into error messages; automatic safe-mode retry at 66% resolution on render failure (for memory-constrained prod); step timeouts (script 120s, tts+scenes 360s, render 420s); _fail_job helper ensures EVERY failure path (incl. watchdog flip) sends the Resend failure email. E2E verified: express reel generated successfully (4.5MB).
- API performance: added GZipMiddleware (min 1500B). Measured: /api/invoices 105KB->9.1KB (11x), /api/appointments 67KB->8.9KB, /api/customers 55KB->7.5KB; response times ~3x faster; mobile networks benefit most. Hot-collection indexes verified present.
- Email link env fix: promo job now stores base_url captured from x-forwarded-proto/host at creation; ready-email links to the environment that generated the video (preview emails were linking to production files -> "File not found"). Verified: preview job captured preview base_url; download 200 (4.4MB).
- Partner page: trust badges added under hero ("Loads in under a second — even on 3G" + "Bank-grade security · Independently audited"), data-testid partner-trust-badges. Screenshot verified.
- Upload fix for Super Admin: /api/uploads/image now accepts super_admin (stores under tenants/superadmin/) and added kind=promo to the allowlist; tenant admin flow unchanged (regression tested). Was failing with "No tenant context" on Promo Studio photo upload.
- Full-suite reel emailed to HQ_EMAIL as 4.5MB attachment (Resend id 69fd8ff9).
- Greeting line: PromoIn.greeting — LLM weaves founder intro into voiceover; photo scene caption uses greeting. UI input appears when photo uploaded (promo-greeting-input).
- AI Poster Studio (routes/promo_image.py + PromoImageStudio.jsx, tab super-tab-posters): POST /super/promo-image (topic+size square/story/wide) -> LLM copy (headline/subline) + gpt-image-1 background + PIL compose (dark gradient band, rose-gold logo top-right, auto-fit headline, subline, /partner URL). GET /super/promo-images gallery with download. E2E tested, poster verified visually; headline auto-fit added after overflow spotted.
- Sparking speed badge: badge-glow + badge-zap keyframes on partner page badge.
- NetSpeedIndicator.jsx: pings /api/ every 30s, colored wifi icon + ms (green<400/amber<1200/red/offline) in AppLayout header (all admin dashboards) + SuperAdmin header. Verified live (890ms amber).
- Deploy-failure investigation: deployment_agent scan = deployment-ready, Cloud Build failure was transient (retryable). Fixed the one WARN: /auth/my-salons/overview now uses $group aggregation instead of fetching up to 50k invoice docs per tenant (verified: month total 239127.64 via aggregation, X-Owner-Pin flow intact).
- Weekly Monday auto-generation now also creates a matching square poster (generate_poster_core extracted in promo_image.py, called from weekly_promo_scheduler after reel success; HQ inbox note mentions poster). Endpoint refactored to use the shared core; posters list verified.
- Publish 90 (110a409) succeeded — production now on latest build.
- Monday auto-post to Meta: publish_video() added in social_connect.py (IG REELS create->poll->publish + FB page video via file_url); _auto_post_weekly + _hq_social_tenant in promo_video.py (tenant via HQ_SOCIAL_TENANT_SLUG env [set to miracurl-marathahalli] -> HQ_EMAIL owner -> single connected tenant). Posts poster (publish_content) + reel (publish_video) with marketing caption + /partner link; results appended to HQ inbox note. Verified in preview: tenant resolution OK, graceful skip when Meta not connected (real posting validates on production where Meta IS connected — first run next Monday).
- Security audit #2 (changed code): PASS, no material issues. Hardened both P3 items: (1) base_url from request headers now only trusted for *.emergentagent.com or APP_PUBLIC_URL host, else falls back to APP_PUBLIC_URL; (2) meta oauth error logging scrubbed (no query string / token in logs). Verified base_url capture still works for preview host.
- Slow-CPU production fix for video: per-scene heartbeats via run_coroutine_threadsafe (watchdog no longer kills slow-but-alive renders; UI shows "Rendering scene x/6"), fps 25->20, crf 27, render timeout 1500s. E2E: 3.0MB reel in 50s (was 4.5MB/70s). Note: ultrafast preset tried and reverted (30.8MB file).
- Poster v2: real dashboard screenshot in gold-glow rounded card is now the subject (BROCHURE_DIR/dashboard.png), ambient AI background, feature strip "Bookings · POS & GST Billing · Verified Staff · AI Marketing", tighter fonts. Verified visually — exactly addresses user's complaint that posters didn't show the software.
- Partner page: "Security you can trust" section (3 cards: audits passed, per-salon isolation, HTTPOnly sessions), data-testid partner-security-section. Screenshot verified.

## Iter 60–61 (10 Jul 2026)
- **Fixed** backend-blocking lint/import error in `routes/registry.py` (`require_super_admin` import).
- **HQ Staff Verification (Super Admin)**: `POST/GET/DELETE /api/super/registry/staff` + new `VerifiedStaffPanel.jsx` (sidebar tab "Staff Verification"). Super admin records another salon's staff (name, phone, optional Aadhaar, salon name, role, years, comment) → appears on the public registry with gold "✦ HQ Verified" badge (profile + employment level, `RegistryPublic.jsx` + `StaffRegistry.jsx`).
- **Mark as Left (Salon Owner)**: `PUT /api/registry/employments/{rid}/mark-left` (reason/rating/comment; 400 if already left, 404 cross-tenant, 422 invalid reason). StaffRegistry UI: "Mark Left" button → modal → staff moves to "Past Staff — left your salon" section; stays on public portal.
- **Subscription plan change**: confirmed already live via EditTenantModal → POST /super-admin/subscriptions (testids change-plan-select/btn).
- **Employee ID Cards (Iter 61)**: New `routes/id_cards.py` + `_render_id_card_pdf` in `services/pdf.py` (navy+orange badge design per user screenshot: logo, circular photo w/ orange ring, name, role pill, ID no, email/phone, blood group, Code128 barcode, website strip). Salon: `GET /api/id-cards/staff/{sid}/pdf` (tenant logo + booking link, active staff only) with "Employee ID Cards" section on Staff page. Super admin: `GET /api/super/id-cards/{eid}/pdf` (Miracurl logo only, per user choice) with ID Card button per verified record. Added optional `blood_group` field to Staff model + form (select A+/A-/…/O-). Miracurl logo copied to `/app/backend/assets/miracurl-logo.png`.
- Testing: iteration_60.json — 100% backend + frontend pass. ID cards curl-verified + PDF visually verified (fitz render) + blood group persistence verified.

## Iter 61b (10 Jul 2026) — QR verification on ID cards
- ID card PDFs now carry a "SCAN TO VERIFY" QR (bottom-right, next to the barcode) linking to the public registry: `{APP_PUBLIC_URL}/staff-registry?q=<phone>` (staff-code+name fallback when no phone). Renderer: QrCodeWidget in `_render_id_card_pdf` (`services/pdf.py`); URL built by `_verify_qr_url` in `routes/id_cards.py`.
- `RegistryPublic.jsx` supports deep-links: `?q=&name=` auto-runs the search on load.
- Verified: QR decoded via pyzbar to correct URLs on both salon & HQ cards; deep-link screenshot shows auto-search + HQ badge.

## Iter 62 (10 Jul 2026) — Editable Plan Catalog
- New "Plan Catalog — Edit Prices" card in Super Admin → Billing & Subscriptions (`PlanCatalogEditor` in BillingPanel.jsx). All 8 plans: editable name + price, per-row Save (enabled only when changed), confirm dialog. Uses existing `PUT /api/super-admin/plans/{key}` (DB `plan_overrides`, survives restart). New prices apply to new subscriptions/renewals incl. Razorpay; running subs unaffected. Curl-verified (edit 12000→13000→restore) + UI screenshot verified.

## Iter 63 (10 Jul 2026) — Miracurl Team + Promo speed fix
- **Miracurl Team section** (Super Admin sidebar, Crown icon): CRUD for HQ's own team (`hq_team` collection, `/api/super/team*` in id_cards.py) with "Add myself as CEO" prefill, photo upload, blood group. Rose-gold Miracurl ID cards (`MC-0001` codes, QR → company site, accent param + qr_label added to `_render_id_card_pdf`). Clarified Staff Verification copy (for salons NOT on the software).
- **Promo video production timeout fix**: Express mode now renders still-image segments (`-loop 1 -tune stillimage -preset ultrafast`) instead of zoompan — E2E generation verified at **22s** in preview (was minutes; prod was timing out at 4min+/scene). AI-scenes mode keeps zoompan but ultrafast/crf28. `motion` param threaded through `_render_video(_at)`.
- Earlier same day: promo heartbeat every 45s (no false "interrupted"), started/finished/duration timestamps in job + live elapsed UI, fixed undefined `delVideo` crash.

## Iter 63b (10 Jul 2026) — Deployment History
- Super Admin sidebar tab "Deployments" (Rocket icon): release cards tagged MIRA-DEPLOYED-<date> with change bullets and per-entry delete (soft delete — survives re-sync). Data ships with the code in `/app/backend/release_notes.py` (append entries on deploy-worthy changes), synced to `deploy_releases` collection via `routes/releases.py` (GET/DELETE /api/super/releases). Hint shown when >10 entries.
- Promo history panel now ALWAYS visible with empty-state message (production confusion fix).
- Testing: iteration_61.json — 100% backend + frontend pass across ID cards, blood group, Miracurl Team CRUD, releases, plan editor, promo history, regressions. NOTE for future agents: keep release_notes.py updated with each deployment-worthy change.

## Iter 64 (10 Jul 2026) — Build status + ultra-light Express render
- `BUILD = "2026-07-10.3"` constant in release_notes.py + `GET /api/super/version`. Deployments panel shows a dark "This server is running: <tag> · build <BUILD>" banner + "On this server" badge on the matching release card → user can compare live vs preview builds. IMPORTANT: bump BUILD on every deploy-worthy change.
- Express promo render rewritten as ONE ffmpeg concat-slideshow pass (still frames, ultrafast, stillimage tune) at 2/3 resolution (720x1280 reel) — E2E verified 19s in preview. AI-scenes mode keeps zoompan and now reports per-scene seconds in progress text ("scene 1 took Ns") for prod CPU diagnosis.
- Production analysis: user's screenshots prove prod HAS the new build (tabs visible) — remaining slowness is weak prod CPU; this build minimizes CPU work.

## Iter 64b (10 Jul 2026) — AI Scenes production fix (build 2026-07-10.4)
- Root cause of AI Scenes dying on prod: full-HD zoompan render saturated the small prod CPU → liveness probe failed → container restart mid-job ("Generation was interrupted"). Express survived because it's light.
- Fix: ALL modes render at 2/3 resolution (720x1280 reel); ffmpeg runs under `nice -n 15` with `-threads 1` so the API process stays responsive (no probe-failure restarts). E2E verified: AI-scenes reel done in <1 min in preview.
- BUILD bumped to 2026-07-10.4 (user must Deploy).

## Iter 65 (10 Jul 2026) — Live public pricing (build 2026-07-10.5)
- New public endpoint `GET /api/public/plans` (subscriptions.py) exposing effective PLAN_CATALOG (with overrides).
- Landing.jsx pricing section now fetches live prices: half_year & annual cards show catalog prices, annual "save ₹X" auto-computed (2×half − annual), multi-branch "from ₹X" + per-line built from 2/3/5-branch prices. Static values remain as fallback if fetch fails.
- Verified: PUT annual 22000 → public page showed ₹22,000 / save ₹2,000; restored to 20000. BUILD bumped to 2026-07-10.5.

## Iter 66 (10 Jul 2026) — Booking demo video + poster delete + real testimonials (build 2026-07-10.6)
- **Testimonials**: routes/testimonials.py (public GET /api/public/testimonials + super CRUD, seeded with the 2 real partners) + TestimonialsEditor.jsx (needs mounting in PartnersPanel + Landing wiring — VERIFY: Landing may still use static TESTIMONIALS; editor component created but check if imported into PartnersPanel).
- **Demo carousel refreshed**: frontend/public/demo/*.jpeg recaptured from CURRENT app (dashboard, pos, appointments, mira booking page with chat open). Playwright chromium installed locally for captures.
- **AI Booking demo video mode** (`mode: "booking_demo"`): 6 real booking-flow screenshots in backend/assets/booking_demo (hero, Mira chat x2 booking Botox, Botox service selected, time picked, details with name Priya) + Mira intro/outro; always fast still-render; new UI button promo-mode-booking. E2E verified: 29s reel with voiceover in ~10s generation. Botox Hair Treatment service (₹3500, Skin) added to miracurl-marathahalli.
- **AI Posters**: Delete button per poster (endpoint existed). Cleaned 44 TEST review names/comments in DB (public page now shows realistic reviews).

## Iter 67 (10 Jul 2026) — Tenant Diagnose & remote cache clear (build 2026-07-10.7)
- routes/diagnostics.py: GET /api/super/tenants/{tid}/diagnostics (db ping, per-collection counts w/ thresholds→issues, stuck flyer jobs, last activity, uploads MB) + POST /clear-cache (deletes stale oauth_states, fails stuck flyer jobs, purges 90d+ public_ai_messages, sets tenants.cache_reset_at) + public GET /api/public/cache-version (X-Tenant-Slug).
- DiagnoseTenantModal.jsx + Stethoscope button per tenant row in SuperAdmin.jsx (diagnose-tenant-{id}).
- AppLayout.jsx: on load compares /public/cache-version vs localStorage mira_cache_v — on change unregisters service workers, clears CacheStorage, reloads once (remote device cache purge).
- All curl + UI verified. Wired earlier-pending testimonials (TestimonialsEditor into PartnersPanel, Landing fetches /public/testimonials — verified live).

## Iter 68 (10 Jul 2026) — Onboarding Image templates + overflow fix (build 2026-07-10.9)
- Fixed name overflow: `fitFont()` auto-shrinks the salon-name font until the longest (hyphenated) word fits — verified with a very long single-word name.
- 4 templates in OnboardingStudio.jsx (rewritten): Classic Center, Royal Frame (double border + ❖ corners), Modern Bold (left-aligned, feature bullets), Golden Badge (badge circle + ribbon). Template picker UI (onboard-template-{id}); AI background reused across templates.
- Earlier in session: tenants table Actions column pinned sticky-right + overflow-x-auto (was clipped by overflow-hidden — the "missing stethoscope" bug), build 2026-07-10.8.

## Iter 69 (10 Jul 2026) — Growth pack: What's New popup, auto renewal reminders, referral tracking (build 2026-07-11.1)
- **What's New ✨ popup** (owner-facing): GET /api/whats-new in routes/releases.py filters latest RELEASES entry (hides "Super Admin:/Deployments:/Platform:/Miracurl Team:" items). WhatsNewModal.jsx mounted in AppLayout (admin role), shows once per BUILD (localStorage mira_whats_new_build), WhatsApp share button, 1 retry on 401 (tenant ctx race).
- **Automated renewal reminders 15/7/1 days**: run_renewal_reminders() in routes/subscriptions.py — emails owner (renewal_reminder_email_html in email_service.py, Razorpay CTA → /settings, shows affiliate credits), idempotent per (tenant, end_date, days_mark) via renewal_reminder_log collection, builds wa.me deep link per reminder. Daily scheduler _renewal_reminder_scheduler (10:00 IST, system_flags). Super admin: POST /super-admin/renewals/run-auto-reminders + GET /reminder-log; "Automated reminders — ON" card w/ Run-now + log + WA links in LeaderboardRevenue.jsx.
- **Referral tracking**: GET /api/super-admin/affiliates/referrals (items + stats pending/credited/credited_inr, referrer_name join, legacy no-status → credited). Referral tracking table in Top Referrers tab; ReferEarn.jsx shows per-referral status chip (⏳ Pending first payment / +₹1000 credited).
- Tested: iteration_62.json — 17/17 backend, 100% frontend.

## Iter 70 (10 Jul 2026) — Mira Day-Smart Offers + AI CCTV Analytics
- **Mira Day-Smart Offers** (routes/day_offers.py): weekday strategy matrix (Mon-Thu aggressive 20-35%, Fri-Sun upsell/no-discount), context from real catalog + last-60d invoice weekday counts + slow-movers; GET /day-offers/today, POST /suggest, /suggest-another, /accept (locks offer for IST day + generates flyer via routes/offer_flyer.create_flyer). MiraDayOffer.jsx card on Dashboard (owner): suggest → reasoning+services+discount → accept → Download poster + WhatsApp caption share. day_offers collection.
- **AI CCTV Analytics** (routes/cctv.py): snapshot-based (NO video streaming — weak prod CPU safe). Vision = gemini-3-flash-preview via emergentintegrations ImageContent. Two modes: device (tablet capture page uploads frame) / snapshot_url (scheduler polls DVR ISAPI w/ httpx DigestAuth, business-hours 9-21 IST, per-tenant interval, _cctv_poll_scheduler 120s tick). Detects waiting_customers, chairs_empty, queue_length, staff_idle, scene_notes. cctv_config + cctv_observations collections; last frame preview (≤400KB b64 stored in config doc). GET /cctv/latest returns obs + IST hourly trend. Frontend: CctvAnalytics.jsx (/cctv, nav "AI CCTV"), CctvCapture.jsx (/cctv-capture fullscreen: getUserMedia env camera, canvas 960px JPEG q0.7, wake lock, interval loop). User has Hik-Connect — share-QR unusable by servers; Hik note + ISAPI URL instructions in setup UI.
- Tested: iteration_62.json covered both features (LLM suggest live-tested Saturday upsell; vision frame analysis verified; flyer accept e2e generated poster).

## Iter 71 (10 Jul 2026) — Staff Hiring Marketplace + CCTV→Flash Offers (build 2026-07-11.2)
- **Hiring Marketplace** (routes/hiring.py): hiring_requests + job_applications collections. Owner: POST/GET /hiring/requests (+/close) — sees only HQ-curated candidates (status beyond 'applied'). Public: GET /public/jobs (salon name HIDDEN = "Verified partner salon"), POST /public/jobs/{rid}/apply — phone verified against registry_employees (403 unknown, 409 dup). HQ: GET /super-admin/hiring (overview + new_applications badge), /mark-seen, /candidates?q= (registry search), /propose (shortlisted, source hq_proposed), PATCH /applications/{aid} (trial_date→trial_scheduled; hired→closes parent request). Frontend: HireStaff.jsx (/hire, nav "Hire Staff"), JobsBoard.jsx (/jobs public), HiringPanel.jsx (Super Admin "Hiring" tab w/ badge, shortlist/trial/hire/reject/WhatsApp actions, propose search).
- **CCTV→Flash Offers**: cctv.py _maybe_flash_alert (chairs_empty>=3 across 2 frames/90min, business hours, 1 alert/day → flash_alerts). day_offers.py: _suggest_offer(kind="flash") urgent 2-hour prompt; GET /day-offers/flash-alert, POST /day-offers/flash-suggest; /today filters kind!=flash; accept marks alert accepted. MiraDayOffer.jsx rewritten with shared OfferBlock + red flash banner ("Mira spotted N empty chairs").
- Tested: iteration_63.json — 19/19 backend, 100% frontend. Known backlog: registry phone lookup full-scan (fine ≤ few hundred), my_requests N+1.

## Iter 72 (10 Jul 2026) — Security audit fixes (audit verdict was FAIL → all findings fixed)
- SEC-001 HIGH SSRF: cctv.py snapshot_url now validated with registry.is_safe_public_url (blocks private/loopback/metadata IPs) at save AND fetch time; removed verify=False; follow_redirects=False.
- SEC-002 MED enumeration: /public/jobs/{rid}/apply — public_rate_limit 6/hr/IP, requires name matching registry (_name_matches token match), uniform generic 200 for unknown/mismatch/duplicate (no signals). JobsBoard.jsx apply modal now asks name + phone.
- P3s: forgot-password rate limit 5/hr/IP; hiring candidate search re.escape($regex); CORS never wildcard+credentials; public chat poll/send require ?k=session_key when thread has one (BookingChatWidget sends it; legacy keyless threads still work).
- Verified: metadata/localhost URL → 400, generic apply responses, 429 on 5th+ attempt, chat 403 without key, cookie login still works.

## Iter 73 (10 Jul 2026) — Super Admin mobile responsiveness fix
- User report: Super Admin dashboard unusable on iOS/Android. Root cause: fixed-width header (badge+NetSpeed+Sign Out forced >390px width → whole-page horizontal overflow/clipping).
- Fix in SuperAdmin.jsx: responsive header (px-3, smaller logo/title, Super Admin badge hidden <sm, NetSpeed hidden <md, Sign Out icon-only <sm, email hidden <lg), main px-3 on mobile, root overflow-x-hidden. Referral tracking table wrapped in overflow-x-auto (min-w-560px).
- Verified via 390x844 viewport: scrollWidth 390 = innerWidth (no overflow) on tenants + hiring tabs.

## Iter 74 (11 Jul 2026) — Hiring marketplace refinements
- DELETE /hiring/requests/{rid}: owner can delete CLOSED requests only, guarded by Owner Security PIN (reuses server.require_owner_pin via runtime import + pinApi/X-Owner-Pin on frontend). Trash button replaces X on closed requests in HireStaff.jsx.
- Candidate picker upgrade (GET /super-admin/hiring/candidates): params role/status(all|left|active)/request_id. Employment status derived from latest registry_employment (empty to_date = active). request_id excludes the requesting salon's OWN active staff; propose endpoint also blocks them (400). Returns distinct roles for dropdown.
- HiringPanel ProposeBox: role dropdown + All/Available(left)/Working chips + status badges (green "✓ Available · left X" / amber "Active @ X").
- Verified via curl: PIN gate (wrong 0000→403, 4321→200), open-request delete blocked, own-staff exclusion, role/status filters. UI smoke passed.

## Iter 75 (11 Jul 2026) — Domain prep + candidate ratings
- Added https://miracurl-suite.com to default CORS_ORIGINS (user bought new domain; Emergent supports 1 custom domain per deployment — user advised replace or 2nd deployment slot; APP_PUBLIC_URL env change pending if they switch primary domain).
- Propose list now shows ⭐ avg rating (+count) and latest review snippet per candidate (computed in _candidate_profiles from registry_employments rating/comment). Verified: Ravi Test Kumar ⭐4.5 (2) w/ review.

## Iter 76 (11 Jul 2026) — Primary domain switch + shareable candidate profiles
- Primary domain → https://miracurl-suite.com: backend/.env APP_PUBLIC_URL updated (email links, QR, pay links now use it); api.js wildcard subdomains include .miracurl-suite.com; promo watermark + AI prompts updated. Old domains kept in CORS.
- Shareable candidate profile: POST /super-admin/hiring/applications/{aid}/share-link (share_token capability URL + prefilled WA msg to salon owner), GET /public/candidate/{token} (name/city/role/avg rating/HQ-verified/work history — NO phone/ID exposed), POST .../confirm-trial (rate-limited; sets owner_confirmed, resets seen_by_hq). Frontend: /candidate/:token page (CandidateProfile.jsx, dark luxe, one-tap confirm), Share button (violet) + "✓ owner confirmed" chip in HiringPanel.
- Verified: share link, WA text, profile (no phone leak), confirm flow, 404 bad token, page renders confirmed state.

## Iter 77 (11 Jul 2026) — Public pricing staleness fix + placement fee tracker
- BUG: super-admin plan price edits not reflecting on public portal. Root cause: /public/plans served in-memory PLAN_CATALOG — stale on other workers/production until restart. Fix: load_plan_overrides() (DB merge) called on every read of /public/plans, /super-admin/plans AND before Razorpay order create/verify (_fresh_plan_or_400). Verified: edit→instant reflection. NOTE: user must Deploy for production.
- Placement fees: on PATCH status=hired → placement_fees doc ₹1000 (idempotent per application). GET /super-admin/hiring/placement-fees (items+totals due/paid/this_month/hires), POST .../mark-paid. Revenue tab card "🤝 Hiring placement fees" with totals chips + Mark paid. Verified e2e.

## Iter 78 (11 Jul 2026) — Domain live + full old-domain sweep
- miracurl-suite.com linked (user edited Lovable DNS: 2x A @ Emergent IPs + CNAME www) & deployed; prod build 2026-07-11.2 == preview. Live checks passed (landing/login/jobs/pricing API/SSL www).
- Replaced ALL remaining miracurlunisexsaloon.com references: fallbacks in server.py/email_service.py/id_cards.py, og:url/og:image/twitter:image in index.html, build_og_image.py.
- NOT changed: SENDER_EMAIL=noreply@miracurlunisexsaloon.com (Resend verified on old domain — switching requires verifying miracurl-suite.com in Resend + DNS records in Lovable first).

## Iter 79 (11 Jul 2026) — Code review fixes applied
- FALSE POSITIVES verified & documented: "hardcoded secret" social_connect.py:30 is a Google OAuth scope URL (creds via env); "circular imports" are intentional lazy in-function imports (no import-time cycle, server boots clean); "36 undefined variables" — pyflakes full sweep found ZERO undefined names.
- Real fixes: removed unused imports in cctv.py (asyncio/Optional/db). Refactored high-complexity functions with behavior-preserving extractions:
  * hiring.py: _rating_summary, _profile_from, _filter_candidates, _find_registry_by_phone, _create_application, _serialize_history (candidates search, apply_job, public_candidate now thin).
  * day_offers.py: _build_offer_prompt + _offer_doc extracted from _suggest_offer.
- Regression-tested via curl: candidate search+filters+ratings, public candidate profile, public jobs, cctv latest, day-offer suggest (fresh LLM call OK).
- DEFERRED to roadmap (older stable code, risky to churn): id_cards/receipt_email/auth/mira_studio complexity, server.py split (76 imports), type-hint coverage 24%→80%.

## Iter 80 (11 Jul 2026) — SEO pass for miracurl-suite.com
- Added /robots.txt (public pages allowed, app/admin routes disallowed, sitemap ref) and /sitemap.xml (8 public URLs: landing, signup, book, jobs, staff-registry, partner(s), login).
- Added JSON-LD SoftwareApplication + Organization structured data to index.html (price ₹10,000 offer, logo).
- Verified serving on preview. User must Deploy + submit sitemap in Google Search Console.

## Iter 81 (11 Jul 2026) — Super Admin Notifications + 3D backdrop + public salon SEO pages (wired & tested)
- Wired NotificationsPanel into SuperAdmin.jsx: new sidebar tab "Notifications" (BellRing icon, unread badge), feed fetched from GET /api/super-admin/notifications in load(). Panel filters: all/hiring/inbox/lead/renewal/signup; item click jumps to source tab.
- Wired Super3DBackdrop (orbs + rings + 10 sparkles, pointer-events:none, z-0) at SuperAdmin root; main content raised to z-10.
- Added /salon/:slug route in App.js → SalonPublic.jsx (dark luxe SEO page: name, avg rating, services by category, reviews, Book Now → /book/{slug}). Backend: GET /api/public/salon-page/{slug}, GET /api/public/sitemap-salons.xml.
- Testing agent iteration_64: 100% backend (5/5 pytest) + 100% frontend incl. regression on Tenants/Billing/Inbox/Hiring tabs.
- Deferred idea (tester note): POST mark-seen endpoint so notifications badge clears from the panel itself (currently clears when source panels are opened).

## Iter 82 (11 Jul 2026) — Code review round 2: circular import properly eliminated + complexity refactors
- NEW routes/mira_common.py: _key/_ask/_ask_json/_gen_image moved out of mira_studio. mira_autopilot & social_connect now import from mira_common (top-level, no lazy imports needed). mira_studio → mira_autopilot import chain is now acyclic.
- Refactored (behavior-preserving, radon verified): _compose_flyer 18→1 (helpers _flyer_canvas/_draw_flyer_copy/_draw_contact_bar/_make_fitter), hq_id_card 14→3, _totals_rows 14→5, public_signup_salon 11→4, _platform_digest_html →3.
- FALSE POSITIVES re-verified: social_connect.py:30 "secret" is a Google OAuth scope URL; pyflakes reports ZERO undefined names.
- DEFERRED again: server.py further split (risky churn), type hints in test files (low value).
- Regression: signup+referral e2e (test tenant cleaned), HQ ID card PDF 200, mira agents/autopilot endpoints, flyer/receipt/digest pure-function tests all pass. Build bumped to 2026-07-11.4.

## Iter 83 (11 Jul 2026) — Security audit round 2 (verdict: CONDITIONAL PASS → all findings fixed)
- SEC-001 MEDIUM (SSRF via DNS rebinding, routes/cctv.py): _fetch_snapshot now streams via _checked_get and re-validates the ACTUAL connected peer IP (private/loopback/link-local/reserved/multicast blocked, fail-closed). Verified: 127.0.0.1/169.254.169.254/10.x blocked pre-flight, localtest.me (resolves to 127.0.0.1) blocked at connect time, legit public image fetch works.
- P3 (routes/auth.py): register now stores requested_tenant_slug (unverified hint from X-Tenant-Slug); /tenants/staff/pending scoped to {slug or None} — cross-tenant email harvesting blocked (verified e2e with 2 tenants).
- P3 (email_service.py): _credentials_email_html escapes salon_name/owner_email/temp_pw.
- P3 (subscriptions.py webhook secret): already logs loud warning when unset — USER ACTION: set RAZORPAY_WEBHOOK_SECRET in production so refunds auto-revoke plans.
- Audit confirmed still in place: tenant auto-scoping, JWT/cookie hardening, Razorpay signature + server-side pricing, rate limits, no wildcard CORS. Build bumped to 2026-07-11.5.

## Iter 84 (11 Jul 2026) — Neon 3D software-flow timeline on landing page
- New SoftwareFlowSection.jsx (7 steps: signup → services/staff → go live → Mira bookings → POS → marketing auto-pilot → revenue), styled after user's reference image: neon-bordered glass cards, per-step accent colors, glowing center spine + pulsing dots, staggered 3D entrance (IntersectionObserver) and hover tilt. CSS in index.css (.flow-*). Inserted between Features and Testimonials in Landing.jsx.
- Screenshot-verified: all 7 steps render with glow + spine. Build 2026-07-11.6.

## Iter 85 (11 Jul 2026) — Live signup pricing + Super Admin orbital Platform Map + backdrop boost
- SignupSalon.jsx: pricing chips & confirm-step sentence now fetch /api/public/plans (was hardcoded ₹10K/₹20K; catalog says ₹12K half-year). Verified via screenshot: shows ₹12K live.
- New PlatformOrbitMap.jsx + "Platform Map" tab in Super Admin: 12 module nodes on 2 counter-rotating orbit rings around Miracurl HQ hub (CSS: .orbit-* in index.css; carrier rotate → arm translate → node counter-rotate keeps labels upright). Clickable nodes jump to tabs. Screenshot-verified: 12 nodes render.
- Super3DBackdrop boosted (user couldn't see it): stronger orbs (opacity .85, multiply blend), brighter rings w/ glow, bigger sparkles w/ drop-shadow. NOTE: user's production is on build .2 — must Deploy.
- Google Rich Results test PASSED on miracurl-suite.com (1 valid item). Build 2026-07-11.7.

## Iter 86 (11 Jul 2026) — CRITICAL: production deploy failure root-caused & fixed
- Deploy failed ("pod never ready"): /app/backend/release_notes.py was CORRUPTED — a truncated duplicate of the last release block after the closing `]` → SyntaxError at import → backend crash-looped. (Preview backend also went 502 after hot-reload picked it up.)
- Symptom chain explained: user's "mobile login overlap/black screen" = frontend stuck on dark auth-loading screen because /api/auth/me hung (backend down).
- Fixed: removed corrupted lines; verified import, compileall on whole backend, auth/me 401 in 0.26s, mobile /login and /book render clean at 390px.
- deployment_agent re-run: PASS. User must click Deploy again.
- LESSON: always `python -m compileall` backend before telling user to deploy.

## Iter 87 (11 Jul 2026) — Resend domain migration COMPLETE
- Guided user through Resend DNS for miracurl-suite.com (records live in Lovable DNS panel; user initially added to wrong domain miracurlunisexsaloon.com on IONOS-style panel). All 4 records Verified (DKIM/MX/SPF/DMARC).
- SENDER_EMAIL switched to noreply@miracurl-suite.com in backend/.env; backend restarted; REAL test email sent successfully (id bbce02a8) to miracurlunisexsaloon@gmail.com.
- User must Deploy so production picks up new SENDER_EMAIL.

## Iter 88 (12 Jul 2026) — Win-back nudges + mobile header overflow fix
- NEW routes/winback.py: GET /api/winback/nudges (reuses _find_winback_leads, 45d threshold, 30d lead_outreach cooldown, prewritten WhatsApp msg) + POST /{cid}/ack (contacted|dismissed). Curl-tested: list/dismiss/cooldown/400 validation.
- NEW WinbackNudges.jsx card on owner Dashboard (wa.me deep link, dismiss X, testids winback-*). Screenshot-verified with real data.
- MOBILE FIX (user-reported overlap on Android/iOS): header cluster was 147px wider than 360px viewport. Fixes: AppLayout right cluster flex-shrink-0→min-w-0 + NetSpeed hidden on xs; main column overflow-x-clip (app-wide guard, keeps sticky working — do NOT use overflow-x-hidden); BranchSwitcher select w-[64px] on xs + container flex-shrink-0; SalonSwitcher icon-only on xs (name hidden sm:inline); bell+profile flex-shrink-0. Verified: overflow 0px, no element overlap, profile right=360.
- Build 2026-07-12.1.

## Iter 89 (12 Jul 2026) — Employee Self-Service Portal + mark-left login block + Mira voice fix
- NEW routes/employee_portal.py: register (phone MUST be in registry_employees AND full Aadhaar must match aadhaar_hash via _aadhaar_fps; else "not registered with us" msg), login (phone+pw, brute-force lockout), reset-password (phone+Aadhaar recheck), me (profile+employment history, no aadhaar_hash leak), PATCH me (name/email/city/address), logout. Separate emp_token HTTPOnly cookie (type emp_access, 12h).
- registry_mark_left now sets disabled=true on matching tenant user (email match, role!=admin) → salon login 403. Tested by testing agent (iteration_65: backend 8/8).
- NEW EmployeePortal.jsx at /employee (dark luxe, login/register/reset tabs, dashboard w/ profile editor, employment history + HQ Verified badges, Browse jobs → /jobs). FIXED stale-closure setState bug found by tester (functional updater form).
- Mira voice bug: MorningBriefing audioRef + unmount cleanup (pause audio, abort SpeechRecognition, cancel speechSynthesis) — voice stops on logout.
- E2E verified via screenshot after fix: type→login→dashboard. Build 2026-07-12.2.
- Tester notes (future): registry_employees phone lookup is O(N) scan — consider normalized_phone field+index when registry grows; silence initial 401 console noise on /employee/me probe.

## Iter 90 (12 Jul 2026) — Hiring payment automation + configurable fee + Resume builder
- hiring.py: PLACEMENT fee now configurable (platform_settings key placement_fee; PUT /super-admin/hiring/placement-fee). _record_hire() helper: closes request, creates fee w/ configured amount, generates REAL Razorpay payment_link (client.payment_link.create, tested: https://rzp.io/rzp/...) and emails owner via Resend. POST /super-admin/hiring/placement-fees/{fid}/send-link to (re)send.
- auto_mark_hired_on_staff_attach(): hook in auth.attach_staff — when owner creates staff credentials matching an open application (registry email match, fallback _name_matches) → auto status=hired + fee + owner email + HQ notification. E2E curl-tested full chain (request→apply→register→attach→marketplace_hire response).
- hq_notifications.py: _fee_items in feed ("Candidate hired — proceed with payment ..."); mark-seen also clears placement_fees.seen_by_hq.
- employee_portal.py: GET/PUT /employee/resume + GET /employee/resume/pdf (reportlab, verified history auto-included, %PDF 200). EmployeePortal.jsx ResumeBuilder card (save + download blob). HiringPanel.jsx PlacementFees section (fee editor, send link, mark paid).
- All test data cleaned; fee reset to ₹1000 default. Build 2026-07-12.3.

## Iter 91 (12 Jul 2026) — Code review round 3 + Razorpay webhook auto-mark-paid
- NEW routes/promo_common.py (FONT_PATH, BRAND_LOGO, _brand_logo, ALL_FEATURES, BROCHURE_DIR) — promo_video/promo_image/offer_flyer all import from it; promo circular import eliminated.
- Refactors (radon verified): _compose_poster 11→2 (helpers _poster_canvas/_paste_screenshot_card/_draw_poster_text), _resume_pdf 16→~7 (_ResumeWriter class + _resume_header), auto_mark_hired_on_staff_attach 13→ lower (_match_open_application), text_agent if/elif chain → _TEXT_AGENTS dict table (live-tested with real LLM call).
- FALSE POSITIVES re-verified AGAIN (3rd review): pyflakes 0 undefined names; social_connect.py:30 is OAuth scope URL constants.
- DEFERRED: _run_pipeline refactor (fragile CPU-heavy video code), server.py split, test-file type hints.
- NEW: payment_link.paid webhook handler (_wh_placement_fee_paid) auto-marks placement fees paid (reference_id/notes.fee_id) — unit-tested with simulated event. Requires RAZORPAY_WEBHOOK_SECRET set in production + tick "payment_link.paid" event in Razorpay webhook config.
- All verified: poster compose, 40-row multipage resume PDF, webhook auto-paid, mira text agent live. Build 2026-07-12.4.

## Iter 92 (12 Jul 2026) — DocsPanel + PlatformEarnings wired into Super Admin
- routes/hq_documents.py registered in server.py. Endpoints: GET /super-admin/documents (list 4 docs), GET /super-admin/documents/{key}/pdf (reportlab, curl-verified 200 %PDF), GET /super-admin/earnings (6-month subscriptions+placement fees series; FIXED: excludes status created/failed unpaid Razorpay orders — was inflating revenue by Rs.1.16L).
- SuperAdmin.jsx: new "Documents" sidebar tab (DocsPanel, 4 PDF cards: onboarding policy, hiring policy, suite overview, T&C). Revenue tab now shows PlatformEarnings stacked bar chart (subscriptions=ink, placement fees=gold) above existing RevenuePanel SaaS metrics.
- Verified via screenshot: both tabs render, chart shows Rs.18.14L subs + Rs.1K fees. Self-tested (small wiring task).

## Iter 93 (12 Jul 2026) — Demo invite campaign + welcome-email brochure
- hq_documents.py: GET /super-admin/demo-campaign/recipients (143 tenants + 11 leads pools), POST /super-admin/demo-campaign/send (per-recipient personalized luxe HTML email, all 4 policy PDFs attached base64, reply_to=HQ_EMAIL, dedupe + email validation, campaign logged in demo_campaigns), GET /super-admin/demo-campaign/history.
- _demo_email_html(): dark-ink/gold branded invite — polite copy, 6-module suite explainer grid, optional personal-note highlight box, gold "Request my demo time" mailto CTA, attachments callout. Design screenshot-verified.
- email_service._send_email: new reply_to param (Resend reply_to list).
- server.py tenant creation: welcome email now auto-attaches Suite Overview PDF (suite_overview_attachment(), fails soft).
- DemoCampaign.jsx inside DocsPanel: checkbox pickers for Leads/Tenants, manual email chips, note textarea, send + recent-campaign history. E2E: real send to delivered@resend.dev OK (sent:1, failed:0).

## Iter 94 (12 Jul 2026) — Demo follow-up nudge (one gentle reminder after 5 days)
- hq_documents.py: demo_campaign_send now upserts demo_invites per recipient {email,name,salon_name,first_sent_at,reminder_sent_at,responded}. run_demo_followups(): 5+ days, no reply, not yet reminded, skips+auto-marks converted (email in tenants.owner_email) → sends _reminder_email_html (short luxe "gentle nudge, only one" email, suite-overview PDF attached, reply_to HQ). Endpoints: GET invites (status: awaiting/reminded/replied/converted), POST invites/{id}/mark-replied (toggle), POST followups/run (manual).
- server.py: _demo_followup_scheduler daily after 10:00 IST, idempotent via system_flags key demo_followup_auto, registered in on_startup.
- DemoCampaign.jsx: "Invitees & follow-ups" tracker w/ status chips, mark-replied toggle, "Send due reminders now" button. Input styling fixed (!bg-white).
- E2E tested: send→backdate 6d→run (1 reminder sent via real Resend)→idempotent 2nd run 0→converted auto-skip→mark-replied toggle→UI screenshot. Test data cleaned.

## Iter 95 (12 Jul 2026) — Demo campaign: prospects-only + AI agent team in email/PDF
- Recipients endpoint now returns ONLY leads (tenant_inquiries) minus any email already in tenants.owner_email; "Existing salon owners" group removed from UI (campaign is strictly for salons NOT on Miracurl).
- Send endpoint hard-guard: recipient email matching a tenant owner_email → skipped with "Already a Miracurl partner — skipped" (surfaced in toast with reason).
- _demo_email_html: new dark "MEET YOUR AI TEAM" section — 12 agents (Orchestrator, Social, Video, WhatsApp, Email, Lead Finder, SEO, Google Business, Staff Verification, Analytics, Sales, Content Writer). Suite Overview PDF got matching "Your 12-Agent AI Team" section (emoji-free for reportlab). Reminder email mentions 12 agents.
- Verified: recipients keys=[leads], partner send blocked, email render screenshot, live send OK. Test data cleaned.

## Iter 96 (12 Jul 2026) — Lead Gen Email section + pricing & brochure in demo mail
- NEW Super Admin sidebar tab "Lead Gen Email" (id lead-email) — DemoCampaign moved out of Documents tab into its own panel.
- Demo email: "SIMPLE, HONEST PRICING" block w/ LIVE 1-branch plans from PLAN_CATALOG/load_plan_overrides (price, months, ≈/month; multi-branch note), 7-day trial callout.
- Attachments now include miracurl-salon-brochure.pdf (build_brochure_pdf — real app screenshots, ~4.3MB, lru_cached, fails soft).
- Verified: send 1/1 with 5 attachments to delivered+prospect@resend.dev, pricing/AI-team email render screenshot, lead-email tab UI, campaign removed from docs tab. Test data cleaned.

## Iter 97 (12 Jul 2026) — Demo email open/click tracking + HQ notifications + funnel
- hq_documents.py: invite id generated BEFORE send; emails embed 1x1 pixel GET /public/demo-track/{iid}/open.png (sets opened_at) and CTA now points to GET /public/demo-track/{iid}/click (sets demo_requested_at + opened_at, 302 → mailto HQ). track_base from x-forwarded-host (stored on invite; reminders reuse it). Both invite + reminder emails tracked.
- Invites endpoint: status tier demo_requested (converted > replied > demo_requested > reminded > awaiting) + opened bool. POST /super-admin/demo-campaign/mark-seen clears seen_by_hq_open/req.
- hq_notifications.py: _demo_items in feed — 🔥 "Demo requested" / 👀 "Demo invite opened", type "demo", tab lead-email, unread via seen flags. NotificationsPanel: "📬 Demo invites" filter chip.
- DemoCampaign.jsx: funnel strip (Invited/Opened/Demo requested/Converted), 👀 Opened chip, "Demo requested 🔥" status chip, mark-seen on tab open.
- E2E: send→pixel 200→click 302 mailto→status demo_requested→🔥 notif unread→UI screenshots. Test data cleaned.

## Iter 98 (12 Jul 2026) — Security audit #3 (PASS) + P3 hardening
- security_audit_agent full audit: PASS, no critical/high/medium. New demo-campaign/tracking features verified safe (escaping, authz, uuid4 non-enumerable, no open redirect); prior fixes (SSRF, JWT, payments, CORS, Aadhaar hashing) intact.
- Fixed P3s: CSV formula injection neutralized in /super-admin/subscriptions/export.csv (_safe prefixes ' on =+-@); public_rate_limit added to demo-track open.png (60/10min) & click (30/10min).
- Deferred P3s (design decisions): global cap on public sales-chat LLM usage; OTP step for employee-portal reset (currently phone+Aadhaar, rate-limited).

## Iter 99 (12 Jul 2026) — Demo slot picker + Google Calendar invites
- Public luxe scheduling page /demo-slot/{iid} (DemoSlot.jsx, dark gold theme): next-7-days date chips, 8 IST time slots (DEMO_SLOT_TIMES), optional phone, success state w/ Google Calendar button. Route in App.js.
- Email CTA click now 302s to /demo-slot/{iid} (was mailto) using stored track_base.
- Endpoints: GET /public/demo-slot/{iid} (info+dates+times, rate-limited 30/10min), POST /public/demo-slot/{iid} (validates date≤30d + slot whitelist, 10/10min) → saves preferred_slot, sets demo_requested/responded, sends TWO emails: prospect confirmation (luxe, gcal render link + .ics METHOD:REQUEST attachment w/ 30-min alarm) and HQ alert email w/ slot+phone+gcal link.
- IST→UTC slot conversion (_slot_utc); status priority fixed: demo_requested above replied; notif body shows booked slot; DemoCampaign row shows 📅 date/time chip (phone in tooltip).
- E2E: send→click 302→info→book→emails sent→invites show slot→notif "Booked ... IST"; UI picker flow tested via browser (select date/time/phone→confirm→success+gcal). Test data cleaned.

## Iter 100 (12 Jul 2026) — 3D salon public page + PWA split fix + What's New popup fix
- SalonPublic.jsx REBUILT (dark luxe 3D): glassy fixed header w/ Book pill, animated gradient orbs (brand-orb-float), twinkling ✦ sparkles (sparkle-twinkle), gradient serif hero title, chip stats, numbered neon glow section cards (cyan/violet/pink rings + shadows, like landing timeline): 1 Services & Pricing, 2 What clients say, 3 Book CTA; framer-motion staggered fadeUp entrances; hover lift on service/review cards; InstallAppPrompt variant=customer mounted; Miracurl Book app plug.
- PWA fix: index.html manifest picker now serves Miracurl Book manifest on /salon, /demo-slot, /review paths too (was only /book) — fixes "already installed" (Partner) shown to customers on salon pages. Manifests already had distinct ids (miracurl-booking / miracurl-admin).
- What's New popup fix: root cause = BUILD never bumped this session so modal (keyed on localStorage vs BUILD) stayed hidden. release_notes.py: BUILD → 2026-07-12.5, merged 2026-07-12 entry with 14 changes (owner-facing: salon glow-up, app split, hiring pay, resume, portal, winback; Super Admin: lead gen email, demo scheduler, docs center, earnings; internal-prefixed hidden from owners). Verified: /whats-new returns 8 highlights, modal renders on admin login screenshot.
- REMINDER for deploys: bump BUILD + append release_notes.py every deploy-worthy change, else owners see no popup.

## Iter 101 (12 Jul 2026) — Blinking Lead Gen tab, salon photo gallery, TEST reviews filter
- SuperAdmin sidebar: Lead Gen Email tab now BLINKS (amber bg + animate-pulse + 🔥 + amber badge w/ animate-ping) when unseen demo opens/requests exist (demoHot from notifFeed type=demo unread). Visiting tab → mark-seen → notifications refetched after 1.5s → blink clears. Verified via screenshots. NOTE: earlier identical edit silently didn't persist on line 298 — re-applied.
- Salon photo gallery (optional, max 6): GET/POST/DELETE /api/salon/gallery (tenant admin, storage via _put_object, uploads collection kind=gallery, tenants.gallery array). GalleryCard in Settings (upload/preview/delete grid + public page link). SalonPublic "Inside the salon" amber-glow masonry section (first photo 2x2). public_salon_page returns gallery urls. E2E: 3 uploads → public page rendered → deletes OK.
- TEST reviews hidden: public_featured_reviews (server.py) + salon-page reviews (hq_notifications.py) now $nor-filter customer_name/comment ^TEST (case-insensitive) — hides TEST_ReviewCust artifacts on PRODUCTION booking page after deploy (preview DB had none).

## Iter 102 (12 Jul 2026) — Post-visit "Rate your visit" review requests
- server.py: _run_review_requests — for active/trial tenants (skip review_requests_enabled=False), completed appointments 3-48h old w/o review & w/o review_request_sent_at marker → luxe ⭐ email (gold stars, "Rate my visit ✦" → {APP_PUBLIC_URL}/review/{appt_id}, reward teaser). _review_request_scheduler every 30 min (idempotent via marker). Endpoints: GET/PUT /settings/review-requests (toggle, default ON), GET /reviews/pending-requests (candidates + prefilled wa.me links), POST /reviews/request-now.
- ReviewRequestsCard on Reviews page: auto toggle, pending list w/ one-tap WhatsApp buttons + "Email all now".
- E2E: seeded completed appt 4h old → pending shows w/ wa.me → request-now sent 1 → 2nd run 0 (idempotent) → UI card+toggle verified. Test data cleaned.

## Iter 103 (12 Jul 2026) — 3D salon upgrades, invite list mgmt, Mira widget left, service pics
- SalonPublic 3D+ (layout unchanged): salon-shimmer animated gradient title, rotating conic salon-halo behind Book CTA, 3 drifting perspective salon-rings in hero, Tilt3D mouse-tilt wrapper (perspective 1100px, max 4deg) on all 4 section cards; keyframes in index.css w/ prefers-reduced-motion off-switch.
- Services on salon page now booking-style cards WITH photos (image_url + unsplash fallback, right image strip w/ gradient fade, hover zoom); public_salon_page projects image_url.
- BookingChatWidget "Ask Mira AI" moved bottom-LEFT (button + panel) — was overlapping Continue on right.
- Invite list mgmt: shows latest 10 + "Show all N" toggle; per-row DELETE (confirm) via DELETE invites/{iid}; RE-SEND button (sky) when resend_suggested (not opened, 5+ days, awaiting/reminded) via POST invites/{iid}/resend (fresh tracking ids reset, resend_count); "seen, no reply" italic label when stale_no_reply (opened 5+ days, no reply). FIXED: earlier edit duplicated JSX block breaking build — truncated file + re-applied cleanly.
- Verified via screenshots: 10 rows + show-all + 1 resend + 10 delete btns; mira x=72 (left); service pics grid.

## Iter 104 (12 Jul 2026) — Full regression PASS + real manifest bug fixed
- testing_agent regression (iteration_66.json): 25/25 backend PASS (docs PDFs, earnings, lead-gen send+partner block, tracking pixel/click, demo slot booking, invite delete/resend/limit, follow-up idempotency, gallery CRUD, review requests, whats-new, tenant flows). Frontend spot-checks pass (3D salon page, slot picker, Mira widget bottom-left).
- BUG FOUND & FIXED: ManifestSwitcher.jsx (React) was overriding the index.html manifest fix — only checked /book. Now /book, /salon, /demo-slot, /review all get Miracurl Book manifest (verified: salon→manifest.json, book→manifest.json, login→manifest-admin.json). This was the REAL cause of user's "already downloaded" complaint persisting.

## Iter 105 (13 Jul 2026) — Day-offer fix + booking banner, staff week-off, hiring earnings review
- CRITICAL FIX: routes/offer_flyer.py, cctv.py, promo_image.py, promo_video.py imported `_key`/`_ask_json` from routes.mira_studio which no longer exports them (moved to routes.mira_common during refactor) → day-offer accept 500 "Something went wrong" (user hit on prod). All 4 imports fixed; accept also fails soft now (accepts offer even if flyer gen fails). Verified: accept 200 w/ flyer in 15s.
- Booking page day-offer banner: GET /api/public/day-offer/{slug} (today's accepted offer). BookPublic step-0 banner (gold gradient, sparkles, day chip, struck prices → offer prices, "Today only"). Verified rendering.
- Staff weekly off: Staff/StaffIn models +week_off_day (mon-fri); StaffFormModal "Weekly off day" select; StaffCard "off: wed" violet chip; Employee Portal /employee/me returns week_off_day (matched via normalized phone across active staff) + violet 🌴 card in EmployeePortal.jsx. E2E: PUT staff w/ X-Owner-Pin 4321 persists; portal shows seeded friday. Test data cleaned, Priya's test value reverted.
- HiringEarningsReview wired in Revenue tab (was lost edit — component existed but SuperAdmin wiring missing): always-visible card w/ Due/Collected/hires totals, All/Due/Paid filter, mark-paid. Verified rendering.
- FIXED stray `}` at end of SuperAdmin.jsx breaking build (leftover from lost edit).
- LESSON: several search_replace edits were silently lost after user interruptions — ALWAYS grep-verify wiring edits before testing.

## Iter 106 (15 Jul 2026) — Mira AI Studio V1 shipped + luxury redesign
- Mira AI Studio (/mira.ai): standalone B2C builder — own auth (studio_users, 50 free credits), Razorpay credit packs (100/₹1000, 200/₹1800 popular, 300/₹2700), website builds (20cr, live URL via /api/site/{slug}), app builds (30cr, zip download), prompt refinements (5cr), auto-refund on failed builds. Backend: routes/mira_builder.py. Endpoints: /api/public/mira-studio/register|login|plans, /api/mira-studio/me|buy|buy/verify, /api/public/mira-builder/start|status/{pid}|refine|download/{pid}.
- testing_agent iteration_70.json: 13/13 backend PASS, all frontend flows PASS (register→credits→build→live URL→refine→download, Razorpay iframe load, salon SaaS regression clean).
- LUXURY REDESIGN of MiraAIStudio.jsx per design_guidelines.json ("Old Money Tech"): #0A0809 base, gold #D4AF37 + pink #FF4081 gradient CTAs, Playfair serif hero w/ gradient "build", dark salon hero bg image, glowing gradient-border prompt box, bento feature grid, agent pipeline strip, studio tools row, free-credits pricing CTA, framer-motion entrances, redesigned auth/buy modals. All logic + data-testids unchanged. Verified via screenshots (hero, features, pricing, both modals).
- release_notes.py BUILD bumped to 2026-07-15.6 (Studio launch + redesign entries).
- NOTE from tester: studio JWTs share jwt_secret with salon SaaS (collections separate, safe today) — consider 'aud':'studio' claim later.
- Landing.jsx: added "✦ Mira AI Studio" gold pill link in navbar + footer link → /mira.ai (user couldn't find studio from homepage). Verified click navigates.
- MiraStudioShowcase.jsx (new): "Built with AI" section on Landing (after features, before SoftwareFlowSection) — copy + CTA to /mira.ai + self-contained animated demo (typing prompt → Planner/Design/Code/Test/Deploy pipeline lights up → mock browser site fades in, loops every ~12s). Verified both phases via screenshots. release_notes BUILD → 2026-07-15.7.

## Iter 107 (15 Jul 2026) — Mira Studio quality fixes (user's watch-store site broken on prod)
- BUG 1 (iframe "refused to connect"): security middleware set X-Frame-Options DENY on ALL /api responses incl. /api/site/{slug} → studio preview iframe blocked. server.py: /api/site/* now SAMEORIGIN, everything else stays DENY. Verified via curl.
- BUG 2 (broken/irrelevant images): LLM hallucinated Unsplash URLs. NEW routes/mira_site_images.py: 88 verified image IDs across 16 business categories + sanitize_html_images() (replaces any non-verified unsplash URL from category pool) + guess_category() keyword fallback for old projects. Planner now returns "category"; Frontend Agent restricted to verified URLs only.
- BUG 3 (unstyled pages): LLM emitted tailwind Play CDN as <link rel=stylesheet> instead of <script> → zero styling. ensure_tailwind() normalizes/injects the script tag. Prompt hardened too.
- KEY: serve_site + download now apply ensure_tailwind+sanitize at SERVE time → user's existing prod site (timeless-elegance-cd28) auto-repairs after redeploy, no rebuild needed.
- Generic content fix: planner returns offerings_label ("Our Collection"/"Our Menu"/"Our Services") + offerings with desc; nav shows business name as text logo.
- UI: 3-card "Deploy options" panel (studio-deploy-options) in live result — Hosted by Mira / Self-host free / Own domain.
- E2E verified: fresh watch-store build → category=watches, label="Our Collection", 6/6 images HTTP 200 all watch photos, styled render confirmed via screenshots; refine keeps verified images + script tag. release_notes BUILD → 2026-07-15.8.

## Iter 108 (15 Jul 2026) — Super Admin: Mira Studio credit gifting + win-back emails
- Backend (mira_builder.py): GET /api/super-admin/studio/users (users + builds count + stats), POST .../users/{uid}/gift (adds credits, logs to studio_credit_gifts, sends branded "A gift for you ✦" email w/ optional admin note), POST .../users/{uid}/nudge (win-back "you're one sentence away, {name} ✦" email — copy adapts: never-built vs returning, credits>=20 → Continue building CTA else Recharge CTA; sets last_nudged_at). All require_super_admin (cookie auth).
- Frontend: NEW superadmin/MiraStudioPanel.jsx — stats cards (total/never-built/credits outstanding), user table w/ NEVER BUILT badge + nudged date, Gift modal (20/50/100/200 chips + custom + note), Nudge modal (optional personal line). Sidebar tab "mira-studio" (super-tab-mira-studio).
- E2E verified: gift 30cr → balance 55 + email_sent true (Resend), nudge sent, unauth 401, UI panel + modals via screenshots. release_notes BUILD → 2026-07-15.9.

## Iter 109 (15 Jul 2026) — Studio chat experience + refine-in-background + power tools
- CHAT-STYLE workspace (user request): MiraAIStudio.jsx workspace = chat panel (user bubbles / 'Agent is working…' / 'Agent is finished ✦') + preview column. Build + refine both chat-driven; expanded image library (+9 categories: flowers/bakery/store/wedding/music/art/sports/agriculture/spa, all URL-verified) + wider guess_category keywords (fixed flower shop getting skyscraper images).
- CLOUDFLARE 524 FIX: refine LLM call moved to background task (_run_refine); POST refine returns {queued:true} instantly; doc gets refine_result {ok,error}; frontend pendingRefineRef + poll completes the chat bubble. Refund on failure.
- NEW TOOLS (user request): 📎 image upload in chat (POST /public/mira-builder/upload-image → object storage → /api/files/{fid}, refine prompt allows provided URLs); Security Check + Code Review buttons (POST /public/mira-builder/analyze kind=security|review, gpt-4o-mini VERDICT report as chat bubble); Push to GitHub (POST /public/mira-builder/github-export — PAT + repo name modal, creates/reuses repo, commits via contents API, PAT never stored; playbook from integration_expert).
- Domain refs updated to miracurl-suite.com (READMEs, INFRA_BACKUP, OG image regenerated). GitHub push directed via Save to GitHub feature.
- TESTED: iteration_71.json — backend 7/7 pytest + full UI chat flow PASS; main agent spot-checked refine completion bubble ('Change applied — preview updated'). Fixed build-bubble reverting to working during refine. BUILD → 2026-07-15.10.
- Tester suggestions (backlog): split mira_builder.py (745 lines), 'aud':studio JWT claim, github export audit log, upload ext guard.

## Iter 110 (15 Jul 2026) — "Made with Mira ✦" showcase gallery
- GET /api/public/mira-builder/showcase — last 6 live websites (deduped by name). Section on /mira.ai landing (mira-showcase): cards w/ browser chrome, scaled live iframe (400%/scale .25) over a verified category-image fallback (CAT_THUMBS map), name + category badge, opens live site. NOTE: loading="lazy" on transformed iframes never loads in Chromium — removed; headless screenshots don't composite OOPIF iframes (blank) but content verified via contentDocument (6.6KB body) + fallback image guarantees visuals. BUILD → 2026-07-15.11.

## Iter 111 (15 Jul 2026) — Manager full menu + Admin-PIN gate + Staff Activities audit
- NAV_MANAGER = full NAV_ADMIN (minus /assistant). MANAGER_LOCKED = [/staff,/cctv,/attendance,/hire,/messages,/settings,/staff-activities] show gold Lock icon; opening renders ManagerLockScreen (logs attempt on mount, auto-unlock if tenant has no security_pin_hash; PIN unlock per-session via sessionStorage mgr_unlock:{path}).
- Backend routes/manager_access.py: POST /api/manager/section-access (admin bypass; manager: no pin → log 'attempted' + pin_required; wrong → _pin_attempt guard + 'denied'; right → 'unlocked'), GET /api/manager/activity-logs (require_owner_pin). Collection manager_activity_logs.
- OwnerOnly in App.js no longer redirects managers (staff still redirected). New page StaffActivities.jsx (/staff-activities, admin+manager nav, pinApi → auto Owner PIN modal, StrictMode double-mount guarded).
- FIXED during work: stray duplicated tail in AppLayout.jsx (compile error), lock-input contrast, StaffActivities double PIN modal.
- Manager credential reset: manager@miracurl.com / Manager@1234 (test_credentials.md updated).
- E2E verified via curl + screenshots: manager full nav w/ locks, lock screen, wrong/right PIN, staff page unlock, admin audit table w/ attempted/denied/unlocked rows. BUILD → 2026-07-15.12.

## Iter 112 (16 Jul 2026) — Code quality report applied
- FALSE POSITIVES verified & documented: social_connect.py:30 = OAuth URL constants (no secret); "47 undefined variables" = 0 per ruff F821; utils.py:8 `is` claim = actually `in` tuple (F632 clean).
- REAL FIXES: test_iter70 password now random per-run; tests E712 (23 auto-fixed); random→secrets in test_iter11 + backend_test; 16 unused imports removed; E741/F841 in hq_documents + tests; E731 lambda in mira_builder.
- COMPLEXITY REFACTORS (behavior-preserving extraction): mira_builder (_plan_website/_generate_site_html/_app_package_files), inventory (_restock_rows/_low_stock_products), briefings (_notif_sentence_hi/en), appointments_pos (_tenant_tax_pct/_find_branch), day_offers (_post_engagement_score), gallery (_validated_gallery_upload), hiring (_candidate_wa_link), hq_documents (_demo_pricing_row/_dedupe_recipients/_send_demo_invite), mira_autopilot (_winback_templates/_send_winback_email).
- schedulers.py: -> None return hints on all 9 schedulers. Repo ruff errors 109 → 62 (remaining: E402 intentional late imports, E702 compact PDF-drawing style).
- SKIPPED (documented): further splitting server.py/briefings/gallery imports — modular refactor already done previous session; PDF renderers left intact (high regression risk, not in report).
- VERIFIED post-refactor: syntax/imports clean, backend restart clean, invoice create 200 (billing context), low-stock-all 200, morning briefing 200, showcase 200, hq hiring apps 200. BUILD → 2026-07-16.1.

## Iter 113 (15 Jul 2026 session) — Mira Social Memory + Manager PIN gates completed
- NEW: Mira social 3-day memory. Backend mira_studio.py: _social_context(tid) (last-3-day social_posts, per-platform posted_today from successful results only, days_since_last_post from most-recent post); GET /api/mira-studio/social/context → {posted_today, days_since_last_post, nudge, recent}. Nudge fires when never posted or ≥3 days idle.
- social/generate now injects 3-day post history into the LLM prompt ("do NOT repeat these"), applies _clean_newlines to posts (formatting fix), and returns posted_today filtered to requested platforms.
- Frontend: new MiraSocialNudge.jsx (fuchsia banner, data-testid mira-social-nudge / mira-nudge-suggest-btn / mira-nudge-dismiss, sessionStorage dismiss) rendered on Dashboard (owners) + MiraStudio agents tab (suggest triggers social agent). MiraStudio ResultView shows amber mira-already-posted-warning ("already posted today on X — post this as well?"); PostNowButton adds per-platform window.confirm on duplicates.
- mira_common._ask_json: retry-once on malformed LLM JSON (was intermittent 500).
- FIXED (iteration_72 HIGH bugs): manager Refer&Earn/Reports flows. /settings/affiliate, /reports/staff-commission (+require_owner_pin), /reports/sales, /settings/verify-owner-pin switched require_tenant_admin → require_admin so managers reach the PIN check (403 OWNER_PIN_REQUIRED → pinApi modal). Reports.jsx load() split w/ try/catch + staff-commission via pinApi (no more error overlay). ownerPin.js: askPinOnce() coalesces concurrent PIN prompts (StrictMode double-modal fix).
- Billing erase stays admin-only (managers blocked even with PIN — destructive op).
- TESTED: iteration_72 (feature E2E both tenants) + iteration_73 (manager/admin PIN flows 100% pass). Test seed [SIM-TEST] post removed after testing.
- NOTE: search_replace lesson — parallel edits to the SAME file corrupted mira_studio.py (duplicated tail); same-file edits must be sequential.

## Iter 114 (15 Jul 2026) — Mira conversational Google posting + full memory
- POST /api/mira-studio/google/post (GooglePostIn: topic, caption, offer_title, image_url, with_image, confirm): generates structured Google OFFER (headline / 2-3 detail lines / validity / 'Book now', JSON offer_title+caption) + promo image, checks posted_today['google'] → if same-day post & !confirm returns needs_confirmation + personalized question "Hey {admin name} — we already posted an offer on Google today (…). Would you like to post this one as well?"; confirm=true (or no same-day post) → publish_google_post (auto-post; graceful fail 'account not connected' in preview until Google API approval).
- Orchestrator: new route key 'google_post' (_VALID_ROUTES = _AGENT_KEYS | {google_post}) — "Mira please post X on google" routes correctly (curl verified).
- Memory upgraded: _social_context now returns 'history' (last 10 posts ALL-TIME); social_generate injects full history instead of 3-day window; social sys prompt enforces offer structure (hook/details/validity/CTA); google plat rule rewritten.
- Nudge text personalized: "Hey Admin team — no activity found on your Google / social media in the past N days. Would you like me to suggest an offer, a package, or something specific to post?" MiraSocialNudge studio variant now has 3 buttons (Suggest offer / Suggest package / Something specific → focuses chat input); dashboard variant single 'Ask Mira for ideas ✦'.
- Frontend GooglePostResult (MiraStudio.jsx): confirm Yes/No buttons (mira-google-confirm-yes/no), posted ✅ card, failed → amber note + 'Post manually on Google (caption copies) ↗' (mira-google-manual-post), image panel. FIXED iter_74 bug: refactored object-useState → isolated hooks (posted/needs/declined/busy/pubResult) + remount key; 'No' now fully unmounts dialog + shows mira-google-draft-kept note.
- TESTED: iteration_74 (3/4 pass, No-path bug) → iteration_75 (No + Yes paths PASS). Test seeds cleaned.
- NOTE: user confusion — production (miracurl-suite.com) runs OLD code until redeploy; 'Wake up servers' page = platform preview sleep gate (not app). Reports erase (last month/all) + PIN-gated rate modify already existed in preview (Reports.jsx erase-last-month-btn / erase-all-btn).
- Main-agent screenshot browser CANNOT pass the preview wake gate (app.emergent.sh iframe); testing_agent infra can — delegate browser tests there.

## Iter 115 (16 Jul 2026) — Gallery templated promos + share buttons + dual image engines
- /gallery/generate REWRITTEN: LLM parses free-text offer → {template (auto-picked from offer_flyer TEMPLATES), headline, offer_text, services, valid_until, post_caption} → AI background with NO TEXT → _compose_flyer overlays real salon logo + crisp Playfair text + % badge + contact bar (fixes garbled AI text user showed from production). post_caption (social caption w/ hashtags) stored on gallery doc.
- Gallery.jsx: new ShareRow per image (gallery-post-google/insta/wa-<id>): Google → /mira-studio/google/post w/ same-day Mira confirm (window.confirm) + manual fallback (caption copied + business.google.com); Insta → checks /mira-studio/social/context posted_today then /social/publish (ig+fb), manual fallback; WhatsApp → wa.me share w/ caption + image link. Generate timeout 120s→240s.
- DUAL IMAGE ENGINES (user request "use ChatGPT and Gemini"): mira_common._gen_image_bytes() tries gpt-image-1 then falls back to Gemini Nano Banana (gemini-3.1-flash-image-preview via LlmChat multimodal, playbook-verified, returns b64→bytes). Wired into _gen_image (Mira Studio social/google images), gallery_generate, offers/flyer create_flyer. Gemini direct-tested (530KB image OK).
- offer_flyer._draw_flyer_copy: headline/offer text now has subtle stroke (readability over busy backgrounds).
- TESTED: iteration_76 100% pass (backend generate + all 4 share flows + same-day confirm + regression). Two E2E generate runs verified visually (royal_gold monsoon, bridal_blush bridal — logo crisp, no garbled text).
- Reminder to user: production miracurl-suite.com needs REDEPLOY to get all of this.

## Iter 116 (16 Jul 2026) — Staff forgot-password via personal Gmail
- Problem: staff login IDs (name@miracurl.com) aren't real inboxes — reset links went nowhere.
- Backend auth.py forgot(): ForgotIn gains optional personal_email. For staff/employee roles the reset link is issued ONLY if staff record active (not inactive/archived) AND provided personal_email == staff.personal_email (case-insensitive); link is emailed to the personal Gmail. Otherwise generic response (no enumeration). Admin flow unchanged. Rate limit 5/hr/IP unchanged.
- Frontend Login.jsx forgot mode: amber info note (forgot-info-note) "ask your salon owner to reset OR enter personal Gmail" + new field forgot-personal-email-input; AuthContext.forgot(email, personalEmail); success toast generic.
- TESTED: curl matrix (match→token, wrong/missing gmail→no token, ex-staff→no token) + iteration_77 frontend E2E (all pass; negative UI flow hit rate limit as designed). pwtest seed docs cleaned.
- Note: staff personal_email is set by owner on the Staff record — staff without one on file MUST ask the owner (by design).

## Iter 117 (16 Jul 2026) — Pre-onboarding regression + polish
- Removed 'redirect_uri_mismatch' helper box from Settings → Connected Accounts (SocialConnectionsCard.jsx, user request; Copy import cleaned).
- FULL regression sweep (iteration_78): 21/21 backend tests PASS (all-role auth, POS invoice math, appointments, customers, inventory, reports+PIN, multi-tenant isolation miracurl vs elegance disjoint, public booking, super admin). New reusable suite at /app/backend/tests/test_iter78_full_regression.py (run: REACT_APP_BACKEND_URL=<url> pytest -v).
- Fixed MiraDayOffer hydration warning (<span> in <option> — template literal fix, line ~281).
- public_site.py customer_name validator now unicode-aware (unicodedata: alnum + marks Mc/Mn + \" .'-_\"): Hindi/Tamil/Kannada names accepted, <script>/leading-digit rejected. In-situ verified with Devanagari booking (200).
- Known pre-existing: backend_test.py has 6 stale rows using underscore names (now pass since _ allowed). CCTV mocked; Instagram/Google publish pending user account connections.

## Iter 118 (16 Jul 2026) — Setup Wizard + Mira Lead Generation Agent
- SETUP WIZARD (iteration_79 all pass): /setup 5-step flow (Profile+logo upload/AI, Services w/ preset import, Staff, Hours, Tax&Finish) via routes/setup_wizard.py (GET /setup/status, POST /setup/payment-done, /setup/complete). SetupBanner on Dashboard for owners w/ incomplete setup (progress bar). Test tenant: wizard-test-salon (wizard.owner@test.com / Wizard@1234, now setup_done).
- MIRA LEAD AGENT (user chose option b — AI web research, no keys): routes/lead_gen.py + superadmin/MiraLeadAgent.jsx (tab 'mira-leads'). Pipeline: LLM Lead Finder proposes real salons + official domains → direct httpx fetch verifies website (SEARCH ENGINES DDG/Bing/Mojeek ALL BOT-BLOCK datacenter IP — do NOT retry them; direct site fetches work) → BeautifulSoup extracts emails (home + /contact paths), instagram link, booking signals → LLM research JSON (brand knowledge allowed for rating/branches/services; emails/websites verified-only) → scoring (no website+20, poor site+20, no booking+30, 2+ branches+30) → LLM personalized outreach draft (Rs.900/month, demo CTA, miracurl-suite.com) → super admin approval queue → Resend send (RESEND_API_KEY already in .env, matches user-provided key; delivered@resend.dev used as safe test recipient).
- Endpoints: POST /super-admin/mira-leads/run {city,target≤25} (bg task, one at a time), GET runs / leads / stats (funnel targets 300/100/50/10/5), PUT edit, POST approve|reject|stage{demo|customer}, DELETE.
- TESTED: live Bangalore run (BBlunt: verified site, care@bblunt.com found, score 80, personalized draft referencing rating 4.3 + 5 branches; approve→sent via Resend OK; funnel transitions OK). iteration_80 frontend 100% pass + 2 minor polish fixes applied (hide inputs/reject on demo/rejected states).
- beautifulsoup4 installed (requirements.txt frozen).
- NOTE: user sent Google Cloud BILLING ID (0111E1-D072FD-F10C6D) thinking it's an API key — real Places key starts 'AIza'. When provided: upgrade Lead Finder to Places API (New) searchText for real ratings/phones.

## Iter 119 (16 Jul 2026) — Google Places integration for Lead Finder
- User provided real Maps key (AIza…jja0w) → saved as GOOGLE_MAPS_API_KEY in backend/.env (line 40).
- lead_gen.py: _places_search() (Places API New searchText, fieldmask displayName/rating/userRatingCount/websiteUri/nationalPhoneNumber/formattedAddress). Pipeline tries Places first → enriches leads with real rating/reviews/phone/address (source google_maps) → falls back to AI research when Places unavailable (verified: currently 403 SERVICE_DISABLED on project 885100136995 — user must (1) enable 'Places API (New)' in console and (2) link billing account 0111E1-D072FD-F10C6D to the project). Frontend row shows reviews count + phone.
- Fallback path verified working (returns [] gracefully, logs 'Google Places not enabled — using Mira AI research').

## Iter 120 (16 Jul 2026) — Code review fixes
- FALSE POSITIVES verified & skipped: social_connect.py:30 (public API URLs, no secret), utils.py:8 'is' checks (none exist), 46 undefined vars (ruff F821 clean).
- Fixed: tests/test_gallery_generate.py password now from TEST_ADMIN_PASSWORD env (module-level pytest.skip when unset).
- Complexity refactors (all now ≤11): auth.forgot → _staff_reset_recipient + _send_reset_email; lead_gen._research_salon → _scrape_site + _emails_from_contact_pages + _llm_research; lead_gen._run_pipeline → _find_candidates + _build_candidate_lead; id_cards.staff_id_card → _staff_card_data; inventory._product_doc_from_csv_row → _parse_csv_numbers; mira_calendar.plan_week → _calendar_items.
- REGRESSION TESTED: forgot-password generic response OK, staff ID-card PDF 200, CSV row parsing (valid/bad/missing), live lead run Mumbai (2 leads, refactored pipeline works, Places fallback logs correctly).

## Iter 121 (16 Jul 2026) — Lead follow-up automation
- lead_gen.py: run_lead_followups() — leads status 'sent' + sent_at ≥5 days old + no follow_up_sent_at get ONE gentle follow-up email (static personalized template "Re: <orig subject>"), sets follow_up_sent_at. Manual trigger POST /super-admin/mira-leads/followups/run. Delete endpoint preserved (was briefly clobbered during edit — restored).
- schedulers.py: _lead_followup_scheduler (daily after 10:00 IST, system_flags key 'lead_followup_auto', 30-min poll) + registered in server.py startup.
- Frontend MiraLeadAgent: '🔁 Send due follow-ups' button + '🔁 Follow-up sent <date>' marker on sent leads.
- TESTED E2E: approve→sent, not-due returns 0, backdated 6d → follow-up sent via Resend + timestamp set, idempotent (2nd run due:0).
- Places API still 403 PERMISSION_DENIED (user hasn't linked billing yet) — AI research fallback active.

## Iter 122 (16 Jul 2026) — Google Maps LIVE for Lead Agent
- User created new key in correct project: GOOGLE_MAPS_API_KEY updated in backend/.env (AIzaSyBbD7…pp9Y — old AIzaSyD53… key was in wrong project, replaced).
- VERIFIED LIVE: Pune run via Places API — 4 real salons w/ real ratings (4.7★/1883 reviews etc), real phones, verified websites, REAL emails scraped from their sites (atmossalon24@gmail.com, info@applesalon.in), source=google_maps, scores computed. Pipeline fully Maps-powered now; AI fallback still in place.

## Iter 123 (16 Jul 2026) — HOT prospect prioritization
- _score: +20 '🔥 500+ reviews, no website +20' bonus (highest-value prospects float to top of score-sorted list). Outreach prompt emphasizes lost repeat business for popular no-website salons. Frontend 🔥 HOT badge (lead-hot-badge-<id>) when reviews≥500 & no website. Existing leads rescored (Geetanjali Salon 50→70, now #1).

## Iter 124 (2 Aug 2026) — Geo location via Google Maps link + strict branch fencing
- NEW: POST /api/tenants/current/geo/from-link — paste any Google Maps link (full URL @lat,lng / !3d!4d / ?q= / ?ll=, or maps.app.goo.gl short links which are server-side expanded, coords URL-decoded). Pins main salon or a branch. Frontend: paste input + "Save from link" button in Attendance GeoFenceCard (geo-maps-link-input / geo-maps-link-save-btn testids). "Pin my current location" kept as secondary.
- FIX (user-reported: staff couldn't GPS check-in, all forced to QR): _fence_for in staff_portal.py was silently falling back to MAIN salon coords when a staff's tagged branch had no pinned coords or name mismatched → branch staff always appeared 300m+ away → 403. Now STRICT: branch-tagged staff are only ever fenced against their own branch (case-insensitive/trimmed name match); if branch not pinned → no fence (not main salon).
- NEW: GET /api/staff/me/fence — staff portal now shows "Check-in location: <branch/salon> · within Nm" (fence-info testid) or amber warning if their branch has no pinned location (fence-warning testid).
- NEW: Branch add/update (POST/PUT /api/branches) auto-parses latitude/longitude from the branch's maps_url field (incl. short links).
- IMPROVED: staff portal getPosition() retries with low-accuracy fallback after high-accuracy 15s timeout (indoor GPS reliability).
- Tested: curl (all URL formats, error cases), python unit test of _fence_for (5 cases), Playwright E2E (staff portal fence line + admin save-from-link 200 + toast). NOTE: prod redeploy needed; owner must pin each branch (AECS layout, Munnekolala) via paste-link with branch selected in the geo card dropdown.
- Iter 124b: Live fence map preview — Google Maps embed iframe (no API key, output=embed) inside GeoFenceCard shows the exact pin for main salon/selected branch with fence-radius caption + "Open in Google Maps" link (geo-map-preview / geo-map-open-link testids). Updates on branch select + after saving a new link. Playwright-verified for both main & branch.

## Iter 125 (2 Aug 2026) — Bulletproof geo resolution + Settings maps_url fix + manager main-salon labels
- from-link endpoint now resolves ANY input: full maps URL → short link expansion → place-name extraction from URL (/maps/place/<name> or ?q=) via Google Places API (New, searchText w/ GOOGLE_MAPS_API_KEY) → plain typed text ("Miracurl Salon Marathahalli"). Shared helper _resolve_maps_input() also used by branch add/update maps_url auto-coords and Settings branding.
- BUG FIX (user: "Settings Salon Map location not updating"): GET /settings/branding omitted maps_url so the field always loaded empty. Now returned; PUT /settings/branding with maps_url also auto-resolves coords and pins main-salon geo (latitude/longitude/geo_set_at).
- Manager main-salon option now shows tenant name+location: "🏠 Miracurl Unisex Family Salon — Marathahalli (Main)" (ManagersSection row+form, BranchSwitcher locked chip & option, Attendance geo-target-select "Main salon (Marathahalli)").
- Preview data: REAL coords set via Places search — main salon 12.9482932,77.7049318 (SGR Dental College Rd, Munnekolala/Marathahalli); AECS branch 12.9640015,77.7116893 (AECS Layout Main Rd). Manager Bablu (bablu@miracurl.com) created locked to __main__.
- NOTE: cid-only links (maps.google.com/?cid=...) cannot be resolved (no name/coords; Google blocks server-side HTML scraping w/ consent page) → clear error telling user to paste address-bar URL or type salon name. PRODUCTION NEEDS REDEPLOY for all geo/manager fixes.

## Iter 126 (2 Aug 2026) — PROD RCA fix: __main__ branch semantics + What's New for all consoles
- Deployer RCA (/app/deployer-agent-docs/RCA_90203bb3...MD): prod staff carry legacy branch tags ("Miracurl Unisex Family Salon") + invoices tagged with real names → old `__main__ → {$in:[None,""]}` filter matched 0 rows → empty attendance boards & month_revenue=0. NOT infra (prod now tier_1 2Gi, no OOM).
- FIX: `__main__` now means "NOT in any configured branch name" ($nin) in reports.py _branch_query(branch, tenant) and staff_portal attendance_today (added current_tenant dep). Legacy/free-form tags count as Main salon. Verified: legacy-tagged staff appears on main board; AECS board + revenue intact.
- _fence_for: staff with a tag that isn't a configured branch → fenced to MAIN salon coords (they're main staff); configured-branch staff → their branch only.
- Testing agent iteration_96: 15/15 backend PASS + frontend PASS (it also fixed missing mainSalonLabel import in Staff.jsx). Branch rename cascade, case-insensitive matching, geo from-link (URL/short/place-text), branding maps_url, staff fence all green.
- What's New popup: /api/whats-new now allowed for managers too (was admin-only 403). New RELEASES entry "2026-08-02" + BUILD bump to 2026-08-02.54 → popup will re-appear for every console after prod redeploy. Super Admin → Deployments tab auto-syncs the new entry (43 releases).
- PROD: needs REDEPLOY to take effect.

## Iter 127 (2 Aug 2026) — Manager WhatsApp restriction + salary slips + monthly attendance email + briefing for managers
- HIGH: Managers can no longer send bills via WhatsApp (POS receipt toast + InvoiceReceiptModal WhatsApp button hidden for role=manager; onShare passed as null). Email + SMS receipts remain automatic for everyone.
- Admin salary slip: GET /api/staff/{sid}/salary-slip.pdf (require_tenant_admin; placed AFTER /staff/me routes to avoid shadowing). "Slip" download button on each StaffCard (hidden for managers). Tested: 200 PDF, manager 403, staff self-slip still 200.
- Monthly attendance email: _attendance_month_rows() (per-staff days present/half-days/lates/fines) + GET /api/reports/attendance-month + POST /api/reports/attendance-month/email (tested ok:true). _attendance_month_html in email_service.py. Auto-scheduler in server.py monthly loop (guard: monthly_attendance_runs meta) emails every active/trial tenant owner on the 1st ≥9AM IST. "Email monthly sheet" button added to Attendance header.
- Mira daily briefing now shows for MANAGER logins too (Dashboard gate widened) — with vendor WhatsApp button, Answer-by-voice mic and voice-greeting toggle hidden for managers (Mail/Email-all-vendors allowed). Playwright-verified as aecs.manager.

## Iter 128 (2 Aug 2026) — Code review fixes
- Verified ruff F821: ZERO undefined variables (report's 49 were false positives; 'is' findings were inside prompt strings / valid `is not None`).
- Refactored check_gift_card (complexity 15) into _gift_card_invalid_reason + _gift_card_summary; create_invoice (14) into _apply_locked_branch + _handle_wallet_payment. C901 clean. Live invoice + gift-check verified.
- Fixed 9 E712 (`== True`) in tests via ruff --unsafe-fixes.
- RBAC hardening: POST/PUT/DELETE /branches, /branding/logo/*, PUT /settings/branding now require_tenant_admin (owner-only) — old test caught managers creating branches (2 stray TEST_ManagerBlocked branches found & removed from preview data).
- Test-data repairs after full-suite run: restored aecs.manager branch lock, manager@miracurl.com password, cleared login_attempts/rate_limits, removed stale Priya Aug-1 attendance; updated stale LOCKED_BRANCH constant (iter94) + gift-card UPI ref (6-char rule) + iter92 fixture cleans whole month.
- Relevant suites green: branches_branding, iter92, iter94, iter96, iter85 (67 passed). Remaining old-iteration test failures are stale-data/rate-limit archaeology, not regressions.
- Deferred (documented): complexity-13 refactors (gift_card_preview_email, _research_salon, lead_roi, _route_business_inbox), import splitting, type-hint coverage drive.

## Iter 129 (3 Aug 2026) — Lead email deliverability + USD Stripe pay links + Tenants redesign
- LEAD DELIVERABILITY (user: 800+ US emails, zero replies): Root causes found — (1) NO unsubscribe (Gmail/Yahoo bulk rules → spam), (2) PDF attachments on every cold email, (3) noreply@ sender, (4) DMARC p=none no rua, (5) LEAD_REPLY_INBOX unset → replies fall to support@miracurl-suite.com (Zoho MX — inbound webhook never fires; replies sit/bounce in Zoho).
  FIXES: RFC-8058 one-click unsubscribe (GET/POST /api/public/lead-unsubscribe/{lid} + List-Unsubscribe headers + visible footer w/ postal addr via BUSINESS_POSTAL_ADDR env), attachments REMOVED from cold pitch/follow-ups/reminders (replaced with public link GET /api/public/brochure.pdf), from_name "Mira at Miracurl", unsubscribed leads blocked from all sends. _send_email now supports headers + from_name.
- USD/STRIPE PAY LINKS: pay_links.py currency-aware end-to-end. Tenant.currency drives plans (INR catalog vs intl_* USD), link stores currency, public page gateway razorpay|stripe. New: POST /public/pay-link/{token}/stripe-checkout (emergentintegrations StripeCheckout, origin success/cancel), GET .../stripe-status/{sid} (poll+settle), settle_stripe_pay_link also wired into payments_intl._settle_txn webhook. _finalize_paid_link extracted (shared rzp/stripe). All emails/hq messages currency-aware via _fmt_amt. Guards: INR plan on USD tenant→400, rzp order on USD link→400. TESTED: real Stripe cs_test session created; USD modal shows $ plans (Playwright).
- TENANTS PAGE REDESIGN: table → readable cards (name+plan+status+health+🌍currency badges row, location/slug/owner/booking link row, SMS + grouped action icons right). All data-testids preserved. 35 cards render.
- USER MUST DO (deliverability): 1) Check Resend dashboard for bounce/complaint rates; 2) upgrade DMARC TXT to `v=DMARC1; p=quarantine; rua=mailto:dmarc@miracurl-suite.com`; 3) confirm support@miracurl-suite.com mailbox EXISTS in Zoho (replies go there); 4) set BUSINESS_POSTAL_ADDR + optionally LEAD_REPLY_INBOX in prod env; 5) warm up: ≤20-30 emails/day to US, not bursts; 6) check Super Admin → Lead ROI opens count (if ~0 opens of 800 → all spam).

## Iter 130 (5 Aug 2026) — Week-off handling + Review blast overhaul + Reply Inbox
- WEEK-OFF: attendance_today now marks staff whose week_off_day == the viewed day as status "week_off" (not "Not checked in"); new week_off count + teal "Week off" tile (grid 6 cols). Late-alert email loop skips week-off staff (no more "Late arrivals" mails for off-day staff). Booking page (BookPublic.steps StaffStep) greys out + disables stylists on weekly off for the selected date with "🏖️ Weekly off" tag (public/staff already exposes week_off_day). Tested via DB toggle: Priya → week_off status + count 1.
- PENDING REVIEWS = 0 BUG: _blast_targets only counted completed APPOINTMENTS — POS-billing salons always showed 0. Now includes POS invoices (last 14d, not voided, deduped one-ask-per-customer). Preview went 0 → 24. /review/{id} already resolves invoices via _resolve_visit. Dashboard pending_reviews uses same fn → fixed.
- REVIEW BLAST CHANNELS: new POST /api/reviews/blast-send {target_id, channel sms|email} — managers SMS ONLY (email→403, WA button hidden), admins get SMS + WhatsApp (client-side) + Email (if customer email). Targets now include customer email. "Send to all" for managers loops SMS. Tested: manager sms 200/email 403; admin modal shows all 3 buttons (Playwright).
- REPLY INBOX: inbound webhook now stores last_reply_text/last_reply_at on leads; GET /api/super-admin/lead-replies; collapsible "📥 Reply Inbox" card in Mira Lead Agent panel with expandable reply body + mailto reply link.
- NOTE: ReviewBlastModal.jsx got corrupted during an edit (duplicate tail) — repaired via python splice; webpack compiles clean.

## Iter 131 (5 Aug 2026) — Leave requests in-app + admin mark-leave
- Staff portal: new 🌴 Leave card (apply from→to + reason, list w/ status badges, cancel pending) using existing /staff/me/leave-requests endpoints.
- Admin: POST /api/leave-requests/admin-mark {staff_id, from_date, to_date, reason} — auto-approved leave (overlap-guarded, approves overlapping pending instead). New LeaveManager card on Attendance page: pending requests w/ Approve/Reject + "Mark leave" form (staff select from roster).
- Booking page: GET /public/staff/{slug} now attaches approved future leaves [{from,to}] per staff; StaffStep disables stylists on leave for the selected date ("🌴 On leave" tag), same as week-off.
- Tested E2E via curl: admin-mark → board on_leave=1 + public leaves exposed; staff apply → pending → admin reject; Playwright: staff Leave card + form renders. Test data cleaned.

## Iter 132 (5 Aug 2026) — Login footer + fingerprint (WebAuthn passkey) login
- Login page: fixed feature footer (12 module chips, scrollable on mobile, backdrop-blur, pb-16 on page) + "🔒 Login with Fingerprint / Face ID" button (shown only when window.PublicKeyCredential && secure context).
- WebAuthn passkeys via `webauthn==2.2.0` (py_webauthn, added to requirements): routes/passkeys.py — /api/passkeys/register/options|verify (auth'd, platform authenticator, resident key, UV required) and /api/passkeys/login/options|verify (public, rate-limited, issues normal auth cookies via set_auth_cookies/make_access). rp_id derived from Origin/Referer host (supports preview + miracurl-suite.com with one codebase). Collections: passkeys, webauthn_challenges (2-min expiry, single-use).
- Enrollment UX: after a successful password login on a capable device, browser prompts once to enable fingerprint (declines remembered via pk_declined localStorage).
- Frontend lib src/lib/webauthn.js (b64url codecs + credential JSON). Tested: options endpoints 200 w/ correct rp; UI verified desktop + mobile 390px. NOTE: full biometric ceremony untestable headless — user should verify on a real phone AFTER redeploy (HTTPS prod domain works; passkeys are per-domain so prod enrollment happens on first prod password login).

## Iter 133 (18 Aug 2026) — Bottle Label Generator live + standalone MS logo
- FIXED: LabelGenerator was imported in ProductsLaunchPanel.jsx but never rendered — now mounted below Order Inbox (Super Admin → Partners → Miracurl Products Launch).
- Generator: product dropdown (5 SKUs incl. botox 500ml/1L/botox shampoo), editable MRP/batch/mfg date/licence/care/marketer, prints 640px gold-bordered label (logo, ingredients, directions, caution, badges, compliance) via window.open+print.
- Verified via Playwright: panel renders, botox-500 label prints with all fields.
- Standalone MS✦ logo (transparent PNG, 1024px, Gemini): https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/3dd323106f2c15479e060879960c3dd54db24a9b875fa61d93eb6eb45771fae7.jpeg — also swapped into label header (old cream-bg jpeg replaced).

## Iter 134 (18 Aug 2026) — Label QR code + true transparent logo
- New public endpoint GET /api/public/products-qr?url= (qrcode lib, PNG, http-only URL guard, 24h cache) — label embeds QR pointing to {origin}/products with "SCAN TO REORDER" caption next to Marketed By.
- Gemini "transparent" logo had checkerboard baked into JPEG; processed via PIL saturation-mask into real transparent PNG at /app/frontend/public/ms-logo.png. LabelGenerator now uses ${origin}/ms-logo.png — logo blends into cream label, no grey box.
- Verified via Playwright popup capture: shampoo label prints with clean logo + working QR.

## Iter 135 (18 Aug 2026) — Code review fixes (report was mostly stale)
- Verified via ruff: F821 undefined vars = 0, F632 is/== = 0 (incl. tests); merge_customers, _compose_lead, lead_roi, _member_birthday_html, _issue_gift_card, _converse_llm all already ≤10 complexity (fixed in earlier session — report stale).
- REAL fixes applied: twilio_voice_gather 13→~6 (extracted _gather_lang_switch/_gather_interested/_gather_callback/_gather_opt_out, zero behavior change); _send_email options now keyword-only (`*` after html) — fixed the one positional caller (super_admin_ops.py:527 attachments=).
- Smoke tested: gather webhook (unknown call → Hangup XML 200), super login 200, mira briefing 200. Backend restarts clean.
- SKIPPED intentionally: import-count/module splits (server.py 83 imports) — covered by /app/memory/REFACTOR_PLAN.md, needs dedicated session per plan (production app, zero-behavior-change + full regression required). Remaining C901s not in report (mira_briefing 15, pdf renderers, on_startup 37) left untouched.

## Iter 136 (18 Aug 2026) — Products everywhere + header caps + call button → Mira
- Landing: "🧴 Our Products" nav link + MiracurlProductsStrip section (4 bottle cards → /products) before Pricing; 8 new feature tiles (POS Billing & CRM, Staff Check-in/out, Staff Payroll, Verified Staff Registry, Booking with Mira AI, Mira Beauty Advisory, Staff Entertainment); Home nav click scrolls to top (window.scrollTo smooth; ScrollToTop already covers route change).
- SiteHeader.jsx (other marketing pages): Our Products link added both variants.
- Tenant booking pages: MiracurlProductsStrip (compact) on /book/{slug} step 0, gated by tenant flag show_miracurl_products (default TRUE); SalonPublic "Our Products" pill gated by same flag; new GET/PUT /api/settings/miracurl-products + MiracurlProductsCard toggle in Settings; public_salon returns show_products. TESTED: iteration_110.json — 100% backend + frontend (toggle round-trip verified, restored to ON).
- Landing header: all-caps animated nav (.nav-cap in index.css — staggered navDropIn + gold underline hover, nowrap). Verified via screenshot.
- BookPublic footer call button: was tel: link (caused OS "Pick an app" popup in production) → now opens Mira AI voice chat (openMira("ai"), data-testid book-talk-to-mira-btn, fuchsia-violet). Verified: click opens AI Advisor widget with mic/hands-free. NOTE: production miracurl-suite.com needs REDEPLOY to get Talk-to-Mira + this fix.

## Iter 137 (18 Aug 2026) — Header overlap fix + caps everywhere + products page header/bg
- Logo overlap fix: shrink-0 on logo lockups, logo img w-14→72px responsive, full nav now hidden xl:flex (compact Contact/SignIn/SignUp below 1280), gap-3 2xl:gap-5, container px-4 xl:px-10. nav-cap fixed at 10px/0.09em (container max-w-7xl=1280 can't fit 11px variant — removed media bump). Verified FITS at 1120/1280/1440/1920 via bounding-box checks.
- SiteHeader.jsx: all-caps animated nav-cap applied (all marketing pages incl. staff-registry).
- /products page: custom MS✦ text nav replaced with shared <SiteHeader variant="light"/> (real gold logo, caps); page bg #FBF6EC→white; footer miracurl.com→miracurl-suite.com.
- NOTE: production needs redeploy.

## Iter 138 (18 Aug 2026) — Settings toast, audit retention, subscription gates, order fields, product detail
- BrandingCard toast → "Salon Profile saved successfully ✦" (manually verified via Playwright).
- Audit log: 7-day auto-purge on GET + DELETE /api/settings/audit-log + "Delete all" button (custom confirm) + note in card.
- Login blocking (auth.py _subscription_gate): TRIAL expires → immediate block (no 60d grace, only explicit grace_until); paid keeps 60d grace; structured 403 detail {code,message,end_date}. Frontend SubscriptionBlockModal (Login.jsx `blocked` state): trial_expired/subscription_expired/suspended popups w/ WhatsApp (from /public/site-info, fallback 918217072523) + admin@/contact@miracurl-suite.com buttons. formatApiError now handles detail.message.
- Grace flow: POST /billing/grace-request (dupe-guarded) → GET /super-admin/grace-requests + decide{approve,days 1-90} sets tenant grace_until. TrialReminder shows "Request Grace" when paid & expired. GraceRequestsCard in Super Admin BillingPanel (approve prompts days). subscription-status returns grace_until + grace_request_pending.
- Product orders: email/address/pincode(6-digit) REQUIRED (422 otherwise); receipt email fire-and-forget to customer; modal inputs have explicit text color (were invisible in prod), inline errors replace alert(), success pill toast.
- NEW: Product detail modal — click any product card (hover lift animation) → back-label style detail: We Have Chemistry, How To Use, full INCI ingredients, What's Out, Net Vol/MRP/Use Before, Mktd by + customer care. product-pop CSS animation. Verified via screenshot.
- TESTED: iteration_111.json — backend 8/8 (100%); testing agent fixed database.py missing grace_requests/audit_log bindings.
- PENDING QUESTION: user reported "booking notification not received today" (production) — awaiting clarification which notification (customer SMS vs owner alert).

## Iter 139 (18 Aug 2026) — SMS RCA + MSG91 switch (placeholders)
- RCA booking SMS not received: sms_log shows ALL sends failing since Aug 14 with Twilio "HTTP 401 Unable to create record: Authenticate" (invalid/expired Twilio auth token). Tenant had 236 sms_points; code path fine.
- Switched SMS_PROVIDER=msg91 in preview .env. MSG91_AUTHKEY was set but SENDER_ID/FLOW_ID were EMPTY → placeholders added (MIRACL / REPLACE_WITH_REAL_FLOW_ID). Provider now resolves to msg91. SMS WILL STILL FAIL until user supplies real DLT-approved Sender ID + Flow ID (they'll create on msg91.com and update secrets themselves, incl. PRODUCTION env).
- Deployer debug dispatched to confirm production env + sms_log state.
- User check point: Super Admin → SMS Delivery Log shows every attempt + error.

## Iter 140 (18 Aug 2026) — Razorpay auto payment links + label/detail visibility fixes
- Product orders now AUTO-CREATE exact-amount Razorpay payment links via existing connected account (routes/subscriptions._rzp_client, payment_link.create w/ notes.order_id+type=product_order) when no manual rzp.io override is set. Receipt email includes "Pay Now ₹X" button. Webhook payment_link.paid → _wh_product_order_paid auto-marks order PAID in Order Inbox. TESTED LIVE: ₹400 link created (then cancelled + test order deleted; preview products toggle restored to OFF).
- ProductsLaunchPanel: link field now "optional override", helper text explains auto-links; input text color fixed.
- LabelGenerator inputs/select: explicit text-slate-800 bg-white (text was invisible in prod) — verified via screenshot.
- Product detail modal: max-h-[92vh] + overflow-y-auto (description was cut off on short screens) — verified full back-label scrollable.
