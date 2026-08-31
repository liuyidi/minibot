#!/usr/bin/env bash
# Local quality gates mirroring .github/workflows/quality-gates.yml
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN_STATIC=1
RUN_PYTEST=1
RUN_WEBUI=1
RUN_CONTRACT=1
RUN_PERF=1
RUN_MIGRATION=1
RUN_E2E=0

usage() {
  cat <<'EOF'
Usage: scripts/quality-gates.sh [options]

Options:
  --static-only      Lint / typecheck only
  --pytest-only      minibot full pytest (excludes perf/)
  --webui-only       WebUI Vitest only
  --contract-only    API contract tests only
  --perf-only        Performance smoke tests only
  --migration-only   Filesystem migration tests only
  --e2e-only         Playwright E2E only
  --with-e2e         Include Playwright E2E in the full run
  --skip-perf        Skip perf smoke tests
  --skip-e2e         Skip Playwright E2E (default)
  -h, --help         Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --static-only)
      RUN_STATIC=1; RUN_PYTEST=0; RUN_WEBUI=0; RUN_CONTRACT=0; RUN_PERF=0; RUN_MIGRATION=0; RUN_E2E=0
      ;;
    --pytest-only)
      RUN_STATIC=0; RUN_PYTEST=1; RUN_WEBUI=0; RUN_CONTRACT=0; RUN_PERF=0; RUN_MIGRATION=0; RUN_E2E=0
      ;;
    --webui-only)
      RUN_STATIC=0; RUN_PYTEST=0; RUN_WEBUI=1; RUN_CONTRACT=0; RUN_PERF=0; RUN_MIGRATION=0; RUN_E2E=0
      ;;
    --contract-only)
      RUN_STATIC=0; RUN_PYTEST=0; RUN_WEBUI=0; RUN_CONTRACT=1; RUN_PERF=0; RUN_MIGRATION=0; RUN_E2E=0
      ;;
    --perf-only)
      RUN_STATIC=0; RUN_PYTEST=0; RUN_WEBUI=0; RUN_CONTRACT=0; RUN_PERF=1; RUN_MIGRATION=0; RUN_E2E=0
      ;;
    --migration-only)
      RUN_STATIC=0; RUN_PYTEST=0; RUN_WEBUI=0; RUN_CONTRACT=0; RUN_PERF=0; RUN_MIGRATION=1; RUN_E2E=0
      ;;
    --e2e-only)
      RUN_STATIC=0; RUN_PYTEST=0; RUN_WEBUI=0; RUN_CONTRACT=0; RUN_PERF=0; RUN_MIGRATION=0; RUN_E2E=1
      ;;
    --with-e2e)
      RUN_E2E=1
      ;;
    --skip-perf)
      RUN_PERF=0
      ;;
    --skip-e2e)
      RUN_E2E=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

if [[ "$RUN_STATIC" == 1 ]]; then
  echo "== minibot Python static analysis =="
  (
    cd "$ROOT/minibot"
    uv sync --all-extras --group dev
    uv run ruff check src/minibot
  )

  echo "== webui lint + typecheck =="
  (
    cd "$ROOT/webui"
    npm ci
    npm run lint
    npm run build
  )

  echo "== npm packages (client + cli) =="
  (
    cd "$ROOT"
    npm ci
    npm run test:cli
    npm --workspace packages/minibot-client run test
  )
fi

if [[ "$RUN_PYTEST" == 1 ]]; then
  echo "== minibot pytest (full, excluding perf/) =="
  (
    cd "$ROOT/minibot"
    uv sync --all-extras --group dev
    uv run pytest tests/ -q --ignore=tests/perf
  )
fi

if [[ "$RUN_WEBUI" == 1 ]]; then
  echo "== webui vitest =="
  (
    cd "$ROOT/webui"
    npm ci
    npm test
  )
fi

if [[ "$RUN_CONTRACT" == 1 ]]; then
  echo "== API contract / backward compatibility =="
  (
    cd "$ROOT/minibot"
    uv run pytest tests/test_api_contract.py -q
  )
fi

if [[ "$RUN_PERF" == 1 ]]; then
  echo "== performance smoke =="
  (
    cd "$ROOT/minibot"
    uv run pytest tests/perf -m perf -q
  )
fi

if [[ "$RUN_MIGRATION" == 1 ]]; then
  echo "== filesystem migrations =="
  (
    cd "$ROOT/minibot"
    uv run pytest tests/test_legacy_migration.py -q
  )
fi

if [[ "$RUN_E2E" == 1 ]]; then
  echo "== playwright e2e =="
  bash "$ROOT/scripts/e2e.sh"
fi

echo "All selected quality gates passed."
