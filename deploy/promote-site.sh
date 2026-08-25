#!/usr/bin/env bash
# Atomically promote a prebuilt VitePress dist into site/.vitepress/dist.
# Expects STAGING to already contain a finished build (index.html present).
# Used by Publish Site (ECS) after CI uploads dist-staging via scp.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIVE="$ROOT/site/.vitepress/dist"
STAGING="${1:-$ROOT/site/.vitepress/dist-staging}"

if [[ ! -f "${STAGING}/index.html" ]]; then
  echo "promote-site: staging is missing index.html (${STAGING})" >&2
  exit 1
fi

rm -rf "${LIVE}"
mv "${STAGING}" "${LIVE}"
echo "promote-site: wrote ${LIVE}"
