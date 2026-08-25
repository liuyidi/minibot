#!/usr/bin/env bash
# Build https://liuyidi.me VitePress output into site/.vitepress/dist.
# Uses a one-shot Node container so the Aliyun host does not need Node.
# Prefer Publish Site (ECS) which builds on GitHub Actions and promotes
# dist via promote-site.sh — this script remains for manual / fallback use.
# On success, atomically replaces dist so a failed build keeps the previous site.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGING_REL=".vitepress/dist-staging"
LIVE="$ROOT/site/.vitepress/dist"
STAGING="$ROOT/site/${STAGING_REL}"
CACHE_DIR="${ROOT}/site/.cache/npm"
mkdir -p "${CACHE_DIR}"

# Aliyun ECS often cannot reach registry.npmjs.org reliably; prefer npmmirror.
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"

docker run --rm \
  -e "npm_config_registry=${NPM_REGISTRY}" \
  -v "${ROOT}:/repo" \
  -v "${CACHE_DIR}:/root/.npm" \
  -w /repo/site \
  node:22-alpine \
  sh -c "npm ci && npm run docs:build -- --outDir ${STAGING_REL} && node scripts/check-dist.mjs ${STAGING_REL}"

bash "${ROOT}/deploy/promote-site.sh" "${STAGING}"
