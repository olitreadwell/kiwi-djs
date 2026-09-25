#!/usr/bin/env bash
# Boots the production server on a throwaway port and curls every route.
set -euo pipefail

PORT="${SMOKE_PORT:-3521}"
BASE="http://localhost:$PORT"

echo "building..."
npm run build >/dev/null

echo "starting server on port $PORT..."
HOSTNAME="0.0.0.0" PORT="$PORT" node .next/standalone/server.js &
pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  if curl -fsS "$BASE/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" != "$expected" ]; then
    echo "FAIL: $label: got $actual, want $expected"
    exit 1
  fi
  echo "ok: $label"
}

check "health status" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/health")"
check "docs status" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/docs")"
check "swagger status" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/docs/swagger")"
check "openapi status" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/openapi.json")"
check "dataset status" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/dataset")"
check "dataset csv status" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/dataset.csv")"
check "djs api status" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/djs")"
check "events api status" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/events")"
check "venues api status" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/venues")"
check "djs page status" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/djs")"
check "events page status" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/events")"
check "venues page status" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/venues")"
check "opt-out page status" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/opt-out")"
check "homepage status" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "unknown route status" "404" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/nope-not-a-route")"

echo "running contract test against $BASE..."
BASE_URL="$BASE" node scripts/contract-test.mjs

echo "smoke: all green"
