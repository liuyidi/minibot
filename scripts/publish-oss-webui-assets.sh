#!/usr/bin/env bash
# Upload WebUI build assets to Aliyun OSS (CDN: downloads.liuyidi.me).
#
# Compressible text assets are uploaded pre-gzipped with Content-Encoding: gzip
# (OSS/CDN does not gzip application/javascript by default — without this the
# main bundle stays ~1.5MB on the wire).
#
# Usage:
#   source scripts/oss-release.env
#   export OSS_ACCESS_KEY_ID=... OSS_ACCESS_KEY_SECRET=...
#   scripts/publish-oss-webui-assets.sh [--dist webui/dist] [--cdn-path minibot/webui/1.0.26] [--dry-run]
#
# Object layout (matches Vite base https://downloads.liuyidi.me/<cdn-path>/):
#   <cdn-path>/assets/*   hashed JS/CSS/fonts
#   <cdn-path>/brand/*    public brand SVGs
#
# index.html stays on bot.liuyidi.me (Publish WebUI → ECS).
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  source scripts/oss-release.env
  export OSS_ACCESS_KEY_ID=... OSS_ACCESS_KEY_SECRET=...
  scripts/publish-oss-webui-assets.sh [--dist webui/dist] [--cdn-path minibot/webui/1.0.26] [--dry-run]

Required environment: OSS_BUCKET, OSS_REGION, OSS_ENDPOINT, OSS_PUBLIC_BASE_URL.
Optional: OSS_OBJECT_ACL=public-read, WEBUI_CDN_SET_CORS=1, WEBUI_CDN_PATH
EOF
}

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
dist="${ROOT}/webui/dist"
dry_run=false
cdn_path="${WEBUI_CDN_PATH:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dist) dist="${2:?missing value for --dist}"; shift 2 ;;
    --cdn-path) cdn_path="${2:?missing value for --cdn-path}"; shift 2 ;;
    --dry-run) dry_run=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

for name in OSS_BUCKET OSS_REGION OSS_ENDPOINT OSS_PUBLIC_BASE_URL; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 2
  fi
done

if [[ ! -d "${dist}/assets" ]]; then
  echo "Missing ${dist}/assets — build the WebUI first" >&2
  exit 1
fi

if [[ -z "$cdn_path" ]]; then
  version="$(node -p "require('${ROOT}/webui/package.json').version" 2>/dev/null || true)"
  if [[ -z "$version" ]]; then
    echo "Set --cdn-path or WEBUI_CDN_PATH (could not read webui/package.json version)" >&2
    exit 2
  fi
  cdn_path="${OSS_PREFIX:-minibot}/webui/${version}"
fi
cdn_path="${cdn_path#/}"
cdn_path="${cdn_path%/}"

if [[ "$dry_run" != true ]] && ! command -v ossutil >/dev/null 2>&1; then
  echo "ossutil is required: https://help.aliyun.com/zh/oss/developer-reference/ossutil-overview/" >&2
  exit 1
fi

object_acl="${OSS_OBJECT_ACL:-public-read}"
public_base="${OSS_PUBLIC_BASE_URL%/}"
immutable_cache="public,max-age=31536000,immutable"
brand_cache="public,max-age=86400"

ossutil_major="1"
if command -v ossutil >/dev/null 2>&1; then
  if ver="$(ossutil version 2>/dev/null | head -n1)"; then
    ossutil_major="${ver%%.*}"
  fi
fi

ossutil_auth=()
if [[ -n "${OSS_ACCESS_KEY_ID:-}" && -n "${OSS_ACCESS_KEY_SECRET:-}" ]]; then
  ossutil_auth+=(--access-key-id "$OSS_ACCESS_KEY_ID" --access-key-secret "$OSS_ACCESS_KEY_SECRET")
fi

content_type_for() {
  case "${1##*.}" in
    js|mjs) echo "application/javascript" ;;
    css) echo "text/css" ;;
    svg) echo "image/svg+xml" ;;
    json) echo "application/json" ;;
    html) echo "text/html; charset=utf-8" ;;
    map) echo "application/json" ;;
    woff2) echo "font/woff2" ;;
    woff) echo "font/woff" ;;
    ttf) echo "font/ttf" ;;
    otf) echo "font/otf" ;;
    wasm) echo "application/wasm" ;;
    txt) echo "text/plain; charset=utf-8" ;;
    *) echo "application/octet-stream" ;;
  esac
}

should_gzip() {
  case "${1##*.}" in
    js|mjs|css|svg|json|html|map|txt|xml|wasm) return 0 ;;
    *) return 1 ;;
  esac
}

ossutil_cp_file() {
  local source="$1" object="$2" content_type="$3" cache_control="$4" content_encoding="${5:-}"
  local dest="oss://${OSS_BUCKET}/${object}"
  local meta="Content-Type:${content_type}#Cache-Control:${cache_control}"
  if [[ -n "$content_encoding" ]]; then
    meta="${meta}#Content-Encoding:${content_encoding}"
  fi
  local command=(
    ossutil cp "$source" "$dest"
    --force
    --region "$OSS_REGION"
    --endpoint "$OSS_ENDPOINT"
    --acl "$object_acl"
    "${ossutil_auth[@]}"
  )
  if [[ "$ossutil_major" == "2" ]]; then
    command+=(--content-type "$content_type" --cache-control "$cache_control")
    if [[ -n "$content_encoding" ]]; then
      command+=(--content-encoding "$content_encoding")
    fi
  else
    command+=(--meta "$meta")
  fi
  if [[ "$dry_run" == true ]]; then
    printf 'DRY RUN:'; printf ' %q' "${command[@]}"; printf '\n'
  else
    "${command[@]}"
  fi
}

upload_tree() {
  local src_root="$1" object_root="$2" cache_control="$3"
  local staging
  staging="$(mktemp -d)"

  local file rel object ctype enc local_upload
  while IFS= read -r -d '' file; do
    rel="${file#"${src_root}/"}"
    object="${object_root}/${rel}"
    ctype="$(content_type_for "$file")"
    enc=""
    local_upload="$file"
    if should_gzip "$file"; then
      local_upload="${staging}/${rel}.gz"
      mkdir -p "$(dirname "$local_upload")"
      gzip -9c "$file" >"$local_upload"
      enc="gzip"
    fi
    printf 'upload %s (%s%s)\n' "$object" "$ctype" "${enc:+, ${enc}}"
    ossutil_cp_file "$local_upload" "$object" "$ctype" "$cache_control" "$enc"
  done < <(find "$src_root" -type f -print0)

  rm -rf "$staging"
}

# Optional: ensure browser can load module scripts / fonts cross-origin from CDN.
if [[ "${WEBUI_CDN_SET_CORS:-1}" == "1" && "$dry_run" != true ]]; then
  cors_xml="$(mktemp)"
  cat >"$cors_xml" <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>*</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <ExposeHeader>Content-Length</ExposeHeader>
    <ExposeHeader>Content-Encoding</ExposeHeader>
    <MaxAgeSeconds>86400</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>
XML
  echo "Ensuring bucket CORS allows cross-origin GET for WebUI modules"
  ossutil cors --method put "oss://${OSS_BUCKET}" "$cors_xml" \
    --region "$OSS_REGION" \
    --endpoint "$OSS_ENDPOINT" \
    "${ossutil_auth[@]}" || {
      echo "WARN: ossutil cors put failed — set CORS in the Aliyun console if module scripts fail" >&2
    }
  rm -f "$cors_xml"
fi

echo "CDN path: ${cdn_path}"
upload_tree "${dist}/assets" "${cdn_path}/assets" "$immutable_cache"

if [[ -d "${dist}/brand" ]]; then
  upload_tree "${dist}/brand" "${cdn_path}/brand" "$brand_cache"
fi

sample_js="$(find "${dist}/assets" -maxdepth 1 -type f -name 'index-*.js' | head -n1 || true)"
if [[ -n "$sample_js" ]]; then
  name="$(basename "$sample_js")"
  url="${public_base}/${cdn_path}/assets/${name}"
  echo "Public CDN URL: ${url}"
  if [[ "$dry_run" != true ]]; then
    ok=0
    hdrs=""
    for _ in 1 2 3 4 5 6 7 8; do
      hdrs="$(curl -fsS -D - -o /dev/null -H 'Accept-Encoding: gzip, br' -H 'Origin: https://bot.liuyidi.me' "$url" || true)"
      if printf '%s\n' "$hdrs" | tr -d '\r' | grep -qiE '^HTTP/.*\s200'; then
        ok=1
        break
      fi
      sleep 2
    done
    if [[ "$ok" != 1 ]]; then
      echo "FAIL: CDN URL not reachable: $url" >&2
      exit 1
    fi
    printf '%s\n' "$hdrs" | tr -d '\r' | grep -iE '^(HTTP/|content-encoding:|content-type:|content-length:|access-control-allow-origin:|cache-control:)' || true
    if ! printf '%s\n' "$hdrs" | tr -d '\r' | grep -qiE '^content-encoding:[[:space:]]*gzip'; then
      echo "FAIL: expected Content-Encoding: gzip on ${url}" >&2
      exit 1
    fi
    size="$(curl -fsS -o /dev/null -H 'Accept-Encoding: gzip' -w '%{size_download}' "$url")"
    echo "on-wire size=${size}"
    # Main index is ~1.5MB raw / ~0.48MB gzip; fail loud if still uncompressed.
    if [[ "$size" -gt 900000 ]]; then
      echo "FAIL: on-wire size ${size} looks uncompressed (expected gzip ~500KB)" >&2
      exit 1
    fi
    acao="$(printf '%s\n' "$hdrs" | tr -d '\r' | grep -i '^access-control-allow-origin:' || true)"
    if [[ -z "$acao" ]]; then
      echo "WARN: no Access-Control-Allow-Origin — module scripts may fail" >&2
    else
      echo "CORS: ${acao}"
    fi
  fi
fi

echo "Published WebUI assets under ${public_base}/${cdn_path}/"
echo "Build with: VITE_ASSET_BASE=${public_base}/${cdn_path}/"
