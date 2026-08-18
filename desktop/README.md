# minibot Desktop (local gateway)

[简体中文](./README.zh.md) | English

> Default desktop app.  
> Design: [`docs/superpowers/specs/2026-08-14-desktop-local-gateway-design.md`](../docs/superpowers/specs/2026-08-14-desktop-local-gateway-design.md)  
> Plan: [`docs/superpowers/plans/2026-08-14-desktop-v2-local-gateway.md`](../docs/superpowers/plans/2026-08-14-desktop-v2-local-gateway.md)

**Defaults to `http://127.0.0.1:8766`**, spawns a local minibot engine, and serves the WebUI from that gateway. Chats / config live under Tauri app data (`engine/` via `MINIBOT_SERVER_DATA_DIR`).

## Architecture (end-to-end)

```text
┌─────────────────────┐     spawn      ┌──────────────────────────────┐
│  desktop (Tauri)    │ ─────────────► │  minibot sidecar / PATH      │
│  WebView + host     │   127.0.0.1    │  FastAPI + baked WebUI dist  │
│  bridge             │ ◄───────────── │  data → {app_data}/engine    │
└─────────┬───────────┘                └──────────────┬───────────────┘
          │ openLogin (system browser)                │
          ▼                                           │ OAuth callback
┌─────────────────────┐                               │ (HTTP, localhost)
│  mini-auth          │ ──────────────────────────────┘
│  auth.liuyidi.me    │     → /auth/desktop/done + handoff token
└─────────────────────┘     → WebUI polls /auth/desktop/handoff
```

Engine spawn order (Rust `resolve_sidecar_command`):

1. `MINIBOT_SIDECAR` — absolute path to a launcher (dev override)
2. **Bundled** PyInstaller onedir under Tauri `resources/minibot-sidecar/`
3. `minibot` on `PATH`

## 1. Local development

```bash
# Terminal A — gateway (optional if PATH/MINIBOT_SIDECAR works)
cd minibot
MINIBOT_SERVER_AUTH_PROVIDER=mini_auth \
MINIBOT_SERVER_MINI_AUTH_BASE_URL=https://auth.liuyidi.me \
MINIBOT_SERVER_REQUIRE_AUTH=true \
uv run --no-sync python -m minibot

# Terminal B — shell
cd desktop
npm install
npm run dev
```

Useful overrides:

| Env | Purpose |
|---|---|
| `MINIBOT_API_BASE` | Gateway URL (default `http://127.0.0.1:8766`) |
| `MINIBOT_SIDECAR` | Force engine binary (freeze output or `uv` shim) |
| `MINIBOT_SERVER_PLATFORM_PROXY_BASE_URL` | Cloud platform LLM proxy (default `https://bot.liuyidi.me`) |
| `MINIBOT_ENV_MODELS` | Optional local `.env.models` for **dev BYOK only** (not for shipping keys) |

**Shipped desktop:** platform models use the cloud proxy (no vendor keys in the `.app`).  
Do not distribute operator `.env.models` to end users.

## 2. Login flow (system browser)

Desktop unauthenticated UI shows a welcome / Sign in screen. **Packaged “production” installs still use the local gateway on `127.0.0.1:8766`** (not `bot.liuyidi.me`); only the IdP is public (`auth.liuyidi.me`).

Packaged flow (preferred):

1. WebUI sees `minibotHost.openLogin` → `GET /auth/desktop/authorize` returns an authorize URL with **`minibot://auth/callback`** → system browser opens `https://auth.liuyidi.me/oauth/authorize?…` (no loopback in the address bar).
2. Desktop stays on a “Signing in…” waiting screen with **Copy login link** / **Try again**.
3. After login, the browser hits `minibot://auth/callback?code&state` → shell `POST /auth/desktop/complete` → WebView `/auth/desktop/session?token=…` sets the cookie.
4. Optional: `minibot://auth/done` only focuses the window.

Dev fallback (`tauri:dev` without a registered scheme): loopback  
`http://127.0.0.1:8766/auth/login?desktop=1&desktop_login_id=…` → HTTP callback → `/auth/desktop/handoff` poll.

### Sign out

After a confirmation dialog, only the local minibot session is cleared (`/auth/logout?local=1`). The system browser is **not** opened to clear the IdP, so re-login can reuse an existing account session.

## 3. Freeze sidecar (PyInstaller onedir)

From **repo root** (builds WebUI dist if missing):

```bash
./scripts/freeze-minibot-sidecar.sh              # host triple
./scripts/freeze-minibot-sidecar.sh aarch64-apple-darwin
```

Output:

```text
dist/sidecar/<triple>/minibot-sidecar/
  minibot-sidecar          # launcher
  _internal/               # Python + baked webui-dist + package data
```

Smoke:

```bash
BIN=dist/sidecar/aarch64-apple-darwin/minibot-sidecar/minibot-sidecar
MINIBOT_SERVER_HOST=127.0.0.1 MINIBOT_SERVER_PORT=8767 \
  MINIBOT_SERVER_REQUIRE_AUTH=false "$BIN" &
curl -fsS http://127.0.0.1:8767/health
```

Spec / entry: `minibot/packaging/pyinstaller/`.

## 4. Bundle into the Tauri app (local package)

```bash
# After freeze
cd desktop
./scripts/prepare-sidecar.sh                    # or pass <triple>
npm run build:app                               # .app only
# npm run build                                 # app + dmg + collect
```

`prepare-sidecar.sh` copies the onedir into `src-tauri/resources/minibot-sidecar/`  
(gitignored; listed in `tauri.conf.json` → `bundle.resources`). Packaged apps resolve that path as label `bundled`.

### Open an unsigned macOS build

CI uses ad-hoc signing (`signingIdentity: "-"`). After downloading from GitHub you may still need:

```bash
# After dragging minibot V2.app into /Applications
xattr -cr "/Applications/minibot V2.app"
# If Gatekeeper still says “damaged”:
codesign --force --deep --sign - "/Applications/minibot V2.app"
open "/Applications/minibot V2.app"
```

## 5. CI publish + Feishu notify

Workflow: [`.github/workflows/publish-desktop.yml`](../.github/workflows/publish-desktop.yml)

| | |
|---|---|
| Trigger | Unified **Release** tag `v*`, or manual `workflow_dispatch` |
| Matrix | macOS arm64 / macOS x86_64 (`macos-15-intel`) / Linux / Windows |
| Steps | `uv sync` → WebUI build → freeze → prepare → `tauri-action` |
| Release tag | `desktop-v2-v__VERSION__` (does **not** collide with orchestration `v*`) |
| OSS | **Sync Desktop Release to OSS** runs after a successful publish |
| Notify | On success → ServerlessShip → Feishu; OSS sync posts again |

Public download page: `https://bot.liuyidi.me/#/download/` (manifest `https://downloads.liuyidi.me/minibot/releases.json`).

Installed app identity is unchanged: product name `minibot V2`, bundle id `me.liuyidi.minibot.desktopv2`, GitHub tags `desktop-v2-v*`.
