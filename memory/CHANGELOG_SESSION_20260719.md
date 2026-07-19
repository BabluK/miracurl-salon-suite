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
