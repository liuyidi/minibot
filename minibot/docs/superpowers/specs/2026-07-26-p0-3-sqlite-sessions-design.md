# P0-3 · Session 存储 → SQLite (Design)

> 对齐 `chengxiaobang/apps/backend/src/repository/*`（sql.js）;minibot 用 stdlib `sqlite3` + WAL

## 1. 目标

从 `~/.minibot/sessions/<id>.jsonl` 转到 `~/.minibot/data/minibot.sqlite3`：加索引、支持并发、把 assistant/tool 原始消息 payload 单独列，为 P0-4/P1-7/P1-8 打底。

## 2. Schema

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  workspace TEXT NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}',
  active_preset TEXT,
  goal_id TEXT REFERENCES goals(id),      -- P1-9
  expert_id TEXT                          -- P2-15
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  status TEXT NOT NULL,                   -- running/completed/failed/aborted
  started_at TEXT NOT NULL,
  ended_at TEXT,
  entry TEXT NOT NULL,                    -- rest/ws/cli/cron/subagent
  headless INTEGER NOT NULL DEFAULT 0,
  usage_json TEXT
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  run_id TEXT,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,                     -- system/user/assistant/tool
  content_text TEXT,                      -- rendered text (for UI/index)
  payload_json TEXT,                      -- 原始 provider message payload (backend-only)
  created_at TEXT NOT NULL,
  UNIQUE(session_id, seq)
);
CREATE INDEX idx_messages_session ON messages(session_id, seq);
CREATE INDEX idx_messages_run ON messages(run_id);

CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,                    -- tool_call_id
  message_id TEXT REFERENCES messages(id),
  session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  args_json TEXT NOT NULL,
  result_json TEXT,
  status TEXT NOT NULL,                   -- pending_approval/running/completed/failed/rejected
  started_at TEXT,
  ended_at TEXT
);
CREATE INDEX idx_tool_calls_session ON tool_calls(session_id, started_at);

CREATE TABLE file_changes (               -- P0-2
  id TEXT PRIMARY KEY,
  tool_call_id TEXT REFERENCES tool_calls(id),
  session_id TEXT NOT NULL,
  path TEXT NOT NULL,
  op TEXT NOT NULL,
  before_sha256 TEXT,
  after_sha256 TEXT,
  size_before INTEGER,
  size_after INTEGER,
  created_at TEXT NOT NULL,
  reverted_at TEXT
);

CREATE TABLE approvals (                  -- P0-1
  tool_call_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  reason TEXT,
  smart INTEGER NOT NULL DEFAULT 0,
  smart_confidence REAL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  note TEXT
);

CREATE TABLE events (                     -- P0-4 全局 event stream 回放缓冲
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  run_id TEXT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_events_session_seq ON events(session_id, seq);
```

## 3. 连接管理

- 单进程单连接（`check_same_thread=False`）+ `asyncio.Lock` 序列化写；FastAPI 单 worker 足够
- WAL 模式：`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;`
- 备份策略：启动时把上次的 `minibot.sqlite3` 复制到 `backups/minibot-YYYYmmdd-HHMMSS.sqlite3`（保留最近 5 份）

## 4. Repository 层

`session/repository.py`（新增）：

```python
class SessionRepository:
    def create_session(...) -> Session
    def get_session(id) -> Session | None
    def list_sessions(limit, cursor) -> list[Session]
    def append_message(msg: MessageRecord) -> int  # returns seq
    def load_messages(session_id, since_seq=0) -> list[MessageRecord]
    def create_run(...) -> Run
    def close_run(run_id, status, usage)
    def record_tool_call(...); update_tool_call_status(...)
    def append_event(...); read_events(session_id, since_seq)
```

- 现有 `session/store.py` 变成薄薄的 facade，内部委托给 repository
- Payload 分离：`content_text` 是 rendered，`payload_json` 是完整 provider 消息（用于 history 重建）

## 5. 迁移 (JSONL → SQLite)

`session/migrations/jsonl_to_sqlite.py`：

- 启动时若发现 `~/.minibot/sessions/*.jsonl` 且 sqlite 里对应 session 不存在 → 自动导入
- 每个 jsonl 一个事务
- 迁移完成后把原 jsonl mv 到 `~/.minibot/sessions/_migrated/`
- 提供 `python -m minibot.session.migrations.jsonl_to_sqlite --dry-run`

## 6. 历史重建

`agent/history.py`（对齐 chengxiaobang）：

- 从 `messages` 表读整段，拼装成 provider 侧消息数组
- 优先用 `payload_json`（含 tool_call 结构），fallback 到 `content_text`
- Compaction 后写一条 `role=system, content_text='[compact summary]', payload_json={"summary": "..."}` 保留摘要

## 7. 并发安全

- 每个 session_id 走 `agent/loop.py` 的 `asyncio.Lock`，跨请求也不会同时写同一 session
- Repository 内部写方法加 `async with self._db_lock`

## 8. 观测

- 每次 write 记录 duration；超过 50ms 打 warn 日志
- `GET /api/dev/db/stats` 返回表行数、db 大小

## 9. 向后兼容

- 老 `store.py` 的公开函数保留一 phase，内部委托到 repository
- REST 响应形状不变
