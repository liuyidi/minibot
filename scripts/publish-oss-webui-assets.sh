#!/usr/bin/env bash
# Upload WebUI build assets to Aliyun OSS (CDN: downloads.liuyidi.me).
#
# Usage:
#   source scripts/oss-release.env
#   export OSS_ACCESS_KEY_ID=... OSS_ACCESS_KEY_SECRET=...
#   scripts/publish-oss-webui-assets.sh [--dist webui/dist] [--dry-run]
#
# Object layout (matches Vite base https://downloads.liuyidi.me/minibot/webui/):
#   ${OSS_PREFIX}/webui/assets/*   hashed JS/CSS/fonts (immutable)
#   ${OSS_PREFIX}/webui/brand/*    public brand SVGs (long cache)
#
# index.html stays on bot.liuyidi.me (Publish WebUI → ECS). Do not rely on OSS
# for the HTML entry.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  source scripts/oss-release.env
  export OSS_ACCESS_KEY_ID=... OSS_ACCESS_KEY_SECRET=...
  scripts/publish-oss-webui-assets.sh [--dist webui/dist] [--dry-run]

Required environment: OSS_BUCKET, OSS_REGION, OSS_ENDPOINT, OSS_PUBLIC_BASE_URL.
Optional: OSS_PREFIX=minibot, OSS_OBJECT_ACL=public-read, WEBUI_CDN_SET_CORS=1
EOF
}

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
dist="${ROOT}/webui/dist"
dry_run=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dist) dist="${2:?missing value for --dist}"; shift 2 ;;
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

if [[ "$dry_run" != true ]] && ! command -v ossutil >/dev/null 2>&1; then
  echo "ossutil is required: https://help.aliyun.com/zh/oss/developer-reference/ossutil-overview/" >&2
  exit 1
fi

prefix="${OSS_PREFIX:-minibot}"
object_acl="${OSS_OBJECT_ACL:-public-read}"
webui_prefix="${prefix}/webui"
public_base="${OSS_PUBLIC_BASE_URL%/}"

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

ossutil_cp_dir() {
  local source="$1" object_dir="$2" cache_control="$3"
  local dest="oss://${OSS_BUCKET}/${object_dir}"
  local command=(
    ossutil cp -r "$source" "$dest"
    --force
    --region "$OSS_REGION"
    --endpoint "$OSS_ENDPOINT"
    --acl "$object_acl"
    "${ossutil_auth[@]}"
  )
  if [[ "$ossutil_major" == "2" ]]; then
    command+=(--cache-control "$cache_control")
  else
    command+=(--meta "Cache-Control:${cache_control}")
  fi
  printf 'Uploading %s -> %s (Cache-Control=%s)\n' "$source" "$dest" "$cache_control"
  if [[ "$dry_run" == true ]]; then
    printf 'DRY RUN:'; printf ' %q' "${command[@]}"; printf '\n'
  else
    "${command[@]}"
  fi
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

ossutil_cp_dir "${dist}/assets/" "${webui_prefix}/assets/" "public,max-age=31536000,immutable"

if [[ -d "${dist}/brand" ]]; then
  ossutil_cp_dir "${dist}/brand/" "${webui_prefix}/brand/" "public,max-age=86400"
fi

# Spot-check one hashed JS on the public CDN URL.
sample_js="$(find "${dist}/assets" -maxdepth 1 -type f -name 'index-*.js' | head -n1 || true)"
if [[ -n "$sample_js" ]]; then
  name="$(basename "$sample_js")"
  url="${public_base}/${webui_prefix}/assets/${name}"
  echo "Public CDN URL: ${url}"
  if [[ "$dry_run" != true ]]; then
    # CDN may need a few seconds to pull; retry briefly.
    ok=0
    for _ in 1 2 3 4 5 6; do
      if curl -fsS -o /dev/null -H 'Accept-Encoding: gzip' "$url"; then
        ok=1
        break
      fi
      sleep 2
    done
    if [[ "$ok" != 1 ]]; then
      echo "FAIL: CDN URL not reachable: $url" >&2
      exit 1
    fi
    # Module scripts need ACAO when loaded with crossorigin from bot.liuyidi.me.
    acao="$(curl -fsS -D - -o /dev/null -H 'Origin: https://bot.liuyidi.me' "$url" | tr -d '\r' | grep -i '^access-control-allow-origin:' || true)"
    if [[ -z "$acao" ]]; then
      echo "WARN: no Access-Control-Allow-Origin on CDN response — Vite module scripts may fail until bucket/CDN CORS is fixed" >&2
    else
      echo "CORS: ${acao}"
    fi
  fi
fi

echo "Published WebUI assets under ${public_base}/${webui_prefix}/"
echo "Build with: VITE_ASSET_BASE=${public_base}/${webui_prefix}/"
