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

p12_verify() {
  local p12="$1"
  local pass="$2"
  if openssl pkcs12 -in "$p12" -passin "pass:$pass" -noout 2>/dev/null; then
    return 0
  fi
  # macOS Keychain exports often use RC2-40-CBC; OpenSSL 3 needs -legacy.
  openssl pkcs12 -in "$p12" -passin "pass:$pass" -legacy -noout 2>/dev/null
}

if [[ -n "$PASS" ]]; then
  err="$(mktemp)"
  if ! p12_verify "$P12" "$PASS" 2>"$err"; then
    echo "encode-apple-certificate-for-ci: .p12 password check failed for: $P12" >&2
    sed 's/^/  openssl: /' "$err" >&2
    echo "  The password must match the one you chose when exporting this .p12 from Keychain." >&2
    rm -f "$err"
    exit 1
  fi
  rm -f "$err"
else
  echo "Tip: export APPLE_CERTIFICATE_PASSWORD first to verify the .p12 before encoding" >&2
fi

echo "Paste the next line into GitHub → Settings → Secrets → APPLE_CERTIFICATE (no quotes):"
base64 -i "$P12" | tr -d '\n'
echo
