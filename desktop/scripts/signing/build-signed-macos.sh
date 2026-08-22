#!/usr/bin/env bash
# Signed + notarized macOS build. Run from repo root or desktop/ in Terminal.app
# (not Cursor agent — codesign needs interactive Keychain access).
set -euo pipefail

DESKTOP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SIGNING_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SIGNING_DIR/apple-signing.env"
TRIPLE="${1:-$(uname -m)-apple-darwin}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a && source "$ENV_FILE" && set +a
elif [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "Missing $ENV_FILE — copy from apple-signing.env.example, or export APPLE_* in env (CI)" >&2
  exit 1
fi

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" || -z "${APPLE_TEAM_ID:-}" || -z "${APPLE_ID:-}" || -z "${APPLE_PASSWORD:-}" ]]; then
  echo "apple-signing.env must set APPLE_SIGNING_IDENTITY, APPLE_TEAM_ID, APPLE_ID, APPLE_PASSWORD" >&2
  exit 1
fi

SIGN_KEYCHAIN="${MINIBOT_SIGNING_KEYCHAIN:-}"
CS_ARGS=(--sign "$APPLE_SIGNING_IDENTITY" --force --timestamp --options runtime)
if [[ -n "$SIGN_KEYCHAIN" ]]; then
  CS_ARGS+=(--keychain "$SIGN_KEYCHAIN")
fi

echo "==> Preflight: codesign can use Developer ID identity"
TEST_BIN="$(mktemp /tmp/minibot-codesign-test.XXXXXX)"
chmod +x "$TEST_BIN"
if ! codesign "${CS_ARGS[@]}" "$TEST_BIN" 2>/tmp/minibot-codesign-test.err; then
  echo "codesign preflight failed (errSecInternalComponent = private key ACL or broken cert import)." >&2
  echo "Re-import the Developer ID certificate in Keychain Access and allow codesign access." >&2
  cat /tmp/minibot-codesign-test.err >&2
  rm -f "$TEST_BIN" /tmp/minibot-codesign-test.err
  exit 1
fi
rm -f "$TEST_BIN" /tmp/minibot-codesign-test.err
echo "    codesign OK"

echo "==> Prepare sidecar ($TRIPLE)"
"$DESKTOP_ROOT/scripts/sidecar/prepare-sidecar.sh" "$TRIPLE"

echo "==> Build app bundle (sign shell only; defer notarization until sidecar is fixed)"
cd "$DESKTOP_ROOT"
export CARGO_TARGET_DIR="$DESKTOP_ROOT/src-tauri/target"
if [[ "${GITHUB_ACTIONS:-}" != "true" ]]; then
  unset APPLE_CERTIFICATE
fi

NOTARY_APPLE_ID="$APPLE_ID"
NOTARY_PASSWORD="$APPLE_PASSWORD"
NOTARY_TEAM_ID="$APPLE_TEAM_ID"
unset APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID

npm run build:app

APP="$CARGO_TARGET_DIR/release/bundle/macos/minibot.app"
SIDE="$APP/Contents/Resources/minibot-sidecar"

echo "==> Fix sidecar layout (Tauri dereferences Python symlinks)"
"$SIGNING_DIR/fix-macos-sidecar-layout.sh" "$SIDE"

echo "==> Sign sidecar Mach-O inside bundled .app"
export APPLE_SIGNING_IDENTITY
"$SIGNING_DIR/sign-macos-sidecar.sh" "$SIDE"

echo "==> Re-sign app executable + bundle"
codesign "${CS_ARGS[@]}" "$APP/Contents/MacOS/minibot-desktop"
codesign "${CS_ARGS[@]}" "$APP"

echo "==> Notarize (with progress UI)"
"$SIGNING_DIR/notarize-macos-app.sh" "$APP" --dmg

DMG_DIR="$CARGO_TARGET_DIR/release/bundle/dmg"
VERSION="$(node -p "require('$DESKTOP_ROOT/package.json').version")"
case "$TRIPLE" in
  aarch64-apple-darwin) ARCH_TAG=aarch64 ;;
  x86_64-apple-darwin) ARCH_TAG=x64 ;;
  *) ARCH_TAG="$(uname -m)" ;;
esac
DMG_PATH="$DMG_DIR/minibot_${VERSION}_${ARCH_TAG}.dmg"
echo
echo "==> Verify"
codesign -dv --verbose=2 "$APP" 2>&1 | head -8
spctl -a -vv -t execute "$APP" 2>&1 || true
xcrun stapler validate "$APP" 2>&1 || true
if [[ -f "${DMG_PATH:-}" ]]; then
  xcrun stapler validate "$DMG_PATH" 2>&1 || true
fi
echo
echo "Done. Pickup: $CARGO_TARGET_DIR/release/bundle/"
