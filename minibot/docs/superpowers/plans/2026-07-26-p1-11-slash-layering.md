# P1-11 · Todo / Plan / Slash 分层 (Plan)

> spec：`specs/2026-07-26-p1-11-slash-layering-design.md`

## Constraints

- 只暴露 `/compact` 给用户；其它是内部
- Plan 模式对 mutating 工具硬拦（用 P0-1 approval 层做拦截）
- Todo 是 run-scoped，重启不保留

## File map

| File | Role |
|---|---|
| `minibot/agent/slash_commands.py` |  |
| `minibot/agent/plan_mode.py` | 状态与 guard |
| `minibot/agent/tools/todo.py` |  |
| `minibot/agent/tools/plan.py` | plan_write / plan_exit |
| `minibot/agent/runner.py` | slash 拦截 + plan guard |
| `minibot/api/routes/sessions.py` | mode 端点 |
| `tests/test_slash_commands.py` |  |
| `tests/test_todo_tool.py` |  |
| `tests/test_plan_mode.py` |  |

## Task 1 — Slash 分派

- [ ] 用户消息解析
- [ ] `/compact` 直接触发 P0-5 逻辑
- [ ] 未知命令按普通消息走
- [ ] 单测

## Task 2 — Todo

- [ ] 工具 + session 内 buffer
- [ ] 事件 + compact 保留
- [ ] 单测

## Task 3 — Plan 模式

- [ ] `plan_write` 进入模式
- [ ] Mutating guard（联动 approval policy）
- [ ] `plan_exit` 或用户 `/plan approve` 退出
- [ ] 单测：进入后 shell 被拒；退出后允许

## Task 4 — 与 cron/goal 联动

- [ ] cron 触发时 mode=plan → 延后到 exit
- [ ] goal resume mode=plan → 跳过
- [ ] 单测

## Task 5 — 文档

- [ ] `docs-plan/phase-p1-11-slash-layering.md`

## 验收

- 手工：`/compact` 触发一次 compact
- 手工：进入 plan_mode 后 agent 想 shell → 被拒
- 手工：todo 三条 in_progress 完成后事件回放正确
