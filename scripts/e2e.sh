#!/usr/bin/env bash
set -euo pipefail

# Start isolated gateway + webui dev server, run Playwright E2E, then clean up.
# Usage: bash scripts/e2e.sh [playwright args...]

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.e2e}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
elif [[ -f "$ROOT/.env.e2e.example" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT/.env.e2e.example"
  set +a
fi

GATEWAY_PORT="${MINIBOT_SERVER_PORT:-18766}"
WEB_PORT="${PLAYWRIGHT_WEB_PORT:-15173}"
DATA_DIR="${MINIBOT_SERVER_DATA_DIR:-/tmp/minibot-e2e-$$}"
AUTH_SECRET="${MINIBOT_SERVER_AUTH_SECRET:-e2e-test-secret}"
API_URL="${MINIBOT_API_URL:-http://127.0.0.1:${GATEWAY_PORT}}"
BASE_URL="${PLAYWRIGHT_BASE_URL:-http://127.0.0.1:${WEB_PORT}}"

stop_listener_on_port() {
  local port=$1
  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi
  local pids
  pids="$(lsof -ti "tcp:${port}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "    Stopping listener on :$port ($pids)"
    kill $pids 2>/dev/null || true
    sleep 1
  fi
}

export MINIBOT_SERVER_DATA_DIR="$DATA_DIR"
export MINIBOT_SERVER_PORT="$GATEWAY_PORT"
export MINIBOT_SERVER_AUTH_SECRET="$AUTH_SECRET"
export MINIBOT_SERVER_REQUIRE_AUTH="${MINIBOT_SERVER_REQUIRE_AUTH:-true}"
export MINIBOT_API_URL="$API_URL"
export PLAYWRIGHT_BASE_URL="$BASE_URL"
export PLAYWRIGHT_WEB_PORT="$WEB_PORT"
export E2E_AUTH_SECRET="${E2E_AUTH_SECRET:-$AUTH_SECRET}"

BACKEND_PID=""
FRONTEND_PID=""
STARTED_BACKEND=false
STARTED_FRONTEND=false
CREATED_DATA_DIR=true
EXIT_CODE=0

cleanup() {
  if [[ -n "$BACKEND_PID" ]] && [[ "$STARTED_BACKEND" == true ]]; then
    kill "$BACKEND_PID" 2>/dev/null && wait "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "$FRONTEND_PID" ]] && [[ "$STARTED_FRONTEND" == true ]]; then
    kill "$FRONTEND_PID" 2>/dev/null && wait "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [[ "$CREATED_DATA_DIR" == true ]] && [[ -d "$DATA_DIR" ]]; then
    rm -rf "$DATA_DIR"
  fi
  exit "$EXIT_CODE"
}
trap cleanup EXIT

wait_for_url() {
  local url=$1
  local name=$2
  local max_wait=${3:-90}
  local elapsed=0
  echo "    Waiting for $name ($url)..."
  while ! curl -sf "$url" >/dev/null 2>&1; do
    sleep 1
    elapsed=$((elapsed + 1))
    if [[ "$elapsed" -ge "$max_wait" ]]; then
      echo "    ERROR: $name did not become ready within ${max_wait}s"
      EXIT_CODE=1
      return 1
    fi
  done
  echo "    $name ready (${elapsed}s)"
}

echo "==> E2E env"
echo "    DATA_DIR=$DATA_DIR"
echo "    GATEWAY=$API_URL"
echo "    WEBUI=$BASE_URL"

stop_listener_on_port "$GATEWAY_PORT"
stop_listener_on_port "$WEB_PORT"
rm -rf "$DATA_DIR"
mkdir -p "$DATA_DIR"

echo "==> Starting gateway on :$GATEWAY_PORT"
(cd "$ROOT/minibot" && uv run minibot) > /tmp/minibot-e2e-backend.log 2>&1 &
BACKEND_PID=$!
STARTED_BACKEND=true
wait_for_url "$API_URL/health" "Gateway"

echo "==> Starting webui dev server on :$WEB_PORT"
(
  cd "$ROOT/webui"
  MINIBOT_API_URL="$API_URL" \
  VITE_MINIBOT_WS_PORT="$GATEWAY_PORT" \
  npm run dev -- --port "$WEB_PORT" --strictPort
) > /tmp/minibot-e2e-frontend.log 2>&1 &
FRONTEND_PID=$!
STARTED_FRONTEND=true
wait_for_url "$BASE_URL" "WebUI"

echo "==> Playwright E2E"
cd "$ROOT"
if [[ ! -d node_modules/@playwright/test ]]; then
  echo "    Installing npm dependencies (first run)..."
  npm install
fi
npx playwright install chromium >/dev/null

if npx playwright test "$@"; then
  echo "✓ E2E passed"
else
  EXIT_CODE=1
  echo "✗ E2E failed — logs: /tmp/minibot-e2e-backend.log /tmp/minibot-e2e-frontend.log"
fi
