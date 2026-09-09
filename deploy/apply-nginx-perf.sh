#!/usr/bin/env bash
# Apply P0/P1 nginx perf for bot.liuyidi.me (+ apex /assets cache) on this host.
#
# Surgical patch of the live site conf (keeps auth / other server blocks):
#   - gzip on (once, near top of the included file)
#   - bot location /assets/ → webui-dist (alias), immutable cache
#   - apex location /assets/ long-cache when root is site dist
#   - listen 443 ssl http2 for existing 443 listeners
#   - nginx -t && systemctl reload nginx
#   - smoke-check gzip + Cache-Control on bot /assets
#
# Env:
#   NGINX_SITE_CONF  live conf path (auto-detect if unset)
#   WEBUI_DIST       default /opt/demo/minibot/deploy/webui-dist
#   SKIP_VERIFY=1    skip public curl checks
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEBUI_DIST="${WEBUI_DIST:-${ROOT}/deploy/webui-dist}"
ASSETS_ALIAS="${WEBUI_DIST}/assets/"

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
echo "apply-nginx-perf: assets_alias=${ASSETS_ALIAS}"

TMP="$(mktemp)"
BACKUP="${LIVE}.bak.$(date +%Y%m%d%H%M%S)"
trap 'rm -f "$TMP"' EXIT

python3 - "$LIVE" "$TMP" "$ASSETS_ALIAS" <<'PY'
import re
import sys
from pathlib import Path

live_path, out_path, assets_alias = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
if not assets_alias.endswith("/"):
    assets_alias += "/"

text = live_path.read_text(encoding="utf-8")

GZIP_BLOCK = """# minibot perf: compression for text assets
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 5;
gzip_min_length 256;
gzip_types
    text/plain
    text/css
    text/javascript
    application/javascript
    application/json
    application/xml
    application/wasm
    image/svg+xml
    font/ttf
    font/otf
    application/vnd.ms-fontobject;
"""

BOT_ASSETS = f"""    # minibot perf: hashed SPA assets (bypass Python)
    location /assets/ {{
        alias {assets_alias};
        access_log off;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }}
"""

APEX_ASSETS = """    # minibot perf: VitePress hashed /assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }
"""


def ensure_gzip(src: str) -> str:
    if re.search(r"(?m)^\s*gzip\s+on\s*;", src):
        return src
    # Insert before the first server { in this included file (http context).
    m = re.search(r"(?m)^server\s*\{", src)
    if not m:
        return GZIP_BLOCK + "\n" + src
    return src[: m.start()] + GZIP_BLOCK + "\n" + src[m.start() :]


def ensure_http2(src: str) -> str:
    return re.sub(
        r"listen(\s+(?:\[::\]:)?443\s+ssl)(?!\s+http2)(\s*;)",
        r"listen\1 http2\2",
        src,
    )


def iter_server_blocks(src: str):
    """Yield (start, end, body) for top-level server { ... } blocks."""
    i = 0
    while True:
        m = re.search(r"(?m)^server\s*\{", src[i:])
        if not m:
            break
        start = i + m.start()
        brace = 0
        j = i + m.end() - 1  # at '{'
        while j < len(src):
            ch = src[j]
            if ch == "{":
                brace += 1
            elif ch == "}":
                brace -= 1
                if brace == 0:
                    end = j + 1
                    yield start, end, src[start:end]
                    i = end
                    break
            j += 1
        else:
            raise SystemExit("apply-nginx-perf: unbalanced server block")


def server_names(body: str) -> set[str]:
    names: set[str] = set()
    for m in re.finditer(r"(?m)^\s*server_name\s+([^;]+);", body):
        names.update(p.strip() for p in m.group(1).split() if p.strip())
    return names


def strip_assets_location(body: str) -> str:
    """Remove existing location /assets/ blocks (any nesting depth of braces)."""
    out = []
    i = 0
    while i < len(body):
        m = re.search(r"(?m)^\s*location\s+/assets/\s*\{", body[i:])
        if not m:
            out.append(body[i:])
            break
        abs_start = i + m.start()
        out.append(body[i:abs_start])
        brace = 0
        j = i + m.end() - 1
        while j < len(body):
            if body[j] == "{":
                brace += 1
            elif body[j] == "}":
                brace -= 1
                if brace == 0:
                    i = j + 1
                    if i < len(body) and body[i] == "\n":
                        i += 1
                    break
            j += 1
        else:
            raise SystemExit("apply-nginx-perf: unbalanced location /assets/")
    return "".join(out)


def insert_before_location_slash(body: str, block: str) -> str:
    body = strip_assets_location(body)
    m = re.search(r"(?m)^(\s*)location\s+/\s*\{", body)
    if m:
        return body[: m.start()] + block + "\n" + body[m.start() :]
    # Fallback: before closing brace of server
    last = body.rstrip()
    if not last.endswith("}"):
        raise SystemExit("apply-nginx-perf: cannot find insert point in server block")
    return last[:-1] + "\n" + block + "}\n"


text = ensure_gzip(text)
text = ensure_http2(text)

pieces: list[str] = []
cursor = 0
patched_bot = False
patched_apex = False
for start, end, body in iter_server_blocks(text):
    pieces.append(text[cursor:start])
    names = server_names(body)
    if "bot.liuyidi.me" in names and re.search(r"listen\s+(?:\[::\]:)?443\b", body):
        body = insert_before_location_slash(body, BOT_ASSETS)
        patched_bot = True
    elif names & {"liuyidi.me", "www.liuyidi.me"} and re.search(
        r"listen\s+(?:\[::\]:)?443\b", body
    ):
        # Only add cache location when this server roots the VitePress dist.
        if "site/.vitepress/dist" in body or re.search(r"(?m)^\s*root\s+", body):
            body = insert_before_location_slash(body, APEX_ASSETS)
            patched_apex = True
    pieces.append(body)
    cursor = end
pieces.append(text[cursor:])
text = "".join(pieces)

if not patched_bot:
    raise SystemExit("apply-nginx-perf: did not find bot.liuyidi.me 443 server block")

out_path.write_text(text, encoding="utf-8")
print(
    f"apply-nginx-perf: patched bot={patched_bot} apex={patched_apex} -> {out_path}"
)
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
)"

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
if [[ "$HTTP_VER" == "1.1" ]]; then
  echo "apply-nginx-perf: WARN still HTTP/1.1 from this host (check listen http2 / client)" >&2
fi

echo "apply-nginx-perf: ok"
