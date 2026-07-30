# P0-3 · Session 存储 → SQLite (Plan)

> spec：`specs/2026-07-26-p0-3-sqlite-sessions-design.md`

## Constraints

- 只用 stdlib `sqlite3`；不引入 sqlalchemy/asqlite 等
- 不破坏当前 REST 响应
- JSONL 数据一次性迁移完备份并保留原文件

## File map

| File | Role |
|---|---|
| `minibot/session/repository.py` | 新 |
| `minibot/session/schema.sql` | schema 引入 |
| `minibot/session/migrations/__init__.py` |  |
| `minibot/session/migrations/jsonl_to_sqlite.py` | 一次性迁移脚本 |
| `minibot/session/store.py` | 变 facade |
| `minibot/agent/history.py` | 新（chengxiaobang 命名） |
| `minibot/app_state.py` | 初始化 repository |
| `minibot/main.py` | lifespan 里跑迁移 |
| `tests/test_repository.py` |  |
| `tests/test_jsonl_migration.py` |  |
| `tests/test_history_rebuild.py` |  |

## Task 1 — Schema + Repository

- [ ] `schema.sql` 定义所有表 + `PRAGMA` 语句
- [ ] `SessionRepository` 初始化：确保 sqlite 目录存在、执行 schema、开 WAL
- [ ] 基本 CRUD：session、message、run
- [ ] 单测：临时目录 + `SessionRepository`

## Task 2 — Payload 分离

- [ ] `MessageRecord` pydantic 模型（含 `payload_json`）
- [ ] Runner 把 provider 完整 message 序列化写入
- [ ] `load_messages` 优先返回 payload
- [ ] 单测：写 assistant + tool_call payload，读回相等

## Task 3 — history.py

- [ ] `rebuild_messages(session_id, upto_seq=None) -> list[dict]`
- [ ] 兼容 compact 后的 summary 系统消息
- [ ] 单测：模拟一段对话 → rebuild 与预期一致

## Task 4 — JSONL 迁移

- [ ] 扫描 `~/.minibot/sessions/*.jsonl`
- [ ] 逐个转 session/messages 记录
- [ ] 迁完 mv 到 `_migrated/`
- [ ] `--dry-run` 打印统计
- [ ] 单测：用 fixture jsonl 迁移 → 校验行数与内容

## Task 5 — Facade & 兼容

- [ ] `store.py` 保留原公开函数，内部转 repository
- [ ] 老函数打 `DeprecationWarning`
- [ ] 现有测试全绿

## Task 6 — Approvals / file_changes / events 表接线

- [ ] 表 schema 创建（这里只创建，业务逻辑归各自 phase）
- [ ] Repository 提供 append_event / append_approval / append_file_change
- [ ] 单测：三张表可写读

## Task 7 — Dev API + 备份

- [ ] `GET /api/dev/db/stats`
- [ ] lifespan 启动时按日期备份
- [ ] 单测：备份文件被创建

## 验收

- 迁移旧 jsonl 数据无丢失
- pytest 全绿；handle_turn 语义不变
- `sqlite3` cli 检查 WAL 已开、索引齐全
