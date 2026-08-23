build-bump reminder
RULE: ALWAYS bump BUILD + add a release entry in /app/backend/release_notes.py at the END of every work session (before finish). The in-app "What's New" popup + Deployments tag only update when BUILD changes. User has complained twice about missing this.

- 23 Aug 2026: MISSED bumping BUILD in release_notes.py + sw.js CACHE version during deploy — user got no update notification and thought the deploy failed. These bumps are MANDATORY on every release (rule added to RULES.md). Also: the salon rating badge must use LIVE Google Places rating (google_rating_cache on tenant doc, 24h TTL), not just in-app reviews.
