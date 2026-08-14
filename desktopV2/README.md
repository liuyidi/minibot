# minibot Desktop V2 (local gateway)

[简体中文](./README.zh.md) | English

> Experimental tree next to `desktop/` (remote thin shell).  
> Design: [`docs/superpowers/specs/2026-08-14-desktop-local-gateway-design.md`](../docs/superpowers/specs/2026-08-14-desktop-local-gateway-design.md)  
> Plan: [`docs/superpowers/plans/2026-08-14-desktop-v2-local-gateway.md`](../docs/superpowers/plans/2026-08-14-desktop-v2-local-gateway.md)

**Defaults to `http://127.0.0.1:8766`**, spawns a local minibot engine, and serves the WebUI from that gateway. Chats / config live under Tauri app data (`engine/` via `MINIBOT_SERVER_DATA_DIR`).

## Architecture (end-to-end)

```text
┌─────────────────────┐     spawn      ┌──────────────────────────────┐
│  desktopV2 (Tauri)  │ ─────────────► │  minibot sidecar / PATH      │
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
cd desktopV2
npm install
npm run dev
```

Useful overrides:

| Env | Purpose |
|---|---|
| `MINIBOT_API_BASE` | Gateway URL (default `http://127.0.0.1:8766`) |
| `MINIBOT_SIDECAR` | Force engine binary (freeze output or `uv` shim) |

## 2. Login flow (system browser)

Desktop unauthenticated UI shows a welcome / Sign in screen. **Packaged “production” installs still use the local gateway on `127.0.0.1:8766`** (not `bot.liuyidi.me`); only the IdP is public (`auth.liuyidi.me`).

Flow:

1. WebUI sees `minibotHost.openLogin` → creates `desktop_login_id` → opens the system browser to the **loopback** URL  
   `http://127.0.0.1:8766/auth/login?desktop=1&desktop_login_id=…&next=…`  
   (`absoluteAuthUrl` = WebView `window.location.origin`, i.e. the local gateway)
2. Gateway 302s to mini-auth (`https://auth.liuyidi.me/oauth/authorize`); after login, **redirect_uri** returns to loopback  
   `http://127.0.0.1:8766/auth/mini-auth/callback` (session handoff is HTTP, not `minibot://`).  
   That callback must be allowlisted on the mini-auth client.
3. Callback stores a short-lived handoff and redirects the **browser** to `/auth/desktop/done`.
4. In-app WebUI polls `GET /auth/desktop/handoff?id=…`, then navigates to  
   `/auth/desktop/session?token=…` to set the cookie.
5. Optional: `minibot://auth/done` only **focuses** the app window (no second PKCE). macOS  
   `tauri:dev` does **not** register URL schemes — build/register a `.app` once:

```bash
cd desktopV2 && ./scripts/register-url-scheme.sh
```

Note: Cursor/`HTTP_PROXY` must not break CONNECT from the local gateway to `auth.liuyidi.me` (gateway httpx uses `trust_env=False` for mini-auth).

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
cd desktopV2
./scripts/prepare-sidecar.sh                    # or pass <triple>
npm run build:app                               # .app only
# npm run build                                 # app + dmg + collect
```

`prepare-sidecar.sh` copies the onedir into `src-tauri/resources/minibot-sidecar/`  
(gitignored; listed in `tauri.conf.json` → `bundle.resources`). Packaged apps resolve that path as label `bundled`.

## 5. CI publish + Feishu notify

Workflow: [`.github/workflows/publish-desktop-v2.yml`](../.github/workflows/publish-desktop-v2.yml)

| | |
|---|---|
| Trigger | **Manual** `workflow_dispatch` only (until download cutover) |
| Matrix | macOS arm64 / macOS x86_64 (`macos-13`) / Linux / Windows |
| Steps | `uv sync` → WebUI build → freeze → prepare → `tauri-action` |
| Release tag | `desktop-v2-v__VERSION__` (does **not** collide with thin-shell `v*`) |
| Notify | On success → ServerlessShip → Feishu (`channel: GitHub Release (Desktop V2)`) |

Thin shell stays on [`.github/workflows/publish-desktop.yml`](../.github/workflows/publish-desktop.yml) (`desktop/`, tags `v*`).

Download-page cutover to V2 installers is **gated** until CI artifacts are verified.

## vs V1

| | desktop (V1) | desktopV2 |
|---|---|---|
| Default API | `bot.liuyidi.me` | `127.0.0.1:8766` |
| Process | none | sidecar / `minibot` |
| Auth | same-origin Web | system browser + HTTP handoff (+ optional `minibot://` focus) |
| Bundle id | `me.liuyidi.minibot.desktop` | `me.liuyidi.minibot.desktopv2` |
| Release | `Publish Desktop` → `v*` | `Publish Desktop V2` → `desktop-v2-v*` |
