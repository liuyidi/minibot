# Desktop/Web Auth UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add logout confirmation; WorkBuddy-style local-only logout (no IdP browser clear); packaged desktop login opens authorize URL directly with `minibot://` callback so `127.0.0.1` does not flash; in-app waiting UI matches WorkBuddy (登录中… / 复制登录链接 / 重新发起登录).

**Architecture:** Logout uses confirm dialog then `local=1` (or equivalent) only. Desktop login prefers a new gateway endpoint that returns the mini-auth authorize URL with `redirect_uri=minibot://auth/callback`; Tauri already completes via `POST /auth/desktop/complete`. While waiting, WebUI keeps the last authorize URL for clipboard copy and retry. HTTP loopback + `desktop_login_id` remains the fallback for `tauri:dev`.

**Tech Stack:** FastAPI auth routes, WebUI React + AlertDialog + i18n, Tauri `host_open_login` / deep link, existing `complete_desktop_oauth`.

**Spec:** `docs/superpowers/specs/2026-08-17-desktop-auth-ux-design.md`

## Global Constraints

- Logout must **not** call mini-auth `/logout` or `host.openLogin` for IdP clear.
- Confirm copy must match the locked zh/en strings in the spec.
- Packaged desktop authorize URL must use `minibot://auth/callback` (settings `mini_auth_desktop_redirect_uri`).
- Do not trigger publish workflows unless the user explicitly asks.
- Prefer TDD; commit per task when tests pass (local commit only unless asked to push).

## File map

| Path | Responsibility |
|------|----------------|
| `webui/src/components/auth/BootScreens.tsx` | WorkBuddy-like `BrowserLoginWaiting` waiting layout |
| `webui/src/components/auth/LogoutConfirm.tsx` | AlertDialog for logout confirm |
| `webui/src/i18n/locales/{zh-CN,en}/common.json` | Logout confirm strings |
| `webui/src/pages/settings/shared/settings-nav.tsx` | Wire confirm before `onLogout` |
| `webui/src/lib/desktop-auth-actions.ts` | Local-only logout; branded login start |
| `webui/src/App.tsx` | Use updated logout/login helpers |
| `webui/src/lib/auth-flow.ts` | Helpers for authorize URL fetch / fallback flags |
| `minibot/src/minibot/api/routes/auth.py` | `GET /auth/desktop/authorize` (or similar); keep `local` logout; adjust redirect_uri rules |
| `minibot/tests/test_desktop_auth.py` | Authorize URL + local logout behavior |
| `webui/src/tests/app-layout.test.tsx` | Confirm dialog + no IdP openLogin on logout |
| `desktopV2/README.md` / `README.zh.md` | Document new login/logout UX |
| `desktopV2/src-tauri/src/lib.rs` | Only if host needs a “scheme ready” hint; prefer no change |

---

### Task 1: Logout confirmation dialog (WebUI)

**Files:**
- Create: `webui/src/components/auth/LogoutConfirm.tsx`
- Modify: `webui/src/i18n/locales/zh-CN/common.json` (`app.account.logoutConfirm*`)
- Modify: `webui/src/i18n/locales/en/common.json`
- Modify: `webui/src/pages/settings/shared/settings-nav.tsx` (or parent that owns Sign out)
- Test: `webui/src/tests/app-layout.test.tsx`

**Interfaces:**
- Produces: `<LogoutConfirm open onCancel onConfirm />`
- Consumes: existing `onLogout` callback — only invoke after confirm

- [ ] **Step 1:** Add i18n keys for title, body, cancel, confirm (zh locked copy from spec; en equivalents)

- [ ] **Step 2:** Write failing test: click Sign out → dialog visible; Cancel → no `location.assign` / no `openLogin`; Confirm → logout proceeds

- [ ] **Step 3:** Implement `LogoutConfirm` using `AlertDialog` (mirror `DeleteConfirm` layout)

- [ ] **Step 4:** Wire Sign out button to open dialog; call `onLogout` only on confirm

- [ ] **Step 5:** `cd webui && npm test -- --run src/tests/app-layout.test.tsx -t "sign-out|Sign out|logout"` PASS

- [ ] **Step 6:** Commit `feat(webui): confirm before sign out`

---

### Task 2: WorkBuddy-style local-only logout

**Files:**
- Modify: `webui/src/lib/desktop-auth-actions.ts` (`redirectToMiniAuthLogout`)
- Modify: `webui/src/App.tsx` if web path still assigns full IdP logout
- Modify: `webui/src/tests/app-layout.test.tsx`
- Optionally verify: `minibot/src/minibot/api/routes/auth.py` `local=1` already clears cookie without IdP redirect

**Interfaces:**
- Change: desktop logout → `fetch(...local=1)` + welcome; **remove** `host.openLogin(browserLogout)`
- Change: web logout → clear local session then show login / welcome path **without** navigating to mini-auth `/logout`
  - Preferred: `fetch("/auth/logout?local=1")` then `showDesktopWelcomeOrBrowserLogin` / unauthenticated boot, or soft reload to `/` after local clear
  - Avoid `window.location.assign("/auth/logout")` which 302s to IdP

- [ ] **Step 1:** Update failing tests: desktop Sign out confirm must **not** call `openLogin`; web must **not** `assign` IdP logout URL

- [ ] **Step 2:** Implement local-only paths in `desktop-auth-actions` + App boot state

- [ ] **Step 3:** Run WebUI logout tests PASS; `pytest minibot/tests/test_desktop_auth.py::test_logout_local_clears_cookie_without_idp_redirect -q` PASS

- [ ] **Step 4:** Commit `fix(auth): local-only logout without IdP browser clear`

---

### Task 3: Gateway endpoint for desktop authorize URL

**Files:**
- Modify: `minibot/src/minibot/api/routes/auth.py`
- Modify: `minibot/tests/test_desktop_auth.py`

**Interfaces:**
- Produces: `GET /auth/desktop/authorize?next=/` → JSON `{ "authorize_url": "https://…/oauth/authorize?…", "desktop_login_id": null }`
- Behavior: same PKCE/`begin_mini_auth_login` as login, but **always** `redirect_uri=_desktop_callback_url` (`minibot://auth/callback`) for this endpoint
- Keep existing `GET /auth/login?desktop=1&desktop_login_id=` loopback path for fallback

- [ ] **Step 1:** Failing test: desktop authorize returns URL whose `redirect_uri` query is `minibot://auth/callback`

- [ ] **Step 2:** Implement route (reuse `_build_authorize_url` with a force-desktop-scheme flag, or dedicated builder)

- [ ] **Step 3:** `cd minibot && uv run pytest tests/test_desktop_auth.py -q` PASS

- [ ] **Step 4:** Commit `feat(auth): expose desktop authorize URL for branded login`

---

### Task 4: WebUI/desktop open authorize URL (not loopback /auth/login)

**Files:**
- Modify: `webui/src/lib/desktop-auth-actions.ts` (`beginDesktopLogin`)
- Modify: `webui/src/lib/auth-flow.ts` (helper `fetchDesktopAuthorizeUrl`)
- Modify: `webui/src/App.tsx` (store last authorize URL for waiting UI)
- Modify: `webui/src/tests/app-layout.test.tsx` / small unit test if easier
- Modify: `desktopV2/README.md`, `desktopV2/README.zh.md`

**Interfaces:**
- Consumes: `GET /auth/desktop/authorize`
- Produces: `host.openLogin(authorize_url)` where URL host is mini-auth, not `127.0.0.1`
- Produces: callback/`onAuthorizeUrl(url)` so waiting UI can copy the same link
- Fallback: if authorize fetch fails or host signals no deep-link, keep `buildLoginRedirect(..., { desktop: true, desktopLoginId })` + loopback

**Detection heuristic (keep simple):**
- Prefer authorize API whenever `host.openLogin` exists.
- If deep-link completion is known broken in pure `tauri:dev`, document manual fallback or detect via optional `host.capabilities?.deepLinkAuth === true` only if already easy; otherwise: try scheme path in packaged builds; keep loopback as catch-all on handoff timeout (optional stretch — minimum is: packaged path uses authorize API; README says `tauri:dev` may still use loopback via env or second code path).

Minimum viable for this task:
1. Desktop with `openLogin` → fetch authorize URL → open it → retain URL for copy.
2. On deep-link success, existing `complete_desktop_oauth` works (no WebUI handoff poll needed for scheme path).
3. Explicit fallback function still available for loopback (call from catch or feature flag `?desktop_loopback=1` / settings later YAGNI — use try/catch + README).

- [ ] **Step 1:** Failing test: `beginDesktopLogin` with mocked `openLogin` + fetch authorize → `openLogin` called with URL containing `oauth/authorize` and not `127.0.0.1`

- [ ] **Step 2:** Implement fetch + open; wire `App` / `desktop-auth-actions`; keep authorize URL in state for Task 4b

- [ ] **Step 3:** Update README login flow diagrams to match

- [ ] **Step 4:** WebUI tests PASS

- [ ] **Step 5:** Commit `feat(desktop): open mini-auth authorize URL directly`

---

### Task 4b: WorkBuddy-style browser waiting UI

**Files:**
- Modify: `webui/src/components/auth/BootScreens.tsx` (`BrowserLoginWaiting`)
- Modify: `webui/src/i18n/locales/zh-CN/common.json` / `en/common.json`
- Modify: `webui/src/App.tsx` (pass `loginUrl`, `onCopyLoginLink`, `onRetry`)
- Test: `webui/src/tests/app-layout.test.tsx` (or BootScreens-focused test)

**Interfaces:**
- Change: `BrowserLoginWaiting({ waiting, loginUrl?, onLogin, onCopyLink? })`
- When `waiting`:
  - Title (brand)
  - Large pill / button showing「登录中…」+ spinner (non-primary action; not a second Sign in)
  - Section「没有自动打开浏览器?」+ hint
  - Row:「复制登录链接」|「重新发起登录」
- Copy uses `navigator.clipboard.writeText(loginUrl)`; disable/hide copy if URL missing
- Retry calls `onLogin` (regenerate + reopen browser)

Layout reference: WorkBuddy desktop waiting screen (light bg, centered, rounded grey controls).

- [ ] **Step 1:** Failing test: waiting state shows copy + retry controls and status「登录中」/ Signing in

- [ ] **Step 2:** Implement UI + i18n; wire App to pass last authorize URL

- [ ] **Step 3:** Tests PASS

- [ ] **Step 4:** Commit `feat(webui): WorkBuddy-style desktop login waiting UI`

---

### Task 5: Smoke checklist (manual) + docs polish

**Files:**
- Modify: `desktopV2/README.zh.md` / `README.md` logout + waiting UI section if missing

- [ ] **Step 1:** Manual checklist in plan completion notes:
  - Packaged app: Sign in → browser shows `auth.liuyidi.me` only → callback opens app without `127.0.0.1` page
  - Waiting UI: 登录中… / 复制登录链接 / 重新发起登录 works
  - Sign out → confirm → cancel works; confirm returns to welcome; **no** new browser tab
  - Sign in again → IdP may show account picker (WorkBuddy-like)
  - Web: same confirm + local logout; no redirect to mini-auth logout

- [ ] **Step 2:** Commit any doc fixes `docs(desktop): align auth UX with WorkBuddy-style logout`

---

## Out of scope reminders

- Do not reintroduce IdP logout on desktop Sign out.
- Do not bump versions / publish unless requested.
- Do not commit `.pnpm-store/` or `desktopV2/dist-app/`.
