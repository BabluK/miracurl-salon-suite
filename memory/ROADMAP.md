# Miracurl — Roadmap / Backlog

## P1
- DONE Jul 7: Birthday emails, Sales Mira landing chat + HQ Inquiries, weekly AI tip
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
