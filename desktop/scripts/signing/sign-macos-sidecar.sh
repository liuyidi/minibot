#!/usr/bin/env bash
# Sign Mach-O binaries inside a PyInstaller onedir (resources or bundled .app).
set -euo pipefail

DESKTOP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SIGNING_DIR="$(cd "$(dirname "$0")" && pwd)"
SIDE="${1:-$DESKTOP_ROOT/src-tauri/resources/minibot-sidecar}"
ENTITLEMENTS="$SIGNING_DIR/entitlements.sidecar.plist"

if [[ ! -d "$SIDE" ]]; then
  echo "sign-macos-sidecar: missing $SIDE" >&2
  exit 1
fi

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "sign-macos-sidecar: set APPLE_SIGNING_IDENTITY" >&2
  exit 1
fi

SIGN_KEYCHAIN="${MINIBOT_SIGNING_KEYCHAIN:-}"
CS_BASE=(--force --options runtime --timestamp --sign "$APPLE_SIGNING_IDENTITY")
if [[ -n "$SIGN_KEYCHAIN" ]]; then
  CS_BASE+=(--keychain "$SIGN_KEYCHAIN")
fi

sign_one() {
  local f="$1"
  shift
  local args=("$@")
  local attempt
  for attempt in 1 2 3 4 5; do
    if codesign "${args[@]}" "$f"; then
      return 0
    fi
    sleep "$attempt"
  done
  echo "sign-macos-sidecar: failed to sign $f" >&2
  return 1
}

FILES=()
while IFS= read -r f; do
  FILES+=("$f")
done < <(
  find "$SIDE" -type f -print0 |
    xargs -0 file |
    awk -F: '/Mach-O/ { print $1 }' |
    grep -v '/Python\.framework/' |
    awk '{ print length, $0 }' |
    sort -rn |
    cut -d' ' -f2-
)

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "sign-macos-sidecar: no loose Mach-O files under $SIDE" >&2
  exit 1
fi

echo "sign-macos-sidecar: signing ${#FILES[@]} Mach-O files (excluding Python.framework)"
for f in "${FILES[@]}"; do
  args=("${CS_BASE[@]}")
  if [[ "$(basename "$f")" == "minibot-sidecar" ]]; then
    args+=(--entitlements "$ENTITLEMENTS")
  fi
  sign_one "$f" "${args[@]}"
done

FW="$SIDE/_internal/Python.framework"
if [[ -d "$FW" ]]; then
  while IFS= read -r py; do
    [[ -z "$py" ]] && continue
    echo "sign-macos-sidecar: signing framework binary $py"
    sign_one "$py" "${CS_BASE[@]}"
  done < <(find "$FW/Versions" -type f -path '*/Python' 2>/dev/null || true)
  echo "sign-macos-sidecar: signing framework bundle $FW"
  sign_one "$FW" "${CS_BASE[@]}"
fi

echo "sign-macos-sidecar: ok → $SIDE"
