# P0-4 · Global SSE Event Stream (Design)

> 对齐 `chengxiaobang/apps/backend/src/events/*` + `docs/global-sse-event-stream.md`

## 1. 目标

把当前"每次 run 一条 SSE"改成**全局单条 SSE**（`GET /api/events`），客户端订阅一次即可持续收到**所有 session / 所有 run** 的事件，`POST /api/runs/stream` 保留为回退。

## 2. 事件契约

```json
{ "seq": 12345, "session_id": "...", "run_id": "...", "type": "delta", "channel": "text", "data": {...} }
```

Type 枚举（对齐 chengxiaobang）：

- `run_started` / `run_end`
- `delta`（channel: text | thinking）
- `message`（完整落库的一条消息）
- `tool_call`（phase: pending_approval | running | completed | failed | rejected）
- `session_updated`（如 title 生成、goal 状态变化）
- `file_change.recorded` / `file_change.reverted`
- `approval.pending` / `approval.resolved`
- `task.due` / `task.completed`（P1-7）
- `goal.state_changed`（P1-9）

## 3. Bus 层

`bus/global_bus.py`（新，与现有 `bus/` 融合）：

```python
class GlobalEventBus:
    def publish(event: Event) -> int   # returns seq
    def subscribe(since_seq=0, filter=None) -> AsyncIterator[Event]
```

- 内存 ring buffer（默认 2000 条）+ sqlite `events` 表持久化
- 订阅时先从 sqlite 读回 `since_seq` 之后的事件，再切到实时 stream
- 支持 filter：`session_ids=[]`, `types=[]`

## 4. 路由

```
GET /api/events?since_seq=&session_id=&type=
    → text/event-stream
    → 首帧 `retry: 3000` + `id: <seq>`
    → 心跳 `event: ping` 每 15s
POST /api/runs   { session_id, prompt, ... }
    → 202 { run_id }（异步）
POST /api/runs/stream  ← 保留为回退，body 相同，直接返回 SSE
GET  /api/runs/{id}   → 状态查询
POST /api/runs/{id}/abort
```

## 5. 客户端契约

- 断线重连：客户端读 `Last-Event-ID`（=seq）传回 `since_seq`
- Dev UI `/ui/` 改为单 SSE 订阅：过滤当前 session 展示
- CLI/WebSocket 可以复用同一 bus，不重复实现

## 6. Runner 集成

- `AgentRunner._emit(event)` 改为 `global_bus.publish(event)`
- run 完成后同步写 sqlite `events` 表（在 publish 内部完成）
- 事件 seq 单调递增（用 sqlite AUTOINCREMENT）

## 7. 性能与限制

- Ring buffer 2000 条足够 UI 回放；再往前必须走 sqlite 查询
- 单事件 payload > 64 KiB 时把 `data` 切走存 `events_blobs` 表（后续如需）；MVP 直接截断 preview 到 64 KiB
- 每客户端 backpressure：`asyncio.Queue(maxsize=200)` 慢消费者被踢出（发一个 `overflow` event 后关闭）

## 8. 观测

- `GET /api/dev/events/stats` 返回订阅数、当前 seq、buffer 大小
- 每 1000 条日志一次

## 9. 回归/兼容

- `/api/runs/stream` 保留一个 phase；新客户端改用 global + `/api/runs`
- WebSocket 分支不动，内部也接 bus
