# Desktop/Web auth UX: WorkBuddy-style logout + branded login

**Date:** 2026-08-17  
**Status:** approved for planning  
**Surface:** desktop V2 + WebUI (mini-auth)  
**Related:** `desktopV2/README.zh.md` login flow; logout confirm; `minibot://` deep link

## Goal

1. **Logout confirmation** on desktop and web before signing out.
2. **WorkBuddy-style logout:** clear only the local minibot session; do **not** open a browser or hit mini-auth `/logout`. Re-login can show “already signed in / pick account” when IdP cookies remain.
3. **Branded desktop login:** system browser opens `auth.liuyidi.me` (authorize URL) directly; OAuth `redirect_uri` is `minibot://auth/callback` so the address bar does not flash `127.0.0.1:8766` on callback.
4. **WorkBuddy-style in-app waiting UI** after Sign in opens the browser: brand title, “登录中…” pill with spinner, “没有自动打开浏览器?” + copy-link / retry-login actions (reference screenshot from WorkBuddy).

## Non-goals

- Clearing GitHub / mini-auth IdP cookies on logout (explicitly rejected; option 1).
- Optional “also sign out of account center” setting (YAGNI this slice).
- Changing web browser OAuth (still same-origin `/auth/login` → mini-auth → HTTP callback on the deployed host).
- Shipping / triggering publish workflows as part of this work.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Desktop logout | Local session only (`local=1` / equivalent); welcome screen; no `openLogin` for IdP logout |
| Web logout | Local session only; then login entry (no redirect to mini-auth `/logout`) |
| Confirm copy (zh) | Title「确认登出」; body「登出后会停止所有正在执行中的任务（包括后台会话），确认要登出吗？」; Cancel / Confirm |
| Desktop login start | Prefer authorize URL from gateway API; open that URL in system browser |
| Desktop redirect_uri | `minibot://auth/callback` when custom scheme is usable |
| Dev fallback | If scheme / deep-link unreliable (`tauri:dev`), keep HTTP loopback + handoff |

## Architecture

### Logout

```text
Settings → Sign out
    → Confirm dialog (Cancel | Confirm)
    → on Confirm:
         close WS client
         clear cookie/token (GET /auth/logout?local=1 or equivalent)
         desktop: desktop_welcome
         web: login / unauthenticated boot
    → do NOT open system browser
    → do NOT redirect to auth.liuyidi.me/logout
```

### Desktop login (packaged)

```text
Sign in
  → WebUI/host asks gateway for authorize URL
       (PKCE + state stored on local gateway; redirect_uri=minibot://auth/callback)
  → openLogin(https://auth.liuyidi.me/oauth/authorize?…)
  → user signs in (or picks existing IdP account)
  → browser → minibot://auth/callback?code&state
  → Tauri complete_desktop_oauth → POST /auth/desktop/complete
  → navigate WebView to /auth/desktop/session?token=…
```

No intermediate `http://127.0.0.1:8766/auth/login` or `/auth/mini-auth/callback` in the system browser for this path.

While the browser is open, the **desktop WebView** stays on a waiting screen (WorkBuddy-aligned): brand title,「登录中…」status pill, and fallback「复制登录链接」/「重新发起登录」using the same authorize URL just opened.

### Dev / fallback

When `openLogin` exists but deep-link registration is missing, or an explicit fallback flag: keep today’s HTTP handoff (`desktop_login_id` + loopback callback). Prefer detecting packaged / scheme-ready host rather than always using loopback.

## UX copy

### Logout confirm

| Key | zh-CN | en |
|-----|-------|-----|
| title | 确认登出 | Confirm sign out |
| body | 登出后会停止所有正在执行中的任务（包括后台会话），确认要登出吗？ | Signing out stops all running tasks (including background sessions). Sign out? |
| cancel | 取消 | Cancel |
| confirm | 确认登出 | Sign out |

Reuse existing `AlertDialog` patterns (`DeleteConfirm`).

### Desktop browser-login waiting (WorkBuddy-aligned)

Shown while `status === "browser_login"` (after `openLogin`):

| Element | zh-CN | en |
|---------|-------|-----|
| Brand / title | 沿用现有欢迎标题（如 Minibot 产品名 + 短句） | Same |
| Primary status pill | 登录中… | Signing in… |
| Fallback question | 没有自动打开浏览器? | Browser didn’t open? |
| Fallback hint | 复制登录链接，用浏览器手动打开完成登录 | Copy the login link and open it in a browser to finish signing in |
| Button | 复制登录链接 | Copy login link |
| Button | 重新发起登录 | Try again |

Behavior:

- Keep the last authorize URL in memory for **Copy login link** (`clipboard.writeText`).
- **Try again** regenerates authorize URL (new state/PKCE) and calls `openLogin` again.
- Welcome state (`desktop_welcome`) stays a single primary「登录」CTA; the waiting layout only applies after login has started.

## Risks

- **Scheme not registered** under `tauri:dev` → must keep loopback fallback; document when each path applies.
- **mini-auth client** must allow `minibot://auth/callback` (already intended).
- Users may expect “full account logout”; copy stays about stopping tasks, not IdP.

## Success criteria

- Confirm dialog appears on Sign out (desktop + web); Cancel does nothing.
- After confirm, no system browser opens for logout; IdP session can remain.
- Packaged desktop login: browser address bar shows auth host for authorize; callback does not show `127.0.0.1`.
- Existing desktop complete + session cookie install still works.
- After Sign in, desktop shows WorkBuddy-like waiting UI:「登录中…」、复制登录链接、重新发起登录.
