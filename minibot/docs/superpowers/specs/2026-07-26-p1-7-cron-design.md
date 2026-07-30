# P1-7 · Cron / 定时任务 (Design)

> 对齐 `chengxiaobang/apps/backend/src/tasks/*` + `tools/schedule-tools.ts` + `docs/scheduled-tasks.md`

## 1. 设计原则

- **创建走模型工具**，不做表单：用户用自然语言描述，模型翻译成 `kind=once|recurring`；UI 只做管理（启停、立即运行、删除）。
- **执行复用原会话**：不为每次触发新建 session，headless 追加一轮次。
- **补跑策略 at-most-once**：应用关闭期间错过的任务下次启动时**只补一次**，绝不连环追赶。
- **headless run 自动拒绝审批**（P0-1 已接入）。

## 2. 数据模型

```python
class ScheduledTask(BaseModel):
    id: str
    session_id: str            # 绑定原会话
    title: str                 # 模型给的可读名称
    prompt: str                # 到点时作为 user 消息追加到会话（也可用模板 vars）
    kind: Literal["once","recurring"]
    run_at: str | None         # once
    cron: str | None           # recurring, unix cron 5-field
    timezone: str              # IANA
    enabled: bool = True
    created_at: str
    last_run_at: str | None
    next_run_at: str | None
    run_count: int = 0
    last_status: Literal["ok","failed","aborted"] | None
    last_error: str | None
```

## 3. 存储

- SQLite 表 `scheduled_tasks`（在 P0-3 schema 里加），以 `next_run_at` 索引
- 事件写 events 表 + 全局 SSE

## 4. 调度器

`tasks/scheduler.py`：

- 单一 asyncio task 循环：`while True: sleep_until(next_task); trigger`
- 支持 signal 唤醒：新建/修改/删除时 `wakeup.set()`
- 周期任务在触发后立即算 `next_run_at`（用 `croniter`）
- 抖动：`jitter_sec`（默认 30s）防止整点尖峰

## 5. 补跑策略

启动时：

```
for task in enabled_tasks:
    if task.kind == "once" and task.run_at < now and task.last_run_at is None:
        enqueue_once(task, tag="catchup")
    if task.kind == "recurring":
        # 只补一次：找出最近一次错过的 fire time
        missed = last_cron_fire_before(task.cron, now, base=task.last_run_at or task.created_at)
        if missed and (task.last_run_at is None or missed > task.last_run_at):
            enqueue_once(task, tag="catchup", override_time=missed)
        recompute next_run_at
```

## 6. 触发时的执行

- 创建 `Run(headless=True, entry="cron", session_id=task.session_id)`
- 通过 `AgentLoop.handle_turn(session_id, prompt=task.prompt, headless=True, meta={"task_id":...})`
- 若 loop 里遇到 `pending_approval` 工具（因为 headless），直接 rejected，模型可自行决定放弃或提示用户
- 完成后更新 last_run_at/last_status/next_run_at

## 7. 模型工具

`tools/schedule.py`（对齐 chengxiaobang 合并为单工具）：

```
schedule(action, ...)
  action: create | list | update | delete | run_now | pause | resume
  create args: {title, prompt, when: "2026-08-01T09:00" | cron, timezone?}
```

创建/更新时用小模型或严格解析器把自然表达转 cron/absolute。

## 8. REST

- `GET /api/tasks` / `GET /api/tasks/{id}`
- `POST /api/tasks` / `PATCH /api/tasks/{id}` / `DELETE /api/tasks/{id}`
- `POST /api/tasks/{id}/run` （立即触发）
- `POST /api/tasks/{id}/pause` / `.../resume`

## 9. 事件

- `task.created` / `task.updated` / `task.deleted`
- `task.due` / `task.completed`（挂 run_id）
- 全部经全局 SSE

## 10. 与 Goal 关系

- Cron 到点 + Goal active 的 session：先执行 cron prompt（作为 user 消息），然后 goal 自动续跑逻辑照常
- 不为 cron 单独续跑

## 11. 边界

- Once 任务超过 `run_at` 30 天仍未触发（应用一直没启动）→ 标记 `stale`，需要用户显式确认
- Timezone 转换必须显式（存 IANA，展示时用它）
- 命中 abort：run 标记 aborted，last_status=aborted
