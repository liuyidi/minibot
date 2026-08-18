#!/usr/bin/env bash
# Freeze minibot as an onedir sidecar for desktop bundling.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TRIPLE="${1:-}"
if [[ -z "$TRIPLE" ]]; then
  if command -v rustc >/dev/null 2>&1; then
    TRIPLE="$(rustc -Vv | awk '/^host:/{print $2}')"
  else
    TRIPLE="$(uname -m)-apple-darwin"
  fi
fi

OUT="$ROOT/dist/sidecar/$TRIPLE"
SPEC="$ROOT/minibot/packaging/pyinstaller/minibot-sidecar.spec"

echo "freeze-minibot-sidecar: triple=$TRIPLE"
echo "freeze-minibot-sidecar: out=$OUT"

echo "freeze-minibot-sidecar: building webui dist…"
(cd "$ROOT/webui" && npm run build)

mkdir -p "$OUT"
cd "$ROOT/minibot"
# Prefer --no-sync so freeze does not rewrite a locked local .venv (sandbox-hostile).
# Keep PyInstaller cache inside the repo (CI / sandboxes cannot write ~/Library).
export PYINSTALLER_CONFIG_DIR="${PYINSTALLER_CONFIG_DIR:-$OUT/pyi-cache}"
mkdir -p "$PYINSTALLER_CONFIG_DIR"
uv run --no-sync --with pyinstaller pyinstaller \
  --noconfirm \
  --clean \
  --distpath "$OUT" \
  --workpath "$OUT/pyi-work" \
  "$SPEC"

LAUNCHER="$OUT/minibot-sidecar/minibot-sidecar"
if [[ -f "${LAUNCHER}.exe" ]]; then
  LAUNCHER="${LAUNCHER}.exe"
fi
if [[ ! -f "$LAUNCHER" ]]; then
  echo "freeze-minibot-sidecar: missing launcher at $OUT/minibot-sidecar/" >&2
  ls -la "$OUT" || true
  ls -la "$OUT/minibot-sidecar" 2>/dev/null || true
  exit 1
fi

echo "freeze-minibot-sidecar: ok → $LAUNCHER"
