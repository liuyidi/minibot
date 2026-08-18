#!/usr/bin/env bash
# Build https://liuyidi.me VitePress output into site/.vitepress/dist.
# Uses a one-shot Node container so the Aliyun host does not need Node.
# On success, atomically replaces dist so a failed build keeps the previous site.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGING_REL=".vitepress/dist-staging"
LIVE="$ROOT/site/.vitepress/dist"
STAGING="$ROOT/site/${STAGING_REL}"

docker run --rm \
  -v "${ROOT}:/repo" \
  -w /repo/site \
  node:22-alpine \
  sh -c "npm ci && npm run docs:build -- --outDir ${STAGING_REL} && node scripts/check-dist.mjs ${STAGING_REL}"

if [[ ! -f "${STAGING}/index.html" ]]; then
  echo "build-site: staging is missing index.html" >&2
  exit 1
fi

rm -rf "${LIVE}"
mv "${STAGING}" "${LIVE}"
echo "build-site: wrote ${LIVE}"
