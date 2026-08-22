#!/usr/bin/env bash
# Import Developer ID .p12 into a temporary keychain (CI or local).
# Requires: APPLE_CERTIFICATE (base64 .p12, single line), APPLE_CERTIFICATE_PASSWORD
set -euo pipefail

if [[ -z "${APPLE_CERTIFICATE:-}" ]]; then
  echo "import-apple-certificate: APPLE_CERTIFICATE is empty" >&2
  echo "  Run: ./desktop/scripts/signing/encode-apple-certificate-for-ci.sh" >&2
  exit 1
fi

if [[ -z "${APPLE_CERTIFICATE_PASSWORD:-}" ]]; then
  echo "import-apple-certificate: APPLE_CERTIFICATE_PASSWORD is empty" >&2
  exit 1
fi

CERT_B64="$(printf '%s' "$APPLE_CERTIFICATE" | tr -d '[:space:]')"
if [[ ${#CERT_B64} -lt 100 ]]; then
  echo "import-apple-certificate: APPLE_CERTIFICATE too short (${#CERT_B64} chars)" >&2
  echo "  Expected one-line base64 of a .p12 (with private key), not .cer or a file path." >&2
  exit 1
fi

P12="$(mktemp -t minibot-cert.XXXXXX.p12)"
P12_IMPORT="$(mktemp -t minibot-cert-import.XXXXXX.p12)"
cleanup() { rm -f "$P12" "$P12_IMPORT"; }
trap cleanup EXIT

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

p12_verify() {
  local p12="$1"
  local pass="$2"
  if openssl pkcs12 -in "$p12" -passin "pass:$pass" -noout 2>/dev/null; then
    return 0
  fi
  openssl pkcs12 -in "$p12" -passin "pass:$pass" -legacy -noout 2>/dev/null
}

if ! p12_verify "$P12" "$APPLE_CERTIFICATE_PASSWORD" 2>/tmp/p12-verify.err; then
  echo "import-apple-certificate: decoded file is not a valid .p12 with this password" >&2
  cat /tmp/p12-verify.err >&2
  echo "  Re-encode from Keychain export:" >&2
  echo "    ./desktop/scripts/signing/encode-apple-certificate-for-ci.sh" >&2
  rm -f /tmp/p12-verify.err
  exit 1
fi
rm -f /tmp/p12-verify.err

# Keychain exports (RC2-40-CBC) often pass openssl -legacy but fail security import
# with "Unknown format in import". Re-export to AES-256 PKCS#12 for macOS security.
normalize_p12_for_security_import() {
  local src="$1"
  local dst="$2"
  local pass="$3"
  local err
  err="$(mktemp)"
  if openssl pkcs12 -in "$src" -passin "pass:$pass" -legacy \
    -export -out "$dst" -passout "pass:$pass" \
    -keypbe AES-256-CBC -certpbe AES-256-CBC -maciter 2>"$err"; then
    rm -f "$err"
    return 0
  fi
  if openssl pkcs12 -in "$src" -passin "pass:$pass" \
    -export -out "$dst" -passout "pass:$pass" \
    -keypbe AES-256-CBC -certpbe AES-256-CBC -maciter 2>"$err"; then
    rm -f "$err"
    return 0
  fi
  echo "import-apple-certificate: could not normalize .p12 for security import" >&2
  sed 's/^/  openssl: /' "$err" >&2
  rm -f "$err"
  return 1
}

if ! normalize_p12_for_security_import "$P12" "$P12_IMPORT" "$APPLE_CERTIFICATE_PASSWORD"; then
  exit 1
fi

KEYCHAIN="${MINIBOT_SIGNING_KEYCHAIN:-build.keychain}"
KEYCHAIN_PASSWORD="${MINIBOT_SIGNING_KEYCHAIN_PASSWORD:-$(openssl rand -base64 32)}"

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security default-keychain -s "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -t 3600 -u "$KEYCHAIN"

IMPORT_ERR="$(mktemp)"
if ! security import "$P12_IMPORT" -k "$KEYCHAIN" -P "$APPLE_CERTIFICATE_PASSWORD" \
  -f pkcs12 -A -T /usr/bin/codesign -T /usr/bin/security 2>"$IMPORT_ERR"; then
  echo "import-apple-certificate: security import failed" >&2
  cat "$IMPORT_ERR" >&2
  echo "  file(1): $(file -b "$P12_IMPORT" 2>/dev/null || echo unknown)" >&2
  echo "  If this persists, re-run encode-apple-certificate-for-ci.sh and update APPLE_CERTIFICATE." >&2
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
