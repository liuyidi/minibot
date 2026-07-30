# minibot

FastAPI agent runtime for local WebUI chat. Built as the next-generation backend replacing legacy `nanobot gateway`, with a focus on readable code, learning-friendly architecture, and deep integration with the local dev ecosystem.

## Why minibot

- **Learning-first**: every Phase includes normal + abnormal Dev UI pages so you can see how the agent loop works (and how it breaks).
- **Readable core**: agent loop, provider streaming, tool execution, session JSONL, memory, and MCP presets all live in `src/minibot/`.
- **Local-first**: sessions, memory, and cron jobs live under `~/.minibot/`; no cloud required for the default path.
- **Composable**: OpenAI-compatible providers, MCP servers, and minikb knowledge bases plug in without touching the core runner.

## Quick start

```bash
cd minibot
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
# optional: export OPENAI_API_KEY=sk-...
minibot
```

Open the bundled Dev UI at `http://127.0.0.1:8766/ui/` (Chat) or the trace page at `http://127.0.0.1:8766/ui/trace.html`.

## Configuration

minibot uses a layered config: env vars → `~/.minibot/config.json` → in-memory `AppState`.

| Variable | Default | Meaning |
|----------|---------|---------|
| `MINIBOT_SERVER_HOST` | `127.0.0.1` | Bind host |
| `MINIBOT_SERVER_PORT` | `8766` | Bind port |
| `MINIBOT_SERVER_OPENAI_API_KEY` | — | LLM key (or use `OPENAI_API_KEY`) |
| `MINIBOT_SERVER_OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible base URL |
| `MINIBOT_SERVER_MODEL` | `gpt-4o-mini` | Default model |
| `MINIBOT_SERVER_DATA_DIR` | `~/.minibot` | Data root |
| `MINIBOT_SERVER_MINIKB_BASE_URL` | — | Optional minikb URL (e.g. `http://127.0.0.1:8080`) |

Providers are selected via Settings model presets (`openai` / `anthropic` / `openrouter` / `deepseek` / `ollama` / `custom`). Anthropic uses the native Messages API; others use OpenAI-compatible `/chat/completions`. Optional: import keys from `~/.nanobot/config.json` via `/ui/providers.html`.

See [`minibot/README.md`](./minibot/README.md) for full env / Docker / MCP / minikb / langfuse wiring.

## Architecture

```text
WebUI / cli_chat
    → api/ws.py or api/routes/sessions.py
    → AgentLoop (session lock + context build)
    → AgentRunner (streaming + tools)
    → providers/* (OpenAI-compat first, extensible)
    → agent/tools/* (filesystem, shell, web, MCP, kb_*)
    → session JSONL + memory + skills
```

- **Dev UI pages**: `/ui/` (Chat), `/ui/runtime.html` (lock/bus), `/ui/tools.html` (tool calls), `/ui/context.html` (system prompt), `/ui/mcp.html` (MCP presets), `/ui/knowledge.html` (minikb), `/ui/automations.html` (cron).
- **Testing**: `cd minibot && pytest` (fake provider, concurrency helpers, streaming assertions).

## Status

Current baseline and migration plan live in:

- [`docs/status.md`](./docs/status.md)
- [`docs/migration.md`](./docs/migration.md)
- [`docs/client-api.md`](./docs/client-api.md) — unified client contract + OpenAPI plan
- [`packages/minibot-client`](./packages/minibot-client) — published `@liuyidi/minibot-client`, import alias `@minibot/client` (RN / webui / desktop)

Next milestone: **Phase 6 余量** — provider registry + nanobot config import, so Settings can stand alone from legacy.

## Docker

```bash
cd minibot
docker build -t minibot .
docker run --rm -p 8766:8766 \
  -e MINIBOT_SERVER_HOST=0.0.0.0 \
  -e MINIBOT_SERVER_OPENAI_API_KEY=sk-... \
  minibot
```

## Contributing

Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the contribution flow. The goal is not just feature parity, but a codebase you can explain to someone else in 10 minutes.
