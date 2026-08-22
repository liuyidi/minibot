# minibot Desktop (local gateway)

[简体中文](./README.zh.md) | English

> Default desktop app.  
> Design: [`docs/superpowers/specs/2026-08-14-desktop-local-gateway-design.md`](../docs/superpowers/specs/2026-08-14-desktop-local-gateway-design.md)  
> Plan: [`docs/release-process.md`](../docs/release-process.md)

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

To test **`minibot://` browser callbacks** on a dev machine (same as production):

```bash
cd desktop
./scripts/deeplink/register-url-scheme.sh
```

`npm run dev` does not register `minibot://` with the OS; the script builds a debug `.app` and runs `lsregister`. See [`scripts/README.md`](./scripts/README.md) (Chinese).

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
./scripts/sidecar/prepare-sidecar.sh              # or pass <triple>
npm run build:app                                 # .app only (ad-hoc)
# npm run build                                   # app + dmg (ad-hoc)
```

Script layout: [`scripts/README.md`](./scripts/README.md) (Chinese).

Installable artifacts: `src-tauri/target/release/bundle/` (macOS: `macos/minibot.app`, `dmg/minibot_*.dmg`).  
Renderer static files: `src-tauri/target/frontend-dist/` (build intermediate, not the distributable).

`sidecar/prepare-sidecar.sh` copies the onedir into `src-tauri/resources/minibot-sidecar/`  
(gitignored; listed in `tauri.conf.json` → `bundle.resources`). Packaged apps resolve that path as label `bundled`.

### macOS release signing + notarization (Developer ID)

Never commit secrets. Copy `scripts/signing/apple-signing.env.example` → `scripts/signing/apple-signing.env` (gitignored), fill Apple credentials, then:

```bash
cd desktop
./scripts/signing/build-signed-macos.sh           # host triple
# ./scripts/signing/build-signed-macos.sh aarch64-apple-darwin
```

This runs: codesign preflight → prepare sidecar → **sign sidecar Mach-O** → `npm run build` (Tauri signs the app and notarizes) → verify artifacts. Run in **Terminal.app** (Cursor agents cannot access Keychain).

| Variable | Local build | GitHub Actions |
|---|---|---|
| `APPLE_SIGNING_IDENTITY` | required | same-named secret |
| `APPLE_TEAM_ID` | required | same-named secret |
| `APPLE_ID` | required | same-named secret |
| `APPLE_PASSWORD` | app-specific password | same-named secret |
| `APPLE_CERTIFICATE` | usually omit (Keychain) | base64 `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | usually omit | `.p12` export password |

Wire the same secrets into the `tauri-action` step in [`.github/workflows/publish-desktop.yml`](../.github/workflows/publish-desktop.yml) for notarized macOS release assets. Keep `signingIdentity: "-"` in `tauri.conf.json` for local ad-hoc; CI overrides via `APPLE_SIGNING_IDENTITY`.

### Open an ad-hoc local build

Local `npm run build` (without `build-signed-macos.sh`) uses ad-hoc signing. If Gatekeeper says the app is “damaged”:

```bash
# After dragging minibot.app into /Applications
xattr -cr "/Applications/minibot.app"
# If Gatekeeper still says “damaged”:
codesign --force --deep --sign - "/Applications/minibot.app"
open "/Applications/minibot.app"
```

## 5. CI publish + Feishu notify

Workflow: [`.github/workflows/publish-desktop.yml`](../.github/workflows/publish-desktop.yml)

| | |
|---|---|
| Trigger | Unified **Release** tag `v*`, or manual `workflow_dispatch` |
| Matrix | macOS arm64 / macOS x86_64 (`macos-15-intel`) / Linux / Windows |
| Steps | `uv sync` → WebUI build → freeze → `sidecar/prepare-sidecar.sh` → `tauri-action` |
| Release tag | `desktop-v__VERSION__` (does **not** collide with orchestration `v*`) |
| OSS | **Sync Desktop Release to OSS** runs after a successful publish |
| Notify | On success → ServerlessShip → Feishu; OSS sync posts again |

Public download page: `https://bot.liuyidi.me/#/download/` (manifest `https://downloads.liuyidi.me/minibot/releases.json`).

Installed app identity: product name `minibot`, bundle id `me.liuyidi.minibot.desktop`, GitHub tags `desktop-v*`.
