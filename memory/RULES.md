# Standing rules from the user (never skip)

1. **Release notes on every change** — before finishing ANY task, bump `BUILD` + `BUILD_TIME` in `/app/backend/release_notes.py` and add a plain-language "What's New" entry describing the change. The user checks the build number on production after each deploy.
2. Production is https://miracurl-suite.com — never test against it; preview only. User redeploys to push changes.
3. Clean up all test data (tenants, invoices, leads, transactions) after self-testing.
4. Update /app/memory/test_credentials.md whenever credentials change.

## ⛔ NEVER-SKIP RELEASE CHECKLIST (user has complained about misses — zero tolerance)
Before EVERY finish/deploy, no matter how small the change (even refactors):
1. Bump `BUILD` + `BUILD_TIME` in `/app/backend/release_notes.py` AND add a plain-language "What's New" entry.
2. Bump the `CACHE` version in `/app/frontend/public/sw.js` (e.g. miracurl-v14 → v15) whenever ANY frontend file changed — without it users get NO "refresh to update" toast in production.
3. Verify both with: curl /api/public/build and grep CACHE sw.js.
Missing any of these = the user sees "changes not reflecting" in production.
