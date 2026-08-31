#!/usr/bin/env bash
# Ensure deploy/.env exists on the ECS host before docker compose.
# Prefer restoring from the running minibot container; fall back to .env.example.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${DIR}/.env"
EXAMPLE="${DIR}/.env.example"

if [[ -f "${ENV_FILE}" ]]; then
  echo "deploy/.env already present"
  exit 0
fi

echo "deploy/.env missing — attempting restore"

tmp="$(mktemp)"
trap 'rm -f "${tmp}"' EXIT

if docker inspect minibot >/dev/null 2>&1; then
  # Keep only compose/runtime knobs; drop PATH/HOSTNAME noise from the container.
  docker inspect minibot --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -E '^(MINIBOT_|LANGFUSE_|OPENAI_|VITE_|E2B_|MINIBOT_DATA_VOLUME=)' \
    > "${tmp}" || true
fi

if [[ ! -s "${tmp}" && -f "${EXAMPLE}" ]]; then
  echo "WARN: container env unavailable; seeding from .env.example (fill secrets afterwards)" >&2
  cp "${EXAMPLE}" "${tmp}"
fi

if [[ ! -s "${tmp}" ]]; then
  echo "ERROR: cannot restore deploy/.env (no container env and no .env.example)" >&2
  exit 1
fi

# Build-time defaults if absent from container dump.
grep -q '^LANGFUSE_SDK_DIR=' "${tmp}" || echo 'LANGFUSE_SDK_DIR=/opt/demo/mini-langfuse/sdk-python' >> "${tmp}"
grep -q '^MINIBOT_DATA_VOLUME=' "${tmp}" || echo 'MINIBOT_DATA_VOLUME=agent-demo_demo_minibot' >> "${tmp}"

install -m 600 "${tmp}" "${ENV_FILE}"
echo "Restored deploy/.env ($(wc -l < "${ENV_FILE}" | tr -d ' ') lines)"
