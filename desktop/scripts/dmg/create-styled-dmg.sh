#!/usr/bin/env bash
# Build a macOS .dmg with background + Applications drop target via Tauri/create-dmg.
#
# GitHub Actions sets CI=true, which makes Tauri's bundler pass --skip-jenkins to
# create-dmg (no Finder layout → no background / icon positions). Override with
# CI=false for this step only. See create-dmg/create-dmg#72, tauri#9920.
set -euo pipefail

DESKTOP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$DESKTOP_ROOT"

APP="${1:-$DESKTOP_ROOT/src-tauri/target/release/bundle/macos/minibot.app}"
if [[ ! -d "$APP" ]]; then
  echo "create-styled-dmg: missing app bundle: $APP" >&2
  exit 1
fi

if ! codesign -dv "$APP" >/dev/null 2>&1; then
  echo "create-styled-dmg: app is not codesigned: $APP" >&2
  exit 1
fi

CARGO_TARGET_DIR="$DESKTOP_ROOT/src-tauri/target"
export CARGO_TARGET_DIR

echo "==> Styled DMG via Tauri bundle (CI=false for create-dmg Finder layout)"
# Keep GITHUB_ACTIONS so other tooling still knows it is CI; only CI affects skip-jenkins.
CI=false npm run tauri -- bundle --bundles dmg

DMG_DIR="$CARGO_TARGET_DIR/release/bundle/dmg"
shopt -s nullglob
dmgs=("$DMG_DIR"/*.dmg)
if [[ ${#dmgs[@]} -eq 0 ]]; then
  echo "create-styled-dmg: no .dmg under $DMG_DIR" >&2
  exit 1
fi

VERSION="$(node -p "require('$DESKTOP_ROOT/package.json').version")"
machine="$(uname -m)"
case "$machine" in
  arm64) ARCH_TAG=aarch64 ;;
  x86_64) ARCH_TAG=x64 ;;
  *) ARCH_TAG="$machine" ;;
esac
CANON="$DMG_DIR/minibot_${VERSION}_${ARCH_TAG}.dmg"

# Tauri names vary by version; normalize for release upload scripts.
if [[ "${dmgs[0]}" != "$CANON" ]]; then
  rm -f "$CANON"
  cp -f "${dmgs[0]}" "$CANON"
fi

echo "    DMG: $CANON"
if xcrun stapler validate "$CANON" 2>/dev/null; then
  echo "    stapler: DMG ticket present"
elif xcrun stapler staple "$CANON" 2>/dev/null; then
  xcrun stapler validate "$CANON" 2>/dev/null || true
else
  echo "    注意：DMG 本身未 staple（常见）；.app 内已公证即可"
fi
