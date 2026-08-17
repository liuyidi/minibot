# Desktop platform models via cloud proxy (Approach A extension)

**Date:** 2026-08-17  
**Status:** implemented (v1 code landed; deploy ECS + rebuild desktop to roll out)  
**Surface:** desktop V2 local gateway + `bot.liuyidi.me` `/platform/v1/*`  
**Related:** [`2026-08-06-platform-models-keys-design.md`](./2026-08-06-platform-models-keys-design.md)

## Goal

Ship desktop clients to other users such that:

1. **Platform builtin models work for everyone** who is logged in (same catalog as the Web demo).
2. **Vendor / operator API keys never ship inside the `.app`** or any distributed template.
3. **Sessions, tools, and files stay on the local sidecar** (desktop V2 local-gateway architecture preserved).
4. **Desktop usage is budgeted separately** from the Web demo counters.

## Non-goals (this slice)

- Moving the full agent loop to the cloud (rejected alternative B).
- Bundling `.env.models` into the desktop package or Application Support seed for end users.
- Sharing one daily budget between Web and desktop.
- Vault / KMS, long-lived device certificates, or a public unauthenticated free tier.
- Changing BYOK behavior (still local → vendor directly).

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Topology | Local gateway; only platform LLM calls go through cloud proxy |
| Auth to proxy | Short-lived **platform inference** Bearer token issued by cloud |
| Identity source | Existing mini-auth login on desktop; exchange for platform token |
| Budget | Separate desktop daily limits on the cloud proxy |
| Proxy shape | OpenAI-compatible `/platform/v1/chat/completions` (recommended Approach 1) |

## Architecture

```text
┌──────────────┐   agent loop / tools / sessions    ┌─────────────────┐
│ Desktop App  │ ◄────────────────────────────────► │ Local sidecar   │
│ WebView      │     127.0.0.1:8766                  │ (no vendor keys)│
└──────────────┘                                     └────────┬────────┘
                                                              │ platform model only
                                                              │ Bearer: desktop platform token
                                                              ▼
                                                     ┌─────────────────┐
                                                     │ bot.liuyidi.me  │
                                                     │ /platform/v1/*  │
                                                     │ keys + desktop  │
                                                     │ budget on server│
                                                     └────────┬────────┘
                                                              ▼
                                                         LLM vendors
```

- **BYOK:** local sidecar → vendor `api_base` with user key; never via `/platform/v1`.
- **Platform / Auto:** local sidecar → `{PLATFORM_PROXY_BASE_URL}/platform/v1` with inference token.
- **Web on ECS:** unchanged; continues to use in-process env keys (Approach A). Desktop budget counters are separate.

## 1. Token issuance and storage

### Who issues

Only the cloud host that holds platform keys (`bot.liuyidi.me`) issues **desktop platform inference** tokens. The local sidecar never issues or validates these tokens with a shared secret that would require shipping secrets in the app.

### When

1. Desktop login continues via mini-auth (loopback handoff / cookie on local gateway).
2. After a successful login, the local sidecar exchanges a **mini-auth access token** (or equivalent identity proof already available from the login flow) for a platform token:

   `POST https://bot.liuyidi.me/platform/v1/token`

3. Cloud verifies mini-auth identity, then returns a short-lived token (JWT or opaque) with claims approximately:

   - `sub` = user id  
   - `aud` = `platform-proxy`  
   - `client` = `desktop`  
   - TTL ≈ **1 hour** (refresh on expiry / 401)

### Local storage

- Path: `{MINIBOT_SERVER_DATA_DIR}/users/<user_id>/platform_credentials.json` (mode `600`).
- Fields: `access_token`, `expires_at` (and optional refresh metadata if needed later).
- **Must not** write into `config.json`, the `.app` bundle, or logs.
- Keep an in-memory cache; on `401` / expiry re-exchange; on logout delete the file.

### Usage

- Solely as `Authorization: Bearer …` for `/platform/v1/*`.
- Not a vendor API key. Leak blast radius = that user’s short window of desktop quota (mitigated by TTL; optional revoke list is out of scope for v1).

## 2. Cloud `/platform/v1` proxy and desktop budget

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/platform/v1/token` | mini-auth identity → desktop inference token |
| `POST` | `/platform/v1/chat/completions` | OpenAI-compatible; auth + budget + upstream |
| `GET` | `/platform/v1/models` | Available platform slots (no secrets) |
| `GET` | `/platform/v1/budget` | Desktop budget snapshot for UI (optional but preferred in same slice) |

Optional later: `/platform/v1/messages` for Anthropic-shaped clients. v1 may normalize Anthropic-backend slots (e.g. doubao) to chat-completions on the server so the desktop keeps using `OpenAICompatProvider`.

### Request path (chat)

1. Validate Bearer platform token (`aud=platform-proxy`, `client=desktop`).
2. Map request `model` (or platform model id) → slot → **server env** key/base via existing `platform_models`.
3. Check **desktop** daily budget for `sub`; if exceeded → `429` with a clear body.
4. Call upstream with server keys; prefer transparent SSE streaming passthrough.
5. Record usage into desktop counters keyed by `user_id` (e.g. under `usage/desktop/<user_id>/`, same ideas as `UsageBudget`).

### Budget config (cloud only)

- Example env: `MINIBOT_SERVER_DESKTOP_DAILY_TOKEN_LIMIT`, `MINIBOT_SERVER_DESKTOP_DAILY_TURN_LIMIT`.
- Applies **only** to `/platform/v1` traffic.
- Existing Web / in-process `UsageBudget` is unchanged and **must not** share counters with desktop.

### Security hard rules

- Never echo vendor keys in responses or client-visible errors.
- Logs: `user_id`, slot, status code, latency — not secrets.
- Distributed desktop builds must not contain `.env.models`.

## 3. Local sidecar wiring and UI

### Config (no vendor secrets)

- `MINIBOT_SERVER_PLATFORM_PROXY_BASE_URL` (default `https://bot.liuyidi.me`).
- Desktop packaged sidecar sets this at spawn (alongside existing mini-auth env).
- Local `.env.models` is **not** required for platform model availability when the proxy is enabled.

### Provider build

When `active_platform_model` is set (or Auto resolves to a platform runtime) **and** proxy mode is on:

1. Ensure a valid `platform_credentials` token (exchange if needed).
2. `build_provider_chain`: `api_base = {PROXY}/platform/v1`, `api_key = platform_token`, `model` = catalog upstream model id (or the id the proxy expects).
3. Reuse `OpenAICompatProvider` / streaming; agent loop, tools, and sessions remain local.

### Availability (desktop / proxy branch)

| Mode | Platform model `available` |
|------|----------------------------|
| Proxy enabled (desktop) | Logged in and platform token obtainable (or unexpired cached token); optionally reconcile with `GET /platform/v1/models` |
| Proxy disabled / Web ECS | Existing Approach A: slot env key present on that process |

### BYOK

User presets / `openai_api_key` → local direct vendor calls; do not attach the platform inference token.

### UI

- Same Models list as Web.
- Budget panel reads desktop snapshot via `/platform/v1/budget` (or local API that proxies it).
- Errors must not say “missing API key” for platform failures; use login / quota / platform unavailable copy (§4).

### Release artifact

- `.app` may embed only the default proxy base URL.
- Operators must not instruct end users to copy operator `.env.models` into Application Support for production distribution.

## 4. Error handling

| Condition | HTTP / local | User-facing meaning |
|-----------|--------------|---------------------|
| Not logged in / bad inference token | 401 | Sign in again |
| Desktop daily budget exhausted | 429 | Desktop quota used up for today |
| Cloud slot misconfigured / upstream down | 503 | Platform model temporarily unavailable |
| Proxy network failure | local error | Cannot reach platform service |
| BYOK missing key | existing | Unrelated to platform proxy |

On exchange failure: clear local credentials and prompt re-login; do not tight-loop refresh. Mid-stream upstream disconnect follows existing provider error handling.

## 5. Testing (minimum)

1. **Cloud:** token mint (valid/invalid mini-auth); chat forward against mocked upstream; desktop budget → 429; assert responses/logs contain no vendor keys.
2. **Local:** with proxy enabled and **no** local `.env.models`, platform models are available after login; selecting a platform model points `api_base`/`api_key` at proxy + token; BYOK does not use the proxy.
3. **Smoke:** desktop login → select platform model → one non-stream and one stream turn succeed.

## 6. Rollout notes

1. Deploy `/platform/v1` on ECS demo (`bot.liuyidi.me`) with desktop budget env set.
2. Ship desktop build that sets `PLATFORM_PROXY_BASE_URL` and performs token exchange after login.
3. Remove reliance on developer-machine `engine/.env.models` for “demo models work” (optional: delete local copy to avoid confusion).
4. Web demo path remains Approach A in-process keys.

## Open points deferred (not blocking design)

- Opaque vs JWT token format (implementation choice; claims above are normative).
- Exact mini-auth verification API (userinfo vs introspection vs JWT) on the cloud token endpoint.
- Anthropic `/messages` passthrough vs server-side normalization for doubao slot.
- Token revoke list / forced logout propagation before natural TTL expiry.
