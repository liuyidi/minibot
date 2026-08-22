#!/usr/bin/env bash
# Restore PyInstaller symlinks after Tauri copies bundle resources (it dereferences links).
set -euo pipefail

SIDE="${1:?usage: fix-macos-sidecar-layout.sh <minibot-sidecar-dir>}"
INTERNAL="$SIDE/_internal"
FW="$INTERNAL/Python.framework"

if [[ ! -d "$FW/Versions" ]]; then
  echo "fix-macos-sidecar-layout: missing $FW/Versions" >&2
  exit 1
fi

PY_VERSION=""
for d in "$FW/Versions"/*; do
  [[ -d "$d" ]] || continue
  base="$(basename "$d")"
  [[ "$base" == "Current" ]] && continue
  if [[ -f "$d/Python" ]]; then
    PY_VERSION="$base"
    break
  fi
done

if [[ -z "$PY_VERSION" ]]; then
  echo "fix-macos-sidecar-layout: no Python version dir under $FW/Versions" >&2
  ls -la "$FW/Versions" >&2 || true
  exit 1
fi

if [[ ! -e "$FW/Versions/Current" ]]; then
  ln -sf "$PY_VERSION" "$FW/Versions/Current"
fi

rm -f "$FW/Python" "$FW/Resources"
ln -sf Versions/Current/Python "$FW/Python"
ln -sf Versions/Current/Resources "$FW/Resources"

rm -f "$INTERNAL/Python"
ln -sf "Python.framework/Versions/$PY_VERSION/Python" "$INTERNAL/Python"

echo "fix-macos-sidecar-layout: restored Python $PY_VERSION symlinks under $SIDE"
