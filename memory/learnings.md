2026-08-06: search_replace parallel edits on the SAME file can duplicate the file tail (orphan JSX after final }). Always verify `tail -5` of a file after multiple same-file edits in one batch.
## Deployment History / What's New popup (2026-08-13)
- /app/backend/release_notes.py holds BUILD + RELEASES. The Super Admin Deployment History panel and the tenant "What's New" popup are driven by it.
- RULE: whenever a batch of user-facing features ships, BUMP `BUILD` (date.counter) and PREPEND a new RELEASES entry. Otherwise after the user redeploys: the running tag looks stale, no history record appears, and the What's New popup never shows (it compares localStorage seen-key vs BUILD).
