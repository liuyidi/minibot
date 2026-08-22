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
cleanup() { rm -f "$P12"; }
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

if ! openssl pkcs12 -in "$P12" -passin "pass:$APPLE_CERTIFICATE_PASSWORD" -noout 2>/tmp/p12-verify.err; then
  echo "import-apple-certificate: decoded file is not a valid .p12 with this password" >&2
  cat /tmp/p12-verify.err >&2
  echo "  Re-encode from Keychain export:" >&2
  echo "    ./desktop/scripts/signing/encode-apple-certificate-for-ci.sh" >&2
  rm -f /tmp/p12-verify.err
  exit 1
fi
rm -f /tmp/p12-verify.err

KEYCHAIN="${MINIBOT_SIGNING_KEYCHAIN:-build.keychain}"
KEYCHAIN_PASSWORD="${MINIBOT_SIGNING_KEYCHAIN_PASSWORD:-$(openssl rand -base64 32)}"

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security default-keychain -s "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -t 3600 -u "$KEYCHAIN"
security import "$P12" -k "$KEYCHAIN" -P "$APPLE_CERTIFICATE_PASSWORD" \
  -T /usr/bin/codesign -T /usr/bin/security
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN"

if [[ -n "${GITHUB_ENV:-}" ]]; then
  echo "MINIBOT_SIGNING_KEYCHAIN=$KEYCHAIN" >>"$GITHUB_ENV"
  echo "MINIBOT_SIGNING_KEYCHAIN_PASSWORD=$KEYCHAIN_PASSWORD" >>"$GITHUB_ENV"
fi

echo "import-apple-certificate: ok (keychain=$KEYCHAIN)"
