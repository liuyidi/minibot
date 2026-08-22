#!/usr/bin/env bash
# Print one-line base64 for GitHub secret APPLE_CERTIFICATE.
# Usage: ./encode-apple-certificate-for-ci.sh [/path/to/cert.p12]
set -euo pipefail

P12="${1:-$HOME/Library/Keychains/证书.p12}"
PASS="${APPLE_CERTIFICATE_PASSWORD:-}"

if [[ ! -f "$P12" ]]; then
  echo "encode-apple-certificate-for-ci: missing $P12" >&2
  exit 1
fi

if [[ -n "$PASS" ]]; then
  if ! openssl pkcs12 -in "$P12" -passin "pass:$PASS" -noout 2>/dev/null; then
    echo "encode-apple-certificate-for-ci: .p12 password check failed (set APPLE_CERTIFICATE_PASSWORD)" >&2
    exit 1
  fi
else
  echo "Tip: export APPLE_CERTIFICATE_PASSWORD first to verify the .p12 before encoding" >&2
fi

echo "Paste the next line into GitHub → Settings → Secrets → APPLE_CERTIFICATE (no quotes):"
base64 -i "$P12" | tr -d '\n'
echo
