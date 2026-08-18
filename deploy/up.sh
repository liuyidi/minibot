#!/usr/bin/env bash
# Start minibot on the Aliyun ECS host. Run from deploy/ or any cwd.
# Do not bash-source .env (values like SCOPE="openid profile email" break `source`).
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${DIR}/.env"
COMPOSE=(docker compose -f "${DIR}/docker-compose.yml" --env-file "${ENV_FILE}")

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing ${ENV_FILE}"
  echo "  cp ${DIR}/.env.example ${DIR}/.env"
  exit 1
fi

env_get() {
  local key="$1" def="${2:-}"
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 || true)"
  if [[ -z "$line" ]]; then
    printf '%s' "$def"
  else
    printf '%s' "${line#*=}"
  fi
}

LANGFUSE_SDK_DIR="$(env_get LANGFUSE_SDK_DIR /opt/demo/mini-langfuse/sdk-python)"
if [[ ! -d "$LANGFUSE_SDK_DIR" ]]; then
  echo "ERROR: LANGFUSE_SDK_DIR not found: $LANGFUSE_SDK_DIR" >&2
  echo "  Clone mini-langfuse next to minibot (sdk-python is build-time only)." >&2
  exit 1
fi
export LANGFUSE_SDK_DIR

echo "LANGFUSE_SDK_DIR=$LANGFUSE_SDK_DIR"
"${COMPOSE[@]}" up -d --build "$@"

echo
echo "Health:"
curl -fsS http://127.0.0.1:8766/health && echo "  minibot ok" || echo "  minibot FAIL"
curl -fsS -o /dev/null -w "  webui / %{http_code}\n" http://127.0.0.1:8766/ || true
curl -fsS -o /dev/null -w "  landing %{http_code}\n" https://liuyidi.me/ || true
curl -fsS -o /dev/null -w "  bot %{http_code}\n" https://bot.liuyidi.me/ || true
curl -fsS https://kb.liuyidi.me/health >/dev/null \
  && echo "  minikb (public) ok" \
  || echo "  minikb (public) FAIL"
curl -fsS -o /dev/null -w "  mlf %{http_code}\n" https://mlf.liuyidi.me/ || true
