#!/usr/bin/env bash
# Register minibot:// with Launch Services using a debug/release .app bundle.
# Required on macOS: tauri:dev alone does NOT register custom URL schemes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$ROOT/src-tauri/target}"
APP="$CARGO_TARGET_DIR/debug/bundle/macos/minibot V2.app"
if [[ ! -d "$APP" ]]; then
  echo "Building debug .app…"
  cd "$ROOT"
  ./node_modules/.bin/tauri build --debug --bundles app
fi
LSREG="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
xattr -cr "$APP" || true
codesign --force --deep --sign - "$APP" || true
"$LSREG" -f "$APP"
echo "Registered: $APP"
echo "Test: open 'minibot://auth/done'"
open "minibot://auth/done" || true
