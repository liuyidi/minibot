#!/usr/bin/env bash
# Atomically promote a prebuilt WebUI dist into deploy/webui-dist.
# Used by Publish WebUI (ECS) after CI uploads dist-staging via scp.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIVE="$ROOT/deploy/webui-dist"
STAGING="${1:-$ROOT/deploy/webui-dist-staging}"

if [[ ! -f "${STAGING}/index.html" ]]; then
  echo "promote-webui: staging is missing index.html (${STAGING})" >&2
  exit 1
fi

rm -rf "${LIVE}"
mv "${STAGING}" "${LIVE}"
echo "promote-webui: wrote ${LIVE}"
