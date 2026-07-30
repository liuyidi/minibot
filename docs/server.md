# minibot (FastAPI)

Replacement agent runtime living in [`minibot/`](../minibot/). Legacy `nanobot gateway` remains available during migration.

## Start

```bash
cd minibot
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
export OPENAI_API_KEY=sk-...   # or MINIBOT_SERVER_OPENAI_API_KEY
minibot                        # http://127.0.0.1:8766
```

Health check:

```bash
curl http://127.0.0.1:8766/health
```

CLI smoke (no HTTP):

```bash
python -m minibot.cli_chat
```

## WebUI (dev)

### Option A — built-in Dev UI (recommended while migrating)

No Node/npm. After `minibot` is running:

Open [`http://127.0.0.1:8766/ui/`](http://127.0.0.1:8766/ui/)

Covers: health, bootstrap, sessions, REST turns, optional WebSocket chat, settings PATCH, and a feature-check panel for stub routes. Source: `minibot/src/minibot/static/devui/`.

### Option B — full nanobot WebUI (Vite)

Point Vite at minibot (default in `webui/vite.config.ts` is `:8766`):

```bash
# terminal 1
cd minibot && source .venv/bin/activate && minibot

# terminal 2
cd webui && NANOBOT_API_URL=http://127.0.0.1:8766 npm run dev
```

Open `http://127.0.0.1:5173`. Bootstrap hits `/webui/bootstrap`; chat uses WebSocket `/ws`.
Many Settings / Automations / Skills pages still hit stubs until those phases land.

## Migration status

Full rewrite roadmap (WebUI/Gateway backend parity): [`docs-plan/minibot-fastapi-migration.md`](../docs-plan/minibot-fastapi-migration.md).

| Area | Status |
|------|--------|
| Health / bootstrap | Done |
| Agent runner + echo tool | Done |
| Sessions REST + turns | Done |
| Chat WebSocket | Done (whole-message replies; no token delta yet) |
| Settings (basic PATCH) | Done |
| Automations / Skills / MCP / IM channels | Not ported — stubs or use legacy gateway |
| Desktop Tauri | Still targets legacy gateway until rewired |

## Deprecating legacy gateway HTTP

Once WebUI chat works on minibot:

1. Keep `nanobot gateway` only for IM channels you still need.
2. Prefer `minibot` for local WebUI development.
3. Remove uses of `nanobot/webui/ws_http.py` GET-mutation routes from the frontend (already replaced by JSON REST in the new path).
