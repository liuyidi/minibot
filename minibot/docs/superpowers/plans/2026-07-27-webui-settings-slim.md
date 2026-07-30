# WebUI Slim Settings (P0) Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans or implement inline task-by-task.

**Goal:** Unlock sidebar Settings with only Overview / Appearance / Models / Runtime.

**Architecture:** Gate via `webui/src/lib/ui-entry.ts`; filter Settings nav + slim Overview; hide Providers panel; pad minibot `/api/settings` payload so Overview/Runtime do not crash.

**Tech Stack:** React/TS WebUI, FastAPI minibot

## Global Constraints

- Keep unused Settings section code; hide entry points only
- Do not enable apps/skills/automations UI_ENTRY flags
- SETTINGS_SECTIONS exact set: overview, appearance, models, runtime
- SETTINGS_SHOW_PROVIDERS_PANEL = false

## File map

| File | Role |
|------|------|
| `webui/src/lib/ui-entry.ts` | gates + SETTINGS_SECTIONS |
| `webui/src/App.tsx` | coerce disabled settings deep links |
| `webui/src/components/settings/SettingsView.tsx` | filter nav, slim Overview, hide Providers |
| `minibot/src/minibot/config/app_config.py` | runtime/usage/version payload |
| tests | ui-entry / settings-view / app-layout / payload |

## Status

Implemented 2026-07-27. Checkboxes below tracked during execution.

---

### Task 1: UI gates

**Files:**
- Modify: `webui/src/lib/ui-entry.ts`
- Modify: `webui/src/App.tsx` (coerce hidden settings section → overview)
- Test: `webui/src/tests/ui-entry.test.ts` (create)

- [x] Add `settings: true`, `SETTINGS_SECTIONS`, `SETTINGS_SHOW_PROVIDERS_PANEL`, `isEnabledSettingsSection()`
- [x] In `readShellRoute` / navigate path for `/settings`, coerce disabled section to `overview`
- [x] Unit test gate helpers

### Task 2: Slim SettingsView

**Files:**
- Modify: `webui/src/components/settings/SettingsView.tsx`
- Modify: `webui/src/tests/settings-view.test.tsx` (add nav filter assertion)

- [x] Filter `SETTINGS_NAV_ITEMS` with `SETTINGS_SECTIONS`
- [x] Overview: drop usage heatmap + capabilities rows
- [x] Models: hide `ProvidersSettings` when `SETTINGS_SHOW_PROVIDERS_PANEL` is false
- [x] If `initialSection` not enabled, fall back to overview

### Task 3: minibot settings payload

**Files:**
- Modify: `minibot/src/minibot/config/app_config.py` (`settings_public_payload`)
- Test: `minibot/tests/test_settings_payload_webui.py` (create)

- [x] Add `runtime`, `usage`, `version`
- [x] Complete stub fields for image/transcription providers
- [x] Assert keys Overview/Runtime need

### Task 4: Verify

- [x] `cd webui && bun test src/tests/ui-entry.test.ts src/tests/settings-view.test.tsx`
- [x] `cd minibot && pytest tests/test_settings_payload_webui.py tests/test_model_presets.py -q`
