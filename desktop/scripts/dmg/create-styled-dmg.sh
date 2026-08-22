#!/usr/bin/env bash
# Build a styled macOS .dmg from an already-signed (and usually notarized) .app.
#
# Does NOT call `tauri bundle --bundles dmg` — that re-signs the bundle and can
# trigger a second notarization pass that breaks PyInstaller sidecar signatures.
# Uses create-dmg directly with layout from src-tauri/tauri.conf.json.
set -euo pipefail

DESKTOP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TAURI_DIR="$DESKTOP_ROOT/src-tauri"
CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$TAURI_DIR/target}"

APP="${1:-$CARGO_TARGET_DIR/release/bundle/macos/minibot.app}"
if [[ ! -d "$APP" ]]; then
  echo "create-styled-dmg: missing app bundle: $APP" >&2
  exit 1
fi

if ! codesign -dv "$APP" >/dev/null 2>&1; then
  echo "create-styled-dmg: app is not codesigned: $APP" >&2
  exit 1
fi

APP_NAME="$(basename "$APP")"
BACKGROUND="$TAURI_DIR/dmg/background.png"
if [[ ! -f "$BACKGROUND" ]]; then
  echo "create-styled-dmg: missing background: $BACKGROUND" >&2
  exit 1
fi

# Matches bundle.macOS.dmg in tauri.conf.json
WINDOW_W=660
WINDOW_H=400
APP_X=180
APP_Y=170
DROP_X=480
DROP_Y=170
ICON_SIZE=128

resolve_create_dmg() {
  if [[ -n "${CREATE_DMG:-}" && -x "$CREATE_DMG" ]]; then
    return 0
  fi
  if command -v create-dmg >/dev/null 2>&1; then
    CREATE_DMG="$(command -v create-dmg)"
    return 0
  fi
  local cache="$CARGO_TARGET_DIR/create-dmg/create-dmg"
  if [[ -x "$cache" ]]; then
    CREATE_DMG="$cache"
    return 0
  fi
  mkdir -p "$(dirname "$cache")"
  echo "create-styled-dmg: fetching create-dmg → $cache"
  curl -fsSL "https://raw.githubusercontent.com/create-dmg/create-dmg/master/create-dmg" -o "$cache"
  chmod +x "$cache"
  CREATE_DMG="$cache"
}

resolve_create_dmg

VERSION="$(node -p "require('$DESKTOP_ROOT/package.json').version")"
machine="$(uname -m)"
case "$machine" in
  arm64) ARCH_TAG=aarch64 ;;
  x86_64) ARCH_TAG=x64 ;;
  *) ARCH_TAG="$machine" ;;
esac

DMG_DIR="$CARGO_TARGET_DIR/release/bundle/dmg"
mkdir -p "$DMG_DIR"
CANON="$DMG_DIR/minibot_${VERSION}_${ARCH_TAG}.dmg"
VOLNAME="minibot ${VERSION}"

STAGE="$(mktemp -d -t minibot-dmg-stage.XXXXXX)"
cleanup_stage() { rm -rf "$STAGE"; }
trap cleanup_stage EXIT

echo "==> Stage app for create-dmg (does not modify source bundle)"
ditto "$APP" "$STAGE/$APP_NAME"

rm -f "$CANON"
echo "==> Styled DMG via create-dmg (no Tauri re-sign / re-notarize)"
"$CREATE_DMG" \
  --volname "$VOLNAME" \
  --background "$BACKGROUND" \
  --window-size "$WINDOW_W" "$WINDOW_H" \
  --icon-size "$ICON_SIZE" \
  --icon "$APP_NAME" "$APP_X" "$APP_Y" \
  --hide-extension "$APP_NAME" \
  --app-drop-link "$DROP_X" "$DROP_Y" \
  --no-internet-enable \
  "$CANON" \
  "$STAGE/"

echo "    DMG: $CANON"
if xcrun stapler validate "$CANON" 2>/dev/null; then
  echo "    stapler: DMG ticket present"
elif xcrun stapler staple "$CANON" 2>/dev/null; then
  xcrun stapler validate "$CANON" 2>/dev/null || true
else
  echo "    注意：DMG 未 staple（常见）；.app 内已公证即可"
fi
