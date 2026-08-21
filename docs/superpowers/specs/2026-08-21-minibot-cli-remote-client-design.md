# minibot-cli remote client (auth + chat + status + sessions)

Date: 2026-08-21  
Status: approved (pending implementation)

## Goal

Grow `@liuyidi/minibot-cli` (bin: `minibot`) into a **remote Gateway client** whose surface is **auth + chat + status + sessions**, matching the Codex / Claude Code / Gemini CLI mental model: **login credentials are what chat uses**. Do not copy nanobot’s process-in-CLI runtime launcher, and do not build a Claude-scale Ink/tools agent in this package.

## Decisions

| Item | Choice |
| --- | --- |
| Bin owner | npm `@liuyidi/minibot-cli` → `minibot` |
| Python `minibot` | Remains Gateway process (`uvicorn`); rename to `minibot-server` optional later |
| Scope | `login` / `logout` / `whoami` / `status` / `sessions` / `chat` only |
| Transport | `@liuyidi/minibot-client` (`@minibot/client`) L0 bootstrap + L1 REST + L2 WS |
| Default gateway | `http://127.0.0.1:8766` via `MINIBOT_API_URL` / `--base-url` |
| Auth product path | mini-auth device login → Gateway accepts that identity for bootstrap (Phase B) |
| Auth bypass | `MINIBOT_AUTH_SECRET` / `--secret` for local/CI only |
| Chat UI | Streaming stdout + readline REPL; no Ink in v1 |
| Default no-args | Phase C later: bare `minibot` ≡ `chat` |
| Roadmap | **Phase A then Phase B on the same plan** (CLI shippable with bypass; B closes the login→chat loop) |

## Out of scope

- `gateway start|stop|logs|install-service`
- `onboard` wizard, `webui` launcher
- `channels` / `plugins` / LLM `provider login`
- Embed `AgentLoop` / `--embed` chat
- Full Ink TUI, slash-command suite (`/resume`, `/compact`, …) beyond a tiny Phase C set
- Copying Claude Code’s local tool runner into the CLI

## References (why this shape)

- **Codex**: `login` / `login --device-auth` / `logout`; same stored identity drives the agent; headless via device code or API key.
- **Claude Code**: `/login` + credential store; same OAuth material hits the API; env token for CI; `/status` for diagnosis.
- **Gemini CLI**: default REPL + `-p` one-shot; OAuth or API key; sessions as chat affordances.
- **nanobot CLI**: useful for command *names* (`agent`, `status`), not for embedding the runtime inside the client package.
- **Internal**: `docs/client-api.md` M5/M6 (CLI remote via Client API).

## Command surface

| Command | Behavior |
| --- | --- |
| `login` | Existing mini-auth device flow → `~/.minibot/session.json` |
| `logout` | Clear session file |
| `whoami` | Print account from session (offline-ish) |
| `status` | Auth session presence/expiry + gateway `health` + which auth path would be used + bootstrap ok/fail |
| `sessions list` | REST list |
| `sessions show <id>` | Thread / summary |
| `sessions delete <id>` | Delete |
| `chat` | Interactive REPL over WS |
| `chat -m "..."` | One-shot turn; exit after `stream_end` |

Global options / env:

- `--base-url` / `MINIBOT_API_URL` (gateway)
- `--auth-url` / `MINIBOT_AUTH_URL` (mini-auth; login only)
- `--config-dir` / `MINIBOT_CONFIG_DIR`
- `--secret` / `MINIBOT_AUTH_SECRET` (bypass → `X-Minibot-Auth`)

## Architecture

```text
minibot-cli
  ├── auth/session          # ~/.minibot/session.json (existing)
  ├── gateway/              # createClient + credential resolution
  ├── commands/
  │     status | sessions | chat
  └── @minibot/client
        └── Gateway :8766 (Python package)
```

CLI never imports Python agent loop. All agent I/O goes through Client API.

## Credential resolution (Claude-like precedence)

When building `createClient` / bootstrap:

1. **Secret bypass** — `MINIBOT_AUTH_SECRET` or `--secret` → `getSecret()` → `X-Minibot-Auth`
2. **Login session** — `session.json` access token (Phase B: sent so Gateway can mint a short-lived API/WS token)
3. **Anonymous** — no credential; works only if Gateway allows unauthenticated bootstrap (local open auth)

`status` must print which path is active.

## Phased delivery

### Phase A — CLI remote surface (bypass / open auth)

- Depend on `@minibot/client` (workspace / published alias).
- Implement `status`, `sessions *`, `chat` / `chat -m`.
- Accept local gateway with no auth or `--secret`.
- Document: start Python gateway separately, then use CLI.
- Acceptance: against `http://127.0.0.1:8766`, list sessions and complete one streamed chat turn.

### Phase B — login → chat (same roadmap)

- Extend Gateway bootstrap so a **mini-auth Bearer access token** is accepted in addition to cookie / shared secret.
- **Preferred contract (B2):** `GET /webui/bootstrap` (and `/auth/bootstrap`) accepts `Authorization: Bearer <mini-auth access_token>`, validates via mini-auth userinfo, then `issue_token(account=…)` as today.
- Alternative (B1, only if B2 is awkward): `POST /auth/cli/session` then existing bootstrap — avoid unless necessary.
- Update `@minibot/client` bootstrap to pass Bearer when `getAccessToken` (or equivalent) is provided; CLI wires session store → client.
- Acceptance: `minibot login` then `minibot chat -m "hi"` against a Gateway with `mini_auth` enabled **without** `--secret`.
- Account isolation: bootstrapped WS token must carry the mini-auth account (same as cookie bootstrap isolation tests).

### Phase C — polish (optional follow-on)

- Bare `minibot` invokes `chat`.
- Minimal in-REPL helpers: `/exit`, `/status`, maybe `/sessions`.
- Refresh mini-auth token when near expiry.

## Chat behavior (Phase A)

1. Resolve credentials → `createClient({ baseUrl, getSecret? })` (A) / + Bearer (B).
2. `bootstrap()` → `ws.connect`.
3. `newChat` or `attach` existing session id if `--session` provided.
4. Stream `delta` / reasoning to stdout; on `stream_end` finish turn.
5. REPL: readline prompt; Ctrl+C → `abort`; `/exit` quits.
6. HITL `approval_required`: print clear message; full interactive approve/reject can ship in a later slice if needed for DoD — prefer minimal reject-by-default or prompt y/n if API already supports it.

## Error handling

- Gateway down → non-zero exit, one-line “start the Python gateway” hint.
- 401 → tell user to `login` or pass `--secret` (depending on Gateway mode).
- Missing session on cloud/auth-required Gateway → prompt `minibot login`.
- HTML/non-JSON from bootstrap → gateway mismatch message (existing client `ApiError` patterns).

## Testing

| Layer | Coverage |
| --- | --- |
| CLI unit | Credential precedence, `status` output branches, sessions argv parsing |
| CLI integration | Mock fetch/WS for one-shot `chat -m` |
| Gateway (B) | Bearer bootstrap success, bad token 401, account isolation on issued token |
| Manual | Local gateway + secret; after B: login then chat |

## Docs to update when implementing

- `packages/minibot-cli/README.md` — install, env, A/B flows
- `docs/client-api.md` — M5/M6 point at this package; note B2 bootstrap Bearer
- Optionally one line in `docs/getting-started.md`

## Success criteria

1. User can `npm i -g @liuyidi/minibot-cli` (or workspace link) and run auth commands as today.
2. With Gateway up, `sessions` and `chat` work via Client API (Phase A).
3. After Phase B, login session alone is enough for chat on mini_auth Gateways.
4. No new CLI path embeds AgentLoop.
5. Python entry remains the way to run the server process.
