# 2026-07-19 — Mira logo fix + Staff Verification workflow

## Fix: Mira AI logo on /demo (P0, user-reported)
- Root causes: (1) `mira-ai-logo.png` / `mira-avatar.png` assets were a cropped, non-square image (circle cut at bottom, 474x412) with a baked-in checkerboard; (2) `PublicDemo.jsx` chat `scrollIntoView` auto-scrolled the whole page on load, hiding the hero.
- Fixed: regenerated square 512x512 transparent-background logo (image edit + flood-fill bg removal), replaced both assets (also used by PromoVideoStudio/VeoAdStudio). Chat now scrolls its own container (`listRef.scrollTo`), hero sized `w-28 h-28 sm:w-32 sm:h-32 object-contain`.

## Feature: Staff Verification workflow (HQ)
- Get-verified requests no longer land in Tenant Inquiries. New collection `staff_verification_requests`; legacy `tenant_inquiries(source=staff_badge_request)` lazily migrated on first list call.
- Public form (`RegistryPublic.jsx` GetVerifiedCard): now multipart with REQUIRED recent photo (JPG/PNG/WebP ≤3MB, stored b64 in `registry_photos`, served at `GET /api/public/registry/photo/{pid}`) + new `experience` field.
- Super-admin → Staff Verification tab (`VerifiedStaffPanel.jsx` → `VerificationRequests` component): shows all details + photo, status flow:
  new → "Verified by Salon Owner" button → owner_verified → "Generate Badge & Email" → badge_issued (Staff ID chip + Download Badge PDF + Resend email).
- `POST /api/super/registry/verify-requests/{rid}/generate-badge`: creates/reuses `registry_employees` (STF-xxxxx staff ID), inserts hq_verified employment for the salon (from_date parsed from joining year), builds badge PDF (`_build_registry_pdf`, photo pulled from registry_photos via fetcher override), emails branded template with Staff ID + PDF attachment (Resend).
- Removed old endpoints from sales.py (`/public/registry/get-verified` JSON version, `/super-admin/inquiries/{iid}/send-badge`) and SendBadgeButton from InquiriesPanel.
- `id_cards.py _img_bytes` + `registry_public_pdf` now resolve `/api/public/registry/photo/...` photo URLs from Mongo (SSRF-guard blocks self-fetch).

## Tested (curl E2E + screenshots)
- Submit w/ photo → list → 400 guard on premature generate → owner-verified → generate (STF-00133, email_sent true) → PDF download valid → public search shows HQ Verified + photo. Test data cleaned after.

## 2026-07-19 (part 2) — Booking caps + QR verify + UUID-hallucination fix
- SEC-001 booking caps (`public_chat.py _public_ai_reply`): before executing a [[BOOK]] marker — `durable_rate_limit(aibook:{tenant}, 8/10min per IP)` + `ai_daily_quota(public_ai_bookings, 50/day per tenant)`. On limit: graceful Mira reply ("call the salon directly"), booking_error="booking_limit_reached", no exception leaks. Tested: quota seeded to 50 → graceful block; reset → booking succeeds.
- Inquiry dedupe (same phone / 24h + 40/day) was ALREADY in `_capture_ai_inquiry` — no change needed.
- BUG FOUND & FIXED (pre-existing, likely on production too): gpt-5.4-mini hallucinated the tail of full 36-char service UUIDs in booking JSON → "Selected services were not found on the menu". Fix: catalog now exposes 8-char ids (`s['id'][:8]`), new `_resolve_id_prefixes()` expands prefixes back to full ids for services + staff at execution time. Verified E2E: real booking created via chat.
- QR on badge PDF: `_build_registry_pdf` header now renders a QR (white box, top-right, "SCAN TO VERIFY LIVE") when profile has `verify_url`; `_registry_pdf_bytes` (registry.py) sets it to `{APP_PUBLIC_URL}/staff-registry?q={staff_code}&name={first}` — deep-link auto-search already exists in RegistryPublic.jsx. Verified by rendering the PDF to PNG.
- INCIDENT: a search_replace on public_chat.py silently appended garbage at EOF (duplicate fragment "ind_one(...)") — repaired by truncating at line 603. Check EOF if syntax errors appear after edits to this file.

## 2026-07-19 (part 3) — Mira booking UX fixes (user-reported)
- _free_slots_for: rejects past dates; for TODAY excludes slots already past in IST (+15 min buffer) — Mira no longer offers 10:00 AM at noon.
- Catalog slot window extended 3 → 7 days.
- Prompt: strict language mirroring (English → PURE English, no Hindi mixing); booking flow collects name+phone+service+expert+time, confirms EXACTLY ONCE, books immediately on confirm; explicit "all times are IST" instruction.
- Failure replies no longer lie: stylist/slot conflicts show the REAL reason (e.g. "Rahul Verma is already booked at that time") + actual free times; non-slot errors show honest message instead of "slot got fully booked".
- NOTE: user's production complaint ("slot is booked" on every attempt) = the UUID-hallucination bug fixed in part 2 → needs DEPLOY.
- E2E verified: past-slot filtering, single-confirm English booking at 18:00 IST with named stylist, stylist-conflict message. Test bookings/customers cleaned.

## 2026-07-19 (part 4) — Language fixes (user screenshots from PRODUCTION) + deploy check
- User screenshots were from miracurl-suite.com (production, old code) — most issues already fixed in preview; deploy required.
- Voice STT: whisper prompt was Devanagari-heavy → English speech transcribed in Devanagari → Mira's language-refusal loop. Prompt now Latin-biased ("Transcribe English speech in English (Latin script)").
- Prompt rules: Devanagari = Hindi always; never refuse mixed/partly-English messages; refusal only for clearly-entirely-foreign scripts; translate ALL English template lines (welcome etc.) into the customer's language.
- Server-generated booking messages localized (_BOOK_MSGS en/hi/kn + _msg_lang script detection): limit / confirm / slot_free / slot_none / generic — no more English "slot fully booked" in Hindi chats.
- E2E verified: garbled Devanagari+English message answered helpfully (no refusal); full Hindi booking flow with Hindi confirmation "✅ हो गया — आपकी बुकिंग पक्की!". Test data cleaned.
- deployment_agent: PASS — no blockers, ready to Deploy.

## 2026-07-19 (part 5) — Auto-link staff signup (pending admin approval)
- auth.py register: if signup email exactly matches an UNCLAIMED staff profile (staff.email, no user_id), store matched_staff_id/matched_tenant_id + auto-set requested_tenant_slug → request lands in that salon's pending list; message names the salon.
- list_pending_staff: includes matched users, enriches with matched_staff {name, role}.
- attach_staff: on approval, if verified match (same tenant, email equal, profile unclaimed) → sets user.staff_id + staff.user_id (Staff Portal works instantly). Returns linked_staff.
- NEW: DELETE /tenants/staff/pending/{user_id} (reject/delete orphan signup, scoped).
- NEW UI: PendingSignupsPanel on Staff page (amber card, approve/reject, match hint). Was NO UI for pending attach before — stranded users had no path.
- BUG FIXED (pre-existing): hiring auto_mark_hired name fallback matched on a single shared token ("Test") → spurious hires + placement-fee emails. Now requires exact normalized full-name equality. Spurious test hire reverted, fee deleted.
- Cleaned 57 stale @test.com orphan pending users.
- E2E verified: staff created → self-signup with same email → match message → pending list shows match → approve → user linked (staff_id set) → /staff/me/profile works. UI screenshot verified.

## 2026-07-19 (part 6) — Employee Portal locked to ACTIVE staff only (user request)
- User reversed the "career passport for left staff" concept: left / disabled-by-admin / notice-period-completed staff must NOT access the app at all.
- employee_portal.py: new `_is_employment_active(employee_id)` — active salon staff record (active=True AND last_working_day not past, matched by phone last-10) wins; if salon staff records exist but none active → BLOCKED; registry-only externals need an open employment (to_date None).
- Enforced in `current_employee` dependency (kills existing sessions instantly), `employee_login`, `employee_register`. 403 message: "This portal is available to active salon staff only…".
- E2E verified: active → login OK; staff disabled → existing session + fresh login both 403; re-enabled → access restored. Test data restored (weekoff-test-staff active, employment reopened).

## 2026-07-19 (part 7) — Code review fixes
- FALSE POSITIVES (verified, no change): social_connect.py:30 "hardcoded secret" is a public Google OAuth scope URL (creds via env); ruff F821/F632 = 0 across backend incl. tests ("43 undefined vars" / "159 is-comparisons" don't reproduce); utils.py:8 uses `in` correctly.
- Complexity refactors (all with type hints): auth.py → _match_unclaimed_staff() + _link_matched_staff(); packages.py → _pkg_price(); promo_video.py _run_pipeline → _script_prompts() + _persist_video(); hq_documents.py _run_demo_chat_booking → _demo_booked_reply().
- Param-count fixes: _demo_email_html tracking=(base,id) tuple; _book_open_demo now takes a dict (callers: body.model_dump() / {**data,"tz":tz}); _draw_about_section frame=(W,hero_h,m).
- Style: E702 semicolons in hq_documents PDF loop; E731 lambda→def in sales.py. Remaining E402s are DELIBERATE (circular-import avoidance) — left as-is.
- Import-splitting suggestion (hq_documents 37 imports) deferred — high-churn, low-value.
- Regression: register→pending(match)→attach(linked_staff) ✓, public demo book ✓, _pkg_price/_script_prompts unit checks ✓, ruff clean (E402 only). Test data cleaned.

## 2026-07-19 (part 8) — Farewell screen + Win-back automation + Lead Gen target UI
- Farewell screen (EmployeePortal.jsx): 403 "active salon staff only" on /employee/me or login now shows a warm "Thank you for everything ✦" screen (data-testid farewell-screen) instead of an error toast. Verified via screenshot.
- Win-back automation (standalone, no full autopilot needed): new `winback_auto` flag in autopilot_settings (DEFAULTS + SettingsIn); `run_autopilot_for_tenant(..., winback_only=True)` skips daily post; `_run_enabled_tenants` also runs winback-only tenants ({enabled≠True, winback_auto:True}) via existing daily 10:00-IST scheduler. Toggle endpoints GET/PUT /api/winback/auto (winback.py). Dashboard WinbackNudges card got "Auto ON/OFF" pill (data-testid winback-auto-toggle). E2E: lapsed test customer → winback-only run → 1 email sent + lead_outreach record; cleaned + toggle reset OFF.
- Lead Gen funnel cards (MiraLeadAgent.jsx): when count >= target, show just the count + green "✓ TARGET n DONE" chip and emerald bar (no more "529 / 300"). 5-day resend reminder scheduler untouched (kept as requested).

## 2026-07-19 (part 9) — Lead Gen advanced search + international
- _places_search: multi-category parallel queries (Salon / Unisex Salon / Spa / Boutique / Hair Care), each PAGINATED up to 3 pages (60/category via nextPageToken) → up to ~300 raw, deduped by name+address, best-reviewed first, `category` tagged (shown as fuchsia chip on lead rows, data-testid lead-category-{id}).
- Depth: _find_candidates now pulls a pool of max(target*3, 40) so Bangalore-sized cities don't repeat; target cap raised 25→50 (backend Field le=50 + UI max).
- International: prompts region-neutral (no ", India" hardcoding), city accepts "London, UK" / "New York, US" (country code preserved uppercase on title-casing), UI placeholder updated. NOTE: appended pricing table in outreach emails is still INR-based — flagged to user.
- Verified: Bangalore 150 unique results; London, UK 40 real venues across all 5 categories.

## 2026-07-19 (part 10) — Locality rotation for repeat lead runs
- _next_localities(city, 3): AI builds 12-18 locality list once per city (cached in `lead_localities` {city, localities, cursor}); cursor rotates 3 per run.
- _places_search(areas=...): locality-scoped queries first (5 cats × 3 areas, 1 page each); city-wide deep search tops up only when thin. Run log shows "🧭 This run explores: …".
- Verified: run1 Indiranagar/MG Road/Koramangala → run2 Brigade Road/Jayanagar/Church Street; 31/40 results from picked localities.

## 2026-07-19 (part 11) — Three roadmap items
1. Currency-aware outreach pricing (lead_gen.py): _lead_intl(city) (country suffix ≠ IN), _plans_for filters PLAN_CATALOG by currency; _pricing_lines/_pricing_table_html render $ vs ₹ (+USD payment-link footer); _PRICE_RE also strips $/USD; draft + email HTML use lead.city. Verified: London,UK→10 USD plans, Bangalore→8 INR.
2. Weekly digest + WhatsApp share: GET /api/reports/weekly-digest (require_admin+current_tenant; reuses _tenant_week_stats + _rule_based_tip from super_admin_ops) returns stats + wa_text. New WeeklyDigestCard on Dashboard (owner-only, data-testid weekly-digest-card, digest-whatsapp-btn wa.me share, expandable stats+tip). Weekly Monday-9am EMAIL report already existed (untouched). Verified: ₹194,714 week, card renders, WA share button present.
3. Consent-withdraw (Staff Registry): POST /api/employee/me/consent {public_visible}; registry public search + badge PDF now 403 "withdrawn consent" when consent_withdrawn; PrivacyConsentCard on Employee Portal dashboard (emp-consent-card / emp-consent-toggle-btn) with withdraw/re-enable. Verified E2E: withdraw→403 search+pdf→re-enable→visible.
