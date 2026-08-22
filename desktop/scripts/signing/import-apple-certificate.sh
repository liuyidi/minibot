#!/usr/bin/env bash
# Import Developer ID .p12 into a temporary keychain (CI or local).
# Requires: APPLE_CERTIFICATE (base64 .p12, single line), APPLE_CERTIFICATE_PASSWORD
set -euo pipefail

if [[ -z "${APPLE_CERTIFICATE:-}" ]]; then
  echo "import-apple-certificate: APPLE_CERTIFICATE is empty" >&2
  echo "  GitHub secret = one-line base64 of exported .p12:" >&2
  echo "    base64 -i cert.p12 | tr -d '\\n' | pbcopy" >&2
  exit 1
fi

if [[ -z "${APPLE_CERTIFICATE_PASSWORD:-}" ]]; then
  echo "import-apple-certificate: APPLE_CERTIFICATE_PASSWORD is empty" >&2
  exit 1
fi

CERT_B64="$(printf '%s' "$APPLE_CERTIFICATE" | tr -d '[:space:]')"
if [[ ${#CERT_B64} -lt 100 ]]; then
  echo "import-apple-certificate: APPLE_CERTIFICATE too short (${#CERT_B64} chars)" >&2
  echo "  Expected base64 .p12 content, not a file path or PEM text." >&2
  exit 1
fi

P12="$(mktemp -t minibot-cert.XXXXXX.p12)"
cleanup() { rm -f "$P12"; }
trap cleanup EXIT

if [[ "$(uname -s)" == "Darwin" ]]; then
  printf '%s' "$CERT_B64" | base64 -D >"$P12"
else
  printf '%s' "$CERT_B64" | base64 -d >"$P12"
fi

if [[ ! -s "$P12" ]]; then
  echo "import-apple-certificate: base64 decode produced empty file" >&2
  exit 1
fi

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
