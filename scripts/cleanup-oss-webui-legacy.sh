#!/usr/bin/env bash
# Remove legacy unversioned WebUI CDN objects under minibot/webui/{assets,brand}/.
# Keep versioned trees: minibot/webui/<semver>/
set -euo pipefail

for name in OSS_BUCKET OSS_REGION OSS_ENDPOINT; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 2
  fi
done

if ! command -v ossutil >/dev/null 2>&1; then
  echo "ossutil is required" >&2
  exit 1
fi

auth=()
if [[ -n "${OSS_ACCESS_KEY_ID:-}" && -n "${OSS_ACCESS_KEY_SECRET:-}" ]]; then
  auth=(--access-key-id "$OSS_ACCESS_KEY_ID" --access-key-secret "$OSS_ACCESS_KEY_SECRET")
fi

prefix="${OSS_PREFIX:-minibot}/webui"
dry_run="${DRY_RUN:-0}"

echo "Listing ${prefix}/ …"
ossutil ls "oss://${OSS_BUCKET}/${prefix}/" -d \
  --region "$OSS_REGION" \
  --endpoint "$OSS_ENDPOINT" \
  "${auth[@]}" || true

remove_prefix() {
  local object="$1"
  echo "Removing oss://${OSS_BUCKET}/${object}"
  if [[ "$dry_run" == "1" ]]; then
    echo "DRY_RUN: skip rm"
    return
  fi
  ossutil rm -r -f "oss://${OSS_BUCKET}/${object}" \
    --region "$OSS_REGION" \
    --endpoint "$OSS_ENDPOINT" \
    "${auth[@]}"
}

# Only the unversioned layout from the first CDN publish.
remove_prefix "${prefix}/assets/"
remove_prefix "${prefix}/brand/"

echo "Remaining under ${prefix}/:"
ossutil ls "oss://${OSS_BUCKET}/${prefix}/" -d \
  --region "$OSS_REGION" \
  --endpoint "$OSS_ENDPOINT" \
  "${auth[@]}" || true

echo "cleanup-oss-webui-legacy: done"
