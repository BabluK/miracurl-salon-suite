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
