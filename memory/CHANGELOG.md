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
