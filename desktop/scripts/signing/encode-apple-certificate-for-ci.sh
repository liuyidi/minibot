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

# CI security import rejects legacy RC2 Keychain exports; emit AES-256 PKCS#12.
P12_OUT="$(mktemp -t minibot-cert-ci.XXXXXX.p12)"
cleanup() { rm -f "$P12_OUT"; }
trap cleanup EXIT

normalize_err="$(mktemp)"
if [[ -n "$PASS" ]]; then
  if ! openssl pkcs12 -in "$P12" -passin "pass:$PASS" -legacy \
    -export -out "$P12_OUT" -passout "pass:$PASS" \
    -keypbe AES-256-CBC -certpbe AES-256-CBC -maciter 2>"$normalize_err"; then
    if ! openssl pkcs12 -in "$P12" -passin "pass:$PASS" \
      -export -out "$P12_OUT" -passout "pass:$PASS" \
      -keypbe AES-256-CBC -certpbe AES-256-CBC -maciter 2>"$normalize_err"; then
      echo "encode-apple-certificate-for-ci: could not normalize .p12" >&2
      sed 's/^/  openssl: /' "$normalize_err" >&2
      rm -f "$normalize_err"
      exit 1
    fi
  fi
else
  cp "$P12" "$P12_OUT"
fi
rm -f "$normalize_err"

echo "Paste the next line into GitHub → Settings → Secrets → APPLE_CERTIFICATE (no quotes):"
base64 -i "$P12_OUT" | tr -d '\n'
echo
