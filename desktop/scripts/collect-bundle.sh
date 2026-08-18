#!/usr/bin/env bash
# Copy Tauri release bundles into dist-bundle/ for easy pickup.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist-bundle"
TARGET="${CARGO_TARGET_DIR:-$ROOT/src-tauri/target}"
BUNDLE="$TARGET/release/bundle"
# Must match tauri.conf.json productName (space included).
APP_NAME="${MINIBOT_BUNDLE_APP_NAME:-minibot V2}"

if [[ ! -d "$BUNDLE" ]]; then
  echo "collect-bundle: missing $BUNDLE (run tauri build first)" >&2
  exit 1
fi

mkdir -p "$OUT"
# Clear previous minibot artifacts only (leave unrelated files alone if any).
rm -rf "$OUT/${APP_NAME}.app" "$OUT/${APP_NAME}_"*.dmg
# Drop stale leftover apps from older product names if present.
rm -rf "$OUT/nanobot.app"

copied=0
if [[ -d "$BUNDLE/macos/${APP_NAME}.app" ]]; then
  cp -R "$BUNDLE/macos/${APP_NAME}.app" "$OUT/"
  copied=1
fi
shopt -s nullglob
dmgs=("$BUNDLE/dmg/${APP_NAME}_"*.dmg)
shopt -u nullglob
if [[ ${#dmgs[@]} -gt 0 ]]; then
  cp -f "${dmgs[@]}" "$OUT/"
  copied=1
fi

if [[ "$copied" -eq 0 ]]; then
  echo "collect-bundle: no ${APP_NAME}.app or .dmg under $BUNDLE" >&2
  exit 1
fi

echo "collect-bundle: wrote $OUT"
ls -lah "$OUT"
