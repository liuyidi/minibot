#!/usr/bin/env bash
# Apply P0/P1 nginx perf for liuyidi.me + bot.liuyidi.me on this host.
#
# - Installs deploy/nginx.liuyidi.me.conf.example into the live site file
# - Preserves ssl_certificate / ssl_certificate_key from the live conf
# - nginx -t && systemctl reload nginx
# - Smoke-checks gzip + Cache-Control on bot /assets
#
# Env:
#   NGINX_SITE_CONF  live conf path (auto-detect if unset)
#   WEBUI_DIST       default /opt/demo/minibot/deploy/webui-dist
#   SKIP_VERIFY=1    skip public curl checks
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXAMPLE="${ROOT}/deploy/nginx.liuyidi.me.conf.example"
WEBUI_DIST="${WEBUI_DIST:-${ROOT}/deploy/webui-dist}"

if [[ ! -f "$EXAMPLE" ]]; then
  echo "apply-nginx-perf: missing example ${EXAMPLE}" >&2
  exit 1
fi

if [[ ! -d "${WEBUI_DIST}/assets" ]]; then
  echo "apply-nginx-perf: WARN ${WEBUI_DIST}/assets missing — /assets will 404 until Publish WebUI" >&2
fi

detect_conf() {
  if [[ -n "${NGINX_SITE_CONF:-}" ]]; then
    printf '%s\n' "$NGINX_SITE_CONF"
    return
  fi
  local found=""
  for dir in /etc/nginx/sites-enabled /etc/nginx/conf.d /etc/nginx/sites-available; do
    [[ -d "$dir" ]] || continue
    found="$(grep -rl 'server_name[[:space:]]\+bot\.liuyidi\.me' "$dir" 2>/dev/null | head -1 || true)"
    if [[ -n "$found" ]]; then
      printf '%s\n' "$found"
      return
    fi
  done
  return 1
}

LIVE="$(detect_conf)" || {
  echo "apply-nginx-perf: cannot find live conf with server_name bot.liuyidi.me" >&2
  echo "  set NGINX_SITE_CONF=/path/to/conf" >&2
  exit 1
}

echo "apply-nginx-perf: live=${LIVE}"
echo "apply-nginx-perf: example=${EXAMPLE}"

TMP="$(mktemp)"
BACKUP="${LIVE}.bak.$(date +%Y%m%d%H%M%S)"
trap 'rm -f "$TMP"' EXIT

python3 - "$LIVE" "$EXAMPLE" "$TMP" <<'PY'
import re
import sys
from pathlib import Path

live_path, example_path, out_path = map(Path, sys.argv[1:4])
live = live_path.read_text(encoding="utf-8")
example = example_path.read_text(encoding="utf-8")

live_names: set[str] = set()
for match in re.finditer(r"server_name\s+([^;]+);", live):
    live_names.update(part.strip() for part in match.group(1).split() if part.strip())
allowed = {"liuyidi.me", "www.liuyidi.me", "bot.liuyidi.me"}
extra = live_names - allowed
if extra:
    raise SystemExit(
        "apply-nginx-perf: refusing to overwrite conf that also serves "
        f"{sorted(extra)}; point NGINX_SITE_CONF at an apex+bot-only file"
    )

ssl_lines: list[str] = []
seen: set[str] = set()
for line in live.splitlines():
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        continue
    if stripped.startswith("ssl_certificate ") or stripped.startswith("ssl_certificate_key "):
        key = stripped.rstrip(";")
        if key not in seen:
            seen.add(key)
            ssl_lines.append("    " + stripped)

if not any(s.strip().startswith("ssl_certificate ") and "ssl_certificate_key" not in s for s in ssl_lines):
    raise SystemExit("apply-nginx-perf: live conf has no ssl_certificate line to preserve")
if not any("ssl_certificate_key " in s for s in ssl_lines):
    raise SystemExit("apply-nginx-perf: live conf has no ssl_certificate_key line to preserve")

out_lines: list[str] = []
in_443_server = False
for line in example.splitlines():
    stripped = line.strip()
    if stripped.startswith("ssl_certificate") and stripped.startswith("#"):
        continue
    if stripped.startswith("server {"):
        in_443_server = False
    if re.match(r"listen\s+(\[::\]:)?443\b", stripped):
        in_443_server = True
    if in_443_server and stripped.startswith("server_name "):
        out_lines.append(line)
        out_lines.extend(ssl_lines)
        continue
    out_lines.append(line)

text = "\n".join(out_lines) + "\n"
text = re.sub(
    r"listen(\s+(?:\[::\]:)?443\s+ssl)(?!\s+http2)(\s*;)",
    r"listen\1 http2\2",
    text,
)
out_path.write_text(text, encoding="utf-8")
print(f"apply-nginx-perf: rendered {out_path} ({len(ssl_lines)} ssl lines preserved)")
PY

cp -a "$LIVE" "$BACKUP"
echo "apply-nginx-perf: backup ${BACKUP}"
cp "$TMP" "$LIVE"

nginx -t
systemctl reload nginx
echo "apply-nginx-perf: reloaded nginx"

if [[ "${SKIP_VERIFY:-}" == "1" ]]; then
  exit 0
fi

export WEBUI_DIST
JS_PATH="$(
  WEBUI_DIST="$WEBUI_DIST" python3 - <<'PY'
from pathlib import Path
import os
import re

root = Path(os.environ["WEBUI_DIST"])
index = root / "index.html"
if not index.is_file():
    raise SystemExit(0)
html = index.read_text(encoding="utf-8")
m = re.search(r'(/assets/index-[^"\']+\.js)', html)
print(m.group(1) if m else "")
PY
)

if [[ -z "${JS_PATH}" ]]; then
  echo "apply-nginx-perf: WARN no index-*.js in webui dist; skip asset verify"
  exit 0
fi

echo "apply-nginx-perf: verify ${JS_PATH}"
HDRS="$(curl -fsS -D - -o /dev/null -H 'Accept-Encoding: gzip' "https://bot.liuyidi.me${JS_PATH}" || true)"
printf '%s\n' "$HDRS" | tr -d '\r' | grep -iE '^(HTTP/|content-encoding:|cache-control:|content-type:)' || true

if ! printf '%s\n' "$HDRS" | tr -d '\r' | grep -qiE '^content-encoding:[[:space:]]*gzip'; then
  echo "apply-nginx-perf: FAIL expected Content-Encoding: gzip on bot assets" >&2
  exit 1
fi
if ! printf '%s\n' "$HDRS" | tr -d '\r' | grep -qiE '^cache-control:.*immutable'; then
  echo "apply-nginx-perf: FAIL expected Cache-Control immutable on bot assets" >&2
  exit 1
fi

HTTP_VER="$(curl -fsS -o /dev/null -w '%{http_version}' --http2 "https://bot.liuyidi.me/")"
echo "apply-nginx-perf: ALPN/http_version=${HTTP_VER}"
# 2 or 2.0 both OK; warn only if stuck on 1.1
if [[ "$HTTP_VER" == "1.1" ]]; then
  echo "apply-nginx-perf: WARN still HTTP/1.1 from this host (check listen http2 / client)" >&2
fi

echo "apply-nginx-perf: ok"
