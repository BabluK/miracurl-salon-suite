# 🚨 DEPLOYMENT RITUAL — DO THIS BEFORE EVERY DEPLOY (user-mandated, 27 Aug 2026)

The user has explicitly asked that EVERY deploy-worthy change set MUST be announced to all
tenant dashboards via the "What's New ✨" popup. This popup shows once per BUILD value
(localStorage-gated), so if BUILD isn't bumped, users NEVER see the release notes.

## Checklist (every time, no exceptions)
1. Open `/app/backend/release_notes.py`
2. PREPEND a new entry to `RELEASES` (newest first) — friendly, emoji-led, user-facing bullet per feature/fix
3. Bump `BUILD` to `"YYYY-MM-DD.<n+1>"` and update `BUILD_TIME`
4. Only then tell the user the build is deploy-ready

## Why
- The popup appears once per BUILD on all tenant dashboards ("deployment tag + changes popup").
- Also lets the user verify on production that the deploy actually landed (build banner shows the tag).

Last bump: 2026-09-16.264 (group dashboard re-polish + all 15–16 Sep work) — tag MIRA-DEPLOYED-2026-09-16
