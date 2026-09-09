#!/usr/bin/env bash
# Publish KaTeX dist to a version-pinned OSS vendor path (not app-versioned).
#
#   ${OSS_PREFIX}/webui/vendor/katex/<katexVersion>/
#     katex.min.css  katex.mjs  fonts/…
#
# Skips upload when the remote katex.mjs already exists (unless FORCE=1).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
katex_root="${ROOT}/webui/node_modules/katex/dist"
dry_run=false
force="${FORCE:-0}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --katex-dist) katex_root="${2:?}"; shift 2 ;;
    --dry-run) dry_run=true; shift ;;
    --force) force=1; shift ;;
    -h|--help)
      echo "Usage: publish-oss-katex-vendor.sh [--katex-dist path] [--force] [--dry-run]"
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

if [[ ! -f "${katex_root}/katex.mjs" || ! -f "${katex_root}/katex.min.css" || ! -d "${katex_root}/fonts" ]]; then
  echo "Missing katex dist at ${katex_root} (run npm ci in webui/)" >&2
  exit 1
fi

katex_ver="$(node -p "require('${ROOT}/webui/node_modules/katex/package.json').version")"
prefix="${OSS_PREFIX:-minibot}"
cdn_path="${prefix}/webui/vendor/katex/${katex_ver}"
public_base="${OSS_PUBLIC_BASE_URL%/}"
object_acl="${OSS_OBJECT_ACL:-public-read}"

if [[ "$dry_run" != true ]] && ! command -v ossutil >/dev/null 2>&1; then
  echo "ossutil is required" >&2
  exit 1
fi

auth=()
if [[ -n "${OSS_ACCESS_KEY_ID:-}" && -n "${OSS_ACCESS_KEY_SECRET:-}" ]]; then
  auth=(--access-key-id "$OSS_ACCESS_KEY_ID" --access-key-secret "$OSS_ACCESS_KEY_SECRET")
fi

ossutil_major="1"
if command -v ossutil >/dev/null 2>&1; then
  if ver="$(ossutil version 2>/dev/null | head -n1)"; then
    ossutil_major="${ver%%.*}"
  fi
fi

probe_url="${public_base}/${cdn_path}/katex.mjs"
if [[ "$force" != "1" && "$dry_run" != true ]]; then
  if curl -fsS -o /dev/null -I "$probe_url"; then
    echo "KaTeX vendor already present: ${probe_url} (skip; FORCE=1 to overwrite)"
    echo "VITE_KATEX_VENDOR_BASE=${public_base}/${cdn_path}"
    exit 0
  fi
fi

content_type_for() {
  case "${1##*.}" in
    js|mjs) echo "application/javascript" ;;
    css) echo "text/css" ;;
    woff2) echo "font/woff2" ;;
    woff) echo "font/woff" ;;
    ttf) echo "font/ttf" ;;
    *) echo "application/octet-stream" ;;
  esac
}

should_gzip() {
  case "${1##*.}" in
    js|mjs|css) return 0 ;;
    *) return 1 ;;
  esac
}

upload_file() {
  local source="$1" object="$2" ctype="$3" cache="$4" enc="${5:-}"
  local dest="oss://${OSS_BUCKET}/${object}"
  local meta="Content-Type:${ctype}#Cache-Control:${cache}"
  [[ -n "$enc" ]] && meta="${meta}#Content-Encoding:${enc}"
  local cmd=(
    ossutil cp "$source" "$dest" --force
    --region "$OSS_REGION" --endpoint "$OSS_ENDPOINT" --acl "$object_acl"
    "${auth[@]}"
  )
  if [[ "$ossutil_major" == "2" ]]; then
    cmd+=(--content-type "$ctype" --cache-control "$cache")
    [[ -n "$enc" ]] && cmd+=(--content-encoding "$enc")
  else
    cmd+=(--meta "$meta")
  fi
  if [[ "$dry_run" == true ]]; then
    printf 'DRY RUN:'; printf ' %q' "${cmd[@]}"; printf '\n'
  else
    "${cmd[@]}"
  fi
}

staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
cache="public,max-age=31536000,immutable"

echo "Publishing KaTeX ${katex_ver} → ${cdn_path}/"
while IFS= read -r -d '' file; do
  rel="${file#"${katex_root}/"}"
  # Only ship runtime pieces (skip maps / source js if present as extras).
  case "$rel" in
    katex.min.css|katex.mjs|fonts/*) ;;
    *) continue ;;
  esac
  object="${cdn_path}/${rel}"
  ctype="$(content_type_for "$file")"
  enc=""
  local_upload="$file"
  if should_gzip "$file"; then
    local_upload="${staging}/${rel}.gz"
    mkdir -p "$(dirname "$local_upload")"
    gzip -9c "$file" >"$local_upload"
    enc="gzip"
  fi
  printf 'upload %s\n' "$object"
  upload_file "$local_upload" "$object" "$ctype" "$cache" "$enc"
done < <(find "$katex_root" -type f -print0)

# Spot-check
if [[ "$dry_run" != true ]]; then
  hdrs="$(curl -fsS -D - -o /dev/null -H 'Accept-Encoding: gzip' "${public_base}/${cdn_path}/katex.min.css")"
  printf '%s\n' "$hdrs" | tr -d '\r' | grep -qiE '^content-encoding:[[:space:]]*gzip' \
    || echo "WARN: katex.min.css missing Content-Encoding:gzip" >&2
  curl -fsS -o /dev/null "${public_base}/${cdn_path}/katex.mjs"
  curl -fsS -o /dev/null "${public_base}/${cdn_path}/fonts/KaTeX_Main-Regular.woff2"
fi

echo "VITE_KATEX_VENDOR_BASE=${public_base}/${cdn_path}"
echo "Published KaTeX vendor under ${public_base}/${cdn_path}/"
