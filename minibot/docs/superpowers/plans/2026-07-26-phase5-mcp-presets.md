# Phase 5 MCP Presets Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** MCP presets → connect/inject tools into minibot ToolRegistry；`/ui/mcp.html` 可视化正向与异常。

**Architecture:** `McpPreset` in AppConfig；`McpManager` owns per-server AsyncExitStack + status/events；lifespan start/stop；Settings REST + `/api/dev/mcp`；精简移植 nanobot `connect_mcp_servers` / `MCPToolWrapper`（仅 tools，不做 resources/prompts）。

**Tech Stack:** FastAPI、`mcp>=1.26,<2`、httpx、现有 ToolRegistry

## Global Constraints

- 不崩 Loop：连接失败只记 `last_error`
- headers 对外脱敏；空 header 值表示保持原值（upsert）
- Runner 合同不变
- 不做 import-cursor / bus reload

## File map

| File | Role |
|------|------|
| `minibot/config/mcp_presets.py` | McpPreset + CRUD helpers + mask headers |
| `minibot/config/app_config.py` | `mcp_presets` field + settings payload |
| `minibot/agent/tools/mcp.py` | MCPToolWrapper + McpManager |
| `minibot/agent/tools/registry.py` | `unregister` / `unregister_prefix` + mcp category |
| `minibot/app_state.py` / `main.py` | manager + lifespan |
| `minibot/api/routes/settings.py` | mcp-presets routes |
| `minibot/api/routes/misc.py` | `/api/dev/mcp` |
| `minibot/static/devui/mcp.html` | lab UI |
| `minibot/static/devui/common.js` | lab nav entry |
| `tests/test_mcp_presets.py` | unit tests |
| `docs-plan/phase-5-mcp.md` + migration checklist | docs |

---

### Task 1: Config + Registry hooks

**Files:** `mcp_presets.py`, `app_config.py`, `registry.py`

- [ ] Add `McpPreset` + upsert/delete/get helpers
- [ ] `AppConfig.mcp_presets`; include in `settings_public_payload`
- [ ] `ToolRegistry.unregister` / `unregister_prefix`; category `mcp`
- [ ] Test: upsert/delete/mask

### Task 2: McpManager + lifespan

**Files:** `agent/tools/mcp.py`, `app_state.py`, `main.py`, `pyproject.toml`

- [ ] Add dep `mcp>=1.26.0,<2.0.0`
- [ ] Implement connect/disconnect/test/snapshot/events（tools only）
- [ ] Wire `AppState.mcp` + lifespan start/stop
- [ ] Test: fake inject/unregister；test failure sets last_error

### Task 3: API

**Files:** `settings.py`, `misc.py`

- [ ] Routes: list/upsert/delete/enable/disable/test
- [ ] `GET /api/dev/mcp`
- [ ] API tests with TestClient + mocked manager where needed

### Task 4: mcp.html + nav

**Files:** `mcp.html`, `common.js`, cross-links on tools/context

- [ ] Three-pane UI + case cards + event timeline
- [ ] Register in `DEV_NAV`

### Task 5: Docs + checklist

- [ ] `docs-plan/phase-5-mcp.md`
- [ ] Mark Phase 5 done in migration checklist
- [ ] README blurb
