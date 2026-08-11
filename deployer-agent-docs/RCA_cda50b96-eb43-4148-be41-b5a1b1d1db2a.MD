# RCA — Cloudflare 520 on Reports (sales / staff-tips) — hair-hub-system

**Deployment:** hair-hub-system (miracurl-suite.com)  ·  **Active run:** cda50b96-eb43-4148-be41-b5a1b1d1db2a
**Template:** fastapi_react_mongo_shadcn (farm)  ·  **frontend_type:** cloudflare  ·  **Tier:** tier_1 (2Gi limit)  ·  **Cluster:** target-3

## Symptom
Users on the Reports page get the Cloudflare **Error 520** toast — *"the origin returned an empty response, malformed HTTP headers, or an otherwise invalid response"* — on:
- `GET /api/reports/sales?start=…&end=…&branch=` (≈1 month, all salons)
- `GET /api/reports/staff-tips?start=…&end=…`

Page then hangs at "Loading…". Works perfectly in preview (200, ~130ms, ~84KB).

## Verdict: NOT a backend runtime fault. The origin is healthy; the 520 is introduced at the Cloudflare edge ⇄ origin layer.

## Evidence (all from the live active run)
1. **Origin returns 200 for the exact failing requests.** uvicorn access log:
   - `GET /api/reports/sales?start=2026-07-12&end=2026-08-11&branch= → 200 OK` (×2)
   - `GET /api/reports/staff-tips?start=2026-07-12&end=2026-08-11 → 200 OK`
2. **Zero 5xx at the origin** across every sampled window (200/401/404 only). No 500s, no tracebacks for these routes.
3. **Pod is stable.** Current pod up ~9.5h, `restart_count: 0`, no `OOMKilled`, no kill_findings, no probe-kill events. get_tier: 2Gi mem limit, 500m CPU.
4. **Not data volume / not OOM.** Production DB is tiny: 17 appointments, **244 invoices**, 1 tip payout, 4 tenants. Invoice docs are ~0.5KB each; `sales` returns `invs[:200]` ⇒ ~100KB body (matches preview's 84KB). 0 invoices missing `payment_mode`/`total` (ruled out a KeyError-500 path).
5. **Edge→origin path works for these routes.** Probing the live URL through Cloudflare returns a clean JSON 401 (`{"detail":"Not authenticated"}`) for both `/api/reports/sales` and `/api/reports/staff-tips` — routing and edge delivery are fine for small responses.

### Note on an earlier red herring
Loki shows ~6 historical `Starting FastAPI backend → Started server process → Application startup complete` cycles within 24h (container restarts). These **predate** the current stable pod (started 2026-08-11 01:38) and coincide with boot-time `mira service image` gpt-image-1 safety-rejection errors (~01:34–01:36), **not** the report requests (which log 200 on the stable pod). They are not the cause of the 520.

## Conclusion
Every backend-runtime candidate the report raised is ruled out with evidence:
- Pod crashes/restarts/OOM → no; pod stable 9.5h, restart_count 0, no OOMKilled.
- Origin timeout → no; origin answers fast with 200 (and CF 520 ≠ 524 timeout).
- Malformed/oversized response headers → no; handlers set no custom headers; body is small, well-formed JSON.
- **Proxy/CDN config between Cloudflare and origin → this is where the evidence points.** Same request = 200 at origin but 520 at the edge, and it is specific to the authenticated large(r)-body success response (the small 401 passes through cleanly).

Because origin emits a valid 200 and the edge rejects it as empty/malformed, the fault lives in the Cloudflare edge ⇄ origin boundary (Worker response handling / origin connection reset / keepalive / TLS), which is **not inspectable from the deployer toolset** (no Cloudflare KV / Worker / hostname / SSL visibility).

## Recommended next steps (for E1 / platform)
1. Reproduce with an **authenticated** admin token against BOTH:
   - the live Cloudflare URL: `https://hair-hub-system.emergent.host/api/reports/sales?start=…&end=…&branch=`
   - the origin directly (bypassing Cloudflare, hitting the k8s Service/pod on target-3).
   If origin-direct returns a clean 200 while the CF URL 520s, the fault is confirmed edge-side.
2. Capture the **exact response headers/bytes** the origin sends to Cloudflare for the authenticated success case (nginx access/error logs on the pod, or `curl -v` from within the cluster) — look for any header anomaly, Content-Length mismatch, or premature connection close on the ~100KB body.
3. Have the platform/Cloudflare team check the Worker + origin-pull config for this deployment (target_cluster routing, response buffering, and any 520 events in Cloudflare analytics for these paths).
4. No code change, manifest change, redeploy, or tier change is warranted based on current evidence — the application backend is functioning correctly.

## Optional app-side hardening (not the cause, but cheap resilience)
`backend/routes/reports.py` `sales_report` (~L291) uses unguarded `inv["payment_mode"]` / `inv["total"]`; `staff_tips_report` (~L405) uses `float(inv["tip"])`. Current prod data has these fields on every doc (verified: 0 missing), so this is not today's failure — but switching to `.get(...)` with defaults would prevent a future 500 if a malformed invoice is ever written.
