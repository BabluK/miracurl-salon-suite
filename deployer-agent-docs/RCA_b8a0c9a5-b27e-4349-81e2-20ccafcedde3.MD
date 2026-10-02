# RCA — POS "Send bill → SMS" shows "SMS: not configured"

**Deployment:** hair-hub-system  |  **Active run:** b8a0c9a5-b27e-4349-81e2-20ccafcedde3 (redeploy, success, deployed 2026-09-30 06:23 UTC)  |  **DB:** hair-hub-system-miracurl_db

## Verdict
**NOT reproducible on the current production build.** The `not_configured` symptom is explained by the OLD build / old secret state. As of the active run (build **2026-09-30.373**), `MSG91_AUTHKEY` is set and billing_v2 receipt SMS are sending successfully. It is neither a missing/misnamed runtime env var nor a stale build *currently in production* — the failing path was fixed and redeployed on 2026-09-30.

## 1. Which build/commit is running in production
- `backend/release_notes.py` top entry in the active run's source: **BUILD = "2026-09-30.373"** (BUILD_TIME 30 Sep 2026, 07:40 IST). This is **≥ .372**.
- Running `backend/sms_service.py` `_msg91_ready()` (lines 82–84):
  ```python
  def _msg91_ready() -> bool:
      return bool(os.environ.get("MSG91_AUTHKEY")) and bool(os.environ.get("MSG91_FLOW_ID") or MSG91_TEMPLATES)
  ```
  `MSG91_TEMPLATES` is a module-level non-empty dict → always truthy, so the second clause is always satisfied. **Effectively only `MSG91_AUTHKEY` is required.** This is the post-.372 behaviour (does NOT require `MSG91_SENDER_ID`/`MSG91_FLOW_ID`). Sender falls back to DLT header `MIRACU` via `msg91_sender()`.

## 2. Runtime env (active run secrets)
Verified via list_secrets on the active run (values/lengths are never returned by the platform — only empty/non-empty; I therefore cannot print AUTHKEY's length, only its presence):
- `MSG91_AUTHKEY` — **present, non-empty** (is_empty=false). Exact name, no typo/whitespace variant in the secret set.
- `MSG91_SENDER_ID` — **empty** (is_empty=true). Harmless: code falls back to default sender `MIRACU`.
- `MSG91_FLOW_ID` — **empty** (is_empty=true). Harmless: `_msg91_ready` no longer needs it; billing_v2 uses a template id, not a flow id.
- `MSG91_TPL_BILLING_V2` — **not defined as a secret at all.** Harmless: `sms_service.py` has a hard-coded default template id `6ab13736d65b55eb1d09ac54` for kind `billing_v2`, and HQ-entered template IDs from `hq_settings.sms_templates` override env (backend log: "HQ MSG91 template IDs applied from hq_settings").
- `MSG91_TPL_OTP` — present. `SMS_PROVIDER` — present.

## 3. Production MongoDB `sms_log`
- Last 10 billing_v2 docs: **all sent=true, error=null**, most recent 2026-10-02 05:27 UTC (tenants 83ab97b6…, bffe3be4…).
- All `error="not_configured"` docs are dated **2026-09-29 → 2026-09-30 02:44 UTC** — i.e. BEFORE the active run deployed (06:23 UTC). All on tenant bffe3be4… (which now sends successfully).
- Confirming counts (created_at > active-run deploy time 2026-09-30T06:23:20Z):
  - `not_configured` errors: **0**
  - successful `billing_v2` sends: **35**

## 4. Backend pod logs (active run, last 6h)
- No `not_configured`, no error lines. Only `GET /api/sms-packs → 200` and `sms - INFO - HQ MSG91 template IDs applied from hq_settings`.

## Root cause
The `not_configured` responses came from the earlier state where `MSG91_AUTHKEY` was empty at runtime (and/or the pre-.372 `_msg91_ready` demanded `MSG91_SENDER_ID`/`MSG91_FLOW_ID`). The user saved `MSG91_AUTHKEY` in the Secrets tab and the 2026-09-30 redeploy (build .373) picked it up via write_secrets. Since then every billing_v2 receipt SMS succeeds. The last `not_configured` row (2026-09-30 02:44) predates the live run by ~3.5h.

The earlier debug run that "reported the key present" was correct about the Secrets tab, but a secret only reaches the pod at the next deploy's write_secrets step — the then-active pod predated that, so the live `os.environ["MSG91_AUTHKEY"]` was still empty until the 09-30 redeploy.

## Why the symptom may still appear to the cashier
Frontend is served from **Cloudflare (R2)**. A cashier on a stale cached bundle, or re-reading a toast captured before the 09-30 deploy, can still see "SMS: not configured" even though the backend path now works. This needs a live re-test, not a code/secret change.

## Suggested fix
- **User / test_and_verify:** Hard-refresh (or incognito) the POS, then tap "Send bill → SMS" on a freshly paid invoice and confirm a new `sms_log` row with sent=true. The backend is already configured and sending. No secret change or redeploy is required for the AUTHKEY path.
- Optional hygiene (not the cause): `MSG91_SENDER_ID` and `MSG91_FLOW_ID` are empty and `MSG91_TPL_BILLING_V2` is undefined — all tolerated by the current code via fallbacks, so leave as-is unless you want explicit overrides.
