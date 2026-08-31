# Changelog

All notable user-facing changes to **minibot** are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/).
Versions follow SemVer for product narrative. Package metadata may lag until a formal release.

简体中文：[CHANGELOG.zh.md](./CHANGELOG.zh.md)

---

## [Unreleased]

### Added

- WebUI startup is instrumented with OpenTelemetry boot spans (`js_boot` → `first_interactive`), exported via OTLP for Tempo / Grafana; see [`docs/observability-web-boot.md`](./docs/observability-web-boot.md).
- Gateway exposes a Prometheus `/metrics` endpoint for latency and request monitoring.
- Mobile handoff (`/#/open`) is configurable from the gateway: store URLs, fallback download URL, title, and description via settings / `GET /auth/mobile-entry`.
- Thread titles can be renamed inline: hover shows a pencil control, edit in place, and save on blur.

### Changed

- WebUI sidebar, composer, and top chrome follow a Doubao-like hierarchy: shared row metrics, brand band spacing, and no green input focus rings.
- Top utility nav (skills, automations, channels, …) and chat-list selection are mutually exclusive.
- WebUI `thread/` is organized into shell / composer / messages / activity / preview / viewport, with `ThreadShell` thinned (file preview, feedback, message cache extracted).

## [1.0.20] - 2026-08-27

### Changed

- The mobile handoff `/#/open` page now stays in Chinese copy regardless of browser locale.

## [1.0.19] - 2026-08-27

### Changed

- The mobile handoff entry now uses the hash route `/#/open`, and the dedicated Python `/open` page dispatcher was removed.

## [1.0.18] - 2026-08-27

### Added

- Mobile handoff page at `/open` with app-opening banner and system-style launch prompt.

### Changed

- The `/open` page now opens the minibot app via `minibot://` on iOS and Android with platform-specific fallback behavior.

## [1.0.17] - 2026-08-25

### Added

- Public download page at `https://liuyidi.me/minibot/download/` (no login). Legacy `bot.liuyidi.me/#/download/` redirects there.

### Fixed

- Revert Langfuse demo-key skip so chat 👍/👎 feedback works again when demo keys are configured.
- Desktop local engine now uses `~/.minibot` (workspace at `~/.minibot/workspace`) instead of the Tauri app-data `engine/` folder.
- Chat: first user messages render from the top of the thread instead of sticking to the composer.
- Skills: localized builtin skill titles/descriptions in the skills hub and `/` slash palette (zh-CN / en).

## [1.0.16] - 2026-08-23

### Fixed

- First-run WebUI: auto-select platform model, seed default MCP connectors, production download/devui portal links, settings workspace overview, empty chat layout, sidebar brand logo, and skills i18n gaps.
- macOS DMG installer background now shows drag-to-Applications artwork.
- Langfuse: ignore demo keys (`pk-lf-demo` / `sk-lf-demo`) so MLF no longer routes traces to the shared demo project.

## [1.0.15] - 2026-08-21

### Added

- CLI (`minibot`) remote client: `status`, `sessions`, and `chat` over the shared Client API.
- Gateway bootstrap accepts mini-auth `Authorization: Bearer` so CLI login can open cloud/local chat without a shared gateway secret.

## [1.0.14] - 2026-08-20

### Added

- Settings profile shows a bound Google account (display name), same pattern as GitHub.

### Fixed

- Web sign-out now clears mini-auth SSO (navigates to `/auth/logout`) instead of local-only clear + login, which immediately signed the user back in.
- Switching Default Permission / Full Access now persists on the current chat, and Full Access no longer prompts for out-of-sandbox `exec`.

### Changed

- Public desktop downloads ship the local-gateway app. Source tree is `desktop/` (renamed from `desktopV2/`); the old remote thin-shell tree is gone.
- `liuyidi.me` home uses Direction 02: white canvas, entry tiles, black “Open Agent” button.
- `liuyidi.me` home is a minibot product page: surfaces, channels, and agent capabilities, plus Desktop download.

## [1.0.13] - 2026-08-17

### Changed

- Copy login link button shows「Copied」for 3 seconds after a successful copy.
- Removed unused desktop IdP logged-out landing page (logout is local-only).

## [1.0.12] - 2026-08-17

### Added

- Desktop login: open `auth.liuyidi.me` directly in the system browser with `minibot://` callback; waiting UI supports copy login link / retry.

### Changed

- Sign-out requires confirmation and clears only the local session (no browser IdP logout), so re-login can reuse an existing account.

## [1.0.11] - 2026-08-17

### Fixed

- Desktop no longer shows the red ``local-webui`` debug badge (loopback gateway is normal for Desktop V2).

## [1.0.10] - 2026-08-17

### Added

- Desktop local gateway can use cloud `/platform/v1` so platform models work for every signed-in user without shipping vendor API keys in the `.app`. Short-lived desktop inference tokens and a separate desktop daily budget live on `bot.liuyidi.me`.

## [1.0.9] - 2026-08-15

### Added

- Desktop V2: freeze minibot as a PyInstaller onedir sidecar, bundle it into the Tauri app, and publish via a dedicated `Publish Desktop V2` workflow (Feishu notify through ServerlessShip).
- Desktop: finish local OAuth handoff (system browser → HTTP callback → in-app session) and welcome Sign-in UI.

## [1.0.8] - 2026-08-15

### Changed

- Tool approval is now boundary-based: in-workspace read/write, `write_memory`, ordinary sandboxed `exec`, and MCP (temporarily trusted by default) run without prompts. Only sandbox-escaping `exec` (e.g. `sudo`, `/etc`, `~`, pipe-to-shell) requires HITL. MCP trust UI deferred.
- Browser WebUI no longer offers project selection under the composer; it stays on the default workspace. Desktop (native host) still can pick a local folder.

## [1.0.7] - 2026-08-14

### Fixed

- WebSocket / Feishu / WeChat / cron messages on the bus now carry `user_id` so BusWorker binds the correct per-user session store (fixes `unknown_chat` and a stuck “model is replying” spinner).
- WebUI clears streaming state on `goal_status: idle` and `error`, not only on `turn_end`.
- WebUI production build no longer fails on an unused type import in the stream hook.

## [1.0.6] - 2026-08-14

### Fixed

- Authenticated requests now bind the default workspace under `users/<user_id>/workspace` instead of the shared server `/workspace`.

## [1.0.5] - 2026-08-14

### Fixed

- WebUI bootstrap now copies the mini-auth account into the short-lived API/WS token so chat sessions stay isolated per user.
- WebSocket connections bind the same user principal as REST, so new chats land in the correct per-user store.

### Added

- Profile page can show GitHub account bind status from mini-auth.

## [1.0.4] - 2026-08-14

### Fixed

- Profile page no longer briefly shows the `minibot` fallback name while auth account details are still loading.

### Added

- Per-user runtime scoping for IM setup state, workspace payloads, and observability tags, with legacy data migration on startup.

## [1.0.3] - 2026-08-14

### Added

- Settings now includes a personal profile page for nickname, randomized default avatar, user ID, and registration date.
- Token usage dashboard UI is prepared on the profile page and stays hidden until a backend endpoint is available.
- Mini-auth account payloads now pass through user id and created_at for account details.

### Changed

- Sidebar account menu can open the profile page directly and shows the local profile avatar.

## [1.0.2] - 2026-08-13

### Changed

- Production auth now uses mini-auth end to end, with HTTPS-safe callback URLs behind the reverse proxy.
- Legacy gateway secret fallback is disabled on production hosts so `bot.liuyidi.me` goes straight to the shared login flow.

### Fixed

- The ECS deploy workflow now works with the current repo checkout and `.env` handling.
- The auth handoff no longer regresses to `http://` callback URLs when behind Aliyun / Tencent reverse proxies.

## [1.0.1] - 2026-08-13

### Added

- Unified versioning across WebUI, desktop, and the backend.
- Added `/compact` in the chat composer to compact conversation context.
- Added unified Web / server GitHub Actions deployment to ECS with Feishu notifications.

---

## [1.0.0] - 2026-08-11

### Added

- Rust-wrapped desktop builds for macOS, Windows, and Linux, plus the download page and the end-to-end build and packaging flow.
- Build and deployment automation with GitHub Actions, webhooks, and ServerlessShip notifications to Feishu.

---

## [0.9.0] - 2026-08-09

### Added

- Cursor-style `/` skill picker and `@` mention chips in the composer.

### Fixed

- Mention chips overlapping following text in message bubbles.
- WebUI production TypeScript build errors.

---

## [0.8.0] - 2026-08-06

### Added

- Skills · Connectors hub with search, sections, and install / custom / import flows.
- Skills WebUI closed loop with available / detail APIs and prompt filters.
- Heartbeat (default 1h) and Dream thin consolidation (off by default / 2d) as system cron jobs.
- WebUI sidebar pin, archive, and rename persistence for sessions.

### Changed

- Settings reorganized into a thin shell with clearer section pages.
- Automations API hardened (origin / POST mutate / cascade on session delete).

### Fixed

- Tool results leaking into the chat transcript.
- Sidebar persist using the correct POST mutation path.

---

## [0.7.0] - 2026-08-06

### Added

- Platform built-in multi-slot models via env (`.env.models`), with Models radio picker and Auto (first available key).
- Identity anchoring and live-chat model resolution that honors Auto / platform selection.

---

## [0.6.0] - 2026-08-06

### Added

- Media / file preview in chat (Phase 8.1).

### Changed

- WebUI composer polish for attachments and file-aware flows.

---

## [0.5.1] - 2026-08-05

### Added

- IM channel cards: edit / remove menu and enable switch.

### Changed

- Sidebar split into **Chats** and **Channels**; faster IM QR setup.
- Monorepo branding consolidated around minibot.

---

## [0.5.0] - 2026-08-05

### Added

- Feishu channel with QR setup and DM pairing.
- WeChat (iLink) channel with QR login and DM pairing.
- IM channels, scheduled tasks, skills, and knowledge promoted to the main sidebar.

---

## [0.4.0] - 2026-08-05

### Added

- Optional **E2B** microVM backend for the `exec` tool (local backend remains default).

---

## [0.3.1] - 2026-08-05

### Added

- Daily LLM usage budget kill-switch with WebUI visibility when the budget is hit.
- Score queue wiring for observability scores.

---

## [0.3.0] - 2026-08-03

### Added

- Human-in-the-loop (HITL) approvals for high-risk tools (persist + REST / WebSocket cards). See [docs/human-in-the-loop.md](./docs/human-in-the-loop.md).

---

## [0.2.0] - 2026-07-31

### Added

- Desktop app as a remote thin shell over the same minibot REST + WebSocket API.

### Fixed

- Disabled WebSocket permessage-deflate for iOS `URLSessionWebSocketTask` compatibility.

---

## [0.1.0] - 2026-07-30

First publicly demoable cut (after the `0.0.x` capability build-up).

### Added

- **Fallback** across user model presets on provider errors (toast / runtime visibility).
- Shared client package (`@liuyidi/minibot-client`).
- Public `/status` gateway health and availability page.
- Optional mini-langfuse soft observability path (off by default).
- Optional minikb knowledge tools + Knowledge UI.

---

## [0.0.10] - 2026-07-28

### Added

- Provider registry and **Anthropic** Messages implementation (chat + streaming).
- Providers Dev UI page; MVP config import wizard.

---

## [0.0.9] - 2026-07-27

### Added

- WebSocket **streaming** replies (`delta` / `reasoning_*` / `stream_end`).
- **Stop** to abort the in-flight turn.

---

## [0.0.8] - 2026-07-26

### Added

- Cron / automations to trigger agent turns on a schedule (`at` / `every` / `cron`).
- Automations Dev UI (`/ui/automations.html`).

---

## [0.0.7] - 2026-07-25

### Added

- User **model presets** (BYOK): create / switch / activate OpenAI-compatible endpoints.
- Settings sidebar Model section.

---

## [0.0.6] - 2026-07-24

### Added

- **MCP** server presets (stdio / SSE / HTTP) with tools injected into the agent registry.
- MCP Insight UI (templates / Invoke / pipeline).

---

## [0.0.5] - 2026-07-22

### Added

- **Memory** file read/write and system-prompt injection.
- **Skills** discovery (builtin + workspace) injected into agent context.
- Memory / Skills Dev UI pages.

---

## [0.0.4] - 2026-07-18

### Added

- Context assembly (identity / workspace bootstrap files).
- Long-thread **context compaction** (summary + keep recent messages).
- Context usage meter and `/ui/context.html`.

---

## [0.0.3] - 2026-07-14

### Added

- Sync subagent **spawn** (block until child finishes; result returns to parent turn).

---

## [0.0.2] - 2026-07-08

### Added

- Real coding tools: filesystem read/write/edit, local **exec**, web search / fetch.
- Chat **tool-call cards** (process narration + done card; post-hoc replay).
- Workspace boundaries and basic tool-safety denials.

---

## [0.0.1] - 2026-07-01

### Added

- Local-first **FastAPI** agent runtime (AgentLoop + MessageBus + ReAct Runner).
- Multi-session **JSONL** history; OpenAI-compatible provider.
- Embedded Dev UI (`/ui/` Chat / Trace / Runtime, …) and product WebUI path skeleton.
- Bootstrap auth (`X-Minibot-Auth` / Bearer) when a secret is configured.
