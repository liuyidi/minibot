# Phase 1.5 Subagent — 短计划

**状态：** 1.5A ✅ 已落地 · 1.5B / Phase 2.5（异步）排在 Phase 2 之后  
**主计划：** [`minibot-fastapi-migration.md`](./minibot-fastapi-migration.md)

## 1.5A — Sync spawn（本阶段）✅

**目标：** 主 agent 调用 `spawn` 后**阻塞等待**子 agent 跑完，结果作为 tool result 回流。

| 项 | 合同 |
|----|------|
| 工具 | `spawn(task, label?)` → `minibot/agent/tools/spawn.py` |
| 执行 | 嵌套 `AgentRunner.run`；无后台 Task / 无 bus 回注 |
| Session | 子 id：`{parent}/sub/{task_id}`；同 workspace |
| Depth | ContextVar；`depth >= 2` 再 spawn → 错误字符串 |
| 子工具集 | 默认工具**不含** `spawn` |
| 并发 | 同轮多个 spawn 仍按 Runner 串行 |
| Dev UI | `tools.html` 子 session 表；deny-demo `spawn_depth` |

**验收：** ✅ FakeProvider 父 spawn → 子完成 → 父总结；✅ depth=2 拒绝

## 1.5B / Phase 2.5 — Async spawn（Phase 2 之后，未开工）

对齐 nanobot：`SubagentManager` + 后台 Task + 完成后 inject 主 session + `max_concurrent` + Dev UI running/done 树。见主计划 **Phase 2.5**。
