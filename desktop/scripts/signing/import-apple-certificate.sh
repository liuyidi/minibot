#!/usr/bin/env bash
# Import Developer ID .p12 into a temporary keychain (CI or local).
# Requires: APPLE_CERTIFICATE (base64 .p12, single line), APPLE_CERTIFICATE_PASSWORD
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=openssl-pass.sh
source "$SCRIPT_DIR/openssl-pass.sh"

if [[ -z "${APPLE_CERTIFICATE:-}" ]]; then
  echo "import-apple-certificate: APPLE_CERTIFICATE is empty" >&2
  echo "  Run: ./desktop/scripts/signing/encode-apple-certificate-for-ci.sh" >&2
  exit 1
fi

RAW_PASS="${APPLE_CERTIFICATE_PASSWORD:-}"
PASS="$(p12_sanitize_password "$RAW_PASS")"
if [[ -z "$PASS" ]]; then
  echo "import-apple-certificate: APPLE_CERTIFICATE_PASSWORD is empty" >&2
  exit 1
fi

if [[ -n "$RAW_PASS" && "$PASS" != "$RAW_PASS" ]]; then
  echo "import-apple-certificate: stripped newlines from APPLE_CERTIFICATE_PASSWORD" >&2
fi

CERT_B64="$(printf '%s' "$APPLE_CERTIFICATE" | tr -d '[:space:]')"
if [[ ${#CERT_B64} -lt 100 ]]; then
  echo "import-apple-certificate: APPLE_CERTIFICATE too short (${#CERT_B64} chars)" >&2
  echo "  Expected one-line base64 of a .p12 (with private key), not .cer or a file path." >&2
  exit 1
fi

P12="$(mktemp -t minibot-cert.XXXXXX.p12)"
P12_IMPORT="$(mktemp -t minibot-cert-import.XXXXXX.p12)"
PASSIN_FILE="$(mktemp -t minibot-cert-passin.XXXXXX)"
PASSOUT_FILE="$(mktemp -t minibot-cert-passout.XXXXXX)"
cleanup() { rm -f "$P12" "$P12_IMPORT" "$PASSIN_FILE" "$PASSOUT_FILE"; }
trap cleanup EXIT

p12_write_pass_files "$PASS" "$PASSIN_FILE" "$PASSOUT_FILE"

python3 - "$CERT_B64" "$P12" <<'PY'
import base64, sys
raw_b64 = sys.argv[1]
out = sys.argv[2]
pad = (-len(raw_b64)) % 4
if pad:
    raw_b64 += "=" * pad
try:
    data = base64.b64decode(raw_b64, validate=True)
except Exception as e:
    print(f"import-apple-certificate: invalid base64: {e}", file=sys.stderr)
    sys.exit(1)
if len(data) < 100:
    print(f"import-apple-certificate: decoded only {len(data)} bytes", file=sys.stderr)
    sys.exit(1)
open(out, "wb").write(data)
PY

if head -c 5 "$P12" | grep -q '^-----'; then
  echo "import-apple-certificate: decoded content looks like PEM text, not a .p12 file" >&2
  echo "  Export from Keychain as Personal Information Exchange (.p12), then encode with encode-apple-certificate-for-ci.sh" >&2
  exit 1
fi

if ! p12_verify_password "$P12" "$PASSIN_FILE" 2>/tmp/p12-verify.err; then
  echo "import-apple-certificate: decoded file is not a valid .p12 with APPLE_CERTIFICATE_PASSWORD" >&2
  cat /tmp/p12-verify.err >&2
  echo "  Check APPLE_CERTIFICATE_PASSWORD matches the export password." >&2
  echo "  Re-encode: ./desktop/scripts/signing/encode-apple-certificate-for-ci.sh" >&2
  rm -f /tmp/p12-verify.err
  exit 1
fi
rm -f /tmp/p12-verify.err

if ! p12_has_private_key "$P12" "$PASSIN_FILE"; then
  echo "import-apple-certificate: .p12 has no private key (certificate-only export)" >&2
  echo "  In Keychain Access export Developer ID Application again:" >&2
  echo "    File → Export → Personal Information Exchange (.p12)" >&2
  echo "    Ensure the private key is included (not .cer / certificate only)." >&2
  echo "  Then: ./desktop/scripts/signing/encode-apple-certificate-for-ci.sh" >&2
  exit 1
fi

normalize_err="$(mktemp)"
if ! normalize_p12_for_security_import "$P12" "$P12_IMPORT" "$PASSIN_FILE" "$PASSOUT_FILE" 2>"$normalize_err"; then
  echo "import-apple-certificate: could not normalize .p12 for security import" >&2
  sed 's/^/  openssl: /' "$normalize_err" >&2
  rm -f "$normalize_err"
  exit 1
fi
rm -f "$normalize_err"

KEYCHAIN="${MINIBOT_SIGNING_KEYCHAIN:-build.keychain}"
KEYCHAIN_PASSWORD="${MINIBOT_SIGNING_KEYCHAIN_PASSWORD:-$(openssl rand -base64 32)}"

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security default-keychain -s "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -t 3600 -u "$KEYCHAIN"

IMPORT_ERR="$(mktemp)"
if ! security import "$P12_IMPORT" -k "$KEYCHAIN" -P "$PASS" \
  -f pkcs12 -A -T /usr/bin/codesign -T /usr/bin/security 2>"$IMPORT_ERR"; then
  echo "import-apple-certificate: security import failed" >&2
  cat "$IMPORT_ERR" >&2
  echo "  file(1): $(file -b "$P12_IMPORT" 2>/dev/null || echo unknown)" >&2
  echo "  Re-run encode-apple-certificate-for-ci.sh and update APPLE_CERTIFICATE." >&2
  rm -f "$IMPORT_ERR"
  exit 1
fi
rm -f "$IMPORT_ERR"

security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN"

if [[ -n "${GITHUB_ENV:-}" ]]; then
  echo "MINIBOT_SIGNING_KEYCHAIN=$KEYCHAIN" >>"$GITHUB_ENV"
  echo "MINIBOT_SIGNING_KEYCHAIN_PASSWORD=$KEYCHAIN_PASSWORD" >>"$GITHUB_ENV"
fi

echo "import-apple-certificate: ok (keychain=$KEYCHAIN)"
