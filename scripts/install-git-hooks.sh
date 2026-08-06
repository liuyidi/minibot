#!/usr/bin/env bash
# Point this clone at repo-managed hooks (safe to re-run).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
echo "core.hooksPath=.githooks (pre-commit i18n CJK gate enabled)"
