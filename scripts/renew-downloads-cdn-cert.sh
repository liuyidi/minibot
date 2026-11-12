#!/usr/bin/env bash
# Issue a Let's Encrypt cert for downloads.liuyidi.me (HTTP-01 via OSS) and
# deploy it to Aliyun CDN with SetCdnDomainSSLCertificate.
#
# Requires:
#   OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET  (or ALIBABA_CLOUD_*)
#   OSS_BUCKET, OSS_ENDPOINT (optional; defaults match publish scripts)
#   LE_EMAIL (subscriber email for Let's Encrypt)
#
# Optional:
#   CDN_DOMAIN (default downloads.liuyidi.me)
#   CERTBOT_WORKDIR (default mktemp)
set -euo pipefail

DOMAIN="${CDN_DOMAIN:-downloads.liuyidi.me}"
BUCKET="${OSS_BUCKET:-liuyidi}"
ENDPOINT="${OSS_ENDPOINT:-https://oss-cn-hangzhou.aliyuncs.com}"
REGION="${CDN_REGION:-cn-hangzhou}"
LE_EMAIL="${LE_EMAIL:-}"
WORKDIR="${CERTBOT_WORKDIR:-}"

AK="${ALIBABA_CLOUD_ACCESS_KEY_ID:-${OSS_ACCESS_KEY_ID:-}}"
SK="${ALIBABA_CLOUD_ACCESS_KEY_SECRET:-${OSS_ACCESS_KEY_SECRET:-}}"
if [[ -z "$AK" || -z "$SK" ]]; then
  echo "Missing AccessKey (set ALIBABA_CLOUD_ACCESS_KEY_* or OSS_ACCESS_KEY_*)" >&2
  exit 2
fi
if [[ -z "$LE_EMAIL" ]]; then
  echo "Missing LE_EMAIL (Let's Encrypt subscriber email)" >&2
  exit 2
fi

export OSS_ACCESS_KEY_ID="$AK"
export OSS_ACCESS_KEY_SECRET="$SK"
export ALIYUN_ACCESS_KEY_ID="$AK"
export ALIYUN_ACCESS_KEY_SECRET="$SK"

if ! command -v ossutil >/dev/null 2>&1; then
  echo "Installing ossutil…"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/ossutil.zip" \
    "https://gosspublic.alicdn.com/ossutil/1.7.19/ossutil-v1.7.19-linux-amd64.zip"
  unzip -qo "$tmp/ossutil.zip" -d "$tmp"
  sudo install -m 755 "$tmp"/ossutil-*/ossutil /usr/local/bin/ossutil
fi

if ! command -v aliyun >/dev/null 2>&1; then
  echo "Installing aliyun CLI…"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/aliyun.tgz" \
    "https://aliyuncli.alicdn.com/aliyun-cli-linux-latest-amd64.tgz"
  tar -xzf "$tmp/aliyun.tgz" -C "$tmp"
  sudo install -m 755 "$tmp/aliyun" /usr/local/bin/aliyun
fi

if ! command -v certbot >/dev/null 2>&1; then
  echo "Installing certbot…"
  sudo apt-get update -qq
  sudo apt-get install -y -qq certbot
fi

aliyun configure set --profile minibot-cdn \
  --mode AK \
  --region "$REGION" \
  --access-key-id "$AK" \
  --access-key-secret "$SK" >/dev/null
profile=(--profile minibot-cdn)

if [[ -z "$WORKDIR" ]]; then
  WORKDIR="$(mktemp -d)"
fi
mkdir -p "$WORKDIR/hooks" "$WORKDIR/config" "$WORKDIR/work" "$WORKDIR/logs"
HOOK_AUTH="$WORKDIR/hooks/auth.sh"
HOOK_CLEAN="$WORKDIR/hooks/cleanup.sh"

cat >"$HOOK_AUTH" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
: "${CERTBOT_TOKEN:?}" "${CERTBOT_VALIDATION:?}"
: "${OSS_BUCKET:?}" "${OSS_ENDPOINT:?}" "${CDN_DOMAIN:?}"

obj=".well-known/acme-challenge/${CERTBOT_TOKEN}"
body_file="$(mktemp)"
printf '%s' "$CERTBOT_VALIDATION" >"$body_file"

ossutil -e "$OSS_ENDPOINT" cp "$body_file" "oss://${OSS_BUCKET}/${obj}" \
  -f --acl public-read \
  --meta "Cache-Control:no-cache,max-age=0"

# Best-effort CDN purge so a prior 404 is not sticky.
if command -v aliyun >/dev/null 2>&1; then
  aliyun --profile minibot-cdn cdn RefreshObjectCaches \
    --ObjectPath "http://${CDN_DOMAIN}/${obj}" \
    --ObjectType File >/dev/null 2>&1 || true
fi

url="http://${CDN_DOMAIN}/${obj}"
ok=0
for i in $(seq 1 30); do
  got="$(curl -fsS --noproxy '*' --max-time 10 "$url" 2>/dev/null || true)"
  if [[ "$got" == "$CERTBOT_VALIDATION" ]]; then
    ok=1
    break
  fi
  sleep 2
done
rm -f "$body_file"
if [[ "$ok" != 1 ]]; then
  echo "ACME challenge not reachable at $url" >&2
  exit 1
fi
echo "Challenge OK: $url"
EOF

cat >"$HOOK_CLEAN" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
: "${CERTBOT_TOKEN:?}"
: "${OSS_BUCKET:?}" "${OSS_ENDPOINT:?}"
obj=".well-known/acme-challenge/${CERTBOT_TOKEN}"
ossutil -e "$OSS_ENDPOINT" rm "oss://${OSS_BUCKET}/${obj}" -f >/dev/null 2>&1 || true
EOF

chmod +x "$HOOK_AUTH" "$HOOK_CLEAN"

export OSS_BUCKET OSS_ENDPOINT CDN_DOMAIN="$DOMAIN"

echo "Issuing Let's Encrypt certificate for $DOMAIN …"
certbot certonly \
  --non-interactive \
  --agree-tos \
  --email "$LE_EMAIL" \
  --manual \
  --preferred-challenges http \
  --manual-auth-hook "$HOOK_AUTH" \
  --manual-cleanup-hook "$HOOK_CLEAN" \
  --config-dir "$WORKDIR/config" \
  --work-dir "$WORKDIR/work" \
  --logs-dir "$WORKDIR/logs" \
  -d "$DOMAIN"

live="$WORKDIR/config/live/$DOMAIN"
fullchain="$live/fullchain.pem"
privkey="$live/privkey.pem"
if [[ ! -f "$fullchain" || ! -f "$privkey" ]]; then
  echo "Missing issued cert under $live" >&2
  exit 1
fi

cert_name="downloads-le-$(date -u +%Y%m%d%H%M%S)"
echo "Deploying $cert_name to CDN domain $DOMAIN …"
aliyun "${profile[@]}" cdn SetCdnDomainSSLCertificate \
  --DomainName "$DOMAIN" \
  --SSLProtocol on \
  --CertType upload \
  --CertName "$cert_name" \
  --SSLPub "$(cat "$fullchain")" \
  --SSLPri "$(cat "$privkey")"

echo
echo "Waiting briefly for edge propagation…"
sleep 8

echo "Certificate on wire:"
echo | openssl s_client -connect "${DOMAIN}:443" -servername "$DOMAIN" 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates

echo
echo "Done. Refresh https://${DOMAIN}/ (and bot.liuyidi.me) to confirm."
