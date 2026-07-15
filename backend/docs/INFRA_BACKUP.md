# Miracurl ✦ Salon Suite — Infra Backup Checklist

> **Purpose:** you can re-deploy the entire app on any hosting provider using ONLY this file + the code from this repo. Fill in the blanks below privately (never commit real secret values).

**Author:** Bablu K · **GitHub:** https://github.com/BabluK · **Prod URL:** https://miracurl-suite.com

---

## 1. Backend `.env` (must live in `/backend/.env` — never commit)

```bash
# MongoDB — grab from Emergent support (support@emergent.sh) or your MongoDB Atlas dashboard
MONGO_URL="<paste your mongodb connection string here>"
DB_NAME="<paste your db name here>"

# JWT — generate a fresh 64-char random string with: python -c 'import secrets;print(secrets.token_hex(32))'
JWT_SECRET="<your 64-char JWT secret>"

# Default admin (seeded once on first boot only)
ADMIN_EMAIL="admin@miracurl.com"
ADMIN_PASSWORD="<pick a strong password — used ONLY on first boot>"

# Super admin (seeded once on first boot only)
SUPER_ADMIN_EMAIL="super@miracurl.com"
SUPER_ADMIN_SEED_PASSWORD="<pick a strong password — used ONLY on first boot>"

# Default tenant slug (used by the public booking page for the flagship salon)
DEFAULT_TENANT_SLUG="miracurl-marathahalli"

# Razorpay (payments) — get from https://dashboard.razorpay.com → Account & Settings → API Keys
RAZORPAY_KEY_ID="<rzp_test_... or rzp_live_...>"
RAZORPAY_KEY_SECRET="<your Razorpay key secret>"
# Optional — set after registering a webhook in Razorpay dashboard
RAZORPAY_WEBHOOK_SECRET=""

# Google review URL for the flagship salon (also editable per-tenant in /settings)
GOOGLE_REVIEW_URL="https://www.google.com/search?q=miracurl+unisex+family+saloon+sgr"

# CORS — leave as "*" during dev, tighten to your prod domain(s) for launch
FRONTEND_URL="*"
```

## 2. Frontend `.env` (must live in `/frontend/.env` — never commit)

```bash
# Backend base URL — where FastAPI is running
REACT_APP_BACKEND_URL="https://miracurl-suite.com"
```

---

## 3. Third-party services to keep active

| Service | What for | Where to manage |
|---|---|---|
| Razorpay | Card / UPI / NetBanking checkout | https://dashboard.razorpay.com |
| MongoDB Atlas (or Emergent-hosted) | Database | Emergent support → connection string, or Atlas dashboard |
| Custom domain | miracurl-suite.com | Your registrar (BigRock / GoDaddy / etc.) DNS → point CNAME/A at your host |
| Google Business Profile | SEO + reviews | https://business.google.com — links back via `google_review_url` |
| Instagram | Public link on booking page | Configure via `/settings` → Salon Profile |
| WhatsApp | Support + reminders | Any personal number, no API keys needed for tap-to-send |

---

## 4. Restore from scratch on a new host

```bash
# 1. Clone this repo
git clone https://github.com/BabluK/<your-repo-name>.git miracurl && cd miracurl

# 2. Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp docs/INFRA_BACKUP.md .env.template  # then edit into a real .env
# (paste your saved env values from step 1 above)
uvicorn server:app --host 0.0.0.0 --port 8001 &

# 3. Frontend
cd ../frontend
yarn install
# create .env with REACT_APP_BACKEND_URL
yarn build
# serve /build with nginx / caddy / vercel / netlify
```

## 5. Regular maintenance tasks

- **Weekly:** click **Save to GitHub** in Emergent to keep this repo current
- **Monthly:** export MongoDB dump — email support@emergent.sh, save the archive privately
- **Yearly:** rotate `JWT_SECRET` (users will have to re-login once), rotate `RAZORPAY_*` if compromised
- **Anytime you invite a co-owner:** create a tenant admin via `/super-admin` → Tenants → Add — never share your seeded super-admin credentials

## 6. Emergency contacts

- Platform / Emergent: `support@emergent.sh` (include your Job ID)
- Razorpay: https://razorpay.com/support — 24/7 chat inside dashboard
- Domain registrar: whoever you bought `miracurl-suite.com` from
