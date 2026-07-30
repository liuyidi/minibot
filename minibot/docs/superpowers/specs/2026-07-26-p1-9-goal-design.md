# P1-9 · Goal (会话长期目标) (Design)

> 对齐 `chengxiaobang/apps/backend/src/goals/*` + `tools/goal-tools.ts` + `docs/goal.md`

## 1. 目标

给 session 加一个持久 objective：状态 active 期间——

- 每个 run 的 system prompt 注入"继续推进目标"指令
- run 结束后目标未完成 → 后端自动发起下一 run（**指数退避**）
- 模型验证达成后调用 `goal_complete` 工具置 completed
- 连续 N 轮无实质进展 → 自动 blocked，交还用户
- 用户可暂停/恢复/清除

## 2. 数据模型

```python
class Goal(BaseModel):
    id: str
    session_id: str
    objective: str
    status: Literal["active","completed","blocked","paused","cleared"]
    created_at: str
    updated_at: str
    completed_at: str | None
    blocked_reason: str | None
    resume_backoff_ms: int   # 当前退避
    resume_attempts: int
    max_no_progress_runs: int = 3
    no_progress_count: int = 0
```

存 sqlite `goals` 表（P0-3 已预留）+ `sessions.goal_id` 外键。

## 3. Resume 协调器

`goals/resume_coordinator.py`：

- 监听 `run_end` 事件（订阅全局 bus）
- 判断：目标 active + 未完成 + 未 blocked → 计算下一个 run 时间
- 退避：`min(2^attempts * 5s, 5min)`；成功推进（下面定义）后重置
- 调用 `AgentLoop.handle_turn(session_id, prompt="[goal-resume]", headless=True, meta={"goal_id":...})`

## 4. Progress 检测

一次 run 视为"有实质进展"当：

- 用户显式发消息，或
- 模型使用了 mutating 工具且成功，或
- 模型显式调用 `goal_note_progress(note)` 工具

否则 `no_progress_count += 1`。到达 `max_no_progress_runs` → `status=blocked, blocked_reason='max_no_progress'`。

## 5. 工具集

```
goal_set(objective, max_no_progress_runs?)  # 创建/替换（会话未有目标时创建；已有 completed/blocked 时可覆盖）
goal_note_progress(note)                    # 标记进展
goal_complete(evidence)                     # 声明完成
goal_block(reason)                          # 主动放弃
goal_status()                               # 返回当前 goal
```

## 6. System prompt 注入

`agent/context.py` 在 active 时追加：

```
【会话目标】{objective}
• 你的每一轮回答都必须朝目标推进；如果本轮无法直接推进，明确说明下一步计划。
• 当你相信目标已达成，调用 goal_complete(evidence=...) 结束目标。
• 若你判断目标无法达成或应放弃，调用 goal_block(reason=...)。
• 每次实质进展调用 goal_note_progress(note=...)。
```

## 7. 用户接口

- REST：`POST /api/goals` / `PATCH /api/goals/{id}` / `POST .../pause` / `.../resume` / `.../clear`
- 事件：`goal.state_changed{ id, before, after, reason }`
- 会话展示（Dev UI）：目标条 + 状态

## 8. Startup recovery

- 启动时扫 `status=active` 且 `sessions.updated_at` 距今 > 退避时间 的 goal，重新入调度队列

## 9. 与 cron 关系

- Cron 触发在 goal active session 里插入 prompt 后，goal resume 逻辑照常工作
- 不重复排队

## 10. 错误路径

- resume 时 provider 失败 → 计入退避
- 连续 5 次退避到顶（5min）仍失败 → blocked
- 会话被删除 → goal 一起软删（标记 cleared）
