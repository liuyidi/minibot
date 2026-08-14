#!/usr/bin/env bash
# Copy PyInstaller onedir into src-tauri/resources for Tauri bundling.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
TRIPLE="${1:-}"
if [[ -z "$TRIPLE" ]]; then
  if command -v rustc >/dev/null 2>&1; then
    TRIPLE="$(rustc -Vv | awk '/^host:/{print $2}')"
  else
    TRIPLE="$(uname -m)-apple-darwin"
  fi
fi

SRC="$REPO/dist/sidecar/$TRIPLE/minibot-sidecar"
DEST="$ROOT/src-tauri/resources/minibot-sidecar"

if [[ ! -d "$SRC" ]]; then
  echo "prepare-sidecar: missing freeze output at $SRC" >&2
  echo "prepare-sidecar: run: $REPO/scripts/freeze-minibot-sidecar.sh $TRIPLE" >&2
  exit 1
fi

LAUNCHER="$SRC/minibot-sidecar"
if [[ -f "${LAUNCHER}.exe" ]]; then
  LAUNCHER="${LAUNCHER}.exe"
fi
if [[ ! -f "$LAUNCHER" ]]; then
  echo "prepare-sidecar: missing launcher under $SRC" >&2
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
cp -R "$SRC" "$DEST"
chmod +x "$DEST/minibot-sidecar" "$DEST/minibot-sidecar.exe" 2>/dev/null || true

echo "prepare-sidecar: ok → $DEST (triple=$TRIPLE)"
