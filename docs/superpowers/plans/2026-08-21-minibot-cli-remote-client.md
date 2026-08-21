# minibot-cli remote client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase A (`status` / `sessions` / `chat` via `@minibot/client`) then Phase B (Gateway bootstrap accepts mini-auth Bearer) so `login` credentials drive chat.

**Architecture:** CLI resolves credentials → `createClient` → bootstrap/REST/WS. Python Gateway stays a separate process. Phase A works with open auth or `--secret`; Phase B extends bootstrap to accept `Authorization: Bearer <mini-auth access_token>`.

**Tech Stack:** TypeScript, cac, vitest, `@minibot/client` (file: sibling), FastAPI Gateway (Phase B).

## Global Constraints

- Bin: `minibot` from `@liuyidi/minibot-cli` only for auth+chat+status+sessions
- No embed AgentLoop; no gateway start/stop in CLI
- Default gateway: `http://127.0.0.1:8766`
- Credential precedence: secret → login session → anonymous
- Phase B preferred: extend `GET /webui/bootstrap` (B2)
- Chat UI: stdout stream + readline; no Ink

## File map (Phase A)

| Path | Role |
| --- | --- |
| `packages/minibot-cli/package.json` | Add `@minibot/client` dep |
| `src/config/env.ts` | `gatewayBaseUrl`, `authSecret`; fix API vs auth URLs |
| `src/gateway/credentials.ts` | Resolve auth path + secret/session |
| `src/gateway/create-gateway-client.ts` | Wrap `createClient` |
| `src/commands/status/*` | Status command |
| `src/commands/sessions/*` | list / show / delete |
| `src/commands/chat/*` | REPL + `-m` |
| `src/commands/root/command.ts` | Register commands |
| `README.md` | Document flows |

## File map (Phase B)

| Path | Role |
| --- | --- |
| `minibot/.../api/routes/auth.py` | Bearer mini-auth on bootstrap |
| `packages/minibot-client/src/bootstrap.ts` + `createClient.ts` | Pass Bearer |
| CLI `create-gateway-client` | Wire session access token |

---

### Task 1: Env + credentials + client wiring

**Files:**
- Modify: `packages/minibot-cli/package.json`
- Modify: `packages/minibot-cli/src/config/env.ts`, `env.test.ts`
- Create: `packages/minibot-cli/src/gateway/credentials.ts`, `credentials.test.ts`
- Create: `packages/minibot-cli/src/gateway/create-gateway-client.ts`

- [ ] **Step 1:** Add dependency `"@minibot/client": "file:../minibot-client"` and run `npm install` in `packages/minibot-cli`.
- [ ] **Step 2:** Extend `loadEnv` with `gatewayBaseUrl` (default `http://127.0.0.1:8766` from `MINIBOT_API_URL`) and `authSecret` from `MINIBOT_AUTH_SECRET`. Keep `authBaseUrl` from `MINIBOT_AUTH_URL` defaulting to `https://auth.liuyidi.me` (stop using `MINIBOT_API_URL` as auth fallback).
- [ ] **Step 3:** Implement `resolveCredentials({ secret?, configDir? })` returning `{ path: "secret"|"session"|"anonymous", secret?, accessToken? }` with precedence secret → non-expired session → anonymous.
- [ ] **Step 4:** `createGatewayClient({ baseUrl, secret?, accessToken? })` → `createClient` with `getSecret` when secret set (Phase A ignores accessToken for bootstrap until B).
- [ ] **Step 5:** `npm test` in minibot-cli — pass.

### Task 2: `status` command

**Files:**
- Create: `src/commands/status/command.ts`, `run-status.ts`, `index.ts`
- Modify: `src/commands/root/command.ts`, `src/commands/index.ts`

- [ ] Print auth session summary, credential path, gateway health, bootstrap attempt result.
- [ ] Options: `--base-url`, `--secret`, `--config-dir`.
- [ ] Unit-test pure formatting / path labels if extracted; otherwise smoke via mocked client later.
- [ ] `npm test` + `npm run build`.

### Task 3: `sessions` commands

**Files:**
- Create: `src/commands/sessions/command.ts`, `run-sessions.ts`, `index.ts`
- Modify: root command registration

- [ ] Subcommands: `list`, `show <id>`, `delete <id>`.
- [ ] Bootstrap then call `client.sessions.*`.
- [ ] Non-zero exit on ApiError; hint for 401.

### Task 4: `chat` command

**Files:**
- Create: `src/commands/chat/command.ts`, `run-chat.ts`, `stream-turn.ts`, `index.ts`

- [ ] `chat -m` one-shot: bootstrap, connect WS, newChat or attach `--session`, sendMessage, print deltas, wait stream_end.
- [ ] Interactive: readline loop; `/exit`; Ctrl+C abort.
- [ ] On `approval_required`: print message and reject (or y/n if trivial).
- [ ] Test stream-turn helper with fake event sequence.

### Task 5: README Phase A

- [ ] Document install, env vars, start gateway, `status` / `sessions` / `chat`, `--secret`.

### Task 6: Phase B Gateway Bearer bootstrap

**Files:**
- Modify: `minibot/src/minibot/api/routes/auth.py`, tests
- Modify: `packages/minibot-client` bootstrap/createClient
- Modify: CLI create-gateway-client to pass Bearer via client option

- [ ] Bootstrap accepts Bearer mini-auth token → userinfo → issue_token(account).
- [ ] Client: `getAccessToken` → `Authorization: Bearer`.
- [ ] CLI: session path uses accessToken.
- [ ] Pytest + vitest green; manual login→chat without secret.

---

**Execution:** implement Tasks 1–5 (Phase A) in this session; Task 6 (Phase B) immediately after A is green.
