#!/usr/bin/env bash
# Download a published desktop-v* GitHub Release and publish selected
# installers to Aliyun OSS + releases.json (macOS / Windows / Linux).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

usage() {
  cat <<'EOF'
Usage:
  scripts/sync-desktop-release-to-oss.sh --tag desktop-v1.0.0-beta.1 [--dry-run]

Requires: gh, ossutil, node.
OSS env: OSS_BUCKET, OSS_REGION, OSS_ENDPOINT, OSS_PUBLIC_BASE_URL,
         OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET
EOF
}

tag=""
dry_run=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag) tag="${2:?}"; shift 2 ;;
    --dry-run) dry_run=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ -n "$tag" ]] || { usage >&2; exit 2; }
[[ "$tag" == desktop-v* ]] || {
  echo "Expected tag matching desktop-v* (got: $tag)" >&2
  exit 2
}

version="${tag#desktop-v}"
tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/minibot-desktop-release.XXXXXX")"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

echo "Downloading assets for $tag → $tmpdir"
gh release download "$tag" --dir "$tmpdir" --clobber

pick_one() {
  local preferred="$1"
  local fallback="$2"
  local match=""
  shopt -s nullglob
  local candidates=("$tmpdir"/$preferred)
  if [[ ${#candidates[@]} -gt 0 ]]; then
    match="${candidates[0]}"
  else
    candidates=("$tmpdir"/$fallback)
    if [[ ${#candidates[@]} -gt 0 ]]; then
      match="${candidates[0]}"
    fi
  fi
  shopt -u nullglob
  printf '%s' "$match"
}

macos_file="$(pick_one '*aarch64*.dmg' '*.dmg')"
windows_file="$(pick_one '*-setup.exe' '*.exe')"
# Prefer .deb; fall back to AppImage then rpm.
linux_file="$(pick_one '*.deb' '*.AppImage')"
if [[ -z "$linux_file" ]]; then
  shopt -s nullglob
  rpms=("$tmpdir"/*.rpm)
  shopt -u nullglob
  if [[ ${#rpms[@]} -gt 0 ]]; then
    linux_file="${rpms[0]}"
  fi
fi

# Drop signature sidecars accidentally matched as primary (shouldn't with above globs).
[[ -n "$macos_file" && "$macos_file" == *.sig ]] && macos_file=""
[[ -n "$windows_file" && "$windows_file" == *.sig ]] && windows_file=""

args=(--version "$version")
[[ -n "$macos_file" ]] && args+=(--macos "$macos_file") && echo "macOS: $macos_file"
[[ -n "$windows_file" ]] && args+=(--windows "$windows_file") && echo "Windows: $windows_file"
[[ -n "$linux_file" ]] && args+=(--linux "$linux_file") && echo "Linux: $linux_file"

if [[ -z "$macos_file" && -z "$windows_file" && -z "$linux_file" ]]; then
  echo "No macOS/Windows/Linux installers found in release $tag" >&2
  ls -la "$tmpdir" >&2 || true
  exit 1
fi

[[ "$dry_run" == true ]] && args+=(--dry-run)

exec "$ROOT/scripts/publish-oss-releases.sh" "${args[@]}"
