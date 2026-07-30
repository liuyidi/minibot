# minibot × mini-langfuse 接入设计

## Goal

将 minibot 真实 agent 回合上报到本地 mini-langfuse（替代 demo 数据），默认关闭，env 打开。

## Phase B

- 薄适配层 `minibot/observability/langfuse.py`（soft-import，未安装/未启用 = no-op）
- 配置：`MINIBOT_SERVER_LANGFUSE_{ENABLED,HOST,PUBLIC_KEY,SECRET_KEY}`
- 挂点：
  - `AgentLoop.handle_turn` → Trace（`session_id`、`entry`、workspace）
  - `AgentRunner.run` → Generation（每次 LLM）+ Span（每个 tool）
  - `compact_if_needed` → Generation（`compaction`）
  - spawn 内嵌套 runner：挂在当前 Trace / 当前 tool Span 下（contextvars）
- 不改 Dev UI 自有 `trace`；不改 Provider 抽象

## Phase C

- Prompt：`ensure_system_prompt` 将 identity（`SYSTEM_PROMPT`）同步为 Langfuse prompt `minibot-system`（`production` label）；Generation 挂 `prompt_version_id`
- Score：`POST /api/sessions/{id}/score`；DevUI 👍/👎；`TurnResponse.langfuse_trace_id` + WS `agent_trace`
- Settings：`GET /api/settings` 增加只读 `observability`（无密钥）

## Dependency

```bash
pip install -e /path/to/mini-langfuse/sdk-python
```

## Success

开启开关后：Traces / Sessions / Generations(usage+prompt) / Scores 均可在 mini-langfuse UI 看到。
