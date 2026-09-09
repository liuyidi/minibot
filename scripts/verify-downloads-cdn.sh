#!/usr/bin/env bash
# Verify downloads.liuyidi.me is served by a real CDN edge (not bare OSS).
#
# Checks:
#   1) Response is not only AliyunOSS without cache headers
#   2) Second request shows a cache HIT (X-Cache / Age / Ali-Swift-*)
#   3) Prefer HTTP/2 or HTTP/3 (warn if HTTP/1.1 only)
#   4) On-wire gzip still present; rough throughput sanity
#
# Usage:
#   scripts/verify-downloads-cdn.sh [url]
#   REQUIRE_CDN_HIT=1 scripts/verify-downloads-cdn.sh   # exit 1 on miss
#
# Default URL: current WebUI index asset on downloads.liuyidi.me
set -euo pipefail

REQUIRE_CDN_HIT="${REQUIRE_CDN_HIT:-0}"
REQUIRE_HTTP2="${REQUIRE_HTTP2:-0}"
url="${1:-}"

if [[ -z "$url" ]]; then
  version="$(node -p "require('$(cd "$(dirname "$0")/.." && pwd)/webui/package.json').version" 2>/dev/null || true)"
  if [[ -n "$version" ]]; then
    # Discover current hashed index from live bot HTML when possible.
    html="$(curl -fsS --noproxy '*' https://bot.liuyidi.me/ 2>/dev/null || true)"
    url="$(printf '%s' "$html" | grep -oE "https://downloads\\.liuyidi\\.me/minibot/webui/${version}/assets/index-[^\"[:space:]]+\\.js" | head -1 || true)"
  fi
fi
if [[ -z "$url" ]]; then
  url="https://downloads.liuyidi.me/minibot/webui/1.0.29/assets/index-CF2NqlaM.js"
  echo "WARN: using fallback URL $url" >&2
fi

echo "Probing CDN edge: $url"

fetch_headers() {
  # --http2 negotiates h2 when available; fall back is still fine.
  curl -sS --noproxy '*' --http2 -D - -o /dev/null \
    -H 'Accept-Encoding: gzip' \
    -H 'Cache-Control: no-cache' \
    -H "Pragma: no-cache" \
    -H "X-Minibot-Cdn-Probe: $(date +%s)-$RANDOM" \
    "$1" 2>/dev/null | tr -d '\r'
}

is_hit() {
  local hdrs="$1"
  # Aliyun CDN: X-Cache: HIT TCP_MEM_HIT / HIT ...
  # Also accept Age>0 or Ali-Swift-* cache markers.
  if printf '%s\n' "$hdrs" | grep -qiE '^x-cache:[[:space:]]*.*HIT'; then
    return 0
  fi
  if printf '%s\n' "$hdrs" | grep -qiE '^age:[[:space:]]*[1-9]'; then
    return 0
  fi
  if printf '%s\n' "$hdrs" | grep -qiE '^x-swift-|^ali-swift-'; then
    # Present + not explicitly MISS
    if printf '%s\n' "$hdrs" | grep -qiE '^x-cache:[[:space:]]*.*MISS'; then
      return 1
    fi
    return 0
  fi
  return 1
}

is_oss_only() {
  local hdrs="$1"
  printf '%s\n' "$hdrs" | grep -qiE '^server:[[:space:]]*AliyunOSS' \
    && ! printf '%s\n' "$hdrs" | grep -qiE '^x-cache:|^via:.*[Cc][Dd][Nn]|^age:|^x-swift-|^ali-swift-'
}

echo "— warm (may MISS) —"
warm="$(fetch_headers "$url")"
printf '%s\n' "$warm" | grep -iE '^(HTTP/|server:|x-cache:|via:|age:|content-encoding:|content-length:|x-swift-|ali-swift-|x-oss-)' || true

sleep 1
echo "— probe (expect HIT) —"
hdrs="$(fetch_headers "$url")"
printf '%s\n' "$hdrs" | grep -iE '^(HTTP/|server:|x-cache:|via:|age:|content-encoding:|content-length:|x-swift-|ali-swift-|x-oss-)' || true

timing="$(curl -sS --noproxy '*' --http2 -o /dev/null -H 'Accept-Encoding: gzip' \
  -w 'proto=%{http_version} total=%{time_total} size=%{size_download} speed=%{speed_download}\n' \
  "$url")"
echo "$timing"

fail=0
if is_oss_only "$hdrs"; then
  echo "FAIL: response looks like bare OSS custom domain (no CDN cache headers)." >&2
  echo "      downloads.liuyidi.me currently CNAMEs to *.taihangcda.cn (OSS), not Aliyun CDN." >&2
  echo "      See docs/downloads-cdn.md to enable CDN edge + switch DNS CNAME." >&2
  fail=1
elif ! is_hit "$hdrs"; then
  echo "FAIL: no CDN HIT marker on second request (X-Cache/Age/Ali-Swift)." >&2
  fail=1
else
  echo "OK: CDN cache HIT (or Age/Swift marker) present."
fi

proto="$(printf '%s' "$timing" | sed -n 's/.*proto=\([0-9.]*\).*/\1/p')"
if [[ "$proto" == "2" || "$proto" == "3" || "$proto" == "2.0" || "$proto" == "3.0" ]]; then
  echo "OK: HTTP/${proto}"
else
  echo "WARN: negotiated HTTP/${proto:-1.1} (want HTTP/2 or HTTP/3). Enable HTTP/2 in CDN console." >&2
  if [[ "$REQUIRE_HTTP2" == "1" ]]; then
    fail=1
  fi
fi

if ! printf '%s\n' "$hdrs" | grep -qiE '^content-encoding:[[:space:]]*gzip'; then
  echo "WARN: missing Content-Encoding: gzip (pre-gzipped OSS objects / CDN passthrough)." >&2
fi

if [[ "$fail" -ne 0 ]]; then
  if [[ "$REQUIRE_CDN_HIT" == "1" ]]; then
    exit 1
  fi
  echo "WARN: CDN edge checks failed (set REQUIRE_CDN_HIT=1 to fail CI)." >&2
  exit 0
fi
