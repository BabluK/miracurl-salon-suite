# Miracurl Auth Testing Playbook

## MongoDB
- DB: from DB_NAME env
- users collection: stores email, password_hash (bcrypt $2b$), name, role, created_at
- login_attempts: identifier "{ip}:{email}", count, last_attempt
- password_reset_tokens: TTL index on expires_at

## API Endpoints
- POST /api/auth/register  body {email,password,name} -> sets cookies, returns user
- POST /api/auth/login     body {email,password}      -> sets cookies, returns user
- POST /api/auth/logout    -> clears cookies
- GET  /api/auth/me        -> current user (requires auth)
- POST /api/auth/refresh   -> refresh access token
- POST /api/auth/forgot-password body {email}
- POST /api/auth/reset-password  body {token,new_password}

## Test Steps
1. Login admin (admin@miracurl.com / Miracurl@123)
2. Verify cookies set (access_token, refresh_token)
3. GET /api/auth/me returns admin user
4. Wrong password 5x -> 423/429 lockout for 15min
5. Logout clears cookies; /me returns 401
