# minibot WebUI Source

This directory contains the React/TypeScript source for the minibot WebUI. If
you installed `minibot` from PyPI and only want to use the bundled browser UI,
read the user guide in [`docs/webui.md`](../docs/webui.md). You do not need
Node.js, Bun, Vite, or anything in this directory unless you are changing the
frontend.

For the project overview, install guide, and general docs map, see the root [`README.md`](../README.md) and [`docs/README.md`](../docs/README.md).

## Pick a Path

| Goal | Start with | Opens at |
|---|---|---|
| Use the bundled browser UI | [`docs/webui.md`](../docs/webui.md) | `http://127.0.0.1:8766` |
| Use the WebUI from another device | [`docs/webui.md#lan-access`](../docs/webui.md#lan-access) | `http://<your-ip>:8766` |
| Change WebUI source code | [Develop the WebUI (Vite HMR)](#develop-the-webui-vite-hmr) | `http://127.0.0.1:5173` |
| Debug setup failures | [`docs/troubleshooting.md#webui-problems`](../docs/troubleshooting.md#webui-problems) | Diagnosis order and common fixes |

The source app is built with Vite + React 18 + TypeScript + Tailwind 3 +
shadcn/ui. It talks to the gateway over the WebSocket multiplex protocol and
reads session metadata from the embedded REST surface on the same port.

## Layout

```text
webui/                 source tree (this directory)
minibot/web/dist/      build output served by the gateway
```

Agent-facing Cursor rules for the same conventions live under
[`.cursor/rules/`](../.cursor/rules/) (especially `webui-component-structure.mdc`).

### `src/` directory structure

Path alias: `@/` → `src/`.

```text
src/
├── main.tsx                 # entry: mount, i18n, global CSS
├── App.tsx                  # shell: hash routes, auth, layout (keep thin)
├── globals.css
│
├── pages/                   # route-level pages (one folder per feature)
│   ├── index.ts
│   └── <page>/
│       ├── index.ts         # export { XxxPage }
│       ├── XxxPage.tsx      # data / state / handlers + compose UI
│       ├── xxx-ui.tsx       # optional large presentational split
│       └── components/      # page-private UI only
│
├── components/              # shared business UI (2+ consumers or app shell)
│   ├── ui/                  # atomic primitives (shadcn / Radix)
│   ├── settings/            # settings-domain shared chrome
│   ├── thread/              # chat / session domain
│   │   └── activity/
│   └── *.tsx
│
├── hooks/                   # reusable React hooks
├── lib/                     # no JSX — see `lib/` layout below
├── providers/               # React context providers
├── i18n/                    # i18n init + locales/<lang>/common.json
├── tests/                   # Vitest + Testing Library
├── types/                   # ambient *.d.ts
└── workers/                 # Web Workers
```

### `lib/` layout

```text
lib/
├── apis/           # REST / WS / bootstrap HTTP (api, http, minibot-client, bootstrap)
├── configs/        # feature flags & runtime/host config (ui-entry, portal, runtime)
├── constants/      # static maps (provider-brand)
├── utils/          # pure helpers (cn, format, ansi, media, workspace, …)
├── types/          # shared TypeScript types
└── chat/           # session/message-domain logic (activity-timeline, tool-traces, …)
```

| Path | Put here | Do not put here |
|------|----------|-----------------|
| `lib/apis/` | HTTP/WS clients, fetch helpers | UI, pure formatters |
| `lib/configs/` | env/build flags, host runtime adapters | API call implementations |
| `lib/constants/` | static tables / brand maps | logic with side effects |
| `lib/utils/` | general pure helpers | chat-turn domain pipelines |
| `lib/types/` | shared DTOs / UI message types | runtime code |
| `lib/chat/` | activity timeline, tool traces, display scrubbers | generic `cn` / date format |

Import from the category path, e.g. `@/lib/apis/api`, `@/lib/utils/format`. Folder barrels also work for `@/lib/utils` and `@/lib/types`.

| Path | Put here | Do not put here |
|------|----------|-----------------|
| `pages/<page>/` | page entry, orchestration, page-only `components/` | atomic controls; multi-page business blocks |
| `components/ui/` | Button, Dialog, Input, Sheet, … | business copy / API logic |
| `components/` (+ `settings/`, `thread/`) | UI used by app shell or ≥2 pages | one-off page widgets |
| `hooks/` | reusable `useXxx` | tiny one-file helpers (keep local) |
| `lib/` | categorized modules above | React components / JSX |
| `providers/` | global Context | ordinary feature UI |
| `i18n/` | locale JSON + bootstrap | business logic |
| `tests/` | `*.test.ts(x)` | production code |

**Placement checklist:** primitive → `components/ui`; shared business → `components/`; page-only → `pages/<page>/components/`; pure logic → `lib/`; reusable hooks → `hooks/`.

**File size:** prefer ≤ ~350 lines per file; split page shell / UI / hooks / helpers when larger. Prefer extracting into `pages/` or `components/<domain>/` over growing `App.tsx` / `SettingsView.tsx`.

**Page imports:** `import { ChannelsPage } from "@/pages/channels"`. Do not add full pages under `components/settings/`.

Migrated / in-progress page folders: `pages/automations`, `channels`, `skills`, `download`, `models`.

## Develop the WebUI (Vite HMR)

### 1. Install minibot from source

From the repository root:

```bash
python -m pip install -e .
```

> Editable installs intentionally **skip** the WebUI bundle step — Vite HMR is faster than rebuilding `dist/` on every change.

### 2. Enable the WebSocket channel

In `~/.minibot/config.json`, merge:

```json
{ "channels": { "websocket": { "enabled": true } } }
```

### 3. Start the gateway

In one terminal:

```bash
minibot gateway
```

### 4. Start the WebUI dev server

In another terminal:

```bash
cd webui
bun install            # npm install also works
bun run dev
```

Then open `http://127.0.0.1:5173`.

By default the dev server proxies `/api`, `/webui`, `/auth`, and WebSocket traffic to `http://127.0.0.1:8766`.

If your gateway listens on a non-default port, point the dev server at it:

```bash
MINIBOT_API_URL=http://127.0.0.1:9000 bun run dev
```

## Build for packaged runtime

You usually do not need to run this by hand: `python -m build` invokes the WebUI build automatically when packaging the wheel.

If you want to preview the production bundle locally without rebuilding the wheel:

```bash
cd webui
bun run build          # writes to ../minibot/web/dist
```

The gateway picks up the new bundle on the next restart.

## Test

```bash
cd webui
bun run test
```

## Acknowledgements

- [`agent-chat-ui`](https://github.com/langchain-ai/agent-chat-ui) for UI and interaction inspiration across the chat surface.
