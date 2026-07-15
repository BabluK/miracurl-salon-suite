#!/usr/bin/env bash
# CI-style pre-deploy quality gate for Miracurl Suite.
# Run before every redeploy:  bash /app/scripts/predeploy_check.sh
set -u
PASS=0; FAIL=0
API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)

step() { echo; echo "━━ $1"; }
ok()   { echo "  ✅ $2"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $2"; FAIL=$((FAIL+1)); }
check() { # check <name> <command...>
  local name="$1"; shift
  if "$@" > /tmp/predeploy_last.log 2>&1; then ok x "$name"; else bad x "$name  (see /tmp/predeploy_last.log)"; tail -5 /tmp/predeploy_last.log | sed 's/^/     /'; fi
}

step "1/5 Python lint (ruff — errors, undefined names, syntax)"
check "ruff F/E9 clean" bash -c "cd /app/backend && ruff check . --select F,E9 --quiet"

step "2/5 Backend boots (imports + route registration)"
check "server.py imports" bash -c "cd /app/backend && python3 -c 'import server' "

step "3/5 Frontend compiles (React build is served by supervisor hot-reload)"
if curl -sf --max-time 15 "$API_URL/" | grep -qi "<div id=\"root\"" ; then
  ok x "frontend serving HTML shell"
else
  bad x "frontend not serving (check yarn/craco logs: tail /var/log/supervisor/frontend.err.log)"
fi

step "4/5 API smoke tests (live preview)"
smoke() { # smoke <name> <url> <expected_code>
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$2")
  if [ "$code" = "$3" ]; then ok x "$1 → $code"; else bad x "$1 → $code (expected $3)"; fi
}
smoke "public booking services" "$API_URL/api/public/plans" 200
smoke "studio plans"            "$API_URL/api/public/mira-studio/plans" 200
smoke "studio showcase"         "$API_URL/api/public/mira-builder/showcase" 200
smoke "auth guard works"        "$API_URL/api/staff" 401
smoke "release notes build"     "$API_URL/api/public/whats-new" 200

step "5/5 Deploy hygiene"
if grep -rqn "localhost:8001\|127.0.0.1:8001" /app/frontend/src --include="*.jsx" --include="*.js"; then
  bad x "hardcoded localhost URL found in frontend/src"
else
  ok x "no hardcoded backend URLs in frontend"
fi
if grep -q "^REACT_APP_BACKEND_URL=" /app/frontend/.env && grep -q "^MONGO_URL=" /app/backend/.env; then
  ok x ".env keys intact"
else
  bad x "protected .env keys missing"
fi

echo; echo "═══════════════════════════════════"
echo "  PASSED: $PASS   FAILED: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "  🔴 NOT READY — fix the failures above before redeploying."
  exit 1
fi
echo "  🟢 READY TO DEPLOY — also bump BUILD in backend/release_notes.py!"
