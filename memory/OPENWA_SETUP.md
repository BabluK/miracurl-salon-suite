# OpenWA (self-hosted WhatsApp gateway) — preview setup

Installed 2026-09-17 at `/opt/openwa` (NOT inside /app — not part of the deployable repo). Node 22 at `/opt/node22`.
Runs under supervisor as `openwa` (`/etc/supervisor/conf.d/openwa.conf`), bound to 127.0.0.1:2785, engine whatsapp-web.js
(Chromium at /usr/bin/google-chrome). Sessions persist in /opt/openwa/data (SQLite + WhatsApp login), AUTO_START_SESSIONS=true.

Backend env (backend/.env): `OPENWA_BASE_URL=http://127.0.0.1:2785`, `OPENWA_API_KEY=<API_MASTER_KEY from /opt/openwa/.env>`.

## Miracurl integration
- `services/whatsapp_gateway.py` — ensure/start session per tenant (`t-<slug>`), status (+QR), pairing_code, unlink, send_text/send_image, `tenant_connected()`.
  Tenant doc field `wa_gateway: {session_id, session_name, status, phone, linked_at}`.
- `routes/whatsapp_link.py` — `/api/whatsapp-link/{status,start,pairing-code,unlink,test-send}` (tenant admin).
- `whatsapp_cloud.send_text()` routes via the gateway when the tenant is linked, else Meta Cloud API. winback blast: no template, no wa_points deduction when own number linked.
- `tenant_features.features_of()` returns whatsapp=True when `wa_gateway.phone` is set (HQ switch not needed).
- UI: `components/settings/WhatsAppLinkCard.jsx` in Settings (above Connected Accounts): QR + "Link with phone number" code + test send + unlink.

## Re-install if the pod is recreated (/opt is not persisted)
```
cd /opt && git clone --depth 1 https://github.com/rmyndharis/OpenWA.git openwa
ARCH=$(uname -m | sed 's/aarch64/arm64/;s/x86_64/x64/'); curl -fsSL https://nodejs.org/dist/v22.20.0/node-v22.20.0-linux-$ARCH.tar.xz -o n.tar.xz && mkdir -p /opt/node22 && tar -xJf n.tar.xz -C /opt/node22 --strip-components=1
cd openwa && PATH=/opt/node22/bin:$PATH PUPPETEER_SKIP_DOWNLOAD=true npm ci && PATH=/opt/node22/bin:$PATH npm run build
# recreate .env (see keys above; API_MASTER_KEY must equal OPENWA_API_KEY in backend/.env), supervisor conf, supervisorctl update
```

## Production
Emergent Deploy ships only backend+frontend. OpenWA must run on a user-owned VPS/PC; set OPENWA_BASE_URL/OPENWA_API_KEY in prod env.
Ban-risk guidance (from OpenWA README): dedicated number preferred, warm-up, few msgs/min, only own customers.
