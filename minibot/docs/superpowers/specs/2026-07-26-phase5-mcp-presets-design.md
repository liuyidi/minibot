# minibot Phase 5 — MCP tools + mcp-presets（MVP / 方案 A）

**日期：** 2026-07-26  
**状态：** 已批准  
**范围：** MCP 客户端生命周期、动态 Tool 注入、presets CRUD/test/enable、Dev UI `/ui/mcp.html`（正向 + 异常可视化）  
**非目标：** import-cursor、nanobot WebUI header 协议、resources/prompts 包装、bus reload 控制消息、Phase 4 cron

---

## 目标

1. 可保存多套 **MCP presets**（stdio / SSE / streamableHttp）
2. `enabled` preset 在 app lifespan 自动连接，tools 注入 `ToolRegistry`
3. 断连 / 坏配置只记 `last_error` 并摘 tool，**不崩 Loop**
4. `/ui/mcp.html` 能一眼看懂正向与异常 case

## 数据模型

`AppConfig.mcp_presets: list[McpPreset]`

```json
{
  "id": "fs",
  "label": "Filesystem",
  "enabled": true,
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
  "env": {},
  "cwd": "",
  "url": "",
  "headers": {},
  "tool_timeout": 30,
  "enabled_tools": ["*"]
}
```

HTTP preset 用 `url` + 可选 `headers`；`type` 可省略（有 command → stdio；url 以 `/sse` 结尾 → sse，否则 streamableHttp）。

密钥：`headers` 中含 `Authorization` / `api-key` 等对外脱敏。

## 运行时

- `McpManager` 挂 `AppState`，lifespan：`start(enabled presets)` / `stop()`
- Tool 名：`mcp_<server_id>_<tool>`（sanitize）
- `source=mcp`，category=`mcp`
- `POST test`：临时连接列 tools，不写入 Registry（或连完即关）
- enable → connect + inject；disable/remove → disconnect + unregister prefix

## API

| 方法 | 路径 | 行为 |
|------|------|------|
| GET | `/api/settings` | 含 `mcp_presets`（headers 脱敏） |
| GET | `/api/settings/mcp-presets` | list |
| POST | `/api/settings/mcp-presets` | upsert |
| DELETE | `/api/settings/mcp-presets/{id}` | 删除并 disconnect |
| POST | `/api/settings/mcp-presets/{id}/enable` | enabled=true + connect |
| POST | `/api/settings/mcp-presets/{id}/disable` | enabled=false + disconnect |
| POST | `/api/settings/mcp-presets/test` | body=preset 字段，试连 |
| GET | `/api/dev/mcp` | runtime 快照 + events 时间线 |

## Dev UI `/ui/mcp.html`

- 左：Presets CRUD + Test/Enable/Disable
- 中：已注入 tools
- 右：情景实验室（✅ Test/Enable/注入；⚠️ Disable 摘除；❌ 坏 command/URL/超时）+ 事件时间线

## 验收

- stdio MCP（如 filesystem）连上后 Chat 可调其 tool
- 坏配置 / 断连：UI 红状态 + `last_error`，Chat 仍可用 builtin tools
- 单测覆盖 CRUD、inject/unregister、test 失败路径
