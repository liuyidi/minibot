#!/usr/bin/env bash
# Print one-line base64 for GitHub secret APPLE_CERTIFICATE.
# Usage: ./encode-apple-certificate-for-ci.sh [/path/to/cert.p12]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=openssl-pass.sh
source "$SCRIPT_DIR/openssl-pass.sh"

P12="${1:-$HOME/Library/Keychains/证书.p12}"
RAW_PASS="${APPLE_CERTIFICATE_PASSWORD:-}"
PASS="$(p12_sanitize_password "$RAW_PASS")"

if [[ ! -f "$P12" ]]; then
  echo "encode-apple-certificate-for-ci: missing $P12" >&2
  exit 1
fi

if [[ -n "$RAW_PASS" && "$PASS" != "$RAW_PASS" ]]; then
  echo "encode-apple-certificate-for-ci: stripped newlines from APPLE_CERTIFICATE_PASSWORD" >&2
  echo "  Use a single line: export APPLE_CERTIFICATE_PASSWORD='your-password'" >&2
fi

PASSIN_FILE=""
PASSOUT_FILE=""
P12_OUT=""
cleanup_encode() {
  rm -f "${PASSIN_FILE:-}" "${PASSOUT_FILE:-}" "${P12_OUT:-}"
}
trap cleanup_encode EXIT

if [[ -n "$PASS" ]]; then
  PASSIN_FILE="$(mktemp -t minibot-encode-passin.XXXXXX)"
  PASSOUT_FILE="$(mktemp -t minibot-encode-passout.XXXXXX)"
  p12_write_pass_files "$PASS" "$PASSIN_FILE" "$PASSOUT_FILE"
fi

if [[ -n "$PASS" ]]; then
  err="$(mktemp)"
  if ! p12_verify_password "$P12" "$PASSIN_FILE" 2>"$err"; then
    echo "encode-apple-certificate-for-ci: .p12 password check failed for: $P12" >&2
    sed 's/^/  openssl: /' "$err" >&2
    echo "  The password must match the one you chose when exporting this .p12 from Keychain." >&2
    rm -f "$err"
    exit 1
  fi
  if ! p12_has_private_key "$P12" "$PASSIN_FILE"; then
    echo "encode-apple-certificate-for-ci: .p12 has no private key" >&2
    echo "  Re-export from Keychain Access as .p12 with the private key included." >&2
    rm -f "$err"
    exit 1
  fi
  rm -f "$err"
else
  echo "Tip: export APPLE_CERTIFICATE_PASSWORD first to verify the .p12 before encoding" >&2
  echo "  Example: export APPLE_CERTIFICATE_PASSWORD='your-export-password'" >&2
fi

# CI security import rejects legacy RC2 Keychain exports; emit AES-256 PKCS#12.
P12_OUT="$(mktemp -t minibot-cert-ci.XXXXXX.p12)"
if [[ -n "$PASS" ]]; then
  normalize_err="$(mktemp)"
  if ! normalize_p12_for_security_import "$P12" "$P12_OUT" "$PASSIN_FILE" "$PASSOUT_FILE" 2>"$normalize_err"; then
    echo "encode-apple-certificate-for-ci: could not normalize .p12" >&2
    sed 's/^/  openssl: /' "$normalize_err" >&2
    rm -f "$normalize_err"
    exit 1
  fi
  rm -f "$normalize_err"
else
  cp "$P12" "$P12_OUT"
fi

echo "Paste the next line into GitHub → Settings → Secrets → APPLE_CERTIFICATE (no quotes):"
base64 -i "$P12_OUT" | tr -d '\n'
echo
