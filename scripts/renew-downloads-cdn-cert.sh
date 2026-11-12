#!/usr/bin/env bash
# Issue a Let's Encrypt cert for downloads.liuyidi.me (DNS-01 via Aliyun DNS)
# and deploy it to Aliyun CDN with SetCdnDomainSSLCertificate.
#
# HTTP-01 via OSS is unreliable: LE validators outside CN often time out on
# Aliyun CDN edges even when the challenge object is public.
#
# Requires:
#   OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET  (or ALIBABA_CLOUD_*)
#     with alidns:AddDomainRecord / DeleteDomainRecord + cdn:SetCdnDomainSSLCertificate
#   LE_EMAIL (subscriber email for Let's Encrypt)
#
# Optional:
#   CDN_DOMAIN (default downloads.liuyidi.me)
#   DNS_ROOT_DOMAIN (default liuyidi.me)
#   CERTBOT_WORKDIR (default mktemp)
set -euo pipefail

DOMAIN="${CDN_DOMAIN:-downloads.liuyidi.me}"
ROOT_DOMAIN="${DNS_ROOT_DOMAIN:-liuyidi.me}"
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

if [[ "$DOMAIN" != *".$ROOT_DOMAIN" && "$DOMAIN" != "$ROOT_DOMAIN" ]]; then
  echo "CDN_DOMAIN=$DOMAIN is not under DNS_ROOT_DOMAIN=$ROOT_DOMAIN" >&2
  exit 2
fi

export ALIYUN_ACCESS_KEY_ID="$AK"
export ALIYUN_ACCESS_KEY_SECRET="$SK"

if ! command -v aliyun >/dev/null 2>&1; then
  echo "Installing aliyun CLI…"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/aliyun.tgz" \
    "https://aliyuncli.alicdn.com/aliyun-cli-linux-latest-amd64.tgz"
  tar -xzf "$tmp/aliyun.tgz" -C "$tmp"
  sudo install -m 755 "$tmp/aliyun" /usr/local/bin/aliyun
fi

need_apt=()
command -v certbot >/dev/null 2>&1 || need_apt+=(certbot)
command -v dig >/dev/null 2>&1 || need_apt+=(dnsutils)
if ((${#need_apt[@]})); then
  echo "Installing ${need_apt[*]}…"
  sudo apt-get update -qq
  sudo apt-get install -y -qq "${need_apt[@]}"
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
mkdir -p "$WORKDIR/hooks" "$WORKDIR/config" "$WORKDIR/work" "$WORKDIR/logs" "$WORKDIR/state"
HOOK_AUTH="$WORKDIR/hooks/auth.sh"
HOOK_CLEAN="$WORKDIR/hooks/cleanup.sh"
STATE_DIR="$WORKDIR/state"

# Relative host under ROOT_DOMAIN, e.g. downloads.liuyidi.me → downloads
relative="${DOMAIN%"$ROOT_DOMAIN"}"
relative="${relative%.}"
if [[ -z "$relative" ]]; then
  ACME_RR="_acme-challenge"
else
  ACME_RR="_acme-challenge.${relative}"
fi

cat >"$HOOK_AUTH" <<EOF
#!/usr/bin/env bash
set -euo pipefail
: "\${CERTBOT_VALIDATION:?}"
ROOT_DOMAIN=$(printf '%q' "$ROOT_DOMAIN")
ACME_RR=$(printf '%q' "$ACME_RR")
STATE_DIR=$(printf '%q' "$STATE_DIR")
profile=(--profile minibot-cdn)

# Remove stale challenge records for this RR.
old_ids="\$(
  aliyun "\${profile[@]}" alidns DescribeDomainRecords \
    --DomainName "\$ROOT_DOMAIN" \
    --RRKeyWord "\$ACME_RR" \
    --Type TXT \
  | python3 -c '
import json,sys
j=json.load(sys.stdin)
recs=(j.get("DomainRecords") or {}).get("Record") or []
if isinstance(recs, dict):
  recs=[recs]
rr=sys.argv[1]
for r in recs:
  if r.get("RR")==rr and r.get("Type")=="TXT":
    print(r.get("RecordId") or "")
' "\$ACME_RR" 2>/dev/null || true
)"
for id in \$old_ids; do
  [[ -n "\$id" ]] || continue
  aliyun "\${profile[@]}" alidns DeleteDomainRecord --RecordId "\$id" >/dev/null || true
done

resp="\$(
  aliyun "\${profile[@]}" alidns AddDomainRecord \
    --DomainName "\$ROOT_DOMAIN" \
    --RR "\$ACME_RR" \
    --Type TXT \
    --Value "\$CERTBOT_VALIDATION" \
    --TTL 600
)"
record_id="\$(printf '%s' "\$resp" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("RecordId") or "")')"
if [[ -z "\$record_id" ]]; then
  echo "Failed to create TXT record: \$resp" >&2
  exit 1
fi
printf '%s' "\$record_id" >"\$STATE_DIR/record_id"
echo "Created TXT \${ACME_RR}.\${ROOT_DOMAIN} RecordId=\$record_id"

fqdn="\${ACME_RR}.\${ROOT_DOMAIN}"
ok=0
for i in \$(seq 1 60); do
  got="\$(dig +short TXT "\$fqdn" @8.8.8.8 2>/dev/null | tr -d '"' | head -1 || true)"
  if [[ "\$got" == "\$CERTBOT_VALIDATION" ]]; then
    ok=1
    break
  fi
  echo "waiting for DNS TXT (\$i): got=\${got:-<empty>}"
  sleep 5
done
if [[ "\$ok" != 1 ]]; then
  echo "DNS TXT not visible at \$fqdn via 8.8.8.8" >&2
  dig +short TXT "\$fqdn" @223.5.5.5 || true
  exit 1
fi
echo "DNS challenge OK: \$fqdn"
# Extra settle time for LE multi-perspective checks.
sleep 15
EOF

cat >"$HOOK_CLEAN" <<EOF
#!/usr/bin/env bash
set -euo pipefail
STATE_DIR=$(printf '%q' "$STATE_DIR")
profile=(--profile minibot-cdn)
if [[ -f "\$STATE_DIR/record_id" ]]; then
  rid="\$(cat "\$STATE_DIR/record_id")"
  if [[ -n "\$rid" ]]; then
    aliyun "\${profile[@]}" alidns DeleteDomainRecord --RecordId "\$rid" >/dev/null || true
    echo "Deleted TXT RecordId=\$rid"
  fi
  rm -f "\$STATE_DIR/record_id"
fi
EOF

chmod +x "$HOOK_AUTH" "$HOOK_CLEAN"

echo "Issuing Let's Encrypt certificate for $DOMAIN (DNS-01, RR=$ACME_RR)…"
certbot certonly \
  --non-interactive \
  --agree-tos \
  --email "$LE_EMAIL" \
  --manual \
  --preferred-challenges dns \
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
