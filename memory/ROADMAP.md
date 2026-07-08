# Miracurl — Roadmap / Backlog

## P0
- DONE Jun (part 68): Twilio creds live in preview .env, trial number +14246557277 provisioned, SMS e2e delivered. Pending user action: add same 3 env vars to PRODUCTION deployment env; verify more recipient numbers in Twilio console (trial limit).
- MSG91 swap (user will provide keys post-DLT): replace sms_service.py internals only.
- Mira Studio OAuth: connect Instagram/Facebook (Meta Graph API), Google Business Profile, WhatsApp Business — turns "Connect" agents into auto-posting "Ready" agents. (Studio UI + drafts DONE Jul 8, iter56.)

## P1
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
- Further split candidates: staff/attendance, public booking, reviews, brand studio
- Brute-force lockout: key by X-Forwarded-For real client IP (currently per-pod IP behind ingress) — tester iter50
- DONE Jul 7: TTS Mongo cache, logout jti revocation, avg rating on Reports, Lead→Tenant convert, zero-env-var prod defaults

## Recently completed (Jul 6, 2026)
- Code Quality report closure, httpOnly-cookie-only auth, Evening Mira, luxe monthly report email, Aadhaar pepper migration
