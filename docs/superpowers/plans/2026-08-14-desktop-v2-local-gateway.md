# Desktop V2 local gateway — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `desktopV2/` as a local-gateway desktop app (bundled sidecar later; `minibot://` OAuth; data on disk) without breaking shipped `desktop/`.

**Architecture:** See [`../specs/2026-08-14-desktop-local-gateway-design.md`](../specs/2026-08-14-desktop-local-gateway-design.md).

**Tech stack:** Tauri 2, Rust shell, frozen minibot sidecar (PyInstaller/Nuitka later), mini-auth + `minibot://`, existing WebUI served by local gateway.

---

### Task 1: Scaffold `desktopV2/`

**Files:**
- Create: `desktopV2/**` (copy of `desktop/`, exclude `target`/`node_modules`/`dist`)
- Modify: package/crate/bundle identifiers so V1 and V2 can coexist

- [ ] Branch `feature/desktopv2`
- [ ] Copy + rename (`minibot-desktop-v2`, identifier `me.liuyidi.minibot.desktopv2`)
- [ ] README points at local-gateway design
- [ ] Commit scaffold

### Task 2: Default to local gateway + spawn engine (dev)

**Files:**
- Modify: `desktopV2/src-tauri/src/remote.rs` (or new `engine.rs`)
- Modify: `desktopV2/src/App.tsx`
- Modify: `desktopV2/src-tauri/src/lib.rs` (kill on exit)

- [ ] Default `api_base` = `http://127.0.0.1:8766`
- [ ] On connect: if bootstrap not up, spawn `MINIBOT_SIDECAR` or `minibot` with data dir env
- [ ] Wait for bootstrap; navigate WebView
- [ ] Kill child on app exit
- [ ] Manual: with `minibot` on PATH, `cd desktopV2 && npm run dev` opens local UI

### Task 3: Deep link `minibot://auth/callback`

**Files:**
- Modify: Tauri conf / Info.plist / Windows registry via deep-link plugin
- Modify: gateway auth routes + mini-auth redirect allowlist
- Modify: WebUI login when `minibotHost` present

- [x] Register scheme
- [x] Handle callback → session
- [x] System browser open for login

### Task 4: Freeze sidecar + CI

- [x] PyInstaller/Nuitka per OS
- [x] `externalBin` + publish workflow for desktopV2
- [ ] Cutover download page when green

---

## Progress

- Task 1–3 on `feature/desktopv2` (local spawn + `minibot://` OAuth path).
