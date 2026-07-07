# Miracurl — Roadmap / Backlog

## P0 (user action)
- Add Twilio credentials to backend/.env (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER) + restart backend → SMS receipts go live (flow already built, gracefully skipping)

## P1
- DONE Jul 7: Birthday emails, Sales Mira landing chat + HQ Inquiries, weekly AI tip
- DONE Jul 7 (iter52): Entertainment portal, POS email receipts (Resend), SMS receipts + sms_points (Twilio-ready), super-admin SMS crediting, admin-configurable late check-in fines
- DONE Jul 7 (iter53): SMS packs via Razorpay (self-serve), Owner Security PIN (staff-write guard), Branch-switch OTP/PIN approval
- Automatic birthday emails to guests (daily scheduler + Resend, reuse luxe template style)
- DONE Jul 6: Weekly Monday mini-report emails (auto scheduler + HQ button)
- Razorpay webhook secret setup in production (user action, guide in test_credentials.md)

## P2
- DONE Jul 7 (iter50): router split — auth, reports, registry, super_admin, sales in routes/ + shared models.py (server.py ~5980 lines)
- Further split candidates: appointments/invoices/POS, staff/attendance, razorpay/subscriptions, brand studio
- Brute-force lockout: key by X-Forwarded-For real client IP (currently per-pod IP behind ingress) — tester iter50
- DONE Jul 7: TTS Mongo cache, logout jti revocation, avg rating on Reports, Lead→Tenant convert, zero-env-var prod defaults

## Recently completed (Jul 6, 2026)
- Code Quality report closure, httpOnly-cookie-only auth, Evening Mira, luxe monthly report email, Aadhaar pepper migration
