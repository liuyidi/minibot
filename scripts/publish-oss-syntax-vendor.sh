#!/usr/bin/env bash
# Build + publish syntax-highlight vendor to a version-pinned OSS path.
#
#   ${OSS_PREFIX}/webui/vendor/syntax-highlight/<react-syntax-highlighterVersion>/
#     syntax-highlight.js  chunks/…
#
# Skips upload when the remote entry already exists (unless FORCE=1).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEBUI="${ROOT}/webui"
vendor_out="${WEBUI}/vendor-dist/syntax-highlight"
dry_run=false
force="${FORCE:-0}"
jobs="${UPLOAD_JOBS:-8}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --vendor-out) vendor_out="${2:?}"; shift 2 ;;
    --dry-run) dry_run=true; shift ;;
    --force) force=1; shift ;;
    -h|--help)
      echo "Usage: publish-oss-syntax-vendor.sh [--force] [--dry-run] [--vendor-out path]"
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

for name in OSS_BUCKET OSS_REGION OSS_ENDPOINT OSS_PUBLIC_BASE_URL; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 2
  fi
done

rsh_pkg="${WEBUI}/node_modules/react-syntax-highlighter/package.json"
if [[ ! -f "$rsh_pkg" ]]; then
  echo "Missing react-syntax-highlighter (run npm ci in webui/)" >&2
  exit 1
fi

rsh_ver="$(node -p "require('${rsh_pkg}').version")"
prefix="${OSS_PREFIX:-minibot}"
cdn_path="${prefix}/webui/vendor/syntax-highlight/${rsh_ver}"
public_base="${OSS_PUBLIC_BASE_URL%/}"
object_acl="${OSS_OBJECT_ACL:-public-read}"

if [[ "$dry_run" != true ]] && ! command -v ossutil >/dev/null 2>&1; then
  echo "ossutil is required" >&2
  exit 1
fi

ossutil_major="1"
if command -v ossutil >/dev/null 2>&1; then
  if ver="$(ossutil version 2>/dev/null | head -n1)"; then
    ossutil_major="${ver%%.*}"
  fi
fi

probe_url="${public_base}/${cdn_path}/syntax-highlight.js"
if [[ "$force" != "1" && "$dry_run" != true ]]; then
  if curl -fsS -o /dev/null -I "$probe_url"; then
    echo "Syntax vendor already present: ${probe_url} (skip; FORCE=1 to overwrite)"
    echo "VITE_SYNTAX_VENDOR_BASE=${public_base}/${cdn_path}"
    exit 0
  fi
fi

echo "Building syntax-highlight vendor (react-syntax-highlighter ${rsh_ver})…"
if [[ "$dry_run" == true ]]; then
  echo "DRY RUN: (cd webui && npx vite build --config vite.syntax-vendor.config.ts)"
else
  (cd "$WEBUI" && npx vite build --config vite.syntax-vendor.config.ts)
fi

if [[ "$dry_run" != true && ! -f "${vendor_out}/syntax-highlight.js" ]]; then
  echo "Missing ${vendor_out}/syntax-highlight.js after vendor build" >&2
  exit 1
fi

staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
cache="public,max-age=31536000,immutable"
list="${staging}/upload.list"

upload_one() {
  local source="$1" object="$2"
  local dest="oss://${OSS_BUCKET}/${object}"
  local ctype="application/javascript"
  local meta="Content-Type:${ctype}#Cache-Control:${cache}#Content-Encoding:gzip"
  local cmd=(
    ossutil cp "$source" "$dest" --force
    --region "$OSS_REGION" --endpoint "$OSS_ENDPOINT" --acl "$object_acl"
  )
  if [[ -n "${OSS_ACCESS_KEY_ID:-}" && -n "${OSS_ACCESS_KEY_SECRET:-}" ]]; then
    cmd+=(--access-key-id "$OSS_ACCESS_KEY_ID" --access-key-secret "$OSS_ACCESS_KEY_SECRET")
  fi
  if [[ "$ossutil_major" == "2" ]]; then
    cmd+=(--content-type "$ctype" --cache-control "$cache" --content-encoding gzip)
  else
    cmd+=(--meta "$meta")
  fi
  printf 'upload %s\n' "$object"
  "${cmd[@]}"
}

echo "Publishing syntax-highlight ${rsh_ver} → ${cdn_path}/"
: >"$list"
if [[ "$dry_run" == true ]]; then
  find "$vendor_out" -type f | while read -r file; do
    rel="${file#"${vendor_out}/"}"
    echo "DRY RUN: upload ${cdn_path}/${rel}"
  done
else
  while IFS= read -r -d '' file; do
    rel="${file#"${vendor_out}/"}"
    object="${cdn_path}/${rel}"
    staged="${staging}/files/${rel}"
    mkdir -p "$(dirname "$staged")"
    gzip -9c "$file" >"$staged"
    printf '%s\t%s\n' "$staged" "$object" >>"$list"
  done < <(find "$vendor_out" -type f -print0)

  export -f upload_one
  export OSS_BUCKET OSS_REGION OSS_ENDPOINT object_acl ossutil_major cache
  export OSS_ACCESS_KEY_ID="${OSS_ACCESS_KEY_ID:-}"
  export OSS_ACCESS_KEY_SECRET="${OSS_ACCESS_KEY_SECRET:-}"

  # shellcheck disable=SC2016
  <"$list" xargs -P "$jobs" -n 1 -I{} bash -c '
    IFS=$'\''\t'\'' read -r source object <<<"$1"
    upload_one "$source" "$object"
  ' _ {}

  curl -fsS -o /dev/null -H 'Accept-Encoding: gzip' "${public_base}/${cdn_path}/syntax-highlight.js"
fi

echo "VITE_SYNTAX_VENDOR_BASE=${public_base}/${cdn_path}"
echo "Published syntax vendor under ${public_base}/${cdn_path}/"
