# Miracurl CHANGELOG (append new session entries here; PRD.md >700 lines is frozen history)

## Session 2026-06 (fork) — Win-back improvements (option c: improve existing)
- User sends win-back WhatsApps manually via wa.me links; chose NOT to add auto-SMS or WA Business API.
- winback.py: _nudge_message() — warmer copy (name, exact days away, 15% gift, booking link, restaurant variant); _winback_wins() — guests with an invoice AFTER their first nudge (channels email/whatsapp/dashboard_contacted, 90d window) → wins list + wins_count + wins_revenue in GET /winback/nudges.
- WinbackNudges.jsx: green "came back" banner (winback-wins-banner) with per-guest chips, prominent labelled auto-toggle switch, card renders when wins exist even with 0 nudges, currency via tenant.currency.
- Tested: curl (copy + booking link), synthetic win seeded → wins_count=1/₹1250 verified in API + dashboard screenshot → synthetic data cleaned (customers/lead_outreach/invoices deleted).
- release_notes BUILD → 2026-09-01.159 (3 lines appended to today's entry).
