#!/usr/bin/env bash
# Smoke test: starts the BUILT application (backend/dist and frontend/dist) and checks
# that it answers. It does not test features; it only catches a build that does not start.
#
# Needs: backend and frontend built (npm run build), the database migrated, and the
# variables DATABASE_URL, AGENT_TOKEN and JWT_SECRET (in the CI they come from ci.yml;
# on your computer, from backend/.env).
#
# Usage, from the root of the repository:  bash scripts/smoke-test.sh

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_PORT=3000
FRONTEND_PORT=4173
LOGS="$(mktemp -d)"
FAILED=0

# Stop both servers at the end, whatever happens
cleanup() {
  [ -n "${BACKEND_PID:-}" ] && kill "$BACKEND_PID" 2>/dev/null
  [ -n "${FRONTEND_PID:-}" ] && kill "$FRONTEND_PID" 2>/dev/null
}
trap cleanup EXIT

# Waits until a URL answers (up to 30 s)
wait_for() {
  for _ in $(seq 1 30); do
    curl -s -o /dev/null "$1" && return 0
    sleep 1
  done
  return 1
}

# check "<description>" <expected HTTP status> <curl arguments...>
check() {
  local description="$1" expected="$2"
  shift 2
  local status
  status="$(curl -s -o "$LOGS/body" -w '%{http_code}' "$@")"
  if [ "$status" = "$expected" ]; then
    echo "  ✔ $description ($status)"
  else
    echo "  ✘ $description: expected $expected, got $status"
    head -c 300 "$LOGS/body"; echo
    FAILED=1
  fi
}

for dir in backend/dist frontend/dist; do
  if [ ! -d "$ROOT/$dir" ]; then
    echo "✘ $dir does not exist: run npm run build in $(dirname "$dir") first"
    exit 1
  fi
done

echo "Starting the built backend and frontend..."
# exec: the saved PID is the server itself, so cleanup really stops it
(cd "$ROOT/backend" && exec node dist/server.js > "$LOGS/backend.log" 2>&1) &
BACKEND_PID=$!
(cd "$ROOT/frontend" &&
  exec node_modules/.bin/vite preview --port "$FRONTEND_PORT" --strictPort > "$LOGS/frontend.log" 2>&1) &
FRONTEND_PID=$!

if ! wait_for "http://localhost:$BACKEND_PORT/api/health"; then
  echo "✘ The backend did not start. Its log:"; cat "$LOGS/backend.log"; exit 1
fi
if ! wait_for "http://localhost:$FRONTEND_PORT/"; then
  echo "✘ The frontend did not start. Its log:"; cat "$LOGS/frontend.log"; exit 1
fi

echo "Backend (http://localhost:$BACKEND_PORT):"
check "GET /api/health answers" 200 "http://localhost:$BACKEND_PORT/api/health"
grep -q '"status":"ok"' "$LOGS/body" || { echo "  ✘ /api/health does not say ok"; FAILED=1; }
check "the jobs need a session" 401 "http://localhost:$BACKEND_PORT/api/jobs"
check "a wrong login is rejected (the database answers)" 401 \
  -X POST "http://localhost:$BACKEND_PORT/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke-test@gpugrid.dev","password":"not-the-password"}'

echo "Frontend (http://localhost:$FRONTEND_PORT):"
check "the web page loads" 200 "http://localhost:$FRONTEND_PORT/"
grep -q 'id="root"' "$LOGS/body" || { echo "  ✘ the page is not the React app"; FAILED=1; }
check "the web reaches the API through the proxy" 200 "http://localhost:$FRONTEND_PORT/api/health"

if [ "$FAILED" = 1 ]; then
  echo "✘ Smoke test failed. Backend log:"; tail -n 30 "$LOGS/backend.log"
  exit 1
fi
echo "✔ Smoke test passed: the built application starts and answers."
