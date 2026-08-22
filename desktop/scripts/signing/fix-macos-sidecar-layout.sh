#!/usr/bin/env bash
# Restore PyInstaller symlinks after Tauri copies bundle resources (it dereferences links).
set -euo pipefail

SIDE="${1:?usage: fix-macos-sidecar-layout.sh <minibot-sidecar-dir>}"
INTERNAL="$SIDE/_internal"
FW="$INTERNAL/Python.framework"

if [[ ! -d "$FW/Versions/3.14" ]]; then
  echo "fix-macos-sidecar-layout: missing $FW/Versions/3.14" >&2
  exit 1
fi

if [[ ! -e "$FW/Versions/Current" ]]; then
  ln -sf 3.14 "$FW/Versions/Current"
fi

rm -f "$FW/Python" "$FW/Resources"
ln -sf Versions/Current/Python "$FW/Python"
ln -sf Versions/Current/Resources "$FW/Resources"

rm -f "$INTERNAL/Python"
ln -sf Python.framework/Versions/3.14/Python "$INTERNAL/Python"

echo "fix-macos-sidecar-layout: restored Python symlinks under $SIDE"
