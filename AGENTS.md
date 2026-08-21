This file provides guidance to AI coding agents working in this repository.

## Project Overview

This monorepo hosts **minibot** (FastAPI agent runtime) and its **WebUI** (React/TypeScript).


Layout:

```text
minibot/     # Python package (agent loop, channels, tools, API)
webui/       # Vite React SPA (build → webui/dist)
desktop/     # Desktop app (local gateway + sidecar)
site/        # VitePress public site (liuyidi.me / minibot overview)
Dockerfile.minibot
```

## Development Commands

```bash
# Runtime
cd minibot
uv sync --all-extras   # or: python -m venv .venv && pip install -e ".[e2b,feishu,weixin]"
uv run minibot         # http://127.0.0.1:8766

# Tests / lint
cd minibot && uv run pytest tests/ -q
cd minibot && uv run ruff check src/minibot

# WebUI (proxies /api /webui /auth to :8766)
cd webui && npm install && npm run dev    # MINIBOT_API_URL=http://127.0.0.1:8766
cd webui && npm run build                # → webui/dist
cd webui && npm test

# Public site (https://liuyidi.me)
cd site && npm ci && npm run docs:dev    # / and /minibot/
cd site && npm run docs:build && npm run docs:check
```

Demo image:

```bash
docker build -f Dockerfile.minibot -t minibot:local .
```

## High-Level Architecture

1. **Channels** (`minibot/src/minibot/channels/`) — Feishu, WeChat (iLink), etc. → inbound bus.
2. **Agent loop / tools** — LLM turns, MCP, exec, filesystem, cron.
3. **API + WebSocket** (`minibot/src/minibot/api/`) — REST + multiplex WS for WebUI.
4. **WebUI** (`webui/`) — sessions, settings, IM channel setup; talks to minibot over HTTP/WS.

Config / data default under `~/.minibot/` (`MINIBOT_SERVER_DATA_DIR`).

## Notes

- WebUI static resolve: `MINIBOT_WEBUI_DIST` or `webui/dist` / Docker `/app/webui-dist`.
- Auth header: `X-Minibot-Auth` (or Bearer token).
- WebUI coding conventions (`.cursor/rules/`): component structure, i18n/icons, React/TS, Tailwind, Vitest.
- Deploy skills are per app (do not mix hosts): Aliyun minibot `.claude/skills/aliyun-ecs-demo-deploy/SKILL.md`; mlf is Tencent (`mini-langfuse` `deploying-tencent-mlf`); minikb is Volcengine (`deploying-volcengine-minikb`); auth is Tencent CVM (`deploying-tencent-mini-auth`); serverless-ship is Vercel (`deploying-vercel-serverless-ship`). **All app deploys must go through git push → GitHub Actions workflow** (no local ssh/rsync publish).
