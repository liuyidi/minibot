#!/usr/bin/env bash
# Promote a prebuilt WebUI dist into deploy/webui-dist.
# Must NOT replace the deploy/webui-dist directory inode — docker compose
# bind-mounts that path; rm+mv would leave the container on a deleted mount.
# Used by Publish WebUI (ECS) after CI uploads dist-staging via scp.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIVE="$ROOT/deploy/webui-dist"
STAGING="${1:-$ROOT/deploy/webui-dist-staging}"

if [[ ! -f "${STAGING}/index.html" ]]; then
  echo "promote-webui: staging is missing index.html (${STAGING})" >&2
  exit 1
fi

mkdir -p "${LIVE}"
# Replace contents only (keep mountpoint directory).
find "${LIVE}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a "${STAGING}"/. "${LIVE}/"
rm -rf "${STAGING}"
echo "promote-webui: wrote ${LIVE}"
