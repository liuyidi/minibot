#!/usr/bin/env bash
# Submit a signed .app to Apple notarization with live status + progress UI.
# Usage:
#   source scripts/signing/apple-signing.env   # or let this script load it
#   ./scripts/signing/notarize-macos-app.sh path/to/minibot.app [--dmg]
set -euo pipefail

DESKTOP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SIGNING_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SIGNING_DIR/apple-signing.env"

MAKE_DMG=false
APP=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dmg) MAKE_DMG=true; shift ;;
    -h|--help)
      echo "usage: notarize-macos-app.sh <minibot.app> [--dmg]"
      exit 0
      ;;
    *)
      if [[ -z "$APP" ]]; then
        APP="$1"
      else
        echo "unknown argument: $1" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ -z "$APP" ]]; then
  echo "usage: notarize-macos-app.sh <minibot.app> [--dmg]" >&2
  exit 1
fi

if [[ ! -d "$APP" ]]; then
  echo "notarize-macos-app: missing app bundle: $APP" >&2
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a && source "$ENV_FILE" && set +a
fi

for var in APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
  if [[ -z "${!var:-}" ]]; then
    echo "notarize-macos-app: set $var in $ENV_FILE" >&2
    exit 1
  fi
done

NOTARY_ARGS=(--apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID")
NOTARY_TIMEOUT_SEC="${MINIBOT_NOTARIZE_TIMEOUT_SEC:-1800}"

TIPS=(
  "Apple 正在扫描 app 内所有 Mach-O（含 PyInstaller sidecar，约 100+ 个）"
  "状态 In Progress 表示正常排队/审核，不是卡死"
  "CI 默认 ${NOTARY_TIMEOUT_SEC}s 超时；含 Python 运行时常见 5–20 分钟"
  "请勿关闭终端或 Ctrl+C；中断后需重新上传 zip"
  "审核通过后脚本会自动 staple 公证票到 .app"
  "若失败会拉取 notarytool log，便于定位未签名二进制"
)

format_elapsed() {
  local s="$1"
  printf '%02d:%02d' $((s / 60)) $((s % 60))
}

fake_percent() {
  local s="$1"
  local cap="${NOTARY_TIMEOUT_SEC:-1800}"
  local pct=$((s * 100 / cap))
  if (( pct > 95 )); then
    pct=95
  fi
  echo "$pct"
}

draw_bar() {
  local pct="$1"
  local width=24
  local filled=$((pct * width / 100))
  local bar=""
  local i
  for ((i = 0; i < width; i++)); do
    if ((i < filled)); then
      bar+="#"
    else
      bar+="-"
    fi
  done
  printf '[%s]' "$bar"
}

notary_info_status() {
  local id="$1"
  xcrun notarytool info "$id" \
    "${NOTARY_ARGS[@]}" \
    --output-format json 2>/dev/null |
    python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("status",""))'
}

notary_info_created() {
  local id="$1"
  xcrun notarytool info "$id" \
    "${NOTARY_ARGS[@]}" \
    --output-format json 2>/dev/null |
    python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("createdDate",""))'
}

ZIP="$(mktemp -t minibot-notarize.XXXXXX.zip)"
LOG_DIR="$DESKTOP_ROOT/src-tauri/target/notarization-logs"
mkdir -p "$LOG_DIR"

cleanup() {
  rm -f "$ZIP"
}
trap cleanup EXIT

echo "==> 打包上传 zip（ditto）"
ditto -c -k --keepParent "$APP" "$ZIP"
ZIP_MB="$(du -m "$ZIP" | awk '{print $1}')"
echo "    zip ≈ ${ZIP_MB} MB → Apple notaryservice"

spinner_until() {
  local pid="$1"
  local label="$2"
  local start elapsed
  start=$(date +%s)
  while kill -0 "$pid" 2>/dev/null; do
    elapsed=$(( $(date +%s) - start ))
    printf '\r\033[K    %s ⏱ %02d:%02d' "$label" $((elapsed / 60)) $((elapsed % 60))
    sleep 1
  done
  printf '\r\033[K'
}

echo "==> 提交公证"
echo "    正在上传 ${ZIP_MB} MB 到 Apple notaryservice（通常 1–5 分钟，此阶段无百分比）"

SUBMIT_OUT="$(mktemp -t minibot-submit-out.XXXXXX)"
SUBMIT_ERR="$(mktemp -t minibot-submit-err.XXXXXX)"
(
  xcrun notarytool submit "$ZIP" \
    "${NOTARY_ARGS[@]}" \
    --output-format json >"$SUBMIT_OUT" 2>"$SUBMIT_ERR"
) &
SUBMIT_PID=$!

spinner_until "$SUBMIT_PID" "上传 zip 中…"

if ! wait "$SUBMIT_PID"; then
  echo "submit failed:" >&2
  cat "$SUBMIT_ERR" >&2
  rm -f "$SUBMIT_OUT" "$SUBMIT_ERR"
  exit 1
fi
rm -f "$SUBMIT_ERR"

SUBMIT_JSON="$(cat "$SUBMIT_OUT")"
rm -f "$SUBMIT_OUT"
SUBMISSION_ID="$(printf '%s' "$SUBMIT_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("id",""))')"
if [[ -z "$SUBMISSION_ID" ]]; then
  echo "submit failed:" >&2
  printf '%s\n' "$SUBMIT_JSON" >&2
  exit 1
fi

notarization_ready() {
  spctl -a -vv -t execute "$APP" 2>&1 | grep -q 'source=Notarized Developer ID'
}

staple_if_ready() {
  if xcrun stapler validate "$APP" >/dev/null 2>&1; then
    return 0
  fi
  xcrun stapler staple "$APP" >/dev/null 2>&1 && xcrun stapler validate "$APP" >/dev/null 2>&1
}

echo "    上传完成"
echo "    submission id: $SUBMISSION_ID"
echo "    轮询审核状态（约每 15s 刷新；进度条为预估；超时 ${NOTARY_TIMEOUT_SEC}s）"
echo "    提示：Apple API 偶发长期 In Progress，但 Gatekeeper 已认可时会自动完成 staple"
echo

START_TS=$(date +%s)
TIP_IDX=0
LAST_STATUS=""

while true; do
  NOW=$(date +%s)
  ELAPSED=$((NOW - START_TS))
  STATUS="$(notary_info_status "$SUBMISSION_ID" || echo "Unknown")"
  PCT="$(fake_percent "$ELAPSED")"
  TIP="${TIPS[$TIP_IDX]}"
  if (( ELAPSED > 0 && ELAPSED % 45 == 0 )); then
    TIP_IDX=$(( (TIP_IDX + 1) % ${#TIPS[@]} ))
  fi

  printf '\r\033[K%s %3d%%  ⏱ %s  │  %s  │  %s' \
    "$(draw_bar "$PCT")" \
    "$PCT" \
    "$(format_elapsed "$ELAPSED")" \
    "$STATUS" \
    "$TIP"

  case "$STATUS" in
    Accepted)
      echo
      echo
      echo "✅ 公证通过 (Accepted)"
      break
      ;;
    Invalid|Rejected)
      echo
      echo
      echo "❌ 公证失败 ($STATUS)" >&2
      LOG_FILE="$LOG_DIR/${SUBMISSION_ID}.json"
      xcrun notarytool log "$SUBMISSION_ID" \
        "${NOTARY_ARGS[@]}" \
        --output-format json >"$LOG_FILE" || true
      echo "详细日志: $LOG_FILE" >&2
      if [[ -s "$LOG_FILE" ]]; then
        python3 - <<'PY' "$LOG_FILE"
import json, sys
path = sys.argv[1]
data = json.load(open(path))
issues = data.get("issues") or []
for i, issue in enumerate(issues[:12], 1):
    print(f"  {i}. [{issue.get('severity')}] {issue.get('path')}")
    print(f"     {issue.get('message')}")
if len(issues) > 12:
    print(f"  … 另有 {len(issues) - 12} 条，见完整 JSON")
PY
      fi
      exit 1
      ;;
  esac

  # Apple notarytool info can lag; Gatekeeper + stapler are authoritative.
  if notarization_ready && staple_if_ready; then
    echo
    echo
    if [[ "$STATUS" == "In Progress" || "$STATUS" == "Unknown" ]]; then
      echo "✅ 公证已通过（Gatekeeper: Notarized Developer ID；API 仍显示 $STATUS）"
    else
      echo "✅ 公证通过"
    fi
    break
  fi

  if [[ "$STATUS" != "$LAST_STATUS" && -n "$STATUS" ]]; then
    CREATED="$(notary_info_created "$SUBMISSION_ID" 2>/dev/null || true)"
    if [[ -n "$CREATED" ]]; then
      printf '\n    → 状态变更: %s (submitted %s)\n' "$STATUS" "$CREATED"
    fi
    LAST_STATUS="$STATUS"
  fi

  if (( ELAPSED >= NOTARY_TIMEOUT_SEC )); then
    echo
    echo
    echo "❌ 公证超时（${NOTARY_TIMEOUT_SEC}s），状态仍为 $STATUS" >&2
    echo "    submission id: $SUBMISSION_ID" >&2
    LOG_FILE="$LOG_DIR/${SUBMISSION_ID}.json"
    xcrun notarytool log "$SUBMISSION_ID" \
      "${NOTARY_ARGS[@]}" \
      --output-format json >"$LOG_FILE" 2>/dev/null || true
    if [[ -s "$LOG_FILE" ]]; then
      echo "    最近 notary log: $LOG_FILE" >&2
    fi
    exit 1
  fi

  sleep 15
done

if ! staple_if_ready; then
  echo "==> Staple 公证票"
  xcrun stapler staple "$APP"
  xcrun stapler validate "$APP"
fi

if [[ "$MAKE_DMG" == true ]]; then
  echo "==> 生成 DMG"
  "$DESKTOP_ROOT/scripts/dmg/create-styled-dmg.sh" "$APP"
fi

echo
echo "==> 验证 Gatekeeper"
spctl -a -vv -t execute "$APP"
echo
echo "完成: $APP"
