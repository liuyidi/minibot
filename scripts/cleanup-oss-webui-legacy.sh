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

object_count() {
  local out n
  out="$(ossutil ls "$1" --region "$OSS_REGION" --endpoint "$OSS_ENDPOINT" "${auth[@]}" 2>/dev/null || true)"
  if printf '%s\n' "$out" | grep -qE 'Object Number is:[[:space:]]*0[[:space:]]*$'; then
    echo 0
    return
  fi
  n="$(printf '%s\n' "$out" | sed -n 's/.*Object Number is:[[:space:]]*\([0-9][0-9]*\).*/\1/p' | tail -1)"
  if [[ -n "$n" ]]; then
    echo "$n"
    return
  fi
  printf '%s\n' "$out" | grep -cE '^oss://' || echo 0
}

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
    return 0
  fi
  # ossutil may 403 on a trailing directory marker after deleting all files —
  # treat empty prefix as success.
  set +e
  ossutil rm -r -f "oss://${OSS_BUCKET}/${object}" \
    --region "$OSS_REGION" \
    --endpoint "$OSS_ENDPOINT" \
    "${auth[@]}"
  local rc=$?
  set -e
  local left
  left="$(object_count "oss://${OSS_BUCKET}/${object}")"
  echo "after rm: object_count=${left} (ossutil_rc=${rc})"
  if [[ "$left" == "0" ]]; then
    return 0
  fi
  return "$rc"
}

remove_prefix "${prefix}/assets/"
remove_prefix "${prefix}/brand/"

echo "Remaining under ${prefix}/:"
ossutil ls "oss://${OSS_BUCKET}/${prefix}/" -d \
  --region "$OSS_REGION" \
  --endpoint "$OSS_ENDPOINT" \
  "${auth[@]}" || true

assets_left="$(object_count "oss://${OSS_BUCKET}/${prefix}/assets/")"
brand_left="$(object_count "oss://${OSS_BUCKET}/${prefix}/brand/")"
echo "legacy assets left=${assets_left} brand left=${brand_left}"
if [[ "$assets_left" != "0" || "$brand_left" != "0" ]]; then
  echo "cleanup-oss-webui-legacy: FAIL — legacy objects remain (RAM may lack oss:DeleteObject)" >&2
  exit 1
fi

echo "cleanup-oss-webui-legacy: done"
