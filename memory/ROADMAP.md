# Miracurl — Roadmap / Backlog

## P0
- DONE Jun (part 68): Twilio creds live in preview .env, trial number +14246557277 provisioned, SMS e2e delivered. Pending user action: add same 3 env vars to PRODUCTION deployment env; verify more recipient numbers in Twilio console (trial limit).
- MSG91 swap (user will provide keys post-DLT): replace sms_service.py internals only.
- Mira Studio OAuth: infra COMPLETE (Jul 8, iter57) — waiting on USER to supply META_APP_ID/META_APP_SECRET (developers.facebook.com app) and GOOGLE_OAUTH_CLIENT_ID/SECRET (+ GBP API approval). Once pasted in backend/.env, Connect buttons go live. Then test real end-to-end posting + /social/meta/select-page happy path.

## P1
- Staff Hiring Marketplace (owner requests → HQ middleman → verified staff apply → trials) — DONE Jul 10 (iter71)
- CCTV → Flash Offers (empty chairs trigger 2-hour Mira flash deal) — DONE Jul 10 (iter71)
- "What's New ✨" popup — DONE Jul 10 (iter69)
- Automated renewal reminders 15/7/1 (email + WA links) — DONE Jul 10 (iter69)
- Referral rewards tracking (super admin + owner status) — DONE Jul 10 (iter69)
- Mira Day-Smart Offers (weekday-aware AI offers + flyer) — DONE Jul 10 (iter70)
- AI CCTV Analytics (vision snapshots: waiting/empty chairs/queue/idle staff) — DONE Jul 10 (iter70). Pending user action: mount a tablet & run /cctv-capture, or port-forward Hikvision DVR for ISAPI snapshot URL mode.
- Code-review deferred refactors: email_service template split, AppLayout/SuperAdmin/StaffPortal component splits, routes service-layer extraction, type hints (routes/services)
- DONE Jul 7: Birthday emails, Sales Mira landing chat + HQ Inquiries, weekly AI tip
- DONE Jul 7 (iter52): Entertainment portal, POS email receipts (Resend), SMS receipts + sms_points (Twilio-ready), super-admin SMS crediting, admin-configurable late check-in fines
- DONE Jul 7 (iter53): SMS packs via Razorpay (self-serve), Owner Security PIN (staff-write guard), Branch-switch OTP/PIN approval
- Automatic birthday emails to guests (daily scheduler + Resend, reuse luxe template style)
- DONE Jul 6: Weekly Monday mini-report emails (auto scheduler + HQ button)
- Razorpay webhook secret setup in production (user action, guide in test_credentials.md)

## P2
- DONE Jul 7 (iter50): router split — auth, reports, registry, super_admin, sales in routes/ + shared models.py (server.py ~5980 lines)
- DONE Jul 7 (part 69): appointments/POS → routes/appointments_pos.py, subscriptions/razorpay/SMS-packs → routes/subscriptions.py, billing helpers → services/billing.py (server.py ~5290 lines)
- DONE Jul 15 (iter68): FULL monolith split — server.py 6300 → 243 lines; 17 new domain modules in routes/ (customers, uploads, services_catalog, security_settings, staff_admin, staff_portal, gallery, inventory, tenant_settings, crm, briefings, reviews, public_site, super_admin_ops, assistant, offers, public_chat) + schemas.py, utils.py, seeds.py, schedulers.py. Route parity verified (444=444, no shadowing). Testing agent 26/26 pass.
- DONE Jul 15 (iter68): Branded email footer — "Book Now ✦" + "Powered by Miracurl" appended to ALL outgoing emails in email_service._send_email (optional book_url; crm review-request & birthday senders pass tenant booking URL).
- Brute-force lockout: key by X-Forwarded-For real client IP (currently per-pod IP behind ingress) — tester iter50
- DONE Jul 7: TTS Mongo cache, logout jti revocation, avg rating on Reports, Lead→Tenant convert, zero-env-var prod defaults
- Minor (from iter68 testing): 2-3 background 401s in console right after dashboard load (auth-hydration race, non-blocking); `<span>` inside `<option>` React hydration warning in an admin select.

## Recently completed (Jul 6, 2026)
- Code Quality report closure, httpOnly-cookie-only auth, Evening Mira, luxe monthly report email, Aadhaar pepper migration

## Updated 2026-09-18
- DONE: Mira WhatsApp Receptionist (see CHANGELOG).
- BLOCKED (user action): Meta phone OTP for +91 91802 61256 ("send code" when ready); MSG91_FLOW_ID for SMS fallback.
- USER SAID DO NOT SUGGEST AGAIN: advance/deposit booking, guest bill split, rewards QR on KOT.
- Candidate unique features offered (user picked b): a) Mira Virtual Try-On (selfie→hairstyle), c) Empty-slot Flash Deals, d) Hair Formula Passport, e) Menu Photo Studio (resto).
- Receptionist follow-ups: voice-note (audio) replies via Whisper, interactive list/button messages for slot picking, per-tenant own WhatsApp number onboarding (Embedded Signup).
- 2026-09-18 WA STATUS: +91 91802 61256 VERIFIED+REGISTERED on Cloud API (phone id 1327822217077398, PIN in .env WHATSAPP_2FA_PIN). User wants that number BACK on WhatsApp Business app (leads) and will buy a NEW SIM for Mira. When new number arrives: POST /{WABA}/phone_numbers {cc,phone_number,verified_name}, request_code SMS, verify_code, register w/ PIN, set profile, update .env WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_PLATFORM_NUMBER, then POST /{old_pnid}/deregister so user can reinstall WA Business on 91802 61256. Webhook currently → production (miracurl-suite.com). Coexistence (Embedded Signup) = future roadmap.
- 2026-09-18: WAITING ON META: App Review (Advanced access for whatsapp_business_management/messaging) submitted by user; app Publish (Live) pending user click. After approval: any tenant can Connect own number. If Meta asks for the signup popup in the video → re-record with user's FB login.
- Reviewer test login for Meta (if requested): create via ask; not yet created.

## NEXT TASK (user request 2026-09-18, NOT STARTED — do first in next session)
**Redesign Login page as a full landing+login page per user mockup** (asset: https://customer-assets-4nw71qhi.emergentagent.net/job_hair-hub-system/artifacts/ujui5acm_ChatGPT%20Image%20Sep%2018%2C%202026%2C%2001_56_28%20PM.png). User: "this is best I believe except logo — use our logo (public/assets/brand/ms-logo-gold.png / gold lockup). Redesign same. Use your advanced model" → call design_agent with the mockup URL first.
Mockup structure: top nav (logo+name, Features, Industries, Pricing, Success Stories, Support, language, "Get Started"), hero "One Platform. Two Industries. Endless Possibilities." with salon+restaurant imagery, "For Salons" / "For Restaurants" feature blocks with "Explore … Features" CTAs, feature icon row, trust strip ("1000+ Happy Businesses", countries), RIGHT-side login card (email/username, password, Login, **Login with Google**, Login with Phone, "New to Miracurl? Start your free trial"), footer (brand, copyright, social links, About/Features/Pricing/Success Stories/Contact).
Requirements from user:
- Social links: Facebook https://www.facebook.com/profile.php?id=61593610030812 · Instagram https://www.instagram.com/miracurl.ai/
- Add a **WhatsApp lead-generation button** (HQ number 91802 61256 → https://wa.me/919180261256?text=Hi%20Miracurl%2C%20I%20want%20a%20demo) in nav/footer/floating.
- **Google login for tenants** "if possible" → use integration_expert "Emergent-managed Google Auth"; must map Google email → existing tenant user (users collection, tenant slug via X-Tenant-Slug or email lookup); if not feasible keep email login. Phone login = existing OTP flow if present, else omit.
- **All links must work**: Features → /features (or #features anchor), Pricing → existing /pricing or plans page, Success Stories → /stories or testimonials anchor, Support → mailto/WhatsApp, Get Started → /signup (trial). Check App.js for existing public routes (Terms/Privacy exist; check /pricing, /signup, /features).
- Keep existing Login.jsx logic (submit, tenant slug handling, PIN, error states) — only re-skin/compose. Files: pages/Login.jsx, components/LoginShowcase.jsx (currently large 2-col layout, max-w 1640).
- Test with testing_agent (login regression + all links + responsive).
