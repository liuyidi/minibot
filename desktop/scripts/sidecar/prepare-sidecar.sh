#!/usr/bin/env bash
# Copy PyInstaller onedir into src-tauri/resources for Tauri bundling.
set -euo pipefail

DESKTOP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REPO_ROOT="$(cd "$DESKTOP_ROOT/.." && pwd)"
TRIPLE="${1:-}"
if [[ -z "$TRIPLE" ]]; then
  if command -v rustc >/dev/null 2>&1; then
    TRIPLE="$(rustc -Vv | awk '/^host:/{print $2}')"
  else
    TRIPLE="$(uname -m)-apple-darwin"
  fi
fi

SRC="$REPO_ROOT/dist/sidecar/$TRIPLE/minibot-sidecar"
DEST="$DESKTOP_ROOT/src-tauri/resources/minibot-sidecar"

if [[ ! -d "$SRC" ]]; then
  echo "prepare-sidecar: missing freeze output at $SRC" >&2
  echo "prepare-sidecar: run: $REPO_ROOT/scripts/freeze-minibot-sidecar.sh $TRIPLE" >&2
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
mkdir -p "$DEST"
# Copy contents (not the directory node) so DEST is always …/resources/minibot-sidecar/
# with launcher + _internal/ directly underneath (avoids nested cp quirks on Git Bash).
cp -R "$SRC"/. "$DEST"/
chmod +x "$DEST/minibot-sidecar" "$DEST/minibot-sidecar.exe" 2>/dev/null || true

if [[ ! -f "$DEST/minibot-sidecar" && ! -f "$DEST/minibot-sidecar.exe" ]]; then
  echo "prepare-sidecar: copy failed; no launcher under $DEST" >&2
  ls -la "$DEST" || true
  exit 1
fi

echo "prepare-sidecar: ok → $DEST (triple=$TRIPLE)"
