#!/usr/bin/env bash
# Publish minibot npm packages to registry.npmjs.org (never GitHub Packages).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGISTRY="https://registry.npmjs.org"
OTP_ARGS=()
if [[ -n "${NPM_OTP:-}" ]]; then
  OTP_ARGS=(--otp "$NPM_OTP")
fi

publish_pkg() {
  local dir="$1"
  echo "==> Publishing $(node -p "require('$dir/package.json').name") from $dir"
  (
    cd "$dir"
    npm run build
    npm test
    npm publish --access public --registry "$REGISTRY" "${OTP_ARGS[@]}"
  )
}

publish_pkg "$ROOT/packages/minibot-client"
publish_pkg "$ROOT/packages/minibot-cli"

echo "Done. Verify:"
echo "  npm view @liuyidi/minibot-client --registry $REGISTRY version"
echo "  npm view @liuyidi/minibot --registry $REGISTRY version"
