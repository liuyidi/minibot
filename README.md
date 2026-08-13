# minibot

[简体中文](./README.zh.md) | English

**minibot** is a local-first **AI agent runtime**: a FastAPI service that runs the LLM + tools + sessions loop, with a React WebUI (and Feishu / WeChat IM) for human collaboration.

## What it can do

| Capability | Description |
|------------|-------------|
| **Agent chat** | Streaming replies over WebSocket; multi-session; stop mid-turn; sidebar **Chats / Channels** for WebUI vs IM |
| **Multi-model** | OpenAI-compatible + Anthropic and more; platform builtins and BYOK presets; optional preset fallback on provider errors |
| **Tool use** | Filesystem read/write/edit, web search/fetch |
| **Exec sandbox** | Shell/exec via **local** or **E2B** cloud sandbox |
| **MCP** | Connect MCP servers (stdio / SSE / HTTP); tools inject into the agent registry |
| **Memory** | JSONL session history, workspace / agent memory files |
| **Context compaction** | Summarize and trim long threads so the model stays within context limits |
| **Skills** | Built-in and workspace Skills loaded into agent context |
| **Subagents** | Sync spawn today; async / background subagents on the near-term roadmap |
| **Knowledge base** | Optional [minikb](https://github.com/liuyidi/minikb) retrieval tools + Knowledge UI |
| **Automations** | Cron jobs that trigger agent turns on a schedule |
| **IM channels** | Feishu & WeChat (iLink) with QR setup and pairing in WebUI |
| **Safety (HITL)** | High-risk tools pause for human approve / reject (persist + REST / WS cards) |
| **Observability** | Optional [mini-langfuse](https://github.com/liuyidi/mini-langfuse) traces / sessions / scores |
| **Clients** | **CLI** (`minibot`), **Web** (this repo), **Desktop** and **App** ([minibot-react-native](https://github.com/liuyidi/minibot-react-native)) over the same REST + WS protocol |

```text
  CLI / Web / Desktop / App / Feishu / WeChat
           │  REST + WebSocket
           ▼
     ┌─────────────┐
     │   minibot   │  Agent Loop → Runner → LLM / Tools
     │   :8766     │  Sessions · Memory · Skills · MCP · Cron · Sandbox
     └─────────────┘
           │
     ~/.minibot/   (config, sessions, workspace)
```

## Repository layout

```text
minibot/              # Python package (agent, API, channels, tools)
webui/                # Vite + React SPA (build → webui/dist)
Dockerfile.minibot    # Runtime + WebUI image
docs/                 # Design and phase docs
packages/             # Optional shared client packages
```

## Quick start

### Runtime

```bash
cd minibot
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[feishu,weixin]"
# optional: export OPENAI_API_KEY=sk-...
minibot
```

- Health: `http://127.0.0.1:8766/health`
- Dev UI: `http://127.0.0.1:8766/ui/`
- Packaged WebUI (when `webui/dist` or `MINIBOT_WEBUI_DIST` is set): `http://127.0.0.1:8766/`

### WebUI development

```bash
cd webui
npm install
MINIBOT_API_URL=http://127.0.0.1:8766 npm run dev
```

The dev server proxies `/api`, `/webui`, `/auth` to the runtime (default `:8766`).

```bash
npm run build   # → webui/dist
npm test
```

### Docker

```bash
docker build -f Dockerfile.minibot -t minibot:local .
docker run --rm -p 8766:8766 \
  -e MINIBOT_SERVER_HOST=0.0.0.0 \
  -e MINIBOT_SERVER_OPENAI_API_KEY=sk-... \
  minibot:local
```

## Configuration

Layers: environment → `~/.minibot/config.json` → in-memory state.

| Variable | Default | Meaning |
|----------|---------|---------|
| `MINIBOT_SERVER_HOST` | `127.0.0.1` | Bind host |
| `MINIBOT_SERVER_PORT` | `8766` | Bind port |
| `MINIBOT_SERVER_OPENAI_API_KEY` | — | LLM key (or `OPENAI_API_KEY`) |
| `MINIBOT_SERVER_OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible base URL |
| `MINIBOT_SERVER_MODEL` | `gpt-4o-mini` | Default model |
| `MINIBOT_SERVER_DATA_DIR` | `~/.minibot` | Data root |
| `MINIBOT_WEBUI_DIST` | — | Path to built WebUI `dist` |
| `MINIBOT_SERVER_MINIKB_BASE_URL` | — | Optional knowledge base URL |
| `MINIBOT_SERVER_EXEC_BACKEND` | `local` | `local` or `e2b` |
| `AUTH_SECRET` | empty | If set, bootstrap requires `X-Minibot-Auth` |
| `MINIBOT_SERVER_AUTH_PROVIDER` | `local` | Set to `mini_auth` to delegate login to the shared auth service |
| `MINIBOT_SERVER_MINI_AUTH_BASE_URL` | `http://127.0.0.1:8000` | mini-auth base URL |
| `MINIBOT_SERVER_MINI_AUTH_CLIENT_ID` | `minibot` | OIDC client ID registered in mini-auth |
| `MINIBOT_SERVER_MINI_AUTH_SCOPE` | `openid profile email` | Requested OIDC scopes |
| `MINIBOT_SERVER_MINI_AUTH_CALLBACK_PATH` | `/auth/mini-auth/callback` | minibot callback endpoint |
| `MINIBOT_SERVER_MINI_AUTH_TIMEOUT_S` | `20.0` | mini-auth exchange timeout |
| `MINIBOT_SERVER_REQUIRE_AUTH` | `false` | Force auth check on bootstrap / protected endpoints |

Model presets, MCP servers, and channel credentials live in WebUI **Settings** / **IM channels**.

### Production auth: mini-auth

When minibot is wired to the shared auth service, use:

```bash
MINIBOT_SERVER_AUTH_PROVIDER=mini_auth
MINIBOT_SERVER_MINI_AUTH_BASE_URL=https://auth.liuyidi.me
MINIBOT_SERVER_MINI_AUTH_CLIENT_ID=minibot
MINIBOT_SERVER_MINI_AUTH_SCOPE=openid profile email
MINIBOT_SERVER_MINI_AUTH_CALLBACK_PATH=/auth/mini-auth/callback
MINIBOT_SERVER_REQUIRE_AUTH=true
```

The flow becomes:

1. `GET /auth/login?next=...`
2. redirect to `https://auth.liuyidi.me/oauth/authorize`
3. login on mini-auth
4. callback to `/auth/mini-auth/callback`
5. minibot sets its session cookie and continues to `next`

More detail: [`minibot/README.md`](./minibot/README.md), [`webui/README.md`](./webui/README.md), [`docs/`](./docs/).

## Architecture

```text
WebUI / IM channels
  → API / WebSocket bus
  → Agent loop (context + session lock)
  → Agent runner (stream + tool calls)
  → Providers (OpenAI-compat / Anthropic / …)
  → Tools (fs, exec/sandbox, web, MCP, kb, cron)
  → Session JSONL + memory + skills
```

## Development

```bash
cd minibot && pytest -q
cd minibot && ruff check src/minibot
cd webui && npm test
```

See [`AGENTS.md`](./AGENTS.md) for agent-oriented repo guidance.

## Changelog

See [`CHANGELOG.md`](./CHANGELOG.md) ([中文](./CHANGELOG.zh.md)).

## License

See repository license files for details.
