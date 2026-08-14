# Desktop local gateway (desktopV2) — Design

Date: 2026-08-14  
Status: approved (brainstorm)  
Scope: new `desktopV2/` (copy of `desktop/`), local minibot sidecar packaging, `minibot://` OAuth, related gateway / mini-auth / WebUI hooks  
Supersedes deferred items in [`2026-07-31-desktop-remote-shell-design.md`](./2026-07-31-desktop-remote-shell-design.md) (local engine / bundled runtime). Existing `desktop/` remote thin shell remains until V2 is ready to replace it.

## Problem

Current `desktop/` is a **remote thin shell**: it opens `https://bot.liuyidi.me` (or a configured `api_base`) and does **not** start a local minibot process. Conversations and workspace data live on the server.

Product requirement: **desktop conversations must persist on the user’s machine**, with a user-invisible local gateway (not a “dev environment” the user has to start). Auth remains **mini-auth**, via **system browser** and return to the app over a **custom URL scheme**.

## Goals

1. Double-click install → silent local gateway → WebUI in the window → chat data under local app data.
2. Login: system browser → mini-auth → `minibot://auth/callback` → app session.
3. Ship OAuth + local gateway in the **same** release of desktop V2 (no “local-only without login” interim for the shipped V2 product).
4. Isolate risk: implement in **`desktopV2/` on a feature branch**; keep shipping `desktop/` until cutover.

## Non-goals (V1 of desktopV2)

- Remote / local dual-mode switch in the UI.
- Dynamic listen port for OAuth redirect (scheme-based callback instead).
- HTTPS bridge page (optional later if an IdP forbids custom schemes).
- Rewriting the agent runtime into Rust / in-process PyO3.
- Replacing nanobot-style “CLI + system browser only” as the primary desktop UX (we keep a native Tauri window).

## Decisions

| Topic | Choice |
|-------|--------|
| Runtime packaging | Frozen binary sidecar (PyInstaller or Nuitka), Tauri `externalBin` |
| Default connectivity | Local only (`http://127.0.0.1:8766`) |
| Auth | mini-auth + system browser + `minibot://auth/callback` |
| Engineering isolation | Copy `desktop/` → `desktopV2/`; branch `feat/desktop-v2-local-gateway` |
| Existing `desktop/` | Unchanged remote shell until V2 validated |

## Architecture

```text
User opens minibot.app (desktopV2)
        │
        ▼
┌─────────────────── Tauri shell ───────────────────┐
│  1. Spawn bundled minibot sidecar (silent)          │
│  2. Wait until local gateway ready                  │
│  3. Navigate WebView → http://127.0.0.1:8766/       │
│  4. Register / handle minibot:// deep links         │
│  5. On quit: kill sidecar process tree              │
└──────────────────┬────────────────────────────────┘
                   │ loopback only
                   ▼
┌──────────── minibot sidecar (frozen) ─────────────┐
│  FastAPI gateway + embedded webui/dist              │
│  DATA_DIR = app data (per-user dirs after login)    │
│  AUTH_PROVIDER = mini_auth → hosted mini-auth       │
└───────────────────────────────────────────────────┘

Login:
  App → system browser → mini-auth authorize
     → minibot://auth/callback?code=&state=
     → OS focuses app → shell + sidecar complete PKCE
     → WebView refreshes authenticated
```

Same Client API contract as Web (`bootstrap` / REST / WS). Only process placement and auth return channel change.

## Lifecycle and packaging

### Start / stop

1. On launch, bind sidecar to **`127.0.0.1:8766`** (fixed). If the port is taken, fail with a user-facing “cannot start local engine” and a logs affordance (no raw Python traceback).
2. Env for sidecar (illustrative):
   - `MINIBOT_SERVER_HOST=127.0.0.1`
   - `MINIBOT_SERVER_PORT=8766`
   - `MINIBOT_SERVER_DATA_DIR=<app_data>/engine`
   - `MINIBOT_SERVER_AUTH_PROVIDER=mini_auth`
   - `MINIBOT_SERVER_MINI_AUTH_*` pointing at production mini-auth
   - `MINIBOT_WEBUI_DIST` (or bake dist into the frozen binary)
3. Poll readiness (e.g. reachable `/webui/bootstrap` or health) then navigate.
4. On exit / crash cleanup: terminate sidecar and children; optional pid file for next-start reaping.
5. Dev mode: may spawn `uv run minibot` instead of the frozen binary to speed iteration.

### Build pipeline

1. Build `webui` → `dist`.
2. Freeze `minibot` (+ webui assets) per OS/arch → `minibot-sidecar-<target-triple>`.
3. Place under Tauri `externalBin` naming conventions.
4. `tauri build` for desktopV2 → platform installers.
5. Align shell and sidecar versions with existing release tooling (extend for `desktopV2` paths).
6. CI: separate or matrix job for desktopV2; do not break current `publish-desktop` for `desktop/` until cutover.

Expected installer size grows vs today’s thin shell (bundled Python runtime + deps). Accept as cost of local engine.

## Auth (`minibot://`)

### Flow

1. WebUI detects `window.minibotHost` → login opens **system browser** (not in-WebView navigation).
2. Authorize URL uses PKCE; `redirect_uri=minibot://auth/callback`.
3. After IdP login, OS delivers deep link to the running app (cold start must also accept the URL).
4. Shell forwards callback to sidecar (or completes token exchange with shared state); establish local session; refresh WebView.
5. If the browser blocks automatic scheme open, show an interstitial with an **“Open minibot”** button (user gesture).

### mini-auth

Add to OAuth client `minibot` allowlist:

`minibot://auth/callback`

Keep existing HTTPS callbacks for hosted WebUI.

### Security

- Loopback bind only (`127.0.0.1`), never `0.0.0.0` for desktop default.
- PKCE + single-use short-lived `state`.
- Prefer unique scheme; `minibot://` acceptable for V1; consider reverse-DNS scheme later (`me.liuyidi.minibot`).
- Windows: ensure protocol argv is handled as a deep link (do not treat URL as an Electron/app module path — known class of bugs in other desktop agents).

### Industry notes (context)

- **Codex desktop**: custom scheme `codex://…` after browser auth (sometimes via HTTPS intermediate).
- **WorkBuddy**: browser OAuth then return to desktop session (exact scheme not public; same UX class).
- **RFC 8252**: system browser + loopback **or** private-use URI scheme; avoid embedded WebView password capture.
- Loopback remains a documented fallback if custom schemes prove painful on a given platform.

## Data layout

| Purpose | Location |
|---------|----------|
| Shell config | Tauri app data root |
| Engine sessions / workspace / per-user trees | `{app_data}/engine` via `MINIBOT_SERVER_DATA_DIR` |
| Logs | `{app_data}/logs` |

After mini-auth login, retain existing server isolation model (`users/<user_id>/…`) under the local data root.

## Error handling

| Failure | UX |
|---------|-----|
| Sidecar fail / port 8766 busy | Splash: cannot start local engine + open logs |
| Login timeout / scheme not handled | Retry in app; browser “Open minibot” button |
| Invalid / expired OAuth state | Prompt re-login |
| Sidecar crash | `Crashed` + restart engine (`restartEngine`) |

## Change surface

Large for the **desktop product path**, bounded for the rest of the monorepo:

| Area | Size | Notes |
|------|------|-------|
| `desktopV2/` | Large | Sidecar lifecycle, deep link, drop remote default |
| Sidecar freeze + CI | Large | New artifacts |
| minibot gateway desktop OAuth | Medium | Additive paths; Web hosted flow stays |
| mini-auth redirect allowlist | Small | One URI |
| WebUI host-aware login | Small–medium | Branch when `minibotHost` present |

Hosted `bot.liuyidi.me` behavior should remain intact.

## Engineering plan (repo layout)

```text
branch: feat/desktop-v2-local-gateway
  desktop/          # keep remote thin shell (shipped)
  desktopV2/        # copy of desktop/, then evolve
  docs/superpowers/specs/2026-08-14-desktop-local-gateway-design.md
```

Cutover criteria: desktopV2 manual acceptance pass → point download / publish at V2 → optionally retire or archive `desktop/`.

## Acceptance (manual)

1. Machine **without** system Python: install → open → browser login → return via `minibot://` → chat works.
2. Quit and relaunch: prior conversations still on disk locally.
3. After quit, no orphaned sidecar (or next launch reaps it).
4. Hosted Web login unchanged.

## Implementation follow-ups

1. Write an implementation plan (`docs/superpowers/plans/…`) from this spec.
2. Create branch and copy `desktop/` → `desktopV2/`.
3. Implement in order: sidecar spawn → local WebUI → deep-link OAuth → packaging CI → cutover.

## Open choices for the plan (not blocking this design)

- PyInstaller vs Nuitka for freeze.
- Exact Tauri deep-link plugin vs manual OS registration.
- Whether token exchange runs in the Rust shell or is delegated entirely to the sidecar HTTP API.
