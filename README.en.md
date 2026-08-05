# minibot

[简体中文](./README.md) | English

**minibot** is a local-first **AI agent runtime**: a FastAPI service that runs the LLM + tools + sessions loop, with a React WebUI (and Feishu / WeChat IM) for human collaboration.

## What it can do

| Capability | Description |
|------------|-------------|
| **Agent chat** | WebSocket streaming; multi-session; sidebar **Chats / Channels** split for WebUI vs IM |
| **Multi-model** | OpenAI-compatible gateways + Anthropic and more; switch model presets in Settings |
| **Tool use** | Read/edit files, Shell/exec (local or E2B), web search/fetch, MCP tool injection |
| **Memory & skills** | JSONL session persistence, workspace memory, Skills; optional minikb knowledge base |
| **Automations** | Cron jobs that trigger agent turns on a schedule |
| **IM channels** | Feishu & WeChat (iLink Claw) with QR setup in WebUI |
| **Observability** | Optional [mini-langfuse](https://github.com/liuyidi/mini-langfuse) traces / sessions |
| **Clients** | WebUI in this repo; same protocol for [minibot-react-native](https://github.com/liuyidi/minibot-react-native) and others |

```text
  WebUI / Feishu / WeChat / mobile
           │  REST + WebSocket
           ▼
     ┌─────────────┐
     │   minibot   │  Agent Loop → Runner → LLM / Tools
     │   :8766     │  Sessions · Memory · MCP · Cron
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

Model presets, MCP servers, and channel credentials live in WebUI **Settings** / **IM channels**.

More detail: [`minibot/README.md`](./minibot/README.md), [`webui/README.md`](./webui/README.md), [`docs/`](./docs/).

## Architecture

```text
WebUI / IM channels
  → API / WebSocket bus
  → Agent loop (context + session lock)
  → Agent runner (stream + tool calls)
  → Providers (OpenAI-compat / Anthropic / …)
  → Tools (fs, exec, web, MCP, kb, cron)
  → Session JSONL + memory + skills
```

## Development

```bash
cd minibot && pytest -q
cd minibot && ruff check src/minibot
cd webui && npm test
```

See [`AGENTS.md`](./AGENTS.md) for agent-oriented repo guidance.

## License

See repository license files for details.
