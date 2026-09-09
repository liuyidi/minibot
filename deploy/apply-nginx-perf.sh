#!/usr/bin/env bash
# Apply P0/P1 nginx perf for bot.liuyidi.me (+ apex /assets cache) on this host.
#
# Surgical patch of the live site conf (keeps auth / other server blocks):
#   - gzip via /etc/nginx/conf.d/zz-minibot-gzip.conf (no duplicate gzip on)
#   - bot location /assets/ → webui-dist (alias), immutable cache
#   - apex location /assets/ long-cache when root is site dist
#   - listen 443 ssl http2 for existing 443 listeners
#   - nginx -t && systemctl reload nginx (restore backup on failed -t)
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
GZIP_SNIPPET="/etc/nginx/conf.d/zz-minibot-gzip.conf"

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

# If a previous failed apply left a broken conf, restore newest backup first.
if ! nginx -t >/dev/null 2>&1; then
  latest_bak="$(ls -1t "${LIVE}".bak.* 2>/dev/null | head -1 || true)"
  if [[ -n "${latest_bak}" ]]; then
    echo "apply-nginx-perf: nginx -t failed; restoring ${latest_bak}"
    cp -a "${latest_bak}" "${LIVE}"
  fi
  nginx -t
fi

TMP="$(mktemp)"
BACKUP="${LIVE}.bak.$(date +%Y%m%d%H%M%S)"
GZIP_BACKUP=""
if [[ -f "$GZIP_SNIPPET" ]]; then
  GZIP_BACKUP="${GZIP_SNIPPET}.bak.$(date +%Y%m%d%H%M%S)"
  cp -a "$GZIP_SNIPPET" "$GZIP_BACKUP"
fi
trap 'rm -f "$TMP"' EXIT

python3 - "$LIVE" "$TMP" "$ASSETS_ALIAS" "$GZIP_SNIPPET" <<'PY'
import re
import sys
from pathlib import Path

live_path, out_path, assets_alias, gzip_snippet = map(Path, sys.argv[1:5])
alias_path = str(assets_alias)
if not alias_path.endswith("/"):
    alias_path += "/"

text = live_path.read_text(encoding="utf-8")

# Remove a prior failed insert of gzip into the site file.
text = re.sub(
    r"(?ms)^# minibot perf: compression for text assets\n(?:[ \t]*gzip[^\n]*\n|[ \t]+[^\n]*\n)*\n?",
    "",
    text,
)

BOT_ASSETS = f"""    # minibot perf: hashed SPA assets (bypass Python)
    location /assets/ {{
        alias {alias_path};
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


def ensure_http2(src: str) -> str:
    return re.sub(
        r"listen(\s+(?:\[::\]:)?443\s+ssl)(?!\s+http2)(\s*;)",
        r"listen\1 http2\2",
        src,
    )


def iter_server_blocks(src: str):
    i = 0
    while True:
        m = re.search(r"(?m)^server\s*\{", src[i:])
        if not m:
            break
        start = i + m.start()
        brace = 0
        j = i + m.end() - 1
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
    last = body.rstrip()
    if not last.endswith("}"):
        raise SystemExit("apply-nginx-perf: cannot find insert point in server block")
    return last[:-1] + "\n" + block + "}\n"


def gzip_on_present() -> bool:
    root = Path("/etc/nginx")
    if not root.is_dir():
        return False
    for path in root.rglob("*.conf"):
        try:
            raw = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        # Ignore commented gzip on
        for line in raw.splitlines():
            s = line.strip()
            if s.startswith("#"):
                continue
            if re.match(r"gzip\s+on\s*;", s):
                return True
    return False


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

already = gzip_on_present()
# gzip snippet: never duplicate `gzip on` if already enabled in tree.
if already:
    gzip_body = """# minibot perf — extend gzip types (gzip on already enabled elsewhere)
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
else:
    gzip_body = """# minibot perf — enable gzip for SPA / docs assets
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
gzip_snippet.parent.mkdir(parents=True, exist_ok=True)
gzip_snippet.write_text(gzip_body, encoding="utf-8")
print(
    f"apply-nginx-perf: patched bot={patched_bot} apex={patched_apex} "
    f"gzip_on_present={already} snippet={gzip_snippet}"
)
PY

cp -a "$LIVE" "$BACKUP"
echo "apply-nginx-perf: backup ${BACKUP}"
cp "$TMP" "$LIVE"

if ! nginx -t; then
  echo "apply-nginx-perf: nginx -t failed; restoring ${BACKUP}" >&2
  cp -a "$BACKUP" "$LIVE"
  if [[ -n "${GZIP_BACKUP}" ]]; then
    cp -a "$GZIP_BACKUP" "$GZIP_SNIPPET"
  else
    rm -f "$GZIP_SNIPPET"
  fi
  nginx -t
  exit 1
fi

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
