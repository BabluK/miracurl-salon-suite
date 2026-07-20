# Standing rules from the user (never skip)

1. **Release notes on every change** — before finishing ANY task, bump `BUILD` + `BUILD_TIME` in `/app/backend/release_notes.py` and add a plain-language "What's New" entry describing the change. The user checks the build number on production after each deploy.
2. Production is https://miracurl-suite.com — never test against it; preview only. User redeploys to push changes.
3. Clean up all test data (tenants, invoices, leads, transactions) after self-testing.
4. Update /app/memory/test_credentials.md whenever credentials change.
