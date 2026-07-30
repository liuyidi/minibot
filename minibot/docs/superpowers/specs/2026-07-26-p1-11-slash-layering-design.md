# P1-11 · Todo / Plan / Slash 分层 (Design)

> 对齐 `chengxiaobang/apps/backend/src/tools/todo-tools.ts` + `plan-tools.ts` + `slash-command-service.ts`

## 1. 目标

把当前"所有能力都是工具"的扁平结构切成三层：

- **用户可见斜杠命令**：唯一常驻 `/compact`。其他斜杠只是 UX 语义糖，最终变成工具调用。
- **plan 模式**：先出计划，用户确认后再执行；用 `plan_write` / `plan_exit` 两个内部工具建模。
- **todo**：单 run 内清单，纯记忆型工具，让模型显式管理执行进度。

## 2. Slash 命令

`agent/slash_commands.py`：

```python
class SlashCommand:
    name: str
    description: str
    handler: Callable[[str, SessionContext], Awaitable[SlashResult]]

built_in = {
    "compact": compact_handler,        # 立即触发 compact（P0-5）
    "todo":    todo_handler,           # 打印当前 todo 列表
    "plan":    plan_handler,           # 进入 plan 模式
    "goal":    goal_handler,           # 展示当前 goal
}
```

- 只有 `/compact` 用户 UX 常驻；其它对 UI 隐藏
- 命令解析：`^/(\w+)(\s.*)?$` 从 user 消息第一行提取
- 命中命令时 handler 决定是否继续走 loop（`/compact` 不进 loop，其它进）

## 3. Todo 工具

对齐 chengxiaobang `todo-tools.ts`：

```
TodoWrite(items: list[{ id, text, status: pending|in_progress|completed }])
```

- 单 run 内内存 dict；写入替换整个列表
- 事件 `session_updated{ todo: [...] }` 广播
- Compaction 时 summary 里保留 todo 快照
- 完成后 run_end 事件带最终 todo

## 4. Plan 模式

对齐 chengxiaobang `plan-tools.ts`：

```
plan_write(steps: list[str], reasoning: str)   # 输出计划
plan_exit(reason: "approved" | "revise")       # 退出计划模式
```

- 进入 plan 模式后 system prompt 追加"当前处于 Plan 模式，只能读取工具，禁止 mutating"
- Runner 层 hard-guard：mutating 工具在 plan_mode 直接 rejected
- 用户 UI/CLI 提供 approve 按钮 → 发送 `/plan approve` → 触发 `plan_exit(approved)`

## 5. 事件

- `session_updated{ mode: "plan"|"normal" }`
- `session_updated{ todo: [...] }`
- `slash_command{ name, args, result }`

## 6. 与 goal / cron 关系

- Plan 模式期间 cron 触发暂缓（延迟到 plan_exit 后）
- Goal 续跑时若 session 处于 plan_mode → 跳过本轮（等用户 approve）

## 7. 与 subagent 关系

- Task 工具不受 plan_mode 限制（子 agent 是"分析型"，仍可读工具）
- 子 agent 自身遵循自己的白名单

## 8. 观测

- `GET /api/dev/slash-commands` 列出所有命令
- `GET /api/sessions/{id}/mode`
