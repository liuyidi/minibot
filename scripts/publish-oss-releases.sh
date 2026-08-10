#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  source scripts/oss-release.env
  export OSS_ACCESS_KEY_ID=... OSS_ACCESS_KEY_SECRET=...
  scripts/publish-oss-releases.sh --version 1.0.4 \
    [--android /path/app.apk] \
    [--macos /path/arm64.dmg] [--macos-intel /path/x64.dmg] \
    [--windows /path/setup.exe] [--linux /path/app.deb] [--dry-run]

Required environment: OSS_BUCKET, OSS_REGION, OSS_ENDPOINT, OSS_PUBLIC_BASE_URL.
Optional environment: OSS_PREFIX=minibot, OSS_OBJECT_ACL=public-read.
EOF
}

version=""
android_file=""
macos_file=""
macos_intel_file=""
windows_file=""
linux_file=""
dry_run=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) version="${2:?missing value for --version}"; shift 2 ;;
    --android) android_file="${2:?missing value for --android}"; shift 2 ;;
    --macos) macos_file="${2:?missing value for --macos}"; shift 2 ;;
    --macos-intel) macos_intel_file="${2:?missing value for --macos-intel}"; shift 2 ;;
    --windows) windows_file="${2:?missing value for --windows}"; shift 2 ;;
    --linux) linux_file="${2:?missing value for --linux}"; shift 2 ;;
    --dry-run) dry_run=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

for name in OSS_BUCKET OSS_REGION OSS_ENDPOINT OSS_PUBLIC_BASE_URL; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 2
  fi
done

if [[ -z "$version" || (-z "$android_file" && -z "$macos_file" && -z "$macos_intel_file" && -z "$windows_file" && -z "$linux_file") ]]; then
  usage >&2
  exit 2
fi

if [[ "$dry_run" != true ]] && ! command -v ossutil >/dev/null 2>&1; then
  echo "ossutil is required. Install/configure it first: https://help.aliyun.com/zh/oss/developer-reference/ossutil-overview/" >&2
  exit 1
fi

prefix="${OSS_PREFIX:-minibot}"
object_acl="${OSS_OBJECT_ACL:-public-read}"
manifest="webui/public/releases.json"

upload() {
  local source="$1" object="$2"
  local command=(ossutil cp "$source" "oss://${OSS_BUCKET}/${object}" --region "$OSS_REGION" --endpoint "$OSS_ENDPOINT" --acl "$object_acl" --meta "Cache-Control:public,max-age=31536000,immutable")
  printf 'Uploading %s -> oss://%s/%s\n' "$source" "$OSS_BUCKET" "$object"
  if [[ "$dry_run" == true ]]; then
    printf 'DRY RUN:'; printf ' %q' "${command[@]}"; printf '\n'
  else
    "${command[@]}"
  fi
}

android_name=""
macos_name=""
macos_intel_name=""
windows_name=""
linux_name=""
android_size=""
macos_size=""
macos_intel_size=""
windows_size=""
linux_size=""

if [[ -n "$android_file" ]]; then
  [[ -f "$android_file" && "$android_file" == *.apk ]] || { echo "--android must be an APK file" >&2; exit 2; }
  android_name="minibot-android-v${version}.apk"
  android_size="$(du -h "$android_file" | awk '{print $1}')"
  upload "$android_file" "${prefix}/android/${android_name}"
fi

if [[ -n "$macos_file" ]]; then
  [[ -f "$macos_file" && "$macos_file" == *.dmg ]] || { echo "--macos must be a .dmg file, not a .app directory" >&2; exit 2; }
  macos_name="minibot-${version}-$(basename "$macos_file")"
  macos_size="$(du -h "$macos_file" | awk '{print $1}')"
  upload "$macos_file" "${prefix}/macos/${macos_name}"
fi

if [[ -n "$macos_intel_file" ]]; then
  [[ -f "$macos_intel_file" && "$macos_intel_file" == *.dmg ]] || {
    echo "--macos-intel must be a .dmg file, not a .app directory" >&2
    exit 2
  }
  macos_intel_name="minibot-${version}-$(basename "$macos_intel_file")"
  macos_intel_size="$(du -h "$macos_intel_file" | awk '{print $1}')"
  upload "$macos_intel_file" "${prefix}/macos/${macos_intel_name}"
fi

if [[ -n "$windows_file" ]]; then
  [[ -f "$windows_file" && ( "$windows_file" == *.exe || "$windows_file" == *.msi ) ]] || {
    echo "--windows must be a .exe or .msi installer" >&2
    exit 2
  }
  windows_name="minibot-${version}-$(basename "$windows_file")"
  windows_size="$(du -h "$windows_file" | awk '{print $1}')"
  upload "$windows_file" "${prefix}/windows/${windows_name}"
fi

if [[ -n "$linux_file" ]]; then
  [[ -f "$linux_file" && ( "$linux_file" == *.deb || "$linux_file" == *.AppImage || "$linux_file" == *.rpm ) ]] || {
    echo "--linux must be a .deb, .AppImage, or .rpm file" >&2
    exit 2
  }
  linux_name="minibot-${version}-$(basename "$linux_file")"
  linux_size="$(du -h "$linux_file" | awk '{print $1}')"
  upload "$linux_file" "${prefix}/linux/${linux_name}"
fi

manifest_command=(node scripts/update-oss-release-manifest.mjs --manifest "$manifest" --public-base-url "$OSS_PUBLIC_BASE_URL" --prefix "$prefix")
[[ -n "$android_name" ]] && manifest_command+=(--android "$android_name" --android-version "$version" --android-size "$android_size")
[[ -n "$macos_name" ]] && manifest_command+=(--macos "$macos_name" --macos-version "$version" --macos-size "$macos_size")
[[ -n "$macos_intel_name" ]] && manifest_command+=(--macos-intel "$macos_intel_name" --macos-intel-version "$version" --macos-intel-size "$macos_intel_size")
[[ -n "$windows_name" ]] && manifest_command+=(--windows "$windows_name" --windows-version "$version" --windows-size "$windows_size")
[[ -n "$linux_name" ]] && manifest_command+=(--linux "$linux_name" --linux-version "$version" --linux-size "$linux_size")

if [[ "$dry_run" == true ]]; then
  printf 'DRY RUN:'; printf ' %q' "${manifest_command[@]}"; printf '\n'
  echo "DRY RUN: would upload ${manifest} -> oss://${OSS_BUCKET}/${prefix}/releases.json"
  exit 0
fi

"${manifest_command[@]}"
ossutil cp "$manifest" "oss://${OSS_BUCKET}/${prefix}/releases.json" --region "$OSS_REGION" --endpoint "$OSS_ENDPOINT" --acl "$object_acl" --meta "Cache-Control:no-cache"

echo "Published ${prefix}/releases.json. Configure VITE_MINIBOT_RELEASES_URL=${OSS_PUBLIC_BASE_URL%/}/${prefix}/releases.json for the WebUI build."
