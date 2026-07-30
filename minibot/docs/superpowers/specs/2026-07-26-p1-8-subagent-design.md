# P1-8 · Subagent (Task 工具) (Design)

> 对齐 `chengxiaobang/apps/backend/src/agent/subagent-definitions.ts` + `tools/subagent-tools.ts` + `docs/subagents.md`

## 1. 目标

主 agent 通过 `Task` 工具派生子 agent 完成独立子任务；子 agent：

- 独立 system prompt 和空对话历史（只有 task prompt）
- 与父同 provider/preset，可按定义覆盖 model
- 复用父 workspace / access mode / abort / 审批队列
- 消息不落入父 session；最终结论作为父 tool_call 结果返回
- 允许同一父轮次内并行多个 Task

## 2. Subagent 定义

`~/.minibot/subagents/<name>.md`（frontmatter）：

```md
---
name: researcher
description: 独立完成互联网/仓库调研并给出结构化报告
tools: [web_fetch, web_search, file_read, grep, memory]
model: gpt-4o           # 可选覆盖
context: minimal        # minimal | full-parent
timeout_sec: 900
---
你是资深调研助手...（system prompt 主体）
```

内置定义也放同目录（发布时拷贝）。加载器 `agent/subagent_definitions.py`：

- 启动时 + 增量热加载（文件 mtime）
- `list()` / `get(name)`

## 3. Task 工具

```python
tool: task
args:
  agent: str          # subagent name
  prompt: str         # 自包含说明
  context_extras?: {  # 追加环境信息
    files?: [path...],       # 拼进 prompt
    memory_notes?: [...]
  }
returns:
  final_report: str
  usage: {tokens_in, tokens_out}
  duration_sec: float
  aborted: bool
```

- 并行：模型可以在同一轮发多次 task tool_call；runner 走 `asyncio.gather`

## 4. 嵌套 loop

新增 `agent/subagent_runner.py`：

- 复用 `AgentRunner` 但传入独立 `SessionContext(session_id=<parent>:sub:<uuid>)`
- 消息只存内存 buffer；结束后**不写 messages 表**（可写一条 debug 记录到 `subagent_runs` 表用于回放）
- 事件：`subagent.started` / `subagent.progress` / `subagent.completed`（父 session 事件）
- 审批：复用父 approval_queue（同一个进程队列）

## 5. Abort 传播

- 父 run abort 时，取消所有子 asyncio task
- 子 abort 单独：给 tool_call_id 单独 abort 端点（少用）

## 6. Timeout

- 定义里 `timeout_sec`；超时 tool_call 返回 `Task aborted: timeout`
- 全局默认 15 分钟

## 7. Access mode

- Subagent 定义里的 `tools` 是白名单；`tool_registry.for_subagent(name)` 过滤后创建局部 registry
- 危险工具需要审批仍走 P0-1

## 8. Context 组装

- `context: minimal`：只用 subagent 的 system prompt + task prompt + `context_extras`
- `context: full-parent`：复制父 session 最近 K 条 messages（默认 8）；很少用，因为容易破坏隔离

## 9. 事件契约

```json
{ "type": "tool_call", "phase": "running", "tool": "task", "subagent": "researcher", "sub_run_id": "..." }
{ "type": "subagent.progress", "sub_run_id": "...", "step": 3, "note": "..." }
{ "type": "tool_call", "phase": "completed", "result_preview": "final_report first 400 chars" }
```

## 10. 错误路径

- Subagent name 不存在 → tool 立即失败
- 白名单外的工具被子模型调用 → 直接拒绝作为工具结果，不 crash
- 死循环：max_iterations 触发（继承父 config）
