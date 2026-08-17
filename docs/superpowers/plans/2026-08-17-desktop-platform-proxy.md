# Desktop Platform Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desktop local gateway uses cloud `/platform/v1` so all users can call platform models without shipping vendor keys in the `.app`.

**Architecture:** Cloud (`bot.liuyidi.me`) holds env keys, mints short-lived desktop inference tokens, proxies OpenAI-compatible chat with a separate desktop daily budget. Local sidecar keeps sessions/tools; when a platform model is selected it points `OpenAICompatProvider` at `{PROXY}/platform/v1` with the inference token. BYOK stays direct-to-vendor.

**Tech Stack:** FastAPI, httpx, existing `platform_models` / `UsageBudget` / mini-auth login, Tauri desktop spawn env.

**Spec:** `docs/superpowers/specs/2026-08-17-desktop-platform-proxy-design.md`

## Global Constraints

- Never put vendor keys in the desktop `.app` or `config.json`.
- Desktop budget counters must not share Web `UsageBudget` files.
- Platform inference tokens: `aud=platform-proxy`, `client=desktop`, TTL ≈ 1h.
- Default proxy base: `https://bot.liuyidi.me`.
- Prefer TDD; commit per task when tests pass.

## File map

| Path | Responsibility |
|------|----------------|
| `minibot/src/minibot/platform_proxy/tokens.py` | Opaque token mint/validate (cloud memory+disk) |
| `minibot/src/minibot/platform_proxy/budget.py` | Per-user desktop daily budget under `usage/desktop/<user_id>/` |
| `minibot/src/minibot/platform_proxy/upstream.py` | Map model → slot; call vendor (openai_compat + anthropic) |
| `minibot/src/minibot/api/routes/platform_proxy.py` | `/platform/v1/token|models|budget|chat/completions` |
| `minibot/src/minibot/config/platform_credentials.py` | Local store + exchange client |
| `minibot/src/minibot/config/settings.py` | `platform_proxy_base_url`, desktop budget limits, token TTL/secret |
| `minibot/src/minibot/config/platform_models.py` | Proxy-mode availability |
| `minibot/src/minibot/providers/factory.py` | Use proxy base+token for platform/auto |
| `minibot/src/minibot/api/routes/auth.py` | Persist mini-auth AT; exchange after login; clear on logout |
| `minibot/src/minibot/main.py` | Register platform_proxy router |
| `desktopV2/src-tauri/src/remote.rs` | Spawn with `PLATFORM_PROXY_BASE_URL` |
| `minibot/tests/test_platform_proxy.py` | Cloud route tests |
| `minibot/tests/test_platform_credentials.py` | Local credentials + factory wiring |

---

### Task 1: Opaque platform inference tokens

**Files:**
- Create: `minibot/src/minibot/platform_proxy/__init__.py`
- Create: `minibot/src/minibot/platform_proxy/tokens.py`
- Test: `minibot/tests/test_platform_proxy_tokens.py`

**Interfaces:**
- Produces: `mint_platform_token(store, *, user_id: str, ttl_s: int) -> tuple[str, int]`
- Produces: `validate_platform_token(store, token: str) -> PlatformTokenClaims | None` with fields `user_id`, `aud`, `client`
- Produces: `PlatformTokenStore` backed by `{data_dir}/platform_proxy/tokens.json`

- [ ] **Step 1:** Write failing tests for mint → validate, reject garbage, expiry
- [ ] **Step 2:** Implement store + mint/validate (secrets.token_urlsafe; store hash or plaintext token→claims; YAGNI JWT)
- [ ] **Step 3:** `pytest minibot/tests/test_platform_proxy_tokens.py -q` PASS
- [ ] **Step 4:** Commit

---

### Task 2: Desktop budget helper

**Files:**
- Create: `minibot/src/minibot/platform_proxy/budget.py`
- Test: `minibot/tests/test_platform_proxy_budget.py`

**Interfaces:**
- Produces: `DesktopBudget(data_dir, *, daily_token_limit, daily_turn_limit)` wrapping `UsageBudget` root at `data_dir/usage/desktop/<user_id>`
- Produces: `check(user_id)`, `record(user_id, prompt_tokens, completion_tokens)`, `snapshot(user_id)`

- [ ] **Step 1:** Failing tests: unlimited, trip on turns, isolate per user_id
- [ ] **Step 2:** Implement via existing `UsageBudget`
- [ ] **Step 3:** pytest PASS + commit

---

### Task 3: Upstream mapper + `/platform/v1` routes

**Files:**
- Create: `minibot/src/minibot/platform_proxy/upstream.py`
- Create: `minibot/src/minibot/api/routes/platform_proxy.py`
- Modify: `minibot/src/minibot/config/settings.py` — add:
  - `platform_proxy_base_url: str = ""` (empty = this process is not advertising a remote proxy; cloud still serves `/platform/v1`)
  - `platform_proxy_token_ttl_s: int = 3600`
  - `desktop_daily_token_limit: int = 0`
  - `desktop_daily_turn_limit: int = 0`
- Modify: `minibot/src/minibot/main.py` — `include_router(platform_proxy.router)`
- Modify: `minibot/src/minibot/app_state.py` — hold `PlatformTokenStore` + `DesktopBudget` lazy getters
- Test: `minibot/tests/test_platform_proxy.py`

**Route contracts:**
- `POST /platform/v1/token` — `Authorization: Bearer <mini-auth access_token>`; cloud calls mini-auth userinfo; returns `{access_token, expires_in, token_type:"bearer"}`
- `GET /platform/v1/models` — Bearer platform token; list available slots (no keys)
- `GET /platform/v1/budget` — Bearer platform token; desktop snapshot for `sub`
- `POST /platform/v1/chat/completions` — Bearer platform token; budget check; map `model` to slot; forward upstream; record usage

**Upstream mapping:** Accept platform id (`platform-…`) or upstream model string; resolve via `PLATFORM_MODELS`. openai_compat → httpx to slot base `/chat/completions`. anthropic → use `AnthropicProvider` (stream if feasible; else non-stream for v1).

- [ ] **Step 1:** Tests with httpx ASGI + mocked mini-auth userinfo + mocked upstream
- [ ] **Step 2:** Implement routes
- [ ] **Step 3:** pytest PASS + commit

---

### Task 4: Local credentials + login exchange

**Files:**
- Create: `minibot/src/minibot/config/platform_credentials.py`
- Modify: `minibot/src/minibot/api/routes/auth.py` — after mini-auth success, save `mini_auth_access_token` under user dir; call exchange when `platform_proxy_base_url` set; logout clears file
- Test: `minibot/tests/test_platform_credentials.py`

**Interfaces:**
- `load/save/clear_platform_credentials(user_data_dir) -> PlatformCredentials | None`
- `async exchange_platform_token(*, proxy_base, mini_auth_access_token) -> PlatformCredentials`
- `async ensure_platform_token(...)` refresh if expired

Fields: `mini_auth_access_token`, `access_token`, `expires_at` (unix).

- [ ] **Step 1–4:** TDD + commit

---

### Task 5: Local provider wiring (proxy mode)

**Files:**
- Modify: `minibot/src/minibot/config/platform_models.py` — if `platform_proxy_mode_enabled()` (settings.platform_proxy_base_url non-empty), mark all catalog rows available when credentials present OR always list available=True for logged-in path via settings payload hook; `resolve_platform_runtime` returns proxy api_base + token as api_key
- Modify: `minibot/src/minibot/providers/factory.py` — platform/auto use runtime from proxy-aware resolver
- Modify: `minibot/src/minibot/config/app_config.py` `settings_public_payload` if needed
- Test: extend `test_platform_models.py` / `test_platform_credentials.py`

Rule: when proxy mode on and no local slot keys, `available` is True iff non-empty platform inference token for current user (or True in public catalog and fail at call time with 401 — prefer available iff credentials exist).

- [ ] **Step 1–4:** TDD + commit

---

### Task 6: Desktop spawn env

**Files:**
- Modify: `desktopV2/src-tauri/src/remote.rs` — set `MINIBOT_SERVER_PLATFORM_PROXY_BASE_URL` default `https://bot.liuyidi.me` (override via same-named parent env)
- Modify: `desktopV2/README.md` + `README.zh.md` — document proxy (replace “copy .env.models” as the primary path for shipped users)

- [ ] **Step 1:** Implement env wiring
- [ ] **Step 2:** `cargo check` in `desktopV2/src-tauri`
- [ ] **Step 3:** Commit

---

### Task 7: Deploy/docs note

**Files:**
- Modify: `docs/superpowers/specs/2026-08-17-desktop-platform-proxy-design.md` status → implementing/done when green
- Optional: one line in `mini-langfuse/deploy/demo/.env.example` for desktop budget env vars

- [ ] Document ECS env vars; no code if example already covers MINIBOT_* passthrough

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Cloud token mint | 1, 3 |
| Desktop-only budget | 2, 3 |
| `/platform/v1/chat/completions` | 3 |
| Local credentials file | 4 |
| Login exchange + logout clear | 4 |
| Provider uses proxy | 5 |
| Availability without local `.env.models` | 5 |
| Desktop spawn proxy URL | 6 |
| No keys in `.app` | 6 (env URL only) |

## Execution

User asked to start immediately → **inline execution** in this session (executing-plans style), task-by-task with tests.
