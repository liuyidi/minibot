#!/usr/bin/env bash
# Best-effort: create / inspect Aliyun CDN domain for downloads.liuyidi.me.
#
# Requires aliyun CLI + credentials with CDN permissions:
#   ALIBABA_CLOUD_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_SECRET
#   (falls back to OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET)
#
# Does NOT change DNS — prints the CNAME you must set at hichina/Aliyun DNS.
set -euo pipefail

DOMAIN="${CDN_DOMAIN:-downloads.liuyidi.me}"
OSS_ORIGIN="${CDN_OSS_ORIGIN:-liuyidi.oss-cn-hangzhou.aliyuncs.com}"
REGION="${CDN_REGION:-cn-hangzhou}"

AK="${ALIBABA_CLOUD_ACCESS_KEY_ID:-${OSS_ACCESS_KEY_ID:-}}"
SK="${ALIBABA_CLOUD_ACCESS_KEY_SECRET:-${OSS_ACCESS_KEY_SECRET:-}}"
if [[ -z "$AK" || -z "$SK" ]]; then
  echo "Missing AccessKey (set ALIBABA_CLOUD_ACCESS_KEY_* or OSS_ACCESS_KEY_*)" >&2
  exit 2
fi

if ! command -v aliyun >/dev/null 2>&1; then
  echo "Installing aliyun CLI…"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/aliyun.tgz" \
    "https://aliyuncli.alicdn.com/aliyun-cli-linux-latest-amd64.tgz"
  tar -xzf "$tmp/aliyun.tgz" -C "$tmp"
  sudo install -m 755 "$tmp/aliyun" /usr/local/bin/aliyun
fi

export ALIYUN_ACCESS_KEY_ID="$AK"
export ALIYUN_ACCESS_KEY_SECRET="$SK"
# Prefer env credentials over interactive config.
aliyun configure set --profile minibot-cdn \
  --mode AK \
  --region "$REGION" \
  --access-key-id "$AK" \
  --access-key-secret "$SK" >/dev/null

profile=(--profile minibot-cdn)

echo "Describing existing CDN domain (if any): $DOMAIN"
if detail="$(aliyun "${profile[@]}" cdn DescribeCdnDomainDetail --DomainName "$DOMAIN" 2>/dev/null)"; then
  echo "$detail" | python3 -c '
import json,sys
j=json.load(sys.stdin)
d=j.get("GetDomainDetailModel") or j.get("DomainDetail") or j
print("DomainStatus:", d.get("DomainStatus") or d.get("Status"))
print("Cname:", d.get("Cname") or d.get("DomainCname"))
srcs=d.get("SourceModels") or d.get("Sources") or {}
print("Sources:", json.dumps(srcs, ensure_ascii=False)[:500])
'
else
  echo "Domain not found — attempting AddCdnDomain…"
  sources="$(python3 -c "import json; print(json.dumps([{'content':'$OSS_ORIGIN','type':'oss','priority':'20','port':443,'weight':'10'}]))")"
  if ! aliyun "${profile[@]}" cdn AddCdnDomain \
      --DomainName "$DOMAIN" \
      --CdnType web \
      --Sources "$sources"; then
    echo "AddCdnDomain failed. Grant cdn:AddCdnDomain (or use OSS console → CDN 加速). See docs/downloads-cdn.md" >&2
    exit 1
  fi
  echo "Created. Waiting for CNAME…"
  sleep 3
  detail="$(aliyun "${profile[@]}" cdn DescribeCdnDomainDetail --DomainName "$DOMAIN")"
  echo "$detail" | python3 -c '
import json,sys
j=json.load(sys.stdin)
d=j.get("GetDomainDetailModel") or j.get("DomainDetail") or j
print("Cname:", d.get("Cname") or d.get("DomainCname"))
'
fi

echo
echo "Applying recommended configs (best-effort)…"
# Follow origin Cache-Control; disable gzip at CDN (we pre-gzip on OSS).
# Config list format: https://help.aliyun.com/zh/cdn/developer-reference/api-cdn-2018-05-10-batchsetcdndomainconfig
set_cfg() {
  local functions_json="$1"
  aliyun "${profile[@]}" cdn BatchSetCdnDomainConfig \
    --DomainNames "$DOMAIN" \
    --Functions "$functions_json" \
    && echo "  OK: $functions_json" \
    || echo "  WARN: failed $functions_json" >&2
}

# HTTPS HTTP/2 — only if cert already bound; otherwise warn.
set_cfg '[{"functionName":"https_option","functionArgs":[{"argName":"http2","argValue":"on"},{"argName":"ocsp_stapling","argValue":"off"}]}]' || true

# Ignore query string for static assets caching (hashed paths).
set_cfg '[{"functionName":"set_hashkey_args","functionArgs":[{"argName":"disable","argValue":"on"},{"argName":"keep_args","argValue":""}]}]' || true

# CORS outbound (module scripts from bot.liuyidi.me).
set_cfg '[{"functionName":"set_resp_header","functionArgs":[{"argName":"key","argValue":"Access-Control-Allow-Origin"},{"argName":"value","argValue":"*"},{"argName":"duplicate","argValue":"off"},{"argName":"header_operation_type","argValue":"add"}]}]' || true

echo
echo "Next:"
echo "  1) Bind HTTPS cert for $DOMAIN in CDN console if not already."
echo "  2) DNS: CNAME downloads → <Cname from above>  (replace *.taihangcda.cn)"
echo "  3) Disable CDN 智能压缩 in console (pre-gzipped objects)."
echo "  4) REQUIRE_CDN_HIT=1 REQUIRE_HTTP2=1 scripts/verify-downloads-cdn.sh"
echo "Docs: docs/downloads-cdn.md"
