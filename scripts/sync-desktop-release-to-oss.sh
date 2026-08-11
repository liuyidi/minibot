#!/usr/bin/env bash
# Download a published desktop-v* GitHub Release and publish selected
# installers to Aliyun OSS + releases.json (macOS arm+intel / Windows / Linux).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

usage() {
  cat <<'EOF'
Usage:
  scripts/sync-desktop-release-to-oss.sh --tag desktop-v1.0.0-beta.1 [--run-id 123456789] [--dry-run]

Requires: gh, ossutil, node.
OSS env: OSS_BUCKET, OSS_REGION, OSS_ENDPOINT, OSS_PUBLIC_BASE_URL,
         OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET
EOF
}

tag=""
run_id=""
dry_run=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag) tag="${2:?}"; shift 2 ;;
    --run-id) run_id="${2:?}"; shift 2 ;;
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

source_roots=()

download_workflow_artifacts() {
  [[ -n "$run_id" ]] || return 1

  local artifact_dir="$tmpdir/workflow-artifacts"
  mkdir -p "$artifact_dir"

  echo "Downloading workflow artifacts for run $run_id → $artifact_dir"
  if gh run download "$run_id" --dir "$artifact_dir"; then
    source_roots+=("$artifact_dir")
    return 0
  fi

  echo "Workflow artifacts not available for run $run_id" >&2
  return 1
}

download_release_assets() {
  local release_dir="$tmpdir/release-assets"
  mkdir -p "$release_dir"

  echo "Downloading assets for $tag → $release_dir"
  if gh release download "$tag" --dir "$release_dir" --clobber; then
    source_roots+=("$release_dir")
    return 0
  fi

  echo "Release assets not available for $tag" >&2
  return 1
}

download_workflow_artifacts || true
download_release_assets || true

if [[ ${#source_roots[@]} -eq 0 ]]; then
  echo "No workflow artifacts or release assets were available for $tag" >&2
  exit 1
fi

pick_one() {
  local preferred="$1"
  local fallback="${2:-}"
  local root match=""

  for root in "${source_roots[@]}"; do
    match="$(find "$root" -type f -name "$preferred" | head -n1)"
    if [[ -n "$match" ]]; then
      printf '%s' "$match"
      return 0
    fi
  done

  if [[ -n "$fallback" ]]; then
    for root in "${source_roots[@]}"; do
      match="$(find "$root" -type f -name "$fallback" | head -n1)"
      if [[ -n "$match" ]]; then
        printf '%s' "$match"
        return 0
      fi
    done
  fi

  printf '%s' ""
}

# Prefer explicit arch names from tauri-action (aarch64 / x64).
macos_arm_file="$(pick_one '*aarch64*.dmg' '*arm64*.dmg')"
macos_intel_file="$(pick_one '*x64*.dmg' '*x86_64*.dmg')"
# If only one unnamed .dmg exists, treat it as Apple Silicon primary.
if [[ -z "$macos_arm_file" && -z "$macos_intel_file" ]]; then
  macos_arm_file="$(pick_one '*.dmg' '')"
fi

windows_file="$(pick_one '*-setup.exe' '*.exe')"
linux_file="$(pick_one '*.deb' '*.AppImage')"
if [[ -z "$linux_file" ]]; then
  shopt -s nullglob
  rpms=("$tmpdir"/*.rpm)
  shopt -u nullglob
  if [[ ${#rpms[@]} -gt 0 ]]; then
    linux_file="${rpms[0]}"
  fi
fi

[[ -n "$windows_file" && "$windows_file" == *.sig ]] && windows_file=""

args=(--version "$version")
[[ -n "$macos_arm_file" ]] && args+=(--macos "$macos_arm_file") && echo "macOS Apple Silicon: $macos_arm_file"
[[ -n "$macos_intel_file" ]] && args+=(--macos-intel "$macos_intel_file") && echo "macOS Intel: $macos_intel_file"
[[ -n "$windows_file" ]] && args+=(--windows "$windows_file") && echo "Windows: $windows_file"
[[ -n "$linux_file" ]] && args+=(--linux "$linux_file") && echo "Linux: $linux_file"

if [[ -z "$macos_arm_file" && -z "$macos_intel_file" && -z "$windows_file" && -z "$linux_file" ]]; then
  echo "No macOS/Windows/Linux installers found in release $tag" >&2
  ls -la "$tmpdir" >&2 || true
  exit 1
fi

[[ "$dry_run" == true ]] && args+=(--dry-run)

exec "$ROOT/scripts/publish-oss-releases.sh" "${args[@]}"
