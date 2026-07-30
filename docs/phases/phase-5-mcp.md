# Phase 5 — MCP tools + mcp-presets

**状态：** ✅ 完成  
## 做了什么

- `AppConfig.mcp_presets` + Settings CRUD / enable / disable / test
- `McpManager` lifespan 连接；tools 注入/摘除 `ToolRegistry`
- `/ui/mcp.html` 三栏 + 正向/异常情景实验室 + 事件时间线
- `GET /api/dev/mcp`

## 刻意不做

import-cursor、resources/prompts 包装、bus reload。

## 验证

```bash
cd minibot && .venv/bin/pytest tests/test_mcp_presets.py -q
```

手动：打开 `/ui/mcp.html` → 新建 filesystem stdio → Test → Enable → Chat 调 MCP tool；跑「坏 command / 坏 URL」看红卡。
