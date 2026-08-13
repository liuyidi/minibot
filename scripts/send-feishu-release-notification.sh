#!/usr/bin/env bash
# Send a Feishu custom-bot interactive card for release milestones.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  FEISHU_RELEASE_WEBHOOK_URL=... \
  RELEASE_VERSION=1.0.0-beta.1 \
  RELEASE_URL=https://github.com/org/repo/releases/tag/v1.0.1 \
  WORKFLOW_URL=https://github.com/org/repo/actions/runs/123 \
  [MANIFEST_URL=https://downloads.example.com/minibot/releases.json] \
  [FEISHU_RELEASE_TITLE="minibot 发布完成"] \
  [FEISHU_RELEASE_PHASE="GitHub Release 已创建"] \
  [FEISHU_RELEASE_SUBTITLE="v1.0.1 · GitHub Release"] \
  [FEISHU_RELEASE_SUMMARY="GitHub Release 已创建，发布产物已同步完成。"] \
  [FEISHU_CARD_TEMPLATE=green] \
  scripts/send-feishu-release-notification.sh

Required environment:
  FEISHU_RELEASE_WEBHOOK_URL, RELEASE_VERSION, RELEASE_URL, WORKFLOW_URL
Optional environment:
  MANIFEST_URL, FEISHU_RELEASE_TITLE, FEISHU_RELEASE_PHASE,
  FEISHU_RELEASE_SUBTITLE, FEISHU_RELEASE_SUMMARY, FEISHU_CARD_TEMPLATE
EOF
}

for name in FEISHU_RELEASE_WEBHOOK_URL RELEASE_VERSION RELEASE_URL WORKFLOW_URL; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    usage >&2
    exit 2
  fi
done

card_template="${FEISHU_CARD_TEMPLATE:-green}"
card_title="${FEISHU_RELEASE_TITLE:-minibot desktop v${RELEASE_VERSION}}"
card_phase="${FEISHU_RELEASE_PHASE:-Desktop release update}"
card_subtitle="${FEISHU_RELEASE_SUBTITLE:-v${RELEASE_VERSION} · ${card_phase}}"
card_summary="${FEISHU_RELEASE_SUMMARY:-Desktop release is ready.}"

payload="$(
  FEISHU_RELEASE_TITLE="$card_title" \
  FEISHU_RELEASE_PHASE="$card_phase" \
  FEISHU_RELEASE_SUBTITLE="$card_subtitle" \
  FEISHU_RELEASE_SUMMARY="$card_summary" \
  FEISHU_CARD_TEMPLATE="$card_template" \
  RELEASE_VERSION="$RELEASE_VERSION" \
  RELEASE_URL="$RELEASE_URL" \
  WORKFLOW_URL="$WORKFLOW_URL" \
  MANIFEST_URL="${MANIFEST_URL:-}" \
  python3 - <<'PY'
import os
import json

title = os.environ["FEISHU_RELEASE_TITLE"]
phase = os.environ["FEISHU_RELEASE_PHASE"]
subtitle = os.environ["FEISHU_RELEASE_SUBTITLE"]
summary = os.environ["FEISHU_RELEASE_SUMMARY"]
template = os.environ["FEISHU_CARD_TEMPLATE"] or "green"
version = os.environ["RELEASE_VERSION"]
release_url = os.environ["RELEASE_URL"]
workflow_url = os.environ["WORKFLOW_URL"]
manifest_url = os.environ.get("MANIFEST_URL", "").strip()

body_elements = [
    {
        "tag": "markdown",
        "content": "\n".join(
            [
                f"### {phase}",
                summary,
                "",
                f"- **版本**：`{version}`",
                f"- **GitHub Release**：[打开发布页]({release_url})",
                f"- **GitHub Actions**：[打开运行记录]({workflow_url})",
            ]
            + ([f"- **OSS 清单**：[releases.json]({manifest_url})"] if manifest_url else [])
        ),
        "text_align": "left",
        "text_size": "normal_v2",
        "margin": "0px 0px 0px 0px",
    },
]

card = {
    "schema": "2.0",
    "config": {
        "update_multi": True,
        "style": {
            "text_size": {
                "normal_v2": {
                    "default": "normal",
                    "pc": "normal",
                    "mobile": "heading",
                }
            }
        },
    },
    "header": {
        "title": {"tag": "plain_text", "content": title},
        "subtitle": {"tag": "plain_text", "content": subtitle},
        "template": template,
        "padding": "12px 12px 12px 12px",
    },
    "body": {
        "direction": "vertical",
        "padding": "12px 12px 12px 12px",
        "elements": body_elements,
    },
}

print(json.dumps({"msg_type": "interactive", "card": card}, ensure_ascii=False))
PY
)"

curl -fsS \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$payload" \
  "$FEISHU_RELEASE_WEBHOOK_URL"
