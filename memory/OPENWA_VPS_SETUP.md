# Miracurl — Production WhatsApp Gateway (OpenWA) on a VPS

The Miracurl app (backend + frontend) deploys on Emergent. The WhatsApp gateway (OpenWA) must run on a
small server you own, reachable over HTTPS. Miracurl talks to it with two env vars: `OPENWA_BASE_URL`, `OPENWA_API_KEY`.

## 0. What you need (≈ 20 minutes)
| Item | Recommendation |
|---|---|
| VPS | Ubuntu 24.04, **2 vCPU / 4 GB RAM / 40 GB SSD** (Hetzner CX22 ≈ €4.5/mo, DigitalOcean Basic $24/mo, Contabo VPS S). 4 GB ≈ 6–8 linked salons; 8 GB ≈ 15 |
| Domain | A sub-domain you control, e.g. `wa.miracurl-suite.com` → A record to the VPS IP |
| Ports | 22 (SSH), 80 + 443 (HTTPS). **Never expose 2785 publicly** |

## 1. Prepare the server
```bash
ssh root@YOUR_VPS_IP
apt update && apt -y upgrade
apt -y install curl git ufw nginx certbot python3-certbot-nginx
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt -y install nodejs
# Chromium deps (whatsapp-web.js engine)
apt -y install chromium fonts-liberation libasound2t64 libatk-bridge2.0-0 libgtk-3-0 libnss3 libxss1 libgbm1
# non-root service user
adduser --system --group --home /opt/openwa openwa
```

## 2. Install OpenWA
```bash
cd /opt && git clone --depth 1 https://github.com/rmyndharis/OpenWA.git openwa-src
chown -R openwa:openwa /opt/openwa-src && cd /opt/openwa-src
sudo -u openwa bash -c 'PUPPETEER_SKIP_DOWNLOAD=true npm ci --no-audit --no-fund && npm run build'
sudo -u openwa mkdir -p data
```
Create `/opt/openwa-src/.env` (generate the key with `openssl rand -base64 32 | tr -dc A-Za-z0-9 | head -c 40`):
```
PORT=2785
BIND_HOST=127.0.0.1
NODE_ENV=production
AUTO_START_SESSIONS=true
DATABASE_TYPE=sqlite
DATABASE_NAME=./data/openwa.sqlite
DATABASE_SYNCHRONIZE=true
ENGINE_TYPE=whatsapp-web.js
SESSION_DATA_PATH=./data/sessions
PUPPETEER_HEADLESS=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage,--disable-gpu
STORAGE_TYPE=local
STORAGE_LOCAL_PATH=./data/media
REDIS_ENABLED=false
QUEUE_ENABLED=false
CACHE_ENABLED=false
STATUS_SEED_ON_READY=false
API_MASTER_KEY=owa_PASTE_YOUR_40_CHAR_KEY
CORS_ORIGINS=https://miracurl-suite.com
LOG_LEVEL=info
TZ=Asia/Kolkata
```
`chmod 600 .env && chown openwa:openwa .env`

## 3. Run it as a service
`/etc/systemd/system/openwa.service`:
```
[Unit]
Description=OpenWA WhatsApp gateway
After=network-online.target

[Service]
User=openwa
WorkingDirectory=/opt/openwa-src
ExecStart=/usr/bin/node dist/main
Restart=always
RestartSec=5
Environment=NODE_ENV=production
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```
```bash
systemctl daemon-reload && systemctl enable --now openwa
journalctl -u openwa -f      # wait for "OpenWA is running on: http://localhost:2785"
```

## 4. HTTPS in front (nginx + Let's Encrypt)
`/etc/nginx/sites-available/openwa`:
```
server {
    server_name wa.miracurl-suite.com;
    client_max_body_size 25m;
    location / {
        proxy_pass http://127.0.0.1:2785;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_read_timeout 120s;
    }
}
```
```bash
ln -s /etc/nginx/sites-available/openwa /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx
certbot --nginx -d wa.miracurl-suite.com --redirect -m you@miracurl-suite.com --agree-tos
curl -s https://wa.miracurl-suite.com/api/sessions -H "X-API-Key: owa_YOUR_KEY"   # → []
```
Optional lock-down: only let Emergent's egress reach it — add `allow <emergent-ip>; deny all;` inside `location /` once you know the IP.

## 5. Point Miracurl at it
In Emergent → your app → **Deploy → Environment variables**, add:
```
OPENWA_BASE_URL=https://wa.miracurl-suite.com
OPENWA_API_KEY=owa_YOUR_KEY
```
Redeploy. Each salon then goes to **Settings → Link your WhatsApp** and scans the QR / enters the pairing code
once. Sessions persist in `/opt/openwa-src/data/sessions` and auto-reconnect after reboots.

## 6. Keep it healthy
```bash
# nightly backup of sessions + sqlite (cron 03:00)
0 3 * * * tar -czf /var/backups/openwa-$(date +\%F).tgz -C /opt/openwa-src data && find /var/backups -name 'openwa-*.tgz' -mtime +14 -delete
# updates
cd /opt/openwa-src && git pull && sudo -u openwa npm ci && sudo -u openwa npm run build && systemctl restart openwa
```
Watch: `systemctl status openwa`, RAM (`free -m`, ~400 MB per linked number), and the **Settings card**
in Miracurl — if it says *Disconnected*, the salon just re-scans.

## Ban-safety reminders (built into Miracurl)
One message every 30–45 s per salon · 200/day cap (adjustable) · only your own guests · keep replying to
customers from the same number so WhatsApp sees two-way conversations. Prefer a dedicated business SIM.
