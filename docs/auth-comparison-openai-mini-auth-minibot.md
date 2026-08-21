# Auth Comparison: OpenAI Codex, mini-auth, and minibot

This document compares the auth-related capabilities and URL surfaces of:

- OpenAI Codex / `auth.openai.com`
- `mini-auth`
- `minibot`

The goal is to make the feature gaps and reusable patterns obvious when designing or extending auth flows.

## 1. High-level summary

- **OpenAI Codex**: the most complete and layered auth surface. It supports browser login, desktop bridge pages, account selection, consent, standard OAuth endpoints, device-code login, callback pages, token refresh, and revoke.
- **mini-auth**: a shared identity provider. It already covers standard OAuth/OIDC login, account selection, logout, and a clear `/oauth/authorize` + `/oauth/token` core, but it does not expose a Codex-style device-code flow.
- **minibot**: a client app that delegates identity to `mini-auth` and adds its own desktop handoff flow. It has a strong desktop-auth implementation, but it is not a full identity provider and does not implement device code itself.

## 1.1 Summary table

| Area | OpenAI / Codex | mini-auth | minibot |
|---|---|---|---|
| Browser auth entry | `https://auth.openai.com/`, `https://chatgpt.com/auth/login_with?callback_path=/` | `https://auth.liuyidi.me/login` | `http://127.0.0.1:8766/auth/login` |
| Account selection | `https://auth.openai.com/choose-an-account` | `https://auth.liuyidi.me/oauth/select-account` | Not exposed as a dedicated page |
| Consent | `https://auth.openai.com/sign-in-with-chatgpt/codex/consent` | Not exposed | Not exposed |
| OAuth authorize | `https://auth.openai.com/oauth/authorize` | `https://auth.liuyidi.me/oauth/authorize` | Delegated to `mini-auth` |
| OAuth token | `https://auth.openai.com/oauth/token` | `https://auth.liuyidi.me/oauth/token` | Delegated to `mini-auth` |
| OAuth revoke | `https://auth.openai.com/oauth/revoke` | `https://auth.liuyidi.me/oauth/revoke` | Local logout + provider logout |
| Device code | `https://auth.openai.com/codex/device` | Not exposed | Not exposed |
| Desktop bridge | `https://chatgpt.com/codex/desktop-auth` | Not exposed | `http://127.0.0.1:8766/auth/desktop/authorize` |
| Callback | `https://auth.openai.com/deviceauth/callback` | Standard callback flow | `http://127.0.0.1:8766/auth/mini-auth/callback` |
| Error page | `https://auth.openai.com/error` | Not explicit | Not unified |

## 2. Capability matrix

| Capability | OpenAI / Codex | mini-auth | minibot |
|---|---|---|---|
| Browser login entry | Yes | Yes | Yes |
| Account selection page | Yes | Yes | No dedicated page found |
| Consent page | Yes | No dedicated page found | No dedicated page found |
| OAuth authorize endpoint | Yes | Yes | Delegated to `mini-auth` |
| OAuth token endpoint | Yes | Yes | Delegated to `mini-auth` |
| Token revoke endpoint | Yes | Yes, via logout semantics / provider flow | Logout endpoint exists |
| Device-code login | Yes | No | No |
| Desktop bridge page | Yes | No dedicated bridge page found | Yes |
| Callback page | Yes | Yes | Yes |
| Error page | Yes | Partial / not yet explicit | No unified error page found |
| Local session cookie | Managed by Codex clients | Managed by auth service | Managed by minibot |
| Refresh token lifecycle | Yes | Yes | Yes, through the shared auth service |

## 3. URL surfaces

### 3.1 OpenAI / Codex

Confirmed or publicly observed URLs:

- [`https://auth.openai.com/`](https://auth.openai.com/)
- [`https://auth.openai.com/choose-an-account`](https://auth.openai.com/choose-an-account)
- [`https://auth.openai.com/log-in`](https://auth.openai.com/log-in)
- [`https://auth.openai.com/log-in/password`](https://auth.openai.com/log-in/password)
- [`https://auth.openai.com/sign-in-with-chatgpt/codex/consent`](https://auth.openai.com/sign-in-with-chatgpt/codex/consent)
- [`https://auth.openai.com/sign-in-with-chatgpt/consent`](https://auth.openai.com/sign-in-with-chatgpt/consent)
- [`https://auth.openai.com/add-phone`](https://auth.openai.com/add-phone)
- [`https://auth.openai.com/phone-otp/select-channel`](https://auth.openai.com/phone-otp/select-channel)
- [`https://auth.openai.com/oauth/authorize`](https://auth.openai.com/oauth/authorize)
- [`https://auth.openai.com/oauth/token`](https://auth.openai.com/oauth/token)
- [`https://auth.openai.com/oauth/revoke`](https://auth.openai.com/oauth/revoke)
- [`https://auth.openai.com/deviceauth/callback`](https://auth.openai.com/deviceauth/callback)
- [`https://auth.openai.com/codex/device`](https://auth.openai.com/codex/device)
- [`https://auth.openai.com/api/accounts/deviceauth/usercode`](https://auth.openai.com/api/accounts/deviceauth/usercode)
- [`https://auth.openai.com/api/accounts/deviceauth/token`](https://auth.openai.com/api/accounts/deviceauth/token)
- [`https://auth.openai.com/error`](https://auth.openai.com/error)
- [`https://chatgpt.com/auth/login_with?callback_path=/`](https://chatgpt.com/auth/login_with?callback_path=/)
- [`https://chatgpt.com/codex/desktop-auth`](https://chatgpt.com/codex/desktop-auth)

#### OpenAI / Codex API endpoints

- [`https://auth.openai.com/oauth/authorize`](https://auth.openai.com/oauth/authorize)
- [`https://auth.openai.com/oauth/token`](https://auth.openai.com/oauth/token)
- [`https://auth.openai.com/oauth/revoke`](https://auth.openai.com/oauth/revoke)
- [`https://auth.openai.com/deviceauth/callback`](https://auth.openai.com/deviceauth/callback)
- [`https://auth.openai.com/api/accounts/deviceauth/usercode`](https://auth.openai.com/api/accounts/deviceauth/usercode)
- [`https://auth.openai.com/api/accounts/deviceauth/token`](https://auth.openai.com/api/accounts/deviceauth/token)
- [`https://auth.openai.com/api/accounts/phone-otp/send`](https://auth.openai.com/api/accounts/phone-otp/send)

### 3.2 mini-auth

Relevant URLs in the current repo:

- [`https://auth.liuyidi.me/login`](/Users/liuyidi/github/mini-auth/frontend/apps/web/src/App.tsx)
- [`https://auth.liuyidi.me/register`](/Users/liuyidi/github/mini-auth/frontend/apps/web/src/App.tsx)
- [`https://auth.liuyidi.me/oauth/select-account`](/Users/liuyidi/github/mini-auth/frontend/apps/web/src/App.tsx)
- [`https://auth.liuyidi.me/logout`](/Users/liuyidi/github/mini-auth/app/routers/web.py)
- [`https://auth.liuyidi.me/oauth/authorize`](/Users/liuyidi/github/mini-auth/app/routers/oidc.py)
- [`https://auth.liuyidi.me/oauth/token`](/Users/liuyidi/github/mini-auth/app/routers/oidc.py)
- [`https://auth.liuyidi.me/oauth/userinfo`](/Users/liuyidi/github/mini-auth/app/routers/oidc.py)
- [`https://auth.liuyidi.me/oauth/revoke`](/Users/liuyidi/github/mini-auth/app/routers/oidc.py)
- [`https://auth.liuyidi.me/error`](/Users/liuyidi/github/mini-auth/app/routers/web.py) or equivalent error handling paths, depending on the failure mode

mini-auth API endpoints that matter for client integration:

- [`https://auth.liuyidi.me/api/v1/auth/github/start`](/Users/liuyidi/github/mini-auth/app/routers/github_auth.py)
- [`https://auth.liuyidi.me/api/v1/auth/google/start`](/Users/liuyidi/github/mini-auth/app/routers/google_auth.py)
- [`https://auth.liuyidi.me/api/v1/users/me`](/Users/liuyidi/github/mini-auth/app/routers/users.py)
- [`https://auth.liuyidi.me/api/v1/me`](/Users/liuyidi/github/mini-auth/app/routers/users.py)

### 3.3 minibot

Auth-related local routes:

- [`http://127.0.0.1:8766/auth/login`](/Users/liuyidi/github/minibot/minibot/src/minibot/api/routes/auth.py)
- [`http://127.0.0.1:8766/auth/config`](/Users/liuyidi/github/minibot/minibot/src/minibot/api/routes/auth.py)
- [`http://127.0.0.1:8766/auth/bootstrap`](/Users/liuyidi/github/minibot/minibot/src/minibot/api/routes/auth.py)
- [`http://127.0.0.1:8766/webui/bootstrap`](/Users/liuyidi/github/minibot/minibot/src/minibot/api/routes/auth.py)
- [`http://127.0.0.1:8766/auth/desktop/authorize`](/Users/liuyidi/github/minibot/minibot/src/minibot/api/routes/auth.py)
- [`http://127.0.0.1:8766/auth/mini-auth/callback`](/Users/liuyidi/github/minibot/minibot/src/minibot/api/routes/auth.py)
- [`http://127.0.0.1:8766/auth/desktop/done`](/Users/liuyidi/github/minibot/minibot/src/minibot/api/routes/auth.py)
- [`http://127.0.0.1:8766/auth/desktop/focus`](/Users/liuyidi/github/minibot/minibot/src/minibot/api/routes/auth.py)
- [`http://127.0.0.1:8766/auth/desktop/handoff`](/Users/liuyidi/github/minibot/minibot/src/minibot/api/routes/auth.py)
- [`http://127.0.0.1:8766/auth/desktop/complete`](/Users/liuyidi/github/minibot/minibot/src/minibot/api/routes/auth.py)
- [`http://127.0.0.1:8766/auth/desktop/session`](/Users/liuyidi/github/minibot/minibot/src/minibot/api/routes/auth.py)
- [`http://127.0.0.1:8766/auth/logout`](/Users/liuyidi/github/minibot/minibot/src/minibot/api/routes/auth.py)

External URLs that minibot calls through `mini-auth`:

- [`https://auth.liuyidi.me/oauth/authorize`](https://auth.liuyidi.me/oauth/authorize)
- [`https://auth.liuyidi.me/oauth/token`](https://auth.liuyidi.me/oauth/token)
- [`https://auth.liuyidi.me/oauth/userinfo`](https://auth.liuyidi.me/oauth/userinfo)

## 4. Feature-by-feature comparison

### 4.1 Browser login

- **OpenAI / Codex**: browser login is first-class. The browser flow uses `https://auth.openai.com/oauth/authorize`, then returns through a callback and finishes token exchange.
- **mini-auth**: standard OIDC/OAuth browser login is the core use case, with `https://auth.liuyidi.me/oauth/authorize` as the core entry.
- **minibot**: browser login exists, but as a client of `mini-auth`. It redirects users to `https://auth.liuyidi.me/oauth/authorize` and then accepts the callback at `http://127.0.0.1:8766/auth/mini-auth/callback` or the deployed equivalent.

### 4.2 Account selection

- **OpenAI / Codex**: has a dedicated `https://auth.openai.com/choose-an-account`.
- **mini-auth**: has `https://auth.liuyidi.me/oauth/select-account`, which is close in spirit.
- **minibot**: no separate account-choice page found. It relies on the shared auth provider and its own session flow.

### 4.3 Consent

- **OpenAI / Codex**: has a dedicated consent page for Codex-related sign-in at `https://auth.openai.com/sign-in-with-chatgpt/codex/consent`.
- **mini-auth**: no explicit consent route is visible in the current repo.
- **minibot**: no explicit consent route is visible in the current repo.

### 4.4 Device code

- **OpenAI / Codex**: supports a device-code flow with:
  - `https://auth.openai.com/api/accounts/deviceauth/usercode`
  - `https://auth.openai.com/api/accounts/deviceauth/token`
  - `https://auth.openai.com/codex/device`
  - `https://auth.openai.com/deviceauth/callback`
- **mini-auth**: no comparable device-code flow found.
- **minibot**: no comparable device-code flow found.

### 4.5 Desktop auth

- **OpenAI / Codex**: has a dedicated desktop bridge page `https://chatgpt.com/codex/desktop-auth` and device callback support at `https://auth.openai.com/deviceauth/callback`.
- **mini-auth**: currently acts as the identity provider, not the desktop bridge.
- **minibot**: has the strongest desktop auth story among the three:
  - `http://127.0.0.1:8766/auth/desktop/authorize`
  - `http://127.0.0.1:8766/auth/desktop/handoff`
  - `http://127.0.0.1:8766/auth/desktop/complete`
  - `http://127.0.0.1:8766/auth/desktop/session`
  - `http://127.0.0.1:8766/auth/desktop/done`

### 4.6 Token lifecycle

- **OpenAI / Codex**: explicitly manages authorization code exchange, refresh token use, and token revoke through `https://auth.openai.com/oauth/token` and `https://auth.openai.com/oauth/revoke`.
- **mini-auth**: exposes the standard OAuth endpoints, including `https://auth.liuyidi.me/oauth/token` and `https://auth.liuyidi.me/oauth/revoke`.
- **minibot**: stores a local session token and exchanges through `mini-auth` for user data and session state.

### 4.7 Logout

- **OpenAI / Codex**: logout semantics are implied through revoke and session clearing.
- **mini-auth**: has a clear `https://auth.liuyidi.me/logout`.
- **minibot**: has `http://127.0.0.1:8766/auth/logout`, and can redirect into `https://auth.liuyidi.me/logout` when using shared auth.

## 5. Practical takeaways

- If you want the **most standard OAuth shape**, follow `mini-auth`.
- If you want the **most complete auth UX pattern**, follow OpenAI / Codex.
- If you want the **best desktop handoff pattern** for a client app, follow `minibot`.

## 6. What is missing in each project

### OpenAI / Codex

- Not missing much from a feature standpoint.
- The main limitation for outsiders is that the full implementation details are not public.

### mini-auth

- Device-code flow
- First-class consent page
- Dedicated desktop bridge page
- More explicit error page routing

### minibot

- Dedicated account selection page
- Device-code flow
- First-class consent page
- Unified auth error page

## 7. Recommendation for `mini-auth` and `minibot`

- Keep `mini-auth` as the shared OAuth/OIDC provider.
- Keep `minibot` as the desktop/client side that handles handoff and local session materialization.
- If you want to converge toward the OpenAI pattern, the next useful additions are:
  - a clear consent page
  - a unified error page
  - optional device-code support for remote/headless environments

## 8. Quick URL index

### OpenAI / Codex

- `https://auth.openai.com/`
- `https://auth.openai.com/choose-an-account`
- `https://auth.openai.com/log-in`
- `https://auth.openai.com/log-in/password`
- `https://auth.openai.com/sign-in-with-chatgpt/codex/consent`
- `https://auth.openai.com/sign-in-with-chatgpt/consent`
- `https://auth.openai.com/add-phone`
- `https://auth.openai.com/phone-otp/select-channel`
- `https://auth.openai.com/oauth/authorize`
- `https://auth.openai.com/oauth/token`
- `https://auth.openai.com/oauth/revoke`
- `https://auth.openai.com/deviceauth/callback`
- `https://auth.openai.com/codex/device`
- `https://auth.openai.com/api/accounts/deviceauth/usercode`
- `https://auth.openai.com/api/accounts/deviceauth/token`
- `https://auth.openai.com/api/accounts/phone-otp/send`
- `https://auth.openai.com/error`
- `https://chatgpt.com/auth/login_with?callback_path=/`
- `https://chatgpt.com/codex/desktop-auth`

## 9. Hidden / likely branches worth tracking

These are routes that are not always visible from a normal happy-path login, but are clearly surfaced by issues and runtime behavior:

- `https://auth.openai.com/add-phone`
- `https://auth.openai.com/phone-otp/select-channel`
- `https://auth.openai.com/sign-in-with-chatgpt/consent`
- `https://auth.openai.com/sign-in-with-chatgpt/codex/consent`
- `https://auth.openai.com/log-in`
- `https://auth.openai.com/log-in/password`

Observed behavior from issue reports:

- `add-phone` is a hard stop in several Codex login failures, especially when the account has Authenticator, security keys, or country-specific SMS/WhatsApp limitations.
- `phone-otp/select-channel` is the step-up page used for SMS / WhatsApp verification.
- `sign-in-with-chatgpt/consent` can hang or fail to complete in some desktop / WSL flows.

### mini-auth

- `https://auth.liuyidi.me/login`
- `https://auth.liuyidi.me/register`
- `https://auth.liuyidi.me/oauth/select-account`
- `https://auth.liuyidi.me/oauth/authorize`
- `https://auth.liuyidi.me/oauth/token`
- `https://auth.liuyidi.me/oauth/userinfo`
- `https://auth.liuyidi.me/oauth/revoke`
- `https://auth.liuyidi.me/logout`
- `https://auth.liuyidi.me/api/v1/auth/github/start`
- `https://auth.liuyidi.me/api/v1/auth/google/start`
- `https://auth.liuyidi.me/api/v1/users/me`
- `https://auth.liuyidi.me/api/v1/me`

### minibot

- `http://127.0.0.1:8766/auth/login`
- `http://127.0.0.1:8766/auth/config`
- `http://127.0.0.1:8766/auth/bootstrap`
- `http://127.0.0.1:8766/webui/bootstrap`
- `http://127.0.0.1:8766/auth/desktop/authorize`
- `http://127.0.0.1:8766/auth/mini-auth/callback`
- `http://127.0.0.1:8766/auth/desktop/done`
- `http://127.0.0.1:8766/auth/desktop/focus`
- `http://127.0.0.1:8766/auth/desktop/handoff`
- `http://127.0.0.1:8766/auth/desktop/complete`
- `http://127.0.0.1:8766/auth/desktop/session`
- `http://127.0.0.1:8766/auth/logout`
- `https://auth.liuyidi.me/oauth/authorize`
- `https://auth.liuyidi.me/oauth/token`
- `https://auth.liuyidi.me/oauth/userinfo`
